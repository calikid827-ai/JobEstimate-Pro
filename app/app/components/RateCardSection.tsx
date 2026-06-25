"use client"

import type { RateCard, RateCardDepositType } from "../lib/rate-card"

type Props = {
  draftRateCard: RateCard
  savedRateCard: RateCard
  onDraftChange: (rateCard: RateCard) => void
  onSave: () => void
  onApply: () => void
  onReset: () => void
}

function numberValue(value: number) {
  return value === 0 ? "" : String(value)
}

function savedSummary(rateCard: RateCard) {
  const deposit = rateCard.deposit.enabled
    ? rateCard.deposit.type === "percent"
      ? `${rateCard.deposit.value}% deposit`
      : `$${Number(rateCard.deposit.value || 0).toLocaleString()} deposit`
    : "No deposit"
  const tax = rateCard.tax.enabled ? `${rateCard.tax.rate}% tax` : "No tax"

  return `${rateCard.markupPct}% markup / ${tax} / ${deposit}`
}

export default function RateCardSection({
  draftRateCard,
  savedRateCard,
  onDraftChange,
  onSave,
  onApply,
  onReset,
}: Props) {
  const updateDraft = (patch: Partial<RateCard>) => {
    onDraftChange({
      ...draftRateCard,
      ...patch,
    })
  }

  const updateTax = (patch: Partial<RateCard["tax"]>) => {
    updateDraft({
      tax: {
        ...draftRateCard.tax,
        ...patch,
      },
    })
  }

  const updateDeposit = (patch: Partial<RateCard["deposit"]>) => {
    updateDraft({
      deposit: {
        ...draftRateCard.deposit,
        ...patch,
      },
    })
  }

  const updateReferenceDefaults = (
    patch: Partial<RateCard["referenceDefaults"]>
  ) => {
    updateDraft({
      referenceDefaults: {
        ...draftRateCard.referenceDefaults,
        ...patch,
      },
    })
  }

  return (
    <div
      data-no-print
      style={{
        marginTop: 12,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 10,
        background: "#f9fafb",
      }}
    >
      <div data-mobile-stack style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Rate Card</h3>
          <div style={{ marginTop: 3, fontSize: 12, color: "#666", lineHeight: 1.45 }}>
            Saved pricing defaults for this device. Applying them updates editable pricing controls only.
          </div>
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            padding: "4px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 999,
            background: "#fff",
            color: "#374151",
            fontSize: 11,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {savedSummary(savedRateCard)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
          Markup default (%)
          <input
            type="number"
            value={numberValue(draftRateCard.markupPct)}
            onChange={(event) =>
              updateDraft({
                markupPct: event.target.value === "" ? 0 : Number(event.target.value),
              })
            }
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={draftRateCard.tax.enabled}
              onChange={(event) => updateTax({ enabled: event.target.checked })}
            />
            <span style={{ fontWeight: 800 }}>Tax default</span>
          </label>
          <input
            type="number"
            value={numberValue(draftRateCard.tax.rate)}
            onChange={(event) =>
              updateTax({
                rate: event.target.value === "" ? 0 : Number(event.target.value),
              })
            }
            placeholder="Tax rate %"
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={draftRateCard.deposit.enabled}
              onChange={(event) => updateDeposit({ enabled: event.target.checked })}
            />
            <span style={{ fontWeight: 800 }}>Deposit default</span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
            <select
              value={draftRateCard.deposit.type}
              onChange={(event) =>
                updateDeposit({ type: event.target.value as RateCardDepositType })
              }
              style={{ width: "100%", padding: 8 }}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
            <input
              type="number"
              value={numberValue(draftRateCard.deposit.value)}
              onChange={(event) =>
                updateDeposit({
                  value: event.target.value === "" ? 0 : Number(event.target.value),
                })
              }
              placeholder={draftRateCard.deposit.type === "percent" ? "25" : "500"}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </div>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 900 }}>
          Reference defaults
        </summary>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input
            placeholder="Trade label reference"
            value={draftRateCard.referenceDefaults.tradeLabel}
            onChange={(event) =>
              updateReferenceDefaults({ tradeLabel: event.target.value })
            }
            style={{ width: "100%", padding: 8 }}
          />
          <textarea
            placeholder="Labor rate note (reference only)"
            value={draftRateCard.referenceDefaults.laborRateNote}
            onChange={(event) =>
              updateReferenceDefaults({ laborRateNote: event.target.value })
            }
            style={{ width: "100%", minHeight: 52, padding: 8, resize: "vertical" }}
          />
          <textarea
            placeholder="Material allowance note (reference only)"
            value={draftRateCard.referenceDefaults.materialAllowanceNote}
            onChange={(event) =>
              updateReferenceDefaults({ materialAllowanceNote: event.target.value })
            }
            style={{ width: "100%", minHeight: 52, padding: 8, resize: "vertical" }}
          />
          <textarea
            placeholder="Minimum charge note (reference only)"
            value={draftRateCard.referenceDefaults.minimumChargeNote}
            onChange={(event) =>
              updateReferenceDefaults({ minimumChargeNote: event.target.value })
            }
            style={{ width: "100%", minHeight: 52, padding: 8, resize: "vertical" }}
          />
          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.45 }}>
            Reference defaults are saved for review only in V1. They do not change labor,
            material totals, minimum charge, PDF wording, or backend pricing authority.
          </div>
        </div>
      </details>

      <div data-mobile-actions style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" onClick={onSave}>
          Save rate card defaults
        </button>
        <button type="button" onClick={onApply}>
          Apply rate card defaults
        </button>
        <button type="button" onClick={onReset} style={{ fontSize: 12 }}>
          Reset to starter values
        </button>
      </div>
    </div>
  )
}
