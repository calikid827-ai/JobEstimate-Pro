import test from "node:test"
import assert from "node:assert/strict"

import {
  buildActionableScopeDecisions,
  buildScopeDecisionWording,
  type ActionableScopeDecision,
} from "./actionable-scope-decisions"
import {
  buildPhotoEvidenceFingerprint,
  buildPhotoIntelligenceActions,
  NO_PHOTO_EVIDENCE_FINGERPRINT,
  PHOTO_CEILING_SCOPE_FLAG,
  PHOTO_TRIM_SCOPE_FLAG,
  type PhotoIntelligenceActionCandidate,
  type SelectedPhotoEvidence,
} from "./photo-intelligence-actions"
import {
  canApplyPhotoScopeDecision,
  composePhotoScopeDecisions,
  requiresPhotoEvidenceRegeneration,
} from "./photo-intelligence-action-integration"
import type { SmartQuestion } from "./smart-questions"

function makePhoto(
  overrides: Partial<SelectedPhotoEvidence> = {}
): SelectedPhotoEvidence {
  return {
    id: overrides.id ?? "photo-1",
    name: overrides.name ?? "room.jpg",
    dataUrl: overrides.dataUrl ?? "data:image/jpeg;base64,AAAA",
    roomTag: overrides.roomTag ?? "Room",
    shotType: overrides.shotType ?? "overview",
    note: overrides.note ?? "North wall",
    reference: overrides.reference ?? {
      kind: "none",
      label: "",
      realWidthIn: null,
    },
  }
}

function buildPhotoCandidates(
  flags: string[] = [PHOTO_CEILING_SCOPE_FLAG, PHOTO_TRIM_SCOPE_FLAG]
): {
  fingerprint: string
  candidates: PhotoIntelligenceActionCandidate[]
} {
  const fingerprint = buildPhotoEvidenceFingerprint([makePhoto()])
  const result = buildPhotoIntelligenceActions({
    trade: "painting",
    photoScopeAssist: { missingScopeFlags: flags, suggestedAdditions: [] },
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
  })
  return { fingerprint, candidates: result.candidates }
}

function buildBoundaryDecision(args: {
  id: string
  subjectKey: "ceilings" | "trim_and_baseboards" | "doors_and_frames" | "closets"
  priority?: SmartQuestion["priority"]
}): ActionableScopeDecision {
  const question: SmartQuestion = {
    id: args.id,
    trade: "painting",
    category: "included_surfaces",
    prompt: "Untrusted prompt",
    helpText: "Untrusted help",
    source: "scope_quality",
    answerType: "single_choice",
    priority: args.priority ?? "medium",
    canAffectPricingIfConfirmed: false,
    dedupeKey: args.id,
    decision: {
      kind: "scope_boundary",
      subjectKey: args.subjectKey,
      subjectLabel: "Untrusted label",
    },
  }
  const [decision] = buildActionableScopeDecisions([question], 1)
  assert.ok(decision)
  return decision
}

test("photo candidates retain provenance beside canonical Scope Decisions", () => {
  const { fingerprint, candidates } = buildPhotoCandidates([
    PHOTO_CEILING_SCOPE_FLAG,
  ])
  const composition = composePhotoScopeDecisions({
    ordinaryDecisions: [],
    photoCandidates: candidates,
  })

  assert.equal(composition.decisions.length, 1)
  const decision = composition.decisions[0]
  const candidate = composition.photoCandidatesByDecisionId[decision.id]
  assert.ok(candidate)
  assert.equal(candidate.evidenceFingerprint, fingerprint)
  assert.equal(candidate.finding, "ceiling_boundary")
  assert.equal(decision.subjectKey, "ceilings")
  assert.deepEqual(
    decision.choices.map((choice) => choice.label),
    ["Include", "Exclude", "By others", "Needs site confirmation"]
  )
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "include" }),
    "Includes ceiling preparation and painting."
  )
})

test("ordinary decisions reserve ceiling and trim boundaries before photo candidates", () => {
  const { candidates } = buildPhotoCandidates()
  const ordinaryCeiling = buildBoundaryDecision({
    id: "ordinary-ceiling",
    subjectKey: "ceilings",
  })
  const ordinaryTrim = buildBoundaryDecision({
    id: "ordinary-trim",
    subjectKey: "trim_and_baseboards",
  })
  const composition = composePhotoScopeDecisions({
    ordinaryDecisions: [ordinaryCeiling, ordinaryTrim],
    photoCandidates: candidates,
  })

  assert.deepEqual(
    composition.decisions.map((decision) => decision.id),
    [ordinaryCeiling.id, ordinaryTrim.id]
  )
  assert.deepEqual(composition.photoCandidatesByDecisionId, {})
})

test("absent photo candidates cannot suppress an ordinary decision", () => {
  const ordinary = buildBoundaryDecision({
    id: "ordinary-ceiling",
    subjectKey: "ceilings",
  })
  const composition = composePhotoScopeDecisions({
    ordinaryDecisions: [ordinary],
    photoCandidates: [],
  })

  assert.deepEqual(composition.decisions, [ordinary])
})

