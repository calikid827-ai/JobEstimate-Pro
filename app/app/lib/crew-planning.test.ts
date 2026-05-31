import test from "node:test"
import assert from "node:assert/strict"

import { buildCrewPlanningReadback } from "./crew-planning"
import type { Schedule } from "./types"

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  crewDays: 4,
  visits: 1,
  calendarDays: { min: 2, max: 4 },
  workDaysPerWeek: 5,
  rationale: ["Normal production sequence."],
  ...overrides,
})

function assertDailyPlanGuidanceOnly(plan: ReturnType<typeof buildCrewPlanningReadback>) {
  assert.equal(plan.dailyPlan.length > 0, true)
  assert.equal(plan.dailyPlan.every((item) => item.guidanceOnly === true), true)
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
}

test("calculates crew-size options from crewDays", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms",
    schedule: schedule({ crewDays: 4 }),
  })

  assert.equal(plan.crewDayBasis, 4)
  assert.equal(plan.recommendedCrewSize, 3)
  assert.deepEqual(
    plan.options.map((option) => [option.label, option.crewSize, option.estimatedWorkDays]),
    [
      ["Small crew", 2, 2],
      ["Standard crew", 3, 2],
      ["Push schedule", 5, 1],
    ]
  )
})

test("output is estimator-only and never pricing authority", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms",
    schedule: schedule(),
    pricingLabor: 1200,
  })

  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
  assert.ok(plan.basis.some((item) => /not a labor-hour change/i.test(item)))
})

test("missing schedule is handled safely", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms",
    schedule: null,
  })

  assert.equal(plan.crewDayBasis, null)
  assert.equal(plan.durationRange, null)
  assert.equal(plan.options.every((option) => option.estimatedWorkDays === null), true)
  assert.equal(plan.dailyPlan.length, 1)
  assert.equal(plan.dailyPlan[0].label, "Day 1")
  assert.equal(plan.dailyPlanConfidence, "placeholder")
  assertDailyPlanGuidanceOnly(plan)
  assert.ok(plan.basis.some((item) => /not confirmed/i.test(item)))
})

test("simple painting creates a Day 1 daily work plan", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms. Walls only. Minor patching. Two coats.",
    schedule: schedule({ crewDays: 1, visits: 1, rationale: [], calendarDays: null }),
  })

  assert.equal(plan.dailyPlan.length, 1)
  assert.match(plan.dailyPlan[0].label, /Day 1|Visit 1/)
  assert.ok(plan.dailyPlan[0].tasks.some((item) => /Confirm rooms|included surfaces|paint supply/i.test(item)))
  assert.ok(plan.dailyPlan[0].tasks.some((item) => /Protect floors\/furniture/i.test(item)))
  assert.ok(plan.dailyPlan[0].tasks.some((item) => /prep|patching|spot prime/i.test(item)))
  assert.ok(plan.dailyPlan[0].tasks.some((item) => /Paint, clean up|walk/i.test(item)))
  assert.deepEqual(plan.planningNotes, [])
  assertDailyPlanGuidanceOnly(plan)
})

