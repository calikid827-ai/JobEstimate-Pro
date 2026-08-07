import type {
  ActualsVsEstimateFeedback,
  RecordedCostComparisonRow,
} from "../lib/actuals-vs-estimate"

type ActualsVsEstimateSectionProps = {
  feedback: ActualsVsEstimateFeedback
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function differenceText(row: RecordedCostComparisonRow) {
  if (row.differenceToDate == null || row.status === "not_recorded") {
    return "Not recorded"
  }

  if (row.status === "over_estimate") {
    return `${formatCurrency(Math.abs(row.differenceToDate))} over`
  }

  if (row.status === "under_estimate") {
    return `${formatCurrency(Math.abs(row.differenceToDate))} under`
  }

  if (row.status === "unplanned_cost") {
    return "Unplanned recorded cost"
  }

  return "On estimate"
}

export default function ActualsVsEstimateSection({
  feedback,
}: ActualsVsEstimateSectionProps) {
  const hasLinkedEstimate = feedback.state !== "no_linked_estimate"

  return (
    <section
      data-no-print
      aria-label="Actuals vs Estimate"
      style={{ display: "grid", gap: 10 }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: 14, color: "#111827" }}>
          Actuals vs Estimate
        </h4>
        {feedback.estimateBasisLabel && (
          <div style={{ marginTop: 3, fontSize: 12, color: "#4b5563" }}>
            Basis: <strong>{feedback.estimateBasisLabel}</strong>
          </div>
        )}
      </div>

      {!hasLinkedEstimate ? (
        <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
          Original saved estimate not available for this job.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 6 }}>
            {feedback.rows.map((row) => (
              <div
                key={row.key}
                data-mobile-grid
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1fr) repeat(3, minmax(0, 1.15fr)) minmax(0, 1.2fr)",
                  gap: 8,
                  padding: "8px 0",
                  borderTop: "1px solid #e5e7eb",
                  alignItems: "start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Category</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 800 }}>
                    {row.label}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {feedback.columnLabels.estimatedCost}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, overflowWrap: "anywhere" }}>
                    {formatCurrency(row.estimatedCost)}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {feedback.columnLabels.recordedCost}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, overflowWrap: "anywhere" }}>
                    {row.recordedCost == null
                      ? "Not recorded"
                      : formatCurrency(row.recordedCost)}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {feedback.columnLabels.differenceToDate}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, overflowWrap: "anywhere" }}>
                    {differenceText(row)}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Status</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 800 }}>
                    {row.statusLabel}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {feedback.state === "no_recorded_costs" && (
            <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
              Enter recorded costs below to compare them with the original saved estimate.
            </div>
          )}

          {feedback.state === "partial_recorded_costs" && (
            <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
              Missing supported cost categories remain marked Not recorded.
            </div>
          )}

          {feedback.state === "supported_costs_recorded" && (
            <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
              All supported cost categories are recorded to date. Job completion is not known,
              and final profit is not calculated.
            </div>
          )}

          <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.45 }}>
            Reference only. This has not changed your Rate Card or future estimates.
          </div>
        </>
      )}
    </section>
  )
}
