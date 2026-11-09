import assert from "node:assert/strict"
import test from "node:test"
import { DRAFT_REVISION_KEY, HISTORY_KEY } from "./constants"
import { createOwnerLocalPersistence } from "./local-persistence"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, createDraft, workingCopy } from "./source-linked-draft"
import { createSourceLinkedDraftStore, type DraftStoreLock } from "./source-linked-draft-store"
import type { Draft } from "./source-linked-draft-types"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

function serializedLock(): DraftStoreLock {
  const tails = new Map<string, Promise<void>>()
  return async (name, run) => {
    const previous = tails.get(name) ?? Promise.resolve()
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    tails.set(name, previous.then(() => held))
    await previous
    try { return await run() } finally { release() }
  }
}

function fixture(ownerId = "owner-a", jobId = "job-a", id = "draft-a"): Draft {
  const draft = createDraft(ownerId, { id: jobId, name: "Synthetic job", clientName: "Synthetic client", address: "" }, {
    markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25,
  }, id)
  const item = createContractorItem({ id: "item-a", description: "Synthetic painting scope", location: "Synthetic room" })
  item.disposition = "included"
  item.quantity = 2
  item.unit = "doors"
  item.measurementBasis = "Synthetic contractor-entered count"
  item.costs = { unit: "doors", labor: 100, materials: 20, other: 0, source: "Synthetic approved company costs" }
  draft.items = [approveCosts(confirmQuantity(item, ownerId, 1000), ownerId, 1000)]
  return draft
}

test("draft revisions save and reopen full snapshots without touching legacy history", async () => {
  const storage = memoryStorage()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const legacy = JSON.stringify(Array.from({ length: 31 }, (_, n) => ({ id: `legacy-${n}`, approval: { status: "approved" } })))
  persistence.setLocalValue(HISTORY_KEY, legacy)
  const store = createSourceLinkedDraftStore("owner-a", persistence, (jobId) => jobId === "job-a", serializedLock())
  const draft = fixture()
  const expected = structuredClone(draft)
  const saved = await store.save(draft, "revision-1", 2000)
  assert.equal(saved.ok, true)
  if (!saved.ok) return
  assert.deepEqual(saved.revision.draft, expected)
  assert.deepEqual(saved.revision.calculation, calculateDraft(expected))
  draft.items[0].description = "Changed unsaved working text"
  draft.commercial.markupPct = 80
  const reopened = store.list("job-a")
  assert.equal(reopened.ok, true)
  if (!reopened.ok) return
  assert.deepEqual(reopened.revisions[0].draft, expected)
  assert.deepEqual(reopened.revisions[0].calculation, saved.revision.calculation)
  assert.equal(persistence.getLocalValue(HISTORY_KEY), legacy)
  assert.equal(storage.values.size, 2)
})

test("all revisions survive beyond the legacy cap and editing an older revision appends a branch", async () => {
  const storage = memoryStorage()
  const store = createSourceLinkedDraftStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, storage), () => true, serializedLock())
  let draft = fixture()
  let first: Awaited<ReturnType<typeof store.save>> | null = null
  for (let n = 1; n <= 30; n++) {
    const result = await store.save(draft, `revision-${n}`, 2000 + n)
    assert.equal(result.ok, true)
    if (!result.ok) return
    if (n === 1) first = result
    draft = workingCopy(result.revision)
  }
  assert.ok(first?.ok)
  const branch = workingCopy(first.revision)
  branch.title = "Synthetic branch from the first saved revision"
  assert.equal((await store.save(branch, "older-branch", 3000)).ok, true)
  const result = store.list("job-a")
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.revisions.length, 31)
  assert.deepEqual(result.revisions.find((revision) => revision.id === "revision-1"), first.revision)
  assert.equal(result.revisions.find((revision) => revision.id === "older-branch")?.parentRevisionId, "revision-1")
})

