import test from "node:test"
import assert from "node:assert/strict"
import {
  captureEstimateRevision,
  normalizeComparisonPricing,
  normalizeComparisonPricingSource,
  normalizeComparisonTax,
  normalizeEstimateRevisionRelationship,
  reconcileComparisonPricing,
  reconcileComparisonTax,
  resolveEstimateRevisionBaseline,
} from "./estimate-revision"
import type { EstimateHistoryItem } from "./types"

const context = { ownerId: "synthetic-owner", jobId: "synthetic-job", documentType: "Estimate" }

function estimate(overrides: Partial<EstimateHistoryItem> = {}): EstimateHistoryItem {
  return {
    id: "immediate-previous-draft",
    createdAt: 12,
    jobId: context.jobId,
    documentType: "Estimate",
    jobDetails: { clientName: "QA", jobName: "QA painting", jobAddress: "", changeOrderNo: "", date: "" },
    trade: "general_renovation",
    state: "CA",
    scopeChange: "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats.",
    result: "This estimate covers painting.",
    pricing: { labor: 4000, materials: 1300, subs: 215.83, markup: 20, total: 6619 },
    pricingSource: "ai",
    schedule: { crewDays: 3, visits: 2, calendarDays: { min: 3, max: 5 }, workDaysPerWeek: 5, rationale: ["Drying"] },
    tax: { enabled: false, rate: 0 },
    deposit: { enabled: true, type: "percent", value: 20 },
    explanation: { priceReasons: ["AI estimate"] },
    approval: { status: "approved", approvedBy: "Do not capture" },
    ...overrides,
  }
}

test("captures exactly the explicit previous saved Estimate without approval or recursive relationships", () => {
  const previous = estimate()
  previous.revisionRelationship = captureEstimateRevision({ ...context, previous: estimate({ id: "earlier-draft" }) })!
  const relation = captureEstimateRevision({ ...context, previous })
  assert.ok(relation)
  assert.equal(relation.previousEstimateId, previous.id)
  assert.equal(relation.baseline.id, previous.id)
  assert.deepEqual(relation.baseline.pricing, previous.pricing)
  assert.equal(relation.baseline.pricingSource, "ai")
  assert.equal("approval" in relation.baseline, false)
  assert.equal("revisionRelationship" in relation.baseline, false)
  assert.doesNotMatch(JSON.stringify(relation), /earlier-draft/)
})

test("first generation, uncertain purposes, and incompatible jobs have no inferred baseline", () => {
  assert.equal(captureEstimateRevision({ ...context, previous: null }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: undefined }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: estimate({ jobId: "another-job" }) }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: estimate({ jobId: undefined }) }), null)
  assert.equal(captureEstimateRevision({ ...context, ownerId: "", previous: estimate() }), null)
  assert.equal(captureEstimateRevision({ ...context, jobId: "", previous: estimate() }), null)
  assert.equal(captureEstimateRevision({ ...context, jobId: 12 as unknown as string, previous: estimate() }), null)
  assert.equal(normalizeEstimateRevisionRelationship({ ...context, ownerId: {} as string, relationship: {} }), null)
  assert.equal(captureEstimateRevision({ ...context, documentType: "Change Order", previous: estimate() }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: estimate({ documentType: "Change Order" }) }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: estimate({ documentType: "Change Order / Estimate" }) }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: { ...estimate(), revisionEligible: false } }), null)
  assert.equal(captureEstimateRevision({ ...context, previous: estimate({ id: "" }) }), null)
  const numbered = estimate()
  numbered.jobDetails.changeOrderNo = "CO-2"
  assert.equal(captureEstimateRevision({ ...context, previous: numbered }), null)
})

test("captured cost and supporting values remain immutable without freezing the caller", () => {
  const previous = estimate()
  const relation = captureEstimateRevision({ ...context, previous })!
  previous.pricing.labor = 1
  previous.tax!.rate = 50
  previous.schedule!.calendarDays!.max = 100
  previous.schedule!.rationale.push("Changed later")
  previous.explanation!.priceReasons!.push("Changed later")
  assert.equal(relation.baseline.pricing.labor, 4000)
  assert.equal(relation.baseline.tax!.rate, 0)
  assert.equal(relation.baseline.schedule!.calendarDays!.max, 5)
  assert.deepEqual(relation.baseline.schedule!.rationale, ["Drying"])
  assert.deepEqual(relation.baseline.explanation!.priceReasons, ["AI estimate"])
  assert.throws(() => { relation.baseline.pricing.labor = 2 }, TypeError)
  assert.throws(() => { relation.baseline.schedule!.rationale.push("Mutate baseline") }, TypeError)
  assert.throws(() => { relation.previousEstimateId = "different" }, TypeError)
  assert.equal(Object.isFrozen(previous), false)
})

