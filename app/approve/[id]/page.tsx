"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import SignatureCanvas from "react-signature-canvas"

type Schedule = {
  crewDays: number | null
  visits: number | null
  calendarDays: { min: number; max: number } | null
  workDaysPerWeek: number | null
  rationale: string[]
  startDate?: string | null
}

type EstimateHistoryItem = {
  id: string
  createdAt: number
  jobId?: string
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  jobDetails: {
    clientName: string
    jobName: string
    changeOrderNo: string
    jobAddress: string
    date: string
  }
  trade: string
  state: string
  scopeChange: string
  result: string
  pricing: {
    labor: number
    materials: number
    subs: number
    markup: number
    total: number
  }
  schedule?: Schedule | null
  tax?: {
    enabled: boolean
    rate: number
  }
  deposit?: {
    enabled: boolean
    type: "percent" | "fixed"
    value: number
  }
  approval?: {
    status: "pending" | "approved"
    approvedBy?: string
    approvedAt?: number
    signatureDataUrl?: string
  }
}

const HISTORY_KEY = "jobestimatepro_history_v1"
const INVOICE_KEY = "jobestimatepro_invoices"

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue"

type Invoice = {
  id: string
  createdAt: number
  jobId?: string
  fromEstimateId: string
  invoiceNo: string
  issueDate: string
  dueDate: string
  billToName: string
  jobName: string
  jobAddress: string
  lineItems: { label: string; amount: number }[]
  subtotal: number
  total: number
  notes: string
  status: InvoiceStatus
  paidAt?: number
  deposit?: {
    enabled: boolean
    type: "percent" | "fixed"
    value: number
    depositDue: number
    remainingBalance: number
    estimateTotal: number
  }
}

