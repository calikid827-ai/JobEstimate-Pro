import assert from "node:assert/strict"
import test from "node:test"

import { buildLiveTradePricingInfluence } from "../estimator/liveTradePricingInfluence"
import { buildTradeQuantityCandidateGates } from "./tradeQuantityCandidateGates"
import type {
  PlanIntelligence,
  PlanTradeQuantityCandidate,
  PlanTradeQuantityCandidateGate,
} from "./types"

function makeCandidate(
  overrides: Partial<PlanTradeQuantityCandidate> = {}
): PlanTradeQuantityCandidate {
  return {
    candidateKey: "door-schedule-count",
    trade: "carpentry",
    category: "door schedule count candidates",
    quantity: 2,
    unit: "doors",
    quantityStatus: "count_only",
    confidence: 78,
    sourceType: "schedule_table",
    sourceRefs: [
      {
        pageNumber: 2,
        sourcePageNumber: 5,
        sheetNumber: "A6.1",
        sheetTitle: "Door Schedule",
        rowIndex: 1,
        sourceTableIndex: 0,
      },
      {
        pageNumber: 2,
        sourcePageNumber: 5,
        sheetNumber: "A6.1",
        sheetTitle: "Door Schedule",
        rowIndex: 2,
        sourceTableIndex: 0,
      },
    ],
    assumptions: [
      "Explicit quantity/count column summed to 2.",
      "Schedule counts are review-only candidates until estimator confirms duplicates, alternates, and scope applicability.",
    ],
    warnings: [
      "Candidate only - not measured takeoff support.",
      "Schedule count candidate is not pricing-eligible in Phase 6.",
    ],
    eligibleForPricing: false,
    ...overrides,
  }
}

function gateFor(candidate: PlanTradeQuantityCandidate): PlanTradeQuantityCandidateGate {
  const gates = buildTradeQuantityCandidateGates([candidate])
  assert.equal(gates.length, 1)
  return gates[0]
}

test("finish matrix candidates require measurement and are not pricing eligible", () => {
  const gate = gateFor(
    makeCandidate({
      candidateKey: "paint-finish-rows",
      trade: "painting",
      category: "painting finish rows",
      quantity: 2,
      unit: "rooms",
      quantityStatus: "needs_measurement",
      sourceType: "finish_matrix",
      assumptions: [
        "2 finish schedule rows include wall finish values.",
        "Room-row counts are review aids only; area or linear measurements are still required.",
      ],
      warnings: [
        "Candidate only - not measured takeoff support.",
        "Finish row count does not provide measured SF/LF quantity support.",
      ],
    })
  )

  assert.equal(gate.gateStatus, "review_only")
  assert.equal(gate.pricingEligibleNow, false)
  assert.equal(gate.futureEligible, false)
  assert(gate.blockers.some((blocker) => /measured SF\/LF/i.test(blocker)))
})

test("door, window, and fixture schedule count candidates can be future candidates with clear count evidence", () => {
  const candidates = [
    makeCandidate({ candidateKey: "door-count", unit: "doors", category: "door schedule count candidates" }),
    makeCandidate({ candidateKey: "window-count", unit: "windows", category: "window schedule count candidates" }),
    makeCandidate({ candidateKey: "fixture-count", unit: "fixtures", category: "fixture schedule count candidates" }),
  ]
  const gates = buildTradeQuantityCandidateGates(candidates)

  assert.equal(gates.length, 3)
  assert(gates.every((gate) => gate.gateStatus === "future_candidate"))
  assert(gates.every((gate) => gate.futureEligible === true))
  assert(gates.every((gate) => gate.pricingEligibleNow === false))
  assert(gates.every((gate) => gate.blockers.length === 0))
})

test("repeated room package candidates remain review-only or blocked", () => {
  const gate = gateFor(
    makeCandidate({
      candidateKey: "guest-room-repeat-count",
      trade: "general",
      category: "repeated room package count candidates",
      quantity: 3,
      unit: "rooms",
      sourceType: "repeated_room_package",
      assumptions: [
        "3 room rows are represented in this repeated room package.",
        "Repeated-room count is diagnostic only and is not measured quantity support.",
      ],
      warnings: [
        "Candidate only - not measured takeoff support.",
        "Repeated room package candidate is not pricing-eligible in Phase 6.",
      ],
    })
  )

  assert.equal(gate.gateStatus, "review_only")
  assert.equal(gate.pricingEligibleNow, false)
  assert.equal(gate.futureEligible, false)
  assert(gate.blockers.some((blocker) => /repeated room package counts/i.test(blocker)))
})

test("weak or no-source candidates are blocked", () => {
  const gate = gateFor(
    makeCandidate({
      candidateKey: "weak-count",
      confidence: 42,
      sourceRefs: [],
      warnings: [
        "Candidate only - not measured takeoff support.",
        "Candidate warnings include unclear source rows.",
      ],
    })
  )

  assert.equal(gate.gateStatus, "blocked")
  assert.equal(gate.pricingEligibleNow, false)
  assert(gate.blockers.some((blocker) => /no usable source provenance/i.test(blocker)))
  assert(gate.blockers.some((blocker) => /confidence/i.test(blocker)))
})

test("every gate keeps pricingEligibleNow false", () => {
  const gates = buildTradeQuantityCandidateGates([
    makeCandidate(),
    makeCandidate({
      candidateKey: "finish-row",
      sourceType: "finish_matrix",
      unit: "rooms",
      quantityStatus: "needs_measurement",
    }),
    makeCandidate({
      candidateKey: "repeat-row",
      sourceType: "repeated_room_package",
      unit: "rooms",
    }),
  ])

  assert(gates.length > 0)
  assert(gates.every((gate) => gate.pricingEligibleNow === false))
})

test("live trade pricing influence ignores candidate gate diagnostics", () => {
  const basePlan: PlanIntelligence = {
    ok: true,
    uploadsCount: 0,
    pagesCount: 0,
    indexedPagesCount: 0,
    selectedPagesCount: 0,
    skippedPagesCount: 0,
    sheetIndex: [],
    analyses: [],
    takeoff: {
      floorSqft: null,
      wallSqft: null,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
    scopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
      conflicts: [],
    },
    evidence: {
      summaryRefs: [],
      quantityRefs: [],
      riskRefs: [],
    },
    detectedTrades: [],
    detectedRooms: [],
    summary: "",
    confidenceScore: 0,
  }
  const withGates: PlanIntelligence = {
    ...basePlan,
    tradeQuantityCandidateGates: buildTradeQuantityCandidateGates([makeCandidate()]),
  }

  const influenceArgs = {
    trade: "painting",
    scopeText: "Paint guest rooms.",
    measurements: null,
    paintScope: null,
    tradeStack: null,
    complexityProfile: null,
  }

  assert.deepEqual(
    buildLiveTradePricingInfluence({ ...influenceArgs, planIntelligence: basePlan }),
    buildLiveTradePricingInfluence({ ...influenceArgs, planIntelligence: withGates })
  )
})
