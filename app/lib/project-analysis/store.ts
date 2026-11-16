import type { Reservation } from "../plan-study/types"
import type { AnalysisAttempt, AnalysisResult, AnalysisSource, ProjectAnalysisRecord } from "./types"

export type AnalysisCompletion = { status: "complete" | "failed" | "unknown"; result?: AnalysisResult; resultIdentity?: string; usage?: Reservation; errorCode?: string }
export type AnalysisStore = {
  ready(): Promise<void>
  list(ownerId: string, projectId: string, cursor?: string): Promise<{ analyses: ProjectAnalysisRecord[]; nextCursor: string | null }>
  get(ownerId: string, projectId: string, id: string): Promise<ProjectAnalysisRecord>
  latest(ownerId: string, projectId: string, fingerprint: string): Promise<ProjectAnalysisRecord | null>
  claim(ownerId: string, projectId: string, spec: { fingerprint: string; sourceVersions: AnalysisSource[]; reservation: Reservation; modelLabel: string; retryFailed: boolean }): Promise<{ attempt: AnalysisAttempt; acquired: boolean }>
  complete(ownerId: string, projectId: string, attempt: AnalysisAttempt, completion: AnalysisCompletion): Promise<ProjectAnalysisRecord>
}
export function publicAnalysis(attempt: AnalysisAttempt): ProjectAnalysisRecord {
  const { claimToken, reservation, ...record } = attempt
  void claimToken; void reservation
  return record
}
