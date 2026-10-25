import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Completion, StudyStore } from "./store"
import { StudyError, type Artifact, type Reservation, type Study, type StudyAttempt } from "./types"

export const STUDY_BUCKET = "plan-study-private"
function failure(error: { message?: string } | null): never {
  const code = error?.message || ""
  if (code.includes("STUDY_ALLOWANCE_UNAVAILABLE")) throw new StudyError(403, "STUDY_ALLOWANCE_UNAVAILABLE", "Plan Study processing is unavailable until a separate authoritative study allowance is configured. Creating another study does not grant usage.")
  if (code.includes("STUDY_RECONCILIATION_REQUIRED")) throw new StudyError(409, "STUDY_RECONCILIATION_REQUIRED", "A provider outcome is unknown. Its reservation is retained; an administrator must reconcile it before this step can run again.")
  if (code.includes("STUDY_CHANGED")) throw new StudyError(409, "STUDY_CHANGED", "The study changed. Reopen it before continuing.")
  if (code.includes("STUDY_NOT_FOUND")) throw new StudyError(404, "STUDY_NOT_FOUND", "The study is unavailable for this account.")
  if (code.includes("STUDY_STEP_UNAVAILABLE")) throw new StudyError(409, "STUDY_STEP_UNAVAILABLE", "That review step is already running or complete.")
  throw new StudyError(503, "STUDY_NOT_CONFIGURED", "Plan Study private storage, schema or server permissions are unavailable. No temporary storage is substituted.")
}
/** The only production adapter. It never selects a synthetic/local implementation. */
export class SupabaseStudyStore implements StudyStore {
  private client?: SupabaseClient
  private get db() {
    if (!this.client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) failure(null)
      this.client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    }
    return this.client
  }
  async ready() {
    const result = await this.db.rpc("plan_study_ready")
    if (result.error || result.data !== 1) failure(result.error)
  }
  private async hydrate(ownerId: string, row: { id: string; owner_id: string; revision: number; source_revision: number; snapshot: Study }): Promise<Study> {
    // PostgREST row limits must not silently drop earlier recorded attempts.
    const attempts: StudyAttempt[] = []
    let total = 0
    do {
      const page = await this.db.from("plan_study_attempts").select("record", { count: "exact" }).eq("owner_id", ownerId).eq("study_id", row.id).order("created_at", { ascending: true }).order("id", { ascending: true }).range(attempts.length, attempts.length + 199)
      if (page.error) failure(page.error)
      if (page.count === null || !Number.isSafeInteger(page.count) || page.count > 5000) failure(null)
      total = page.count!
      if (attempts.length < total && !page.data?.length) failure(null)
      attempts.push(...(page.data || []).map((r) => r.record as StudyAttempt))
    } while (attempts.length < total)
    const latest = await this.db.from("plan_studies").select("revision").eq("owner_id", ownerId).eq("id", row.id).maybeSingle()
    if (latest.error) failure(latest.error)
    if (!latest.data || latest.data.revision !== row.revision) throw new StudyError(409, "STUDY_CHANGED", "The study changed while reopening. Reopen its recorded state before continuing.")
    return { ...row.snapshot, id: row.id, ownerId: row.owner_id, revision: row.revision, sourceRevision: row.source_revision, attempts }
  }
  async create(ownerId: string, title: string) {
    await this.ready()
    const now = new Date().toISOString(), id = randomUUID()
    const snapshot: Study = { id, ownerId, title, revision: 0, sourceRevision: 0, documents: [], findings: [], decisions: [], attempts: [], synthesis: "pending", createdAt: now, updatedAt: now }
    const result = await this.db.from("plan_studies").insert({ id, owner_id: ownerId, revision: 0, source_revision: 0, snapshot }).select().single()
    if (result.error) failure(result.error)
    return this.hydrate(ownerId, result.data)
  }
  async list(ownerId: string) {
    await this.ready()
    const result = await this.db.from("plan_studies").select("*").eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(20)
    if (result.error) failure(result.error)
    return Promise.all((result.data || []).map((r) => this.hydrate(ownerId, r)))
  }
  async get(ownerId: string, studyId: string) {
    await this.ready()
    const result = await this.db.from("plan_studies").select("*").eq("owner_id", ownerId).eq("id", studyId).maybeSingle()
    if (result.error) failure(result.error)
    if (!result.data) throw new StudyError(404, "STUDY_NOT_FOUND", "The study is unavailable for this account.")
    return this.hydrate(ownerId, result.data)
  }
  async save(ownerId: string, study: Study, expectedRevision: number) {
    if (study.ownerId !== ownerId) throw new StudyError(404, "STUDY_NOT_FOUND", "The study is unavailable for this account.")
    const snapshot = { ...study, attempts: [] }
    const result = await this.db.rpc("plan_study_save", { p_owner: ownerId, p_study: study.id, p_expected_revision: expectedRevision, p_snapshot: snapshot })
    if (result.error) failure(result.error)
    return this.get(ownerId, study.id)
  }
  async putArtifact(artifact: Artifact, bytes: Uint8Array) {
    // Owner and study ownership were established before any privileged object write.
    await this.get(artifact.ownerId, artifact.studyId)
    const uploaded = await this.db.storage.from(STUDY_BUCKET).upload(artifact.storageKey, bytes, { upsert: false, contentType: artifact.mime })
    if (uploaded.error) failure(uploaded.error)
    const result = await this.db.from("plan_study_artifacts").insert({ id: artifact.id, owner_id: artifact.ownerId, study_id: artifact.studyId, document_version_id: artifact.documentVersionId, record: artifact })
    if (result.error) failure(result.error)
  }
  async getArtifact(ownerId: string, studyId: string, artifactId: string) {
    const study = await this.get(ownerId, studyId)
    const result = await this.db.from("plan_study_artifacts").select("record").eq("owner_id", ownerId).eq("study_id", studyId).eq("id", artifactId).maybeSingle()
    if (result.error) failure(result.error)
    const artifact = result.data?.record as Artifact | undefined
    const doc = artifact && study.documents.find((d) => d.id === artifact.documentVersionId)
    if (!artifact || artifact.ownerId !== ownerId || artifact.studyId !== studyId || !doc || !(artifact.kind === "original" && doc.originalArtifactId === artifact.id || artifact.kind === "page-image" && doc.pages.some((p) => p.imageArtifactId === artifact.id && p.id === artifact.pageId))) throw new StudyError(404, "STUDY_EVIDENCE_UNAVAILABLE", "The retained evidence is unavailable for this account and source version.")
    const downloaded = await this.db.storage.from(STUDY_BUCKET).download(artifact.storageKey)
    if (downloaded.error || !downloaded.data) failure(downloaded.error)
    return { artifact, bytes: new Uint8Array(await downloaded.data!.arrayBuffer()) }
  }
  async claimAttempt(ownerId: string, studyId: string, expectedRevision: number, spec: { idempotencyKey: string; kind: "page" | "synthesis"; pageId?: string; reservation: Reservation }) {
    const result = await this.db.rpc("plan_study_claim", { p_owner: ownerId, p_study: studyId, p_expected_revision: expectedRevision, p_spec: spec })
    if (result.error) failure(result.error)
    if (!result.data?.study || result.data.study.ownerId !== ownerId || result.data.study.id !== studyId || result.data.acquired && result.data.study.sourceRevision !== result.data.attempt?.sourceRevision) failure(null)
    return { study: result.data.study as Study, attempt: result.data.attempt as StudyAttempt, acquired: result.data.acquired as boolean }
  }
  async completeAttempt(ownerId: string, studyId: string, attempt: StudyAttempt, completion: Completion) {
    const result = await this.db.rpc("plan_study_complete", { p_owner: ownerId, p_study: studyId, p_attempt: attempt.id, p_claim: attempt.claimToken, p_source_revision: attempt.sourceRevision, p_completion: completion })
    if (result.error) failure(result.error)
    return this.get(ownerId, studyId)
  }
}
