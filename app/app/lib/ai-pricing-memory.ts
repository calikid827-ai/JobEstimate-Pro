import type { EstimateHistoryItem, UiTrade } from "./types"

export type PricingMemoryResult = {
  trade: string
  jobCount: number
  minPrice: number
  maxPrice: number
  avgPrice: number
}

function normalizeText(s: string) {
  return String(s || "").trim().toLowerCase()
}

function detectScopeBucket(item: EstimateHistoryItem) {
  const text = normalizeText(item.scopeChange)

  if (text.includes("bedroom")) return "bedroom"
  if (text.includes("bathroom")) return "bathroom"
  if (text.includes("kitchen")) return "kitchen"
  if (text.includes("drywall")) return "drywall"
  if (text.includes("paint")) return "painting"
  if (text.includes("floor")) return "flooring"
  if (text.includes("electrical")) return "electrical"
  if (text.includes("plumbing")) return "plumbing"

  return "general"
}

function friendlyTradeLabel(trade: UiTrade | string) {
  if (!trade) return "general"

  switch (trade) {
    case "painting":
      return "painting"
    case "drywall":
      return "drywall"
    case "flooring":
      return "flooring"
    case "electrical":
      return "electrical"
    case "plumbing":
      return "plumbing"
    case "bathroom_tile":
      return "bathroom / tile"
    case "carpentry":
      return "carpentry"
    case "general_renovation":
      return "general renovation"
    default:
      return String(trade)
  }
}

export function getPricingMemory(
  history: EstimateHistoryItem[],
  trade: UiTrade,
  currentScopeChange?: string
): PricingMemoryResult | null {
  if (!trade) return null

  const currentBucket = detectScopeBucket({
    scopeChange: currentScopeChange || "",
  } as EstimateHistoryItem)

  const sameTrade = history.filter(
    (h) =>
      h.trade === trade &&
      h.pricing?.total &&
      Number(h.pricing.total) > 0
  )

  if (sameTrade.length === 0) return null

  const sameBucket = sameTrade.filter(
    (h) => detectScopeBucket(h) === currentBucket
  )

  const pool = sameBucket.length >= 2 ? sameBucket : sameTrade

  if (pool.length < 2) return null

  const prices = pool
    .map((h) => Number(h.pricing?.total || 0))
    .filter((n) => Number.isFinite(n) && n > 0)

  if (prices.length < 2) return null

  const sum = prices.reduce((a, b) => a + b, 0)

  return {
    trade: friendlyTradeLabel(trade),
    jobCount: prices.length,
    avgPrice: Math.round(sum / prices.length),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  }
}