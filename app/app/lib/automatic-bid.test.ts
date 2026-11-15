import assert from "node:assert/strict"
import test from "node:test"
import type { ProjectInventory } from "../../lib/project-library/types"
import { approvePricingProfile, approveAutomaticCosts, automaticReviewFingerprint, checkProjectFreshness, confirmAutomaticQuantities, createAutomaticDraft, discoverAutomaticLocations, fetchCurrentProjectInventory, matchApprovedRate, prepareAutomaticBid, refreshAutomaticDraftSources } from "./automatic-bid"
import { calculateDraft, parseDraftRevision, workingCopy } from "./source-linked-draft"
import { assessProposalReadiness, createProposalSnapshot, defaultProposalDetails } from "./customer-proposal"
import type { DraftCommercial, DraftRevision } from "./source-linked-draft-types"

/** Authored synthetic extracted-page text, not captured AI output or injected estimate rows. */
const text = "Room: Room 101\nLength: 12 ft\nWidth: 10 ft\nWall height: 8 ft\nWall finish: paint\nCeiling finish: paint\nSubstrate: drywall\nCondition: repaint\nCoats: 2\nOpenings area: 62 sqft"
const ownerId = "synthetic-owner", projectId = "synthetic-project"
const job = { id: projectId, name: "Synthetic room painting", clientName: "Synthetic client", address: "Synthetic address" }
const commercial: DraftCommercial = { markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25 }
function profile() {
  return approvePricingProfile({ id: "synthetic-profile", ownerId, name: "Synthetic explicitly approved rates", version: 1, rules: [
    { id: "wall-rate", surface: "walls", substrate: "drywall", condition: "repaint", coats: 2, unit: "sqft", labor: 1, materials: .5, other: 0 },
    { id: "ceiling-rate", surface: "ceilings", substrate: "drywall", condition: "repaint", coats: 2, unit: "sqft", labor: .75, materials: .25, other: 0 },
  ] }, ownerId, 100)
}
function inventory(pageText = text): ProjectInventory {
  return { schemaVersion: 1, ownerId, projectId, revision: 1, files: [{ id: "synthetic-schedule", ownerId, projectId, name: "Synthetic room schedule.pdf", relativePath: "Plans/Synthetic room schedule.pdf", mimeType: "application/pdf", size: 5000, sha256: "a".repeat(64), sourceVersion: 1, active: true, status: "uploaded", preparation: "prepared", pageCount: 1, pages: [{ pageNumber: 1, text: pageText, extraction: "complete", review: "pending" }], objectKey: "synthetic/object.pdf", createdAt: "2026-11-15T00:00:00Z" }] }
}
const prepare = (source = inventory()) => prepareAutomaticBid({ ownerId, job, inventory: source, selectedFileIds: ["synthetic-schedule"], locations: ["Room 101"], profile: profile() }, 1000)

test("explicit schedule dimensions become real takeoff and matched costs without approval", async () => {
  const prepared = await prepare()
  assert.equal(prepared.candidates.length, 2)
  assert.equal(prepared.exceptions.length, 0)
  assert.deepEqual(prepared.candidates.map((candidate) => [candidate.surface, candidate.item.quantity]), [["walls", 290], ["ceilings", 120]])
  assert.match(prepared.candidates[0].equation, /2 × \(12 \+ 10\) × 8 − 62 = 290/)
  const draft = createAutomaticDraft(prepared, job, commercial)
  assert.ok(draft.items.every((item) => item.quantityConfirmation === null && item.costApproval === null && item.disposition === "unresolved"))
  assert.equal(calculateDraft(draft).partial, true)
  assert.equal(calculateDraft(draft).total, 0)
  assert.equal(prepared.coverage.textPagesChecked, 1)
  assert.ok(prepared.coverage.limitations.some((value) => value.includes("does not measure arbitrary drawings")))
})

