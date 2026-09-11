import test from "node:test"
import assert from "node:assert/strict"

import {
  buildActionableScopeDecisions,
  type ActionableScopeDecision,
} from "./actionable-scope-decisions"
import {
  buildPlanCeilingScopeChange,
  confirmPlanCeilingScopeChange,
  createPlanCeilingScopeChangeSession,
  transitionPlanCeilingScopeChangeSession,
  type GeneratedPlanPaintScopeInputs,
  type PlanCeilingScopeChangeInputs,
} from "./plan-ceiling-scope-change"
import {
  buildPlanEvidenceFingerprint,
  NO_PLAN_EVIDENCE_FINGERPRINT,
} from "./plan-intelligence-evidence"
import {
  normalizePlanScopeBoundarySemanticCandidates,
  type GeneratedPlanScopeCandidateContext,
} from "./plan-scope-candidate-integration"
import {
  buildPhotoEvidenceFingerprint,
  buildPhotoIntelligenceActions,
  PHOTO_CEILING_SCOPE_FLAG,
} from "./photo-intelligence-actions"
import { composePhotoScopeDecisions } from "./photo-intelligence-action-integration"
import type { SmartQuestion } from "./smart-questions"

const canonicalInclusion = "Includes ceiling preparation and painting."

function makeFingerprint(note = "Ceiling finish schedule") {
  const fingerprint = buildPlanEvidenceFingerprint([{
    planId: "plan-a",
    name: "finish-plans.pdf",
    mimeType: "application/pdf",
    sourceKind: "pdf",
    fileSize: 42_000,
    fileLastModified: 1_800_000_000_000,
    sourcePageCount: 4,
    note,
    selectedSourcePages: [3],
  }])
  assert.ok(fingerprint)
  return fingerprint
}

function makeRawCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-scope:ceiling-paint:record-1",
    semanticRecordId: "plan-finish:record-1",
    trade: "painting",
    subjectKey: "ceilings",
    surface: "ceiling",
    rawFinishValue: "Paint",
    resolvedFinishCategory: "paint_coating",
    resolutionMethod: "explicit_schedule_value",
    semanticStatus: "resolved",
    scheduleSource: {
      uploadId: "plan-a",
      uploadName: "finish-plans.pdf",
      pageNumber: 1,
      sourcePageNumber: 3,
      sheetNumber: "A-601",
      sheetTitle: "Room Finish Schedule",
      sourceMatrixIndex: 0,
      sourceTableIndex: 1,
      rowIndex: 2,
      sourceColumnIndex: 4,
      sourceColumnLabel: "Ceiling Finish",
      surface: "ceiling",
      roomName: "Conference Room",
      roomNumber: "101",
      rawFinishValue: "Paint",
      rawRowText: "101 | Conference Room | Paint",
      confidence: 96,
      warnings: [],
    },
    legendSources: [],
    confidence: 96,
    warnings: [],
    blockers: [],
    eligibleForFutureScopeReview: true,
    pricingAuthoritative: false,
    pricingEligibleNow: false,
    quantityAuthoritative: false,
    mutatesTypedScope: false,
    generatesEstimate: false,
    persistsState: false,
    ...overrides,
  }
}

function makeInputs(
  overrides: Partial<PlanCeilingScopeChangeInputs> = {}
): PlanCeilingScopeChangeInputs {
  const fingerprint = makeFingerprint()
  return {
    hasDisplayedResult: true,
    candidateContext: {
      evidenceFingerprint: fingerprint,
      generatedTrade: "painting",
      candidates: normalizePlanScopeBoundarySemanticCandidates([makeRawCandidate()]),
    },
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
    generatedScopeSnapshot: "Repaint guestrooms.",
    currentScopeText: "Repaint guestrooms.",
    currentTrade: "painting",
    generatedPaintScopeInputs: {
      selectedPaintScope: "walls",
      transmittedPaintScope: "walls",
    },
    currentPaintScope: "walls",
    currentEffectivePaintScope: "walls",
    higherPriorityDecisions: [],
    resolutions: [],
    ...overrides,
  }
}

