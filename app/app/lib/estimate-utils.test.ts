import test from "node:test"
import assert from "node:assert/strict"
import { explainEstimateChanges, estimateSubtotalBeforeTax, estimateTotalWithTax } from "./estimate-utils"
import type { EstimateHistoryItem } from "./types"

function estimate(id: string, patch: Partial<EstimateHistoryItem> = {}): EstimateHistoryItem {
  return {
    id, createdAt: 1, jobId: "synthetic-job", documentType: "Estimate",
    jobDetails: { clientName: "", jobName: "QA painting", jobAddress: "", changeOrderNo: "", date: "" },
    trade: "general_renovation", state: "CA",
    scopeChange: "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats.",
    result: "Synthetic proposal", pricing: { labor: 600, materials: 300, subs: 100, markup: 25, total: 1250 },
    pricingSource: "ai", tax: { enabled: false, rate: 0 }, ...patch,
  }
}
function rows(previous: EstimateHistoryItem, revised: EstimateHistoryItem) {
  return Object.fromEntries(explainEstimateChanges(previous, revised)!.pricingRows.map((row) => [row.key, row]))
}

test("previously reported AI-generated QA prices show category changes and a $2,800 / 42.3% decrease without assigning a cause", () => {
  // Previously reported AI-generated deployed-QA output, reused as synthetic
  // comparison inputs. These are not approved company costs or independently
  // recovered database evidence.
  const previous = estimate("before", { pricing: { labor: 3200, materials: 1920, subs: 175, markup: 25, total: 6619 } })
  const revised = estimate("after", {
    pricing: { labor: 1800, materials: 1080, subs: 175, markup: 25, total: 3819 },
    scopeChange: previous.scopeChange + " Contractor will supply the main materials and fixtures listed in this scope.",
    explanation: { priceReasons: ["Supplier responsibility is now clear."] },
  })
  const report = explainEstimateChanges(previous, revised)!
  const total = report.pricingRows.find((row) => row.key === "total")!
  const comparison = Object.fromEntries(report.pricingRows.map((row) => [row.key, row]))
  assert.deepEqual([comparison.labor.previous, comparison.labor.revised, comparison.labor.delta], [3200, 1800, -1400])
  assert.deepEqual([comparison.materials.previous, comparison.materials.revised, comparison.materials.delta], [1920, 1080, -840])
  assert.deepEqual([comparison.subs.previous, comparison.subs.revised, comparison.subs.delta], [175, 175, 0])
  assert.deepEqual([comparison.markupRate.previous, comparison.markupRate.revised, comparison.markupRate.delta], [25, 25, 0])
  assert.deepEqual([comparison.markupAmount.previous, comparison.markupAmount.revised, comparison.markupAmount.delta], [1324, 764, -560])
  assert.deepEqual([comparison.taxAmount.previous, comparison.taxAmount.revised, comparison.taxAmount.delta], [0, 0, 0])
  assert.deepEqual([total.previous, total.revised, total.delta], [6619, 3819, -2800])
  assert.equal(report.totalPercentChange, -42.3)
  assert.match(report.priceReasonStatus, /No supporting reason.*was recorded/)
  assert.doesNotMatch([...report.summary, ...report.scopeChanges, ...report.pricingChanges, report.priceReasonStatus].join(" "), /appears to include added work|caused|because|approved company/i)
  assert.deepEqual(report.pricingSources, { previous: "ai", revised: "ai" })
})

test("all pricing rows remain visible when prices are identical", () => {
  const report = explainEstimateChanges(estimate("before"), estimate("after"))!
  assert.equal(report.pricingRows.length, 8)
  assert.ok(report.pricingRows.every((row) => row.delta === 0))
  assert.equal(report.totalPercentChange, 0)
  assert.deepEqual(report.pricingChanges, ["The total price is unchanged."])
  assert.ok(report.summary.includes("Known pricing values are unchanged."))
})

test("missing cost values are unknown instead of zero and a recorded total is explicitly identified", () => {
  const missing = estimate("before", {
    pricing: { labor: undefined, materials: null, subs: Number.NaN, markup: undefined, total: 1500 } as unknown as EstimateHistoryItem["pricing"],
    tax: undefined, pricingSource: undefined,
  })
  const report = explainEstimateChanges(missing, estimate("after"))!
  for (const key of ["labor", "materials", "subs", "markupAmount", "markupRate", "taxAmount", "taxRate"]) {
    const row = report.pricingRows.find((item) => item.key === key)!
    assert.equal(row.previous, null, key)
    assert.equal(row.delta, null, key)
  }
  assert.equal(report.pricingRows.find((row) => row.key === "total")!.previous, 1500)
  assert.ok(report.pricingNotes.some((note) => note.includes("Previous total is the recorded quoted total")))
  assert.ok(report.pricingNotes.some((note) => note.includes("not treated as zero")))
  assert.equal(report.pricingSources.previous, null)
  assert.deepEqual(report.adminChanges, [])
})

