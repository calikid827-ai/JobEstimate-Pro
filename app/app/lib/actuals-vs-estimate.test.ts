import test from "node:test"
import assert from "node:assert/strict"

import {
  buildActualsVsEstimateFeedback,
  type ActualsVsEstimateFeedback,
  type RecordedCostCategory,
} from "./actuals-vs-estimate"
import type { EstimateHistoryItem, Job, JobActuals } from "./types"

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_1",
    createdAt: 1,
    clientName: "Jane Client",
    jobName: "Interior repaint",
    jobAddress: "123 Main St",
    originalEstimateId: "estimate_original",
    ...overrides,
  }
}

function makeEstimate(
  id = "estimate_original",
  pricing: Partial<EstimateHistoryItem["pricing"]> = {},
  overrides: Partial<EstimateHistoryItem> = {}
): EstimateHistoryItem {
  return {
    id,
    createdAt: id === "estimate_original" ? 1 : 2,
    jobId: "job_1",
    documentType: "Estimate",
    jobDetails: {
      clientName: "Jane Client",
      jobName: "Interior repaint",
      changeOrderNo: "",
      jobAddress: "123 Main St",
      date: "",
    },
    trade: "painting",
    state: "CA",
    scopeChange: "Paint bedroom walls.",
    result: "Customer-facing proposal.",
    pricing: {
      labor: 1000,
      materials: 400,
      subs: 200,
      markup: 20,
      total: 1920,
      ...pricing,
    },
    ...overrides,
  }
}

function makeActuals(overrides: Partial<JobActuals> = {}): JobActuals {
  return {
    jobId: "job_1",
    updatedAt: 10,
    labor: 0,
    materials: 0,
    subs: 0,
    ...overrides,
  }
}

function row(
  feedback: ActualsVsEstimateFeedback,
  key: RecordedCostCategory
) {
  const found = feedback.rows.find((item) => item.key === key)
  assert.ok(found)
  return found
}

function build(args: {
  job?: Job | null
  estimates?: EstimateHistoryItem[]
  actuals?: JobActuals | null
} = {}) {
  return buildActualsVsEstimateFeedback({
    job: args.job === undefined ? makeJob() : args.job,
    estimates: args.estimates ?? [makeEstimate()],
    actuals: args.actuals,
  })
}

test("returns no_linked_estimate when the job is missing", () => {
  const feedback = build({ job: null })

  assert.equal(feedback.state, "no_linked_estimate")
  assert.equal(feedback.estimateId, null)
  assert.equal(feedback.estimateBasisLabel, null)
  assert.deepEqual(feedback.rows, [])
})

test("returns no_linked_estimate when originalEstimateId is absent", () => {
  const feedback = build({
    job: makeJob({ originalEstimateId: undefined }),
  })

  assert.equal(feedback.state, "no_linked_estimate")
})

test("returns no_linked_estimate when originalEstimateId is blank", () => {
  const feedback = build({
    job: makeJob({ originalEstimateId: "   " }),
  })

  assert.equal(feedback.state, "no_linked_estimate")
})

test("returns no_linked_estimate when the exact original estimate is missing", () => {
  const feedback = build({
    estimates: [makeEstimate("another_estimate")],
  })

  assert.equal(feedback.state, "no_linked_estimate")
  assert.equal(feedback.estimateId, null)
})

test("selects the exact original estimate even when a newer job estimate exists", () => {
  const feedback = build({
    estimates: [
      makeEstimate("estimate_newer", { labor: 9000 }),
      makeEstimate("estimate_original", { labor: 1000 }),
    ],
    actuals: makeActuals({ labor: 1200 }),
  })

  assert.equal(feedback.estimateId, "estimate_original")
  assert.equal(feedback.estimateBasisLabel, "Original saved estimate")
  assert.equal(row(feedback, "labor").estimatedCost, 1000)
  assert.equal(row(feedback, "labor").differenceToDate, 200)
})

test("does not fall back to the earliest or latest job-linked estimate", () => {
  const feedback = build({
    job: makeJob({ originalEstimateId: "missing_original" }),
    estimates: [
      makeEstimate("estimate_earliest", { labor: 100 }, { createdAt: 1 }),
      makeEstimate("estimate_latest", { labor: 200 }, { createdAt: 99 }),
    ],
    actuals: makeActuals({ labor: 150 }),
  })

  assert.equal(feedback.state, "no_linked_estimate")
  assert.deepEqual(feedback.rows, [])
})

test("no actuals record leaves every supported cost unrecorded", () => {
  const feedback = build({ actuals: null })

  assert.equal(feedback.state, "no_recorded_costs")
  assert.equal(feedback.recordedCategoryCount, 0)
  assert.deepEqual(feedback.missingCategories, [
    "labor",
    "materials",
    "subs_other",
  ])
  assert.ok(feedback.rows.every((item) => item.status === "not_recorded"))
})

