import { AUTOMATIC_BID_KEY } from "./constants"
import type { createOwnerLocalPersistence } from "./local-persistence"
import { parseApprovedPricingProfile } from "./automatic-bid"
import type { ApprovedPricingProfile } from "./automatic-bid-types"
import type { DraftStoreLock } from "./source-linked-draft-store"

type Storage = Pick<ReturnType<typeof createOwnerLocalPersistence>, "ownerId" | "readLocalValueChecked" | "writeLocalJsonChecked">
type Listed = { ok: true; profiles: ApprovedPricingProfile[]; raw: string | null } | { ok: false; error: string }
const browserLock: DraftStoreLock = async (name, run) => {
  if (typeof navigator === "undefined" || !navigator.locks?.request) throw new Error("Pricing profile saving requires browser storage locking.")
  return navigator.locks.request(name, { mode: "exclusive" }, run)
}

/** Approved profile versions append separately from legacy Rate Card values. */
export function createAutomaticBidStore(ownerId: string, storage: Storage, isCurrent: () => boolean, withLock: DraftStoreLock = browserLock) {
  const access = () => ownerId.trim() && storage.ownerId === ownerId && isCurrent()
  function listProfiles(): Listed {
    try {
      if (!access()) return { ok: false, error: "The current owner changed. Reopen the pricing profile." }
      const read = storage.readLocalValueChecked(AUTOMATIC_BID_KEY)
      if (!read.ok) return read
      if (read.value === null) return { ok: true, profiles: [], raw: null }
      const raw: unknown = JSON.parse(read.value)
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error()
      const value = raw as Record<string, unknown>
      if (Object.keys(value).sort().join() !== "profiles,schemaVersion" || value.schemaVersion !== 1 || !Array.isArray(value.profiles)) throw new Error()
      const profiles = value.profiles.map(parseApprovedPricingProfile)
      if (profiles.some((profile) => !profile || profile.ownerId !== ownerId)) throw new Error()
      const valid = profiles as ApprovedPricingProfile[]
      const identities = valid.map((profile) => `${profile.id}:${profile.version}`)
      if (new Set(identities).size !== identities.length || !access()) throw new Error()
      return { ok: true, profiles: valid.sort((a, b) => b.approvedAt - a.approvedAt || b.version - a.version), raw: read.value }
    } catch { return { ok: false, error: "Saved pricing profiles are unreadable or inconsistent. They were preserved without overwriting them." } }
  }
  return {
    listProfiles,
    async saveProfile(input: ApprovedPricingProfile): Promise<{ ok: true; profile: ApprovedPricingProfile } | { ok: false; error: string }> {
      try {
        const profile = parseApprovedPricingProfile(input)
        if (!profile || profile.ownerId !== ownerId || !access()) return { ok: false, error: "Approve a valid pricing profile for this owner before saving." }
        return await withLock(`jobestimatepro_owner:${encodeURIComponent(ownerId)}:${AUTOMATIC_BID_KEY}`, () => {
          if (!access()) return { ok: false, error: "The owner or project changed while waiting to save." }
          const read = listProfiles()
          if (!read.ok) return read
          const versions = read.profiles.filter((entry) => entry.id === profile.id)
          const expected = versions.length ? Math.max(...versions.map((entry) => entry.version)) + 1 : 1
          if (profile.version !== expected) return { ok: false, error: "This profile version already exists or is out of date. Reopen the latest version before saving." }
          const result = storage.writeLocalJsonChecked(AUTOMATIC_BID_KEY, { schemaVersion: 1, profiles: [...read.profiles, profile] }, { expectedRaw: read.raw })
          if (!result.ok) return result
          if (!access()) return { ok: false, error: "The owner or project changed before save confirmation." }
          return { ok: true, profile }
        })
      } catch (error) { return { ok: false, error: error instanceof Error && error.message.includes("locking") ? error.message : "The profile was not confirmed saved. Check browser storage and retry." } }
    },
  }
}
