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
        Add plans, choose the sheets for your scope, then Generate. Plan findings help with scope review; quantities still need your verification.
        <div style={{ marginTop: 4 }}>Up to {maxJobPlans} files: PDF, PNG, JPG, JPEG or WEBP.</div>
        {plansAtLimit ? " Remove a plan to add another file." : ""}
      </div>

      <input
        type="file"
        aria-label="Upload construction plans"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/jpg,image/webp"
        multiple
        disabled={plansAtLimit}
        onChange={(e) => {
          handlePlanUpload(e.target.files)
          e.currentTarget.value = ""
        }}
        style={{ maxWidth: "100%", marginBottom: jobPlans.length > 0 ? 12 : 0 }}
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
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
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
                      ? `${selectedPages} of ${plan.sourcePageCount} pages selected`
                      : selectedPages > 0
                        ? "Plan image selected for review"
                        : "Plan image not selected"}
                  </div>
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


              {selectionReadiness?.shouldShowGuide && (
                <div
                  role={selectionReadiness.noPagesSelected ? "alert" : undefined}
                  style={{
                    fontSize: 12,
                    color: "#92400e",
                    marginTop: 10,
                    padding: 8,
                    borderRadius: 8,
                    background: "#fffbeb",
                    lineHeight: 1.5,
                  }}
                >
                  {selectionReadiness.noPagesSelected
                    ? "Select at least one page, or remove this file before Generate."
                    : selectionReadiness.mayBeTooManyForReliableAnalysis
                      ? "This is a large selection. Choose fewer relevant sheets for a faster, more reliable review."
                      : "For large plan sets, start with the sheets that affect your scope."}
                </div>
              )}

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
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ flex: "1 1 180px", fontSize: 12, fontWeight: 700, color: "#111" }}>
                      Choose sheets (PDF page numbers)
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
                    Start with floor plans, finish schedules and details for your trade. Only selected pages are reviewed.
                  </div>

                  {plan.sourceKind === "pdf" && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "end",
                        marginTop: 10,
                      }}
                    >
                      <label
                        style={{
                          display: "grid",
                          flex: "1 1 90px",
                          minWidth: 0,
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
                            boxSizing: "border-box",
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
                          flex: "1 1 90px",
                          minWidth: 0,
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
                            boxSizing: "border-box",
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
                            width: "100%",
                            fontSize: 12,
                            color: "#92400e",
                          }}
                        >
                          {rangeValidation.message}
                        </div>
                      )}
                    </div>
                  )}

                  {plan.sourceKind === "pdf" && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                      Select range replaces the current selection. Check individual pages to add or remove sheets.
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

              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginTop: 12 }}>
                Instructions for this plan (optional)
                <textarea
                  value={plan.note}
                  onChange={(e) => updateJobPlan(plan.id, { note: e.target.value })}
                  aria-label={`Instructions for ${plan.name}`}
                  placeholder="For example: focus on guestroom wall finishes"
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginTop: 4,
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    resize: "vertical",
                  }}
                />
              </label>

              {plan.sourceKind === "pdf" && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "#4b5563", fontWeight: 600 }}>
                    File &amp; processing details
                  </summary>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    Original PDF: {formatPlanUploadBytes(plan.originalBytes)}
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
                </details>
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
