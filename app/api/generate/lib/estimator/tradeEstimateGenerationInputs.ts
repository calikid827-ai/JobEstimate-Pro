import type { ComplexityProfile, TradeStack } from "./types"
import type { TradeAssembledPricingInputs } from "./tradeAssembledPricingInputs"

export type TradeEstimateGenerationTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradeEstimateGenerationInputs = {
  trade: TradeEstimateGenerationTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradeEstimateGenerationInputs: string[]
  tradeGenerationMeasurementBasis: string[]
  tradeGenerationLaborBasis: string[]
  tradeGenerationAllowanceBasis: string[]
  tradeGenerationPricingGuidance: string[]
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

export function buildTradeEstimateGenerationInputs(args: {
  tradeAssembledPricingInputs: TradeAssembledPricingInputs
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradeEstimateGenerationInputs {
  if (!args.tradeAssembledPricingInputs) return null

  const assembled = args.tradeAssembledPricingInputs
  const reviewOnly = assembled.supportLevel === "weak"
  const repeatedCue = assembled.tradeAssembledPricingGuidance.some((item) =>
    /\brepeated-space\b|\bprototype-room\b|\brepeat-room\b/i.test(item)
  )

  return {
    trade: assembled.trade,
    supportLevel: assembled.supportLevel,
    tradeEstimateGenerationInputs: normalizeReview(
      assembled.tradeAssembledPricingInputs,
      reviewOnly
    ),
    tradeGenerationMeasurementBasis: uniqStrings(
      [
        ...assembled.tradeAssembledMeasurementBasis,
        reviewOnly
          ? "Generation measurement basis stays descriptive only and must not be treated as a hard estimate quantity."
          : null,
      ],
      8
    ),
    tradeGenerationLaborBasis: uniqStrings(
      [
        ...assembled.tradeAssembledLaborBasis,
        reviewOnly
          ? "Generation labor basis stays advisory only and must not imply production-rate certainty."
          : null,
        args.complexityProfile?.multiPhase
          ? "Generation labor basis should preserve phase sequencing instead of collapsing visits into one assumption."
          : null,
      ],
      8
    ),
    tradeGenerationAllowanceBasis: uniqStrings(
      [
        ...assembled.tradeAssembledAllowanceBasis,
        reviewOnly
          ? "Generation allowance basis stays review-oriented and must not imply hidden contingency math."
          : null,
      ],
      8
    ),
    tradeGenerationPricingGuidance: uniqStrings(
      [
        ...assembled.tradeAssembledPricingGuidance,
        reviewOnly
          ? "Weak support keeps estimate-generation inputs in review mode only."
          : "Estimate-generation inputs are assembly guidance only and do not execute final pricing.",
        repeatedCue
          ? "Repeated-space guidance can shape estimate-generation order without implying automatic quantity scaling."
          : null,
        args.tradeStack?.isMultiTrade
          ? "Estimate-generation guidance must remain subordinate to existing pricing-owner logic in multi-trade scopes."
          : null,
      ],
      10
    ),
  }
}
