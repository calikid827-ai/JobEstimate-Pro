import { z } from "zod"
import { parseDraft, parseDraftRevision } from "./source-linked-draft"
import type { Draft, DraftRevision } from "./source-linked-draft-types"
import type { CustomerProposal, ProposalContext, ProposalDetails, ProposalProfile, ProposalReadiness, ProposalSnapshot } from "./customer-proposal-types"

const text = z.string().max(40000).refine((value) => [...value].every((character) => {
  const code = character.codePointAt(0)!
  return code >= 32 && code !== 127 || code === 9 || code === 10 || code === 13
}), "Unsupported control characters")
const required = text.refine((value) => Boolean(value.trim()), "Required value")
const identity = z.string().min(1).max(500).refine((value) => value.trim() === value && Boolean(value.trim()))
const money = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER / 100)
const currency = money.refine((value) => Number(value.toFixed(2)) === value, "Currency must be recorded to cents")
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})
const company = z.object({ name: required, address: text, phone: text, email: text, license: text }).strict()
const detailsSchema = z.object({
  company, customerName: required, projectName: required, projectAddress: text,
  date, reference: required, clarifications: text, allowances: text, schedule: text, terms: text,
}).strict()
const unit = z.enum(["sqft", "linear_ft", "doors", "lump_sum"])
const pricing = z.object({
  subtotal: currency, taxRate: z.number().finite().min(0).max(25), taxAmount: currency,
  roundingAdjustment: z.number().finite().min(-1).max(1).refine((value) => Number(value.toFixed(2)) === value), total: currency,
  depositDue: currency, remaining: currency,
}).strict().refine((value) => Math.round((value.subtotal + value.taxAmount + value.roundingAdjustment) * 100) === Math.round(value.total * 100)
  && Math.round((value.depositDue + value.remaining) * 100) === Math.round(value.total * 100), "Selling-price summary does not reconcile")
const customerSchema = z.object({
  schemaVersion: z.literal(1), company, customer: z.object({ name: required }).strict(),
  project: z.object({ name: required, address: text }).strict(), date, reference: required,
  scope: z.array(z.object({ trade: required, location: required, description: required, quantity: money, unit }).strict()).min(1).max(1000),
  exclusions: z.array(z.object({ location: text, description: text }).strict()).max(1000),
  clarifications: text, allowances: text, schedule: text, terms: text, pricing,
}).strict()
const snapshotSchema = z.object({
  schemaVersion: z.literal(1), id: identity, ownerId: identity, jobId: identity,
  draftId: identity, estimateRevisionId: identity, createdAt: z.number().finite().positive(), customer: customerSchema,
}).strict()

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
function same(a: unknown, b: unknown): boolean { return stable(a) === stable(b) }
function estimateContent(draft: Draft) {
  // A source check may only update freshness without changing the saved quote.
  // Every actual input, evidence snapshot and approval remains part of equality.
  return { ...draft, basedOnRevisionId: null, items: draft.items.map((item) => item.source.kind === "study"
    ? { ...item, source: { kind: "study", snapshot: item.source.snapshot } } : item) }
}
const boundedCoverage = "Readiness covers only the selected quoted items. It does not establish complete review of the plan package or project."

export function assessProposalReadiness(context: ProposalContext): ProposalReadiness {
  const blockers: string[] = []
  const limitations: string[] = [boundedCoverage]
  const revision = parseDraftRevision(context.revision)
  if (!revision) return { ready: false, blockers: ["Open a valid saved estimate revision before creating a proposal."], limitations }
  if (!context.ownerId.trim() || revision.ownerId !== context.ownerId || revision.jobId !== context.jobId) {
    return { ready: false, blockers: ["The selected estimate revision does not belong to the current owner and job."], limitations }
  }
  const working = parseDraft(context.workingDraft)
  if (!working || working.ownerId !== context.ownerId || working.job.id !== context.jobId || working.id !== revision.draftId || working.basedOnRevisionId !== revision.id) {
    blockers.push("Reopen the selected saved estimate revision in its current owner and job workspace.")
  } else {
    if (!same(estimateContent(working), estimateContent(revision.draft))) blockers.push("The estimate has unsaved changes. Save a new estimate revision before using changed scope, evidence, quantities or pricing.")
    for (const [index, item] of working.items.entries()) {
      if (item.disposition === "excluded") continue
      if (item.source.kind === "study" && item.source.freshness !== "current") blockers.push(`Item ${index + 1}: source evidence is ${item.source.freshness}. Use the draft's source check or evidence replacement and reconfirmation, then save a new estimate revision when inputs or recorded pricing change.`)
    }
  }
  const included = revision.draft.items.filter((item) => item.disposition === "included")
  if (!included.length) blockers.push("Include and price at least one item before creating a customer proposal.")
  for (const [index, item] of revision.draft.items.entries()) {
    if (item.disposition === "excluded") {
      if (!item.description.trim()) blockers.push(`Item ${index + 1}: enter the explicit exclusion description and save a new estimate revision.`)
      continue
    }
    if (item.disposition === "unresolved") blockers.push(`Item ${index + 1}: resolve whether this work is included or excluded before quoting it.`)
    if (!item.quantityConfirmation) blockers.push(`Item ${index + 1}: quantity confirmation is missing.`)
    if (!item.costApproval) blockers.push(`Item ${index + 1}: direct-cost approval is missing.`)
    const line = revision.calculation.items.find((entry) => entry.itemId === item.id)
    if (!line || line.status !== "priced") blockers.push(`Item ${index + 1}: the saved revision records unpriced work. Complete the draft checks and save a new estimate revision.`)
  }
  if (revision.calculation.partial) blockers.push("The saved revision has a partial priced amount, not a complete price for the selected scope. Resolve its items and save a new estimate revision.")
  for (const item of revision.draft.items) {
    if (item.source.kind !== "study") continue
    const source = item.source.snapshot
    if (source.synthesisReviewStatus !== "complete") limitations.push("The retained Study does not establish complete package coverage.")
    limitations.push(...source.synthesisLimitations, ...source.finding.limitations,
      ...source.documents.flatMap((document) => document.pages.flatMap((page) => page.issue ? [page.issue] : page.analysis === "limited" ? [`${document.name}, page ${page.pageNumber}: substantive review is limited.`] : [])))
  }
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)], limitations: [...new Set(limitations)] }
}