test("separate reviewed batch quantity and cost actions use the existing deterministic calculator", async () => {
  const prepared = await prepare()
  let draft = createAutomaticDraft(prepared, job, commercial)
  const ids = prepared.candidates.map((candidate) => candidate.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  assert.equal(calculateDraft(draft).partial, true)
  assert.ok(draft.items.every((item) => item.quantityConfirmation && !item.costApproval))
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  const result = calculateDraft(draft)
  // Independent fixture arithmetic: walls290*(1+.5), ceiling120*(.75+.25).
  assert.equal(result.labor, 380)
  assert.equal(result.materials, 175)
  assert.equal(result.directCost, 555)
  assert.equal(result.subtotal, 666)
  assert.equal(result.taxAmount, 53.28)
  assert.equal(result.total, 719)
  // Existing deposit policy rounds the collection to whole dollars.
  assert.equal(result.depositDue, 180)
  assert.equal(result.remaining, 539)
  assert.equal(result.partial, false)
})

test("missing deduction, missing coats and incompatible room conditions remain actionable exceptions", async () => {
  for (const pageText of [text.replace("Openings area: 62 sqft", ""), text.replace("Coats: 2", ""), text + "\nCondition: new"]) {
    const result = await prepare(inventory(pageText))
    assert.ok(result.exceptions.length > 0)
    const draft = createAutomaticDraft(result, job, commercial)
    assert.equal(calculateDraft(draft).partial, true)
    assert.ok(draft.items.some((item) => item.disposition === "unresolved"))
  }
  assert.equal((await prepare(inventory(text.replace("Openings area: 62 sqft", "")))).candidates.some((candidate) => candidate.surface === "walls"), false)
})

test("unknown partial wall extent asks for an applicable area; explicit partial area complements room geometry", async () => {
  const unknown = await prepare(inventory(text + "\nChair rail height: 3 ft"))
  assert.equal(unknown.candidates.some((candidate) => candidate.surface === "walls"), false)
  assert.ok(unknown.exceptions.some((issue) => issue.message.includes("Wall extent")))
  const supported = await prepare(inventory(text + "\nWall extent: upper walls\nNet wall area: 170 sqft"))
  assert.equal(supported.candidates.find((candidate) => candidate.surface === "walls")?.item.quantity, 170)
  const incompatible = await prepare(inventory(text + "\nNet wall area: 170 sqft"))
  assert.equal(incompatible.candidates.some((candidate) => candidate.surface === "walls"), false)
})

test("explicit net area and paint door counts work; omitted scope and unsupported units do not invent work", async () => {
  const direct = await prepare(inventory("Room: Room 101\nNet wall area: 50 sqft\nWall finish: paint\nCeiling finish: excluded\nDoors to paint: 3\nSubstrate: drywall\nCondition: repaint\nCoats: 2"))
  assert.equal(direct.candidates.find((candidate) => candidate.surface === "walls")?.item.quantity, 50)
  assert.equal(direct.candidates.find((candidate) => candidate.surface === "doors")?.item.quantity, 3)
  assert.equal(direct.candidates.find((candidate) => candidate.surface === "doors")?.item.costs.labor, null)
  assert.ok(direct.exceptions.some((issue) => issue.message.includes("No approved doors rate")))
  const metric = await prepare(inventory(text.replace("12 ft", "12 m")))
  assert.equal(metric.candidates.length, 0)
})

test("different rooms and conditions never share quantities or incompatible pricing rules", async () => {
  const both = inventory(text + "\nRoom: Room 102\nLength: 99 ft\nWidth: 99 ft\nWall height: 10 ft\nWall finish: paint\nCeiling finish: paint\nSubstrate: plaster\nCondition: new\nCoats: 3\nOpenings area: 0 sqft")
  assert.deepEqual(discoverAutomaticLocations(both), ["Room 101", "Room 102"])
  const first = await prepare(both)
  assert.deepEqual(first.candidates.map((candidate) => candidate.item.quantity), [290, 120])
  assert.equal(matchApprovedRate(profile(), { surface: "walls", substrate: "plaster", condition: "new", coats: 3 }, ownerId).rule, null)
  assert.equal(matchApprovedRate(profile(), { surface: "walls", substrate: "drywall", condition: "repaint", coats: 1 }, ownerId).rule, null)
  assert.equal(matchApprovedRate(profile(), { surface: "walls", substrate: "drywall", condition: "repaint", coats: 2 }, "foreign-owner").rule, null)
})

test("complementary same-room records combine fields without duplicate charges; incompatible values stop affected items", async () => {
  const source = inventory(text.split("\n").slice(0, 4).join("\n"))
  source.files[0].pages.push({ pageNumber: 2, text: "Room: Room 101\n" + text.split("\n").slice(4).join("\n"), extraction: "complete", review: "pending" })
  source.files[0].pageCount = 2
  const result = await prepare(source)
  assert.deepEqual(result.candidates.map((candidate) => candidate.item.quantity), [290, 120])
  assert.equal(result.candidates[0].item.source.kind, "project")
  if (result.candidates[0].item.source.kind === "project") assert.equal(result.candidates[0].item.source.snapshot.sources.length, 2)
  source.files[0].pages[1].text += "\nLength: 50 ft"
  assert.equal((await prepare(source)).candidates.length, 0)
})

test("preparation is repeatable by exact input identity; review fingerprints reject changed rows", async () => {
  const first = await prepare(), second = await prepareAutomaticBid({ ownerId, job, inventory: inventory(), selectedFileIds: ["synthetic-schedule"], locations: ["Room 101", " room 101 "], profile: profile() }, 2000)
  assert.equal(first.id, second.id)
  const draft = createAutomaticDraft(first, job, commercial)
  const oldReview = automaticReviewFingerprint(draft)
  draft.items[0].quantity = 999
  assert.throws(() => confirmAutomaticQuantities(draft, [draft.items[0].id], oldReview, ownerId), /changed/)
  assert.throws(() => approveAutomaticCosts(draft, [draft.items[0].id], oldReview, ownerId), /changed/)
  const changed = inventory(); changed.files[0].sha256 = "b".repeat(64); changed.files[0].sourceVersion = 2
  assert.notEqual((await prepare(changed)).id, first.id)
})

test("source replacement invalidates pricing and reopening checks sources before customer export", async () => {
  const prepared = await prepare()
  let draft = createAutomaticDraft(prepared, job, commercial)
  const ids = draft.items.map((item) => item.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  const revision: DraftRevision = { schemaVersion: 1, id: "synthetic-auto-revision", draftId: draft.id, ownerId, jobId: projectId, parentRevisionId: null, savedAt: 1300, draft, calculation: calculateDraft(draft) }
  assert.ok(parseDraftRevision(revision))
  const previous = JSON.stringify(revision)
  const reopened = workingCopy(revision)
  assert.equal(assessProposalReadiness({ ownerId, jobId: projectId, revision, workingDraft: reopened }).ready, false)
  const checked = refreshAutomaticDraftSources(reopened, inventory())
  assert.equal(assessProposalReadiness({ ownerId, jobId: projectId, revision, workingDraft: checked }).ready, true)
  const replaced = inventory(); replaced.files[0].sourceVersion = 2
  const stale = refreshAutomaticDraftSources(checked, replaced)
  assert.equal(calculateDraft(stale).partial, true)
  assert.ok(stale.items.every((item) => !item.quantityConfirmation && !item.costApproval))
  assert.equal(JSON.stringify(revision), previous)
  const first = checked.items[0]
  assert.equal(first.source.kind, "project")
  if (first.source.kind === "project") {
    assert.equal(checkProjectFreshness(first.source.snapshot, null), "unavailable")
    assert.equal(checkProjectFreshness(first.source.snapshot, { ...inventory(), ownerId: "foreign" }), "changed")
  }
})

test("approved evidence/profile stays internal while the same safe proposal/PDF model receives recorded prices", async () => {
  const prepared = await prepare()
  let draft = createAutomaticDraft(prepared, job, commercial)
  const ids = draft.items.map((item) => item.id)
  draft = confirmAutomaticQuantities(draft, ids, automaticReviewFingerprint(draft), ownerId, 1100)
  draft = approveAutomaticCosts(draft, ids, automaticReviewFingerprint(draft), ownerId, 1200)
  const revision: DraftRevision = { schemaVersion: 1, id: "safe-auto-revision", draftId: draft.id, ownerId, jobId: projectId, parentRevisionId: null, savedAt: 1300, draft, calculation: calculateDraft(draft) }
  const working = { ...draft, basedOnRevisionId: revision.id }
  const details = { ...defaultProposalDetails(revision, { name: "Synthetic Contractor", address: "", phone: "", email: "", license: "" }, "2026-11-15"), reference: "SYNTHETIC-AUTO-PROPOSAL" }
  const snapshot = createProposalSnapshot({ ownerId, jobId: projectId, revision, workingDraft: working }, details, "proposal", 1400)
  assert.equal(snapshot.customer.pricing.total, 719)
  for (const marker of ["synthetic-profile", "pricingProfile", "sourceSha256", "labor", "markup", "quote", "prepared"]) assert.equal(JSON.stringify(snapshot.customer).includes(marker), false, marker)
})

test("many photos remain inventory coverage, never room counts or completed image review", async () => {
  const source = inventory()
  for (let n = 0; n < 400; n++) source.files.push({ ...source.files[0], id: `photo-${n}`, name: `Photo ${n}.jpg`, relativePath: `Photos/Photo ${n}.jpg`, mimeType: "image/jpeg", pageCount: 1, pages: [], preparation: "prepared", image: { width: 1600, height: 1200 } })
  const result = await prepare(source)
  assert.equal(result.candidates.length, 2)
  assert.equal(result.coverage.filesTotal, 401)
  assert.equal(result.coverage.unreviewedPhotos, 400)
  assert.equal(result.coverage.textPagesChecked, 1)
  assert.equal(result.coverage.pagesTotal, 1)
  assert.equal(result.coverage.records.filter((record) => record.state === "pending").length, 400)
})

test("partially prepared known PDF pages remain visible and failed preparation cannot reuse stale text", async () => {
  const partial = inventory(); partial.files[0].pageCount = 3; partial.files[0].preparation = "partial"
  const result = await prepare(partial)
  assert.equal(result.coverage.pagesTotal, 3)
  assert.equal(result.coverage.textPagesChecked, 1)
  assert.deepEqual(result.coverage.records.filter((record) => record.state === "pending").map((record) => record.pageNumber), [2, 3])
  partial.files[0].preparation = "failed"
  const failed = await prepare(partial)
  assert.equal(failed.candidates.length, 0)
  assert.equal(failed.coverage.textPagesChecked, 0)
  assert.ok(failed.coverage.records.some((record) => record.state === "failed"))
})

test("fresh server inventory detects replacement despite unchanged cached workspace data", async () => {
  const cached = inventory(), prepared = await prepare(cached)
  const server = inventory(); server.revision = 2; server.files[0].sourceVersion = 2; server.files[0].sha256 = "b".repeat(64)
  const calls: Array<{ url: string; cache: RequestCache | undefined }> = []
  const fetcher: typeof fetch = async (input, init) => { calls.push({ url: String(input), cache: init?.cache }); return Response.json({ inventory: server }) }
  const current = await fetchCurrentProjectInventory(fetcher, ownerId, projectId, () => true)
  const source = prepared.candidates[0].item.source
  assert.equal(source.kind, "project")
  if (source.kind === "project") {
    assert.equal(checkProjectFreshness(source.snapshot, cached), "current")
    assert.equal(checkProjectFreshness(source.snapshot, current), "changed")
  }
  assert.deepEqual(calls, [{ url: `/api/projects/${projectId}/files`, cache: "no-store" }])
  assert.equal(cached.files[0].sourceVersion, 1)
})

test("server freshness lookup rejects unavailable, malformed, foreign and stale-context responses", async () => {
  const denied: typeof fetch = async () => Response.json({ error: "Synthetic unavailable" }, { status: 503 })
  await assert.rejects(fetchCurrentProjectInventory(denied, ownerId, projectId, () => true), /could not be verified/)
  for (const value of [{}, { ...inventory(), ownerId: "another-owner" }, { ...inventory(), projectId: "another-project" }]) {
    const fetcher: typeof fetch = async () => Response.json({ inventory: value })
    await assert.rejects(fetchCurrentProjectInventory(fetcher, ownerId, projectId, () => true), /could not be verified/)
  }
  let current = true
  const changed: typeof fetch = async () => { current = false; return Response.json({ inventory: inventory() }) }
  await assert.rejects(fetchCurrentProjectInventory(changed, ownerId, projectId, () => current), /changed while checking/)
  await assert.rejects(fetchCurrentProjectInventory(changed, ownerId, projectId, () => false), /changed before checking/)
})
