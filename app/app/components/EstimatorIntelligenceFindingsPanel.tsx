"use client"

import type {
  EstimatorIntelligenceFinding,
  EstimatorIntelligenceFindingsResult,
} from "../lib/estimator-intelligence-findings"

type Props = {
  result: EstimatorIntelligenceFindingsResult
}

const GUARDRAIL_TEXT = "Review-only. Not included in pricing unless estimator confirms."

function labelFromKey(value: string): string {
  return value.replace(/_/g, " ")
}

function Badge({
  label,
  tone = "neutral",
}: {
  label: string
  tone?: "neutral" | "warning" | "info"
}) {
  const styles =
    tone === "warning"
      ? { bg: "#fff7ed", border: "#fdba74", color: "#92400e" }
      : tone === "info"
      ? { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8" }
      : { bg: "#f9fafb", border: "#e5e7eb", color: "#374151" }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        border: `1px solid ${styles.border}`,
        borderRadius: 999,
        background: styles.bg,
        color: styles.color,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}

function FindingEvidence({ finding }: { finding: EstimatorIntelligenceFinding }) {
  const evidence = finding.evidence.slice(0, 3)
  if (evidence.length === 0) return null

  return (
    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
      {evidence.map((item, index) => {
        const parts = [
          item.sheetNumber ? `Sheet ${item.sheetNumber}` : "",
          item.pageNumber != null ? `Page ${item.pageNumber}` : "",
          item.photoName ? `Photo ${item.photoName}` : "",
          item.confidence != null ? `${item.confidence}% confidence` : "",
        ].filter(Boolean)

        return (
          <div
            key={`${finding.id}-evidence-${index}`}
            style={{
              padding: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#fff",
              fontSize: 12,
              color: "#4b5563",
              lineHeight: 1.45,
            }}
          >
            {parts.length > 0 && (
              <div style={{ fontWeight: 800, color: "#374151" }}>
                {parts.join(" · ")}
              </div>
            )}
            {item.label && (
              <div style={{ marginTop: parts.length > 0 ? 3 : 0 }}>{item.label}</div>
            )}
            {item.excerpt && (
              <div style={{ marginTop: item.label || parts.length > 0 ? 3 : 0 }}>
                {item.excerpt}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FindingCard({ finding }: { finding: EstimatorIntelligenceFinding }) {
  const severityTone =
    finding.severity === "high" || finding.severity === "medium"
      ? "warning"
      : "neutral"

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
            {finding.title}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
            {finding.summary}
          </div>
        </div>
        <Badge label={labelFromKey(finding.severity)} tone={severityTone} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <Badge label={labelFromKey(finding.category)} />
        <Badge label={labelFromKey(finding.sourceKind)} />
        <Badge label={labelFromKey(finding.authority)} tone="info" />
      </div>

      <FindingEvidence finding={finding} />
    </div>
  )
}

export default function EstimatorIntelligenceFindingsPanel({ result }: Props) {
  if (result.summary.total === 0) return null

  const categoryEntries = Object.entries(result.summary.byCategory)
    .filter(([, count]) => Number(count) > 0)
    .slice(0, 6)

  return (
    <details
      data-no-print
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Estimator Intelligence Findings
      </summary>

      <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6, lineHeight: 1.5 }}>
        Internal estimator review signals normalized from plan, photo, scope, and pricing-risk checks.
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #bfdbfe",
          borderRadius: 10,
          background: "#eff6ff",
          color: "#1e3a8a",
          fontSize: 12,
          fontWeight: 900,
        }}
      >
        {GUARDRAIL_TEXT}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
          marginTop: 10,
        }}
      >
        <div style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 800 }}>Total Findings</div>
          <div style={{ marginTop: 2, fontSize: 16, fontWeight: 900 }}>
            {result.summary.total}
          </div>
        </div>
        <div style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 800 }}>Needs Confirmation</div>
          <div style={{ marginTop: 2, fontSize: 16, fontWeight: 900 }}>
            {result.summary.requiresEstimatorConfirmationCount}
          </div>
        </div>
      </div>

      {categoryEntries.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {categoryEntries.map(([category, count]) => (
            <Badge
              key={category}
              label={`${labelFromKey(category)}: ${count}`}
              tone="neutral"
            />
          ))}
        </div>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {result.findings.slice(0, 12).map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>
    </details>
  )
}
