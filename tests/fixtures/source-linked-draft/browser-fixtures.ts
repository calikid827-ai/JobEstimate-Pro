import type { Study, StudyAttempt } from "../../../app/lib/plan-study/types"
import type { Job } from "../../../app/app/lib/types"
import type { DraftCommercial } from "../../../app/app/lib/source-linked-draft-types"

/** Fully authored synthetic UI data. No captured model output or customer data. */
export const syntheticOwners = ["synthetic-draft-owner-a", "synthetic-draft-owner-b"] as const
export const syntheticCommercial: DraftCommercial = {
  markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25,
}
export const legacySentinel = JSON.stringify([{ id: "synthetic-legacy-sentinel", text: "Preserve this unrelated legacy history record." }])

export function syntheticJobs(ownerId: string): Job[] {
  return [1, 2].map((number) => ({
    id: `${ownerId}-job-${number}`, createdAt: 1_800_000_000_000,
    clientName: "Synthetic QA client", jobName: `Synthetic painting job ${number}`, jobAddress: "Synthetic location — not a real customer address",
  }))
}

export function syntheticDraftStudy(ownerId: string): Study {
  const sourceId = `${ownerId}-source-v1`
  const pageId = `${ownerId}-page-v1`
  const hash = "a".repeat(64)
  const text = "Synthetic scope: prepare and paint upper walls in Room 101; lower-wall extent requires contractor clarification. Room 102 is separate work. No measured quantities or company costs are supplied."
  const cite = { documentVersionId: sourceId, pageId, sourceSha256: hash, anchor: { kind: "text" as const, blockId: "synthetic-source-block", quote: text } }
  const pageAttempt: StudyAttempt = {
    id: `${ownerId}-page-attempt`, idempotencyKey: "synthetic-request-page", studyId: `${ownerId}-study`, ownerId, sourceRevision: 1,
    sourceVersions: [{ documentVersionId: sourceId, sha256: hash }], kind: "page", pageId, status: "complete", claimToken: "synthetic-claim",
    reservation: { inputTokens: 200000, outputTokens: 6000 }, usage: { inputTokens: 100, outputTokens: 30 }, createdAt: "2026-11-09T12:00:00Z", leaseExpiresAt: "2026-11-09T12:05:00Z",
  }
  const synthesis: StudyAttempt = { ...structuredClone(pageAttempt), id: `${ownerId}-synthesis-attempt`, idempotencyKey: "synthetic-request-synthesis", kind: "synthesis" }
  delete synthesis.pageId
  const title = "Synthetic painting extent clarification"
  return {
    id: `${ownerId}-study`, ownerId, title: "Synthetic source-linked painting study", revision: 9, sourceRevision: 1,
    documents: [{ id: sourceId, name: "synthetic-bounded-painting.pdf", sha256: hash, bytes: 1000, pageCount: 1, originalArtifactId: `${ownerId}-original`, active: true,
      pages: [{ id: pageId, documentVersionId: sourceId, sourceSha256: hash, pageNumber: 1, indexing: "complete", extraction: "complete", rendering: "complete", analysis: "complete", imageArtifactId: `${ownerId}-image`, blocks: [{ id: "synthetic-source-block", text, bounds: { x: .1, y: .1, width: .8, height: .2 } }] }],
    }],
    findings: [
      { id: `${pageAttempt.id}:0`, kind: "requirement", trade: "painting", title: "Synthetic page supporting record", detail: "Authored synthetic source note; no quantity or cost approval is supplied.", citations: [cite], limitations: [] },
      { id: `${synthesis.id}:0`, kind: "question", trade: "painting", title, detail: "Confirm only the explicitly selected Room 101 upper-wall scope before measuring it. Contractor scope choice, quantity confirmation and direct-cost approval are separate actions.", citations: [cite], limitations: ["Synthetic lower-wall extent is unresolved; no takeoff or approved rate is provided."] },
      { id: `${synthesis.id}:1`, kind: "question", trade: "painting", title, detail: "This separate same-title question concerns Room 102 and must retain its own answer association.", citations: [cite], limitations: [] },
    ],
    decisions: [
      { id: `${ownerId}-answer-room101`, findingId: `${synthesis.id}:0`, findingTitle: title, answer: "Synthetic Room 101 scope choice: include upper walls only. This answer approves neither measured quantity nor direct costs.", documentVersionIds: [sourceId], sourceRevision: 1, status: "active", createdAt: "2026-11-09T12:10:00Z" },
      { id: `${ownerId}-answer-room102`, findingId: `${synthesis.id}:1`, findingTitle: title, answer: "Synthetic Room 102 answer belongs only to the other finding and must not follow title similarity.", documentVersionIds: [sourceId], sourceRevision: 1, status: "active", createdAt: "2026-11-09T12:11:00Z" },
    ],
    attempts: [pageAttempt, synthesis], synthesis: "complete", synthesisReviewStatus: "limited",
    synthesisLimitations: ["Synthetic synthesis used recorded page findings and text; it did not independently review images. Missing lower-wall extent remains unresolved."],
    modelLabel: "Authored synthetic dependencies — no provider call or real-model validation", createdAt: "2026-11-09T12:00:00Z", updatedAt: "2026-11-09T12:15:00Z",
  }
}

/** Only mutates the in-memory synthetic dependency; no upload/preparation route. */
export function replaceSyntheticDraftSource(study: Study): Study {
  const next = structuredClone(study)
  const old = next.documents.find((document) => document.active)!
  old.active = false
  const replacement = structuredClone(old)
  replacement.id = `${study.ownerId}-source-v2`
  replacement.sha256 = "b".repeat(64)
  replacement.active = true
  replacement.replacesDocumentId = old.id
  replacement.originalArtifactId = `${study.ownerId}-original-v2`
  for (const page of replacement.pages) {
    page.id += "-v2"; page.documentVersionId = replacement.id; page.sourceSha256 = replacement.sha256; page.analysis = "pending"
  }
  next.documents.push(replacement)
  next.sourceRevision++; next.revision++
  next.findings = []; next.synthesis = "pending"; delete next.synthesisReviewStatus; next.synthesisLimitations = []
  for (const decision of next.decisions) decision.status = "needs_reconfirmation"
  return next
}
