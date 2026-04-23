import assert from "node:assert/strict"
import test from "node:test"

import type { PlanIntelligence, PlanSheetAnalysis } from "../plans/types"
import { buildLiveTradePricingInfluence } from "./liveTradePricingInfluence"
import type { ComplexityProfile, MeasurementInput, TradeStack } from "./types"

const defaultComplexity: ComplexityProfile = {
  class: "remodel",
  requireDaysBasis: true,
  permitLikely: false,
  multiPhase: false,
  multiTrade: false,
  hasDemo: false,
  notes: [],
  minCrewDays: 1,
  maxCrewDays: 5,
  minMobilization: 0,
  minSubs: 0,
  crewSizeMin: 1,
  crewSizeMax: 3,
  hoursPerDayEffective: 6,
  minPhaseVisits: 1,
}

function makeTradeStack(primaryTrade: string): TradeStack {
  return {
    primaryTrade,
    trades: [primaryTrade],
    activities: [],
    signals: [],
    isMultiTrade: false,
  }
}

function makeAnalysis(overrides: Partial<PlanSheetAnalysis> = {}): PlanSheetAnalysis {
  return {
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    sourcePageNumber: 1,
    pageNumber: 1,
    sheetNumber: "A1.0",
    sheetTitle: "Finish Plan",
    discipline: "finish",
    textSnippets: [],
    notes: [],
    rooms: [],
    schedules: [],
    tradeFindings: [],
    scaleText: null,
    revision: null,
    confidence: 88,
    ...overrides,
  }
}

function makePlan(overrides: Partial<PlanIntelligence> = {}): PlanIntelligence {
  const quantityRef = {
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    sourcePageNumber: 1,
    pageNumber: 1,
    sheetNumber: "A1.0",
    sheetTitle: "Finish Plan",
    excerpt: "Plan quantity reference",
    confidence: 90,
  }

  const takeoff = {
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
    ...(overrides.takeoff || {}),
  }

  const scopeAssist = {
    missingScopeFlags: [],
    suggestedAdditions: [],
    conflicts: [],
    ...(overrides.scopeAssist || {}),
  }

  const evidence = {
    summaryRefs: [quantityRef],
    quantityRefs: [quantityRef],
    riskRefs: [quantityRef],
    ...(overrides.evidence || {}),
  }

  const restOverrides = { ...overrides }
  delete restOverrides.takeoff
  delete restOverrides.scopeAssist
  delete restOverrides.evidence

  return {
    ok: true,
    uploadsCount: 1,
    pagesCount: 1,
    sheetIndex: [],
    analyses: [],
    detectedTrades: [],
    detectedRooms: [],
    summary: "",
    confidenceScore: 60,
    notes: [],
    repeatedSpaceSignals: [],
    likelyRoomTypes: [],
    pricingAnchorSignals: [],
    packageScopeCandidates: [],
    tradePackageSignals: [],
    ...restOverrides,
    takeoff,
    scopeAssist,
    evidence,
  }
}

function makeMeasurements(totalSqft: number): MeasurementInput {
  return {
    units: "ft",
    totalSqft,
    rows: [],
  }
}

