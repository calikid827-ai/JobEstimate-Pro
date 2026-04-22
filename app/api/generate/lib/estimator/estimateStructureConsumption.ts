import type { EstimateSkeletonHandoff, EstimatorBucketDraft } from "./estimateSkeletonHandoff"

export type StructuredEstimateBucket = {
  bucketName: string
  bucketRole: EstimatorBucketDraft["bucketRole"]
  likelyTradeCoverage: string[]
  likelyScopeBasis: string[]
  allowanceReviewStatus: EstimatorBucketDraft["allowanceReviewStatus"]
  safeForPrimaryStructure: boolean
}

export type EstimateStructureConsumption = {
  structuredEstimateBuckets: StructuredEstimateBucket[]
  estimateGroupingSignals: string[]
  estimateReviewBuckets: string[]
  estimateStructureNotes: string[]
}

function uniqStrings(values: string[], max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function isPrimarySafe(bucket: EstimatorBucketDraft): boolean {
  return (
    (bucket.bucketRole === "primary package" || bucket.bucketRole === "secondary package") &&
    bucket.allowanceReviewStatus === "structure_ready"
  )
}

export function buildEstimateStructureConsumption(
  handoff: EstimateSkeletonHandoff | null
): EstimateStructureConsumption | null {
  if (!handoff || !Array.isArray(handoff.estimatorBucketDrafts) || handoff.estimatorBucketDrafts.length === 0) {
    return null
  }

  const structuredEstimateBuckets: StructuredEstimateBucket[] = handoff.estimatorBucketDrafts
    .map((bucket) => ({
      bucketName: bucket.bucketName,
      bucketRole: bucket.bucketRole,
      likelyTradeCoverage: uniqStrings(bucket.likelyTradeCoverage, 6),
      likelyScopeBasis: uniqStrings(bucket.likelyScopeBasis, 6),
      allowanceReviewStatus: bucket.allowanceReviewStatus,
      safeForPrimaryStructure: isPrimarySafe(bucket),
    }))
    .slice(0, 8)

  const estimateGroupingSignals = uniqStrings(
    [
      ...structuredEstimateBuckets
        .filter((bucket) => bucket.safeForPrimaryStructure)
        .map((bucket) => `Use ${bucket.bucketName} as a main estimate section.`),
      ...structuredEstimateBuckets
        .filter(
          (bucket) =>
            !bucket.safeForPrimaryStructure &&
            bucket.bucketRole !== "allowance/review package"
        )
        .map((bucket) => `Keep ${bucket.bucketName} as a supporting estimate section.`),
      ...handoff.estimatorBucketGuidance,
    ],
    8
  )

  const estimateReviewBuckets = uniqStrings(
    structuredEstimateBuckets
      .filter(
        (bucket) =>
          bucket.allowanceReviewStatus !== "structure_ready" ||
          bucket.bucketRole === "allowance/review package"
      )
      .map((bucket) => `${bucket.bucketName}: review/allowance-oriented`),
    8
  )

  const estimateStructureNotes = uniqStrings(
    [
      handoff.estimateStructureHandoffSummary,
      ...handoff.bucketHandoffNotes,
      structuredEstimateBuckets.some((bucket) => bucket.safeForPrimaryStructure)
        ? "When plan support is strong, package buckets can guide estimate sectioning before pricing."
        : "Plan support is not strong enough to promote hard estimate sections beyond review-oriented guidance.",
      estimateReviewBuckets.length > 0
        ? "Buckets marked for review should stay support-only until scope or schedule support improves."
        : null,
    ].filter(Boolean) as string[],
    8
  )

  if (
    structuredEstimateBuckets.length === 0 &&
    estimateGroupingSignals.length === 0 &&
    estimateReviewBuckets.length === 0 &&
    estimateStructureNotes.length === 0
  ) {
    return null
  }

  return {
    structuredEstimateBuckets,
    estimateGroupingSignals,
    estimateReviewBuckets,
    estimateStructureNotes,
  }
}
