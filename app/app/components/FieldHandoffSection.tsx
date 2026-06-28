"use client"

import { useState } from "react"

import type { FieldHandoff } from "../lib/field-handoff"

type Props = {
  handoff: FieldHandoff
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }

  if (typeof document === "undefined") return false

  let textArea: HTMLTextAreaElement | null = null

  try {
    textArea = document.createElement("textarea")
    textArea.value = text
    textArea.setAttribute("readonly", "")
    textArea.style.position = "fixed"
    textArea.style.top = "0"
    textArea.style.left = "-9999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    return document.execCommand("copy")
  } finally {
    textArea?.parentNode?.removeChild(textArea)
  }
}

export default function FieldHandoffSection({ handoff }: Props) {
  const [copyStatus, setCopyStatus] = useState("")

  const onCopy = async () => {
    if (!handoff.isReady || !handoff.text.trim()) {
      setCopyStatus("Generate an estimate first.")
      return
    }

    try {
      const copied = await copyText(handoff.text)
      setCopyStatus(copied ? "Field handoff copied." : "Copy unavailable. Select the handoff text and copy manually.")
    } catch {
      setCopyStatus("Copy unavailable. Select the handoff text and copy manually.")
    }
  }

  return (
    <div
      style={{
        marginTop: 18,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 10,
        background: "#f9fafb",
      }}
    >
      <div data-mobile-stack style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Field Handoff</h3>
          <div style={{ marginTop: 3, fontSize: 12, color: "#666", lineHeight: 1.45 }}>
            Crew-ready notes from the current estimate.
          </div>
        </div>

        <div data-no-print data-mobile-actions style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button
            type="button"
            onClick={() => void onCopy()}
            disabled={!handoff.isReady}
            style={{
              fontSize: 12,
              opacity: handoff.isReady ? 1 : 0.6,
              cursor: handoff.isReady ? "pointer" : "not-allowed",
            }}
          >
            Copy field handoff
          </button>
        </div>
      </div>

      {!handoff.isReady ? (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fff",
            fontSize: 12,
            color: "#666",
            lineHeight: 1.45,
          }}
        >
          Generate an estimate to build a field handoff for the crew.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {handoff.summary && (
            <div
              style={{
                padding: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                Scope Summary
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#111827", lineHeight: 1.5 }}>
                {handoff.summary}
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {handoff.sections.map((section) => (
              <div
                key={section.title}
                style={{
                  padding: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                  {section.title}
                </div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.5, color: "#111827" }}>
                  {section.items.slice(0, 5).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {copyStatus && (
        <div data-no-print style={{ marginTop: 8, fontSize: 12, color: "#374151", fontWeight: 700 }}>
          {copyStatus}
        </div>
      )}
    </div>
  )
}
