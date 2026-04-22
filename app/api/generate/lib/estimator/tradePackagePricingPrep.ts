import type { PlanIntelligence } from "../plans/types"
import type { ComplexityProfile, TradeStack } from "./types"
import type { EstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import type { EstimateStructureConsumption } from "./estimateStructureConsumption"

export type TradePackagePricingPrepTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

export type TradePackagePricingPrep = {
  trade: TradePackagePricingPrepTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradePackagePricingGuidance: string[]
  tradePackageScopeBasis: string[]
  tradePackageMeasurementHints: string[]
  tradePackageProductionFactors: string[]
  tradePackageRiskFlags: string[]
  tradePackageReviewNotes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function hasAnyText(items: string[] | undefined, pattern: RegExp): boolean {
  return Array.isArray(items) && items.some((item) => pattern.test(String(item || "")))
}

function joinPlanCorpus(planIntelligence: PlanIntelligence | null): string {
  if (!planIntelligence?.ok) return ""

  return [
    planIntelligence.summary || "",
    ...(planIntelligence.detectedTrades || []),
    ...(planIntelligence.detectedRooms || []),
    ...(planIntelligence.sheetRoleSignals || []),
    ...(planIntelligence.pricingPackageSignals || []),
    ...(planIntelligence.prototypePackageSignals || []),
    ...(planIntelligence.packageScopeCandidates || []),
    ...(planIntelligence.packagePricingBasisSignals || []),
    ...(planIntelligence.tradePackageSignals || []),
    ...(planIntelligence.scopeAssist?.suggestedAdditions || []),
    ...(planIntelligence.notes || []),
    ...(planIntelligence.analyses || []).flatMap((analysis) => [
      ...(analysis.textSnippets || []),
      ...(analysis.notes || []),
      ...(analysis.tradeFindings || []).map((finding) => finding.label),
      ...(analysis.tradeFindings || []).flatMap((finding) => finding.notes || []),
      ...(analysis.schedules || []).map((schedule) => schedule.label),
      ...(analysis.schedules || []).flatMap((schedule) => schedule.notes || []),
    ]),
  ]
    .join(" ")
    .toLowerCase()
}

function detectTargetTrade(args: {
  trade: string
  scopeText: string
  tradeStack: TradeStack | null
  planIntelligence: PlanIntelligence | null
}): TradePackagePricingPrepTrade | null {
  const directTrade = String(args.trade || "").trim().toLowerCase()
  if (directTrade === "painting" || directTrade === "drywall") {
    return directTrade
  }
  if (directTrade === "wallcovering") {
    return "wallcovering"
  }

  const scopeBlob = `${args.scopeText} ${(args.tradeStack?.trades || []).join(" ")} ${
    args.tradeStack?.primaryTrade || ""
  } ${joinPlanCorpus(args.planIntelligence)}`.toLowerCase()

  if (/\b(wallcover(?:ing)?|wallpaper|vinyl wallcovering|fabric wallcovering)\b/.test(scopeBlob)) {
    return "wallcovering"
  }
  if (args.tradeStack?.trades?.includes("drywall")) return "drywall"
  if (args.tradeStack?.trades?.includes("painting")) return "painting"

  return null
}

function getRelevantBuckets(args: {
  trade: TradePackagePricingPrepTrade
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
}): {
  primary: string[]
  review: string[]
} {
  const names = new Set<string>()
  const review = new Set<string>()

  const bucketMatchesTrade = (coverage: string[]) => {
    const joined = coverage.join(" ").toLowerCase()
    if (args.trade === "painting") return /\bpainting\b/.test(joined)
    if (args.trade === "drywall") return /\bdrywall\b/.test(joined)
    return /\bpainting\b|\bwallcover(?:ing)?\b|\bfinish\b/.test(joined)
  }

  for (const bucket of args.handoff?.estimatorBucketDrafts || []) {
    if (!bucketMatchesTrade(bucket.likelyTradeCoverage || [])) continue
    names.add(bucket.bucketName)
    if (bucket.allowanceReviewStatus !== "structure_ready") {
      review.add(bucket.bucketName)
    }
  }

  for (const bucket of args.structure?.structuredEstimateBuckets || []) {
    if (!bucketMatchesTrade(bucket.likelyTradeCoverage || [])) continue
    names.add(bucket.bucketName)
    if (!bucket.safeForPrimaryStructure) {
      review.add(bucket.bucketName)
    }
  }

  return {
    primary: Array.from(names).slice(0, 4),
    review: Array.from(review).slice(0, 4),
  }
}

function getSupportLevel(args: {
  trade: TradePackagePricingPrepTrade
  planIntelligence: PlanIntelligence | null
  relevantBuckets: { primary: string[]; review: string[] }
  scopeText: string
}): "strong" | "moderate" | "weak" {
  const plan = args.planIntelligence
  if (!plan?.ok) return "weak"

  const scopeText = args.scopeText.toLowerCase()
  let score = 0

  if (plan.confidenceScore >= 85) score += 2
  else if (plan.confidenceScore >= 65) score += 1

  if (args.relevantBuckets.primary.length > 0) score += 1

  if (args.trade === "painting") {
    if ((plan.takeoff.wallSqft || 0) > 0) score += 2
    if ((plan.takeoff.ceilingSqft || 0) > 0) score += 1
    if ((plan.takeoff.roomCount || 0) > 0) score += 1
    if (hasAnyText(plan.pricingPackageSignals, /\bfinish package\b|\bcorridor package\b/i)) score += 1
    if (hasAnyText(plan.tradePackageSignals, /\bpaint(?:ing)?\b|\bfinish package\b/i)) score += 1
  } else if (args.trade === "drywall") {
    if (hasAnyText(plan.detectedTrades, /\bdrywall\b/i)) score += 2
    if ((plan.takeoff.wallSqft || 0) > 0 && /\b(drywall|sheetrock|patch|texture)\b/.test(scopeText)) score += 1
    if (
      plan.analyses.some((analysis) =>
        (analysis.tradeFindings || []).some((finding) => finding.trade === "drywall")
      )
    ) {
      score += 2
    }
  } else {
    if (hasAnyText(plan.tradePackageSignals, /\bwallcover(?:ing)?\b/i)) score += 2
    if (hasAnyText(plan.sheetRoleSignals, /\bfinish plan\b|\bfinish schedule\b/i)) score += 1
    if (hasAnyText(plan.pricingPackageSignals, /\bcorridor package\b|\bfinish package\b/i)) score += 1
    if (/\bwallcover(?:ing)?|wallpaper\b/.test(joinPlanCorpus(plan))) score += 1
  }

  if (score >= 5) return "strong"
  if (score >= 3) return "moderate"
  return "weak"
}

function buildPaintingPrep(args: {
  supportLevel: "strong" | "moderate" | "weak"
  planIntelligence: PlanIntelligence | null
  scopeText: string
  complexityProfile: ComplexityProfile | null
  relevantBuckets: { primary: string[]; review: string[] }
}): TradePackagePricingPrep {
  const plan = args.planIntelligence
  const scopeText = args.scopeText.toLowerCase()
  const isExterior = /\b(exterior|outside|stucco|siding|fascia|soffit|eaves?)\b/.test(scopeText)
  const hasWallcoveringMix = /\b(wallcover(?:ing)?|wallpaper)\b/.test(scopeText)

  return {
    trade: "painting",
    supportLevel: args.supportLevel,
    tradePackagePricingGuidance: uniqStrings(
      [
        args.supportLevel !== "weak" && args.relevantBuckets.primary.length > 0
          ? `Use ${args.relevantBuckets.primary.join(", ")} as painting package boundaries before spreading scope wider.`
          : null,
        (plan?.takeoff.roomCount || 0) > 0
          ? "Repeated room signals can support prototype-led painting packages, but only where plan repetition is explicit."
          : null,
        hasAnyText(plan?.pricingPackageSignals, /\bcorridor package\b/i)
          ? "Carry corridor painting as its own package instead of blending it into room interiors."
          : null,
        isExterior
          ? "Treat exterior elevations and trim/access setup as separate painting package review drivers."
          : "Use finish-plan and room-package cues as structure guidance only; do not convert them into assumed counts.",
        "Keep painting prep guidance additive only; leave final pricing math unchanged.",
      ],
      6
    ),
    tradePackageScopeBasis: uniqStrings(
      [
        (plan?.takeoff.wallSqft || 0) > 0
          ? `Plan takeoff includes wall-area support (${plan?.takeoff.wallSqft} wall sqft).`
          : null,
        (plan?.takeoff.ceilingSqft || 0) > 0
          ? `Plan takeoff includes ceiling-area support (${plan?.takeoff.ceilingSqft} ceiling sqft).`
          : null,
        (plan?.takeoff.roomCount || 0) > 0
          ? `Plan takeoff includes repeated-space support (${plan?.takeoff.roomCount} rooms).`
          : null,
        args.relevantBuckets.primary.length > 0
          ? `Estimate structure handoff ties painting to ${args.relevantBuckets.primary.join(", ")}.`
          : null,
        args.supportLevel === "weak"
          ? "Painting is supported mainly by scope text and trade-stack cues; plan package support is still thin."
          : null,
      ],
      6
    ),
    tradePackageMeasurementHints: uniqStrings(
      [
        "Confirm whether ceilings, doors, frames, and trim are included before scaling any paint package.",
        isExterior
          ? "Confirm elevation-by-elevation coverage, story/access conditions, and whether detached elements are excluded."
          : "Confirm whether corridor/common-area paint is separate from room interiors.",
        (plan?.takeoff.wallSqft || 0) <= 0 && (plan?.takeoff.roomCount || 0) <= 0
          ? "Plan support does not provide strong measured painting coverage; verify wall area or repeat-room counts manually."
          : null,
        hasWallcoveringMix
          ? "Confirm whether wallcovering removal or substrate prep sits inside the painting package or stays separate."
          : null,
      ],
      6
    ),
    tradePackageProductionFactors: uniqStrings(
      [
        "Masking, cut-in, and protection setup can dominate labor even when plan package cues are clean.",
        /\b(prime|primer|two coats|2 coats|three coats|3 coats)\b/.test(scopeText)
          ? "Prime and multi-coat requirements should slow production relative to a light repaint."
          : "Finish quality, color change, and prep intensity can shift production without changing measured area.",
        args.complexityProfile?.multiPhase
          ? "Multi-phase sequencing can reduce daily painted area and create repeat mobilization."
          : null,
        /\b(tall|vaulted|high ceiling)\b/.test(scopeText)
          ? "High walls or ceilings should be treated as a production drag rather than a simple area multiplier."
          : null,
      ],
      6
    ),
    tradePackageRiskFlags: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Plan support is too weak to spread painting scope aggressively from package cues alone."
          : null,
        args.relevantBuckets.review.length > 0
          ? `${args.relevantBuckets.review.join(", ")} remain review-oriented rather than structure-ready for painting.`
          : null,
        hasWallcoveringMix
          ? "Wallcovering-related prep may be hiding inside the painting scope and can materially slow production."
          : null,
        args.complexityProfile?.multiTrade
          ? "Multi-trade sequencing may delay paint-ready turnover and rework timing."
          : null,
      ],
      6
    ),
    tradePackageReviewNotes: uniqStrings(
      [
        "Use this module as pricing prep guidance only; it must not alter pricing calculations.",
        "Do not invent room counts, wall area, or door counts beyond explicit plan support.",
        args.supportLevel === "weak"
          ? "Fallback mode: keep painting package guidance descriptive and route quantity decisions back to manual review."
          : "When plan support is present, treat it as package scaffolding rather than hard priced takeoff.",
      ],
      6
    ),
  }
}

