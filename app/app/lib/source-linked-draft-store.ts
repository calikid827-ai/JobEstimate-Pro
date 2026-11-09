import { DRAFT_REVISION_KEY } from "./constants"
import type { createOwnerLocalPersistence } from "./local-persistence"
import { calculateDraft, parseDraft, parseDraftRevision } from "./source-linked-draft"
import type { Draft, DraftRevision } from "./source-linked-draft-types"

type DraftStorage = Pick<ReturnType<typeof createOwnerLocalPersistence>,
  "ownerId" | "readLocalValueChecked" | "writeLocalJsonChecked">
export type DraftStoreLock = <T>(name: string, run: () => T | Promise<T>) => Promise<T>
export type DraftStoreReadResult = { ok: true; revisions: DraftRevision[] } | { ok: false; error: string }
export type DraftStoreSaveResult = { ok: true; revision: DraftRevision } | { ok: false; error: string }

type StoredDrafts = { schemaVersion: 1; revisions: DraftRevision[] }
type StoreRead = { ok: true; raw: string | null; store: StoredDrafts } | { ok: false; error: string }

const browserLock: DraftStoreLock = async (name, run) => {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    throw new Error("Saving requires browser storage locking, which is unavailable here. The working draft remains unsaved.")
  }
  return navigator.locks.request(name, { mode: "exclusive" }, run)
}

// The owner-wide Web Lock serializes all jobs' read/append/write operations in
// this collection across tabs. No history cap, pruning, or record replacement.
export function createSourceLinkedDraftStore(
  ownerId: string,
  ownerStorage: DraftStorage,
  isCurrentJob: (jobId: string) => boolean,
  withLock: DraftStoreLock = browserLock
) {
  const lockName = `jobestimatepro_owner:${encodeURIComponent(ownerId)}:${DRAFT_REVISION_KEY}`
  const contextError = (jobId: string): string | null => {
    if (!ownerId.trim() || ownerStorage.ownerId !== ownerId) return "The draft store does not belong to the current owner."
    if (!jobId.trim()) return "Choose an existing job before saving or reopening a draft."
    try {
      return isCurrentJob(jobId) ? null : "The selected job changed. Reopen the draft from its own job."
    } catch {
      return "The selected job could not be verified. The working draft remains unsaved."
    }
  }
  const readStore = (): StoreRead => {
    const read = ownerStorage.readLocalValueChecked(DRAFT_REVISION_KEY)
    if (!read.ok) return read
    if (read.value === null) return { ok: true, raw: null, store: { schemaVersion: 1, revisions: [] } }
    try {
      const value: unknown = JSON.parse(read.value)
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error()
      const envelope = value as Record<string, unknown>
      if (Object.keys(envelope).sort().join() !== "revisions,schemaVersion" ||
        envelope.schemaVersion !== 1 || !Array.isArray(envelope.revisions)) throw new Error()
      const revisions: DraftRevision[] = []
      const ids = new Set<string>()
      for (const record of envelope.revisions) {
        const revision = parseDraftRevision(record)
        if (!revision || revision.ownerId !== ownerId || ids.has(revision.id)) throw new Error()
        ids.add(revision.id)
        revisions.push(revision)
      }
      const byId = new Map(revisions.map((revision) => [revision.id, revision]))
      for (const revision of revisions) {
        if (revision.parentRevisionId === null) continue
        const parent = byId.get(revision.parentRevisionId)
        if (!parent || parent.id === revision.id || parent.ownerId !== revision.ownerId ||
          parent.jobId !== revision.jobId || parent.draftId !== revision.draftId) throw new Error()
        const ancestry = new Set([revision.id])
        let ancestor: DraftRevision | undefined = parent
        while (ancestor) {
          if (ancestry.has(ancestor.id)) throw new Error()
          ancestry.add(ancestor.id)
          ancestor = ancestor.parentRevisionId === null ? undefined : byId.get(ancestor.parentRevisionId)
        }
      }
      return { ok: true, raw: read.value, store: { schemaVersion: 1, revisions } }
    } catch {
      return { ok: false, error: "Saved draft data is unreadable or inconsistent. It was preserved without overwriting it." }
    }
  }

  return {
    list(jobId: string): DraftStoreReadResult {
      const context = contextError(jobId)
      if (context) return { ok: false, error: context }
      const read = readStore()
      if (!read.ok) return read
      const afterRead = contextError(jobId)
      if (afterRead) return { ok: false, error: afterRead }
      return {
        ok: true,
        revisions: read.store.revisions.filter((revision) => revision.jobId === jobId)
          .sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id)),
      }
    },
    async save(draft: Draft, revisionId?: string, now?: number): Promise<DraftStoreSaveResult> {
      try {
        // Capture a working-copy snapshot before waiting for another tab's lock.
        const snapshot = parseDraft(JSON.parse(JSON.stringify(draft)))
        if (!snapshot || snapshot.ownerId !== ownerId) {
          return { ok: false, error: "The working draft is invalid or belongs to another owner. It has not been saved." }
        }
        const beforeLock = contextError(snapshot.job.id)
        if (beforeLock) return { ok: false, error: beforeLock }
        const id = revisionId ?? globalThis.crypto?.randomUUID?.()
        const savedAt = now ?? Date.now()
        if (typeof id !== "string" || !id.trim() || !Number.isFinite(savedAt) || savedAt < 0) {
          return { ok: false, error: "A valid new revision identity and save time are required." }
        }
        return await withLock(lockName, async () => {
          const afterLock = contextError(snapshot.job.id)
          if (afterLock) return { ok: false, error: afterLock }
          const read = readStore()
          if (!read.ok) return read
          if (read.store.revisions.some((revision) => revision.id === id)) {
            return { ok: false, error: "That revision identity already exists. Reopen it or save with a new identity." }
          }
          const parentId = snapshot.basedOnRevisionId
          if (parentId !== null) {
            const parent = read.store.revisions.find((revision) => revision.id === parentId)
            if (!parent || parent.ownerId !== ownerId || parent.jobId !== snapshot.job.id || parent.draftId !== snapshot.id) {
              return { ok: false, error: "The previous revision does not belong to this owner, job, and draft." }
            }
          } else if (read.store.revisions.some((revision) => revision.draftId === snapshot.id)) {
            return { ok: false, error: "This draft already has a saved revision. Reopen it before saving another revision." }
          }
          const revision = parseDraftRevision({
            schemaVersion: 1, id, draftId: snapshot.id, parentRevisionId: parentId,
            ownerId, jobId: snapshot.job.id, savedAt, draft: snapshot, calculation: calculateDraft(snapshot),
          })
          if (!revision) return { ok: false, error: "The draft revision could not be validated. It has not been saved." }
          const beforeWrite = contextError(snapshot.job.id)
          if (beforeWrite) return { ok: false, error: beforeWrite }
          const written = ownerStorage.writeLocalJsonChecked(DRAFT_REVISION_KEY, {
            schemaVersion: 1, revisions: [...read.store.revisions, revision],
          }, { expectedRaw: read.raw })
          if (!written.ok) return written
          const afterWrite = contextError(snapshot.job.id)
          if (afterWrite) return { ok: false, error: afterWrite }
          return { ok: true, revision }
        })
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error && error.message.startsWith("Saving requires browser storage locking")
            ? error.message : "The draft could not be serialized or saved. The working draft remains unsaved.",
        }
      }
    },
  }
}
