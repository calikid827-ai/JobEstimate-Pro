"use client"

import type React from "react"

type Props = {
  filteredInvoices: any[]
  invoicesSectionRef: React.RefObject<HTMLDivElement | null>
  setInvoices: React.Dispatch<React.SetStateAction<any[]>>
  setStatus: (msg: string) => void
  downloadInvoicePDF: (inv: any) => void
  computeLiveInvoiceStatus: (inv: any) => string
  updateInvoice: (id: string, patch: any) => void
  INVOICE_KEY: string
}

export default function InvoicesSection({
  filteredInvoices,
  invoicesSectionRef,
  setInvoices,
  setStatus,
  downloadInvoicePDF,
  computeLiveInvoiceStatus,
  updateInvoice,
  INVOICE_KEY,
}: Props) {
  if (filteredInvoices.length === 0) return null

  return (
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
        {filteredInvoices.map((inv) => {
          const liveStatus = computeLiveInvoiceStatus(inv)

          return (
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

                    {liveStatus === "paid" && (
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
                          liveStatus === "paid"
                            ? "#ecfdf5"
                            : liveStatus === "overdue"
                            ? "#fff5f5"
                            : "#f3f4f6",
                        color:
                          liveStatus === "paid"
                            ? "#065f46"
                            : liveStatus === "overdue"
                            ? "#9b1c1c"
                            : "#111827",
                      }}
                    >
                      {liveStatus.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                    {inv.billToName} • Due {new Date(inv.dueDate).toLocaleDateString()}
                  </div>

                  {liveStatus === "paid" && inv.paidAt && (
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
                      if (liveStatus === "paid") {
                        updateInvoice(inv.id, { status: "sent", paidAt: undefined })
                        setStatus(`Marked unpaid: ${inv.invoiceNo}`)
                      } else {
                        updateInvoice(inv.id, { status: "paid", paidAt: Date.now() })
                        setStatus(`Marked paid: ${inv.invoiceNo}`)
                      }
                    }}
                    style={{ fontSize: 12 }}
                  >
                    {liveStatus === "paid" ? "Mark Unpaid" : "Mark Paid"}
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
          )
        })}
      </div>
    </div>
  )
}