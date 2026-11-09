import type { DraftCommercial, DraftRevision } from "../../../app/app/lib/source-linked-draft-types"
import type { ProposalProfile } from "../../../app/app/lib/customer-proposal-types"
import type { Job } from "../../../app/app/lib/types"
import type { Study } from "../../../app/lib/plan-study/types"
import { approveCosts, calculateDraft, confirmQuantity, createContractorItem, createDraft, createStudyItem, snapshotStudySelection, updateDraftItem } from "../../../app/app/lib/source-linked-draft"
import { replaceSyntheticDraftSource, syntheticDraftStudy } from "../source-linked-draft/browser-fixtures"

/** Authored synthetic dependencies only. No captured model output or customer data. */
export const syntheticOwners = ["synthetic-proposal-owner-a", "synthetic-proposal-owner-b"] as const
export const syntheticCommercial: DraftCommercial = {
  markupPct: 20, taxEnabled: true, taxRate: 8, depositEnabled: true, depositType: "percent", depositValue: 25,
}
export const syntheticExpected = {
  job1: { subtotal: 2100, taxAmount: 168, total: 2268, depositDue: 567, remaining: 1701 },
  job2: { subtotal: 3300, taxAmount: 264, total: 3564, depositDue: 891, remaining: 2673 },
} as const
export const legacySentinel = JSON.stringify([{ id: "synthetic-legacy-estimate", text: "INTERNAL_ONLY_LEGACY_ESTIMATE_MUST_REMAIN_UNCHANGED" }])
export const legacyInvoiceSentinel = JSON.stringify([{ id: "synthetic-legacy-invoice", text: "INTERNAL_ONLY_LEGACY_INVOICE_MUST_REMAIN_UNCHANGED" }])
export const internalMarkers = [
  "INTERNAL_ONLY_COST_SOURCE", "INTERNAL_ONLY_SCOPE_DECISION", "INTERNAL_ONLY_RAW_STUDY_ANSWER",
  "INTERNAL_ONLY_PROVIDER_FINDING", "INTERNAL_ONLY_EXCLUDED_NOTE", "INTERNAL_ONLY_PROVIDER_DIAGNOSTIC",
] as const

export function syntheticJobs(ownerId: string): Job[] {
  return [1, 2].map((number) => ({
    id: `${ownerId}-job-${number}`, createdAt: 1_800_000_000_000,
    clientName: `Synthetic customer ${number}`, jobName: `Synthetic proposal job ${number}`,
    jobAddress: `Synthetic project ${number} location - not a real address`,
  }))
}

export function syntheticProfile(ownerId: string): ProposalProfile {
  return {
    name: ownerId.endsWith("-a") ? "Synthetic North Painting Company" : "Synthetic South Painting Company",
    address: "Synthetic business location - no real address", phone: "555-0100", email: "synthetic@example.test",
    license: "SYNTHETIC-LICENSE-NOT-REAL", paymentTerms: "Synthetic contractor-entered terms: requested deposit is included in the total.",
  }
}

export function syntheticProposalStudy(ownerId: string): Study {
  const study = syntheticDraftStudy(ownerId)
  study.title = "Synthetic proposal source study"
  study.findings[1].detail = "INTERNAL_ONLY_PROVIDER_FINDING: retained source interpretation, not customer scope."
  study.findings[1].limitations.push("INTERNAL_ONLY_PROVIDER_DIAGNOSTIC: bounded synthetic source review only.")
  study.decisions[0].answer = "INTERNAL_ONLY_RAW_STUDY_ANSWER: Room 101 upper walls only; no quantity or cost authority."
  study.decisions[1].answer = "INTERNAL_ONLY_RAW_STUDY_ANSWER_OTHER: same-title Room 102 answer must never bind to Room 101."
  return study
}

/** Preserve the existing immutable-source replacement semantics, synthetic only. */
export const replaceSyntheticProposalSource = replaceSyntheticDraftSource

export function syntheticRevisions(ownerId: string): DraftRevision[] {
  return syntheticJobs(ownerId).flatMap((job, index) => {
    const number = index + 1
    const draft = createDraft(ownerId, { id: job.id, name: job.jobName, clientName: job.clientName, address: job.jobAddress }, syntheticCommercial, `${ownerId}-draft-${number}`)
    draft.title = `Synthetic estimate ${number}`
    const selection = snapshotStudySelection(syntheticProposalStudy(ownerId), `${ownerId}-synthesis-attempt:0`, [`${ownerId}-answer-room101`])
    let included = createStudyItem(selection, `Room 101 - synthetic job ${number}`, `${ownerId}-included-${number}`)
    included = updateDraftItem(included, {
      disposition: "included", description: `Synthetic approved upper-wall painting scope for project ${number}. Prepare and paint the agreed wall surfaces.`,
      scopeDecision: "INTERNAL_ONLY_SCOPE_DECISION: contractor resolved the selected responsibility question.",
      quantity: 1, unit: "lump_sum", measurementBasis: "INTERNAL_ONLY_MEASUREMENT_BASIS: explicit contractor lump sum.",
      costs: { unit: "lump_sum", labor: number === 1 ? 1000 : 2000, materials: 500, other: 250, source: "INTERNAL_ONLY_COST_SOURCE: synthetic approved company costs." },
    })
    const excluded = createContractorItem({
      id: `${ownerId}-excluded-${number}`, description: "Ceiling painting is excluded from this proposal.",
      location: `Room 101 - synthetic job ${number}`, disposition: "excluded", note: "INTERNAL_ONLY_EXCLUDED_NOTE: no customer cost allocation.",
    })
    const partialDraft = { ...draft, items: [updateDraftItem(included, { disposition: "unresolved" }), excluded] }
    const partial: DraftRevision = {
      schemaVersion: 1, id: `${ownerId}-revision-${number}-partial`, draftId: draft.id, parentRevisionId: null,
      ownerId, jobId: job.id, savedAt: 1_800_000_000_000 + number,
      draft: partialDraft, calculation: calculateDraft(partialDraft),
    }
    included = approveCosts(confirmQuantity(included, ownerId, 1_800_000_001_000), ownerId, 1_800_000_001_001)
    const readyDraft = { ...draft, basedOnRevisionId: partial.id, items: [included, excluded] }
    const calculation = calculateDraft(readyDraft)
    // Literal, independently specified totals: $1,750 or $2,750 direct cost;
    // 20% markup; 8% tax; requested 25% deposit, never added to revenue.
    const expected = number === 1 ? syntheticExpected.job1 : syntheticExpected.job2
    if (Object.entries(expected).some(([key, value]) => calculation[key as keyof typeof expected] !== value)) {
      throw new Error("Synthetic fixture pricing differs from its independently specified expected totals.")
    }
    const ready: DraftRevision = {
      schemaVersion: 1, id: `${ownerId}-revision-${number}-ready`, draftId: draft.id, parentRevisionId: partial.id,
      ownerId, jobId: job.id, savedAt: 1_800_000_002_000 + number, draft: readyDraft, calculation,
    }
    return [partial, ready]
  })
}
