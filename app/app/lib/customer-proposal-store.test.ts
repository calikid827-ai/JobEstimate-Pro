import assert from "node:assert/strict"
import test from "node:test"
import { DRAFT_REVISION_KEY, HISTORY_KEY, PROPOSAL_SNAPSHOT_KEY } from "./constants"
import { createOwnerLocalPersistence } from "./local-persistence"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, createDraft, updateDraftItem, workingCopy } from "./source-linked-draft"
import type { DraftRevision } from "./source-linked-draft-types"
import type { DraftStoreLock } from "./source-linked-draft-store"
import type { ProposalContext, ProposalSnapshot } from "./customer-proposal-types"
import { createProposalSnapshot, defaultProposalDetails, validateProposalSnapshotForContext } from "./customer-proposal"
import { createCustomerProposalStore } from "./customer-proposal-store"

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
function lock(): DraftStoreLock {
  let tail = Promise.resolve()
  return async (_name, run) => {
    const previous = tail
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    tail = previous.then(() => held)
    await previous
    try { return await run() } finally { release() }
  }
}
function fixture(ownerId = "owner-a", jobId = "job-a"): ProposalContext {
  const draft = createDraft(ownerId, { id: jobId, name: "Synthetic paint project", clientName: "Synthetic client", address: "Synthetic address" }, { markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25 }, `${jobId}-draft`)
  let item = createContractorItem({ id: `${jobId}-item`, location: "Room A", description: "Paint the walls.", quantity: 1, unit: "lump_sum", measurementBasis: "Synthetic contractor lump sum" })
  item = updateDraftItem(item, { costs: { unit: "lump_sum", labor: 1000, materials: 500, other: 250, source: "INTERNAL_COST_SOURCE" } })
  draft.items = [approveCosts(confirmQuantity(item, ownerId, 100), ownerId, 101)]
  const revision: DraftRevision = { schemaVersion: 1, id: `${jobId}-revision`, draftId: draft.id, ownerId, jobId, parentRevisionId: null, savedAt: 1000, draft, calculation: calculateDraft(draft) }
  return { ownerId, jobId, revision, workingDraft: workingCopy(revision) }
}
function snapshot(context = fixture(), id = "proposal-1", at = 2000): ProposalSnapshot {
  const details = defaultProposalDetails(context.revision!, { name: "Synthetic company", address: "", phone: "", email: "", license: "" }, "2026-11-09")
  return createProposalSnapshot(context, { ...details, reference: id }, id, at)
}

test("checked proposal save and reopen preserve safe content without touching estimates or legacy records", async () => {
  const storage = memoryStorage()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  persistence.setLocalValue(HISTORY_KEY, "synthetic legacy history")
  persistence.setLocalValue(DRAFT_REVISION_KEY, "synthetic immutable estimate collection")
  const context = fixture()
  const store = createCustomerProposalStore("owner-a", persistence, (id) => id === "job-a", (value) => validateProposalSnapshotForContext(value, context), lock())
  const value = snapshot(context)
  const saved = await store.save(value)
  assert.ok(saved.ok)
  if (!saved.ok) return
  assert.deepEqual(saved.snapshot, value)
  assert.equal(saved.snapshot.customer.pricing.total, 2268)
  value.customer.company.name = "Later unsaved name"
  const listed = store.list("job-a", context.revision!.id)
  assert.ok(listed.ok)
  if (!listed.ok) return
  assert.equal(listed.snapshots[0].customer.company.name, "Synthetic company")
  assert.equal(persistence.getLocalValue(HISTORY_KEY), "synthetic legacy history")
  assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), "synthetic immutable estimate collection")
})

