import type { PlanIntelligence } from "../plans/types"
import type { PaintScope, EstimateBasis, MeasurementInput, TradeStack, ComplexityProfile } from "./types"
import { buildEstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "./estimateStructureConsumption"
import { buildTradePackagePricingPrep } from "./tradePackagePricingPrep"
import { buildTradeQuantitySupport, type TradeQuantitySignal, type TradeQuantitySupport } from "./tradeQuantitySupport"
import { buildTradePricingBasisBridge } from "./tradePricingBasisBridge"
import { buildTradePricingInputDraft } from "./tradePricingInputDraft"

type SupportedTrade = "painting" | "drywall" | "wallcovering"
type ExactTradeQuantitySupport = NonNullable<TradeQuantitySupport>

export type LiveTradePricingInfluence = {
  trade: SupportedTrade
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  canAffectNumericPricing: boolean
  paintScopeOverride: PaintScope | null
  engineInputs?: {
    painting?: {
      supportedRoomCount: number | null
      supportedDoorCount: number | null
      supportedTrimLf: number | null
      includeCeilings: boolean
      hasCorridorSection: boolean
      hasPrepProtectionSection: boolean
      interiorBaseSupport: "measured" | "scaled" | null
      doorCountSupport: "measured" | null
      trimSupport: "measured" | null
    }
    drywall?: {
      supportedSqft: number | null
      supportedPartitionLf: number | null
      includeCeilings: boolean
      forcePatchRepair: boolean
      forceInstallFinish: boolean
      hasFinishTextureSection: boolean
      supportedSqftSupport: "measured" | null
    }
    wallcovering?: {
      supportedSqft: number | null
      hasRemovalPrepSection: boolean
      hasInstallSection: boolean
      hasCorridorSection: boolean
      hasFeatureSection: boolean
      materialType: "vinyl" | "paper" | "unknown" | null
      supportedSqftSupport: "measured" | null
      blocker?: string | null
    }
  }
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

function buildPlanText(planIntelligence: PlanIntelligence | null): string {
  if (!planIntelligence?.ok) return ""
  return [
    ...(planIntelligence.notes || []),
    ...(planIntelligence.tradePackageSignals || []),
    ...(planIntelligence.packageScopeCandidates || []),
    ...(planIntelligence.analyses || []).flatMap((analysis) => [
      analysis.sheetTitle,
      ...(analysis.textSnippets || []),
      ...(analysis.notes || []),
      ...(analysis.schedules || []).flatMap((schedule) => [
        schedule.label,
        ...(schedule.notes || []),
      ]),
      ...(analysis.tradeFindings || []).flatMap((finding) => [
        finding.label,
        finding.notes || "",
      ]),
    ]),
  ]
    .filter(Boolean)
    .join(" \n ")
}

function detectWallcoveringMaterialType(
  scopeText: string,
  planText: string
): "vinyl" | "paper" | "unknown" {
  const text = `${scopeText}\n${planText}`.toLowerCase()
  if (
    /\b(vinyl wallcovering|vinyl type|type w[-\s]?\d+|type wc[-\s]?\d+|type vwc[-\s]?\d+)\b/.test(
      text
    )
  ) {
    return "vinyl"
  }
  if (/\b(wallpaper|paper wallcovering|patterned paper|fabric-backed paper)\b/.test(text)) {
    return "paper"
  }
  return "unknown"
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
  if (!tradePricingInputDraft) return null

  // The live numeric path stops here. Older staging layers still exist for
  // compatibility / trace surfaces elsewhere, but the route only needs support
  // level, normalized sections, and a small note set to build numeric-safe
  // engine inputs.
  return {
    tradeQuantitySupport,
    supportLevel: tradePricingInputDraft.supportLevel,
    executionSections: normalizeSections(tradePricingInputDraft.tradeScopePricingSections),
    executionNotes: uniqStrings(
      [
        ...tradePricingInputDraft.tradePricingInputDraft,
        ...tradePricingInputDraft.tradePricingInputNotes,
        ...tradeQuantitySupport.tradeQuantityReviewNotes,
      ],
      8
    ),
  }
}

function buildPaintingInfluence(args: {
  measurements: MeasurementInput | null
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

  const trimSignal = findExactSignal({
    signals: args.support.tradeLinearSignals,
    label: /\btrim\s*\/\s*frame linear support\b/i,
    unit: "linear_ft",
  })
  const measuredInteriorBase =
    Number(args.measurements?.totalSqft || 0) > 0 ||
    Number(findExactSignal({
      signals: args.support.tradeAreaSignals,
      label: /\bwall coverage support\b/i,
      unit: "sqft",
    })?.quantity || 0) > 0
  const scaledInteriorBase =
    args.supportLevel === "strong" && Number(roomSignal?.quantity || 0) > 0
  const hasBaseQuantity =
    measuredInteriorBase ||
    scaledInteriorBase ||
    Number(doorSignal?.quantity || 0) > 0

  const paintScopeOverride =
    args.executionSections.includes("Ceilings") && ceilingSignal ? "walls_ceilings" : null

  const canAffectNumericPricing = args.supportLevel !== "weak" && hasBaseQuantity

  return {
    trade: "painting",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    paintScopeOverride: canAffectNumericPricing ? paintScopeOverride : null,
    engineInputs:
      canAffectNumericPricing
        ? {
            painting: {
              supportedRoomCount: Number(roomSignal?.quantity || 0) > 0 ? Math.round(Number(roomSignal?.quantity || 0)) : null,
              supportedDoorCount:
                doorSignal &&
                args.executionSections.some((section) => /doors?\s*\/\s*frames/i.test(section))
                  ? Math.round(Number(doorSignal.quantity || 0))
                  : null,
              supportedTrimLf:
                trimSignal && args.executionSections.includes("Trim / casing")
                  ? Math.round(Number(trimSignal.quantity || 0))
                  : null,
              includeCeilings: paintScopeOverride === "walls_ceilings",
              hasCorridorSection: args.executionSections.includes("Corridor repaint"),
              hasPrepProtectionSection: args.executionSections.includes("Prep / protection"),
              interiorBaseSupport: measuredInteriorBase
                ? "measured"
                : scaledInteriorBase
                ? "scaled"
                : null,
              doorCountSupport:
                doorSignal &&
                args.executionSections.some((section) => /doors?\s*\/\s*frames/i.test(section))
                  ? "measured"
                  : null,
              trimSupport:
                trimSignal && args.executionSections.includes("Trim / casing")
                  ? "measured"
                  : null,
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        args.executionSections.includes("Ceilings") && ceilingSignal
          ? "Plan-aware pricing used ceiling support to route painting as walls plus ceilings."
          : null,
        roomSignal
          ? measuredInteriorBase
            ? `Plan-aware pricing kept ${Math.round(roomSignal.quantity || 0)} repeated room(s) as organization support while measured wall area remained the numeric basis.`
            : `Plan-aware pricing used ${Math.round(roomSignal.quantity || 0)} strongly supported repeated room(s) as scaled interior-base support.`
          : null,
        doorSignal &&
        args.executionSections.some((section) => /doors?\s*\/\s*frames/i.test(section))
          ? `Plan-aware pricing used ${Math.round(doorSignal.quantity || 0)} supported door opening(s) for separate door/frame routing.`
          : null,
        args.executionSections.includes("Corridor repaint")
          ? "Corridor repaint remains separately routed in plan-aware painting interpretation, even when current math still prices it inside the main paint run."
          : null,
        trimSignal && args.executionSections.includes("Trim / casing")
          ? `Plan-aware pricing used ${Math.round(Number(trimSignal.quantity || 0))} measured trim LF for live trim/casing numeric carry.`
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
  const measuredPatchSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\bmeasured patch\s*\/\s*repair area support\b/i,
    unit: "sqft",
  })
  const measuredAssemblySignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\bmeasured drywall assembly area support\b/i,
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
  const partitionSignal = findExactSignal({
    signals: args.support.tradeLinearSignals,
    label: /\bpartition linear support\b/i,
    unit: "linear_ft",
  })

  const isPatchRepair = args.executionSections.includes("Patch / repair")
  const isInstall = args.executionSections.includes("Install / hang")
  const includeCeilings = args.executionSections.includes("Ceiling drywall") && ceilingSignal
  const patchSqft =
    isPatchRepair && !isInstall
      ? Math.round(Number(measuredPatchSignal?.quantity || 0))
      : 0
  const installSqft =
    isInstall
      ? Math.round(
          Number(measuredAssemblySignal?.quantity || wallSignal?.quantity || 0) +
            Number(includeCeilings ? ceilingSignal?.quantity || 0 : 0)
        )
      : 0

  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    ((isInstall && installSqft > 0) || (isPatchRepair && patchSqft > 0))

  return {
    trade: "drywall",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    paintScopeOverride: null,
    engineInputs:
      canAffectNumericPricing
        ? {
            drywall: {
              supportedSqft:
                isInstall && installSqft > 0
                  ? installSqft
                  : isPatchRepair && patchSqft > 0
                  ? patchSqft
                  : null,
              supportedPartitionLf: partitionSignal ? Math.round(Number(partitionSignal.quantity || 0)) : null,
              includeCeilings: !!includeCeilings,
              forcePatchRepair: isPatchRepair,
              forceInstallFinish: isInstall,
              hasFinishTextureSection: args.executionSections.includes("Finish / texture"),
              supportedSqftSupport:
                (isInstall && installSqft > 0) || (isPatchRepair && patchSqft > 0)
                  ? "measured"
                  : null,
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        isInstall && installSqft > 0
          ? `Plan-aware drywall pricing used ${Math.round(installSqft)} measured/install-supported sqft for live numeric execution.`
          : null,
        isPatchRepair && patchSqft > 0
          ? `Plan-aware drywall pricing used ${Math.round(patchSqft)} measured repair sqft for patch/repair execution.`
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
        partitionSignal && isInstall
          ? `Plan-aware pricing used ${Math.round(Number(partitionSignal.quantity || 0))} supported partition LF to increase live install fragmentation burden without inventing board area.`
          : null,
        repeatedRepairSignal && !canAffectNumericPricing
          ? `Repeated-room repair support (${Math.round(repeatedRepairSignal.quantity || 0)} rooms) stayed review-only because it could not safely become patch counts or exact repair area.`
          : null,
        isPatchRepair && !patchSqft
          ? "Patch/repair routing stayed non-binding because no measured repair area was available."
          : null,
      ],
      8
    ),
    notes: args.executionNotes,
  }
}

function buildWallcoveringInfluence(args: {
  scopeText: string
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  executionNotes: string[]
  planIntelligence: PlanIntelligence | null
}): LiveTradePricingInfluence {
  const wallAreaSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    label: /\bwall-area support for wallcovering\b/i,
    unit: "sqft",
  })
  const planText = buildPlanText(args.planIntelligence)
  const materialType = detectWallcoveringMaterialType(args.scopeText, planText)
  const hasRemovalPrepSection = args.executionSections.includes("Removal / prep")
  const hasInstallSection = args.executionSections.includes("Install")
  const hasCorridorSection = args.executionSections.includes("Corridor wallcovering")
  const hasFeatureSection = args.executionSections.includes("Feature wall")
  const supportedSqft =
    wallAreaSignal && Number(wallAreaSignal.quantity || 0) > 0
      ? Math.round(Number(wallAreaSignal.quantity || 0))
      : null
  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    !!supportedSqft &&
    (hasRemovalPrepSection || (hasInstallSection && materialType !== "unknown"))

  return {
    trade: "wallcovering",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    paintScopeOverride: null,
    engineInputs:
      canAffectNumericPricing || supportedSqft || hasRemovalPrepSection || hasInstallSection
        ? {
            wallcovering: {
              supportedSqft,
              hasRemovalPrepSection,
              hasInstallSection,
              hasCorridorSection,
              hasFeatureSection,
              materialType: hasInstallSection ? materialType : null,
              supportedSqftSupport: supportedSqft ? "measured" : null,
              blocker:
                canAffectNumericPricing
                  ? null
                  : !supportedSqft
                    ? "Wallcovering sections were routed, but no exact supported wall area was available for safe numeric pricing."
                    : hasInstallSection && materialType === "unknown"
                      ? "Wallcovering install area is supported, but material type is still too vague for safe live numeric pricing."
                      : "Wallcovering routing is present, but live numeric execution still needs explicit install or removal/prep routing.",
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        supportedSqft
          ? `Plan-aware wallcovering pricing used ${supportedSqft} supported wallcovering sqft for live execution input assembly.`
          : null,
        hasRemovalPrepSection
          ? "Removal / prep remained explicitly routed in live wallcovering pricing."
          : null,
        hasInstallSection && materialType !== "unknown"
          ? `Wallcovering install remained numerically eligible because material type was identified as ${materialType}.`
          : null,
        !canAffectNumericPricing
          ? "Wallcovering plan-aware routing stayed non-binding because exact area, material type, or explicit install/remove routing was still too weak for safe live numeric pricing."
          : null,
      ],
      6
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
      measurements: args.measurements,
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  if (trade === "drywall") {
    return buildDrywallInfluence({
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  return buildWallcoveringInfluence({
    scopeText: args.scopeText,
    support: pipeline.tradeQuantitySupport,
    supportLevel: pipeline.supportLevel,
    executionSections: pipeline.executionSections,
    executionNotes: pipeline.executionNotes,
    planIntelligence: args.planIntelligence,
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
