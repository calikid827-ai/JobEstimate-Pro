import type { PlanIntelligence } from "../plans/types"
import {
  getTradeExecutionSectionIds,
  formatTradeExecutionSectionLabel,
  type PaintScope,
  type EstimateBasis,
  type MeasurementInput,
  type TradeStack,
  type ComplexityProfile,
} from "./types"
import { buildEstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "./estimateStructureConsumption"
import { buildTradePackagePricingPrep } from "./tradePackagePricingPrep"
import { buildTradeQuantitySupport, type TradeQuantitySignal, type TradeQuantitySupport } from "./tradeQuantitySupport"
import { buildTradePricingBasisBridge } from "./tradePricingBasisBridge"
import { buildTradePricingInputDraft } from "./tradePricingInputDraft"

type SupportedTrade =
  | "painting"
  | "drywall"
  | "wallcovering"
  | "flooring"
  | "electrical"
  | "plumbing"
type ExactTradeQuantitySupport = NonNullable<TradeQuantitySupport>

export type LiveTradePricingInfluence = {
  trade: SupportedTrade
  supportLevel: "strong" | "moderate" | "weak"
  executionSections: string[]
  canAffectNumericPricing: boolean
  paintScopeOverride: PaintScope | null
  engineInputs?: {
    painting?: {
      supportedInteriorSqft: number | null
      supportedWallSqft: number | null
      supportedCeilingSqft: number | null
      wallSupportSource: "trade_finding" | "takeoff" | null
      ceilingSupportSource: "trade_finding" | "takeoff" | null
      supportedRoomCount: number | null
      prototypeSupportSource: "repeated_space_rollup" | "takeoff" | "schedule" | null
      supportedDoorCount: number | null
      doorCountSource: "trade_finding" | "takeoff" | "schedule" | null
      supportedTrimLf: number | null
      trimSource: "trade_finding" | "takeoff" | null
      includeCeilings: boolean
      hasCorridorSection: boolean
      hasPrepProtectionSection: boolean
      interiorBaseSupport: "measured" | "scaled" | null
      doorCountSupport: "measured" | null
      trimSupport: "measured" | null
      prototypeRoomGroupLabel?: string | null
    }
    drywall?: {
      supportedSqft: number | null
      supportedFinishTextureSqft: number | null
      assemblySource: "trade_finding" | "takeoff" | null
      finishTextureSource: "trade_finding" | "takeoff" | null
      repairSource: "trade_finding" | null
      ceilingSource: "trade_finding" | "takeoff" | null
      supportedPartitionLf: number | null
      includeCeilings: boolean
      forcePatchRepair: boolean
      forceInstallFinish: boolean
      hasFinishTextureSection: boolean
      supportedSqftSupport: "measured" | null
      blocker?: string | null
    }
    wallcovering?: {
      supportedSqft: number | null
      coverageKind: "full_area" | "corridor_area" | "selected_elevation" | null
      areaSource: "trade_finding" | "takeoff" | null
      hasRemovalPrepSection: boolean
      hasInstallSection: boolean
      hasCorridorSection: boolean
      hasFeatureSection: boolean
      materialType: "vinyl" | "paper" | "unknown" | null
      supportedSqftSupport: "measured" | null
      blocker?: string | null
    }
    flooring?: {
      supportedFloorSqft: number | null
      supportedWallTileSqft: number | null
      supportedShowerTileSqft: number | null
      supportedBacksplashSqft: number | null
      supportedRemovalSqft: number | null
      supportedPrepSqft: number | null
      supportedBaseLf: number | null
      areaSource: "trade_finding" | "takeoff" | null
      hasFlooringSection: boolean
      hasWallTileSection: boolean
      hasShowerTileSection: boolean
      hasBacksplashSection: boolean
      hasRemovalDemoSection: boolean
      hasUnderlaymentPrepSection: boolean
      hasBaseSection: boolean
      wetAreaContext: boolean
      supportedSqftSupport: "measured" | null
      blocker?: string | null
    }
    electrical?: {
      supportedDeviceCount: number | null
      supportedReceptacleCount: number | null
      supportedSwitchCount: number | null
      supportedFixtureCount: number | null
      countSource: "trade_finding" | "schedule" | "takeoff" | null
      hasDevicesSection: boolean
      roughInCue: boolean
      trimOutCue: boolean
      supportedCountSupport: "measured" | null
      blocker?: string | null
    }
    plumbing?: {
      supportedFixtureCount: number | null
      supportedToiletCount: number | null
      supportedFaucetCount: number | null
      countSource: "trade_finding" | "schedule" | "takeoff" | null
      hasFixtureSection: boolean
      roughInCue: boolean
      trimOutCue: boolean
      wetAreaContext: boolean
      supportedCountSupport: "measured" | null
      blocker?: string | null
    }
  }
  basisAssumptions: string[]
  notes: string[]
} | null

export function selectTradeScopedSplitMeasurements(args: {
  trade: string
  fallbackMeasurements: MeasurementInput | { totalSqft?: number | null } | null
  influence: LiveTradePricingInfluence
  hasPlanIntelligence: boolean
}): { totalSqft: number } | null {
  if (!args.hasPlanIntelligence) {
    const fallbackSqft = Number(args.fallbackMeasurements?.totalSqft || 0)
    return fallbackSqft > 0 ? { totalSqft: Math.round(fallbackSqft) } : null
  }

  if (args.trade === "painting" && args.influence?.trade === "painting") {
    const measuredInteriorSqft = Number(
      args.influence.engineInputs?.painting?.supportedInteriorSqft || 0
    )
    if (measuredInteriorSqft > 0) {
      return { totalSqft: Math.round(measuredInteriorSqft) }
    }
    return null
  }

  if (args.trade === "drywall" && args.influence?.trade === "drywall") {
    const measuredDrywallSqft = Number(args.influence.engineInputs?.drywall?.supportedSqft || 0)
    const hasTradeScopedDrywallSupport =
      args.influence.engineInputs?.drywall?.assemblySource === "trade_finding" ||
      args.influence.engineInputs?.drywall?.finishTextureSource === "trade_finding" ||
      args.influence.engineInputs?.drywall?.ceilingSource === "trade_finding" ||
      args.influence.engineInputs?.drywall?.repairSource === "trade_finding"
    if (
      args.influence.canAffectNumericPricing &&
      measuredDrywallSqft > 0 &&
      hasTradeScopedDrywallSupport
    ) {
      return { totalSqft: Math.round(measuredDrywallSqft) }
    }
    return null
  }

  if (args.trade === "wallcovering" && args.influence?.trade === "wallcovering") {
    return null
  }

  if (args.trade === "flooring" && args.influence?.trade === "flooring") {
    const measuredFloorSqft = Number(args.influence.engineInputs?.flooring?.supportedFloorSqft || 0)
    if (measuredFloorSqft > 0) {
      return { totalSqft: Math.round(measuredFloorSqft) }
    }
    return null
  }

  if (args.trade === "electrical" || args.trade === "plumbing") {
    return null
  }

  return null
}

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

function extractPrototypeRoomGroupLabel(signal: TradeQuantitySignal | null): string | null {
  if (!signal?.label) return null
  return String(signal.label)
    .replace(/^Repeated\s+/i, "")
    .replace(/\s+prototype support$/i, "")
    .trim() || null
}

function findExactSignal(args: {
  signals: TradeQuantitySignal[]
  categories?: Array<NonNullable<TradeQuantitySignal["category"]>>
  label: RegExp
  unit?: TradeQuantitySignal["unit"]
}): TradeQuantitySignal | null {
  return (
    args.signals.find(
      (signal) =>
        signal.exactQuantity &&
        ((!args.categories || (signal.category ? args.categories.includes(signal.category) : false)) ||
          args.label.test(signal.label)) &&
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
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
} | null {
  if (
    args.trade === "flooring" ||
    args.trade === "electrical" ||
    args.trade === "plumbing"
  ) {
    const estimateSkeletonHandoff = buildEstimateSkeletonHandoff(args.planIntelligence)
    const estimateStructureConsumption = buildEstimateStructureConsumption(
      estimateSkeletonHandoff
    )
    const tradeQuantitySupport = buildTradeQuantitySupport({
      trade: args.trade,
      scopeText: args.scopeText,
      planIntelligence: args.planIntelligence,
      estimateSkeletonHandoff,
      estimateStructureConsumption,
      tradePackagePricingPrep: null,
    })
    if (!tradeQuantitySupport) return null

    const executionSections =
      args.trade === "flooring"
        ? uniqStrings(
            [
              tradeQuantitySupport.tradeAreaSignals.some((item) => item.category === "floor_area" && item.exactQuantity)
                ? formatTradeExecutionSectionLabel("flooring", "flooring")
                : null,
              tradeQuantitySupport.tradeAreaSignals.some((item) => item.category === "wall_tile_area" && item.exactQuantity)
                ? formatTradeExecutionSectionLabel("flooring", "wall_tile")
                : null,
              tradeQuantitySupport.tradeAreaSignals.some((item) => item.category === "shower_tile_area" && item.exactQuantity)
                ? formatTradeExecutionSectionLabel("flooring", "shower_tile")
                : null,
              tradeQuantitySupport.tradeAreaSignals.some((item) => item.category === "backsplash_area" && item.exactQuantity)
                ? formatTradeExecutionSectionLabel("flooring", "backsplash_tile")
                : null,
              tradeQuantitySupport.tradeAreaSignals.some((item) => item.category === "demolition_area" && item.exactQuantity)
                ? formatTradeExecutionSectionLabel("flooring", "removal_demo")
                : null,
              tradeQuantitySupport.tradeAreaSignals.some((item) => item.category === "underlayment_prep_area")
                ? formatTradeExecutionSectionLabel("flooring", "underlayment_prep")
                : null,
              tradeQuantitySupport.tradeLinearSignals.some((item) => item.category === "base_lf" && item.exactQuantity)
                ? formatTradeExecutionSectionLabel("flooring", "base_trim")
                : null,
            ],
            8
          )
        : args.trade === "electrical"
          ? uniqStrings(
              [
                tradeQuantitySupport.tradeCountSignals.some((item) => item.exactQuantity)
                  ? formatTradeExecutionSectionLabel("electrical", "devices_fixtures")
                  : null,
              ],
              6
            )
          : uniqStrings(
              [
                tradeQuantitySupport.tradeCountSignals.some((item) => item.exactQuantity)
                  ? formatTradeExecutionSectionLabel("plumbing", "fixture_trim_out")
                  : null,
              ],
              6
            )

    return {
      tradeQuantitySupport,
      supportLevel: tradeQuantitySupport.supportLevel,
      certaintyLevel: tradeQuantitySupport.tradeCertainty.level,
      certaintyReasons: tradeQuantitySupport.tradeCertainty.reasons,
      executionSections,
      executionNotes: uniqStrings(
        [
          ...tradeQuantitySupport.tradeQuantityReviewNotes,
          ...tradeQuantitySupport.tradeCertainty.reasons,
        ],
        8
      ),
    }
  }

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
    certaintyLevel: tradeQuantitySupport.tradeCertainty.level,
    certaintyReasons: tradeQuantitySupport.tradeCertainty.reasons,
    executionSections: normalizeSections(tradePricingInputDraft.tradeScopePricingSections),
    executionNotes: uniqStrings(
      [
        ...tradePricingInputDraft.tradePricingInputDraft,
        ...tradePricingInputDraft.tradePricingInputNotes,
        ...tradeQuantitySupport.tradeQuantityReviewNotes,
        ...tradeQuantitySupport.tradeCertainty.reasons,
      ],
      8
    ),
  }
}

function buildPaintingInfluence(args: {
  measurements: MeasurementInput | null
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const executionSectionIds = getTradeExecutionSectionIds("painting", args.executionSections)
  const roomSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["repeated_unit_count"],
    label: /\brepeated (room package|unit prototype) support\b/i,
    unit: "rooms",
  })
  const doorSignal = findExactSignal({
    signals: args.support.tradeOpeningSignals,
    categories: ["door_openings"],
    label: /\bdoor opening support\b/i,
    unit: "doors",
  })
  const ceilingSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["ceiling_area"],
    label: /\bceiling coverage support\b/i,
    unit: "sqft",
  })

  const trimSignal = findExactSignal({
    signals: args.support.tradeLinearSignals,
    categories: ["trim_lf"],
    label: /\btrim\s*\/\s*frame linear support\b/i,
    unit: "linear_ft",
  })
  const wallSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["wall_area"],
    label: /\bwall coverage support\b/i,
    unit: "sqft",
  })
  const measuredInteriorBase =
    Number(args.measurements?.totalSqft || 0) > 0 ||
    Number(wallSignal?.quantity || 0) > 0
  const scaledInteriorBase =
    args.supportLevel === "strong" && Number(roomSignal?.quantity || 0) > 0
  const hasBaseQuantity =
    measuredInteriorBase ||
    scaledInteriorBase ||
    Number(doorSignal?.quantity || 0) > 0

  const paintScopeOverride =
    executionSectionIds.includes("ceilings") && ceilingSignal ? "walls_ceilings" : null

  const canAffectNumericPricing = args.supportLevel !== "weak" && hasBaseQuantity
  const supportedWallSqft =
    wallSignal && Number(wallSignal.quantity || 0) > 0
      ? Math.round(Number(wallSignal.quantity || 0))
      : null
  const supportedCeilingSqft =
    executionSectionIds.includes("ceilings") &&
    ceilingSignal &&
    Number(ceilingSignal.quantity || 0) > 0
      ? Math.round(Number(ceilingSignal.quantity || 0))
      : null

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
              supportedInteriorSqft:
                !supportedWallSqft && Number(args.measurements?.totalSqft || 0) > 0
                  ? Math.round(Number(args.measurements?.totalSqft || 0))
                  : null,
              supportedWallSqft,
              supportedCeilingSqft,
              wallSupportSource: wallSignal?.source === "trade_finding" ? "trade_finding" : wallSignal?.source === "takeoff" ? "takeoff" : null,
              ceilingSupportSource:
                ceilingSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : ceilingSignal?.source === "takeoff"
                    ? "takeoff"
                    : null,
              supportedRoomCount:
                !measuredInteriorBase && Number(roomSignal?.quantity || 0) > 0
                  ? Math.round(Number(roomSignal?.quantity || 0))
                  : null,
              prototypeSupportSource:
                roomSignal?.source === "room_signal" || roomSignal?.source === "takeoff"
                  ? "repeated_space_rollup"
                  : roomSignal?.source === "schedule"
                    ? "schedule"
                    : null,
              supportedDoorCount:
                doorSignal &&
                executionSectionIds.includes("doors_frames")
                  ? Math.round(Number(doorSignal.quantity || 0))
                  : null,
              doorCountSource:
                doorSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : doorSignal?.source === "schedule"
                    ? "schedule"
                    : doorSignal?.source === "takeoff"
                      ? "takeoff"
                      : null,
              supportedTrimLf:
                trimSignal && executionSectionIds.includes("trim_casing")
                  ? Math.round(Number(trimSignal.quantity || 0))
                  : null,
              trimSource:
                trimSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : trimSignal?.source === "takeoff"
                    ? "takeoff"
                    : null,
              includeCeilings: paintScopeOverride === "walls_ceilings",
              hasCorridorSection: executionSectionIds.includes("corridor_repaint"),
              hasPrepProtectionSection: executionSectionIds.includes("prep_protection"),
              interiorBaseSupport: measuredInteriorBase
                ? "measured"
                : scaledInteriorBase
                ? "scaled"
                : null,
              doorCountSupport:
                doorSignal &&
                executionSectionIds.includes("doors_frames")
                  ? "measured"
                  : null,
              trimSupport:
                trimSignal && executionSectionIds.includes("trim_casing")
                  ? "measured"
                  : null,
              prototypeRoomGroupLabel: extractPrototypeRoomGroupLabel(roomSignal),
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        executionSectionIds.includes("ceilings") && ceilingSignal
          ? "Plan-aware pricing used ceiling support to route painting as walls plus ceilings."
          : null,
        roomSignal
          ? measuredInteriorBase
            ? `Plan-aware pricing kept ${Math.round(roomSignal.quantity || 0)} repeated ${String(roomSignal.label || "room").replace(/^Repeated\s+/i, "").replace(/\s+prototype support$/i, "")} as organization support while measured wall area remained the numeric basis.`
            : `Plan-aware pricing used ${Math.round(roomSignal.quantity || 0)} strongly supported ${String(roomSignal.label || "unit/room prototype").replace(/^Repeated\s+/i, "").replace(/\s+prototype support$/i, "")} as scaled interior-base support.`
          : null,
        wallSignal
          ? supportedCeilingSqft
            ? `Plan-aware pricing used ${supportedWallSqft} measured wall sqft and ${supportedCeilingSqft} measured ceiling sqft for painting execution input assembly.`
            : `Plan-aware pricing used ${Math.round(Number(wallSignal.quantity || 0))} measured wall-area sqft for painting execution input assembly.`
          : null,
        doorSignal &&
        executionSectionIds.includes("doors_frames")
          ? `Plan-aware pricing used ${Math.round(doorSignal.quantity || 0)} supported door opening(s) for separate door/frame routing.`
          : null,
        executionSectionIds.includes("corridor_repaint")
          ? "Corridor repaint remains separately routed in plan-aware painting interpretation, even when current math still prices it inside the main paint run."
          : null,
        roomSignal && executionSectionIds.includes("corridor_repaint")
          ? "Repeated-unit prototype support stayed separate from corridor/common-area burden routing."
          : null,
        trimSignal && executionSectionIds.includes("trim_casing")
          ? `Plan-aware pricing used ${Math.round(Number(trimSignal.quantity || 0))} measured trim LF for live trim/casing numeric carry.`
          : null,
        !canAffectNumericPricing
          ? "Plan-aware painting routing stayed non-binding because the available signals could not safely drive numeric pricing inputs."
          : null,
        `Painting trade certainty stayed ${args.certaintyLevel} at the live seam.`,
        ...args.certaintyReasons,
      ],
      8
    ),
    notes: args.executionNotes,
  }
}

