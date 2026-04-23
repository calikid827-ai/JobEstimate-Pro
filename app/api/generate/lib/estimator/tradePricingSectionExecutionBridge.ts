import type { EstimateBasis } from "./types"
import type { TradePricingExecutionBridge } from "./tradePricingExecutionBridge"
import type { TradePricingInterpretationBridge } from "./tradePricingInterpretationBridge"

export type TradePricingSectionExecutionTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePricingSectionExecutionBridge = {
  trade: TradePricingSectionExecutionTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePricingSectionExecutionBridge: string[]
  tradeExecutedPricingSections: string[]
  tradeExecutedQuantityInputs: string[]
  tradeExecutedLaborInputs: string[]
  tradeExecutedAllowanceInputs: string[]
  tradeSectionExecutionNotes: string[]
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

export function buildTradePricingSectionExecutionBridge(args: {
  basis: EstimateBasis | null
  tradePricingInterpretationBridge: TradePricingInterpretationBridge
}): TradePricingSectionExecutionBridge {
  if (!args.basis || !args.tradePricingInterpretationBridge) return null

  const bridge = args.tradePricingInterpretationBridge
  const reviewOnly = bridge.supportLevel === "weak"
  const sections = normalizeReview(bridge.tradeInterpretedPricingSections, reviewOnly)

  return {
    trade: bridge.trade,
    supportLevel: bridge.supportLevel,
    tradePricingSectionExecutionBridge: uniqStrings(
      [
        reviewOnly
          ? "Section execution bridge remains non-binding because plan support is weak."
          : "Section execution bridge can refine real section-level pricing prep while leaving protections authoritative.",
        bridge.trade === "painting" && sections.includes("Corridor repaint")
          ? "Painting section execution can keep corridor repaint separate from room interiors."
          : null,
        bridge.trade === "drywall" &&
        sections.includes("Patch / repair") &&
        sections.includes("Finish / texture")
          ? "Drywall section execution can keep repair and finish/texture routing distinct."
          : null,
        bridge.trade === "wallcovering" &&
        sections.includes("Removal / prep") &&
        sections.includes("Install")
          ? "Wallcovering section execution can keep removal/prep and install routing distinct."
          : null,
      ],
      6
    ),
    tradeExecutedPricingSections: sections,
    tradeExecutedQuantityInputs: uniqStrings(
      [
        ...bridge.tradeInterpretedQuantityBasis,
        reviewOnly
          ? "Executed quantity inputs stay descriptive only and cannot create new bound quantities."
          : null,
      ],
      8
    ),
    tradeExecutedLaborInputs: uniqStrings(
      [
        ...bridge.tradeInterpretedLaborBasis,
        reviewOnly
          ? "Executed labor inputs stay advisory only and cannot imply production-rate certainty."
          : null,
      ],
      8
    ),
    tradeExecutedAllowanceInputs: uniqStrings(
      [
        ...bridge.tradeInterpretedAllowanceBasis,
        reviewOnly
          ? "Executed allowance inputs stay review-oriented and cannot imply hidden spread."
          : null,
      ],
      8
    ),
    tradeSectionExecutionNotes: uniqStrings(
      [
        ...bridge.tradePricingInterpretationNotes,
        reviewOnly
          ? "Weak support must not change real section-level execution behavior."
          : "Moderate/strong support can refine section-level execution prep without changing formulas.",
      ],
      10
    ),
  }
}

export function applyTradePricingSectionExecutionBridgeToBasis(args: {
  basis: EstimateBasis | null
  tradePricingSectionExecutionBridge: TradePricingSectionExecutionBridge
}): EstimateBasis | null {
  if (!args.basis || !args.tradePricingSectionExecutionBridge) return args.basis
  if (args.tradePricingSectionExecutionBridge.supportLevel === "weak") return args.basis

  const bridge = args.tradePricingSectionExecutionBridge
  const sections = bridge.tradeExecutedPricingSections

  const assumptions = uniqStrings(
    [
      ...(args.basis.assumptions || []),
      bridge.trade === "painting" && sections.includes("Trim / casing")
        ? "Route trim/casing painting as its own section-level pricing prep where supported."
        : null,
      bridge.trade === "painting" && sections.includes("Corridor repaint")
        ? "Route corridor repaint separately from room painting in section-level pricing prep."
        : null,
      bridge.trade === "drywall" && sections.includes("Patch / repair")
        ? "Route drywall patch/repair as its own section-level pricing prep where supported."
        : null,
      bridge.trade === "drywall" && sections.includes("Ceiling drywall")
        ? "Route ceiling drywall separately from wall drywall in section-level pricing prep where supported."
        : null,
      bridge.trade === "wallcovering" && sections.includes("Feature wall")
        ? "Route feature-wall wallcovering separately from room/corridor wallcovering where supported."
        : null,
      bridge.trade === "wallcovering" && sections.includes("Removal / prep")
        ? "Route wallcovering removal/prep separately from install in section-level pricing prep where supported."
        : null,
      "Plan-aware section execution refined basis assumptions only; protections and pricing-owner logic remain authoritative.",
    ],
    16
  )

  return {
    ...args.basis,
    assumptions,
  }
}

export function applyConsolidatedTradePricingSectionExecutionBridgeToBasis(args: {
  basis: EstimateBasis | null
  tradePricingExecutionBridge: TradePricingExecutionBridge
  tradePricingInterpretationBridge: TradePricingInterpretationBridge
  tradePricingSectionExecutionBridge: TradePricingSectionExecutionBridge
}): EstimateBasis | null {
  if (!args.basis) return args.basis

  const sectionBridge = args.tradePricingSectionExecutionBridge
  if (!sectionBridge || sectionBridge.supportLevel === "weak") {
    return args.basis
  }

  const executionBridge = args.tradePricingExecutionBridge
  const interpretationBridge = args.tradePricingInterpretationBridge
  const sections = sectionBridge.tradeExecutedPricingSections

  const assumptions = uniqStrings(
    [
      ...(args.basis.assumptions || []),
      ...(executionBridge?.tradePricingExecutionBridge || []).slice(0, 2),
      ...(interpretationBridge?.tradePricingInterpretationBridge || []).slice(0, 2),
      ...(sectionBridge.tradePricingSectionExecutionBridge || []).slice(0, 2),
      ...(sectionBridge.tradeSectionExecutionNotes || []).slice(0, 2),
      sectionBridge.trade === "painting" && sections.includes("Ceilings")
        ? "Live paint pricing interpretation keeps ceiling scope explicitly distinct from wall-only routing where plan support is strong enough."
        : null,
      sectionBridge.trade === "painting" && sections.includes("Corridor repaint")
        ? "Live paint pricing execution keeps corridor repaint separately routed from room interiors where support is strong enough."
        : null,
      sectionBridge.trade === "drywall" && sections.includes("Patch / repair")
        ? "Live drywall pricing execution keeps patch/repair routing distinct from broader install/hang interpretation where support is strong enough."
        : null,
      sectionBridge.trade === "drywall" && sections.includes("Finish / texture")
        ? "Live drywall pricing interpretation keeps finish/texture meaning distinct from board-only application where support is strong enough."
        : null,
      sectionBridge.trade === "wallcovering" && sections.includes("Removal / prep")
        ? "Live wallcovering pricing execution keeps removal/prep separately routed from install where support is strong enough."
        : null,
      sectionBridge.trade === "wallcovering" && sections.includes("Corridor wallcovering")
        ? "Live wallcovering pricing interpretation keeps corridor scope distinct from room scope where support is strong enough."
        : null,
      "Consolidated plan-aware section execution influenced live basis assumptions only; protections and pricing-owner logic remain authoritative.",
    ],
    18
  )

  return {
    ...args.basis,
    assumptions,
  }
}
