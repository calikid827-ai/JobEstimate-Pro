import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { zipSync } from "fflate"
import { expandProjectZip } from "./archive"
import { createProjectLibraryClient, runProjectQueue, uploadProjectOriginal } from "./client"
import { createProjectLibraryHandlers } from "./handlers"
import { assertProjectRecordBudgets, completeProjectUpload, emptyInventory, prepareProjectFile, recordUploadSession, registerProjectFile } from "./service"
import { PROJECT_LIMITS, ProjectLibraryError, type ProjectFile, type ProjectInventory, type ProjectLibraryStore } from "./types"
import { safeRelativePath } from "./validation"

const owner = "synthetic-owner-a", project = "synthetic-project", bytes = new TextEncoder().encode("Synthetic dimensions schedule. No provider output.")
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
function fixture() {
  const records = new Map<string, ProjectInventory>(), originals = new Map<string, Uint8Array>()
  const store: ProjectLibraryStore = {
    async ready() {},
    async get(ownerId, projectId) { return structuredClone(records.get(`${ownerId}:${projectId}`) ?? emptyInventory(ownerId, projectId)) },
    async save(ownerId, inventory, expected) {
      const key = `${ownerId}:${inventory.projectId}`, old = records.get(key)
      if (inventory.ownerId !== ownerId) throw Error("Foreign owner")
      if ((old?.revision ?? 0) !== expected) throw new ProjectLibraryError(409, "PROJECT_CHANGED", "Project changed")
      const saved = structuredClone({ ...inventory, revision: expected + 1 }); records.set(key, saved); return structuredClone(saved)
    },
    async ticket(ownerId, file) { if (file.ownerId !== ownerId) throw Error("Foreign owner"); return { endpoint: "http://127.0.0.1:1234/storage/v1/upload/resumable", headers: { "x-signature": "SYNTHETIC-OBJECT-CAPABILITY" }, bucket: "synthetic-private", objectKey: file.objectKey, chunkBytes: PROJECT_LIMITS.chunkBytes } },
    async download(ownerId, file) { if (file.ownerId !== ownerId) throw Error("Foreign owner"); const value = originals.get(file.objectKey); if (!value) throw Error("Original not uploaded"); return value },
    async signedDownload(ownerId, file) { if (file.ownerId !== ownerId) throw Error("Foreign owner"); return "http://127.0.0.1:1234/original/" + file.id },
  }
  const input = (id = "selection-a", path = "package/Schedule.txt", contents = bytes) => ({ name: path.split("/").pop()!, relativePath: path, mimeType: "text/plain", size: contents.length, sha256: sha(contents), selectionId: id })
  return { store, records, originals, input }
}

test("original names, folder paths, versions and duplicate records remain separate", async () => {
  const { store, input } = fixture()
  const first = await registerProjectFile(store, owner, project, input())
  const second = await registerProjectFile(store, owner, project, input("selection-b"))
  assert.equal(second.file.name, "Schedule.txt")
  assert.equal(second.file.relativePath, "package/Schedule.txt")
  assert.equal(second.file.sourceVersion, 2)
  assert.equal(second.file.replacesId, first.file.id)
  assert.equal(second.file.duplicateOfId, first.file.id)
  assert.deepEqual(second.inventory.files.map(file => file.active), [false, true])
  assert.equal(second.inventory.files[0].sha256, first.file.sha256)
})

test("registration idempotency does not duplicate storage reservations and foreign projects stay isolated", async () => {
  const { store, input } = fixture()
  const first = await registerProjectFile(store, owner, project, input())
  const repeated = await registerProjectFile(store, owner, project, input())
  assert.equal(repeated.inventory.revision, first.inventory.revision)
  assert.equal(repeated.inventory.files.length, 1)
  await assert.rejects(registerProjectFile(store, owner, project, input("selection-a", "other.txt")), /different content/)
  assert.equal((await store.get("synthetic-owner-b", project)).files.length, 0)
  assert.equal((await store.get(owner, "other-project")).files.length, 0)
})

test("path traversal, executable files, content identity and explicit limits fail before reservation", async () => {
  const { store, input } = fixture()
  for (const path of ["../bad.txt", "/absolute.txt", "a/../../bad.txt", "a\\bad.txt", "a//bad.txt", "C:/bad.txt", "a/\u0000bad.txt"]) assert.throws(() => safeRelativePath(path))
  for (const value of [{ ...input(), name: "run.exe", relativePath: "run.exe" }, { ...input(), sha256: "invented" }, { ...input(), size: PROJECT_LIMITS.maxFileBytes + 1 }]) await assert.rejects(registerProjectFile(store, owner, project, value))
  assert.equal((await store.get(owner, project)).files.length, 0)
})

