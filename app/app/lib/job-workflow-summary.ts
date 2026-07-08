import type { EstimateHistoryItem, Invoice, Job, JobActuals, WeekLoad } from "./types"

export type JobWorkflowNextActionKey =
  | "generate_estimate"
  | "select_job"
  | "create_or_select_job"
  | "copy_approval"
  | "create_deposit_invoice"
  | "create_balance_invoice"
  | "create_final_invoice"
  | "view_invoice"
  | "review_actuals"
  | "copy_field_handoff"
  | "none"

export type JobWorkflowSummaryTone = "good" | "warning" | "info" | "neutral"

export type JobWorkflowPipelineStatus = {
  label?: string
  tone?: JobWorkflowSummaryTone
  message?: string
  primaryAction?:
    | null
    | "create_change_order"
    | "copy_approval"
    | "create_deposit_invoice"
    | "await_deposit_payment"
    | "create_balance_invoice"
    | "create_final_invoice"
    | "await_final_payment"
    | "paid_closed"
}

export type JobWorkflowInvoiceSummary = {
  total: number
  draftCount: number
  paidCount: number
  overdueCount: number
  openCount: number
  outstanding: number
}

export type JobWorkflowProfitSummary = {
  actualCost: number
  profitRemaining: number
  liveMarginPct: number
  label: string
}

export type JobWorkflowSummaryInput = {
  jobs: Job[]
  activeJobId?: string
  currentEstimate?: EstimateHistoryItem | null
  jobDetails?: Partial<EstimateHistoryItem["jobDetails"]>
  hasGeneratedResult?: boolean
  latestEstimate?: EstimateHistoryItem | null
  contractValue?: number | null
  pipelineStatus?: JobWorkflowPipelineStatus | null
  invoiceSummary?: JobWorkflowInvoiceSummary | null
  latestInvoice?: Invoice | null
  actuals?: JobActuals | null
  profitSummary?: JobWorkflowProfitSummary | null
  weeklyCrewLoad?: WeekLoad[]
  crewCapacityDays?: number
  fieldHandoffReady?: boolean
}

