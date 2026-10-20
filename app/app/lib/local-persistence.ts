import {
  ACTUALS_KEY,
  BUDGET_KEY,
  COMPANY_KEY,
  CREW_KEY,
  EMAIL_KEY,
  HISTORY_KEY,
  INVOICE_KEY,
  JOBS_KEY,
  JOB_KEY,
  JOB_TEMPLATES_KEY,
  OWNER_SYNC_TOKEN_KEY,
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
} as const

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
  return {
    getLocalValue,
    setLocalValue,
    removeLocalValue,
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
