"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  FREE_LIMIT,
  EMAIL_KEY,
  COMPANY_KEY,
  JOB_KEY,
  INVOICE_KEY,
  HISTORY_KEY,
  BUDGET_KEY,
  ACTUALS_KEY,
  CREW_KEY,
  JOBS_KEY,
  PAINT_SCOPE_OPTIONS,
} from "./lib/constants"

import type {
  PaintScope,
  EffectivePaintScope,
  DocumentType,
  MeasureRow,
  Invoice,
  JobBudget,
  JobActuals,
  Job,
  PricingSource,
  PriceGuardReport,
  Schedule,
  UiTrade,
  EstimateHistoryItem,
  WeekLoad,
} from "./lib/types"

import {
  normalizeTrade,
  money,
  normalizeInvoiceStatus,
  computeLiveInvoiceStatus,
  computeDepositFromEstimateTotal,
  computeTaxAmountFromEstimate,
  estimateTotalWithTax,
  startOfWeek,
  addDays,
  isoDay,
  completionEndFromSchedule,
  daysBetween,
  formatDelta,
  formatSignedNumber,
  toISODate,
  computeDueDateISO,
  buildActualsPatch,
} from "./lib/estimate-utils"

import { getPricingMemory } from "./lib/ai-pricing-memory"
import { compareEstimateToHistory } from "./lib/price-guard"
import { checkScopeQuality } from "./lib/scope-quality-check"

export default function Home() {

  const generatingRef = useRef(false)

// Prevent out-of-order entitlement responses from overwriting newer state
const entitlementReqId = useRef(0)

const lastSavedEstimateIdRef = useRef<string | null>(null)

const invoicesSectionRef = useRef<HTMLDivElement | null>(null)

function scrollToInvoices() {
  // small delay so UI can render filtered invoices after setting activeJobId
  setTimeout(() => {
    invoicesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, 50)
}

  const [measureEnabled, setMeasureEnabled] = useState(false)

  const [measureRows, setMeasureRows] = useState<MeasureRow[]>([
    { label: "Area 1", lengthFt: 0, heightFt: 0, qty: 1 },
  ])

  const rowSqft = (r: MeasureRow) =>
    Math.round((r.lengthFt || 0) * (r.heightFt || 0) * (r.qty || 1) * 10) / 10

  const totalSqft =
    Math.round(measureRows.reduce((sum, r) => sum + rowSqft(r), 0) * 10) / 10

const [actuals, setActuals] = useState<JobActuals[]>([])
const [crewCount, setCrewCount] = useState<number>(1)

  // -------------------------
// Email (required for entitlement)
// -------------------------
const [email, setEmail] = useState("")
const [paid, setPaid] = useState(false)
const [remaining, setRemaining] = useState(FREE_LIMIT)
const [showUpgrade, setShowUpgrade] = useState(false)

// -------------------------
// Saved Estimate History (localStorage)
// -------------------------


const [history, setHistory] = useState<EstimateHistoryItem[]>([])

const [budgets, setBudgets] = useState<JobBudget[]>([])

const [jobDetails, setJobDetails] = useState({
  clientName: "",
  jobName: "",
  changeOrderNo: "",
  jobAddress: "",
  date: "", // optional override; blank = auto-today in PDF
})

useEffect(() => {
  if (typeof window === "undefined") return

  // migrate old key once if it exists
  const old = localStorage.getItem("scopeguard_email")
  if (old) {
    localStorage.setItem(EMAIL_KEY, old)
    localStorage.removeItem("scopeguard_email")
    setEmail(old)
    return
  }

  const saved = localStorage.getItem(EMAIL_KEY)
  if (saved) setEmail(saved)
}, [])

useEffect(() => {
  if (typeof window === "undefined") return

  if (email) {
    localStorage.setItem(EMAIL_KEY, email)
  } else {
    localStorage.removeItem(EMAIL_KEY)
  }
}, [email])

   async function checkEntitlementNow() {
  const reqId = ++entitlementReqId.current

  const e = email.trim().toLowerCase()
  if (!e) return

  try {
    const res = await fetch("/api/entitlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e }),
    })

    // ignore stale responses
    if (reqId !== entitlementReqId.current) return

    if (!res.ok) {
      setPaid(false)
      setRemaining(FREE_LIMIT) // optional fallback
      setShowUpgrade(false) // optional fallback
      return
    }

    const data = await res.json()

    // ignore stale responses (in case JSON parse was slow)
    if (reqId !== entitlementReqId.current) return

    const entitled = data?.entitled === true
    setPaid(entitled)

    const used = typeof data?.usage_count === "number" ? data.usage_count : 0
    const limit =
      typeof data?.free_limit === "number" ? data.free_limit : FREE_LIMIT

    if (!entitled) {
      const remainingNow = Math.max(0, limit - used)
      setRemaining(remainingNow)
      setShowUpgrade(remainingNow <= 0)
    } else {
      setRemaining(FREE_LIMIT) // optional
      setShowUpgrade(false)
    }
  } catch {
    // ignore stale responses
    if (reqId !== entitlementReqId.current) return

    setPaid(false)
    setRemaining(FREE_LIMIT)
    setShowUpgrade(false)
  }
}

useEffect(() => {
  const e = email.trim().toLowerCase()
  if (!e) {
    setPaid(false)
    setRemaining(FREE_LIMIT)
    setShowUpgrade(false)
    return
  }
  checkEntitlementNow()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [email])

// -------------------------
// Jobs Dashboard helpers
// -------------------------
function latestEstimateForJob(jobId: string) {
  const list = history
    .filter((h) => h.jobId === jobId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return list[0] || null
}

function upsertActuals(jobId: string, patch: Partial<JobActuals>) {
  setActuals((prev) => {
    const idx = prev.findIndex((a) => a.jobId === jobId)
    const base = idx === -1 ? null : prev[idx]

    const nextItem = buildActualsPatch(base, {
      ...patch,
      jobId,
    })

    const next =
      idx === -1
        ? [nextItem, ...prev]
        : prev.map((x, i) => (i === idx ? nextItem : x))

    return next
  })
}

function actualsForJob(jobId: string) {
  return actuals.find((a) => a.jobId === jobId) || null
}

function computeProfitSummary(jobId: string) {
  const contract = computeJobContractSummary(jobId)
  const act = actualsForJob(jobId)

  const budgetTotal = Number(contract.currentContractValue || 0)
  const actLabor = Number(act?.labor || 0)
  const actMat = Number(act?.materials || 0)
  const actSubs = Number(act?.subs || 0)
  const actTotal = actLabor + actMat + actSubs

  const profit = budgetTotal - actTotal
  const marginPct =
    budgetTotal > 0 ? Math.round((profit / budgetTotal) * 100) : 0

  return { budgetTotal, actTotal, profit, marginPct }
}

function invoiceSummaryForJob(jobId: string) {
  const list = invoices.filter((x) => x.jobId === jobId)
  let paidCount = 0
  let overdueCount = 0
  let openCount = 0
  let outstanding = 0
  let draftCount = 0

for (const inv of list) {
  const st = computeLiveInvoiceStatus(inv)

  if (st === "paid") {
    paidCount += 1
    continue
  }

  if (st === "draft") {
    draftCount += 1
    continue
  }

  if (st === "overdue") overdueCount += 1
  else openCount += 1

  outstanding += Number(inv.total || 0)
}

return {
  total: list.length,
  draftCount,
  paidCount,
  overdueCount,
  openCount,
  outstanding: Math.round(outstanding),
 }
}

function upsertBudgetFromEstimate(est: EstimateHistoryItem) {
  const jobId = est.jobId
  if (!jobId) return

  const labor = Number(est?.pricing?.labor || 0)
  const materials = Number(est?.pricing?.materials || 0)
  const subs = Number(est?.pricing?.subs || 0)
  const markupPct = Number(est?.pricing?.markup || 0)

  const taxEnabledSnap = Boolean(est.tax?.enabled)
  const taxRateSnap = Number(est.tax?.rate || 0)

  const { taxAmt, estimateTotal } = computeTaxAmountFromEstimate(est)

  // deposit snapshot (optional)
  let dep: JobBudget["deposit"] = undefined
  if (est.deposit?.enabled) {
    const depType = est.deposit.type === "fixed" ? "fixed" : "percent"
    const depValue = Number(est.deposit.value || 0)

    let depositDue = 0
    if (depType === "percent") {
      const pct = Math.max(0, Math.min(100, depValue))
      depositDue = Math.round(estimateTotal * (pct / 100))
    } else {
      depositDue = Math.min(estimateTotal, Math.round(Math.max(0, depValue)))
    }

    dep = {
      enabled: true,
      type: depType,
      value: depValue,
      depositDue,
      remainingBalance: Math.max(0, estimateTotal - depositDue),
    }
  }

  const nextBudget: JobBudget = {
    jobId,
    updatedAt: Date.now(),
    lastEstimateId: est.id,
    estimateTotal,
    labor,
    materials,
    subs,
    markupPct,
    taxEnabled: taxEnabledSnap,
    taxRate: taxRateSnap,
    taxAmount: taxAmt,
    deposit: dep,
  }

  setBudgets((prev) => {
    const idx = prev.findIndex((b) => b.jobId === jobId)
    if (idx === -1) return [nextBudget, ...prev]
    const copy = prev.slice()
    copy[idx] = nextBudget
    return copy
  })
}

function findHistoryById(id: string) {
  return history.find((h) => h.id === id) || null
}

function hasAnyInvoiceForEstimate(estimateId: string) {
  return invoices.some((inv) => inv.fromEstimateId === estimateId)
}

function hasBalanceInvoiceForEstimate(estimateId: string) {
  return invoices.some(
    (inv) =>
      inv.fromEstimateId === estimateId &&
      inv.deposit?.enabled &&
      inv.total === inv.deposit.remainingBalance
  )
}

  function latestInvoiceForJob(jobId: string) {
  const list = invoices
    .filter((x) => x.jobId === jobId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return list[0] || null
}

function selectJobAndJumpToInvoices(jobId: string) {
  setActiveJobId(jobId)
  setStatus("Job selected.")
  scrollToInvoices()
}

function createInvoiceFromLatestEstimate(jobId: string) {
  const est = latestEstimateForJob(jobId)
  if (!est) {
    setStatus("No estimate found for this job yet.")
    return
  }
  createInvoiceFromEstimate(est)
  selectJobAndJumpToInvoices(jobId)
}

function createBalanceInvoiceFromLatestEstimate(jobId: string) {
  const est = latestEstimateForJob(jobId)
  if (!est) {
    setStatus("No estimate found for this job yet.")
    return
  }
  createBalanceInvoiceFromEstimate(est)
  selectJobAndJumpToInvoices(jobId)
}

function computeWeeklyCrewLoad() {
  const items = jobs
    .map((j) => {
      const latest = latestEstimateForJob(j.id)
      const s = latest?.schedule
      if (!s?.startDate) return null

      const crewDays = Number(s?.crewDays ?? 0)
      if (!Number.isFinite(crewDays) || crewDays <= 0) return null

      const start = new Date(s.startDate + "T00:00:00")

      return {
        jobId: j.id,
        jobName: j.jobName || "Untitled Job",
        start,
        crewDays,
      }
    })
    .filter(Boolean) as {
    jobId: string
    jobName: string
    start: Date
    crewDays: number
  }[]

  const byWeek = new Map<
    string,
    {
      demandCrewDays: number
      jobs: {
        jobId: string
        jobName: string
        crewDays: number
      }[]
    }
  >()

  for (const it of items) {
    let remaining = it.crewDays
    let wk = startOfWeek(it.start)

    while (remaining > 0) {
      const take = Math.min(6, remaining)
      const key = isoDay(wk)

      const existing = byWeek.get(key) ?? {
        demandCrewDays: 0,
        jobs: [],
      }

      existing.demandCrewDays += take
      existing.jobs.push({
        jobId: it.jobId,
        jobName: it.jobName,
        crewDays: take,
      })

      byWeek.set(key, existing)

      remaining -= take
      wk = addDays(wk, 7)
    }
  }

  const weeks: WeekLoad[] = Array.from(byWeek.entries())
    .map(([weekStartISO, value]) => ({
      weekStartISO,
      demandCrewDays: value.demandCrewDays,
      jobs: value.jobs.sort((a, b) => b.crewDays - a.crewDays),
    }))
    .sort((a, b) => a.weekStartISO.localeCompare(b.weekStartISO))

  return weeks
}

function lockedOriginalEstimateForJob(jobId?: string) {
  if (!jobId) return null

  const job = jobs.find((j) => j.id === jobId)
  if (!job?.originalEstimateId) return null

  return history.find((h) => h.id === job.originalEstimateId) || null
}

function computeJobContractSummary(jobId?: string) {
  if (!jobId) {
    return {
      originalEstimate: null as EstimateHistoryItem | null,
      originalEstimateTotal: 0,
      changeOrders: [] as EstimateHistoryItem[],
      changeOrdersTotal: 0,
      currentContractValue: 0,
    }
  }

  const originalEstimate = lockedOriginalEstimateForJob(jobId)

  if (!originalEstimate) {
    return {
      originalEstimate: null,
      originalEstimateTotal: 0,
      changeOrders: [],
      changeOrdersTotal: 0,
      currentContractValue: 0,
    }
  }

  const originalEstimateTotal = estimateTotalWithTax(originalEstimate)

  const changeOrders = history
    .filter((h) => h.jobId === jobId && h.id !== originalEstimate.id)
    .sort((a, b) => a.createdAt - b.createdAt)

  const changeOrdersTotal = changeOrders.reduce(
    (sum, h) => sum + estimateTotalWithTax(h),
    0
  )

  const currentContractValue = originalEstimateTotal + changeOrdersTotal

  return {
    originalEstimate,
    originalEstimateTotal,
    changeOrders,
    changeOrdersTotal,
    currentContractValue,
  }
}

function computeChangeOrderSummary(current: EstimateHistoryItem | null) {
  if (!current?.jobId) return null

  const contract = computeJobContractSummary(current.jobId)
  const original = contract.originalEstimate
  if (!original) return null

  const isOriginalEstimate = current.id === original.id

  const previousContractValue = isOriginalEstimate
    ? contract.originalEstimateTotal
    : contract.originalEstimateTotal +
      contract.changeOrders
        .filter((h) => h.createdAt < current.createdAt)
        .reduce((sum, h) => sum + estimateTotalWithTax(h), 0)

  const currentEstimateTotal = estimateTotalWithTax(current)
  const newContractValue = isOriginalEstimate
    ? contract.originalEstimateTotal
    : previousContractValue + currentEstimateTotal

  const costDelta = isOriginalEstimate ? 0 : currentEstimateTotal

  const originalCrewDays = Number(original.schedule?.crewDays || 0)
  const currentCrewDays = Number(current.schedule?.crewDays || 0)
  const crewDayDelta = currentCrewDays - originalCrewDays

  const originalEnd = completionEndFromSchedule(original.schedule, original.createdAt)
  const currentEnd = completionEndFromSchedule(current.schedule, current.createdAt)
  const scheduleDeltaDays = daysBetween(originalEnd, currentEnd)

  return {
    original,
    current,
    isOriginalEstimate,
    originalEstimateTotal: contract.originalEstimateTotal,
    previousContractValue,
    currentEstimateTotal,
    newContractValue,
    costDelta,
    originalCrewDays,
    currentCrewDays,
    crewDayDelta,
    originalEnd,
    currentEnd,
    scheduleDeltaDays,
  }
}

  // -------------------------
  // Company profile (persisted)
  // -------------------------
  const [companyProfile, setCompanyProfile] = useState({
  name: "",
  address: "",
  phone: "",
  email: "",
  logo: "",
  license: "",
  paymentTerms: "",
})

  useEffect(() => {
  if (typeof window === "undefined") return

  const old = localStorage.getItem("scopeguard_company")
  if (old) {
    localStorage.setItem(COMPANY_KEY, old)
    localStorage.removeItem("scopeguard_company")
    try {
      setCompanyProfile(JSON.parse(old))
    } catch {}
    return
  }

  const saved = localStorage.getItem(COMPANY_KEY)
  if (saved) {
    try {
      setCompanyProfile(JSON.parse(saved))
    } catch {}
  }
}, [])

  useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(COMPANY_KEY, JSON.stringify(companyProfile))
}, [companyProfile])
  
useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(JOB_KEY)
  if (saved) setJobDetails(JSON.parse(saved))
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(JOB_KEY, JSON.stringify(jobDetails))
}, [jobDetails])

useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(HISTORY_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
  const cleaned: EstimateHistoryItem[] = parsed.map((x: any) => ({
    id: String(x?.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`),
    jobId: String(x?.jobId ?? ""),
    createdAt: Number(x?.createdAt ?? Date.now()),
    documentType:
  x?.documentType === "Change Order" ||
  x?.documentType === "Estimate" ||
  x?.documentType === "Change Order / Estimate"
    ? x.documentType
    : "Change Order / Estimate",
    jobDetails: {
      clientName: String(x?.jobDetails?.clientName ?? ""),
      jobName: String(x?.jobDetails?.jobName ?? ""),
      changeOrderNo: String(x?.jobDetails?.changeOrderNo ?? ""),
      jobAddress: String(x?.jobDetails?.jobAddress ?? ""),
      date: String(x?.jobDetails?.date ?? ""),
    },
    trade: normalizeTrade(x?.trade), // ✅ key fix
    state: String(x?.state ?? ""),
    scopeChange: String(x?.scopeChange ?? ""),
    result: String(x?.result ?? ""),
    pricing: {
      labor: Number(x?.pricing?.labor ?? 0),
      materials: Number(x?.pricing?.materials ?? 0),
      subs: Number(x?.pricing?.subs ?? 0),
      markup: Number(x?.pricing?.markup ?? 0),
      total: Number(x?.pricing?.total ?? 0),
    },

    schedule: x?.schedule ?? undefined,

        tax: x?.tax
      ? {
          enabled: Boolean(x.tax.enabled),
          rate: Number(x.tax.rate || 0),
        }
      : undefined,
        deposit: x?.deposit
      ? {
          enabled: Boolean(x.deposit.enabled),
          type: x.deposit.type === "fixed" ? "fixed" : "percent",
          value: Number(x.deposit.value || 0),
        }
      : undefined,
    pricingSource: (x?.pricingSource as PricingSource) ?? "ai",
priceGuardVerified: Boolean(x?.priceGuardVerified),

approval: x?.approval
  ? {
      status: x.approval.status === "approved" ? "approved" : "pending",
      approvedBy: x.approval.approvedBy
        ? String(x.approval.approvedBy)
        : undefined,
      approvedAt:
        typeof x.approval.approvedAt === "number"
          ? x.approval.approvedAt
          : undefined,
      signatureDataUrl: x.approval.signatureDataUrl
        ? String(x.approval.signatureDataUrl)
        : undefined,
    }
  : {
      status: "pending",
    },
}))

  setHistory(cleaned)
}
    } catch {
      // ignore bad data
    }
   }

  setHistoryHydrated(true)
}, [])

  // -------------------------
  // App state
  // -------------------------
  const [scopeChange, setScopeChange] = useState("")
  const [result, setResult] = useState("")
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scopeSignals, setScopeSignals] = useState<{
  needsReturnVisit?: boolean
  reason?: string
} | null>(null)
  const completionWindow = useMemo(() => {
  const start =
    schedule?.startDate
      ? new Date(schedule.startDate + "T00:00:00")
      : null

  if (!start) return null

  const minDays =
    Number(schedule?.calendarDays?.min ?? 0) > 0
      ? Number(schedule?.calendarDays?.min)
      : Number(schedule?.crewDays ?? 0) > 0
      ? Number(schedule?.crewDays)
      : 0

  const maxDays =
    Number(schedule?.calendarDays?.max ?? 0) > 0
      ? Number(schedule?.calendarDays?.max)
      : Number(schedule?.crewDays ?? 0) > 0
      ? Number(schedule?.crewDays)
      : 0

  if (!minDays || !maxDays) return null

  const minEnd = new Date(start)
  minEnd.setDate(start.getDate() + Math.max(minDays - 1, 0))


  const maxEnd = new Date(start)
  maxEnd.setDate(start.getDate() + Math.max(maxDays - 1, 0))

  return {
    min: minEnd,
    max: maxEnd,
  }
}, [
  schedule?.startDate,
  schedule?.calendarDays?.min,
  schedule?.calendarDays?.max,
  schedule?.crewDays,
])
  
  const [documentType, setDocumentType] = useState<DocumentType>("Change Order / Estimate")
  const [trade, setTrade] = useState<UiTrade>("")
  const [state, setState] = useState("")
  const [paintScope, setPaintScope] = useState<PaintScope>("walls")
  
const text = scopeChange.toLowerCase()

const hasPaintWord = /\b(?:paint|painting|repaint|prime|primer)\b/i.test(text)

const showPaintScope =
  trade === "painting" || (trade === "" && hasPaintWord)

// explicit door count only (matches server)
const doorCount = (() => {
  const m = text.match(/\b(\d{1,4})\s+doors?\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
})()

const roomCount = (() => {
  const m = text.match(/\b(\d{1,4})\s+rooms?\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
})()

const isMixedPaintScope =
  (trade === "painting" || trade === "") &&
  hasPaintWord &&
  doorCount !== null &&
  roomCount !== null

const roomishRe =
  /\b(rooms?|hallway|living\s*room|family\s*room|bed(room)?|kitchen|bath(room)?|dining|office|closet|stair|entry|walls?|ceilings?)\b/i

const looksLikeDoorsOnly =
  (trade === "painting" || trade === "") &&
  hasPaintWord &&
  doorCount !== null &&
  !roomishRe.test(text)

const effectivePaintScope: EffectivePaintScope =
  looksLikeDoorsOnly ? "doors_only" : paintScope
  
  const [pricing, setPricing] = useState({
    labor: 0,
    materials: 0,
    subs: 0,
    markup: 20,
    total: 0,
  })

  // -------------------------
// Tax (optional)
// -------------------------
const [taxEnabled, setTaxEnabled] = useState(false)
const [taxRate, setTaxRate] = useState<number>(7.75)

// Derived tax amount
const taxAmount = useMemo(() => {
  if (!taxEnabled) return 0

  const base =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  const markedUp = base * (1 + Number(pricing.markup || 0) / 100)
  const total = Math.round(
    markedUp + markedUp * (Number(taxRate || 0) / 100)
  )

  return Math.max(0, total - Math.round(markedUp))
}, [
  taxEnabled,
  taxRate,
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
])

  // -------------------------
// Deposit (optional)
// -------------------------
const [depositEnabled, setDepositEnabled] = useState(false)
const [depositType, setDepositType] = useState<"percent" | "fixed">("percent")
const [depositValue, setDepositValue] = useState<number>(25)

// Derived amounts (based on current total)
const depositDue = useMemo(() => {
  const total = Number(pricing.total || 0)
  if (!depositEnabled || total <= 0) return 0

  if (depositType === "percent") {
    const pct = Math.max(0, Math.min(100, Number(depositValue || 0)))
    return Math.round(total * (pct / 100))
  }

  const fixed = Math.max(0, Number(depositValue || 0))
  return Math.min(total, Math.round(fixed))
}, [depositEnabled, depositType, depositValue, pricing.total])

const remainingBalance = useMemo(() => {
  const total = Number(pricing.total || 0)
  return Math.max(0, total - depositDue)
}, [pricing.total, depositDue])
  
  const [pricingSource, setPricingSource] = useState<PricingSource>("ai")
  const [pricingEdited, setPricingEdited] = useState(false)
  const [showPriceGuardDetails, setShowPriceGuardDetails] = useState(false)
  const [priceGuard, setPriceGuard] = useState<PriceGuardReport | null>(null)
  const [priceGuardVerified, setPriceGuardVerified] = useState(false)

  useEffect(() => {
  function onDocClick(e: MouseEvent) {
    const t = e.target as HTMLElement
    if (t.closest?.("[data-priceguard]")) return
    setShowPriceGuardDetails(false)
  }

  if (showPriceGuardDetails) {
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }
}, [showPriceGuardDetails])
  
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [activeJobId, setActiveJobId] = useState<string>("") // "" = All jobs

  const [jobsHydrated, setJobsHydrated] = useState(false)
  const [historyHydrated, setHistoryHydrated] = useState(false)

  const filteredHistory = useMemo(() => {
  if (!activeJobId) return history
  return history.filter((h) => h.jobId === activeJobId)
}, [history, activeJobId])

const filteredInvoices = useMemo(() => {
  if (!activeJobId) return invoices
  return invoices.filter((inv) => inv.jobId === activeJobId)
}, [invoices, activeJobId])

const currentLoadedEstimate = useMemo<EstimateHistoryItem | null>(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return null

  const base = history.find((h) => h.id === id)
  if (!base) return null

  return {
    ...base,
    jobDetails: { ...jobDetails },
    trade,
    state,
    scopeChange,
    result,
    pricing: {
      labor: Number(pricing.labor || 0),
      materials: Number(pricing.materials || 0),
      subs: Number(pricing.subs || 0),
      markup: Number(pricing.markup || 0),
      total: Number(pricing.total || 0),
    },
    schedule: schedule ?? null,
    tax: {
      enabled: taxEnabled,
      rate: Number(taxRate || 0),
    },
    deposit: depositEnabled
      ? {
          enabled: true,
          type: depositType,
          value: Number(depositValue || 0),
        }
      : undefined,
  }
}, [
  history,
  jobDetails,
  trade,
  state,
  scopeChange,
  result,
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
  pricing.total,
  schedule,
  taxEnabled,
  taxRate,
  depositEnabled,
  depositType,
  depositValue,
])

const changeOrderSummary = useMemo(() => {
  return computeChangeOrderSummary(currentLoadedEstimate)
}, [currentLoadedEstimate])

const pricingMemory = getPricingMemory(history, trade, scopeChange)
const scopeQuality = checkScopeQuality(scopeChange)

const historicalPriceGuard =
  pricingMemory && pricing.total
    ? compareEstimateToHistory(pricing.total, pricingMemory.avgPrice)
    : null

    const minimumSafePrice = useMemo(() => {
  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return null

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0

  // 15% minimum target margin
  const minMargin = 0.15

  // pre-tax selling price needed to preserve 15% margin
  const safeBeforeTax = cost / (1 - minMargin)

  // final customer price if tax is enabled
  const safeAfterTax = Math.round(safeBeforeTax * (1 + effectiveTaxRate))

  return safeAfterTax
}, [
  pricing.labor,
  pricing.materials,
  pricing.subs,
  taxEnabled,
  taxRate,
])

const minimumSafeStatus = useMemo(() => {
  if (!minimumSafePrice || !pricing.total) return null

  const current = Number(pricing.total || 0)
  const safe = Number(minimumSafePrice || 0)
  if (!safe) return null

  const diffPct = ((current - safe) / safe) * 100

  if (current < safe) {
    return {
      label: "Below minimum safe price",
      tone: "danger",
      color: "#9b1c1c",
      bg: "#fef2f2",
      border: "#fecaca",
      message: `This estimate is ${Math.abs(Math.round(diffPct))}% below your minimum safe price.`,
    }
  }

  if (diffPct <= 0) {
    return {
      label: "At minimum safe price",
      tone: "warning",
      color: "#92400e",
      bg: "#fff7ed",
      border: "#fdba74",
      message: "This estimate is right at your minimum safe price floor.",
    }
  }

  if (diffPct <= 5) {
    return {
      label: "Near minimum safe price",
      tone: "warning",
      color: "#92400e",
      bg: "#fff7ed",
      border: "#fdba74",
      message: "This estimate is close to your minimum safe price floor.",
    }
  }

  return {
    label: "Safely above minimum",
    tone: "good",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#86efac",
    message: "This estimate is safely above your minimum safe price.",
  }
}, [minimumSafePrice, pricing.total])

    const smartSuggestedPrice = useMemo(() => {
  if (!pricingMemory) return null

  const historicalAvg = Math.round(Number(pricingMemory.avgPrice || 0))

  if (!historicalAvg) return null

  if (minimumSafePrice) {
    return Math.max(historicalAvg, minimumSafePrice)
  }

  return historicalAvg
}, [pricingMemory, minimumSafePrice])

const smartSuggestedStatus = useMemo(() => {
  if (!pricingMemory || !smartSuggestedPrice) return null

  const avg = Number(pricingMemory.avgPrice || 0)
  if (!avg) return null

  const diffPct = Math.round(((smartSuggestedPrice - avg) / avg) * 100)

  if (diffPct <= -10) {
    return {
      label: "Below your usual range",
      color: "#9b1c1c",
      bg: "#fef2f2",
      border: "#fecaca",
    }
  }

  if (diffPct >= 10) {
    return {
      label: "Above your usual range",
      color: "#92400e",
      bg: "#fff7ed",
      border: "#fdba74",
    }
  }

  return {
    label: "Within your normal range",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#86efac",
  }
}, [pricingMemory, smartSuggestedPrice])

const smartPricingReasons = useMemo(() => {
  const reasons: string[] = []

  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (cost > 0 && cost < 1000) {
    reasons.push("Small job — higher margin is usually safer")
  }

  if (minimumSafePrice && pricing.total < minimumSafePrice) {
    reasons.push("Current price is below your minimum safe floor")
  }

  if (minimumSafeStatus?.tone === "warning") {
    reasons.push("Current price is very close to your minimum safe floor")
  }

  if (Number(pricing.markup || 0) < 20) {
    reasons.push("Markup is lower than a typical contractor target")
  }

  if (pricingMemory?.jobCount && pricingMemory.jobCount >= 2) {
    reasons.push(
      `Based on ${pricingMemory.jobCount} similar ${pricingMemory.trade} jobs in your history`
    )
  }

  return reasons
}, [
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.total,
  pricing.markup,
  minimumSafePrice,
  minimumSafeStatus,
  pricingMemory,
])

function applySuggestedPrice() {
  const targetPrice = Number(smartSuggestedPrice || 0)
  if (!targetPrice) return

  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0

  const targetBeforeTax = targetPrice / (1 + effectiveTaxRate)
  const idealMarkup = ((targetBeforeTax - cost) / cost) * 100
  const cappedMarkup = Math.min(Math.max(0, idealMarkup), 60)

  setPricing((prev) => ({
    ...prev,
    markup: Math.round(cappedMarkup * 10) / 10,
  }))

  setPricingEdited(true)

  if (idealMarkup > 60) {
    setStatus(
      `Suggested price was $${targetPrice.toLocaleString()}, but required markup was capped at 60%. Review labor, materials, or mobilization.`
    )
  } else {
    setStatus(`Suggested price applied: $${targetPrice.toLocaleString()}`)
  }
}

function applyMinimumSafePrice() {
  if (!minimumSafePrice) return

  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0
  const targetBeforeTax = minimumSafePrice / (1 + effectiveTaxRate)
  const newMarkup = ((targetBeforeTax - cost) / cost) * 100

  setPricing((prev) => ({
    ...prev,
    markup: Math.max(0, Math.round(newMarkup * 10) / 10),
  }))

  setPricingEdited(true)
  setStatus(`Minimum safe price applied: $${minimumSafePrice.toLocaleString()}`)
}

function applyProfitTarget(targetMarginPct: number) {
  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return

  const targetMargin = Math.max(0, Math.min(95, Number(targetMarginPct || 0))) / 100

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0

  // target total AFTER tax (what contractor actually collects)
  const targetAfterTax = cost / (1 - targetMargin)

  // convert to pre-tax price
  const targetBeforeTax = targetAfterTax / (1 + effectiveTaxRate)

  const newMarkup = ((targetBeforeTax - cost) / cost) * 100

  setPricing((prev) => ({
    ...prev,
    markup: Math.round(newMarkup * 10) / 10,
  }))

  setPricingEdited(true)
  setStatus(`Profit target applied: ${Math.round(targetMarginPct)}% TRUE margin`)
}

// -------------------------
// Jobs (localStorage)
// -------------------------
useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(JOBS_KEY)

  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) setJobs(parsed)
    } catch {}
  }

  setJobsHydrated(true)
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs))
}, [jobs])

// -------------------------
// Backfill missing jobId AFTER jobs + history load
// -------------------------
useEffect(() => {
  if (!jobsHydrated || !historyHydrated) return
  if (jobs.length === 0) return

  setHistory((prev) => {
    let changed = false

    const next = prev.map((h) => {
      if (h.jobId) return h

      const key = normalizeJobKey(h.jobDetails)
      const found = jobs.find((j) => normalizeJobKey(j) === key)

      if (!found?.id) return h

      changed = true
      return { ...h, jobId: found.id }
    })

    if (changed) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    }

    return next
  })
}, [jobsHydrated, historyHydrated, jobs])

  useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(INVOICE_KEY)
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return

    const cleaned: Invoice[] = parsed.map((x: any) => ({
      id: String(x?.id ?? crypto.randomUUID()),
      createdAt: Number(x?.createdAt ?? Date.now()),
      jobId: x?.jobId ? String(x.jobId) : undefined,
      fromEstimateId: String(x?.fromEstimateId ?? ""),
      invoiceNo: String(x?.invoiceNo ?? "INV-UNKNOWN"),
      issueDate: String(x?.issueDate ?? ""),
      dueDate: String(x?.dueDate ?? ""),
      billToName: String(x?.billToName ?? ""),
      jobName: String(x?.jobName ?? ""),
      jobAddress: String(x?.jobAddress ?? ""),
      lineItems: Array.isArray(x?.lineItems) ? x.lineItems : [],
      subtotal: Number(x?.subtotal ?? 0),
      total: Number(x?.total ?? 0),
      notes: String(x?.notes ?? ""),
      deposit: x?.deposit ?? undefined,
      status: normalizeInvoiceStatus(x),
      paidAt: typeof x?.paidAt === "number" ? x.paidAt : undefined,
    }))

    setInvoices(cleaned)
    localStorage.setItem(INVOICE_KEY, JSON.stringify(cleaned))
  } catch {
    // ignore bad data
  }
}, [])

useEffect(() => {
  function refreshData() {
    try {
      const histRaw = localStorage.getItem(HISTORY_KEY)
      const invRaw = localStorage.getItem(INVOICE_KEY)

      if (histRaw) {
        const parsedHist = JSON.parse(histRaw)
        if (Array.isArray(parsedHist)) {
          const cleanedHistory: EstimateHistoryItem[] = parsedHist.map((x: any) => ({
            id: String(x?.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`),
            jobId: String(x?.jobId ?? ""),
            createdAt: Number(x?.createdAt ?? Date.now()),
            documentType:
              x?.documentType === "Change Order" ||
              x?.documentType === "Estimate" ||
              x?.documentType === "Change Order / Estimate"
                ? x.documentType
                : "Change Order / Estimate",
            jobDetails: {
              clientName: String(x?.jobDetails?.clientName ?? ""),
              jobName: String(x?.jobDetails?.jobName ?? ""),
              changeOrderNo: String(x?.jobDetails?.changeOrderNo ?? ""),
              jobAddress: String(x?.jobDetails?.jobAddress ?? ""),
              date: String(x?.jobDetails?.date ?? ""),
            },
            trade: normalizeTrade(x?.trade),
            state: String(x?.state ?? ""),
            scopeChange: String(x?.scopeChange ?? ""),
            result: String(x?.result ?? ""),
            pricing: {
              labor: Number(x?.pricing?.labor ?? 0),
              materials: Number(x?.pricing?.materials ?? 0),
              subs: Number(x?.pricing?.subs ?? 0),
              markup: Number(x?.pricing?.markup ?? 0),
              total: Number(x?.pricing?.total ?? 0),
            },
            schedule: x?.schedule ?? undefined,
            tax: x?.tax
              ? {
                  enabled: Boolean(x.tax.enabled),
                  rate: Number(x.tax.rate || 0),
                }
              : undefined,
            deposit: x?.deposit
              ? {
                  enabled: Boolean(x.deposit.enabled),
                  type: x.deposit.type === "fixed" ? "fixed" : "percent",
                  value: Number(x.deposit.value || 0),
                }
              : undefined,
            pricingSource: (x?.pricingSource as PricingSource) ?? "ai",
            priceGuardVerified: Boolean(x?.priceGuardVerified),
            approval: x?.approval
              ? {
                  status: x.approval.status === "approved" ? "approved" : "pending",
                  approvedBy: x.approval.approvedBy
                    ? String(x.approval.approvedBy)
                    : undefined,
                  approvedAt:
                    typeof x.approval.approvedAt === "number"
                      ? x.approval.approvedAt
                      : undefined,
                  signatureDataUrl: x.approval.signatureDataUrl
                    ? String(x.approval.signatureDataUrl)
                    : undefined,
                }
              : {
                  status: "pending",
                },
          }))

          setHistory(cleanedHistory)
        }
      }

      if (invRaw) {
        const parsedInv = JSON.parse(invRaw)
        if (Array.isArray(parsedInv)) {
          const cleanedInvoices: Invoice[] = parsedInv.map((x: any) => ({
            id: String(x?.id ?? crypto.randomUUID()),
            createdAt: Number(x?.createdAt ?? Date.now()),
            jobId: x?.jobId ? String(x.jobId) : undefined,
            fromEstimateId: String(x?.fromEstimateId ?? ""),
            invoiceNo: String(x?.invoiceNo ?? "INV-UNKNOWN"),
            issueDate: String(x?.issueDate ?? ""),
            dueDate: String(x?.dueDate ?? ""),
            billToName: String(x?.billToName ?? ""),
            jobName: String(x?.jobName ?? ""),
            jobAddress: String(x?.jobAddress ?? ""),
            lineItems: Array.isArray(x?.lineItems) ? x.lineItems : [],
            subtotal: Number(x?.subtotal ?? 0),
            total: Number(x?.total ?? 0),
            notes: String(x?.notes ?? ""),
            deposit: x?.deposit ?? undefined,
            status: normalizeInvoiceStatus(x),
            paidAt: typeof x?.paidAt === "number" ? x.paidAt : undefined,
          }))

          setInvoices(cleanedInvoices)
        }
      }
    } catch {}
  }

  window.addEventListener("jobestimatepro:update", refreshData)

  return () => {
    window.removeEventListener("jobestimatepro:update", refreshData)
  }
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(INVOICE_KEY, JSON.stringify(invoices))
}, [invoices])


useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(BUDGET_KEY)
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) setBudgets(parsed)
  } catch {}
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets))
}, [budgets])

useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(ACTUALS_KEY)
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) setActuals(parsed)
  } catch {}
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(ACTUALS_KEY, JSON.stringify(actuals))
}, [actuals])

useEffect(() => {
  if (typeof window === "undefined") return
  const saved = localStorage.getItem(CREW_KEY)
  if (saved) {
    const n = Number(saved)
    if (Number.isFinite(n) && n > 0) setCrewCount(Math.max(1, Math.round(n)))
  }
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(CREW_KEY, String(crewCount))
}, [crewCount])
  
  useEffect(() => {
  if (paid) setShowUpgrade(false)
}, [paid])



  // -------------------------
// Auto-calc total
// -------------------------
useEffect(() => {
  const base =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  const markedUp = base * (1 + Number(pricing.markup || 0) / 100)
  const tax = taxEnabled ? markedUp * (Number(taxRate || 0) / 100) : 0

  const total = Math.round(markedUp + tax)

  setPricing((p) => ({ ...p, total }))
}, [
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
  taxEnabled,
  taxRate,
])

// -------------------------
// ✅ Keep latest saved estimate in sync with UI (tax/deposit/pricing)
// -------------------------

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return

  const current = findHistoryById(id)
  if (!current) return

  const patched: EstimateHistoryItem = {
    ...current,
    tax: { enabled: taxEnabled, rate: Number(taxRate || 0) },
  }

  updateHistoryItem(id, { tax: patched.tax })
  upsertBudgetFromEstimate(patched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [taxEnabled, taxRate])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return

  const current = findHistoryById(id)
  if (!current) return

  const patched: EstimateHistoryItem = {
    ...current,
    deposit: depositEnabled
      ? { enabled: true, type: depositType, value: Number(depositValue || 0) }
      : undefined,
  }

  updateHistoryItem(id, { deposit: patched.deposit })
  upsertBudgetFromEstimate(patched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [depositEnabled, depositType, depositValue])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return

  const current = findHistoryById(id)
  if (!current) return

  const patched: EstimateHistoryItem = {
    ...current,
    pricing: {
      labor: Number(pricing.labor || 0),
      materials: Number(pricing.materials || 0),
      subs: Number(pricing.subs || 0),
      markup: Number(pricing.markup || 0),
      total: Number(pricing.total || 0),
    },
  }

  updateHistoryItem(id, { pricing: patched.pricing })
  upsertBudgetFromEstimate(patched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pricing.labor, pricing.materials, pricing.subs, pricing.markup, pricing.total])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return
  updateHistoryItem(id, {
    schedule: schedule ?? undefined,
  })
}, [schedule])

  // -------------------------
// Generate AI document
// -------------------------
async function generate() {
  if (generatingRef.current) return
  generatingRef.current = true

  if (loading) {
    generatingRef.current = false
    return
  }

  const e = email.trim().toLowerCase()
  if (!e) {
    setStatus("Please enter the email used at checkout.")
    generatingRef.current = false
    return
  }

  if (!scopeChange.trim()) {
    setStatus("Please describe the scope change.")
    generatingRef.current = false
    return
  }

  if (!paid && remaining <= 0) {
    setStatus("Free limit reached. Please upgrade.")
    setShowUpgrade(true)
    generatingRef.current = false
    return
  }

  setLoading(true)
  setStatus("") // prevents duplicate “Generating…” line
  setResult("")
  setDocumentType("Change Order / Estimate")
  setPricingSource("ai")
  setShowPriceGuardDetails(false)
  setPriceGuard(null)
  setPricingEdited(false)
  setPriceGuardVerified(false)
  setSchedule(null)
  setScopeSignals(null)

const sendPaintScope =
  trade === "painting" || (trade === "" && hasPaintWord)

const paintScopeToSend = sendPaintScope
  ? (effectivePaintScope === "doors_only" ? "walls" : paintScope)
  : null

const tradeToSend =
  trade === "bathroom_tile" || trade === "general_renovation"
    ? "general renovation"
    : trade

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: e,
        scopeChange,
        trade: tradeToSend,
        state,
        paintScope: paintScopeToSend,
        measurements: measureEnabled
          ? { rows: measureRows, totalSqft, units: "ft" }
          : null,
      }),
    })

    if (res.status === 403) {
      setStatus("Free limit reached. Please upgrade.")
      setShowUpgrade(true)
      setRemaining(0)
      return
    }

    if (res.status === 429) {
      const payload = await res.json().catch(() => null)
      const retry = payload?.retry_after
      setStatus(
        retry
          ? `Too many requests. Try again later. (retry-after: ${retry}s)`
          : "Too many requests. Please try again in a moment."
      )
      return
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => "")
      setStatus(`Server error (${res.status}). ${msg}`)
      return
    }

    const data = await res.json()
    console.log("pricingSource:", data.pricingSource)

    const nextVerified = data?.priceGuardVerified === true
    setPriceGuardVerified(nextVerified)
    setPriceGuard(data?.priceGuard ?? null)

    const nextDocumentType =
     data?.documentType === "Change Order" ||
     data?.documentType === "Estimate" ||
     data?.documentType === "Change Order / Estimate"
      ? data.documentType
      : "Change Order / Estimate"

    setDocumentType(nextDocumentType)

const nextResult = data.text || data.description || ""
const nextPricing = data.pricing ? data.pricing : pricing
const nextPricingSource =
  (data?.pricingSource as PricingSource) || "ai"

const normalizedSchedule =
  data?.schedule
    ? {
        ...data.schedule,
        startDate:
          data.schedule.startDate ?? new Date().toISOString().slice(0, 10),
        crewDays:
          data.schedule.crewDays == null ? 1 : Number(data.schedule.crewDays),
        visits:
          data.schedule.visits == null ? 1 : Number(data.schedule.visits),
        workDaysPerWeek:
          data.schedule.workDaysPerWeek == null
            ? 5
            : Number(data.schedule.workDaysPerWeek),
        calendarDays:
          data.schedule.calendarDays?.min != null &&
          data.schedule.calendarDays?.max != null
            ? {
                min: Number(data.schedule.calendarDays.min),
                max: Number(data.schedule.calendarDays.max),
              }
            : null,
        rationale: Array.isArray(data.schedule.rationale)
          ? data.schedule.rationale
          : [],
      }
    : null

setResult(nextResult)
setSchedule(normalizedSchedule)
setScopeSignals(data?.scopeSignals ?? null)
setPricing(nextPricing)
setPricingSource(nextPricingSource)
const nextTrade: UiTrade = trade ? trade : normalizeTrade(data?.trade)
if (!trade && nextTrade) setTrade(nextTrade)

const newId = `${Date.now()}_${Math.random().toString(16).slice(2)}`

const jobId = getOrCreateJobIdFromDetails()

const estItem: EstimateHistoryItem = {
  id: newId,
  createdAt: Date.now(),
  jobDetails: { ...jobDetails },
  jobId,
  documentType: nextDocumentType,
  trade: nextTrade,
  state: state || "",
  scopeChange: scopeChange || "",
  result: nextResult,
  pricing: {
    labor: Number(nextPricing.labor || 0),
    materials: Number(nextPricing.materials || 0),
    subs: Number(nextPricing.subs || 0),
    markup: Number(nextPricing.markup || 0),
    total: Number(nextPricing.total || 0),
  },
  schedule: normalizedSchedule,
  pricingSource: nextPricingSource,
  priceGuardVerified: nextVerified,
  tax: {
    enabled: taxEnabled,
    rate: Number(taxRate || 0),
  },
  deposit: depositEnabled
    ? {
        enabled: true,
        type: depositType,
        value: Number(depositValue || 0),
      }
    : undefined,
    approval: {
      status: "pending",
    },
}

saveToHistory(estItem)

// lock original estimate only once for this job
if (jobId) {
  lockOriginalEstimateForJob(jobId, newId)
}

// ✅ Auto-create/update job budget
upsertBudgetFromEstimate(estItem)

// ✅ keep latest id pointer
lastSavedEstimateIdRef.current = newId

await checkEntitlementNow()
  } catch (err) {
    console.error(err)
    setStatus("Error generating document.")
  } finally {
    setLoading(false)
    generatingRef.current = false
  }
}

  // -------------------------
// Stripe upgrade
// -------------------------
async function upgrade() {
  try {
    const e = email.trim().toLowerCase()

    if (!e) {
      setStatus("Please enter the email used at checkout.")
      return
    }

    setStatus("Redirecting to secure checkout…")

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e }), // ✅ SEND EMAIL
    })

    if (!res.ok) {
      throw new Error("Checkout request failed")
    }

    const data = await res.json()

    if (!data?.url) {
      throw new Error("No checkout URL returned")
    }

   // 🔑 Force full-page navigation
window.location.assign(data.url)
} catch (err) {
  console.error(err)
  setStatus("Checkout error.")
}
}

// ✅ Save History
function saveToHistory(item: EstimateHistoryItem) {
  setHistory((prev) => {
    const next = [item, ...prev].slice(0, 25)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })
}

// ✅ Update single history item (patch fields)
function updateHistoryItem(id: string, patch: Partial<EstimateHistoryItem>) {
  setHistory((prev) => {
    const next = prev.map((h) => (h.id === id ? { ...h, ...patch } : h))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })
}

function updateInvoice(id: string, patch: Partial<Invoice>) {
  setInvoices((prev) => {
    const next = prev.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv))
    localStorage.setItem(INVOICE_KEY, JSON.stringify(next))
    return next
  })
}

function makeJobId() {
  return crypto.randomUUID()
}

function normalizeJobKey(d: {
  clientName: string
  jobName: string
  jobAddress: string
}) {
  return `${(d.clientName || "").trim().toLowerCase()}|${(d.jobName || "")
    .trim()
    .toLowerCase()}|${(d.jobAddress || "").trim().toLowerCase()}`
}

function lockOriginalEstimateForJob(jobId: string, estimateId: string) {
  setJobs((prev) => {
    const next = prev.map((j) => {
      if (j.id !== jobId) return j
      if (j.originalEstimateId) return j // already locked
      return { ...j, originalEstimateId: estimateId }
    })
    return next
  })
}

function getOrCreateJobIdFromDetails() {
  const clientName = jobDetails.clientName?.trim() || "Client"
  const jobName = jobDetails.jobName?.trim() || "Job"
  const jobAddress = jobDetails.jobAddress?.trim() || ""

  const key = normalizeJobKey({ clientName, jobName, jobAddress })

  const existing = jobs.find(
    (j) => normalizeJobKey(j) === key
  )

  if (existing) return existing.id

    const newJob: Job = {
    id: makeJobId(),
    createdAt: Date.now(),
    clientName,
    jobName,
    jobAddress,
    changeOrderNo: jobDetails.changeOrderNo?.trim() || "",
    originalEstimateId: undefined,
  }

  setJobs((prev) => [newJob, ...prev])
  return newJob.id
}

function updateJob(id: string, patch: Partial<Job>) {
  setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
}

