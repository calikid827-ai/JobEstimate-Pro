"use client"

import type {
  ProposalReadinessActionTarget,
  ProposalReadinessTone,
  ProposalReadinessView,
} from "../lib/proposal-readiness"

type Props = {
  readiness: ProposalReadinessView
  onAction: (target: ProposalReadinessActionTarget) => void
}

function toneStyle(tone: ProposalReadinessTone) {
  if (tone === "good") {
    return {
      background: "#ecfdf5",
      border: "1px solid #86efac",
      color: "#065f46",
    }
  }

  if (tone === "warning") {
    return {
      background: "#fff7ed",
      border: "1px solid #fdba74",
      color: "#9a3412",
    }
  }

  return {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    color: "#374151",
  }
}

export default function ProposalReadinessBadge({ readiness, onAction }: Props) {
  const tone = toneStyle(readiness.tone)

  return (
    <div
      data-no-print
      data-mobile-stack
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: 10,
        marginBottom: 10,
        borderRadius: 10,
        background: tone.background,
        border: tone.border,
      }}
    >
      <div data-mobile-content style={{ minWidth: 0 }}>
        <div
          style={{
            color: tone.color,
            fontSize: 12,
            fontWeight: 900,
            textTransform: "uppercase",
          }}
        >
          Send Readiness
        </div>
        <div style={{ marginTop: 3, fontSize: 14, color: "#111827", fontWeight: 900 }}>
          {readiness.label}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>
          {readiness.message}
        </div>
      </div>

      {readiness.actionLabel && readiness.actionTarget && (
        <button
          type="button"
          onClick={() => onAction(readiness.actionTarget)}
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 900,
            padding: "7px 10px",
            borderRadius: 8,
          }}
        >
          {readiness.actionLabel}
        </button>
      )}
    </div>
  )
}