test("painting influence upgrades live paint scope and carries section routing when support is strong", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    repeatedSpaceSignals: ["repeated guest room type"],
    tradePackageSignals: ["painting"],
    packageScopeCandidates: ["guest rooms", "corridor"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Paint guest room walls, ceilings, and corridor surfaces."],
        notes: ["Door schedule and finish plan included."],
        schedules: [
          {
            scheduleType: "finish",
            label: "Finish schedule",
            quantity: null,
            notes: ["Paint all guest room walls and ceilings."],
            confidence: 88,
            evidence: [],
          },
          {
            scheduleType: "door",
            label: "Door schedule",
            quantity: 48,
            notes: ["Paint door frames."],
            confidence: 90,
            evidence: [],
          },
        ],
        tradeFindings: [
          {
            trade: "painting",
            label: "Guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 4200,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "painting",
            label: "Guest room ceiling paint area",
            confidence: 90,
            notes: ["Measured guest room ceiling area."],
            quantity: 2100,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "painting",
            label: "Trim and casing footage",
            confidence: 82,
            notes: ["Measured casing and base footage."],
            quantity: 520,
            unit: "linear_ft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 4200,
      ceilingSqft: 2100,
      trimLf: null,
      doorCount: 48,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 24,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint hotel guest rooms and corridor.",
    measurements: makeMeasurements(1800),
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.trade, "painting")
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.paintScopeOverride, "walls_ceilings")
  assert.equal(influence.engineInputs?.painting?.supportedWallSqft, 4200)
  assert.equal(influence.engineInputs?.painting?.supportedCeilingSqft, 2100)
  assert.equal(influence.engineInputs?.painting?.supportedInteriorSqft, null)
  assert.equal(influence.engineInputs?.painting?.supportedRoomCount, null)
  assert.equal(influence.engineInputs?.painting?.supportedDoorCount, 48)
  assert.equal(influence.engineInputs?.painting?.supportedTrimLf, 520)
  assert.ok(influence.executionSections.includes("Ceilings"))
  assert.ok(influence.executionSections.includes("Doors / frames"))
  assert.ok(influence.executionSections.includes("Trim / casing"))
  assert.ok(influence.executionSections.includes("Corridor repaint"))
  assert.ok(influence.executionSections.includes("Prep / protection"))
})

test("painting influence stays non-binding when only descriptive finish cues exist", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    analyses: [makeAnalysis({ notes: ["Review finish schedule for paint colors."] })],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Review paint refresh options.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(influence.engineInputs, undefined)
})

test("painting influence can scale from strong repeated-room support without pretending that support is measured", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    detectedRooms: ["Guest Room", "Corridor"],
    likelyRoomTypes: ["guest room", "corridor"],
    repeatedSpaceSignals: ["repeated guest room type"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repeated guest room repaint package with separate corridor repaint."],
        notes: ["Prototype room repeats across floors."],
        rooms: [
          {
            roomName: "Guest Room 101",
            floorLabel: "L1",
            dimensionsText: null,
            areaSqft: 320,
            confidence: 88,
            evidence: [],
          },
          {
            roomName: "Guest Room 102",
            floorLabel: "L1",
            dimensionsText: null,
            areaSqft: 320,
            confidence: 88,
            evidence: [],
          },
          {
            roomName: "Guest Room 201",
            floorLabel: "L2",
            dimensionsText: null,
            areaSqft: 320,
            confidence: 88,
            evidence: [],
          },
          {
            roomName: "Corridor Level 1",
            floorLabel: "L1",
            dimensionsText: null,
            areaSqft: 500,
            confidence: 80,
            evidence: [],
          },
        ],
        schedules: [
          {
            scheduleType: "door",
            label: "Door schedule",
            quantity: 12,
            notes: ["Guest room door set repeats by room type."],
            confidence: 88,
            evidence: [],
          },
        ],
      }),
    ],
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
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint repeated guest rooms.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.painting?.supportedRoomCount, 3)
  assert.equal(influence.engineInputs?.painting?.interiorBaseSupport, "scaled")
  assert.equal(influence.engineInputs?.painting?.doorCountSupport, "measured")
  assert.equal(influence.engineInputs?.painting?.supportedInteriorSqft, null)
  assert.ok(influence.executionSections.includes("Corridor repaint"))
  assert.ok(
    influence.basisAssumptions.some((item) => /prototype support stayed separate from corridor/i.test(item))
  )
})