function requireDecision(inputs = makeInputs()) {
  const decision = buildPlanCeilingScopeChange(inputs)
  assert.ok(decision)
  return decision
}

function makeBoundaryDecision(
  id: string,
  subjectKey: "ceilings" | "trim_and_baseboards" | "doors_and_frames" | "closets"
): ActionableScopeDecision {
  const question: SmartQuestion = {
    id,
    trade: "painting",
    category: "included_surfaces",
    prompt: "Untrusted prompt",
    helpText: "Untrusted help",
    source: "scope_quality",
    answerType: "single_choice",
    priority: "medium",
    canAffectPricingIfConfirmed: false,
    dedupeKey: id,
    decision: { kind: "scope_boundary", subjectKey, subjectLabel: "Untrusted label" },
  }
  const [decision] = buildActionableScopeDecisions([question], 1)
  assert.ok(decision)
  return decision
}

function makePhotoCandidates(currentNote = "North wall") {
  const makePhotoFingerprint = (note: string) => buildPhotoEvidenceFingerprint([{
    id: "photo-1",
    name: "room.jpg",
    dataUrl: "data:image/jpeg;base64,AAAA",
    roomTag: "Room",
    shotType: "overview",
    note,
    reference: { kind: "none", label: "", realWidthIn: null },
  }])
  return buildPhotoIntelligenceActions({
    trade: "painting",
    photoScopeAssist: { missingScopeFlags: [PHOTO_CEILING_SCOPE_FLAG], suggestedAdditions: [] },
    generatedEvidenceFingerprint: makePhotoFingerprint("North wall"),
    currentEvidenceFingerprint: makePhotoFingerprint(currentNote),
  }).candidates
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test("current verified ceiling paint with unclear scope and matching walls inputs permits one optional change", () => {
  const inputs = makeInputs()
  const decision = requireDecision(inputs)
  assert.equal(decision.source, "plan")
  assert.equal(decision.id, inputs.candidateContext!.candidates[0].id)
  assert.equal(decision.inclusionWording, canonicalInclusion)
  assert.deepEqual(decision.context, {
    boundary: "painting:ceilings",
    evidenceFingerprint: inputs.generatedEvidenceFingerprint,
    generatedScope: "Repaint guestrooms.",
    generatedTrade: "painting",
    selectedPaintScope: "walls",
    transmittedPaintScope: "walls",
  })
  assert.deepEqual(decision.candidates, inputs.candidateContext!.candidates)
})

test("missing displayed result, candidate context, or supporting records cannot offer a change", () => {
  const base = makeInputs()
  for (const change of [
    { hasDisplayedResult: false },
    { candidateContext: null },
    { candidateContext: { ...base.candidateContext!, candidates: [] } },
  ]) {
    assert.equal(buildPlanCeilingScopeChange({ ...base, ...change }), null)
  }
})

test("stale, unverified, missing, no-plan, and context-mismatched fingerprints fail closed", () => {
  const base = makeInputs()
  const changedFingerprint = makeFingerprint("Different selected evidence")
  const changes: Partial<PlanCeilingScopeChangeInputs>[] = [
    { currentEvidenceFingerprint: changedFingerprint },
    { currentEvidenceFingerprint: null },
    { generatedEvidenceFingerprint: null },
    { currentEvidenceFingerprint: "unverified" },
    { currentEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT },
    {
      generatedEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT,
      currentEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT,
      candidateContext: { ...base.candidateContext!, evidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT },
    },
    { candidateContext: { ...base.candidateContext!, evidenceFingerprint: changedFingerprint } },
    {
      generatedEvidenceFingerprint: "unverified",
      currentEvidenceFingerprint: "unverified",
      candidateContext: { ...base.candidateContext!, evidenceFingerprint: "unverified" },
    },
  ]
  for (const change of changes) {
    assert.equal(buildPlanCeilingScopeChange({ ...base, ...change }), null, JSON.stringify(change))
  }
})

test("current and generated typed scope use the existing whitespace snapshot convention", () => {
  assert.ok(buildPlanCeilingScopeChange(makeInputs({ currentScopeText: "  Repaint   guestrooms. \n" })))
  for (const change of [
    { generatedScopeSnapshot: null },
    { currentScopeText: "Repaint guestrooms and lobby." },
    { generatedScopeSnapshot: "Different estimate." },
  ]) {
    assert.equal(buildPlanCeilingScopeChange(makeInputs(change)), null)
  }
})

test("nonpainting or unverified current/generated trade cannot authorize a ceiling change", () => {
  const base = makeInputs()
  assert.equal(buildPlanCeilingScopeChange({ ...base, currentTrade: "drywall" }), null)
  assert.equal(buildPlanCeilingScopeChange({ ...base, currentTrade: "" }), null)
  assert.equal(buildPlanCeilingScopeChange({
    ...base,
    candidateContext: { ...base.candidateContext!, generatedTrade: "drywall" },
  }), null)
  assert.equal(buildPlanCeilingScopeChange({
    ...base,
    candidateContext: { ...base.candidateContext!, generatedTrade: "" },
  }), null)
})

test("generated raw/transmitted selection, current selection, and effective mode must all be walls", () => {
  const changes: Partial<PlanCeilingScopeChangeInputs>[] = [
    { generatedPaintScopeInputs: null },
    { generatedPaintScopeInputs: { selectedPaintScope: "walls", transmittedPaintScope: null } },
    { generatedPaintScopeInputs: { selectedPaintScope: "full", transmittedPaintScope: "walls" } },
    { generatedPaintScopeInputs: { selectedPaintScope: "walls_ceilings", transmittedPaintScope: "walls" } },
    { generatedPaintScopeInputs: { selectedPaintScope: "walls", transmittedPaintScope: "walls_ceilings" } },
    { generatedPaintScopeInputs: { selectedPaintScope: "walls", transmittedPaintScope: "full" } },
    { currentPaintScope: "walls_ceilings" },
    { currentPaintScope: "full" },
    { currentEffectivePaintScope: "doors_only" },
    { currentEffectivePaintScope: "walls_ceilings" },
    { currentEffectivePaintScope: "full" },
  ]
  for (const change of changes) {
    assert.equal(buildPlanCeilingScopeChange(makeInputs(change)), null, JSON.stringify(change))
  }
})

test("all explicit typed responsibility statuses veto the optional change", () => {
  for (const scope of [
    "paint ceilings",
    canonicalInclusion,
    "ceilings excluded",
    "do not paint ceilings",
    "ceiling painting by others",
    "walls only",
    "paint ceilings; ceilings excluded",
  ]) {
    assert.equal(buildPlanCeilingScopeChange(makeInputs({
      currentScopeText: scope,
      generatedScopeSnapshot: scope,
    })), null, scope)
  }
})

test("candidate identity, semantics, provenance, and operational flags are revalidated", () => {
  const base = makeInputs()
  const invalidChanges: Record<string, unknown>[] = [
    { id: "" },
    { semanticRecordId: "" },
    { trade: "drywall" },
    { subjectKey: "walls" },
    { surface: "wall" },
    { resolvedFinishCategory: "acoustic_tile" },
    { semanticStatus: "ambiguous" },
    { warnings: ["Unverified"] },
    { blockers: ["Missing provenance"] },
    { eligibleForFutureScopeReview: false },
    { scheduleSource: { ...makeRawCandidate().scheduleSource, uploadId: "" } },
    { scheduleSource: { ...makeRawCandidate().scheduleSource, warnings: ["Unverified"] } },
    ...[
      "pricingAuthoritative", "pricingEligibleNow", "quantityAuthoritative",
      "mutatesTypedScope", "generatesEstimate", "persistsState",
    ].flatMap((field) => [{ [field]: true }, { [field]: undefined }]),
  ]
  for (const change of invalidChanges) {
    // Deliberately corrupt an otherwise normalized context to check action-time validation.
    const candidateContext = {
      ...base.candidateContext!,
      candidates: [makeRawCandidate(change)],
    } as unknown as GeneratedPlanScopeCandidateContext
    assert.equal(buildPlanCeilingScopeChange({ ...base, candidateContext }), null, JSON.stringify(change))
  }
})

test("multiple valid plan records support one decision in original identity order; invalid records do not reserve it", () => {
  const base = makeInputs()
  const second = makeRawCandidate({ id: "plan-scope:ceiling-paint:record-2", semanticRecordId: "plan-finish:record-2" })
  const candidateContext = {
    ...base.candidateContext!,
    candidates: [makeRawCandidate({ id: "invalid", warnings: ["Stale"] }), second, makeRawCandidate()],
  } as unknown as GeneratedPlanScopeCandidateContext
  const decision = requireDecision({ ...base, candidateContext })
  assert.equal(decision.id, second.id)
  assert.deepEqual(decision.candidates.map((candidate) => candidate.id), [second.id, makeRawCandidate().id])
  assert.equal(Array.isArray(decision), false)
})

test("ordinary ceiling decisions retain priority over verified photos and the optional plan change", () => {
  const ordinary = makeBoundaryDecision("ordinary-ceiling", "ceilings")
  const composition = composePhotoScopeDecisions({ ordinaryDecisions: [ordinary], photoCandidates: makePhotoCandidates() })
  assert.deepEqual(composition.decisions, [ordinary])
  assert.deepEqual(composition.photoCandidatesByDecisionId, {})
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ higherPriorityDecisions: composition.decisions })), null)
})

