import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { createCanvas } from "@napi-rs/canvas"
import type { AnalysisFact, AnalysisPacket, AnalysisPacketSource, AnalysisResult, ProjectAnalysisRecord } from "../../lib/project-analysis/types"
import { validateAnalysisResult } from "../../lib/project-analysis/validation"
import type { ProjectInventory } from "../../lib/project-library/types"
import { approveAutomaticCosts, approvePricingProfile, automaticReviewFingerprint, checkProjectFreshness, confirmAutomaticQuantities, createAutomaticDraft, fetchCurrentProjectInventory, invalidateAnalysisApprovals, prepareAutomaticBid, refreshAutomaticDraftSources, verifyAnalysisBindings } from "./automatic-bid"
import { assessProposalReadiness, createProposalSnapshot, defaultProposalDetails } from "./customer-proposal"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, parseDraft, updateDraftItem, workingCopy } from "./source-linked-draft"
import type { DraftCommercial, DraftRevision } from "./source-linked-draft-types"

/** Authored provider-contract evidence. These are not captured outputs or real-model accuracy tests. */
const ownerId = "synthetic-reader-owner", projectId = "synthetic-reader-project"
const job = { id: projectId, name: "Synthetic paragraph-supported bid", clientName: "Synthetic customer", address: "Synthetic site" }
const commercial: DraftCommercial = { markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25 }
const drawing = "Drawing identifies Room 101. Its length is 12 ft, width is 10 ft and wall height is 8 ft. Deduct 62 sqft of openings."
const specification = "Room 101 walls and ceilings shall receive paint on drywall. The condition is repaint; apply 2 coats."
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function profile() {
  return approvePricingProfile({ id: "reader-profile", version: 1, ownerId, name: "Synthetic approved profile", rules: [
    { id: "wall", surface: "walls", substrate: "drywall", condition: "repaint", coats: 2, unit: "sqft", labor: 1, materials: .5, other: 0 },
    { id: "ceiling", surface: "ceilings", substrate: "drywall", condition: "repaint", coats: 2, unit: "sqft", labor: .75, materials: .25, other: 0 },
  ] }, ownerId, 100)
}
function inventory(): ProjectInventory {
  return { schemaVersion: 1, ownerId, projectId, revision: 1, files: [drawing, specification].map((text, index) => ({
    id: index ? "specification" : "drawing", ownerId, projectId, name: index ? "Painting specification.pdf" : "Room drawing.pdf", relativePath: index ? "Specifications/Painting.pdf" : "Plans/Room.pdf", mimeType: "application/pdf", size: 5000, sha256: hash(text), sourceVersion: 1, active: true, status: "uploaded", preparation: "prepared", pageCount: 1, pages: [{ pageNumber: 1, text, extraction: "complete", review: "pending", contentLoaded: true }], objectKey: `${ownerId}/${projectId}/${index}/original`, createdAt: "2026-11-16T00:00:00Z",
  })) }
}
function packet(source: ProjectInventory, images = new Map<string, Uint8Array>()): AnalysisPacket {
  const sources: AnalysisPacketSource[] = source.files.map((file, index) => {
    const page = file.pages[0], image = images.get(file.id)
    return { fileId: file.id, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, pageNumber: 1, role: index ? "context" : "target", name: file.name, relativePath: file.relativePath, mimeType: file.mimeType, text: page.text, textSha256: hash(page.text), textCharacters: page.text.length, textStatus: page.extraction === "complete" ? "complete" : "empty", imageSha256: image ? hash(image) : null, imageStatus: image ? "provided" : "not_provided", issues: [], ...(image ? { image: { mime: "image/jpeg" as const, bytes: image, width: 480, height: 160 } } : {}) }
  })
  return { ownerId, projectId, fingerprint: hash(JSON.stringify(sources)), sources }
}
const fact = <T>(value: T, citation = "spec", origin: AnalysisFact<T>["origin"] = "explicit_text"): AnalysisFact<T> => ({ value, citationIds: [citation], origin })
function rawResult(source = inventory()): AnalysisResult {
  const dimensions = source.files[0], spec = source.files[1]
  return { reviewStatus: "reviewed", limitations: [], citations: [
    { id: "dim", fileId: dimensions.id, sourceVersion: dimensions.sourceVersion, sourceSha256: dimensions.sha256, pageNumber: 1, anchor: { kind: "text", quote: dimensions.pages[0].text } },
    { id: "spec", fileId: spec.id, sourceVersion: spec.sourceVersion, sourceSha256: spec.sha256, pageNumber: 1, anchor: { kind: "text", quote: spec.pages[0].text } },
  ], findings: [{ id: "paint-requirement", kind: "requirement", title: "Room 101 paint scope", detail: "Use the drawing dimensions with the painting specification for Room 101 walls and ceilings.", citationIds: ["dim", "spec"], relatedFindingIds: [], affectedWorkIds: ["wall", "ceiling"], limitations: [] }], takeoffInputs: ["walls", "ceilings"].map(surface => ({
    id: surface === "walls" ? "wall" : "ceiling", findingIds: ["paint-requirement"], location: fact("Room 101", "dim"), surface: fact(surface as "walls" | "ceilings"), inputs: {
      lengthFt: fact(12, "dim"), widthFt: fact(10, "dim"), wallHeightFt: surface === "walls" ? fact(8, "dim") : null,
      openingsSqft: surface === "walls" ? fact(62, "dim") : null, netAreaSqft: null, count: null,
      substrate: fact("drywall"), condition: fact("repaint"), coats: fact(2), finish: fact("paint"), extent: null,
    }, limitations: [],
  })) }
}
function record(source = inventory(), raw = rawResult(source), id = "synthetic-analysis", images = new Map<string, Uint8Array>()): ProjectAnalysisRecord {
  const input = packet(source, images), result = validateAnalysisResult(raw, input, id)
  return { id, ownerId, projectId, fingerprint: input.fingerprint, attemptNumber: 1, sourceVersions: input.sources.map(({ text, image, ...metadata }) => { assert.equal(text.length, metadata.textCharacters); assert.equal(image ? hash(image.bytes) : null, metadata.imageSha256); return metadata }), status: "complete", createdAt: "2026-11-16T00:00:00Z", leaseExpiresAt: "2026-11-16T00:01:00Z", modelLabel: "Synthetic provider contract; no live model", result, resultIdentity: hash(JSON.stringify(result)), usage: { inputTokens: 100, outputTokens: 100 } }
}
const prepare = (source = inventory(), analyses = [record(source)]) => prepareAutomaticBid({ ownerId, job, inventory: source, selectedFileIds: source.files.map(file => file.id), locations: ["Room 101"], profile: profile(), analyses }, 1000)