test("JSON persistence and reopening restore the same immediate draft even without its history row", () => {
  const relation = captureEstimateRevision({ ...context, previous: estimate() })!
  const reopened = JSON.parse(JSON.stringify({ id: "revision", revisionRelationship: relation }))
  const baseline = resolveEstimateRevisionBaseline({ ...context, relationship: reopened.revisionRelationship })!
  assert.equal(baseline.id, "immediate-previous-draft")
  assert.equal(baseline.pricing.total, 6619)
  assert.equal(baseline.pricingSource, "ai")
  assert.equal(Object.isFrozen(baseline.pricing), true)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, relationship: undefined }), null)
})

test("reopening rejects another owner, job, purpose, version, or mismatched baseline identity", () => {
  const relationship = captureEstimateRevision({ ...context, previous: estimate() })!
  assert.equal(resolveEstimateRevisionBaseline({ ...context, ownerId: "next-owner", relationship }), null)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, jobId: "another-job", relationship }), null)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, documentType: "Change Order", relationship }), null)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, relationship: { ...relationship, version: 2 } }), null)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, relationship: { ...relationship, previousEstimateId: "wrong" } }), null)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, relationship: { ...relationship, baseline: { ...relationship.baseline, jobId: "another-job" } } }), null)
  assert.equal(resolveEstimateRevisionBaseline({ ...context, relationship: { ...relationship, baseline: { ...relationship.baseline, documentType: "Change Order" } } }), null)
  assert.equal(normalizeEstimateRevisionRelationship({ ...context, relationship: "malformed" }), null)
})

test("unknown costs stay unknown through capture and reload while genuine zero stays zero", () => {
  const previous = estimate({ pricing: { materials: 0 } as EstimateHistoryItem["pricing"] })
  const relationship = captureEstimateRevision({ ...context, previous })!
  const reopened = normalizeEstimateRevisionRelationship({ ...context, relationship: JSON.parse(JSON.stringify(relationship)) })!
  assert.equal(reopened.baseline.pricing.materials, 0)
  assert.equal(reopened.baseline.pricing.labor, undefined)
  assert.equal(reopened.baseline.pricing.subs, undefined)
  assert.equal(reopened.baseline.pricing.markup, undefined)
  assert.equal(reopened.baseline.pricing.total, undefined)
})

test("comparison normalization retains missing costs separately from legacy zero display values", () => {
  const raw = { labor: 1200, materials: 0, subs: undefined, markup: null, total: Number.NaN }
  assert.deepEqual(normalizeComparisonPricing(raw), { labor: 1200, materials: 0, subs: null, markup: null, total: null })
  const display = { labor: 1200, materials: 0, subs: 0, markup: 0, total: 1200 }
  const comparisonPricing = normalizeComparisonPricing(raw)
  assert.deepEqual(normalizeComparisonPricing(display, comparisonPricing), comparisonPricing)
  const previous = estimate({ pricing: display }) as EstimateHistoryItem & { comparisonPricing: typeof comparisonPricing }
  previous.comparisonPricing = comparisonPricing
  const relationship = captureEstimateRevision({ ...context, previous })!
  const reopened = resolveEstimateRevisionBaseline({ ...context, relationship: JSON.parse(JSON.stringify(relationship)) })!
  assert.deepEqual((reopened as typeof previous).comparisonPricing, comparisonPricing)
  assert.equal(reopened.pricing.subs, 0)
  assert.equal(Object.isFrozen((reopened as typeof previous).comparisonPricing), true)
})

