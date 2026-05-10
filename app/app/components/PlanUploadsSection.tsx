"use client"

import { useState } from "react"

import {
  applyLocalPlanPageRangeSelection,
  buildSelectedPageReadinessSummary,
  buildSelectedPageUploadDebugSummary,
  estimateSelectedPdfBytes,
  formatPlanUploadBytes,
  resolvePlanUploadDisplayMode,
  validateLocalPlanPageRange,
} from "../../lib/plan-upload"

type JobPlan = {
  id: string
  name: string
  file: File
  stagedUploadId?: string | null
  note: string
  mimeType: string
  sourceKind: "image" | "pdf"
  bytes: number
  originalBytes: number
  sourcePageCount: number
  stagedSourcePageCount?: number | null
  selectedPageUploadMode?:
    | "original"
    | "browser-derived-selected-pages"
    | "server-derived-selected-pages"
    | "original-fallback"
  selectedPageUploadNote?: string | null
  pages: Array<{
    sourcePageNumber: number
    label: string
    selected: boolean
  }>
}

type Props = {
  jobPlans: JobPlan[]
  handlePlanUpload: (files: FileList | null) => void
  removeJobPlan: (id: string) => void
  updateJobPlan: (id: string, patch: Partial<JobPlan>) => void
  maxJobPlans: number
}

function getCustomerPlanProcessingLabel(
  mode: JobPlan["selectedPageUploadMode"] | "original"
): string {
  if (mode === "browser-derived-selected-pages") return "Selected pages prepared in browser"
  if (mode === "server-derived-selected-pages") return "Selected pages prepared on server"
  if (mode === "original-fallback") return "Original PDF fallback"
  return "Original PDF"
}

function getCustomerPlanProcessingSummary(args: {
  mode: JobPlan["selectedPageUploadMode"] | "original"
  originalBytes: number
  stagedBytes: number
  analyzedPages: number
  originalSourcePageCount: number
}): string {
  return buildSelectedPageUploadDebugSummary({
    mode: args.mode,
    originalBytes: args.originalBytes,
    stagedBytes: args.stagedBytes,
    analyzedPages: args.analyzedPages,
    originalSourcePageCount: args.originalSourcePageCount,
  }).replace(
    /^(Browser-derived selected pages|Server-derived selected pages|Original PDF fallback|Original PDF)\./,
    `${getCustomerPlanProcessingLabel(args.mode)}.`
  )
}

