import { buildProfitProtectionFromPricing, computeProfitProtectionFromTotals } from "./estimate-utils"

type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total?: number
}

export function calculateProfitTargetMarkup(
  pricing: Pricing,
  targetMarginPct: number
) {
  if (!Number.isFinite(targetMarginPct)) return null
  const current = supportedProfit({ ...pricing, markup: 0 })
  if (!current) return null

  const cost = current.estimatedCost
  const targetMargin = Math.max(0, Math.min(95, targetMarginPct)) / 100
  // Direct cost is also the existing editable markup base. Tax is added afterward.
  const targetBeforeTax = cost / (1 - targetMargin)
  const markup = Math.round(((targetBeforeTax - cost) / cost) * 1000) / 10
  const applied = supportedProfit({ ...pricing, markup })
  return applied && applied.contractValue > 0 ? markup : null
}

export function currentProfitMarginPct(pricing: Pricing) {
  const profit = supportedProfit(pricing)
  if (!profit) return 0
  // Reuse the canonical whole-percent metric for the existing badge/15% threshold.
  return computeProfitProtectionFromTotals({
    contractValue: profit.contractValue,
    estimatedCost: profit.estimatedCost,
    actuals: null,
  }).estimatedMarginPct
}

function supportedProfit(pricing: Pricing) {
  if (![pricing.labor, pricing.materials, pricing.subs].every(
    (cost) => Number.isFinite(cost) && cost >= 0
  ) || !Number.isFinite(pricing.markup)) return null

  const profit = buildProfitProtectionFromPricing(pricing)
  return profit && [profit.estimatedCost, profit.contractValue, profit.grossMarginPct].every(Number.isFinite)
    ? profit
    : null
}
