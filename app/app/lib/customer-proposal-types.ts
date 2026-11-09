import type { Draft, DraftRevision, DraftUnit } from "./source-linked-draft-types"

/** Only these company fields can enter a customer document; logos are not copied. */
export type CustomerCompany = { name: string; address: string; phone: string; email: string; license: string }
export type ProposalProfile = CustomerCompany & { paymentTerms?: string }
export type ProposalDetails = {
  company: CustomerCompany
  customerName: string
  projectName: string
  projectAddress: string
  date: string
  reference: string
  clarifications: string
  allowances: string
  schedule: string
  terms: string
}
export type CustomerScopeRow = { trade: string; location: string; description: string; quantity: number; unit: DraftUnit }
export type CustomerExclusion = { location: string; description: string }
/** Explicit customer allowlist. Never add internal estimate/source records here. */
export type CustomerProposal = {
  schemaVersion: 1
  company: CustomerCompany
  customer: { name: string }
  project: { name: string; address: string }
  date: string
  reference: string
  scope: CustomerScopeRow[]
  exclusions: CustomerExclusion[]
  clarifications: string
  allowances: string
  schedule: string
  terms: string
  pricing: { subtotal: number; taxRate: number; taxAmount: number; roundingAdjustment: number; total: number; depositDue: number; remaining: number }
}
/** Binding metadata stays outside the customer render model. */
export type ProposalSnapshot = {
  schemaVersion: 1
  id: string
  ownerId: string
  jobId: string
  draftId: string
  estimateRevisionId: string
  createdAt: number
  customer: CustomerProposal
}
export type ProposalContext = { ownerId: string; jobId: string; revision: DraftRevision | null; workingDraft: Draft | null }
export type ProposalReadiness = { ready: boolean; blockers: string[]; limitations: string[] }
