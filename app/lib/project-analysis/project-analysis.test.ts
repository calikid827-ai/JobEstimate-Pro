import assert from "node:assert/strict"
import test from "node:test"
import { createHash, randomUUID } from "node:crypto"
import OpenAI from "openai"
import { createCanvas } from "@napi-rs/canvas"
import type { ProjectFile, ProjectInventory, ProjectLibraryStore } from "../project-library/types"
import { prepareProjectFile } from "../project-library/service"
import { ProviderOutcomeError } from "../plan-study/runner"
import { ANALYSIS_LIMITS, ProjectAnalysisError, type AnalysisAttempt, type AnalysisPacket, type AnalysisRequest, type AnalysisResult } from "./types"
import { analysisContext, createProjectAnalysisProvider, PROJECT_ANALYSIS_MODEL } from "./provider"
import { parseProjectAnalysisRecord, validateAnalysisResult } from "./validation"
import { buildAnalysisPacket, runProjectAnalysis } from "./service"
import { publicAnalysis, type AnalysisCompletion, type AnalysisStore } from "./store"
import { createProjectAnalysisHandlers } from "./handlers"
import { createProjectAnalysisClient } from "./client"

// Authored synthetic provider-contract data, not captured model interpretation.
const owner = "synthetic-reader-owner", project = "synthetic-reader-project"
const schedule = "Room Cedar walls: length 12 ft, width 10 ft, wall height 8 ft. Openings 62 sqft. Paint drywall, repaint, 2 coats, full-height walls."
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const clone = <T>(value: T): T => structuredClone(value)
const fact = <T>(value: T, citationIds = ["c-source"], origin: "explicit_text" | "printed_visual" | "observation" = "explicit_text") => ({ value, citationIds, origin })
function output(): AnalysisResult {
  return {
    citations: [{ id: "c-source", fileId: "source-a", sourceVersion: 1, sourceSha256: sha(schedule), pageNumber: 1, anchor: { kind: "text", quote: schedule } }],
    findings: [{ id: "f-walls", kind: "requirement", title: "Cedar wall painting", detail: "Review the printed wall dimensions and work conditions.", citationIds: ["c-source"], relatedFindingIds: [], affectedWorkIds: ["w-walls"], limitations: [] }],
    takeoffInputs: [{ id: "w-walls", findingIds: ["f-walls"], location: fact("Room Cedar"), surface: fact("walls" as const), inputs: { lengthFt: fact(12), widthFt: fact(10), wallHeightFt: fact(8), openingsSqft: fact(62), netAreaSqft: null, count: null, substrate: fact("drywall"), condition: fact("repaint"), coats: fact(2), finish: fact("paint"), extent: fact("full_height") }, limitations: [] }],
    reviewStatus: "reviewed", limitations: [],
  }
}
function sourceFile(id = "source-a", text = schedule): ProjectFile {
  return { id, ownerId: owner, projectId: project, name: `${id}.txt`, relativePath: `Documents/${id}.txt`, mimeType: "text/plain", size: Buffer.byteLength(text), sha256: sha(text), sourceVersion: 1, active: true, status: "uploaded", preparation: "prepared", pageCount: 1, pages: [{ pageNumber: 1, text, extraction: "complete", review: "pending" }], createdAt: "2026-11-16T12:00:00.000Z", objectKey: `${owner}/${project}/${id}/original` }
}
function library(files = [sourceFile()]): ProjectLibraryStore & { inventory: ProjectInventory; originals: Map<string, Uint8Array>; reads: number } {
  return {
    inventory: { schemaVersion: 1, ownerId: owner, projectId: project, revision: 1, files }, originals: new Map(), reads: 0,
    async ready() {}, async get(ownerId, projectId) { assert.equal(ownerId, owner); assert.equal(projectId, project); return clone(this.inventory) },
    async save(_owner, inventory) { this.inventory = clone(inventory); return clone(inventory) },
    async ticket() { throw Error("No upload in reader tests") }, async signedDownload() { throw Error("No browser original links in reader tests") },
    async download(ownerId, file) { assert.equal(ownerId, owner); this.reads++; const bytes = this.originals.get(file.id); if (!bytes) throw Error("No synthetic original"); return clone(bytes) },
  }
}
class MemoryAnalysisStore implements AnalysisStore {
  records: AnalysisAttempt[] = []
  maximum = 8
  used = 0
  reserved = 0
  completions = 0
  failCompletion = false
  async ready() {}
  async list(ownerId: string, projectId: string) { return { analyses: this.records.filter(r => r.ownerId === ownerId && r.projectId === projectId).map(publicAnalysis), nextCursor: null } }
  async get(ownerId: string, projectId: string, id: string) { const record = this.records.find(r => r.ownerId === ownerId && r.projectId === projectId && r.id === id); if (!record) throw new ProjectAnalysisError(404, "ANALYSIS_NOT_FOUND", "Unknown record"); return clone(publicAnalysis(record)) }
  async latest(ownerId: string, projectId: string, fingerprint: string) { const record = this.records.findLast(r => r.ownerId === ownerId && r.projectId === projectId && r.fingerprint === fingerprint); return record ? clone(publicAnalysis(record)) : null }
  async claim(ownerId: string, projectId: string, spec: Parameters<AnalysisStore["claim"]>[2]) {
    const prior = this.records.findLast(r => r.ownerId === ownerId && r.projectId === projectId && r.fingerprint === spec.fingerprint)
    if (prior && (prior.status !== "failed" || !spec.retryFailed)) return { attempt: clone(prior), acquired: false }
    if (prior?.attemptNumber === 2) throw new ProjectAnalysisError(409, "ANALYSIS_RETRY_LIMIT", "Two attempts only")
    if (this.reserved) throw new ProjectAnalysisError(409, "ANALYSIS_RECONCILIATION_REQUIRED", "Reservation held")
    if (this.used + this.reserved >= this.maximum) throw new ProjectAnalysisError(403, "ANALYSIS_ALLOWANCE_UNAVAILABLE", "Existing allowance closed")
    const record: AnalysisAttempt = { id: randomUUID(), ownerId, projectId, fingerprint: spec.fingerprint, attemptNumber: (prior?.attemptNumber ?? 0) + 1, sourceVersions: clone(spec.sourceVersions), status: "running", createdAt: "2026-11-16T12:00:00.000Z", leaseExpiresAt: "2026-11-16T12:05:00.000Z", modelLabel: spec.modelLabel, resultIdentity: null, result: null, claimToken: randomUUID(), reservation: spec.reservation }
    this.reserved++; this.records.push(record)
    return { attempt: clone(record), acquired: true }
  }
  async complete(ownerId: string, projectId: string, attempt: AnalysisAttempt, completion: AnalysisCompletion) {
    this.completions++
    if (this.failCompletion) throw Error("Synthetic ambiguous persistence outcome")
    const record = this.records.find(r => r.id === attempt.id && r.ownerId === ownerId && r.projectId === projectId && r.claimToken === attempt.claimToken)!
    if (record.status !== "running") return clone(publicAnalysis(record))
    record.status = completion.status
    if (completion.errorCode) record.errorCode = completion.errorCode
    if (completion.status !== "unknown") { this.reserved--; this.used++; record.usage = completion.usage }
    if (completion.status === "complete") { record.result = clone(completion.result!); record.resultIdentity = completion.resultIdentity! }
    return clone(publicAnalysis(record))
  }
}
const request = (): AnalysisRequest => ({ targets: [{ fileId: "source-a", sourceVersion: 1, sourceSha256: sha(schedule), pageNumber: 1 }], context: [] })
const provider = (read: () => AnalysisResult = output) => ({ async ready() {}, async review() { return { result: read(), usage: { inputTokens: 100, outputTokens: 50 }, modelLabel: "Synthetic contract result, not model accuracy" } } })
async function packet() { return buildAnalysisPacket(library(), owner, project, request()) }