test("upload completion verifies actual bytes and does not imply preparation or review", async () => {
  const { store, originals, input } = fixture(), { file } = await registerProjectFile(store, owner, project, input())
  const missing = await completeProjectUpload(store, owner, project, file.id)
  assert.equal(missing.files[0].status, "failed")
  originals.set(file.objectKey, bytes)
  const uploaded = await completeProjectUpload(store, owner, project, file.id)
  assert.equal(uploaded.files[0].status, "uploaded")
  assert.equal(uploaded.files[0].preparation, "pending")
  assert.equal(uploaded.files[0].pages.length, 0)
  const prepared = await prepareProjectFile(store, owner, project, file.id)
  assert.equal(prepared.files[0].pages[0].text, "Synthetic dimensions schedule. No provider output.")
  assert.equal(prepared.files[0].pages[0].review, "pending")
  assert.equal(prepared.files[0].preparation, "prepared")
  assert.equal((await prepareProjectFile(store, owner, project, file.id)).revision, prepared.revision)
})

test("mismatched byte length/hash/type remain visible failures with historical records preserved", async () => {
  const { store, originals, input } = fixture(), first = await registerProjectFile(store, owner, project, input())
  originals.set(first.file.objectKey, new Uint8Array(bytes.length))
  const failed = await completeProjectUpload(store, owner, project, first.file.id)
  assert.equal(failed.files[0].status, "failed")
  assert.match(failed.files[0].issue!, /SHA-256/)
  const wrongPdf = await registerProjectFile(store, owner, project, input("wrong-pdf", "false.pdf"))
  originals.set(wrongPdf.file.objectKey, bytes)
  assert.equal((await completeProjectUpload(store, owner, project, wrongPdf.file.id)).files[1].status, "failed")
  assert.equal((await store.get(owner, project)).files.length, 2)
})

test("unsupported retained formats and failed preparation do not claim reviewed content", async () => {
  const { store, originals, input } = fixture()
  const content = new Uint8Array([80, 75, 3, 4, 0, 0]), first = await registerProjectFile(store, owner, project, input("office", "Specs.docx", content))
  originals.set(first.file.objectKey, content); await completeProjectUpload(store, owner, project, first.file.id)
  const prepared = await prepareProjectFile(store, owner, project, first.file.id)
  assert.equal(prepared.files[0].preparation, "unsupported")
  assert.equal(prepared.files[0].status, "uploaded")
  assert.equal(prepared.files[0].pages.length, 0)
})

test("upload session URLs cannot redirect capabilities to another host, path or resource", async () => {
  const { store, input } = fixture(), first = await registerProjectFile(store, owner, project, input())
  for (const url of ["https://evil.invalid/storage/v1/upload/resumable/id", "http://127.0.0.1:1234/other/id", "http://127.0.0.1:1234/storage/v1/upload/resumable/id?secret=1"]) await assert.rejects(recordUploadSession(store, owner, project, first.file.id, url))
  const saved = await recordUploadSession(store, owner, project, first.file.id, "http://127.0.0.1:1234/storage/v1/upload/resumable/session-a")
  assert.equal(saved.files[0].status, "uploading")
  assert.ok(saved.files[0].uploadUrl?.endsWith("session-a"))
})

test("safe ZIP import retains inner names and rejects traversal, duplicate paths and expansion bombs", () => {
  const zip = zipSync({ "plans/Schedule.txt": bytes, "notes/Addendum.txt": new TextEncoder().encode("Synthetic addendum") }, { level: 0 })
  const files = expandProjectZip(zip)
  assert.deepEqual(files.map(file => file.relativePath), ["plans/Schedule.txt", "notes/Addendum.txt"])
  assert.deepEqual(files[0].bytes, bytes)
  for (const path of ["../escape.txt", "/absolute.txt", "a\\bad.txt"]) assert.throws(() => expandProjectZip(zipSync({ [path]: bytes }, { level: 0 })))
  assert.throws(() => expandProjectZip(zipSync({ "bomb.txt": new Uint8Array(1_000_000) }, { level: 9 })), /compression-ratio/)
  assert.throws(() => expandProjectZip(new Uint8Array([1, 2, 3])))
})

