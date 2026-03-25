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
  estimateSubtotalBeforeTax,
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
  explainEstimateChanges,
  computeProfitProtection,
  estimateDirectCost,
  computeProfitProtectionFromTotals,
  nextChangeOrderNumber,
} from "./lib/estimate-utils"

import { getPricingMemory } from "./lib/ai-pricing-memory"
import { compareEstimateToHistory } from "./lib/price-guard"
import { checkScopeQuality } from "./lib/scope-quality-check"
import SavedEstimatesSection from "./components/SavedEstimatesSection"
import JobsDashboardSection from "./components/JobsDashboardSection"
import EstimateBuilderSection from "./components/EstimateBuilderSection"
import InvoicesSection from "./components/InvoicesSection"
import PricingSummarySection from "./components/PricingSummarySection"


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

async function compressImageFile(file: File): Promise<string> {
  const imageBitmap = await createImageBitmap(file)

  const maxWidth = 1600
  const scale = Math.min(1, maxWidth / imageBitmap.width)

  const width = Math.round(imageBitmap.width * scale)
  const height = Math.round(imageBitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not create canvas context")

  ctx.drawImage(imageBitmap, 0, 0, width, height)

  return canvas.toDataURL("image/jpeg", 0.78)
}

async function handlePhotoUpload(files: FileList | null) {
  if (!files || files.length === 0) return

  const remainingSlots = Math.max(0, 5 - jobPhotos.length)
const picked = Array.from(files).slice(0, remainingSlots)

  try {
    const nextPhotos = await Promise.all(
  picked.map(async (file) => ({
    id: `${Date.now()}_${file.name}_${Math.random().toString(16).slice(2)}`,
    name: file.name,
    dataUrl: await compressImageFile(file),
  }))
)

    setJobPhotos((prev) => {
      const merged = [...prev, ...nextPhotos].slice(0, 5)
      return merged
    })

    setStatus("")
  } catch (err) {
    console.error(err)
    setStatus("Could not load selected photo(s).")
  }
}

function removeJobPhoto(id: string) {
  setJobPhotos((prev) => prev.filter((p) => p.id !== id))
}

function buildEstimateBreakdown({
  pricing,
  schedule,
  trade,
  state,
  scopeSignals,
  minimumSafeStatus,
}: {
  pricing: {
    labor: number
    materials: number
    subs: number
    markup: number
    total: number
  }
  schedule: Schedule | null
  trade: UiTrade
  state: string
  scopeSignals: {
    needsReturnVisit?: boolean
    reason?: string
  } | null
  minimumSafeStatus:
    | {
        label: string
        tone: string
        color: string
        bg: string
        border: string
        message: string
      }
    | null
}) {
  const items: string[] = []

  if (pricing.labor > 0) {
    items.push(
      `Labor reflects expected crew time, trade difficulty, and the work required to complete this ${trade || "project"} scope.`
    )
  }

  if (pricing.materials > 0) {
    items.push(
      "Materials include the expected supplies, install materials, and standard job-use items needed for this scope."
    )
  }

  if (pricing.subs > 0) {
    items.push(
      "Other / Mobilization covers setup, protection, cleanup, travel, staging, and general job preparation."
    )
  }

  if (Number(pricing.markup || 0) > 0) {
    items.push(
      `A ${Number(pricing.markup)}% markup is included for overhead, business operations, risk, and profit.`
    )
  }

  if (schedule?.crewDays || schedule?.visits || schedule?.calendarDays) {
    items.push(
      "Schedule timing is based on estimated crew time, visit count, and the expected sequencing of the work."
    )
  }

  if (scopeSignals?.needsReturnVisit) {
    items.push(
      "This scope likely requires multiple visits, which increases coordination and labor planning."
    )
  }

  if (minimumSafeStatus?.tone === "danger") {
    items.push(
      "The current total is below your minimum safe price threshold, which may leave the job underpriced."
    )
  }

  if (minimumSafeStatus?.tone === "warning") {
    items.push(
      "The current total is close to your minimum safe price threshold, so margin is tighter than usual."
    )
  }

  if (state) {
    items.push(`Regional pricing was adjusted for ${state}.`)
  }

  return items
}

function buildAssumptionsList({
  trade,
  state,
  scopeSignals,
}: {
  trade: string
  state: string
  scopeSignals: {
    needsReturnVisit?: boolean
    reason?: string
  } | null
}) {
  const notes: string[] = []

  notes.push(
    "Pricing assumes normal site access and standard working conditions."
  )

  notes.push(
    "Final pricing may adjust if concealed conditions or unforeseen issues are discovered."
  )

  notes.push(
    "Permit fees, engineering, or specialty inspections are excluded unless specifically stated."
  )

  notes.push(
    "Material pricing assumes standard mid-range selections unless otherwise noted."
  )

  if (scopeSignals?.needsReturnVisit) {
    notes.push(
      "Multiple site visits are assumed based on project sequencing requirements."
    )
  }

  if (trade) {
    notes.push(
      `Work scope assumptions are based on typical ${trade.replace(
        "_",
        " "
      )} project conditions.`
    )
  }

  if (state) {
    notes.push(
      `Regional labor and material expectations are based on typical ${state} construction conditions.`
    )
  }

  return notes
}

function buildEstimateConfidence({
  scopeChange,
  trade,
  state,
  measureEnabled,
  totalSqft,
  jobPhotosCount,
  scopeQualityScore,
  priceGuardVerified,
  photoAnalysis,
}: {
  scopeChange: string
  trade: string
  state: string
  measureEnabled: boolean
  totalSqft: number
  jobPhotosCount: number
  scopeQualityScore: number
  priceGuardVerified: boolean
  photoAnalysis: {
    quantitySignals?: {
      estimatedWallSqftMin?: number | null
      estimatedWallSqftMax?: number | null
      estimatedCeilingSqftMin?: number | null
      estimatedCeilingSqftMax?: number | null
      estimatedFloorSqftMin?: number | null
      estimatedFloorSqftMax?: number | null
      doors?: number | null
      windows?: number | null
      vanities?: number | null
      toilets?: number | null
      sinks?: number | null
      outlets?: number | null
      switches?: number | null
      recessedLights?: number | null
    }
    confidence?: "low" | "medium" | "high"
  } | null
}) {
  let score = 0
  const reasons: string[] = []
  const warnings: string[] = []

  const text = (scopeChange || "").trim()
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0

  if (wordCount >= 20) {
    score += 25
    reasons.push("Detailed scope description provided")
  } else if (wordCount >= 10) {
    score += 15
    reasons.push("Moderate scope detail provided")
  } else if (wordCount >= 5) {
    score += 8
    reasons.push("Basic scope description provided")
  } else {
    warnings.push("Scope description is very short")
  }

  if (trade) {
    score += 10
    reasons.push("Trade type selected")
  } else {
    warnings.push("Trade type was inferred or not selected")
  }

  if (state) {
    score += 10
    reasons.push("Regional pricing context included")
  } else {
    warnings.push("State-based regional pricing not provided")
  }

 const photoHasQuantitySignals =
    !!photoAnalysis?.quantitySignals &&
    (
      Number(photoAnalysis.quantitySignals.estimatedWallSqftMin || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.estimatedWallSqftMax || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.estimatedCeilingSqftMin || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.estimatedCeilingSqftMax || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.estimatedFloorSqftMin || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.estimatedFloorSqftMax || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.doors || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.windows || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.vanities || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.toilets || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.sinks || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.outlets || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.switches || 0) > 0 ||
      Number(photoAnalysis.quantitySignals.recessedLights || 0) > 0
    )

  if (measureEnabled && totalSqft > 0) {
    score += 20
    reasons.push("Measurements were included")
  } else if (photoHasQuantitySignals) {
    warnings.push("No manual measurements were included")
  } else {
    warnings.push("No measurements were included")
  }

  if (!measureEnabled && photoHasQuantitySignals) {
    if (photoAnalysis?.confidence === "high") {
      score += 14
      reasons.push("Photo-derived quantity ranges strengthened estimate confidence")
    } else if (photoAnalysis?.confidence === "medium") {
      score += 8
      reasons.push("Photo-derived quantity ranges helped support estimate confidence")
    } else {
      score += 3
      reasons.push("Photo quantity hints were available")
    }
  }

  if (jobPhotosCount > 0) {
    score += 15
    reasons.push("Job photos were included")
  }

  if (scopeQualityScore >= 85) {
    score += 15
    reasons.push("Scope quality is strong")
  } else if (scopeQualityScore >= 70) {
    score += 10
    reasons.push("Scope quality is acceptable")
  } else if (scopeQualityScore >= 50) {
    score += 5
    warnings.push("Scope quality is limited")
  } else {
    warnings.push("Scope quality is weak")
  }

  if (priceGuardVerified) {
    score += 5
    reasons.push("PriceGuard verification passed")
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  let level: "high" | "medium" | "review" | "low" = "low"
  let label = "Low Confidence"
  let tone = {
    bg: "#fef2f2",
    border: "#fecaca",
    color: "#991b1b",
  }

  if (score >= 80) {
    level = "high"
    label = "High Confidence"
    tone = {
      bg: "#ecfdf5",
      border: "#86efac",
      color: "#065f46",
    }
  } else if (score >= 60) {
    level = "medium"
    label = "Moderate Confidence"
    tone = {
      bg: "#eff6ff",
      border: "#93c5fd",
      color: "#1d4ed8",
    }
  } else if (score >= 40) {
    level = "review"
    label = "Review Recommended"
    tone = {
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    }
  }

  return {
    score,
    level,
    label,
    reasons,
    warnings,
    ...tone,
  }
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

function getJobPipelineStatus(jobId: string) {
  const latest = latestEstimateForJob(jobId)
  const original = lockedOriginalEstimateForJob(jobId)
  const source = latest || original

  if (!source) {
    return {
      key: "no-estimate" as const,
      label: "No Estimate",
      tone: "neutral" as const,
      message: "No estimate found for this job yet.",
      primaryAction: null as
        | null
        | "create_change_order"
        | "copy_approval"
        | "create_deposit_invoice"
        | "await_deposit_payment"
        | "create_balance_invoice"
        | "create_final_invoice"
        | "await_final_payment"
        | "paid_closed",
    }
  }

  const approvalApproved = source.approval?.status === "approved"
  const depositRequired = Boolean(source.deposit?.enabled)

  const jobInvoices = invoices.filter((inv) => inv.jobId === jobId)

  const depositInvoice = jobInvoices.find(
    (inv) =>
      inv.fromEstimateId === source.id &&
      inv.deposit?.enabled &&
      inv.total === inv.deposit.depositDue
  ) || null

  const balanceInvoice = jobInvoices.find(
    (inv) =>
      inv.fromEstimateId === source.id &&
      inv.deposit?.enabled &&
      inv.total === inv.deposit.remainingBalance
  ) || null

  const fullInvoice = jobInvoices.find(
    (inv) =>
      inv.fromEstimateId === source.id &&
      !inv.deposit?.enabled
  ) || null

  const depositPaid =
    depositInvoice ? computeLiveInvoiceStatus(depositInvoice) === "paid" : false

  const balancePaid =
    balanceInvoice ? computeLiveInvoiceStatus(balanceInvoice) === "paid" : false

  const fullInvoicePaid =
    fullInvoice ? computeLiveInvoiceStatus(fullInvoice) === "paid" : false

  if (!approvalApproved) {
    return {
      key: "pending_approval" as const,
      label: "Pending Approval",
      tone: "warning" as const,
      message: "Waiting for customer approval before invoicing.",
      primaryAction: "copy_approval" as const,
    }
  }

  if (depositRequired) {
    if (!depositInvoice) {
      return {
        key: "ready_for_deposit_invoice" as const,
        label: "Ready for Deposit",
        tone: "info" as const,
        message: "Approved and ready for deposit invoice.",
        primaryAction: "create_deposit_invoice" as const,
      }
    }

    if (!depositPaid) {
      return {
        key: "awaiting_deposit_payment" as const,
        label: "Awaiting Deposit Payment",
        tone: "warning" as const,
        message: "Deposit invoice created but not paid yet.",
        primaryAction: "await_deposit_payment" as const,
      }
    }

    if (!balanceInvoice) {
      return {
        key: "ready_for_balance_invoice" as const,
        label: "Ready for Balance Invoice",
        tone: "info" as const,
        message: "Deposit paid. Ready to create balance invoice.",
        primaryAction: "create_balance_invoice" as const,
      }
    }

    if (!balancePaid) {
      return {
        key: "awaiting_final_payment" as const,
        label: "Awaiting Final Payment",
        tone: "warning" as const,
        message: "Balance invoice created but not paid yet.",
        primaryAction: "await_final_payment" as const,
      }
    }

    return {
      key: "paid_closed" as const,
      label: "Paid / Closed",
      tone: "good" as const,
      message: "Deposit and balance have both been paid.",
      primaryAction: "paid_closed" as const,
    }
  }

  if (!fullInvoice) {
    return {
      key: "ready_for_final_invoice" as const,
      label: "Ready for Final Invoice",
      tone: "info" as const,
      message: "Approved and ready for final invoice.",
      primaryAction: "create_final_invoice" as const,
    }
  }

  if (!fullInvoicePaid) {
    return {
      key: "awaiting_final_payment" as const,
      label: "Awaiting Final Payment",
      tone: "warning" as const,
      message: "Final invoice created but not paid yet.",
      primaryAction: "await_final_payment" as const,
    }
  }

  return {
    key: "paid_closed" as const,
    label: "Paid / Closed",
    tone: "good" as const,
    message: "Final invoice has been paid.",
    primaryAction: "paid_closed" as const,
  }
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

function startChangeOrderFromJob(jobId: string) {
  const job = jobs.find((j) => j.id === jobId)
  if (!job) {
    setStatus("Job not found.")
    return
  }

  const original = lockedOriginalEstimateForJob(jobId)
  const latest = latestEstimateForJob(jobId)

  const source = latest || original

  setActiveJobId(jobId)

  setJobDetails({
    clientName: job.clientName || "",
    jobName: job.jobName || "",
    changeOrderNo: nextChangeOrderNumber(job, history, jobId),
    jobAddress: job.jobAddress || "",
    date: "",
  })

  setDocumentType("Change Order")

  if (source) {
    setTrade(source.trade || "")
    setState(source.state || "")
    setScopeChange("")
    setResult(null)
    setSchedule(source.schedule ?? null)

    setPricing({
      labor: 0,
      materials: 0,
      subs: 0,
      markup: source.pricing?.markup ?? 20,
      total: 0,
    })

    setTaxEnabled(Boolean(source.tax?.enabled))
    setTaxRate(Number(source.tax?.rate || 0))

    if (source.deposit) {
      setDepositEnabled(Boolean(source.deposit.enabled))
      setDepositType(source.deposit.type === "fixed" ? "fixed" : "percent")
      setDepositValue(Number(source.deposit.value || 0))
    } else {
      setDepositEnabled(false)
      setDepositType("percent")
      setDepositValue(25)
    }
  }

  lastSavedEstimateIdRef.current = null
  setPricingEdited(false)
  setPriceGuard(null)
  setPriceGuardVerified(false)
  setShowPriceGuardDetails(false)

  setStatus("Change order started. Enter the added or revised scope, then generate.")
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
      originalEstimateTotal: 0, // with tax
      originalEstimateContractValue: 0, // before tax
      changeOrders: [] as EstimateHistoryItem[],
      changeOrdersTotal: 0, // with tax
      changeOrdersContractValue: 0, // before tax
      currentContractValue: 0, // with tax
      currentContractValueBeforeTax: 0, // before tax
    }
  }

  const originalEstimate = lockedOriginalEstimateForJob(jobId)

  if (!originalEstimate) {
    return {
      originalEstimate: null,
      originalEstimateTotal: 0,
      originalEstimateContractValue: 0,
      changeOrders: [],
      changeOrdersTotal: 0,
      changeOrdersContractValue: 0,
      currentContractValue: 0,
      currentContractValueBeforeTax: 0,
    }
  }

  // original estimate
  const originalEstimateTotal = estimateTotalWithTax(originalEstimate)
  const originalEstimateContractValue = estimateSubtotalBeforeTax(originalEstimate)

  // all later change orders / estimates tied to same job
  const changeOrders = history
    .filter((h) => h.jobId === jobId && h.id !== originalEstimate.id)
    .sort((a, b) => a.createdAt - b.createdAt)

  const changeOrdersTotal = changeOrders.reduce(
    (sum, h) => sum + estimateTotalWithTax(h),
    0
  )

  const changeOrdersContractValue = changeOrders.reduce(
    (sum, h) => sum + estimateSubtotalBeforeTax(h),
    0
  )

  const currentContractValue = originalEstimateTotal + changeOrdersTotal
  const currentContractValueBeforeTax =
    originalEstimateContractValue + changeOrdersContractValue

  return {
    originalEstimate,
    originalEstimateTotal,
    originalEstimateContractValue,
    changeOrders,
    changeOrdersTotal,
    changeOrdersContractValue,
    currentContractValue,
    currentContractValueBeforeTax,
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
    explanation: x?.explanation ?? null,
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
  const [result, setResult] = useState<{
  text: string
  explanation?: {
    priceReasons?: string[]
    scheduleReasons?: string[]
    photoReasons?: string[]
    protectionReasons?: string[]
  } | null
} | null>(null)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scopeSignals, setScopeSignals] = useState<{
  needsReturnVisit?: boolean
  reason?: string
} | null>(null)

const [jobPhotos, setJobPhotos] = useState<
  {
    id: string
    name: string
    dataUrl: string
  }[]
>([])

const [photoAnalysis, setPhotoAnalysis] = useState<{
  summary?: string
  observations?: string[]
  suggestedScopeNotes?: string[]

  detectedRoomTypes?: string[]
  detectedTrades?: string[]
  detectedMaterials?: string[]
  detectedConditions?: string[]
  detectedFixtures?: string[]
  detectedAccessIssues?: string[]
  detectedDemoNeeds?: string[]

  quantitySignals?: {
    doors?: number | null
    windows?: number | null
    vanities?: number | null
    toilets?: number | null
    sinks?: number | null
    outlets?: number | null
    switches?: number | null
    recessedLights?: number | null
    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null
    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
  }

  scopeCompletenessFlags?: string[]
  confidence?: "low" | "medium" | "high"
} | null>(null)

const [photoScopeAssist, setPhotoScopeAssist] = useState<{
  missingScopeFlags: string[]
  suggestedAdditions: string[]
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
    result: result?.text || "",
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

const explainChangesReport = useMemo(() => {
  if (!currentLoadedEstimate?.jobId) return null

  const original = lockedOriginalEstimateForJob(currentLoadedEstimate.jobId)
  if (!original) return null

  return explainEstimateChanges(original, currentLoadedEstimate)
}, [currentLoadedEstimate, history, jobs])

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

const estimateBreakdown = useMemo(() => {
  return buildEstimateBreakdown({
    pricing,
    schedule,
    trade,
    state,
    scopeSignals,
    minimumSafeStatus,
  })
}, [pricing, schedule, trade, state, scopeSignals, minimumSafeStatus])

const estimateAssumptions = useMemo(() => {
  return buildAssumptionsList({
    trade,
    state,
    scopeSignals,
  })
}, [trade, state, scopeSignals])

const estimateConfidence = useMemo(() => {
  return buildEstimateConfidence({
    scopeChange,
    trade,
    state,
    measureEnabled,
    totalSqft,
    jobPhotosCount: jobPhotos.length,
    scopeQualityScore: scopeQuality.score,
    priceGuardVerified,
    photoAnalysis,
  })
}, [
  scopeChange,
  trade,
  state,
  measureEnabled,
  totalSqft,
  jobPhotos.length,
  scopeQuality.score,
  priceGuardVerified,
  photoAnalysis,
])

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
            explanation: x?.explanation ?? null,
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
  setResult(null)
  setPricingSource("ai")
  setShowPriceGuardDetails(false)
  setPriceGuard(null)
  setPricingEdited(false)
  setPriceGuardVerified(false)
  setSchedule(null)
  setScopeSignals(null)
  setPhotoAnalysis(null)
  setPhotoScopeAssist(null)

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
    const requestId = crypto.randomUUID()

const res = await fetch("/api/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-idempotency-key": requestId,
  },
  body: JSON.stringify({
    requestId,
    email: e,
    scopeChange,
    trade: tradeToSend,
    state,
    paintScope: paintScopeToSend,
    workDaysPerWeek: 5,
    measurements: measureEnabled
      ? { rows: measureRows, totalSqft, units: "ft" }
      : null,
    photos:
      jobPhotos.length > 0
        ? jobPhotos.map((p) => ({
            name: p.name,
            dataUrl: p.dataUrl,
          }))
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

setResult({
  text: nextResult,
  explanation: data?.explanation || null,
})
setSchedule(normalizedSchedule)
setScopeSignals(data?.scopeSignals ?? null)
setPhotoAnalysis(data?.photoAnalysis ?? null)
setPhotoScopeAssist(data?.photoScopeAssist ?? null)
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
  explanation: data?.explanation || null,
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
  setResult({
  text: item.result || "",
  explanation: item.explanation || null,
})
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

    const safeResult = esc(result?.text || "")

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

  function hasItems(arr?: string[] | null) {
  return Array.isArray(arr) && arr.length > 0
}

function getPhotoConfidenceTone(conf?: "low" | "medium" | "high") {
  if (conf === "high") {
    return {
      label: "High",
      bg: "#ecfdf5",
      border: "#86efac",
      color: "#166534",
    }
  }

  if (conf === "medium") {
    return {
      label: "Medium",
      bg: "#eff6ff",
      border: "#93c5fd",
      color: "#1d4ed8",
    }
  }

  if (conf === "low") {
    return {
      label: "Low",
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    }
  }

  return null
}

function InfoChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: "#f3f4f6",
        color: "#374151",
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid #e5e7eb",
      }}
    >
      {label}
    </span>
  )
}

function InsightListBlock({
  title,
  items,
  tone = "neutral",
}: {
  title: string
  items?: string[]
  tone?: "neutral" | "warning" | "info"
}) {
  if (!items || items.length === 0) return null

  const styles =
    tone === "warning"
      ? {
          bg: "#fff7ed",
          border: "#fdba74",
        }
      : tone === "info"
      ? {
          bg: "#eff6ff",
          border: "#93c5fd",
        }
      : {
          bg: "#fafafa",
          border: "#e5e7eb",
        }

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#374151",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          padding: 12,
          border: `1px solid ${styles.border}`,
          borderRadius: 12,
          background: styles.bg,
        }}
      >
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
          {items.map((item, i) => (
            <li key={`${title}-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function PhotoInsightsCard({
  photoAnalysis,
  photoScopeAssist,
}: {
  photoAnalysis: {
    summary?: string
    observations?: string[]
    suggestedScopeNotes?: string[]
    detectedRoomTypes?: string[]
    detectedTrades?: string[]
    detectedMaterials?: string[]
    detectedConditions?: string[]
    detectedFixtures?: string[]
    detectedAccessIssues?: string[]
    detectedDemoNeeds?: string[]
    quantitySignals?: {
      doors?: number | null
      windows?: number | null
      vanities?: number | null
      toilets?: number | null
      sinks?: number | null
      outlets?: number | null
      switches?: number | null
      recessedLights?: number | null
      ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null
      estimatedWallSqftMin?: number | null
      estimatedWallSqftMax?: number | null
      estimatedCeilingSqftMin?: number | null
      estimatedCeilingSqftMax?: number | null
      estimatedFloorSqftMin?: number | null
      estimatedFloorSqftMax?: number | null
    }
    scopeCompletenessFlags?: string[]
    confidence?: "low" | "medium" | "high"
  } | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  } | null
}) {
  if (!photoAnalysis && !photoScopeAssist) return null

  const confidenceTone = getPhotoConfidenceTone(photoAnalysis?.confidence)

  const materials = photoAnalysis?.detectedMaterials ?? []
  const fixtures = photoAnalysis?.detectedFixtures ?? []
  const conditions = photoAnalysis?.detectedConditions ?? []
  const accessIssues = photoAnalysis?.detectedAccessIssues ?? []
  const demoNeeds = photoAnalysis?.detectedDemoNeeds ?? []
  const missingScopeFlags = photoScopeAssist?.missingScopeFlags ?? []
  const suggestedAdditions = photoScopeAssist?.suggestedAdditions ?? []

  const q = photoAnalysis?.quantitySignals
  const quantityChips: string[] = []

  if (q?.doors) quantityChips.push(`${q.doors} door${q.doors === 1 ? "" : "s"}`)
  if (q?.windows) quantityChips.push(`${q.windows} window${q.windows === 1 ? "" : "s"}`)
  if (q?.vanities) quantityChips.push(`${q.vanities} ${q.vanities === 1 ? "vanity" : "vanities"}`)
  if (q?.toilets) quantityChips.push(`${q.toilets} toilet${q.toilets === 1 ? "" : "s"}`)
  if (q?.sinks) quantityChips.push(`${q.sinks} sink${q.sinks === 1 ? "" : "s"}`)
  if (q?.outlets) quantityChips.push(`${q.outlets} outlet${q.outlets === 1 ? "" : "s"}`)
  if (q?.switches) quantityChips.push(`${q.switches} switch${q.switches === 1 ? "" : "es"}`)
  if (q?.recessedLights) quantityChips.push(`${q.recessedLights} recessed light${q.recessedLights === 1 ? "" : "s"}`)
  if (q?.ceilingHeightCategory) quantityChips.push(`${q.ceilingHeightCategory} ceilings`)

  const wallRange =
    q?.estimatedWallSqftMin != null && q?.estimatedWallSqftMax != null
      ? `${q.estimatedWallSqftMin}–${q.estimatedWallSqftMax} wall sqft`
      : null

  const ceilingRange =
    q?.estimatedCeilingSqftMin != null && q?.estimatedCeilingSqftMax != null
      ? `${q.estimatedCeilingSqftMin}–${q.estimatedCeilingSqftMax} ceiling sqft`
      : null

  const floorRange =
    q?.estimatedFloorSqftMin != null && q?.estimatedFloorSqftMax != null
      ? `${q.estimatedFloorSqftMin}–${q.estimatedFloorSqftMax} floor sqft`
      : null

  const hasContent =
    !!photoAnalysis?.summary ||
    hasItems(materials) ||
    hasItems(fixtures) ||
    hasItems(conditions) ||
    hasItems(accessIssues) ||
    hasItems(demoNeeds) ||
    hasItems(photoAnalysis?.observations) ||
    hasItems(photoAnalysis?.suggestedScopeNotes) ||
    hasItems(missingScopeFlags) ||
    hasItems(suggestedAdditions) ||
    quantityChips.length > 0 ||
    !!wallRange ||
    !!ceilingRange ||
    !!floorRange ||
    !!confidenceTone

  if (!hasContent) return null

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 14,
        padding: 14,
        border: "1px solid #dbeafe",
        borderRadius: 14,
        background: "#ffffff",
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
            Photo Insights
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Visible jobsite details pulled from uploaded photos
          </div>
        </div>

        {confidenceTone && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid ${confidenceTone.border}`,
              background: confidenceTone.bg,
              color: confidenceTone.color,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Confidence: {confidenceTone.label}
          </div>
        )}
      </div>

      {photoAnalysis?.summary && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            fontSize: 14,
            lineHeight: 1.55,
            color: "#1f2937",
          }}
        >
          {photoAnalysis.summary}
        </div>
      )}

            <InsightListBlock
        title="Observations"
        items={photoAnalysis?.observations}
      />

      <InsightListBlock
        title="Suggested scope notes"
        items={photoAnalysis?.suggestedScopeNotes}
        tone="info"
      />

      {quantityChips.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#374151",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Detected quantities
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quantityChips.map((item, i) => (
              <InfoChip key={`qty-${i}`} label={item} />
            ))}
            {wallRange && <InfoChip label={wallRange} />}
            {ceilingRange && <InfoChip label={ceilingRange} />}
            {floorRange && <InfoChip label={floorRange} />}
          </div>
        </div>
      )}

            {(photoAnalysis?.detectedRoomTypes?.length ?? 0) > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#374151",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Detected room types
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {photoAnalysis!.detectedRoomTypes!.map((item, i) => (
              <InfoChip key={`roomtype-${i}`} label={item} />
            ))}
          </div>
        </div>
      )}

      {materials.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#374151",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Detected materials
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {materials.map((item, i) => (
              <InfoChip key={`material-${i}`} label={item} />
            ))}
          </div>
        </div>
      )}

      {fixtures.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#374151",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Detected fixtures
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fixtures.map((item, i) => (
              <InfoChip key={`fixture-${i}`} label={item} />
            ))}
          </div>
        </div>
      )}

      <InsightListBlock
        title="Scope flags"
        items={missingScopeFlags}
        tone="warning"
      />

      <InsightListBlock
        title="Suggested additions"
        items={suggestedAdditions}
        tone="info"
      />

      <InsightListBlock
        title="Detected conditions"
        items={conditions}
      />

      <InsightListBlock
        title="Access issues"
        items={accessIssues}
      />

      <InsightListBlock
        title="Demo needs"
        items={demoNeeds}
      />
    </div>
  )
}

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
     
      <EstimateBuilderSection
  trade={trade}
  setTrade={setTrade}
  normalizeTrade={normalizeTrade}
  showPaintScope={showPaintScope}
  effectivePaintScope={effectivePaintScope}
  paintScope={paintScope}
  setPaintScope={setPaintScope}
  PAINT_SCOPE_OPTIONS={PAINT_SCOPE_OPTIONS}
  state={state}
  setState={setState}
  scopeChange={scopeChange}
  setScopeChange={setScopeChange}
  handlePhotoUpload={handlePhotoUpload}
  jobPhotos={jobPhotos}
  removeJobPhoto={removeJobPhoto}
  scopeQuality={scopeQuality}
  measureEnabled={measureEnabled}
  setMeasureEnabled={setMeasureEnabled}
  measureRows={measureRows}
  setMeasureRows={setMeasureRows}
  rowSqft={rowSqft}
  totalSqft={totalSqft}
  generate={generate}
  loading={loading}
  status={status}