test("actuals linked to another job are not used", () => {
  const feedback = build({
    actuals: makeActuals({
      jobId: "job_2",
      labor: 1200,
      materials: 500,
      subs: 250,
    }),
  })

  assert.equal(feedback.state, "no_recorded_costs")
  assert.equal(feedback.recordedCategoryCount, 0)
})

test("zero recorded fields remain not_recorded", () => {
  const feedback = build({ actuals: makeActuals() })

  assert.equal(feedback.state, "no_recorded_costs")
  assert.ok(feedback.rows.every((item) => item.recordedCost === null))
  assert.ok(feedback.rows.every((item) => item.statusLabel === "Not recorded"))
})

test("partial recorded costs report only available categories", () => {
  const feedback = build({
    actuals: makeActuals({ labor: 1100, materials: 350 }),
  })

  assert.equal(feedback.state, "partial_recorded_costs")
  assert.equal(feedback.recordedCategoryCount, 2)
  assert.deepEqual(feedback.missingCategories, ["subs_other"])
  assert.equal(row(feedback, "subs_other").recordedCost, null)
})

test("all three supported categories can be recorded without implying completion", () => {
  const feedback = build({
    actuals: makeActuals({ labor: 1100, materials: 350, subs: 200 }),
  })

  assert.equal(feedback.state, "supported_costs_recorded")
  assert.equal(feedback.recordedCategoryCount, 3)
  assert.deepEqual(feedback.missingCategories, [])
  assert.equal(feedback.completionAvailable, false)
})

test("labor recorded above estimate is over_estimate", () => {
  const feedback = build({ actuals: makeActuals({ labor: 1250 }) })
  const labor = row(feedback, "labor")

  assert.equal(labor.status, "over_estimate")
  assert.equal(labor.statusLabel, "Over estimate")
  assert.equal(labor.differenceToDate, 250)
  assert.equal(labor.differencePercent, 25)
})

test("materials recorded below estimate are under_estimate", () => {
  const feedback = build({ actuals: makeActuals({ materials: 300 }) })
  const materials = row(feedback, "materials")

  assert.equal(materials.status, "under_estimate")
  assert.equal(materials.statusLabel, "Under estimate")
  assert.equal(materials.differenceToDate, -100)
  assert.equal(materials.differencePercent, -25)
})

test("subs and other recorded at estimate are on_estimate", () => {
  const feedback = build({ actuals: makeActuals({ subs: 200 }) })
  const subs = row(feedback, "subs_other")

  assert.equal(subs.label, "Subs / other")
  assert.equal(subs.status, "on_estimate")
  assert.equal(subs.statusLabel, "On estimate")
  assert.equal(subs.differenceToDate, 0)
  assert.equal(subs.differencePercent, 0)
})

test("positive recorded cost against zero estimate is unplanned_cost", () => {
  const feedback = build({
    estimates: [makeEstimate("estimate_original", { subs: 0 })],
    actuals: makeActuals({ subs: 125 }),
  })
  const subs = row(feedback, "subs_other")

  assert.equal(subs.status, "unplanned_cost")
  assert.equal(subs.statusLabel, "Unplanned recorded cost")
  assert.equal(subs.differenceToDate, 125)
  assert.equal(subs.differencePercent, null)
})

test("percentage remains null when estimated cost is zero", () => {
  const feedback = build({
    estimates: [makeEstimate("estimate_original", { labor: 0 })],
    actuals: makeActuals({ labor: 100 }),
  })

  assert.equal(row(feedback, "labor").differencePercent, null)
})

test("malformed and nonfinite recorded values become not_recorded", () => {
  const actuals = {
    ...makeActuals(),
    labor: "not-a-number",
    materials: Number.NaN,
    subs: Number.POSITIVE_INFINITY,
  } as unknown as JobActuals
  const feedback = build({ actuals })

  assert.equal(feedback.state, "no_recorded_costs")
  assert.ok(feedback.rows.every((item) => item.status === "not_recorded"))
})

test("numeric strings are rejected for every recorded cost category", () => {
  const actuals = {
    ...makeActuals(),
    labor: "125.50",
    materials: "1e3",
    subs: "00050",
  } as unknown as JobActuals
  const feedback = build({ actuals })

  assert.equal(feedback.state, "no_recorded_costs")
  assert.ok(feedback.rows.every((item) => item.status === "not_recorded"))
})