test("a current verified photo ceiling decision wins over the plan decision", () => {
  const composition = composePhotoScopeDecisions({ ordinaryDecisions: [], photoCandidates: makePhotoCandidates() })
  assert.equal(composition.decisions.length, 1)
  assert.equal(composition.decisions[0].subjectKey, "ceilings")
  assert.ok(composition.photoCandidatesByDecisionId[composition.decisions[0].id])
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ higherPriorityDecisions: composition.decisions })), null)
})

test("stale photo evidence is filtered before composition and cannot reserve the ceiling boundary", () => {
  const photoCandidates = makePhotoCandidates("Changed evidence")
  assert.deepEqual(photoCandidates, [])
  const composition = composePhotoScopeDecisions({ ordinaryDecisions: [], photoCandidates })
  assert.deepEqual(composition.decisions, [])
  assert.ok(buildPlanCeilingScopeChange(makeInputs({ higherPriorityDecisions: composition.decisions })))
})

test("three higher-priority decisions prevent a plan slot; two remain unchanged with one plan slot", () => {
  const ordinary = [
    makeBoundaryDecision("trim", "trim_and_baseboards"),
    makeBoundaryDecision("doors", "doors_and_frames"),
    makeBoundaryDecision("closets", "closets"),
  ]
  const full = composePhotoScopeDecisions({ ordinaryDecisions: ordinary, photoCandidates: [], limit: 3 })
  assert.equal(full.decisions.length, 3)
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ higherPriorityDecisions: full.decisions })), null)
  const available = composePhotoScopeDecisions({ ordinaryDecisions: ordinary.slice(0, 2), photoCandidates: [], limit: 3 })
  const before = clone(available.decisions)
  const plan = requireDecision(makeInputs({ higherPriorityDecisions: available.decisions }))
  assert.equal([...available.decisions, plan].length, 3)
  assert.deepEqual(available.decisions, before)
})