test("missing totals and invalid numbers never become a confirmed zero total or invalid percentage", () => {
  for (const unknown of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
    const missing = estimate("before", {
      pricing: { labor: unknown, materials: 0, subs: 0, markup: 0, total: unknown } as unknown as EstimateHistoryItem["pricing"],
      tax: undefined,
    })
    const report = explainEstimateChanges(missing, estimate("after"))!
    assert.equal(report.pricingRows.find((row) => row.key === "total")!.previous, null)
    assert.equal(report.totalPercentChange, null)
  }
})

test("saved availability metadata preserves unknowns despite editable legacy zero defaults", () => {
  const previous = estimate("before", {
    pricing: { labor: 0, materials: 0, subs: 0, markup: 0, total: 0 },
    comparisonPricing: { labor: null, materials: null, subs: null, markup: null, total: 1500 },
  })
  const comparison = rows(previous, estimate("after"))
  assert.equal(comparison.labor.previous, null)
  assert.equal(comparison.materials.previous, null)
  assert.equal(comparison.subs.previous, null)
  assert.equal(comparison.markupAmount.previous, null)
  assert.equal(comparison.markupRate.previous, null)
  assert.equal(comparison.total.previous, 1500)
  previous.comparisonPricing!.total = null
  assert.equal(rows(previous, estimate("after")).total.previous, null)
})

test("explicit known zeros and complete metadata remain authoritative for canonical reconstruction", () => {
  const previous = estimate("before", {
    comparisonPricing: { labor: 0, materials: 0, subs: 0, markup: 0, total: 0 },
  })
  const comparison = rows(previous, estimate("after"))
  assert.equal(comparison.labor.previous, 0)
  assert.equal(comparison.materials.previous, 0)
  assert.equal(comparison.subs.previous, 0)
  assert.equal(comparison.markupAmount.previous, 0)
  assert.equal(comparison.markupRate.previous, 0)
  assert.equal(comparison.total.previous, 0)
  assert.equal(explainEstimateChanges(previous, estimate("after"))!.totalPercentChange, null)
  previous.comparisonPricing = { labor: 123.45, materials: 34.56, subs: 1.23, markup: 10.5, total: 99999 }
  previous.tax = { enabled: true, rate: 7.75 }
  const complete = rows(previous, estimate("after"))
  assert.equal(complete.labor.previous, 123.45)
  assert.equal(complete.markupAmount.previous, 16.76)
  assert.equal(complete.taxAmount.previous, 14)
  assert.equal(complete.total.previous, 190)
})

test("a genuine zero baseline permits dollar changes but not a percentage change", () => {
  const zero = estimate("before", { pricing: { labor: 0, materials: 0, subs: 0, markup: 0, total: 0 } })
  const report = explainEstimateChanges(zero, estimate("after"))!
  assert.equal(report.totalPercentChange, null)
  assert.equal(report.pricingRows.find((row) => row.key === "total")!.delta, 1250)
  assert.ok(report.pricingNotes.some((note) => note.includes("zero previous total")))
  assert.equal(explainEstimateChanges(zero, zero), null)
})

test("finite extreme amounts cannot produce infinite deltas or percentage changes", () => {
  function recorded(id: string, total: number) {
    return estimate(id, {
      comparisonPricing: { labor: null, materials: null, subs: null, markup: null, total },
    })
  }
  const overflowDelta = explainEstimateChanges(recorded("before", -1e308), recorded("after", 1e308))!
  assert.equal(overflowDelta.pricingRows.find((row) => row.key === "total")!.delta, null)
  assert.equal(overflowDelta.totalPercentChange, null)
  assert.ok(overflowDelta.pricingNotes.some((note) => note.includes("numerical delta is unavailable")))
  const overflowPercent = explainEstimateChanges(recorded("before", 1e-308), recorded("after", 1e308))!
  assert.equal(overflowPercent.pricingRows.find((row) => row.key === "total")!.delta, 1e308)
  assert.equal(overflowPercent.totalPercentChange, null)
  assert.ok(overflowPercent.pricingNotes.some((note) => note.includes("percentage change is unavailable")))
  assert.ok(overflowPercent.pricingRows.every((row) => row.delta == null || Number.isFinite(row.delta)))
})

