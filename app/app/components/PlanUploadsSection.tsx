"use client"

type JobPlan = {
  id: string
  name: string
  dataUrl: string
  note: string
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
        Upload up to {maxJobPlans} plan files. Accepted: PDF, PNG, JPG, JPEG, WEBP.
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
                    Optional note for this plan file.
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
