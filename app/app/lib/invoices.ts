import type { Invoice, EstimateRow, EstimateEmbeddedBurden, EstimateStructuredSection } from "./types"
import { computeDueDateISO, toISODate } from "./estimate-utils"

type InvoiceEstimateInput = {
  id: string
  jobId?: string
  jobDetails?: {
    clientName?: string
    jobName?: string
    jobAddress?: string
  }
  pricing?: {
    labor?: number
    materials?: number
    subs?: number
    markup?: number
  }
  tax?: {
    enabled?: boolean
    rate?: number
  }
  deposit?: {
    enabled?: boolean
    type?: "percent" | "fixed"
    value?: number
  }
  estimateRows?: EstimateRow[] | null
  estimateEmbeddedBurdens?: EstimateEmbeddedBurden[] | null
  estimateSections?: EstimateStructuredSection[] | null
}

type InvoiceBuildMode = "auto" | "balance"

type BuildInvoiceArgs = {
  estimate: InvoiceEstimateInput
  mode?: InvoiceBuildMode
  invoiceNo?: string
  issueDate?: Date
  dueTerms: string
  notePaymentTerms: string
  fallbackJobDetails?: {
    clientName?: string
    jobName?: string
    jobAddress?: string
  }
}

export type BuildInvoiceResult =
  | { ok: true; invoice: Invoice }
  | { ok: false; reason: "missing_deposit" | "zero_balance" }

export function makeInvoiceNo() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const rand = Math.floor(Math.random() * 900 + 100)
  return `INV-${y}${m}${day}-${rand}`
}

export function buildInvoiceFromEstimate({
  estimate,
  mode = "auto",
  invoiceNo = makeInvoiceNo(),
  issueDate = new Date(),
  dueTerms,
  notePaymentTerms,
  fallbackJobDetails,
}: BuildInvoiceArgs): BuildInvoiceResult {
  const client =
    estimate.jobDetails?.clientName ||
    fallbackJobDetails?.clientName ||
    "Client"
  const jobName =
    estimate.jobDetails?.jobName ||
    fallbackJobDetails?.jobName ||
    "Job"
  const jobAddress =
    estimate.jobDetails?.jobAddress ||
    fallbackJobDetails?.jobAddress ||
    ""

  const labor = Number(estimate.pricing?.labor || 0)
  const materials = Number(estimate.pricing?.materials || 0)
  const subs = Number(estimate.pricing?.subs || 0)
  const markupPct = Number(estimate.pricing?.markup || 0)
  const taxEnabled = Boolean(estimate.tax?.enabled)
  const taxRate = Number(estimate.tax?.rate || 0)

  const base = labor + materials + subs
  const markedUp = base * (1 + markupPct / 100)
  const taxAmount = taxEnabled ? Math.round(markedUp * (taxRate / 100)) : 0
  const estimateTotal = Math.round(markedUp + taxAmount)

  const depositEnabled = Boolean(estimate.deposit?.enabled)
  const depositType = estimate.deposit?.type === "fixed" ? "fixed" : "percent"
  const depositValue = Number(estimate.deposit?.value || 0)
  const depositDue =
    depositEnabled && estimateTotal > 0
      ? depositType === "percent"
        ? Math.round(estimateTotal * (Math.max(0, Math.min(100, depositValue)) / 100))
        : Math.min(estimateTotal, Math.round(Math.max(0, depositValue)))
      : 0
  const remainingBalance = Math.max(0, estimateTotal - depositDue)

  if (mode === "balance" && !depositEnabled) {
    return { ok: false, reason: "missing_deposit" }
  }
  if (mode === "balance" && remainingBalance <= 0) {
    return { ok: false, reason: "zero_balance" }
  }

  const isBalanceInvoice = mode === "balance"
  const lineItems: { label: string; amount: number }[] = []

  if (isBalanceInvoice) {
    lineItems.push({ label: "Remaining Balance", amount: remainingBalance })
  } else if (depositEnabled) {
    const label =
      depositType === "percent"
        ? `Deposit (${Math.max(0, Math.min(100, depositValue))}% of total)`
        : "Deposit (fixed amount)"
    lineItems.push({ label, amount: depositDue })
  } else {
    if (labor) lineItems.push({ label: "Labor", amount: labor })
    if (materials) lineItems.push({ label: "Materials", amount: materials })
    if (subs) lineItems.push({ label: "Other / Mobilization", amount: subs })
    if (taxEnabled) {
      lineItems.push({ label: `Sales Tax (${taxRate}%)`, amount: taxAmount })
    }
  }

  const invoiceTotal = isBalanceInvoice
    ? remainingBalance
    : depositEnabled
      ? depositDue
      : estimateTotal
  const subtotal = isBalanceInvoice
    ? remainingBalance
    : depositEnabled
      ? depositDue
      : Math.round(markedUp)

  const notes = isBalanceInvoice
    ? `Balance invoice. Estimate total (incl. tax if applied): $${estimateTotal.toLocaleString()}. Deposit paid/required: $${depositDue.toLocaleString()}. Remaining balance due: $${remainingBalance.toLocaleString()}. Payment terms: ${notePaymentTerms}`
    : depositEnabled
      ? `Deposit invoice. Estimate total (incl. tax if applied): $${estimateTotal.toLocaleString()}. Remaining balance after deposit: $${remainingBalance.toLocaleString()}. Payment terms: ${notePaymentTerms}`
      : `Payment terms: ${notePaymentTerms}`

  return {
    ok: true,
    invoice: {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      jobId: estimate.jobId,
      fromEstimateId: estimate.id,
      invoiceNo,
      issueDate: toISODate(issueDate),
      dueDate: computeDueDateISO(issueDate, dueTerms),
      billToName: client,
      jobName,
      jobAddress,
      lineItems,
      subtotal,
      total: invoiceTotal,
      estimateRows: estimate.estimateRows ?? null,
      estimateEmbeddedBurdens: estimate.estimateEmbeddedBurdens ?? null,
      estimateSections: estimate.estimateSections ?? null,
      notes,
      status: "draft",
      paidAt: undefined,
      deposit: depositEnabled
        ? {
            enabled: true,
            type: depositType,
            value: depositValue,
            depositDue,
            remainingBalance,
            estimateTotal,
          }
        : undefined,
    },
  }
}