test("markup dollars, percentage points, tax and total use existing customer-total rounding", () => {
  const previous = estimate("before", { pricing: { labor: 123.45, materials: 34.56, subs: 1.23, markup: 10.5, total: 99999 }, tax: { enabled: true, rate: 7.75 } })
  const revised = estimate("after", { ...previous, id: "after", pricing: { ...previous.pricing, markup: 20 }, tax: { enabled: true, rate: 8.5 } })
  const comparison = rows(previous, revised)
  assert.deepEqual([comparison.total.previous, comparison.total.revised], [estimateTotalWithTax(previous), estimateTotalWithTax(revised)])
  assert.deepEqual([comparison.total.previous, comparison.total.revised, comparison.total.delta], [190, 207, 17])
  assert.deepEqual([comparison.markupRate.previous, comparison.markupRate.revised, comparison.markupRate.delta, comparison.markupRate.unit], [10.5, 20, 9.5, "percentage_points"])
  assert.deepEqual([comparison.markupAmount.previous, comparison.markupAmount.revised, comparison.markupAmount.delta], [16.76, 31.76, 15])
  assert.deepEqual([comparison.taxAmount.previous, comparison.taxAmount.revised, comparison.taxAmount.delta], [190 - estimateSubtotalBeforeTax(previous), 207 - estimateSubtotalBeforeTax(revised), 2])
  assert.equal(comparison.taxRate.delta, 0.75)
  assert.match(explainEstimateChanges(previous, revised)!.pricingChanges.join(" "), /\+9.5 percentage points/)
})

test("tax disabled is a known zero; unavailable tax settings stay unknown", () => {
  const disabled = estimate("before", { tax: { enabled: false, rate: Number.NaN } })
  const unknown = estimate("after", { tax: { enabled: true, rate: undefined } as unknown as EstimateHistoryItem["tax"] })
  const comparison = rows(disabled, unknown)
  assert.equal(comparison.taxAmount.previous, 0)
  assert.equal(comparison.taxRate.previous, 0)
  assert.equal(comparison.taxAmount.revised, null)
  assert.equal(comparison.taxRate.revised, null)
  assert.equal(comparison.taxAmount.delta, null)
})

test("saved unknown tax provenance cannot become confirmed zero from reopened display defaults", () => {
  const previous = estimate("before", {
    tax: { enabled: false, rate: 7.75 },
    comparisonTax: { enabled: null, rate: null },
    pricing: { labor: 600, materials: 300, subs: 100, markup: 25, total: 1400 },
    pricingSource: "ai", comparisonPricingSource: null,
  })
  const revised = estimate("after", { comparisonTax: { enabled: true, rate: null } })
  const report = explainEstimateChanges(previous, revised)!
  const comparison = Object.fromEntries(report.pricingRows.map((row) => [row.key, row]))
  assert.equal(comparison.taxAmount.previous, null)
  assert.equal(comparison.taxRate.previous, null)
  assert.equal(comparison.taxAmount.revised, null)
  assert.equal(comparison.taxRate.revised, null)
  assert.equal(comparison.total.previous, 1400)
  assert.ok(report.pricingNotes.some((note) => note.includes("Previous total is the recorded quoted total")))
  assert.equal(report.pricingSources.previous, null)
  assert.equal(explainEstimateChanges(null, previous)!.pricingSources.revised, null)
  assert.deepEqual(report.adminChanges, [])
})

test("comparison is pure, preserves source labels and still supports Change Order pairs", () => {
  const previous = estimate("before", { documentType: "Estimate", pricingSource: "deterministic" })
  const revised = estimate("after", { documentType: "Change Order", pricingSource: "merged" })
  const before = structuredClone([previous, revised])
  const report = explainEstimateChanges(previous, revised)!
  assert.deepEqual([previous, revised], before)
  assert.deepEqual(report.pricingSources, { previous: "deterministic", revised: "merged" })
  assert.equal(report.pricingRows.find((row) => row.key === "total")!.delta, 0)
})

test("first generation, absent baseline and same snapshot have no invented comparison", () => {
  const current = estimate("current")
  const unavailable = explainEstimateChanges(null, current)!
  assert.deepEqual(unavailable.pricingRows, [])
  assert.match(unavailable.summary[0], /No reliable previous saved Estimate/)
  assert.equal(explainEstimateChanges(current, null), null)
  assert.equal(explainEstimateChanges(current, current), null)
  assert.equal(explainEstimateChanges(current, estimate("next"), { baselineLabel: "Original contract Estimate — not the preceding draft" })!.baselineLabel, "Original contract Estimate — not the preceding draft")
})
