import type { PlanIntelligence } from "../plans/types"
import type { PaintScope, EstimateBasis, MeasurementInput, TradeStack, ComplexityProfile } from "./types"
import { buildEstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "./estimateStructureConsumption"
import { buildTradePackagePricingPrep } from "./tradePackagePricingPrep"
import { buildTradeQuantitySupport, type TradeQuantitySignal, type TradeQuantitySupport } from "./tradeQuantitySupport"
import { buildTradePricingBasisBridge } from "./tradePricingBasisBridge"
import { buildTradePricingInputDraft } from "./tradePricingInputDraft"
import { buildTradePreparedPricingInputs } from "./tradePreparedPricingInputs"
import { buildTradeAssembledPricingInputs } from "./tradeAssembledPricingInputs"
import { buildTradeEstimateGenerationInputs } from "./tradeEstimateGenerationInputs"
import { buildTradeExecutionPricingPrep } from "./tradeExecutionPricingPrep"

type SupportedTrade = "painting" | "drywall" | "wallcovering"
type ExactTradeQuantitySupport = NonNullable<TradeQuantitySupport>

export type LiveTradePricingInfluence = {
  trade: SupportedTrade
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  canAffectNumericPricing: boolean
  scopeTextOverride: string | null
  measurementsOverride: MeasurementInput | null
  paintScopeOverride: PaintScope | null
  basisAssumptions: string[]
  notes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 12): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function stripReviewPrefix(value: string): string {
  return String(value || "").replace(/^Review candidate:\s*/i, "").trim()
}

function normalizeSections(values: string[]): string[] {
  return uniqStrings(values.map(stripReviewPrefix), 8)
}

function findExactSignal(args: {
  signals: TradeQuantitySignal[]
  label: RegExp
  unit?: TradeQuantitySignal["unit"]
}): TradeQuantitySignal | null {
  return (
    args.signals.find(
      (signal) =>
        signal.exactQuantity &&
        args.label.test(signal.label) &&
        (!args.unit || signal.unit === args.unit) &&
        typeof signal.quantity === "number" &&
        signal.quantity > 0
    ) || null
  )
}

function appendScopeTokens(scopeText: string, additions: string[]): string {
  const base = String(scopeText || "").trim()
  const tokens = uniqStrings(additions, 8)
  if (tokens.length === 0) return base
  return `${base} ${tokens.join(". ")}.`.trim()
}

function buildPipeline(args: {
  trade: SupportedTrade
  scopeText: string
  planIntelligence: PlanIntelligence | null
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): {
  tradeQuantitySupport: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  executionNotes: string[]
} | null {
  const estimateSkeletonHandoff = buildEstimateSkeletonHandoff(args.planIntelligence)
  const estimateStructureConsumption = buildEstimateStructureConsumption(
    estimateSkeletonHandoff
  )
  const tradePackagePricingPrep = buildTradePackagePricingPrep({
    trade: args.trade,
    planIntelligence: args.planIntelligence,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    scopeText: args.scopeText,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
  const tradeQuantitySupport = buildTradeQuantitySupport({
    trade: args.trade,
    scopeText: args.scopeText,
    planIntelligence: args.planIntelligence,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradePackagePricingPrep,
  })

  if (!tradeQuantitySupport) return null

  const tradePricingBasisBridge = buildTradePricingBasisBridge({
    trade: args.trade,
    scopeText: args.scopeText,
    planIntelligence: args.planIntelligence,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
  const tradePricingInputDraft = buildTradePricingInputDraft({
    tradePricingBasisBridge,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    planIntelligence: args.planIntelligence,
    scopeText: args.scopeText,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
  const tradePreparedPricingInputs = buildTradePreparedPricingInputs({
    tradePricingInputDraft,
    tradePricingBasisBridge,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    planIntelligence: args.planIntelligence,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
  const tradeAssembledPricingInputs = buildTradeAssembledPricingInputs({
    tradePreparedPricingInputs,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
  const tradeEstimateGenerationInputs = buildTradeEstimateGenerationInputs({
    tradeAssembledPricingInputs,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
  const tradeExecutionPricingPrep = buildTradeExecutionPricingPrep({
    tradeEstimateGenerationInputs,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })

  if (!tradeExecutionPricingPrep) return null

  return {
    tradeQuantitySupport,
    supportLevel: tradeExecutionPricingPrep.supportLevel,
    executionSections: normalizeSections(tradeExecutionPricingPrep.tradeExecutionSections),
    executionNotes: uniqStrings(
      [
        ...tradeExecutionPricingPrep.tradeExecutionPricingNotes,
        ...tradeQuantitySupport.tradeQuantityReviewNotes,
      ],
      8
    ),
  }
}

function buildPaintingInfluence(args: {
  scopeText: string
  measurements: MeasurementInput | null
  paintScope: PaintScope | null
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const roomSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\brepeated room package support\b/i,
    unit: "rooms",
  })
  const doorSignal = findExactSignal({
    signals: args.support.tradeOpeningSignals,
    label: /\bdoor opening support\b/i,
    unit: "doors",
  })
  const ceilingSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\bceiling coverage support\b/i,
    unit: "sqft",
  })

  const hasBaseQuantity =
    Number(args.measurements?.totalSqft || 0) > 0 ||
    Number(roomSignal?.quantity || 0) > 0 ||
    Number(doorSignal?.quantity || 0) > 0

  const paintScopeOverride =
    args.executionSections.includes("Ceilings") && ceilingSignal ? "walls_ceilings" : null

  const scopeAdditions = uniqStrings(
    [
      roomSignal ? `paint ${Math.round(roomSignal.quantity || 0)} rooms` : null,
      doorSignal &&
      args.executionSections.some((section) => /doors?\s*\/\s*frames/i.test(section))
        ? `paint ${Math.round(doorSignal.quantity || 0)} doors`
        : null,
      paintScopeOverride === "walls_ceilings" ? "include walls and ceilings" : null,
      args.executionSections.includes("Corridor repaint") ? "corridor repaint remains separate" : null,
    ],
    5
  )

  const canAffectNumericPricing = args.supportLevel !== "weak" && hasBaseQuantity

  return {
    trade: "painting",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    scopeTextOverride:
      canAffectNumericPricing && scopeAdditions.length > 0
        ? appendScopeTokens(args.scopeText, scopeAdditions)
        : null,
    measurementsOverride: null,
    paintScopeOverride: canAffectNumericPricing ? paintScopeOverride : null,
    basisAssumptions: uniqStrings(
      [
        args.executionSections.includes("Ceilings") && ceilingSignal
          ? "Plan-aware pricing used ceiling support to route painting as walls plus ceilings."
          : null,
        roomSignal
          ? `Plan-aware pricing used ${Math.round(roomSignal.quantity || 0)} supported room(s) to preserve repeated-room painting routing.`
          : null,
        doorSignal &&
        args.executionSections.some((section) => /doors?\s*\/\s*frames/i.test(section))
          ? `Plan-aware pricing used ${Math.round(doorSignal.quantity || 0)} supported door opening(s) for separate door/frame routing.`
          : null,
        args.executionSections.includes("Corridor repaint")
          ? "Corridor repaint remains separately routed in plan-aware painting interpretation, even when current math still prices it inside the main paint run."
          : null,
        !canAffectNumericPricing
          ? "Plan-aware painting routing stayed non-binding because the available signals could not safely drive numeric pricing inputs."
          : null,
      ],
      8
    ),
    notes: args.executionNotes,
  }
}

function buildDrywallInfluence(args: {
  scopeText: string
  measurements: MeasurementInput | null
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const wallSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\bwall-area drywall support\b/i,
    unit: "sqft",
  })
  const ceilingSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\bceiling drywall support\b/i,
    unit: "sqft",
  })
  const repeatedRepairSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\brepeated room repair pattern support\b/i,
    unit: "rooms",
  })

  const isPatchRepair = args.executionSections.includes("Patch / repair")
  const isInstall = args.executionSections.includes("Install / hang")
  const includeCeilings = args.executionSections.includes("Ceiling drywall") && ceilingSignal
  const exactSqft =
    Number(wallSignal?.quantity || 0) + Number(includeCeilings ? ceilingSignal?.quantity || 0 : 0)

  const scopeAdditions = uniqStrings(
    [
      isPatchRepair ? "drywall patch repair" : null,
      isInstall ? "hang install finish drywall" : null,
      args.executionSections.includes("Finish / texture") ? "texture match finish" : null,
      includeCeilings ? "include ceilings" : null,
    ],
    5
  )

  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    exactSqft > 0 &&
    (isPatchRepair || isInstall)

  return {
    trade: "drywall",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    scopeTextOverride:
      canAffectNumericPricing && scopeAdditions.length > 0
        ? appendScopeTokens(args.scopeText, scopeAdditions)
        : null,
    measurementsOverride:
      canAffectNumericPricing
        ? {
            units: args.measurements?.units || "ft",
            totalSqft: Math.round(exactSqft),
            rows: args.measurements?.rows || [],
          }
        : null,
    paintScopeOverride: null,
    basisAssumptions: uniqStrings(
      [
        exactSqft > 0
          ? `Plan-aware drywall pricing used ${Math.round(exactSqft)} supported sqft for live numeric execution.`
          : null,
        isPatchRepair
          ? "Plan-aware drywall pricing preserved patch/repair routing instead of falling through to generic install interpretation."
          : null,
        isInstall
          ? "Plan-aware drywall pricing preserved install/hang routing before final pricing protections."
          : null,
        args.executionSections.includes("Finish / texture")
          ? "Finish / texture remained explicitly routed in drywall execution input assembly."
          : null,
        repeatedRepairSignal && !canAffectNumericPricing
          ? `Repeated-room repair support (${Math.round(repeatedRepairSignal.quantity || 0)} rooms) stayed review-only because it could not safely become patch counts or exact repair area.`
          : null,
      ],
      8
    ),
    notes: args.executionNotes,
  }
}

function buildWallcoveringInfluence(args: {
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  return {
    trade: "wallcovering",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing: false,
    scopeTextOverride: null,
    measurementsOverride: null,
    paintScopeOverride: null,
    basisAssumptions: uniqStrings(
      [
        "Wallcovering plan-aware routing is available, but live numeric pricing remains unchanged because there is no existing wallcovering engine to drive safely.",
      ],
      4
    ),
    notes: args.executionNotes,
  }
}

export function buildLiveTradePricingInfluence(args: {
  trade: string
  scopeText: string
  measurements: MeasurementInput | null
  paintScope: PaintScope | null
  planIntelligence: PlanIntelligence | null
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): LiveTradePricingInfluence {
  const trade = String(args.trade || "").trim().toLowerCase()
  if (trade !== "painting" && trade !== "drywall" && trade !== "wallcovering") {
    return null
  }
  if (!args.planIntelligence?.ok) return null

  const pipeline = buildPipeline({
    trade,
    scopeText: args.scopeText,
    planIntelligence: args.planIntelligence,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })

  if (!pipeline) return null

  if (trade === "painting") {
    return buildPaintingInfluence({
      scopeText: args.scopeText,
      measurements: args.measurements,
      paintScope: args.paintScope,
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  if (trade === "drywall") {
    return buildDrywallInfluence({
      scopeText: args.scopeText,
      measurements: args.measurements,
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  return buildWallcoveringInfluence({
    supportLevel: pipeline.supportLevel,
    executionSections: pipeline.executionSections,
    executionNotes: pipeline.executionNotes,
  })
}

export function mergeLiveTradePricingInfluenceIntoBasis(args: {
  basis: EstimateBasis | null
  influence: LiveTradePricingInfluence
}): EstimateBasis | null {
  if (!args.basis || !args.influence) return args.basis
  if (!args.influence.canAffectNumericPricing && args.influence.trade !== "wallcovering") {
    return args.basis
  }

  return {
    ...args.basis,
    assumptions: uniqStrings(
      [...(args.basis.assumptions || []), ...args.influence.basisAssumptions],
      18
    ),
  }
}
