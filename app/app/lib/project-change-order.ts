import { z } from "zod"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, createDraft, parseDraft, parseDraftRevision, updateDraftItem } from "./source-linked-draft"
import { fetchCurrentProjectInventory, matchApprovedRate } from "./automatic-bid"
import type { ApprovedPricingProfile, PricingSurface } from "./automatic-bid-types"
import { parseCustomerProposal, proposalDetailsProblems } from "./customer-proposal"
import type { CustomerProposal, ProposalDetails } from "./customer-proposal-types"
import type { Draft, DraftCommercial, DraftItem, DraftJob, DraftRevision } from "./source-linked-draft-types"
import type { ProjectInventory } from "../../lib/project-library/types"

export type ChangeKind = "addition" | "deduction" | "credit" | "already_included" | "unclear"
export type BaselineRole = "none" | "unaccepted_bid" | "agreed_scope"
export type ChangeFileReference = { id: string; name: string; relativePath: string; sha256: string; sourceVersion: number }
export type ChangeRow = { kind: ChangeKind; item: DraftItem; rateInput: { surface: PricingSurface | null; substrate: string; condition: string; coats: number | null }; rateIssue: string | null }
export type ProjectChangeOrder = {
  schemaVersion: 1; id: string; ownerId: string; job: DraftJob; request: string; commercial: DraftCommercial;
  baselineRole: BaselineRole; baselineRevision: DraftRevision | null; sourceFiles: ChangeFileReference[];
  rows: ChangeRow[]; reviewedBy: string | null; reviewedAt: number | null;
}
export type ChangeOrderSnapshot = { schemaVersion: 1; id: string; ownerId: string; jobId: string; createdAt: number; draft: ProjectChangeOrder; details: ProposalDetails; customer: CustomerProposal | null }

const text = z.string().max(40000)
const identity = z.string().min(1).max(500)
const fileSchema = z.object({ id: identity, name: text, relativePath: text, sha256: z.string().regex(/^[a-f0-9]{64}$/i), sourceVersion: z.number().int().positive() }).strict()
const detailsSchema = z.object({ company: z.object({ name: text, address: text, phone: text, email: text, license: text }).strict(), customerName: text, projectName: text, projectAddress: text, date: text, reference: text, clarifications: text, allowances: text, schedule: text, terms: text }).strict()
const rawSchema = z.object({
  schemaVersion: z.literal(1), id: identity, ownerId: identity,
  job: z.object({ id: identity, name: text, clientName: text, address: text }).strict(), request: text,
  commercial: z.unknown(), baselineRole: z.enum(["none", "unaccepted_bid", "agreed_scope"]), baselineRevision: z.unknown(),
  sourceFiles: z.array(fileSchema).max(1000), rows: z.array(z.object({ kind: z.enum(["addition", "deduction", "credit", "already_included", "unclear"]), item: z.unknown(),
    rateInput: z.object({ surface: z.enum(["walls", "ceilings", "doors"]).nullable(), substrate: text, condition: text, coats: z.number().int().positive().max(20).nullable() }).strict(), rateIssue: text.nullable() }).strict()).max(100),
  reviewedBy: identity.nullable(), reviewedAt: z.number().finite().positive().nullable(),
}).strict()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const key = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ")

function asDraft(record: ProjectChangeOrder, direction: "addition" | "deduction"): Draft {
  const draft = createDraft(record.ownerId, record.job, { ...record.commercial, depositEnabled: false }, `${record.id}-${direction}`)
  draft.title = "Proposed change order draft"
  draft.items = record.rows.filter(row => direction === "addition" ? row.kind === "addition" : row.kind === "deduction" || row.kind === "credit").map(row => clone(row.item))
  return draft
}

export function parseProjectChangeOrder(value: unknown): ProjectChangeOrder | null {
  const parsed = rawSchema.safeParse(value)
  if (!parsed.success) return null
  try {
    const record = parsed.data as ProjectChangeOrder
    const draft = createDraft(record.ownerId, record.job, record.commercial, record.id)
    draft.items = record.rows.map(row => row.item)
    if (!parseDraft(draft) || new Set(record.rows.map(row => row.item.id)).size !== record.rows.length || new Set(record.sourceFiles.map(file => file.id)).size !== record.sourceFiles.length) return null
    if ((record.baselineRole === "none") !== (record.baselineRevision === null)) return null
    if (record.baselineRevision !== null) {
      const baseline = parseDraftRevision(record.baselineRevision)
      if (!baseline || baseline.ownerId !== record.ownerId || baseline.jobId !== record.job.id) return null
    }
    if ((record.reviewedBy === null) !== (record.reviewedAt === null) || record.reviewedBy !== null && record.reviewedBy !== record.ownerId) return null
    for (const row of record.rows) {
      if (row.item.source.kind !== "contractor" || row.item.disposition !== (row.kind === "already_included" ? "excluded" : row.kind === "unclear" ? "unresolved" : "included")) return null
    }
    return clone(record)
  } catch { return null }
}

