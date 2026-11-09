import { z } from "zod"
import { buildStudyBriefing } from "../../lib/plan-study/briefing"
import type { Finding, Study, StudyDecision } from "../../lib/plan-study/types"
import { computeDepositFromEstimateTotal } from "./estimate-utils"
import { currentProfitMarginPct } from "./profit-target"
import type {
  Draft, DraftApproval, DraftCommercial, DraftItem, DraftJob, DraftRevision,
  DraftCalculation, DraftItemCalculation, SourceFreshness, StudySelectionSnapshot,
} from "./source-linked-draft-types"

export type { Draft, DraftItem, DraftRevision, DraftCalculation, DraftCommercial, StudySelectionSnapshot } from "./source-linked-draft-types"

const text = z.string().max(40000)
const identity = z.string().min(1).max(500).refine((value) => value.trim() === value && Boolean(value.trim()))
const number = z.number().finite().min(0).max(1_000_000_000)
const integer = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const unit = z.enum(["sqft", "linear_ft", "doors", "lump_sum"])
const hash = z.string().regex(/^[a-fA-F0-9]{64}$/)
const bounds = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1) }).strict().refine((box) => box.x + box.width <= 1.000001 && box.y + box.height <= 1.000001)
const citation = z.object({
  documentVersionId: identity, pageId: identity, sourceSha256: hash,
  anchor: z.union([
    z.object({ kind: z.literal("text"), blockId: identity, quote: text.min(1) }).strict(),
    z.object({ kind: z.literal("image"), bounds }).strict(),
  ]),
}).strict()
const findingSchema = z.object({
  id: identity, kind: z.enum(["requirement", "assumption", "conflict", "boundary", "question"]),
  trade: z.enum(["painting", "wallcovering", "shared"]), title: text, detail: text,
  citations: z.array(citation).min(1).max(100), limitations: z.array(text).max(100),
}).strict()
const decisionSchema = z.object({
  id: identity, findingId: identity, findingTitle: text, answer: text,
  documentVersionIds: z.array(identity).min(1).max(8), sourceRevision: integer,
  status: z.literal("active"), createdAt: identity,
}).strict()
const pageSchema = z.object({
  id: identity, documentVersionId: identity, pageNumber: integer, sourceSha256: hash,
  extraction: z.enum(["pending", "complete", "empty", "failed"]),
  rendering: z.enum(["pending", "complete", "failed"]),
  analysis: z.enum(["pending", "complete", "limited", "failed", "unknown"]), imageArtifactId: identity.optional(), issue: text.optional(),
}).strict()
const snapshotSchema = z.object({
  studyId: identity, ownerId: identity, studyTitle: text, sourceRevision: integer,
  finding: findingSchema, decisions: z.array(decisionSchema).max(100),
  attempt: z.object({
    id: identity, studyId: identity, ownerId: identity, sourceRevision: integer,
    sourceVersions: z.array(z.object({ documentVersionId: identity, sha256: hash }).strict()).min(1).max(8),
    kind: z.enum(["page", "synthesis"]), pageId: identity.optional(), status: z.literal("complete"),
    createdAt: identity, errorCode: text.optional(),
    usage: z.object({ inputTokens: number, outputTokens: number }).strict().optional(),
  }).strict(),
  classification: z.enum(["package", "supporting"]),
  documents: z.array(z.object({ id: identity, name: text, sha256: hash, pages: z.array(pageSchema).max(48) }).strict()).min(1).max(8),
  synthesisReviewStatus: z.enum(["complete", "limited"]).nullable(),
  synthesisLimitations: z.array(text).max(100), modelLabel: text.nullable(),
}).strict()
const approvalSchema = z.object({ ownerId: identity, at: z.number().finite().positive(), fingerprint: z.string().min(1).max(1_000_000) }).strict()
const itemSchema = z.object({
  id: identity, trade: text, location: text, description: text, scopeDecision: text,
  disposition: z.enum(["included", "excluded", "unresolved"]), quantity: number.nullable(), unit,
  measurementBasis: text,
  costs: z.object({ unit: z.union([unit, z.literal("hour")]), labor: number.nullable(), materials: number.nullable(), other: number.nullable(), source: text }).strict(),
  source: z.union([
    z.object({ kind: z.literal("contractor"), origin: z.enum(["written_scope", "approved_assumption"]), note: text }).strict(),
    z.object({ kind: z.literal("study"), snapshot: snapshotSchema, freshness: z.enum(["unverified", "current", "changed", "unavailable"]) }).strict(),
  ]),
  quantityConfirmation: approvalSchema.nullable(), costApproval: approvalSchema.nullable(),
}).strict()
const jobSchema = z.object({ id: identity, name: text, clientName: text, address: text }).strict()
const commercialSchema = z.object({
  markupPct: z.number().finite().min(0).max(500), taxEnabled: z.boolean(), taxRate: z.number().finite().min(0).max(25),
  depositEnabled: z.boolean(), depositType: z.enum(["percent", "fixed"]), depositValue: number,
}).strict().refine((value) => value.depositType !== "percent" || value.depositValue <= 100)
const draftSchema = z.object({
  schemaVersion: z.literal(1), id: identity, ownerId: identity, job: jobSchema,
  title: text, items: z.array(itemSchema).max(1000), commercial: commercialSchema, basedOnRevisionId: identity.nullable(),
}).strict()
const finite = z.number().finite()
const calculationSchema = z.object({
  items: z.array(z.object({
    itemId: identity, status: z.enum(["priced", "excluded", "unpriced"]), reasons: z.array(text).max(100),
    labor: finite.nullable(), materials: finite.nullable(), other: finite.nullable(), directCost: finite.nullable(),
  }).strict()).max(1000),
  pricedCount: z.number().int().min(0).max(1000), unresolvedCount: z.number().int().min(0).max(1000), excludedCount: z.number().int().min(0).max(1000), partial: z.boolean(),
  labor: finite, materials: finite, other: finite, directCost: finite, markupAmount: finite, subtotal: finite,
  taxAmount: finite, total: finite, roundingAdjustment: finite, marginPct: finite, depositDue: finite, remaining: finite,
}).strict()

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
function same(a: unknown, b: unknown) { return stable(a) === stable(b) }
function unique(values: string[]) { return new Set(values).size === values.length }
function sameSet(a: string[], b: string[]) { return unique(a) && unique(b) && same([...a].sort(), [...b].sort()) }
function newId() { return globalThis.crypto.randomUUID() }
function cents(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) throw new Error("Draft calculation exceeds the supported numeric range.")
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validSnapshot(snapshot: StudySelectionSnapshot): boolean {
  const { attempt, finding, documents } = snapshot
  if (attempt.studyId !== snapshot.studyId || attempt.ownerId !== snapshot.ownerId || attempt.sourceRevision !== snapshot.sourceRevision) return false
  const indexText = finding.id.startsWith(`${attempt.id}:`) ? finding.id.slice(attempt.id.length + 1) : ""
  if (!/^(0|[1-9]\d*)$/.test(indexText)) return false
  const index = Number(indexText)
  if (index >= 80 || !unique(documents.map((d) => d.id)) || !unique(attempt.sourceVersions.map((v) => v.documentVersionId))) return false
  if (attempt.sourceVersions.length !== documents.length || !documents.every((d) => attempt.sourceVersions.some((v) => v.documentVersionId === d.id && v.sha256 === d.sha256))) return false
  const pages = documents.flatMap((document) => document.pages)
  if (!unique(pages.map((page) => page.id)) || !documents.every((d) => d.pages.every((p) => p.documentVersionId === d.id && p.sourceSha256 === d.sha256))) return false
  if (snapshot.classification === "package" ? attempt.kind !== "synthesis" || attempt.pageId !== undefined : attempt.kind !== "page" || !pages.some((p) => p.id === attempt.pageId)) return false
  if (!finding.citations.every((c) => documents.some((d) => d.id === c.documentVersionId && d.sha256 === c.sourceSha256 && d.pages.some((p) => p.id === c.pageId && p.sourceSha256 === c.sourceSha256 && ["complete", "empty"].includes(p.extraction) && p.rendering === "complete" && (c.anchor.kind !== "image" || Boolean(p.imageArtifactId)))))) return false
  const citedIds = [...new Set(finding.citations.map((c) => c.documentVersionId))]
  return unique(snapshot.decisions.map((d) => d.id)) && snapshot.decisions.every((d) => d.findingId === finding.id && d.sourceRevision === snapshot.sourceRevision && d.status === "active" && sameSet(d.documentVersionIds, citedIds))
}