test("validated cross-document interpretation fills existing equations and exact approved costs without approval", async () => {
  const source = inventory()
  assert.equal((await prepare(source, [])).candidates.length, 0, "Natural paragraphs are not injected deterministic schedule rows")
  const prepared = await prepare(source)
  assert.deepEqual(prepared.candidates.map(value => [value.surface, value.item.quantity]), [["walls", 290], ["ceilings", 120]])
  assert.equal(prepared.exceptions.length, 0)
  let draft = createAutomaticDraft(prepared, job, commercial)
  assert.equal(calculateDraft(draft).total, 0)
  assert.ok(draft.items.every(item => !item.quantityConfirmation && !item.costApproval))
  const ids = prepared.candidates.map(value => value.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  assert.deepEqual([calculateDraft(draft).directCost, calculateDraft(draft).subtotal, calculateDraft(draft).taxAmount, calculateDraft(draft).total, calculateDraft(draft).depositDue, calculateDraft(draft).remaining], [555, 666, 53.28, 719, 180, 539])
  const sourceEvidence = prepared.candidates[0].item.source
  assert.equal(sourceEvidence.kind, "project")
  if (sourceEvidence.kind === "project") {
    assert.deepEqual(sourceEvidence.snapshot.sources.map(value => value.quote), [drawing, specification])
    assert.equal(sourceEvidence.snapshot.analyses?.[0].runId, "synthetic-analysis")
    assert.equal(sourceEvidence.snapshot.analyses?.[0].sourceVersions.length, 2)
  }
})

test("consistent AI and deterministic evidence share one item per exact location/surface; incompatible inputs stop affected pricing", async () => {
  const source = inventory()
  source.files.push({ ...clone(source.files[0]), id: "printed-schedule", sha256: "c".repeat(64), pages: [{ pageNumber: 1, text: "Room: Room 101\nLength: 12 ft\nWidth: 10 ft\nWall height: 8 ft\nWall finish: paint\nCeiling finish: paint\nSubstrate: drywall\nCondition: repaint\nCoats: 2\nOpenings area: 62 sqft", extraction: "complete", review: "pending" }] })
  const interpreted = record(inventory())
  assert.equal((await prepare(source, [interpreted])).candidates.length, 2)
  source.files[2].pages[0].text = source.files[2].pages[0].text.replace("Length: 12 ft", "Length: 13 ft")
  const incompatible = await prepare(source, [interpreted])
  assert.equal(incompatible.candidates.length, 0)
  assert.ok(incompatible.exceptions.some(issue => issue.message.includes("Conflicting dimensions")))
})

test("independent recorded reruns with identical field evidence retain both identities without duplicate work", async () => {
  const source = inventory(), first = record(source), second = record(source, rawResult(source), "synthetic-analysis-rerun")
  const prepared = await prepare(source, [first, second])
  assert.deepEqual(prepared.candidates.map(candidate => candidate.item.quantity), [290, 120])
  assert.equal(prepared.exceptions.length, 0)
  for (const candidate of prepared.candidates) {
    assert.equal(candidate.item.source.kind, "project")
    if (candidate.item.source.kind === "project") assert.deepEqual(candidate.item.source.snapshot.analyses?.map(binding => binding.runId), [first.id, second.id])
  }
})

test("equal numbers from different AI field evidence do not merge materially different wall extents", async () => {
  const source = inventory()
  const north = "Room 101 north wall net paintable area is 50 sqft.", west = "Room 101 west wall net paintable area is 50 sqft."
  source.files[0].pages[0].text = `${north} ${west}`; source.files[0].sha256 = hash(source.files[0].pages[0].text)
  source.files[1].pages[0].text = "Room 101 walls shall receive paint on drywall. The condition is repaint; apply 2 coats. Ceilings are excluded."
  source.files[1].sha256 = hash(source.files[1].pages[0].text)
  const raw = (quote: string) => {
    const value = rawResult(source); value.citations[0].anchor = { kind: "text", quote }
    value.findings[0].detail = "Use the corresponding net paintable wall area and the painting specification. Ceilings are excluded."
    for (const work of value.takeoffInputs) {
      work.inputs.lengthFt = null; work.inputs.widthFt = null; work.inputs.wallHeightFt = null; work.inputs.openingsSqft = null
      work.inputs.netAreaSqft = work.surface!.value === "walls" ? fact(50, "dim") : null
      if (work.surface!.value === "ceilings") work.inputs.finish = fact("excluded")
    }
    return value
  }
  const prepared = await prepare(source, [record(source, raw(north), "north-analysis"), record(source, raw(west), "west-analysis")])
  assert.equal(prepared.candidates.length, 0)
  assert.ok(prepared.exceptions.some(issue => issue.message.includes("separate extents")))
  const exception = prepared.exceptions.find(issue => issue.message.includes("separate extents"))!
  assert.equal(exception.evidence?.analyses?.length, 2)
  assert.ok(exception.evidence?.sources.some(source => source.quote === north))
  assert.ok(exception.evidence?.sources.some(source => source.quote === west))
})

test("linked conflicts retain their classification/evidence and prevent batch promotion of affected work", async () => {
  const source = inventory(), raw = rawResult(source)
  raw.findings.push({ id: "wall-conflict", kind: "conflict", title: "Resolve wall requirement", detail: "Two supplied requirements cannot both be applied to the same wall work.", citationIds: ["dim", "spec"], relatedFindingIds: [], affectedWorkIds: ["wall"], limitations: [] })
  const prepared = await prepare(source, [record(source, raw)])
  assert.deepEqual(prepared.candidates.map(value => value.surface), ["ceilings"])
  const draft = createAutomaticDraft(prepared, job, commercial)
  const question = draft.items.find(item => item.description.includes("Resolve wall requirement"))!
  assert.equal(question.source.kind, "project")
  assert.equal(question.quantity, null)
  assert.throws(() => confirmAutomaticQuantities(draft, [question.id], automaticReviewFingerprint(draft), ownerId), /quantity|scope|measurement/i)
  assert.equal(calculateDraft(draft).partial, true)
})

test("limited review and unanswered observations remain explicit decisions with retained source bindings", async () => {
  const source = inventory(), raw = rawResult(source)
  raw.reviewStatus = "limited"; raw.limitations = ["The referenced exterior schedule was not supplied."]
  raw.findings.push({ id: "missing-reference", kind: "question", title: "Supply missing schedule", detail: "Confirm the missing schedule before including its scope.", citationIds: ["spec"], relatedFindingIds: [], affectedWorkIds: [], limitations: [] })
  const prepared = await prepare(source, [record(source, raw)])
  assert.equal(prepared.candidates.length, 2)
  assert.ok(prepared.exceptions.some(value => value.message.includes("missing schedule")))
  assert.ok(prepared.exceptions.some(value => value.message.includes("AI review is limited")))
  assert.equal(prepared.coverage.aiSourcesLimited, 1)
  assert.ok(prepared.coverage.records.some(value => value.state === "ai_limited"))
  assert.equal(calculateDraft(createAutomaticDraft(prepared, job, commercial)).partial, true)
})

test("unknown lower-wall extent stays a measurement decision even when the model omits a clarification", async () => {
  const source = inventory()
  source.files[0].pages[0].text += " The lower-wall finish and chair-rail extent are not supplied."
  source.files[0].sha256 = hash(source.files[0].pages[0].text)
  const prepared = await prepare(source, [record(source)])
  assert.deepEqual(prepared.candidates.map(candidate => candidate.surface), ["ceilings"])
  assert.ok(prepared.exceptions.some(issue => issue.message.includes("Wall extent is partial or unclear")))
  assert.equal(calculateDraft(createAutomaticDraft(prepared, job, commercial)).partial, true)
})

test("photo observations retain image evidence but never become room identities, repair areas or approved prices", async () => {
  const source = inventory(); source.files = [source.files[0]]
  source.files[0].mimeType = "image/jpeg"; source.files[0].name = "Unlocated wall photo.jpg"
  source.files[0].pages[0] = { pageNumber: 1, text: "", extraction: "empty", review: "pending", contentLoaded: true }
  const canvas = createCanvas(480, 160), context = canvas.getContext("2d")
  context.fillStyle = "#b5b0a5"; context.fillRect(0, 0, 480, 160); context.strokeStyle = "#4a4a4a"; context.beginPath(); context.moveTo(100, 0); context.lineTo(140, 160); context.stroke()
  const images = new Map([[source.files[0].id, new Uint8Array(canvas.toBuffer("image/jpeg", 85))]])
  const raw: AnalysisResult = { citations: [{ id: "photo", fileId: source.files[0].id, sourceVersion: 1, sourceSha256: source.files[0].sha256, pageNumber: 1, anchor: { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 }, visibleText: null } }], findings: [{ id: "visible-condition", kind: "observation", title: "Inspect visible wall condition", detail: "A visible line needs inspection. No location or repair area has been established.", citationIds: ["photo"], relatedFindingIds: [], affectedWorkIds: [], limitations: ["Photo has no established room location or measurement basis."] }], takeoffInputs: [], reviewStatus: "reviewed", limitations: [] }
  const prepared = await prepare(source, [record(source, raw, "photo-analysis", images)])
  assert.equal(prepared.candidates.length, 0)
  assert.equal(prepared.coverage.aiPhotosAnalyzed, 1)
  const draft = createAutomaticDraft(prepared, job, commercial)
  const observation = draft.items.find(item => item.description.includes("Inspect visible wall condition"))!
  assert.equal(observation.quantity, null)
  assert.equal(observation.source.kind, "project")
  if (observation.source.kind === "project") {
    assert.equal(observation.source.snapshot.sources[0].quote, "")
    assert.equal(observation.source.snapshot.sources[0].anchor?.kind, "image")
  }
  assert.equal(calculateDraft(draft).total, 0)
  assert.equal(calculateDraft(draft).partial, true)
})