test("TUS adapter resumes the acknowledged byte offset and transmits only narrow signed headers", async () => {
  const { store, input } = fixture(), first = await registerProjectFile(store, owner, project, input())
  const data = new Uint8Array(7 * 1024 ** 2).fill(37), record: ProjectFile = { ...first.file, size: data.length, uploadUrl: "http://127.0.0.1:1234/storage/v1/upload/resumable/resume-a" }
  const calls: Array<{ method: string; offset: string | null; bytes: number; auth: string | null }> = []; let confirmed = 2 * 1024 ** 2
  const ticket = await store.ticket(owner, record)
  const fetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers), method = init?.method || "GET"
    const body = init?.body instanceof Blob ? new Uint8Array(await init.body.arrayBuffer()) : new Uint8Array()
    calls.push({ method, offset: headers.get("Upload-Offset"), bytes: body.length, auth: headers.get("Authorization") })
    assert.equal(headers.get("x-signature"), "SYNTHETIC-OBJECT-CAPABILITY")
    if (method === "PATCH") { assert.equal(Number(headers.get("Upload-Offset")), confirmed); assert.ok(body.every(byte => byte === 37)); confirmed += body.length }
    return new Response(null, { status: method === "HEAD" ? 200 : 204, headers: { "Upload-Offset": String(confirmed) } })
  }
  await uploadProjectOriginal({ file: new Blob([data]), record, ticket, fetcher, isCurrent: () => true, onSession: async () => { throw Error("Resume must not create another session") } })
  assert.deepEqual(calls.map(call => [call.method, call.bytes]), [["HEAD", 0], ["PATCH", 5 * 1024 ** 2]])
  assert.ok(calls.every(call => call.auth === null))
})

test("TUS session creation keeps exact metadata and rechecks context before transmitting bytes", async () => {
  const { store, input } = fixture(), first = await registerProjectFile(store, owner, project, input()), ticket = await store.ticket(owner, first.file)
  let current = true, patchCount = 0
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === "PATCH") patchCount++
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("x-upsert"), "false")
    assert.equal(headers.get("Upload-Length"), String(bytes.length))
    assert.ok(headers.get("Upload-Metadata")?.includes("objectName "))
    return new Response(null, { status: 201, headers: { Location: ticket.endpoint + "/created-a" } })
  }
  await assert.rejects(uploadProjectOriginal({ file: new Blob([bytes]), record: first.file, ticket, fetcher, isCurrent: () => current, onSession: async () => { current = false } }), /owner changed/)
  assert.equal(patchCount, 0)
})

test("metadata retries only CAS conflicts and owner changes block later results", async () => {
  let calls = 0, current = true
  const fetcher: typeof fetch = async () => { calls++; if (calls === 1) return Response.json({ code: "PROJECT_CHANGED", error: "Changed" }, { status: 409 }); return Response.json({ inventory: emptyInventory(owner, project) }) }
  const client = createProjectLibraryClient(fetcher, project, () => current)
  await client.prepare("file-a")
  assert.equal(calls, 2)
  current = false
  await assert.rejects(client.list(), /owner changed/)
  assert.equal(calls, 2)
})

test("lost final upload response recovers verified retained bytes without creating another storage session", async () => {
  const { store, originals, input } = fixture(), registered = await registerProjectFile(store, owner, project, input())
  const retained = await recordUploadSession(store, owner, project, registered.file.id, "http://127.0.0.1:1234/storage/v1/upload/resumable/final-response-lost")
  originals.set(registered.file.objectKey, bytes)
  const auth = { getUser: async () => ({ data: { user: { id: owner, email: "synthetic@example.test", email_confirmed_at: "2026-11-14", role: "authenticated" } }, error: null }) }
  const handlers = createProjectLibraryHandlers({ store, auth })
  const calls: string[] = []
  const fetcher: typeof fetch = async (_url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null; calls.push(body?.action || "list")
    return handlers.files(new Request("http://local.test/api/projects/x/files", { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: "Bearer synthetic" } }), project)
  }
  const client = createProjectLibraryClient(fetcher, project, () => true, async () => { throw Error("No storage request should be needed") })
  await client.list(); calls.length = 0
  const result = await client.upload(new Blob([bytes]), retained.files[0])
  assert.equal(result.inventory.files[0].status, "uploaded")
  assert.deepEqual(calls, ["complete"])
})

test("server-process preparation queue serializes concurrent decoder work across projects", async () => {
  const { store, originals, input } = fixture()
  let decoding = 0, peak = 0
  const originalDownload = store.download
  store.download = async (ownerId, file) => { decoding++; peak = Math.max(peak, decoding); await new Promise(resolve => setTimeout(resolve, 2)); const value = await originalDownload(ownerId, file); decoding--; return value }
  for (const id of ["project-a", "project-b"]) { const { file } = await registerProjectFile(store, owner, id, input(id)); originals.set(file.objectKey, bytes); await completeProjectUpload(store, owner, id, file.id) }
  peak = 0
  await Promise.all([prepareProjectFile(store, owner, "project-a", "project-a"), prepareProjectFile(store, owner, "project-b", "project-b")])
  assert.equal(peak, 1)
})

