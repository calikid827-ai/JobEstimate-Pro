import assert from "node:assert/strict"
import test from "node:test"
import { approvePricingProfile } from "./automatic-bid"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, createDraft } from "./source-linked-draft"
import { createOwnerLocalPersistence } from "./local-persistence"
import { createProjectChangeOrderStore } from "./project-change-order-store"
import { changeSourceProblems, createChangeOrderSnapshot, exactBaselineMatches, parseChangeOrderSnapshot, prepareChangeOrder, reviewChangeOrder, selectChangeFiles, summarizeChangeOrder, updateChangeRow, verifyCurrentChangeSources } from "./project-change-order"
import type { ChangeOrderSnapshot, ProjectChangeOrder } from "./project-change-order"
import type { DraftCommercial, DraftRevision } from "./source-linked-draft-types"
import type { ProjectInventory } from "../../lib/project-library/types"

/** Authored synthetic request/profile/source fixtures, not captured customer or model results. */
const owner = "synthetic-owner"
const job = { id: "synthetic-job", name: "Synthetic painting project", clientName: "Synthetic customer", address: "Synthetic project address" }
const commercial: DraftCommercial = { markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25 }
const profile = approvePricingProfile({ id: "synthetic-profile", ownerId: owner, name: "Synthetic approved costs", version: 1, rules: [{ id: "wall-repaint", surface: "walls", substrate: "drywall", condition: "repaint", coats: 2, unit: "sqft", labor: 2, materials: 1, other: .5 }] }, owner, 100)
const request = "Room 101 | Add paint walls 120 sqft; substrate: drywall; condition: repaint; coats: 2"
function record(text = request): ProjectChangeOrder { return prepareChangeOrder({ ownerId: owner, job, commercial, request: text, baselineRole: "none", baselineRevision: null, sourceFiles: [], pricingProfile: profile, id: "synthetic-change" }) }
function baseline(): DraftRevision {
  const draft = createDraft(owner, job, commercial, "synthetic-base-draft")
  const item = createContractorItem({ id: "base-row", location: "Room 100", description: "Paint upper walls.", quantity: 1, unit: "lump_sum", measurementBasis: "Synthetic confirmed lump sum" })
  item.costs = { unit: "lump_sum", labor: 1000, materials: 500, other: 250, source: "INTERNAL_COST_BASIS" }
  draft.items = [approveCosts(confirmQuantity(item, owner, 101), owner, 102)]
  return { schemaVersion: 1, id: "synthetic-base-revision", draftId: draft.id, parentRevisionId: null, ownerId: owner, jobId: job.id, savedAt: 103, draft, calculation: calculateDraft(draft) }
}
const inventory: ProjectInventory = { schemaVersion: 1, ownerId: owner, projectId: job.id, revision: 1, files: [{ id: "synthetic-plan", ownerId: owner, projectId: job.id, name: "plan.pdf", relativePath: "Plans/plan.pdf", mimeType: "application/pdf", size: 1000, sha256: "a".repeat(64), sourceVersion: 1, active: true, status: "uploaded", preparation: "prepared", pageCount: 1, pages: [{ pageNumber: 1, text: "Synthetic retained plan text", extraction: "complete", review: "pending" }], createdAt: "2026-11-14T00:00:00Z", objectKey: "PRIVATE_INTERNAL_OBJECT_KEY" }] }
const details = { company: { name: "Synthetic Company", address: "", phone: "", email: "", license: "" }, customerName: job.clientName, projectName: job.name, projectAddress: job.address, date: "2026-11-14", reference: "SYNTHETIC-CO-001", clarifications: "Synthetic bounded work only.", allowances: "", schedule: "", terms: "Synthetic contractor terms." }

