import test from "node:test"
import assert from "node:assert/strict"
import { calculateProfitTargetMarkup, currentProfitMarginPct } from "./profit-target"
import {
  buildProfitProtectionFromPricing,
  computeProfitProtectionFromTotals,
  computeTaxAmountFromEstimate,
  computeDepositFromEstimateTotal,
  estimateDirectCost,
  estimateSubtotalBeforeTax,
  estimateTotalWithTax,
} from "./estimate-utils"
import { getStarterRateCard } from "./rate-card"
import type { EstimateHistoryItem } from "./types"

// Synthetic local pricing fixture, not generated output or market-price evidence.
const pricing = { labor: 600, materials: 300, subs: 100, markup: 25, total: 1250 }
function estimate(input = pricing, tax = { enabled: false, rate: 10 }): EstimateHistoryItem {
  return {
    id: "profit-target-fixture", createdAt: 1, documentType: "Estimate",
    jobDetails: { clientName: "", jobName: "", changeOrderNo: "", jobAddress: "", date: "" },
    trade: "general_renovation", state: "CA", scopeChange: "Fixture scope", result: "Fixture proposal",
    pricing: { ...input }, tax,
  }
}

test("20% target retains a $1,250 pre-tax contract when synthetic 10% tax is enabled", () => {
  const markup = calculateProfitTargetMarkup({ ...pricing, total: 1375 }, 20)
  assert.equal(markup, 25)
  const applied = { ...pricing, markup: markup! }
  const profit = buildProfitProtectionFromPricing(applied)!
  assert.equal(profit.contractValue, 1250)
  assert.equal(profit.grossProfit, 250)
  assert.equal(profit.grossMarginPct, 20)
  assert.deepEqual(computeTaxAmountFromEstimate(estimate(applied, { enabled: true, rate: 10 })), {
    markedUp: 1250, taxAmt: 125, estimateTotal: 1375,
  })
})

test("entered 25% markup displays the canonical pre-tax margin even with tax in total", () => {
  const profit = buildProfitProtectionFromPricing(pricing)!
  assert.equal(currentProfitMarginPct({ ...pricing, total: 1375 }), profit.grossMarginPct)
  assert.equal(currentProfitMarginPct({ ...pricing, total: 1250 }), 20)
})

test("tax-disabled 20% target preserves the established markup", () => {
  assert.equal(calculateProfitTargetMarkup(pricing, 20), 25)
})

const taxCases = [
  { enabled: false, rate: 10 },
  { enabled: true, rate: 0 },
  { enabled: true, rate: getStarterRateCard().tax.rate },
  { enabled: true, rate: 10 },
]

for (const [target, expectedMarkup, expectedSubtotal] of [[20, 25, 1250], [25, 33.3, 1333], [30, 42.9, 1429]]) {
  for (const tax of taxCases) {
    test(`${target}% target: tax ${tax.enabled ? tax.rate : "off"} preserves pre-tax pricing and canonical margin`, () => {
      const input = { ...pricing, total: estimateTotalWithTax(estimate(pricing, tax)) }
      const before = structuredClone(input)
      const markup = calculateProfitTargetMarkup(input, target)
      assert.equal(markup, expectedMarkup)
      const applied = { ...input, markup: markup! }
      const est = estimate(applied, tax)
      const cost = estimateDirectCost(est)
      const subtotal = estimateSubtotalBeforeTax(est)
      const profit = buildProfitProtectionFromPricing(applied)!
      const totalsProfit = computeProfitProtectionFromTotals({ contractValue: subtotal, estimatedCost: cost, actuals: null })
      assert.equal(subtotal, expectedSubtotal)
      assert.equal(profit.contractValue, subtotal)
      assert.equal(profit.estimatedCost, 1000)
      assert.equal(profit.grossProfit, totalsProfit.estimatedProfit)
      assert.equal(currentProfitMarginPct(applied), totalsProfit.estimatedMarginPct)
      assert.equal(currentProfitMarginPct(applied), target)

      // Half a 0.1-point markup step plus half a whole-dollar subtotal step.
      const ideal = cost / (1 - target / 100)
      const priceTolerance = cost * 0.0005 + 0.5
      assert.ok(Math.abs(subtotal - ideal) <= priceTolerance)
      const marginTolerance = 100 * cost * priceTolerance / (ideal * (ideal - priceTolerance))
      assert.ok(Math.abs((profit.grossProfit / subtotal) * 100 - target) <= marginTolerance)

      const markedUp = cost * (1 + markup! / 100)
      const expectedTotal = Math.round(markedUp * (1 + (tax.enabled ? tax.rate / 100 : 0)))
      assert.equal(estimateTotalWithTax(est), expectedTotal) // Actual editable page's total path.
      const snapshot = computeTaxAmountFromEstimate(est)
      assert.equal(snapshot.markedUp, markedUp)
      assert.equal(snapshot.taxAmt, tax.enabled ? Math.round(markedUp * tax.rate / 100) : 0)
      assert.equal(snapshot.estimateTotal, Math.round(markedUp + snapshot.taxAmt))
      assert.deepEqual(input, before)
      assert.deepEqual([applied.labor, applied.materials, applied.subs], [600, 300, 100])
    })
  }
}

test("tax toggle changes totals but not profit, margin, or a low-margin classification", () => {
  for (const markup of [25, 0, -10]) {
    const base = { ...pricing, markup }
    const profit = buildProfitProtectionFromPricing(base)!
    const off = estimateTotalWithTax(estimate(base))
    const on = estimateTotalWithTax(estimate(base, { enabled: true, rate: 25 }))
    assert.ok(on > off)
    assert.equal(currentProfitMarginPct({ ...base, total: on }), currentProfitMarginPct({ ...base, total: off }))
    assert.deepEqual(buildProfitProtectionFromPricing({ ...base, total: on } as typeof base), profit)
    if (markup <= 0) assert.ok(currentProfitMarginPct({ ...base, total: on }) < 15)
  }
})