export default function PlanUploadsSection({
  jobPlans,
  handlePlanUpload,
  removeJobPlan,
  updateJobPlan,
  maxJobPlans,
}: Props) {
  const plansAtLimit = jobPlans.length >= maxJobPlans
  const [pageRangeDrafts, setPageRangeDrafts] = useState<
    Record<string, { from: string; to: string }>
  >({})

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 14 }}>Plans (optional)</div>

      <div
        style={{
          fontSize: 12,
          color: "#666",
          marginTop: 4,
          marginBottom: 10,
          lineHeight: 1.4,
        }}
      >
        Upload up to {maxJobPlans} plan files. PDFs are indexed by page so you can choose which sheets to review before pricing. Larger plan PDFs are prepared in smaller steps so selected pages can be analyzed without sending the whole plan set at once. Accepted: PDF, PNG, JPG, JPEG, WEBP.
        {" "}Generate uploads plan files only after you finish page selection, and large PDFs can fall back to original-PDF processing when selected-page preparation is unavailable.
        {plansAtLimit ? " Remove a plan to add another file." : ""}
      </div>

      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/jpg,image/webp"
        multiple
        disabled={plansAtLimit}
        onChange={(e) => {
          handlePlanUpload(e.target.files)
          e.currentTarget.value = ""
        }}
        style={{ marginBottom: jobPlans.length > 0 ? 12 : 0 }}
      />

      {jobPlans.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 12,
          }}
        >
          {jobPlans.map((plan, index) => (
            (() => {
              const selectedPages = plan.pages.filter((page) => page.selected).length
              const rangeDraft = pageRangeDrafts[plan.id] ?? { from: "", to: "" }
              const hasRangeDraft = rangeDraft.from.trim() !== "" || rangeDraft.to.trim() !== ""
              const rangeValidation = hasRangeDraft
                ? validateLocalPlanPageRange({
                    from: rangeDraft.from,
                    to: rangeDraft.to,
                    totalPages: plan.sourcePageCount,
                  })
                : { ok: false, fromPage: null, toPage: null, message: null }
              const selectionReadiness =
                plan.sourceKind === "pdf"
                  ? buildSelectedPageReadinessSummary({
                      sourceKind: plan.sourceKind,
                      originalBytes: plan.originalBytes,
                      totalPages: plan.sourcePageCount,
                      selectedPages,
                    })
                  : null
              const displayMode = resolvePlanUploadDisplayMode({
                mode: plan.selectedPageUploadMode,
                sourceKind: plan.sourceKind,
                selectedPages,
                totalPages: plan.sourcePageCount,
                stagedUploadId: plan.stagedUploadId,
              })
              const displayStagedBytes =
                !plan.stagedUploadId &&
                displayMode === "browser-derived-selected-pages" &&
                selectedPages > 0 &&
                selectedPages < plan.sourcePageCount
                  ? estimateSelectedPdfBytes({
                      originalBytes: plan.originalBytes,
                      selectedPages,
                      totalPages: plan.sourcePageCount,
                    })
                  : plan.bytes

              return (
            <div
              key={plan.id}
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              <div
                data-mobile-grid
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#111",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={plan.name}
                  >
                    {index + 1}. {plan.name}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {plan.sourceKind === "pdf"
                      ? `${selectedPages} of ${plan.pages.length} PDF page(s) selected for plan review.`
                      : "Single image plan selected for plan review."}
                  </div>
                  {plan.sourceKind === "pdf" && (
                    <>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        Original PDF: {formatPlanUploadBytes(plan.originalBytes)}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        Selected pages for review: {selectedPages} of {plan.sourcePageCount}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        Estimated selected upload: {formatPlanUploadBytes(displayStagedBytes)}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        {plan.stagedUploadId ? "Last plan processing method" : "Plan processing"}:{" "}
                        {getCustomerPlanProcessingLabel(displayMode)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color:
                            plan.selectedPageUploadMode === "browser-derived-selected-pages"
                              ? "#0f766e"
                              : plan.selectedPageUploadMode === "original-fallback"
                                ? "#92400e"
                                : "#666",
                          marginTop: 2,
                        }}
                      >
                        {getCustomerPlanProcessingSummary({
                          mode: displayMode,
                          originalBytes: plan.originalBytes,
                          stagedBytes: displayStagedBytes,
                          analyzedPages: selectedPages,
                          originalSourcePageCount: plan.sourcePageCount,
                        })}
                      </div>
                      {plan.selectedPageUploadNote && (
                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                          {plan.selectedPageUploadNote}
                        </div>
                      )}
                      {selectionReadiness?.shouldShowGuide && (
                        <div
                          style={{
                            fontSize: 12,
                            color: selectionReadiness.noPagesSelected ? "#991b1b" : "#374151",
                            marginTop: 6,
                            padding: 8,
                            borderRadius: 8,
                            border: selectionReadiness.noPagesSelected
                              ? "1px solid #fecaca"
                              : "1px solid #bfdbfe",
                            background: selectionReadiness.noPagesSelected
                              ? "#fef2f2"
                              : "#eff6ff",
                            lineHeight: 1.4,
                          }}
                        >
                          <div style={{ fontWeight: 800, color: "#111827", marginBottom: 4 }}>
                            Plan selection readiness
                          </div>
                          <div>
                            {selectionReadiness.summary} Estimated selected upload:{" "}
                            {formatPlanUploadBytes(
                              selectionReadiness.estimatedSelectedUploadBytes
                            )}
                            .
                          </div>
                          {selectionReadiness.mayBeTooManyForReliableAnalysis && (
                            <div style={{ marginTop: 4, color: "#92400e", fontWeight: 700 }}>
                              This may be too many pages for reliable, cost-controlled plan
                              analysis.
                            </div>
                          )}
                          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                            {selectionReadiness.guidance.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          <div style={{ marginTop: 6 }}>
                            Suggested sheets: {selectionReadiness.suggestedPageTypes.join(", ")}.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeJobPlan(plan.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Remove
                </button>
              </div>

              <textarea
                value={plan.note}
                onChange={(e) => updateJobPlan(plan.id, { note: e.target.value })}
                placeholder="Optional note"
                rows={2}
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                }}
              />

              {plan.pages.length > 1 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                  }}
                >
                  <div
                    data-mobile-toolbar
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
                      Indexed pages
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateJobPlan(plan.id, {
                          pages: plan.pages.map((page) => ({
                            ...page,
                            selected: true,
                          })),
                        })
                      }
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Select all
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateJobPlan(plan.id, {
                          pages: plan.pages.map((page) => ({
                            ...page,
                            selected: false,
                          })),
                        })
                      }
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Clear
                    </button>
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    Analysis only uses the selected pages from this plan set. Generate stages the selected plan set after page selection, and when possible the staged artifact is reduced to selected PDF pages before deeper sheet reading and pricing.
                  </div>

                  {plan.sourceKind === "pdf" && (
                    <div
                      data-mobile-toolbar
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(80px, 1fr) minmax(80px, 1fr) auto",
                        gap: 8,
                        alignItems: "end",
                        marginTop: 10,
                      }}
                    >
                      <label
                        style={{
                          display: "grid",
                          gap: 4,
                          fontSize: 11,
                          color: "#4b5563",
                          fontWeight: 700,
                        }}
                      >
                        From
                        <input
                          aria-label={`${plan.name} range start page`}
                          type="number"
                          min={1}
                          max={plan.sourcePageCount}
                          inputMode="numeric"
                          value={rangeDraft.from}
                          onChange={(e) =>
                            setPageRangeDrafts((prev) => ({
                              ...prev,
                              [plan.id]: {
                                from: e.target.value,
                                to: prev[plan.id]?.to ?? "",
                              },
                            }))
                          }
                          placeholder="1"
                          style={{
                            width: "100%",
                            padding: "7px 8px",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>

                      <label
                        style={{
                          display: "grid",
                          gap: 4,
                          fontSize: 11,
                          color: "#4b5563",
                          fontWeight: 700,
                        }}
                      >
                        To
                        <input
                          aria-label={`${plan.name} range end page`}
                          type="number"
                          min={1}
                          max={plan.sourcePageCount}
                          inputMode="numeric"
                          value={rangeDraft.to}
                          onChange={(e) =>
                            setPageRangeDrafts((prev) => ({
                              ...prev,
                              [plan.id]: {
                                from: prev[plan.id]?.from ?? "",
                                to: e.target.value,
                              },
                            }))
                          }
                          placeholder={String(plan.sourcePageCount)}
                          style={{
                            width: "100%",
                            padding: "7px 8px",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        disabled={!rangeValidation.ok}
                        onClick={() => {
                          updateJobPlan(plan.id, {
                            pages: applyLocalPlanPageRangeSelection(plan.pages, {
                              from: rangeDraft.from,
                              to: rangeDraft.to,
                            }),
                          })
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #bfdbfe",
                          background: rangeValidation.ok ? "#eff6ff" : "#f3f4f6",
                          color: rangeValidation.ok ? "#1d4ed8" : "#6b7280",
                          cursor: rangeValidation.ok ? "pointer" : "not-allowed",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Select range
                      </button>

                      {rangeValidation.message && (
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            fontSize: 12,
                            color: "#92400e",
                          }}
                        >
                          {rangeValidation.message}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
                      gap: 8,
                      marginTop: 10,
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {plan.pages.map((page) => (
                      <label
                        key={page.sourcePageNumber}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          background: page.selected ? "#eff6ff" : "#f9fafb",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={page.selected}
                          onChange={(e) =>
                            updateJobPlan(plan.id, {
                              pages: plan.pages.map((candidate) =>
                                candidate.sourcePageNumber === page.sourcePageNumber
                                  ? { ...candidate, selected: e.target.checked }
                                  : candidate
                              ),
                            })
                          }
                        />
                        <span>{page.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
              )
            })()
          ))}
        </div>
      )}
    </div>
  )
}