export function selectChangeFiles(inventory: ProjectInventory | null, ownerId: string, jobId: string, ids: string[]): ChangeFileReference[] {
  if (!ids.length) return []
  if (!inventory || inventory.ownerId !== ownerId || inventory.projectId !== jobId || new Set(ids).size !== ids.length) throw new Error("The selected project files could not be verified for this owner and project.")
  return ids.map(id => {
    const file = inventory.files.find(entry => entry.id === id)
    if (!file || file.ownerId !== ownerId || file.projectId !== jobId || !file.active || file.status !== "uploaded") throw new Error("Select a currently uploaded file version from this project's library.")
    return { id: file.id, name: file.name, relativePath: file.relativePath, sha256: file.sha256, sourceVersion: file.sourceVersion }
  })
}

export function changeSourceProblems(record: ProjectChangeOrder, inventory: ProjectInventory | null): string[] {
  if (!record.sourceFiles.length) return []
  if (!inventory || inventory.ownerId !== record.ownerId || inventory.projectId !== record.job.id) return ["Refresh the selected project's files before using this change draft."]
  return record.sourceFiles.flatMap(source => {
    const current = inventory.files.find(file => file.id === source.id)
    return current && current.ownerId === record.ownerId && current.projectId === record.job.id && current.active && current.status === "uploaded" && current.sha256 === source.sha256 && current.sourceVersion === source.sourceVersion
      ? [] : [`${source.relativePath}: this referenced file version is unavailable or has been replaced. Rebuild the draft from current project files.`]
  })
}

/** A loaded library snapshot is not proof that another client has not replaced a source. */
export async function verifyCurrentChangeSources(record: ProjectChangeOrder, fetcher: typeof fetch | undefined, isCurrent: () => boolean): Promise<ProjectInventory | null> {
  if (!isCurrent()) throw new Error("The owner or project changed. Reopen the change draft.")
  if (!record.sourceFiles.length) return null
  if (!fetcher) throw new Error("Connect to the owner-scoped project library before saving or exporting a file-linked change draft.")
  const inventory = await fetchCurrentProjectInventory(fetcher, record.ownerId, record.job.id, isCurrent)
  const problems = changeSourceProblems(record, inventory)
  if (problems.length) throw new Error(problems.join(" "))
  return inventory
}