function buildDrywallInfluence(args: {
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const executionSectionIds = getTradeExecutionSectionIds("drywall", args.executionSections)
  const wallSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["assembly_area"],
    label: /\bwall-area drywall support\b/i,
    unit: "sqft",
  })
  const measuredPatchSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["repair_area"],
    label: /\bmeasured patch\s*\/\s*repair area support\b/i,
    unit: "sqft",
  })
  const measuredAssemblySignalRaw = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["assembly_area"],
    label: /\bmeasured drywall assembly area support\b/i,
    unit: "sqft",
  })
  const measuredAssemblySignal =
    measuredAssemblySignalRaw?.source === "trade_finding" ? measuredAssemblySignalRaw : null
  const measuredFinishSignalRaw = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["finish_texture_area"],
    label: /\bmeasured finish\s*\/\s*texture area support\b/i,
    unit: "sqft",
  })
  const measuredFinishSignal =
    measuredFinishSignalRaw?.source === "trade_finding" ? measuredFinishSignalRaw : null
  const measuredCeilingSignalRaw = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["ceiling_area"],
    label: /\bmeasured ceiling drywall area support\b/i,
    unit: "sqft",
  })
  const measuredCeilingSignal =
    measuredCeilingSignalRaw?.source === "trade_finding" ? measuredCeilingSignalRaw : null
  const ceilingSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["ceiling_area"],
    label: /\bceiling drywall support\b/i,
    unit: "sqft",
  })
  const repeatedRepairSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["repeated_unit_count"],
    label: /\brepeated room repair pattern support\b/i,
    unit: "rooms",
  })
  const partitionSignal = findExactSignal({
    signals: args.support.tradeLinearSignals,
    categories: ["partition_lf"],
    label: /\bpartition linear support\b/i,
    unit: "linear_ft",
  })

  const isPatchRepair = executionSectionIds.includes("patch_repair")
  const isInstall = executionSectionIds.includes("install_hang")
  const includeCeilings = executionSectionIds.includes("ceiling_drywall") && ceilingSignal
  const patchSqft =
    isPatchRepair
      ? Math.round(Number(measuredPatchSignal?.quantity || 0))
      : 0
  const forcePatchRepair = isPatchRepair && patchSqft > 0
  const hasMeasuredInstallEvidence =
    Number(measuredAssemblySignal?.quantity || 0) > 0 ||
    Number(measuredFinishSignal?.quantity || 0) > 0 ||
    Number(measuredCeilingSignal?.quantity || 0) > 0 ||
    Number(ceilingSignal?.quantity || 0) > 0
  const repairOnlyPattern =
    Number(repeatedRepairSignal?.quantity || 0) > 0 &&
    Number(measuredPatchSignal?.quantity || 0) <= 0 &&
    !hasMeasuredInstallEvidence
  const mixedRepairInstallWithoutMeasuredRepair =
    isPatchRepair &&
    isInstall &&
    Number(measuredPatchSignal?.quantity || 0) <= 0
  const installOnlyFromGenericWallTakeoff =
    Number(wallSignal?.quantity || 0) > 0 &&
    !hasMeasuredInstallEvidence &&
    Number(partitionSignal?.quantity || 0) <= 0
  const hasSafeInstallBasis =
    !repairOnlyPattern &&
    !installOnlyFromGenericWallTakeoff &&
    (hasMeasuredInstallEvidence ||
      (!forcePatchRepair &&
        !isPatchRepair &&
        Number(partitionSignal?.quantity || 0) > 0 &&
        (Number(measuredAssemblySignal?.quantity || 0) > 0 ||
          Number(measuredFinishSignal?.quantity || 0) > 0 ||
          Number(measuredCeilingSignal?.quantity || 0) > 0)))
  const installSqft =
    isInstall && hasSafeInstallBasis
      ? Math.round(
          Number(
            measuredAssemblySignal?.quantity ||
              measuredFinishSignal?.quantity ||
              measuredCeilingSignal?.quantity ||
              (!forcePatchRepair && !mixedRepairInstallWithoutMeasuredRepair ? ceilingSignal?.quantity : 0) ||
              0
          ) +
            Number(
              includeCeilings &&
                (measuredAssemblySignal?.quantity || measuredFinishSignal?.quantity)
                ? measuredCeilingSignal?.quantity || ceilingSignal?.quantity || 0
                : 0
            )
        )
      : 0

  const forceInstallFinish = isInstall && installSqft > 0
  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    (forceInstallFinish || forcePatchRepair)

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
              supportedFinishTextureSqft:
                executionSectionIds.includes("finish_texture") &&
                measuredFinishSignal &&
                Number(measuredFinishSignal.quantity || 0) > 0
                  ? Math.round(Number(measuredFinishSignal.quantity || 0))
                  : null,
              assemblySource:
                measuredAssemblySignal?.source === "trade_finding"
                  ? "trade_finding"
                  : wallSignal?.source === "takeoff"
                    ? "takeoff"
                    : null,
              finishTextureSource:
                measuredFinishSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : null,
              repairSource:
                measuredPatchSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : null,
              ceilingSource:
                measuredCeilingSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : ceilingSignal?.source === "takeoff"
                    ? "takeoff"
                    : null,
              supportedPartitionLf: partitionSignal ? Math.round(Number(partitionSignal.quantity || 0)) : null,
              includeCeilings: !!includeCeilings,
              forcePatchRepair,
              forceInstallFinish,
              hasFinishTextureSection: executionSectionIds.includes("finish_texture"),
              supportedSqftSupport:
                (isInstall && installSqft > 0) || (isPatchRepair && patchSqft > 0)
                  ? "measured"
                  : null,
              blocker:
                !canAffectNumericPricing && isPatchRepair && !patchSqft
                  ? "Patch/repair wording was present, but no measured repair area existed, so repair routing stayed non-binding."
                  : !canAffectNumericPricing && installOnlyFromGenericWallTakeoff
                    ? "Install-like drywall wording aligned only to generic wall takeoff, so live numeric install routing stayed blocked until measured assembly, finish, or ceiling area existed."
                    : !canAffectNumericPricing && mixedRepairInstallWithoutMeasuredRepair
                      ? "Mixed repair/install drywall cues stayed conservative because repair wording lacked measured repair area."
                      : null,
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        isInstall && installSqft > 0
          ? `Plan-aware drywall pricing used ${Math.round(installSqft)} measured/install-supported sqft for live numeric execution.`
          : null,
        measuredCeilingSignal && includeCeilings
          ? `Plan-aware drywall pricing used ${Math.round(Number(measuredCeilingSignal.quantity || 0))} measured ceiling drywall sqft for ceiling inclusion.`
          : null,
        measuredFinishSignal && executionSectionIds.includes("finish_texture")
          ? `Plan-aware drywall pricing used ${Math.round(Number(measuredFinishSignal.quantity || 0))} measured finish/texture sqft for finish routing.`
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
        executionSectionIds.includes("finish_texture")
          ? "Finish / texture remained explicitly routed in drywall execution input assembly."
          : null,
        partitionSignal && isInstall
          ? `Plan-aware pricing used ${Math.round(Number(partitionSignal.quantity || 0))} supported partition LF to increase live install fragmentation burden without inventing board area.`
          : null,
        repeatedRepairSignal && !canAffectNumericPricing
          ? `Repeated-room repair support (${Math.round(repeatedRepairSignal.quantity || 0)} rooms) stayed review-only because it could not safely become patch counts or exact repair area.`
          : null,
        mixedRepairInstallWithoutMeasuredRepair && hasMeasuredInstallEvidence
          ? "Repair wording stayed non-binding because repair area was not measured, so only measured install/finish support remained eligible."
          : null,
        isPatchRepair && !patchSqft
          ? "Patch/repair routing stayed non-binding because no measured repair area was available."
          : null,
        installOnlyFromGenericWallTakeoff
          ? "Install-like drywall wording stayed non-binding because only generic wall takeoff was available, without measured assembly/finish/ceiling support."
          : null,
        `Drywall trade certainty stayed ${args.certaintyLevel} at the live seam.`,
        ...args.certaintyReasons,
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
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
  planIntelligence: PlanIntelligence | null
}): LiveTradePricingInfluence {
  const executionSectionIds = getTradeExecutionSectionIds("wallcovering", args.executionSections)
  const wallAreaSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["wall_area"],
    label: /\bwall-area support for wallcovering\b/i,
    unit: "sqft",
  })
  const corridorAreaSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["corridor_area"],
    label: /\bcorridor wallcovering area support\b/i,
    unit: "sqft",
  })
  const selectedElevationSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["selected_elevation_area"],
    label: /\bselected-elevation wallcovering area support\b/i,
    unit: "sqft",
  })
  const planText = buildPlanText(args.planIntelligence)
  const materialType = detectWallcoveringMaterialType(args.scopeText, planText)
  const hasRemovalPrepSection = executionSectionIds.includes("removal_prep")
  const hasInstallSection = executionSectionIds.includes("install")
  const hasCorridorSection = executionSectionIds.includes("corridor_wallcovering")
  const hasFeatureSection = executionSectionIds.includes("feature_wall")
  const coverageKind =
    selectedElevationSignal && Number(selectedElevationSignal.quantity || 0) > 0
      ? "selected_elevation"
      : corridorAreaSignal && Number(corridorAreaSignal.quantity || 0) > 0
        ? "corridor_area"
        : wallAreaSignal && Number(wallAreaSignal.quantity || 0) > 0
          ? "full_area"
          : null
  const supportedSqft =
    coverageKind === "selected_elevation"
      ? Math.round(Number(selectedElevationSignal?.quantity || 0))
      : coverageKind === "corridor_area"
        ? Math.round(Number(corridorAreaSignal?.quantity || 0))
        : wallAreaSignal && Number(wallAreaSignal.quantity || 0) > 0
          ? Math.round(Number(wallAreaSignal.quantity || 0))
          : null
  const ambiguousNarrowCoverage =
    !!supportedSqft &&
    coverageKind === "full_area" &&
    (hasCorridorSection || hasFeatureSection)
  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    !!supportedSqft &&
    !ambiguousNarrowCoverage &&
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
              coverageKind,
              areaSource:
                selectedElevationSignal?.source === "trade_finding" ||
                corridorAreaSignal?.source === "trade_finding" ||
                wallAreaSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : wallAreaSignal?.source === "takeoff"
                    ? "takeoff"
                    : null,
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
                    : ambiguousNarrowCoverage
                      ? "A full-area wallcovering quantity existed, but corridor/feature scope stayed unresolved, so direct numeric routing remained non-binding."
                    : hasInstallSection && materialType === "unknown"
                      ? "Wallcovering install area is supported, but material type is still too vague for safe live numeric pricing."
                      : "Wallcovering routing is present, but live numeric execution still needs explicit install or removal/prep routing.",
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        supportedSqft
          ? coverageKind === "selected_elevation"
            ? `Plan-aware wallcovering pricing used ${supportedSqft} measured selected-elevation sqft for live execution input assembly.`
            : coverageKind === "corridor_area"
              ? `Plan-aware wallcovering pricing used ${supportedSqft} measured corridor/common-area sqft for live execution input assembly.`
              : `Plan-aware wallcovering pricing used ${supportedSqft} supported wallcovering sqft for live execution input assembly.`
          : null,
        hasRemovalPrepSection
          ? "Removal / prep remained explicitly routed in live wallcovering pricing."
          : null,
        hasInstallSection && materialType !== "unknown"
          ? `Wallcovering install remained numerically eligible because material type was identified as ${materialType}.`
          : null,
        ambiguousNarrowCoverage
          ? "Wallcovering stayed non-binding because full-area quantity conflicted with narrower corridor/feature scope that was not explicitly measured."
          : null,
        !canAffectNumericPricing
          ? "Wallcovering plan-aware routing stayed non-binding because exact area, material type, or explicit install/remove routing was still too weak for safe live numeric pricing."
          : null,
        `Wallcovering trade certainty stayed ${args.certaintyLevel} at the live seam.`,
        ...args.certaintyReasons,
      ],
      6
    ),
    notes: args.executionNotes,
  }
}

