import {
  applyScopeDecisionWording,
  buildScopeDecisionWording,
  normalizeScopeWhitespace,
  type ActionableScopeDecision,
} from "./actionable-scope-decisions"
import {
  classifyPlanEvidenceFreshness,
  type PlanEvidenceFingerprint,
} from "./plan-intelligence-evidence"
import {
  normalizePlanScopeBoundarySemanticCandidates,
  type GeneratedPlanScopeCandidateContext,
  type NormalizedPlanScopeBoundaryCandidate,
} from "./plan-scope-candidate-integration"
import { classifyPlanCeilingScopeBoundary } from "./plan-scope-decision-integration"
import type { EffectivePaintScope, PaintScope, UiTrade } from "./types"

export type GeneratedPlanPaintScopeInputs = {
  readonly selectedPaintScope: PaintScope
  readonly transmittedPaintScope: PaintScope | null
}

export type PlanCeilingScopeChangeChoice =
  | "keep_current_scope"
  | "include_ceiling_painting"

export type PlanCeilingScopeChangeContext = {
  readonly boundary: "painting:ceilings"
  readonly evidenceFingerprint: PlanEvidenceFingerprint
  readonly generatedScope: string
  readonly generatedTrade: "painting"
  readonly selectedPaintScope: "walls"
  readonly transmittedPaintScope: "walls"
}

export type PlanCeilingScopeChangeResolution = {
  readonly context: PlanCeilingScopeChangeContext
  readonly choice: PlanCeilingScopeChangeChoice
}

export type PlanCeilingScopeChangeSession = {
  readonly pendingInputs: GeneratedPlanPaintScopeInputs | null
  readonly generatedInputs: GeneratedPlanPaintScopeInputs | null
  readonly resolutions: readonly PlanCeilingScopeChangeResolution[]
}

export type PlanCeilingScopeChangeSessionEvent =
  | { type: "accepted_generate"; requestInputs: GeneratedPlanPaintScopeInputs }
  | { type: "successful_generate" }
  | { type: "failed_generate" }
  | { type: "history_load" | "source_change_order_reset" | "estimate_context_reset" }
  | { type: "resolved"; resolution: PlanCeilingScopeChangeResolution }

export function createPlanCeilingScopeChangeSession(): PlanCeilingScopeChangeSession {
  return { pendingInputs: null, generatedInputs: null, resolutions: [] }
}

function sameContext(
  first: PlanCeilingScopeChangeContext,
  second: PlanCeilingScopeChangeContext
): boolean {
  return first.boundary === second.boundary &&
    first.evidenceFingerprint === second.evidenceFingerprint &&
    first.generatedScope === second.generatedScope &&
    first.generatedTrade === second.generatedTrade &&
    first.selectedPaintScope === second.selectedPaintScope &&
    first.transmittedPaintScope === second.transmittedPaintScope
}

// The page already serializes Generate. A context reset also discards its pending
// capture, so a late response cannot restore authority after history/template/CO.
export function transitionPlanCeilingScopeChangeSession(
  current: PlanCeilingScopeChangeSession,
  event: PlanCeilingScopeChangeSessionEvent
): PlanCeilingScopeChangeSession {
  if (event.type === "accepted_generate") {
    return { ...current, pendingInputs: { ...event.requestInputs }, generatedInputs: null }
  }
  if (event.type === "successful_generate") {
    return { ...current, pendingInputs: null, generatedInputs: current.pendingInputs }
  }
  if (event.type === "failed_generate") {
    return { ...current, pendingInputs: null, generatedInputs: null }
  }
  if (event.type === "resolved") {
    if (current.resolutions.some((item) => sameContext(item.context, event.resolution.context))) {
      return current
    }
    return {
      ...current,
      resolutions: [...current.resolutions, {
        context: { ...event.resolution.context },
        choice: event.resolution.choice,
      }],
    }
  }
  return createPlanCeilingScopeChangeSession()
}

export type PlanCeilingScopeChangeInputs = {
  hasDisplayedResult: boolean
  candidateContext: GeneratedPlanScopeCandidateContext | null
  generatedEvidenceFingerprint: PlanEvidenceFingerprint | null
  currentEvidenceFingerprint: PlanEvidenceFingerprint | null
  generatedScopeSnapshot: string | null
  currentScopeText: string
  currentTrade: UiTrade
  generatedPaintScopeInputs: GeneratedPlanPaintScopeInputs | null
  currentPaintScope: PaintScope
  currentEffectivePaintScope: EffectivePaintScope
  // Already validated/composed ordinary and photo decisions, in their existing order.
  higherPriorityDecisions: readonly ActionableScopeDecision[]
  resolutions: readonly PlanCeilingScopeChangeResolution[]
}