test("pricing edits establish changed finite costs without confirming unchanged display fallback zeroes", () => {
  const previous = estimate({ pricing: { labor: 1200, materials: 0, subs: 0, markup: 0, total: 1200 } }) as EstimateHistoryItem & { comparisonPricing: ReturnType<typeof normalizeComparisonPricing> }
  previous.comparisonPricing = { labor: 1200, materials: 0, subs: null, markup: null, total: null }
  assert.deepEqual(reconcileComparisonPricing(previous, previous.pricing), previous.comparisonPricing)
  assert.deepEqual(reconcileComparisonPricing(previous, { ...previous.pricing, labor: 1500, subs: 90 }), {
    labor: 1500, materials: 0, subs: 90, markup: null, total: null,
  })
  assert.deepEqual(reconcileComparisonPricing(previous, { ...previous.pricing, materials: Number.NaN }), {
    labor: 1200, materials: null, subs: null, markup: null, total: null,
  })
  assert.deepEqual(previous.comparisonPricing, { labor: 1200, materials: 0, subs: null, markup: null, total: null })
})

test("automatic total changes require known component inputs while unchanged quoted totals remain recorded", () => {
  const partial = estimate({ pricing: { labor: 1200, materials: 0, subs: 0, markup: 0, total: 6619 } })
  partial.comparisonPricing = { labor: 1200, materials: 0, subs: null, markup: null, total: 6619 }
  assert.equal(reconcileComparisonPricing(partial, partial.pricing).total, 6619)
  const autocalculated = { ...partial.pricing, total: 1200 }
  assert.equal(reconcileComparisonPricing(partial, autocalculated).total, null)
  assert.deepEqual(partial.comparisonPricing, { labor: 1200, materials: 0, subs: null, markup: null, total: 6619 })

  const complete = estimate({ pricing: { labor: 1000, materials: 200, subs: 0, markup: 20, total: 1440 } })
  assert.deepEqual(reconcileComparisonPricing(complete, { ...complete.pricing, labor: 1200, total: 1680 }), {
    labor: 1200, materials: 200, subs: 0, markup: 20, total: 1680,
  })
})

test("unknown tax and pricing source survive display defaults, autosave, capture and JSON reopening", () => {
  const raw = estimate({ tax: undefined, pricingSource: undefined })
  const normalized = estimate({
    tax: { enabled: false, rate: 7.75 }, pricingSource: "ai",
    comparisonTax: normalizeComparisonTax(raw.tax),
    comparisonPricingSource: normalizeComparisonPricingSource(raw.pricingSource),
  })
  const comparisonTax = reconcileComparisonTax(normalized, normalized.tax, normalized.tax)
  assert.deepEqual(comparisonTax, { enabled: null, rate: null })
  assert.equal(normalizeComparisonPricingSource("ai", null), null)
  assert.equal(normalizeComparisonPricingSource("merged"), "merged")
  assert.equal(normalizeComparisonPricingSource("approved company"), null)
  const saved = { ...normalized, comparisonTax }
  const relationship = captureEstimateRevision({ ...context, previous: saved })!
  const reopened = resolveEstimateRevisionBaseline({ ...context, relationship: JSON.parse(JSON.stringify(relationship)) })!
  assert.deepEqual(reopened.comparisonTax, { enabled: null, rate: null })
  assert.equal(reopened.comparisonPricingSource, null)
  assert.equal(Object.isFrozen(reopened.comparisonTax), true)
  assert.equal(reconcileComparisonPricing(saved, { ...saved.pricing, total: 999 }).total, null)
})

test("unknown enabled tax rates stay unknown until an explicit setting changes", () => {
  const previous = estimate({
    tax: { enabled: true, rate: 0 },
    comparisonTax: normalizeComparisonTax({ enabled: true }),
  })
  assert.deepEqual(reconcileComparisonTax(previous, previous.tax, previous.tax), { enabled: true, rate: null })
  assert.deepEqual(reconcileComparisonTax(previous, { enabled: true, rate: 8.5 }, previous.tax), { enabled: true, rate: 8.5 })
  assert.deepEqual(reconcileComparisonTax(previous, { enabled: false, rate: 0 }, previous.tax), { enabled: false, rate: null })
  const absent = estimate({ tax: undefined, comparisonTax: { enabled: null, rate: null } })
  assert.deepEqual(reconcileComparisonTax(absent, { enabled: true, rate: 7.75 }, { enabled: false, rate: 7.75 }), { enabled: true, rate: 7.75 })
  assert.deepEqual(reconcileComparisonTax(absent, { enabled: false, rate: 7.75 }, { enabled: false, rate: 7.75 }), { enabled: null, rate: null })
  assert.deepEqual(normalizeComparisonTax({ enabled: true, rate: 8.5 }, { enabled: null, rate: null }), { enabled: null, rate: null })
})
