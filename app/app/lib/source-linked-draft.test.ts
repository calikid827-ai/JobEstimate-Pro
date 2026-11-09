import assert from "node:assert/strict"
import test from "node:test"
import type { Study } from "../../lib/plan-study/types"
import type { Draft, DraftItem, DraftRevision } from "./source-linked-draft-types"
import {
  approveCosts, calculateDraft, checkStudyFreshness, confirmQuantity, createContractorItem,
  createDraft, createStudyItem, eligibleStudyDecisions, importStudySelection, parseDraft,
  parseDraftRevision, replaceStudySelection, snapshotStudySelection, updateDraftItem, workingCopy,
} from "./source-linked-draft"

const commercial = { markupPct: 25, taxEnabled: true, taxRate: 10, depositEnabled: true, depositType: "percent" as const, depositValue: 25 }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function draft(): Draft { return createDraft("owner-a", { id: "job-a", name: "Synthetic job", clientName: "Synthetic client", address: "" }, commercial, "draft-a") }
function ready(item = createContractorItem({ id: "item-a", location: "Room 1", description: "Paint walls", quantity: 1, unit: "lump_sum", measurementBasis: "Explicit contractor lump sum" })): DraftItem {
  item = updateDraftItem(item, { costs: { unit: item.unit, labor: 600, materials: 300, other: 100, source: "Synthetic contractor approved costs; no market-rate claim" } })
  return approveCosts(confirmQuantity(item, "owner-a", 100), "owner-a", 101)
}
function study(): Study {
  const sha256 = "a".repeat(64)
  const citations = [{ documentVersionId: "doc-a", pageId: "page-a", sourceSha256: sha256, anchor: { kind: "text" as const, blockId: "block-a", quote: "Synthetic wall finish note" } }]
  return {
    id: "study-a", ownerId: "owner-a", title: "Synthetic study", revision: 3, sourceRevision: 1,
    documents: [{ id: "doc-a", name: "Synthetic.pdf", sha256, pageCount: 1, bytes: 100, originalArtifactId: "artifact-a", active: true, pages: [{ id: "page-a", documentVersionId: "doc-a", pageNumber: 1, sourceSha256: sha256, indexing: "complete", extraction: "complete", rendering: "complete", analysis: "complete", blocks: [{ id: "block-a", text: "Synthetic wall finish note", bounds: { x: 0, y: 0, width: 1, height: 1 } }] }] }],
    findings: [
      { id: "attempt-a:0", kind: "requirement", trade: "painting", title: "Wall finish", detail: "Paint the room walls", citations: clone(citations), limitations: ["Synthetic selected-page evidence only"] },
      { id: "attempt-a:1", kind: "question", trade: "painting", title: "Which wall?", detail: "Confirm the location", citations: clone(citations), limitations: [] },
      { id: "attempt-a:2", kind: "question", trade: "painting", title: "Which wall?", detail: "A different same-titled question", citations: clone(citations), limitations: [] },
    ],
    decisions: [
      { id: "answer-a", findingId: "attempt-a:1", findingTitle: "Which wall?", answer: "North wall", documentVersionIds: ["doc-a"], sourceRevision: 1, status: "active", createdAt: "2026-11-08T01:00:00.000Z" },
      { id: "answer-b", findingId: "attempt-a:2", findingTitle: "Which wall?", answer: "South wall", documentVersionIds: ["doc-a"], sourceRevision: 1, status: "active", createdAt: "2026-11-08T01:00:00.000Z" },
    ],
    attempts: [{ id: "attempt-a", idempotencyKey: "synthetic-idempotency", studyId: "study-a", ownerId: "owner-a", sourceRevision: 1, sourceVersions: [{ documentVersionId: "doc-a", sha256 }], kind: "synthesis", status: "complete", claimToken: "synthetic-not-for-draft", reservation: { inputTokens: 100, outputTokens: 100 }, createdAt: "2026-11-08T00:00:00.000Z", leaseExpiresAt: "2026-11-08T00:01:00.000Z", usage: { inputTokens: 10, outputTokens: 10 } }],
    synthesis: "complete", synthesisReviewStatus: "limited", synthesisLimitations: ["Synthetic limited review"], modelLabel: "Synthetic fixture; no model called", createdAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T01:00:00.000Z",
  }
}

