import type {
  EstimateHistoryItem,
  Invoice,
  InvoiceStatus,
  JobActuals,
  UiTrade,
} from "./types"

export function normalizeTrade(t: any): UiTrade {
  if (t === "general renovation") return "general_renovation"

  const allowed: UiTrade[] = [
    "",
    "painting",
    "drywall",
    "flooring",
    "electrical",
    "plumbing",
    "bathroom_tile",
    "carpentry",
    "general_renovation",
  ]

  return allowed.includes(t) ? (t as UiTrade) : ""
}

export function money(n: number) {
  return `$${Number(n || 0).toLocaleString()}`
}

export function isPastDue(dueISO: string) {
  const due = new Date(dueISO + "T23:59:59")
  return Date.now() > due.getTime()
}

export function normalizeInvoiceStatus(inv: any): InvoiceStatus {
  const s = String(inv?.status || "").toLowerCase()
  const allowed: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"]

  if (allowed.includes(s as InvoiceStatus)) return s as InvoiceStatus

  if (typeof inv?.paidAt === "number") return "paid"
  if (typeof inv?.dueDate === "string" && isPastDue(inv.dueDate)) return "overdue"
  return "draft"
}

export function computeLiveInvoiceStatus(inv: Invoice): InvoiceStatus {
  if (typeof inv.paidAt === "number") return "paid"
  if (inv.status === "draft") return "draft"
  if (isPastDue(inv.dueDate)) return "overdue"
  return "sent"
}

export function computeDepositFromEstimateTotal(
  estTotal: number,
  dep?: { enabled: boolean; type: "percent" | "fixed"; value: number }
) {
  if (!dep?.enabled || estTotal <= 0) {
    return { depositDue: 0, remaining: estTotal }
  }

  if (dep.type === "percent") {
    const pct = Math.max(0, Math.min(100, Number(dep.value || 0)))
    const depositDue = Math.round(estTotal * (pct / 100))
    return { depositDue, remaining: Math.max(0, estTotal - depositDue) }
  }

  const fixed = Math.max(0, Number(dep.value || 0))
  const depositDue = Math.min(estTotal, Math.round(fixed))
  return { depositDue, remaining: Math.max(0, estTotal - depositDue) }
}

export function computeTaxAmountFromEstimate(est: EstimateHistoryItem) {
  const labor = Number(est?.pricing?.labor || 0)
  const materials = Number(est?.pricing?.materials || 0)
  const subs = Number(est?.pricing?.subs || 0)
  const markupPct = Number(est?.pricing?.markup || 0)

  const base = labor + materials + subs
  const markedUp = base * (1 + markupPct / 100)

  const taxEnabledSnap = Boolean(est.tax?.enabled)
  const taxRateSnap = Number(est.tax?.rate || 0)
  const taxAmt = taxEnabledSnap ? Math.round(markedUp * (taxRateSnap / 100)) : 0

  const estimateTotal = Math.round(markedUp + taxAmt)

  return { taxAmt, estimateTotal, markedUp }
}

export function estimateTotalWithTax(est: EstimateHistoryItem | null) {
  if (!est) return 0

  const labor = Number(est.pricing?.labor || 0)
  const materials = Number(est.pricing?.materials || 0)
  const subs = Number(est.pricing?.subs || 0)
  const markup = Number(est.pricing?.markup || 0)

  const base = labor + materials + subs
  const markedUp = base * (1 + markup / 100)

  const taxEnabled = Boolean(est.tax?.enabled)
  const taxRate = Number(est.tax?.rate || 0)
  const taxAmt = taxEnabled ? markedUp * (taxRate / 100) : 0

  return Math.round(markedUp + taxAmt)
}

export function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function completionEndFromSchedule(
  s?: EstimateHistoryItem["schedule"] | null,
  fallbackCreatedAt?: number
) {
  const start = s?.startDate
    ? new Date(s.startDate + "T00:00:00")
    : fallbackCreatedAt
    ? new Date(fallbackCreatedAt)
    : null

  if (!start) return null

  const maxDays =
    Number(s?.calendarDays?.max ?? s?.calendarDays?.min ?? 0) > 0
      ? Number(s?.calendarDays?.max ?? s?.calendarDays?.min ?? 0)
      : Number(s?.crewDays ?? 0) > 0
      ? Number(s?.crewDays)
      : 0

  if (!Number.isFinite(maxDays) || maxDays <= 0) return null

  const end = new Date(start)
  end.setDate(start.getDate() + Math.max(maxDays - 1, 0))

  return end
}

export function daysBetween(a: Date | null, b: Date | null) {
  if (!a || !b) return null

  const aMid = new Date(a)
  const bMid = new Date(b)
  aMid.setHours(0, 0, 0, 0)
  bMid.setHours(0, 0, 0, 0)

  const ms = bMid.getTime() - aMid.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function formatDelta(n: number) {
  if (n > 0) return `+$${n.toLocaleString()}`
  if (n < 0) return `-$${Math.abs(n).toLocaleString()}`
  return "$0"
}

export function formatSignedNumber(n: number) {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return "0"
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseNetDays(termsRaw: string): number | null {
  const t = (termsRaw || "").toLowerCase().trim()

  if (
    t.includes("due upon receipt") ||
    t.includes("due on receipt") ||
    t.includes("due upon approval") ||
    t.includes("due on approval") ||
    t === "due immediately" ||
    t === "due now"
  ) {
    return 0
  }

  const m = t.match(/\bnet\s*(\d{1,3})\b/i)
  if (m?.[1]) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 0 && n <= 365) return n
  }

  const m2 = t.match(/\b(?:due|payable)\s+in\s+(\d{1,3})\s+days?\b/i)
  if (m2?.[1]) {
    const n = Number(m2[1])
    if (Number.isFinite(n) && n >= 0 && n <= 365) return n
  }

  return null
}

export function computeDueDateISO(issueDate: Date, termsRaw: string): string {
  const netDays = parseNetDays(termsRaw)
  const daysToAdd = netDays == null ? 7 : netDays

  const due = new Date(issueDate)
  due.setDate(due.getDate() + daysToAdd)

  return toISODate(due)
}

export function buildActualsPatch(base: JobActuals | null | undefined, patch: Partial<JobActuals>): JobActuals {
  const start: JobActuals = base ?? {
    jobId: String(patch.jobId || ""),
    updatedAt: Date.now(),
    labor: 0,
    materials: 0,
    subs: 0,
    notes: "",
  }

  return {
    ...start,
    ...patch,
    updatedAt: Date.now(),
    labor: Number(patch.labor ?? start.labor ?? 0),
    materials: Number(patch.materials ?? start.materials ?? 0),
    subs: Number(patch.subs ?? start.subs ?? 0),
    notes: String(patch.notes ?? start.notes ?? ""),
  }
}