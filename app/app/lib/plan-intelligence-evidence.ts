export type SelectedPlanEvidence = {
  readonly planId: string
  readonly name: string
  readonly mimeType: string
  readonly sourceKind: "image" | "pdf"
  readonly fileSize: number
  readonly fileLastModified: number
  readonly sourcePageCount: number
  readonly note: string
  readonly selectedSourcePages: number[]
}

export type PlanEvidenceFingerprint = string

export const NO_PLAN_EVIDENCE_FINGERPRINT =
  "plan-evidence:v1:none" as const

export type PlanEvidenceFreshness =
  | "current"
  | "stale"
  | "unverified"
  | "no_plans"

type FingerprintState = {
  first: number
  second: number
  encodedLength: number
}

function updateFingerprintHash(state: FingerprintState, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    state.first = Math.imul(state.first ^ code, 0x01000193)
    state.second = Math.imul(state.second ^ code, 0x5bd1e995)
  }
  state.encodedLength += value.length
}

function appendFingerprintValue(state: FingerprintState, value: string): void {
  updateFingerprintHash(state, String(value.length))
  updateFingerprintHash(state, ":")
  updateFingerprintHash(state, value)
  updateFingerprintHash(state, "|")
}

function finishFingerprintHash(value: number): string {
  let hash = value
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function fingerprintNumber(value: number): string {
  if (!Number.isFinite(value)) return `nonfinite:${String(value)}`
  if (Object.is(value, -0)) return "-0"
  return String(value)
}

export function buildPlanEvidenceFingerprint(
  selectedEvidence: readonly SelectedPlanEvidence[]
): PlanEvidenceFingerprint | null {
  if (selectedEvidence.length === 0) return NO_PLAN_EVIDENCE_FINGERPRINT
  if (selectedEvidence.some((plan) => plan.selectedSourcePages.length === 0)) {
    return null
  }

  const state: FingerprintState = {
    first: 0x811c9dc5,
    second: 0x9e3779b9,
    encodedLength: 0,
  }

  selectedEvidence.forEach((plan, planIndex) => {
    appendFingerprintValue(state, "plan")
    appendFingerprintValue(state, String(planIndex))
    appendFingerprintValue(state, plan.planId)
    appendFingerprintValue(state, plan.name)
    appendFingerprintValue(state, plan.mimeType)
    appendFingerprintValue(state, plan.sourceKind)
    appendFingerprintValue(state, fingerprintNumber(plan.fileSize))
    appendFingerprintValue(state, fingerprintNumber(plan.fileLastModified))
    appendFingerprintValue(state, fingerprintNumber(plan.sourcePageCount))
    appendFingerprintValue(state, plan.note)
    appendFingerprintValue(state, String(plan.selectedSourcePages.length))
    plan.selectedSourcePages.forEach((sourcePageNumber, pageIndex) => {
      appendFingerprintValue(state, String(pageIndex))
      appendFingerprintValue(state, fingerprintNumber(sourcePageNumber))
    })
  })

  const digest = `${finishFingerprintHash(state.first)}${finishFingerprintHash(
    state.second
  )}`
  return `plan-evidence:v1:${selectedEvidence.length}:${state.encodedLength}:${digest}`
}

function isKnownPlanEvidenceFingerprint(
  value: unknown
): value is PlanEvidenceFingerprint {
  return (
    value === NO_PLAN_EVIDENCE_FINGERPRINT ||
    (typeof value === "string" &&
      /^plan-evidence:v1:\d+:\d+:[0-9a-f]{16}$/.test(value))
  )
}

export function classifyPlanEvidenceFreshness(args: {
  generatedEvidenceFingerprint?: PlanEvidenceFingerprint | null
  currentEvidenceFingerprint?: PlanEvidenceFingerprint | null
}): PlanEvidenceFreshness {
  if (
    !isKnownPlanEvidenceFingerprint(args.generatedEvidenceFingerprint) ||
    !isKnownPlanEvidenceFingerprint(args.currentEvidenceFingerprint)
  ) {
    return "unverified"
  }

  if (args.generatedEvidenceFingerprint !== args.currentEvidenceFingerprint) {
    return "stale"
  }

  if (args.generatedEvidenceFingerprint === NO_PLAN_EVIDENCE_FINGERPRINT) {
    return "no_plans"
  }

  return "current"
}

export function requiresPlanEvidenceRegeneration(args: {
  hasDisplayedResult: boolean
  freshness: PlanEvidenceFreshness
  hasCurrentPlanInputs: boolean
}): boolean {
  if (!args.hasDisplayedResult) return false
  if (args.freshness === "stale") return true
  return args.freshness === "unverified" && args.hasCurrentPlanInputs
}