function buildFlooringInfluence(args: {
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const executionSectionIds = getTradeExecutionSectionIds("flooring", args.executionSections)
  const floorSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["floor_area"],
    label: /\bmeasured floor area support\b/i,
    unit: "sqft",
  })
  const wallTileSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["wall_tile_area"],
    label: /\bmeasured wall tile area support\b/i,
    unit: "sqft",
  })
  const showerTileSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["shower_tile_area"],
    label: /\bmeasured shower tile area support\b/i,
    unit: "sqft",
  })
  const backsplashSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["backsplash_area"],
    label: /\bmeasured backsplash tile area support\b/i,
    unit: "sqft",
  })
  const removalSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["demolition_area"],
    label: /\bmeasured flooring\/tile removal area support\b/i,
    unit: "sqft",
  })
  const prepSignal = findExactSignal({
    signals: args.support.tradeAreaSignals,
    categories: ["underlayment_prep_area"],
    label: /\bmeasured underlayment \/ prep support\b/i,
    unit: "sqft",
  })
  const baseSignal = findExactSignal({
    signals: args.support.tradeLinearSignals,
    categories: ["base_lf"],
    label: /\bmeasured base \/ trim linear support\b/i,
    unit: "linear_ft",
  })

  const hasFlooringSection = executionSectionIds.includes("flooring")
  const hasWallTileSection = executionSectionIds.includes("wall_tile")
  const hasShowerTileSection = executionSectionIds.includes("shower_tile")
  const hasBacksplashSection = executionSectionIds.includes("backsplash_tile")
  const hasRemovalDemoSection = executionSectionIds.includes("removal_demo")
  const hasUnderlaymentPrepSection = executionSectionIds.includes("underlayment_prep")
  const hasBaseSection = executionSectionIds.includes("base_trim")
  const hasRemovalCue = args.support.tradeAreaSignals.some((item) => item.category === "demolition_area")
  const hasPrepCue = args.support.tradeAreaSignals.some((item) => item.category === "underlayment_prep_area")
  const wetAreaContext = hasShowerTileSection
  const supportedFloorSqft =
    hasFlooringSection && Number(floorSignal?.quantity || 0) > 0
      ? Math.round(Number(floorSignal?.quantity || 0))
      : null
  const supportedWallTileSqft =
    hasWallTileSection && Number(wallTileSignal?.quantity || 0) > 0
      ? Math.round(Number(wallTileSignal?.quantity || 0))
      : null
  const supportedShowerTileSqft =
    hasShowerTileSection && Number(showerTileSignal?.quantity || 0) > 0
      ? Math.round(Number(showerTileSignal?.quantity || 0))
      : null
  const supportedBacksplashSqft =
    hasBacksplashSection && Number(backsplashSignal?.quantity || 0) > 0
      ? Math.round(Number(backsplashSignal?.quantity || 0))
      : null
  const supportedRemovalSqft =
    hasRemovalDemoSection && Number(removalSignal?.quantity || 0) > 0
      ? Math.round(Number(removalSignal?.quantity || 0))
      : null
  const supportedPrepSqft =
    hasUnderlaymentPrepSection && Number(prepSignal?.quantity || 0) > 0
      ? Math.round(Number(prepSignal?.quantity || 0))
      : null
  const supportedBaseLf =
    hasBaseSection && Number(baseSignal?.quantity || 0) > 0
      ? Math.round(Number(baseSignal?.quantity || 0))
      : null
  const hasDirectScopedArea =
    !!supportedFloorSqft || !!supportedWallTileSqft || !!supportedShowerTileSqft || !!supportedBacksplashSqft
  const canAffectNumericPricing = args.supportLevel !== "weak" && hasDirectScopedArea

  return {
    trade: "flooring",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    paintScopeOverride: null,
    engineInputs:
      canAffectNumericPricing || !!supportedRemovalSqft || !!supportedPrepSqft || !!supportedBaseLf
        ? {
            flooring: {
              supportedFloorSqft,
              supportedWallTileSqft,
              supportedShowerTileSqft,
              supportedBacksplashSqft,
              supportedRemovalSqft,
              supportedPrepSqft,
              supportedBaseLf,
              areaSource:
                floorSignal?.source === "trade_finding" ||
                wallTileSignal?.source === "trade_finding" ||
                showerTileSignal?.source === "trade_finding" ||
                backsplashSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : floorSignal?.source === "takeoff"
                    ? "takeoff"
                    : null,
              hasFlooringSection,
              hasWallTileSection,
              hasShowerTileSection,
              hasBacksplashSection,
              hasRemovalDemoSection,
              hasUnderlaymentPrepSection,
              hasBaseSection,
              wetAreaContext,
              supportedSqftSupport: hasDirectScopedArea ? "measured" : null,
              blocker:
                canAffectNumericPricing
                  ? null
                  : hasRemovalDemoSection && !supportedRemovalSqft
                    ? "Flooring/tile removal wording was routed, but no measured removal area existed, so removal stayed non-binding."
                    : wetAreaContext && !supportedShowerTileSqft
                      ? "Wet-area tile cues were present, but exact shower tile coverage was not measured, so numeric routing stayed non-binding."
                      : hasWallTileSection && !supportedWallTileSqft
                        ? "Wall-tile cues were present, but exact wall-tile coverage was not measured, so flooring rows did not inherit wall tile authority."
                        : hasBacksplashSection && !supportedBacksplashSqft
                          ? "Backsplash cues were present, but exact backsplash coverage was not measured."
                          : "Flooring/tile routing stayed non-binding because only weak or ambiguous support existed.",
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        supportedFloorSqft
          ? `Plan-aware flooring pricing used ${supportedFloorSqft} measured floor-area sqft for live execution input assembly.`
          : null,
        supportedWallTileSqft
          ? `Plan-aware flooring pricing used ${supportedWallTileSqft} measured wall-tile sqft without inflating floor-area scope.`
          : null,
        supportedShowerTileSqft
          ? `Plan-aware flooring pricing used ${supportedShowerTileSqft} measured shower/wet-area tile sqft as a narrow direct section.`
          : null,
        supportedBacksplashSqft
          ? `Plan-aware flooring pricing used ${supportedBacksplashSqft} measured backsplash tile sqft and kept it narrower than broad kitchen wall area.`
          : null,
        hasRemovalDemoSection && !supportedRemovalSqft
          ? "Removal/demo stayed non-binding because no measured removal area was available."
          : null,
        hasRemovalCue && !supportedRemovalSqft
          ? "Removal/demo stayed non-binding because no measured removal area was available."
          : null,
        wetAreaContext && !supportedShowerTileSqft
          ? "Wet-area tile stayed non-binding because exact shower tile support was not measured."
          : null,
        hasPrepCue && !supportedPrepSqft
          ? "Prep / underlayment remained support-only because measured prep area was not available."
          : null,
        `Flooring trade certainty stayed ${args.certaintyLevel} at the live seam.`,
        ...args.certaintyReasons,
      ],
      8
    ),
    notes: args.executionNotes,
  }
}

