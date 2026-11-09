import assert from "node:assert/strict"
import test from "node:test"
import { syntheticDraftStudy } from "../../../tests/fixtures/source-linked-draft/browser-fixtures"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, createDraft, createStudyItem, snapshotStudySelection, updateDraftItem, workingCopy } from "./source-linked-draft"
import type { Draft, DraftRevision } from "./source-linked-draft-types"
import type { ProposalContext, ProposalDetails } from "./customer-proposal-types"
import { assessProposalReadiness, createProposalSnapshot, defaultProposalDetails, parseCustomerProposal, parseProposalSnapshot, proposalDetailsProblems, validateProposalSnapshotForContext } from "./customer-proposal"

const ownerId = "synthetic-owner"
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const profile = { name: "Synthetic Example Painting", address: "100 Test Street", phone: "555-0100", email: "example@example.test", license: "SYNTHETIC-LICENSE", paymentTerms: "Contractor-entered test terms." }
function fixture(studyBacked = false): ProposalContext {
  const draft = createDraft(ownerId, { id: "synthetic-job", name: "Synthetic room repaint", clientName: "Synthetic customer", address: "101 Fictional Street" }, { markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25 }, "synthetic-draft")
  const study = syntheticDraftStudy(ownerId)
  let item = studyBacked ? createStudyItem(snapshotStudySelection(study, `${ownerId}-synthesis-attempt:0`, [`${ownerId}-answer-room101`]), "Room 101", "quoted-item")
    : createContractorItem({ id: "quoted-item", location: "Room 101", description: "Prepare and paint the upper walls." })
  item = updateDraftItem(item, { description: "Prepare and paint the upper walls.", scopeDecision: "INTERNAL_SCOPE_DECISION", disposition: "included", quantity: 1, unit: "lump_sum", measurementBasis: "INTERNAL_MEASUREMENT_BASIS", costs: { unit: "lump_sum", labor: 1000, materials: 500, other: 250, source: "INTERNAL_COST_SOURCE" } })
  item = approveCosts(confirmQuantity(item, ownerId, 100), ownerId, 101)
  const exclusion = createContractorItem({ id: "excluded-item", location: "Room 101", description: "Ceiling painting is excluded.", disposition: "excluded", note: "INTERNAL_EXCLUSION_NOTE" })
  draft.items = [item, exclusion]
  const revision: DraftRevision = { schemaVersion: 1, id: "synthetic-revision", draftId: draft.id, ownerId, jobId: draft.job.id, parentRevisionId: null, savedAt: 1000, draft, calculation: calculateDraft(draft) }
  const working = workingCopy(revision)
  if (studyBacked) working.items[0] = updateDraftItem(working.items[0], { source: { ...working.items[0].source as Extract<typeof item.source, { kind: "study" }>, freshness: "current" } })
  return { ownerId, jobId: draft.job.id, revision, workingDraft: working }
}
function details(context = fixture()): ProposalDetails {
  return { ...defaultProposalDetails(context.revision!, profile, "2026-11-09"), reference: "SYNTHETIC-PROPOSAL-1", clarifications: "Upper walls only.", allowances: "No additional allowance entered.", schedule: "Contractor-entered test schedule.", terms: "Contractor-entered test terms." }
}
function changedRevision(context: ProposalContext, mutate: (draft: Draft) => void): ProposalContext {
  const revision = clone(context.revision!)
  mutate(revision.draft)
  revision.calculation = calculateDraft(revision.draft)
  return { ...context, revision, workingDraft: workingCopy(revision) }
}

test("ready proposal copies the exact saved selling price without exposing internal costs or evidence", () => {
  const context = fixture(true)
  const snapshot = createProposalSnapshot(context, details(context), "proposal-1", 2000)
  assert.equal(assessProposalReadiness(context).ready, true)
  // Independently specified arithmetic: 1,750 direct + 20% = 2,100; 8% tax = 168.
  assert.deepEqual(snapshot.customer.pricing, { subtotal: 2100, taxRate: 8, taxAmount: 168, roundingAdjustment: 0, total: 2268, depositDue: 567, remaining: 1701 })
  assert.deepEqual(snapshot.customer.scope, [{ trade: "painting", location: "Room 101", description: "Prepare and paint the upper walls.", quantity: 1, unit: "lump_sum" }])
  assert.deepEqual(snapshot.customer.exclusions, [{ location: "Room 101", description: "Ceiling painting is excluded." }])
  assert.deepEqual(Object.keys(snapshot).sort(), ["schemaVersion", "id", "ownerId", "jobId", "draftId", "estimateRevisionId", "createdAt", "customer"].sort())
  const customer = JSON.stringify(snapshot.customer)
  for (const sensitive of ["INTERNAL_", "costApproval", "quantityConfirmation", "markupPct", "marginPct", "sourceRevision", "synthesis", "answer-room101", "sourceSha256", "1000", "500", "250"]) assert.equal(customer.includes(sensitive), false, sensitive)
  assert.equal(validateProposalSnapshotForContext(snapshot, context).ready, true)
})

