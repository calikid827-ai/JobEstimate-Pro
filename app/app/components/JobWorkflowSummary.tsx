"use client"

import type {
  JobWorkflowNextActionKey,
  JobWorkflowSummaryTone,
  JobWorkflowSummaryView,
} from "../lib/job-workflow-summary"

type Props = {
  summary: JobWorkflowSummaryView
  onPrimaryAction: (action: JobWorkflowNextActionKey) => void
  money: (value: number) => string
}

function toneStyle(tone: JobWorkflowSummaryTone) {
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

  if (tone === "info") {
    return {
      background: "#eff6ff",
      border: "1px solid #93c5fd",
      color: "#1d4ed8",
    }
  }

  return {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    color: "#374151",
  }
}

function SummaryItem({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string | null
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: 10,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, color: "#111827", fontWeight: 800, overflowWrap: "anywhere" }}>
        {value}
      </div>
      {detail && (
        <div style={{ marginTop: 3, fontSize: 12, color: "#6b7280", lineHeight: 1.35 }}>
          {detail}
        </div>
      )}
    </div>
  )
}

export default function JobWorkflowSummary({ summary, onPrimaryAction, money }: Props) {
  const tone = toneStyle(summary.status.tone)

  return (
    <div
      data-no-print
      style={{
        marginTop: 2,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 12,
        background: "#f9fafb",
      }}
    >
      <div data-mobile-stack style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div data-mobile-content style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>
            Active Job Summary
          </div>
          <h3 style={{ margin: "4px 0 0", fontSize: 17, color: "#111827", overflowWrap: "anywhere" }}>
            {summary.jobName}
          </h3>
          <div style={{ marginTop: 3, fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>
            {summary.clientName}
            {summary.jobAddress ? ` • ${summary.jobAddress}` : ""}
          </div>
        </div>

        <div
          style={{
            ...tone,
            alignSelf: "flex-start",
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          {summary.status.label}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        <SummaryItem
          label="Contract"
          value={summary.contractValue == null ? "Not priced yet" : money(summary.contractValue)}
          detail="Current estimate / contract value"
        />
        <SummaryItem label="Approval" value={summary.approvalLabel} />
        <SummaryItem label="Invoices" value={summary.invoiceLabel} detail={summary.invoiceDetail} />
        {summary.crewLabel && (
          <SummaryItem label="Crew Load" value={summary.crewLabel} detail={summary.crewDetail} />
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 10,
          background: "#fff",
          border: "1px solid #e5e7eb",
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div data-mobile-content style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
            Next Action
          </div>
          <div style={{ marginTop: 3, fontSize: 14, color: "#111827", fontWeight: 900 }}>
            {summary.nextAction.label}
          </div>
          <div style={{ marginTop: 3, fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>
            {summary.nextAction.description}
          </div>
        </div>

        <button
          type="button"
          disabled={!summary.nextAction.enabled}
          onClick={() => onPrimaryAction(summary.nextAction.key)}
          style={{
            fontSize: 12,
            fontWeight: 900,
            opacity: summary.nextAction.enabled ? 1 : 0.55,
            cursor: summary.nextAction.enabled ? "pointer" : "not-allowed",
          }}
        >
          {summary.nextAction.buttonLabel}
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
        {summary.status.message}
      </div>
    </div>
  )
}
