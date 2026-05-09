import type {
  PlanTradeQuantityCandidate,
  PlanTradeQuantityCandidateGate,
} from "./types"

const DIAGNOSTIC_WARNING_PATTERNS = [
  /candidate only/i,
  /not pricing-eligible/i,
  /not measured takeoff support/i,
]

const UNCLEAR_WARNING_PATTERNS = [
  /unclear/i,
  /unknown/i,
  /weak/i,
  /degraded/i,
  /no clear/i,
  /missing/i,
  /fewer cells/i,
  /not confirmed/i,
]

function uniqueStrings(values: string[], max = 16): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, max)
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function hasUsableSourceRefs(candidate: PlanTradeQuantityCandidate): boolean {
  return candidate.sourceRefs.some(
    (ref) =>
      typeof ref.pageNumber === "number" ||
      typeof ref.sourcePageNumber === "number" ||
      typeof ref.rowIndex === "number"
  )
}

function hasUnclearWarning(candidate: PlanTradeQuantityCandidate): boolean {
  return candidate.warnings.some(
    (warning) =>
      !DIAGNOSTIC_WARNING_PATTERNS.some((pattern) => pattern.test(warning)) &&
      UNCLEAR_WARNING_PATTERNS.some((pattern) => pattern.test(warning))
  )
}

function hasExplicitCountEvidence(candidate: PlanTradeQuantityCandidate): boolean {
  return candidate.assumptions.some((assumption) =>
    /explicit quantity\/count column summed/i.test(assumption)
  )
}

function requiredEvidenceForCandidate(candidate: PlanTradeQuantityCandidate): string[] {
  if (candidate.sourceType === "schedule_table") {
    return [
      "Clear schedule row provenance.",
      "Clear quantity/count support.",
      "No degraded page or weak classification blocker.",
      "Manual product review before pricing use.",
    ]
  }

  if (candidate.sourceType === "finish_matrix") {
    return [
      "Clear finish row provenance.",
      "Measured SF/LF quantity support.",
      "Manual estimator confirmation.",
    ]
  }

  if (candidate.sourceType === "repeated_room_package") {
    return [
      "Clear repeated-room provenance.",
      "Measured quantity support beyond repeat count.",
      "Manual estimator confirmation.",
    ]
  }

  return [
    "Clear source provenance.",
    "Supported quantity unit.",
    "Manual estimator confirmation.",
  ]
}

function presentEvidenceForCandidate(candidate: PlanTradeQuantityCandidate): string[] {
  return uniqueStrings([
    hasUsableSourceRefs(candidate)
      ? `${candidate.sourceRefs.length} source reference${candidate.sourceRefs.length === 1 ? "" : "s"} preserved.`
      : "",
    typeof candidate.quantity === "number"
      ? `${candidate.quantity} ${candidate.unit} candidate quantity.`
      : "",
    `Candidate confidence ${clampConfidence(candidate.confidence)}.`,
    candidate.quantityStatus === "count_only" ? "Count-only support is present." : "",
    candidate.quantityStatus === "needs_measurement" ? "Measurement is still required." : "",
    hasExplicitCountEvidence(candidate) ? "Explicit quantity/count column evidence is present." : "",
  ])
}

function baseBlockers(candidate: PlanTradeQuantityCandidate): string[] {
  return [
    ...(!hasUsableSourceRefs(candidate) ? ["Candidate has no usable source provenance."] : []),
    ...(candidate.confidence < 50 ? ["Candidate confidence is too weak for future handoff."] : []),
    ...(candidate.unit === "unknown" ? ["Candidate unit is unsupported or unknown."] : []),
    ...(candidate.quantity == null ? ["Candidate has no count or quantity value."] : []),
    ...(hasUnclearWarning(candidate)
      ? ["Candidate warnings include unclear, weak, degraded, or missing evidence."]
      : []),
  ]
}

function buildGate(candidate: PlanTradeQuantityCandidate): PlanTradeQuantityCandidateGate {
  const blockers = baseBlockers(candidate)
  const warnings = [
    ...candidate.warnings,
    "Pricing eligibility remains false in Phase 7.",
  ]

  let gateStatus: PlanTradeQuantityCandidateGate["gateStatus"] = "review_only"
  let futureEligible = false

  if (candidate.sourceType === "schedule_table") {
    const isSupportedScheduleUnit =
      candidate.unit === "doors" ||
      candidate.unit === "windows" ||
      candidate.unit === "fixtures"
    const hasCountSupport =
      candidate.quantityStatus === "count_only" &&
      typeof candidate.quantity === "number" &&
      candidate.quantity > 0
    const scheduleBlockers = [
      ...blockers,
      ...(!isSupportedScheduleUnit ? ["Schedule candidate unit is not supported for future gate review."] : []),
      ...(!hasCountSupport ? ["Schedule candidate lacks clear count support."] : []),
      ...(!hasExplicitCountEvidence(candidate)
        ? ["Schedule candidate does not have explicit quantity/count column evidence."]
        : []),
    ]

    if (scheduleBlockers.length === 0 && candidate.confidence >= 70) {
      gateStatus = "future_candidate"
      futureEligible = true
    } else if (scheduleBlockers.length > blockers.length || candidate.confidence < 60) {
      gateStatus = "blocked"
    }

    return {
      candidateKey: candidate.candidateKey,
      gateStatus,
      pricingEligibleNow: false,
      futureEligible,
      confidence: clampConfidence(candidate.confidence),
      requiredEvidence: requiredEvidenceForCandidate(candidate),
      presentEvidence: presentEvidenceForCandidate(candidate),
      blockers: uniqueStrings(scheduleBlockers),
      warnings: uniqueStrings(warnings),
      sourceRefs: candidate.sourceRefs,
    }
  }

  if (candidate.sourceType === "finish_matrix") {
    blockers.push("Finish row candidates require measured SF/LF support before pricing handoff.")
    gateStatus = blockers.length > 1 || candidate.confidence < 50 ? "blocked" : "review_only"
  } else if (candidate.sourceType === "repeated_room_package") {
    blockers.push("Repeated room package counts are diagnostic only and not measured takeoff support.")
    gateStatus = blockers.length > 1 || candidate.confidence < 50 ? "blocked" : "review_only"
  } else if (blockers.length > 0) {
    gateStatus = "blocked"
  }

  return {
    candidateKey: candidate.candidateKey,
    gateStatus,
    pricingEligibleNow: false,
    futureEligible: false,
    confidence: clampConfidence(candidate.confidence),
    requiredEvidence: requiredEvidenceForCandidate(candidate),
    presentEvidence: presentEvidenceForCandidate(candidate),
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    sourceRefs: candidate.sourceRefs,
  }
}

export function buildTradeQuantityCandidateGates(
  candidates: PlanTradeQuantityCandidate[]
): PlanTradeQuantityCandidateGate[] {
  return candidates.map(buildGate)
}
