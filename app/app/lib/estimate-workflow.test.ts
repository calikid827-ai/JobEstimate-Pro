import test from "node:test"
import assert from "node:assert/strict"
import {
  buildChangeOrderSummary,
  buildJobContractSummary,
  findOriginalEstimateForJob,
  normalizeGeneratedDocumentText,
  resolveEstimateDocumentType,
} from "./estimate-workflow"
import type { EstimateHistoryItem, Job } from "./types"

const job: Job = {
  id: "job_1",
  createdAt: 1,
  clientName: "Synthetic Client",
  jobName: "Synthetic repaint",
  jobAddress: "",
  originalEstimateId: "original",
}

function estimate(overrides: Partial<EstimateHistoryItem> = {}): EstimateHistoryItem {
  return {
    id: "original",
    createdAt: 10,
    jobId: job.id,
    documentType: "Estimate",
    jobDetails: {
      clientName: job.clientName,
      jobName: job.jobName,
      jobAddress: "",
      changeOrderNo: "",
      date: "",
    },
    trade: "painting",
    state: "CA",
    scopeChange: "Paint bedroom walls and ceilings.",
    result: "This estimate covers bedroom painting.",
    pricing: { labor: 4000, materials: 849, subs: 0, markup: 20, total: 5819 },
    approval: { status: "pending" },
    ...overrides,
  }
}

function changeOrder(
  id: string,
  createdAt: number,
  amount: number,
  number: string,
  overrides: Partial<EstimateHistoryItem> = {}
): EstimateHistoryItem {
  const item = estimate()
  return {
    ...item,
    id,
    createdAt,
    documentType: "Change Order",
    jobDetails: { ...item.jobDetails, changeOrderNo: number },
    pricing: { labor: amount, materials: 0, subs: 0, markup: 0, total: amount },
    ...overrides,
  }
}

test("only the selected workflow or entered CO number establishes change-order intent", () => {
  assert.equal(resolveEstimateDocumentType({ documentType: "Estimate" }), "Estimate")
  assert.equal(resolveEstimateDocumentType({ documentType: "Change Order / Estimate" }), "Estimate")
  assert.equal(resolveEstimateDocumentType({ documentType: "Estimate", changeOrderNo: " " }), "Estimate")
  assert.equal(resolveEstimateDocumentType({ documentType: "Change Order" }), "Change Order")
  assert.equal(resolveEstimateDocumentType({ documentType: "Estimate", changeOrderNo: "CO-2" }), "Change Order")
})

test("locked original survives newer ordinary estimates and other jobs", () => {
  const original = estimate({ approval: { status: "approved" } })
  const revision = estimate({ id: "revision", createdAt: 20 })
  const other = estimate({ id: "other", jobId: "job_2", createdAt: 1 })
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [revision, other, original] }), original)
})

test("unapproved baseline follows the latest ordinary quote without promoting an arbitrary CO", () => {
  const co = estimate({ id: "co", createdAt: 1, documentType: "Change Order" })
  const first = estimate({ id: "first", createdAt: 2 })
  const later = estimate({ id: "later", createdAt: 3 })
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [later, co, first] }), later)
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [co] }), null)
})

test("approved ordinary contract is selected before newer drafts and after an unapproved stored lock", () => {
  const first = estimate()
  const approved = estimate({ id: "approved", createdAt: 20, approval: { status: "approved" } })
  const laterApproval = estimate({ id: "later_approved", createdAt: 30, approval: { status: "approved" } })
  const draft = estimate({ id: "draft", createdAt: 40 })
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [draft, first, laterApproval, approved] }), approved)
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [], history: [draft, laterApproval, approved] }), approved)
})

test("explicit approved lock remains authoritative and an explicit legacy CO lock remains available", () => {
  const locked = estimate({ createdAt: 20, approval: { status: "approved" } })
  const earlierApproved = estimate({ id: "earlier", createdAt: 1, approval: { status: "approved" } })
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [locked, earlierApproved] }), locked)
  const legacy = estimate({ documentType: "Change Order" })
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [legacy] }), legacy)
  const quote = estimate({ id: "quote", createdAt: 30 })
  assert.equal(findOriginalEstimateForJob({ jobId: job.id, jobs: [job], history: [legacy, quote] }), quote)
})

test("ordinary revisions never add another full estimate to contract totals or receive CO summaries", () => {
  const original = estimate({ approval: { status: "approved" } })
  const revisions = [20, 30].map((createdAt) => estimate({ id: `revision_${createdAt}`, createdAt }))
  const history = [...revisions, original]
  const summary = buildJobContractSummary({ jobId: job.id, jobs: [job], history })
  assert.equal(summary.currentContractValue, 5819)
  assert.equal(summary.currentContractValueBeforeTax, 5819)
  assert.deepEqual(summary.changeOrders, [])
  for (const current of [original, ...revisions]) {
    assert.equal(buildChangeOrderSummary({ current, jobs: [job], history }), null)
  }
})

