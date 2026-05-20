import test from "node:test"
import assert from "node:assert/strict"

import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import { detectScopeSignals } from "../priceguard/scopeSignals"
import {
  appendExecutionPlanSentence,
  appendPermitCoordinationSentence,
  appendTradeCoordinationSentence,
  estimateCalendarDaysRange,
  inferPhaseVisitsFromSignals,
  type RoutePromptComplexityProfile,
  type RoutePromptTradeStack,
} from "./routePromptAdjacentDiagnostics"

const scopes = {
  paintingExclusions:
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
  patchAndPaint:
    "Patch drywall access holes, prime repairs, and paint walls.",
  electrical:
    "Electrical rough-in for 4 vanity lights and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied light fixtures. Include permit/inspection coordination, access through open walls, cleanup, and customer approval.",
  bathroomTile:
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include demo, cement board/backer, membrane, cleanup, protection, and customer approval.",
  wallcovering:
    "Install wallcovering in lobby walls with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering. Include layout, pattern match, adhesive, cleanup, protection, and customer approval.",
  carpentry:
    "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain. Include caulk/fill prep for painter, cleanup, and customer approval.",
  trueMixed:
    "Demo, electrical rough-in, plumbing rough-in, drywall, flooring, baseboards, and painting.",
}

function complexity(overrides: Partial<RoutePromptComplexityProfile> = {}): RoutePromptComplexityProfile {
  return {
    class: "simple",
    requireDaysBasis: false,
    permitLikely: false,
    multiPhase: false,
    multiTrade: false,
    hasDemo: false,
    notes: [],
    minCrewDays: 0.5,
    maxCrewDays: 3,
    minMobilization: 175,
    minSubs: 175,
    crewSizeMin: 1,
    crewSizeMax: 2,
    hoursPerDayEffective: 7,
    minPhaseVisits: 1,
    ...overrides,
  }
}

function tradeStack(overrides: Partial<RoutePromptTradeStack> = {}): RoutePromptTradeStack {
  return {
    primaryTrade: "general renovation",
    trades: [],
    activities: [],
    signals: [],
    isMultiTrade: false,
    ...overrides,
  }
}

function scopeFacts(scope: string) {
  return buildEstimatorScopeFacts(scope)
}

test("Case 1 painting exclusions: excluded drywall skim texture wording does not create dry-time signal or patch sequencing", () => {
  assert.deepEqual(detectScopeSignals(scopes.paintingExclusions), {
    needsReturnVisit: false,
  })

  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.paintingExclusions,
    cp: null,
  })
  assert.deepEqual(phase, { visits: 1, phases: [] })

  const description = appendExecutionPlanSentence({
    description: "This Estimate covers painting.",
    documentType: "Estimate",
    trade: "painting",
    cp: null,
    basis: { units: ["days"], quantities: { days: 2 }, crewDays: 2 },
    scopeText: scopes.paintingExclusions,
    tradeStack: null,
    workDaysPerWeek: 5,
  })
  assert.doesNotMatch(description, /patch\/texture|drywall dry|flooring before trim|flooring-paint/i)
})

test("true patch-and-paint keeps patch dry-time and drywall return characterization", () => {
  assert.equal(detectScopeSignals(scopes.patchAndPaint).needsReturnVisit, true)

  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.patchAndPaint,
    cp: null,
  })
  assert.deepEqual(phase, {
    visits: 2,
    phases: ["patch/texture dry time before paint"],
  })

  const calendar = estimateCalendarDaysRange({
    crewDays: 2,
    cp: null,
    trade: "painting",
    tradeStack: null,
    scopeText: scopes.patchAndPaint,
    workDaysPerWeek: 5,
  })
  assert.ok(calendar.rationale.includes("drywall dry/return"))
})

test("Case 4 electrical: by-others drywall does not create dry-time signal while rough-in phase remains characterized", () => {
  assert.deepEqual(detectScopeSignals(scopes.electrical), {
    needsReturnVisit: false,
  })

  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.electrical,
    cp: null,
  })
  assert.deepEqual(phase, {
    visits: 2,
    phases: ["rough-in/relocation"],
  })
})

