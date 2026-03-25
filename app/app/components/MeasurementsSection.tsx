"use client"

import type React from "react"

type Props = {
  scopeQuality: any
  measureEnabled: boolean
  setMeasureEnabled: (value: boolean) => void
  measureRows: any[]
  setMeasureRows: React.Dispatch<React.SetStateAction<any[]>>
  rowSqft: (r: any) => number
  totalSqft: number
}

export default function MeasurementsSection({
  scopeQuality,
  measureEnabled,
  setMeasureEnabled,
  measureRows,
  setMeasureRows,
  rowSqft,
  totalSqft,
}: Props) {
  return (
    <>
      {scopeQuality.score < 70 && (
        <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm">
          <div className="font-semibold">⚠ Scope may be incomplete</div>

          <ul className="mt-1 list-disc pl-5">
            {scopeQuality.warnings.map((w: string, i: number) => (
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
          overflow: "visible",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={measureEnabled}
            onChange={(e) => setMeasureEnabled(e.target.checked)}
          />
          <span style={{ fontWeight: 600 }}>Optional Measurements</span>
          <span style={{ fontSize: 12, color: "#666" }}>
            (helps pricing + detail)
          </span>
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
                  gap: 10,
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
                  placeholder="Label"
                  style={{ padding: 8 }}
                />

                <input
                  type="number"
                  value={r.lengthFt === 0 ? "" : r.lengthFt}
                  onChange={(e) => {
                    const val =
                      e.target.value === "" ? 0 : Number(e.target.value)
                    const next = [...measureRows]
                    next[idx] = { ...next[idx], lengthFt: val }
                    setMeasureRows(next)
                  }}
                  placeholder="Length"
                  style={{ padding: 8 }}
                />

                <input
                  type="number"
                  value={r.heightFt === 0 ? "" : r.heightFt}
                  onChange={(e) => {
                    const val =
                      e.target.value === "" ? 0 : Number(e.target.value)
                    const next = [...measureRows]
                    next[idx] = { ...next[idx], heightFt: val }
                    setMeasureRows(next)
                  }}
                  placeholder="Height"
                  style={{ padding: 8 }}
                />

                <input
                  type="number"
                  value={r.qty}
                  min={1}
                  onChange={(e) => {
                    const val =
                      e.target.value === "" ? 1 : Number(e.target.value)
                    const next = [...measureRows]
                    next[idx] = {
                      ...next[idx],
                      qty: Math.max(1, val),
                    }
                    setMeasureRows(next)
                  }}
                  placeholder="Qty"
                  style={{ padding: 8 }}
                />

                <div
                  style={{
                    fontSize: 13,
                    color: "#333",
                    textAlign: "right",
                  }}
                >
                  <strong>{rowSqft(r)}</strong> sqft
                </div>
              </div>
            ))}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
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
    </>
  )
}