function sourceAnchorsValid(study: Study, finding: Finding): boolean {
  if (!findingSchema.safeParse(finding).success) return false
  return finding.citations.every((citation) => {
    const document = study.documents.find((d) => d.active && d.id === citation.documentVersionId && d.sha256 === citation.sourceSha256)
    const page = document?.pages.find((p) => p.id === citation.pageId && p.documentVersionId === document.id && p.sourceSha256 === document.sha256)
    if (!page || !["complete", "empty"].includes(page.extraction) || page.rendering !== "complete") return false
    if (citation.anchor.kind === "image") return Boolean(page.imageArtifactId)
    const anchor = citation.anchor
    const blocks = page.blocks.filter((block) => block.id === anchor.blockId)
    return blocks.length === 1 && blocks[0].text.includes(anchor.quote)
  })
}

function canonicalFinding(study: Study, findingId: string): { finding: Finding; classification: "package" | "supporting"; attempt: StudySelectionSnapshot["attempt"] } | null {
  const briefing = buildStudyBriefing(study)
  const groups = [...(briefing.synthesis ? [{ ...briefing.synthesis, classification: "package" as const }] : []), ...briefing.supporting.map((group) => ({ ...group, classification: "supporting" as const }))]
  const matches = groups.flatMap((group) => group.findings.filter((finding) => finding.id === findingId).map((finding) => ({ finding, classification: group.classification, attempt: group.attempt })))
  return matches.length === 1 && sourceAnchorsValid(study, matches[0].finding) ? matches[0] : null
}