test("drywall influence feeds exact supported sqft into live numeric execution and keeps section routing", () => {
  const plan = makePlan({
    detectedTrades: ["drywall"],
    repeatedSpaceSignals: [],
    tradePackageSignals: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install drywall partitions, finish level 4, and include corridor ceilings."],
        tradeFindings: [
          {
            trade: "drywall",
            label: "New drywall partitions",
            confidence: 92,
            notes: ["Level 4 finish."],
            quantity: null,
            unit: "unknown",
            evidence: [],
          },
          {
            trade: "drywall",
            label: "Partition LF",
            confidence: 80,
            notes: [],
            quantity: 180,
            unit: "linear_ft",
            evidence: [],
          },
          {
            trade: "drywall",
            label: "Measured wallboard area",
            confidence: 94,
            notes: ["Board area for partitions only."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            label: "Measured ceiling drywall area",
            confidence: 89,
            notes: ["Ceiling board area."],
            quantity: 400,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            label: "Measured finish texture area",
            confidence: 87,
            notes: ["Level 4 finish area."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1600,
      ceilingSqft: 400,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Drywall tenant improvement.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.trade, "drywall")
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.drywall?.supportedSqft, 2000)
  assert.equal(influence.engineInputs?.drywall?.supportedFinishTextureSqft, 1600)
  assert.equal(influence.engineInputs?.drywall?.forceInstallFinish, true)
  assert.equal(influence.engineInputs?.drywall?.supportedSqftSupport, "measured")
  assert.ok(influence.executionSections.includes("Ceiling drywall"))
})

test("drywall patch cues stay non-binding when plans do not provide measured repair area", () => {
  const plan = makePlan({
    detectedTrades: ["drywall"],
    repeatedSpaceSignals: ["repeated guest room repair pattern"],
    tradePackageSignals: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Patch and repair drywall damage in repeated guest rooms."],
        notes: ["Localized drywall damage only."],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1200,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 14,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Patch and repair drywall in guest rooms.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(influence.engineInputs, undefined)
})

test("wallcovering influence feeds exact area and explicit install-remove routing into live numeric execution", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    repeatedSpaceSignals: ["repeated corridor segment"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Remove corridor wallcovering and install new vinyl wallcovering."],
        notes: ["Corridor wallcovering type W-1."],
        tradeFindings: [
          {
            trade: "general renovation",
            label: "Measured corridor wallcovering area",
            confidence: 93,
            notes: ["Measured corridor elevations only."],
            quantity: 1400,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1400,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 12,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Remove and replace corridor wallcovering.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.trade, "wallcovering")
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.wallcovering?.supportedSqft, 1400)
  assert.equal(influence.engineInputs?.wallcovering?.coverageKind, "corridor_area")
  assert.equal(influence.engineInputs?.wallcovering?.hasRemovalPrepSection, true)
  assert.equal(influence.engineInputs?.wallcovering?.hasInstallSection, true)
  assert.equal(influence.engineInputs?.wallcovering?.hasCorridorSection, true)
  assert.equal(influence.engineInputs?.wallcovering?.materialType, "vinyl")
  assert.equal(influence.engineInputs?.wallcovering?.supportedSqftSupport, "measured")
  assert.ok(influence.executionSections.includes("Removal / prep"))
  assert.ok(influence.executionSections.includes("Corridor wallcovering"))
})

test("wallcovering selected-elevation support stays narrower than gross wall-area fallback", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install new wallcovering at feature wall only."],
        notes: ["Accent wall type W-2."],
        tradeFindings: [
          {
            trade: "general renovation",
            label: "Feature wall wallcovering area",
            confidence: 91,
            notes: ["Selected elevation only."],
            quantity: 180,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1400,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Install vinyl wallcovering at feature wall only.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.wallcovering?.supportedSqft, 180)
  assert.equal(influence.engineInputs?.wallcovering?.coverageKind, "selected_elevation")
})

test("wallcovering feature-wall cues stay non-binding when only gross wall-area fallback exists", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install new wallcovering at feature wall only."],
        notes: ["Accent wall type W-2."],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1400,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Install vinyl wallcovering at feature wall only.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(influence.engineInputs?.wallcovering?.supportedSqft, null)
})

test("wallcovering corridor package cues stay non-binding without an explicit install section", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Corridor wallcovering type W-1 at common areas."],
        notes: ["Finish schedule indicates corridor wallcovering locations."],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 900,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Review corridor wallcovering package.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(influence.engineInputs?.wallcovering?.hasInstallSection, true)
  assert.equal(influence.engineInputs?.wallcovering?.supportedSqft, null)
})

test("wallcovering influence stays non-binding when only generic finish cues exist", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    analyses: [
      makeAnalysis({
        notes: ["Review finish plan for accent wall finish selection."],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Review lobby finish updates.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.trade, "wallcovering")
  assert.equal(influence.canAffectNumericPricing, false)
  assert.ok(!influence.engineInputs?.wallcovering?.supportedSqft)
})