/>

{loading && (
  <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
    Generating professional document…
  </p>
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
  Generated from the scope provided{jobPhotos.length > 0 ? " and uploaded photos" : ""}.
</p>

{(photoAnalysis || photoScopeAssist) && (
  <PhotoInsightsCard
    photoAnalysis={photoAnalysis}
    photoScopeAssist={photoScopeAssist}
  />
)}

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

{explainChangesReport && (
  <details
    style={{
      marginBottom: 14,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      background: "#fff",
    }}
  >
    <summary
      style={{
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 14,
      }}
    >
      Explain Changes
    </summary>

    <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
      Shows what changed compared with the original estimate for this job.
    </div>

    {explainChangesReport.summary.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Summary</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {explainChangesReport.summary.map((item, i) => (
            <li key={`summary-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {explainChangesReport.scopeChanges.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Scope Changes</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {explainChangesReport.scopeChanges.map((item, i) => (
            <li key={`scope-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {explainChangesReport.pricingChanges.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Pricing Changes</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {explainChangesReport.pricingChanges.map((item, i) => (
            <li key={`pricing-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {explainChangesReport.scheduleChanges.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Schedule Changes</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {explainChangesReport.scheduleChanges.map((item, i) => (
            <li key={`schedule-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {explainChangesReport.adminChanges.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Terms / Admin Changes</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {explainChangesReport.adminChanges.map((item, i) => (
            <li key={`admin-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}
  </details>
)}

{estimateBreakdown.length > 0 && (
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
      Explain My Estimate
    </div>

    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
      Plain-English reasons behind this estimate.
    </div>

    <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
      {estimateBreakdown.map((item, i) => (
        <li key={`estimate-breakdown-${i}`}>{item}</li>
      ))}
    </ul>
  </div>
)}

{estimateAssumptions.length > 0 && (
  <div
    style={{
      marginBottom: 14,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      background: "#fafafa",
    }}
  >
    <div style={{ fontWeight: 900, fontSize: 14 }}>
      Assumptions & Review Notes
    </div>

    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
      Standard project assumptions used to build this estimate.
    </div>

    <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
      {estimateAssumptions.map((item, i) => (
        <li key={`estimate-assumption-${i}`}>
          {item}
        </li>
      ))}
    </ul>
  </div>
)}

{estimateConfidence && (
  <div
    style={{
      marginBottom: 14,
      padding: 12,
      border: `1px solid ${estimateConfidence.border}`,
      borderRadius: 12,
      background: estimateConfidence.bg,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 900, fontSize: 14, color: estimateConfidence.color }}>
          Confidence / Review Badge
        </div>

        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          How reliable this estimate is based on the details provided.
        </div>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 999,
          background: "#fff",
          border: `1px solid ${estimateConfidence.border}`,
          color: estimateConfidence.color,
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        <span>{estimateConfidence.label}</span>
        <span>{estimateConfidence.score}%</span>
      </div>
    </div>

    {estimateConfidence.warnings.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: estimateConfidence.color,
            marginBottom: 6,
          }}
        >
          Review flags
        </div>

        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {estimateConfidence.warnings.map((item, i) => (
            <li key={`confidence-warning-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {estimateConfidence.reasons.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#333",
            marginBottom: 6,
          }}
        >
          Confidence drivers
        </div>

        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          {estimateConfidence.reasons.map((item, i) => (
            <li key={`confidence-reason-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {(estimateConfidence.level === "low" ||
      estimateConfidence.level === "review") && (
      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 10,
          background: "#fff",
          border: `1px solid ${estimateConfidence.border}`,
          color: estimateConfidence.color,
          fontSize: 13,
          lineHeight: 1.45,
          fontWeight: 700,
        }}
      >
        Review recommended before sending this estimate to a client.
      </div>
    )}
  </div>
)}

<p>{result?.text}</p>

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

{result && (
  <PricingSummarySection
    pricing={pricing}
    setPricing={setPricing}
    setPricingEdited={setPricingEdited}
    applyProfitTarget={applyProfitTarget}
    depositEnabled={depositEnabled}
    setDepositEnabled={setDepositEnabled}
    depositType={depositType}
    setDepositType={setDepositType}
    depositValue={depositValue}
    setDepositValue={setDepositValue}
    depositDue={depositDue}
    remainingBalance={remainingBalance}
    taxEnabled={taxEnabled}
    setTaxEnabled={setTaxEnabled}
    taxRate={taxRate}
    setTaxRate={setTaxRate}
    taxAmount={taxAmount}
    minimumSafeStatus={minimumSafeStatus}
    historicalPriceGuard={historicalPriceGuard}
    PriceGuardBadge={PriceGuardBadge}
    pdfShowPriceGuard={pdfShowPriceGuard}
    pdfPriceGuardLabel={pdfPriceGuardLabel}
    isUserEdited={isUserEdited}
    downloadPDF={downloadPDF}
  />
)}

<JobsDashboardSection
  jobs={jobs}
  activeJobId={activeJobId}
  setActiveJobId={setActiveJobId}
  setStatus={setStatus}
  getOrCreateJobIdFromDetails={getOrCreateJobIdFromDetails}
  crewCount={crewCount}
  setCrewCount={setCrewCount}
  computeWeeklyCrewLoad={computeWeeklyCrewLoad}
  latestEstimateForJob={latestEstimateForJob}
  lockedOriginalEstimateForJob={lockedOriginalEstimateForJob}
  computeJobContractSummary={computeJobContractSummary}
  computeDepositFromEstimateTotal={computeDepositFromEstimateTotal}
  invoiceSummaryForJob={invoiceSummaryForJob}
  latestInvoiceForJob={latestInvoiceForJob}
  actualsForJob={actualsForJob}
  getJobPipelineStatus={getJobPipelineStatus}
  estimateDirectCost={estimateDirectCost}
  computeProfitProtectionFromTotals={computeProfitProtectionFromTotals}
  money={money}
  upsertActuals={upsertActuals}
  setJobDetails={setJobDetails}
  startChangeOrderFromJob={startChangeOrderFromJob}
  createInvoiceFromEstimate={createInvoiceFromEstimate}
  createBalanceInvoiceFromEstimate={createBalanceInvoiceFromEstimate}
  selectJobAndJumpToInvoices={selectJobAndJumpToInvoices}
  downloadInvoicePDF={downloadInvoicePDF}
  updateJob={updateJob}
  deleteJob={deleteJob}
  history={history}
/>

<InvoicesSection
  filteredInvoices={filteredInvoices}
  invoicesSectionRef={invoicesSectionRef}
  setInvoices={setInvoices}
  setStatus={setStatus}
  downloadInvoicePDF={downloadInvoicePDF}
  computeLiveInvoiceStatus={computeLiveInvoiceStatus}
  updateInvoice={updateInvoice}
  INVOICE_KEY={INVOICE_KEY}
/>

<SavedEstimatesSection
  filteredHistory={filteredHistory}
  clearHistory={clearHistory}
  getJobPipelineStatus={getJobPipelineStatus}
  latestInvoiceForJob={latestInvoiceForJob}
  hasAnyInvoiceForEstimate={hasAnyInvoiceForEstimate}
  loadHistoryItem={loadHistoryItem}
  createInvoiceFromEstimate={createInvoiceFromEstimate}
  createBalanceInvoiceFromEstimate={createBalanceInvoiceFromEstimate}
  selectJobAndJumpToInvoices={selectJobAndJumpToInvoices}
  downloadInvoicePDF={downloadInvoicePDF}
  deleteHistoryItem={deleteHistoryItem}
  setStatus={setStatus}
/>

  {!paid && (showUpgrade || remaining <= 0) && (
  <button
    type="button"
    onClick={upgrade}
    style={{ width: "100%", marginTop: 12 }}
  >
    Upgrade for Unlimited Access
  </button>
)}

      <p style={{ marginTop: 40, fontSize: 12, color: "#888", textAlign: "center" }}>
        Secure payments powered by Stripe.
      </p>
    </main>
  )
}