test("separate pending generation snapshots count only the newest revised quote", () => {
  const original = estimate()
  const revision = estimate({ id: "revision", createdAt: 20, pricing: { labor: 5000, materials: 0, subs: 0, markup: 20, total: 6000 } })
  const latest = estimate({ id: "latest", createdAt: 30, pricing: { labor: 5100, materials: 0, subs: 0, markup: 20, total: 6120 } })
  const history = [latest, original, revision]
  const summary = buildJobContractSummary({ jobId: job.id, jobs: [job], history })
  assert.equal(summary.originalEstimate, latest)
  assert.equal(summary.currentContractValue, 6120)
  assert.equal(summary.currentContractValueBeforeTax, 6120)
  assert.deepEqual(summary.changeOrders, [])
})

test("numbered CO regenerations count the newest pending version once", () => {
  const original = estimate({ approval: { status: "approved" } })
  const first = changeOrder("co_first", 20, 100, "CO-1")
  const revised = changeOrder("co_revised", 30, 150, " CO-1 ")
  const summary = buildJobContractSummary({ jobId: job.id, jobs: [job], history: [revised, original, first] })
  assert.equal(summary.currentContractValue, 5969)
  assert.deepEqual(summary.changeOrders.map((item) => item.id), [revised.id])
})

test("different numbered COs and insufficiently identified unnumbered COs remain independent", () => {
  const original = estimate({ approval: { status: "approved" } })
  const items = [
    changeOrder("one", 20, 100, "CO-1"),
    changeOrder("two", 30, 100, "CO-2"),
    changeOrder("blank_one", 40, 100, ""),
    changeOrder("blank_two", 50, 100, " "),
    changeOrder("other_job", 60, 999, "CO-1", { jobId: "job_2" }),
  ]
  const summary = buildJobContractSummary({ jobId: job.id, jobs: [job], history: [original, ...items] })
  assert.equal(summary.currentContractValue, 6219)
  assert.equal(summary.changeOrders.length, 4)
})

test("earliest approved numbered CO remains contract authority over newer pending or approved snapshots", () => {
  const original = estimate({ approval: { status: "approved" } })
  const pending = changeOrder("pending", 20, 100, "CO-1")
  const approved = changeOrder("approved", 30, 150, "CO-1", { approval: { status: "approved" } })
  const newerDraft = changeOrder("draft", 40, 200, "CO-1")
  const laterApproved = changeOrder("later_approved", 50, 300, "CO-1", { approval: { status: "approved" } })
  const history = [laterApproved, original, newerDraft, approved, pending]
  const snapshot = structuredClone(history)
  const summary = buildJobContractSummary({ jobId: job.id, jobs: [job], history })
  assert.equal(summary.currentContractValue, 5969)
  assert.equal(summary.changeOrders[0], approved)
  assert.deepEqual(history, snapshot)
})

test("CO comparison excludes all versions of the current numbered operation while retaining distinct credits", () => {
  const original = estimate({ approval: { status: "approved" } })
  const first = changeOrder("co_first", 20, 100, "CO-1")
  const credit = changeOrder("credit", 30, -50, "CO-2")
  const current = changeOrder("co_revised", 40, 150, "CO-1")
  const history = [current, credit, first, original]
  const summary = buildChangeOrderSummary({ current, jobs: [job], history })
  assert.ok(summary)
  assert.equal(summary.previousContractValue, 5769)
  assert.equal(summary.currentEstimateTotal, 150)
  assert.equal(summary.newContractValue, 5919)
  assert.equal(buildJobContractSummary({ jobId: job.id, jobs: [job], history }).currentContractValue, 5919)
})

test("unnumbered CO comparison retains a separate prior unnumbered charge", () => {
  const original = estimate({ approval: { status: "approved" } })
  const first = changeOrder("first", 20, 100, "")
  const current = changeOrder("current", 30, 150, "")
  const summary = buildChangeOrderSummary({ current, jobs: [job], history: [current, first, original] })
  assert.ok(summary)
  assert.equal(summary.previousContractValue, 5919)
  assert.equal(summary.newContractValue, 6069)
})

test("later ordinary quotes or CO versions do not rewrite an older CO comparison", () => {
  const original = estimate()
  const current = changeOrder("current", 20, 100, "CO-1")
  const futureQuote = estimate({ id: "future_quote", createdAt: 30, pricing: { labor: 6000, materials: 0, subs: 0, markup: 0, total: 6000 } })
  const futureVersion = changeOrder("future_version", 40, 200, "CO-1")
  const summary = buildChangeOrderSummary({ current, jobs: [job], history: [futureVersion, futureQuote, current, original] })
  assert.ok(summary)
  assert.equal(summary.original.id, original.id)
  assert.equal(summary.previousContractValue, 5819)
  assert.equal(summary.newContractValue, 5919)
})