export function eligibleStudyDecisions(study: Study, findingId: string): StudyDecision[] {
  try {
    const current = canonicalFinding(study, findingId)
    if (!current) return []
    const citedIds = [...new Set(current.finding.citations.map((c) => c.documentVersionId))]
    return study.decisions.filter((decision) => study.decisions.filter((d) => d.id === decision.id).length === 1 &&
      decision.status === "active" && decision.findingId === findingId && decision.sourceRevision === study.sourceRevision && sameSet(decision.documentVersionIds, citedIds)).map(clone)
  } catch { return [] }
}

export function snapshotStudySelection(study: Study, findingId: string, decisionIds: string[]): StudySelectionSnapshot {
  if (!unique(decisionIds)) throw new Error("Choose each answer only once.")
  const current = canonicalFinding(study, findingId)
  if (!current) throw new Error("Current source provenance could not be established for this finding.")
  const eligible = eligibleStudyDecisions(study, findingId)
  const decisions = decisionIds.map((id) => {
    const decision = eligible.find((entry) => entry.id === id)
    if (!decision) throw new Error("A selected answer no longer belongs to this current finding and source.")
    return decision
  }).sort((a, b) => a.id.localeCompare(b.id))
  const a = current.attempt
  const snapshot: StudySelectionSnapshot = {
    studyId: study.id, ownerId: study.ownerId, studyTitle: study.title, sourceRevision: study.sourceRevision,
    finding: clone(current.finding), decisions,
    attempt: { id: a.id, studyId: a.studyId, ownerId: a.ownerId, sourceRevision: a.sourceRevision, sourceVersions: clone(a.sourceVersions), kind: a.kind, ...(a.pageId ? { pageId: a.pageId } : {}), status: a.status, createdAt: a.createdAt, ...(a.errorCode ? { errorCode: a.errorCode } : {}), ...(a.usage ? { usage: clone(a.usage) } : {}) },
    classification: current.classification,
    documents: study.documents.filter((document) => document.active).map((d) => ({
      id: d.id, name: d.name, sha256: d.sha256,
      pages: d.pages.map((p) => ({ id: p.id, documentVersionId: p.documentVersionId, pageNumber: p.pageNumber, sourceSha256: p.sourceSha256, extraction: p.extraction, rendering: p.rendering, analysis: p.analysis, ...(p.imageArtifactId ? { imageArtifactId: p.imageArtifactId } : {}), ...(p.issue ? { issue: p.issue } : {}) })),
    })),
    synthesisReviewStatus: study.synthesisReviewStatus ?? null, synthesisLimitations: clone(study.synthesisLimitations ?? []), modelLabel: study.modelLabel ?? null,
  }
  const result = snapshotSchema.safeParse(snapshot)
  if (!result.success || !validSnapshot(snapshot)) throw new Error("The selected source metadata is incomplete or inconsistent.")
  return clone(snapshot)
}