test("numeric strings are rejected for every estimated cost category", () => {
  const estimate = makeEstimate()
  const malformed = {
    ...estimate,
    pricing: {
      ...estimate.pricing,
      labor: "125.50",
      materials: "1e3",
      subs: "00050",
    },
  } as unknown as EstimateHistoryItem
  const feedback = build({
    estimates: [malformed],
    actuals: makeActuals({ labor: 10, materials: 20, subs: 30 }),
  })

  for (const item of feedback.rows) {
    assert.equal(item.estimatedCost, 0)
    assert.equal(item.status, "unplanned_cost")
  }
})

test("non-number runtime values never become trusted costs", () => {
  const invalidValues: unknown[] = [
    "0x10",
    "Infinity",
    "",
    "   ",
    true,
    [],
    {},
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]

  for (const invalidValue of invalidValues) {
    const actuals = {
      ...makeActuals(),
      labor: invalidValue,
    } as unknown as JobActuals
    const estimate = makeEstimate()
    const malformedEstimate = {
      ...estimate,
      pricing: {
        ...estimate.pricing,
        labor: invalidValue,
      },
    } as unknown as EstimateHistoryItem

    assert.equal(
      row(build({ actuals }), "labor").status,
      "not_recorded"
    )
    assert.equal(
      row(
        build({
          estimates: [malformedEstimate],
          actuals: makeActuals({ labor: 10 }),
        }),
        "labor"
      ).estimatedCost,
      0
    )
  }
})

test("negative recorded values become not_recorded", () => {
  const feedback = build({
    actuals: makeActuals({ labor: -1, materials: -50, subs: -0.01 }),
  })

  assert.equal(feedback.state, "no_recorded_costs")
})

test("malformed and negative estimate values normalize safely to zero", () => {
  const estimate = makeEstimate()
  const malformed = {
    ...estimate,
    pricing: {
      ...estimate.pricing,
      labor: "bad",
      materials: -20,
      subs: Number.POSITIVE_INFINITY,
    },
  } as unknown as EstimateHistoryItem
  const feedback = build({
    estimates: [malformed],
    actuals: makeActuals({ labor: 10, materials: 20, subs: 30 }),
  })

  for (const item of feedback.rows) {
    assert.equal(item.estimatedCost, 0)
    assert.equal(item.status, "unplanned_cost")
    assert.equal(item.differencePercent, null)
  }
})

test("representative older actuals records accept numeric values without optional notes", () => {
  const olderActuals: JobActuals = {
    jobId: "job_1",
    updatedAt: 2,
    labor: 125.5,
    materials: 0,
    subs: 0,
  }
  const feedback = build({ actuals: olderActuals })

  assert.equal(row(feedback, "labor").recordedCost, 125.5)
  assert.equal(row(feedback, "materials").status, "not_recorded")
  assert.equal(row(feedback, "subs_other").status, "not_recorded")
})

test("a positive recorded value that rounds to zero remains not_recorded", () => {
  const feedback = build({ actuals: makeActuals({ labor: 0.004 }) })
  const labor = row(feedback, "labor")

  assert.equal(labor.recordedCost, null)
  assert.equal(labor.status, "not_recorded")
  assert.equal(feedback.state, "no_recorded_costs")
})

test("a half-cent recorded value rounds to one cent and remains recorded", () => {
  const feedback = build({
    estimates: [makeEstimate("estimate_original", { labor: 0 })],
    actuals: makeActuals({ labor: 0.005 }),
  })
  const labor = row(feedback, "labor")

  assert.equal(labor.recordedCost, 0.01)
  assert.equal(labor.differenceToDate, 0.01)
  assert.equal(labor.status, "unplanned_cost")
})

test("a sub-cent value against a zero estimate is not unplanned cost", () => {
  const feedback = build({
    estimates: [makeEstimate("estimate_original", { labor: 0 })],
    actuals: makeActuals({ labor: 0.004 }),
  })
  const labor = row(feedback, "labor")

  assert.equal(labor.recordedCost, null)
  assert.equal(labor.status, "not_recorded")
  assert.notEqual(labor.status, "unplanned_cost")
})

test("no recorded row exposes a zero-dollar recorded cost", () => {
  const feedback = build({
    actuals: makeActuals({ labor: 0.004, materials: 0.005, subs: 1 }),
  })

  assert.ok(feedback.rows.every((item) => item.recordedCost !== 0))
})

test("money values and differences round deterministically to cents", () => {
  const feedback = build({
    estimates: [
      makeEstimate("estimate_original", {
        labor: 100.004,
        materials: 400,
        subs: 200,
      }),
    ],
    actuals: makeActuals({ labor: 110.006 }),
  })
  const labor = row(feedback, "labor")

  assert.equal(labor.estimatedCost, 100)
  assert.equal(labor.recordedCost, 110.01)
  assert.equal(labor.differenceToDate, 10.01)
})

