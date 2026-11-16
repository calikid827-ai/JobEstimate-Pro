import type { Reservation } from "../plan-study/types"

/** Model interpretations are proposed inputs, never quantity/cost approval. */
export type AnalysisOrigin = "explicit_text" | "printed_visual" | "observation"
export type AnalysisFact<T> = { value: T; citationIds: string[]; origin: AnalysisOrigin }
export type AnalysisSourceRef = { fileId: string; sourceVersion: number; sourceSha256: string; pageNumber: number }
export type AnalysisSource = AnalysisSourceRef & {
  role: "target" | "context"; name: string; relativePath: string; mimeType: string
  textSha256: string; textCharacters: number; imageSha256: string | null
  textStatus: "complete" | "empty" | "failed" | "unavailable"
  imageStatus: "provided" | "unsupported" | "not_provided" | "failed"
  issues: string[]
}
export type AnalysisCitation = AnalysisSourceRef & {
  id: string
  anchor: { kind: "text"; quote: string } | { kind: "image"; bounds: { x: number; y: number; width: number; height: number }; visibleText: string | null }
}
export type AnalysisFinding = {
  id: string; kind: "requirement" | "assumption" | "question" | "conflict" | "boundary" | "observation"
  title: string; detail: string; citationIds: string[]; relatedFindingIds: string[]
  affectedWorkIds: string[]; limitations: string[]
}
export type AnalysisTakeoffInput = {
  id: string; findingIds: string[]
  location: AnalysisFact<string> | null
  surface: AnalysisFact<"walls" | "ceilings" | "doors"> | null
  inputs: {
    lengthFt: AnalysisFact<number> | null; widthFt: AnalysisFact<number> | null; wallHeightFt: AnalysisFact<number> | null
    openingsSqft: AnalysisFact<number> | null; netAreaSqft: AnalysisFact<number> | null; count: AnalysisFact<number> | null
    substrate: AnalysisFact<string> | null; condition: AnalysisFact<string> | null; coats: AnalysisFact<number> | null
    finish: AnalysisFact<string> | null; extent: AnalysisFact<string> | null
  }
  limitations: string[]
}
export type AnalysisResult = {
  citations: AnalysisCitation[]; findings: AnalysisFinding[]; takeoffInputs: AnalysisTakeoffInput[]
  reviewStatus: "reviewed" | "limited"; limitations: string[]
}
export type ProjectAnalysisRecord = {
  id: string; ownerId: string; projectId: string; fingerprint: string; attemptNumber: number
  sourceVersions: AnalysisSource[]; status: "running" | "complete" | "failed" | "unknown"
  createdAt: string; leaseExpiresAt: string; modelLabel: string
  resultIdentity: string | null; result: AnalysisResult | null; usage?: Reservation; errorCode?: string
}
export type AnalysisAttempt = ProjectAnalysisRecord & { claimToken: string; reservation: Reservation }
export type AnalysisRequest = { targets: AnalysisSourceRef[]; context: AnalysisSourceRef[]; retryFailed?: boolean }
export type AnalysisPacketSource = AnalysisSource & { text: string; image?: { mime: "image/jpeg"; bytes: Uint8Array; width: number; height: number } }
export type AnalysisPacket = { ownerId: string; projectId: string; fingerprint: string; sources: AnalysisPacketSource[] }
export class ProjectAnalysisError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}
export const ANALYSIS_LIMITS = {
  targets: 4, context: 8, images: 4, imageSide: 1600, imageBytes: 8 * 1024 ** 2,
  contextBytes: 120000, outputTokens: 6000, reservationInputTokens: 200000,
  attemptsPerFingerprint: 2, recordsPerPage: 20,
} as const