export default function ApproveEstimatePage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || "")

  const [estimate, setEstimate] = useState<EstimateHistoryItem | null>(null)
  const [clientName, setClientName] = useState("")
  const [agree, setAgree] = useState(false)
  const [status, setStatus] = useState("")
  const sigRef = useRef<SignatureCanvas | null>(null)
  const [signatureError, setSignatureError] = useState("")

  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      const found = parsed.find((x: any) => String(x?.id) === id) || null
      setEstimate(found)
      if (found?.jobDetails?.clientName) {
        setClientName(found.jobDetails.clientName)
      }
    } catch {}
  }, [id])

  const depositSummary = useMemo(() => {
    if (!estimate?.deposit?.enabled) return null

    const total = Number(estimate.pricing?.total || 0)
    const depType = estimate.deposit.type === "fixed" ? "fixed" : "percent"
    const depValue = Number(estimate.deposit.value || 0)

    let depositDue = 0
    if (depType === "percent") {
      depositDue = Math.round(total * (Math.max(0, Math.min(100, depValue)) / 100))
    } else {
      depositDue = Math.min(total, Math.round(Math.max(0, depValue)))
    }

    return {
      depositDue,
      remaining: Math.max(0, total - depositDue),
    }
  }, [estimate])

    function makeInvoiceNo() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const rand = Math.floor(Math.random() * 900 + 100)
    return `INV-${y}${m}${day}-${rand}`
  }

  function toISODate(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  function parseNetDays(termsRaw: string): number | null {
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

  function computeDueDateISO(issueDate: Date, termsRaw: string) {
    const netDays = parseNetDays(termsRaw)
    const daysToAdd = netDays == null ? 7 : netDays
    const due = new Date(issueDate)
    due.setDate(due.getDate() + daysToAdd)
    return toISODate(due)
  }

  function autoCreateInvoiceForApprovedEstimate(est: EstimateHistoryItem) {
    const existingRaw = localStorage.getItem(INVOICE_KEY)

    let existingInvoices: Invoice[] = []
    try {
      const parsed = existingRaw ? JSON.parse(existingRaw) : []
      if (Array.isArray(parsed)) {
        existingInvoices = parsed
      }
    } catch {}

    const alreadyExists = existingInvoices.some(
      (inv) => String(inv?.fromEstimateId) === est.id
    )

    if (alreadyExists) {
      return false
    }

    const issue = new Date()
    const terms = "Due upon approval"
    const dueISO = computeDueDateISO(issue, terms)

    const client = est.jobDetails?.clientName || "Client"
    const jobNm = est.jobDetails?.jobName || "Job"
    const jobAddr = est.jobDetails?.jobAddress || ""

    const labor = Number(est?.pricing?.labor || 0)
    const materials = Number(est?.pricing?.materials || 0)
    const subs = Number(est?.pricing?.subs || 0)
    const markupPct = Number(est?.pricing?.markup || 0)

    const taxEnabledSnap = Boolean(est.tax?.enabled)
    const taxRateSnap = Number(est.tax?.rate || 0)

    const base = labor + materials + subs
    const markedUp = base * (1 + markupPct / 100)
    const taxAmt = taxEnabledSnap ? Math.round(markedUp * (taxRateSnap / 100)) : 0
    const estimateTotal = Math.round(markedUp + taxAmt)

    const depEnabled = Boolean(est.deposit?.enabled)
    const depType = est.deposit?.type === "fixed" ? "fixed" : "percent"
    const depValue = Number(est.deposit?.value || 0)

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

    const lineItems: { label: string; amount: number }[] = []

    if (depEnabled) {
      const label =
        depType === "percent"
          ? `Deposit (${Math.max(0, Math.min(100, depValue))}% of total)`
          : `Deposit (fixed amount)`

      lineItems.push({ label, amount: depDue })
    } else {
      if (labor) lineItems.push({ label: "Labor", amount: labor })
      if (materials) lineItems.push({ label: "Materials", amount: materials })
      if (subs) lineItems.push({ label: "Other / Mobilization", amount: subs })
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
      subtotal: depEnabled ? depDue : Math.round(markedUp),
      total: depEnabled ? depDue : estimateTotal,
      notes: depEnabled
        ? `Deposit invoice. Estimate total (incl. tax if applied): $${estimateTotal.toLocaleString()}. Remaining balance after deposit: $${depRemain.toLocaleString()}. Payment terms: Due upon approval.`
        : `Payment terms: Due upon approval.`,
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

    const nextInvoices = [inv, ...existingInvoices]
    localStorage.setItem(INVOICE_KEY, JSON.stringify(nextInvoices))
    return true
  }

  function approveNow() {
  if (!estimate) return

  setStatus("")
  setSignatureError("")

  if (!clientName.trim()) {
    setStatus("Please enter your full name.")
    return
  }

  if (!agree) {
    setStatus("Please confirm approval before continuing.")
    return
  }

  if (!sigRef.current || sigRef.current.isEmpty()) {
    setSignatureError("Please add your signature.")
    return
  }

  setSignatureError("")

  const approvedAt = Date.now()
  const signatureDataUrl = sigRef.current
    .getTrimmedCanvas()
    .toDataURL("image/png")

  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) {
      setStatus("No estimate history found.")
      return
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      setStatus("Invalid estimate history.")
      return
    }

    const next = parsed.map((x: any) =>
      String(x?.id) === estimate.id
        ? {
            ...x,
            approval: {
              status: "approved",
              approvedBy: clientName.trim(),
              approvedAt,
              signatureDataUrl,
            },
          }
        : x
    )

        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))

    const approvedEstimate: EstimateHistoryItem = {
      ...estimate,
      approval: {
        status: "approved",
        approvedBy: clientName.trim(),
        approvedAt,
        signatureDataUrl,
      },
    }

    const invoiceCreated = autoCreateInvoiceForApprovedEstimate(approvedEstimate)

    setEstimate(approvedEstimate)

    setStatus(
      invoiceCreated
        ? "Approved successfully. Draft invoice created."
        : "Approved successfully."
    )
    window.dispatchEvent(new Event("jobestimatepro:update"))
  } catch {
    setStatus("Approval failed.")
  }
}

  if (!estimate) {
    return (
      <main style={{ maxWidth: 720, margin: "60px auto", padding: 24, fontFamily: "system-ui" }}>
        <h1>Estimate not found</h1>
        <p>This approval link may be invalid or the estimate is no longer saved on this device.</p>
        <button onClick={() => router.push("/app")}>Back to app</button>
      </main>
    )
  }

  const approved = estimate.approval?.status === "approved"

  const approveButtonLabel =
  estimate.documentType === "Change Order"
    ? "Approve Change Order"
    : estimate.documentType === "Estimate"
    ? "Approve Estimate"
    : "Approve Document"

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: 24,
        fontFamily: "system-ui",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#fff",
      }}
    >
      <h1 style={{ marginBottom: 4 }}>Client Approval</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Review and approve this document.
      </p>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <div><strong>Document:</strong> {estimate.documentType}</div>
        <div><strong>Client:</strong> {estimate.jobDetails.clientName || "Client"}</div>
        <div><strong>Job:</strong> {estimate.jobDetails.jobName || "Job"}</div>
        {estimate.jobDetails.jobAddress && (
          <div><strong>Address:</strong> {estimate.jobDetails.jobAddress}</div>
        )}
        <div><strong>Total:</strong> ${Number(estimate.pricing.total || 0).toLocaleString()}</div>

        {depositSummary && (
          <div style={{ marginTop: 8, color: "#333" }}>
            <div><strong>Deposit Due:</strong> ${depositSummary.depositDue.toLocaleString()}</div>
            <div><strong>Remaining Balance:</strong> ${depositSummary.remaining.toLocaleString()}</div>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fafafa",
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
        }}
      >
        {estimate.result}
      </div>

      {estimate.schedule && (
        <div style={{ marginTop: 18, padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Schedule</div>
          <div>Crew Days: {estimate.schedule.crewDays ?? "—"}</div>
          <div>Site Visits: {estimate.schedule.visits ?? "—"}</div>
          <div>
            Duration:{" "}
            {estimate.schedule.calendarDays
              ? `${estimate.schedule.calendarDays.min}–${estimate.schedule.calendarDays.max} calendar days`
              : "—"}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
        {approved ? (
          <>
            <div style={{ fontWeight: 900, color: "#065f46" }}>Approved</div>
            <div style={{ marginTop: 8 }}>
  Approved by <strong>{estimate.approval?.approvedBy || "Client"}</strong>
</div>

{estimate.approval?.approvedAt && (
  <div style={{ color: "#666", marginTop: 4 }}>
    {new Date(estimate.approval.approvedAt).toLocaleString()}
  </div>
)}

{estimate.approval?.signatureDataUrl && (
  <div style={{ marginTop: 12 }}>
    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
      Signature
    </div>
    <img
      src={estimate.approval.signatureDataUrl}
      alt="Client signature"
      style={{
        maxWidth: 320,
        width: "100%",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
      }}
    />
  </div>
)}
          </>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Full Name
            </label>
            <input
  value={clientName}
  onChange={(e) => setClientName(e.target.value)}
  placeholder="Enter full name"
  autoComplete="name"
  style={{ width: "100%", padding: 10, marginBottom: 12, fontSize: 16 }}
/>

            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
  Signature
</label>

<div
  style={{
    border: "1px solid #d1d5db",
    borderRadius: 10,
    overflow: "hidden",
    background: "#fff",
    marginBottom: 8,
  }}
>
  <SignatureCanvas
  ref={(ref) => {
    sigRef.current = ref
  }}
  penColor="black"
  onBegin={() => setSignatureError("")}
  canvasProps={{
    width: 640,
    height: 180,
    style: {
      width: "100%",
      height: 180,
      display: "block",
      background: "#fff",
    },
  }}
/>
</div>

<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
  <div style={{ fontSize: 12, color: "#666" }}>
    Sign with mouse or finger.
  </div>

  <button
    type="button"
    onClick={() => {
      sigRef.current?.clear()
      setSignatureError("")
    }}
    style={{
      fontSize: 12,
      padding: "6px 10px",
      borderRadius: 8,
      border: "1px solid #ddd",
      background: "#fff",
      cursor: "pointer",
    }}
  >
    Clear Signature
  </button>
</div>

{signatureError && (
  <div style={{ marginBottom: 12, fontSize: 13, color: "#b91c1c" }}>
    {signatureError}
  </div>
)}

            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>
                I approve the scope of work and pricing described in this document.
              </span>
            </label>

            <button
  type="button"
  onClick={approveNow}
  style={{
    marginTop: 14,
    width: "100%",
    padding: 12,
    background: "#000",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  }}
>
  {approveButtonLabel}
</button>
          </>
        )}

        {status && (
          <div style={{ marginTop: 10, fontSize: 13, color: approved ? "#065f46" : "#444" }}>
            {status}
          </div>
        )}
      </div>
    </main>
  )
}