test("Study import retains exact selected answers, citations, limitations and canonical review classification", () => {
  const source = study()
  const snapshot = snapshotStudySelection(source, "attempt-a:1", ["answer-a"])
  assert.deepEqual(snapshot.decisions.map((answer) => answer.id), ["answer-a"])
  assert.equal(snapshot.finding.id, "attempt-a:1")
  assert.equal(snapshot.finding.citations[0].pageId, "page-a")
  assert.equal(snapshot.documents[0].sha256, "a".repeat(64))
  assert.equal(snapshot.classification, "package")
  assert.equal(snapshot.synthesisReviewStatus, "limited")
  assert.deepEqual(snapshot.synthesisLimitations, ["Synthetic limited review"])
  assert.equal("claimToken" in snapshot.attempt, false)
  assert.equal("originalArtifactId" in snapshot.documents[0], false)
  assert.equal("blocks" in snapshot.documents[0].pages[0], false)
  source.findings[1].detail = "Later changed text"
  source.decisions[0].answer = "Later changed answer"
  assert.equal(snapshot.finding.detail, "Confirm the location")
  assert.equal(snapshot.decisions[0].answer, "North wall")
})

test("similar question titles never attach another finding's answer; empty selection stays empty", () => {
  assert.deepEqual(eligibleStudyDecisions(study(), "attempt-a:1").map((d) => d.id), ["answer-a"])
  assert.throws(() => snapshotStudySelection(study(), "attempt-a:1", ["answer-b"]))
  assert.throws(() => snapshotStudySelection(study(), "attempt-a:1", ["answer-a", "answer-a"]))
  assert.deepEqual(snapshotStudySelection(study(), "attempt-a:1", []).decisions, [])
})

test("stale, mismatched and ambiguous decision records cannot be selected", () => {
  for (const mutate of [
    (s: Study) => { s.decisions[0].status = "needs_reconfirmation" },
    (s: Study) => { s.decisions[0].sourceRevision = 2 },
    (s: Study) => { s.decisions[0].documentVersionIds = ["other-doc"] },
    (s: Study) => { s.decisions.push(clone(s.decisions[0])) },
  ]) {
    const source = study(); mutate(source)
    assert.deepEqual(eligibleStudyDecisions(source, "attempt-a:1"), [])
    assert.throws(() => snapshotStudySelection(source, "attempt-a:1", ["answer-a"]))
  }
})

test("unassigned, historical, wrong-owner and ambiguous review provenance cannot enter a draft", () => {
  for (const mutate of [
    (s: Study) => { s.findings[0].id = "invented-id" },
    (s: Study) => { s.attempts[0].ownerId = "other-owner" },
    (s: Study) => { s.attempts[0].sourceRevision = 2 },
    (s: Study) => { s.attempts[0].sourceVersions[0].sha256 = "b".repeat(64) },
    (s: Study) => { s.attempts.push(clone(s.attempts[0])) },
    (s: Study) => { s.findings[0].citations[0].pageId = "other-page" },
  ]) {
    const source = study(); mutate(source)
    assert.throws(() => snapshotStudySelection(source, source.findings[0].id, []))
  }
  const snapshot = snapshotStudySelection(study(), "attempt-a:0", [])
  assert.throws(() => importStudySelection({ ...draft(), ownerId: "other-owner" }, snapshot, "Room 1"))
})

test("current supporting page provenance is preserved and labeled supporting", () => {
  const source = study()
  source.attempts[0].kind = "page"; source.attempts[0].pageId = "page-a"; source.synthesis = "pending"
  assert.equal(snapshotStudySelection(source, "attempt-a:0", []).classification, "supporting")
})

