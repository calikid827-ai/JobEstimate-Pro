import type { PlanIntelligence } from "../plans/types"
import type { ComplexityProfile, TradeStack } from "./types"
import type { EstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import type { EstimateStructureConsumption } from "./estimateStructureConsumption"
import type { TradePackagePricingPrep } from "./tradePackagePricingPrep"
import type { TradeQuantitySupport } from "./tradeQuantitySupport"

export type TradePricingBasisBridgeTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePricingBasisBridge = {
  trade: TradePricingBasisBridgeTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePricingBasisDraft: string[]
  tradeMeasurementBasis: string[]
  tradeScopeInclusionDraft: string[]
  tradeLaborFactorDraft: string[]
  tradeRiskAdjustmentDraft: string[]
  tradePricingBasisNotes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function getBucketHints(args: {
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  trade: TradePricingBasisBridgeTrade
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

function getTrade(args: {
  trade: string
  tradeQuantitySupport: TradeQuantitySupport
  tradePackagePricingPrep: TradePackagePricingPrep
  scopeText: string
  planIntelligence: PlanIntelligence | null
}): TradePricingBasisBridgeTrade | null {
  if (args.tradeQuantitySupport?.trade) return args.tradeQuantitySupport.trade
  if (args.tradePackagePricingPrep?.trade) return args.tradePackagePricingPrep.trade

  const directTrade = String(args.trade || "").trim().toLowerCase()
  if (directTrade === "painting" || directTrade === "drywall") return directTrade
  if (directTrade === "wallcovering") return "wallcovering"

  const blob = [
    args.scopeText,
    args.planIntelligence?.summary || "",
    ...(args.planIntelligence?.detectedTrades || []),
    ...(args.planIntelligence?.tradePackageSignals || []),
  ]
    .join(" ")
    .toLowerCase()

  if (/\bwallcover(?:ing)?|wallpaper\b/.test(blob)) return "wallcovering"
  if (/\bdrywall|sheetrock|partition|patch|texture\b/.test(blob)) return "drywall"
  if (/\bpaint|painting|primer|finish schedule\b/.test(blob)) return "painting"
  return null
}

function buildPaintingBridge(args: {
  supportLevel: "strong" | "moderate" | "weak"
  quantitySupport: NonNullable<TradeQuantitySupport>
  tradePackagePricingPrep: TradePackagePricingPrep
  bucketHints: string[]
  scopeText: string
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradePricingBasisBridge {
  const blob = args.scopeText.toLowerCase()
  const hasWalls = args.quantitySupport.tradeAreaSignals.some(
    (item) => /wall/i.test(item.label) && item.exactQuantity
  )
  const hasCeilings = args.quantitySupport.tradeAreaSignals.some(
    (item) => /ceiling/i.test(item.label) && item.exactQuantity
  )
  const hasDoors = args.quantitySupport.tradeOpeningSignals.some((item) => item.exactQuantity)
  const hasTrim = args.quantitySupport.tradeLinearSignals.some((item) => item.exactQuantity)
  const corridorCue =
    args.quantitySupport.tradeCoverageHints.some((item) => /\bcorridor\b/i.test(item)) ||
    /\bcorridor\b/i.test(blob)
  const repeatCue = args.quantitySupport.tradeAreaSignals.some(
    (item) => item.unit === "rooms" && item.exactQuantity
  )

  return {
    trade: "painting",
    supportLevel: args.supportLevel,
    tradePricingBasisDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Keep painting pricing basis in review mode until stronger measured support appears."
          : hasWalls && hasCeilings
          ? "Basis draft: walls + ceilings package."
          : hasWalls
          ? "Basis draft: walls-only package."
          : "Basis draft: finish-refresh coverage needs confirmation before a quantity-led package is assumed.",
        corridorCue
          ? "Carry corridor repaint as a separate basis from room interiors."
          : null,
        repeatCue
          ? "Repeated room support can justify a prototype-room painting basis before scaling."
          : null,
      ],
      5
    ),
    tradeMeasurementBasis: uniqStrings(
      [
        ...args.quantitySupport.tradeAreaSignals
          .filter((item) => item.exactQuantity)
          .slice(0, 3)
          .map((item) => `Measurement basis: ${item.label} (${item.quantity} ${item.unit}).`),
        hasTrim
          ? "Linear trim support can stay separate from wall/ceiling basis when trim scope is truly included."
          : null,
        hasDoors
          ? "Opening counts can support doors/frames as a separate basis if inclusion is explicit."
          : null,
        args.supportLevel === "weak"
          ? "Measurement basis is still descriptive; verify wall, ceiling, and opening coverage manually."
          : null,
      ],
      6
    ),
    tradeScopeInclusionDraft: uniqStrings(
      [
        hasDoors
          ? "Doors and frames may be carried separately unless broader finish-refresh support clearly combines them."
          : "Do not assume doors/frames are included unless quantity support is explicit.",
        hasTrim
          ? "Trim/casing can be drafted as separate or additive scope where linear support exists."
          : "Do not assume trim/casing rides with wall repaint unless linear support exists.",
        hasCeilings
          ? "Ceilings can be included in the same painting basis where ceiling support is explicit."
          : "Ceilings should stay separate or review-only when ceiling support is weak.",
      ],
      6
    ),
    tradeLaborFactorDraft: uniqStrings(
      [
        "Masking and protection burden should remain visible in the labor basis.",
        corridorCue ? "Corridor sequencing and access control can slow production." : null,
        args.complexityProfile?.multiPhase
          ? "Multi-phase access likely creates production drag across painting packages."
          : null,
        /\bwallcover(?:ing)?|wallpaper\b/.test(blob)
          ? "Wallcovering-prep overlap may change paint-ready labor burden."
          : null,
      ],
      6
    ),
    tradeRiskAdjustmentDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Risk adjustment should stay review-oriented because quantity support is weak."
          : "Risk adjustment should stay conservative and anchored to measured support only.",
        corridorCue ? "Room-interior and corridor repaint should not be blended without confirmation." : null,
        hasDoors && !hasTrim
          ? "Door counts may understate frame/casing burden if broader finish refresh is implied."
          : null,
      ],
      6
    ),
    tradePricingBasisNotes: uniqStrings(
      [
        args.bucketHints.length > 0
          ? `Relevant estimate buckets: ${args.bucketHints.join(", ")}.`
          : null,
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
        ...(args.quantitySupport.tradeQuantityReviewNotes || []).slice(0, 2),
      ],
      6
    ),
  }
}

function buildDrywallBridge(args: {
  supportLevel: "strong" | "moderate" | "weak"
  quantitySupport: NonNullable<TradeQuantitySupport>
  tradePackagePricingPrep: TradePackagePricingPrep
  bucketHints: string[]
  scopeText: string
  complexityProfile: ComplexityProfile | null
}): TradePricingBasisBridge {
  const blob = args.scopeText.toLowerCase()
  const patchCue = args.quantitySupport.tradeCoverageHints.some((item) => /\bpatch\b|\brepair\b/i.test(item))
  const installCue = args.quantitySupport.tradeCoverageHints.some((item) => /\binstall\b|\bhang\b|\bfinish\b/i.test(item))
  const ceilingCue = args.quantitySupport.tradeAreaSignals.some((item) => /ceiling/i.test(item.label))
  const repeatCue = args.quantitySupport.tradeAreaSignals.some(
    (item) => item.unit === "rooms" && item.exactQuantity
  )
  const partitionCue = args.quantitySupport.tradeLinearSignals.some((item) => item.exactQuantity)

  return {
    trade: "drywall",
    supportLevel: args.supportLevel,
    tradePricingBasisDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Keep drywall pricing basis in review mode until stronger measured support appears."
          : patchCue && !installCue
          ? "Basis draft: patch / repair package."
          : installCue
          ? "Basis draft: install / hang / finish package."
          : "Basis draft: drywall scope is visible but package type still needs confirmation.",
        ceilingCue ? "Carry ceiling drywall as a separate basis when ceiling support is explicit." : null,
        repeatCue ? "Repeated room support can justify a repeated-room repair basis before scaling." : null,
      ],
      5
    ),
    tradeMeasurementBasis: uniqStrings(
      [
        ...args.quantitySupport.tradeAreaSignals
          .filter((item) => item.exactQuantity)
          .slice(0, 3)
          .map((item) => `Measurement basis: ${item.label} (${item.quantity} ${item.unit}).`),
        partitionCue
          ? "Partition-related linear support can be carried separately from repair-area logic."
          : null,
        args.supportLevel === "weak"
          ? "Measurement basis is still descriptive; do not convert cues into patch counts or unsupported install area."
          : null,
      ],
      6
    ),
    tradeScopeInclusionDraft: uniqStrings(
      [
        patchCue ? "Patch / repair scope should stay distinct from broader install-and-finish scope." : null,
        installCue ? "Install / hang / finish scope can carry wall area when explicitly supported." : null,
        ceilingCue
          ? "Ceiling drywall can stay separate from walls where ceiling area is specifically supported."
          : "Do not assume ceiling drywall rides with wall area unless explicitly supported.",
      ],
      6
    ),
    tradeLaborFactorDraft: uniqStrings(
      [
        /\blevel 5\b/.test(blob)
          ? "Finish level uncertainty should be carried as labor burden."
          : "Finish level still affects labor basis when not fully locked.",
        /\btexture|orange peel|knockdown|skim\b/.test(blob)
          ? "Texture-match burden should remain explicit in the labor basis."
          : null,
        "Return-visit cadence for mud, dry, sand, and texture should remain explicit.",
        partitionCue ? "Partition/install sequencing differs materially from repair sequencing." : null,
      ],
      6
    ),
    tradeRiskAdjustmentDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Risk adjustment should stay review-oriented because quantity support is weak."
          : "Risk adjustment should stay conservative and tied to measured drywall support only.",
        patchCue && repeatCue
          ? "Repeated-room support must not be converted into unsupported patch counts."
          : null,
        ceilingCue && !installCue
          ? "Ceiling area may overstate drywall inclusion if the scope is mostly repair-driven."
          : null,
      ],
      6
    ),
    tradePricingBasisNotes: uniqStrings(
      [
        args.bucketHints.length > 0
          ? `Relevant estimate buckets: ${args.bucketHints.join(", ")}.`
          : null,
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
        ...(args.quantitySupport.tradeQuantityReviewNotes || []).slice(0, 2),
      ],
      6
    ),
  }
}

