import type { PlanIntelligence } from "../plans/types"
import {
  formatTradeExecutionSectionLabel,
  type ComplexityProfile,
  type TradeStack,
} from "./types"
import type { EstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import type { EstimateStructureConsumption } from "./estimateStructureConsumption"
import type { TradePackagePricingPrep } from "./tradePackagePricingPrep"
import type { TradePricingBasisBridge } from "./tradePricingBasisBridge"
import type { TradeQuantitySupport, TradeQuantitySignal } from "./tradeQuantitySupport"

export type TradePricingInputDraftTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePricingInputDraft = {
  trade: TradePricingInputDraftTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePricingInputDraft: string[]
  tradeScopePricingSections: string[]
  tradeMeasurementInputDraft: string[]
  tradeLaborInputDraft: string[]
  tradeAllowanceInputDraft: string[]
  tradePricingInputNotes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 10): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function formatSignal(signal: TradeQuantitySignal): string {
  if (signal.exactQuantity && signal.quantity != null) {
    return `${signal.label} (${signal.quantity} ${signal.unit})`
  }

  return signal.label
}

function getBridgeBlob(bridge: NonNullable<TradePricingBasisBridge>): string {
  return [
    ...bridge.tradePricingBasisDraft,
    ...bridge.tradeMeasurementBasis,
    ...bridge.tradeScopeInclusionDraft,
    ...bridge.tradeLaborFactorDraft,
    ...bridge.tradeRiskAdjustmentDraft,
    ...bridge.tradePricingBasisNotes,
  ]
    .join(" ")
    .toLowerCase()
}

function getBucketHints(args: {
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  trade: TradePricingInputDraftTrade
}): string[] {
  const matcher =
    args.trade === "painting"
      ? /\bpainting\b|\bfinish\b/i
      : args.trade === "drywall"
      ? /\bdrywall\b/i
      : /\bwallcover(?:ing)?\b|\bfinish\b/i

  return uniqStrings(
    [
      ...(args.handoff?.estimatorBucketDrafts || [])
        .filter(
          (bucket) =>
            matcher.test(bucket.likelyTradeCoverage.join(" ")) ||
            matcher.test(bucket.likelyScopeBasis.join(" "))
        )
        .map((bucket) => bucket.bucketName),
      ...(args.structure?.structuredEstimateBuckets || [])
        .filter(
          (bucket) =>
            matcher.test(bucket.likelyTradeCoverage.join(" ")) ||
            matcher.test(bucket.likelyScopeBasis.join(" "))
        )
        .map((bucket) => bucket.bucketName),
    ],
    4
  )
}

function getSectionInputHints(args: {
  structure: EstimateStructureConsumption | null
  trade: TradePricingInputDraftTrade
}): {
  anchors: string[]
  measurementDrafts: string[]
  candidates: string[]
  guardrails: string[]
} {
  const matchesTrade = (trade: string) => {
    if (args.trade === "painting") return trade === "painting"
    if (args.trade === "drywall") return trade === "drywall"
    return trade === "wallcovering"
  }

  const sections = (args.structure?.structuredEstimateSections || []).filter((section) =>
    matchesTrade(section.trade)
  )

  return {
    anchors: uniqStrings(sections.map((section) => section.sectionTitle), 4),
    measurementDrafts: uniqStrings(
      sections.flatMap((section) => section.tradeMeasurementDrafts || []),
      6
    ),
    candidates: uniqStrings(
      sections.flatMap((section) => section.normalizedEstimatorInputCandidates || []),
      6
    ),
    guardrails: uniqStrings(
      sections.flatMap((section) => section.estimatorInputGuardrails || []),
      6
    ),
  }
}

function buildPaintingDraft(args: {
  supportLevel: "strong" | "moderate" | "weak"
  scopeText: string
  bridge: NonNullable<TradePricingBasisBridge>
  quantitySupport: NonNullable<TradeQuantitySupport>
  tradePackagePricingPrep: TradePackagePricingPrep
  bucketHints: string[]
  sectionHints: {
    anchors: string[]
    measurementDrafts: string[]
    candidates: string[]
    guardrails: string[]
  }
  complexityProfile: ComplexityProfile | null
  planIntelligence: PlanIntelligence | null
}): TradePricingInputDraft {
  const bridgeBlob = getBridgeBlob(args.bridge)
  const scopeBlob = args.scopeText.toLowerCase()
  const wallSignal = args.quantitySupport.tradeAreaSignals.find(
    (item) => /wall/i.test(item.label) && item.exactQuantity
  )
  const ceilingSignal = args.quantitySupport.tradeAreaSignals.find(
    (item) => /ceiling/i.test(item.label) && item.exactQuantity
  )
  const roomSignal = args.quantitySupport.tradeAreaSignals.find(
    (item) => item.unit === "rooms" && item.exactQuantity
  )
  const doorSignal = args.quantitySupport.tradeOpeningSignals.find((item) => item.exactQuantity)
  const trimSignal = args.quantitySupport.tradeLinearSignals.find((item) => item.exactQuantity)
  const corridorCue =
    args.quantitySupport.tradeCoverageHints.some((item) => /\bcorridor\b/i.test(item)) ||
    /\bcorridor\b/i.test(bridgeBlob) ||
    /\bcorridor\b/i.test(scopeBlob)
  const repeatCue = Boolean(roomSignal)

  const scopeSections =
    args.supportLevel === "weak"
      ? uniqStrings(
          [
            wallSignal || /walls?-only|wall/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "walls", true)
              : null,
            ceilingSignal || /ceilings?/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "ceilings", true)
              : null,
            doorSignal || /doors?|frames?/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "doors_frames", true)
              : null,
            trimSignal || /trim|casing/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "trim_casing", true)
              : null,
            corridorCue ? formatTradeExecutionSectionLabel("painting", "corridor_repaint", true) : null,
            formatTradeExecutionSectionLabel("painting", "prep_protection", true),
          ],
          6
        )
      : uniqStrings(
          [
            wallSignal || /walls?-only|wall/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "walls")
              : null,
            ceilingSignal || /ceilings?/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "ceilings")
              : null,
            doorSignal || /doors?|frames?/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "doors_frames")
              : null,
            trimSignal || /trim|casing/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("painting", "trim_casing")
              : null,
            corridorCue ? formatTradeExecutionSectionLabel("painting", "corridor_repaint") : null,
            formatTradeExecutionSectionLabel("painting", "prep_protection"),
          ],
          6
        )

  return {
    trade: "painting",
    supportLevel: args.supportLevel,
    tradePricingInputDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Painting pricing inputs should stay review-oriented until measured support is stronger."
          : "Painting pricing inputs can be drafted as sectioned scope inputs without affecting final pricing.",
        wallSignal && ceilingSignal
          ? "Draft section inputs can separate walls and ceilings while keeping the same pricing owner path."
          : wallSignal
          ? "Draft section inputs can start from wall coverage support first."
          : null,
        corridorCue
          ? "Carry corridor repaint as its own draft input instead of blending it into room interiors."
          : null,
        repeatCue
          ? "Repeated-room support can inform prototype-room painting inputs before any scaling review."
          : null,
        args.sectionHints.anchors.length > 0
          ? `Section-derived painting inputs: ${args.sectionHints.anchors.join(", ")}.`
          : null,
      ],
      6
    ),
    tradeScopePricingSections: scopeSections,
    tradeMeasurementInputDraft: uniqStrings(
      [
        wallSignal
          ? `Measurement input: use ${formatSignal(wallSignal)} for wall pricing sections.`
          : null,
        ceilingSignal
          ? `Measurement input: use ${formatSignal(ceilingSignal)} for ceiling pricing sections.`
          : null,
        doorSignal
          ? `Measurement input: use ${formatSignal(doorSignal)} only for door/frame sections that are explicitly included.`
          : null,
        trimSignal
          ? `Measurement input: use ${formatSignal(trimSignal)} only where trim/casing scope is explicit.`
          : null,
        ...args.sectionHints.measurementDrafts.slice(0, 3),
        args.supportLevel === "weak"
          ? "Measurement input remains review-only; confirm wall, ceiling, opening, and trim support before estimator input drafting."
          : null,
      ],
      6
    ),
    tradeLaborInputDraft: uniqStrings(
      [
        ...args.bridge.tradeLaborFactorDraft.slice(0, 4),
        repeatCue
          ? "Repeat-room logic can guide labor grouping, but it should not be turned into unsupported production assumptions."
          : null,
        args.complexityProfile?.multiPhase
          ? "Multi-phase sequencing should stay visible in painting labor inputs."
          : null,
      ],
      6
    ),
    tradeAllowanceInputDraft: uniqStrings(
      [
        ...args.bridge.tradeRiskAdjustmentDraft.slice(0, 3),
        corridorCue
          ? "Allowance draft: keep corridor access and sequencing burden visible instead of burying it inside room-wall inputs."
          : null,
        /wallcover(?:ing)?|wallpaper/.test(scopeBlob)
          ? "Allowance draft: review overlap between wallcovering prep and final paint-ready scope."
          : null,
      ],
      6
    ),
    tradePricingInputNotes: uniqStrings(
      [
        args.bucketHints.length > 0
          ? `Relevant estimate buckets: ${args.bucketHints.join(", ")}.`
          : null,
        ...args.sectionHints.candidates.slice(0, 2),
        ...args.sectionHints.guardrails.slice(0, 2),
        (args.planIntelligence?.repeatedSpaceSignals || []).length > 0
          ? "Repeated-space plan signals support prototype-room organization, not automatic pricing scale-up."
          : null,
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
        ...(args.bridge.tradePricingBasisNotes || []).slice(0, 2),
      ],
      7
    ),
  }
}