test("actual installed SDK serializes bounded mixed input and preserves safeguards; no paid transport", async () => {
  const input = await packet(), canvas = createCanvas(12, 10), bytes = new Uint8Array(canvas.toBuffer("image/jpeg", 85))
  input.sources[0].image = { bytes, width: 12, height: 10, mime: "image/jpeg" }; input.sources[0].imageSha256 = sha(bytes); input.sources[0].imageStatus = "provided"
  let calls = 0
  const reader = createProjectAnalysisProvider({ clientFactory: () => new OpenAI({ apiKey: "synthetic-not-a-real-key", maxRetries: 0, fetch: async (_url, init) => {
    calls++; const wire = JSON.parse(String(init?.body))
    assert.equal(wire.model, PROJECT_ANALYSIS_MODEL); assert.equal(wire.store, false); assert.equal(wire.stream, false); assert.equal(wire.temperature, undefined); assert.equal(wire.tools, undefined); assert.equal(wire.max_output_tokens, 6000)
    assert.equal(wire.text.format.strict, true); assert.equal(JSON.stringify(wire.text.format.schema).includes('"oneOf"'), false)
    assert.match(wire.instructions, /untrusted PROJECT DATA/); assert.match(wire.instructions, /cannot both be satisfied for the same work, location and applicable conditions/); assert.match(wire.instructions, /specific-always-overrides-general/); assert.match(wire.instructions, /Unknown|unknown extent/); assert.match(wire.instructions, /never invent their contents/)
    assert.equal(JSON.parse(wire.input[0].content[0].text).sources[0].text, schedule)
    assert.equal(JSON.parse(wire.input[0].content[1].text).suppliedImage.imageSha256, sha(bytes))
    assert.equal(wire.input[0].content[2].image_url, `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`)
    return Response.json({ id: "synthetic-reader-response", object: "response", status: "completed", model: PROJECT_ANALYSIS_MODEL, output: [{ id: "message-a", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output()), annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } })
  } }) })
  await reader.ready(); const result = await reader.review(input)
  assert.equal(calls, 1); assert.equal(result.usage.inputTokens, 100); assert.equal(result.result.takeoffInputs[0].inputs.lengthFt?.value, 12)
})