test("missing crewDays with visits keeps visit-aware duration copy", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms. Walls only. Minor patching. Two coats.",
    schedule: schedule({ crewDays: null, visits: 2, calendarDays: null }),
  })

  assert.equal(plan.crewDayBasis, null)
  assert.equal(plan.durationRange, "2 visits shown; work days need confirmation")
  assert.equal(plan.options.every((option) => option.estimatedWorkDays === null), true)
  assert.equal(plan.dailyPlan.length, 2)
  assert.equal(plan.dailyPlan[0].label, "Visit 1")
  assert.equal(plan.dailyPlan[1].label, "Visit 2")
  assert.ok(plan.dailyPlan[0].tasks.some((item) => /first coat/i.test(item)))
  assert.ok(plan.dailyPlan[1].tasks.some((item) => /second coat/i.test(item)))
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("general renovation selected trade infers painting sequence from painting-heavy typed scope", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "general_renovation",
    scopeText: "Paint 3 bedrooms. Walls only. Minor patching. Two coats.",
    schedule: schedule({ crewDays: null, visits: 2, calendarDays: null }),
  })

  assert.ok(plan.sequence.some((item) => /paint supply|Paint, clean up/i.test(item)))
  assert.deepEqual(plan.planningNotes, [])
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("residential floor protection language does not trigger hotel multi-unit planning", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "general_renovation",
    scopeText: "Paint 3 bedrooms. Walls only. Protect floors with drop cloths. Minor patching. Two coats.",
    schedule: schedule({ crewDays: 1, visits: 1, rationale: [], calendarDays: null }),
  })

  assert.notEqual(plan.recommendedCrewSize, 6)
  assert.ok(plan.sequence.some((item) => /Protect floors\/furniture/i.test(item)))
  assert.ok(plan.dailyPlan[0].tasks.some((item) => /Protect floors\/furniture/i.test(item)))
  assert.equal(plan.sequence.some((item) => /rolling production|room\/unit release|punch follow-up/i.test(item)), false)
  assert.equal(plan.hasSchedulingRisks, false)
  assert.deepEqual(plan.planningNotes, [])
  assertDailyPlanGuidanceOnly(plan)
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("painting and flooring typed scope produces a multi-trade planning note", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "general_renovation",
    scopeText: "Paint 3 bedrooms and install flooring.",
    schedule: schedule({ crewDays: 2, visits: 1, calendarDays: null }),
  })

  assert.ok(plan.planningNotes.some((item) => /multiple trades/i.test(item)))
  assert.ok(plan.dailyPlan.some((item) => item.reminders.some((reminder) => /trade boundaries/i.test(reminder))))
  assert.ok(plan.dailyPlan.some((item) => item.risks.some((risk) => /sequencing review/i.test(risk))))
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("painting and electrical typed scope produces a multi-trade planning note", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "general_renovation",
    scopeText: "Paint 3 bedrooms and replace outlets.",
    schedule: schedule({ crewDays: 2, visits: 1, calendarDays: null }),
  })

  assert.ok(plan.planningNotes.some((item) => /multiple trades/i.test(item)))
  assert.ok(plan.dailyPlan.some((item) => item.reminders.some((reminder) => /trade boundaries/i.test(reminder))))
  assert.ok(plan.dailyPlan.some((item) => item.risks.some((risk) => /sequencing review/i.test(risk))))
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("cover-plate painting prep does not produce a multi-trade planning note", () => {
  const scopes = [
    "Paint 3 bedrooms. Walls only. Remove and reinstall outlet covers for painting only. Two coats.",
    "Paint 3 bedrooms. Cover plates removed/reinstalled for painting only.",
  ]

  for (const scopeText of scopes) {
    const plan = buildCrewPlanningReadback({
      selectedTrade: "general_renovation",
      scopeText,
      schedule: schedule({ crewDays: 1, visits: 1, calendarDays: null }),
    })

    assert.deepEqual(plan.planningNotes, [], scopeText)
    assert.ok(plan.sequence.some((item) => /Protect floors\/furniture|Paint, clean up/i.test(item)), scopeText)
    assert.equal(plan.estimatorOnly, true)
    assert.equal(plan.affectsPricing, false)
  }
})

test("drywall substrate painting does not produce a multi-trade planning note", () => {
  const scopes = [
    "Paint 3 bedrooms. Walls only. Paint over standard drywall surfaces. Two coats.",
    "Paint 3 bedrooms. Walls only. Light sanding and patching of minor drywall imperfections to facilitate proper paint adhesion.",
  ]

  for (const scopeText of scopes) {
    const plan = buildCrewPlanningReadback({
      selectedTrade: "general_renovation",
      scopeText,
      schedule: schedule({ crewDays: 1, visits: 1, calendarDays: null }),
    })

    assert.deepEqual(plan.planningNotes, [], scopeText)
    assert.equal(plan.estimatorOnly, true)
    assert.equal(plan.affectsPricing, false)
  }
})

test("true electrical typed scope still produces a multi-trade planning note", () => {
  const scopes = [
    "Paint 3 bedrooms and replace outlets.",
    "Paint 3 bedrooms and install outlets.",
    "Paint 3 bedrooms and move switches.",
    "Paint 3 bedrooms and install light fixtures.",
  ]

  for (const scopeText of scopes) {
    const plan = buildCrewPlanningReadback({
      selectedTrade: "general_renovation",
      scopeText,
      schedule: schedule({ crewDays: 2, visits: 1, calendarDays: null }),
    })

    assert.ok(plan.planningNotes.some((item) => /multiple trades/i.test(item)), scopeText)
    assert.equal(plan.estimatorOnly, true)
    assert.equal(plan.affectsPricing, false)
  }
})

test("simple one-visit scope does not auto-open as a scheduling risk", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms",
    schedule: schedule({ crewDays: 1, visits: 1, rationale: [] }),
  })

  assert.equal(plan.hasSchedulingRisks, false)
  assert.ok(plan.risks.some((item) => /Confirm access/i.test(item)))
})

