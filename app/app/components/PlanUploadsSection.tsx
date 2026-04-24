"use client"

type JobPlan = {
  id: string
  name: string
  dataUrl: string
  note: string
  mimeType: string
  sourceKind: "image" | "pdf"
  bytes: number
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

export default function PlanUploadsSection({
  jobPlans,
  handlePlanUpload,
  removeJobPlan,
  updateJobPlan,
  maxJobPlans,
}: Props) {
  const plansAtLimit = jobPlans.length >= maxJobPlans

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
        Upload up to {maxJobPlans} plan files. PDFs are indexed by page so you can choose which sheets to analyze before pricing. Accepted: PDF, PNG, JPG, JPEG, WEBP.
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
                      ? `${plan.pages.filter((page) => page.selected).length} of ${plan.pages.length} indexed PDF page(s) selected for analysis.`
                      : "Single image plan selected for analysis."}
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
                    Analysis only uses the selected pages from this plan set. Selected PDF pages are rendered for deeper sheet reading before pricing.
                  </div>

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
          ))}
        </div>
      )}
    </div>
  )
}
