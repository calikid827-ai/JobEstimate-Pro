import type { EstimateBasis } from "./types"
import type { TradePricingExecutionBridge } from "./tradePricingExecutionBridge"

export type TradePricingInterpretationTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePricingInterpretationBridge = {
  trade: TradePricingInterpretationTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePricingInterpretationBridge: string[]
  tradeInterpretedPricingSections: string[]
  tradeInterpretedQuantityBasis: string[]
  tradeInterpretedLaborBasis: string[]
  tradeInterpretedAllowanceBasis: string[]
  tradePricingInterpretationNotes: string[]
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

export function buildTradePricingInterpretationBridge(args: {
  basis: EstimateBasis | null
  tradePricingExecutionBridge: TradePricingExecutionBridge
}): TradePricingInterpretationBridge {
  if (!args.basis || !args.tradePricingExecutionBridge) return null

  const bridge = args.tradePricingExecutionBridge
  const reviewOnly = bridge.supportLevel === "weak"
  const sections = normalizeReview(bridge.tradeResolvedPricingSections, reviewOnly)
  const assumptions = args.basis.assumptions || []

  return {
    trade: bridge.trade,
    supportLevel: bridge.supportLevel,
    tradePricingInterpretationBridge: uniqStrings(
      [
        reviewOnly
          ? "Pricing interpretation bridge remains non-binding because plan support is weak."
          : "Pricing interpretation bridge can refine live pricing meaning while leaving protections authoritative.",
        bridge.trade === "painting" && sections.includes("Walls") && sections.includes("Ceilings")
          ? "Painting interpretation can treat walls and ceilings as clearly separated pricing sections."
          : null,
        bridge.trade === "drywall" && sections.includes("Patch / repair")
          ? "Drywall interpretation can preserve repair routing apart from broader install-and-finish interpretation."
          : null,
        bridge.trade === "wallcovering" &&
        (sections.includes("Feature wall") || sections.includes("Corridor wallcovering"))
          ? "Wallcovering interpretation can preserve explicit feature/corridor routing."
          : null,
      ],
      6
    ),
    tradeInterpretedPricingSections: sections,
    tradeInterpretedQuantityBasis: uniqStrings(
      [
        ...bridge.tradeResolvedMeasurementBasis,
        reviewOnly
          ? "Interpreted quantity basis stays descriptive only and cannot create new measured quantities."
          : null,
      ],
      8
    ),
    tradeInterpretedLaborBasis: uniqStrings(
      [
        ...bridge.tradeResolvedLaborBasis,
        reviewOnly
          ? "Interpreted labor basis stays advisory only and cannot imply production-rate certainty."
          : null,
      ],
      8
    ),
    tradeInterpretedAllowanceBasis: uniqStrings(
      [
        ...bridge.tradeResolvedAllowanceBasis,
        reviewOnly
          ? "Interpreted allowance basis stays review-oriented and cannot imply hidden spread."
          : null,
      ],
      8
    ),
    tradePricingInterpretationNotes: uniqStrings(
      [
        ...bridge.tradeExecutionInfluenceNotes,
        ...assumptions.slice(-4),
        reviewOnly
          ? "Weak support must not change live pricing interpretation."
          : "Moderate/strong support can refine section meaning and routing without changing formulas.",
      ],
      10
    ),
  }
}

export function applyTradePricingInterpretationBridgeToBasis(args: {
  basis: EstimateBasis | null
  tradePricingInterpretationBridge: TradePricingInterpretationBridge
}): EstimateBasis | null {
  if (!args.basis || !args.tradePricingInterpretationBridge) return args.basis
  if (args.tradePricingInterpretationBridge.supportLevel === "weak") return args.basis

  const bridge = args.tradePricingInterpretationBridge
  const sections = bridge.tradeInterpretedPricingSections

  const assumptions = uniqStrings(
    [
      ...(args.basis.assumptions || []),
      bridge.trade === "painting" && sections.includes("Ceilings")
        ? "Interpret ceiling-related paint scope separately from wall-only interpretation when plan support is present."
        : null,
      bridge.trade === "painting" && sections.includes("Doors / frames")
        ? "Interpret door/frame painting as separate routed scope when existing door inputs already exist."
        : null,
      bridge.trade === "drywall" && sections.includes("Finish / texture")
        ? "Interpret finish/texture as separate drywall pricing meaning from basic board application."
        : null,
      bridge.trade === "drywall" && sections.includes("Ceiling drywall")
        ? "Interpret ceiling drywall separately from wall-only drywall routing where supported."
        : null,
      bridge.trade === "wallcovering" && sections.includes("Removal / prep")
        ? "Interpret wallcovering removal/prep separately from install where supported."
        : null,
      bridge.trade === "wallcovering" && sections.includes("Corridor wallcovering")
        ? "Interpret corridor wallcovering separately from room wallcovering where supported."
        : null,
      "Plan-aware pricing interpretation refined basis assumptions only; protections and pricing-owner logic remain authoritative.",
    ],
    14
  )

  return {
    ...args.basis,
    assumptions,
  }
}
