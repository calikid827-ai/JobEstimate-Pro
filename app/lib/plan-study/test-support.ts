/** Synthetic adapters for offline tests only. No production entry point imports this file. */
import { randomUUID } from "node:crypto"
import type { Completion, StudyStore } from "./store"
import { StudyError, activePages, type Artifact, type Reservation, type Study, type StudyAttempt } from "./types"
export type TestAllowance = { maxAttempts: number; maxInputTokens: number; maxOutputTokens: number }
export class InMemoryStudyStore implements StudyStore {
  readonly studies = new Map<string, Study>()
  readonly artifacts = new Map<string, { artifact: Artifact; bytes: Uint8Array }>()
  readonly allowances = new Map<string, { limit: TestAllowance; used: Reservation; reserved: Reservation; usedAttempts: number; reservedAttempts: number }>()
  configured = true
  configureAllowance(ownerId: string, limit: TestAllowance) { this.allowances.set(ownerId, { limit, used: { inputTokens: 0, outputTokens: 0 }, reserved: { inputTokens: 0, outputTokens: 0 }, usedAttempts: 0, reservedAttempts: 0 }) }
  async ready() { if (!this.configured) throw new StudyError(503, "STUDY_NOT_CONFIGURED", "Plan Study storage and schema are not configured.") }
  private owned(ownerId: string, id: string) { const s = this.studies.get(id); if (!s || s.ownerId !== ownerId) throw new StudyError(404, "STUDY_NOT_FOUND", "The study is unavailable for this account."); return s }
  async create(ownerId: string, title: string) { await this.ready(); const now = new Date().toISOString(); const s: Study = { id: randomUUID(), ownerId, title, revision: 0, sourceRevision: 0, documents: [], findings: [], decisions: [], attempts: [], synthesis: "pending", createdAt: now, updatedAt: now }; this.studies.set(s.id, s); return structuredClone(s) }
  async list(ownerId: string) { await this.ready(); return [...this.studies.values()].filter((s) => s.ownerId === ownerId).slice(-20).reverse().map((s) => structuredClone(s)) }
  async get(ownerId: string, id: string) { await this.ready(); return structuredClone(this.owned(ownerId, id)) }
  async save(ownerId: string, study: Study, revision: number) { const s = this.owned(ownerId, study.id); if (s.revision !== revision || study.ownerId !== ownerId) throw new StudyError(409, "STUDY_CHANGED", "The study changed."); const next = structuredClone({ ...study, revision: revision + 1, attempts: s.attempts, updatedAt: new Date().toISOString() }); this.studies.set(s.id, next); return structuredClone(next) }
  async putArtifact(meta: Artifact, bytes: Uint8Array) { this.owned(meta.ownerId, meta.studyId); if (this.artifacts.has(meta.id)) throw new Error("TEST_IMMUTABLE_ARTIFACT"); this.artifacts.set(meta.id, { artifact: structuredClone(meta), bytes: bytes.slice() }) }
  async getArtifact(ownerId: string, studyId: string, id: string) { const s = this.owned(ownerId, studyId), r = this.artifacts.get(id), d = r && s.documents.find((d) => d.id === r.artifact.documentVersionId); if (!r || r.artifact.ownerId !== ownerId || r.artifact.studyId !== studyId || !d || !(r.artifact.kind === "original" && d.originalArtifactId === id || r.artifact.kind === "page-image" && d.pages.some((p) => p.imageArtifactId === id && p.id === r.artifact.pageId))) throw new StudyError(404, "STUDY_EVIDENCE_UNAVAILABLE", "Evidence unavailable."); return { artifact: structuredClone(r.artifact), bytes: r.bytes.slice() } }
  async claimAttempt(ownerId: string, studyId: string, expectedRevision: number, spec: { idempotencyKey: string; kind: "page" | "synthesis"; pageId?: string; reservation: Reservation }) {
    const s = this.owned(ownerId, studyId), prior = s.attempts.find((a) => a.idempotencyKey === spec.idempotencyKey)
    if (prior) return { study: structuredClone(s), attempt: structuredClone(prior), acquired: false }
    if (s.revision !== expectedRevision) throw new StudyError(409, "STUDY_CHANGED", "The study changed.")
    const same = s.attempts.find((a) => a.sourceRevision === s.sourceRevision && a.kind === spec.kind && a.pageId === spec.pageId)
    if (same) {
      if (same.status === "unknown" || same.status === "running" && Date.parse(same.leaseExpiresAt) <= Date.now()) throw new StudyError(409, "STUDY_RECONCILIATION_REQUIRED", "Unknown outcome requires reconciliation.")
      throw new StudyError(409, "STUDY_STEP_UNAVAILABLE", "Step already attempted.")
    }
    const pages = activePages(s)
    if (spec.kind === "page" ? !pages.some((p) => p.id === spec.pageId && p.analysis === "pending" && p.rendering === "complete" && ["complete", "empty"].includes(p.extraction)) : !pages.length || s.synthesis !== "pending" || pages.some((p) => !["complete", "limited"].includes(p.analysis))) throw new StudyError(409, "STUDY_STEP_UNAVAILABLE", "Page not prepared.")
    const a = this.allowances.get(ownerId), r = spec.reservation
    if (!a || a.usedAttempts + a.reservedAttempts + 1 > a.limit.maxAttempts || a.used.inputTokens + a.reserved.inputTokens + r.inputTokens > a.limit.maxInputTokens || a.used.outputTokens + a.reserved.outputTokens + r.outputTokens > a.limit.maxOutputTokens) throw new StudyError(403, "STUDY_ALLOWANCE_UNAVAILABLE", "Separate authoritative study allowance is unavailable.")
    a.reservedAttempts++; a.reserved.inputTokens += r.inputTokens; a.reserved.outputTokens += r.outputTokens
    const attempt: StudyAttempt = { id: randomUUID(), ownerId, studyId, sourceRevision: s.sourceRevision, sourceVersions: s.documents.filter((d) => d.active).map((d) => ({ documentVersionId: d.id, sha256: d.sha256 })), ...spec, status: "running", claimToken: randomUUID(), createdAt: new Date().toISOString(), leaseExpiresAt: new Date(Date.now() + 300000).toISOString() }
    s.attempts.push(attempt); s.revision++
    return { study: structuredClone(s), attempt: structuredClone(attempt), acquired: true }
  }
  async completeAttempt(ownerId: string, studyId: string, attempt: StudyAttempt, completion: Completion) {
    const s = this.owned(ownerId, studyId), a = s.attempts.find((a) => a.id === attempt.id)
    if (!a || a.claimToken !== attempt.claimToken) throw new StudyError(409, "STUDY_CHANGED", "Claim changed.")
    if (a.status !== "running") return structuredClone(s)
    a.status = s.sourceRevision !== attempt.sourceRevision || Date.parse(a.leaseExpiresAt) <= Date.now() ? "unknown" : completion.status
    a.errorCode = completion.errorCode
    if (a.status !== "unknown") {
      const allowance = this.allowances.get(ownerId)!, usage = completion.usage || completion.result?.usage || a.reservation
      allowance.reservedAttempts--; allowance.usedAttempts++; allowance.reserved.inputTokens -= a.reservation.inputTokens; allowance.reserved.outputTokens -= a.reservation.outputTokens; allowance.used.inputTokens += usage.inputTokens; allowance.used.outputTokens += usage.outputTokens; a.usage = usage
    }
    if (s.sourceRevision === attempt.sourceRevision) {
      if (a.kind === "page") { const page = activePages(s).find((p) => p.id === a.pageId)!; page.analysis = a.status === "complete" ? completion.result!.pageStatus : a.status; page.issue = completion.result?.limitations.join(" ") }
      else { s.synthesis = a.status; if (a.status === "complete") { s.synthesisReviewStatus = completion.result!.pageStatus; s.synthesisLimitations = [...completion.result!.limitations] } }
      if (a.status === "complete") { s.findings.push(...structuredClone(completion.result!.findings)); s.modelLabel = completion.result!.modelLabel }
    }
    s.revision++; return structuredClone(s)
  }
}