function buildDrywallPrep(args: {
  supportLevel: "strong" | "moderate" | "weak"
  planIntelligence: PlanIntelligence | null
  scopeText: string
  complexityProfile: ComplexityProfile | null
  relevantBuckets: { primary: string[]; review: string[] }
}): TradePackagePricingPrep {
  const plan = args.planIntelligence
  const scopeText = args.scopeText.toLowerCase()
  const patchLike = /\b(patch|repair|hole|crack|texture match|orange peel|knockdown)\b/.test(scopeText)
  const installLike = /\b(hang|install|sheetrock|drywall)\b/.test(scopeText)

  return {
    trade: "drywall",
    supportLevel: args.supportLevel,
    tradePackagePricingGuidance: uniqStrings(
      [
        patchLike
          ? "Keep drywall patch/repair package logic separate from full install-and-finish logic."
          : null,
        installLike
          ? "Use drywall package guidance only where plans or scope clearly tie wall area to board-and-finish work."
          : "Do not let general finish-package cues stand in for explicit drywall quantity support.",
        args.relevantBuckets.primary.length > 0
          ? `Relevant estimate buckets for drywall review: ${args.relevantBuckets.primary.join(", ")}.`
          : null,
        "Drywall prep guidance can frame package structure without changing existing pricing owners or math.",
      ],
      6
    ),
    tradePackageScopeBasis: uniqStrings(
      [
        plan?.analyses.some((analysis) =>
          (analysis.tradeFindings || []).some((finding) => finding.trade === "drywall")
        )
          ? "Plan intelligence found explicit drywall trade findings."
          : null,
        (plan?.takeoff.wallSqft || 0) > 0 && installLike
          ? `Wall-area support exists (${plan?.takeoff.wallSqft} wall sqft), but only use it where drywall scope is explicit.`
          : null,
        args.relevantBuckets.primary.length > 0
          ? `Estimate structure handoff associates drywall review with ${args.relevantBuckets.primary.join(", ")}.`
          : null,
        args.supportLevel === "weak"
          ? "Drywall package basis is currently coming more from scope wording than from strong plan-backed quantities."
          : null,
      ],
      6
    ),
    tradePackageMeasurementHints: uniqStrings(
      [
        "Confirm whether drywall scope is patch/repair, full install, ceiling work, or a mixed package.",
        "Confirm finish level and any texture-match requirement before leaning on package-based prep guidance.",
        patchLike
          ? "Patch counts, patch sizes, and ceiling locations need manual confirmation when plans do not enumerate them."
          : "If plans do not tie area directly to drywall assemblies, verify sheets or measured wall area manually.",
        /\bceiling\b/.test(scopeText)
          ? "Ceiling drywall should be confirmed separately because access and production differ from walls."
          : null,
      ],
      6
    ),
    tradePackageProductionFactors: uniqStrings(
      [
        "Drywall production can require multiple visits for tape, mud, drying, sanding, and final texture/finish.",
        /\blevel 5\b/.test(scopeText)
          ? "Level 5 finish should be treated as materially slower than standard finish work."
          : "Finish level and texture-match quality expectations can change production more than raw area alone.",
        /\btexture|orange peel|knockdown|skip trowel\b/.test(scopeText)
          ? "Texture matching adds finish passes and slows closeout."
          : null,
        args.complexityProfile?.multiPhase
          ? "Sequenced access can stretch drywall duration because return trips are often mandatory."
          : null,
      ],
      6
    ),
    tradePackageRiskFlags: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Plan support is weak for drywall package spread; avoid treating package cues as measured takeoff."
          : null,
        args.relevantBuckets.review.length > 0
          ? `${args.relevantBuckets.review.join(", ")} are still review/support buckets for drywall.`
          : null,
        patchLike && !/\d/.test(scopeText)
          ? "Patch/repair scope is present without strong explicit counts."
          : null,
        args.complexityProfile?.multiTrade
          ? "Drywall readiness may depend on adjacent trade turnover and repaint sequencing."
          : null,
      ],
      6
    ),
    tradePackageReviewNotes: uniqStrings(
      [
        "Use this module as drywall pricing prep only; it must stay out of final pricing calculations.",
        "Do not invent sheet counts, patch counts, or finish levels when the plan set does not state them clearly.",
        args.supportLevel === "weak"
          ? "Fallback mode: keep drywall guidance anchored to manual review notes and explicit scope text."
          : "When plan support is stronger, keep drywall package structure separate from later pricing decisions.",
      ],
      6
    ),
  }
}

