import { PLAN_UPLOAD_CHUNK_BYTES } from "../plan-upload"

/** Plan Study metadata is separate from Estimate scope, measurements and pricing. */
export type Bounds = { x: number; y: number; width: number; height: number }
export type TextBlock = { id: string; text: string; bounds: Bounds }
export type Citation = {
  documentVersionId: string
  pageId: string
  sourceSha256: string
  anchor: { kind: "text"; blockId: string; quote: string } | { kind: "image"; bounds: Bounds }
}
export type Finding = {
  id: string
  kind: "requirement" | "assumption" | "conflict" | "boundary" | "question"
  trade: "painting" | "wallcovering" | "shared"
  title: string
  detail: string
  citations: Citation[]
  limitations: string[]
}
export type StudyPage = {
  id: string
  documentVersionId: string
  pageNumber: number
  sourceSha256: string
  indexing: "complete"
  extraction: "pending" | "complete" | "empty" | "failed"
  rendering: "pending" | "complete" | "failed"
  analysis: "pending" | "complete" | "limited" | "failed" | "unknown"
  blocks: TextBlock[]
  imageArtifactId?: string
  width?: number
  height?: number
  issue?: string
}
export type StudyDocument = {
  id: string
  name: string
  sha256: string
  pageCount: number
  bytes: number
  originalArtifactId: string
  replacesDocumentId?: string
  active: boolean
  pages: StudyPage[]
}
export type StudyDecision = {
  id: string
  findingId: string
  findingTitle: string
  answer: string
  documentVersionIds: string[]
  sourceRevision: number
  status: "active" | "needs_reconfirmation"
  createdAt: string
}
export type Reservation = { inputTokens: number; outputTokens: number }
export type StudyAttempt = {
  id: string
  idempotencyKey: string
  studyId: string
  ownerId: string
  sourceRevision: number
  sourceVersions: Array<{ documentVersionId: string; sha256: string }>
  kind: "page" | "synthesis"
  pageId?: string
  status: "running" | "complete" | "failed" | "unknown"
  claimToken: string
  reservation: Reservation
  createdAt: string
  leaseExpiresAt: string
  errorCode?: string
  usage?: Reservation
}
export type Study = {
  id: string
  ownerId: string
  title: string
  revision: number
  sourceRevision: number
  documents: StudyDocument[]
  findings: Finding[]
  decisions: StudyDecision[]
  attempts: StudyAttempt[]
  synthesis: "pending" | "complete" | "failed" | "unknown"
  synthesisReviewStatus?: "complete" | "limited"
  synthesisLimitations?: string[]
  modelLabel?: string
  createdAt: string
  updatedAt: string
}
export type Artifact = {
  id: string
  ownerId: string
  studyId: string
  documentVersionId: string
  pageId?: string
  kind: "original" | "page-image"
  storageKey: string
  mime: "application/pdf" | "image/png"
  sha256: string
}
export type ReviewResult = {
  findings: Finding[]
  pageStatus: "complete" | "limited"
  limitations: string[]
  modelLabel: string
  usage: Reservation
}
export class StudyError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code
  }
}
export const STUDY_LIMITS = {
  maxDocuments: 8,
  maxPages: 48,
  maxFileBytes: PLAN_UPLOAD_CHUNK_BYTES,
  maxPackageBytes: 20 * 1024 * 1024,
  maxTextCharactersPerPage: 40000,
} as const
export const activePages = (study: Study) => study.documents.filter((d) => d.active).flatMap((d) => d.pages)