function buildDrywallDraft(args: {
  supportLevel: "strong" | "moderate" | "weak"
  scopeText: string
  bridge: NonNullable<TradePricingBasisBridge>
  quantitySupport: NonNullable<TradeQuantitySupport>
  tradePackagePricingPrep: TradePackagePricingPrep
  bucketHints: string[]
  sectionHints: {
    anchors: string[]
    measurementDrafts: string[]
    candidates: string[]
    guardrails: string[]
  }
  complexityProfile: ComplexityProfile | null
  planIntelligence: PlanIntelligence | null
}): TradePricingInputDraft {
  const bridgeBlob = getBridgeBlob(args.bridge)
  const scopeBlob = args.scopeText.toLowerCase()
  const wallSignal = args.quantitySupport.tradeAreaSignals.find(
    (item) => /wall/i.test(item.label) && item.exactQuantity
  )
  const ceilingSignal = args.quantitySupport.tradeAreaSignals.find(
    (item) => /ceiling/i.test(item.label) && item.exactQuantity
  )
  const partitionSignal = args.quantitySupport.tradeLinearSignals.find((item) => item.exactQuantity)
  const repeatCue = args.quantitySupport.tradeAreaSignals.some(
    (item) => item.unit === "rooms" && item.exactQuantity
  )
  const patchCue =
    args.quantitySupport.tradeCoverageHints.some((item) => /\bpatch\b|\brepair\b/i.test(item)) ||
    /\bpatch\b|\brepair\b/.test(bridgeBlob) ||
    /\bpatch\b|\brepair\b/.test(scopeBlob)
  const installCue =
    args.quantitySupport.tradeCoverageHints.some((item) => /\binstall\b|\bhang\b|\bfinish\b/i.test(item)) ||
    /\binstall\b|\bhang\b|\bfinish\b/.test(bridgeBlob) ||
    /\binstall\b|\bhang\b|\bfinish\b/.test(scopeBlob)
  const textureCue = /\btexture|orange peel|knockdown|skim\b/.test(
    `${bridgeBlob} ${scopeBlob}`
  )

  const scopeSections =
    args.supportLevel === "weak"
      ? uniqStrings(
          [
            patchCue ? formatTradeExecutionSectionLabel("drywall", "patch_repair", true) : null,
            installCue ? formatTradeExecutionSectionLabel("drywall", "install_hang", true) : null,
            textureCue || installCue
              ? formatTradeExecutionSectionLabel("drywall", "finish_texture", true)
              : null,
            ceilingSignal || /ceiling/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("drywall", "ceiling_drywall", true)
              : null,
            partitionSignal
              ? formatTradeExecutionSectionLabel("drywall", "partition_related_scope", true)
              : null,
          ],
          6
        )
      : uniqStrings(
          [
            patchCue ? formatTradeExecutionSectionLabel("drywall", "patch_repair") : null,
            installCue ? formatTradeExecutionSectionLabel("drywall", "install_hang") : null,
            textureCue || installCue
              ? formatTradeExecutionSectionLabel("drywall", "finish_texture")
              : null,
            ceilingSignal || /ceiling/i.test(bridgeBlob)
              ? formatTradeExecutionSectionLabel("drywall", "ceiling_drywall")
              : null,
            partitionSignal
              ? formatTradeExecutionSectionLabel("drywall", "partition_related_scope")
              : null,
          ],
          6
        )

  return {
    trade: "drywall",
    supportLevel: args.supportLevel,
    tradePricingInputDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Drywall pricing inputs should stay review-oriented until measured support is stronger."
          : "Drywall pricing inputs can be drafted as separate package sections without feeding final pricing yet.",
        patchCue && !installCue
          ? "Patch/repair should stay distinct from install-and-finish in draft inputs."
          : null,
        installCue
          ? "Install/hang and finish/texture can be drafted as separate input sections when support exists."
          : null,
        repeatCue
          ? "Repeated-room repair signals can help organize drywall draft inputs before any quantity scaling review."
          : null,
        args.sectionHints.anchors.length > 0
          ? `Section-derived drywall inputs: ${args.sectionHints.anchors.join(", ")}.`
          : null,
      ],
      6
    ),
    tradeScopePricingSections: scopeSections,
    tradeMeasurementInputDraft: uniqStrings(
      [
        wallSignal
          ? `Measurement input: use ${formatSignal(wallSignal)} only for drywall wall-area sections that are explicitly supported.`
          : null,
        ceilingSignal
          ? `Measurement input: use ${formatSignal(ceilingSignal)} only for ceiling drywall sections with explicit support.`
          : null,
        partitionSignal
          ? `Measurement input: use ${formatSignal(partitionSignal)} for partition-related scope where LF support is already explicit.`
          : null,
        ...args.sectionHints.measurementDrafts.slice(0, 3),
        args.supportLevel === "weak"
          ? "Measurement input remains review-only; do not convert repair cues into unsupported patch counts or install area."
          : null,
      ],
      6
    ),
    tradeLaborInputDraft: uniqStrings(
      [
        ...args.bridge.tradeLaborFactorDraft.slice(0, 4),
        textureCue
          ? "Texture-match review should stay visible in drywall labor inputs."
          : null,
        repeatCue
          ? "Repeated-room logic can organize repair labor review without implying production certainty."
          : null,
      ],
      6
    ),
    tradeAllowanceInputDraft: uniqStrings(
      [
        ...args.bridge.tradeRiskAdjustmentDraft.slice(0, 3),
        patchCue && repeatCue
          ? "Allowance draft: repeated-room repair signals do not justify assumed patch counts."
          : null,
        args.complexityProfile?.multiPhase
          ? "Allowance draft: multi-visit drywall sequencing may need explicit review rather than hidden spread."
          : null,
      ],
      6
    ),
    tradePricingInputNotes: uniqStrings(
      [
        args.bucketHints.length > 0
          ? `Relevant estimate buckets: ${args.bucketHints.join(", ")}.`
          : null,
        ...args.sectionHints.candidates.slice(0, 2),
        ...args.sectionHints.guardrails.slice(0, 2),
        (args.planIntelligence?.repeatedSpaceSignals || []).length > 0
          ? "Repeated-space signals support organization of similar repair rooms, not inferred patch size or count."
          : null,
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
        ...(args.bridge.tradePricingBasisNotes || []).slice(0, 2),
      ],
      7
    ),
  }
}