export function checkStudyFreshness(snapshot: StudySelectionSnapshot, currentStudy: Study | null): SourceFreshness {
  if (!currentStudy) return "unavailable"
  try {
    if (currentStudy.id !== snapshot.studyId || currentStudy.ownerId !== snapshot.ownerId || currentStudy.sourceRevision !== snapshot.sourceRevision) return "changed"
    const current = snapshotStudySelection(currentStudy, snapshot.finding.id, snapshot.decisions.map((d) => d.id))
    // Unrelated new answers and presentation titles do not invalidate selected evidence.
    const relevant = (value: StudySelectionSnapshot) => ({ sourceRevision: value.sourceRevision, finding: value.finding, decisions: value.decisions, attempt: value.attempt, documents: value.documents, classification: value.classification, synthesisReviewStatus: value.synthesisReviewStatus, synthesisLimitations: value.synthesisLimitations })
    return same(relevant(current), relevant(snapshot)) ? "current" : "changed"
  } catch { return "changed" }
}

function itemFingerprint(item: DraftItem, kind: "quantity" | "cost" = "cost") {
  const { source } = item
  const evidence = source.kind === "study" ? { kind: source.kind, snapshot: source.snapshot } : source
  const fields = { id: item.id, trade: item.trade, location: item.location, description: item.description, scopeDecision: item.scopeDecision, disposition: item.disposition, quantity: item.quantity, unit: item.unit, measurementBasis: item.measurementBasis, source: evidence }
  // Exact canonical contents avoid collision-based acceptance of changed approvals.
  return `v1:${stable(kind === "quantity" ? fields : { ...fields, costs: item.costs })}`
}

export function parseDraft(value: unknown): Draft | null {
  const parsed = draftSchema.safeParse(value)
  if (!parsed.success) return null
  const draft = parsed.data as Draft
  if (!unique(draft.items.map((item) => item.id))) return null
  for (const item of draft.items) {
    if (item.source.kind === "study" && (item.source.snapshot.ownerId !== draft.ownerId || !validSnapshot(item.source.snapshot))) return null
    for (const [kind, stamp] of [["quantity", item.quantityConfirmation], ["cost", item.costApproval]] as const) {
      if (stamp && (stamp.ownerId !== draft.ownerId || stamp.fingerprint !== itemFingerprint(item, kind))) return null
    }
  }
  return clone(draft)
}

export function createDraft(ownerId: string, job: DraftJob, commercial: DraftCommercial, id = newId()): Draft {
  const draft = parseDraft({ schemaVersion: 1, id, ownerId, job, title: "Internal estimate draft", items: [], commercial, basedOnRevisionId: null })
  if (!draft) throw new Error("Choose a valid owner, job and commercial settings for this draft.")
  return draft
}

type ContractorItemInput = Partial<Pick<DraftItem, "trade" | "location" | "description" | "scopeDecision" | "disposition" | "quantity" | "unit" | "measurementBasis">> & { origin?: "written_scope" | "approved_assumption"; note?: string; id?: string }
export function createContractorItem(input: ContractorItemInput = {}): DraftItem {
  return {
    id: input.id ?? newId(), trade: input.trade ?? "painting", location: input.location ?? "", description: input.description ?? "",
    scopeDecision: input.scopeDecision ?? "", disposition: input.disposition ?? "included", quantity: input.quantity ?? null,
    unit: input.unit ?? "sqft", measurementBasis: input.measurementBasis ?? "",
    costs: { unit: input.unit ?? "sqft", labor: null, materials: null, other: null, source: "" },
    source: { kind: "contractor", origin: input.origin ?? "written_scope", note: input.note ?? "" },
    quantityConfirmation: null, costApproval: null,
  }
}

