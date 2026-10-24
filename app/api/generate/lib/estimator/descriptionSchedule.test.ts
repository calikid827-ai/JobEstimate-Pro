import assert from "node:assert/strict"
import test from "node:test"
import { buildScheduleReadback, getScheduleReviewWarnings, reconcileDescriptionSchedule } from "./descriptionSchedule"
import type { ScheduleBlock } from "./types"

const painting = "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats."
function schedule(patch: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return { startDate: "2026-10-24", crewDays: null, visits: 2, calendarDays: null, workDaysPerWeek: 5, rationale: [], ...patch }
}

test("known visits can be described without inventing crew effort, elapsed duration, start or crew size", () => {
  const result = buildScheduleReadback(schedule())
  assert.match(result, /approximately 2 site visits/)
  assert.match(result, /estimated and subject to confirmation/)
  assert.doesNotMatch(result, /crew|calendar|2026|start|5.day/i)
  assert.equal(buildScheduleReadback(schedule({ visits: null })), "")
  for (const timing of ["one visit", "one mobilization"]) {
    const unconfirmed = reconcileDescriptionSchedule({ description: `This Estimate covers painting. All work will be completed in ${timing}.`, schedule: schedule({ visits: null }), scopeText: painting })
    assert.match(unconfirmed, /subject to confirmation of site-visit timing/)
    assert.doesNotMatch(unconfirmed, /in one visit|in one mobilization|approximately 1 site visit|crew-days|calendar days/)
  }
})

test("readback uses final known values without separate duration calculations", () => {
  const result = buildScheduleReadback(schedule({ crewDays: 4, calendarDays: { min: 5, max: 7 } }))
  assert.match(result, /approximately 4 crew-days/)
  assert.match(result, /5–7 calendar days/)
  assert.doesNotMatch(result, /2026|crew size/i)
  assert.doesNotMatch(buildScheduleReadback(schedule({ crewDays: Number.NaN, calendarDays: { min: 1, max: Number.POSITIVE_INFINITY } })), /crew|calendar/)
})

test("known full-work single-visit and single-mobilization contradictions cannot survive reconciliation", () => {
  for (const description of [
    "This Estimate covers painting and protection. All work will be completed in a single visit.",
    "This Estimate covers painting. All work will be completed in one mobilization.",
    "This Estimate covers painting. The project is planned for a single visit.",
    "This Estimate covers painting, with all work performed during one site visit.",
    "This Estimate covers painting. Work will be completed in a single visit.",
  ]) {
    const result = reconcileDescriptionSchedule({ description, schedule: schedule(), scopeText: painting })
    assert.doesNotMatch(result, /(?:completed|performed) in (?:a single visit|one mobilization)|performed during one site visit/i)
    assert.doesNotMatch(result, /planned for a single visit/i)
    assert.match(result, /approximately 2 site visits/)
    assert.match(result, /painting/)
  }
})

test("one mobilization fee can cover multiple visits and legitimate fees and phase wording remain intact", () => {
  const description = "This Estimate covers painting and protection. A single mobilization allowance of $175 covers the estimated visits. Patching is completed in one visit before painting returns. All work will be completed in one visit."
  const result = reconcileDescriptionSchedule({ description, schedule: schedule(), scopeText: painting })
  assert.ok(result.includes("A single mobilization allowance of $175 covers the estimated visits."))
  assert.ok(result.includes("Patching is completed in one visit before painting returns."))
  assert.ok(result.includes("painting and protection"))
  assert.doesNotMatch(result, /All work will be completed in one visit/)
  const denied = "This Estimate covers painting. The work will not be completed in one visit because painting requires returns."
  assert.ok(reconcileDescriptionSchedule({ description: denied, schedule: schedule(), scopeText: painting }).includes(denied))
  const cannot = "This Estimate covers painting. All work cannot be completed in one visit."
  assert.ok(reconcileDescriptionSchedule({ description: cannot, schedule: schedule(), scopeText: painting }).includes(cannot))
  const phases = "This Estimate includes patching completed in one visit and painting finished on a return visit."
  assert.ok(reconcileDescriptionSchedule({ description: phases, schedule: schedule(), scopeText: painting }).includes(phases))
})

test("a genuine one-visit estimate does not acquire a return-trip contradiction", () => {
  const description = "This Estimate covers device replacement. All work is estimated to be completed in one visit."
  const result = reconcileDescriptionSchedule({ description, schedule: schedule({ visits: 1 }), scopeText: "Replace one outlet." })
  assert.ok(result.includes(description))
  assert.match(result, /approximately 1 site visit/)
  assert.doesNotMatch(result, /2 site visits|review required/i)
  const barePromise = reconcileDescriptionSchedule({ description: "This Estimate covers device replacement. All work will be completed in a single visit.", schedule: schedule({ visits: 1 }), scopeText: "Replace one outlet." })
  assert.match(barePromise, /within the estimated site visit/)
  assert.doesNotMatch(barePromise, /completed in a single visit/)
  const planned = "This Estimate covers device replacement. The work is planned for a single visit."
  assert.ok(reconcileDescriptionSchedule({ description: planned, schedule: schedule({ visits: 1 }), scopeText: "Replace one outlet." }).includes(planned))
})

