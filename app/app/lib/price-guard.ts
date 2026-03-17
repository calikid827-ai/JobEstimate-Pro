export type PriceGuardResult = {
  percentDiff: number
  status: "low" | "high" | "normal"
}

export function compareEstimateToHistory(
  estimateTotal: number,
  avgPrice: number
): PriceGuardResult {

  if (!estimateTotal || !avgPrice) {
    return { percentDiff: 0, status: "normal" }
  }

  const percentDiff = Math.round(((estimateTotal - avgPrice) / avgPrice) * 100)

  if (percentDiff < -25) {
    return { percentDiff, status: "low" }
  }

  if (percentDiff > 40) {
    return { percentDiff, status: "high" }
  }

  return { percentDiff, status: "normal" }
}