function buildWallcoveringBridge(args: {
  supportLevel: "strong" | "moderate" | "weak"
  quantitySupport: NonNullable<TradeQuantitySupport>
  tradePackagePricingPrep: TradePackagePricingPrep
  bucketHints: string[]
  scopeText: string
  complexityProfile: ComplexityProfile | null
}): TradePricingBasisBridge {
  const blob = args.scopeText.toLowerCase()
  const corridorCue = args.quantitySupport.tradeCoverageHints.some((item) => /\bcorridor\b/i.test(item))
  const featureCue = args.quantitySupport.tradeCoverageHints.some((item) => /\bfeature wall\b|\baccent wall\b/i.test(item))
  const roomCue = args.quantitySupport.tradeAreaSignals.some(
    (item) => item.unit === "rooms" && item.exactQuantity
  )
  const removalCue = /\bremove|removal|strip\b/.test(blob)
  const installCue = /\binstall|hang|apply\b/.test(blob)

  return {
    trade: "wallcovering",
    supportLevel: args.supportLevel,
    tradePricingBasisDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Keep wallcovering pricing basis in review mode until elevation support is stronger."
          : featureCue
          ? "Basis draft: feature-wall package."
          : corridorCue
          ? "Basis draft: corridor wallcovering package."
          : roomCue
          ? "Basis draft: room wallcovering package."
          : "Basis draft: broader wallcovering coverage needs confirmation before a quantity-led package is assumed.",
        removalCue && installCue
          ? "Draft removal / prep / install as separate basis steps where support exists."
          : null,
      ],
      5
    ),
    tradeMeasurementBasis: uniqStrings(
      [
        ...args.quantitySupport.tradeAreaSignals
          .filter((item) => item.exactQuantity)
          .slice(0, 3)
          .map((item) => `Measurement basis: ${item.label} (${item.quantity} ${item.unit}).`),
        args.supportLevel === "weak"
          ? "Measurement basis is still descriptive; verify elevations before using it for pricing."
          : null,
      ],
      6
    ),
    tradeScopeInclusionDraft: uniqStrings(
      [
        featureCue
          ? "Feature-wall scope should stay separate from whole-room coverage."
          : null,
        corridorCue
          ? "Corridor wallcovering should stay separate from room packages."
          : null,
        removalCue
          ? "Removal and substrate prep should not be silently blended into install basis."
          : "Do not assume removal is included unless support is explicit.",
      ],
      6
    ),
    tradeLaborFactorDraft: uniqStrings(
      [
        removalCue ? "Removal burden can materially change labor basis." : null,
        "Substrate prep should remain visible in the labor basis.",
        /\bpattern|seam|match\b/.test(blob)
          ? "Pattern / seam complexity should remain explicit in the labor basis."
          : "Pattern and seam complexity still need review when the finish type is not locked.",
        corridorCue ? "Corridor run complexity can slow layout and installation." : null,
      ],
      6
    ),
    tradeRiskAdjustmentDraft: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Risk adjustment should stay review-oriented because quantity support is weak."
          : "Risk adjustment should stay conservative and tied to measured wallcovering support only.",
        featureCue
          ? "Feature-wall support must not be spread across full-room coverage without elevation support."
          : null,
        corridorCue
          ? "Gross wall area may overstate corridor coverage if only selected runs are included."
          : null,
      ],
      6
    ),
    tradePricingBasisNotes: uniqStrings(
      [
        args.bucketHints.length > 0
          ? `Relevant estimate buckets: ${args.bucketHints.join(", ")}.`
          : null,
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
        ...(args.quantitySupport.tradeQuantityReviewNotes || []).slice(0, 2),
      ],
      6
    ),
  }
}