function buildWallcoveringPrep(args: {
  supportLevel: "strong" | "moderate" | "weak"
  planIntelligence: PlanIntelligence | null
  scopeText: string
  complexityProfile: ComplexityProfile | null
  relevantBuckets: { primary: string[]; review: string[] }
}): TradePackagePricingPrep {
  const plan = args.planIntelligence
  const scopeText = args.scopeText.toLowerCase()
  const hasRemoval = /\b(remove|removal|strip|demo existing)\b/.test(scopeText)

  return {
    trade: "wallcovering",
    supportLevel: args.supportLevel,
    tradePackagePricingGuidance: uniqStrings(
      [
        args.relevantBuckets.primary.length > 0
          ? `Use ${args.relevantBuckets.primary.join(", ")} as wallcovering package boundaries only where finish cues are explicit.`
          : null,
        hasAnyText(plan?.sheetRoleSignals, /\bfinish plan\b|\bfinish schedule\b/i)
          ? "Finish-plan and finish-schedule cues can support wallcovering package structure."
          : null,
        "Separate wallcovering removal/substrate prep from new install whenever scope support is mixed.",
        "Only scale repeated wallcovering packages where repeated-space support is visible in the plan set.",
      ],
      6
    ),
    tradePackageScopeBasis: uniqStrings(
      [
        hasAnyText(plan?.tradePackageSignals, /\bwallcover(?:ing)?\b/i) ||
        /\bwallcover(?:ing)?|wallpaper\b/.test(joinPlanCorpus(plan))
          ? "Plan intelligence contains wallcovering or finish-package cues."
          : null,
        args.relevantBuckets.primary.length > 0
          ? `Estimate structure handoff supports wallcovering review in ${args.relevantBuckets.primary.join(", ")}.`
          : null,
        hasAnyText(plan?.pricingPackageSignals, /\bcorridor package\b|\bfinish package\b/i)
          ? "Repeated finish or corridor package signals may support wallcovering package review."
          : null,
        args.supportLevel === "weak"
          ? "Wallcovering scope is currently inferred mostly from scope text and finish cues, not strong measured plan support."
          : null,
      ],
      6
    ),
    tradePackageMeasurementHints: uniqStrings(
      [
        "Confirm wall elevations, heights, and whether wallcovering applies to full rooms, feature walls, or corridors only.",
        "Confirm pattern repeat, material type, and roll-good assumptions before using package-led prep guidance.",
        hasRemoval
          ? "Confirm whether removal, adhesive cleanup, skim, and seal/prime are included in the wallcovering package."
          : "If no removal is included, confirm substrate readiness and any patch/skim expectations.",
        args.supportLevel === "weak"
          ? "When plan support is weak, verify measured wall area manually before treating repeats as scalable."
          : null,
      ],
      6
    ),
    tradePackageProductionFactors: uniqStrings(
      [
        "Pattern match, seam layout, and directional layout can materially slow wallcovering production.",
        hasRemoval
          ? "Existing wallcovering removal and substrate recovery can outweigh install time."
          : "Substrate prep quality can control productivity more than visible finish area alone.",
        /\b(corridor|lobby|common area)\b/.test(scopeText)
          ? "Long corridor or common-area runs often add layout control and access coordination time."
          : null,
        args.complexityProfile?.multiPhase
          ? "Phased occupancy and access sequencing can force shorter, less efficient wallcovering runs."
          : null,
      ],
      6
    ),
    tradePackageRiskFlags: uniqStrings(
      [
        args.supportLevel === "weak"
          ? "Plan support is too weak to infer wallcovering spread or repeats confidently."
          : null,
        args.relevantBuckets.review.length > 0
          ? `${args.relevantBuckets.review.join(", ")} should stay review-only for wallcovering until elevations and finish details are confirmed.`
          : null,
        !/\b(pattern|repeat|type|vinyl|fabric|wallpaper|wallcovering)\b/.test(scopeText) &&
        !/\b(pattern|repeat|vinyl|fabric|wallpaper|wallcovering)\b/.test(joinPlanCorpus(plan))
          ? "Wallcovering material/pattern details are still thin."
          : null,
        args.complexityProfile?.multiTrade
          ? "Wallcovering readiness may depend on paint/drywall substrate turnover."
          : null,
      ],
      6
    ),
    tradePackageReviewNotes: uniqStrings(
      [
        "Use this module as wallcovering pricing prep only; it must not change final pricing calculations.",
        "Do not invent drops, rolls, pattern waste, or elevation counts without explicit support.",
        args.supportLevel === "weak"
          ? "Fallback mode: keep wallcovering output in manual-review posture until stronger plan support appears."
          : "When plan support exists, keep it as package-structure guidance rather than hard quantity math.",
      ],
      6
    ),
  }
}