test("appendTradeCoordinationSentence does not append drywall/carpentry coordination from painting exclusions", () => {
  const description = appendTradeCoordinationSentence(
    "This Estimate covers painting.",
    tradeStack({
      primaryTrade: "painting",
      trades: ["painting", "drywall", "carpentry"],
      activities: ["paint"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.paintingExclusions)
  )

  assert.doesNotMatch(description, /coordination across drywall|coordination across carpentry/i)
  assert.equal(description, "This Estimate covers painting.")
})

test("Case 4 electrical: append helper ignores carpentry/plumbing stack entries unsupported by included facts", () => {
  const description = appendTradeCoordinationSentence(
    "This Estimate covers electrical work.",
    tradeStack({
      primaryTrade: "electrical",
      trades: ["electrical", "carpentry", "plumbing"],
      activities: ["rough-in"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.electrical)
  )

  assert.doesNotMatch(description, /coordination across carpentry|coordination across plumbing/i)
  assert.equal(description, "This Estimate covers electrical work.")
})

test("Case 6 bathroom tile keeps wet-area sequencing while plumbing/glass by others do not append coordination", () => {
  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.bathroomTile,
    cp: null,
  })
  assert.deepEqual(phase, {
    visits: 3,
    phases: ["demolition/removal", "wet-area sequencing/cure time"],
  })

  const description = appendTradeCoordinationSentence(
    "This Estimate covers shower waterproofing and tile.",
    tradeStack({
      primaryTrade: "tile",
      trades: ["tile", "plumbing", "glass"],
      activities: ["waterproofing"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.bathroomTile)
  )
  assert.doesNotMatch(description, /coordination across plumbing|coordination across glass/i)
  assert.equal(description, "This Estimate covers shower waterproofing and tile.")
})

test("Case 7 wallcovering-only scope does not create bathroom tile demo rough-in phase or by-others coordination noise", () => {
  assert.deepEqual(detectScopeSignals(scopes.wallcovering), {
    needsReturnVisit: false,
  })

  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.wallcovering,
    cp: null,
  })
  assert.deepEqual(phase, { visits: 1, phases: [] })

  const description = appendTradeCoordinationSentence(
    "This Estimate covers wallcovering.",
    tradeStack({
      primaryTrade: "wallcovering",
      trades: ["wallcovering", "painting", "electrical", "furniture moving"],
      activities: ["layout"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.wallcovering)
  )
  assert.doesNotMatch(description, /coordination across painting|coordination across electrical|furniture/i)
  assert.equal(description, "This Estimate covers wallcovering.")
})

test("Case 8 baseboard replacement does not create unrelated demo flooring or painting phase text", () => {
  assert.deepEqual(detectScopeSignals(scopes.carpentry), {
    needsReturnVisit: false,
  })

  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.carpentry,
    cp: null,
  })
  assert.deepEqual(phase, { visits: 1, phases: [] })

  const description = appendExecutionPlanSentence({
    description: "This Estimate covers baseboard replacement.",
    documentType: "Estimate",
    trade: "carpentry",
    cp: null,
    basis: { units: ["days"], quantities: { days: 1.5 }, crewDays: 1.5 },
    scopeText: scopes.carpentry,
    tradeStack: null,
    workDaysPerWeek: 5,
  })
  assert.doesNotMatch(description, /demolition\/removal|flooring-paint|drywall/i)

  const coordination = appendTradeCoordinationSentence(
    "This Estimate covers baseboard replacement.",
    tradeStack({
      primaryTrade: "carpentry",
      trades: ["carpentry", "flooring", "painting"],
      activities: ["baseboard replacement"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.carpentry)
  )
  assert.doesNotMatch(coordination, /coordination across flooring|coordination across painting/i)
  assert.equal(coordination, "This Estimate covers baseboard replacement.")
})

test("true mixed renovation keeps multi-phase and coordination characterization", () => {
  const phase = inferPhaseVisitsFromSignals({
    scopeText: scopes.trueMixed,
    cp: null,
  })
  assert.deepEqual(phase, {
    visits: 3,
    phases: [
      "demolition/removal",
      "rough-in/relocation",
      "flooring before trim/baseboard",
      "finish protection / flooring-paint coordination",
    ],
  })

  const calendar = estimateCalendarDaysRange({
    crewDays: 3,
    cp: complexity({ class: "remodel", multiTrade: true, multiPhase: true }),
    trade: "general renovation",
    tradeStack: tradeStack({
      primaryTrade: "general renovation",
      trades: ["electrical", "plumbing", "drywall", "flooring", "carpentry", "painting"],
      activities: ["demolition"],
      isMultiTrade: true,
    }),
    scopeText: scopes.trueMixed,
    workDaysPerWeek: 5,
  })
  assert.ok(calendar.rationale.includes("multi-trade coordination"))
  assert.ok(calendar.rationale.includes("multiple return trips"))

  const description = appendTradeCoordinationSentence(
    "This Estimate covers the renovation scope.",
    tradeStack({
      primaryTrade: "general renovation",
      trades: ["electrical", "plumbing", "drywall", "flooring", "carpentry", "painting"],
      activities: ["demolition", "rough-in"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.trueMixed)
  )
  assert.match(description, /coordination across electrical, plumbing activities/i)
})

test("appendTradeCoordinationSentence does not duplicate existing coordination language", () => {
  const description = appendTradeCoordinationSentence(
    "This Estimate includes coordination across electrical and plumbing activities.",
    tradeStack({
      primaryTrade: "general renovation",
      trades: ["electrical", "plumbing", "drywall"],
      activities: ["rough-in"],
      isMultiTrade: true,
    }),
    scopeFacts(scopes.trueMixed)
  )

  assert.equal(
    description,
    "This Estimate includes coordination across electrical and plumbing activities."
  )
})

test("appendPermitCoordinationSentence appends permit coordination when complexity says permit likely", () => {
  const description = appendPermitCoordinationSentence(
    "This Estimate covers electrical work.",
    complexity({ class: "complex", permitLikely: true, multiPhase: true })
  )

  assert.match(description, /permit\/inspection coordination/i)
})