function parseLine(line: string, id: string): ChangeRow {
  const pipe = line.indexOf("|")
  const location = pipe >= 0 ? line.slice(0, pipe).trim() : ""
  const description = pipe >= 0 ? line.slice(pipe + 1).trim() : line.trim()
  const mode = description.match(/^(add|additional|deduct|remove|credit|already included)\b/i)?.[1].toLowerCase()
  // "Remove" can describe paid demolition work, not a deduction from scope.
  // Questions and ambiguous responsibility stay decisions until classified.
  const kind: ChangeKind = description.includes("?") ? "unclear" : mode === "add" || mode === "additional" ? "addition" : mode === "deduct" ? "deduction" : mode === "credit" ? "credit" : mode === "already included" ? "already_included" : "unclear"
  const quantities = [...description.matchAll(/(?<![\w.,+\-/\u2010-\u2015~≈])(\d+(?:\.\d+)?)\s*(sq\s*ft|sqft|square feet|linear\s*ft|linear feet|doors?)\b/gi)]
  const ambiguousQuantity = /\b(?:about|approx(?:imately)?|around|roughly)\s+\d/i.test(description) || /\d(?:\.\d+)?\s*(?:x|×|by|to|through)\s*\d/i.test(description)
  const quantity = quantities.length === 1 && !ambiguousQuantity ? Number(quantities[0][1]) : /\blump sum\b/i.test(description) && !ambiguousQuantity ? 1 : null
  const unitText = quantities.length === 1 ? quantities[0][2].toLowerCase() : ""
  const unit = unitText.startsWith("door") ? "doors" : unitText.startsWith("linear") ? "linear_ft" : /\blump sum\b/i.test(description) && !quantities.length ? "lump_sum" : "sqft"
  const surfaceWords = [...new Set([...description.matchAll(/\b(walls?|ceilings?|doors?)\b/gi)].map(match => match[1].toLowerCase().replace(/s$/, "") + "s"))]
  const surface = surfaceWords.length === 1 ? surfaceWords[0] as PricingSurface : null
  const substrate = description.match(/\bsubstrate\s*:\s*([^;\n|]+)/i)?.[1].trim() || ""
  const condition = description.match(/\bcondition\s*:\s*([^;\n|]+)/i)?.[1].trim() || ""
  const coatsMatch = description.match(/\bcoats\s*:\s*(\d+)\b/i) ?? description.match(/\b(\d+)\s+coats?\b/i)
  const coats = coatsMatch ? Number(coatsMatch[1]) : null
  const item = createContractorItem({ id, location, description, quantity, unit, disposition: kind === "already_included" ? "excluded" : kind === "unclear" ? "unresolved" : "included", measurementBasis: quantity === null ? "" : "Explicit quantity in the contractor's pasted change request; contractor confirmation required.", note: "Contractor-supplied change request. No drawing measurement or scope comparison inferred." })
  return { kind, item, rateInput: { surface, substrate, condition, coats }, rateIssue: quantities.length > 1 ? "Separate multiple quantities into distinct work rows before pricing." : null }
}

export function applyChangePricing(record: ProjectChangeOrder, profile: ApprovedPricingProfile | null): ProjectChangeOrder {
  const rows = record.rows.map(row => {
    if (row.kind === "already_included" || row.kind === "unclear") return clone(row)
    const input = row.rateInput
    if (!profile || !input.surface || !input.substrate || !input.condition || input.coats === null) return { ...clone(row), rateIssue: "Choose an approved pricing profile and state surface, substrate, condition and coats; otherwise enter and approve the exact costs below." }
    const match = matchApprovedRate(profile, { surface: input.surface, substrate: input.substrate, condition: input.condition, coats: input.coats }, record.ownerId)
    if (!match.rule) return { ...clone(row), rateIssue: match.reason || "No exact approved pricing rule matches this work." }
    if (match.rule.unit !== row.item.unit) return { ...clone(row), rateIssue: "The approved cost unit does not match this request's quantity unit." }
    const item = updateDraftItem(row.item, { costs: { unit: match.rule.unit, labor: match.rule.labor, materials: match.rule.materials, other: match.rule.other, source: `Approved pricing profile ${profile.id}, version ${profile.version}, rule ${match.rule.id}` } })
    return { ...clone(row), item, rateIssue: null }
  })
  return { ...clone(record), rows, reviewedBy: null, reviewedAt: null }
}

export function prepareChangeOrder(input: { ownerId: string; job: DraftJob; commercial: DraftCommercial; request: string; baselineRole: BaselineRole; baselineRevision: DraftRevision | null; sourceFiles: ChangeFileReference[]; pricingProfile?: ApprovedPricingProfile | null; id?: string }): ProjectChangeOrder {
  const lines = input.request.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length || lines.length > 100 || input.request.length > 40000) throw new Error("Enter one to 100 change-request lines, up to 40,000 characters.")
  const id = input.id || crypto.randomUUID()
  const record: ProjectChangeOrder = { schemaVersion: 1, id, ownerId: input.ownerId, job: clone(input.job), request: input.request, commercial: { ...input.commercial, depositEnabled: false }, baselineRole: input.baselineRole, baselineRevision: input.baselineRevision, sourceFiles: clone(input.sourceFiles), rows: lines.map((line, index) => parseLine(line, `${id}-row-${index + 1}`)), reviewedBy: null, reviewedAt: null }
  const valid = parseProjectChangeOrder(record)
  if (!valid) throw new Error("The project, selected baseline or change request is invalid. Choose an estimate revision from this owner and job explicitly.")
  return applyChangePricing(valid, input.pricingProfile ?? null)
}