test("Keep current scope preserves exact inputs, adds no exclusion wording, and only returns a suppression resolution", () => {
  const inputs = makeInputs({ currentScopeText: "  Repaint guestrooms.  " })
  const before = clone(inputs)
  const outcome = confirmPlanCeilingScopeChange(inputs, requireDecision(inputs), "keep_current_scope")
  assert.equal(outcome.status, "kept")
  if (outcome.status !== "kept") return
  assert.equal(outcome.scopeText, inputs.currentScopeText)
  assert.equal(outcome.paintScope, "walls")
  assert.equal(outcome.scopeText.includes("Excludes"), false)
  assert.equal(outcome.resolution.choice, "keep_current_scope")
  assert.deepEqual(Object.keys(outcome).sort(), ["paintScope", "resolution", "scopeText", "status"])
  assert.deepEqual(inputs, before)
})

test("same-context dismissal survives accepted and successful same-input regeneration without new prompting", () => {
  const inputs = makeInputs()
  const outcome = confirmPlanCeilingScopeChange(inputs, requireDecision(inputs), "keep_current_scope")
  assert.equal(outcome.status, "kept")
  if (outcome.status !== "kept") return
  let session = transitionPlanCeilingScopeChangeSession(createPlanCeilingScopeChangeSession(), {
    type: "resolved", resolution: outcome.resolution,
  })
  assert.equal(buildPlanCeilingScopeChange({ ...inputs, resolutions: session.resolutions }), null)
  session = transitionPlanCeilingScopeChangeSession(session, {
    type: "accepted_generate", requestInputs: inputs.generatedPaintScopeInputs!,
  })
  assert.equal(session.generatedInputs, null)
  assert.equal(session.resolutions.length, 1)
  session = transitionPlanCeilingScopeChangeSession(session, { type: "successful_generate" })
  const regenerated = makeInputs({ generatedPaintScopeInputs: session.generatedInputs, resolutions: session.resolutions })
  assert.equal(buildPlanCeilingScopeChange(regenerated), null)
  assert.equal(buildPlanCeilingScopeChange({ ...regenerated, generatedScopeSnapshot: "  Repaint   guestrooms. " }), null)
})