test("SDK transport uncertainty is not retried; missing usage remains unknown", async () => {
  let calls = 0
  const failing = createProjectAnalysisProvider({ clientFactory: () => new OpenAI({ apiKey: "synthetic", maxRetries: 0, fetch: async () => { calls++; throw Error("Synthetic transport failure") } }) })
  await assert.rejects(failing.review(await packet()), { code: "PROVIDER_OUTCOME_UNKNOWN" }); assert.equal(calls, 1)
  const missing = createProjectAnalysisProvider({ clientFactory: () => new OpenAI({ apiKey: "synthetic", fetch: async () => Response.json({ id: "synthetic", object: "response", status: "completed", output: [] }) }) })
  await assert.rejects(missing.review(await packet()), { code: "PROVIDER_USAGE_UNKNOWN" })
})

test("same batch and concurrent clicks invoke once; immutable result identities survive cached reopening", async () => {
  const source = library(), store = new MemoryAnalysisStore(); let calls = 0
  const reader = { ...provider(), async review() { calls++; await Promise.resolve(); return provider().review() } }
  const deps = { library: source, analyses: store, provider: reader }
  const results = await Promise.all([runProjectAnalysis(deps, owner, project, request()), runProjectAnalysis(deps, owner, project, request())])
  assert.equal(calls, 1); assert.equal(store.records.length, 1)
  const complete = results.find(r => r.status === "complete")!
  assert.ok(parseProjectAnalysisRecord(complete)); assert.ok(complete.result!.citations[0].id.startsWith(complete.id + ":")); assert.equal(complete.result!.takeoffInputs[0].inputs.lengthFt?.value, 12)
  const cached = await runProjectAnalysis(deps, owner, project, request())
  assert.equal(cached.resultIdentity, complete.resultIdentity); assert.equal(calls, 1); assert.equal(store.used, 1)
})

test("completed photo batches reuse results without downloading or decoding images again", async () => {
  const canvas = createCanvas(20, 12), bytes = new Uint8Array(canvas.toBuffer("image/png")), file = sourceFile("photo", "photo")
  Object.assign(file, { name: "site.png", relativePath: "Photos/site.png", mimeType: "image/png", size: bytes.length, sha256: sha(bytes), pages: [{ pageNumber: 1, text: "", extraction: "empty", review: "pending" }] })
  const source = library([file]); source.originals.set("photo", bytes)
  const store = new MemoryAnalysisStore(), req: AnalysisRequest = { targets: [{ fileId: "photo", sourceVersion: 1, sourceSha256: file.sha256, pageNumber: 1 }], context: [] }
  const reader = { async ready() {}, async review(packet: AnalysisPacket) { assert.ok(packet.sources[0].image); return { result: { citations: [], findings: [], takeoffInputs: [], reviewStatus: "reviewed" as const, limitations: [] }, usage: { inputTokens: 100, outputTokens: 20 }, modelLabel: "Synthetic" } } }
  await runProjectAnalysis({ library: source, analyses: store, provider: reader }, owner, project, req); const reads = source.reads
  await runProjectAnalysis({ library: source, analyses: store, provider: reader }, owner, project, req)
  assert.equal(source.reads, reads); assert.equal(store.records.length, 1)
})