export function updateChangeRow(record: ProjectChangeOrder, itemId: string, patch: Partial<Pick<ChangeRow, "kind" | "rateInput">> & { item?: Partial<DraftItem> }): ProjectChangeOrder {
  if (record.rows.filter(row => row.item.id === itemId).length !== 1) throw new Error("The change row could not be identified.")
  const next = { ...clone(record), reviewedBy: null, reviewedAt: null, rows: record.rows.map(row => {
    if (row.item.id !== itemId) return clone(row)
    const kind = patch.kind ?? row.kind
    return { ...clone(row), kind, rateInput: patch.rateInput ?? clone(row.rateInput), rateIssue: null, item: updateDraftItem(row.item, { ...patch.item, disposition: kind === "already_included" ? "excluded" : kind === "unclear" ? "unresolved" : "included" }) }
  }) }
  if (!parseProjectChangeOrder(next)) throw new Error("The edited change row is invalid.")
  return next
}

export function reviewChangeOrder(record: ProjectChangeOrder, ownerId: string, at = Date.now()): ProjectChangeOrder {
  if (!parseProjectChangeOrder(record) || record.ownerId !== ownerId) throw new Error("This change draft does not belong to the current owner.")
  const rows = record.rows.map(row => {
    if (row.kind === "already_included") return clone(row)
    try { return { ...clone(row), item: approveCosts(confirmQuantity(row.item, ownerId, at), ownerId, at) } }
    catch { return clone(row) }
  })
  return { ...clone(record), rows, reviewedBy: ownerId, reviewedAt: at }
}

export function summarizeChangeOrder(record: ProjectChangeOrder, inventory: ProjectInventory | null) {
  if (!parseProjectChangeOrder(record)) throw new Error("The change draft is invalid.")
  const additions = calculateDraft(asDraft(record, "addition")), deductions = calculateDraft(asDraft(record, "deduction"))
  const blockers = [...changeSourceProblems(record, inventory), ...record.rows.filter(row => row.kind === "unclear").map(row => `${row.item.location || "Unlocated work"}: decide whether this work is an addition, deduction, credit or already included.`)]
  if (record.baselineRole === "agreed_scope" && record.baselineRevision?.calculation.partial) blockers.push("The selected baseline records a partial estimate, not a verified agreed total. Choose a complete agreed revision or continue without a verified baseline.")
  for (const [title, result] of [["Addition", additions], ["Deduction/credit", deductions]] as const) for (const item of result.items) if (item.status === "unpriced") blockers.push(`${title}: ${item.reasons.join(" ")}`)
  if (!record.rows.some(row => ["addition", "deduction", "credit"].includes(row.kind))) blockers.push("No priced change has been selected; already-included work creates no charge.")
  if (record.reviewedBy !== record.ownerId) blockers.push("Review the classifications, quantities and exact costs, then confirm the batch.")
  const delta = additions.total - deductions.total
  const comparison = record.baselineRole === "none" ? "Scope comparison is unverified: no agreed baseline was selected." : record.baselineRole === "unaccepted_bid" ? "This is a revision to an unaccepted bid, not a change to an agreed contract. Use Prepare a Bid to save that estimate revision." : "Compared with the exact estimate revision you identified as agreed scope. Agreement status is your designation, not a new customer approval."
  return { additions, deductions, delta, partial: blockers.length > 0, blockers: [...new Set(blockers)], comparison, proposedContractTotal: record.baselineRole === "agreed_scope" && !blockers.length ? record.baselineRevision!.calculation.total + delta : null,
    safeExportLimitation: record.baselineRole === "unaccepted_bid" ? "A contract change-order PDF is unavailable for an unaccepted bid revision. Use Prepare a Bid and its proposal workflow." : record.rows.some(row => row.kind === "deduction" || row.kind === "credit") ? "Deductive and mixed changes remain internal drafts with additions and credits shown separately. Customer-safe credit/mixed PDF formatting is not supported in this slice; no legacy PDF will be used." : null }
}

export function exactBaselineMatches(record: ProjectChangeOrder, row: ChangeRow): string[] {
  if (!record.baselineRevision) return []
  return record.baselineRevision.draft.items.filter(item => item.disposition === "included" && key(item.location) === key(row.item.location) && key(item.description) === key(row.item.description)).map(item => item.id)
}