test("different successful scope or plan context may be considered without allowing a dismissal to grant authority", () => {
  const inputs = makeInputs()
  const outcome = confirmPlanCeilingScopeChange(inputs, requireDecision(inputs), "keep_current_scope")
  assert.equal(outcome.status, "kept")
  if (outcome.status !== "kept") return
  const resolutions = [outcome.resolution]
  assert.ok(buildPlanCeilingScopeChange(makeInputs({
    resolutions, generatedScopeSnapshot: "Repaint lobby.", currentScopeText: "Repaint lobby.",
  })))
  const fingerprint = makeFingerprint("New accepted plan note")
  assert.ok(buildPlanCeilingScopeChange(makeInputs({
    resolutions,
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
    candidateContext: { ...inputs.candidateContext!, evidenceFingerprint: fingerprint },
  })))
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ resolutions, candidateContext: null })), null)
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ resolutions, generatedPaintScopeInputs: null })), null)
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ resolutions, currentEvidenceFingerprint: fingerprint })), null)
})

test("valid inclusion computes canonical written scope and walls_ceilings together without changing other data", () => {
  const inputs = makeInputs({ currentScopeText: "  Repaint guestrooms.  " })
  const before = clone(inputs)
  const outcome = confirmPlanCeilingScopeChange(inputs, requireDecision(inputs), "include_ceiling_painting")
  assert.equal(outcome.status, "included")
  if (outcome.status !== "included") return
  assert.equal(outcome.scopeText, `${inputs.currentScopeText}\n${canonicalInclusion}`)
  assert.equal(outcome.paintScope, "walls_ceilings")
  assert.equal(outcome.resolution.choice, "include_ceiling_painting")
  assert.deepEqual(Object.keys(outcome).sort(), ["paintScope", "resolution", "scopeText", "status"])
  assert.deepEqual(inputs, before)
})

