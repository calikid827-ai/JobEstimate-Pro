import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { zipSync } from "fflate"
import { expandProjectZip } from "./archive"
import { createProjectLibraryClient, runProjectQueue, uploadProjectOriginal } from "./client"
import { createProjectLibraryHandlers } from "./handlers"
import { assertProjectInventoryBudget, completeProjectUpload, emptyInventory, prepareProjectFile, recordUploadSession, registerProjectFile } from "./service"
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
    const body = JSON.parse(String(init?.body)); calls.push(body.action)
    return handlers.files(new Request("http://local.test/api/projects/x/files", { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: "Bearer synthetic" } }), project)
  }
  const client = createProjectLibraryClient(fetcher, project, () => true, async () => { throw Error("No storage request should be needed") })
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

test("serialized inventory budget measures UTF-8 bytes and includes the next revision", () => {
  const value = emptyInventory(owner, project)
  // Synthetic existing page payload for an exact boundary, independent of the
  // service's byte counter. JSON overhead is measured with Node Buffer here.
  const overhead = Buffer.byteLength(JSON.stringify({ ...value, revision: 10, files: [{ text: "" }] }), "utf8")
  const text = "é".repeat(Math.floor((PROJECT_LIMITS.maxInventoryBytes - overhead) / 2))
  const boundary = { ...value, files: [{ text }] } as unknown as ProjectInventory
  const exactBytes = Buffer.byteLength(JSON.stringify({ ...boundary, revision: 10 }), "utf8")
  assert.ok(exactBytes <= 3 * 1024 ** 2)
  assertProjectInventoryBudget(boundary, 10)
  const over = { ...value, files: [{ text: text + "é" }] } as unknown as ProjectInventory
  assert.throws(() => assertProjectInventoryBudget(over, 10), error => error instanceof ProjectLibraryError && error.status === 413 && error.code === "PROJECT_INVENTORY_LIMIT")
})

test("oversized registration and prepared text fail before writes while originals and prior inventory remain intact", async () => {
  const { store, originals, records, input } = fixture()
  const contents = new TextEncoder().encode("S".repeat(80000)), registered = await registerProjectFile(store, owner, project, input("pending-text", "Dense.txt", contents))
  originals.set(registered.file.objectKey, contents)
  await completeProjectUpload(store, owner, project, registered.file.id)
  const base = await store.get(owner, project)
  const denseRecords = Array.from({ length: 39 }, (_, index) => ({ ...registered.file, id: `retained-${index}`, objectKey: `synthetic-retained-${index}`, pages: [{ pageNumber: 1, text: "X".repeat(79000), extraction: "complete" as const, review: "pending" as const }] }))
  const dense = { ...base, files: [...denseRecords, ...base.files] }
  assert.ok(Buffer.byteLength(JSON.stringify(dense)) < PROJECT_LIMITS.maxInventoryBytes)
  records.set(`${owner}:${project}`, structuredClone(dense))
  const before = JSON.stringify(await store.get(owner, project))
  await assert.rejects(prepareProjectFile(store, owner, project, registered.file.id), error => error instanceof ProjectLibraryError && error.status === 413 && error.code === "PROJECT_INVENTORY_LIMIT")
  assert.equal(JSON.stringify(await store.get(owner, project)), before)
  assert.deepEqual(originals.get(registered.file.objectKey), contents)
  // Construct a separate near-cap retained state to exercise registration too.
  const filled = structuredClone(dense)
  const gap = PROJECT_LIMITS.maxInventoryBytes - Buffer.byteLength(JSON.stringify(filled))
  filled.files[0].pages[0].text += "Z".repeat(gap - 5)
  records.set(`${owner}:${project}`, filled)
  const beforeRegister = JSON.stringify(await store.get(owner, project))
  await assert.rejects(registerProjectFile(store, owner, project, input("over-budget", "Another.txt")), error => error instanceof ProjectLibraryError && error.status === 413 && error.code === "PROJECT_INVENTORY_LIMIT")
  assert.equal(JSON.stringify(await store.get(owner, project)), beforeRegister)
})