test("pasted request becomes quantity and exact approved costs, never auto-approved", () => {
  const value = record()
  assert.equal(value.rows[0].item.quantity, 120)
  assert.equal(value.rows[0].item.unit, "sqft")
  assert.equal(value.rows[0].item.location, "Room 101")
  assert.deepEqual(value.rows[0].item.costs, { unit: "sqft", labor: 2, materials: 1, other: .5, source: "Approved pricing profile synthetic-profile, version 1, rule wall-repaint" })
  assert.equal(value.rows[0].item.quantityConfirmation, null)
  assert.equal(value.rows[0].item.costApproval, null)
  assert.equal(summarizeChangeOrder(value, null).partial, true)
  const reviewed = reviewChangeOrder(value, owner, 200)
  const summary = summarizeChangeOrder(reviewed, null)
  // Independent expectations: 120 * 3.50 = 420; 20% markup = 504; 8% tax = 40.32; whole-dollar total = 544.
  assert.equal(summary.additions.directCost, 420)
  assert.equal(summary.additions.subtotal, 504)
  assert.equal(summary.additions.taxAmount, 40.32)
  assert.equal(summary.delta, 544)
  assert.equal(summary.additions.depositDue, 0)
  assert.equal(summary.partial, false)
  assert.equal(summary.proposedContractTotal, null)
  assert.match(summary.comparison, /unverified/)
})

test("unknown dimensions, incomplete rate conditions and negated change intent remain decisions", () => {
  for (const input of ["Room 101 | Add paint walls", "Room 101 | Add paint walls 120 sqft", "Room 101 | Do not add paint walls 120 sqft; substrate: drywall; condition: repaint; coats: 2"]) {
    const value = reviewChangeOrder(record(input), owner, 200)
    assert.equal(summarizeChangeOrder(value, null).partial, true)
  }
  assert.equal(record("Room 101 | Do not add paint walls 120 sqft").rows[0].kind, "unclear")
  assert.equal(record("Room 101 | Remove existing paint from walls 120 sqft").rows[0].kind, "unclear")
  assert.equal(record("Room 101 | Already included paint walls 120 sqft?").rows[0].kind, "unclear")
  assert.equal(record("Room 101 | Add paint walls 120 sqft and ceilings 80 sqft").rows[0].item.quantity, null)
  assert.equal(record("Room 101 | Add paint walls 120 sqft; substrate: plaster; condition: repaint; coats: 2").rows[0].item.costs.labor, null)
})

test("signed, fractional, grouped, approximate and ranged quantities are not silently changed into another quantity", () => {
  for (const quantity of ["-120 sqft", "+120 sqft", "1,200 sqft", "1/2 sqft", "100–120 sqft", "100 to 120 sqft", "12 x 10 sqft", "about 120 sqft"]) {
    assert.equal(record(`Room 101 | Add paint walls ${quantity}; substrate: drywall; condition: repaint; coats: 2`).rows[0].item.quantity, null, quantity)
  }
})

test("supported changes can be confirmed while unrelated exceptions remain visibly partial", () => {
  const value = reviewChangeOrder(record(`${request}\nRoom 102 | Add paint walls, quantity not supplied`), owner, 200)
  const summary = summarizeChangeOrder(value, null)
  assert.equal(summary.additions.pricedCount, 1)
  assert.equal(summary.additions.unresolvedCount, 1)
  assert.equal(summary.delta, 544)
  assert.equal(summary.partial, true)
  assert.equal(createChangeOrderSnapshot(value, details, null, "partial-snapshot", 300).customer, null)
})

test("explicit baseline role separates unaccepted revisions, agreed changes and unavailable comparisons", () => {
  const original = baseline(), before = JSON.stringify(original)
  for (const role of ["unaccepted_bid", "agreed_scope"] as const) {
    const value = reviewChangeOrder(prepareChangeOrder({ ownerId: owner, job, commercial, request, baselineRole: role, baselineRevision: original, sourceFiles: [], pricingProfile: profile }), owner, 200)
    const summary = summarizeChangeOrder(value, null)
    assert.equal(summary.proposedContractTotal, role === "agreed_scope" ? 2812 : null)
    assert.equal(Boolean(summary.safeExportLimitation), role === "unaccepted_bid")
  }
  assert.equal(JSON.stringify(original), before)
  assert.throws(() => prepareChangeOrder({ ownerId: owner, job, commercial, request, baselineRole: "agreed_scope", baselineRevision: null, sourceFiles: [] }))
  assert.throws(() => prepareChangeOrder({ ownerId: owner, job: { ...job, id: "another-job" }, commercial, request, baselineRole: "agreed_scope", baselineRevision: original, sourceFiles: [] }))
})