export function createStudyItem(snapshot: StudySelectionSnapshot, location = "", id = newId()): DraftItem {
  if (!snapshotSchema.safeParse(snapshot).success || !validSnapshot(snapshot)) throw new Error("Invalid study selection.")
  return {
    ...createContractorItem({ id, trade: snapshot.finding.trade, location, description: snapshot.finding.detail || snapshot.finding.title, disposition: "unresolved" }),
    source: { kind: "study", snapshot: clone(snapshot), freshness: "current" },
  }
}

function studyItemKey(snapshot: StudySelectionSnapshot, location: string) {
  return stable([snapshot.studyId, snapshot.finding.id, location.trim().toLowerCase()])
}

export function importStudySelection(draft: Draft, snapshot: StudySelectionSnapshot, location: string): Draft {
  if (draft.ownerId !== snapshot.ownerId) throw new Error("This study belongs to another owner.")
  if (draft.items.some((item) => item.source.kind === "study" && studyItemKey(item.source.snapshot, item.location) === studyItemKey(snapshot, location))) throw new Error("This finding is already in the draft at this location; edit that item instead of importing it again.")
  return { ...clone(draft), items: [...clone(draft.items), createStudyItem(snapshot, location)] }
}

/** Explicitly replace one working item's evidence without creating another charge. */
export function replaceStudySelection(draft: Draft, itemId: string, snapshot: StudySelectionSnapshot): Draft {
  if (!snapshotSchema.safeParse(snapshot).success || !validSnapshot(snapshot)) throw new Error("Invalid study selection.")
  if (draft.ownerId !== snapshot.ownerId) throw new Error("This study belongs to another owner.")
  const matches = draft.items.filter((item) => item.id === itemId)
  if (matches.length !== 1) throw new Error("The existing draft item could not be identified uniquely.")
  const item = matches[0]
  if (item.source.kind !== "study" || item.source.snapshot.ownerId !== draft.ownerId ||
    item.source.snapshot.studyId !== snapshot.studyId || item.source.snapshot.finding.id !== snapshot.finding.id) {
    throw new Error("Replacement evidence must belong to this item's exact study and finding.")
  }
  if (same(item.source.snapshot, snapshot)) throw new Error("This item already retains the selected evidence. Check source freshness instead.")
  const replacement = updateDraftItem(item, {
    source: { kind: "study", snapshot: clone(snapshot), freshness: "current" },
    disposition: "unresolved",
  })
  return { ...clone(draft), items: draft.items.map((entry) => entry.id === itemId ? replacement : clone(entry)) }
}

export function updateDraftItem(item: DraftItem, patch: Partial<DraftItem>): DraftItem {
  if (patch.id !== undefined && patch.id !== item.id) throw new Error("An item identity cannot be changed.")
  if (Object.hasOwn(patch, "quantityConfirmation") || Object.hasOwn(patch, "costApproval")) throw new Error("Use the separate confirmation actions.")
  const next = { ...clone(item), ...clone(patch) }
  const parsed = itemSchema.safeParse(next)
  if (!parsed.success) throw new Error("The item contains invalid or unsupported values.")
  const changedSource = next.source.kind === "study" && next.source.freshness === "changed"
  const quantityChanged = itemFingerprint(next, "quantity") !== itemFingerprint(item, "quantity") || changedSource
  const costsChanged = itemFingerprint(next) !== itemFingerprint(item) || changedSource
  return { ...next, quantityConfirmation: quantityChanged ? null : next.quantityConfirmation, costApproval: costsChanged ? null : next.costApproval }
}