test("intentional added and deductive COs preserve signed amounts and ignore intervening revisions", () => {
  const original = estimate({ approval: { status: "approved" } })
  const added = estimate({ id: "added", createdAt: 20, documentType: "Change Order", pricing: { labor: 500, materials: 0, subs: 0, markup: 20, total: 600 } })
  const revision = estimate({ id: "revision", createdAt: 30, pricing: { labor: 9000, materials: 0, subs: 0, markup: 0, total: 9000 } })
  const credit = estimate({ id: "credit", createdAt: 40, documentType: "Change Order", pricing: { labor: -100, materials: 0, subs: 0, markup: 20, total: -120 } })
  const later = estimate({ id: "later_co", createdAt: 50, documentType: "Change Order", pricing: { labor: 200, materials: 0, subs: 0, markup: 0, total: 200 } })
  const history = [later, credit, revision, added, original]
  const contract = buildJobContractSummary({ jobId: job.id, jobs: [job], history })
  assert.equal(contract.currentContractValue, 6499)
  assert.deepEqual(contract.changeOrders.map((item) => item.id), ["added", "credit", "later_co"])
  const summary = buildChangeOrderSummary({ current: credit, jobs: [job], history })
  assert.ok(summary)
  assert.equal(summary.previousContractValue, 6419)
  assert.equal(summary.currentEstimateTotal, -120)
  assert.equal(summary.newContractValue, 6299)
  assert.equal(summary.costDelta, -120)
})

test("contract summaries continue using canonical per-document tax and rounded totals", () => {
  const original = estimate({ tax: { enabled: true, rate: 10 } })
  const co = estimate({ id: "co", createdAt: 20, documentType: "Change Order", pricing: { labor: 100, materials: 0, subs: 0, markup: 20, total: 99999 }, tax: { enabled: true, rate: 5 } })
  const summary = buildJobContractSummary({ jobId: job.id, jobs: [job], history: [co, original] })
  assert.equal(summary.originalEstimateTotal, 6401)
  assert.equal(summary.changeOrdersTotal, 126)
  assert.equal(summary.currentContractValue, 6527)
  assert.equal(summary.currentContractValueBeforeTax, 5939)
})

test("CO summary retains schedule comparisons against the original baseline", () => {
  const original = estimate({ schedule: { crewDays: 2, visits: 1, workDaysPerWeek: 5, calendarDays: { min: 2, max: 2 }, rationale: [], startDate: "2026-10-20" } })
  const co = estimate({ id: "co", createdAt: 20, documentType: "Change Order", schedule: { crewDays: 3, visits: 1, workDaysPerWeek: 5, calendarDays: { min: 3, max: 3 }, rationale: [], startDate: "2026-10-20" } })
  const summary = buildChangeOrderSummary({ current: co, jobs: [job], history: [co, original] })
  assert.ok(summary)
  assert.equal(summary.crewDayDelta, 1)
  assert.equal(summary.scheduleDeltaDays, 1)
})

test("absent original or current document does not invent contract or change-order values", () => {
  const co = estimate({ id: "co", documentType: "Change Order" })
  assert.equal(buildChangeOrderSummary({ current: null, jobs: [], history: [] }), null)
  assert.equal(buildChangeOrderSummary({ current: co, jobs: [], history: [co] }), null)
  const empty = buildJobContractSummary({ jobId: job.id, jobs: [], history: [] })
  assert.equal(empty.currentContractValue, 0)
  assert.deepEqual(empty.changeOrders, [])
})

test("generated proposal lead follows selected intent rather than AI labels", () => {
  for (const label of ["Change Order", "Estimate", "Change Order / Estimate", "Estimate / Change Order", "Change Order or Estimate"]) {
    assert.equal(normalizeGeneratedDocumentText(`This ${label} covers bedroom painting.`, "Estimate"), "This estimate covers bedroom painting.")
    assert.equal(normalizeGeneratedDocumentText(`This ${label} covers added painting.`, "Change Order"), "This change order covers added painting.")
  }
})

test("ordinary estimates reject additional-contract assertions instead of deleting them", () => {
  const text = "This Change Order / Estimate covers painting. This scope is additive to any existing contract scope. The work is intended to be additive or corrective to existing contract conditions or proposed as new work depending on project status. Owner supplies fixtures; contractor supplies paint."
  assert.throws(() => normalizeGeneratedDocumentText(text, "Estimate"), /purpose|contract|change.order/i)
  assert.equal(normalizeGeneratedDocumentText(text, "Change Order"), text.replace("This Change Order / Estimate", "This change order"))
  assert.equal(normalizeGeneratedDocumentText("Paint the walls. Electrical work by others.", "Estimate"), "Paint the walls. Electrical work by others.")
  assert.throws(() => normalizeGeneratedDocumentText("This Change Order covers painting. This change is additive to the original contract scope.", "Estimate"), /purpose|contract|change.order/i)
})

test("the reviewed contradictory response cannot become a saved ordinary proposal", () => {
  const text = "This Change Order covers painting. The work is additional to the original contract and was not previously included."
  assert.throws(() => normalizeGeneratedDocumentText(text, "Estimate"), /purpose|contract|change.order/i)
  assert.equal(normalizeGeneratedDocumentText(text, "Change Order"), text.replace("This Change Order", "This change order"))
})

test("ordinary proposal normalization preserves exclusions and legitimate contract references", () => {
  const text = "This Estimate covers painting. Electrical work is not included. Additional repairs require a separate quote. Existing contract drawings identify the bedroom locations."
  assert.equal(normalizeGeneratedDocumentText(text, "Estimate"), text.replace("This Estimate", "This estimate"))
})
