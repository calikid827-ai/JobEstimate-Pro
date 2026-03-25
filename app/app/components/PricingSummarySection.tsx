"use client"

type Props = {
  pricing: any
  setPricing: (p: any) => void
  setPricingEdited: (v: boolean) => void

  applyProfitTarget: (pct: number) => void

  depositEnabled: boolean
  setDepositEnabled: (v: boolean) => void
  depositType: string
  setDepositType: (v: any) => void
  depositValue: number
  setDepositValue: (v: number) => void
  depositDue: number
  remainingBalance: number

  taxEnabled: boolean
  setTaxEnabled: (v: boolean) => void
  taxRate: number
  setTaxRate: (v: number) => void
  taxAmount: number

  minimumSafeStatus: any
  historicalPriceGuard: any

  PriceGuardBadge: any

  pdfShowPriceGuard: boolean
  pdfPriceGuardLabel: string
  isUserEdited: boolean

  downloadPDF: () => void
}

export default function PricingSummarySection({
  pricing,
  setPricing,
  setPricingEdited,

  applyProfitTarget,

  depositEnabled,
  setDepositEnabled,
  depositType,
  setDepositType,
  depositValue,
  setDepositValue,
  depositDue,
  remainingBalance,

  taxEnabled,
  setTaxEnabled,
  taxRate,
  setTaxRate,
  taxAmount,

  minimumSafeStatus,
  historicalPriceGuard,

  PriceGuardBadge,

  pdfShowPriceGuard,
  pdfPriceGuardLabel,
  isUserEdited,

  downloadPDF,
}: Props) {
  return (
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
          <button type="button" onClick={() => applyProfitTarget(20)} style={{ fontSize: 12 }}>
            Hit 20% Profit
          </button>

          <button type="button" onClick={() => applyProfitTarget(25)} style={{ fontSize: 12 }}>
            Hit 25% Profit
          </button>

          <button type="button" onClick={() => applyProfitTarget(30)} style={{ fontSize: 12 }}>
            Hit 30% Profit
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
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
              <span style={{ fontSize: 12, color: "#666" }}>(shows on PDF + invoices)</span>
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

          <div
            style={{
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
                  onChange={(e) => setTaxRate(e.target.value === "" ? 0 : Number(e.target.value))}
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
        </div>

        <div
          style={{
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#fff",
            fontSize: 16,
            fontWeight: 800,
          }}
        >
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

      <button
        type="button"
        onClick={downloadPDF}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#111"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#000"
        }}
        style={{
          width: "100%",
          padding: 14,
          marginTop: 16,
          fontSize: 16,
          fontWeight: 800,
          background: "#000",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        }}
      >
        Download Estimate PDF
      </button>
    </>
  )
}