function scopeReasons(item: DraftItem): string[] {
  const reasons: string[] = []
  if (item.disposition !== "included") reasons.push("Resolve whether this work is included.")
  if (!item.trade.trim() || !item.location.trim() || !item.description.trim()) reasons.push("Enter a trade, location and work description.")
  if (item.source.kind === "study") {
    if (item.source.freshness !== "current") reasons.push(`Study source is ${item.source.freshness}; verify current evidence before pricing.`)
    if (item.source.snapshot.finding.kind !== "requirement" && !item.scopeDecision.trim()) reasons.push("Record an explicit scope decision for this question, conflict, boundary or assumption.")
  } else if (item.source.origin === "approved_assumption" && !item.scopeDecision.trim()) reasons.push("Record the contractor decision approving this assumption.")
  return reasons
}
function quantityReasons(item: DraftItem) {
  const reasons = scopeReasons(item)
  if (item.quantity === null) reasons.push("Quantity is missing.")
  else if (!Number.isFinite(item.quantity) || item.quantity < 0) reasons.push("Quantity must be a finite nonnegative value.")
  if (!item.measurementBasis.trim()) reasons.push("Enter the quantity's measurement or assumption basis.")
  if (item.unit === "lump_sum" && item.quantity !== 1) reasons.push("An explicit lump sum must use quantity 1.")
  return reasons
}
function costReasons(item: DraftItem) {
  const reasons = scopeReasons(item)
  if (item.costs.unit !== item.unit) reasons.push("The cost unit must match the quantity unit; hourly conversions are unsupported.")
  if ([item.costs.labor, item.costs.materials, item.costs.other].some((value) => value === null)) reasons.push("Enter every direct-cost component, using an intentional zero where appropriate.")
  if ([item.costs.labor, item.costs.materials, item.costs.other].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) reasons.push("Direct costs must be finite nonnegative values.")
  if (item.quantity !== null && [item.costs.labor, item.costs.materials, item.costs.other].some((value) => value !== null && item.quantity! * value > Number.MAX_SAFE_INTEGER / 100)) reasons.push("The item amount exceeds the supported numeric range.")
  if (!item.costs.source.trim()) reasons.push("Record where the approved direct costs came from.")
  return reasons
}
function approval(item: DraftItem, ownerId: string, at: number, kind: "quantity" | "cost"): DraftApproval {
  if (!ownerId.trim() || !Number.isFinite(at) || at <= 0 || item.source.kind === "study" && item.source.snapshot.ownerId !== ownerId) throw new Error("The confirmation must belong to the current owner.")
  return { ownerId, at, fingerprint: itemFingerprint(item, kind) }
}
export function confirmQuantity(item: DraftItem, ownerId: string, at = Date.now()): DraftItem {
  if (!itemSchema.safeParse(item).success || item.source.kind === "study" && !validSnapshot(item.source.snapshot)) throw new Error("The item or its source metadata is invalid.")
  const reasons = quantityReasons(item)
  if (reasons.length) throw new Error(reasons.join(" "))
  return { ...clone(item), quantityConfirmation: approval(item, ownerId, at, "quantity") }
}
export function approveCosts(item: DraftItem, ownerId: string, at = Date.now()): DraftItem {
  if (!itemSchema.safeParse(item).success || item.source.kind === "study" && !validSnapshot(item.source.snapshot)) throw new Error("The item or its source metadata is invalid.")
  const reasons = costReasons(item)
  if (reasons.length) throw new Error(reasons.join(" "))
  return { ...clone(item), costApproval: approval(item, ownerId, at, "cost") }
}

