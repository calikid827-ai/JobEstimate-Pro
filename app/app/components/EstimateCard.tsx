"use client"

type Props = {
  h: any
  historyPipeline: any
  historyLatestInv: any

  runHistoryPrimaryAction: (h: any) => void
  historyPrimaryActionLabel: (p: any) => string | null

  loadHistoryItem: (id: string) => void
  deleteHistoryItem: (id: string) => void
  selectJobAndJumpToInvoices: (jobId: string) => void
  downloadInvoicePDF: (inv: any) => void

  setStatus: (msg: string) => void
}

export default function EstimateCard({
  h,
  historyPipeline,
  historyLatestInv,

  runHistoryPrimaryAction,
  historyPrimaryActionLabel,

  loadHistoryItem,
  deleteHistoryItem,
  selectJobAndJumpToInvoices,
  downloadInvoicePDF,

  setStatus
}: Props) {

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        background: "#fff"
      }}
    >

      {/* Header */}

      <div style={{ fontWeight: 800 }}>
        {h.jobName}
      </div>

      {/* Pipeline Status */}

      {historyPipeline && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontSize: 12
          }}
        >
          <div style={{ fontWeight: 900 }}>
            Workflow Status: {historyPipeline.label}
          </div>

          <div style={{ marginTop: 4 }}>
            {historyPipeline.message}
          </div>
        </div>
      )}

      {/* Primary Action */}

      {historyPipeline?.primaryAction && (
        <button
          type="button"
          onClick={() => runHistoryPrimaryAction(h)}
          style={{
            marginTop: 8,
            fontSize: 12,
            fontWeight: 800,
            padding: "8px 10px",
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            border: "none"
          }}
        >
          {historyPrimaryActionLabel(historyPipeline)}
        </button>
      )}

      {/* Secondary Tools */}

      <details style={{ marginTop: 6 }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: "#555"
          }}
        >
          Secondary Tools
        </summary>

        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 6
          }}
        >

          <button
            type="button"
            onClick={() => loadHistoryItem(h.id)}
            style={{ fontSize: 12 }}
          >
            Load Estimate
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
            onClick={() => deleteHistoryItem(h.id)}
            style={{
              fontSize: 12,
              color: "#b91c1c"
            }}
          >
            Delete
          </button>

        </div>
      </details>

    </div>
  )
}