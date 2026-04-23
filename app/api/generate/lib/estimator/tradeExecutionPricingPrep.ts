import type { ComplexityProfile, TradeStack } from "./types"
import type { TradeEstimateGenerationInputs } from "./tradeEstimateGenerationInputs"

export type TradeExecutionPricingTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradeExecutionPricingPrep = {
  trade: TradeExecutionPricingTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradeExecutionPricingPrep: string[]
  tradeExecutionSections: string[]
  tradeExecutionMeasurementBasis: string[]
  tradeExecutionLaborBasis: string[]
  tradeExecutionAllowanceBasis: string[]
  tradeExecutionPricingNotes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 10): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function normalizeReview(items: string[], reviewOnly: boolean): string[] {
  if (!reviewOnly) return uniqStrings(items, 8)

  return uniqStrings(
    items.map((item) =>
      item.startsWith("Review candidate:") ? item : `Review candidate: ${item}`
    ),
    8
  )
}

export function buildTradeExecutionPricingPrep(args: {
  tradeEstimateGenerationInputs: TradeEstimateGenerationInputs
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradeExecutionPricingPrep {
  if (!args.tradeEstimateGenerationInputs) return null

  const generation = args.tradeEstimateGenerationInputs
  const reviewOnly = generation.supportLevel === "weak"
  const repeatedCue = generation.tradeGenerationPricingGuidance.some((item) =>
    /\brepeated-space\b|\bprototype-room\b|\brepeat-room\b/i.test(item)
  )

  return {
    trade: generation.trade,
    supportLevel: generation.supportLevel,
    tradeExecutionPricingPrep: normalizeReview(
      generation.tradeEstimateGenerationInputs,
      reviewOnly
    ),
    tradeExecutionSections: normalizeReview(
      generation.tradeEstimateGenerationInputs,
      reviewOnly
    ),
    tradeExecutionMeasurementBasis: uniqStrings(
      [
        ...generation.tradeGenerationMeasurementBasis,
        reviewOnly
          ? "Execution measurement basis stays descriptive only and must not be treated as a binding quantity input."
          : null,
      ],
      8
    ),
    tradeExecutionLaborBasis: uniqStrings(
      [
        ...generation.tradeGenerationLaborBasis,
        reviewOnly
          ? "Execution labor basis stays advisory only and must not imply production-rate certainty."
          : null,
        args.complexityProfile?.multiPhase
          ? "Execution labor prep should preserve phase sequencing instead of collapsing visits into one assumption."
          : null,
      ],
      8
    ),
    tradeExecutionAllowanceBasis: uniqStrings(
      [
        ...generation.tradeGenerationAllowanceBasis,
        reviewOnly
          ? "Execution allowance basis stays review-oriented and must not imply hidden contingency or spread."
          : null,
      ],
      8
    ),
    tradeExecutionPricingNotes: uniqStrings(
      [
        ...generation.tradeGenerationPricingGuidance,
        reviewOnly
          ? "Weak support keeps execution pricing prep non-binding and review-oriented only."
          : "Execution pricing prep is guidance only and does not replace existing pricing execution.",
        repeatedCue
          ? "Repeated-space guidance can shape execution prep order without implying automatic quantity scaling."
          : null,
        args.tradeStack?.isMultiTrade
          ? "Execution prep guidance must remain subordinate to existing pricing-owner logic in multi-trade scopes."
          : null,
      ],
      10
    ),
  }
}
