import { PROPOSAL_SNAPSHOT_KEY } from "./constants"
import type { createOwnerLocalPersistence } from "./local-persistence"
import { parseProposalSnapshot } from "./customer-proposal"
import type { ProposalReadiness, ProposalSnapshot } from "./customer-proposal-types"
import type { DraftStoreLock } from "./source-linked-draft-store"

type ProposalStorage = Pick<ReturnType<typeof createOwnerLocalPersistence>, "ownerId" | "readLocalValueChecked" | "writeLocalJsonChecked">
type ReadResult = { ok: true; snapshots: ProposalSnapshot[] } | { ok: false; error: string }
type SaveResult = { ok: true; snapshot: ProposalSnapshot } | { ok: false; error: string }
type Collection = { schemaVersion: 1; snapshots: ProposalSnapshot[] }
type CollectionRead = { ok: true; raw: string | null; collection: Collection } | { ok: false; error: string }
const browserLock: DraftStoreLock = async (name, run) => {
  if (typeof navigator === "undefined" || !navigator.locks?.request) throw new Error("Saving a proposal requires browser storage locking. The proposal remains unsaved.")
  return navigator.locks.request(name, { mode: "exclusive" }, run)
}

/** A dedicated append-only local collection, separate from approvals and invoices. */
export function createCustomerProposalStore(
  ownerId: string,
  ownerStorage: ProposalStorage,
  isCurrentJob: (jobId: string) => boolean,
  validateCurrent: (snapshot: ProposalSnapshot) => ProposalReadiness,
  withLock: DraftStoreLock = browserLock
) {
  const lockName = `jobestimatepro_owner:${encodeURIComponent(ownerId)}:${PROPOSAL_SNAPSHOT_KEY}`
  function contextProblem(jobId: string): string | null {
    if (!ownerId.trim() || ownerStorage.ownerId !== ownerId) return "The proposal store does not belong to this owner."
    try { return jobId.trim() && isCurrentJob(jobId) ? null : "The owner or selected job changed. Reopen the proposal from its own workspace." }
    catch { return "The current proposal workspace could not be verified." }
  }
  function saveProblem(snapshot: ProposalSnapshot): string | null {
    const problem = contextProblem(snapshot.jobId)
    if (problem) return problem
    try {
      const readiness = validateCurrent(snapshot)
      return readiness.ready ? null : readiness.blockers.join(" ") || "The selected estimate revision is not ready for this proposal."
    } catch { return "The selected estimate revision could not be verified. The proposal remains unsaved." }
  }
  function readCollection(): CollectionRead {
    const read = ownerStorage.readLocalValueChecked(PROPOSAL_SNAPSHOT_KEY)
    if (!read.ok) return read
    if (read.value === null) return { ok: true, raw: null, collection: { schemaVersion: 1, snapshots: [] } }
    try {
      const value = JSON.parse(read.value) as unknown
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error()
      const raw = value as Record<string, unknown>
      if (Object.keys(raw).sort().join() !== "schemaVersion,snapshots" || raw.schemaVersion !== 1 || !Array.isArray(raw.snapshots)) throw new Error()
      const snapshots: ProposalSnapshot[] = []
      const ids = new Set<string>()
      for (const entry of raw.snapshots) {
        const snapshot = parseProposalSnapshot(entry)
        if (!snapshot || snapshot.ownerId !== ownerId || ids.has(snapshot.id)) throw new Error()
        ids.add(snapshot.id); snapshots.push(snapshot)
      }
      return { ok: true, raw: read.value, collection: { schemaVersion: 1, snapshots } }
    } catch { return { ok: false, error: "Saved proposal data is unreadable or inconsistent. It was preserved without overwriting it." } }
  }
  return {
    list(jobId: string, estimateRevisionId?: string): ReadResult {
      const problem = contextProblem(jobId)
      if (problem) return { ok: false, error: problem }
      const read = readCollection()
      if (!read.ok) return read
      const afterRead = contextProblem(jobId)
      if (afterRead) return { ok: false, error: afterRead }
      return { ok: true, snapshots: read.collection.snapshots.filter((snapshot) => snapshot.jobId === jobId && (!estimateRevisionId || snapshot.estimateRevisionId === estimateRevisionId)).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)) }
    },
    async save(value: ProposalSnapshot): Promise<SaveResult> {
      try {
        const snapshot = parseProposalSnapshot(value)
        if (!snapshot || snapshot.ownerId !== ownerId) return { ok: false, error: "The proposal snapshot is invalid or belongs to another owner. It has not been saved." }
        const beforeLock = saveProblem(snapshot)
        if (beforeLock) return { ok: false, error: beforeLock }
        return await withLock(lockName, async () => {
          const afterLock = saveProblem(snapshot)
          if (afterLock) return { ok: false, error: afterLock }
          const read = readCollection()
          if (!read.ok) return read
          if (read.collection.snapshots.some((entry) => entry.id === snapshot.id)) return { ok: false, error: "That proposal snapshot identity already exists. Create a new snapshot to preserve the earlier one." }
          const beforeWrite = saveProblem(snapshot)
          if (beforeWrite) return { ok: false, error: beforeWrite }
          const written = ownerStorage.writeLocalJsonChecked(PROPOSAL_SNAPSHOT_KEY, { schemaVersion: 1, snapshots: [...read.collection.snapshots, snapshot] }, { expectedRaw: read.raw })
          if (!written.ok) return written
          const afterWrite = saveProblem(snapshot)
          if (afterWrite) return { ok: false, error: afterWrite }
          return { ok: true, snapshot }
        })
      } catch (error) {
        return { ok: false, error: error instanceof Error && error.message.startsWith("Saving a proposal requires browser storage locking") ? error.message : "The proposal could not be serialized or saved. It remains unsaved." }
      }
    },
  }
}