test("capture rejects missing quotations, ambiguous blocks, unprepared pages and invalid image anchors", () => {
  for (const mutate of [
    (s: Study) => { const anchor = s.findings[0].citations[0].anchor; if (anchor.kind === "text") anchor.quote = "Quote not on the drawing" },
    (s: Study) => { s.documents[0].pages[0].blocks.push(clone(s.documents[0].pages[0].blocks[0])) },
    (s: Study) => { s.documents[0].pages[0].rendering = "failed" },
    (s: Study) => { s.documents[0].pages[0].extraction = "pending" },
    (s: Study) => { s.findings[0].citations[0].anchor = { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 } } },
    (s: Study) => { s.documents[0].pages[0].imageArtifactId = "image-a"; s.findings[0].citations[0].anchor = { kind: "image", bounds: { x: 0.8, y: 0, width: 0.5, height: 1 } } },
  ]) {
    const value = study(); mutate(value)
    assert.throws(() => snapshotStudySelection(value, "attempt-a:0", []))
  }
  const image = study()
  image.documents[0].pages[0].imageArtifactId = "image-a"
  image.findings[0].citations[0].anchor = { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 } }
  assert.equal(snapshotStudySelection(image, "attempt-a:0", []).documents[0].pages[0].imageArtifactId, "image-a")
})

test("repeated same selection/location blocks duplication, different locations and exact identities stay distinct", () => {
  const snapshot = snapshotStudySelection(study(), "attempt-a:1", ["answer-a"])
  let value = importStudySelection(draft(), snapshot, "Room 1")
  assert.equal(value.items[0].disposition, "unresolved")
  assert.throws(() => importStudySelection(value, snapshot, " room 1 "))
  assert.throws(() => importStudySelection(value, snapshotStudySelection(study(), "attempt-a:1", []), "Room 1"))
  value = importStudySelection(value, snapshot, "Room 2")
  value = importStudySelection(value, snapshotStudySelection(study(), "attempt-a:2", ["answer-b"]), "Room 1")
  assert.equal(value.items.length, 3)
  assert.equal(new Set(value.items.map((item) => item.id)).size, 3)
})

test("a requirement import still requires explicit scope inclusion; later location collisions cannot double charge", () => {
  const snapshot = snapshotStudySelection(study(), "attempt-a:0", [])
  let first = createStudyItem(snapshot, "Room 1", "first")
  assert.equal(first.disposition, "unresolved")
  first = updateDraftItem(first, { quantity: 1, unit: "lump_sum", measurementBasis: "Contractor supplied lump sum" })
  assert.throws(() => confirmQuantity(first, "owner-a"), /included/)
  first = ready(updateDraftItem(first, { disposition: "included" }))
  const second = ready(updateDraftItem(createStudyItem(snapshot, "Room 2", "second"), { disposition: "included", quantity: 1, unit: "lump_sum", measurementBasis: "Contractor supplied lump sum" }))
  assert.equal(calculateDraft({ ...draft(), items: [first, second] }).pricedCount, 2)
  const collision = updateDraftItem(second, { location: " room 1 " })
  const result = calculateDraft({ ...draft(), items: [first, collision] })
  assert.equal(result.pricedCount, 0)
  assert.equal(result.total, 0)
  assert.equal(result.partial, true)
  assert.ok(result.items.every((item) => item.reasons.some((reason) => reason.includes("duplicate"))))
})

