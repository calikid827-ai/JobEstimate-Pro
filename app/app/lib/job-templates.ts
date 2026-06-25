import { JOB_TEMPLATES_KEY } from "./constants"
import type { DocumentType, PaintScope, UiTrade } from "./types"

export { JOB_TEMPLATES_KEY }

export const MAX_JOB_TEMPLATES = 30

const DOCUMENT_TYPES = new Set<DocumentType>([
  "Estimate",
  "Change Order",
  "Change Order / Estimate",
])

const UI_TRADES = new Set<UiTrade>([
  "",
  "painting",
  "drywall",
  "flooring",
  "electrical",
  "plumbing",
  "bathroom_tile",
  "carpentry",
  "general_renovation",
])

const PAINT_SCOPES = new Set<PaintScope>(["walls", "walls_ceilings", "full"])

export type JobTemplate = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  trade: UiTrade
  documentType: DocumentType
  state: string
  scopeChange: string
  paintScope: PaintScope | null
  notes?: string
}

export type JobTemplateSetupInput = {
  id?: string
  name?: string
  createdAt?: number
  updatedAt?: number
  trade: UiTrade
  documentType: DocumentType
  state: string
  scopeChange: string
  paintScope?: PaintScope | null
  notes?: string
}

export type JobTemplateApplyPayload = Pick<
  JobTemplate,
  "documentType" | "trade" | "state" | "scopeChange" | "paintScope"
>

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength)
}

function normalizeTimestamp(value: unknown, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function normalizeDocumentType(value: unknown): DocumentType {
  return DOCUMENT_TYPES.has(value as DocumentType) ? (value as DocumentType) : "Estimate"
}

function normalizeUiTrade(value: unknown): UiTrade {
  return UI_TRADES.has(value as UiTrade) ? (value as UiTrade) : ""
}

function normalizePaintScope(value: unknown): PaintScope | null {
  return PAINT_SCOPES.has(value as PaintScope) ? (value as PaintScope) : null
}

function makeTemplateId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `template_${Date.now()}_${Math.random().toString(16).slice(2)}`
  )
}

export function suggestJobTemplateName(input: {
  trade?: UiTrade
  scopeChange?: string
}) {
  const scope = normalizeText(input.scopeChange, 80)
  if (scope) {
    const firstLine = scope.split(/\r?\n/)[0]?.trim()
    if (firstLine) return firstLine.slice(0, 80)
  }

  switch (input.trade) {
    case "painting":
      return "Painting template"
    case "drywall":
      return "Drywall template"
    case "flooring":
      return "Flooring template"
    case "electrical":
      return "Electrical template"
    case "plumbing":
      return "Plumbing template"
    case "bathroom_tile":
      return "Bathroom tile template"
    case "carpentry":
      return "Carpentry template"
    case "general_renovation":
      return "Renovation template"
    default:
      return "Job template"
  }
}

export function createJobTemplate(
  input: JobTemplateSetupInput,
  now = Date.now()
): JobTemplate | null {
  const scopeChange = normalizeText(input.scopeChange, 10000)
  if (!scopeChange) return null

  const name =
    normalizeText(input.name, 80) ||
    suggestJobTemplateName({
      trade: input.trade,
      scopeChange,
    })

  const notes = normalizeText(input.notes, 500)
  const createdAt = normalizeTimestamp(input.createdAt, now)

  return {
    id: normalizeText(input.id, 120) || makeTemplateId(),
    name,
    createdAt,
    updatedAt: normalizeTimestamp(input.updatedAt, now),
    trade: normalizeUiTrade(input.trade),
    documentType: normalizeDocumentType(input.documentType),
    state: normalizeText(input.state, 2).toUpperCase(),
    scopeChange,
    paintScope: normalizePaintScope(input.paintScope),
    ...(notes ? { notes } : {}),
  }
}

export function normalizeJobTemplateRecord(value: unknown): JobTemplate | null {
  if (!value || typeof value !== "object") return null

  const source = value as Record<string, unknown>
  return createJobTemplate({
    id: normalizeText(source.id, 120),
    name: normalizeText(source.name, 80),
    createdAt: Number(source.createdAt),
    updatedAt: Number(source.updatedAt),
    trade: normalizeUiTrade(source.trade),
    documentType: normalizeDocumentType(source.documentType),
    state: normalizeText(source.state, 2),
    scopeChange: normalizeText(source.scopeChange, 10000),
    paintScope: normalizePaintScope(source.paintScope),
    notes: normalizeText(source.notes, 500),
  })
}

export function normalizeJobTemplates(value: unknown): JobTemplate[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const templates: JobTemplate[] = []

  for (const item of value) {
    const normalized = normalizeJobTemplateRecord(item)
    if (!normalized || seen.has(normalized.id)) continue
    seen.add(normalized.id)
    templates.push(normalized)
  }

  return templates
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_JOB_TEMPLATES)
}

export function upsertJobTemplate(
  templates: JobTemplate[],
  template: JobTemplate
): JobTemplate[] {
  const existing = templates.find((item) => item.id === template.id)
  const nextTemplate = existing
    ? {
        ...template,
        createdAt: existing.createdAt,
        updatedAt: Math.max(template.updatedAt, existing.updatedAt),
      }
    : template

  return normalizeJobTemplates([
    nextTemplate,
    ...templates.filter((item) => item.id !== template.id),
  ])
}

export function deleteJobTemplate(templates: JobTemplate[], id: string) {
  return templates.filter((template) => template.id !== id)
}

export function getJobTemplateApplyPayload(
  template: JobTemplate
): JobTemplateApplyPayload {
  return {
    documentType: template.documentType,
    trade: template.trade,
    state: template.state,
    scopeChange: template.scopeChange,
    paintScope: template.paintScope,
  }
}