function buildWallcoveringDraft(args: {
  supportLevel: "strong" | "moderate" | "weak"
  scopeText: string
  bridge: NonNullable<TradePricingBasisBridge>
  quantitySupport: NonNullable<TradeQuantitySupport>
  tradePackagePricingPrep: TradePackagePricingPrep
  bucketHints: string[]
  sectionHints: {
    anchors: string[]
    measurementDrafts: string[]
    candidates: string[]
    guardrails: string[]
  }
  complexityProfile: ComplexityProfile | null
  planIntelligence: PlanIntelligence | null
}): TradePricingInputDraft {
  const bridgeBlob = getBridgeBlob(args.bridge)
  const scopeBlob = args.scopeText.toLowerCase()
  const wallSignal = args.quantitySupport.tradeAreaSignals.find((item) => item.exactQuantity)
  const corridorCue =
    args.quantitySupport.tradeCoverageHints.some((item) => /\bcorridor\b/i.test(item)) ||
    /\bcorridor\b/i.test(bridgeBlob) ||
    /\bcorridor\b/i.test(scopeBlob)
  const featureCue =
    args.quantitySupport.tradeCoverageHints.some(
      (item) => /\bfeature wall\b|\baccent wall\b/i.test(item)
    ) || /\bfeature wall\b|\baccent wall\b/i.test(`${bridgeBlob} ${scopeBlob}`)
  const roomCue =
    args.quantitySupport.tradeAreaSignals.some(
      (item) => item.unit === "rooms" && item.exactQuantity
    ) || /\broom wallcovering package\b/.test(bridgeBlob)
  const removalCue = /\bremove|removal|strip\b/.test(`${bridgeBlob} ${scopeBlob}`)
  const installCue = /\binstall|hang|apply\b/.test(`${bridgeBlob} ${scopeBlob}`)

  const scopeSections =
    args.supportLevel === "weak"
      ? uniqStrings(
          [
            roomCue ? formatTradeExecutionSectionLabel("wallcovering", "room_wallcovering", true) : null,
            corridorCue
              ? formatTradeExecutionSectionLabel("wallcovering", "corridor_wallcovering", true)
              : null,
            featureCue ? formatTradeExecutionSectionLabel("wallcovering", "feature_wall", true) : null,
            removalCue ? formatTradeExecutionSectionLabel("wallcovering", "removal_prep", true) : null,
            installCue ? formatTradeExecutionSectionLabel("wallcovering", "install", true) : null,
          ],
          6
        )
      : uniqStrings(
          [
            roomCue ? formatTradeExecutionSectionLabel("wallcovering", "room_wallcovering") : null,
            corridorCue
              ? formatTradeExecutionSectionLabel("wallcovering", "corridor_wallcovering")
              : null,
            featureCue ? formatTradeExecutionSectionLabel("wallcovering", "feature_wall") : null,
            removalCue ? formatTradeExecutionSectionLabel("wallcovering", "removal_prep") : null,
            installCue || wallSignal ? formatTradeExecutionSectionLabel("wallcovering", "install") : null,
          ],
          6
        )

  return {
    trade: "wallcovering",
    supportLevel: args.supportLevel,
    tradePricingInputDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Wallcovering pricing inputs should stay review-oriented until elevation and wall-area support are stronger."
          : "Wallcovering pricing inputs can be drafted as separate coverage and prep/install sections without touching final pricing.",
        featureCue
          ? "Feature-wall scope should stay isolated from broader room or corridor inputs."
          : null,
        corridorCue
          ? "Corridor wallcovering should stay separate from room packages in draft pricing inputs."
          : null,
        removalCue && installCue
          ? "Removal/prep and install can be drafted as separate sections where support exists."
          : null,
        args.sectionHints.anchors.length > 0
          ? `Section-derived wallcovering inputs: ${args.sectionHints.anchors.join(", ")}.`
          : null,
      ],
      6
    ),
    tradeScopePricingSections: scopeSections,
    tradeMeasurementInputDraft: uniqStrings(
      [
        wallSignal
          ? `Measurement input: use ${formatSignal(wallSignal)} only where wallcovering coverage is explicitly supported.`
          : null,
        ...args.sectionHints.measurementDrafts.slice(0, 3),
        args.supportLevel === "weak"
          ? "Measurement input remains review-only; verify selected elevations before drafting measured wallcovering inputs."
          : null,
      ],
      6
    ),
    tradeLaborInputDraft: uniqStrings(
      [
        ...args.bridge.tradeLaborFactorDraft.slice(0, 4),
        args.complexityProfile?.multiPhase
          ? "Multi-phase access can compound wallcovering labor sequencing and should stay visible."
          : null,
      ],
      6
    ),
    tradeAllowanceInputDraft: uniqStrings(
      [
        ...args.bridge.tradeRiskAdjustmentDraft.slice(0, 3),
        removalCue
          ? "Allowance draft: substrate recovery and prep should remain visible instead of being buried inside install inputs."
          : null,
        corridorCue
          ? "Allowance draft: corridor runs may need separate layout and sequencing review."
          : null,
      ],
      6
    ),
    tradePricingInputNotes: uniqStrings(
      [
        args.bucketHints.length > 0
          ? `Relevant estimate buckets: ${args.bucketHints.join(", ")}.`
          : null,
        ...args.sectionHints.candidates.slice(0, 2),
        ...args.sectionHints.guardrails.slice(0, 2),
        (args.planIntelligence?.repeatedSpaceSignals || []).length > 0
          ? "Repeated-space signals can support organizing similar room packages, but not inferred wallcovering elevations."
          : null,
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
        ...(args.bridge.tradePricingBasisNotes || []).slice(0, 2),
      ],
      7
    ),
  }
}

