import test from "node:test"
import assert from "node:assert/strict"
import { buildPlanReviewSummary } from "./plan-review-summary"
import { buildTradeQuantityCandidates } from "../../api/generate/lib/plans/tradeQuantityCandidates"

const finishRef = { uploadId: "synthetic-plan", sourcePageNumber: 7, pageNumber: 2, sheetNumber: "A-601", sheetTitle: "Finish schedule" }
const ceilingRef = { uploadId: "synthetic-plan", sourcePageNumber: 9, pageNumber: 3, sheetNumber: "A-701", sheetTitle: "Ceiling plan" }
const plan = {
  summary: "Painting scope found in the finish schedule.",
  detectedTrades: ["Painting"],
  detectedRooms: ["Bedrooms"],
  planReadback: {
    headline: "Painting scope found in the finish schedule.",
    groupedScopeReadback: [{ narration: "Bedroom walls have a painted finish.", evidence: [finishRef] }],
    tradeScopeReadback: [{ narration: "Bedroom walls have a painted finish.", evidence: [finishRef] }],
    needsConfirmation: [{ text: "Confirm ceiling finish at the corridor.", evidence: [ceilingRef] }],
  },
  tradeQuantityCandidates: [{
    candidateKey: "paint-rooms", category: "painting finish rows", quantity: 15, unit: "rooms",
    quantityStatus: "needs_measurement", sourceRefs: [finishRef], eligibleForPricing: false,
  }],
}

test("ordinary estimates without associated plans have no summary, including unknown legacy provenance", () => {
  for (const freshness of ["no_plans", "unverified"] as const) {
    assert.equal(buildPlanReviewSummary({ planIntelligence: null, hasCurrentPlans: false, freshness, requiresRegeneration: false }), null)
    assert.equal(buildPlanReviewSummary({ planIntelligence: {}, hasCurrentPlans: false, freshness, requiresRegeneration: false }), null)
  }
})

test("fresh findings retain their own returned sheet references and distinct confirmation evidence", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: plan, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.status, null)
  assert.equal(summary.findings.length, 1)
  assert.deepEqual(summary.findings[0].sources, [finishRef])
  assert.deepEqual(summary.confirmations[0].sources, [ceilingRef])
  assert.equal(summary.confirmations[0].text, "Confirm ceiling finish at the corridor.")
  assert.equal(summary.unresolvedActionCount, 2)
})

test("matching wording on separate affected sheets remains separate", () => {
  const summary = buildPlanReviewSummary({
    planIntelligence: { ...plan, planReadback: { ...plan.planReadback,
      tradeScopeReadback: [{ narration: "Bedroom walls have a painted finish.", evidence: [ceilingRef] }],
    } }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false,
  })!
  assert.equal(summary.findings.length, 2)
})

test("quantity clues retain exact values, units, source and unverified measurement status without pricing fields", () => {
  const before = JSON.stringify(plan)
  const summary = buildPlanReviewSummary({ planIntelligence: plan, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.deepEqual(summary.candidates, [{ key: "paint-rooms", category: "painting finish rows", quantity: 15, unit: "rooms", needsMeasurement: true, sources: [finishRef] }])
  assert.equal("eligibleForPricing" in summary.candidates[0], false)
  assert.equal(JSON.stringify(plan), before)
})

test("changed files, changed sheets, or unverifiable association suppress every earlier finding and quantity", () => {
  for (const freshness of ["stale", "unverified"] as const) {
    for (const hasCurrentPlans of [true, false]) {
      const summary = buildPlanReviewSummary({ planIntelligence: plan, hasCurrentPlans, freshness, requiresRegeneration: freshness === "stale" })!
      assert.match(summary.status!, /Generate again/)
      assert.equal(summary.unresolvedActionCount, 1)
      assert.equal(summary.headline, "")
      for (const items of [summary.findings, summary.confirmations, summary.candidates, summary.tables, summary.trades, summary.rooms]) assert.deepEqual(items, [])
      assert.equal(summary.needsProcessingReview, false)
      assert.doesNotMatch(JSON.stringify(summary), /A-601|A-701|paint-rooms|Bedroom/)
    }
  }
})

test("current selection cannot invent analysis coverage or supply evidence for an unrelated returned finding", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { ...plan,
    pageReadStatuses: [{ ...ceilingRef, selected: true, textStatus: "extracted", imageStatus: "rendered", classificationStatus: "classified", failureReasons: [], warnings: [] }],
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.deepEqual(summary.findings[0].sources, [finishRef])
  assert.equal("processedPagesCount" in summary, false)
  assert.equal("coverage" in summary, false)

  const noResults = buildPlanReviewSummary({ planIntelligence: null, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(noResults.headline, "")
  assert.deepEqual(noResults.findings, [])
  assert.deepEqual(noResults.candidates, [])
})

test("missing quantity and source stay unknown rather than becoming zero or a fabricated reference", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { tradeQuantityCandidates: [{ ...plan.tradeQuantityCandidates[0], quantity: null, unit: "unknown", sourceRefs: [{}] }] }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.candidates[0].quantity, null)
  assert.equal(summary.candidates[0].unit, "unknown")
  assert.deepEqual(summary.candidates[0].sources, [])
})

test("review-only classification is not an additional action on top of its quantity verification", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { ...plan,
    evidenceStrength: { level: "review_only", skippedPagesCount: 0 },
    tradeQuantityCandidates: [plan.tradeQuantityCandidates[0], plan.tradeQuantityCandidates[0]],
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.candidates.length, 1)
  assert.equal(summary.needsProcessingReview, false)
  assert.equal(summary.unresolvedActionCount, 2)
})

test("a returned failed-sheet processing issue remains separate from a quantity confirmation", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { ...plan,
    pageReadStatuses: [{ ...ceilingRef, selected: true, textStatus: "failed", imageStatus: "failed", classificationStatus: "unknown", failureReasons: ["PDF page did not render."], warnings: [] }],
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.needsProcessingReview, true)
  assert.equal(summary.unresolvedActionCount, 3)
})