export function defaultProposalDetails(revision: DraftRevision, profile: ProposalProfile, proposalDate: string): ProposalDetails {
  const supplied = (value: unknown) => typeof value === "string" ? value : ""
  return {
    company: { name: supplied(profile.name), address: supplied(profile.address), phone: supplied(profile.phone), email: supplied(profile.email), license: supplied(profile.license) },
    customerName: revision.draft.job.clientName, projectName: revision.draft.job.name, projectAddress: revision.draft.job.address,
    date: proposalDate, reference: "", clarifications: "", allowances: "", schedule: "", terms: supplied(profile.paymentTerms),
  }
}

export function proposalDetailsProblems(details: ProposalDetails): string[] {
  const parsed = detailsSchema.safeParse(details)
  if (parsed.success) return []
  return [...new Set(parsed.error.issues.map((issue) => {
    const field = issue.path.join(".")
    const labels: Record<string, string> = { "company.name": "company name", customerName: "customer name", projectName: "project name", date: "valid proposal date (YYYY-MM-DD)", reference: "proposal reference" }
    return `Enter or review ${(labels[field] ?? field) || "the proposal details"}.`
  }))]
}

function quotedContent(revision: DraftRevision) {
  const recorded = revision.calculation
  return {
    scope: revision.draft.items.filter((item) => item.disposition === "included").map((item) => ({
      trade: item.trade, location: item.location, description: item.description, quantity: item.quantity!, unit: item.unit,
    })),
    exclusions: revision.draft.items.filter((item) => item.disposition === "excluded").map((item) => ({ location: item.location, description: item.description })),
    pricing: { subtotal: recorded.subtotal, taxRate: revision.draft.commercial.taxEnabled ? revision.draft.commercial.taxRate : 0, taxAmount: recorded.taxAmount, roundingAdjustment: recorded.roundingAdjustment, total: recorded.total, depositDue: recorded.depositDue, remaining: recorded.remaining },
  }
}

export function createProposalSnapshot(context: ProposalContext, details: ProposalDetails, id: string = globalThis.crypto.randomUUID(), createdAt = Date.now()): ProposalSnapshot {
  const readiness = assessProposalReadiness(context)
  const problems = [...readiness.blockers, ...proposalDetailsProblems(details)]
  if (problems.length) throw new Error(problems.join(" "))
  const revision = parseDraftRevision(context.revision)!
  const reviewed = detailsSchema.parse(details)
  const snapshot = parseProposalSnapshot({
    schemaVersion: 1, id, ownerId: context.ownerId, jobId: context.jobId, draftId: revision.draftId,
    estimateRevisionId: revision.id, createdAt,
    customer: {
      schemaVersion: 1, company: reviewed.company, customer: { name: reviewed.customerName },
      project: { name: reviewed.projectName, address: reviewed.projectAddress }, date: reviewed.date, reference: reviewed.reference,
      ...quotedContent(revision), clarifications: reviewed.clarifications, allowances: reviewed.allowances, schedule: reviewed.schedule, terms: reviewed.terms,
    },
  })
  if (!snapshot) throw new Error("The proposal snapshot could not be validated. It has not been saved.")
  return snapshot
}

export function parseCustomerProposal(value: unknown): CustomerProposal | null {
  const parsed = customerSchema.safeParse(value)
  return parsed.success ? clone(parsed.data as CustomerProposal) : null
}

export function parseProposalSnapshot(value: unknown): ProposalSnapshot | null {
  const parsed = snapshotSchema.safeParse(value)
  return parsed.success ? clone(parsed.data as ProposalSnapshot) : null
}

export function validateProposalSnapshotForContext(snapshot: ProposalSnapshot, context: ProposalContext): ProposalReadiness {
  const result = assessProposalReadiness(context)
  const parsed = parseProposalSnapshot(snapshot)
  const revision = parseDraftRevision(context.revision)
  if (!parsed || !revision || parsed.ownerId !== context.ownerId || parsed.jobId !== context.jobId ||
    parsed.draftId !== revision.draftId || parsed.estimateRevisionId !== revision.id) {
    return { ...result, ready: false, blockers: [...result.blockers, "The proposal does not match the selected owner, job, draft and estimate revision."] }
  }
  const expected = quotedContent(revision)
  if (!same(parsed.customer.scope, expected.scope) || !same(parsed.customer.exclusions, expected.exclusions) || !same(parsed.customer.pricing, expected.pricing)) {
    return { ...result, ready: false, blockers: [...result.blockers, "The proposal scope or selling-price summary does not match the exact saved estimate revision."] }
  }
  return result
}
