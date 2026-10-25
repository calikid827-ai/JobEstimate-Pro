import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import test from "node:test"
import { runStudyStep, type StudyProvider } from "./runner"
import { InMemoryStudyStore } from "./test-support"
import { fixtureStudy, fixtureResult } from "./test-fixtures"
import type { Study } from "./types"

function prepared(allowance = true) {
  const store = new InMemoryStudyStore()
  const study = fixtureStudy()
  store.studies.set(study.id, structuredClone(study))
  store.artifacts.set("image-a", { artifact: { id: "image-a", ownerId: study.ownerId, studyId: study.id, documentVersionId: "source-a", pageId: "page-a", kind: "page-image", storageKey: "synthetic-not-a-path-authority", mime: "image/png", sha256: createHash("sha256").update(new Uint8Array([1])).digest("hex") }, bytes: new Uint8Array([1]) })
  if (allowance) store.configureAllowance(study.ownerId, { maxAttempts: 12, maxInputTokens: 2400000, maxOutputTokens: 72000 })
  return { store, study }
}
const provider = (review: StudyProvider["review"]): StudyProvider => ({ ready: async () => {}, review })
test("without separate owner allowance, creating more studies cannot enable a provider call", async () => {
  const { store, study } = prepared(false)
  let calls = 0
  const ai = provider(async () => { calls++; return fixtureResult() })
  await assert.rejects(runStudyStep(store, study.ownerId, study.id, study.revision, "one", ai), { code: "STUDY_ALLOWANCE_UNAVAILABLE" })
  await store.create(study.ownerId, "Another synthetic study")
  await assert.rejects(runStudyStep(store, study.ownerId, study.id, study.revision, "two", ai), { code: "STUDY_ALLOWANCE_UNAVAILABLE" })
  assert.equal(calls, 0)
  assert.equal(store.allowances.size, 0)
})
test("recorded steps resume after reopening and duplicate keys never repeat provider execution", async () => {
  const { store, study } = prepared()
  let calls = 0
  const ai = provider(async () => { calls++; return fixtureResult() })
  let saved = await runStudyStep(store, study.ownerId, study.id, study.revision, "page", ai)
  assert.equal(saved.documents[0].pages[0].analysis, "complete")
  assert.deepEqual(saved.attempts[0].sourceVersions, [{ documentVersionId: "source-a", sha256: "a".repeat(64) }])
  assert.equal(saved.synthesis, "pending")
  saved = await store.get(study.ownerId, study.id)
  saved = await runStudyStep(store, study.ownerId, study.id, saved.revision, "package", ai)
  assert.equal(saved.synthesis, "complete")
  saved = await runStudyStep(store, study.ownerId, study.id, saved.revision, "package", ai)
  assert.equal(calls, 2)
  assert.equal(saved.attempts.length, 2)
  assert.equal(store.allowances.get(study.ownerId)!.usedAttempts, 2)
})
test("a concurrent duplicate, interrupted request and unknown provider outcome cannot cause a second send", async () => {
  const { store, study } = prepared()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  const ai = provider(async () => { calls++; await gate; throw new Error("Synthetic uncertain outcome") })
  const first = runStudyStep(store, study.ownerId, study.id, study.revision, "one", ai)
  await new Promise((resolve) => setTimeout(resolve, 5))
  const running = await store.get(study.ownerId, study.id)
  await runStudyStep(store, study.ownerId, study.id, running.revision, "one", ai)
  await assert.rejects(runStudyStep(store, study.ownerId, study.id, running.revision, "different", ai), { code: "RECONCILIATION_REQUIRED" })
  release()
  const unknown = await first
  assert.equal(unknown.attempts[0].status, "unknown")
  assert.equal(unknown.documents[0].pages[0].analysis, "unknown")
  assert.equal(store.allowances.get(study.ownerId)!.reservedAttempts, 1)
  await assert.rejects(runStudyStep(store, study.ownerId, study.id, unknown.revision, "retry", ai), { code: "RECONCILIATION_REQUIRED" })
  assert.equal(calls, 1)
})
test("invalid citations count the attempt but never publish findings or claim substantive completion", async () => {
  const { store, study } = prepared()
  const ai = provider(async () => { const result = fixtureResult(); result.findings[0].citations[0].pageId = "invented"; return result })
  const saved = await runStudyStep(store, study.ownerId, study.id, study.revision, "bad-citation", ai)
  assert.equal(saved.findings.length, 0)
  assert.equal(saved.attempts[0].errorCode, "INVALID_CITATION")
  assert.equal(saved.attempts[0].status, "failed")
  assert.equal(store.allowances.get(study.ownerId)!.usedAttempts, 1)
})
test("a source replacement during a provider call makes late completion unknown and cannot publish stale work", async () => {
  const { store, study } = prepared()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const ai = provider(async () => { await gate; return fixtureResult() })
  const promise = runStudyStep(store, study.ownerId, study.id, study.revision, "late", ai)
  await new Promise((resolve) => setTimeout(resolve, 5))
  let current = await store.get(study.ownerId, study.id)
  current.sourceRevision++
  current.title = "Newer source context"
  current = await store.save(study.ownerId, current, current.revision)
  release()
  const saved = await promise
  assert.equal(saved.title, "Newer source context")
  assert.equal(saved.findings.length, 0)
  assert.equal(saved.attempts[0].status, "unknown")
  assert.equal(store.allowances.get(study.ownerId)!.reservedAttempts, 1)
})
test("cross-owner identifiers cannot read or reserve another owner’s study", async () => {
  const { store, study } = prepared()
  await assert.rejects(runStudyStep(store, "other-owner", study.id, study.revision, "foreign", provider(async () => fixtureResult())), { code: "STUDY_NOT_FOUND" })
  assert.equal((await store.get(study.ownerId, study.id)).attempts.length, 0)
})
test("expired worker leases retain reservations and cannot overwrite the current study", async () => {
  const { store, study } = prepared()
  const claimed = await store.claimAttempt(study.ownerId, study.id, study.revision, { idempotencyKey: "expired", kind: "page", pageId: "page-a", reservation: { inputTokens: 200000, outputTokens: 6000 } })
  const live = store.studies.get(study.id) as Study
  live.attempts[0].leaseExpiresAt = "2000-01-01"
  const saved = await store.completeAttempt(study.ownerId, study.id, claimed.attempt, { status: "complete", result: fixtureResult(), usage: fixtureResult().usage })
  assert.equal(saved.attempts[0].status, "unknown")
  assert.equal(saved.findings.length, 0)
  assert.equal(store.allowances.get(study.ownerId)!.reservedAttempts, 1)
})