export function buildTradePackagePricingPrep(args: {
  trade: string
  planIntelligence: PlanIntelligence | null
  estimateSkeletonHandoff: EstimateSkeletonHandoff | null
  estimateStructureConsumption: EstimateStructureConsumption | null
  scopeText: string
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
}): TradePackagePricingPrep {
  const trade = detectTargetTrade({
    trade: args.trade,
    scopeText: args.scopeText,
    tradeStack: args.tradeStack,
    planIntelligence: args.planIntelligence,
  })

  if (!trade) return null

  const relevantBuckets = getRelevantBuckets({
    trade,
    handoff: args.estimateSkeletonHandoff,
    structure: args.estimateStructureConsumption,
  })

  const supportLevel = getSupportLevel({
    trade,
    planIntelligence: args.planIntelligence,
    relevantBuckets,
    scopeText: args.scopeText,
  })

  if (trade === "painting") {
    return buildPaintingPrep({
      supportLevel,
      planIntelligence: args.planIntelligence,
      scopeText: args.scopeText,
      complexityProfile: args.complexityProfile,
      relevantBuckets,
    })
  }

  if (trade === "drywall") {
    return buildDrywallPrep({
      supportLevel,
      planIntelligence: args.planIntelligence,
      scopeText: args.scopeText,
      complexityProfile: args.complexityProfile,
      relevantBuckets,
    })
  }

  return buildWallcoveringPrep({
    supportLevel,
    planIntelligence: args.planIntelligence,
    scopeText: args.scopeText,
    complexityProfile: args.complexityProfile,
    relevantBuckets,
  })
}