test("closed allowance denies before the provider and never creates capacity", async () => {
  const store = new MemoryAnalysisStore(); store.maximum = 0; let calls = 0
  await assert.rejects(runProjectAnalysis({ library: library(), analyses: store, provider: { ...provider(), async review() { calls++; return provider().review() } } }, owner, project, request()), { code: "ANALYSIS_ALLOWANCE_UNAVAILABLE" })
  assert.equal(calls, 0); assert.equal(store.used, 0); assert.equal(store.reserved, 0); assert.equal(store.maximum, 0)
})

test("analysis visual preparation shares the existing project decoder queue", async () => {
  const canvas = createCanvas(20, 12), bytes = new Uint8Array(canvas.toBuffer("image/png")), file = sourceFile("photo", "photo")
  Object.assign(file, { mimeType: "image/png", size: bytes.length, sha256: sha(bytes), preparation: "pending", pages: [], pageCount: null })
  const source = library([file]); let active = 0, maximum = 0, reads = 0
  source.download = async () => { reads++; active++; maximum = Math.max(active, maximum); await new Promise(resolve => setTimeout(resolve, 10)); active--; return clone(bytes) }
  const reader = { async ready() {}, async review() { return { result: { citations: [], findings: [], takeoffInputs: [], reviewStatus: "reviewed" as const, limitations: [] }, usage: { inputTokens: 100, outputTokens: 20 }, modelLabel: "Synthetic" } } }
  const req: AnalysisRequest = { targets: [{ fileId: "photo", sourceVersion: 1, sourceSha256: file.sha256, pageNumber: 1 }], context: [] }
  await Promise.all([prepareProjectFile(source, owner, project, "photo"), runProjectAnalysis({ library: source, analyses: new MemoryAnalysisStore(), provider: reader }, owner, project, req)])
  assert.equal(reads, 2); assert.equal(maximum, 1)
})

test("unknown outcomes retain the reservation and cannot be retried with another click", async () => {
  const store = new MemoryAnalysisStore(); let calls = 0
  const deps = { library: library(), analyses: store, provider: { ...provider(), async review(): Promise<never> { calls++; throw new ProviderOutcomeError("PROVIDER_OUTCOME_UNKNOWN") } } }
  const unknown = await runProjectAnalysis(deps, owner, project, request()); assert.equal(unknown.status, "unknown"); assert.equal(store.reserved, 1)
  const repeated = await runProjectAnalysis(deps, owner, project, { ...request(), retryFailed: true }); assert.equal(repeated.id, unknown.id); assert.equal(calls, 1)
})

test("known failed responses need an explicit retry and are bounded to two attempts", async () => {
  const store = new MemoryAnalysisStore(); let calls = 0
  const deps = { library: library(), analyses: store, provider: { ...provider(), async review(): Promise<never> { calls++; throw new ProviderOutcomeError("INVALID_ANALYSIS", { inputTokens: 100, outputTokens: 20 }) } } }
  assert.equal((await runProjectAnalysis(deps, owner, project, request())).status, "failed")
  await runProjectAnalysis(deps, owner, project, request()); assert.equal(calls, 1)
  await runProjectAnalysis(deps, owner, project, { ...request(), retryFailed: true }); assert.equal(calls, 2)
  await assert.rejects(runProjectAnalysis(deps, owner, project, { ...request(), retryFailed: true }), { code: "ANALYSIS_RETRY_LIMIT" }); assert.equal(calls, 2)
})

test("source replacement during interpretation rejects publishing while retaining prior attempt and known usage", async () => {
  const source = library(), store = new MemoryAnalysisStore()
  const deps = { library: source, analyses: store, provider: { ...provider(), async review() { source.inventory.files[0].active = false; return provider().review() } } }
  const result = await runProjectAnalysis(deps, owner, project, request())
  assert.equal(result.status, "failed"); assert.equal(result.errorCode, "ANALYSIS_SOURCE_CHANGED"); assert.equal(result.result, null); assert.equal(result.usage!.inputTokens, 100); assert.equal(store.records.length, 1)
})