test("explicit written one-visit requirements remain labeled review conflicts, never silently replaced", () => {
  const scopeText = `${painting} Complete all work in one visit.`
  const warnings = getScheduleReviewWarnings(scopeText, schedule())
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /written requirement “Complete all work in one visit”/)
  const result = reconcileDescriptionSchedule({ description: "This Estimate covers painting. All work will be completed in one visit.", schedule: schedule(), scopeText })
  assert.match(result, /Schedule review required/)
  assert.match(result, /written requirement/)
  assert.match(result, /approximately 2 site visits/)
  assert.doesNotMatch(result, /All work will be completed in one visit/)
  assert.deepEqual(getScheduleReviewWarnings("Include one mobilization fee covering all visits.", schedule()), [])
  assert.deepEqual(getScheduleReviewWarnings("Patching must be completed in one visit before painting returns.", schedule()), [])
  assert.deepEqual(getScheduleReviewWarnings("Do not complete all work in one visit.", schedule()), [])
})

test("simple written crew/calendar requirements are checked only against known final estimates", () => {
  assert.match(getScheduleReviewWarnings("Complete within 2 calendar days.", schedule())[0], /cannot yet be verified/)
  assert.match(getScheduleReviewWarnings("Complete within 2 calendar days.", schedule({ calendarDays: { min: 3, max: 5 } }))[0], /approximately 5 calendar days/)
  assert.deepEqual(getScheduleReviewWarnings("Schedule two site visits.", schedule()), [])
  assert.match(getScheduleReviewWarnings("Only 1 crew-day is permitted.", schedule())[0], /crew-days are unavailable/)
  for (const scopeText of ["Complete within 3 visits.", "Maximum 3 visits.", "No more than 3 visits.", "Only 3 visits are permitted.", "Must not exceed 3 visits."]) {
    assert.deepEqual(getScheduleReviewWarnings(scopeText, schedule()), [], scopeText)
  }
  assert.match(getScheduleReviewWarnings("Maximum 1 visit.", schedule())[0], /approximately 2 site visits/)
  assert.match(getScheduleReviewWarnings("Must not exceed one visit.", schedule())[0], /approximately 2 site visits/)
  assert.match(getScheduleReviewWarnings("Complete all work in no more than one visit.", schedule())[0], /approximately 2 site visits/)
  const constrained = reconcileDescriptionSchedule({ description: "This Estimate covers painting. All work will be completed in only one visit.", schedule: schedule(), scopeText: "Only one visit is permitted." })
  assert.doesNotMatch(constrained, /All work will be completed in only one visit/)
  assert.match(constrained, /written requirement “Only one visit”/)
  assert.deepEqual(getScheduleReviewWarnings("Complete within 5 calendar days.", schedule({ calendarDays: { min: 3, max: 5 } })), [])
  for (const scopeText of ["Work must allow at least 2 site visits.", "Minimum 2 visits.", "No fewer than 2 visits.", "Work must take not less than 2 visits."]) {
    assert.deepEqual(getScheduleReviewWarnings(scopeText, schedule({ visits: 3 })), [], scopeText)
    assert.match(getScheduleReviewWarnings(scopeText, schedule({ visits: 1 }))[0], /approximately 1 site visits/, scopeText)
  }
  assert.deepEqual(getScheduleReviewWarnings("Allow at least 2 calendar days.", schedule({ calendarDays: { min: 3, max: 5 } })), [])
  assert.match(getScheduleReviewWarnings("Allow at least 4 calendar days.", schedule({ calendarDays: { min: 3, max: 5 } }))[0], /approximately 3 calendar days/)
})

test("reconciliation is stable and does not mutate scope or schedule", () => {
  const finalSchedule = schedule()
  const input = { description: "This Estimate covers painting. All work will be completed in a single visit.", schedule: finalSchedule, scopeText: painting }
  const before = structuredClone(finalSchedule)
  const first = reconcileDescriptionSchedule(input)
  assert.equal(reconcileDescriptionSchedule({ ...input, description: first }), first)
  assert.deepEqual(finalSchedule, before)
  assert.equal(input.scopeText, painting)
  const withConstraint = { ...input, scopeText: `${painting} Complete all work in one visit.`, schedule: schedule({ crewDays: 1.5, calendarDays: { min: 3, max: 5 } }) }
  const constrained = reconcileDescriptionSchedule(withConstraint)
  assert.equal(reconcileDescriptionSchedule({ ...withConstraint, description: constrained }), constrained)
  assert.match(constrained, /written requirement “Complete all work in one visit”/)
  const paragraphs = reconcileDescriptionSchedule({ ...input, description: "This Estimate covers painting.\n\nAll work will be completed in one visit." })
  assert.ok(paragraphs.includes("painting.\n\nAll work"))
})
