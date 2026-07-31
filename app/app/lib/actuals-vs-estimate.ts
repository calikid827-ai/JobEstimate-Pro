import type { EstimateHistoryItem, Job, JobActuals } from "./types"

export type RecordedCostCategory = "labor" | "materials" | "subs_other"

export type RecordedCostComparisonStatus =
  | "not_recorded"
  | "over_estimate"
  | "under_estimate"
  | "on_estimate"
  | "unplanned_cost"

export type RecordedCostComparisonStatusLabel =
  | "Not recorded"
  | "Over estimate"
  | "Under estimate"
  | "On estimate"
  | "Unplanned recorded cost"

export type RecordedCostComparisonRow = {
  key: RecordedCostCategory
  label: string
  estimatedCost: number
  recordedCost: number | null
  differenceToDate: number | null
  differencePercent: number | null
  status: RecordedCostComparisonStatus
  statusLabel: RecordedCostComparisonStatusLabel
}

export type ActualsVsEstimateFeedbackState =
  | "no_linked_estimate"
  | "no_recorded_costs"
  | "partial_recorded_costs"
  | "supported_costs_recorded"

export type ActualsVsEstimateFeedback = {
  state: ActualsVsEstimateFeedbackState
  estimateId: string | null
  estimateBasisLabel: "Original saved estimate" | null
  columnLabels: {
    estimatedCost: "Estimated cost"
    recordedCost: "Recorded cost to date"
    differenceToDate: "Difference to date"
  }
  rows: RecordedCostComparisonRow[]
  recordedCategoryCount: number
  missingCategories: RecordedCostCategory[]
  referenceOnly: true
  profitAvailable: false
  completionAvailable: false
}

export type BuildActualsVsEstimateFeedbackInput = {
  job?: Pick<Job, "id" | "originalEstimateId"> | null
  estimates: readonly EstimateHistoryItem[]
  actuals?: JobActuals | null
}

type CategoryDefinition = {
  key: RecordedCostCategory
  label: string
  estimateKey: "labor" | "materials" | "subs"
  actualsKey: "labor" | "materials" | "subs"
}

const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    key: "labor",
    label: "Labor",
    estimateKey: "labor",
    actualsKey: "labor",
  },
  {
    key: "materials",
    label: "Materials",
    estimateKey: "materials",
    actualsKey: "materials",
  },
  {
    key: "subs_other",
    label: "Subs / other",
    estimateKey: "subs",
    actualsKey: "subs",
  },
]

function buildColumnLabels() {
  return {
    estimatedCost: "Estimated cost",
    recordedCost: "Recorded cost to date",
    differenceToDate: "Difference to date",
  } as const
}

const STATUS_LABELS: Record<
  RecordedCostComparisonStatus,
  RecordedCostComparisonStatusLabel
> = {
  not_recorded: "Not recorded",
  over_estimate: "Over estimate",
  under_estimate: "Under estimate",
  on_estimate: "On estimate",
  unplanned_cost: "Unplanned recorded cost",
}

function roundDecimal(value: number, digits: number) {
  const factor = 10 ** digits
  const roundedMagnitude =
    Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor
  const rounded = value < 0 ? -roundedMagnitude : roundedMagnitude
  return Object.is(rounded, -0) ? 0 : rounded
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeEstimatedCost(value: unknown) {
  const parsed = finiteNumber(value)
  if (parsed == null || parsed < 0) return 0
  return roundDecimal(parsed, 2)
}

function normalizeRecordedCost(value: unknown) {
  const parsed = finiteNumber(value)
  if (parsed == null || parsed <= 0) return null
  const rounded = roundDecimal(parsed, 2)
  return rounded > 0 ? rounded : null
}

function noLinkedEstimateFeedback(): ActualsVsEstimateFeedback {
  return {
    state: "no_linked_estimate",
    estimateId: null,
    estimateBasisLabel: null,
    columnLabels: buildColumnLabels(),
    rows: [],
    recordedCategoryCount: 0,
    missingCategories: [],
    referenceOnly: true,
    profitAvailable: false,
    completionAvailable: false,
  }
}

function buildRow(
  definition: CategoryDefinition,
  estimate: EstimateHistoryItem,
  actuals: JobActuals | null
): RecordedCostComparisonRow {
  const estimatedCost = normalizeEstimatedCost(
    estimate.pricing?.[definition.estimateKey]
  )
  const recordedCost = normalizeRecordedCost(
    actuals?.[definition.actualsKey]
  )

  if (recordedCost == null) {
    return {
      key: definition.key,
      label: definition.label,
      estimatedCost,
      recordedCost: null,
      differenceToDate: null,
      differencePercent: null,
      status: "not_recorded",
      statusLabel: STATUS_LABELS.not_recorded,
    }
  }

  const differenceToDate = roundDecimal(recordedCost - estimatedCost, 2)

  if (estimatedCost === 0) {
    return {
      key: definition.key,
      label: definition.label,
      estimatedCost,
      recordedCost,
      differenceToDate,
      differencePercent: null,
      status: "unplanned_cost",
      statusLabel: STATUS_LABELS.unplanned_cost,
    }
  }

  const status: RecordedCostComparisonStatus =
    differenceToDate > 0
      ? "over_estimate"
      : differenceToDate < 0
        ? "under_estimate"
        : "on_estimate"

  return {
    key: definition.key,
    label: definition.label,
    estimatedCost,
    recordedCost,
    differenceToDate,
    differencePercent: roundDecimal(
      ((recordedCost - estimatedCost) / estimatedCost) * 100,
      1
    ),
    status,
    statusLabel: STATUS_LABELS[status],
  }
}

export function buildActualsVsEstimateFeedback({
  job,
  estimates,
  actuals,
}: BuildActualsVsEstimateFeedbackInput): ActualsVsEstimateFeedback {
  if (!job) return noLinkedEstimateFeedback()

  const originalEstimateId = job.originalEstimateId
  if (
    typeof originalEstimateId !== "string" ||
    !originalEstimateId.trim()
  ) {
    return noLinkedEstimateFeedback()
  }

  const estimate = estimates.find((item) => item.id === originalEstimateId)
  if (!estimate) return noLinkedEstimateFeedback()

  const linkedActuals = actuals?.jobId === job.id ? actuals : null
  const rows = CATEGORY_DEFINITIONS.map((definition) =>
    buildRow(definition, estimate, linkedActuals)
  )
  const missingCategories = rows
    .filter((row) => row.status === "not_recorded")
    .map((row) => row.key)
  const recordedCategoryCount = rows.length - missingCategories.length
  const state: ActualsVsEstimateFeedbackState =
    recordedCategoryCount === 0
      ? "no_recorded_costs"
      : recordedCategoryCount === rows.length
        ? "supported_costs_recorded"
        : "partial_recorded_costs"

  return {
    state,
    estimateId: estimate.id,
    estimateBasisLabel: "Original saved estimate",
    columnLabels: buildColumnLabels(),
    rows,
    recordedCategoryCount,
    missingCategories,
    referenceOnly: true,
    profitAvailable: false,
    completionAvailable: false,
  }
}