test("confirmation rechecks every current authority gate before returning any input or record change", () => {
  const inputs = makeInputs()
  const offered = requireDecision(inputs)
  const changes: Partial<PlanCeilingScopeChangeInputs>[] = [
    { hasDisplayedResult: false },
    { candidateContext: null },
    { currentPaintScope: "walls_ceilings" },
    { currentPaintScope: "full" },
    { currentEffectivePaintScope: "doors_only" },
    { currentScopeText: "Repaint guestrooms and lobby." },
    { currentTrade: "drywall" },
    { currentEvidenceFingerprint: makeFingerprint("Edited evidence") },
    { generatedPaintScopeInputs: null },
    { higherPriorityDecisions: [makeBoundaryDecision("new-ordinary-ceiling", "ceilings")] },
    { higherPriorityDecisions: [
      makeBoundaryDecision("trim", "trim_and_baseboards"),
      makeBoundaryDecision("doors", "doors_and_frames"),
      makeBoundaryDecision("closets", "closets"),
    ] },
    { resolutions: [{ context: offered.context, choice: "keep_current_scope" }] },
    { resolutions: [{ context: offered.context, choice: "include_ceiling_painting" }] },
  ]
  for (const change of changes) {
    const current = { ...inputs, ...change }
    const before = clone(current)
    for (const choice of ["include_ceiling_painting", "keep_current_scope"] as const) {
      assert.deepEqual(confirmPlanCeilingScopeChange(current, offered, choice), { status: "rejected" }, JSON.stringify(change))
    }
    assert.deepEqual(current, before)
  }
})

test("candidate replacement, corruption, removal, or reordered backing evidence rejects a remembered offer", () => {
  const inputs = makeInputs()
  const second = makeRawCandidate({ id: "plan-scope:ceiling-paint:record-2", semanticRecordId: "plan-finish:record-2" })
  inputs.candidateContext = {
    ...inputs.candidateContext!,
    candidates: normalizePlanScopeBoundarySemanticCandidates([makeRawCandidate(), second]),
  }
  const offered = requireDecision(inputs)
  for (const candidates of [
    normalizePlanScopeBoundarySemanticCandidates([second]),
    normalizePlanScopeBoundarySemanticCandidates([second, makeRawCandidate()]),
    normalizePlanScopeBoundarySemanticCandidates([makeRawCandidate({ confidence: 95 }), second]),
    [],
    [makeRawCandidate({ pricingAuthoritative: true }), second] as unknown as GeneratedPlanScopeCandidateContext["candidates"],
  ]) {
    assert.deepEqual(confirmPlanCeilingScopeChange({
      ...inputs, candidateContext: { ...inputs.candidateContext!, candidates },
    }, offered, "include_ceiling_painting"), { status: "rejected" })
  }
  assert.deepEqual(confirmPlanCeilingScopeChange(inputs, { ...offered, id: "remembered-other-id" }, "include_ceiling_painting"), { status: "rejected" })
})

test("repeated inclusion and full-interior edits cannot duplicate wording or downgrade a current selection", () => {
  const inputs = makeInputs()
  const offered = requireDecision(inputs)
  const first = confirmPlanCeilingScopeChange(inputs, offered, "include_ceiling_painting")
  assert.equal(first.status, "included")
  if (first.status !== "included") return
  const after = {
    ...inputs,
    currentScopeText: first.scopeText,
    currentPaintScope: first.paintScope,
    resolutions: [first.resolution],
  }
  assert.deepEqual(confirmPlanCeilingScopeChange(after, offered, "include_ceiling_painting"), { status: "rejected" })
  assert.equal(first.scopeText.split(canonicalInclusion).length - 1, 1)
  assert.deepEqual(confirmPlanCeilingScopeChange({
    ...inputs, resolutions: [first.resolution],
  }, offered, "include_ceiling_painting"), { status: "rejected" })
  assert.deepEqual(confirmPlanCeilingScopeChange({
    ...inputs, currentPaintScope: "full", currentEffectivePaintScope: "full",
  }, offered, "include_ceiling_painting"), { status: "rejected" })
  assert.equal(buildPlanCeilingScopeChange({
    ...after, generatedScopeSnapshot: first.scopeText,
    generatedPaintScopeInputs: { selectedPaintScope: "walls_ceilings", transmittedPaintScope: "walls_ceilings" },
  }), null)
})