function buildElectricalInfluence(args: {
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const executionSectionIds = getTradeExecutionSectionIds("electrical", args.executionSections)
  const deviceSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["device_count"],
    label: /\bdevice count support\b/i,
    unit: "devices",
  })
  const receptacleSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["receptacle_count"],
    label: /\breceptacle count support\b/i,
    unit: "devices",
  })
  const switchSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["switch_count"],
    label: /\bswitch count support\b/i,
    unit: "devices",
  })
  const fixtureSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["electrical_fixture_count"],
    label: /\bfixture count support\b/i,
    unit: "fixtures",
  })
  const roughInCue = args.support.tradeCoverageHints.some((item) => /\brough-in\b/i.test(item))
  const trimOutCue = args.support.tradeCoverageHints.some((item) => /\btrim-out\b/i.test(item))
  const supportedDeviceCount =
    deviceSignal?.quantity != null
      ? Math.round(Number(deviceSignal.quantity || 0))
      : Math.round(
          Number(receptacleSignal?.quantity || 0) +
            Number(switchSignal?.quantity || 0) +
            Number(fixtureSignal?.quantity || 0)
        ) || null
  const hasDevicesSection = executionSectionIds.includes("devices_fixtures")
  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    hasDevicesSection &&
    Number(supportedDeviceCount || 0) > 0

  return {
    trade: "electrical",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    paintScopeOverride: null,
    engineInputs:
      canAffectNumericPricing || roughInCue || trimOutCue
        ? {
            electrical: {
              supportedDeviceCount,
              supportedReceptacleCount:
                receptacleSignal?.quantity != null ? Math.round(Number(receptacleSignal.quantity || 0)) : null,
              supportedSwitchCount:
                switchSignal?.quantity != null ? Math.round(Number(switchSignal.quantity || 0)) : null,
              supportedFixtureCount:
                fixtureSignal?.quantity != null ? Math.round(Number(fixtureSignal.quantity || 0)) : null,
              countSource:
                deviceSignal?.source === "trade_finding" ||
                receptacleSignal?.source === "trade_finding" ||
                switchSignal?.source === "trade_finding" ||
                fixtureSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : deviceSignal?.source === "schedule" ||
                      receptacleSignal?.source === "schedule" ||
                      switchSignal?.source === "schedule" ||
                      fixtureSignal?.source === "schedule"
                    ? "schedule"
                    : deviceSignal?.source === "takeoff"
                      ? "takeoff"
                      : null,
              hasDevicesSection,
              roughInCue,
              trimOutCue,
              supportedCountSupport: canAffectNumericPricing ? "measured" : null,
              blocker:
                canAffectNumericPricing
                  ? null
                  : roughInCue || trimOutCue
                    ? "Electrical rough-in/trim-out wording stayed non-binding because no counted device or schedule support was extracted."
                    : "Electrical wording stayed non-binding because no counted device support was available for safe numeric pricing.",
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        supportedDeviceCount
          ? `Plan-aware electrical pricing used ${supportedDeviceCount} counted devices/fixtures for live device-level execution input assembly.`
          : null,
        receptacleSignal?.quantity
          ? `Electrical plan support included ${Math.round(Number(receptacleSignal.quantity || 0))} receptacle(s).`
          : null,
        switchSignal?.quantity
          ? `Electrical plan support included ${Math.round(Number(switchSignal.quantity || 0))} switch(es).`
          : null,
        fixtureSignal?.quantity
          ? `Electrical plan support included ${Math.round(Number(fixtureSignal.quantity || 0))} fixture(s).`
          : null,
        !canAffectNumericPricing
          ? "Electrical plan-aware routing stayed non-binding because wording or room context existed without sufficient counted support."
          : null,
        `Electrical trade certainty stayed ${args.certaintyLevel} at the live seam.`,
        ...args.certaintyReasons,
      ],
      8
    ),
    notes: args.executionNotes,
  }
}