test("source freshness compares selected answer identity/content and source versions, never titles", () => {
  const snapshot = snapshotStudySelection(study(), "attempt-a:1", ["answer-a"])
  assert.equal(checkStudyFreshness(snapshot, study()), "current")
  assert.equal(checkStudyFreshness(snapshot, null), "unavailable")
  for (const mutate of [
    (s: Study) => { s.ownerId = "other-owner" },
    (s: Study) => { s.sourceRevision = 2 },
    (s: Study) => { s.documents[0].sha256 = "b".repeat(64) },
    (s: Study) => { s.findings[1].detail = "Changed scope" },
    (s: Study) => { s.decisions[0].answer = "Changed answer" },
    (s: Study) => { s.decisions[0].id = "new-answer-id" },
  ]) {
    const source = study(); mutate(source)
    assert.equal(checkStudyFreshness(snapshot, source), "changed")
  }
  const unrelated = study(); unrelated.decisions[1].answer = "Changed unrelated answer"
  assert.equal(checkStudyFreshness(snapshot, unrelated), "current")
})

test("explicit evidence replacement recovers a changed answer without duplicating or approving the work", () => {
  const source = study()
  const originalSnapshot = snapshotStudySelection(source, "attempt-a:1", ["answer-a"])
  let item = createStudyItem(originalSnapshot, "Room 1", "retained-item")
  item = updateDraftItem(item, { disposition: "included", description: "Contractor-edited wall scope", scopeDecision: "Include the north wall", quantity: 1, unit: "lump_sum", measurementBasis: "Explicit contractor lump sum" })
  item = ready(item)
  const savedDraft = { ...draft(), items: [item] }
  const revision: DraftRevision = { schemaVersion: 1, id: "saved-before-answer-change", draftId: savedDraft.id, parentRevisionId: null, ownerId: savedDraft.ownerId, jobId: savedDraft.job.id, savedAt: 1000, draft: savedDraft, calculation: calculateDraft(savedDraft) }
  const historical = clone(revision)
  source.decisions[0].id = "answer-a-revised"
  source.decisions[0].answer = "North wall only; contractor clarified the extent"
  const selected = snapshotStudySelection(source, "attempt-a:1", ["answer-a-revised"])
  let copy = workingCopy(revision)
  copy = { ...copy, items: [updateDraftItem(copy.items[0], { source: { kind: "study", snapshot: originalSnapshot, freshness: checkStudyFreshness(originalSnapshot, source) } })] }
  assert.equal(calculateDraft(copy).pricedCount, 0)
  assert.throws(() => confirmQuantity(copy.items[0], "owner-a"), /changed/)
  assert.throws(() => importStudySelection(copy, selected, "Room 1"), /already/)

  const replaced = replaceStudySelection(copy, "retained-item", selected)
  assert.equal(replaced.id, copy.id)
  assert.equal(replaced.basedOnRevisionId, revision.id)
  assert.equal(replaced.items.length, 1)
  const next = replaced.items[0]
  assert.equal(next.id, item.id)
  assert.equal(next.location, item.location)
  assert.equal(next.trade, item.trade)
  assert.equal(next.description, item.description)
  assert.equal(next.scopeDecision, item.scopeDecision)
  assert.equal(next.quantity, item.quantity)
  assert.equal(next.unit, item.unit)
  assert.equal(next.measurementBasis, item.measurementBasis)
  assert.deepEqual(next.costs, item.costs)
  assert.equal(next.disposition, "unresolved")
  assert.equal(next.quantityConfirmation, null)
  assert.equal(next.costApproval, null)
  assert.equal(next.source.kind === "study" && next.source.freshness, "current")
  assert.deepEqual(next.source.kind === "study" && next.source.snapshot.decisions.map((decision) => decision.id), ["answer-a-revised"])
  assert.throws(() => importStudySelection(replaced, selected, "Room 1"), /already/)
  assert.equal(calculateDraft(replaced).pricedCount, 0)
  assert.throws(() => confirmQuantity(next, "owner-a"), /included/)
  const included = updateDraftItem(next, { disposition: "included" })
  const confirmed = confirmQuantity(included, "owner-a")
  assert.equal(calculateDraft({ ...replaced, items: [confirmed] }).pricedCount, 0)
  const approved = approveCosts(confirmed, "owner-a")
  const repriced = calculateDraft({ ...replaced, items: [approved] })
  assert.equal(repriced.pricedCount, 1)
  assert.equal(repriced.total, revision.calculation.total)
  assert.deepEqual(revision, historical)
  assert.deepEqual(copy.items[0].source.kind === "study" && copy.items[0].source.snapshot, originalSnapshot)
  selected.decisions[0].answer = "Mutation after selection must not alter the working snapshot"
  assert.equal(next.source.kind === "study" && next.source.snapshot.decisions[0].answer, "North wall only; contractor clarified the extent")
})

