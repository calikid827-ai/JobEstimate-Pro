import type { EffectivePaintScope, EstimateBasis } from "./types"
import type { TradeExecutionPricingPrep } from "./tradeExecutionPricingPrep"

export type TradePricingExecutionBridgeTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePricingExecutionBridge = {
  trade: TradePricingExecutionBridgeTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePricingExecutionBridge: string[]
  tradeResolvedPricingSections: string[]
  tradeResolvedMeasurementBasis: string[]
  tradeResolvedLaborBasis: string[]
  tradeResolvedAllowanceBasis: string[]
  tradeExecutionInfluenceNotes: string[]
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

export function buildTradePricingExecutionBridge(args: {
  tradeExecutionPricingPrep: TradeExecutionPricingPrep
  effectivePaintScope: EffectivePaintScope | null
  effectiveSqft: number | null
  rooms: number | null
  doors: number | null
}): TradePricingExecutionBridge {
  if (!args.tradeExecutionPricingPrep) return null

  const prep = args.tradeExecutionPricingPrep
  const reviewOnly = prep.supportLevel === "weak"
  const sections = normalizeReview(prep.tradeExecutionSections, reviewOnly)

  return {
    trade: prep.trade,
    supportLevel: prep.supportLevel,
    tradePricingExecutionBridge: uniqStrings(
      [
        reviewOnly
          ? "Execution bridge remains review-only because plan support is weak."
          : "Execution bridge can guide real basis selection conservatively while leaving pricing protections authoritative.",
        prep.trade === "painting" &&
        sections.includes("Ceilings") &&
        args.effectivePaintScope !== "doors_only" &&
        args.effectiveSqft != null
          ? "Painting bridge supports walls + ceilings basis routing where measured area already exists."
          : null,
        prep.trade === "drywall" && sections.includes("Patch / repair")
          ? "Drywall bridge keeps patch/repair routing separate from broader install-and-finish logic."
          : null,
        prep.trade === "wallcovering" &&
        (sections.includes("Corridor wallcovering") || sections.includes("Removal / prep"))
          ? "Wallcovering bridge keeps corridor and prep/install routing explicit."
          : null,
      ],
      6
    ),
    tradeResolvedPricingSections: sections,
    tradeResolvedMeasurementBasis: uniqStrings(
      [
        ...prep.tradeExecutionMeasurementBasis,
        reviewOnly
          ? "Resolved measurement basis stays non-binding until stronger support appears."
          : null,
      ],
      8
    ),
    tradeResolvedLaborBasis: uniqStrings(
      [
        ...prep.tradeExecutionLaborBasis,
        reviewOnly
          ? "Resolved labor basis stays advisory and must not imply production-rate certainty."
          : null,
      ],
      8
    ),
    tradeResolvedAllowanceBasis: uniqStrings(
      [
        ...prep.tradeExecutionAllowanceBasis,
        reviewOnly
          ? "Resolved allowance basis stays review-oriented and must not imply hidden spread."
          : null,
      ],
      8
    ),
    tradeExecutionInfluenceNotes: uniqStrings(
      [
        ...prep.tradeExecutionPricingNotes,
        args.rooms != null && args.rooms > 0
          ? `Existing estimator room count remains ${args.rooms}; the bridge does not invent additional room scaling.`
          : null,
        args.doors != null && args.doors > 0
          ? `Existing estimator door count remains ${args.doors}; the bridge only refines routing when door scope is already present.`
          : null,
        args.effectiveSqft != null
          ? `Existing estimator measured area remains ${args.effectiveSqft} sqft for basis context.`
          : null,
      ],
      10
    ),
  }
}

export function applyTradePricingExecutionBridgeToBasis(args: {
  basis: EstimateBasis | null
  tradePricingExecutionBridge: TradePricingExecutionBridge
}): EstimateBasis | null {
  if (!args.basis || !args.tradePricingExecutionBridge) return args.basis
  if (args.tradePricingExecutionBridge.supportLevel === "weak") return args.basis

  const bridge = args.tradePricingExecutionBridge
  const sections = bridge.tradeResolvedPricingSections

  const assumptions = uniqStrings(
    [
      ...(args.basis.assumptions || []),
      bridge.trade === "painting" &&
      sections.includes("Walls") &&
      sections.includes("Ceilings")
        ? "Plan-aware execution routing supports walls + ceilings organization where measured area already exists."
        : null,
      bridge.trade === "painting" && sections.includes("Corridor repaint")
        ? "Keep corridor repaint as a separately reviewed pricing section in the estimate basis."
        : null,
      bridge.trade === "drywall" && sections.includes("Patch / repair")
        ? "Patch / repair remains separately routed from install-and-finish in pricing basis prep."
        : null,
      bridge.trade === "drywall" &&
      sections.includes("Install / hang") &&
      sections.includes("Finish / texture")
        ? "Install / hang and finish / texture remain separately reviewed in pricing basis prep."
        : null,
      bridge.trade === "wallcovering" && sections.includes("Feature wall")
        ? "Feature-wall scope remains separately routed from broader room or corridor wallcovering."
        : null,
      bridge.trade === "wallcovering" && sections.includes("Removal / prep")
        ? "Removal / prep remains explicitly routed instead of being blended into install basis."
        : null,
      "Plan-aware execution bridge influenced basis assumptions only; pricing protections remain authoritative.",
    ],
    12
  )

  return {
    ...args.basis,
    assumptions,
  }
}
