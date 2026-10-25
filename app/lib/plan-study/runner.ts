import { createHash } from "node:crypto"
import { activePages, StudyError, type Study, type StudyAttempt, type ReviewResult, type Reservation } from "./types"
import type { StudyStore } from "./store"
import { validateReview } from "./validation"

export interface StudyProvider {
  ready(): Promise<void>
  review(input: { study: Study; attempt: StudyAttempt; image?: Uint8Array }): Promise<ReviewResult>
}
export class ProviderOutcomeError extends Error {
  code: string
  usage?: Reservation
  constructor(code: string, usage?: Reservation) { super(code); this.code = code; this.usage = usage }
}
// A conservative reservation for this bounded packet. Attempts are separately counted by the store.
export const REVIEW_RESERVATION = { inputTokens: 200000, outputTokens: 6000 } as const
export const MAX_CONTEXT_BYTES = 120000
export function reviewContext(study: Study, attempt: Pick<StudyAttempt, "kind" | "pageId">) {
  const packet = {
    step: attempt.kind, targetPageId: attempt.pageId ?? null,
    documents: study.documents.filter((d) => d.active).map((d) => ({
      documentVersionId: d.id, name: d.name, sourceSha256: d.sha256, physicalPageCount: d.pageCount,
      pages: d.pages.map((p) => ({ pageId: p.id, physicalPage: p.pageNumber, extraction: p.extraction, rendering: p.rendering, blocks: p.blocks, analysis: p.analysis })),
    })),
    priorFindings: attempt.kind === "synthesis" ? study.findings : [],
  }
  const serialized = JSON.stringify(packet)
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONTEXT_BYTES) {
    throw new StudyError(413, "CONTEXT_LIMIT", "The complete retained text exceeds this version’s 120 KB review-context limit. Processing is incomplete; no text was silently omitted. Use a smaller package.")
  }
  return serialized
}
export async function runStudyStep(store: StudyStore, ownerId: string, studyId: string, expectedRevision: number, idempotencyKey: string, provider: StudyProvider): Promise<Study> {
  const study = await store.get(ownerId, studyId)
  if (study.revision !== expectedRevision) throw new StudyError(409, "REVISION_CHANGED", "This study changed. Reopen it before continuing.")
  const pages = activePages(study)
  if (!pages.length || pages.some((p) => !["complete", "empty"].includes(p.extraction) || p.rendering !== "complete")) {
    throw new StudyError(409, "PREPARATION_REQUIRED", "Prepare every physical page before starting substantive review. Failed pages remain incomplete.")
  }
  if (study.attempts.some((a) => a.sourceRevision === study.sourceRevision && ["running", "unknown"].includes(a.status))) {
    // The ledger, rather than browser state, prevents a second provider invocation.
    const duplicate = study.attempts.find((a) => a.idempotencyKey === idempotencyKey)
    if (duplicate) return study
    throw new StudyError(409, "RECONCILIATION_REQUIRED", "A review is running or its outcome is unknown. Its allowance remains reserved; do not retry it blindly.")
  }
  const next = pages.find((p) => p.analysis === "pending")
  if (!next && pages.some((p) => ["failed", "unknown"].includes(p.analysis))) throw new StudyError(409, "RECONCILIATION_REQUIRED", "An incomplete review requires reconciliation before continuing.")
  if (!next && study.synthesis === "complete") return study
  if (!next && ["failed", "unknown"].includes(study.synthesis)) throw new StudyError(409, "RECONCILIATION_REQUIRED", "The package review requires reconciliation before continuing.")
  const spec = { idempotencyKey, kind: next ? "page" as const : "synthesis" as const, pageId: next?.id, reservation: REVIEW_RESERVATION }
  // Check local configuration and context bounds before reserving. No provider request is made here.
  reviewContext(study, spec)
  await provider.ready()
  const claimed = await store.claimAttempt(ownerId, studyId, expectedRevision, spec)
  if (!claimed.acquired) return claimed.study
  let result: ReviewResult | undefined
  let valid: ReviewResult
  let providerInvoked = false
  try {
    if (claimed.study.sourceRevision !== claimed.attempt.sourceRevision) throw new StudyError(409, "SOURCE_CHANGED", "Sources changed before review could start.")
    const versions = claimed.study.documents.filter((d) => d.active)
    if (versions.length !== claimed.attempt.sourceVersions.length || versions.some((d) => !claimed.attempt.sourceVersions.some((v) => v.documentVersionId === d.id && v.sha256 === d.sha256))) {
      throw new StudyError(409, "SOURCE_CHANGED", "The recorded review claim does not match its immutable source versions.")
    }
    let image: Uint8Array | undefined
    if (claimed.attempt.kind === "page") {
      const page = activePages(claimed.study).find((p) => p.id === claimed.attempt.pageId)
      if (!page?.imageArtifactId) throw new StudyError(422, "STUDY_EVIDENCE_CHANGED", "The prepared page image is unavailable. No provider request was made.")
      const retained = await store.getArtifact(ownerId, studyId, page.imageArtifactId)
      const meta = retained.artifact
      if (meta.id !== page.imageArtifactId || meta.ownerId !== ownerId || meta.studyId !== studyId || meta.documentVersionId !== page.documentVersionId || meta.pageId !== page.id || meta.kind !== "page-image" || meta.mime !== "image/png" || createHash("sha256").update(retained.bytes).digest("hex") !== meta.sha256) {
        throw new StudyError(422, "STUDY_EVIDENCE_CHANGED", "The prepared page image failed its source integrity check. No provider request was made.")
      }
      image = retained.bytes
    }
    providerInvoked = true
    result = await provider.review({ study: claimed.study, attempt: claimed.attempt, image })
    valid = validateReview(claimed.study, claimed.attempt, result)
  } catch (error) {
    // Never log provider exceptions, document contents or transport headers.
    const usage = result?.usage ?? (!providerInvoked ? { inputTokens: 0, outputTokens: 0 } : error instanceof ProviderOutcomeError ? error.usage : undefined)
    const knownUsage = usage && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0
    return store.completeAttempt(ownerId, studyId, claimed.attempt, {
      status: knownUsage ? "failed" : "unknown", usage: knownUsage ? usage : undefined,
      errorCode: error instanceof StudyError ? error.code : error instanceof ProviderOutcomeError ? error.code : "PROVIDER_OUTCOME_UNKNOWN",
    })
  }
  // Do not retry an ambiguous completion write. Reopening reads the durable ledger.
  return store.completeAttempt(ownerId, studyId, claimed.attempt, { status: "complete", result: valid, usage: valid.usage })
}
