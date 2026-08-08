import {
  buildActionableScopeDecisions,
  normalizeScopeWhitespace,
  prioritizeActionableScopeDecisions,
  type ActionableScopeDecision,
} from "./actionable-scope-decisions"
import {
  classifyPhotoEvidenceFreshness,
  type PhotoEvidenceFingerprint,
  type PhotoEvidenceFreshness,
  type PhotoIntelligenceActionCandidate,
} from "./photo-intelligence-actions"

export type PhotoScopeDecisionPair = {
  candidate: PhotoIntelligenceActionCandidate
  decision: ActionableScopeDecision
}

export type AppliedScopeDecisionIntegrationRecord = {
  decision: ActionableScopeDecision
  photoCandidate?: PhotoIntelligenceActionCandidate
}

export type PhotoScopeDecisionComposition = {
  decisions: ActionableScopeDecision[]
  photoCandidatesByDecisionId: Record<
    string,
    PhotoIntelligenceActionCandidate
  >
}

function decisionBoundaryKey(decision: ActionableScopeDecision): string {
  return `${decision.trade}:${decision.subjectKey}`
}

function samePhotoCandidate(
  first: PhotoIntelligenceActionCandidate,
  second: PhotoIntelligenceActionCandidate
): boolean {
  return (
    first.source === second.source &&
    first.finding === second.finding &&
    first.findingFlag === second.findingFlag &&
    first.evidenceFingerprint === second.evidenceFingerprint &&
    first.question.id === second.question.id
  )
}

export function buildPhotoScopeDecisionPairs(
  candidates: readonly PhotoIntelligenceActionCandidate[]
): PhotoScopeDecisionPair[] {
  return candidates.flatMap((candidate) => {
    const [decision] = buildActionableScopeDecisions([candidate.question], 1)
    if (!decision || decision.questionId !== candidate.question.id) return []
    return [{ candidate, decision }]
  })
}

export function composePhotoScopeDecisions(args: {
  ordinaryDecisions: readonly ActionableScopeDecision[]
  appliedDecisions?: readonly AppliedScopeDecisionIntegrationRecord[]
  photoCandidates: readonly PhotoIntelligenceActionCandidate[]
  limit?: number
}): PhotoScopeDecisionComposition {
  const appliedOrdinaryDecisions = (args.appliedDecisions || [])
    .filter((record) => !record.photoCandidate)
    .map((record) => record.decision)
  const ordinaryDecisions = [
    ...args.ordinaryDecisions,
    ...appliedOrdinaryDecisions,
  ]
  const occupiedBoundaries = new Set(
    ordinaryDecisions.map(decisionBoundaryKey)
  )
  const acceptedPhotoBoundaries = new Set<string>()
  const photoPairs = buildPhotoScopeDecisionPairs(args.photoCandidates).filter(
    ({ decision }) => {
      const boundary = decisionBoundaryKey(decision)
      if (
        occupiedBoundaries.has(boundary) ||
        acceptedPhotoBoundaries.has(boundary)
      ) {
        return false
      }
      acceptedPhotoBoundaries.add(boundary)
      return true
    }
  )
  const decisions = prioritizeActionableScopeDecisions(
    [...ordinaryDecisions, ...photoPairs.map((pair) => pair.decision)],
    args.limit ?? 3
  )
  const displayedDecisionIds = new Set(decisions.map((decision) => decision.id))
  const photoCandidatesByDecisionId = Object.fromEntries(
    photoPairs.flatMap(({ candidate, decision }) =>
      displayedDecisionIds.has(decision.id)
        ? [[decision.id, candidate]]
        : []
    )
  )

  return { decisions, photoCandidatesByDecisionId }
}

export function requiresPhotoEvidenceRegeneration(args: {
  hasDisplayedResult: boolean
  freshness: PhotoEvidenceFreshness
  currentSelectedEvidenceCount: number
}): boolean {
  if (!args.hasDisplayedResult) return false
  if (args.freshness === "stale") return true
  return (
    args.freshness === "unverified" &&
    Math.max(0, args.currentSelectedEvidenceCount) > 0
  )
}

export function canApplyPhotoScopeDecision(args: {
  candidate?: PhotoIntelligenceActionCandidate | null
  currentCandidates: readonly PhotoIntelligenceActionCandidate[]
  generatedEvidenceFingerprint?: PhotoEvidenceFingerprint | null
  currentEvidenceFingerprint?: PhotoEvidenceFingerprint | null
  generatedTrade?: string | null
  currentTrade?: string | null
  generatedScopeSnapshot?: string | null
  currentScopeText: string
}): boolean {
  const candidate = args.candidate
  if (!candidate) return false
  if (args.generatedTrade !== "painting" || args.currentTrade !== "painting") {
    return false
  }
  if (
    classifyPhotoEvidenceFreshness({
      generatedEvidenceFingerprint: args.generatedEvidenceFingerprint,
      currentEvidenceFingerprint: args.currentEvidenceFingerprint,
    }) !== "current"
  ) {
    return false
  }
  if (
    candidate.evidenceFingerprint !== args.generatedEvidenceFingerprint ||
    candidate.evidenceFingerprint !== args.currentEvidenceFingerprint
  ) {
    return false
  }
  if (
    args.generatedScopeSnapshot == null ||
    normalizeScopeWhitespace(args.currentScopeText) !==
      normalizeScopeWhitespace(args.generatedScopeSnapshot)
  ) {
    return false
  }

  return args.currentCandidates.some((current) =>
    samePhotoCandidate(candidate, current)
  )
}