export type JobWorkflowSummaryView = {
  jobId: string | null
  jobName: string
  clientName: string
  jobAddress: string
  status: {
    label: string
    message: string
    tone: JobWorkflowSummaryTone
  }
  contractValue: number | null
  approvalLabel: string
  invoiceLabel: string
  invoiceDetail: string
  profitLabel: string | null
  crewLabel: string | null
  crewDetail: string | null
  nextAction: {
    key: JobWorkflowNextActionKey
    label: string
    description: string
    buttonLabel: string
    enabled: boolean
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function formatMoney(value: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString()}`
}

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

function formatDate(iso: string) {
  const time = new Date(`${iso}T00:00:00`).getTime()
  if (!Number.isFinite(time)) return iso
  return new Date(time).toLocaleDateString()
}

function invoiceLabel(summary?: JobWorkflowInvoiceSummary | null) {
  if (!summary || summary.total <= 0) {
    return {
      label: "No invoices yet",
      detail: "Create invoices after approval.",
    }
  }

  if (summary.overdueCount > 0) {
    return {
      label: `${plural(summary.overdueCount, "overdue invoice")}`,
      detail: `${formatMoney(summary.outstanding)} outstanding`,
    }
  }

  if (summary.outstanding > 0) {
    return {
      label: `${plural(summary.total, "invoice")}`,
      detail: `${formatMoney(summary.outstanding)} outstanding`,
    }
  }

  if (summary.paidCount === summary.total) {
    return {
      label: "Invoices paid",
      detail: `${plural(summary.paidCount, "paid invoice")}`,
    }
  }

  if (summary.draftCount === summary.total) {
    return {
      label: `${plural(summary.draftCount, "draft invoice")}`,
      detail: "Ready to send or mark paid.",
    }
  }

  return {
    label: `${plural(summary.total, "invoice")}`,
    detail: `${summary.paidCount} paid, ${summary.openCount} open, ${summary.draftCount} draft`,
  }
}

function crewSummary({
  selectedJobId,
  latestEstimate,
  weeklyCrewLoad,
  crewCapacityDays,
}: {
  selectedJobId: string
  latestEstimate: EstimateHistoryItem | null
  weeklyCrewLoad: WeekLoad[]
  crewCapacityDays?: number
}) {
  const crewDays = Number(latestEstimate?.schedule?.crewDays || 0)
  if (!selectedJobId && crewDays <= 0) return { label: null, detail: null }

  const week = weeklyCrewLoad.find((w) =>
    w.jobs.some((job) => job.jobId === selectedJobId)
  )

  if (crewDays > 0 && week) {
    const capacityText =
      crewCapacityDays && crewCapacityDays > 0
        ? ` • ${week.demandCrewDays}/${crewCapacityDays} crew-days loaded`
        : ""

    return {
      label: `${plural(crewDays, "crew-day")} planned`,
      detail: `Week of ${formatDate(week.weekStartISO)}${capacityText}`,
    }
  }

  if (crewDays > 0) {
    return {
      label: `${plural(crewDays, "crew-day")} planned`,
      detail: "No weekly load conflict shown.",
    }
  }

  return { label: null, detail: null }
}

function deriveNextAction({
  selectedJobId,
  jobsCount,
  latestEstimate,
  hasGeneratedResult,
  pipelineStatus,
  profitSummary,
  fieldHandoffReady,
}: {
  selectedJobId: string
  jobsCount: number
  latestEstimate: EstimateHistoryItem | null
  hasGeneratedResult: boolean
  pipelineStatus?: JobWorkflowPipelineStatus | null
  profitSummary?: JobWorkflowProfitSummary | null
  fieldHandoffReady: boolean
}): JobWorkflowSummaryView["nextAction"] {
  if (!selectedJobId) {
    if (hasGeneratedResult) {
      return {
        key: "create_or_select_job",
        label: "Create or select the job",
        description: "Attach this estimate to a job so approvals, invoices, actuals, and handoff notes stay together.",
        buttonLabel: "Create / Select Job",
        enabled: true,
      }
    }

    if (jobsCount > 0) {
      return {
        key: "select_job",
        label: "Select a job",
        description: "Pick the job you want to work from, then continue approvals, invoices, or actuals.",
        buttonLabel: "Open Jobs",
        enabled: true,
      }
    }

    return {
      key: "generate_estimate",
      label: "Generate an estimate",
      description: "Start with a scope and estimate before job workflow actions are available.",
      buttonLabel: "Estimate Needed",
      enabled: false,
    }
  }

  if (!latestEstimate) {
    return {
      key: "generate_estimate",
      label: "Generate an estimate for this job",
      description: "This job is selected, but no saved estimate is tied to it yet.",
      buttonLabel: "Estimate Needed",
      enabled: false,
    }
  }

  switch (pipelineStatus?.primaryAction) {
    case "copy_approval":
      return {
        key: "copy_approval",
        label: "Send approval link",
        description: "Customer approval is the next step before invoicing.",
        buttonLabel: "Copy Approval Link",
        enabled: true,
      }
    case "create_deposit_invoice":
      return {
        key: "create_deposit_invoice",
        label: "Create deposit invoice",
        description: "The estimate is approved and ready for the deposit invoice.",
        buttonLabel: "Create Deposit Invoice",
        enabled: true,
      }
    case "create_balance_invoice":
      return {
        key: "create_balance_invoice",
        label: "Create balance invoice",
        description: "The deposit is paid. Create the remaining balance invoice.",
        buttonLabel: "Create Balance Invoice",
        enabled: true,
      }
    case "create_final_invoice":
      return {
        key: "create_final_invoice",
        label: "Create final invoice",
        description: "The estimate is approved and ready for final billing.",
        buttonLabel: "Create Final Invoice",
        enabled: true,
      }
    case "await_deposit_payment":
    case "await_final_payment":
      return {
        key: "view_invoice",
        label: "Review invoice status",
        description: "An invoice exists. Check payment status or download it from Invoices.",
        buttonLabel: "Open Invoices",
        enabled: true,
      }
    case "paid_closed":
      if (!profitSummary || profitSummary.actualCost <= 0) {
        return {
          key: "review_actuals",
          label: "Review actuals",
          description: "Enter actual labor, material, and other costs to confirm job margin.",
          buttonLabel: "Open Actuals",
          enabled: true,
        }
      }
      break
  }

  if (fieldHandoffReady) {
    return {
      key: "copy_field_handoff",
      label: "Copy field handoff",
      description: "Open the crew handoff and copy the latest field-ready notes.",
      buttonLabel: "Open Field Handoff",
      enabled: true,
    }
  }

  return {
    key: "review_actuals",
    label: "Review actuals",
    description: "Keep labor, material, and other job costs current as the work progresses.",
    buttonLabel: "Open Actuals",
    enabled: true,
  }
}

export function buildJobWorkflowSummary(input: JobWorkflowSummaryInput): JobWorkflowSummaryView {
  const activeJob = input.activeJobId
    ? input.jobs.find((job) => job.id === input.activeJobId) || null
    : null
  const currentEstimateJob = input.currentEstimate?.jobId
    ? input.jobs.find((job) => job.id === input.currentEstimate?.jobId) || null
    : null
  const selectedJob = activeJob || currentEstimateJob
  const selectedJobId =
    selectedJob?.id || clean(input.activeJobId) || clean(input.currentEstimate?.jobId)
  const latestEstimate = input.latestEstimate || input.currentEstimate || null

  const fallbackJobDetails = latestEstimate?.jobDetails || input.jobDetails || {}
  const jobName =
    clean(selectedJob?.jobName) ||
    clean(fallbackJobDetails.jobName) ||
    (selectedJobId ? "Untitled Job" : "No job selected")
  const clientName =
    clean(selectedJob?.clientName) ||
    clean(fallbackJobDetails.clientName) ||
    "Client not set"
  const jobAddress =
    clean(selectedJob?.jobAddress) ||
    clean(fallbackJobDetails.jobAddress) ||
    "Address not set"

  const status =
    input.pipelineStatus?.label
      ? {
          label: input.pipelineStatus.label,
          message: input.pipelineStatus.message || "Workflow status is based on the latest saved estimate.",
          tone: input.pipelineStatus.tone || "neutral",
        }
      : latestEstimate
        ? {
            label: "Estimate Saved",
            message: "Estimate is available. Select the next workflow step below.",
            tone: "info" as const,
          }
        : selectedJobId
          ? {
              label: "Job Created",
              message: "No saved estimate is tied to this job yet.",
              tone: "neutral" as const,
            }
          : {
              label: input.hasGeneratedResult ? "Estimate Ready" : "No Active Job",
              message: input.hasGeneratedResult
                ? "Create or select a job to organize the estimate, invoices, actuals, and handoff."
                : "Generate an estimate or select an existing job to begin workflow.",
              tone: input.hasGeneratedResult ? "info" as const : "neutral" as const,
            }

  const contractValue = Number(input.contractValue || 0) > 0
    ? Math.round(Number(input.contractValue || 0))
    : Number(latestEstimate?.pricing?.total || 0) > 0
      ? Math.round(Number(latestEstimate?.pricing?.total || 0))
      : null

  const approvedAt = latestEstimate?.approval?.approvedAt
    ? new Date(latestEstimate.approval.approvedAt).toLocaleDateString()
    : ""
  const approvalLabel = latestEstimate
    ? latestEstimate.approval?.status === "approved"
      ? `Approved${approvedAt ? ` on ${approvedAt}` : ""}`
      : "Pending approval"
    : "No estimate yet"

  const invoices = invoiceLabel(input.invoiceSummary)
  const profitLabel = input.profitSummary
    ? input.profitSummary.actualCost > 0
      ? `${formatMoney(input.profitSummary.profitRemaining)} remaining • ${input.profitSummary.liveMarginPct}% margin`
      : "No actual costs entered yet"
    : null

  const crew = crewSummary({
    selectedJobId,
    latestEstimate,
    weeklyCrewLoad: input.weeklyCrewLoad || [],
    crewCapacityDays: input.crewCapacityDays,
  })

  return {
    jobId: selectedJobId || null,
    jobName,
    clientName,
    jobAddress,
    status,
    contractValue,
    approvalLabel,
    invoiceLabel: invoices.label,
    invoiceDetail: invoices.detail,
    profitLabel,
    crewLabel: crew.label,
    crewDetail: crew.detail,
    nextAction: deriveNextAction({
      selectedJobId,
      jobsCount: input.jobs.length,
      latestEstimate,
      hasGeneratedResult: Boolean(input.hasGeneratedResult),
      pipelineStatus: input.pipelineStatus,
      profitSummary: input.profitSummary,
      fieldHandoffReady: Boolean(input.fieldHandoffReady),
    }),
  }
}
