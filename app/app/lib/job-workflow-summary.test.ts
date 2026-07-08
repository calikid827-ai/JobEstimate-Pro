import test from "node:test"
import assert from "node:assert/strict"

import { buildJobWorkflowSummary } from "./job-workflow-summary"

const job = {
  id: "job_1",
  createdAt: 1,
  clientName: "Jane Client",
  jobName: "Kitchen repaint",
  jobAddress: "123 Main St",
}

const estimate = {
  id: "estimate_1",
  createdAt: 2,
  jobId: "job_1",
  documentType: "Estimate" as const,
  jobDetails: {
    clientName: "Jane Client",
    jobName: "Kitchen repaint",
    changeOrderNo: "",
    jobAddress: "123 Main St",
    date: "",
  },
  trade: "painting" as const,
  state: "CA",
  scopeChange: "Paint kitchen walls.",
  result: "Paint kitchen walls.",
  pricing: {
    labor: 1000,
    materials: 250,
    subs: 0,
    markup: 20,
    total: 1500,
  },
  approval: {
    status: "pending" as const,
  },
}

test("buildJobWorkflowSummary uses the current estimate job when no active job is selected", () => {
  const summary = buildJobWorkflowSummary({
    jobs: [job],
    currentEstimate: estimate,
    hasGeneratedResult: true,
    latestEstimate: estimate,
    contractValue: 1500,
    pipelineStatus: {
      label: "Pending Approval",
      tone: "warning",
      message: "Waiting for customer approval before invoicing.",
      primaryAction: "copy_approval",
    },
  })

  assert.equal(summary.jobId, "job_1")
  assert.equal(summary.jobName, "Kitchen repaint")
  assert.equal(summary.clientName, "Jane Client")
  assert.equal(summary.status.label, "Pending Approval")
  assert.equal(summary.nextAction.key, "copy_approval")
  assert.equal(summary.nextAction.buttonLabel, "Copy Approval Link")
})

test("buildJobWorkflowSummary asks to create or select a job when a result is ready but no job is selected", () => {
  const summary = buildJobWorkflowSummary({
    jobs: [],
    jobDetails: {
      clientName: "Jane Client",
      jobName: "Kitchen repaint",
      jobAddress: "123 Main St",
    },
    hasGeneratedResult: true,
  })

  assert.equal(summary.jobId, null)
  assert.equal(summary.status.label, "Estimate Ready")
  assert.equal(summary.nextAction.key, "create_or_select_job")
  assert.equal(summary.nextAction.enabled, true)
})

test("buildJobWorkflowSummary maps approved deposit jobs to deposit invoice action", () => {
  const summary = buildJobWorkflowSummary({
    jobs: [job],
    activeJobId: "job_1",
    latestEstimate: {
      ...estimate,
      approval: {
        status: "approved",
        approvedAt: 1700000000000,
      },
      deposit: {
        enabled: true,
        type: "percent",
        value: 25,
      },
    },
    pipelineStatus: {
      label: "Ready for Deposit",
      tone: "info",
      message: "Approved and ready for deposit invoice.",
      primaryAction: "create_deposit_invoice",
    },
    contractValue: 1500,
  })

  assert.match(summary.approvalLabel, /^Approved/)
  assert.equal(summary.nextAction.key, "create_deposit_invoice")
  assert.equal(summary.nextAction.buttonLabel, "Create Deposit Invoice")
})

test("buildJobWorkflowSummary surfaces invoices, profit, and crew in contractor language", () => {
  const summary = buildJobWorkflowSummary({
    jobs: [job],
    activeJobId: "job_1",
    latestEstimate: {
      ...estimate,
      schedule: {
        crewDays: 2,
        visits: 1,
        calendarDays: { min: 2, max: 2 },
        workDaysPerWeek: 5,
        rationale: [],
        startDate: "2026-07-06",
      },
    },
    invoiceSummary: {
      total: 2,
      draftCount: 0,
      paidCount: 1,
      overdueCount: 0,
      openCount: 1,
      outstanding: 700,
    },
    profitSummary: {
      actualCost: 500,
      profitRemaining: 350,
      liveMarginPct: 23,
      label: "On Track",
    },
    weeklyCrewLoad: [
      {
        weekStartISO: "2026-07-06",
        demandCrewDays: 2,
        jobs: [{ jobId: "job_1", jobName: "Kitchen repaint", crewDays: 2 }],
      },
    ],
    crewCapacityDays: 6,
    fieldHandoffReady: true,
  })

  assert.equal(summary.invoiceLabel, "2 invoices")
  assert.equal(summary.invoiceDetail, "$700 outstanding")
  assert.equal(summary.profitLabel, "$350 remaining • 23% margin")
  assert.equal(summary.crewLabel, "2 crew-days planned")
  assert.match(summary.crewDetail || "", /2\/6 crew-days loaded/)
})