export function calculateDraft(input: Draft): DraftCalculation {
  const draft = parseDraft(input)
  if (!draft) throw new Error("The draft is invalid or its approval identities do not match its inputs.")
  const studyCounts = new Map<string, number>()
  for (const item of draft.items) {
    if (item.source.kind !== "study" || item.disposition === "excluded") continue
    const key = studyItemKey(item.source.snapshot, item.location)
    studyCounts.set(key, (studyCounts.get(key) ?? 0) + 1)
  }
  const items: DraftItemCalculation[] = draft.items.map((item) => {
    const empty = { itemId: item.id, labor: null, materials: null, other: null, directCost: null }
    if (item.disposition === "excluded") return { ...empty, status: "excluded", reasons: [] }
    const reasons = [...new Set([...quantityReasons(item), ...costReasons(item)])]
    if (item.source.kind === "study" && (studyCounts.get(studyItemKey(item.source.snapshot, item.location)) ?? 0) > 1) reasons.push("This finding appears more than once at this location; resolve the duplicate scope before pricing.")
    if (!item.quantityConfirmation) reasons.push("Quantity has not been explicitly confirmed.")
    if (!item.costApproval) reasons.push("Direct costs have not been explicitly approved.")
    if (reasons.length) return { ...empty, status: "unpriced", reasons }
    const quantity = item.quantity!
    const labor = cents(quantity * item.costs.labor!)
    const materials = cents(quantity * item.costs.materials!)
    const other = cents(quantity * item.costs.other!)
    return { itemId: item.id, status: "priced", reasons: [], labor, materials, other, directCost: cents(labor + materials + other) }
  })
  const labor = cents(items.reduce((sum, item) => sum + (item.labor ?? 0), 0))
  const materials = cents(items.reduce((sum, item) => sum + (item.materials ?? 0), 0))
  const other = cents(items.reduce((sum, item) => sum + (item.other ?? 0), 0))
  const directCost = cents(labor + materials + other)
  const beforeTax = directCost * (1 + draft.commercial.markupPct / 100)
  const rawTax = draft.commercial.taxEnabled ? beforeTax * draft.commercial.taxRate / 100 : 0
  const subtotal = cents(beforeTax)
  const taxAmount = cents(rawTax)
  const total = Math.round(beforeTax + rawTax)
  cents(total)
  const deposit = computeDepositFromEstimateTotal(total, { enabled: draft.commercial.depositEnabled, type: draft.commercial.depositType, value: draft.commercial.depositValue })
  const pricedCount = items.filter((item) => item.status === "priced").length
  const unresolvedCount = items.filter((item) => item.status === "unpriced").length
  return {
    items, pricedCount, unresolvedCount, excludedCount: items.filter((item) => item.status === "excluded").length,
    partial: unresolvedCount > 0 || pricedCount === 0,
    labor, materials, other, directCost, markupAmount: cents(subtotal - directCost), subtotal, taxAmount, total,
    roundingAdjustment: cents(total - subtotal - taxAmount), marginPct: currentProfitMarginPct({ labor, materials, subs: other, markup: draft.commercial.markupPct }),
    depositDue: deposit.depositDue, remaining: deposit.remaining,
  }
}

export function parseDraftRevision(value: unknown): DraftRevision | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = value as Record<string, unknown>
    if (Object.keys(raw).sort().join() !== ["schemaVersion", "id", "draftId", "parentRevisionId", "ownerId", "jobId", "savedAt", "draft", "calculation"].sort().join()) return null
    if (raw.schemaVersion !== 1 || !identity.safeParse(raw.id).success || !identity.nullable().safeParse(raw.parentRevisionId).success || typeof raw.savedAt !== "number" || !Number.isFinite(raw.savedAt) || raw.savedAt <= 0) return null
    const draft = parseDraft(raw.draft)
    if (!draft || raw.draftId !== draft.id || raw.ownerId !== draft.ownerId || raw.jobId !== draft.job.id || raw.parentRevisionId !== draft.basedOnRevisionId || raw.id === raw.parentRevisionId) return null
    const calculation = calculationSchema.safeParse(raw.calculation)
    if (!calculation.success || !same(calculation.data, calculateDraft(draft))) return null
    return clone(value as DraftRevision)
  } catch { return null }
}

export function workingCopy(revision: DraftRevision): Draft {
  const valid = parseDraftRevision(revision)
  if (!valid) throw new Error("The saved draft revision is invalid.")
  return { ...valid.draft, basedOnRevisionId: valid.id, items: valid.draft.items.map((item) => item.source.kind === "study" ? { ...item, source: { ...item.source, freshness: "unverified" } } : item) }
}
