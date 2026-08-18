import {
  classifyPlanEvidenceFreshness,
  type PlanEvidenceFingerprint,
} from "./plan-intelligence-evidence"
import type { UiTrade } from "./types"

export type NormalizedPlanScheduleFinishSource = {
  uploadId: string
  uploadName: string
  pageNumber: number
  sourcePageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  sourceMatrixIndex: number
  sourceTableIndex: number
  rowIndex: number
  sourceColumnIndex: number
  sourceColumnLabel: string
  surface: "ceiling"
  roomName: string | null
  roomNumber: string | null
  rawFinishValue: string
  rawRowText: string
  confidence: number
  warnings: []
}

export type NormalizedPlanLegendDefinitionSource = {
  uploadId: string
  uploadName: string
  pageNumber: number
  sourcePageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  sourceTableIndex: number
  rowIndex: number
  rawCode: string
  rawDefinition: string
  rawRowText: string
  confidence: number
  warnings: []
}

export type NormalizedPlanScopeBoundaryCandidate = {
  id: string
  semanticRecordId: string
  trade: "painting"
  subjectKey: "ceilings"
  surface: "ceiling"
  rawFinishValue: string
  resolvedFinishCategory: "paint_coating"
  resolutionMethod: "explicit_schedule_value" | "legend_code"
  semanticStatus: "resolved"
  scheduleSource: NormalizedPlanScheduleFinishSource
  legendSources: NormalizedPlanLegendDefinitionSource[]
  confidence: number
  warnings: []
  blockers: []
  eligibleForFutureScopeReview: true
  pricingAuthoritative: false
  pricingEligibleNow: false
  quantityAuthoritative: false
  mutatesTypedScope: false
  generatesEstimate: false
  persistsState: false
}

export type GeneratedPlanScopeCandidateContext = {
  evidenceFingerprint: PlanEvidenceFingerprint
  generatedTrade: UiTrade
  candidates: NormalizedPlanScopeBoundaryCandidate[]
}

export type GeneratedPlanScopeCandidateContextEvent =
  | { type: "accepted_generate_reset" }
  | { type: "history_load" }
  | { type: "source_change_order_reset" }
  | {
      type: "successful_generate"
      evidenceFingerprint?: PlanEvidenceFingerprint | null
      generatedTrade: UiTrade
      rawCandidates: unknown
    }

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isConfidence(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  )
}

function isEmptyArray(value: unknown): value is [] {
  return Array.isArray(value) && value.length === 0
}

function normalizeScheduleSource(
  value: unknown,
  candidateRawFinishValue: string
): NormalizedPlanScheduleFinishSource | null {
  if (!isRecord(value)) return null
  if (!isNonEmptyString(value.uploadId)) return null
  if (!isNonEmptyString(value.uploadName)) return null
  if (!isPositiveInteger(value.pageNumber)) return null
  if (!isPositiveInteger(value.sourcePageNumber)) return null
  if (!isNullableString(value.sheetNumber)) return null
  if (!isNullableString(value.sheetTitle)) return null
  if (!isNonNegativeInteger(value.sourceMatrixIndex)) return null
  if (!isNonNegativeInteger(value.sourceTableIndex)) return null
  if (!isPositiveInteger(value.rowIndex)) return null
  if (!isNonNegativeInteger(value.sourceColumnIndex)) return null
  if (!isNonEmptyString(value.sourceColumnLabel)) return null
  if (value.surface !== "ceiling") return null
  if (!isNullableString(value.roomName)) return null
  if (!isNullableString(value.roomNumber)) return null
  if (!isNonEmptyString(value.rawFinishValue)) return null
  if (value.rawFinishValue !== candidateRawFinishValue) return null
  if (!isNonEmptyString(value.rawRowText)) return null
  if (!isConfidence(value.confidence)) return null
  if (!isEmptyArray(value.warnings)) return null

  return {
    uploadId: value.uploadId,
    uploadName: value.uploadName,
    pageNumber: value.pageNumber,
    sourcePageNumber: value.sourcePageNumber,
    sheetNumber: value.sheetNumber,
    sheetTitle: value.sheetTitle,
    sourceMatrixIndex: value.sourceMatrixIndex,
    sourceTableIndex: value.sourceTableIndex,
    rowIndex: value.rowIndex,
    sourceColumnIndex: value.sourceColumnIndex,
    sourceColumnLabel: value.sourceColumnLabel,
    surface: "ceiling",
    roomName: value.roomName,
    roomNumber: value.roomNumber,
    rawFinishValue: value.rawFinishValue,
    rawRowText: value.rawRowText,
    confidence: value.confidence,
    warnings: [],
  }
}