test("20% selected margin remains below the independent preferred 25% target", () => {
  const markup = calculateProfitTargetMarkup(pricing, 20)!
  const applied = { ...pricing, markup }
  const profit = buildProfitProtectionFromPricing(applied)!
  assert.equal(currentProfitMarginPct(applied), 20)
  assert.ok(currentProfitMarginPct(applied) >= 15)
  assert.equal(profit.status, "warning")
  assert.ok(profit.warnings.some((warning) => warning.includes("below the 25% target")))
  assert.equal(profit.minimumSafePrice, 1176)
  assert.equal(profit.targetPrice25, 1333)
  assert.equal(profit.targetPrice30, 1429)
})

test("fractional costs keep 0.1-point markup precision and report actual rounded-contract profit", () => {
  const input = { labor: 600.17, materials: 300.29, subs: 100.13, markup: 5, total: 0 }
  for (const target of [20, 25, 30]) {
    const markup = calculateProfitTargetMarkup(input, target)!
    const applied = { ...input, markup }
    const profit = buildProfitProtectionFromPricing(applied)!
    const subtotal = estimateSubtotalBeforeTax(estimate(applied))
    const ideal = profit.estimatedCost / (1 - target / 100)
    assert.equal(markup * 10, Math.round(markup * 10))
    assert.equal(profit.contractValue, subtotal)
    assert.equal(profit.grossProfit, subtotal - 1000.59)
    assert.ok(Math.abs(subtotal - ideal) <= profit.estimatedCost * 0.0005 + 0.5)
    assert.equal(profit.grossMarginPct, Math.round(((subtotal - profit.estimatedCost) / subtotal) * 1000) / 10)
    assert.equal(currentProfitMarginPct(applied), computeProfitProtectionFromTotals({ contractValue: subtotal, estimatedCost: profit.estimatedCost, actuals: null }).estimatedMarginPct)
  }
})

test("repeated and switched targets use current direct costs without compounding markup", () => {
  let input = { ...pricing, markup: 60, total: 99999 }
  for (const target of [20, 20, 30, 25, 25]) {
    const markup = calculateProfitTargetMarkup(input, target)!
    assert.equal(markup, calculateProfitTargetMarkup(pricing, target))
    input = { ...input, markup, total: estimateTotalWithTax(estimate({ ...input, markup }, { enabled: true, rate: 10 })) }
  }
})

test("tax and disabled, percentage, fixed, and capped deposits retain existing helper behavior", () => {
  const applied = { ...pricing, markup: calculateProfitTargetMarkup(pricing, 20)! }
  const total = estimateTotalWithTax(estimate(applied, { enabled: true, rate: 10 }))
  assert.equal(total, 1375)
  assert.deepEqual(computeDepositFromEstimateTotal(total, { enabled: false, type: "percent", value: 25 }), { depositDue: 0, remaining: 1375 })
  assert.deepEqual(computeDepositFromEstimateTotal(total, { enabled: true, type: "percent", value: 25 }), { depositDue: 344, remaining: 1031 })
  assert.deepEqual(computeDepositFromEstimateTotal(total, { enabled: true, type: "fixed", value: 500 }), { depositDue: 500, remaining: 875 })
  assert.deepEqual(computeDepositFromEstimateTotal(total, { enabled: true, type: "fixed", value: 5000 }), { depositDue: 1375, remaining: 0 })
  assert.deepEqual(computeDepositFromEstimateTotal(total, { enabled: true, type: "percent", value: 200 }), { depositDue: 1375, remaining: 0 })
})

test("empty, negative, nonfinite, overflowing, and sub-dollar-zero results cannot apply a target", () => {
  for (const input of [
    { ...pricing, labor: 0, materials: 0, subs: 0 },
    { ...pricing, labor: -1 },
    { ...pricing, labor: NaN },
    { ...pricing, materials: Infinity },
    { ...pricing, labor: Number.MAX_VALUE, materials: Number.MAX_VALUE },
    { ...pricing, labor: 0.01, materials: 0, subs: 0 },
  ]) {
    assert.equal(calculateProfitTargetMarkup(input, 20), null)
    assert.ok(Number.isFinite(currentProfitMarginPct(input)))
  }
  for (const target of [NaN, Infinity, -Infinity]) assert.equal(calculateProfitTargetMarkup(pricing, target), null)
  assert.equal(currentProfitMarginPct({ ...pricing, markup: NaN }), 0)
  assert.equal(currentProfitMarginPct({ labor: 0, materials: 0, subs: 0, markup: 0, total: 0 }), 0)
})

test("existing finite target guard remains 0–95% without importing another action's markup cap", () => {
  assert.equal(calculateProfitTargetMarkup(pricing, -5), 0)
  assert.equal(calculateProfitTargetMarkup(pricing, 0), 0)
  assert.equal(calculateProfitTargetMarkup(pricing, 95), 1900)
  assert.equal(calculateProfitTargetMarkup(pricing, 100), 1900)
})

test("pure calculations leave all pricing fields and explanatory rows untouched", () => {
  const input = { ...pricing, lineItems: [{ description: "Explanatory cost", amount: 1000 }] }
  const before = structuredClone(input)
  assert.equal(calculateProfitTargetMarkup(input, 20), 25)
  assert.equal(currentProfitMarginPct(input), 20)
  assert.deepEqual(input, before)
})