export function createChangeOrderSnapshot(record: ProjectChangeOrder, details: ProposalDetails, inventory: ProjectInventory | null, id = crypto.randomUUID(), createdAt = Date.now()): ChangeOrderSnapshot {
  const valid = parseProjectChangeOrder(record)
  if (!valid || !detailsSchema.safeParse(details).success) throw new Error("The change draft or document details could not be validated.")
  const summary = summarizeChangeOrder(valid, inventory)
  let customer: CustomerProposal | null = null
  if (!summary.partial && !summary.safeExportLimitation && !proposalDetailsProblems(details).length) {
    const priced = summary.additions
    customer = parseCustomerProposal({ schemaVersion: 1, company: details.company, customer: { name: details.customerName }, project: { name: details.projectName, address: details.projectAddress }, date: details.date, reference: details.reference,
      scope: valid.rows.filter(row => row.kind === "addition").map(row => ({ trade: row.item.trade, location: row.item.location, description: row.item.description, quantity: row.item.quantity, unit: row.item.unit })),
      exclusions: [], clarifications: `${summary.comparison}\nProposed added work only. This draft does not modify an agreement or authorize work.${details.clarifications ? `\n${details.clarifications}` : ""}`, allowances: details.allowances, schedule: details.schedule, terms: details.terms,
      pricing: { subtotal: priced.subtotal, taxRate: valid.commercial.taxEnabled ? valid.commercial.taxRate : 0, taxAmount: priced.taxAmount, roundingAdjustment: priced.roundingAdjustment, total: priced.total, depositDue: 0, remaining: priced.total } })
    if (!customer) throw new Error("The customer change draft could not be safely rendered.")
  }
  return { schemaVersion: 1, id, ownerId: valid.ownerId, jobId: valid.job.id, createdAt, draft: valid, details: clone(details), customer }
}

export function parseChangeOrderSnapshot(value: unknown): ChangeOrderSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (Object.keys(raw).sort().join() !== "createdAt,customer,details,draft,id,jobId,ownerId,schemaVersion" || raw.schemaVersion !== 1 || typeof raw.id !== "string" || !raw.id || typeof raw.createdAt !== "number" || !Number.isFinite(raw.createdAt) || raw.createdAt <= 0) return null
  const draft = parseProjectChangeOrder(raw.draft)
  const details = detailsSchema.safeParse(raw.details)
  const customer = raw.customer === null ? null : parseCustomerProposal(raw.customer)
  if (!draft || !details.success || raw.ownerId !== draft.ownerId || raw.jobId !== draft.job.id || raw.customer !== null && !customer) return null
  if (customer) {
    // Inventory freshness is checked when exporting; only immutable selling figures and rows are compared here.
    const expected = calculateDraft(asDraft(draft, "addition"))
    if (draft.rows.some(row => ["deduction", "credit", "unclear"].includes(row.kind)) || draft.baselineRole === "unaccepted_bid" || draft.reviewedBy !== draft.ownerId || expected.partial || customer.pricing.total !== expected.total || customer.pricing.subtotal !== expected.subtotal || customer.pricing.taxAmount !== expected.taxAmount || customer.pricing.roundingAdjustment !== expected.roundingAdjustment || customer.pricing.taxRate !== (draft.commercial.taxEnabled ? draft.commercial.taxRate : 0) || customer.pricing.depositDue !== 0 || customer.pricing.remaining !== expected.total || JSON.stringify(customer.scope) !== JSON.stringify(draft.rows.filter(row => row.kind === "addition").map(row => ({ trade: row.item.trade, location: row.item.location, description: row.item.description, quantity: row.item.quantity, unit: row.item.unit })))) return null
    if (JSON.stringify(customer.company) !== JSON.stringify(details.data.company) || customer.customer.name !== details.data.customerName || customer.project.name !== details.data.projectName || customer.project.address !== details.data.projectAddress || customer.date !== details.data.date || customer.reference !== details.data.reference || customer.terms !== details.data.terms || customer.schedule !== details.data.schedule || customer.allowances !== details.data.allowances) return null
    const expectedClarifications = `${summarizeChangeOrder(draft, null).comparison}\nProposed added work only. This draft does not modify an agreement or authorize work.${details.data.clarifications ? `\n${details.data.clarifications}` : ""}`
    if (customer.exclusions.length || customer.clarifications !== expectedClarifications) return null
  }
  return { schemaVersion: 1, id: raw.id, ownerId: draft.ownerId, jobId: draft.job.id, createdAt: raw.createdAt, draft, details: clone(details.data), customer }
}
