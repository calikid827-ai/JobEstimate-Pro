import type { DraftItem, ProjectSelectionSnapshot } from "./source-linked-draft-types"

export type PricingSurface = "walls" | "ceilings" | "doors"
export type PricingRule = {
  id: string
  surface: PricingSurface
  substrate: string
  condition: string
  coats: number
  unit: "sqft" | "doors"
  labor: number
  materials: number
  other: number
}
export type ApprovedPricingProfile = {
  schemaVersion: 1
  id: string
  ownerId: string
  name: string
  version: number
  approvedBy: string
  approvedAt: number
  rules: PricingRule[]
}
export type AutomaticBidException = { id: string; location: string; surface: PricingSurface | null; message: string; sourceFileIds: string[]; itemId?: string }
export type AutomaticBidCandidate = { id: string; surface: PricingSurface; item: DraftItem; equation: string; pricingIssue: string | null }
export type AutomaticBidCoverage = {
  filesTotal: number; uploadedFiles: number; preparedFiles: number; pagesTotal: number; textPagesChecked: number; pendingFiles: number; unreviewedPhotos: number
  records: Array<{ fileId: string; sourceVersion: number; pageNumber: number | null; state: "text_checked" | "pending" | "failed" | "unsupported"; reason: string }>
  limitations: string[]
}
export type AutomaticBidPreparation = {
  schemaVersion: 1; id: string; ownerId: string; projectId: string; createdAt: number
  profile: ApprovedPricingProfile; locations: string[]; selectedFileIds: string[]
  candidates: AutomaticBidCandidate[]; exceptions: AutomaticBidException[]; coverage: AutomaticBidCoverage
}
export type AutomaticBidEvidence = ProjectSelectionSnapshot