test("existing priority and three-decision cap remain authoritative", () => {
  const { candidates } = buildPhotoCandidates()
  const ordinary = [
    buildBoundaryDecision({
      id: "high-doors",
      subjectKey: "doors_and_frames",
      priority: "high",
    }),
    buildBoundaryDecision({
      id: "high-closets",
      subjectKey: "closets",
      priority: "high",
    }),
  ]
  const composition = composePhotoScopeDecisions({
    ordinaryDecisions: ordinary,
    photoCandidates: candidates,
    limit: 3,
  })

  assert.equal(composition.decisions.length, 3)
  assert.deepEqual(
    composition.decisions.slice(0, 2).map((decision) => decision.priority),
    ["high", "high"]
  )
  assert.equal(
    Object.keys(composition.photoCandidatesByDecisionId).length,
    1
  )
})

test("applied ordinary decisions remain while applied photo records cannot resurrect actions", () => {
  const { candidates } = buildPhotoCandidates([PHOTO_CEILING_SCOPE_FLAG])
  const photoComposition = composePhotoScopeDecisions({
    ordinaryDecisions: [],
    photoCandidates: candidates,
  })
  const photoDecision = photoComposition.decisions[0]
  const ordinary = buildBoundaryDecision({
    id: "ordinary-doors",
    subjectKey: "doors_and_frames",
  })
  const composition = composePhotoScopeDecisions({
    ordinaryDecisions: [],
    appliedDecisions: [
      { decision: ordinary },
      { decision: photoDecision, photoCandidate: candidates[0] },
    ],
    photoCandidates: [],
  })

  assert.deepEqual(composition.decisions, [ordinary])
  assert.deepEqual(composition.photoCandidatesByDecisionId, {})
})

test("photo evidence regeneration classification fails closed only when needed", () => {
  const cases = [
    [true, "current", 1, false],
    [true, "no_photos", 0, false],
    [true, "stale", 1, true],
    [true, "unverified", 1, true],
    [true, "unverified", 0, false],
    [false, "stale", 1, false],
  ] as const

  for (const [hasDisplayedResult, freshness, count, expected] of cases) {
    assert.equal(
      requiresPhotoEvidenceRegeneration({
        hasDisplayedResult,
        freshness,
        currentSelectedEvidenceCount: count,
      }),
      expected,
      `${hasDisplayedResult}:${freshness}:${count}`
    )
  }
})

test("photo Apply is allowed only for the exact current painting candidate and scope", () => {
  const { fingerprint, candidates } = buildPhotoCandidates([
    PHOTO_CEILING_SCOPE_FLAG,
  ])
  const candidate = candidates[0]
  const base = {
    candidate,
    currentCandidates: candidates,
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
    generatedTrade: "painting",
    currentTrade: "painting",
    generatedScopeSnapshot: "Paint bedroom walls.",
    currentScopeText: " Paint bedroom walls. ",
  }

  assert.equal(canApplyPhotoScopeDecision(base), true)
  assert.equal(
    canApplyPhotoScopeDecision({
      ...base,
      currentEvidenceFingerprint: buildPhotoEvidenceFingerprint([
        makePhoto({ note: "Changed" }),
      ]),
    }),
    false
  )
  assert.equal(
    canApplyPhotoScopeDecision({
      ...base,
      generatedEvidenceFingerprint: null,
    }),
    false
  )
  assert.equal(
    canApplyPhotoScopeDecision({ ...base, generatedTrade: "drywall" }),
    false
  )
  assert.equal(
    canApplyPhotoScopeDecision({ ...base, currentTrade: "drywall" }),
    false
  )
  assert.equal(
    canApplyPhotoScopeDecision({
      ...base,
      currentScopeText: "Paint bedroom walls and ceiling.",
    }),
    false
  )
  assert.equal(
    canApplyPhotoScopeDecision({ ...base, currentCandidates: [] }),
    false
  )
})

test("a different current candidate cannot authorize an old photo wrapper", () => {
  const first = buildPhotoCandidates([PHOTO_CEILING_SCOPE_FLAG])
  const changedFingerprint = buildPhotoEvidenceFingerprint([
    makePhoto({ note: "Changed evidence" }),
  ])
  const changed = buildPhotoIntelligenceActions({
    trade: "painting",
    photoScopeAssist: {
      missingScopeFlags: [PHOTO_CEILING_SCOPE_FLAG],
      suggestedAdditions: [],
    },
    generatedEvidenceFingerprint: changedFingerprint,
    currentEvidenceFingerprint: changedFingerprint,
  })

  assert.equal(
    canApplyPhotoScopeDecision({
      candidate: first.candidates[0],
      currentCandidates: changed.candidates,
      generatedEvidenceFingerprint: changedFingerprint,
      currentEvidenceFingerprint: changedFingerprint,
      generatedTrade: "painting",
      currentTrade: "painting",
      generatedScopeSnapshot: "Paint bedroom walls.",
      currentScopeText: "Paint bedroom walls.",
    }),
    false
  )
})

test("no-photo provenance never authorizes a photo Apply", () => {
  const { candidates } = buildPhotoCandidates([PHOTO_CEILING_SCOPE_FLAG])
  assert.equal(
    canApplyPhotoScopeDecision({
      candidate: candidates[0],
      currentCandidates: candidates,
      generatedEvidenceFingerprint: NO_PHOTO_EVIDENCE_FINGERPRINT,
      currentEvidenceFingerprint: NO_PHOTO_EVIDENCE_FINGERPRINT,
      generatedTrade: "painting",
      currentTrade: "painting",
      generatedScopeSnapshot: "Paint bedroom walls.",
      currentScopeText: "Paint bedroom walls.",
    }),
    false
  )
})
