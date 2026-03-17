import { EstimateHistoryItem, UiTrade } from "./types"

export type PricingMemoryResult = {
  trade: UiTrade
  jobCount: number
  avgPrice: number
  minPrice: number
  maxPrice: number
}

export function getPricingMemory(
  history: EstimateHistoryItem[],
  trade: UiTrade
): PricingMemoryResult | null {

  if (!trade) return null

  const similar = history.filter(
    (h) =>
      h.trade === trade &&
      h.pricing?.total &&
      Number(h.pricing.total) > 0
  )

  if (similar.length < 2) return null

  const prices = similar.map((h) => Number(h.pricing.total))

  const sum = prices.reduce((a, b) => a + b, 0)

  return {
    trade,
    jobCount: similar.length,
    avgPrice: Math.round(sum / prices.length),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  }
}