test("deliberately unselected sheets and transport-only notes do not add review actions", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { ...plan,
    evidenceStrength: { level: "useful", skippedPagesCount: 9 },
    pageReadStatuses: [{ ...ceilingRef, selected: true, textStatus: "extracted", imageStatus: "rendered", classificationStatus: "classified", failureReasons: [], warnings: ["Selected PDF pages were reduced for upload."] }],
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.needsProcessingReview, false)
  assert.equal(summary.unresolvedActionCount, 2)
})

test("returned review-only processing without readable findings retains one verification action", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: {
    evidenceStrength: { level: "review_only", skippedPagesCount: 0 },
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.needsProcessingReview, true)
  assert.equal(summary.unresolvedActionCount, 1)
})

test("a literal quantity confirmation and candidate on the same sheets form one action", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { ...plan,
    planReadback: { ...plan.planReadback, needsConfirmation: [
      { text: "Verify bedroom area.", evidence: [finishRef] },
      { text: "Verify ceiling height.", evidence: [finishRef] },
    ] },
    tradeQuantityCandidates: [{ ...plan.tradeQuantityCandidates[0], category: "bedroom area", unit: "sf", sourceRefs: [finishRef] }],
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.unresolvedActionCount, 2)
  assert.deepEqual(summary.confirmations.map((item) => item.text), ["Verify ceiling height."])
})

