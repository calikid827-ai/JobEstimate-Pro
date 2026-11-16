import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { ANALYSIS_LIMITS, ProjectAnalysisError, type AnalysisAttempt, type ProjectAnalysisRecord } from "./types"
import { parseProjectAnalysisRecord } from "./validation"
import type { AnalysisCompletion, AnalysisStore } from "./store"
import { projectAnalysisResultIdentity } from "./identity"

function failure(error?: { message?: string } | null): never {
  const code = error?.message ?? ""
  if (code.includes("ANALYSIS_ALLOWANCE_UNAVAILABLE")) throw new ProjectAnalysisError(403, "ANALYSIS_ALLOWANCE_UNAVAILABLE", "AI package review is unavailable under the existing owner-level study allowance. No allowance was created or increased and no provider request was made.")
  if (code.includes("ANALYSIS_RECONCILIATION_REQUIRED") || code.includes("STUDY_RECONCILIATION_REQUIRED")) throw new ProjectAnalysisError(409, "ANALYSIS_RECONCILIATION_REQUIRED", "A provider attempt is running or its outcome is unknown. Its reservation remains held; reopen the record rather than retrying blindly.")
  if (code.includes("ANALYSIS_RETRY_LIMIT")) throw new ProjectAnalysisError(409, "ANALYSIS_RETRY_LIMIT", "This exact source batch has reached its two-attempt retry bound. Earlier results remain retained.")
  if (code.includes("ANALYSIS_SOURCE_CHANGED")) throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "A selected source version changed before analysis could be saved. Refresh the project files; historical findings remain retained.")
  if (code.includes("ANALYSIS_NOT_FOUND")) throw new ProjectAnalysisError(404, "ANALYSIS_NOT_FOUND", "This analysis is unavailable for this owner and project.")
  throw new ProjectAnalysisError(503, "ANALYSIS_NOT_CONFIGURED", "AI package review needs its reviewed attempt-ledger functions, private project library and existing owner allowance. No local/synthetic fallback was selected.")
}
function cursorValue(cursor?: string) {
  if (cursor === undefined) return null
  if (!/^[1-9]\d{0,14}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) throw new ProjectAnalysisError(400, "ANALYSIS_CURSOR_INVALID", "Use the recorded analysis-history cursor.")
  return Number(cursor)
}
/** Production-only durable ledger; it cannot create/replenish an allowance. */
export class SupabaseProjectAnalysisStore implements AnalysisStore {
  private client?: SupabaseClient
  constructor(deps: { client?: SupabaseClient } = {}) { this.client = deps.client }
  private get db() {
    if (!this.client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) failure()
      this.client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    }
    return this.client
  }
  private record(raw: unknown, ownerId: string, projectId: string): ProjectAnalysisRecord {
    const record = parseProjectAnalysisRecord(raw)
    if (!record || record.ownerId !== ownerId || record.projectId !== projectId) failure()
    if (record.status === "complete" && projectAnalysisResultIdentity(record, record.result!) !== record.resultIdentity) failure()
    return record
  }
  async ready() { const response = await this.db.rpc("project_analysis_ready"); if (response.error || response.data !== 1) failure(response.error) }
  async list(ownerId: string, projectId: string, cursor?: string) {
    const before = cursorValue(cursor)
    let query = this.db.from("project_analysis_attempts").select("record,sequence_no").eq("owner_id", ownerId).eq("project_id", projectId).order("sequence_no", { ascending: false }).limit(ANALYSIS_LIMITS.recordsPerPage)
    if (before !== null) query = query.lt("sequence_no", before)
    const response = await query
    if (response.error || !Array.isArray(response.data)) failure(response.error)
    const analyses = response.data!.map(row => this.record(row.record, ownerId, projectId))
    const last = response.data!.at(-1)?.sequence_no
    if (last !== undefined && (!Number.isSafeInteger(Number(last)) || Number(last) <= 0)) failure()
    return { analyses, nextCursor: analyses.length === ANALYSIS_LIMITS.recordsPerPage ? String(last) : null }
  }
  async get(ownerId: string, projectId: string, id: string) {
    const response = await this.db.from("project_analysis_attempts").select("record").eq("owner_id", ownerId).eq("project_id", projectId).eq("id", id).maybeSingle()
    if (response.error) failure(response.error)
    if (!response.data) throw new ProjectAnalysisError(404, "ANALYSIS_NOT_FOUND", "This analysis is unavailable for this owner and project.")
    const record = this.record(response.data.record, ownerId, projectId)
    if (record.id !== id) failure()
    return record
  }
  async latest(ownerId: string, projectId: string, fingerprint: string) {
    const response = await this.db.from("project_analysis_attempts").select("record").eq("owner_id", ownerId).eq("project_id", projectId).eq("fingerprint", fingerprint).order("attempt_number", { ascending: false }).limit(1).maybeSingle()
    if (response.error) failure(response.error)
    const record = response.data ? this.record(response.data.record, ownerId, projectId) : null
    if (record && record.fingerprint !== fingerprint) failure()
    return record
  }
  async claim(ownerId: string, projectId: string, spec: Parameters<AnalysisStore["claim"]>[2]) {
    const response = await this.db.rpc("project_analysis_claim", { p_owner: ownerId, p_project: projectId, p_spec: spec })
    if (response.error) failure(response.error)
    const data = response.data
    if (!data || typeof data.acquired !== "boolean" || typeof data.claimToken !== "string" || !data.claimToken || data.reservation?.inputTokens !== ANALYSIS_LIMITS.reservationInputTokens || data.reservation?.outputTokens !== ANALYSIS_LIMITS.outputTokens) failure()
    const record = this.record(data.record, ownerId, projectId)
    if (record.fingerprint !== spec.fingerprint || data.acquired && record.status !== "running") failure()
    return { acquired: data.acquired as boolean, attempt: { ...record, claimToken: data.claimToken as string, reservation: data.reservation } as AnalysisAttempt }
  }
  async complete(ownerId: string, projectId: string, attempt: AnalysisAttempt, completion: AnalysisCompletion) {
    const response = await this.db.rpc("project_analysis_complete", { p_owner: ownerId, p_project: projectId, p_attempt: attempt.id, p_claim: attempt.claimToken, p_completion: completion })
    if (response.error) failure(response.error)
    return this.get(ownerId, projectId, attempt.id)
  }
}
