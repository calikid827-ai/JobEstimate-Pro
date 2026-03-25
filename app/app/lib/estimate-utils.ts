import type {
  EstimateHistoryItem,
  ExplainChangesReport,
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

export function explainEstimateChanges(
  original: EstimateHistoryItem | null,
  current: EstimateHistoryItem | null
): ExplainChangesReport | null {
  if (!original || !current) return null
  if (original.id === current.id) return null

  const summary: string[] = []
  const scopeChanges: string[] = []
  const pricingChanges: string[] = []
  const scheduleChanges: string[] = []
  const adminChanges: string[] = []

  // -------------------------
  // Scope text comparison
  // -------------------------
  const originalScope = (original.scopeChange || "").trim()
  const currentScope = (current.scopeChange || "").trim()

  if (currentScope && currentScope !== originalScope) {
    scopeChanges.push("Scope description was updated from the original estimate.")

    if (currentScope.length > originalScope.length) {
      scopeChanges.push("The current scope appears to include added work or more detail.")
    } else if (currentScope.length < originalScope.length) {
      scopeChanges.push("The current scope appears shorter or more consolidated than the original.")
    }
  }

  // -------------------------
  // Pricing comparison
  // -------------------------
  const originalLabor = Number(original.pricing?.labor || 0)
  const currentLabor = Number(current.pricing?.labor || 0)

  const originalMaterials = Number(original.pricing?.materials || 0)
  const currentMaterials = Number(current.pricing?.materials || 0)

  const originalSubs = Number(original.pricing?.subs || 0)
  const currentSubs = Number(current.pricing?.subs || 0)

  const originalMarkup = Number(original.pricing?.markup || 0)
  const currentMarkup = Number(current.pricing?.markup || 0)

  const originalTotal = Number(original.pricing?.total || 0)
  const currentTotal = Number(current.pricing?.total || 0)

  const totalDelta = currentTotal - originalTotal

  if (totalDelta !== 0) {
    pricingChanges.push(
      totalDelta > 0
        ? `Total price increased by $${Math.abs(totalDelta).toLocaleString()}.`
        : `Total price decreased by $${Math.abs(totalDelta).toLocaleString()}.`
    )
  }

  if (currentLabor !== originalLabor) {
    pricingChanges.push(
      `Labor changed from $${originalLabor.toLocaleString()} to $${currentLabor.toLocaleString()}.`
    )
  }

  if (currentMaterials !== originalMaterials) {
    pricingChanges.push(
      `Materials changed from $${originalMaterials.toLocaleString()} to $${currentMaterials.toLocaleString()}.`
    )
  }

  if (currentSubs !== originalSubs) {
    pricingChanges.push(
      `Other / mobilization changed from $${originalSubs.toLocaleString()} to $${currentSubs.toLocaleString()}.`
    )
  }

  if (currentMarkup !== originalMarkup) {
    pricingChanges.push(
      `Markup changed from ${originalMarkup}% to ${currentMarkup}%.`
    )
  }

  // -------------------------
  // Schedule comparison
  // -------------------------
  const originalCrewDays = Number(original.schedule?.crewDays || 0)
  const currentCrewDays = Number(current.schedule?.crewDays || 0)

  const originalVisits = Number(original.schedule?.visits || 0)
  const currentVisits = Number(current.schedule?.visits || 0)

  const originalMin = Number(original.schedule?.calendarDays?.min || 0)
  const currentMin = Number(current.schedule?.calendarDays?.min || 0)

  const originalMax = Number(original.schedule?.calendarDays?.max || 0)
  const currentMax = Number(current.schedule?.calendarDays?.max || 0)

  if (currentCrewDays !== originalCrewDays) {
    scheduleChanges.push(
      `Crew days changed from ${originalCrewDays} to ${currentCrewDays}.`
    )
  }

  if (currentVisits !== originalVisits) {
    scheduleChanges.push(
      `Site visits changed from ${originalVisits} to ${currentVisits}.`
    )
  }

  if (currentMin !== originalMin || currentMax !== originalMax) {
    scheduleChanges.push(
      `Calendar duration changed from ${originalMin}–${originalMax} days to ${currentMin}–${currentMax} days.`
    )
  }

  if (current.schedule?.startDate && original.schedule?.startDate) {
    if (current.schedule.startDate !== original.schedule.startDate) {
      scheduleChanges.push(
        `Start date changed from ${original.schedule.startDate} to ${current.schedule.startDate}.`
      )
    }
  }

  // -------------------------
  // Tax / deposit / admin
  // -------------------------
  const originalTaxEnabled = Boolean(original.tax?.enabled)
  const currentTaxEnabled = Boolean(current.tax?.enabled)
  const originalTaxRate = Number(original.tax?.rate || 0)
  const currentTaxRate = Number(current.tax?.rate || 0)

  if (originalTaxEnabled !== currentTaxEnabled) {
    adminChanges.push(
      currentTaxEnabled ? "Sales tax was added." : "Sales tax was removed."
    )
  } else if (currentTaxEnabled && originalTaxRate !== currentTaxRate) {
    adminChanges.push(
      `Sales tax rate changed from ${originalTaxRate}% to ${currentTaxRate}%.`
    )
  }

  const originalDepositEnabled = Boolean(original.deposit?.enabled)
  const currentDepositEnabled = Boolean(current.deposit?.enabled)

  const originalDepositType = original.deposit?.type || "percent"
  const currentDepositType = current.deposit?.type || "percent"

  const originalDepositValue = Number(original.deposit?.value || 0)
  const currentDepositValue = Number(current.deposit?.value || 0)

  if (originalDepositEnabled !== currentDepositEnabled) {
    adminChanges.push(
      currentDepositEnabled ? "Deposit requirement was added." : "Deposit requirement was removed."
    )
  } else if (currentDepositEnabled) {
    if (
      originalDepositType !== currentDepositType ||
      originalDepositValue !== currentDepositValue
    ) {
      adminChanges.push(
        `Deposit changed from ${originalDepositValue}${originalDepositType === "percent" ? "%" : "$"} to ${currentDepositValue}${currentDepositType === "percent" ? "%" : "$"}.`
      )
    }
  }

  // -------------------------
  // Summary lines
  // -------------------------
  if (scopeChanges.length > 0) {
    summary.push("Scope wording was revised from the original estimate.")
  }

  if (pricingChanges.length > 0) {
    summary.push(
      totalDelta > 0
        ? "Pricing increased from the original estimate."
        : totalDelta < 0
        ? "Pricing decreased from the original estimate."
        : "Pricing structure changed without changing the final total."
    )
  }

  if (scheduleChanges.length > 0) {
    summary.push("Schedule expectations changed from the original estimate.")
  }

  if (adminChanges.length > 0) {
    summary.push("Tax, deposit, or administrative terms were updated.")
  }

  return {
    summary,
    scopeChanges,
    pricingChanges,
    scheduleChanges,
    adminChanges,
  }
}

export function estimateSubtotalBeforeTax(est: EstimateHistoryItem | null) {
  if (!est) return 0

  const labor = Number(est.pricing?.labor || 0)
  const materials = Number(est.pricing?.materials || 0)
  const subs = Number(est.pricing?.subs || 0)
  const markup = Number(est.pricing?.markup || 0)

  const base = labor + materials + subs
  return Math.round(base * (1 + markup / 100))
}

export function estimateDirectCost(est: EstimateHistoryItem | null) {
  if (!est) return 0

  return (
    Number(est.pricing?.labor || 0) +
    Number(est.pricing?.materials || 0) +
    Number(est.pricing?.subs || 0)
  )
}

export function actualCostTotal(actuals: JobActuals | null | undefined) {
  if (!actuals) return 0

  return (
    Number(actuals.labor || 0) +
    Number(actuals.materials || 0) +
    Number(actuals.subs || 0)
  )
}

export function computeProfitProtectionFromTotals(args: {
  contractValue: number
  estimatedCost: number
  actuals: JobActuals | null | undefined
}) {
  const contractValue = Math.max(0, Number(args.contractValue || 0))
  const estimatedCost = Math.max(0, Number(args.estimatedCost || 0))
  const actualCost = actualCostTotal(args.actuals)

  if (contractValue <= 0) {
    return {
      contractValue: 0,
      estimatedCost,
      estimatedProfit: -estimatedCost,
      actualCost,
      profitRemaining: -actualCost,
      percentUsed: 0,
      estimatedMarginPct: 0,
      liveMarginPct: 0,
      costOverEstimatePct: 0,
      status: "no-estimate" as
        | "no-estimate"
        | "not-started"
        | "on-track"
        | "watch"
        | "risk"
        | "overrun",
      label: "No Contract Value",
      message: "No contract value found for this job yet.",
    }
  }

  const estimatedProfit = contractValue - estimatedCost
  const profitRemaining = contractValue - actualCost

  const percentUsed =
    contractValue > 0 ? Math.round((actualCost / contractValue) * 100) : 0

  const estimatedMarginPct =
    contractValue > 0
      ? Math.round(((contractValue - estimatedCost) / contractValue) * 100)
      : 0

  const liveMarginPct =
    contractValue > 0
      ? Math.round(((contractValue - actualCost) / contractValue) * 100)
      : 0

  const costOverEstimatePct =
    estimatedCost > 0
      ? Math.round(((actualCost - estimatedCost) / estimatedCost) * 100)
      : 0

  if (actualCost <= 0) {
    return {
      contractValue,
      estimatedCost,
      estimatedProfit,
      actualCost,
      profitRemaining,
      percentUsed: 0,
      estimatedMarginPct,
      liveMarginPct: estimatedMarginPct,
      costOverEstimatePct: 0,
      status: "not-started" as const,
      label: "Not Started",
      message: "No actual costs entered yet.",
    }
  }

  if (actualCost >= contractValue) {
    return {
      contractValue,
      estimatedCost,
      estimatedProfit,
      actualCost,
      profitRemaining,
      percentUsed,
      estimatedMarginPct,
      liveMarginPct,
      costOverEstimatePct,
      status: "overrun" as const,
      label: "Over Budget",
      message:
        "Actual costs have reached or exceeded the contract value. Immediate review recommended.",
    }
  }

  if (liveMarginPct <= 5 || costOverEstimatePct >= 15) {
    return {
      contractValue,
      estimatedCost,
      estimatedProfit,
      actualCost,
      profitRemaining,
      percentUsed,
      estimatedMarginPct,
      liveMarginPct,
      costOverEstimatePct,
      status: "risk" as const,
      label: "Profit Risk",
      message:
        costOverEstimatePct >= 15
          ? "Actual costs are running well above estimated cost. Review labor, materials, and pending change orders."
          : "Remaining profit is very thin. Review labor, materials, or pending change orders.",
    }
  }

  if (liveMarginPct <= 12 || costOverEstimatePct >= 5) {
    return {
      contractValue,
      estimatedCost,
      estimatedProfit,
      actualCost,
      profitRemaining,
      percentUsed,
      estimatedMarginPct,
      liveMarginPct,
      costOverEstimatePct,
      status: "watch" as const,
      label: "Watch Closely",
      message:
        costOverEstimatePct >= 5
          ? "Actual costs are trending above estimated cost. Keep a close eye on labor and material creep."
          : "Profit is tightening. Keep a close eye on crew time and material creep.",
    }
  }

  return {
    contractValue,
    estimatedCost,
    estimatedProfit,
    actualCost,
    profitRemaining,
    percentUsed,
    estimatedMarginPct,
    liveMarginPct,
    costOverEstimatePct,
    status: "on-track" as const,
    label: "On Track",
    message: "Job profitability currently looks healthy.",
  }
}

/**
 * Backward-compatible helper if you still want to call it with a single estimate.
 * This now uses the same upgraded scoring logic underneath.
 */
export function computeProfitProtection(
  est: EstimateHistoryItem | null,
  actuals: JobActuals | null | undefined
) {
  if (!est) {
    return computeProfitProtectionFromTotals({
      contractValue: 0,
      estimatedCost: 0,
      actuals,
    })
  }

  return computeProfitProtectionFromTotals({
    contractValue: estimateSubtotalBeforeTax(est),
    estimatedCost: estimateDirectCost(est),
    actuals,
  })
}

export function nextChangeOrderNumber(job: {
  changeOrderNo?: string
} | null | undefined, history: { jobId?: string; documentType?: string; createdAt: number }[], jobId?: string) {
  const existingCount = history.filter(
    (h) => h.jobId === jobId && h.documentType === "Change Order"
  ).length

  const next = existingCount + 1

  if (job?.changeOrderNo?.trim()) return `${job.changeOrderNo.trim()}-${next}`
  return `CO-${String(next).padStart(2, "0")}`
}