test("percentages round deterministically to one decimal place", () => {
  const feedback = build({
    estimates: [makeEstimate("estimate_original", { labor: 300 })],
    actuals: makeActuals({ labor: 350 }),
  })

  assert.equal(row(feedback, "labor").differencePercent, 16.7)
})

test("difference sign is always recorded cost minus estimated cost", () => {
  const feedback = build({
    estimates: [
      makeEstimate("estimate_original", {
        labor: 1000,
        materials: 400,
        subs: 200,
      }),
    ],
    actuals: makeActuals({ labor: 1200, materials: 300, subs: 200 }),
  })

  assert.equal(row(feedback, "labor").differenceToDate, 200)
  assert.equal(row(feedback, "materials").differenceToDate, -100)
  assert.equal(row(feedback, "subs_other").differenceToDate, 0)
})

test("missing categories preserve deterministic category order", () => {
  const feedback = build({
    actuals: makeActuals({ materials: 450 }),
  })

  assert.deepEqual(feedback.missingCategories, ["labor", "subs_other"])
  assert.deepEqual(
    feedback.rows.map((item) => item.key),
    ["labor", "materials", "subs_other"]
  )
})

test("normalization and comparison leave all input objects deeply unchanged", () => {
  const job = makeJob()
  const estimates = [
    makeEstimate("estimate_original", {
      labor: 100.004,
      materials: 400,
      subs: 200,
    }),
    makeEstimate("estimate_newer", { labor: 9999 }),
  ]
  const actuals = makeActuals({ labor: 110.006, notes: "Costs to date" })
  const before = structuredClone({ job, estimates, actuals })

  buildActualsVsEstimateFeedback({ job, estimates, actuals })

  assert.deepEqual({ job, estimates, actuals }, before)
})

test("returned mutable containers are isolated across helper calls", () => {
  const first = build({ actuals: makeActuals({ labor: 1100 }) })
  const mutableLabels = first.columnLabels as {
    estimatedCost: string
    recordedCost: string
    differenceToDate: string
  }
  mutableLabels.estimatedCost = "Changed by consumer"

  const second = build({ actuals: makeActuals({ labor: 1100 }) })
  const noLinkedFirst = build({ job: null })
  const noLinkedSecond = build({ job: null })

  assert.notStrictEqual(first.columnLabels, second.columnLabels)
  assert.deepEqual(second.columnLabels, {
    estimatedCost: "Estimated cost",
    recordedCost: "Recorded cost to date",
    differenceToDate: "Difference to date",
  })
  assert.notStrictEqual(first.rows, second.rows)
  assert.notStrictEqual(first.missingCategories, second.missingCategories)
  assert.notStrictEqual(first.rows[0], second.rows[0])
  assert.notStrictEqual(noLinkedFirst.columnLabels, noLinkedSecond.columnLabels)
  assert.notStrictEqual(noLinkedFirst.rows, noLinkedSecond.rows)
  assert.notStrictEqual(
    noLinkedFirst.missingCategories,
    noLinkedSecond.missingCategories
  )
})

test("output exposes only reference feedback and no prohibited conclusions", () => {
  const feedback = build({
    actuals: makeActuals({ labor: 1100, materials: 450, subs: 225 }),
  })
  const stringValues: string[] = []

  const collectStrings = (value: unknown) => {
    if (typeof value === "string") {
      stringValues.push(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(collectStrings)
      return
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(collectStrings)
    }
  }

  collectStrings(feedback)

  assert.doesNotMatch(
    stringValues.join(" "),
    /actual profit|final margin|live margin|labor efficiency|production efficiency|job complete|final actual cost|recommend/i
  )
  assert.equal("actualProfit" in feedback, false)
  assert.equal("finalMargin" in feedback, false)
  assert.equal("recommendations" in feedback, false)
  assert.equal("invoiceTotal" in feedback, false)
  assert.equal("completionStatus" in feedback, false)
  assert.deepEqual(Object.keys(feedback).sort(), [
    "columnLabels",
    "completionAvailable",
    "estimateBasisLabel",
    "estimateId",
    "missingCategories",
    "profitAvailable",
    "recordedCategoryCount",
    "referenceOnly",
    "rows",
    "state",
  ])
})

test("fixed safety flags and contractor-safe column labels are always returned", () => {
  for (const feedback of [
    build({ job: null }),
    build({ actuals: null }),
    build({ actuals: makeActuals({ labor: 1200 }) }),
  ]) {
    assert.equal(feedback.referenceOnly, true)
    assert.equal(feedback.profitAvailable, false)
    assert.equal(feedback.completionAvailable, false)
    assert.deepEqual(feedback.columnLabels, {
      estimatedCost: "Estimated cost",
      recordedCost: "Recorded cost to date",
      differenceToDate: "Difference to date",
    })
  }
})
