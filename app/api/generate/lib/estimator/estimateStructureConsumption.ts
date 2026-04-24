import type {
  EstimateSkeletonHandoff,
  EstimatorBucketDraft,
  EstimatorSectionSkeleton,
} from "./estimateSkeletonHandoff"

export type StructuredEstimateBucket = {
  bucketName: string
  bucketRole: EstimatorBucketDraft["bucketRole"]
  likelyTradeCoverage: string[]
  likelyScopeBasis: string[]
  allowanceReviewStatus: EstimatorBucketDraft["allowanceReviewStatus"]
  safeForPrimaryStructure: boolean
}

export type StructuredEstimateSection = {
  sectionTitle: string
  trade: EstimatorSectionSkeleton["trade"]
  bucketName: string
  supportType: EstimatorSectionSkeleton["supportType"]
  scopeBreadth: EstimatorSectionSkeleton["scopeBreadth"]
  sectionReadiness: EstimatorSectionSkeleton["sectionReadiness"]
  quantityAnchor: string | null
  scopeBullets: string[]
  cautionNotes: string[]
  safeForSectionBuild: boolean
  evidence: EstimatorSectionSkeleton["evidence"]
}

export type EstimateStructureConsumption = {
  structuredEstimateBuckets: StructuredEstimateBucket[]
  structuredEstimateSections: StructuredEstimateSection[]
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

function isSectionBuildSafe(section: EstimatorSectionSkeleton): boolean {
  return (
    (section.sectionReadiness === "section_anchor" ||
      section.sectionReadiness === "scalable_hint") &&
    section.supportType !== "support_only"
  )
}

export function buildEstimateStructureConsumption(
  handoff: EstimateSkeletonHandoff | null
): EstimateStructureConsumption | null {
  if (
    !handoff ||
    ((!Array.isArray(handoff.estimatorBucketDrafts) ||
      handoff.estimatorBucketDrafts.length === 0) &&
      (!Array.isArray(handoff.estimatorSectionSkeletons) ||
        handoff.estimatorSectionSkeletons.length === 0))
  ) {
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

  const structuredEstimateSections: StructuredEstimateSection[] = (
    handoff.estimatorSectionSkeletons || []
  )
    .map((section) => ({
      sectionTitle: section.sectionTitle,
      trade: section.trade,
      bucketName: section.bucketName,
      supportType: section.supportType,
      scopeBreadth: section.scopeBreadth,
      sectionReadiness: section.sectionReadiness,
      quantityAnchor: section.quantityAnchor,
      scopeBullets: uniqStrings(section.scopeBullets || [], 5),
      cautionNotes: uniqStrings(section.cautionNotes || [], 5),
      safeForSectionBuild: isSectionBuildSafe(section),
      evidence: (section.evidence || []).slice(0, 6),
    }))
    .slice(0, 12)

  const estimateGroupingSignals = uniqStrings(
    [
      ...structuredEstimateBuckets
        .filter((bucket) => bucket.safeForPrimaryStructure)
        .map((bucket) => `Use ${bucket.bucketName} as a main estimate section.`),
      ...structuredEstimateSections
        .filter((section) => section.safeForSectionBuild)
        .map((section) =>
          section.sectionReadiness === "scalable_hint"
            ? `Use ${section.sectionTitle} as a scalable section hint, not a measured total.`
            : `Use ${section.sectionTitle} as a section-ready estimator anchor.`
        ),
      ...structuredEstimateBuckets
        .filter(
          (bucket) =>
            !bucket.safeForPrimaryStructure &&
            bucket.bucketRole !== "allowance/review package"
        )
        .map((bucket) => `Keep ${bucket.bucketName} as a supporting estimate section.`),
      ...structuredEstimateSections
        .filter((section) => !section.safeForSectionBuild)
        .map((section) => `Keep ${section.sectionTitle} narrow and review-oriented.`),
      ...handoff.estimatorBucketGuidance,
    ],
    12
  )

  const estimateReviewBuckets = uniqStrings(
    [
      ...structuredEstimateBuckets
        .filter(
          (bucket) =>
            bucket.allowanceReviewStatus !== "structure_ready" ||
            bucket.bucketRole === "allowance/review package"
        )
        .map((bucket) => `${bucket.bucketName}: review/allowance-oriented`),
      ...structuredEstimateSections
        .filter((section) => !section.safeForSectionBuild)
        .map((section) => `${section.sectionTitle}: review-oriented`),
    ],
    10
  )

  const estimateStructureNotes = uniqStrings(
    [
      handoff.estimateStructureHandoffSummary,
      ...handoff.bucketHandoffNotes,
      ...structuredEstimateSections.map((section) =>
        section.quantityAnchor
          ? `${section.sectionTitle} quantity anchor: ${section.quantityAnchor}.`
          : `${section.sectionTitle} is supported without a measured quantity anchor.`
      ),
      ...structuredEstimateSections.flatMap((section) => section.cautionNotes),
      structuredEstimateBuckets.some((bucket) => bucket.safeForPrimaryStructure)
        ? "When plan support is strong, package buckets can guide estimate sectioning before pricing."
        : "Plan support is not strong enough to promote hard estimate sections beyond review-oriented guidance.",
      structuredEstimateSections.some((section) => section.safeForSectionBuild)
        ? "Section skeletons can organize downstream estimate composition without changing pricing authority."
        : null,
      estimateReviewBuckets.length > 0
        ? "Buckets marked for review should stay support-only until scope or schedule support improves."
        : null,
    ].filter(Boolean) as string[],
    12
  )

  if (
    structuredEstimateBuckets.length === 0 &&
    structuredEstimateSections.length === 0 &&
    estimateGroupingSignals.length === 0 &&
    estimateReviewBuckets.length === 0 &&
    estimateStructureNotes.length === 0
  ) {
    return null
  }

  return {
    structuredEstimateBuckets,
    structuredEstimateSections,
    estimateGroupingSignals,
    estimateReviewBuckets,
    estimateStructureNotes,
  }
}
