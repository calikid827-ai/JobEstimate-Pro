import type { PhotoScopeAssist } from "./types"
import type { SmartQuestion } from "./smart-questions"

export type PhotoEvidenceShotType =
  | "overview"
  | "corner"
  | "wall"
  | "ceiling"
  | "floor"
  | "fixture"
  | "damage"
  | "measurement"

export type SelectedPhotoEvidence = {
  readonly id: string
  readonly name: string
  readonly dataUrl: string
  readonly roomTag: string
  readonly shotType: PhotoEvidenceShotType
  readonly note: string
  readonly reference: {
    readonly kind: "none" | "custom"
    readonly label: string
    readonly realWidthIn: number | null
  }
}

export type PhotoEvidenceFingerprint = string

export const NO_PHOTO_EVIDENCE_FINGERPRINT =
  "photo-evidence:v1:none" as const

export type PhotoEvidenceFreshness =
  | "current"
  | "stale"
  | "unverified"
  | "no_photos"

export const PHOTO_CEILING_SCOPE_FLAG =
  "Photos suggest ceiling work may exist but scope does not mention it." as const

export const PHOTO_TRIM_SCOPE_FLAG =
  "Visible trim/baseboards may not be included in the written scope." as const

export type PhotoIntelligenceActionFinding =
  | "ceiling_boundary"
  | "trim_baseboard_casing_boundary"

export type PhotoIntelligenceActionCandidate = {
  source: "photo_intelligence"
  finding: PhotoIntelligenceActionFinding
  findingFlag: typeof PHOTO_CEILING_SCOPE_FLAG | typeof PHOTO_TRIM_SCOPE_FLAG
  evidenceFingerprint: PhotoEvidenceFingerprint
  question: SmartQuestion
  pricingAuthoritative: false
  pricingEligibleNow: false
}

export type PhotoIntelligenceActionsResult = {
  freshness: PhotoEvidenceFreshness
  candidates: PhotoIntelligenceActionCandidate[]
  pricingAuthoritative: false
  pricingEligibleNow: false
  mutatesTypedScope: false
  generatesEstimate: false
  persistsState: false
}

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

function fingerprintNumber(value: number | null): string {
  if (value === null) return "null"
  if (!Number.isFinite(value)) return `nonfinite:${String(value)}`
  if (Object.is(value, -0)) return "-0"
  return String(value)
}

export function buildPhotoEvidenceFingerprint(
  selectedEvidence: readonly SelectedPhotoEvidence[]
): PhotoEvidenceFingerprint {
  if (selectedEvidence.length === 0) return NO_PHOTO_EVIDENCE_FINGERPRINT

  const state: FingerprintState = {
    first: 0x811c9dc5,
    second: 0x9e3779b9,
    encodedLength: 0,
  }

  selectedEvidence.forEach((photo, index) => {
    appendFingerprintValue(state, "photo")
    appendFingerprintValue(state, String(index))
    appendFingerprintValue(state, photo.id)
    appendFingerprintValue(state, photo.dataUrl)
    appendFingerprintValue(state, photo.name)
    appendFingerprintValue(state, photo.roomTag)
    appendFingerprintValue(state, photo.shotType)
    appendFingerprintValue(state, photo.note)
    appendFingerprintValue(state, photo.reference.kind)
    appendFingerprintValue(state, photo.reference.label)
    appendFingerprintValue(
      state,
      fingerprintNumber(photo.reference.realWidthIn)
    )
  })

  const digest = `${finishFingerprintHash(state.first)}${finishFingerprintHash(
    state.second
  )}`
  return `photo-evidence:v1:${selectedEvidence.length}:${state.encodedLength}:${digest}`
}

function isKnownPhotoEvidenceFingerprint(
  value: unknown
): value is PhotoEvidenceFingerprint {
  return (
    value === NO_PHOTO_EVIDENCE_FINGERPRINT ||
    (typeof value === "string" &&
      /^photo-evidence:v1:\d+:\d+:[0-9a-f]{16}$/.test(value))
  )
}