test("evidence replacement rejects foreign, unrelated, unchanged, ambiguous and invalid selections", () => {
  const source = study()
  const original = snapshotStudySelection(source, "attempt-a:1", ["answer-a"])
  const value = importStudySelection(draft(), original, "Room 1")
  const itemId = value.items[0].id
  const before = clone(value)
  assert.throws(() => replaceStudySelection(value, itemId, original), /already/)
  source.decisions[0].answer = "Updated contractor answer"
  const changed = snapshotStudySelection(source, "attempt-a:1", ["answer-a"])
  const contentReplacement = replaceStudySelection(value, itemId, changed)
  assert.equal(contentReplacement.items[0].source.kind === "study" && contentReplacement.items[0].source.snapshot.decisions[0].answer, "Updated contractor answer")
  assert.throws(() => replaceStudySelection({ ...value, ownerId: "other-owner" }, itemId, changed), /owner/)
  assert.throws(() => replaceStudySelection(value, "missing-item", changed), /identified/)
  assert.throws(() => replaceStudySelection({ ...value, items: [value.items[0], value.items[0]] }, itemId, changed), /uniquely/)
  assert.throws(() => replaceStudySelection(value, itemId, snapshotStudySelection(source, "attempt-a:2", ["answer-b"])), /exact study and finding/)
  const otherStudy = clone(changed)
  otherStudy.studyId = "other-study"; otherStudy.attempt.studyId = "other-study"
  assert.throws(() => replaceStudySelection(value, itemId, otherStudy), /exact study and finding/)
  const contractor = { ...value, items: [createContractorItem({ id: itemId })] }
  assert.throws(() => replaceStudySelection(contractor, itemId, changed), /exact study and finding/)
  const invalid = clone(changed)
  invalid.finding.citations[0].pageId = "missing-page"
  assert.throws(() => replaceStudySelection(value, itemId, invalid), /Invalid/)
  assert.deepEqual(value, before)
})

test("contractor written scope and approved assumptions remain contractor supplied", () => {
  const written = createContractorItem({ description: "Contractor entered walls", note: "Site instructions" })
  assert.deepEqual(written.source, { kind: "contractor", origin: "written_scope", note: "Site instructions" })
  const assumption = createContractorItem({ origin: "approved_assumption", location: "Room 1", description: "Assumed repaint", quantity: 1, measurementBasis: "Contractor assumption" })
  assert.throws(() => confirmQuantity(assumption, "owner-a"), /decision/)
  assert.doesNotThrow(() => confirmQuantity(updateDraftItem(assumption, { scopeDecision: "I approve this stated scope assumption" }), "owner-a"))
})

test("questions, conflicts, boundaries and assumptions need an explicit contractor scope decision", () => {
  for (const kind of ["question", "conflict", "boundary", "assumption"] as const) {
    const source = study(); source.findings[1].kind = kind
    let item = createStudyItem(snapshotStudySelection(source, "attempt-a:1", []), "Room 1", "item-a")
    item = updateDraftItem(item, { disposition: "included", quantity: 1, unit: "lump_sum", measurementBasis: "Contractor lump sum" })
    assert.throws(() => confirmQuantity(item, "owner-a"), /scope decision/)
    item = updateDraftItem(item, { scopeDecision: "Include the north wall only" })
    assert.doesNotThrow(() => confirmQuantity(item, "owner-a"))
  }
})