test("bounded upload queue never exceeds three concurrent operations", async () => {
  let running = 0, peak = 0, finished = 0
  await runProjectQueue(Array.from({ length: 40 }, (_, index) => index), 20, async () => { running++; peak = Math.max(peak, running); await new Promise(resolve => setTimeout(resolve, 1)); running--; finished++ })
  assert.equal(peak, 3); assert.equal(finished, 40)
})

test("actual owner handler rejects missing auth and foreign file access before ticket/download", async () => {
  const { store, input } = fixture(), first = await registerProjectFile(store, owner, project, input())
  const auth = { getUser: async () => ({ data: { user: { id: "synthetic-owner-b", email: "synthetic@example.test", email_confirmed_at: "2026-11-14", role: "authenticated" } }, error: null }) }
  const handlers = createProjectLibraryHandlers({ store, auth })
  assert.equal((await handlers.files(new Request("http://local.test/api/projects/x/files"), project)).status, 401)
  const denied = await handlers.files(new Request("http://local.test/api/projects/x/files", { method: "POST", headers: { Authorization: "Bearer synthetic-token", "Content-Type": "application/json" }, body: JSON.stringify({ action: "ticket", fileId: first.file.id }) }), project)
  assert.equal(denied.status, 404)
  assert.equal(denied.headers.get("Cache-Control"), "private, no-store, max-age=0")
})

test("inventory pagination and exact content retrieval preserve more than the old aggregate ceiling", async () => {
  const { store, originals, records, input } = fixture()
  const contents = new TextEncoder().encode("S".repeat(80000)), registered = await registerProjectFile(store, owner, project, input("pending-text", "Dense.txt", contents))
  originals.set(registered.file.objectKey, contents)
  await completeProjectUpload(store, owner, project, registered.file.id)
  const base = await store.get(owner, project)
  const denseRecords: ProjectFile[] = Array.from({ length: 40 }, (_, index) => ({ ...registered.file, id: `retained-${index}`, objectKey: `${owner}/${project}/retained-${index}/original`, status: "uploaded", preparation: "prepared", pages: [{ pageNumber: 1, text: "X".repeat(79000), extraction: "complete", review: "pending" }] }))
  records.set(`${owner}:${project}`, { ...base, files: [...denseRecords, ...base.files] })
  const prepared = await prepareProjectFile(store, owner, project, registered.file.id)
  assert.ok(Buffer.byteLength(JSON.stringify(prepared)) > 3 * 1024 ** 2)
  assert.equal(prepared.files.find(file => file.id === registered.file.id)!.preparation, "prepared")
  const auth = { getUser: async () => ({ data: { user: { id: owner, email: "synthetic@example.test", email_confirmed_at: "2026-11-16", role: "authenticated" } }, error: null }) }
  const handlers = createProjectLibraryHandlers({ store, auth }), replies: number[] = []
  const fetcher: typeof fetch = async (url, init) => {
    const response = await handlers.files(new Request(new URL(String(url), "http://local.test"), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: "Bearer synthetic" } }), project)
    replies.push(Buffer.byteLength(await response.clone().text()))
    return response
  }
  const client = createProjectLibraryClient(fetcher, project, () => true)
  const inventory = (await client.list()).inventory
  assert.equal(inventory.files.length, 41)
  assert.ok(inventory.files.every(file => file.pages.length === 0 && file.contentStatus === "not_loaded"))
  const source = await client.source(registered.file.id)
  assert.equal(source.file.pages[0].text, "")
  assert.equal(source.file.pages[0].contentLoaded, false)
  const content = await client.content(registered.file.id, 1)
  assert.equal(content.page.text, "S".repeat(80000))
  assert.equal(content.page.contentLoaded, true)
  assert.equal(content.sourceSha256, registered.file.sha256)
  assert.ok(replies.every(size => size <= PROJECT_LIMITS.maxResponseBytes))
  assert.deepEqual(originals.get(registered.file.objectKey), contents)
})