function deleteJob(id: string) {
  // remove job
  setJobs((prev) => prev.filter((j) => j.id !== id))

  // remove all estimates tied to it
  setHistory((prev) => {
    const next = prev.filter((h) => h.jobId !== id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })

  // remove all invoices tied to it
  setInvoices((prev) => {
    const next = prev.filter((inv) => inv.jobId !== id)
    localStorage.setItem(INVOICE_KEY, JSON.stringify(next))
    return next
  })

    // remove actuals tied to it
  setActuals((prev) => {
    const next = prev.filter((a) => a.jobId !== id)
    localStorage.setItem(ACTUALS_KEY, JSON.stringify(next))
    return next
  })

  // reset active selection if needed
  setActiveJobId((cur) => (cur === id ? "" : cur))
}

// ✅ Delete single history item
function deleteHistoryItem(id: string) {
  setHistory((prev) => {
    const next = prev.filter((h) => h.id !== id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })
}

// ✅ Clear history
function clearHistory() {
  setHistory([])
  localStorage.setItem(HISTORY_KEY, JSON.stringify([]))
}

// ✅ Load history item back into the form
function loadHistoryItem(item: EstimateHistoryItem) {
  setJobDetails(item.jobDetails)
  setDocumentType(item.documentType || "Change Order / Estimate")
  setTrade(item.trade || "")
  setState(item.state || "")
  setScopeChange(item.scopeChange || "")
  setPricingEdited(false)
  setResult(item.result || "")
  setPricing(item.pricing)
  setSchedule(item.schedule ?? null)

    // restore tax settings (if present)
  if (item.tax) {
    setTaxEnabled(Boolean(item.tax.enabled))
    setTaxRate(Number(item.tax.rate || 0))
  } else {
    setTaxEnabled(false)
    setTaxRate(7.75)
  }

    // restore deposit settings (if present)
  if (item.deposit) {
    setDepositEnabled(Boolean(item.deposit.enabled))
    setDepositType(item.deposit.type === "fixed" ? "fixed" : "percent")
    setDepositValue(Number(item.deposit.value || 0))
  } else {
    setDepositEnabled(false)
    setDepositType("percent")
    setDepositValue(25)
  }
  
  const src = (item.pricingSource ?? "ai") as PricingSource
  setPricingSource(src)

  setShowPriceGuardDetails(false)

  lastSavedEstimateIdRef.current = item.id

  setStatus("Loaded saved estimate from history.")
}

    // -------------------------
  // PDF generation (Branded)
  // -------------------------
  function downloadPDF() {
    if (!result) {
      setStatus("Generate a document first, then download the PDF.")
      return
    }

    const brandName = "JobEstimate Pro"
    const companyName = companyProfile.name?.trim() || "Contractor"
    const companyAddress = companyProfile.address?.trim() || ""
    const companyPhone = companyProfile.phone?.trim() || ""
    const companyEmail = companyProfile.email?.trim() || ""
    const companyLicense = companyProfile.license?.trim() || ""
    const paymentTerms = companyProfile.paymentTerms?.trim() || "Due upon approval."
    const companyLogo = companyProfile.logo || ""
    const clientName = jobDetails.clientName?.trim() || ""
    const jobName = jobDetails.jobName?.trim() || ""
    const jobAddress = jobDetails.jobAddress?.trim() || ""
    const changeOrderNo = jobDetails.changeOrderNo?.trim() || ""
    const approval = currentLoadedEstimate?.approval
    const isApproved = approval?.status === "approved"
    const approvedBy = approval?.approvedBy?.trim() || "Client"
    const approvedAtText =
     approval?.approvedAt
    ? new Date(approval.approvedAt).toLocaleString()
    : ""
    const approvedSignature = approval?.signatureDataUrl?.trim() || ""
    const showPriceGuardNote =
    pdfShowPriceGuard && documentType !== "Change Order"

    const win = window.open("", "", "width=900,height=1100")
    if (!win) {
      setStatus("Pop-up blocked. Please allow pop-ups to download the PDF.")
      return
    }

    // Basic HTML escaping to prevent broken PDFs if user types special chars
    const esc = (s: any) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

    const safeResult = esc(result || "")

    const scheduleHtml = (s: Schedule | null) => {
  if (!s) return ""

  const crew = s.crewDays != null ? `${esc(s.crewDays)} crew-days` : "—"
  const visits = s.visits != null ? `${esc(s.visits)}` : "—"
  const workweek = s.workDaysPerWeek != null ? `${esc(s.workDaysPerWeek)}-day workweek` : ""
  const duration = s.calendarDays ? `${esc(s.calendarDays.min)}–${esc(s.calendarDays.max)} calendar days` : "—"

  const notes =
    (s.rationale?.length ?? 0) > 0
      ? `<ul style="margin:6px 0 0; padding-left:18px; line-height:1.45;">
           ${s.rationale.map((r) => `<li>${esc(r)}</li>`).join("")}
         </ul>`
      : ""

  return `
    <div class="section">
      <div class="muted" style="margin-bottom:6px;">Estimated Schedule</div>

      <div style="
        border:1px solid #cfcfcf;
        border-radius:10px;
        padding:12px;
        background:#fff;
      ">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="font-weight:800; font-size:13px;">Duration Expectations</div>
          <div style="font-size:12px; color:#666;">${workweek}</div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
          <tr>
            <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e5e5;">Crew Time</th>
            <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e5e5;">Site Visits</th>
            <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e5e5;">Calendar Duration</th>
          </tr>
          <tr>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0; font-weight:700;">${crew}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0; font-weight:700;">${visits}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0; font-weight:700;">${duration}</td>
          </tr>
        </table>

        ${
          notes
            ? `<div style="margin-top:10px;">
                 <div style="font-size:12px; color:#666; margin-bottom:4px;">Scheduling considerations</div>
                 ${notes}
               </div>`
            : ""
        }
      </div>
     ${
  s.startDate && s.calendarDays
    ? (() => {
        // ✅ timezone-safe parse for YYYY-MM-DD
        const start = new Date(s.startDate + "T00:00:00")

        const minEnd = new Date(start)
        minEnd.setDate(start.getDate() + Math.max(s.calendarDays.min - 1, 0))


        const maxEnd = new Date(start)
        maxEnd.setDate(start.getDate() + Math.max(s.calendarDays.max - 1, 0))

        return `
<div style="margin-top:10px; font-size:13px;">
  <strong>Estimated Start:</strong>
  ${esc(start.toLocaleDateString())}<br/>
  <strong>Estimated Completion:</strong>
  ${esc(minEnd.toLocaleDateString())} –
  ${esc(maxEnd.toLocaleDateString())}
</div>
`
      })()
    : ""
}
    </div>
  `
}

    win.document.write(`
      <html>
        <head>
          <title>${esc(brandName)} — ${esc(documentType || "Change Order / Estimate")} — ${esc(jobName || "")}</title>
          <meta charset="utf-8" />
          <style>
            @page { margin: 22mm 18mm; }
            body {
              font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
              color: #111;
            }
            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 18px;
              padding-bottom: 14px;
              border-bottom: 2px solid #111;
            }
            .brand {
              font-size: 14px;
              font-weight: 600;
              color: #444;
              letter-spacing: 0.2px;
            }
            .brandTag {
              margin-top: 4px;
              font-size: 11px;
              color: #666;
            }
            .company {
              text-align: right;
              font-size: 12px;
              line-height: 1.5;
              color: #222;
              max-width: 55%;
              word-wrap: break-word;
            }
            h1 {
              font-size: 18px;
              margin: 18px 0 6px;
            }
            .muted {
              color: #555;
              font-size: 12px;
            }
            .section {
              margin-top: 18px;
            }
            .box {
  margin-top: 10px;
  padding: 14px;
  border: 1px solid #cfcfcf;
  border-radius: 10px;
  background: #fff;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 13px;
}
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 13px;
            }
            td, th {
              padding: 10px;
              border-bottom: 1px solid #e5e5e5;
            }
            th {
              text-align: left;
              font-size: 12px;
              color: #444;
            }
            .totalRow td {
              font-weight: 800;
              border-top: 2px solid #111;
            }
            .badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 999px;
              font-size: 11px;
              background: #f0f0f0;
              color: #333;
              margin-left: 8px;
            }
            .sign {
              margin-top: 34px;
              display: flex;
              justify-content: space-between;
              gap: 24px;
            }
            .sigBlock {
              flex: 1;
            }
            .line {
              border-top: 1px solid #111;
              margin-top: 46px;
              width: 100%;
            }
            .sigLabel {
              margin-top: 8px;
              font-size: 12px;
              color: #333;
            }
              /* -------------------------
   Approvals (compact + 2-up)
   ------------------------- */
.approvalsRow{
  margin-top: 10px;             /* tighter */
  padding-top: 8px;             /* tighter */
  border-top: 1px solid #e5e5e5;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  page-break-inside: avoid;
  break-inside: avoid;
}

.approval{
  flex: 1;
  padding: 10px 12px;           /* tighter */
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.approvalTitle{
  font-size: 12px;
  font-weight: 700;
  color: #111;
  margin: 0 0 8px;              /* tighter */
}

.approvalGrid{
  display: grid;
  grid-template-columns: 1fr 0.7fr;  /* signature + date */
  gap: 14px;
  align-items: end;
}

.approvalField{
  display: flex;
  flex-direction: column;
}

.approvalLine{
  border-top: 1px solid #111;
  margin-top: 18px;             /* tighter */
  width: 100%;
}

.approvalHint{
  margin-top: 6px;              /* was 8 */
  font-size: 11px;
  color: #333;
  white-space: nowrap;
}

.approvalNote{
  margin-top: 6px;              /* tighter */
  font-size: 10px;              /* slightly smaller */
  color: #555;
  line-height: 1.3;
}
            .footer {
  margin-top: 10px;     /* was 26 */
  padding-top: 6px;     /* was 10 */
  border-top: 1px solid #eee;
  font-size: 11px;
  color: #666;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
          
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">${esc(brandName)}</div>
              <div class="brandTag">Professional change orders & estimates — generated instantly.</div>
            </div>
            <div class="company">
  ${
    companyLogo
      ? `<img src="${companyLogo}" style="max-height:42px; margin-bottom:6px;" />`
      : ""
  }

  <div style="font-weight:700; font-size:16px; color:#111;">
    ${esc(companyName)}
  </div>

  ${companyAddress ? `<div>${esc(companyAddress)}</div>` : ""}
  ${companyPhone ? `<div>${esc(companyPhone)}</div>` : ""}
  ${companyLicense ? `<div><strong>License #:</strong> ${esc(companyLicense)}</div>` : ""}
  ${companyEmail ? `<div>${esc(companyEmail)}</div>` : ""}
</div>
          </div>

          <h1>${esc(documentType || "Change Order / Estimate")}
            ${
              pdfShowPriceGuard
                ? `<span class="badge">${esc(pdfPriceGuardLabel)}</span>`
                : pdfEdited
                ? `<span class="badge">Edited</span>`
                : ""
             }
          </h1>

<div class="muted" style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
  <div>
    ${clientName ? `<div><strong>Client:</strong> ${esc(clientName)}</div>` : ""}
    ${jobName ? `<div><strong>Job:</strong> ${esc(jobName)}</div>` : ""}
    ${jobAddress ? `<div><strong>Address:</strong> ${esc(jobAddress)}</div>` : ""}
  </div>

  <div style="text-align:right;">
    ${changeOrderNo ? `<div><strong>Change Order #:</strong> ${esc(changeOrderNo)}</div>` : ""}
    <div><strong>Date:</strong> ${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())}</div>
  </div>
</div>

<div class="muted" style="margin-top:6px;">Generated by ${esc(brandName)}</div>

          <div class="section">
            <div class="muted" style="margin-bottom:6px;">Scope / Description</div>
            <div class="box">${safeResult}</div>
          </div>

          ${scheduleHtml(schedule)}

          <div class="section">
            <div class="muted" style="margin-bottom:6px;">Pricing Summary</div>
            <table>
              <tr><th>Category</th><th style="text-align:right;">Amount</th></tr>
              <tr><td>Labor</td><td style="text-align:right;">$${Number(pricing.labor || 0).toLocaleString()}</td></tr>
<tr><td>Materials</td><td style="text-align:right;">$${Number(pricing.materials || 0).toLocaleString()}</td></tr>
<tr><td>Other / Mobilization</td><td style="text-align:right;">$${Number(pricing.subs || 0).toLocaleString()}</td></tr>
<tr><td>Markup</td><td style="text-align:right;">${Number(pricing.markup || 0)}%</td></tr>

${
  taxEnabled
    ? `<tr><td>Sales Tax (${Number(taxRate || 0)}%)</td><td style="text-align:right;">$${Number(taxAmount || 0).toLocaleString()}</td></tr>`
    : ""
}

<tr class="totalRow"><td>Total</td><td style="text-align:right;">$${Number(pricing.total || 0).toLocaleString()}</td></tr>
                            ${
                depositEnabled
                  ? `<tr><td>Deposit Due Now</td><td style="text-align:right;">$${Number(depositDue || 0).toLocaleString()}</td></tr>
                     <tr><td>Remaining Balance</td><td style="text-align:right;">$${Number(remainingBalance || 0).toLocaleString()}</td></tr>`
                  : ""
              }
            </table>

            ${pdfEdited ? `
  <div class="muted" style="margin-top:8px; line-height:1.4;">
    <strong>Edited:</strong> Pricing was updated to reflect job-specific details (site conditions, selections, or confirmed measurements).
  </div>
` : ""}

            ${showPriceGuardNote ? `
  <div class="muted" style="margin-top:8px; line-height:1.4;">
    <strong>${esc(pdfPriceGuardLabel)} (Informational):</strong>
    Pricing reflects the scope described above and typical site conditions at time of preparation.
    If site conditions, selections, quantities, or scope change after issuance, the final price will be adjusted accordingly.
  </div>
` : ""}

</div>   
   
<div class="approvalsRow">
  <div class="approval">
    <div class="approvalTitle">Contractor Approval</div>

    <div class="approvalGrid">
      <div class="approvalField">
        <div class="approvalLine"></div>
        <div class="approvalHint">Contractor Signature</div>
      </div>

      <div class="approvalField">
        <div class="approvalLine"></div>
        <div class="approvalHint">
          Date (${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())})
        </div>
      </div>
    </div>
  </div>

  <div class="approval">
  <div class="approvalTitle">Customer Approval</div>

  ${
    isApproved
      ? `
        <div style="font-size:12px; margin-bottom:8px;">
          <strong>Approved by:</strong> ${esc(approvedBy)}
        </div>

        ${
          approvedAtText
            ? `
              <div style="font-size:12px; margin-bottom:8px; color:#444;">
                <strong>Approved on:</strong> ${esc(approvedAtText)}
              </div>
            `
            : ""
        }

        ${
          approvedSignature
            ? `
              <div style="margin:8px 0 10px;">
                <div style="font-size:11px; color:#333; margin-bottom:4px;">
                  Customer Signature
                </div>
                <img
                  src="${approvedSignature}"
                  alt="Customer signature"
                  style="max-width:220px; max-height:90px; border-bottom:1px solid #111; display:block;"
                />
              </div>
            `
            : `
              <div class="approvalGrid">
                <div class="approvalField">
                  <div class="approvalLine"></div>
                  <div class="approvalHint">Customer Signature</div>
                </div>

                <div class="approvalField">
                  <div class="approvalLine"></div>
                  <div class="approvalHint">Date</div>
                </div>
              </div>
            `
        }
      `
      : `
        <div class="approvalGrid">
          <div class="approvalField">
            <div class="approvalLine"></div>
            <div class="approvalHint">Customer Signature</div>
          </div>

          <div class="approvalField">
            <div class="approvalLine"></div>
            <div class="approvalHint">
              Date (${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())})
            </div>
          </div>
        </div>
      `
  }

  <div class="approvalNote">
    By signing above, the customer approves the scope of work and pricing described in this document.
    Payment terms: <strong>${esc(paymentTerms)}</strong>
  </div>
</div>
</div>

          <div class="footer">
            <div>${esc(brandName)}</div>
            <div>${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())}</div>
          </div>
        </body>
      </html>
    `)

        win.document.close()

    setTimeout(() => {
      win.focus()
      win.print()
    }, 500)
  }

  function downloadInvoicePDF(inv: Invoice) {
  const brandName = "JobEstimate Pro"
  const companyName = companyProfile.name?.trim() || "Contractor"
  const companyAddress = companyProfile.address?.trim() || ""
  const companyPhone = companyProfile.phone?.trim() || ""
  const companyEmail = companyProfile.email?.trim() || ""

  const win = window.open("", "", "width=900,height=1100")
  if (!win) {
    setStatus("Pop-up blocked. Please allow pop-ups to download the PDF.")
    return
  }

  const esc = (s: any) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

  const rows = inv.lineItems
    .map(
      (li) => `
        <tr>
          <td>${esc(li.label)}</td>
          <td style="text-align:right;">${money(li.amount)}</td>
        </tr>
      `
    )
    .join("")

  win.document.write(`
    <html>
      <head>
        <title>${esc(brandName)} — Invoice ${esc(inv.invoiceNo)}</title>
        <meta charset="utf-8" />
        <style>
          @page { margin: 22mm 18mm; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; }
          .header { display:flex; justify-content:space-between; gap:16px; padding-bottom:12px; border-bottom:2px solid #111; }
          .brand { font-size:14px; font-weight:600; color:#444; letter-spacing:0.2px; }
          .company { text-align:right; font-size:12px; line-height:1.5; color:#222; max-width:55%; word-wrap:break-word; }
          h1 { font-size:18px; margin:16px 0 6px; }
          .muted { color:#555; font-size:12px; }
          table { width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
          td, th { padding:10px; border-bottom:1px solid #e5e5e5; }
          th { text-align:left; font-size:12px; color:#444; }
          .totalRow td { font-weight:800; border-top:2px solid #111; }
          .meta { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:8px; }
          .box { margin-top:10px; padding:12px; border:1px solid #e5e5e5; border-radius:10px; font-size:12px; color:#333; }
          .approvalsRow{ margin-top:14px; padding-top:10px; border-top:1px solid #e5e5e5; display:flex; gap:16px; }
          .approval{ flex:1; padding:10px 12px; border:1px solid #e5e5e5; border-radius:10px; }
          .approvalTitle{ font-size:12px; font-weight:700; margin:0 0 8px; }
          .approvalGrid{ display:grid; grid-template-columns:1fr 0.7fr; gap:14px; align-items:end; }
          .approvalLine{ border-top:1px solid #111; margin-top:22px; width:100%; }
          .approvalHint{ margin-top:6px; font-size:11px; color:#333; white-space:nowrap; }
          .footer { margin-top:22px; padding-top:10px; border-top:1px solid #eee; font-size:11px; color:#666; display:flex; justify-content:space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">${esc(brandName)}</div>
            <div class="muted">Invoice</div>
          </div>
          <div class="company">
            <div style="font-weight:700; font-size:16px; color:#111;">${esc(companyName)}</div>
            ${companyAddress ? `<div>${esc(companyAddress)}</div>` : ""}
            ${companyPhone ? `<div>${esc(companyPhone)}</div>` : ""}
            ${companyEmail ? `<div>${esc(companyEmail)}</div>` : ""}
          </div>
        </div>

        <h1>Invoice <span style="font-weight:700;">${esc(inv.invoiceNo)}</span></h1>

        <div class="meta muted">
          <div>
            <div><strong>Bill To:</strong> ${esc(inv.billToName)}</div>
            <div><strong>Job:</strong> ${esc(inv.jobName)}</div>
            ${inv.jobAddress ? `<div><strong>Address:</strong> ${esc(inv.jobAddress)}</div>` : ""}
          </div>
          <div style="text-align:right;">
            <div><strong>Issue Date:</strong> ${esc(new Date(inv.issueDate).toLocaleDateString())}</div>
            <div><strong>Due Date:</strong> ${esc(new Date(inv.dueDate).toLocaleDateString())}</div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="muted" style="margin-bottom:6px;">Invoice Summary</div>
          <table>
            <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
            ${rows}
            <tr class="totalRow"><td>Total Due</td><td style="text-align:right;">${money(inv.total)}</td></tr>
          </table>
        </div>

        ${
  inv.deposit?.enabled
    ? `<div class="box">
         <strong>${inv.total === inv.deposit?.depositDue ? "Deposit Invoice:" : "Balance Invoice:"}</strong><br/>
         Estimate Total: ${money(inv.deposit.estimateTotal)}<br/>
         Deposit Due Now: ${money(inv.deposit.depositDue)}<br/>
         Remaining Balance: ${money(inv.deposit.remainingBalance)}
       </div>`
    : ""
}

${inv.notes ? `<div class="box"><strong>Notes:</strong> ${esc(inv.notes)}</div>` : ""}

        <div class="approvalsRow">
          <div class="approval">
            <div class="approvalTitle">Contractor Approval</div>
            <div class="approvalGrid">
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Contractor Signature</div>
              </div>
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Date</div>
              </div>
            </div>
          </div>

          <div class="approval">
            <div class="approvalTitle">Customer Approval</div>
            <div class="approvalGrid">
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Customer Signature</div>
              </div>
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Date</div>
              </div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div>${esc(brandName)}</div>
          <div>${esc(new Date().toLocaleDateString())}</div>
        </div>
      </body>
    </html>
  `)

  win.document.close()
  win.focus()
  win.print()
  win.close()
}

  function makeInvoiceNo() {
  // simple + unique enough for now
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const rand = Math.floor(Math.random() * 900 + 100)
  return `INV-${y}${m}${day}-${rand}`
}

function createInvoiceFromEstimate(est: EstimateHistoryItem) {
    const issue = new Date()

  const terms = companyProfile.paymentTerms?.trim() || "Net 7"
  const dueISO = computeDueDateISO(issue, terms)

  const client = est?.jobDetails?.clientName || jobDetails.clientName || "Client"
  const jobNm = est?.jobDetails?.jobName || jobDetails.jobName || "Job"
  const jobAddr = est?.jobDetails?.jobAddress || jobDetails.jobAddress || ""

    if (hasAnyInvoiceForEstimate(est.id)) {
    setStatus("An invoice already exists for this estimate.")
    return
  }

  const labor = Number(est?.pricing?.labor || 0)
  const materials = Number(est?.pricing?.materials || 0)
  const subs = Number(est?.pricing?.subs || 0)
  const markupPct = Number(est?.pricing?.markup || 0)

  // --- tax snapshot (from estimate history) ---
  const taxEnabledSnap = Boolean(est.tax?.enabled)
  const taxRateSnap = Number(est.tax?.rate || 0)

  // --- compute estimate totals (same logic as UI/PDF) ---
  const base = labor + materials + subs
  const markedUp = base * (1 + markupPct / 100)
  const taxAmt = taxEnabledSnap ? Math.round(markedUp * (taxRateSnap / 100)) : 0
  const estimateTotal = Math.round(markedUp + taxAmt)

  // --- deposit snapshot (from estimate history) ---
  const depEnabled = Boolean(est.deposit?.enabled)
  const depType = est.deposit?.type === "fixed" ? "fixed" : "percent"
  const depValue = Number(est.deposit?.value || 0)

  // deposit is computed from the estimate TOTAL (including tax)
  let depDue = 0
  if (depEnabled && estimateTotal > 0) {
    if (depType === "percent") {
      const pct = Math.max(0, Math.min(100, depValue))
      depDue = Math.round(estimateTotal * (pct / 100))
    } else {
      depDue = Math.min(estimateTotal, Math.round(Math.max(0, depValue)))
    }
  }
  const depRemain = Math.max(0, estimateTotal - depDue)

  // --- build line items ---
  const lineItems: { label: string; amount: number }[] = []

  if (depEnabled) {
    // Deposit invoice: customer pays ONLY deposit now
    const label =
      depType === "percent"
        ? `Deposit (${Math.max(0, Math.min(100, depValue))}% of total)`
        : `Deposit (fixed amount)`
    lineItems.push({ label, amount: depDue })
  } else {
    // Full invoice: show full breakdown + tax line
    if (labor) lineItems.push({ label: "Labor", amount: labor })
    if (materials) lineItems.push({ label: "Materials", amount: materials })
    if (subs) lineItems.push({ label: "Other / Mobilization", amount: subs })

    // If you want a visible tax line item (recommended)
    if (taxEnabledSnap) {
      lineItems.push({ label: `Sales Tax (${taxRateSnap}%)`, amount: taxAmt })
    }
  }

  const inv: Invoice = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    jobId: est.jobId,
    fromEstimateId: est.id,
    invoiceNo: makeInvoiceNo(),
    issueDate: toISODate(issue),
    dueDate: dueISO,
    billToName: client,
    jobName: jobNm,
    jobAddress: jobAddr,
    lineItems,

    // subtotal is what’s shown before total-due line; for deposit invoice it’s the deposit
    subtotal: depEnabled ? depDue : Math.round(markedUp),
    total: depEnabled ? depDue : estimateTotal,

    notes: depEnabled
      ? `Deposit invoice. Estimate total (incl. tax if applied): $${estimateTotal.toLocaleString()}. Remaining balance after deposit: $${depRemain.toLocaleString()}. Payment terms: ${
          companyProfile.paymentTerms?.trim() || "Due upon approval."
        }`
      : `Payment terms: ${companyProfile.paymentTerms?.trim() || "Due upon approval."}`,

      status: "draft",
      paidAt: undefined,

    deposit: depEnabled
      ? {
          enabled: true,
          type: depType,
          value: depValue,
          depositDue: depDue,
          remainingBalance: depRemain,
          estimateTotal,
        }
      : undefined,
  }

  setInvoices((prev) => [inv, ...prev])
  setStatus(`Invoice created: ${inv.invoiceNo}`)
}

// ✅ Create Balance Invoice (Remaining Balance after Deposit)
function createBalanceInvoiceFromEstimate(est: EstimateHistoryItem) {
  const issue = new Date()
  const terms = companyProfile.paymentTerms?.trim() || "Net 7"
  const dueISO = computeDueDateISO(issue, terms)

  const client = est?.jobDetails?.clientName || jobDetails.clientName || "Client"
  const jobNm = est?.jobDetails?.jobName || jobDetails.jobName || "Job"
  const jobAddr = est?.jobDetails?.jobAddress || jobDetails.jobAddress || ""

    if (hasBalanceInvoiceForEstimate(est.id)) {
    setStatus("A balance invoice already exists for this estimate.")
    return
  }

  const labor = Number(est?.pricing?.labor || 0)
  const materials = Number(est?.pricing?.materials || 0)
  const subs = Number(est?.pricing?.subs || 0)
  const markupPct = Number(est?.pricing?.markup || 0)

  // --- tax snapshot (from estimate history) ---
  const taxEnabledSnap = Boolean(est.tax?.enabled)
  const taxRateSnap = Number(est.tax?.rate || 0)

  // --- compute estimate totals (same logic as UI/PDF) ---
  const base = labor + materials + subs
  const markedUp = base * (1 + markupPct / 100)
  const taxAmt = taxEnabledSnap ? Math.round(markedUp * (taxRateSnap / 100)) : 0
  const estimateTotal = Math.round(markedUp + taxAmt)

  // --- deposit snapshot (from estimate history) ---
  const depEnabled = Boolean(est.deposit?.enabled)
  const depType = est.deposit?.type === "fixed" ? "fixed" : "percent"
  const depValue = Number(est.deposit?.value || 0)

  // deposit is computed from the estimate TOTAL (including tax)
  let depDue = 0
  if (depEnabled && estimateTotal > 0) {
    if (depType === "percent") {
      const pct = Math.max(0, Math.min(100, depValue))
      depDue = Math.round(estimateTotal * (pct / 100))
    } else {
      depDue = Math.min(estimateTotal, Math.round(Math.max(0, depValue)))
    }
  }

  const balanceDue = Math.max(0, estimateTotal - depDue)

  // ✅ Guardrails (avoid creating nonsense invoices)
  if (!depEnabled) {
    setStatus("No deposit was set on this estimate — use Create Invoice instead.")
    return
  }
  if (balanceDue <= 0) {
    setStatus("Remaining balance is $0 — nothing to invoice.")
    return
  }

  const lineItems: { label: string; amount: number }[] = [
    { label: "Remaining Balance", amount: balanceDue },
  ]

  const inv: Invoice = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    jobId: est.jobId,
    fromEstimateId: est.id,
    invoiceNo: makeInvoiceNo(),
    issueDate: toISODate(issue),
    dueDate: dueISO,
    billToName: client,
    jobName: jobNm,
    jobAddress: jobAddr,
    lineItems,
    subtotal: balanceDue,
    total: balanceDue,

    notes: `Balance invoice. Estimate total (incl. tax if applied): $${estimateTotal.toLocaleString()}. Deposit paid/required: $${depDue.toLocaleString()}. Remaining balance due: $${balanceDue.toLocaleString()}. Payment terms: ${
      companyProfile.paymentTerms?.trim() || "Due upon approval."
    }`,

    status: "draft",
    paidAt: undefined,

    // keep deposit context so PDF can optionally show it
    deposit: {
      enabled: true,
      type: depType,
      value: depValue,
      depositDue: depDue,
      remainingBalance: balanceDue,
      estimateTotal,
    },
  }

  setInvoices((prev) => [inv, ...prev])
  setStatus(`Balance invoice created: ${inv.invoiceNo}`)
}

const isUserEdited = pricingEdited === true

const displayedConfidence = (() => {
  const base = priceGuard?.confidence ?? null
  if (base == null) return null
  if (!pricingEdited) return base
  return Math.max(0, Math.min(99, base - 20))
})()

const pdfShowPriceGuard =
  !isUserEdited &&
  (priceGuard?.status === "verified" ||
   priceGuard?.status === "adjusted" ||
   priceGuard?.status === "deterministic")
const pdfEdited = isUserEdited

const pdfPriceGuardLabel =
  priceGuard?.status === "verified" ? "PriceGuard™ Verified" :
  priceGuard?.status === "adjusted" ? "PriceGuard™ Adjusted" :
  priceGuard?.status === "deterministic" ? "PriceGuard™ Deterministic" :
  "PriceGuard™"

function PriceGuardBadge() {
  if (!result) return null // only show after generation

  const pgStatus = priceGuard?.status ?? (priceGuardVerified ? "verified" : "ai")

  const label =
  pricingEdited ? "PriceGuard™ Override" :
  pgStatus === "verified" ? "PriceGuard™ Verified" :
  pgStatus === "adjusted" ? "PriceGuard™ Adjusted" :
  pgStatus === "deterministic" ? "PriceGuard™ Deterministic" :
  pgStatus === "review" ? "Review Recommended" :
  "AI Estimate"

const sub =
  pricingEdited ? "Pricing adjusted manually" :
  pgStatus === "verified" ? "Pricing validated by deterministic safeguards" :
  pgStatus === "adjusted" ? "AI pricing lifted to deterministic safety floors" :
  pgStatus === "deterministic" ? "Deterministic pricing engine applied" :
  pgStatus === "review" ? "Some details were inferred — review recommended" :
  "Pricing relied primarily on AI — add quantities for stronger protection"

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      data-priceguard
    >
      <button
        type="button"
        onClick={() => setShowPriceGuardDetails((v) => !v)}
        style={{
          border: "1px solid #e5e7eb",
          background:
  pricingEdited ? "#f3f4f6" :
  pgStatus === "verified" ? "#ecfdf5" :
  pgStatus === "adjusted" ? "#fffbeb" :
  pgStatus === "deterministic" ? "#eef2ff" :
  pgStatus === "review" ? "#fff7ed" :
  "#f3f4f6",
          color: "#111",
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        title={sub}
      >
        
        <span aria-hidden="true">
  {priceGuardVerified ? "✅" : isUserEdited ? "✏️" : pricingSource === "deterministic" ? "🧠" : "ℹ️"}
</span>

        <span style={{ fontWeight: 800 }}>{label}</span>

        {displayedConfidence != null && (
  <span style={{ fontWeight: 700, color: "#444" }}>
    {displayedConfidence}%
  </span>
)}
      </button>

      {showPriceGuardDetails && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            width: 320,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
            zIndex: 999,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13 }}>
   PriceGuard™ Verification
</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
            {sub}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
  {priceGuardVerified ? (
    <>
      <div>• ✔ Scope quantities verified</div>
      <div>• ✔ Trade minimums applied</div>
      <div>• ✔ Common pricing risks screened</div>
    </>
  ) : (
    <>
      <div>• ℹ️ Pricing generated from the scope provided</div>
      <div>• ✔ Standard checks applied</div>
      <div>• ℹ️ Add more detail (or measurements) for stronger verification</div>
    </>
  )}

  {state ? (
    <div>• ✔ Regional labor rates adjusted ({state})</div>
  ) : (
    <div>• ℹ️ Regional labor rates: national baseline</div>
  )}

  {effectivePaintScope === "doors_only" && (
    <div>• ✔ Doors-only scope detected (includes casing/frames)</div>
  )}

  {isMixedPaintScope && (
    <div>• ✔ Mixed scope detected (rooms + doors)</div>
  )}
</div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#333" }}>
            {effectivePaintScope === "doors_only" && (
              <div style={{ marginTop: 6 }}>
                ⚙️ Doors-only detected — pricing locked to door logic.
              </div>
            )}

            {isMixedPaintScope && (
              <div style={{ marginTop: 6 }}>
                ⚙️ Mixed scope detected — rooms and doors priced separately.
              </div>
            )}

            {isUserEdited ? (
  <div style={{ marginTop: 6 }}>
    ✏️ Pricing was manually edited after generation.
  </div>
) : !priceGuardVerified ? (
  <div style={{ marginTop: 6 }}>
    ℹ️ Tip: add quantities, measurements, and the job state for a more
    precise verified price.
  </div>
) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowPriceGuardDetails(false)}
            style={{
              marginTop: 10,
              fontSize: 12,
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}
    </span>
  )
}

function ScheduleBlock({ schedule }: { schedule?: Schedule | null }) {
  if (!schedule) return null

  const { crewDays, visits, calendarDays, workDaysPerWeek, rationale } = schedule

  const hasAny =
    crewDays != null ||
    visits != null ||
    calendarDays != null ||
    workDaysPerWeek != null ||
    (rationale?.length ?? 0) > 0

  if (!hasAny) return null

  const calendarText =
    calendarDays ? `${calendarDays.min}–${calendarDays.max} calendar days` : null

  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Estimated Schedule</div>
        <div style={{ fontSize: 12, color: "#666" }}>
          {workDaysPerWeek ? `${workDaysPerWeek}-day workweek` : ""}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
          marginTop: 10,
        }}
      >
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Crew Time</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {crewDays != null ? `${crewDays} crew-days` : "—"}
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Site Visits</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {visits != null ? visits : "—"}
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Duration</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {calendarText ?? "—"}
          </div>
        </div>
      </div>

      {(rationale?.length ?? 0) > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            Scheduling considerations
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {rationale.map((r, idx) => (
              <li key={idx}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ScheduleEditor({
  schedule,
  setSchedule,
}: {
  schedule: Schedule
  setSchedule: React.Dispatch<React.SetStateAction<Schedule | null>>
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
        Edit Schedule
      </div>

      <label style={{ fontSize: 12 }}>Start Date (Optional)</label>
<input
  type="date"
  value={schedule.startDate ?? ""}
  onChange={(e) =>
    setSchedule((s) =>
      s ? { ...s, startDate: e.target.value } : s
    )
  }
  style={{ width: "100%", padding: 8, marginBottom: 8 }}
/>

      {/* Crew Days */}
      <label style={{ fontSize: 12 }}>Crew Days</label>
      <input
        type="number"
        value={schedule.crewDays ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? { ...s, crewDays: e.target.value === "" ? null : Number(e.target.value) }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Visits */}
      <label style={{ fontSize: 12 }}>Site Visits</label>
      <input
        type="number"
        value={schedule.visits ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? { ...s, visits: e.target.value === "" ? null : Number(e.target.value) }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Work Week */}
      <label style={{ fontSize: 12 }}>Work Days Per Week</label>
      <input
        type="number"
        value={schedule.workDaysPerWeek ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? {
                  ...s,
                  workDaysPerWeek:
                    e.target.value === "" ? null : Number(e.target.value),
                }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Calendar Days */}
      <label style={{ fontSize: 12 }}>Calendar Days (Min)</label>
      <input
        type="number"
        value={schedule.calendarDays?.min ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? {
                  ...s,
                  calendarDays: {
                    ...(s.calendarDays ?? { min: 0, max: 0 }),
                    min: e.target.value === "" ? 0 : Number(e.target.value),
                  },
                }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      <label style={{ fontSize: 12 }}>Calendar Days (Max)</label>
      <input
        type="number"
        value={schedule.calendarDays?.max ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? {
                  ...s,
                  calendarDays: {
                    ...(s.calendarDays ?? { min: 0, max: 0 }),
                    max: e.target.value === "" ? 0 : Number(e.target.value),
                  },
                }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Rationale */}
      <label style={{ fontSize: 12 }}>Scheduling Notes</label>
      {schedule.rationale.map((r, i) => (
        <input
          key={i}
          value={r}
          onChange={(e) =>
            setSchedule((s) =>
              s
                ? {
                    ...s,
                    rationale: s.rationale.map((x, idx) =>
                      idx === i ? e.target.value : x
                    ),
                  }
                : s
            )
          }
          style={{ width: "100%", padding: 8, marginBottom: 6 }}
        />
      ))}

      <button
        type="button"
        onClick={() =>
          setSchedule((s) =>
            s ? { ...s, rationale: [...s.rationale, ""] } : s
          )
        }
        style={{ fontSize: 12, marginTop: 6 }}
      >
        + Add Note
      </button>
    </div>
  )
}

  // -------------------------
  // UI
  // -------------------------
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "60px auto",
        padding: 32,
        fontFamily: "system-ui",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#fff",
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
    >
     <h1 style={{ marginBottom: 4 }}>JobEstimate Pro</h1>
<p
  style={{
    marginTop: 0,
    marginBottom: 20,
    fontSize: 15,
    letterSpacing: "0.2px",
    color: "#555",
  }}
>
  Professional change orders & estimates — generated instantly.
</p>

{!paid && (
  <div style={{ marginBottom: 12 }}>
    {remaining > 0 ? (
      <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
        Free uses remaining: <strong>{remaining}</strong> / {FREE_LIMIT}
      </p>
    ) : (
      <p style={{ fontSize: 13, color: "#c53030", margin: 0 }}>
        Free uses are up. Upgrade for unlimited access.
      </p>
    )}
  </div>
)}

      <input
  type="email"
  placeholder="Enter your email to generate documents"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  onBlur={checkEntitlementNow}
  style={{ width: "100%", padding: 8 }}
/>

<p
  style={{
    fontSize: 12,
    color: "#c53030",
    marginTop: 4,
    marginBottom: 12,
  }}
  title="Email is required to generate documents"
>
  * Required
</p>

{/* -------------------------
    ⚙️ Business Settings (Collapsed)
------------------------- */}
<details
  style={{
    marginTop: 18,
    marginBottom: 8,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  }}
>
  <summary
    style={{
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 14,
    }}
  >
    ⚙️ Business Settings
  </summary>

  <div style={{ marginTop: 10 }}>
    <h3>Company Profile</h3>

    {["name", "address", "phone", "email"].map((f) => (
      <input
        key={f}
        placeholder={f}
        value={(companyProfile as any)[f]}
        onChange={(e) =>
          setCompanyProfile({
            ...companyProfile,
            [f]: e.target.value,
          })
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
    ))}

    <label style={{ fontSize: 13, fontWeight: 600 }}>
      Company Logo (optional)
    </label>

    <input
      type="file"
      accept="image/*"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onloadend = () => {
          setCompanyProfile((prev) => ({
            ...prev,
            logo: reader.result as string,
          }))
        }
        reader.readAsDataURL(file)
      }}
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    {companyProfile.logo && (
      <img
        src={companyProfile.logo}
        alt="Company logo preview"
        style={{
          maxHeight: 60,
          marginBottom: 12,
          objectFit: "contain",
        }}
      />
    )}

    <input
      placeholder="Contractor License # (optional)"
      value={(companyProfile as any).license || ""}
      onChange={(e) =>
        setCompanyProfile({
          ...companyProfile,
          license: e.target.value,
        })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <textarea
      placeholder="Default payment terms (optional) — shown on PDFs & invoices"
      value={companyProfile.paymentTerms}
      onChange={(e) =>
        setCompanyProfile({
          ...companyProfile,
          paymentTerms: e.target.value,
        })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8, height: 70 }}
    />
  </div>
</details>

{/* -------------------------
    🧾 Job Details (Collapsed)
------------------------- */}
<details
  style={{
    marginTop: 18,
    marginBottom: 8,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  }}
>
  <summary
    style={{
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 14,
    }}
  >
    🧾 Job Details
  </summary>

  <div style={{ marginTop: 10 }}>
    <input
      placeholder="Client name"
      value={jobDetails.clientName}
      onChange={(e) =>
        setJobDetails({ ...jobDetails, clientName: e.target.value })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <input
      placeholder="Job / Project name"
      value={jobDetails.jobName}
      onChange={(e) =>
        setJobDetails({ ...jobDetails, jobName: e.target.value })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <input
      placeholder="Job address (optional)"
      value={jobDetails.jobAddress}
      onChange={(e) =>
        setJobDetails({ ...jobDetails, jobAddress: e.target.value })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <input
        placeholder="Change Order # (optional)"
        value={jobDetails.changeOrderNo}
        onChange={(e) =>
          setJobDetails({ ...jobDetails, changeOrderNo: e.target.value })
        }
        style={{ width: "100%", padding: 8 }}
      />
      <input
        type="date"
        value={jobDetails.date}
        onChange={(e) =>
          setJobDetails({ ...jobDetails, date: e.target.value })
        }
        style={{ width: "100%", padding: 8 }}
      />
    </div>

    <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
      Tip: leave the date blank to auto-fill today on the PDF.
    </p>
  </div>
</details>
     
      <p style={{ marginTop: 12, fontWeight: 600 }}>Trade Type</p>
<select
  value={trade}
  onChange={(e) => setTrade(normalizeTrade(e.target.value))}
  style={{ width: "100%", padding: 10, marginTop: 6 }}
>
  <option value="">Auto-detect</option>
  <option value="painting">Painting</option>
  <option value="drywall">Drywall</option>
  <option value="flooring">Flooring</option>
  <option value="electrical">Electrical</option>
  <option value="plumbing">Plumbing</option>
  <option value="bathroom_tile">Bathroom / Tile</option>
  <option value="carpentry">Carpentry</option>
  <option value="general_renovation">General Renovation</option>
</select>

{showPaintScope && (
  <div style={{ marginTop: 12 }}>
    <p style={{ marginTop: 0, fontWeight: 600 }}>
      {effectivePaintScope === "doors_only"
        ? "Paint Scope: Doors only (auto-detected)"
        : "Paint Scope"}
    </p>

    <select
      value={effectivePaintScope === "doors_only" ? "walls" : paintScope}
      disabled={effectivePaintScope === "doors_only"}
      onChange={(e) => setPaintScope(e.target.value as any)}
      style={{
        width: "100%",
        padding: 10,
        marginTop: 6,
        opacity: effectivePaintScope === "doors_only" ? 0.6 : 1,
        cursor: effectivePaintScope === "doors_only" ? "not-allowed" : "pointer",
      }}
    >
      {PAINT_SCOPE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>

    {effectivePaintScope === "doors_only" ? (
      <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Scope was automatically detected as doors-only based on your description.
      </p>
    ) : (
      <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        This controls whether ceilings / trim / doors are included.
      </p>
    )}
  </div>
)}


      <p style={{ marginTop: 12, fontWeight: 600 }}>Job State</p>
<select
  value={state}
  onChange={(e) => setState(e.target.value)}
  style={{
    width: "100%",
    padding: 10,
    marginTop: 6,
    borderRadius: 6,
    border: "1px solid #ccc",
  }}
>
  <option value="">Select state</option>
  <option value="AL">Alabama</option>
  <option value="AK">Alaska</option>
  <option value="AZ">Arizona</option>
  <option value="AR">Arkansas</option>
  <option value="CA">California</option>
  <option value="CO">Colorado</option>
  <option value="CT">Connecticut</option>
  <option value="DE">Delaware</option>
  <option value="FL">Florida</option>
  <option value="GA">Georgia</option>
  <option value="HI">Hawaii</option>
  <option value="ID">Idaho</option>
  <option value="IL">Illinois</option>
  <option value="IN">Indiana</option>
  <option value="IA">Iowa</option>
  <option value="KS">Kansas</option>
  <option value="KY">Kentucky</option>
  <option value="LA">Louisiana</option>
  <option value="ME">Maine</option>
  <option value="MD">Maryland</option>
  <option value="MA">Massachusetts</option>
  <option value="MI">Michigan</option>
  <option value="MN">Minnesota</option>
  <option value="MS">Mississippi</option>
  <option value="MO">Missouri</option>
  <option value="MT">Montana</option>
  <option value="NE">Nebraska</option>
  <option value="NV">Nevada</option>
  <option value="NH">New Hampshire</option>
  <option value="NJ">New Jersey</option>
  <option value="NM">New Mexico</option>
  <option value="NY">New York</option>
  <option value="NC">North Carolina</option>
  <option value="ND">North Dakota</option>
  <option value="OH">Ohio</option>
  <option value="OK">Oklahoma</option>
  <option value="OR">Oregon</option>
  <option value="PA">Pennsylvania</option>
  <option value="RI">Rhode Island</option>
  <option value="SC">South Carolina</option>
  <option value="SD">South Dakota</option>
  <option value="TN">Tennessee</option>
  <option value="TX">Texas</option>
  <option value="UT">Utah</option>
  <option value="VT">Vermont</option>
  <option value="VA">Virginia</option>
  <option value="WA">Washington</option>
  <option value="WV">West Virginia</option>
  <option value="WI">Wisconsin</option>
  <option value="WY">Wyoming</option>
  <option value="DC">District of Columbia</option>
</select>

{/* -------------------------
    Invoices
------------------------- */}
{filteredInvoices.length > 0 && (
  <div
    ref={invoicesSectionRef}
    style={{
      marginTop: 18,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      background: "#fff",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <h3 style={{ margin: 0 }}>Invoices</h3>
      <button
        type="button"
        onClick={() => {
  setInvoices([])
  localStorage.setItem(INVOICE_KEY, JSON.stringify([]))
  setStatus("All invoices cleared.")
}}
        style={{ fontSize: 12 }}
      >
        Clear all
      </button>
    </div>

    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      {filteredInvoices.map((inv) => (
        <div
          key={inv.id}
          style={{
            padding: 10,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
  <div style={{ fontWeight: 700 }}>{inv.invoiceNo}</div>

  {computeLiveInvoiceStatus(inv) === "paid" && (
  <span
    style={{
      fontSize: 11,
      fontWeight: 800,
      padding: "3px 8px",
      borderRadius: 999,
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#065f46",
    }}
  >
    PAID
  </span>
)}
</div>
              <div style={{ marginTop: 6 }}>
  <span
    style={{
      display: "inline-block",
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      border: "1px solid #e5e7eb",
      background:
        computeLiveInvoiceStatus(inv) === "paid"
          ? "#ecfdf5"
          : computeLiveInvoiceStatus(inv) === "overdue"
          ? "#fff5f5"
          : "#f3f4f6",
      color:
        computeLiveInvoiceStatus(inv) === "paid"
          ? "#065f46"
          : computeLiveInvoiceStatus(inv) === "overdue"
          ? "#9b1c1c"
          : "#111827",
    }}
  >
    {computeLiveInvoiceStatus(inv).toUpperCase()}
  </span>
</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
  {inv.billToName} • Due {new Date(inv.dueDate).toLocaleDateString()}
</div>

{computeLiveInvoiceStatus(inv) === "paid" && inv.paidAt && (
  <div style={{ fontSize: 12, color: "#065f46", marginTop: 4 }}>
    Paid on {new Date(inv.paidAt).toLocaleDateString()}
  </div>
)}
              <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>
                Total Due: <strong>${Number(inv.total || 0).toLocaleString()}</strong>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" onClick={() => downloadInvoicePDF(inv)}>
                Download Invoice PDF
              </button>

              <button
  type="button"
  onClick={() => {
    const live = computeLiveInvoiceStatus(inv)
    if (live === "paid") {
      updateInvoice(inv.id, { status: "sent", paidAt: undefined })
      setStatus(`Marked unpaid: ${inv.invoiceNo}`)
    } else {
      updateInvoice(inv.id, { status: "paid", paidAt: Date.now() })
      setStatus(`Marked paid: ${inv.invoiceNo}`)
    }
  }}
  style={{ fontSize: 12 }}
>
  {computeLiveInvoiceStatus(inv) === "paid" ? "Mark Unpaid" : "Mark Paid"}
</button>

              <button
                type="button"
                onClick={() =>
                  setInvoices((prev) => {
  const next = prev.filter((x) => x.id !== inv.id)
  localStorage.setItem(INVOICE_KEY, JSON.stringify(next))
  return next
})
                }
                style={{ fontSize: 12 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
     </div>
  </div>
)}

      <textarea
        placeholder="Describe the scope change…"
        value={scopeChange}
        onChange={(e) => setScopeChange(e.target.value)}
        style={{ width: "100%", height: 120, marginTop: 12 }}
      />

      {scopeQuality.score < 70 && (
  <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm">
    <div className="font-semibold">⚠ Scope may be incomplete</div>

    <ul className="mt-1 list-disc pl-5">
      {scopeQuality.warnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  </div>
)}

      <div
  style={{
    marginTop: 16,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    overflow: "visible",   // ✅ THIS LINE FIXES IT
  }}
>
  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <input
      type="checkbox"
      checked={measureEnabled}
      onChange={(e) => setMeasureEnabled(e.target.checked)}
    />
    <span style={{ fontWeight: 600 }}>Optional Measurements</span>
    <span style={{ fontSize: 12, color: "#666" }}>(helps pricing + detail)</span>
  </label>

  {measureEnabled && (
  <div
  style={{
    marginTop: 12,
    overflowX: "auto",
    overflowY: "visible",
    padding: 4,
  }}
>
      {measureRows.map((r, idx) => (
        <div
  key={idx}
  style={{
    display: "grid",
    gridTemplateColumns:
      "minmax(120px,1.2fr) minmax(90px,1fr) minmax(90px,1fr) minmax(70px,0.8fr) minmax(80px,auto)",
    gap: 10,           // ⬅️ slightly larger gap
    alignItems: "center",
    marginBottom: 12,
  }}
>
          <input
            value={r.label}
            onChange={(e) => {
              const next = [...measureRows]
              next[idx] = { ...next[idx], label: e.target.value }
              setMeasureRows(next)
            }}
            placeholder="Label (e.g., Wall A)"
            style={{ padding: 8, outlineOffset: 2 }}
          />

          <input
            type="number"
            value={r.lengthFt === 0 ? "" : r.lengthFt}
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value)
              const next = [...measureRows]
              next[idx] = { ...next[idx], lengthFt: val }
              setMeasureRows(next)
            }}
            placeholder="Length (ft)"
            style={{ padding: 8, outlineOffset: 2 }}
          />

          <input
            type="number"
            value={r.heightFt === 0 ? "" : r.heightFt}
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value)
              const next = [...measureRows]
              next[idx] = { ...next[idx], heightFt: val }
              setMeasureRows(next)
            }}
            placeholder="Height (ft)"
            style={{ padding: 8, outlineOffset: 2 }}
          />

          <input
            type="number"
            value={r.qty}
            min={1}
            onChange={(e) => {
              const val = e.target.value === "" ? 1 : Number(e.target.value)
              const next = [...measureRows]
              next[idx] = { ...next[idx], qty: Math.max(1, val) }
              setMeasureRows(next)
            }}
            placeholder="Qty"
            style={{ padding: 8, outlineOffset: 2 }}
          />

          <div style={{ fontSize: 13, color: "#333", textAlign: "right" }}>
            <strong>{rowSqft(r)}</strong> sqft
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            {measureRows.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const next = measureRows.filter((_, i) => i !== idx)
                  setMeasureRows(next)
                }}
                style={{ fontSize: 12 }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={() =>
            setMeasureRows((rows) => [
              ...rows,
              {
                label: `Area ${rows.length + 1}`,
                lengthFt: 0,
                heightFt: 0,
                qty: 1,
              },
            ])
          }
        >
          + Add another area
        </button>

        <div style={{ fontSize: 13 }}>
          Total: <strong>{totalSqft}</strong> sqft
        </div>
      </div>
    </div>
  )}
</div>

      <button
  type="button"
  onClick={generate}
  disabled={loading}
  style={{
    width: "100%",
    padding: 12,
    marginTop: 12,
    fontSize: 16,
    background: loading ? "#555" : "#000",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: loading ? "not-allowed" : "pointer",
  }}
>
  {loading ? "Generating…" : "Generate"}
</button>
{status && (
  <p style={{ marginTop: 10, fontSize: 13, color: "#c53030" }}>
    {status}
  </p>
)}

{loading && (
  <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
    Generating professional document…
  </p>
)}

{/* -------------------------
    Jobs Dashboard
------------------------- */}
<div
  style={{
    marginTop: 14,
    marginBottom: 16,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  }}
>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
    <div>
      <h3 style={{ margin: 0 }}>Jobs</h3>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Select a job to keep estimates + invoices organized.
      </div>
    </div>

    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setActiveJobId("")}
        style={{ fontSize: 12 }}
      >
        View All
      </button>

      <button
        type="button"
        onClick={() => {
          const id = getOrCreateJobIdFromDetails()
          setActiveJobId(id)
          setStatus("Job selected.")
        }}
        style={{ fontSize: 12 }}
      >
        Create / Select from Job Details
      </button>
    </div>
  </div>

  <div style={{ marginTop: 10 }}>
    <label style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>
      Active Job
    </label>

    <select
      value={activeJobId}
      onChange={(e) => setActiveJobId(e.target.value)}
      style={{
        width: "100%",
        padding: 10,
        marginTop: 6,
        borderRadius: 10,
        border: "1px solid #ddd",
      }}
    >
      <option value="">All jobs</option>
      {jobs
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((j) => (
          <option key={j.id} value={j.id}>
            {(j.jobName || "Untitled Job") +
              (j.clientName ? ` — ${j.clientName}` : "")}
          </option>
        ))}
    </select>
  </div>

  <div
  style={{
    marginTop: 10,
    padding: 10,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
  }}
>
  <div>
    <div style={{ fontSize: 12, fontWeight: 800, color: "#111" }}>
      Crew Capacity Settings
    </div>
    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
      Set how many crews you can run in parallel.
    </div>
  </div>

  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <span style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>
      Crews:
    </span>

    <input
  type="number"
  min={1}
  max={5}
  value={crewCount}
  onChange={(e) => {
    const raw = Number(e.target.value || 1)
    const next = Math.max(1, Math.min(5, Math.round(raw)))
    setCrewCount(next)
  }}
  style={{ width: 90, padding: 8 }}
/>

    <div style={{ fontSize: 12, color: "#111" }}>
      Weekly capacity: <strong>{crewCount * 6}</strong> crew-days
    </div>
  </div>
</div>

{(() => {
  const weeks = computeWeeklyCrewLoad()
  if (weeks.length === 0) return null

  const capacity = crewCount * 6

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 14 }}>
        Crew Loading Dashboard
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Weekly demand vs capacity using each job’s latest schedule start date and crew-days.
      </div>

      <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
        Capacity: <strong>{crewCount}</strong> crew{crewCount > 1 ? "s" : ""} × 6 days
        = <strong> {capacity}</strong> crew-days/week
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {weeks.map((w) => {
          const over = w.demandCrewDays > capacity
          const utilization =
            capacity > 0 ? Math.round((w.demandCrewDays / capacity) * 100) : 0

          return (
            <div
              key={w.weekStartISO}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #eee",
                background: over ? "#fff5f5" : "#f9fafb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  Week of {new Date(w.weekStartISO + "T00:00:00").toLocaleDateString()}
                </div>

                <div style={{ fontSize: 12 }}>
                  Demand: <strong>{w.demandCrewDays}</strong> / Capacity:{" "}
                  <strong>{capacity}</strong> • Utilization:{" "}
                  <strong>{utilization}%</strong>{" "}
                  {over ? (
                    <span style={{ color: "#9b1c1c", fontWeight: 900 }}>
                      • OVERLOADED
                    </span>
                  ) : (
                    <span style={{ color: "#065f46", fontWeight: 900 }}>
                      • OK
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {w.jobs.map((job, idx) => (
                  <div
                    key={`${w.weekStartISO}_${job.jobId}_${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      fontSize: 12,
                      padding: "6px 8px",
                      borderRadius: 8,
                      background: "#fff",
                      border: "1px solid #f0f0f0",
                    }}
                  >
                    <div style={{ color: "#111" }}>{job.jobName}</div>
                    <div style={{ fontWeight: 700 }}>{job.crewDays} crew-day{job.crewDays !== 1 ? "s" : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})()}

  {jobs.length === 0 ? (
    <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
      No jobs yet. Fill out Job Details and click <strong>Create / Select from Job Details</strong>.
    </div>
  ) : (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {jobs
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((j) => {
  const latest = latestEstimateForJob(j.id)
  const latestTotal = Number(latest?.pricing?.total || 0)
  const originalLocked = lockedOriginalEstimateForJob(j.id)

  const contract = computeJobContractSummary(j.id)
  const originalLockedTotal = contract.originalEstimateTotal
  const changeOrdersTotal = contract.changeOrdersTotal
  const currentContractValue = contract.currentContractValue
          const dep = latest?.deposit
          const depComputed = computeDepositFromEstimateTotal(latestTotal, dep)

          const invSum = invoiceSummaryForJob(j.id)
          
          const latestInv = latestInvoiceForJob(j.id)
          const profit = computeProfitSummary(j.id)
          const act = actualsForJob(j.id)

          const isActive = activeJobId === j.id

          return (
            <div
              key={j.id}
              style={{
                padding: 10,
                border: "1px solid #eee",
                borderRadius: 12,
                background: isActive ? "#f0f9ff" : "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 240, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>
                      {j.jobName || "Untitled Job"}
                    </div>
                    {isActive && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#dbeafe",
                          border: "1px solid #bfdbfe",
                          color: "#1e3a8a",
                        }}
                      >
                        Active
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {j.clientName ? `Client: ${j.clientName}` : "Client: —"}
                    {j.jobAddress ? ` • ${j.jobAddress}` : ""}
                  </div>

                  <div style={{ fontSize: 12, color: "#333", marginTop: 8, display: "grid", gap: 4 }}>
                    <div>
                      Latest Estimate: <strong>{latest ? money(latestTotal) : "—"}</strong>
                    </div>

                    <div>
  Original Estimate: <strong>{originalLocked ? money(originalLockedTotal) : "—"}</strong>
</div>

                    <div>
  Change Orders Total: <strong>{originalLocked ? money(changeOrdersTotal) : "—"}</strong>
</div>

<div>
  Current Contract Value: <strong>{originalLocked ? money(currentContractValue) : "—"}</strong>
</div>

<div>
  Budget Remaining (vs Outstanding):{" "}
  <strong>
    {originalLocked ? money(Math.max(0, currentContractValue - invSum.outstanding)) : "—"}
  </strong>
</div>

                    {latest?.deposit?.enabled ? (
                      <div>
                        Deposit / Remaining:{" "}
                        <strong>{money(depComputed.depositDue)}</strong> /{" "}
                        <strong>{money(depComputed.remaining)}</strong>
                      </div>
                    ) : (
                      <div>Deposit: <strong>—</strong></div>
                    )}

                    <div>
                      Invoices:{" "}
                      <strong>{invSum.total}</strong>{" "}
                      <span style={{ fontSize: 12, color: "#666" }}>
                        ({invSum.draftCount} draft • {invSum.paidCount} paid • {invSum.overdueCount} overdue • {invSum.openCount} open)
                      </span>
                    </div>

                    <div style={{ color: invSum.overdueCount > 0 ? "#9b1c1c" : "#111" }}>
                      Outstanding: <strong>{money(invSum.outstanding)}</strong>
                      {invSum.overdueCount > 0 ? (
                        <span style={{ fontSize: 12, color: "#9b1c1c" }}> • overdue</span>
                      ) : null}
                    </div>
                  </div>

                  <div
  style={{
    marginTop: 8,
    padding: 10,
    border: "1px solid #eee",
    borderRadius: 10,
    background: "#fff",
  }}
>
  <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>
    Profit Tracking
  </div>

  <div style={{ fontSize: 12, marginTop: 6 }}>
    Budget Total: <strong>{money(profit.budgetTotal)}</strong>
  </div>

  <div style={{ fontSize: 12 }}>
    Actual Costs: <strong>{money(profit.actTotal)}</strong>
  </div>

  <div style={{ fontSize: 12, marginTop: 4 }}>
    Profit:{" "}
    <strong
      style={{
        color: profit.profit >= 0 ? "#065f46" : "#9b1c1c",
      }}
    >
      {money(profit.profit)}
    </strong>{" "}
    <span style={{ color: "#666" }}>({profit.marginPct}% margin)</span>
  </div>

  <details style={{ marginTop: 8 }}>
    <summary style={{ cursor: "pointer", fontSize: 12 }}>
      Edit actual costs
    </summary>

    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <input
        type="number"
        placeholder="Labor actual ($)"
        value={act?.labor ?? 0}
        onChange={(e) =>
          upsertActuals(j.id, {
            labor: e.target.value === "" ? 0 : Number(e.target.value),
          })
        }
        style={{ width: "100%", padding: 8 }}
      />

      <input
        type="number"
        placeholder="Materials actual ($)"
        value={act?.materials ?? 0}
        onChange={(e) =>
          upsertActuals(j.id, {
            materials: e.target.value === "" ? 0 : Number(e.target.value),
          })
        }
        style={{ width: "100%", padding: 8 }}
      />

      <input
        type="number"
        placeholder="Subs / other actual ($)"
        value={act?.subs ?? 0}
        onChange={(e) =>
          upsertActuals(j.id, {
            subs: e.target.value === "" ? 0 : Number(e.target.value),
          })
        }
        style={{ width: "100%", padding: 8 }}
      />

      <textarea
        placeholder="Notes (optional)"
        value={act?.notes ?? ""}
        onChange={(e) => upsertActuals(j.id, { notes: e.target.value })}
        style={{ width: "100%", padding: 8, height: 60 }}
      />

      <div style={{ fontSize: 11, color: "#666" }}>
        Last updated:{" "}
        <strong>
          {act?.updatedAt ? new Date(act.updatedAt).toLocaleString() : "—"}
        </strong>
      </div>
    </div>
  </details>
</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveJobId(j.id)
                      setStatus("Job selected.")
                    }}
                  >
                    Select Job
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setJobDetails((prev) => ({
                        ...prev,
                        clientName: j.clientName || prev.clientName,
                        jobName: j.jobName || prev.jobName,
                        jobAddress: j.jobAddress || prev.jobAddress,
                        changeOrderNo: j.changeOrderNo || prev.changeOrderNo,
                      }))
                      setActiveJobId(j.id)
                      setStatus("Job details loaded into the form.")
                    }}
                    style={{ fontSize: 12 }}
                  >
                    Load into Form
                  </button>

                  <div style={{ display: "grid", gap: 6, marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => selectJobAndJumpToInvoices(j.id)}
                      style={{ fontSize: 12 }}
                    >
                      View Invoices
                    </button>

                    <button
                      type="button"
                      onClick={() => createInvoiceFromLatestEstimate(j.id)}
                      style={{ fontSize: 12 }}
                    >
                      Create Invoice (Latest Estimate)
                    </button>

                    <button
                      type="button"
                      onClick={() => createBalanceInvoiceFromLatestEstimate(j.id)}
                      disabled={!latest || !latest?.deposit?.enabled}
                      style={{
                        fontSize: 12,
                        opacity: !latest || !latest?.deposit?.enabled ? 0.6 : 1,
                        cursor: !latest || !latest?.deposit?.enabled ? "not-allowed" : "pointer",
                      }}
                      title={
                        !latest
                          ? "No estimate found yet."
                          : !latest?.deposit?.enabled
                          ? "Deposit is not enabled on the latest estimate."
                          : "Create an invoice for the remaining balance after deposit."
                      }
                    >
                      Create Balance Invoice
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!latestInv) {
                          setStatus("No invoices found for this job yet.")
                          return
                        }
                        downloadInvoicePDF(latestInv)
                        setStatus("Downloading latest invoice PDF.")
                      }}
                      disabled={!latestInv}
                      style={{
                        fontSize: 12,
                        opacity: latestInv ? 1 : 0.6,
                        cursor: latestInv ? "pointer" : "not-allowed",
                      }}
                    >
                      Download Latest Invoice PDF
                    </button>
                  </div>

                  <details style={{ marginTop: 2 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12 }}>
                      Edit job
                    </summary>

                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      <input
                        placeholder="Client name"
                        value={j.clientName || ""}
                        onChange={(e) => updateJob(j.id, { clientName: e.target.value })}
                        style={{ width: "100%", padding: 8 }}
                      />
                      <input
                        placeholder="Job name"
                        value={j.jobName || ""}
                        onChange={(e) => updateJob(j.id, { jobName: e.target.value })}
                        style={{ width: "100%", padding: 8 }}
                      />
                      <input
                        placeholder="Job address"
                        value={j.jobAddress || ""}
                        onChange={(e) => updateJob(j.id, { jobAddress: e.target.value })}
                        style={{ width: "100%", padding: 8 }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          deleteJob(j.id)
                          setStatus("Job deleted.")
                        }}
                        style={{ fontSize: 12 }}
                      >
                        Delete Job (and linked estimates/invoices)
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )
        })}
    </div>
  )}
</div>

{/* -------------------------
    Saved History
------------------------- */}
{filteredHistory.length > 0 && (
  <div
    style={{
      marginTop: 18,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      background: "#fff",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <h3 style={{ margin: 0 }}>Saved Estimates</h3>
      <button type="button" onClick={clearHistory} style={{ fontSize: 12 }}>
        Clear all
      </button>
    </div>

    <p style={{ marginTop: 6, marginBottom: 10, fontSize: 12, color: "#666" }}>
      Click “Load” to restore an estimate and download the PDF again.
    </p>

    <div style={{ display: "grid", gap: 10 }}>
      {filteredHistory.map((h) => (
        <div
          key={h.id}
          style={{
            padding: 10,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
  <div style={{ fontWeight: 700 }}>
    {h.jobDetails.jobName || "Untitled Job"}
  </div>

  <span
    style={{
      fontSize: 11,
      fontWeight: 800,
      padding: "3px 8px",
      borderRadius: 999,
      background: h.approval?.status === "approved" ? "#ecfdf5" : "#f3f4f6",
      border: "1px solid #e5e7eb",
      color: h.approval?.status === "approved" ? "#065f46" : "#444",
    }}
  >
    {h.approval?.status === "approved" ? "APPROVED" : "PENDING APPROVAL"}
  </span>
</div>
             <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
  {h.jobDetails.clientName ? `Client: ${h.jobDetails.clientName} • ` : ""}
  {h.documentType} • {new Date(h.createdAt).toLocaleString()}
</div>
              <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>
  Total: <strong>${Number(h.pricing.total || 0).toLocaleString()}</strong>
</div>

<div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
  Invoice Status:{" "}
  <strong>
    {hasAnyInvoiceForEstimate(h.id) ? "Invoice Created" : "No Invoice Yet"}
  </strong>
</div>
              {h.approval?.status === "approved" && (
  <div style={{ fontSize: 12, color: "#065f46", marginTop: 4 }}>
    Approved by {h.approval?.approvedBy || "Client"}
    {h.approval?.approvedAt
      ? ` on ${new Date(h.approval.approvedAt).toLocaleString()}`
      : ""}
  </div>
)}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

<button
  type="button"
  onClick={() => {
    const url = `${window.location.origin}/approve/${h.id}`
    navigator.clipboard.writeText(url)
    setStatus("Approval link copied to clipboard.")
  }}
  style={{ fontSize: 12 }}
>
  Copy Approval Link
</button>

              <button type="button" onClick={() => loadHistoryItem(h)}>
                Load
              </button>

              <button
  type="button"
  onClick={() => createInvoiceFromEstimate(h)}
  disabled={hasAnyInvoiceForEstimate(h.id)}
  style={{
    fontSize: 12,
    opacity: hasAnyInvoiceForEstimate(h.id) ? 0.6 : 1,
    cursor: hasAnyInvoiceForEstimate(h.id) ? "not-allowed" : "pointer",
  }}
>
  {hasAnyInvoiceForEstimate(h.id) ? "Invoice Created" : "Create Invoice"}
</button>

              <button
  type="button"
  onClick={() => createBalanceInvoiceFromEstimate(h)}
  style={{ fontSize: 12 }}
>
  Create Balance Invoice
</button>
              
              <button
                type="button"
                onClick={() => deleteHistoryItem(h.id)}
                style={{ fontSize: 12 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

{result && (
  <div
    style={{
      marginTop: 24,
      padding: 16,
      background: "#f5f5f5",
      borderRadius: 8,
      whiteSpace: "pre-wrap",
      lineHeight: 1.6,
      fontSize: 15,
    }}
  >
    <h3 style={{ marginBottom: 8 }}>
      Generated {documentType}
    </h3>

    <p
  style={{
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
  }}
>
  Generated from the scope provided.
</p>

{pricingMemory && (
  <div
    style={{
      marginTop: 12,
      marginBottom: 14,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      background: "#fafafa",
    }}
  >
    <div style={{ fontWeight: 700 }}>
      Smart Pricing Insight
    </div>

    <div style={{ fontSize: 14, marginTop: 6 }}>
      Based on {pricingMemory.jobCount} similar {pricingMemory.trade} jobs
      you estimated before.
    </div>

    <div style={{ marginTop: 6 }}>
      Typical range:{" "}
      <b>
        ${pricingMemory.minPrice.toLocaleString()} – ${pricingMemory.maxPrice.toLocaleString()}
      </b>
    </div>

    <div style={{ marginTop: 4 }}>
      Average: <b>${pricingMemory.avgPrice.toLocaleString()}</b>
    </div>

    {smartSuggestedPrice && (
  <div
    style={{
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      background: "#eff6ff",
      border: "1px solid #93c5fd",
      color: "#1e3a8a",
      fontSize: 14,
    }}
  >
    <div style={{ fontWeight: 700 }}>Suggested Price</div>

    <div style={{ marginTop: 4 }}>
      <b>${smartSuggestedPrice.toLocaleString()}</b>
    </div>

    {smartPricingReasons.length > 0 && (
      <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
        {smartPricingReasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    )}

    <button
      type="button"
      onClick={applySuggestedPrice}
      style={{
        marginTop: 10,
        padding: "8px 12px",
        borderRadius: 8,
        border: "none",
        background: "#111827",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Use Suggested Price
    </button>

    <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
      Adjusts markup automatically to match suggested price
    </div>

    {smartSuggestedStatus && (
      <div
        style={{
          marginTop: 8,
          display: "inline-block",
          padding: "6px 10px",
          borderRadius: 999,
          background: smartSuggestedStatus.bg,
          border: `1px solid ${smartSuggestedStatus.border}`,
          color: smartSuggestedStatus.color,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {smartSuggestedStatus.label}
      </div>
    )}
  </div>
)}
  </div>
)}

{minimumSafePrice && (
  <div
    style={{
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      background: "#fff7ed",
      border: "1px solid #fdba74",
      color: "#9a3412",
      fontSize: 14,
    }}
  >
    <div style={{ fontWeight: 700 }}>Minimum Safe Price</div>

    <div style={{ marginTop: 4 }}>
      <b>${minimumSafePrice.toLocaleString()}</b>
    </div>

    <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
      Protects at least a 15% minimum margin
      {taxEnabled ? " after tax" : ""}.
    </div>

    <button
      type="button"
      onClick={applyMinimumSafePrice}
      style={{
        marginTop: 10,
        padding: "8px 12px",
        borderRadius: 8,
        border: "none",
        background: "#7c2d12",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Use Minimum Safe Price
    </button>

    {minimumSafeStatus && (
      <div
        style={{
          marginTop: 8,
          display: "inline-block",
          padding: "6px 10px",
          borderRadius: 999,
          background: minimumSafeStatus.bg,
          border: `1px solid ${minimumSafeStatus.border}`,
          color: minimumSafeStatus.color,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {minimumSafeStatus.label}
      </div>
    )}

    {minimumSafeStatus && (
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: minimumSafeStatus.color,
          lineHeight: 1.45,
        }}
      >
        {minimumSafeStatus.message}
      </div>
    )}
  </div>
)}

{changeOrderSummary && (
  <div
    style={{
      marginBottom: 14,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      background: "#fff",
    }}
  >
    <div style={{ fontWeight: 900, fontSize: 14 }}>
      Smart Change Order Summary
    </div>

    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
      Compared against the original estimate for this job.
    </div>

    <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
      <div>
  Original Estimate:{" "}
  <strong>${changeOrderSummary.originalEstimateTotal.toLocaleString()}</strong>
</div>

{!changeOrderSummary.isOriginalEstimate && (
  <div>
    This Change Order:{" "}
    <strong>${changeOrderSummary.currentEstimateTotal.toLocaleString()}</strong>
  </div>
)}

<div>
  Previous Contract Value:{" "}
  <strong>${changeOrderSummary.previousContractValue.toLocaleString()}</strong>
</div>

<div>
  New Contract Value:{" "}
  <strong>${changeOrderSummary.newContractValue.toLocaleString()}</strong>
</div>

<div>
  Cost Change:{" "}
  
        <strong
          style={{
            color:
              changeOrderSummary.costDelta > 0
                ? "#9b1c1c"
                : changeOrderSummary.costDelta < 0
                ? "#065f46"
                : "#111",
          }}
        >
          {formatDelta(changeOrderSummary.costDelta)}
        </strong>
      </div>

      <div>
        Crew-Day Change:{" "}
        <strong>{formatSignedNumber(changeOrderSummary.crewDayDelta)}</strong>
      </div>

      <div>
  Schedule Impact:{" "}
<strong>
  {(() => {
  const hasPreviousSchedule = !!changeOrderSummary.originalEnd
  const hasCurrentSchedule = !!changeOrderSummary.currentEnd

  if (!hasPreviousSchedule && !hasCurrentSchedule) {
    return "Neither estimate has a full schedule"
  }

  if (!hasPreviousSchedule) {
    return "Original estimate had no full schedule"
  }

  if (!hasCurrentSchedule) {
    return "Current estimate has no full schedule"
  }

  return `${formatSignedNumber(changeOrderSummary.scheduleDeltaDays ?? 0)} day(s)`
})()}
</strong>
</div>

      <div>
        Original Completion:{" "}
        <strong>
          {changeOrderSummary.originalEnd
  ? changeOrderSummary.originalEnd.toLocaleDateString()
  : "—"}
        </strong>
      </div>

      <div>
        New Completion:{" "}
        <strong>
          {changeOrderSummary.currentEnd
            ? changeOrderSummary.currentEnd.toLocaleDateString()
            : "—"}
        </strong>
      </div>
    </div>
  </div>
)}

      <p>{result}</p>

{scopeSignals?.needsReturnVisit && (
  <div
    style={{
      marginTop: 10,
      padding: 10,
      border: "1px solid #fcd34d",
      borderRadius: 10,
      background: "#fffbeb",
      color: "#92400e",
      fontSize: 13,
      lineHeight: 1.5,
    }}
  >
    ⚠ This scope likely requires multiple visits: {scopeSignals.reason}
  </div>
)}

{schedule && (
  <>
    <ScheduleBlock schedule={schedule} />

    {completionWindow && (
      <div style={{ marginTop: 10, fontSize: 13 }}>
        Estimated Completion:
        <strong>
          {" "}
          {completionWindow.min.toLocaleDateString()} –{" "}
          {completionWindow.max.toLocaleDateString()}
        </strong>
      </div>
    )}

    <ScheduleEditor schedule={schedule} setSchedule={setSchedule} />
  </>
)}
  </div>
)}

  {!paid && (showUpgrade || remaining <= 0) && (
  <button
    type="button"
    onClick={upgrade}
    style={{ width: "100%", marginTop: 12 }}
  >
    Upgrade for Unlimited Access
  </button>
)}

      {result && (
  <>
    <h3
  style={{
    marginTop: 24,
    display: "flex",
    alignItems: "center",
    gap: 8,
  }}
>
    Pricing (Adjustable)

  {pdfShowPriceGuard && !isUserEdited && (
  <div
    style={{
      padding: "4px 8px",
      fontSize: 12,
      borderRadius: 999,
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#065f46",
      fontWeight: 700,
      lineHeight: 1,
    }}
  >
    {pdfPriceGuardLabel}
  </div>
)}
</h3>

<p style={{ marginTop: -6, marginBottom: 10, fontSize: 12, color: "#666" }}>
  Adjust as needed for site conditions, selections, or confirmed measurements.
</p>

    <label>
      Labor
      <input
  type="number"
  value={pricing.labor === 0 ? "" : pricing.labor}
  onChange={(e) => {
    const val = e.target.value
    setPricing({
      ...pricing,
      labor: val === "" ? 0 : Number(val),
    })
    setPricingEdited(true)
  }}
  style={{ width: "100%", padding: 8, marginBottom: 8 }}
/>
    </label>

    <label>
      Materials
      <input
  type="number"
  value={pricing.materials === 0 ? "" : pricing.materials}
  onChange={(e) => {
    const val = e.target.value
    setPricing({
      ...pricing,
      materials: val === "" ? 0 : Number(val),
    })
    setPricingEdited(true)
  }}
  style={{ width: "100%", padding: 8, marginBottom: 8 }}
/>
    </label>

    <label>
      Other / Mobilization
      <input
  type="number"
  value={pricing.subs === 0 ? "" : pricing.subs}
  onChange={(e) => {
    const val = e.target.value
    setPricing({
      ...pricing,
      subs: val === "" ? 0 : Number(val),
    })
    setPricingEdited(true)
  }}
  style={{ width: "100%", padding: 8, marginBottom: 8 }}
/>
    </label>

    <label>
      Markup (%)
      <input
  type="number"
  value={pricing.markup === 0 ? "" : pricing.markup}
  onChange={(e) => {
    const val = e.target.value
    setPricing({
      ...pricing,
      markup: val === "" ? 0 : Number(val),
    })
    setPricingEdited(true)
  }}
  style={{ width: "100%", padding: 8, marginBottom: 8 }}
/>
    </label>

    <div
  style={{
    marginTop: 4,
    marginBottom: 12,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  }}
>
  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
    Profit Target Mode
  </div>

  <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
    Set markup automatically based on your desired profit margin.
  </div>

  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <button
      type="button"
      onClick={() => applyProfitTarget(20)}
      style={{ fontSize: 12 }}
    >
      Hit 20% Profit
    </button>

    <button
      type="button"
      onClick={() => applyProfitTarget(25)}
      style={{ fontSize: 12 }}
    >
      Hit 25% Profit
    </button>

    <button
      type="button"
      onClick={() => applyProfitTarget(30)}
      style={{ fontSize: 12 }}
    >
      Hit 30% Profit
    </button>
  </div>
</div>

    <div
  style={{
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  }}
>

{/* -------------------------
    Deposit (optional)
------------------------- */}
<div
  style={{
    marginTop: 12,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  }}
>
  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <input
      type="checkbox"
      checked={depositEnabled}
      onChange={(e) => setDepositEnabled(e.target.checked)}
    />
    <span style={{ fontWeight: 800 }}>Require deposit</span>
    <span style={{ fontSize: 12, color: "#666" }}>
      (shows on PDF + invoices)
    </span>
  </label>

  {depositEnabled && (
    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
        <select
          value={depositType}
          onChange={(e) => setDepositType(e.target.value as any)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        >
          <option value="percent">Percent (%)</option>
          <option value="fixed">Fixed ($)</option>
        </select>

        <input
          type="number"
          value={depositValue === 0 ? "" : depositValue}
          onChange={(e) => setDepositValue(e.target.value === "" ? 0 : Number(e.target.value))}
          placeholder={depositType === "percent" ? "e.g., 25" : "e.g., 500"}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        />
      </div>

      <div style={{ fontSize: 13, color: "#333", display: "grid", gap: 4 }}>
        <div>
          Deposit Due Now: <strong>${Number(depositDue || 0).toLocaleString()}</strong>
        </div>
        <div>
          Remaining Balance: <strong>${Number(remainingBalance || 0).toLocaleString()}</strong>
        </div>
      </div>
    </div>
  )}
</div>

{/* -------------------------
    Tax (optional)
------------------------- */}
<div
  style={{
    marginTop: 12,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  }}
>
  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <input
      type="checkbox"
      checked={taxEnabled}
      onChange={(e) => setTaxEnabled(e.target.checked)}
    />
    <span style={{ fontWeight: 800 }}>Apply Sales Tax</span>
  </label>

  {taxEnabled && (
    <div style={{ marginTop: 10 }}>
      <input
        type="number"
        value={taxRate === 0 ? "" : taxRate}
        onChange={(e) =>
          setTaxRate(e.target.value === "" ? 0 : Number(e.target.value))
        }
        placeholder="Tax rate %"
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid #ddd",
        }}
      />
    </div>
  )}

  {taxEnabled && (
    <div style={{ fontSize: 13, marginTop: 6 }}>
      Sales Tax: <strong>${Number(taxAmount || 0).toLocaleString()}</strong>
    </div>
  )}
</div>

   <div style={{ fontSize: 16, fontWeight: 800 }}>
    Total: ${Number(pricing.total || 0).toLocaleString()}
  </div>

  {minimumSafeStatus?.tone === "danger" && (
  <div
    style={{
      marginTop: 8,
      padding: 10,
      borderRadius: 10,
      background: "#fef2f2",
      border: "1px solid #fecaca",
      color: "#9b1c1c",
      fontSize: 13,
    }}
  >
    ⚠ {minimumSafeStatus.message}
  </div>
)}

{minimumSafeStatus?.tone === "warning" && (
  <div
    style={{
      marginTop: 8,
      padding: 10,
      borderRadius: 10,
      background: "#fff7ed",
      border: "1px solid #fdba74",
      color: "#92400e",
      fontSize: 13,
    }}
  >
    ⚠ {minimumSafeStatus.message}
  </div>
)}

  {pricing && (() => {
  const cost = (pricing.labor || 0) + (pricing.materials || 0) + (pricing.subs || 0)
  const total = pricing.total || 0
  const margin = total > 0 ? (total - cost) / total : 0
  const marginPct = Math.round(margin * 100)

    const markupPct =
    cost > 0 ? Math.round((((total - cost) / cost) * 100) * 10) / 10 : 0

  if (marginPct < 15) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: 10,
          borderRadius: 10,
          background: "#fff7ed",
          border: "1px solid #fdba74",
          color: "#9a3412",
          fontSize: 13,
        }}
      >
        ⚠ Margin Risk: Estimated margin {marginPct}%. Most contractors target 15–25%.
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        borderRadius: 10,
        background: "#ecfdf5",
        border: "1px solid #6ee7b7",
        color: "#065f46",
        fontSize: 13,
      }}
    >
      ✓ Healthy margin: {marginPct}%
    </div>
  )
})()}

  {historicalPriceGuard && historicalPriceGuard.status === "low" && (
    <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 6 }}>
      ⚠️ This estimate is {Math.abs(historicalPriceGuard.percentDiff)}% below your typical pricing.
    </div>
  )}

  {historicalPriceGuard && historicalPriceGuard.status === "high" && (
    <div style={{ color: "#92400e", fontSize: 13, marginTop: 6 }}>
      ⚠️ This estimate is {historicalPriceGuard.percentDiff}% higher than your typical pricing.
    </div>
  )}

  <PriceGuardBadge />
</div>

    <button onClick={downloadPDF} style={{ marginTop: 8 }}>
      Download PDF
    </button>
  </>
)}

      <p style={{ marginTop: 40, fontSize: 12, color: "#888", textAlign: "center" }}>
        Secure payments powered by Stripe.
      </p>
    </main>
  )
}