test("quantity confirmation and cost approval are independent; cost approval cannot invent a quantity", () => {
  let item = ready()
  item = { ...item, quantityConfirmation: null }
  const ratesOnly = calculateDraft({ ...draft(), items: [item] })
  assert.equal(ratesOnly.items[0].status, "unpriced")
  assert.match(ratesOnly.items[0].reasons.join(" "), /Quantity has not/)
  item = { ...ready(), costApproval: null }
  assert.equal(calculateDraft({ ...draft(), items: [item] }).items[0].status, "unpriced")
})

test("missing cost differs from intentional zero; unknown quantity never becomes zero", () => {
  let item = createContractorItem({ id: "zero-item", description: "No-charge confirmed work", location: "Room 1", quantity: 1, unit: "lump_sum", measurementBasis: "Explicit lump sum" })
  item = updateDraftItem(item, { costs: { unit: "lump_sum", labor: 0, materials: 0, other: null, source: "Contractor no-charge decision" } })
  assert.throws(() => approveCosts(item, "owner-a"), /every direct-cost/)
  item = updateDraftItem(item, { costs: { ...item.costs, other: 0 } })
  item = approveCosts(confirmQuantity(item, "owner-a"), "owner-a")
  assert.equal(calculateDraft({ ...draft(), items: [item] }).items[0].status, "priced")
  assert.equal(calculateDraft({ ...draft(), items: [item] }).total, 0)
  assert.throws(() => confirmQuantity(updateDraftItem(item, { quantity: null }), "owner-a"), /missing/)
})

test("units are explicit; hourly rates cannot multiply area and lump sums require quantity one", () => {
  const base = ready()
  assert.throws(() => approveCosts(updateDraftItem(base, { unit: "sqft", costs: { ...base.costs, unit: "hour" } }), "owner-a"), /unit/)
  assert.throws(() => approveCosts(updateDraftItem(base, { unit: "linear_ft" }), "owner-a"), /unit/)
  assert.throws(() => confirmQuantity(updateDraftItem(base, { quantity: 2 }), "owner-a"), /quantity 1/)
  for (const unit of ["sqft", "linear_ft", "doors", "lump_sum"] as const) {
    const item = ready(createContractorItem({ id: `item-${unit}`, description: "Synthetic work", location: "Room 1", quantity: 1, unit, measurementBasis: "Contractor-entered quantity" }))
    assert.equal(calculateDraft({ ...draft(), items: [item] }).items[0].status, "priced")
  }
})

test("unsupported large products cannot be approved or silently become nonfinite prices", () => {
  let item = createContractorItem({ id: "large", description: "Synthetic range check", location: "Room 1", quantity: 1_000_000_000, measurementBasis: "Synthetic unsupported extent" })
  item = updateDraftItem(item, { costs: { unit: "sqft", labor: 1_000_000_000, materials: 0, other: 0, source: "Synthetic range check" } })
  assert.throws(() => approveCosts(item, "owner-a"), /numeric range/)
  const result = calculateDraft({ ...draft(), items: [item] })
  assert.equal(result.items[0].status, "unpriced")
  assert.equal(result.total, 0)
})

test("scope and quantity edits invalidate both approvals; cost-only edits preserve quantity confirmation", () => {
  const base = ready()
  for (const patch of [
    { description: "Changed scope" }, { location: "Room 2" }, { trade: "wallcovering" }, { quantity: 0 },
    { unit: "doors" as const }, { measurementBasis: "Changed basis" }, { disposition: "excluded" as const },
    { scopeDecision: "Changed decision" },
    { source: { kind: "contractor" as const, origin: "written_scope" as const, note: "Changed instruction" } },
  ]) {
    const item = updateDraftItem(base, patch)
    assert.equal(item.quantityConfirmation, null)
    assert.equal(item.costApproval, null)
  }
  const costEdit = updateDraftItem(base, { costs: { ...base.costs, labor: 700 } })
  assert.deepEqual(costEdit.quantityConfirmation, base.quantityConfirmation)
  assert.equal(costEdit.costApproval, null)
  assert.equal(calculateDraft({ ...draft(), items: [costEdit] }).items[0].status, "unpriced")
  assert.equal(calculateDraft({ ...draft(), items: [approveCosts(costEdit, "owner-a")] }).items[0].status, "priced")
})