export function buildTradePricingBasisBridge(args: {
  trade: string
  scopeText: string
  planIntelligence: PlanIntelligence | null
  tradeQuantitySupport: TradeQuantitySupport
  tradePackagePricingPrep: TradePackagePricingPrep
  estimateSkeletonHandoff: EstimateSkeletonHandoff | null
  estimateStructureConsumption: EstimateStructureConsumption | null
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradePricingBasisBridge {
  if (!args.tradeQuantitySupport) return null

  const trade = getTrade({
    trade: args.trade,
    tradeQuantitySupport: args.tradeQuantitySupport,
    tradePackagePricingPrep: args.tradePackagePricingPrep,
    scopeText: args.scopeText,
    planIntelligence: args.planIntelligence,
  })

  if (!trade) return null

  const supportLevel = args.tradeQuantitySupport.tradeQuantityConfidence.level
  const bucketHints = getBucketHints({
    handoff: args.estimateSkeletonHandoff,
    structure: args.estimateStructureConsumption,
    trade,
  })

  if (trade === "painting") {
    return buildPaintingBridge({
      supportLevel,
      quantitySupport: args.tradeQuantitySupport,
      tradePackagePricingPrep: args.tradePackagePricingPrep,
      bucketHints,
      scopeText: args.scopeText,
      tradeStack: args.tradeStack,
      complexityProfile: args.complexityProfile,
    })
  }

  if (trade === "drywall") {
    return buildDrywallBridge({
      supportLevel,
      quantitySupport: args.tradeQuantitySupport,
      tradePackagePricingPrep: args.tradePackagePricingPrep,
      bucketHints,
      scopeText: args.scopeText,
      complexityProfile: args.complexityProfile,
    })
  }

  return buildWallcoveringBridge({
    supportLevel,
    quantitySupport: args.tradeQuantitySupport,
    tradePackagePricingPrep: args.tradePackagePricingPrep,
    bucketHints,
    scopeText: args.scopeText,
    complexityProfile: args.complexityProfile,
  })
}