test("deductions and credits use shared arithmetic with explicit negative delta and blocked unsupported customer export", () => {
  const value = reviewChangeOrder(record(request.replace("Add paint", "Deduct paint")), owner, 200)
  const summary = summarizeChangeOrder(value, null)
  assert.equal(summary.delta, -544)
  assert.equal(summary.partial, false)
  assert.match(summary.safeExportLimitation!, /Deductive and mixed/)
  assert.equal(createChangeOrderSnapshot(value, details, null, "deductive", 300).customer, null)
  const mixed = reviewChangeOrder(record(`${request}\nRoom 102 | Credit paint walls 60 sqft; substrate: drywall; condition: repaint; coats: 2`), owner, 200)
  assert.equal(summarizeChangeOrder(mixed, null).delta, 272)
  assert.equal(createChangeOrderSnapshot(mixed, details, null, "mixed", 300).customer, null)
})

test("a partial estimate cannot be represented as a complete agreed contract baseline", () => {
  const partial = baseline()
  partial.draft.items[0].costApproval = null
  partial.calculation = calculateDraft(partial.draft)
  const value = reviewChangeOrder(prepareChangeOrder({ ownerId: owner, job, commercial, request, baselineRole: "agreed_scope", baselineRevision: partial, sourceFiles: [], pricingProfile: profile }), owner, 200)
  const summary = summarizeChangeOrder(value, null)
  assert.equal(summary.partial, true)
  assert.equal(summary.proposedContractTotal, null)
  assert.match(summary.blockers.join(" "), /partial estimate/)
  assert.equal(createChangeOrderSnapshot(value, details, null, "partial-baseline", 300).customer, null)
})

test("already-included work does not become a new charge and exact baseline matches do not infer acceptance", () => {
  const value = record("Room 100 | Already included paint upper walls")
  assert.equal(value.rows[0].item.disposition, "excluded")
  assert.equal(summarizeChangeOrder(value, null).delta, 0)
  const original = baseline()
  const matching = prepareChangeOrder({ ownerId: owner, job, commercial, request: "Room 100 | Paint upper walls.", baselineRole: "unaccepted_bid", baselineRevision: original, sourceFiles: [] })
  assert.deepEqual(exactBaselineMatches(matching, matching.rows[0]), ["base-row"])
  assert.equal(matching.rows[0].kind, "unclear")
})

test("same project files are retained by exact version and source replacement invalidates readiness", () => {
  const selected = selectChangeFiles(inventory, owner, job.id, ["synthetic-plan"])
  assert.deepEqual(selected, [{ id: "synthetic-plan", name: "plan.pdf", relativePath: "Plans/plan.pdf", sha256: "a".repeat(64), sourceVersion: 1 }])
  const value = { ...reviewChangeOrder(record(), owner, 200), sourceFiles: selected }
  assert.deepEqual(changeSourceProblems(value, inventory), [])
  assert.ok(changeSourceProblems(value, { ...inventory, files: [{ ...inventory.files[0], active: false }] }).length)
  assert.ok(changeSourceProblems(value, { ...inventory, files: [{ ...inventory.files[0], sha256: "b".repeat(64) }] }).length)
  assert.throws(() => selectChangeFiles(inventory, "another-owner", job.id, ["synthetic-plan"]))
  assert.throws(() => selectChangeFiles(inventory, owner, "another-project", ["synthetic-plan"]))
})

test("fresh server source checks reject replacement without relying on a stale loaded library", async () => {
  const linked = { ...record(), sourceFiles: selectChangeFiles(inventory, owner, job.id, ["synthetic-plan"]) }
  const calls: Array<{ url: string; cache: RequestCache | undefined }> = []
  // Version-only checks use the paginated metadata contract, never prepared text.
  const metadata = { ...inventory, files: inventory.files.map(file => ({ ...file, pages: [] })) }
  const good = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(input), cache: init?.cache }); return Response.json({ inventory: metadata, totalFiles: metadata.files.length, nextCursor: null }) }) as typeof fetch
  assert.equal((await verifyCurrentChangeSources(linked, good, () => true))!.revision, 1)
  assert.deepEqual(calls, [{ url: "/api/projects/synthetic-job/files", cache: "no-store" }])
  const replaced = (async () => Response.json({ inventory: { ...metadata, revision: 2, files: [{ ...metadata.files[0], active: false }] }, totalFiles: metadata.files.length, nextCursor: null })) as typeof fetch
  assert.deepEqual(changeSourceProblems(linked, inventory), [])
  await assert.rejects(verifyCurrentChangeSources(linked, replaced, () => true), /replaced/)
  await assert.rejects(verifyCurrentChangeSources(linked, (async () => Response.json({ error: "unavailable" }, { status: 503 })) as typeof fetch, () => true))
  await assert.rejects(verifyCurrentChangeSources(linked, good, () => false), /owner or project changed/)
  await assert.rejects(verifyCurrentChangeSources(linked, undefined, () => true), /owner-scoped/)
  let requests = 0
  assert.equal(await verifyCurrentChangeSources(record(), (async () => { requests++; throw Error("Not expected") }) as typeof fetch, () => true), null)
  assert.equal(requests, 0)
})

