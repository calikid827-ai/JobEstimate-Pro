"use client"

import {
  buildScopeDecisionWording,
  normalizeScopeWhitespace,
  type ActionableScopeDecision,
  type ScopeDecisionSelection,
} from "../lib/actionable-scope-decisions"

type Props = {
  decisions: ActionableScopeDecision[]
  selections: Record<string, ScopeDecisionSelection>
  appliedSentences: Record<string, string>
  feedback: Record<string, string>
  showScopeUpdatedNotice: boolean
  onSelectionChange: (
    decisionId: string,
    selection: ScopeDecisionSelection
  ) => void
  onApply: (
    decision: ActionableScopeDecision,
    selection: ScopeDecisionSelection
  ) => void
}

function quantityUnitLabel(decision: ActionableScopeDecision) {
  if (decision.quantityUnit === "sqft") return "sq ft"
  if (decision.quantityUnit === "linear_ft") return "linear ft"
  return decision.quantityUnit || ""
}

export default function ScopeDecisionsPanel({
  decisions,
  selections,
  appliedSentences,
  feedback,
  showScopeUpdatedNotice,
  onSelectionChange,
  onApply,
}: Props) {
  if (!decisions.length && !showScopeUpdatedNotice) return null

  return (
    <section
      data-no-print
      data-scope-decisions
      aria-labelledby="scope-decisions-heading"
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: "12px 0",
        borderTop: "1px solid #bfdbfe",
        borderBottom: "1px solid #bfdbfe",
      }}
    >
      <div
        data-mobile-stack
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div
            id="scope-decisions-heading"
            style={{ fontSize: 14, fontWeight: 900, color: "#111827" }}
          >
            Scope Decisions
          </div>
          <div
            style={{
              marginTop: 3,
              maxWidth: 490,
              fontSize: 12,
              color: "#4b5563",
              lineHeight: 1.45,
            }}
          >
            Choose how each item should be handled, review the exact wording,
            then apply it to the typed scope.
          </div>
        </div>
        {decisions.length > 0 && (
          <div
            style={{
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 800,
              color: "#1d4ed8",
            }}
          >
            {decisions.length} decision{decisions.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {showScopeUpdatedNotice && (
        <div
          role="status"
          data-scope-decisions-updated
          style={{
            marginTop: 10,
            padding: 9,
            borderLeft: "3px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.45,
          }}
        >
          Scope updated. Click Generate to refresh the estimate and proposal.
        </div>
      )}

      {decisions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {decisions.map((decision, index) => {
            const selection = selections[decision.id] || {
              choice: "",
              unit: decision.quantityUnit || undefined,
            }
            const preview = buildScopeDecisionWording(decision, selection)
            const alreadyApplied =
              Boolean(preview) &&
              normalizeScopeWhitespace(appliedSentences[decision.id]) ===
                normalizeScopeWhitespace(preview)

            return (
              <div
                key={decision.id}
                data-scope-decision={decision.id}
                style={{
                  padding: index === 0 ? "4px 0 12px" : "12px 0",
                  borderTop: index === 0 ? 0 : "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280" }}>
                  {decision.subjectLabel}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 13,
                    fontWeight: 900,
                    color: "#111827",
                    lineHeight: 1.4,
                  }}
                >
                  {decision.prompt}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    color: "#6b7280",
                    lineHeight: 1.4,
                  }}
                >
                  {decision.helpText}
                </div>

                <div
                  data-mobile-stack
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <label style={{ flex: "1 1 210px", minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        marginBottom: 4,
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#374151",
                      }}
                    >
                      Contractor choice
                    </span>
                    <select
                      aria-label={`${decision.subjectLabel} choice`}
                      value={selection.choice}
                      onChange={(event) =>
                        onSelectionChange(decision.id, {
                          ...selection,
                          choice: event.target
                            .value as ScopeDecisionSelection["choice"],
                        })
                      }
                      style={{
                        width: "100%",
                        padding: 8,
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        background: "#fff",
                        color: "#111827",
                      }}
                    >
                      <option value="">Choose one</option>
                      {decision.choices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {decision.kind === "quantity" &&
                    selection.choice === "confirm_quantity" && (
                      <>
                        <label style={{ flex: "1 1 110px", minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              marginBottom: 4,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#374151",
                            }}
                          >
                            Quantity
                          </span>
                          <input
                            aria-label={`${decision.subjectLabel} quantity`}
                            type="number"
                            min="0"
                            step="any"
                            value={selection.quantity ?? ""}
                            onChange={(event) =>
                              onSelectionChange(decision.id, {
                                ...selection,
                                quantity: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            style={{
                              width: "100%",
                              padding: 8,
                              border: "1px solid #cbd5e1",
                              borderRadius: 6,
                            }}
                          />
                        </label>
                        <div style={{ flex: "0 1 105px", minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              marginBottom: 4,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#374151",
                            }}
                          >
                            Unit
                          </span>
                          <div
                            aria-label={`${decision.subjectLabel} unit`}
                            style={{
                              width: "100%",
                              padding: 8,
                              border: "1px solid #cbd5e1",
                              borderRadius: 6,
                              background: "#f8fafc",
                              color: "#374151",
                              fontSize: 13,
                            }}
                          >
                            {quantityUnitLabel(decision)}
                          </div>
                        </div>
                      </>
                    )}
                </div>

                <div
                  data-scope-decision-preview
                  style={{
                    marginTop: 8,
                    padding: 8,
                    background: "#f8fafc",
                    borderLeft: "3px solid #94a3b8",
                    color: preview ? "#1f2937" : "#64748b",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  <strong>Proposed wording:</strong>{" "}
                  {preview ||
                    (selection.choice === "confirm_quantity"
                      ? "Enter a quantity to preview the sentence."
                      : "Choose an option to preview the sentence.")}
                </div>

                <div
                  data-mobile-stack
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <button
                    type="button"
                    data-scope-decision-apply
                    disabled={!preview || alreadyApplied}
                    onClick={() => onApply(decision, selection)}
                    style={{
                      padding: "7px 10px",
                      border: "1px solid #2563eb",
                      borderRadius: 6,
                      background:
                        preview && !alreadyApplied ? "#2563eb" : "#e5e7eb",
                      color:
                        preview && !alreadyApplied ? "#fff" : "#6b7280",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor:
                        preview && !alreadyApplied ? "pointer" : "not-allowed",
                    }}
                  >
                    {alreadyApplied ? "Wording applied" : "Apply to typed scope"}
                  </button>
                  {feedback[decision.id] && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        minWidth: 0,
                        fontSize: 11,
                        fontWeight: 800,
                        color: feedback[decision.id].includes("already")
                          ? "#92400e"
                          : "#166534",
                      }}
                    >
                      {feedback[decision.id]}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
