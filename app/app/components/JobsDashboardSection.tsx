"use client"

import type React from "react"

type Props = {
  jobs: any[]
  activeJobId: string
  setActiveJobId: (id: string) => void
  setStatus: (msg: string) => void
  getOrCreateJobIdFromDetails: () => string
  crewCount: number
  setCrewCount: (n: number) => void
  computeWeeklyCrewLoad: () => any[]
  latestEstimateForJob: (jobId: string) => any
  lockedOriginalEstimateForJob: (jobId: string) => any
  computeJobContractSummary: (jobId: string) => any
  computeDepositFromEstimateTotal: (latestTotal: number, dep: any) => {
    depositDue: number
    remaining: number
  }
  invoiceSummaryForJob: (jobId: string) => any
  latestInvoiceForJob: (jobId: string) => any
  actualsForJob: (jobId: string) => any
  getJobPipelineStatus: (jobId: string) => any
  estimateDirectCost: (estimate: any) => number
  computeProfitProtectionFromTotals: (args: {
    contractValue: number
    estimatedCost: number
    actuals: any
  }) => any
  money: (n: number) => string
  upsertActuals: (jobId: string, patch: any) => void
  setJobDetails: React.Dispatch<React.SetStateAction<any>>
  startChangeOrderFromJob: (jobId: string) => void
  createInvoiceFromEstimate: (est: any) => void
  createBalanceInvoiceFromEstimate: (est: any) => void
  selectJobAndJumpToInvoices: (jobId: string) => void
  downloadInvoicePDF: (inv: any) => void
  updateJob: (id: string, patch: any) => void
  deleteJob: (id: string) => void
  history: any[]
}

