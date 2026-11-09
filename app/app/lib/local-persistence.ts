import {
  ACTUALS_KEY,
  BUDGET_KEY,
  COMPANY_KEY,
  CREW_KEY,
  DRAFT_REVISION_KEY,
  EMAIL_KEY,
  HISTORY_KEY,
  INVOICE_KEY,
  JOBS_KEY,
  JOB_KEY,
  JOB_TEMPLATES_KEY,
  OWNER_SYNC_TOKEN_KEY,
  PROPOSAL_SNAPSHOT_KEY,
  RATE_CARD_KEY,
} from "./constants"

export const LOCAL_STORAGE_KEYS = {
  email: EMAIL_KEY,
  company: COMPANY_KEY,
  job: JOB_KEY,
  invoices: INVOICE_KEY,
  history: HISTORY_KEY,
  budgets: BUDGET_KEY,
  actuals: ACTUALS_KEY,
  crews: CREW_KEY,
  jobs: JOBS_KEY,
  jobTemplates: JOB_TEMPLATES_KEY,
  rateCard: RATE_CARD_KEY,
  ownerSyncToken: OWNER_SYNC_TOKEN_KEY,
  draftRevisions: DRAFT_REVISION_KEY,
  proposalSnapshots: PROPOSAL_SNAPSHOT_KEY,
} as const

export type CheckedLocalResult<T> = { ok: true; value: T } | { ok: false; error: string }

export const LEGACY_LOCAL_STORAGE_KEYS = {
  email: "scopeguard_email",
  company: "scopeguard_company",
} as const

export type LocalStorageKey =
  | (typeof LOCAL_STORAGE_KEYS)[keyof typeof LOCAL_STORAGE_KEYS]
  | (typeof LEGACY_LOCAL_STORAGE_KEYS)[keyof typeof LEGACY_LOCAL_STORAGE_KEYS]

function getStorage() {
  if (typeof window === "undefined") return null
  return window.localStorage
}

export function getLocalValue(key: LocalStorageKey) {
  try {
    return getStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function setLocalValue(key: LocalStorageKey, value: string) {
  try {
    getStorage()?.setItem(key, value)
  } catch {}
}

export function removeLocalValue(key: LocalStorageKey) {
  try {
    getStorage()?.removeItem(key)
  } catch {}
}

export function readLocalJson<T>(key: LocalStorageKey, fallback: T): T {
  const raw = getLocalValue(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeLocalJson(key: LocalStorageKey, value: unknown) {
  try {
    setLocalValue(key, JSON.stringify(value))
  } catch {}
}

export function migrateLocalValue(fromKey: LocalStorageKey, toKey: LocalStorageKey) {
  const legacyValue = getLocalValue(fromKey)
  if (!legacyValue) return null

  setLocalValue(toKey, legacyValue)
  removeLocalValue(fromKey)
  return legacyValue
}

// Device records created before verified sign-in have no proven owner. Leave
// those keys untouched; never import them merely because an email was entered.
export function createOwnerLocalPersistence(
  ownerId: string,
  canAccess: () => boolean,
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null
) {
  if (!ownerId.trim()) throw new Error("A verified owner ID is required.")
  const prefix = `jobestimatepro_owner:${encodeURIComponent(ownerId)}:`
  const currentStorage = () => canAccess()
    ? (storage === undefined ? getStorage() : storage)
    : null
  const getLocalValue = (key: LocalStorageKey) => {
    try { return currentStorage()?.getItem(prefix + key) ?? null } catch { return null }
  }
  const setLocalValue = (key: LocalStorageKey, value: string) => {
    try { currentStorage()?.setItem(prefix + key, value) } catch {}
  }
  const removeLocalValue = (key: LocalStorageKey) => {
    try { currentStorage()?.removeItem(prefix + key) } catch {}
  }
  // These additive methods are for saves that must report success accurately.
  // Existing best-effort workspace persistence keeps its current behavior.
  const checkedStorage = (): CheckedLocalResult<Pick<Storage, "getItem" | "setItem" | "removeItem">> => {
    try {
      if (!canAccess()) return { ok: false, error: "The signed-in owner changed. Reopen the draft from the current workspace." }
      const selected = storage === undefined ? getStorage() : storage
      if (!selected) return { ok: false, error: "Browser storage is unavailable. The draft has not been saved." }
      return { ok: true, value: selected }
    } catch {
      return { ok: false, error: "Browser storage is unavailable. The draft has not been saved." }
    }
  }
  const readLocalValueChecked = (key: LocalStorageKey): CheckedLocalResult<string | null> => {
    const selected = checkedStorage()
    if (!selected.ok) return selected
    try {
      const value = selected.value.getItem(prefix + key)
      const current = checkedStorage()
      return current.ok ? { ok: true, value } : current
    } catch {
      return { ok: false, error: "Saved drafts could not be read from browser storage." }
    }
  }
  const writeLocalJsonChecked = (
    key: LocalStorageKey,
    value: unknown,
    options?: { expectedRaw: string | null }
  ): CheckedLocalResult<string> => {
    const initial = checkedStorage()
    if (!initial.ok) return initial
    let serialized: string
    try {
      const encoded = JSON.stringify(value)
      if (typeof encoded !== "string") return { ok: false, error: "The draft could not be serialized. It has not been saved." }
      serialized = encoded
    } catch {
      return { ok: false, error: "The draft could not be serialized. It has not been saved." }
    }
    const selected = checkedStorage()
    if (!selected.ok) return selected
    try {
      const previous = selected.value.getItem(prefix + key)
      const beforeWrite = checkedStorage()
      if (!beforeWrite.ok) return beforeWrite
      if (options && previous !== options.expectedRaw) {
        return { ok: false, error: "Saved drafts changed in another window. Reopen them before saving again." }
      }
      beforeWrite.value.setItem(prefix + key, serialized)
      const beforeReadback = checkedStorage()
      if (!beforeReadback.ok) return beforeReadback
      const persisted = beforeReadback.value.getItem(prefix + key)
      const afterReadback = checkedStorage()
      if (!afterReadback.ok) return afterReadback
      if (persisted !== serialized) {
        return { ok: false, error: "The browser did not confirm this save. The working draft remains unsaved." }
      }
      return { ok: true, value: serialized }
    } catch {
      return { ok: false, error: "The draft could not be saved to browser storage. Storage may be full or unavailable." }
    }
  }
  return {
    ownerId,
    getLocalValue,
    setLocalValue,
    removeLocalValue,
    readLocalValueChecked,
    writeLocalJsonChecked,
    readLocalJson<T>(key: LocalStorageKey, fallback: T): T {
      const raw = getLocalValue(key)
      if (!raw) return fallback
      try { return JSON.parse(raw) as T } catch { return fallback }
    },
    writeLocalJson(key: LocalStorageKey, value: unknown) {
      try { setLocalValue(key, JSON.stringify(value)) } catch {}
    },
  }
}