test("proposal snapshots append without a legacy cap and never overwrite an existing identity", async () => {
  const storage = memoryStorage(), context = fixture()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const store = createCustomerProposalStore("owner-a", persistence, () => true, (value) => validateProposalSnapshotForContext(value, context), lock())
  for (let n = 1; n <= 31; n++) assert.equal((await store.save(snapshot(context, `proposal-${n}`, 2000 + n))).ok, true)
  const before = persistence.getLocalValue(PROPOSAL_SNAPSHOT_KEY)
  assert.equal((await store.save(snapshot(context, "proposal-1", 4000))).ok, false)
  assert.equal(persistence.getLocalValue(PROPOSAL_SNAPSHOT_KEY), before)
  const listed = store.list("job-a")
  assert.ok(listed.ok)
  if (listed.ok) assert.equal(listed.snapshots.length, 31)
})

test("owner and job isolation include changed session or job while a save waits for its lock", async () => {
  const storage = memoryStorage(), context = fixture()
  let current = true
  let selectedJob = "job-a"
  const persistence = createOwnerLocalPersistence("owner-a", () => current, storage)
  const staleJob = createCustomerProposalStore("owner-a", persistence, (id) => id === selectedJob, (value) => validateProposalSnapshotForContext(value, context), async (_name, run) => { selectedJob = "job-b"; return run() })
  assert.equal((await staleJob.save(snapshot(context))).ok, false)
  assert.equal(storage.values.size, 0)
  const staleOwner = createCustomerProposalStore("owner-a", persistence, () => true, (value) => validateProposalSnapshotForContext(value, context), async (_name, run) => { current = false; return run() })
  assert.equal((await staleOwner.save(snapshot(context))).ok, false)
  assert.equal(storage.values.size, 0)
  const foreignStore = createCustomerProposalStore("owner-b", persistence, () => true, () => ({ ready: true, blockers: [], limitations: [] }), lock())
  assert.equal(foreignStore.list("job-a").ok, false)
  assert.equal((await foreignStore.save(snapshot(context))).ok, false)
})

test("a newer unsaved estimate or revision selection during a queued save is rejected before writing", async () => {
  const storage = memoryStorage()
  let context = fixture()
  const captured = snapshot(context)
  const store = createCustomerProposalStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, storage), () => true,
    (value) => validateProposalSnapshotForContext(value, context), async (_name, run) => {
      context = { ...context, workingDraft: { ...context.workingDraft!, title: "Later unsaved edit" } }
      return run()
    })
  assert.equal((await store.save(captured)).ok, false)
  assert.equal(storage.values.size, 0)
  context = fixture()
  const changedRevision = createCustomerProposalStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, storage), () => true,
    (value) => validateProposalSnapshotForContext(value, context), async (_name, run) => { context = fixture("owner-a", "job-b"); return run() })
  assert.equal((await changedRevision.save(captured)).ok, false)
  assert.equal(storage.values.size, 0)
})

test("historical listing does not claim current readiness and filters exact job and revision", async () => {
  const storage = memoryStorage()
  let context = fixture(), selectedJob = "job-a", validationCalls = 0
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const store = createCustomerProposalStore("owner-a", persistence, (id) => id === selectedJob, (value) => { validationCalls++; return validateProposalSnapshotForContext(value, context) }, lock())
  assert.equal((await store.save(snapshot(context))).ok, true)
  context = fixture("owner-a", "job-b"); selectedJob = "job-b"
  assert.equal((await store.save(snapshot(context, "proposal-b"))).ok, true)
  const beforeList = validationCalls
  assert.deepEqual(store.list("job-b", "not-this-revision"), { ok: true, snapshots: [] })
  const listed = store.list("job-b", "job-b-revision")
  assert.ok(listed.ok)
  if (listed.ok) assert.deepEqual(listed.snapshots.map((value) => value.id), ["proposal-b"])
  assert.equal(validationCalls, beforeList)
  assert.equal(store.list("job-a").ok, false)
  const ownerB = createCustomerProposalStore("owner-b", createOwnerLocalPersistence("owner-b", () => true, storage), () => true, () => ({ ready: false, blockers: ["Historical"], limitations: [] }), lock())
  assert.deepEqual(ownerB.list("job-b"), { ok: true, snapshots: [] })
})