test("new sessions and accepted Generate resets have no generated selection authority until successful promotion", () => {
  const initial = createPlanCeilingScopeChangeSession()
  assert.deepEqual(initial, { pendingInputs: null, generatedInputs: null, resolutions: [] })
  const requestInputs: GeneratedPlanPaintScopeInputs = { selectedPaintScope: "walls", transmittedPaintScope: "walls" }
  const pending = transitionPlanCeilingScopeChangeSession(initial, { type: "accepted_generate", requestInputs })
  assert.deepEqual(pending.pendingInputs, requestInputs)
  assert.notStrictEqual(pending.pendingInputs, requestInputs)
  assert.equal(pending.generatedInputs, null)
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ generatedPaintScopeInputs: pending.generatedInputs })), null)
  const successful = transitionPlanCeilingScopeChangeSession(pending, { type: "successful_generate" })
  assert.equal(successful.pendingInputs, null)
  assert.deepEqual(successful.generatedInputs, requestInputs)
  assert.ok(buildPlanCeilingScopeChange(makeInputs({ generatedPaintScopeInputs: successful.generatedInputs })))
  assert.deepEqual(initial, { pendingInputs: null, generatedInputs: null, resolutions: [] })
})

test("request-local raw and transmitted inputs survive in-flight edits without being relabeled", () => {
  const requestInputs = { selectedPaintScope: "full" as const, transmittedPaintScope: "walls" as const }
  const pending = transitionPlanCeilingScopeChangeSession(createPlanCeilingScopeChangeSession(), {
    type: "accepted_generate", requestInputs,
  })
  const successful = transitionPlanCeilingScopeChangeSession(pending, { type: "successful_generate" })
  assert.deepEqual(successful.generatedInputs, { selectedPaintScope: "full", transmittedPaintScope: "walls" })
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ generatedPaintScopeInputs: successful.generatedInputs })), null)

  const mutableRequest: { selectedPaintScope: "walls" | "full"; transmittedPaintScope: "walls" | null } = {
    selectedPaintScope: "walls", transmittedPaintScope: "walls",
  }
  const captured = transitionPlanCeilingScopeChangeSession(createPlanCeilingScopeChangeSession(), {
    type: "accepted_generate", requestInputs: mutableRequest,
  })
  mutableRequest.selectedPaintScope = "full"
  mutableRequest.transmittedPaintScope = null
  const returned = transitionPlanCeilingScopeChangeSession(captured, { type: "successful_generate" })
  assert.deepEqual(returned.generatedInputs, { selectedPaintScope: "walls", transmittedPaintScope: "walls" })
  assert.equal(buildPlanCeilingScopeChange(makeInputs({
    generatedPaintScopeInputs: returned.generatedInputs,
    currentPaintScope: "full",
    currentEffectivePaintScope: "full",
  })), null)
})

