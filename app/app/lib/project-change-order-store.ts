import { CHANGE_ORDER_DRAFT_KEY } from "./constants"
import type { createOwnerLocalPersistence } from "./local-persistence"
import type { DraftStoreLock } from "./source-linked-draft-store"
import { parseChangeOrderSnapshot } from "./project-change-order"
import type { ChangeOrderSnapshot } from "./project-change-order"

type Storage = Pick<ReturnType<typeof createOwnerLocalPersistence>, "ownerId" | "readLocalValueChecked" | "writeLocalJsonChecked">
type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const browserLock: DraftStoreLock = async (name, run) => {
  if (typeof navigator === "undefined" || !navigator.locks?.request) throw new Error("Saving a change draft requires browser storage locking. It remains unsaved.")
  return navigator.locks.request(name, { mode: "exclusive" }, run)
}

/** Separate append-only change drafts; never updates agreement, invoice or approval state. */
export function createProjectChangeOrderStore(ownerId: string, storage: Storage, current: (jobId: string) => boolean, validatePending: (snapshot: ChangeOrderSnapshot) => boolean, withLock: DraftStoreLock = browserLock) {
  const contextProblem = (jobId: string) => {
    try { return storage.ownerId === ownerId && ownerId.trim() && jobId.trim() && current(jobId) ? null : "The owner or project changed. Reopen this project's change drafts." } catch { return "The current owner and project could not be verified." }
  }
  const read = (): Result<{ raw: string | null; records: ChangeOrderSnapshot[] }> => {
    const result = storage.readLocalValueChecked(CHANGE_ORDER_DRAFT_KEY)
    if (!result.ok) return result
    if (result.value === null) return { ok: true, value: { raw: null, records: [] } }
    try {
      const value: unknown = JSON.parse(result.value)
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error()
      const raw = value as Record<string, unknown>
      if (Object.keys(raw).sort().join() !== "records,schemaVersion" || raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error()
      const records = raw.records.map(parseChangeOrderSnapshot)
      if (records.some(record => !record || record.ownerId !== ownerId) || new Set(records.map(record => record!.id)).size !== records.length) throw new Error()
      return { ok: true, value: { raw: result.value, records: records as ChangeOrderSnapshot[] } }
    } catch { return { ok: false, error: "Saved change drafts are unreadable or inconsistent. They were preserved without overwriting them." } }
  }
  return {
    list(jobId: string): Result<ChangeOrderSnapshot[]> {
      const problem = contextProblem(jobId)
      if (problem) return { ok: false, error: problem }
      const result = read()
      if (!result.ok) return result
      const afterRead = contextProblem(jobId)
      return afterRead ? { ok: false, error: afterRead } : { ok: true, value: result.value.records.filter(record => record.jobId === jobId).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)) }
    },
    async save(value: ChangeOrderSnapshot): Promise<Result<ChangeOrderSnapshot>> {
      try {
        const snapshot = parseChangeOrderSnapshot(value)
        if (!snapshot || snapshot.ownerId !== ownerId) return { ok: false, error: "The change snapshot is invalid or belongs to another owner." }
        const valid = () => !contextProblem(snapshot.jobId) && validatePending(snapshot)
        if (!valid()) return { ok: false, error: "The project, source files or change draft changed before saving. Review it again." }
        return await withLock(`jobestimatepro_owner:${encodeURIComponent(ownerId)}:${CHANGE_ORDER_DRAFT_KEY}`, async () => {
          if (!valid()) return { ok: false, error: "The owner, project or change draft changed while waiting to save." }
          const result = read()
          if (!result.ok) return result
          if (result.value.records.some(record => record.id === snapshot.id)) return { ok: false, error: "That change snapshot identity already exists. Create a new snapshot." }
          if (!valid()) return { ok: false, error: "The change draft changed before writing." }
          const written = storage.writeLocalJsonChecked(CHANGE_ORDER_DRAFT_KEY, { schemaVersion: 1, records: [...result.value.records, snapshot] }, { expectedRaw: result.value.raw })
          if (!written.ok) return written
          if (!valid()) return { ok: false, error: "The owner, project or change draft changed before the save was confirmed." }
          return { ok: true, value: snapshot }
        })
      } catch (error) { return { ok: false, error: error instanceof Error && error.message.startsWith("Saving a change draft requires") ? error.message : "The change draft could not be saved and read back. It remains unsaved." } }
    },
  }
}
