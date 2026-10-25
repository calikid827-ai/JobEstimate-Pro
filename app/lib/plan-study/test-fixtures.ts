/* Authored synthetic fixtures for offline tests only. No production adapter imports this file. */
import type { Study, StudyAttempt, ReviewResult } from "./types"
const hash = "a".repeat(64)
export const fixtureStudy = (): Study => ({
  id: "study-a", ownerId: "owner-a", title: "Authored synthetic package", revision: 4, sourceRevision: 1,
  createdAt: "2026-10-24", updatedAt: "2026-10-24", synthesis: "pending", attempts: [], decisions: [], findings: [],
  documents: [{ id: "source-a", name: "Synthetic schedule.pdf", sha256: hash, pageCount: 1, bytes: 100, originalArtifactId: "original-a", active: true,
    pages: [{ id: "page-a", documentVersionId: "source-a", pageNumber: 1, sourceSha256: hash, indexing: "complete", extraction: "complete", rendering: "complete", analysis: "pending", imageArtifactId: "image-a", blocks: [{ id: "block-a", text: "PT-1: two coats on prepared gypsum walls.", bounds: { x: .1, y: .1, width: .7, height: .1 } }] }] }],
})
export const fixtureAttempt = (): StudyAttempt => ({ id: "attempt-a", idempotencyKey: "request-a", studyId: "study-a", ownerId: "owner-a", sourceRevision: 1, sourceVersions: [{ documentVersionId: "source-a", sha256: hash }], kind: "page", pageId: "page-a", status: "running", claimToken: "lease-a", reservation: { inputTokens: 200000, outputTokens: 6000 }, createdAt: "2026-10-24", leaseExpiresAt: "2026-10-24T23:59:59Z" })
export const fixtureResult = (): ReviewResult => ({
  modelLabel: "Synthetic reviewer response — not model accuracy evidence", usage: { inputTokens: 100, outputTokens: 30 }, pageStatus: "complete", limitations: [],
  findings: [{ id: "model-untrusted-id", kind: "requirement", trade: "painting", title: "Wall finish", detail: "PT-1 calls for two coats.", citations: [{ documentVersionId: "source-a", pageId: "page-a", sourceSha256: hash, anchor: { kind: "text", blockId: "block-a", quote: "two coats" } }], limitations: [] }],
})