test("company and proposal details are explicitly selected, never supplied with invented terms", () => {
  const context = fixture()
  const emptyProfile = { name: "", address: "", phone: "", email: "", license: "" }
  const values = defaultProposalDetails(context.revision!, emptyProfile, "2026-11-09")
  assert.equal(values.reference, "")
  assert.equal(values.terms, "")
  assert.equal(values.schedule, "")
  assert.equal(values.allowances, "")
  assert.equal(values.clarifications, "")
  assert.equal(proposalDetailsProblems(values).length, 2)
  assert.throws(() => createProposalSnapshot(context, values, "proposal-1", 2000), /company name/)
  for (const invalidDate of ["2026-02-30", "2026-13-01", "not-a-date"]) assert.ok(proposalDetailsProblems({ ...details(), date: invalidDate }).some((problem) => problem.includes("proposal date")))
  assert.deepEqual(proposalDetailsProblems({ ...details(), date: "2028-02-29" }), [])
})

test("missing revision, foreign binding and a working copy of another revision fail closed", () => {
  const context = fixture()
  assert.equal(assessProposalReadiness({ ...context, revision: null }).ready, false)
  assert.equal(assessProposalReadiness({ ...context, ownerId: "another-owner" }).ready, false)
  assert.equal(assessProposalReadiness({ ...context, jobId: "another-job" }).ready, false)
  assert.equal(assessProposalReadiness({ ...context, workingDraft: null }).ready, false)
  assert.equal(assessProposalReadiness({ ...context, workingDraft: { ...context.workingDraft!, basedOnRevisionId: "another-revision" } }).ready, false)
})

test("unsaved estimate changes cannot enter a proposal attributed to its older revision", () => {
  const context = fixture()
  for (const mutate of [
    (draft: Draft) => { draft.title = "Changed unsaved title" },
    (draft: Draft) => { draft.commercial.markupPct = 40 },
    (draft: Draft) => { draft.items[0] = updateDraftItem(draft.items[0], { description: "Changed unsaved scope" }) },
    (draft: Draft) => { draft.items[0] = updateDraftItem(draft.items[0], { costs: { ...draft.items[0].costs, labor: 1200 } }) },
  ]) {
    const changed = clone(context); mutate(changed.workingDraft!)
    const result = assessProposalReadiness(changed)
    assert.equal(result.ready, false)
    assert.match(result.blockers.join(" "), /unsaved changes/)
    assert.throws(() => createProposalSnapshot(changed, details(context), "proposal-1", 2000))
  }
})

test("missing approvals, unpriced scope, unresolved responsibility and no included work block readiness", () => {
  const context = fixture()
  for (const mutate of [
    (draft: Draft) => { draft.items[0].quantityConfirmation = null },
    (draft: Draft) => { draft.items[0].costApproval = null },
    (draft: Draft) => { draft.items[0] = updateDraftItem(draft.items[0], { quantity: null }) },
    (draft: Draft) => { draft.items[0] = updateDraftItem(draft.items[0], { disposition: "unresolved" }) },
    (draft: Draft) => { draft.items[0] = updateDraftItem(draft.items[0], { disposition: "excluded" }) },
    (draft: Draft) => { draft.items[1] = updateDraftItem(draft.items[1], { description: "" }) },
  ]) assert.equal(assessProposalReadiness(changedRevision(context, mutate)).ready, false)
})

test("source checks can recover an unchanged selected revision without rewriting it", () => {
  const context = fixture(true)
  const historical = JSON.stringify(context.revision)
  const reopened = { ...context, workingDraft: workingCopy(context.revision!) }
  assert.equal(assessProposalReadiness(reopened).ready, false)
  assert.match(assessProposalReadiness(reopened).blockers.join(" "), /unverified/)
  assert.equal(assessProposalReadiness(context).ready, true)
  assert.equal(JSON.stringify(context.revision), historical)
  for (const freshness of ["unavailable", "changed"] as const) {
    const working = clone(context.workingDraft!)
    working.items[0] = updateDraftItem(working.items[0], { source: { ...working.items[0].source as Extract<typeof working.items[0]["source"], { kind: "study" }>, freshness } })
    assert.equal(assessProposalReadiness({ ...context, workingDraft: working }).ready, false)
  }
})