export default function JobsDashboardSection({
  jobs,
  activeJobId,
  setActiveJobId,
  setStatus,
  getOrCreateJobIdFromDetails,
  crewCount,
  setCrewCount,
  computeWeeklyCrewLoad,
  latestEstimateForJob,
  lockedOriginalEstimateForJob,
  computeJobContractSummary,
  computeDepositFromEstimateTotal,
  invoiceSummaryForJob,
  latestInvoiceForJob,
  actualsForJob,
  getJobPipelineStatus,
  estimateDirectCost,
  computeProfitProtectionFromTotals,
  money,
  upsertActuals,
  setJobDetails,
  startChangeOrderFromJob,
  createInvoiceFromEstimate,
  createBalanceInvoiceFromEstimate,
  selectJobAndJumpToInvoices,
  downloadInvoicePDF,
  updateJob,
  deleteJob,
  history,
}: Props) {
  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 16,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Jobs</h3>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Select a job to keep estimates + invoices organized.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveJobId("")}
            style={{ fontSize: 12 }}
          >
            View All
          </button>

          <button
            type="button"
            onClick={() => {
              const id = getOrCreateJobIdFromDetails()
              setActiveJobId(id)
              setStatus("Job selected.")
            }}
            style={{ fontSize: 12 }}
          >
            Create / Select from Job Details
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>
          Active Job
        </label>

        <select
          value={activeJobId}
          onChange={(e) => setActiveJobId(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            marginTop: 6,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        >
          <option value="">All jobs</option>
          {jobs
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((j) => (
              <option key={j.id} value={j.id}>
                {(j.jobName || "Untitled Job") +
                  (j.clientName ? ` — ${j.clientName}` : "")}
              </option>
            ))}
        </select>
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#111" }}>
            Crew Capacity Settings
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
            Set how many crews you can run in parallel.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>
            Crews:
          </span>

          <input
            type="number"
            min={1}
            max={5}
            value={crewCount}
            onChange={(e) => {
              const raw = Number(e.target.value || 1)
              const next = Math.max(1, Math.min(5, Math.round(raw)))
              setCrewCount(next)
            }}
            style={{ width: 90, padding: 8 }}
          />

          <div style={{ fontSize: 12, color: "#111" }}>
            Weekly capacity: <strong>{crewCount * 6}</strong> crew-days
          </div>
        </div>
      </div>

      {(() => {
        const weeks = computeWeeklyCrewLoad()
        if (weeks.length === 0) return null

        const capacity = crewCount * 6

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
            <div style={{ fontWeight: 900, fontSize: 14 }}>
              Crew Loading Dashboard
            </div>

            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Weekly demand vs capacity using each job’s latest schedule start date and crew-days.
            </div>

            <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
              Capacity: <strong>{crewCount}</strong> crew{crewCount > 1 ? "s" : ""} × 6 days
              = <strong> {capacity}</strong> crew-days/week
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {weeks.map((w) => {
                const over = w.demandCrewDays > capacity
                const utilization =
                  capacity > 0 ? Math.round((w.demandCrewDays / capacity) * 100) : 0

                return (
                  <div
                    key={w.weekStartISO}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #eee",
                      background: over ? "#fff5f5" : "#f9fafb",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800 }}>
                        Week of {new Date(w.weekStartISO + "T00:00:00").toLocaleDateString()}
                      </div>

                      <div style={{ fontSize: 12 }}>
                        Demand: <strong>{w.demandCrewDays}</strong> / Capacity:{" "}
                        <strong>{capacity}</strong> • Utilization:{" "}
                        <strong>{utilization}%</strong>{" "}
                        {over ? (
                          <span style={{ color: "#9b1c1c", fontWeight: 900 }}>
                            • OVERLOADED
                          </span>
                        ) : (
                          <span style={{ color: "#065f46", fontWeight: 900 }}>
                            • OK
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {w.jobs.map((job: any, idx: number) => (
                        <div
                          key={`${w.weekStartISO}_${job.jobId}_${idx}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            fontSize: 12,
                            padding: "6px 8px",
                            borderRadius: 8,
                            background: "#fff",
                            border: "1px solid #f0f0f0",
                          }}
                        >
                          <div style={{ color: "#111" }}>{job.jobName}</div>
                          <div style={{ fontWeight: 700 }}>
                            {job.crewDays} crew-day{job.crewDays !== 1 ? "s" : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {jobs.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          No jobs yet. Fill out Job Details and click <strong>Create / Select from Job Details</strong>.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {jobs
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((j) => {
              const latest = latestEstimateForJob(j.id)
              const latestTotal = Number(latest?.pricing?.total || 0)
              const originalLocked = lockedOriginalEstimateForJob(j.id)

              const contract = computeJobContractSummary(j.id)
              const originalLockedTotal = contract.originalEstimateTotal
              const changeOrdersTotal = contract.changeOrdersTotal
              const currentContractValue = contract.currentContractValue
              const currentContractValueBeforeTax = contract.currentContractValueBeforeTax

              const dep = latest?.deposit
              const depComputed = computeDepositFromEstimateTotal(latestTotal, dep)

              const invSum = invoiceSummaryForJob(j.id)

              const latestInv = latestInvoiceForJob(j.id)
              const act = actualsForJob(j.id)
              const pipeline = getJobPipelineStatus(j.id)

              const estimatedJobCost =
                (originalLocked ? estimateDirectCost(originalLocked) : 0) +
                contract.changeOrders.reduce((sum: number, co: any) => sum + estimateDirectCost(co), 0)

              const profitProtection = computeProfitProtectionFromTotals({
                contractValue: currentContractValueBeforeTax,
                estimatedCost: estimatedJobCost,
                actuals: act,
              })

              const isActive = activeJobId === j.id

              return (
                <div
                  key={j.id}
                  style={{
                    padding: 10,
                    border: "1px solid #eee",
                    borderRadius: 12,
                    background: isActive ? "#f0f9ff" : "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 240, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 800 }}>
                          {j.jobName || "Untitled Job"}
                        </div>
                        {isActive && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: "#dbeafe",
                              border: "1px solid #bfdbfe",
                              color: "#1e3a8a",
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {j.clientName ? `Client: ${j.clientName}` : "Client: —"}
                        {j.jobAddress ? ` • ${j.jobAddress}` : ""}
                      </div>

                      <div style={{ fontSize: 12, color: "#333", marginTop: 8, display: "grid", gap: 4 }}>
                        <div>
                          Latest Estimate: <strong>{latest ? money(latestTotal) : "—"}</strong>
                        </div>

                        <div>
                          Original Estimate: <strong>{originalLocked ? money(originalLockedTotal) : "—"}</strong>
                        </div>

                        <div>
                          Change Orders Total: <strong>{originalLocked ? money(changeOrdersTotal) : "—"}</strong>
                        </div>

                        <div>
                          Current Contract Value: <strong>{originalLocked ? money(currentContractValue) : "—"}</strong>
                        </div>

                        <div>
                          Budget Remaining (vs Outstanding):{" "}
                          <strong>
                            {originalLocked ? money(Math.max(0, currentContractValue - invSum.outstanding)) : "—"}
                          </strong>
                        </div>

                        {latest?.deposit?.enabled ? (
                          <div>
                            Deposit / Remaining:{" "}
                            <strong>{money(depComputed.depositDue)}</strong> /{" "}
                            <strong>{money(depComputed.remaining)}</strong>
                          </div>
                        ) : (
                          <div>Deposit: <strong>—</strong></div>
                        )}

                        <div>
                          Invoices:{" "}
                          <strong>{invSum.total}</strong>{" "}
                          <span style={{ fontSize: 12, color: "#666" }}>
                            ({invSum.draftCount} draft • {invSum.paidCount} paid • {invSum.overdueCount} overdue • {invSum.openCount} open)
                          </span>
                        </div>

                        <div style={{ color: invSum.overdueCount > 0 ? "#9b1c1c" : "#111" }}>
                          Outstanding: <strong>{money(invSum.outstanding)}</strong>
                          {invSum.overdueCount > 0 ? (
                            <span style={{ fontSize: 12, color: "#9b1c1c" }}> • overdue</span>
                          ) : null}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 10,
                          border:
                            pipeline.tone === "good"
                              ? "1px solid #86efac"
                              : pipeline.tone === "warning"
                              ? "1px solid #fdba74"
                              : pipeline.tone === "info"
                              ? "1px solid #93c5fd"
                              : "1px solid #e5e7eb",
                          background:
                            pipeline.tone === "good"
                              ? "#ecfdf5"
                              : pipeline.tone === "warning"
                              ? "#fff7ed"
                              : pipeline.tone === "info"
                              ? "#eff6ff"
                              : "#f9fafb",
                          color:
                            pipeline.tone === "good"
                              ? "#065f46"
                              : pipeline.tone === "warning"
                              ? "#9a3412"
                              : pipeline.tone === "info"
                              ? "#1d4ed8"
                              : "#444",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900 }}>
                          Workflow Status: {pipeline.label}
                        </div>

                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {pipeline.message}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          border: "1px solid #eee",
                          borderRadius: 10,
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>
                          Profit Protection
                        </div>

                        <div style={{ fontSize: 12, marginTop: 6 }}>
                          Profit Contract Value (pre-tax): <strong>{money(profitProtection.contractValue)}</strong>
                        </div>

                        <div style={{ fontSize: 12 }}>
                          Estimated Cost: <strong>{money(profitProtection.estimatedCost)}</strong>
                        </div>

                        <div style={{ fontSize: 12 }}>
                          Actual Cost: <strong>{money(profitProtection.actualCost)}</strong>
                        </div>

                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          Profit Remaining:{" "}
                          <strong
                            style={{
                              color:
                                profitProtection.profitRemaining >= 0 ? "#065f46" : "#9b1c1c",
                            }}
                          >
                            {money(profitProtection.profitRemaining)}
                          </strong>
                        </div>

                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          Live Margin: <strong>{profitProtection.liveMarginPct}%</strong>
                        </div>

                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          Cost vs Estimate: <strong>{profitProtection.costOverEstimatePct}%</strong>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            padding: "8px 10px",
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: 800,
                            background:
                              profitProtection.status === "on-track"
                                ? "#ecfdf5"
                                : profitProtection.status === "watch"
                                ? "#fff7ed"
                                : profitProtection.status === "risk" ||
                                  profitProtection.status === "overrun"
                                ? "#fef2f2"
                                : "#f3f4f6",
                            border:
                              profitProtection.status === "on-track"
                                ? "1px solid #86efac"
                                : profitProtection.status === "watch"
                                ? "1px solid #fdba74"
                                : profitProtection.status === "risk" ||
                                  profitProtection.status === "overrun"
                                ? "1px solid #fecaca"
                                : "1px solid #e5e7eb",
                            color:
                              profitProtection.status === "on-track"
                                ? "#065f46"
                                : profitProtection.status === "watch"
                                ? "#9a3412"
                                : profitProtection.status === "risk" ||
                                  profitProtection.status === "overrun"
                                ? "#991b1b"
                                : "#444",
                          }}
                        >
                          {profitProtection.label} — {profitProtection.message}
                        </div>

                        <details style={{ marginTop: 8 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12 }}>
                            Edit actual costs
                          </summary>

                          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            <input
                              type="number"
                              placeholder="Labor actual ($)"
                              value={act?.labor ?? 0}
                              onChange={(e) =>
                                upsertActuals(j.id, {
                                  labor: e.target.value === "" ? 0 : Number(e.target.value),
                                })
                              }
                              style={{ width: "100%", padding: 8 }}
                            />

                            <input
                              type="number"
                              placeholder="Materials actual ($)"
                              value={act?.materials ?? 0}
                              onChange={(e) =>
                                upsertActuals(j.id, {
                                  materials: e.target.value === "" ? 0 : Number(e.target.value),
                                })
                              }
                              style={{ width: "100%", padding: 8 }}
                            />

                            <input
                              type="number"
                              placeholder="Subs / other actual ($)"
                              value={act?.subs ?? 0}
                              onChange={(e) =>
                                upsertActuals(j.id, {
                                  subs: e.target.value === "" ? 0 : Number(e.target.value),
                                })
                              }
                              style={{ width: "100%", padding: 8 }}
                            />

                            <textarea
                              placeholder="Notes (optional)"
                              value={act?.notes ?? ""}
                              onChange={(e) => upsertActuals(j.id, { notes: e.target.value })}
                              style={{ width: "100%", padding: 8, height: 60 }}
                            />

                            <div style={{ fontSize: 11, color: "#666" }}>
                              Last updated:{" "}
                              <strong>
                                {act?.updatedAt ? new Date(act.updatedAt).toLocaleString() : "—"}
                              </strong>
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveJobId(j.id)
                          setStatus("Job selected.")
                        }}
                      >
                        Select Job
                      </button>

                      <button
  type="button"
  onClick={() => {
    setJobDetails(
      (prev: {
        clientName: string
        jobName: string
        changeOrderNo: string
        jobAddress: string
        date: string
      }) => ({
        ...prev,
        clientName: j.clientName || prev.clientName,
        jobName: j.jobName || prev.jobName,
        jobAddress: j.jobAddress || prev.jobAddress,
        changeOrderNo: j.changeOrderNo || prev.changeOrderNo,
      })
    )
    setActiveJobId(j.id)
    setStatus("Job details loaded into the form.")
  }}
  style={{ fontSize: 12 }}
>
  Load into Form
</button>

                      <div style={{ display: "grid", gap: 6, marginTop: 2 }}>
                        <button
                          type="button"
                          onClick={() => startChangeOrderFromJob(j.id)}
                          style={{ fontSize: 12 }}
                        >
                          Create Change Order
                        </button>

                        {pipeline.primaryAction === "copy_approval" && latest && (
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${window.location.origin}/approve/${latest.id}`
                              navigator.clipboard.writeText(url)
                              setStatus("Approval link copied to clipboard.")
                            }}
                            style={{ fontSize: 12 }}
                          >
                            Copy Approval Link
                          </button>
                        )}

                        {pipeline.primaryAction === "create_deposit_invoice" && latest && (
                          <button
                            type="button"
                            onClick={() => createInvoiceFromEstimate(latest)}
                            style={{ fontSize: 12 }}
                          >
                            Create Deposit Invoice
                          </button>
                        )}

                        {pipeline.primaryAction === "create_balance_invoice" && latest && (
                          <button
                            type="button"
                            onClick={() => createBalanceInvoiceFromEstimate(latest)}
                            style={{ fontSize: 12 }}
                          >
                            Create Balance Invoice
                          </button>
                        )}

                        {pipeline.primaryAction === "create_final_invoice" && latest && (
                          <button
                            type="button"
                            onClick={() => createInvoiceFromEstimate(latest)}
                            style={{ fontSize: 12 }}
                          >
                            Create Final Invoice
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => selectJobAndJumpToInvoices(j.id)}
                          style={{ fontSize: 12 }}
                        >
                          View Invoices
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!latestInv) {
                              setStatus("No invoices found for this job yet.")
                              return
                            }
                            downloadInvoicePDF(latestInv)
                            setStatus("Downloading latest invoice PDF.")
                          }}
                          disabled={!latestInv}
                          style={{
                            fontSize: 12,
                            opacity: latestInv ? 1 : 0.6,
                            cursor: latestInv ? "pointer" : "not-allowed",
                          }}
                        >
                          Download Latest Invoice PDF
                        </button>
                      </div>

                      <details style={{ marginTop: 2 }}>
                        <summary style={{ cursor: "pointer", fontSize: 12 }}>
                          Edit job
                        </summary>

                        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                          <input
                            placeholder="Client name"
                            value={j.clientName || ""}
                            onChange={(e) => updateJob(j.id, { clientName: e.target.value })}
                            style={{ width: "100%", padding: 8 }}
                          />
                          <input
                            placeholder="Job name"
                            value={j.jobName || ""}
                            onChange={(e) => updateJob(j.id, { jobName: e.target.value })}
                            style={{ width: "100%", padding: 8 }}
                          />
                          <input
                            placeholder="Job address"
                            value={j.jobAddress || ""}
                            onChange={(e) => updateJob(j.id, { jobAddress: e.target.value })}
                            style={{ width: "100%", padding: 8 }}
                          />

                          <button
                            type="button"
                            onClick={() => {
                              deleteJob(j.id)
                              setStatus("Job deleted.")
                            }}
                            style={{ fontSize: 12 }}
                          >
                            Delete Job (and linked estimates/invoices)
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}