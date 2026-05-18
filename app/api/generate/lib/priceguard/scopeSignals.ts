import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"

export interface ScopeSignals {
  needsReturnVisit: boolean
  reason?: string
}

export function detectScopeSignals(scope: string): ScopeSignals {
  const facts = buildEstimatorScopeFacts(scope)
  const text = facts.includedWorkText.toLowerCase()

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