test("owner and selected-job bindings fail closed, including changes while waiting for a lock", async () => {
  const storage = memoryStorage()
  let currentOwner = true
  let currentJob = "job-a"
  const persistence = createOwnerLocalPersistence("owner-a", () => currentOwner, storage)
  const other = createSourceLinkedDraftStore("owner-b", persistence, () => true, serializedLock())
  assert.equal(other.list("job-a").ok, false)
  assert.equal((await other.save(fixture("owner-b"), "wrong-owner", 2000)).ok, false)
  const store = createSourceLinkedDraftStore("owner-a", persistence, (jobId) => currentJob === jobId, async (_name, run) => {
    currentJob = "job-b"
    return run()
  })
  assert.equal((await store.save(fixture(), "stale-job", 2000)).ok, false)
  assert.equal(storage.values.size, 0)
  currentJob = "job-a"
  const staleOwner = createSourceLinkedDraftStore("owner-a", persistence, () => true, async (_name, run) => {
    currentOwner = false
    return run()
  })
  assert.equal((await staleOwner.save(fixture(), "stale-owner", 2000)).ok, false)
  assert.equal(staleOwner.list("job-a").ok, false)
  assert.equal(storage.values.size, 0)
})

test("listing filters jobs and cannot read another owner's draft collection", async () => {
  const storage = memoryStorage()
  let job = "job-a"
  const a = createSourceLinkedDraftStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, storage), (id) => id === job, serializedLock())
  assert.equal((await a.save(fixture(), "a", 2000)).ok, true)
  job = "job-b"
  assert.equal((await a.save(fixture("owner-a", "job-b", "draft-b"), "b", 2001)).ok, true)
  const result = a.list("job-b")
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.revisions.map((revision) => revision.id), ["b"])
  assert.equal(a.list("job-a").ok, false)
  const b = createSourceLinkedDraftStore("owner-b", createOwnerLocalPersistence("owner-b", () => true, storage), () => true, serializedLock())
  assert.deepEqual(b.list("job-a"), { ok: true, revisions: [] })
})

test("malformed existing data, conflicting identities, and invalid parents never overwrite saved revisions", async () => {
  const storage = memoryStorage()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const store = createSourceLinkedDraftStore("owner-a", persistence, () => true, serializedLock())
  persistence.setLocalValue(DRAFT_REVISION_KEY, "synthetic invalid JSON")
  assert.equal(store.list("job-a").ok, false)
  assert.equal((await store.save(fixture(), "new", 2000)).ok, false)
  assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), "synthetic invalid JSON")
  persistence.removeLocalValue(DRAFT_REVISION_KEY)
  const first = await store.save(fixture(), "first", 2000)
  assert.ok(first.ok)
  const before = persistence.getLocalValue(DRAFT_REVISION_KEY)
  assert.equal((await store.save(fixture(), "first", 2000)).ok, false)
  assert.equal((await store.save(fixture(), "new-root", 2001)).ok, false)
  const missingParent = fixture()
  missingParent.basedOnRevisionId = "missing"
  assert.equal((await store.save(missingParent, "missing-child", 2002)).ok, false)
  const wrongJob = fixture("owner-a", "job-b")
  wrongJob.basedOnRevisionId = "first"
  assert.equal((await store.save(wrongJob, "wrong-job-child", 2003)).ok, false)
  const wrongDraft = fixture("owner-a", "job-a", "draft-b")
  wrongDraft.basedOnRevisionId = "first"
  assert.equal((await store.save(wrongDraft, "wrong-draft-child", 2004)).ok, false)
  assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), before)
})

test("concurrent appends retain both revisions and simultaneous identity conflicts cannot replace one", async () => {
  const storage = memoryStorage()
  const lock = serializedLock()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const tabA = createSourceLinkedDraftStore("owner-a", persistence, () => true, lock)
  const tabB = createSourceLinkedDraftStore("owner-a", persistence, () => true, lock)
  const appended = await Promise.all([
    tabA.save(fixture("owner-a", "job-a", "draft-a"), "a", 2000),
    tabB.save(fixture("owner-a", "job-a", "draft-b"), "b", 2001),
  ])
  assert.deepEqual(appended.map((result) => result.ok), [true, true])
  const collided = await Promise.all([
    tabA.save(fixture("owner-a", "job-a", "draft-c"), "shared-id", 2002),
    tabB.save(fixture("owner-a", "job-a", "draft-d"), "shared-id", 2003),
  ])
  assert.equal(collided.filter((result) => result.ok).length, 1)
  const listed = tabA.list("job-a")
  assert.ok(listed.ok)
  assert.equal(listed.revisions.length, 3)
  assert.equal(new Set(listed.revisions.map((revision) => revision.id)).size, 3)
})