test("return-trip dry-time and access risks are included when present", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms",
    schedule: schedule({
      visits: 2,
      rationale: ["Dry time between coats may require a return visit."],
    }),
    areaScopeBreakdown: {
      detectedArea: { floorSqft: null, wallSqft: null, paintSqft: null, trimLf: null },
      allowances: {
        prepDemo: [],
        protectionSetup: [],
        materialsDrivers: [],
        scheduleDrivers: ["Occupied access may slow production."],
      },
      missingConfirmations: [],
    },
    scopeSignals: { needsReturnVisit: true, reason: "Multiple visits likely." },
  })

  assert.equal(plan.hasSchedulingRisks, true)
  assert.ok(plan.risks.some((item) => /Return trip|multi-visit/i.test(item)))
  assert.ok(plan.risks.some((item) => /Dry time|cure time|coat sequencing/i.test(item)))
  assert.ok(plan.bottlenecks.some((item) => /Access|staging|occupied/i.test(item)))
})

test("hotel multi-unit scope produces rolling-production planning notes", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint hotel guest rooms on floors 2-4, 60 units, corridors by others.",
    schedule: schedule({ crewDays: 30, visits: 10, calendarDays: { min: 10, max: 20 } }),
  })

  assert.equal(plan.recommendedCrewSize, 6)
  assert.ok(plan.sequence.some((item) => /rolling production/i.test(item)))
  assert.ok(plan.bottlenecks.some((item) => /room-release|Repeated rooms|material staging/i.test(item)))
  assert.ok(plan.risks.some((item) => /planning support only/i.test(item)))
  assert.equal(plan.dailyPlan.length, 3)
  assert.ok(plan.dailyPlan.some((item) => /Release|Staging/i.test(item.label)))
  assert.ok(plan.dailyPlan.some((item) => /Rolling Production/i.test(item.label)))
  assert.ok(plan.dailyPlan.some((item) => /Punch|Release/i.test(item.label)))
  assert.ok(plan.dailyPlan.some((item) => item.tasks.some((task) => /room\/floor release/i.test(task))))
  assertDailyPlanGuidanceOnly(plan)
})

test("every daily plan item stays guidance-only", () => {
  const scenarios = [
    {
      selectedTrade: "painting",
      scopeText: "Paint 3 bedrooms. Walls only. Two coats. Return next day for second coat if needed.",
      schedule: schedule({ crewDays: null, visits: 2, calendarDays: null }),
    },
    {
      selectedTrade: "general_renovation",
      scopeText: "Paint 3 bedrooms and install flooring.",
      schedule: schedule({ crewDays: 2, visits: 1, calendarDays: null }),
    },
    {
      selectedTrade: "painting",
      scopeText: "Paint 60 hotel guest rooms, walls only, rolling floor-by-floor production, rooms released by GC.",
      schedule: schedule({ crewDays: 30, visits: 10, calendarDays: { min: 10, max: 20 } }),
    },
  ]

  for (const scenario of scenarios) {
    assertDailyPlanGuidanceOnly(buildCrewPlanningReadback(scenario))
  }
})

test("floor-by-floor production still triggers hotel multi-unit planning", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 60 guest rooms with rolling floor-by-floor production.",
    schedule: schedule({ crewDays: 30, visits: 10, calendarDays: { min: 10, max: 20 } }),
  })

  assert.equal(plan.recommendedCrewSize, 6)
  assert.ok(plan.sequence.some((item) => /rolling production/i.test(item)))
  assert.ok(plan.bottlenecks.some((item) => /Repeated rooms|room-release|material staging/i.test(item)))
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("rooms released by GC still triggers hotel multi-unit planning", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint guest rooms as rooms released by GC.",
    schedule: schedule({ crewDays: 12, visits: 6, calendarDays: { min: 6, max: 12 } }),
  })

  assert.equal(plan.recommendedCrewSize, 6)
  assert.ok(plan.sequence.some((item) => /room\/unit release/i.test(item)))
  assert.ok(plan.risks.some((item) => /planning support only/i.test(item)))
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})

test("boundary by-others exclusion language stays risk review-only", () => {
  const plan = buildCrewPlanningReadback({
    selectedTrade: "painting",
    scopeText: "Paint 3 bedrooms, drywall repairs by others, owner supplied paint.",
    schedule: schedule({ crewDays: 2 }),
  })

  assert.ok(plan.risks.some((item) => /Boundary|review-only/i.test(item)))
  assert.equal(plan.estimatorOnly, true)
  assert.equal(plan.affectsPricing, false)
})
