import type { Artifact, Reservation, ReviewResult, Study, StudyAttempt } from "./types"
export type Completion = { result?: ReviewResult; status: "complete" | "failed" | "unknown"; errorCode?: string; usage?: Reservation }
export interface StudyStore {
  ready(): Promise<void>
  create(ownerId: string, title: string): Promise<Study>
  list(ownerId: string): Promise<Study[]>
  get(ownerId: string, studyId: string): Promise<Study>
  /** CAS of non-provider edits. Must preserve attempt ledger. */
  save(ownerId: string, study: Study, expectedRevision: number): Promise<Study>
  putArtifact(artifact: Artifact, bytes: Uint8Array): Promise<void>
  getArtifact(ownerId: string, studyId: string, artifactId: string): Promise<{ artifact: Artifact; bytes: Uint8Array }>
  claimAttempt(ownerId: string, studyId: string, expectedRevision: number, spec: { idempotencyKey: string; kind: "page" | "synthesis"; pageId?: string; reservation: Reservation }): Promise<{ study: Study; attempt: StudyAttempt; acquired: boolean }>
  completeAttempt(ownerId: string, studyId: string, attempt: StudyAttempt, completion: Completion): Promise<Study>
}