test("deterministic totals preserve markup versus margin, tax, deposits and item rollups", () => {
  const result = calculateDraft({ ...draft(), items: [ready()] })
  assert.equal(result.directCost, 1000)
  assert.equal(result.subtotal, 1250)
  assert.equal(result.markupAmount, 250)
  assert.equal(result.marginPct, 20)
  assert.equal(result.taxAmount, 125)
  assert.equal(result.total, 1375)
  assert.equal(result.depositDue, 344)
  assert.equal(result.remaining, 1031)
  assert.equal(result.partial, false)
  assert.equal(result.total, result.subtotal + result.taxAmount + result.roundingAdjustment)
})

test("fractional per-unit costs round each component to cents and expose final whole-dollar adjustment", () => {
  let item = createContractorItem({ id: "fractional", description: "Synthetic fractional work", location: "Room 1", quantity: 2.5, unit: "sqft", measurementBasis: "Confirmed synthetic quantity" })
  item = updateDraftItem(item, { costs: { unit: "sqft", labor: 12.345, materials: 3.333, other: 0, source: "Synthetic approved cost inputs" } })
  item = approveCosts(confirmQuantity(item, "owner-a"), "owner-a")
  const result = calculateDraft({ ...draft(), commercial: { ...commercial, markupPct: 20, taxRate: 8 }, items: [item] })
  assert.equal(result.labor, 30.86)
  assert.equal(result.materials, 8.33)
  assert.equal(result.directCost, 39.19)
  assert.equal(result.subtotal, 47.03)
  assert.equal(result.taxAmount, 3.76)
  assert.equal(result.total, 51)
  assert.equal(result.roundingAdjustment, 0.21)
  assert.equal(Math.round((result.subtotal + result.taxAmount + result.roundingAdjustment) * 100), result.total * 100)
})

test("excluded items stay exclusions; unresolved/missing included inputs produce clearly partial totals", () => {
  const included = ready()
  const excluded = updateDraftItem(createContractorItem({ id: "excluded", description: "Not included" }), { disposition: "excluded" })
  const unresolved = createContractorItem({ id: "unresolved", description: "Needs scope answer", disposition: "unresolved" })
  const result = calculateDraft({ ...draft(), items: [included, excluded, unresolved] })
  assert.equal(result.total, 1375)
  assert.equal(result.partial, true)
  assert.equal(result.pricedCount, 1)
  assert.equal(result.excludedCount, 1)
  assert.equal(result.unresolvedCount, 1)
  assert.deepEqual(result.items[1], { itemId: "excluded", status: "excluded", reasons: [], labor: null, materials: null, other: null, directCost: null })
  assert.equal(calculateDraft(draft()).partial, true)
})

