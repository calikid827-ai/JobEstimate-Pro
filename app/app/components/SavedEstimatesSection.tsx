"use client"

type Props = {
  filteredHistory: any[]
  clearHistory: () => void
  syncServerApprovals: () => Promise<void> | void
  getJobPipelineStatus: (jobId: string) => any
  latestInvoiceForJob: (jobId: string) => any
  hasAnyInvoiceForEstimate: (estimateId: string) => boolean
  loadHistoryItem: (h: any) => void
  createInvoiceFromEstimate: (h: any) => void
  createBalanceInvoiceFromEstimate: (h: any) => void
  copyApprovalLinkForEstimate: (h: any) => Promise<void> | void
  selectJobAndJumpToInvoices: (jobId: string) => void
  downloadInvoicePDF: (inv: any) => void
  deleteHistoryItem: (id: string) => void
  setStatus: (msg: string) => void
}

function historyPrimaryActionLabel(historyPipeline: any) {
  if (!historyPipeline?.primaryAction) return null

  switch (historyPipeline.primaryAction) {
    case "copy_approval":
      return "Copy Approval Link"
    case "create_deposit_invoice":
      return "Create Deposit Invoice"
    case "create_balance_invoice":
      return "Create Balance Invoice"
    case "create_final_invoice":
      return "Create Final Invoice"
    case "await_deposit_payment":
      return "View Deposit Invoice"
    case "await_final_payment":
      return "View Final Invoice"
    case "paid_closed":
      return "View Paid Invoice"
    default:
      return null
  }
}

export default function SavedEstimatesSection({
  filteredHistory,
  clearHistory,
  syncServerApprovals,
  getJobPipelineStatus,
  latestInvoiceForJob,
  hasAnyInvoiceForEstimate,
  loadHistoryItem,
  createInvoiceFromEstimate,
  createBalanceInvoiceFromEstimate,
  copyApprovalLinkForEstimate,
  selectJobAndJumpToInvoices,
  downloadInvoicePDF,
  deleteHistoryItem,
  setStatus,
}: Props) {
  if (filteredHistory.length === 0) return null

  function runHistoryPrimaryAction(h: any, historyPipeline: any) {
    if (!historyPipeline?.primaryAction) return

    if (historyPipeline.primaryAction === "copy_approval") {
      void copyApprovalLinkForEstimate(h)
      return
    }

    if (historyPipeline.primaryAction === "create_deposit_invoice") {
      createInvoiceFromEstimate(h)
      return
    }

    if (historyPipeline.primaryAction === "create_balance_invoice") {
      createBalanceInvoiceFromEstimate(h)
      return
    }

    if (historyPipeline.primaryAction === "create_final_invoice") {
      createInvoiceFromEstimate(h)
      return
    }

    if (historyPipeline.primaryAction === "await_deposit_payment") {
      if (h.jobId) selectJobAndJumpToInvoices(h.jobId)
      return
    }

    if (historyPipeline.primaryAction === "await_final_payment") {
      if (h.jobId) selectJobAndJumpToInvoices(h.jobId)
      return
    }

    if (historyPipeline.primaryAction === "paid_closed") {
      if (h.jobId) selectJobAndJumpToInvoices(h.jobId)
    }
  }

  return (
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => void syncServerApprovals()} style={{ fontSize: 12 }}>
            Sync approvals
          </button>
          <button type="button" onClick={clearHistory} style={{ fontSize: 12 }}>
            Clear all
          </button>
        </div>
      </div>

      <p style={{ marginTop: 6, marginBottom: 10, fontSize: 12, color: "#666" }}>
        Click “Load” to restore an estimate and download the PDF again.
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {filteredHistory.map((h) => {
          const historyPipeline = h.jobId ? getJobPipelineStatus(h.jobId) : null
          const historyLatestInv = h.jobId ? latestInvoiceForJob(h.jobId) : null

          return (
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
                      {h.jobDetails?.jobName || "Untitled Job"}
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
                    {h.jobDetails?.clientName ? `Client: ${h.jobDetails.clientName} • ` : ""}
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

                  {historyPipeline && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 10,
                        border:
                          historyPipeline.tone === "good"
                            ? "1px solid #86efac"
                            : historyPipeline.tone === "warning"
                            ? "1px solid #fdba74"
                            : historyPipeline.tone === "info"
                            ? "1px solid #93c5fd"
                            : "1px solid #e5e7eb",
                        background:
                          historyPipeline.tone === "good"
                            ? "#ecfdf5"
                            : historyPipeline.tone === "warning"
                            ? "#fff7ed"
                            : historyPipeline.tone === "info"
                            ? "#eff6ff"
                            : "#f9fafb",
                        color:
                          historyPipeline.tone === "good"
                            ? "#065f46"
                            : historyPipeline.tone === "warning"
                            ? "#9a3412"
                            : historyPipeline.tone === "info"
                            ? "#1d4ed8"
                            : "#444",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        Workflow Status: {historyPipeline.label}
                      </div>

                      <div style={{ marginTop: 4 }}>{historyPipeline.message}</div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
  {(() => {
    const primaryLabel = historyPrimaryActionLabel(historyPipeline)

    return (
      <>
        {historyPipeline?.primaryAction && primaryLabel && (
          <button
            type="button"
            onClick={() => runHistoryPrimaryAction(h, historyPipeline)}
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 10px",
              borderRadius: 8,
            }}
          >
            {primaryLabel}
          </button>
        )}

        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              color: "#555",
            }}
          >
            Secondary Tools
          </summary>

          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <button type="button" onClick={() => loadHistoryItem(h)} style={{ fontSize: 12 }}>
              Load
            </button>

            {h.jobId && (
              <button
                type="button"
                onClick={() => {
                  if (!h.jobId) return
                  selectJobAndJumpToInvoices(h.jobId)
                }}
                style={{ fontSize: 12 }}
              >
                View Invoices
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!historyLatestInv) {
                  setStatus("No invoices found for this estimate/job yet.")
                  return
                }
                downloadInvoicePDF(historyLatestInv)
                setStatus("Downloading latest invoice PDF.")
              }}
              disabled={!historyLatestInv}
              style={{
                fontSize: 12,
                opacity: historyLatestInv ? 1 : 0.6,
                cursor: historyLatestInv ? "pointer" : "not-allowed",
              }}
            >
              Download Latest Invoice PDF
            </button>

            <button
              type="button"
              onClick={() => deleteHistoryItem(h.id)}
              style={{ fontSize: 12 }}
            >
              Delete
            </button>
          </div>
        </details>
      </>
    )
  })()}
</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
