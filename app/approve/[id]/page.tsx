"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import SignatureCanvas from "react-signature-canvas"
import { buildInvoiceFromEstimate } from "../../app/lib/invoices"

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
  const [loadingEstimate, setLoadingEstimate] = useState(true)
  const [estimateSource, setEstimateSource] = useState<"server" | "local" | null>(null)
  const [clientName, setClientName] = useState("")
  const [agree, setAgree] = useState(false)
  const [status, setStatus] = useState("")
  const sigRef = useRef<SignatureCanvas | null>(null)
  const [signatureError, setSignatureError] = useState("")

  useEffect(() => {
    let cancelled = false

    function loadLocalEstimate() {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (!raw) return null

      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return null
        return parsed.find((x: any) => String(x?.id) === id) || null
      } catch {
        return null
      }
    }

    async function loadEstimate() {
      setLoadingEstimate(true)

      try {
        const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`)
        const data = await res.json().catch(() => null)

        if (res.ok && data?.estimate && typeof data.estimate === "object") {
          const serverEstimate: EstimateHistoryItem = {
            ...data.estimate,
            approval: {
              ...(data.estimate.approval || {}),
              status: data.status === "approved" ? "approved" : "pending",
            },
          }

          if (cancelled) return
          setEstimate(serverEstimate)
          setEstimateSource("server")
          if (serverEstimate.jobDetails?.clientName) {
            setClientName(serverEstimate.jobDetails.clientName)
          }
          return
        }
      } catch {
        // Fall back to localStorage below.
      }

      const found = loadLocalEstimate()
      if (cancelled) return
      setEstimate(found)
      setEstimateSource(found ? "local" : null)
      if (found?.jobDetails?.clientName) {
        setClientName(found.jobDetails.clientName)
      }
    }

    void loadEstimate().finally(() => {
      if (!cancelled) setLoadingEstimate(false)
    })

    return () => {
      cancelled = true
    }
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

    const terms = "Due upon approval"
    const built = buildInvoiceFromEstimate({
      estimate: est,
      dueTerms: terms,
      notePaymentTerms: terms,
    })
    if (!built.ok) return false

    const nextInvoices = [built.invoice, ...existingInvoices]
    localStorage.setItem(INVOICE_KEY, JSON.stringify(nextInvoices))
    return true
  }

  function approveLocally(
    localEstimate: EstimateHistoryItem,
    approvedAt: number,
    signatureDataUrl: string
  ) {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) {
      setStatus("No estimate history found.")
      return false
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      setStatus("Invalid estimate history.")
      return false
    }

    const next = parsed.map((x: any) =>
      String(x?.id) === localEstimate.id
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
      ...localEstimate,
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
    return true
  }

  async function approveNow() {
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

  if (estimateSource === "server") {
    try {
      setStatus("Saving approval...")

      const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedBy: clientName.trim(),
          approvedAt: new Date(approvedAt).toISOString(),
          signatureDataUrl,
        }),
      })

      if (!res.ok) {
        throw new Error("Server approval failed")
      }

      const approvedEstimate: EstimateHistoryItem = {
        ...estimate,
        approval: {
          status: "approved",
          approvedBy: clientName.trim(),
          approvedAt,
          signatureDataUrl,
        },
      }

      setEstimate(approvedEstimate)
      setStatus("Approved successfully.")
      return
    } catch {
      // Preserve existing local approval behavior as fallback below.
    }
  }

  try {
    approveLocally(estimate, approvedAt, signatureDataUrl)
  } catch {
    setStatus("Approval failed.")
  }
}

  if (loadingEstimate) {
    return (
      <main style={{ maxWidth: 720, margin: "60px auto", padding: 24, fontFamily: "system-ui" }}>
        <h1>Loading approval</h1>
        <p>Loading this approval document...</p>
      </main>
    )
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