test("unestablished room names and observation-derived numbers cannot enter measured candidate rows", async () => {
  const source = inventory()
  for (const label of ["Room 999", "Room 10"]) {
    const wrongRoom = record(source)
    for (const work of wrongRoom.result!.takeoffInputs) work.location!.value = label
    const unlocated = await prepare(source, [wrongRoom])
    assert.equal(unlocated.candidates.length, 0)
    assert.ok(unlocated.exceptions.some(issue => issue.message.includes("explicit work location")))
  }
  const observed = record(source)
  observed.result!.takeoffInputs[0].inputs.lengthFt!.origin = "observation"
  const unsupported = await prepare(source, [observed])
  assert.equal(unsupported.candidates.some(candidate => candidate.surface === "walls"), false)
  assert.ok(unsupported.exceptions.some(issue => issue.message.includes("Measurements need confirmation")))
})

test("pending/failed/foreign/replaced analysis cannot populate the current estimate", async () => {
  const source = inventory(), complete = record(source)
  for (const status of ["running", "failed", "unknown"] as const) await assert.rejects(prepare(source, [{ ...complete, status, result: null, resultIdentity: null }]), /completed, validated/)
  await assert.rejects(prepare(source, [{ ...complete, ownerId: "another-owner" }]), /this owner and project/)
  const changed = clone(source); changed.files[1].active = false
  await assert.rejects(prepare(changed, [complete]), /context source changed/)
})

