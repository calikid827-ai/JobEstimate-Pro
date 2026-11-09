import type { Finding, StudyDecision, StudyAttempt } from "../../lib/plan-study/types"

export type DraftUnit = "sqft" | "linear_ft" | "doors" | "lump_sum"
export type DraftCommercial = {
  markupPct: number
  taxEnabled: boolean
  taxRate: number
  depositEnabled: boolean
  depositType: "percent" | "fixed"
  depositValue: number
}
export type DraftJob = { id: string; name: string; clientName: string; address: string }
export type DraftApproval = { ownerId: string; at: number; fingerprint: string }
export type SourceFreshness = "unverified" | "current" | "changed" | "unavailable"
export type StudySelectionSnapshot = {
  studyId: string
  ownerId: string
  studyTitle: string
  sourceRevision: number
  finding: Finding
  decisions: StudyDecision[]
  attempt: Pick<StudyAttempt, "id" | "studyId" | "ownerId" | "sourceRevision" | "sourceVersions" | "kind" | "pageId" | "status" | "createdAt" | "errorCode" | "usage">
  classification: "package" | "supporting"
  documents: Array<{
    id: string; name: string; sha256: string
    pages: Array<{ id: string; documentVersionId: string; pageNumber: number; sourceSha256: string; extraction: string; rendering: string; analysis: string; imageArtifactId?: string; issue?: string }>
  }>
  synthesisReviewStatus: "complete" | "limited" | null
  synthesisLimitations: string[]
  modelLabel: string | null
}
export type DraftSource =
  | { kind: "contractor"; origin: "written_scope" | "approved_assumption"; note: string }
  | { kind: "study"; snapshot: StudySelectionSnapshot; freshness: SourceFreshness }
export type DraftCosts = {
  unit: DraftUnit | "hour"
  labor: number | null
  materials: number | null
  other: number | null
  source: string
}
export type DraftItem = {
  id: string
  trade: string
  location: string
  description: string
  scopeDecision: string
  disposition: "included" | "excluded" | "unresolved"
  quantity: number | null
  unit: DraftUnit
  measurementBasis: string
  costs: DraftCosts
  source: DraftSource
  quantityConfirmation: DraftApproval | null
  costApproval: DraftApproval | null
}
export type Draft = {
  schemaVersion: 1
  id: string
  ownerId: string
  job: DraftJob
  title: string
  items: DraftItem[]
  commercial: DraftCommercial
  basedOnRevisionId: string | null
}
export type DraftItemCalculation = {
  itemId: string
  status: "priced" | "excluded" | "unpriced"
  reasons: string[]
  labor: number | null
  materials: number | null
  other: number | null
  directCost: number | null
}
export type DraftCalculation = {
  items: DraftItemCalculation[]
  pricedCount: number
  unresolvedCount: number
  excludedCount: number
  partial: boolean
  labor: number
  materials: number
  other: number
  directCost: number
  markupAmount: number
  subtotal: number
  taxAmount: number
  total: number
  roundingAdjustment: number
  marginPct: number
  depositDue: number
  remaining: number
}
export type DraftRevision = {
  schemaVersion: 1
  id: string
  draftId: string
  parentRevisionId: string | null
  ownerId: string
  jobId: string
  savedAt: number
  draft: Draft
  calculation: DraftCalculation
}

export type SourceLinkedDraft = Draft
export type SourceLinkedDraftRevision = DraftRevision
