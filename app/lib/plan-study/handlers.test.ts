import { PDFDocument } from "pdf-lib"
import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createPlanStudyHandlers } from "./handlers"
import { InMemoryStudyStore } from "./test-support"
import { activePages, type Study, type Finding } from "./types"
import { createAuthoredPackage, createReplacementAddendum } from "../../../tests/fixtures/plan-study/authored-package"
import type { OwnerAuthAdapter } from "../owner-auth"

const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222"
const auth: OwnerAuthAdapter = { async getUser(token) { return { data: { user: { id: token === "owner" ? owner : other, email: "synthetic@example.invalid", email_confirmed_at: "2026-01-01", role: "authenticated", is_anonymous: false } }, error: null } } }
const provider = { async ready() {}, async review() { throw new Error("TEST_PROVIDER_MUST_NOT_RUN") } }
const make = () => { const store = new InMemoryStudyStore(); return { store, h: createPlanStudyHandlers({ store, auth, provider }) } }
function request(path: string, method = "GET", value?: unknown, token = "owner") { return new Request(`https://qa.invalid/api/plan-studies${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(value ? { "Content-Type": "application/json" } : {}) }, ...(value ? { body: JSON.stringify(value) } : {}) }) }
async function upload(h: ReturnType<typeof createPlanStudyHandlers>, study: Study, file: { name: string; bytes: Uint8Array }, replacement?: string, token = "owner") {
  const form = new FormData(); form.set("file", new File([file.bytes as BlobPart], file.name, { type: "application/pdf" })); form.set("expectedRevision", String(study.revision)); if (replacement) form.set("replacesDocumentId", replacement)
  // Malicious browser claims cannot replace the server's inventory/ownership.
  form.set("ownerId", other); form.set("pageCount", "999"); form.set("sha256", "browser-claim"); form.set("path", "other-owner/private.pdf")
  return h.documents(new Request(`https://qa.invalid/api/plan-studies/${study.id}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }), study.id)
}
const fixture = createAuthoredPackage()

test("routes require verified bearer owner and fail clearly when production durability is unavailable", async () => {
  const { store, h } = make()
  const missing = await h.collection(new Request("https://qa.invalid/api/plan-studies")); assert.equal(missing.status, 401)
  store.configured = false
  const unavailable = await h.collection(request("")); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, "STUDY_NOT_CONFIGURED")
  assert.equal(store.studies.size, 0)
})
test("actual upload route inventories every physical page/hash from original PDF bytes and denies another owner before writes", async () => {
  const { store, h } = make(); let s = await store.create(owner, "Synthetic authored package")
  const files = await fixture
  for (const file of files) {
    const response = await upload(h, s, file); assert.equal(response.status, 200); s = (await response.json()).study
    const doc = s.documents.at(-1)!
    assert.equal(doc.sha256, createHash("sha256").update(file.bytes).digest("hex")); assert.equal(doc.bytes, file.bytes.length)
    assert.equal(doc.pages.length, doc.pageCount); assert.deepEqual(doc.pages.map((p) => p.pageNumber), Array.from({ length: doc.pageCount }, (_, i) => i + 1))
    assert.ok(doc.pages.every((p) => p.indexing === "complete" && p.analysis === "pending" && p.extraction === "pending"))
  }
  assert.equal(activePages(s).length, 6)
  const before = store.artifacts.size
  assert.equal((await upload(h, s, files[0], undefined, "other")).status, 404); assert.equal(store.artifacts.size, before)
  assert.equal((await h.study(request(`/${s.id}`, "GET", undefined, "other"), s.id)).status, 404)
  const read = await h.study(request(`/${s.id}`), s.id); assert.match(read.headers.get("cache-control")!, /private, no-store/)
})
test("real page preparation remains separate from analysis; evidence only opens retained owner/study/version assets", async () => {
  const { store, h } = make(); let s = await store.create(owner, "Synthetic evidence")
  s = (await (await upload(h, s, (await fixture)[0])).json()).study
  const response = await h.prepare(request(`/${s.id}/prepare`, "POST", { expectedRevision: s.revision }), s.id)
  assert.equal(response.status, 200); s = (await response.json()).study
  const d = s.documents[0], p = d.pages[0]
  assert.equal(p.extraction, "complete"); assert.equal(p.rendering, "complete"); assert.equal(p.analysis, "pending"); assert.ok(p.blocks.length > 0)
  const url = `/${s.id}/evidence/${d.originalArtifactId}?documentVersionId=${d.id}`
  assert.equal((await h.evidence(request(url), s.id, d.originalArtifactId)).status, 200)
  assert.equal((await h.evidence(request(url, "GET", undefined, "other"), s.id, d.originalArtifactId)).status, 404)
  const independent = await store.create(owner, "Other study")
  assert.equal((await h.evidence(request(`/${independent.id}/evidence/${d.originalArtifactId}?documentVersionId=${d.id}`), independent.id, d.originalArtifactId)).status, 404)
  assert.equal((await h.evidence(request(`/${s.id}/evidence/${d.originalArtifactId}?documentVersionId=${independent.id}`), s.id, d.originalArtifactId)).status, 404)
})
test("creating studies never creates an allowance and unsupported/malformed uploads are explicit failures", async () => {
  const { store, h } = make()
  for (let i = 0; i < 3; i++) assert.equal((await h.collection(request("", "POST", { title: "Synthetic QA" }))).status, 201)
  assert.equal(store.allowances.size, 0)
  const s = (await store.list(owner))[0]
  const bad = await upload(h, s, { name: "fake.pdf", bytes: new TextEncoder().encode("not a pdf") })
  assert.equal(bad.status, 422); assert.equal(store.artifacts.size, 0)
})
test("answers persist as decisions; replacement retains evidence and flags only affected decisions", async () => {
  const { store, h } = make(); let s = await store.create(owner, "Synthetic replacement")
  for (const file of (await fixture).slice(0, 2)) s = (await (await upload(h, s, file)).json()).study
  s.documents.forEach((d) => d.pages.forEach((p) => { p.blocks = [{ id: "test-block", text: "Synthetic question evidence", bounds: { x: 0, y: 0, width: 1, height: 0.1 } }]; p.extraction = "complete"; p.rendering = "complete" }))
  const finding = (index: number): Finding => ({ id: `synthetic-question-${index}`, kind: "question", trade: "painting", title: `Synthetic question ${index}`, detail: "No source answer recorded.", citations: [{ documentVersionId: s.documents[index].id, pageId: s.documents[index].pages[0].id, sourceSha256: s.documents[index].sha256, anchor: { kind: "text", blockId: "test-block", quote: "Synthetic question evidence" } }], limitations: [] })
  s.findings = [finding(0), finding(1)]; s = await store.save(owner, s, s.revision)
  for (const f of s.findings) { const response = await h.decisions(request(`/${s.id}/decisions`, "POST", { expectedRevision: s.revision, findingId: f.id, answer: "Contractor will verify on site." }), s.id); assert.equal(response.status, 200); s = (await response.json()).study }
  assert.equal(s.findings.length, 2); assert.equal(s.decisions.length, 2)
  const old = structuredClone(s.documents[0]); const replacement = await createReplacementAddendum()
  s = (await (await upload(h, s, replacement, old.id)).json()).study
  const reopened = (await (await h.study(request(`/${s.id}`), s.id)).json()).study as Study
  assert.equal(reopened.decisions[0].status, "needs_reconfirmation"); assert.equal(reopened.decisions[1].status, "active")
  assert.equal(reopened.decisions[0].findingTitle, "Synthetic question 0"); assert.equal(reopened.findings.length, 0)
  assert.equal(reopened.documents.find((d) => d.id === old.id)!.active, false)
  assert.equal((await h.evidence(request(`/${s.id}/evidence/${old.originalArtifactId}?documentVersionId=${old.id}`), s.id, old.originalArtifactId)).status, 200)
})
test("a stale upload CAS cannot expose an unreferenced private artifact", async () => {
  const { store, h } = make(); const s = await store.create(owner, "Synthetic race"), file = (await fixture)[0]
  await store.save(owner, { ...s, title: "Changed" }, s.revision)
  const response = await upload(h, s, file); assert.equal(response.status, 409); assert.equal(store.artifacts.size, 0)
})

