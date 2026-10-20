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