function buildPlumbingInfluence(args: {
  support: ExactTradeQuantitySupport
  supportLevel: "strong" | "moderate" | "weak"
  certaintyLevel: "strong" | "moderate" | "weak"
  certaintyReasons: string[]
  executionSections: string[]
  executionNotes: string[]
}): LiveTradePricingInfluence {
  const executionSectionIds = getTradeExecutionSectionIds("plumbing", args.executionSections)
  const fixtureSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["plumbing_fixture_count"],
    label: /\bfixture count support\b/i,
    unit: "fixtures",
  })
  const toiletSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["plumbing_fixture_count"],
    label: /\btoilet fixture count support\b/i,
    unit: "fixtures",
  })
  const faucetSignal = findExactSignal({
    signals: args.support.tradeCountSignals,
    categories: ["plumbing_fixture_count"],
    label: /\bfaucet fixture count support\b/i,
    unit: "fixtures",
  })
  const roughInCue = args.support.tradeCoverageHints.some((item) => /\brough-in\b/i.test(item))
  const trimOutCue = args.support.tradeCoverageHints.some((item) => /\btrim-out\b/i.test(item))
  const wetAreaContext = args.support.tradeCoverageHints.some((item) => /\bbathroom\/kitchen|bathroom|kitchen\b/i.test(item))
  const supportedFixtureCount =
    fixtureSignal?.quantity != null
      ? Math.round(Number(fixtureSignal.quantity || 0))
      : Math.round(Number(toiletSignal?.quantity || 0) + Number(faucetSignal?.quantity || 0)) || null
  const hasFixtureSection = executionSectionIds.includes("fixture_trim_out")
  const canAffectNumericPricing =
    args.supportLevel !== "weak" &&
    hasFixtureSection &&
    Number(supportedFixtureCount || 0) > 0

  return {
    trade: "plumbing",
    supportLevel: args.supportLevel,
    executionSections: args.executionSections,
    canAffectNumericPricing,
    paintScopeOverride: null,
    engineInputs:
      canAffectNumericPricing || roughInCue || trimOutCue
        ? {
            plumbing: {
              supportedFixtureCount,
              supportedToiletCount:
                toiletSignal?.quantity != null ? Math.round(Number(toiletSignal.quantity || 0)) : null,
              supportedFaucetCount:
                faucetSignal?.quantity != null ? Math.round(Number(faucetSignal.quantity || 0)) : null,
              countSource:
                fixtureSignal?.source === "trade_finding" ||
                toiletSignal?.source === "trade_finding" ||
                faucetSignal?.source === "trade_finding"
                  ? "trade_finding"
                  : fixtureSignal?.source === "schedule" ||
                      toiletSignal?.source === "schedule" ||
                      faucetSignal?.source === "schedule"
                    ? "schedule"
                    : fixtureSignal?.source === "takeoff"
                      ? "takeoff"
                      : null,
              hasFixtureSection,
              roughInCue,
              trimOutCue,
              wetAreaContext,
              supportedCountSupport: canAffectNumericPricing ? "measured" : null,
              blocker:
                canAffectNumericPricing
                  ? null
                  : roughInCue
                    ? "Plumbing rough-in wording stayed non-binding because no counted fixture or explicit rough-in support was extracted."
                    : "Plumbing wording stayed non-binding because no counted fixture support was available for safe numeric pricing.",
            },
          }
        : undefined,
    basisAssumptions: uniqStrings(
      [
        supportedFixtureCount
          ? `Plan-aware plumbing pricing used ${supportedFixtureCount} counted fixtures for live trim-out execution input assembly.`
          : null,
        toiletSignal?.quantity
          ? `Plumbing plan support included ${Math.round(Number(toiletSignal.quantity || 0))} toilet fixture(s).`
          : null,
        faucetSignal?.quantity
          ? `Plumbing plan support included ${Math.round(Number(faucetSignal.quantity || 0))} faucet fixture(s).`
          : null,
        wetAreaContext
          ? "Bathroom/kitchen fixture context stayed trade-specific and did not become finish-trade certainty."
          : null,
        !canAffectNumericPricing
          ? "Plumbing plan-aware routing stayed non-binding because wording or wet-area context existed without sufficient counted fixture support."
          : null,
        `Plumbing trade certainty stayed ${args.certaintyLevel} at the live seam.`,
        ...args.certaintyReasons,
      ],
      8
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
  if (
    trade !== "painting" &&
    trade !== "drywall" &&
    trade !== "wallcovering" &&
    trade !== "flooring" &&
    trade !== "electrical" &&
    trade !== "plumbing"
  ) {
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
      certaintyLevel: pipeline.certaintyLevel,
      certaintyReasons: pipeline.certaintyReasons,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  if (trade === "drywall") {
    return buildDrywallInfluence({
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      certaintyLevel: pipeline.certaintyLevel,
      certaintyReasons: pipeline.certaintyReasons,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  if (trade === "flooring") {
    return buildFlooringInfluence({
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      certaintyLevel: pipeline.certaintyLevel,
      certaintyReasons: pipeline.certaintyReasons,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  if (trade === "electrical") {
    return buildElectricalInfluence({
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      certaintyLevel: pipeline.certaintyLevel,
      certaintyReasons: pipeline.certaintyReasons,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  if (trade === "plumbing") {
    return buildPlumbingInfluence({
      support: pipeline.tradeQuantitySupport,
      supportLevel: pipeline.supportLevel,
      certaintyLevel: pipeline.certaintyLevel,
      certaintyReasons: pipeline.certaintyReasons,
      executionSections: pipeline.executionSections,
      executionNotes: pipeline.executionNotes,
    })
  }

  return buildWallcoveringInfluence({
    scopeText: args.scopeText,
    support: pipeline.tradeQuantitySupport,
    supportLevel: pipeline.supportLevel,
    certaintyLevel: pipeline.certaintyLevel,
    certaintyReasons: pipeline.certaintyReasons,
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
