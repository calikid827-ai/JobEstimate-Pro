import type { TradePackagePricingPrep } from "./tradePackagePricingPrep"

export type TradePricingPrepAnalysis = {
  trade: NonNullable<TradePackagePricingPrep>["trade"]
  supportLevel: NonNullable<TradePackagePricingPrep>["supportLevel"]
  tradeEstimateGroupingNotes: string[]
  tradePricingPrepSummary: string[]
  tradeReviewActions: string[]
  tradeAnalysisSignals: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

export function buildTradePricingPrepAnalysis(
  prep: TradePackagePricingPrep
): TradePricingPrepAnalysis {
  if (!prep) return null

  const isWeak = prep.supportLevel === "weak"

  const tradePricingPrepSummary = uniqStrings(
    [
      isWeak
        ? `${prep.trade} pricing prep is in review mode because plan/package support is still weak.`
        : `${prep.trade} pricing prep can support estimate organization and review language without changing pricing math.`,
      ...prep.tradePackagePricingGuidance.slice(0, isWeak ? 2 : 3),
      ...prep.tradePackageScopeBasis.slice(0, isWeak ? 1 : 2),
    ],
    5
  )

  const tradeEstimateGroupingNotes = uniqStrings(
    isWeak
      ? [
          `Keep ${prep.trade} package cues as soft organization hints only; do not let them override the current estimate structure.`,
          ...prep.tradePackageReviewNotes.slice(0, 1),
        ]
      : [
          ...prep.tradePackagePricingGuidance.slice(0, 3),
          ...prep.tradePackageScopeBasis.slice(0, 2),
        ],
    5
  )

  const tradeReviewActions = uniqStrings(
    [
      ...prep.tradePackageMeasurementHints.slice(0, 3),
      ...prep.tradePackageRiskFlags.slice(0, isWeak ? 2 : 1),
      ...prep.tradePackageReviewNotes.slice(0, 2),
    ],
    6
  )

  const tradeAnalysisSignals = uniqStrings(
    [
      ...prep.tradePackageProductionFactors.slice(0, 3),
      ...prep.tradePackageScopeBasis.slice(0, 2),
      isWeak
        ? "Treat these signals as review-oriented only until stronger plan support appears."
        : "These signals can strengthen estimate organization and estimator review language.",
    ],
    6
  )

  if (
    tradeEstimateGroupingNotes.length === 0 &&
    tradePricingPrepSummary.length === 0 &&
    tradeReviewActions.length === 0 &&
    tradeAnalysisSignals.length === 0
  ) {
    return null
  }

  return {
    trade: prep.trade,
    supportLevel: prep.supportLevel,
    tradeEstimateGroupingNotes,
    tradePricingPrepSummary,
    tradeReviewActions,
    tradeAnalysisSignals,
  }
}
