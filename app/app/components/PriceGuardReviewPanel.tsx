"use client"

import type { PriceGuardReview } from "../lib/priceguard-review"

type Props = {
  review: PriceGuardReview | null
  hasResult: boolean
}

function SectionList({
  title,
  items,
  tone = "neutral",
}: {
  title: string
  items: string[]
  tone?: "neutral" | "warning" | "good"
}) {
  if (items.length === 0) return null

  const color =
    tone === "good" ? "#065f46" : tone === "warning" ? "#92400e" : "#111827"

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900, color }}>{title}</div>
      <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18, lineHeight: 1.5 }}>
        {items.map((item, index) => (
          <li key={`${title}-${index}`} style={{ fontSize: 12, color: "#374151" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PriceGuardReviewPanel({ review, hasResult }: Props) {
  const tone =
    review?.level === "strong"
      ? { bg: "#ecfdf5", border: "#86efac", color: "#065f46", label: "Strong" }
      : review?.level === "profit_leak"
      ? { bg: "#fef2f2", border: "#fecaca", color: "#991b1b", label: "Needs Review" }
      : { bg: "#fff7ed", border: "#fdba74", color: "#92400e", label: "Review" }

  return (
    <section
      data-no-print
      style={{
        marginTop: hasResult ? 14 : 18,
        marginBottom: hasResult ? 14 : 0,
        padding: 14,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
    >
      <div
        data-mobile-stack
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2937" }}>
            PriceGuard Review
          </div>
          <h3 style={{ margin: "3px 0 0", fontSize: 18 }}>
            {review ? review.headline : "Generate an estimate to see PriceGuard review."}
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
            {review
              ? review.summary
              : "PriceGuard will check scope clarity, possible missed items, labor/material confidence, exclusions, payment clarity, and customer-ready price defense notes."}
          </p>
        </div>

        {review && (
          <div
            style={{
              flex: "0 0 auto",
              padding: "7px 10px",
              borderRadius: 999,
              border: `1px solid ${tone.border}`,
              background: tone.bg,
              color: tone.color,
              fontSize: 12,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {tone.label} · {review.score}/100
          </div>
        )}
      </div>

      {review && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <SectionList
              title="Add these notes before sending"
              items={[...review.missedScopeWarnings, ...review.scopeClarityWarnings].slice(0, 6)}
              tone={review.level === "strong" ? "neutral" : "warning"}
            />
            <SectionList
              title="Labor/material confidence"
              items={review.laborMaterialConfidenceNotes}
              tone={review.laborMaterialConfidenceNotes.length > 0 ? "warning" : "neutral"}
            />
            <SectionList
              title="Suggested exclusions"
              items={review.suggestedExclusions}
            />
            <SectionList
              title="Customer-ready explanation"
              items={review.customerPriceDefenseNotes}
              tone="good"
            />
          </div>

          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
              Contractor-only risk notes
            </div>
            {review.contractorRiskNotes.length > 0 ? (
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                {review.contractorRiskNotes.map((item, index) => (
                  <li key={`contractor-risk-${index}`} style={{ fontSize: 12, color: "#374151" }}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563" }}>
                No major internal risk notes were detected by this deterministic pass.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
