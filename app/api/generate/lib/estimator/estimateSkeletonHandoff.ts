import type { PlanIntelligence } from "../plans/types"

export type EstimatorBucketDraft = {
  bucketName: string
  bucketRole: "primary package" | "secondary package" | "support package" | "allowance/review package"
  likelyTradeCoverage: string[]
  likelyScopeBasis: string[]
  allowanceReviewStatus: "structure_ready" | "support_only" | "allowance_review"
}

export type EstimateSkeletonHandoff = {
  estimatorBucketGuidance: string[]
  estimatorBucketDrafts: EstimatorBucketDraft[]
  bucketScopeDrafts: string[]
  bucketAllowanceFlags: string[]
  bucketHandoffNotes: string[]
  estimateStructureHandoffSummary: string
}

function uniqStrings(values: string[], max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function hasText(items: string[] | undefined, pattern: RegExp): boolean {
  return Array.isArray(items) && items.some((item) => pattern.test(String(item || "")))
}

function buildBucketDraft(args: {
  bucketName: string
  bucketRole: EstimatorBucketDraft["bucketRole"]
  likelyTradeCoverage: string[]
  likelyScopeBasis: string[]
  allowanceReviewStatus: EstimatorBucketDraft["allowanceReviewStatus"]
}): EstimatorBucketDraft {
  return {
    bucketName: args.bucketName,
    bucketRole: args.bucketRole,
    likelyTradeCoverage: uniqStrings(args.likelyTradeCoverage, 6),
    likelyScopeBasis: uniqStrings(args.likelyScopeBasis, 6),
    allowanceReviewStatus: args.allowanceReviewStatus,
  }
}

export function buildEstimateSkeletonHandoff(
  planIntelligence: PlanIntelligence | null
): EstimateSkeletonHandoff | null {
  if (!planIntelligence?.ok) return null

  const packageCandidates = uniqStrings(
    planIntelligence.estimatePackageCandidates ||
      planIntelligence.packageScopeCandidates ||
      [],
    8
  )
  const pricingPackageSignals = planIntelligence.pricingPackageSignals || []
  const prototypePackageSignals = planIntelligence.prototypePackageSignals || []
  const tradePackageSignals = planIntelligence.tradePackageSignals || []
  const pricingBasisSignals = planIntelligence.packagePricingBasisSignals || []
  const allowanceSignals = planIntelligence.packageAllowanceSignals || []
  const structureSignals = planIntelligence.estimateStructureSignals || []
  const assemblyGuidance = planIntelligence.estimateAssemblyGuidance || []
  const scaffoldNotes = planIntelligence.estimateScaffoldNotes || []
  const coverageGaps = planIntelligence.bidCoverageGaps || []

  const drafts: EstimatorBucketDraft[] = []

  const hasGuestRoom =
    hasText(packageCandidates, /\bguest room package\b/i) ||
    hasText(pricingPackageSignals, /\bguest room package\b/i)
  const hasGuestBathroom =
    hasText(packageCandidates, /\bguest bathroom package\b/i) ||
    hasText(pricingPackageSignals, /\bguest bathroom package\b/i)
  const hasCorridor =
    hasText(packageCandidates, /\bcorridor package\b/i) ||
    hasText(pricingPackageSignals, /\bcorridor package\b/i)
  const hasCommonArea =
    hasText(packageCandidates, /\bcommon-area package\b/i) ||
    hasText(pricingPackageSignals, /\bcommon-area package\b/i)
  const hasFinish =
    hasText(packageCandidates, /\bfinish package\b/i) ||
    hasText(pricingPackageSignals, /\bfinish package\b/i)
  const hasWetArea =
    hasText(packageCandidates, /\bwet-area package\b/i) ||
    hasText(pricingPackageSignals, /\bwet-area package\b/i)

  if (hasGuestRoom) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Guest Room Package",
        bucketRole: hasText(prototypePackageSignals, /\bguest room\b/i)
          ? "primary package"
          : "secondary package",
        likelyTradeCoverage: ["painting", "flooring", "carpentry"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Prototype room or repeat-room signals",
          ...pricingBasisSignals.filter((item) => /\bguest room\b|\bprototype\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bprototype\b|\brepeat count\b/i)
          ? "allowance_review"
          : "structure_ready",
      })
    )
  }

  if (hasGuestBathroom) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Guest Bathroom Package",
        bucketRole: hasText(prototypePackageSignals, /\bbathroom\b/i)
          ? "primary package"
          : "secondary package",
        likelyTradeCoverage: ["plumbing", "tile", "painting"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Bathroom layout, fixture, and wet-area signals",
          ...pricingBasisSignals.filter((item) => /\bbathroom\b|\bwet-area\b|\bfixture\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bfixture-schedule\b|\bwet-area\b/i)
          ? "allowance_review"
          : "structure_ready",
      })
    )
  }

  if (hasCorridor) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Corridor Package",
        bucketRole: "secondary package",
        likelyTradeCoverage: ["painting", "flooring", "electrical support"].filter((trade) =>
          trade === "electrical support"
            ? hasText(planIntelligence.sheetRoleSignals || [], /\belectrical plan\b/i)
            : hasText(tradePackageSignals, new RegExp(`\\b${trade.split(" ")[0]}\\b`, "i")) ||
              (planIntelligence.detectedTrades || []).includes(trade.split(" ")[0])
        ),
        likelyScopeBasis: [
          "Corridor sheet and corridor refresh signals",
          ...pricingBasisSignals.filter((item) => /\bcorridor\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bcorridor\b/i)
          ? "allowance_review"
          : "support_only",
      })
    )
  }

  if (hasCommonArea) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Common-Area Package",
        bucketRole: "allowance/review package",
        likelyTradeCoverage: uniqStrings(
          (planIntelligence.detectedTrades || []).slice(0, 3),
          3
        ),
        likelyScopeBasis: [
          "Common-area or public-area sheet cues",
          ...allowanceSignals.filter((item) => /\bcommon-area\b|\ballowance\b/i.test(item)),
        ],
        allowanceReviewStatus: "allowance_review",
      })
    )
  }

  if (hasFinish) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Finish Support Package",
        bucketRole: "support package",
        likelyTradeCoverage: ["painting", "flooring"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Finish schedule and repeated finish cues",
          ...pricingBasisSignals.filter((item) => /\bfinish\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(allowanceSignals, /\bfinish\b|\ballowance\b/i)
          ? "allowance_review"
          : "support_only",
      })
    )
  }

  if (hasWetArea && !hasGuestBathroom) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Wet-Area Support Package",
        bucketRole: "support package",
        likelyTradeCoverage: ["plumbing", "tile"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Wet-area and bathroom-detail cues",
          ...pricingBasisSignals.filter((item) => /\bwet-area\b|\bbathroom\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bwet-area\b/i)
          ? "allowance_review"
          : "support_only",
      })
    )
  }

  const estimatorBucketDrafts = drafts.slice(0, 8)

  if (estimatorBucketDrafts.length === 0) {
    return null
  }

  const estimatorBucketGuidance = uniqStrings(
    [
      ...structureSignals,
      ...assemblyGuidance,
      "Use plan-derived package buckets as estimate structure guidance only; do not treat them as counted quantities.",
    ],
    6
  )

  const bucketScopeDrafts = estimatorBucketDrafts.map((bucket) => {
    return `${bucket.bucketName}: ${bucket.likelyScopeBasis.join("; ")}.`
  })

  const bucketAllowanceFlags = estimatorBucketDrafts
    .filter((bucket) => bucket.allowanceReviewStatus !== "structure_ready")
    .map(
      (bucket) =>
        `${bucket.bucketName}: ${bucket.allowanceReviewStatus === "allowance_review" ? "allowance/review" : "support-only"}`
    )

  const bucketHandoffNotes = uniqStrings(
    [
      ...scaffoldNotes,
      ...coverageGaps,
      "Draft buckets are estimate-structure guidance, not priced or counted sections.",
    ],
    8
  )

  const primaryBuckets = estimatorBucketDrafts
    .filter((bucket) => bucket.bucketRole === "primary package")
    .map((bucket) => bucket.bucketName)
  const supportBuckets = estimatorBucketDrafts
    .filter((bucket) =>
      bucket.bucketRole === "support package" ||
      bucket.bucketRole === "allowance/review package"
    )
    .map((bucket) => bucket.bucketName)

  const estimateStructureHandoffSummary = [
    primaryBuckets.length > 0
      ? `Primary structure candidates: ${primaryBuckets.join(", ")}.`
      : null,
    supportBuckets.length > 0
      ? `Support/review buckets: ${supportBuckets.join(", ")}.`
      : null,
    "Use as a first-pass estimator scaffold only; counts and pricing remain unresolved.",
  ]
    .filter(Boolean)
    .join(" ")

  return {
    estimatorBucketGuidance,
    estimatorBucketDrafts,
    bucketScopeDrafts,
    bucketAllowanceFlags,
    bucketHandoffNotes,
    estimateStructureHandoffSummary,
  }
}