export function classifyPhotoEvidenceFreshness(args: {
  generatedEvidenceFingerprint?: PhotoEvidenceFingerprint | null
  currentEvidenceFingerprint?: PhotoEvidenceFingerprint | null
}): PhotoEvidenceFreshness {
  if (
    !isKnownPhotoEvidenceFingerprint(args.generatedEvidenceFingerprint) ||
    !isKnownPhotoEvidenceFingerprint(args.currentEvidenceFingerprint)
  ) {
    return "unverified"
  }

  if (
    args.generatedEvidenceFingerprint !== args.currentEvidenceFingerprint
  ) {
    return "stale"
  }

  if (args.generatedEvidenceFingerprint === NO_PHOTO_EVIDENCE_FINGERPRINT) {
    return "no_photos"
  }

  return "current"
}

type PhotoActionSpec = {
  finding: PhotoIntelligenceActionFinding
  flag: PhotoIntelligenceActionCandidate["findingFlag"]
  subjectKey: "ceilings" | "trim_and_baseboards"
  subjectLabel: string
  prompt: string
}

const PHOTO_ACTION_SPECS: readonly PhotoActionSpec[] = [
  {
    finding: "ceiling_boundary",
    flag: PHOTO_CEILING_SCOPE_FLAG,
    subjectKey: "ceilings",
    subjectLabel: "Ceiling preparation and painting",
    prompt: "Photos indicate ceiling work may need a scope decision.",
  },
  {
    finding: "trim_baseboard_casing_boundary",
    flag: PHOTO_TRIM_SCOPE_FLAG,
    subjectKey: "trim_and_baseboards",
    subjectLabel: "Trim, baseboard, and casing preparation and painting",
    prompt:
      "Photos indicate trim, baseboard, or casing work may need a scope decision.",
  },
]

function buildPhotoActionCandidate(
  spec: PhotoActionSpec,
  evidenceFingerprint: PhotoEvidenceFingerprint
): PhotoIntelligenceActionCandidate {
  const questionId = `photo-intelligence-action:painting:${spec.finding}`
  return {
    source: "photo_intelligence",
    finding: spec.finding,
    findingFlag: spec.flag,
    evidenceFingerprint,
    question: {
      id: questionId,
      trade: "painting",
      category: "included_surfaces",
      prompt: spec.prompt,
      helpText:
        "Review the photo finding, choose a boundary, preview the exact typed-scope sentence, then apply it explicitly.",
      source: "photo_scope_assist",
      answerType: "single_choice",
      priority: "medium",
      canAffectPricingIfConfirmed: false,
      dedupeKey: `photo-intelligence:${spec.finding}`,
      decision: {
        kind: "scope_boundary",
        subjectKey: spec.subjectKey,
        subjectLabel: spec.subjectLabel,
      },
    },
    pricingAuthoritative: false,
    pricingEligibleNow: false,
  }
}

function buildResult(
  freshness: PhotoEvidenceFreshness,
  candidates: PhotoIntelligenceActionCandidate[]
): PhotoIntelligenceActionsResult {
  return {
    freshness,
    candidates,
    pricingAuthoritative: false,
    pricingEligibleNow: false,
    mutatesTypedScope: false,
    generatesEstimate: false,
    persistsState: false,
  }
}

export function buildPhotoIntelligenceActions(args: {
  trade: string
  photoScopeAssist?: PhotoScopeAssist
  generatedEvidenceFingerprint?: PhotoEvidenceFingerprint | null
  currentEvidenceFingerprint?: PhotoEvidenceFingerprint | null
}): PhotoIntelligenceActionsResult {
  const generatedEvidenceFingerprint = args.generatedEvidenceFingerprint
  const freshness = classifyPhotoEvidenceFreshness({
    generatedEvidenceFingerprint,
    currentEvidenceFingerprint: args.currentEvidenceFingerprint,
  })

  if (
    freshness !== "current" ||
    args.trade !== "painting" ||
    !isKnownPhotoEvidenceFingerprint(generatedEvidenceFingerprint)
  ) {
    return buildResult(freshness, [])
  }

  const missingScopeFlags = Array.isArray(
    args.photoScopeAssist?.missingScopeFlags
  )
    ? new Set(
        args.photoScopeAssist.missingScopeFlags.filter(
          (flag): flag is string => typeof flag === "string"
        )
      )
    : new Set<string>()

  const candidates = PHOTO_ACTION_SPECS.filter((spec) =>
    missingScopeFlags.has(spec.flag)
  ).map((spec) =>
    buildPhotoActionCandidate(spec, generatedEvidenceFingerprint)
  )

  return buildResult(freshness, candidates)
}
