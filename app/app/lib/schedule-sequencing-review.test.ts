import test from "node:test"
import assert from "node:assert/strict"

import { buildScheduleSequencingReview } from "./schedule-sequencing-review"
import type { Schedule } from "./types"

const oneVisitSchedule: Schedule = {
  crewDays: 1,
  visits: 1,
  calendarDays: { min: 1, max: 1 },
  workDaysPerWeek: 5,
  rationale: ["One site visit assumed."],
}

const multiVisitSchedule: Schedule = {
  crewDays: 2,
  visits: 2,
  calendarDays: { min: 2, max: 3 },
  workDaysPerWeek: 5,
  rationale: ["Return visit included for dry time and final finish sequencing."],
}

function reviewText(review: ReturnType<typeof buildScheduleSequencingReview>) {
  return [
    ...(review?.contractorRiskNotes || []),
    ...(review?.scopeClarityWarnings || []),
    ...(review?.suggestedExclusions || []),
    ...(review?.missedScopeWarnings || []),
  ]
    .join(" | ")
    .toLowerCase()
}

test("patch-and-paint with one visit warns for dry-time and return visit", () => {
  const text = reviewText(
    buildScheduleSequencingReview({
      selectedTrade: "painting",
      scopeText: "Patch drywall, texture match, prime, and paint one room.",
      resultText: "Includes patching, texture, primer, paint, cleanup, and approval.",
      schedule: oneVisitSchedule,
    })
  )

  assert.match(text, /dry time/)
  assert.match(text, /return visit/)
})

test("patch-and-paint with multi-visit schedule and dry-time language does not over-warn", () => {
  const review = buildScheduleSequencingReview({
    selectedTrade: "painting",
    scopeText: "Patch drywall, texture match, prime, and paint one room.",
    resultText: "Includes dry time, return visit, primer, paint, cleanup, and approval.",
    schedule: multiVisitSchedule,
  })

  assert.equal(review, null)
})

test("shower waterproofing and tile with one visit warns for cure and phase sequencing", () => {
  const text = reviewText(
    buildScheduleSequencingReview({
      selectedTrade: "bathroom_tile",
      scopeText: "Waterproof shower walls, install tile, grout, and reinstall fixtures.",
      resultText: "Includes waterproofing membrane, shower tile, grout, cleanup, and approval.",
      schedule: oneVisitSchedule,
    })
  )

  assert.match(text, /waterproofing/)
  assert.match(text, /grout cure/)
  assert.match(text, /fixture/)
})

test("plumbing rough-in warns when inspection access and patching assumptions are missing", () => {
  const text = reviewText(
    buildScheduleSequencingReview({
      selectedTrade: "plumbing",
      scopeText: "Rough-in plumbing for new vanity location.",
      resultText: "Includes rough-in plumbing and cleanup.",
      schedule: oneVisitSchedule,
    })
  )

  assert.match(text, /access/)
  assert.match(text, /inspection/)
  assert.match(text, /patch/)
})

test("electrical rough-in warns when inspection access and patching assumptions are missing", () => {
  const text = reviewText(
    buildScheduleSequencingReview({
      selectedTrade: "electrical",
      scopeText: "Electrical rough-in for vanity light.",
      resultText: "Includes electrical rough-in and cleanup.",
      schedule: oneVisitSchedule,
    })
  )

  assert.match(text, /access/)
  assert.match(text, /inspection/)
  assert.match(text, /patch/)
})

test("rough-in does not over-warn when inspection access and patching assumptions are stated", () => {
  const review = buildScheduleSequencingReview({
    selectedTrade: "electrical",
    scopeText:
      "Electrical rough-in for vanity light. Includes permit and inspection, access through open wall, and patching by others.",
    resultText: "Includes rough-in wiring, inspection coordination, open-wall access, patching by others, cleanup, and approval.",
    schedule: oneVisitSchedule,
  })

  assert.equal(review, null)
})

test("flooring with demo subfloor install and transitions warns when sequencing assumptions are thin", () => {
  const text = reviewText(
    buildScheduleSequencingReview({
      selectedTrade: "flooring",
      scopeText:
        "Remove existing flooring, prep subfloor, install LVP, and include transitions and base shoe.",
      resultText: "Includes flooring removal, subfloor prep, LVP installation, transitions, cleanup, and approval.",
      schedule: oneVisitSchedule,
    })
  )

  assert.match(text, /demo/)
  assert.match(text, /subfloor prep/)
  assert.match(text, /transitions/)
})

test("simple walls-only painting does not create noisy sequencing warnings", () => {
  const review = buildScheduleSequencingReview({
    selectedTrade: "painting",
    scopeText: "Paint walls only in 2 rooms. Two coats. Contractor supplied paint.",
    resultText: "Includes wall painting, two coats, cleanup, protection, and approval.",
    schedule: oneVisitSchedule,
  })

  assert.equal(review, null)
})

test("walls-only painting with drywall repair texture exclusions does not warn for patch dry-time", () => {
  const review = buildScheduleSequencingReview({
    selectedTrade: "painting",
    scopeText:
      "Paint walls only in living room and hallway. Two coats. Excludes drywall repair, skim coat, and texture matching.",
    resultText:
      "Includes wall painting, masking, protection, cleanup, and approval. Drywall repair and texture matching are excluded; patch/texture drying time is only a schedule consideration for work by others.",
    schedule: oneVisitSchedule,
  })

  assert.equal(review, null)
})

test("owner-supplied fixtures add material lead-time review note only", () => {
  const review = buildScheduleSequencingReview({
    selectedTrade: "plumbing",
    scopeText: "Replace 1 toilet and 1 faucet. Owner supplied fixtures.",
    resultText: "Includes plumbing fixture replacement, cleanup, protection, and approval.",
    schedule: oneVisitSchedule,
  })
  const text = reviewText(review)

  assert.match(text, /owner-supplied materials or fixtures/)
  assert.match(text, /lead-time|late owner-supplied/)
  assert.doesNotMatch(text, /rough-in sequencing/)
  assert.equal(review?.contractorRiskNotes.length, 1)
})

test("wallcovering-only general renovation does not get bathroom or generic renovation sequencing", () => {
  const review = buildScheduleSequencingReview({
    selectedTrade: "general_renovation",
    scopeText:
      "Install wallcovering in lobby walls with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering. Include layout, pattern match, adhesive, cleanup, protection, and customer approval.",
    resultText:
      "Customer-facing scope includes wallcovering installation, wall prep, primer, pattern match, adhesive, cleanup, protection, exclusions, and customer approval.",
    schedule: oneVisitSchedule,
  })
  const text = reviewText(review)

  assert.doesNotMatch(text, /shower|tile sequencing|waterproofing|grout cure|fixture/)
  assert.doesNotMatch(text, /demo, rough-in, inspection, close-up/)
  assert.match(text, /wallcovering sequence/)
})