test("an ambiguous completion persistence is not attempted twice", async () => {
  const store = new MemoryAnalysisStore(); store.failCompletion = true
  await assert.rejects(runProjectAnalysis({ library: library(), analyses: store, provider: provider() }, owner, project, request()), /ambiguous persistence/)
  assert.equal(store.completions, 1); assert.equal(store.reserved, 1); assert.equal(store.records[0].status, "running")
})

test("exact citations, unit/value/location provenance and relationship identities fail closed", async t => {
  const source = await packet()
  const scenarios: Array<[string, (result: AnalysisResult) => void]> = [
    ["invented quote", r => { r.citations[0].anchor = { kind: "text", quote: "Invented 24 ft room" } }],
    ["foreign version", r => { r.citations[0].sourceVersion = 2 }],
    ["wrong room", r => { r.takeoffInputs[0].location!.value = "Room Elm" }],
    ["room prefix is not the same identity", r => { r.takeoffInputs[0].location!.value = "Room C" }],
    ["blank location", r => { r.takeoffInputs[0].location!.value = " " }],
    ["unprinted number", r => { r.takeoffInputs[0].inputs.lengthFt!.value = 999 }],
    ["observed numeric guess", r => { r.takeoffInputs[0].inputs.lengthFt!.origin = "observation" }],
    ["image not supplied", r => { r.citations[0].anchor = { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 }, visibleText: schedule }; r.takeoffInputs[0].location!.origin = "printed_visual" }],
    ["dangling relationship", r => { r.findings[0].relatedFindingIds = ["missing"] }],
    ["single-sided conflict", r => { r.findings[0].kind = "conflict" }],
    ["model total", r => { Object.assign(r.takeoffInputs[0].inputs, { total: 123 }) }],
  ]
  for (const [name, change] of scenarios) await t.test(name, () => { const result = output(); change(result); assert.throws(() => validateAnalysisResult(result, source, "attempt-a"), { code: "INVALID_ANALYSIS" }) })
  const noUnits = clone(source); noUnits.sources[0].text = schedule.replaceAll(" ft", " m")
  const result = output(); result.citations[0].anchor = { kind: "text", quote: noUnits.sources[0].text }
  assert.throws(() => validateAnalysisResult(result, noUnits, "attempt-a"), { code: "INVALID_ANALYSIS" })
  const mixedUnits = clone(source); mixedUnits.sources[0].text = schedule.replace("length 12 ft", "length 12 m")
  const mixedResult = output(); mixedResult.citations[0].anchor = { kind: "text", quote: mixedUnits.sources[0].text }
  assert.throws(() => validateAnalysisResult(mixedResult, mixedUnits, "attempt-a"), { code: "INVALID_ANALYSIS" }, "another feet value does not authorize relabeling meters")
})

test("large/unsupported/mixed source batches preserve partial coverage instead of omitting it", async () => {
  const good = sourceFile(), unsupported = { ...sourceFile("cad", "cad"), mimeType: "application/acad", name: "source.dwg" }
  const source = library([good, unsupported]), req = { ...request(), context: [{ fileId: unsupported.id, sourceVersion: 1, sourceSha256: unsupported.sha256, pageNumber: 1 }] }
  const packet = await buildAnalysisPacket(source, owner, project, req)
  const result = validateAnalysisResult(output(), packet, "attempt-a")
  assert.equal(result.reviewStatus, "limited"); assert.ok(packet.sources.find(s => s.fileId === "cad")!.issues.length)
  const large = clone(packet); large.sources[0].text = "a".repeat(ANALYSIS_LIMITS.contextBytes)
  assert.throws(() => analysisContext(large), { code: "ANALYSIS_CONTEXT_LIMIT" })
  await assert.rejects(buildAnalysisPacket(source, owner, project, { ...request(), context: request().targets }), { code: "ANALYSIS_INPUT_INVALID" })
})