export type PlanCeilingScopeChangeDecision = {
  readonly id: string
  readonly source: "plan"
  readonly context: PlanCeilingScopeChangeContext
  readonly candidates: readonly NormalizedPlanScopeBoundaryCandidate[]
  readonly inclusionWording: string
}

// This descriptor is used only to obtain existing canonical wording. It is never
// inserted into ordinary/photo composition or exposed with generic Exclude choices.
const ceilingWordingDecision: ActionableScopeDecision = {
  id: "painting:ceilings",
  questionId: "painting:ceilings",
  trade: "painting",
  category: "included_surfaces",
  kind: "scope_boundary",
  subjectKey: "ceilings",
  subjectLabel: "Ceiling preparation and painting",
  prompt: "",
  helpText: "",
  priority: "medium",
  choices: [{ value: "include", label: "Include" }],
  quantityUnit: null,
  quantityBasis: null,
  quantityBasisLabel: null,
}

export function buildPlanCeilingScopeChange(
  args: PlanCeilingScopeChangeInputs
): PlanCeilingScopeChangeDecision | null {
  const context = args.candidateContext
  if (!args.hasDisplayedResult || !context) return null
  if (context.generatedTrade !== "painting" || args.currentTrade !== "painting") return null
  if (context.evidenceFingerprint !== args.generatedEvidenceFingerprint) return null
  if (classifyPlanEvidenceFreshness({
    generatedEvidenceFingerprint: args.generatedEvidenceFingerprint,
    currentEvidenceFingerprint: args.currentEvidenceFingerprint,
  }) !== "current") return null
  if (args.generatedScopeSnapshot == null ||
    normalizeScopeWhitespace(args.generatedScopeSnapshot) !== normalizeScopeWhitespace(args.currentScopeText)) return null
  if (classifyPlanCeilingScopeBoundary(args.currentScopeText) !== "unclear") return null
  if (args.generatedPaintScopeInputs?.selectedPaintScope !== "walls" ||
    args.generatedPaintScopeInputs.transmittedPaintScope !== "walls" ||
    args.currentPaintScope !== "walls" || args.currentEffectivePaintScope !== "walls") return null
  if (args.higherPriorityDecisions.length >= 3 || args.higherPriorityDecisions.some(
    (decision) => decision.trade === "painting" && decision.subjectKey === "ceilings"
  )) return null

  // Reuse the complete V1C-2 validator, including provenance and every false
  // operational flag. Invalid records neither support nor reserve a boundary.
  const candidates = normalizePlanScopeBoundarySemanticCandidates(context.candidates)
  if (!candidates.length) return null
  const decisionContext: PlanCeilingScopeChangeContext = {
    boundary: "painting:ceilings",
    evidenceFingerprint: context.evidenceFingerprint,
    generatedScope: normalizeScopeWhitespace(args.generatedScopeSnapshot),
    generatedTrade: "painting",
    selectedPaintScope: "walls",
    transmittedPaintScope: "walls",
  }
  if (args.resolutions.some((item) => sameContext(item.context, decisionContext))) return null
  const inclusionWording = buildScopeDecisionWording(ceilingWordingDecision, { choice: "include" })
  if (!inclusionWording) return null
  return { id: candidates[0].id, source: "plan", context: decisionContext, candidates, inclusionWording }
}

export type PlanCeilingScopeChangeConfirmation =
  | { status: "rejected" }
  | {
      status: "kept" | "included"
      scopeText: string
      paintScope: PaintScope
      resolution: PlanCeilingScopeChangeResolution
    }

export function confirmPlanCeilingScopeChange(
  args: PlanCeilingScopeChangeInputs,
  offered: PlanCeilingScopeChangeDecision,
  choice: PlanCeilingScopeChangeChoice
): PlanCeilingScopeChangeConfirmation {
  // Rebuild from current inputs, not a prior eligibility boolean or remembered ID.
  const current = buildPlanCeilingScopeChange(args)
  if (!current || offered.source !== "plan" || current.id !== offered.id ||
    !sameContext(current.context, offered.context) ||
    JSON.stringify(current.candidates) !== JSON.stringify(offered.candidates)) {
    return { status: "rejected" }
  }
  const resolution = { context: current.context, choice }
  if (choice === "keep_current_scope") {
    return { status: "kept", scopeText: args.currentScopeText, paintScope: args.currentPaintScope, resolution }
  }
  if (choice !== "include_ceiling_painting") return { status: "rejected" }
  const application = applyScopeDecisionWording({
    scopeText: args.currentScopeText,
    wording: current.inclusionWording,
  })
  if (!application.changed) return { status: "rejected" }
  return { status: "included", scopeText: application.scopeText, paintScope: "walls_ceilings", resolution }
}