test("different quantity conditions or affected sources remain independent actions", () => {
  const summary = buildPlanReviewSummary({ planIntelligence: { ...plan,
    planReadback: { ...plan.planReadback, needsConfirmation: [
      { text: "Verify bedroom area.", evidence: [ceilingRef] },
      { text: "Verify bedroom area and ceiling height.", evidence: [finishRef] },
    ] },
    tradeQuantityCandidates: [{ ...plan.tradeQuantityCandidates[0], category: "bedroom area", unit: "sf" }],
  }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.equal(summary.unresolvedActionCount, 3)
  assert.equal(summary.confirmations.length, 2)
})

test("equal real producer quantities from independent tables remain independently unverified", () => {
  const tables = [0, 1].map((index) => ({
    tableType: "door_schedule" as const,
    columns: ["Door", "Qty"],
    rows: [{ rowIndex: 1, cells: [index ? "East wing doors" : "West wing doors", "3"], rawText: "3 doors", confidence: 90, warnings: [] }],
    rawText: "3 doors", uploadId: "synthetic-plan", uploadName: "Door schedules.pdf",
    pageNumber: 1, sourcePageNumber: 1, sheetNumber: "A601", sheetTitle: "Door schedules",
    confidence: 90, extractionMethod: "deterministic" as const, warnings: [],
  }))
  const candidates = buildTradeQuantityCandidates({ extractedTables: tables, roomFinishMatrices: [], repeatedRoomPackages: [] })
  assert.equal(candidates.length, 2)
  const summary = buildPlanReviewSummary({ planIntelligence: { tradeQuantityCandidates: candidates }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.deepEqual(summary.candidates.map((item) => item.key), candidates.map((item) => item.candidateKey))
  assert.deepEqual(summary.candidates.map((item) => item.quantity), [3, 3])
  assert.deepEqual(summary.candidates.map((item) => item.sources[0].sourceTableIndex), [0, 1])
  assert.equal(summary.unresolvedActionCount, 2)
  assert.equal(summary.candidates.some((item) => "eligibleForPricing" in item), false)
})

test("table, matrix, row, and upload provenance distinguish candidates even when producer keys collide", () => {
  for (const difference of [
    { sourceTableIndex: 1 }, { sourceMatrixIndex: 1 }, { rowIndex: 2 },
    { uploadId: "other-plan" }, { uploadName: "Other schedule.pdf" },
    { sourcePageNumber: 8 }, { pageNumber: 3 },
  ]) {
    const ref = { ...finishRef, uploadName: "Schedule.pdf", sourceTableIndex: 0, sourceMatrixIndex: 0, rowIndex: 1 }
    const candidate = { ...plan.tradeQuantityCandidates[0], sourceRefs: [ref] }
    const summary = buildPlanReviewSummary({ planIntelligence: { tradeQuantityCandidates: [candidate, { ...candidate, sourceRefs: [{ ...ref, ...difference }] }] }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
    assert.equal(summary.candidates.length, 2, JSON.stringify(difference))
    assert.equal(summary.unresolvedActionCount, 2, JSON.stringify(difference))
    assert.equal(new Set(summary.candidates.map((item) => item.key)).size, 2)
    assert.deepEqual(summary.candidates[1].sources, [{ ...ref, ...difference }])
  }
})

test("distinct producer keys remain distinct and only fully matching identified candidates consolidate", () => {
  const candidate = { ...plan.tradeQuantityCandidates[0], sourceType: "finish_matrix", trade: "painting", sourceRefs: [{ ...finishRef, sourceMatrixIndex: 0, sourceTableIndex: 0, rowIndex: 1 }] }
  const summary = buildPlanReviewSummary({ planIntelligence: { tradeQuantityCandidates: [candidate, { ...candidate }, { ...candidate, candidateKey: "other-paint-rooms" }] }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
  assert.deepEqual(summary.candidates.map((item) => item.key), ["paint-rooms", "other-paint-rooms"])
  assert.equal(summary.unresolvedActionCount, 2)
})

test("missing producer identity or locatable source provenance retains equal candidates separately", () => {
  for (const candidate of [
    { ...plan.tradeQuantityCandidates[0], candidateKey: "" },
    { ...plan.tradeQuantityCandidates[0], sourceRefs: [] },
    { ...plan.tradeQuantityCandidates[0], sourceRefs: [{ sourceTableIndex: 0, rowIndex: 1 }] },
  ]) {
    const summary = buildPlanReviewSummary({ planIntelligence: { tradeQuantityCandidates: [candidate, { ...candidate }] }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
    assert.equal(summary.candidates.length, 2)
    assert.equal(summary.unresolvedActionCount, 2)
    assert.equal(new Set(summary.candidates.map((item) => item.key)).size, 2)
    assert.deepEqual(summary.candidates[0].sources, candidate.sourceRefs)
  }
})

test("unlocated table, matrix, and row provenance is preserved and cannot be hidden by a common sheet reference", () => {
  const commonRef = { pageNumber: 1, sheetNumber: "A601" }
  for (const provenance of [
    [{ sourceTableIndex: 0, rowIndex: 1 }, { sourceTableIndex: 1, rowIndex: 1 }],
    [{ sourceMatrixIndex: 0, rowIndex: 1 }, { sourceMatrixIndex: 1, rowIndex: 1 }],
    [{ sourceTableIndex: 0, rowIndex: 1 }, { sourceTableIndex: 0, rowIndex: 2 }],
  ]) {
    const sourceRefs = provenance.map((ref) => [commonRef, ref])
    const summary = buildPlanReviewSummary({ planIntelligence: {
      tradeQuantityCandidates: sourceRefs.map((refs) => ({ ...plan.tradeQuantityCandidates[0], sourceRefs: refs })),
    }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
    assert.equal(summary.candidates.length, 2)
    assert.equal(summary.unresolvedActionCount, 2)
    assert.deepEqual(summary.candidates.map((item) => item.sources), sourceRefs)
    assert.equal(new Set(summary.candidates.map((item) => item.key)).size, 2)
  }
})

test("unlocated or unknown source entries do not provide enough identity to consolidate equal candidates", () => {
  for (const extraRef of [{ sourceTableIndex: 0, rowIndex: 1 }, {}]) {
    const candidate = { ...plan.tradeQuantityCandidates[0], sourceRefs: [finishRef, extraRef] }
    const summary = buildPlanReviewSummary({ planIntelligence: { tradeQuantityCandidates: [candidate, { ...candidate }] }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
    assert.equal(summary.candidates.length, 2)
    assert.equal(summary.unresolvedActionCount, 2)
  }
})

test("quantity confirmations without matching upload and row provenance remain separate", () => {
  for (const sourceRefs of [
    [{ sourcePageNumber: 7, pageNumber: 2, sheetNumber: "A-601", sheetTitle: "Finish schedule" }],
    [{ ...finishRef, uploadId: "other-plan" }],
    [{ ...finishRef, sourceTableIndex: 0, rowIndex: 1 }],
  ]) {
    const summary = buildPlanReviewSummary({ planIntelligence: {
      planReadback: { headline: "Quantity needs verification", needsConfirmation: [{ text: "Verify bedroom area.", evidence: [finishRef] }] },
      tradeQuantityCandidates: [{ ...plan.tradeQuantityCandidates[0], category: "bedroom area", sourceRefs }],
    }, hasCurrentPlans: true, freshness: "current", requiresRegeneration: false })!
    assert.equal(summary.confirmations.length, 1)
    assert.equal(summary.unresolvedActionCount, 2)
  }
})
