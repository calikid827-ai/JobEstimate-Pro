export interface ScopeSignals {
  needsReturnVisit: boolean
  reason?: string
}

export function detectScopeSignals(scope: string): ScopeSignals {
  const text = scope.toLowerCase()

  // keywords that typically require drying or sequencing
  const drySignals = [
    "drywall patch",
    "patch drywall",
    "mud",
    "joint compound",
    "skim coat",
    "texture repair"
  ]

  for (const word of drySignals) {
    if (text.includes(word)) {
      return {
        needsReturnVisit: true,
        reason: "Dry time required before finishing work",
      }
    }
  }

  return {
    needsReturnVisit: false,
  }
}