test("real owner handler/client connect retained source text to strict response and read-only reopening", async () => {
  const store = new MemoryAnalysisStore(), handlers = createProjectAnalysisHandlers({ library: library(), analyses: store, provider: provider(), auth: { async getUser(token) { return { data: { user: token === owner ? { id: owner, email: "synthetic@example.test", email_confirmed_at: "2026-11-16", is_anonymous: false, role: "authenticated" } : null }, error: null } } } })
  const fetcher: typeof fetch = async (input, init = {}) => handlers.analysis(new Request(new URL(String(input), "http://127.0.0.1:3219"), { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${owner}` } }), project)
  const client = createProjectAnalysisClient(fetcher, project, () => true), run = await client.run(request())
  assert.equal(run.analysis.status, "complete"); assert.equal((await client.list()).analyses.length, 1); assert.equal((await client.get(run.analysis.id)).analysis.resultIdentity, run.analysis.resultIdentity)
  assert.equal((await handlers.analysis(new Request(`http://127.0.0.1/api/projects/${project}/analysis`), project)).status, 401)
  const foreign = await handlers.analysis(new Request(`http://127.0.0.1/api/projects/other/analysis?analysisId=${run.analysis.id}`, { headers: { authorization: `Bearer ${owner}` } }), "other")
  assert.equal(foreign.status, 404)
  assert.equal(JSON.stringify(run).includes("claimToken"), false); assert.equal(JSON.stringify(run).includes("reservation"), false)
})

test("readiness GET verifies uncited context content/status while historical reopening stays read-only", async () => {
  const context = sourceFile("context", "Synthetic supporting instructions without measured work.")
  const source = library([sourceFile(), context]), store = new MemoryAnalysisStore()
  let calls = 0
  const reader = { ...provider(), async review() { calls++; return provider().review() } }
  const run = await runProjectAnalysis({ library: source, analyses: store, provider: reader }, owner, project, { ...request(), context: [{ fileId: context.id, sourceVersion: 1, sourceSha256: context.sha256, pageNumber: 1 }] })
  assert.equal(run.status, "complete"); assert.ok(!run.result!.citations.some(citation => citation.fileId === context.id))
  const handlers = createProjectAnalysisHandlers({ library: source, analyses: store, provider: reader, auth: { async getUser() { return { data: { user: { id: owner, email: "synthetic@example.test", email_confirmed_at: "2026-11-16", is_anonymous: false, role: "authenticated" } }, error: null } } } })
  const get = (verify = false) => handlers.analysis(new Request(`http://127.0.0.1/api/projects/${project}/analysis?analysisId=${run.id}${verify ? "&verifyCurrent=1" : ""}`, { headers: { authorization: `Bearer ${owner}` } }), project)
  assert.equal((await get(true)).status, 200)
  const ledger = JSON.stringify(store.records), used = store.used, reserved = store.reserved
  source.inventory.files[1].pages[0].text = "Re-prepared supporting requirements changed; immutable original identity stayed the same."
  assert.equal((await get()).status, 200, "Historical analysis is still accessible")
  assert.equal((await get(true)).status, 409, "Uncited context content is a dependency")
  source.inventory.files[1].pages[0] = { pageNumber: 1, text: "", extraction: "failed", review: "pending" }
  assert.equal((await get(true)).status, 409, "Failed context cannot keep an old result current")
  assert.equal(calls, 1); assert.equal(store.used, used); assert.equal(store.reserved, reserved); assert.equal(JSON.stringify(store.records), ledger, "Readiness checks do not claim, settle or rewrite attempts")
})

test("recovered empty context gets its own source-state fingerprint instead of being trapped behind a failed extraction", async () => {
  const context = sourceFile("context", " ")
  context.pages[0] = { pageNumber: 1, text: "", extraction: "failed", review: "pending" }
  const source = library([sourceFile(), context]), store = new MemoryAnalysisStore()
  const selection = { ...request(), context: [{ fileId: context.id, sourceVersion: 1, sourceSha256: context.sha256, pageNumber: 1 }] }
  const before = await runProjectAnalysis({ library: source, analyses: store, provider: provider() }, owner, project, selection)
  assert.equal(before.result?.reviewStatus, "limited")
  source.inventory.files[1].pages[0].extraction = "empty"
  const after = await runProjectAnalysis({ library: source, analyses: store, provider: provider() }, owner, project, selection)
  assert.notEqual(after.fingerprint, before.fingerprint)
  assert.notEqual(after.id, before.id)
  assert.equal(store.records.length, 2)
  assert.equal(store.records[0].sourceVersions.find(ref => ref.fileId === context.id)?.textStatus, "failed")
  assert.equal(after.sourceVersions.find(ref => ref.fileId === context.id)?.textStatus, "empty")
})