test("source/context replacement and interpretation edits invalidate exact bindings, approvals and old proposal readiness", async () => {
  const source = inventory(), analysis = record(source), prepared = await prepare(source, [analysis])
  let draft = createAutomaticDraft(prepared, job, commercial)
  const ids = draft.items.map(item => item.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  const revision: DraftRevision = { schemaVersion: 1, id: "reader-revision", draftId: draft.id, ownerId, jobId: projectId, parentRevisionId: null, savedAt: 1300, draft, calculation: calculateDraft(draft) }
  const original = JSON.stringify(revision)
  const changed = clone(source); changed.files[1].sourceVersion = 2; changed.files[1].sha256 = "d".repeat(64)
  const stale = refreshAutomaticDraftSources(workingCopy(revision), changed)
  assert.ok(stale.items.every(item => !item.quantityConfirmation && !item.costApproval))
  assert.equal(assessProposalReadiness({ ownerId, jobId: projectId, revision, workingDraft: stale }).ready, false)
  const snapshots = draft.items.flatMap(item => item.source.kind === "project" ? [item.source.snapshot] : [])
  const calls: string[] = []
  await verifyAnalysisBindings(async input => { calls.push(String(input)); return Response.json({ analysis }) }, ownerId, projectId, snapshots, () => true)
  assert.equal(calls.length, 1, "One immutable run is fetched once for all its item bindings")
  assert.equal(new URL(calls[0], "http://127.0.0.1").searchParams.get("verifyCurrent"), "1", "Readiness must request server verification of every target/context text dependency")
  await assert.rejects(verifyAnalysisBindings(async () => Response.json({ analysis: { ...analysis, resultIdentity: "e".repeat(64) } }), ownerId, projectId, snapshots, () => true), /inputs or findings changed/)
  await assert.rejects(verifyAnalysisBindings(async () => Response.json({ analysis: { ...analysis, ownerId: "foreign" } }), ownerId, projectId, snapshots, () => true), /could not be verified/)
  const changedFields = clone(analysis)
  changedFields.result!.takeoffInputs[0].inputs.lengthFt!.value = 99
  const changedPreparation = await prepare(source, [changedFields])
  const changedSnapshots = changedPreparation.candidates.flatMap(candidate => candidate.item.source.kind === "project" ? [candidate.item.source.snapshot] : [])
  await assert.rejects(verifyAnalysisBindings(async () => Response.json({ analysis }), ownerId, projectId, changedSnapshots, () => true), /inputs or findings changed/, "Same claimed result identity cannot bind a different interpreted field")
  const changedCitation = clone(snapshots)
  changedCitation[0].sources[0].quote = "Different current form content"
  await assert.rejects(verifyAnalysisBindings(async () => Response.json({ analysis }), ownerId, projectId, changedCitation, () => true), /citation bindings changed/)
  const altered = clone(draft.items[0])
  if (altered.source.kind === "project") altered.source.snapshot.analyses![0].resultIdentity = "f".repeat(64)
  const edited = updateDraftItem(draft.items[0], { source: altered.source })
  assert.equal(edited.quantityConfirmation, null); assert.equal(edited.costApproval, null)
  assert.equal(JSON.stringify(revision), original)
})

test("safe proposal receives recorded aggregate prices while AI findings, model metadata and internal rates stay private", async () => {
  const source = inventory(), prepared = await prepare(source)
  let draft = createAutomaticDraft(prepared, job, commercial)
  const ids = draft.items.map(item => item.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  const revision: DraftRevision = { schemaVersion: 1, id: "safe-reader-revision", draftId: draft.id, ownerId, jobId: projectId, parentRevisionId: null, savedAt: 1300, draft, calculation: calculateDraft(draft) }
  const snapshot = createProposalSnapshot({ ownerId, jobId: projectId, revision, workingDraft: { ...draft, basedOnRevisionId: revision.id } }, { ...defaultProposalDetails(revision, { name: "Synthetic Contractor", address: "", phone: "", email: "", license: "" }, "2026-11-16"), reference: "SYNTHETIC-READER" }, "safe-reader-proposal", 1400)
  assert.equal(snapshot.customer.pricing.total, 719)
  for (const marker of ["synthetic-analysis", "resultIdentity", "reader-profile", "sourceSha256", "explicit_text", "labor", "modelLabel"]) assert.equal(JSON.stringify(snapshot.customer).includes(marker), false, marker)
})

test("unavailable analysis clears only dependent working approvals and preserves history and unrelated authority", async () => {
  const source = inventory(), prepared = await prepare(source)
  let draft = createAutomaticDraft(prepared, job, commercial)
  const ids = draft.items.map(item => item.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  const before = JSON.stringify(draft)
  const original = draft.items[0]
  assert.equal(original.source.kind, "project")
  if (original.source.kind !== "project") return
  const deterministicSnapshot = clone(original.source.snapshot)
  delete deterministicSnapshot.analyses
  deterministicSnapshot.sources = deterministicSnapshot.sources.map(({ fileId, sourceVersion, sourceSha256, name, relativePath, pageNumber, quote }) => ({ fileId, sourceVersion, sourceSha256, name, relativePath, pageNumber, quote }))
  const deterministic = approveCosts(confirmQuantity(updateDraftItem({ ...clone(original), id: "deterministic-record" }, { source: { kind: "project", snapshot: deterministicSnapshot, freshness: "current" } }), ownerId, 1100), ownerId, 1200)
  const contractor = approveCosts(confirmQuantity({ ...createContractorItem({ id: "contractor-record", location: "Contractor location", description: "Contractor scope", disposition: "included", quantity: 1, unit: "lump_sum", measurementBasis: "Contractor-confirmed unit" }), costs: { unit: "lump_sum", labor: 10, materials: 0, other: 0, source: "Explicit synthetic contractor cost" } }, ownerId, 1100), ownerId, 1200)
  const mixed = { ...draft, items: [...draft.items, deterministic, contractor] }
  const invalidated = invalidateAnalysisApprovals(mixed)
  assert.ok(invalidated.items.slice(0, 2).every(item => !item.quantityConfirmation && !item.costApproval && item.source.kind === "project" && item.source.freshness === "unavailable"))
  assert.deepEqual(invalidated.items[2], deterministic)
  assert.deepEqual(invalidated.items[3], contractor)
  assert.deepEqual(invalidateAnalysisApprovals(invalidated), invalidated)
  assert.equal(JSON.stringify(draft), before)
})

test("identical analysis reruns do not duplicate charges and changed interpretation/profile produce new preparation identities", async () => {
  const source = inventory(), first = record(source), once = await prepare(source, [first])
  assert.equal((await prepare(source, [first])).id, once.id)
  assert.equal((await prepare(source, [first])).candidates.length, 2)
  await assert.rejects(prepare(source, [first, first]), /distinct recorded/)
  const raw = rawResult(source); raw.takeoffInputs[0].limitations.push("Contractor must inspect the cited wall condition.")
  assert.notEqual((await prepare(source, [record(source, raw, "synthetic-analysis-next")])).id, once.id)
  const later = profile(); later.version = 2; later.rules[0].labor = 2
  const repriced = await prepareAutomaticBid({ ownerId, job, inventory: source, selectedFileIds: source.files.map(file => file.id), locations: ["Room 101"], profile: later, analyses: [first] }, 2000)
  assert.notEqual(repriced.id, once.id)
  assert.ok(repriced.candidates.every(candidate => !candidate.item.quantityConfirmation && !candidate.item.costApproval))
})

test("printed visual evidence retains typed image regions and never requires a fabricated text quotation", async () => {
  const source = inventory(); source.files = [source.files[0]]
  source.files[0].pages[0] = { pageNumber: 1, text: "", extraction: "empty", review: "pending", contentLoaded: true }
  const canvas = createCanvas(480, 160), context = canvas.getContext("2d")
  context.fillStyle = "white"; context.fillRect(0, 0, 480, 160); context.fillStyle = "black"; context.font = "16px sans-serif"
  const printed = "Room 101 walls paint 50 sqft drywall repaint 2 coats; ceilings excluded"
  context.fillText(printed, 10, 40)
  const images = new Map([[source.files[0].id, new Uint8Array(canvas.toBuffer("image/jpeg", 85))]])
  const raw: AnalysisResult = { reviewStatus: "reviewed", limitations: [], citations: [{ id: "visual", fileId: source.files[0].id, sourceVersion: 1, sourceSha256: source.files[0].sha256, pageNumber: 1, anchor: { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 }, visibleText: printed } }], findings: [{ id: "visual-paint", kind: "requirement", title: "Printed wall scope", detail: "The printed plan note supplies a net wall area and excludes ceilings.", citationIds: ["visual"], relatedFindingIds: [], affectedWorkIds: ["visual-wall", "visual-ceiling"], limitations: [] }], takeoffInputs: ["walls", "ceilings"].map(surface => ({ id: `visual-${surface === "walls" ? "wall" : "ceiling"}`, findingIds: ["visual-paint"], location: fact("Room 101", "visual", "printed_visual"), surface: fact(surface as "walls" | "ceilings", "visual", "printed_visual"), inputs: { lengthFt: null, widthFt: null, wallHeightFt: null, openingsSqft: null, netAreaSqft: surface === "walls" ? fact(50, "visual", "printed_visual") : null, count: null, substrate: fact("drywall", "visual", "printed_visual"), condition: fact("repaint", "visual", "printed_visual"), coats: fact(2, "visual", "printed_visual"), finish: fact(surface === "walls" ? "paint" : "excluded", "visual", "printed_visual"), extent: null }, limitations: [] })) }
  const analysis = record(source, raw, "visual-analysis", images), prepared = await prepare(source, [analysis])
  assert.equal(prepared.candidates.length, 1)
  assert.equal(prepared.candidates[0].item.quantity, 50)
  const evidence = prepared.candidates[0].item.source
  assert.equal(evidence.kind, "project")
  if (evidence.kind === "project") {
    assert.equal(evidence.snapshot.sources[0].anchor?.kind, "image")
    assert.equal(evidence.snapshot.sources[0].imageSha256, analysis.sourceVersions[0].imageSha256)
    assert.equal(checkProjectFreshness(evidence.snapshot, source), "current")
  }
  assert.ok(parseDraft(createAutomaticDraft(prepared, job, commercial)))
})

test("paginated metadata discovery retrieves only requested evidence pages for freshness", async () => {
  const source = inventory(), prepared = await prepare(source), evidence = prepared.candidates[0].item.source
  assert.equal(evidence.kind, "project")
  if (evidence.kind !== "project") return
  const calls: string[] = []
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input), "http://127.0.0.1"), fileId = url.searchParams.get("fileId")
    calls.push(url.search)
    if (url.searchParams.get("view") === "content") {
      const file = source.files.find(value => value.id === fileId)!
      return Response.json({ ownerId, projectId, fileId, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, active: true, page: file.pages[0] })
    }
    const index = url.searchParams.has("cursor") ? 1 : 0
    return Response.json({ inventory: { ...source, files: [{ ...source.files[index], pages: [], contentStatus: "not_loaded" }] }, totalFiles: 2, nextCursor: index ? null : "next-synthetic-page" })
  }
  const loaded = await fetchCurrentProjectInventory(fetcher, ownerId, projectId, () => true, { references: evidence.snapshot.sources })
  assert.equal(loaded.files.length, 2)
  assert.equal(calls.filter(value => value.includes("view=content")).length, 2)
  assert.equal(calls.filter(value => value.includes("view=pages")).length, 0)
  assert.equal(checkProjectFreshness(evidence.snapshot, loaded), "current")
})