test("customer-safe additive snapshots omit internal pricing, source and agreement records", () => {
  const original = baseline()
  const value = reviewChangeOrder(prepareChangeOrder({ ownerId: owner, job, commercial, request, baselineRole: "agreed_scope", baselineRevision: original, sourceFiles: selectChangeFiles(inventory, owner, job.id, ["synthetic-plan"]), pricingProfile: profile }), owner, 200)
  const snapshot = createChangeOrderSnapshot(value, details, inventory, "safe-additive", 300)
  assert.ok(snapshot.customer)
  assert.equal(snapshot.customer.pricing.total, 544)
  assert.equal(snapshot.customer.pricing.depositDue, 0)
  for (const privateValue of ["ownerId", "synthetic-base-revision", "PRIVATE_INTERNAL_OBJECT_KEY", "INTERNAL_COST_BASIS", "markupPct", "quantityConfirmation", "sourceVersion", "a".repeat(64)]) assert.equal(JSON.stringify(snapshot.customer).includes(privateValue), false, privateValue)
  assert.ok(parseChangeOrderSnapshot(snapshot))
  const tampered = structuredClone(snapshot); tampered.customer!.pricing.total++; tampered.customer!.pricing.remaining++; tampered.customer!.pricing.roundingAdjustment++
  assert.equal(parseChangeOrderSnapshot(tampered), null)
  const edited = updateChangeRow(value, value.rows[0].item.id, { item: { quantity: 121 } })
  assert.equal(edited.reviewedBy, null)
  assert.equal(edited.rows[0].item.quantityConfirmation, null)
  assert.equal(snapshot.draft.rows[0].item.quantity, 120)
})

function memory() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } } }
function saved(id = "snapshot-1"): ChangeOrderSnapshot { return createChangeOrderSnapshot(reviewChangeOrder(record(), owner, 200), details, null, id, 300) }

test("checked change snapshots append and reopen without changing estimate or legacy records", async () => {
  const data = memory(), storage = createOwnerLocalPersistence(owner, () => true, data)
  data.values.set("synthetic-legacy", "unchanged")
  const store = createProjectChangeOrderStore(owner, storage, project => project === job.id, () => true, async (_name, run) => run())
  assert.equal((await store.save(saved())).ok, true)
  assert.equal((await store.save(saved("snapshot-2"))).ok, true)
  assert.equal((await store.save(saved())).ok, false)
  const list = store.list(job.id); assert.ok(list.ok)
  if (list.ok) assert.equal(list.value.length, 2)
  assert.equal(data.values.get("synthetic-legacy"), "unchanged")
  assert.equal(store.list("another-job").ok, false)
})

test("queued owner/project changes and save/readback failures never report a saved change", async () => {
  const data = memory()
  let current = true
  const storage = createOwnerLocalPersistence(owner, () => current, data)
  const stale = createProjectChangeOrderStore(owner, storage, () => current, () => true, async (_name, run) => { current = false; return run() })
  assert.equal((await stale.save(saved())).ok, false)
  assert.equal(data.values.size, 0)
  current = true
  for (const fail of ["quota", "readback"]) {
    const persistence = createOwnerLocalPersistence(owner, () => true, { ...data, setItem() { if (fail === "quota") throw Error("Synthetic quota") } })
    const store = createProjectChangeOrderStore(owner, persistence, () => true, () => true, async (_name, run) => run())
    assert.equal((await store.save(saved())).ok, false)
  }
})
