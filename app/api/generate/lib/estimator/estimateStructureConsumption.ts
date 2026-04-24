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
  quantityNormalization: "measured" | "scaled_prototype" | "review_only" | "support_only"
  scopeBullets: string[]
  cautionNotes: string[]
  tradeMeasurementDrafts: string[]
  normalizedEstimatorInputCandidates: string[]
  estimatorInputGuardrails: string[]
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

function uniqStrings(values: Array<string | null | undefined>, max = 8): string[] {
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

function getQuantityNormalization(
  section: EstimatorSectionSkeleton
): StructuredEstimateSection["quantityNormalization"] {
  if (section.sectionReadiness === "section_anchor") return "measured"
  if (section.sectionReadiness === "scalable_hint") return "scaled_prototype"
  if (section.sectionReadiness === "support_only") return "support_only"
  return "review_only"
}

function buildTradeMeasurementDrafts(section: EstimatorSectionSkeleton): string[] {
  const anchor = section.quantityAnchor

  if (section.trade === "painting") {
    return uniqStrings(
      [
        anchor
          ? `Measurement draft: anchor painting section "${section.sectionTitle}" from ${anchor}.`
          : null,
        section.sectionReadiness === "scalable_hint"
          ? `Measurement draft: use "${section.sectionTitle}" as a prototype-room paint scaling hint, not a measured total.`
          : null,
      ],
      4
    )
  }

  if (section.trade === "wallcovering") {
    return uniqStrings(
      [
        anchor
          ? `Measurement draft: use ${anchor} only for explicit wallcovering coverage in "${section.sectionTitle}".`
          : `Measurement draft: keep "${section.sectionTitle}" review-oriented until wallcovering elevations or area support are stronger.`,
      ],
      4
    )
  }

  if (section.trade === "flooring" || section.trade === "tile") {
    return uniqStrings(
      [
        anchor
          ? `Measurement draft: use ${anchor} for ${section.trade} section planning in "${section.sectionTitle}".`
          : `Measurement draft: keep "${section.sectionTitle}" narrow until floor/tile quantity support is explicit.`,
      ],
      4
    )
  }

  if (section.trade === "electrical" || section.trade === "plumbing") {
    return uniqStrings(
      [
        anchor
          ? `Measurement draft: use ${anchor} as counted support for "${section.sectionTitle}".`
          : `Measurement draft: use schedule/context support to organize "${section.sectionTitle}" without inventing totals.`,
      ],
      4
    )
  }

  return uniqStrings(
    [
      anchor
        ? `Measurement draft: use ${anchor} only for removal/demo scope in "${section.sectionTitle}".`
        : `Measurement draft: keep "${section.sectionTitle}" support-only.`,
    ],
    4
  )
}

function buildNormalizedEstimatorInputCandidates(section: EstimatorSectionSkeleton): string[] {
  const anchor = section.quantityAnchor
  const normalized = getQuantityNormalization(section)

  return uniqStrings(
    [
      normalized === "measured" && anchor
        ? `Normalized estimator input: ${section.sectionTitle} -> measured candidate anchored by ${anchor}.`
        : null,
      normalized === "scaled_prototype"
        ? `Normalized estimator input: ${section.sectionTitle} -> scalable prototype candidate from repeated-room support.`
        : null,
      normalized === "review_only"
        ? `Normalized estimator input: ${section.sectionTitle} -> review-only candidate with narrow or schedule-reinforced support.`
        : null,
      normalized === "support_only"
        ? `Normalized estimator input: ${section.sectionTitle} -> removal/support candidate only; keep separate from install sections.`
        : null,
      ...section.scopeBullets.slice(0, 2).map((item) => `Section basis: ${item}`),
    ],
    5
  )
}

function buildEstimatorInputGuardrails(section: EstimatorSectionSkeleton): string[] {
  return uniqStrings(
    [
      ...section.cautionNotes,
      section.sectionReadiness === "scalable_hint"
        ? "Guardrail: scalable prototype support must not be treated as a measured total."
        : null,
      section.sectionReadiness === "review_only"
        ? "Guardrail: review-only sections reinforce estimator inputs, but must stay non-binding."
        : null,
      section.supportType === "demo_only"
        ? "Guardrail: demo/removal sections must remain separate from install estimator inputs."
        : null,
    ],
    6
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
      quantityNormalization: getQuantityNormalization(section),
      scopeBullets: uniqStrings(section.scopeBullets || [], 5),
      cautionNotes: uniqStrings(section.cautionNotes || [], 5),
      tradeMeasurementDrafts: buildTradeMeasurementDrafts(section),
      normalizedEstimatorInputCandidates: buildNormalizedEstimatorInputCandidates(section),
      estimatorInputGuardrails: buildEstimatorInputGuardrails(section),
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
      ...structuredEstimateSections
        .flatMap((section) => section.normalizedEstimatorInputCandidates.slice(0, 1)),
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
      ...structuredEstimateSections.flatMap((section) => section.estimatorInputGuardrails),
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
