import test from "node:test"
import assert from "node:assert/strict"

import { buildFieldHandoff } from "./field-handoff"

test("buildFieldHandoff returns an empty handoff before an estimate exists", () => {
  const handoff = buildFieldHandoff({})

  assert.equal(handoff.isReady, false)
  assert.equal(handoff.text, "")
  assert.deepEqual(handoff.sections, [])
})

test("buildFieldHandoff derives crew-ready text from existing estimate state", () => {
  const handoff = buildFieldHandoff({
    resultText:
      "Paint walls in three bedrooms with two finish coats. Includes masking, floor protection, cleanup, and final walkthrough.",
    jobDetails: {
      clientName: "Jane Client",
      jobName: "Bedroom repaint",
      jobAddress: "123 Main St",
    },
    trade: "painting",
    documentType: "Estimate",
    state: "ca",
    schedule: {
      crewDays: 2,
      visits: 1,
      rationale: ["One prep/paint visit with normal access."],
    },
    crewPlanning: {
      recommendedCrewSize: 2,
      sequence: ["Protect floors and mask adjacent finishes."],
      risks: ["Confirm furniture moving before arrival."],
      dailyPlan: [
        {
          label: "Day 1",
          tasks: ["Prep rooms", "Paint walls"],
        },
      ],
    },
    materialsList: {
      items: [{ label: "Interior wall paint", quantity: "2 gallons", category: "material" }],
      confirmItems: ["Confirm paint color and sheen."],
      notes: ["Bring drop cloths and masking supplies."],
    },
    estimateDefenseMode: {
      includedScopeHighlights: ["Walls in three bedrooms"],
      exclusionNotes: ["Ceilings and trim are excluded unless approved separately."],
      allowanceNotes: ["Paint supplied by contractor unless owner provides selections."],
    },
    deposit: {
      enabled: true,
      type: "percent",
      value: 25,
      depositDue: 500,
      remainingBalance: 1500,
    },
  })

  assert.equal(handoff.isReady, true)
  assert.match(handoff.text, /Field Handoff/)
  assert.match(handoff.text, /Client: Jane Client/)
  assert.match(handoff.text, /Trade: Painting/)
  assert.match(handoff.text, /Walls in three bedrooms/)
  assert.match(handoff.text, /Ceilings and trim are excluded/)
  assert.match(handoff.text, /Recommended crew: 2/)
  assert.match(handoff.text, /Interior wall paint: 2 gallons/)
  assert.match(handoff.text, /25% deposit/)
})

test("buildFieldHandoff copy text omits empty sections and does not invent facts", () => {
  const handoff = buildFieldHandoff({
    scopeText: "Install owner-supplied vanity light.",
    jobDetails: {},
  })

  assert.equal(handoff.isReady, true)
  assert.doesNotMatch(handoff.text, /Client:/)
  assert.doesNotMatch(handoff.text, /Address:/)
  assert.doesNotMatch(handoff.text, /Not specified/)
  assert.match(handoff.text, /Install owner-supplied vanity light/)
})

test("buildFieldHandoff ignores PriceGuard review content if supplied", () => {
  const input: Parameters<typeof buildFieldHandoff>[0] & {
    priceGuardReview: {
      suggestedExclusions: string[]
      contractorRiskNotes: string[]
      scopeClarityWarnings: string[]
    }
  } = {
    scopeText: "Replace two bathroom exhaust fans.",
    estimateDefenseMode: {
      exclusionNotes: ["Roof venting changes excluded unless approved separately."],
    },
    scopeXRay: {
      riskFlags: ["Confirm attic access before arrival."],
    },
    priceGuardReview: {
      suggestedExclusions: ["PriceGuard suggested exclusion should stay out."],
      contractorRiskNotes: ["PriceGuard contractor risk should stay out."],
      scopeClarityWarnings: ["PriceGuard clarity warning should stay out."],
    },
  }

  const handoff = buildFieldHandoff(input)

  assert.match(handoff.text, /Roof venting changes excluded/)
  assert.match(handoff.text, /Confirm attic access before arrival/)
  assert.doesNotMatch(handoff.text, /PriceGuard suggested exclusion/)
  assert.doesNotMatch(handoff.text, /PriceGuard contractor risk/)
  assert.doesNotMatch(handoff.text, /PriceGuard clarity warning/)
})
