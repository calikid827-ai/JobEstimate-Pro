import type { PlanIntelligence } from "../plans/types"
import type { ComplexityProfile, TradeStack } from "./types"
import type { EstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import type { EstimateStructureConsumption } from "./estimateStructureConsumption"
import type { TradePackagePricingPrep } from "./tradePackagePricingPrep"
import type { TradePricingBasisBridge } from "./tradePricingBasisBridge"
import type { TradePricingInputDraft } from "./tradePricingInputDraft"

export type TradePreparedPricingTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePreparedPricingInputs = {
  trade: TradePreparedPricingTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePreparedPrimaryCandidates: string[]
  tradePreparedSecondaryCandidates: string[]
  tradePreparedReviewCandidates: string[]
  tradePreparedPricingSections: string[]
  tradePreparedMeasurementInputs: string[]
  tradePreparedLaborInputs: string[]
  tradePreparedAllowanceInputs: string[]
  tradePreparedPricingNotes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 10): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function getTradeAssemblyHints(args: {
  structure: EstimateStructureConsumption | null
  trade: TradePreparedPricingTrade
}): {
  primary: string[]
  secondary: string[]
  review: string[]
  notes: string[]
} {
  const matchesTrade = (trade: string) => {
    if (args.trade === "painting") return trade === "painting"
    if (args.trade === "drywall") return trade === "drywall"
    return trade === "wallcovering"
  }

  const assemblies = (args.structure?.structuredTradeInputAssemblies || []).filter((assembly) =>
    matchesTrade(assembly.trade)
  )

  return {
    primary: uniqStrings(
      assemblies
        .map((assembly) => assembly.primaryCandidate?.sectionTitle || null)
        .filter(Boolean),
      3
    ),
    secondary: uniqStrings(
      assemblies.flatMap((assembly) =>
        assembly.secondaryCandidates.map((candidate) => candidate.sectionTitle)
      ),
      4
    ),
    review: uniqStrings(
      assemblies.flatMap((assembly) =>
        assembly.reviewCandidates.map((candidate) => candidate.sectionTitle)
      ),
      4
    ),
    notes: uniqStrings(assemblies.flatMap((assembly) => assembly.assemblyNotes || []), 6),
  }
}

function getBucketHints(args: {
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  trade: TradePreparedPricingTrade
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

function orderSections(trade: TradePreparedPricingTrade, sections: string[]): string[] {
  const preferredOrder =
    trade === "painting"
      ? [
          "Walls",
          "Ceilings",
          "Doors / frames",
          "Trim / casing",
          "Corridor repaint",
          "Prep / protection",
        ]
      : trade === "drywall"
      ? [
          "Patch / repair",
          "Install / hang",
          "Finish / texture",
          "Ceiling drywall",
          "Partition-related scope",
        ]
      : [
          "Room wallcovering",
          "Corridor wallcovering",
          "Feature wall",
          "Removal / prep",
          "Install",
        ]

  const normalized = uniqStrings(sections, 8)
  const ranked = preferredOrder.filter((item) => normalized.includes(item))
  const remainder = normalized.filter((item) => !ranked.includes(item))
  return [...ranked, ...remainder]
}

function makeReviewSections(trade: TradePreparedPricingTrade, sections: string[]): string[] {
  return orderSections(
    trade,
    sections.map((section) =>
      section.startsWith("Review candidate:") ? section : `Review candidate: ${section}`
    )
  )
}

function buildPreparedPricing(args: {
  trade: TradePreparedPricingTrade
  tradePricingInputDraft: NonNullable<TradePricingInputDraft>
  tradePricingBasisBridge: TradePricingBasisBridge
  tradePackagePricingPrep: TradePackagePricingPrep
  estimateSkeletonHandoff: EstimateSkeletonHandoff | null
  estimateStructureConsumption: EstimateStructureConsumption | null
  planIntelligence: PlanIntelligence | null
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradePreparedPricingInputs {
  const draft = args.tradePricingInputDraft
  const supportLevel = draft.supportLevel
  const bucketHints = getBucketHints({
    handoff: args.estimateSkeletonHandoff,
    structure: args.estimateStructureConsumption,
    trade: args.trade,
  })
  const assemblyHints = getTradeAssemblyHints({
    structure: args.estimateStructureConsumption,
    trade: args.trade,
  })
  const repeatedCue = (args.planIntelligence?.repeatedSpaceSignals || []).length > 0
  const reviewOnly = supportLevel === "weak"
  const baseSections = reviewOnly
    ? makeReviewSections(args.trade, draft.tradeScopePricingSections)
    : orderSections(args.trade, draft.tradeScopePricingSections)

  return {
    trade: args.trade,
    supportLevel,
    tradePreparedPrimaryCandidates: assemblyHints.primary,
    tradePreparedSecondaryCandidates: assemblyHints.secondary,
    tradePreparedReviewCandidates: assemblyHints.review,
    tradePreparedPricingSections: baseSections,
    tradePreparedMeasurementInputs: uniqStrings(
      [
        ...draft.tradeMeasurementInputDraft,
        ...assemblyHints.notes.slice(0, 2),
        reviewOnly
          ? "Prepared measurements stay review-only until stronger support is available."
          : null,
      ],
      8
    ),
    tradePreparedLaborInputs: uniqStrings(
      [
        ...draft.tradeLaborInputDraft,
        reviewOnly
          ? "Prepared labor inputs are organizational only and must not be treated as production assumptions."
          : null,
      ],
      8
    ),
    tradePreparedAllowanceInputs: uniqStrings(
      [
        ...draft.tradeAllowanceInputDraft,
        reviewOnly
          ? "Prepared allowance inputs stay review-oriented and should not imply hidden pricing spread."
          : null,
      ],
      8
    ),
    tradePreparedPricingNotes: uniqStrings(
      [
        ...draft.tradePricingInputDraft,
        ...draft.tradePricingInputNotes,
        bucketHints.length > 0
          ? `Prepared pricing can stay aligned to ${bucketHints.join(", ")} without changing estimator math.`
          : null,
        assemblyHints.primary.length > 0
          ? `Primary trade-ready candidate: ${assemblyHints.primary.join(", ")}.`
          : null,
        assemblyHints.secondary.length > 0
          ? `Secondary trade candidates: ${assemblyHints.secondary.join(", ")}.`
          : null,
        assemblyHints.review.length > 0
          ? `Review-only candidates: ${assemblyHints.review.join(", ")}.`
          : null,
        repeatedCue
          ? "Repeated-space support can guide preparation order, but not automatic quantity scaling."
          : null,
        args.tradeStack?.isMultiTrade
          ? "Prepared pricing sections are advisory only and must not override multi-trade pricing ownership."
          : null,
        args.complexityProfile?.multiPhase
          ? "Prepared sections should preserve phase-access review instead of collapsing it into a single pricing assumption."
          : null,
        reviewOnly
          ? "Support is weak, so prepared pricing stays descriptive and review-oriented only."
          : "Prepared pricing sections are organization inputs only and do not execute pricing.",
        ...(args.tradePricingBasisBridge?.tradePricingBasisNotes || []).slice(0, 2),
        ...(args.tradePackagePricingPrep?.tradePackageReviewNotes || []).slice(0, 2),
      ],
      10
    ),
  }
}

export function buildTradePreparedPricingInputs(args: {
  tradePricingInputDraft: TradePricingInputDraft
  tradePricingBasisBridge: TradePricingBasisBridge
  tradePackagePricingPrep: TradePackagePricingPrep
  estimateSkeletonHandoff: EstimateSkeletonHandoff | null
  estimateStructureConsumption: EstimateStructureConsumption | null
  planIntelligence: PlanIntelligence | null
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradePreparedPricingInputs {
  if (!args.tradePricingInputDraft) return null

  return buildPreparedPricing({
    trade: args.tradePricingInputDraft.trade,
    tradePricingInputDraft: args.tradePricingInputDraft,
    tradePricingBasisBridge: args.tradePricingBasisBridge,
    tradePackagePricingPrep: args.tradePackagePricingPrep,
    estimateSkeletonHandoff: args.estimateSkeletonHandoff,
    estimateStructureConsumption: args.estimateStructureConsumption,
    planIntelligence: args.planIntelligence,
    tradeStack: args.tradeStack,
    complexityProfile: args.complexityProfile,
  })
}