function normalizeLegendSource(
  value: unknown,
  scheduleUploadId: string
): NormalizedPlanLegendDefinitionSource | null {
  if (!isRecord(value)) return null
  if (!isNonEmptyString(value.uploadId)) return null
  if (value.uploadId !== scheduleUploadId) return null
  if (!isNonEmptyString(value.uploadName)) return null
  if (!isPositiveInteger(value.pageNumber)) return null
  if (!isPositiveInteger(value.sourcePageNumber)) return null
  if (!isNullableString(value.sheetNumber)) return null
  if (!isNullableString(value.sheetTitle)) return null
  if (!isNonNegativeInteger(value.sourceTableIndex)) return null
  if (!isPositiveInteger(value.rowIndex)) return null
  if (!isNonEmptyString(value.rawCode)) return null
  if (!isNonEmptyString(value.rawDefinition)) return null
  if (!isNonEmptyString(value.rawRowText)) return null
  if (!isConfidence(value.confidence)) return null
  if (!isEmptyArray(value.warnings)) return null

  return {
    uploadId: value.uploadId,
    uploadName: value.uploadName,
    pageNumber: value.pageNumber,
    sourcePageNumber: value.sourcePageNumber,
    sheetNumber: value.sheetNumber,
    sheetTitle: value.sheetTitle,
    sourceTableIndex: value.sourceTableIndex,
    rowIndex: value.rowIndex,
    rawCode: value.rawCode,
    rawDefinition: value.rawDefinition,
    rawRowText: value.rawRowText,
    confidence: value.confidence,
    warnings: [],
  }
}

function normalizeCandidate(
  value: unknown
): NormalizedPlanScopeBoundaryCandidate | null {
  if (!isRecord(value)) return null
  if (!isNonEmptyString(value.id)) return null
  if (!isNonEmptyString(value.semanticRecordId)) return null
  if (value.trade !== "painting") return null
  if (value.subjectKey !== "ceilings") return null
  if (value.surface !== "ceiling") return null
  if (!isNonEmptyString(value.rawFinishValue)) return null
  if (value.resolvedFinishCategory !== "paint_coating") return null
  if (
    value.resolutionMethod !== "explicit_schedule_value" &&
    value.resolutionMethod !== "legend_code"
  ) {
    return null
  }
  if (value.semanticStatus !== "resolved") return null
  if (!isConfidence(value.confidence)) return null
  if (!isEmptyArray(value.warnings)) return null
  if (!isEmptyArray(value.blockers)) return null
  if (value.eligibleForFutureScopeReview !== true) return null
  if (value.pricingAuthoritative !== false) return null
  if (value.pricingEligibleNow !== false) return null
  if (value.quantityAuthoritative !== false) return null
  if (value.mutatesTypedScope !== false) return null
  if (value.generatesEstimate !== false) return null
  if (value.persistsState !== false) return null

  const scheduleSource = normalizeScheduleSource(
    value.scheduleSource,
    value.rawFinishValue
  )
  if (!scheduleSource || !Array.isArray(value.legendSources)) return null

  const legendSources: NormalizedPlanLegendDefinitionSource[] = []
  if (value.resolutionMethod === "explicit_schedule_value") {
    if (value.legendSources.length !== 0) return null
  } else {
    if (value.legendSources.length === 0) return null
    for (const rawSource of value.legendSources) {
      const source = normalizeLegendSource(rawSource, scheduleSource.uploadId)
      if (!source) return null
      legendSources.push(source)
    }
  }

  return {
    id: value.id,
    semanticRecordId: value.semanticRecordId,
    trade: "painting",
    subjectKey: "ceilings",
    surface: "ceiling",
    rawFinishValue: value.rawFinishValue,
    resolvedFinishCategory: "paint_coating",
    resolutionMethod: value.resolutionMethod,
    semanticStatus: "resolved",
    scheduleSource,
    legendSources,
    confidence: value.confidence,
    warnings: [],
    blockers: [],
    eligibleForFutureScopeReview: true,
    pricingAuthoritative: false,
    pricingEligibleNow: false,
    quantityAuthoritative: false,
    mutatesTypedScope: false,
    generatesEstimate: false,
    persistsState: false,
  }
}

export function normalizePlanScopeBoundarySemanticCandidates(
  value: unknown
): NormalizedPlanScopeBoundaryCandidate[] {
  if (!Array.isArray(value)) return []

  const candidates: NormalizedPlanScopeBoundaryCandidate[] = []
  for (const rawCandidate of value) {
    const candidate = normalizeCandidate(rawCandidate)
    if (candidate) candidates.push(candidate)
  }
  return candidates
}

export function transitionGeneratedPlanScopeCandidateContext(
  _current: GeneratedPlanScopeCandidateContext | null,
  event: GeneratedPlanScopeCandidateContextEvent
): GeneratedPlanScopeCandidateContext | null {
  if (event.type !== "successful_generate") return null

  const evidenceFingerprint = event.evidenceFingerprint
  if (
    typeof evidenceFingerprint !== "string" ||
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: evidenceFingerprint,
      currentEvidenceFingerprint: evidenceFingerprint,
    }) !== "current"
  ) {
    return null
  }

  return {
    evidenceFingerprint,
    generatedTrade: event.generatedTrade,
    candidates: normalizePlanScopeBoundarySemanticCandidates(
      event.rawCandidates
    ),
  }
}
