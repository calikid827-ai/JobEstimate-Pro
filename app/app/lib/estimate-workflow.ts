import type { DocumentType, EstimateHistoryItem, Job } from "./types"
import { validateGeneratedDocumentPurpose } from "../../lib/document-purpose"
import {
  completionEndFromSchedule,
  daysBetween,
  estimateSubtotalBeforeTax,
  estimateTotalWithTax,
} from "./estimate-utils"

// Only pass the contractor's selected workflow and entered job details here.
// An AI document label, changed scope, or prior estimate is not workflow intent.
export function resolveEstimateDocumentType(input: {
  documentType: string
  changeOrderNo?: string
}): DocumentType {
  return input.documentType === "Change Order" || input.changeOrderNo?.trim()
    ? "Change Order"
    : "Estimate"
}

export function normalizeGeneratedDocumentText(
  text: string,
  documentType: DocumentType
): string {
  const isChangeOrder = documentType === "Change Order"

  const normalized = text.replace(
    /^This\s+(?:Change\s+Order\s*(?:\/|or)\s*Estimate|Estimate\s*(?:\/|or)\s*Change\s+Order|Change\s+Order|Estimate)\b/i,
    isChangeOrder ? "This change order" : "This estimate"
  )
  const validation = validateGeneratedDocumentPurpose(
    normalized,
    isChangeOrder ? "Change Order" : "Estimate"
  )
  if (!validation.ok) throw new Error(validation.message)
  return normalized
}

type JobEstimateContext = {
  jobId?: string
  jobs: readonly Job[]
  history: readonly EstimateHistoryItem[]
}

function sameNumberedChangeOrder(a: EstimateHistoryItem, b: EstimateHistoryItem) {
  const number = a.jobDetails.changeOrderNo.trim()
  return (
    a.documentType === "Change Order" &&
    b.documentType === "Change Order" &&
    a.jobId === b.jobId &&
    number !== "" &&
    number === b.jobDetails.changeOrderNo.trim()
  )
}

function selectChangeOrderVersions(items: readonly EstimateHistoryItem[]) {
  const selected: EstimateHistoryItem[] = []

  for (const item of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    const index = selected.findIndex((existing) => sameNumberedChangeOrder(existing, item))
    if (index < 0) {
      // A blank number provides no operation identity; retain each snapshot.
      selected.push(item)
    } else if (selected[index].approval?.status !== "approved") {
      // Keep the first approved snapshot, otherwise the newest pending version.
      selected[index] = item
    }
  }

  return selected.sort((a, b) => a.createdAt - b.createdAt)
}

export function findOriginalEstimateForJob({
  jobId,
  jobs,
  history,
}: JobEstimateContext): EstimateHistoryItem | null {
  if (!jobId) return null

  const job = jobs.find((item) => item.id === jobId)
  const jobHistory = history
    .filter((item) => item.jobId === jobId)
    .sort((a, b) => a.createdAt - b.createdAt)

  const locked = job?.originalEstimateId
    ? jobHistory.find((item) => item.id === job.originalEstimateId)
    : null
  if (locked?.approval?.status === "approved") return locked

  const ordinaryEstimates = jobHistory.filter((item) => item.documentType === "Estimate")
  const approved = ordinaryEstimates.find((item) => item.approval?.status === "approved")
  if (approved) return approved

  // Until a contract is approved, the newest ordinary estimate is the current
  // quote. Generations remain separate approval snapshots, never additive work.
  const currentQuote = ordinaryEstimates.at(-1)
  if (currentQuote) return currentQuote

  // Preserve an explicitly linked legacy CO baseline without treating an
  // unrelated unnumbered CO as an original contract.
  if (locked?.documentType === "Change Order") {
    return selectChangeOrderVersions(jobHistory).find(
      (item) => item.id === locked.id || sameNumberedChangeOrder(item, locked)
    ) ?? locked
  }
  return locked ?? null
}

export function buildJobContractSummary(input: JobEstimateContext) {
  const originalEstimate = findOriginalEstimateForJob(input)
  const originalEstimateTotal = estimateTotalWithTax(originalEstimate)
  const originalEstimateContractValue = estimateSubtotalBeforeTax(originalEstimate)

  // Ordinary revisions are never additions. Use the approved baseline (or
  // current unapproved quote) once, then retain explicit CO amounts separately.
  const changeOrders = originalEstimate
    ? selectChangeOrderVersions(
        input.history.filter(
          (item) => item.jobId === input.jobId && item.documentType === "Change Order"
        )
      ).filter(
        (item) =>
          item.id !== originalEstimate.id &&
          !sameNumberedChangeOrder(item, originalEstimate)
      )
    : []

  const changeOrdersTotal = changeOrders.reduce(
    (sum, item) => sum + estimateTotalWithTax(item),
    0
  )
  const changeOrdersContractValue = changeOrders.reduce(
    (sum, item) => sum + estimateSubtotalBeforeTax(item),
    0
  )

  return {
    originalEstimate,
    originalEstimateTotal,
    originalEstimateContractValue,
    changeOrders,
    changeOrdersTotal,
    changeOrdersContractValue,
    currentContractValue: originalEstimateTotal + changeOrdersTotal,
    currentContractValueBeforeTax:
      originalEstimateContractValue + changeOrdersContractValue,
  }
}

export function buildChangeOrderSummary({
  current,
  jobs,
  history,
}: {
  current: EstimateHistoryItem | null
  jobs: readonly Job[]
  history: readonly EstimateHistoryItem[]
}) {
  if (!current?.jobId || current.documentType !== "Change Order") return null

  const contract = buildJobContractSummary({
    jobId: current.jobId,
    jobs,
    // Later quote revisions must not rewrite an earlier CO's comparison basis.
    history: history.filter((item) => item.createdAt <= current.createdAt),
  })
  const original = contract.originalEstimate
  if (!original) return null

  const isOriginalEstimate = current.id === original.id
  const previousContractValue = isOriginalEstimate
    ? contract.originalEstimateTotal
    : contract.originalEstimateTotal +
      contract.changeOrders
        .filter(
          (item) =>
            item.id !== current.id &&
            !sameNumberedChangeOrder(item, current) &&
            item.createdAt < current.createdAt
        )
        .reduce((sum, item) => sum + estimateTotalWithTax(item), 0)
  const currentEstimateTotal = estimateTotalWithTax(current)
  const newContractValue = isOriginalEstimate
    ? contract.originalEstimateTotal
    : previousContractValue + currentEstimateTotal

  const originalCrewDays = Number(original.schedule?.crewDays || 0)
  const currentCrewDays = Number(current.schedule?.crewDays || 0)
  const originalEnd = completionEndFromSchedule(original.schedule, original.createdAt)
  const currentEnd = completionEndFromSchedule(current.schedule, current.createdAt)

  return {
    original,
    current,
    isOriginalEstimate,
    originalEstimateTotal: contract.originalEstimateTotal,
    previousContractValue,
    currentEstimateTotal,
    newContractValue,
    costDelta: isOriginalEstimate ? 0 : currentEstimateTotal,
    originalCrewDays,
    currentCrewDays,
    crewDayDelta: currentCrewDays - originalCrewDays,
    originalEnd,
    currentEnd,
    scheduleDeltaDays: daysBetween(originalEnd, currentEnd),
  }
}