test("record and page limits stay bounded without an aggregate inventory ceiling", () => {
  const file = fixture().input()
  const value = { ...file, id: file.selectionId, ownerId: owner, projectId: project, sourceVersion: 1, active: true, status: "uploaded", preparation: "prepared", pageCount: 1, pages: [{ pageNumber: 1, text: "Z".repeat(80000), extraction: "complete", review: "pending" }], createdAt: "synthetic", objectKey: `${owner}/${project}/${file.selectionId}/original` } as ProjectFile
  assertProjectRecordBudgets([value])
  assert.throws(() => assertProjectRecordBudgets([{ ...value, pages: [{ ...value.pages[0], text: "Z".repeat(80001) }] }]), /80,000/)
  assert.throws(() => assertProjectRecordBudgets([{ ...value, issue: "X".repeat(17000) }]), /16 KiB/)
})

test("large metadata discovery is bounded, complete, revision-pinned and does not repeat text", async () => {
  const { store, records, input } = fixture(), first = await registerProjectFile(store, owner, project, input())
  const files = Array.from({ length: 2600 }, (_, index): ProjectFile => ({ ...first.file, id: `source-${String(index).padStart(5, "0")}`, relativePath: `${"folder".repeat(170)}/source-${index}.txt`, active: index % 3 !== 0, sourceVersion: index + 1 }))
  records.set(`${owner}:${project}`, { ...first.inventory, files })
  assert.ok(Buffer.byteLength(JSON.stringify(files)) > 3 * 1024 ** 2)
  const auth = { getUser: async () => ({ data: { user: { id: owner, email: "synthetic@example.test", email_confirmed_at: "2026-11-16", role: "authenticated" } }, error: null }) }, handlers = createProjectLibraryHandlers({ store, auth })
  let requests = 0, peak = 0
  const fetcher: typeof fetch = async (url, init) => {
    requests++
    const response = await handlers.files(new Request(new URL(String(url), "http://local.test"), { ...init, headers: { Authorization: "Bearer synthetic" } }), project)
    peak = Math.max(peak, Buffer.byteLength(await response.clone().text()))
    return response
  }
  const client = createProjectLibraryClient(fetcher, project, () => true), result = await client.list()
  assert.equal(result.inventory.files.length, 2600)
  assert.equal(requests, 52)
  assert.equal(new Set(result.inventory.files.map(file => file.id)).size, 2600)
  assert.equal(result.inventory.files.filter(file => !file.active).length, files.filter(file => !file.active).length)
  assert.ok(peak < PROJECT_LIMITS.maxResponseBytes)
  const oldCursor = (await client.page(undefined, 1)).nextCursor!
  records.set(`${owner}:${project}`, { ...result.inventory, revision: result.inventory.revision + 1 })
  await assert.rejects(client.page(oldCursor), /changed/)
})

test("page metadata is separately paginated, exact historical content survives replacements and foreign access fails", async () => {
  const { store, records, input } = fixture(), first = await registerProjectFile(store, owner, project, input())
  const pages = Array.from({ length: 105 }, (_, index) => ({ pageNumber: index + 1, text: `SYNTHETIC PAGE ${index + 1}: exact retained evidence`, extraction: "complete" as const, review: "pending" as const }))
  records.set(`${owner}:${project}`, { ...first.inventory, files: [{ ...first.file, status: "uploaded", preparation: "prepared", pageCount: 105, pages }] })
  let caller = owner, metadataRequests = 0
  const auth = { getUser: async () => ({ data: { user: { id: caller, email: "synthetic@example.test", email_confirmed_at: "2026-11-16", role: "authenticated" } }, error: null }) }, handlers = createProjectLibraryHandlers({ store, auth })
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes("view=pages")) metadataRequests++
    return handlers.files(new Request(new URL(String(url), "http://local.test"), { ...init, headers: { Authorization: "Bearer synthetic" } }), project)
  }
  const client = createProjectLibraryClient(fetcher, project, () => true), source = await client.source(first.file.id)
  assert.equal(metadataRequests, 2)
  assert.equal(source.file.pages.length, 105)
  assert.ok(source.file.pages.every(page => page.contentLoaded === false && !page.text))
  await registerProjectFile(store, owner, project, input("replacement", "package/Schedule.txt", new TextEncoder().encode("replacement content")))
  const retained = await client.content(first.file.id, 105)
  assert.equal(retained.active, false)
  assert.equal(retained.page.text, pages[104].text)
  assert.equal(retained.sourceSha256, first.file.sha256)
  caller = "foreign-owner"
  await assert.rejects(client.content(first.file.id, 105), /unavailable/)
  assert.equal((await client.list()).inventory.files.length, 0)
})

test("repeated mutation during traversal stops after three complete-list attempts", async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ code: "PROJECT_CHANGED", error: "Project changed during discovery" }, { status: 409 }) }
  await assert.rejects(createProjectLibraryClient(fetcher, project, () => true).list(), /changed/)
  assert.equal(calls, 3)
})