test("cross-document limitations persist after reopening and are not promoted to complete coverage", async () => {
  const { store, study } = prepared()
  const ai = provider(async ({ attempt }) => ({ ...fixtureResult(), pageStatus: attempt.kind === "synthesis" ? "limited" : "complete", limitations: attempt.kind === "synthesis" ? ["Synthetic limitation: referenced detail A602 is absent."] : [] }))
  const page = await runStudyStep(store, study.ownerId, study.id, study.revision, "limited-page", ai)
  await runStudyStep(store, study.ownerId, study.id, page.revision, "limited-package", ai)
  const reopened = await store.get(study.ownerId, study.id)
  assert.equal(reopened.synthesis, "complete", "the step completed, distinct from its coverage")
  assert.equal(reopened.synthesisReviewStatus, "limited")
  assert.deepEqual(reopened.synthesisLimitations, ["Synthetic limitation: referenced detail A602 is absent."])
})

test("corrupted retained page-image bytes never reach the provider or publish findings", async () => {
  const { store, study } = prepared()
  store.artifacts.get("image-a")!.bytes = new Uint8Array([2])
  let calls = 0
  const saved = await runStudyStep(store, study.ownerId, study.id, study.revision, "corrupt-image", provider(async () => { calls++; return fixtureResult() }))
  assert.equal(calls, 0)
  assert.equal(saved.findings.length, 0)
  assert.equal(saved.attempts[0].errorCode, "STUDY_EVIDENCE_CHANGED")
  assert.equal(saved.attempts[0].status, "failed")
  assert.deepEqual(saved.attempts[0].usage, { inputTokens: 0, outputTokens: 0 }, "a known pre-provider failure must not claim unknown billable work")
  assert.equal(store.allowances.get(study.ownerId)!.reservedAttempts, 0)
})
