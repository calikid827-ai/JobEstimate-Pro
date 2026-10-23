import type { DocumentType, EstimateHistoryItem, PricingSource, Schedule, UiTrade } from "./types"

// Internal comparison metadata only. The baseline is an isolated snapshot rather
// than a history lookup, so retaining or reordering history cannot change it.
export type EstimateRevisionRelationship = {
  version: 1
  ownerId: string
  jobId: string
  previousEstimateId: string
  baseline: EstimateHistoryItem
}

type RevisionContext = {
  ownerId: string | null | undefined
  jobId: string | null | undefined
  documentType: DocumentType | string
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const PRICING_FIELDS = ["labor", "materials", "subs", "markup", "total"] as const
export type RevisionComparisonPricing = Record<typeof PRICING_FIELDS[number], number | null>
export type RevisionComparisonTax = { enabled: boolean | null; rate: number | null }

export function normalizeComparisonPricingSource(source: unknown, recorded?: unknown): PricingSource | null {
  const value = recorded === undefined ? source : recorded
  return value === "ai" || value === "deterministic" || value === "merged" ? value : null
}

export function normalizeComparisonTax(tax: unknown, recorded?: unknown): RevisionComparisonTax {
  const source = record(recorded === undefined ? tax : recorded)
  return {
    enabled: typeof source?.enabled === "boolean" ? source.enabled : null,
    rate: finite(source?.rate) ?? null,
  }
}

export function reconcileComparisonTax(
  previous: EstimateHistoryItem,
  nextTax: unknown,
  previousDisplayTax: unknown
): RevisionComparisonTax {
  const known = normalizeComparisonTax(previous.tax, previous.comparisonTax)
  const next = normalizeComparisonTax(nextTax)
  const display = normalizeComparisonTax(previousDisplayTax)
  const enabledChanged = next.enabled !== display.enabled
  return {
    enabled: enabledChanged ? next.enabled : known.enabled,
    // Explicitly enabling tax confirms the current selected rate. Merely loading
    // an unknown setting into display defaults does not establish that rate.
    rate: next.rate !== display.rate || (enabledChanged && next.enabled === true)
      ? next.rate : known.rate,
  }
}

export function normalizeComparisonPricing(pricing: unknown, recorded?: unknown): RevisionComparisonPricing {
  // A recorded null means unknown even if legacy display normalization supplied
  // a zero. Never recover supposed facts from that display fallback.
  const source = record(recorded) ?? record(pricing)
  return Object.fromEntries(PRICING_FIELDS.map((field) => [field, finite(source?.[field]) ?? null])) as RevisionComparisonPricing
}

export function reconcileComparisonPricing(
  previous: EstimateHistoryItem,
  nextPricing: EstimateHistoryItem["pricing"]
): RevisionComparisonPricing {
  const known = normalizeComparisonPricing(previous.pricing, record(previous)?.comparisonPricing)
  const next = Object.fromEntries(PRICING_FIELDS.map((field) => [field,
    nextPricing[field] === previous.pricing[field] ? known[field] : finite(nextPricing[field]) ?? null,
  ])) as RevisionComparisonPricing
  // The UI recomputes totals using its existing display defaults. An automatic
  // total change cannot turn missing component inputs into a confirmed quote.
  const tax = normalizeComparisonTax(previous.tax, previous.comparisonTax)
  const taxUnknown = tax.enabled !== false && (tax.enabled !== true || tax.rate === null)
  if (nextPricing.total !== previous.pricing.total &&
      ([next.labor, next.materials, next.subs, next.markup].some((value) => value === null) || taxUnknown)) {
    next.total = null
  }
  return next
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function snapshotEstimate(value: unknown, jobId: string): EstimateHistoryItem | null {
  const source = record(value)
  const details = record(source?.jobDetails)
  if (!source || source.revisionEligible === false || !text(source.id).trim() || source.jobId !== jobId ||
      source.documentType !== "Estimate" || !details || text(details.changeOrderNo).trim() ||
      finite(source.createdAt) === undefined) return null

  const pricing = record(source.pricing)
  const schedule = record(source.schedule)
  const calendar = record(schedule?.calendarDays)
  const tax = record(source.tax)
  const deposit = record(source.deposit)
  const explanation = record(source.explanation)
  const strings = (input: unknown) => Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === "string")
    : undefined
  const knownPricingSources = new Set(["ai", "deterministic", "merged"])

  // Copy an allowlist: approval identities, customer sharing data, and previous
  // revision relationships must never become part of this internal baseline.
  const snapshot: EstimateHistoryItem & { comparisonPricing: RevisionComparisonPricing } = {
    id: text(source.id),
    createdAt: source.createdAt as number,
    jobId,
    documentType: "Estimate",
    revisionEligible: true,
    jobDetails: {
      clientName: text(details.clientName),
      jobName: text(details.jobName),
      changeOrderNo: text(details.changeOrderNo),
      jobAddress: text(details.jobAddress),
      date: text(details.date),
    },
    trade: text(source.trade) as UiTrade,
    state: text(source.state),
    scopeChange: text(source.scopeChange),
    result: text(source.result),
    // Missing or invalid costs remain missing. They are not confirmed zeroes.
    pricing: {
      labor: finite(pricing?.labor),
      materials: finite(pricing?.materials),
      subs: finite(pricing?.subs),
      markup: finite(pricing?.markup),
      total: finite(pricing?.total),
    } as EstimateHistoryItem["pricing"],
    comparisonPricing: normalizeComparisonPricing(pricing, source.comparisonPricing),
    comparisonTax: normalizeComparisonTax(tax, source.comparisonTax),
    comparisonPricingSource: normalizeComparisonPricingSource(source.pricingSource, source.comparisonPricingSource),
    pricingSource: knownPricingSources.has(text(source.pricingSource))
      ? source.pricingSource as PricingSource : undefined,
    priceGuardVerified: typeof source.priceGuardVerified === "boolean" ? source.priceGuardVerified : undefined,
    schedule: schedule ? {
      crewDays: finite(schedule.crewDays) ?? null,
      visits: finite(schedule.visits) ?? null,
      calendarDays: calendar && finite(calendar.min) !== undefined && finite(calendar.max) !== undefined
        ? { min: calendar.min as number, max: calendar.max as number } : null,
      workDaysPerWeek: finite(schedule.workDaysPerWeek) ?? null,
      rationale: strings(schedule.rationale) ?? [],
      startDate: typeof schedule.startDate === "string" ? schedule.startDate : null,
    } satisfies Schedule : undefined,
    tax: tax && typeof tax.enabled === "boolean" ? {
      enabled: tax.enabled,
      rate: finite(tax.rate),
    } as EstimateHistoryItem["tax"] : undefined,
    deposit: deposit && typeof deposit.enabled === "boolean" &&
      (deposit.type === "percent" || deposit.type === "fixed") ? {
        enabled: deposit.enabled,
        type: deposit.type,
        value: finite(deposit.value),
      } as EstimateHistoryItem["deposit"] : undefined,
    explanation: explanation ? {
      priceReasons: strings(explanation.priceReasons),
      scheduleReasons: strings(explanation.scheduleReasons),
      photoReasons: strings(explanation.photoReasons),
      protectionReasons: strings(explanation.protectionReasons),
    } : undefined,
  }
  return deepFreeze(snapshot)
}

function validContext(input: RevisionContext): input is RevisionContext & { ownerId: string; jobId: string } {
  return typeof input.ownerId === "string" && Boolean(input.ownerId.trim()) &&
    typeof input.jobId === "string" && Boolean(input.jobId.trim()) && input.documentType === "Estimate"
}

export function captureEstimateRevision(input: RevisionContext & {
  previous: EstimateHistoryItem | null | undefined
}): EstimateRevisionRelationship | null {
  if (!validContext(input)) return null
  const baseline = snapshotEstimate(input.previous, input.jobId)
  if (!baseline) return null
  return deepFreeze({
    version: 1,
    ownerId: input.ownerId,
    jobId: input.jobId,
    previousEstimateId: baseline.id,
    baseline,
  })
}

export function normalizeEstimateRevisionRelationship(input: RevisionContext & {
  relationship: unknown
}): EstimateRevisionRelationship | null {
  if (!validContext(input)) return null
  const relationship = record(input.relationship)
  if (!relationship || relationship.version !== 1 ||
      relationship.ownerId !== input.ownerId || relationship.jobId !== input.jobId) return null
  const baseline = snapshotEstimate(relationship.baseline, input.jobId)
  if (!baseline || relationship.previousEstimateId !== baseline.id) return null
  return deepFreeze({
    version: 1,
    ownerId: input.ownerId,
    jobId: input.jobId,
    previousEstimateId: baseline.id,
    baseline,
  })
}

export function resolveEstimateRevisionBaseline(input: RevisionContext & {
  relationship: unknown
}): EstimateHistoryItem | null {
  return normalizeEstimateRevisionRelationship(input)?.baseline ?? null
}
