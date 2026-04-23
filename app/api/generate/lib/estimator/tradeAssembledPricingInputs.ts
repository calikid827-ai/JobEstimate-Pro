import type { ComplexityProfile, TradeStack } from "./types"
import type { TradePreparedPricingInputs } from "./tradePreparedPricingInputs"

export type TradeAssembledPricingTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradeAssembledPricingInputs = {
  trade: TradeAssembledPricingTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradeAssembledPricingInputs: string[]
  tradeAssembledMeasurementBasis: string[]
  tradeAssembledLaborBasis: string[]
  tradeAssembledAllowanceBasis: string[]
  tradeAssembledPricingGuidance: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 10): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function normalizeReviewState(
  sections: string[],
  supportLevel: "strong" | "moderate" | "weak"
): string[] {
  if (supportLevel !== "weak") return uniqStrings(sections, 8)

  return uniqStrings(
    sections.map((section) =>
      section.startsWith("Review candidate:") ? section : `Review candidate: ${section}`
    ),
    8
  )
}

export function buildTradeAssembledPricingInputs(args: {
  tradePreparedPricingInputs: TradePreparedPricingInputs
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradeAssembledPricingInputs {
  if (!args.tradePreparedPricingInputs) return null

  const prepared = args.tradePreparedPricingInputs
  const supportLevel = prepared.supportLevel
  const reviewOnly = supportLevel === "weak"
  const repeatedCue = prepared.tradePreparedPricingNotes.some((item) =>
    /\brepeated-space\b|\bprototype-room\b|\brepeat-room\b/i.test(item)
  )

  return {
    trade: prepared.trade,
    supportLevel,
    tradeAssembledPricingInputs: normalizeReviewState(
      prepared.tradePreparedPricingSections,
      supportLevel
    ),
    tradeAssembledMeasurementBasis: uniqStrings(
      [
        ...prepared.tradePreparedMeasurementInputs,
        reviewOnly
          ? "Assembled measurement basis is descriptive only and must not be treated as a hard quantity input."
          : null,
      ],
      8
    ),
    tradeAssembledLaborBasis: uniqStrings(
      [
        ...prepared.tradePreparedLaborInputs,
        reviewOnly
          ? "Assembled labor basis is advisory only and must not be converted into production-rate assumptions."
          : null,
        args.complexityProfile?.multiPhase
          ? "Keep phase sequencing visible in assembled labor basis instead of collapsing visits together."
          : null,
      ],
      8
    ),
    tradeAssembledAllowanceBasis: uniqStrings(
      [
        ...prepared.tradePreparedAllowanceInputs,
        reviewOnly
          ? "Assembled allowance basis stays review-oriented and should not imply a hidden spread or contingency."
          : null,
      ],
      8
    ),
    tradeAssembledPricingGuidance: uniqStrings(
      [
        ...prepared.tradePreparedPricingNotes,
        reviewOnly
          ? "Weak support keeps assembled pricing inputs in review mode only."
          : "Assembled pricing inputs are pricing-ready organization guidance only and do not execute pricing.",
        repeatedCue
          ? "Repeated-space organization can shape assembled inputs without implying automatic quantity scaling."
          : null,
        args.tradeStack?.isMultiTrade
          ? "Assembled pricing guidance must remain subordinate to existing pricing-owner logic in multi-trade cases."
          : null,
      ],
      10
    ),
  }
}