test("quota and failed readback preserve earlier snapshots and never return Saved", async () => {
  const storage = memoryStorage(), context = fixture()
  let failure = "none"
  const persistence = createOwnerLocalPersistence("owner-a", () => true, {
    ...storage, setItem(key, value) {
      if (failure === "quota") throw new Error("Synthetic quota failure")
      if (failure === "readback") return
      storage.setItem(key, value)
    },
  })
  const store = createCustomerProposalStore("owner-a", persistence, () => true, (value) => validateProposalSnapshotForContext(value, context), lock())
  assert.equal((await store.save(snapshot(context))).ok, true)
  const before = persistence.getLocalValue(PROPOSAL_SNAPSHOT_KEY)
  const pending = snapshot(context, "pending-proposal")
  for (failure of ["quota", "readback"]) {
    const result = await store.save(pending)
    assert.equal(result.ok, false)
    assert.equal(persistence.getLocalValue(PROPOSAL_SNAPSHOT_KEY), before)
    assert.equal(pending.id, "pending-proposal")
  }
})

test("malformed, duplicate, foreign and unsafe stored proposal records are preserved and not overwritten", async () => {
  const storage = memoryStorage(), context = fixture()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const store = createCustomerProposalStore("owner-a", persistence, () => true, (value) => validateProposalSnapshotForContext(value, context), lock())
  const value = snapshot(context)
  for (const raw of [
    "not JSON",
    JSON.stringify({ schemaVersion: 1, snapshots: [value, value] }),
    JSON.stringify({ schemaVersion: 1, snapshots: [{ ...value, ownerId: "owner-b" }] }),
    JSON.stringify({ schemaVersion: 1, snapshots: [{ ...value, customer: { ...value.customer, internalEstimate: context.revision } }] }),
    JSON.stringify({ schemaVersion: 1, snapshots: [], unknown: true }),
  ]) {
    persistence.setLocalValue(PROPOSAL_SNAPSHOT_KEY, raw)
    assert.equal(store.list("job-a").ok, false)
    assert.equal((await store.save(snapshot(context, "cannot-overwrite"))).ok, false)
    assert.equal(persistence.getLocalValue(PROPOSAL_SNAPSHOT_KEY), raw)
  }
})

test("concurrent appends retain both snapshots and an identity collision cannot replace either", async () => {
  const storage = memoryStorage(), context = fixture(), sharedLock = lock()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const tabA = createCustomerProposalStore("owner-a", persistence, () => true, (value) => validateProposalSnapshotForContext(value, context), sharedLock)
  const tabB = createCustomerProposalStore("owner-a", persistence, () => true, (value) => validateProposalSnapshotForContext(value, context), sharedLock)
  const results = await Promise.all([tabA.save(snapshot(context, "a")), tabB.save(snapshot(context, "b"))])
  assert.deepEqual(results.map((result) => result.ok), [true, true])
  const collision = await Promise.all([tabA.save(snapshot(context, "shared")), tabB.save(snapshot(context, "shared"))])
  assert.equal(collision.filter((result) => result.ok).length, 1)
  const listed = tabA.list("job-a")
  assert.ok(listed.ok)
  if (listed.ok) assert.equal(listed.snapshots.length, 3)
})

test("unavailable storage, unreadable storage and required-lock failure do not fall back to an unsafe save", async () => {
  const context = fixture()
  const validate = (value: ProposalSnapshot) => validateProposalSnapshotForContext(value, context)
  const unavailable = createCustomerProposalStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, null), () => true, validate, lock())
  assert.equal((await unavailable.save(snapshot(context))).ok, false)
  const blocked = createCustomerProposalStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, { getItem() { throw Error("Synthetic unavailable storage") }, setItem() {}, removeItem() {} }), () => true, validate, lock())
  assert.equal((await blocked.save(snapshot(context))).ok, false)
  const storage = memoryStorage()
  const locking = createCustomerProposalStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, storage), () => true, validate, async () => { throw Error("Saving a proposal requires browser storage locking. The proposal remains unsaved.") })
  const result = await locking.save(snapshot(context))
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /requires browser storage locking/)
  assert.equal(storage.values.size, 0)
})