export function buildTradePricingInputDraft(args: {
  tradePricingBasisBridge: TradePricingBasisBridge
  tradeQuantitySupport: TradeQuantitySupport
  tradePackagePricingPrep: TradePackagePricingPrep
  estimateSkeletonHandoff: EstimateSkeletonHandoff | null
  estimateStructureConsumption: EstimateStructureConsumption | null
  planIntelligence: PlanIntelligence | null
  scopeText: string
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradePricingInputDraft {
  const bridge = args.tradePricingBasisBridge
  const quantitySupport = args.tradeQuantitySupport

  if (!bridge || !quantitySupport) return null

  const trade = bridge.trade
  const bucketHints = getBucketHints({
    handoff: args.estimateSkeletonHandoff,
    structure: args.estimateStructureConsumption,
    trade,
  })
  const sectionHints = getSectionInputHints({
    structure: args.estimateStructureConsumption,
    trade,
  })

  if (trade === "painting") {
    return buildPaintingDraft({
      supportLevel: bridge.supportLevel,
      scopeText: args.scopeText,
      bridge,
      quantitySupport,
      tradePackagePricingPrep: args.tradePackagePricingPrep,
      bucketHints,
      sectionHints,
      complexityProfile: args.complexityProfile,
      planIntelligence: args.planIntelligence,
    })
  }

  if (trade === "drywall") {
    return buildDrywallDraft({
      supportLevel: bridge.supportLevel,
      scopeText: args.scopeText,
      bridge,
      quantitySupport,
      tradePackagePricingPrep: args.tradePackagePricingPrep,
      bucketHints,
      sectionHints,
      complexityProfile: args.complexityProfile,
      planIntelligence: args.planIntelligence,
    })
  }

  return buildWallcoveringDraft({
    supportLevel: bridge.supportLevel,
    scopeText: args.scopeText,
    bridge,
    quantitySupport,
    tradePackagePricingPrep: args.tradePackagePricingPrep,
    bucketHints,
    sectionHints,
    complexityProfile: args.complexityProfile,
    planIntelligence: args.planIntelligence,
  })
}
