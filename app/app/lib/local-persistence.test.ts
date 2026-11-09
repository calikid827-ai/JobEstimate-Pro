import assert from "node:assert/strict"
import test from "node:test"
import { createOwnerLocalPersistence, LOCAL_STORAGE_KEYS } from "./local-persistence"

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) } }
}

test("verified owners have separate device records without claiming unverified legacy data", () => {
  const storage = memoryStorage()
  storage.setItem(LOCAL_STORAGE_KEYS.history, JSON.stringify([{ id: "unverified-legacy" }]))
  const a = createOwnerLocalPersistence("owner-a", () => true, storage)
  const b = createOwnerLocalPersistence("owner-b", () => true, storage)
  assert.deepEqual(a.readLocalJson(LOCAL_STORAGE_KEYS.history, []), [])
  a.writeLocalJson(LOCAL_STORAGE_KEYS.history, [{ id: "a-estimate" }])
  b.writeLocalJson(LOCAL_STORAGE_KEYS.history, [{ id: "b-estimate" }])
  assert.deepEqual(a.readLocalJson(LOCAL_STORAGE_KEYS.history, []), [{ id: "a-estimate" }])
  assert.deepEqual(b.readLocalJson(LOCAL_STORAGE_KEYS.history, []), [{ id: "b-estimate" }])
  assert.equal(storage.getItem(LOCAL_STORAGE_KEYS.history), '[{"id":"unverified-legacy"}]')
})

test("revoking the current owner stops late reads, writes and deletion through an old workspace", () => {
  const storage = memoryStorage()
  let active = true
  const oldWorkspace = createOwnerLocalPersistence("owner-a", () => active, storage)
  oldWorkspace.writeLocalJson(LOCAL_STORAGE_KEYS.history, [{ id: "saved-before-logout" }])
  const before = [...storage.values]
  active = false
  oldWorkspace.writeLocalJson(LOCAL_STORAGE_KEYS.history, [{ id: "late-response" }])
  oldWorkspace.removeLocalValue(LOCAL_STORAGE_KEYS.history)
  assert.equal(oldWorkspace.getLocalValue(LOCAL_STORAGE_KEYS.history), null)
  assert.deepEqual([...storage.values], before)
})

test("an inactive workspace never reads or writes storage and cannot be constructed without an owner", () => {
  let touches = 0
  const deniedStorage = { getItem: () => { touches++; return "private" },
    setItem: () => { touches++ }, removeItem: () => { touches++ } }
  const workspace = createOwnerLocalPersistence("owner-a", () => false, deniedStorage)
  assert.equal(workspace.getLocalValue(LOCAL_STORAGE_KEYS.email), null)
  workspace.setLocalValue(LOCAL_STORAGE_KEYS.email, "untrusted@example.invalid")
  workspace.removeLocalValue(LOCAL_STORAGE_KEYS.email)
  assert.equal(touches, 0)
  assert.throws(() => createOwnerLocalPersistence("", () => true, deniedStorage))
})

test("checked draft persistence is owner-scoped and preserves legacy records", () => {
  const storage = memoryStorage()
  storage.setItem(LOCAL_STORAGE_KEYS.history, "legacy history")
  const a = createOwnerLocalPersistence("owner:a", () => true, storage)
  const b = createOwnerLocalPersistence("owner-b", () => true, storage)
  assert.deepEqual(a.readLocalValueChecked(LOCAL_STORAGE_KEYS.draftRevisions), { ok: true, value: null })
  const saved = a.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, { revisions: ["synthetic"] }, { expectedRaw: null })
  assert.deepEqual(saved, { ok: true, value: '{"revisions":["synthetic"]}' })
  assert.equal(storage.getItem("jobestimatepro_owner:owner%3Aa:jobestimatepro_source_linked_drafts_v1"), saved.ok ? saved.value : null)
  assert.deepEqual(b.readLocalValueChecked(LOCAL_STORAGE_KEYS.draftRevisions), { ok: true, value: null })
  assert.equal(storage.getItem(LOCAL_STORAGE_KEYS.history), "legacy history")
})

test("checked persistence reports unavailable storage, read failures, and quota failures", () => {
  const missing = createOwnerLocalPersistence("owner-a", () => true, null)
  assert.equal(missing.readLocalValueChecked(LOCAL_STORAGE_KEYS.draftRevisions).ok, false)
  assert.equal(missing.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, {}).ok, false)
  const blocked = createOwnerLocalPersistence("owner-a", () => true, {
    getItem() { throw new Error("synthetic storage access denied") }, setItem() {}, removeItem() {},
  })
  assert.equal(blocked.readLocalValueChecked(LOCAL_STORAGE_KEYS.draftRevisions).ok, false)
  const quota = createOwnerLocalPersistence("owner-a", () => true, {
    getItem: () => null, setItem() { throw new Error("synthetic QuotaExceededError") }, removeItem() {},
  })
  const result = quota.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, {})
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /full or unavailable/)
})

test("checked persistence fails visibly on serialization and stale-owner transitions", () => {
  const storage = memoryStorage()
  let current = true
  const workspace = createOwnerLocalPersistence("owner-a", () => current, storage)
  const circular: { circular?: unknown } = {}
  circular.circular = circular
  assert.equal(workspace.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, circular).ok, false)
  assert.equal(workspace.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, undefined).ok, false)
  assert.equal(workspace.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, {
    toJSON() { current = false; return { synthetic: true } },
  }).ok, false)
  assert.equal(storage.values.size, 0)
  assert.equal(workspace.readLocalValueChecked(LOCAL_STORAGE_KEYS.draftRevisions).ok, false)
})

test("checked reads do not disclose a value when the owner changes during storage access", () => {
  let current = true
  const workspace = createOwnerLocalPersistence("owner-a", () => current, {
    getItem() { current = false; return "synthetic private draft" }, setItem() {}, removeItem() {},
  })
  const result = workspace.readLocalValueChecked(LOCAL_STORAGE_KEYS.draftRevisions)
  assert.equal(result.ok, false)
  assert.equal("value" in result, false)
})

test("checked saves reject changed baselines and require exact readback without unsafe rollback", () => {
  const storage = memoryStorage()
  const workspace = createOwnerLocalPersistence("owner-a", () => true, storage)
  workspace.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, { original: true })
  const before = [...storage.values]
  assert.equal(workspace.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, {}, { expectedRaw: null }).ok, false)
  assert.deepEqual([...storage.values], before)

  let raw: string | null = null
  let reads = 0
  const mismatched = createOwnerLocalPersistence("owner-a", () => true, {
    getItem() { reads++; return reads === 1 ? raw : "synthetic different readback" },
    setItem(_key, value) { raw = value }, removeItem() { throw new Error("Must not roll back another writer") },
  })
  const result = mismatched.writeLocalJsonChecked(LOCAL_STORAGE_KEYS.draftRevisions, { revisions: ["original", "new"] })
  assert.equal(result.ok, false)
  assert.equal(raw, '{"revisions":["original","new"]}')
})
