import type {
  EstimateEmbeddedBurden,
  EstimateRow,
  EstimateStructuredSection,
} from "./types"

type EstimateSectionUnit = NonNullable<EstimateStructuredSection["unit"]>

const ALLOWED_UNITS = new Set([
  "sqft",
  "linear_ft",
  "rooms",
  "doors",
  "fixtures",
  "devices",
  "days",
  "lump_sum",
])

function toFiniteNumber(value: unknown): number {
  const next = Number(value ?? 0)
  return Number.isFinite(next) ? next : 0
}

function normalizeEstimateNotes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((note) => String(note).trim()).filter(Boolean)
    : []
}

function normalizeEstimateUnit(value: unknown): EstimateSectionUnit | undefined {
  return typeof value === "string" && ALLOWED_UNITS.has(value)
    ? (value as EstimateSectionUnit)
    : undefined
}

function normalizeEstimateQuantity(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function normalizeEstimateSections(
  value: unknown
): EstimateStructuredSection[] | null {
  if (!Array.isArray(value)) return null

  const normalized = value
    .map((entry): EstimateStructuredSection | null => {
      if (!entry || typeof entry !== "object") return null

      const raw = entry as Record<string, unknown>
      const section = String(raw.section ?? "").trim()
      const label = String(raw.label ?? section).trim()
      if (!section || !label) return null

      const pricingBasis = raw.pricingBasis === "burden" ? "burden" : "direct"
      const estimatorTreatment =
        raw.estimatorTreatment === "embedded_burden"
          ? "embedded_burden"
          : "section_row"

      const notes = normalizeEstimateNotes(raw.notes)
      const unit = normalizeEstimateUnit(raw.unit)
      const quantity = normalizeEstimateQuantity(raw.quantity)

      return {
        trade: String(raw.trade ?? "").trim(),
        section,
        label,
        pricingBasis,
        estimatorTreatment,
        amount: toFiniteNumber(raw.amount),
        labor: toFiniteNumber(raw.labor),
        materials: toFiniteNumber(raw.materials),
        subs: toFiniteNumber(raw.subs),
        unit,
        quantity,
        notes,
      }
    })
    .filter((entry): entry is EstimateStructuredSection => Boolean(entry))

  return normalized.length > 0 ? normalized : null
}

export function getEstimateSectionTreatmentLabel(
  section: EstimateStructuredSection
): string {
  return section.estimatorTreatment === "embedded_burden"
    ? "Embedded burden"
    : "Structured section"
}

export function normalizeEstimateRows(value: unknown): EstimateRow[] | null {
  if (Array.isArray(value)) {
    const rows = value
      .map((entry): EstimateRow | null => {
        if (!entry || typeof entry !== "object") return null

        const raw = entry as Record<string, unknown>
        const section = String(raw.section ?? "").trim()
        const label = String(raw.label ?? section).trim()
        if (!section || !label) return null
        if (raw.pricingBasis !== "direct") return null
        if (raw.estimatorTreatment !== "section_row") return null

        return {
          trade: String(raw.trade ?? "").trim(),
          section,
          label,
          amount: toFiniteNumber(raw.amount),
          labor: toFiniteNumber(raw.labor),
          materials: toFiniteNumber(raw.materials),
          subs: toFiniteNumber(raw.subs),
          unit: normalizeEstimateUnit(raw.unit),
          quantity: normalizeEstimateQuantity(raw.quantity),
          notes: normalizeEstimateNotes(raw.notes),
          pricingBasis: "direct",
          estimatorTreatment: "section_row",
          rowSource: "estimate_sections",
        }
      })
      .filter((entry): entry is EstimateRow => Boolean(entry))

    if (rows.length) return rows
  }

  const sections = normalizeEstimateSections(value)
  if (!sections?.length) return null

  const rows = sections
    .filter(
      (section) =>
        section.pricingBasis === "direct" &&
        section.estimatorTreatment === "section_row"
    )
    .map((section) => ({
      trade: section.trade,
      section: section.section,
      label: section.label,
      amount: section.amount,
      labor: section.labor,
      materials: section.materials,
      subs: section.subs,
      unit: section.unit,
      quantity: section.quantity,
      notes: [...section.notes],
      pricingBasis: "direct" as const,
      estimatorTreatment: "section_row" as const,
      rowSource: "estimate_sections" as const,
    }))

  return rows.length ? rows : null
}

export function normalizeEstimateEmbeddedBurdens(
  value: unknown
): EstimateEmbeddedBurden[] | null {
  if (Array.isArray(value)) {
    const burdens = value
      .map((entry): EstimateEmbeddedBurden | null => {
        if (!entry || typeof entry !== "object") return null

        const raw = entry as Record<string, unknown>
        const section = String(raw.section ?? "").trim()
        const label = String(raw.label ?? section).trim()
        if (!section || !label) return null
        if (raw.pricingBasis !== "burden") return null
        if (raw.estimatorTreatment !== "embedded_burden") return null

        return {
          trade: String(raw.trade ?? "").trim(),
          section,
          label,
          amount: toFiniteNumber(raw.amount),
          labor: toFiniteNumber(raw.labor),
          materials: toFiniteNumber(raw.materials),
          subs: toFiniteNumber(raw.subs),
          unit: normalizeEstimateUnit(raw.unit),
          quantity: normalizeEstimateQuantity(raw.quantity),
          notes: normalizeEstimateNotes(raw.notes),
          pricingBasis: "burden",
          estimatorTreatment: "embedded_burden",
          rowSource: "estimate_sections",
        }
      })
      .filter((entry): entry is EstimateEmbeddedBurden => Boolean(entry))

    if (burdens.length) return burdens
  }

  const sections = normalizeEstimateSections(value)
  if (!sections?.length) return null

  const burdens = sections
    .filter(
      (section) =>
        section.pricingBasis === "burden" &&
        section.estimatorTreatment === "embedded_burden"
    )
    .map((section) => ({
      trade: section.trade,
      section: section.section,
      label: section.label,
      amount: section.amount,
      labor: section.labor,
      materials: section.materials,
      subs: section.subs,
      unit: section.unit,
      quantity: section.quantity,
      notes: [...section.notes],
      pricingBasis: "burden" as const,
      estimatorTreatment: "embedded_burden" as const,
      rowSource: "estimate_sections" as const,
    }))

  return burdens.length ? burdens : null
}