test("page and package limits reject explicitly without truncating or writing a partial source", async () => {
  const { PDFDocument } = await import("pdf-lib")
  const { store, h } = make(); let s = await store.create(owner, "Synthetic explicit limits")
  const pdf = await PDFDocument.create(); for (let i = 0; i < 49; i++) pdf.addPage([200, 200])
  const tooMany = await upload(h, s, { name: "49-physical-pages.pdf", bytes: await pdf.save() })
  assert.equal(tooMany.status, 413); assert.equal((await tooMany.json()).code, "STUDY_PAGE_LIMIT"); assert.equal(store.artifacts.size, 0)
  const file = (await fixture)[0]
  s = (await (await upload(h, s, file)).json()).study
  // Existing retained bytes are authoritative server inventory; this synthetic
  // aggregate exercises the configured package boundary without a huge fixture.
  s.documents[0].bytes = 20 * 1024 * 1024
  s = await store.save(owner, s, s.revision)
  const size = store.artifacts.size
  const full = await upload(h, s, file)
  assert.equal(full.status, 413); assert.equal((await full.json()).code, "STUDY_PACKAGE_LIMIT"); assert.equal(store.artifacts.size, size)
})

test("unsupported inline-image preparation remains explicit and never becomes reviewed", async () => {
  const { store, h } = make()
  let s = await store.create(owner, "Synthetic unsupported content")
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([100, 100])
  const contents = pdf.context.stream("q BI /W 0 /H 1 /BPC 8 /CS /G ID X EI Q")
  page.node.addContentStream(pdf.context.register(contents))
  const file = { name: "synthetic-inline.pdf", bytes: new Uint8Array(await pdf.save()) }
  const uploaded = await upload(h, s, file)
  assert.equal(uploaded.status, 200)
  s = (await uploaded.json()).study
  const response = await h.prepare(request(`/${s.id}/prepare`, "POST", { expectedRevision: s.revision }), s.id)
  assert.equal(response.status, 200)
  const saved = (await response.json()).study as Study
  assert.equal(saved.documents[0].pages[0].extraction, "failed")
  assert.equal(saved.documents[0].pages[0].rendering, "failed")
  assert.equal(saved.documents[0].pages[0].analysis, "pending")
  assert.match(saved.documents[0].pages[0].issue || "", /Unsupported PDF.*not been substantively reviewed/)
  assert.equal(saved.attempts.length, 0)
})