test("saved revision is self-contained; working copies do not mutate it or assume source freshness", () => {
  let item = createStudyItem(snapshotStudySelection(study(), "attempt-a:0", []), "Room 1", "study-item")
  item = updateDraftItem(item, { disposition: "included", quantity: 1, unit: "lump_sum", measurementBasis: "Confirmed contractor lump sum" })
  item = ready(item)
  const savedDraft = { ...draft(), items: [item] }
  const revision: DraftRevision = { schemaVersion: 1, id: "revision-a", draftId: savedDraft.id, parentRevisionId: null, ownerId: savedDraft.ownerId, jobId: savedDraft.job.id, savedAt: 1000, draft: savedDraft, calculation: calculateDraft(savedDraft) }
  const recorded = clone(revision)
  assert.ok(parseDraftRevision(JSON.parse(JSON.stringify(revision))))
  let copy = workingCopy(revision)
  assert.equal(copy.basedOnRevisionId, revision.id)
  assert.equal(copy.items[0].source.kind === "study" && copy.items[0].source.freshness, "unverified")
  assert.ok(copy.items[0].quantityConfirmation)
  assert.ok(copy.items[0].costApproval)
  assert.equal(calculateDraft(copy).partial, true)
  const refreshed = updateDraftItem(copy.items[0], { source: { kind: "study", snapshot: clone(item.source.kind === "study" ? item.source.snapshot : snapshotStudySelection(study(), "attempt-a:0", [])), freshness: "current" } })
  copy = { ...copy, items: [refreshed] }
  assert.equal(calculateDraft(copy).total, recorded.calculation.total)
  const unavailable = updateDraftItem(refreshed, { source: { ...refreshed.source as Extract<DraftItem["source"], { kind: "study" }>, freshness: "unavailable" } })
  assert.ok(unavailable.costApproval)
  assert.equal(calculateDraft({ ...copy, items: [unavailable] }).partial, true)
  const changed = updateDraftItem(refreshed, { source: { ...refreshed.source as Extract<DraftItem["source"], { kind: "study" }>, freshness: "changed" } })
  assert.equal(changed.quantityConfirmation, null)
  assert.equal(changed.costApproval, null)
  copy.items[0].description = "Edited working copy"
  assert.deepEqual(revision, recorded)
})

test("malformed persistence, extra binary fields, changed approval fingerprints and foreign bindings are rejected", () => {
  const value = { ...draft(), items: [ready()] }
  assert.equal(parseDraft({ ...value, schemaVersion: 99 }), null)
  assert.equal(parseDraft({ ...value, items: [...value.items, value.items[0]] }), null)
  assert.equal(parseDraft({ ...value, items: [{ ...value.items[0], costs: { ...value.items[0].costs, labor: -1 } }] }), null)
  assert.equal(parseDraft({ ...value, items: [{ ...value.items[0], description: "Tampered after approval" }] }), null)
  assert.equal(parseDraft({ ...value, ownerId: "other-owner" }), null)
  const sourced = importStudySelection(draft(), snapshotStudySelection(study(), "attempt-a:0", []), "Room 1")
  const binary = clone(sourced) as unknown as { items: Array<{ source: { snapshot: { documentBinary?: string } } }> }
  binary.items[0].source.snapshot.documentBinary = "data:application/pdf;base64,not-allowed"
  assert.equal(parseDraft(binary), null)
  const revision: DraftRevision = { schemaVersion: 1, id: "revision-a", draftId: value.id, parentRevisionId: null, ownerId: value.ownerId, jobId: value.job.id, savedAt: 1000, draft: value, calculation: calculateDraft(value) }
  assert.equal(parseDraftRevision({ ...revision, jobId: "other-job" }), null)
  assert.equal(parseDraftRevision({ ...revision, calculation: { ...revision.calculation, total: 1 } }), null)
  assert.equal(parseDraftRevision({ ...revision, extraField: true }), null)
  assert.equal(parseDraftRevision({ ...revision, parentRevisionId: "revision-other" }), null)
  const partialDraft = { ...draft(), items: [createContractorItem({ id: "partial" })] }
  const partialRevision: DraftRevision = { ...revision, draft: partialDraft, calculation: calculateDraft(partialDraft) }
  const nonfinite = clone(partialRevision)
  nonfinite.calculation.items[0].labor = Number.NaN
  assert.equal(parseDraftRevision(nonfinite), null)
  assert.throws(() => updateDraftItem(value.items[0], { id: "changed-id" }))
  assert.throws(() => updateDraftItem(value.items[0], { costApproval: null }))
})