test("a failed accepted request discards previous generated authority without clearing unchanged-context suppression", () => {
  const inputs = makeInputs()
  const resolution = { context: requireDecision(inputs).context, choice: "keep_current_scope" as const }
  let session = transitionPlanCeilingScopeChangeSession(createPlanCeilingScopeChangeSession(), { type: "resolved", resolution })
  session = transitionPlanCeilingScopeChangeSession(session, { type: "accepted_generate", requestInputs: inputs.generatedPaintScopeInputs! })
  session = transitionPlanCeilingScopeChangeSession(session, { type: "successful_generate" })
  const displayed = clone(session)
  // Early validation exits dispatch no accepted_generate event: the old session is retained.
  assert.deepEqual(session.generatedInputs, inputs.generatedPaintScopeInputs)
  const accepted = transitionPlanCeilingScopeChangeSession(session, { type: "accepted_generate", requestInputs: inputs.generatedPaintScopeInputs! })
  assert.equal(accepted.generatedInputs, null)
  const failed = transitionPlanCeilingScopeChangeSession(accepted, { type: "failed_generate" })
  assert.equal(failed.pendingInputs, null)
  assert.equal(failed.generatedInputs, null)
  assert.deepEqual(failed.resolutions, [resolution])
  assert.equal(buildPlanCeilingScopeChange(makeInputs({ generatedPaintScopeInputs: failed.generatedInputs })), null)
  assert.deepEqual(session, displayed)
})

test("history, source-backed Change Order, and estimate-context resets discard authority and dismissal including pending work", () => {
  const inputs = makeInputs()
  const resolution = { context: requireDecision(inputs).context, choice: "keep_current_scope" as const }
  let session = transitionPlanCeilingScopeChangeSession(createPlanCeilingScopeChangeSession(), { type: "resolved", resolution })
  session = transitionPlanCeilingScopeChangeSession(session, { type: "accepted_generate", requestInputs: inputs.generatedPaintScopeInputs! })
  for (const type of ["history_load", "source_change_order_reset", "estimate_context_reset"] as const) {
    const reset = transitionPlanCeilingScopeChangeSession(session, { type })
    assert.deepEqual(reset, createPlanCeilingScopeChangeSession())
    const lateSuccess = transitionPlanCeilingScopeChangeSession(reset, { type: "successful_generate" })
    assert.equal(lateSuccess.generatedInputs, null)
    assert.equal(buildPlanCeilingScopeChange(makeInputs({ generatedPaintScopeInputs: lateSuccess.generatedInputs })), null)
  }
})

test("resolution recording is immutable, context-deduplicated, and never itself selection authority", () => {
  const inputs = makeInputs()
  const context = clone(requireDecision(inputs).context)
  const initial = createPlanCeilingScopeChangeSession()
  const resolution = { context, choice: "keep_current_scope" as const }
  const resolved = transitionPlanCeilingScopeChangeSession(initial, { type: "resolved", resolution })
  assert.deepEqual(initial.resolutions, [])
  assert.notStrictEqual(resolved.resolutions[0].context, context)
  assert.equal(resolved.generatedInputs, null)
  assert.equal(buildPlanCeilingScopeChange(makeInputs({
    generatedPaintScopeInputs: resolved.generatedInputs, resolutions: resolved.resolutions,
  })), null)
  assert.strictEqual(transitionPlanCeilingScopeChangeSession(resolved, { type: "resolved", resolution: clone(resolution) }), resolved)
  assert.strictEqual(transitionPlanCeilingScopeChangeSession(resolved, {
    type: "resolved", resolution: { context, choice: "include_ceiling_painting" },
  }), resolved)
})

test("building and confirming are deterministic and leave all caller-owned input and candidate data unchanged", () => {
  const inputs = makeInputs()
  const before = clone(inputs)
  const first = requireDecision(inputs)
  assert.deepEqual(requireDecision(inputs), first)
  const offerBefore = clone(first)
  assert.deepEqual(
    confirmPlanCeilingScopeChange(inputs, first, "include_ceiling_painting"),
    confirmPlanCeilingScopeChange(inputs, first, "include_ceiling_painting")
  )
  assert.deepEqual(inputs, before)
  assert.deepEqual(first, offerBefore)
  for (const key of ["result", "proposal", "pricing", "quantity", "generate", "persist"] as const) {
    assert.equal(Object.prototype.hasOwnProperty.call(first, key), false)
  }
})