test("limited package coverage remains visible without blocking the priced selected bounded scope", () => {
  const result = assessProposalReadiness(fixture(true))
  assert.equal(result.ready, true)
  assert.ok(result.limitations.some((limit) => limit.includes("selected quoted items")))
  assert.ok(result.limitations.some((limit) => limit.includes("complete package coverage")))
  assert.ok(result.limitations.some((limit) => limit.includes("did not independently review images")))
})

test("snapshots remain fixed when later profile, details or estimate inputs change", () => {
  const context = fixture()
  const entered = details(context)
  const first = createProposalSnapshot(context, entered, "proposal-1", 2000)
  const original = clone(first)
  entered.company.name = "Later company name"
  entered.terms = "Later terms"
  context.workingDraft!.items[0] = updateDraftItem(context.workingDraft!.items[0], { description: "Later unsaved estimate scope" })
  assert.deepEqual(first, original)
  const second = createProposalSnapshot(fixture(), entered, "proposal-2", 3000)
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.customer.company.name, second.customer.company.name)
})

test("proposal binding and quoted content must match the exact selected revision", () => {
  const context = fixture()
  const snapshot = createProposalSnapshot(context, details(), "proposal-1", 2000)
  for (const mutation of [
    (value: typeof snapshot) => { value.ownerId = "another-owner" },
    (value: typeof snapshot) => { value.jobId = "another-job" },
    (value: typeof snapshot) => { value.draftId = "another-draft" },
    (value: typeof snapshot) => { value.estimateRevisionId = "another-revision" },
    (value: typeof snapshot) => { value.customer.scope[0].description = "Different quoted scope" },
    (value: typeof snapshot) => { value.customer.pricing.total++; value.customer.pricing.remaining++; value.customer.pricing.roundingAdjustment++ },
  ]) {
    const changed = clone(snapshot); mutation(changed)
    assert.equal(validateProposalSnapshotForContext(changed, context).ready, false)
  }
})

test("strict customer parsing rejects internal records, unknown fields and unreconciled prices", () => {
  const snapshot = createProposalSnapshot(fixture(), details(), "proposal-1", 2000)
  assert.ok(parseProposalSnapshot(JSON.parse(JSON.stringify(snapshot))))
  assert.equal(parseCustomerProposal({ ...snapshot.customer, internalEstimate: fixture().revision }), null)
  assert.equal(parseCustomerProposal({ ...snapshot.customer, company: { ...snapshot.customer.company, logo: "data:internal-binary" } }), null)
  assert.equal(parseCustomerProposal({ ...snapshot.customer, pricing: { ...snapshot.customer.pricing, markupPct: 20 } }), null)
  assert.equal(parseCustomerProposal({ ...snapshot.customer, pricing: { ...snapshot.customer.pricing, total: 999 } }), null)
  assert.equal(parseProposalSnapshot({ ...snapshot, issued: true }), null)
  const nonfinite = clone(snapshot); nonfinite.customer.pricing.total = Number.NaN
  assert.equal(parseProposalSnapshot(nonfinite), null)
})

test("intentional zero costs remain a real priced quote and tax/deposit choices are recorded", () => {
  const context = fixture()
  const zero = changedRevision(context, (draft) => {
    const item = updateDraftItem(draft.items[0], { costs: { ...draft.items[0].costs, labor: 0, materials: 0, other: 0 } })
    draft.items[0] = approveCosts(item, ownerId, 200)
    draft.commercial.taxEnabled = false
  })
  const snapshot = createProposalSnapshot(zero, details(zero), "zero-proposal", 3000)
  assert.deepEqual(snapshot.customer.pricing, { subtotal: 0, taxRate: 0, taxAmount: 0, roundingAdjustment: 0, total: 0, depositDue: 0, remaining: 0 })
  const unknown = changedRevision(context, (draft) => { draft.items[0] = updateDraftItem(draft.items[0], { costs: { ...draft.items[0].costs, other: null } }) })
  assert.equal(assessProposalReadiness(unknown).ready, false)
})