test("failed appends preserve older saved revisions and invalid payloads cannot add source binaries", async () => {
  const storage = memoryStorage()
  let failWrites = false
  const persistence = createOwnerLocalPersistence("owner-a", () => true, {
    ...storage,
    setItem(key, value) {
      if (failWrites) throw new Error("synthetic QuotaExceededError")
      storage.setItem(key, value)
    },
  })
  const store = createSourceLinkedDraftStore("owner-a", persistence, () => true, serializedLock())
  const saved = await store.save(fixture(), "original", 2000)
  assert.ok(saved.ok)
  const before = persistence.getLocalValue(DRAFT_REVISION_KEY)
  const next = workingCopy(saved.revision)
  failWrites = true
  assert.equal((await store.save(next, "failed-append", 2001)).ok, false)
  assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), before)
  failWrites = false
  const withBinary = { ...next, sourceDocumentBinary: "synthetic binary field must never be stored" }
  assert.equal((await store.save(withBinary, "invalid", 2002)).ok, false)
  assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), before)
})

test("stored foreign-owner records, duplicate identities, and tampered calculations fail closed", async () => {
  const storage = memoryStorage()
  const persistence = createOwnerLocalPersistence("owner-a", () => true, storage)
  const store = createSourceLinkedDraftStore("owner-a", persistence, () => true, serializedLock())
  const first = await store.save(fixture(), "first", 2000)
  assert.ok(first.ok)
  const tampered = structuredClone(first.revision)
  tampered.calculation.total += 1
  const foreign = structuredClone(first.revision)
  foreign.ownerId = "owner-b"
  foreign.draft.ownerId = "owner-b"
  for (const envelope of [
    { schemaVersion: 1, revisions: [tampered] },
    { schemaVersion: 1, revisions: [first.revision, first.revision] },
    { schemaVersion: 1, revisions: [foreign] },
    { schemaVersion: 1, revisions: [], unknown: "synthetic extra field" },
  ]) {
    persistence.setLocalValue(DRAFT_REVISION_KEY, JSON.stringify(envelope))
    const before = persistence.getLocalValue(DRAFT_REVISION_KEY)
    assert.equal(store.list("job-a").ok, false)
    assert.equal((await store.save(fixture(), "cannot-overwrite", 2001)).ok, false)
    assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), before)
  }
})

test("storage, serialization, readback, and lock failures remain visible with working data retained", async () => {
  const draft = fixture()
  const original = structuredClone(draft)
  const unavailable = createSourceLinkedDraftStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, null), () => true, serializedLock())
  assert.equal((await unavailable.save(draft, "unavailable", 2000)).ok, false)
  assert.deepEqual(draft, original)
  const quota = createSourceLinkedDraftStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, {
    getItem: () => null, setItem() { throw new Error("synthetic QuotaExceededError") }, removeItem() {},
  }), () => true, serializedLock())
  assert.equal((await quota.save(draft, "quota", 2000)).ok, false)
  const circular = fixture() as Draft & { circular?: unknown }
  circular.circular = circular
  assert.equal((await unavailable.save(circular, "circular", 2000)).ok, false)
  const locked = createSourceLinkedDraftStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, memoryStorage()), () => true,
    async () => { throw new Error("synthetic lock unavailable") })
  assert.equal((await locked.save(draft, "lock-failed", 2000)).ok, false)
  let raw: string | null = null
  let reads = 0
  const readback = createSourceLinkedDraftStore("owner-a", createOwnerLocalPersistence("owner-a", () => true, {
    getItem() { reads++; return reads <= 2 ? raw : "synthetic bad readback" },
    setItem(_key, value) { raw = value }, removeItem() { throw new Error("Do not roll back another writer") },
  }), () => true, serializedLock())
  assert.equal((await readback.save(draft, "uncertain", 2000)).ok, false)
  const envelope = JSON.parse(raw ?? "null")
  assert.equal(envelope.revisions[0].id, "uncertain")
  assert.deepEqual(draft, original)
})
