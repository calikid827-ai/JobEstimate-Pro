import assert from "node:assert/strict"
import test from "node:test"
import { AUTOMATIC_BID_KEY, DRAFT_REVISION_KEY, HISTORY_KEY } from "./constants"
import { createOwnerLocalPersistence } from "./local-persistence"
import { approvePricingProfile } from "./automatic-bid"
import { createAutomaticBidStore } from "./automatic-bid-store"
import type { DraftStoreLock } from "./source-linked-draft-store"

const owner = "synthetic-owner"
const lock: DraftStoreLock = async (_name, run) => run()
function memory() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } } }
function profile(version = 1) { return approvePricingProfile({ id: "profile", ownerId: owner, name: "Synthetic approved profile", version, rules: [{ id: "walls", surface: "walls", substrate: "drywall", condition: "repaint", coats: 2, unit: "sqft", labor: 1, materials: .5, other: 0 }] }, owner, 100 + version) }

test("approved versions append without changing earlier rates, estimates or legacy history", async () => {
  const raw = memory(), persistence = createOwnerLocalPersistence(owner, () => true, raw)
  persistence.setLocalValue(HISTORY_KEY, "synthetic legacy sentinel")
  persistence.setLocalValue(DRAFT_REVISION_KEY, "synthetic existing revisions")
  const store = createAutomaticBidStore(owner, persistence, () => true, lock)
  const first = profile()
  assert.equal((await store.saveProfile(first)).ok, true)
  const second = profile(2); second.rules[0].labor = 9
  assert.equal((await store.saveProfile(second)).ok, true)
  first.rules[0].labor = 99
  const listed = store.listProfiles()
  assert.ok(listed.ok)
  if (listed.ok) { assert.equal(listed.profiles.length, 2); assert.equal(listed.profiles.find((entry) => entry.version === 1)?.rules[0].labor, 1) }
  const before = persistence.getLocalValue(AUTOMATIC_BID_KEY)
  assert.equal((await store.saveProfile(second)).ok, false)
  assert.equal(persistence.getLocalValue(AUTOMATIC_BID_KEY), before)
  assert.equal(persistence.getLocalValue(HISTORY_KEY), "synthetic legacy sentinel")
  assert.equal(persistence.getLocalValue(DRAFT_REVISION_KEY), "synthetic existing revisions")
})

test("foreign owner, stale session and a queued context change fail closed", async () => {
  const raw = memory(); let current = true
  const persistence = createOwnerLocalPersistence(owner, () => current, raw)
  const foreign = createAutomaticBidStore("other-owner", persistence, () => true, lock)
  assert.equal((await foreign.saveProfile(profile())).ok, false)
  const queued = createAutomaticBidStore(owner, persistence, () => current, async (_name, run) => { current = false; return run() })
  assert.equal((await queued.saveProfile(profile())).ok, false)
  assert.equal(raw.values.size, 0)
})

test("corrupt records, storage failures and failed readback never report a saved profile", async () => {
  const raw = memory(); let fail = false
  const persistence = createOwnerLocalPersistence(owner, () => true, { ...raw, setItem(key, value) { if (fail) return; raw.setItem(key, value) } })
  const store = createAutomaticBidStore(owner, persistence, () => true, lock)
  assert.equal((await store.saveProfile(profile())).ok, true)
  const before = persistence.getLocalValue(AUTOMATIC_BID_KEY)
  fail = true
  assert.equal((await store.saveProfile(profile(2))).ok, false)
  assert.equal(persistence.getLocalValue(AUTOMATIC_BID_KEY), before)
  fail = false
  persistence.setLocalValue(AUTOMATIC_BID_KEY, "bad JSON")
  assert.equal(store.listProfiles().ok, false)
  assert.equal((await store.saveProfile(profile(2))).ok, false)
  assert.equal(persistence.getLocalValue(AUTOMATIC_BID_KEY), "bad JSON")
})

test("unapproved, ambiguous and incompatible units never become an approved pricing profile", () => {
  const input = profile()
  assert.throws(() => approvePricingProfile({ ...input, ownerId: "another-owner" }, owner), /own owner/)
  assert.throws(() => approvePricingProfile({ ...input, rules: [...input.rules, { ...input.rules[0], id: "duplicate" }] }, owner), /unambiguous/)
  assert.throws(() => approvePricingProfile({ ...input, rules: [{ ...input.rules[0], unit: "doors" }] }, owner), /valid/)
})
