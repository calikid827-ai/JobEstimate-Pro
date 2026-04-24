import assert from "node:assert/strict"
import test from "node:test"

import type { PlanIntelligence, PlanSheetAnalysis } from "../plans/types"
import {
  buildLiveTradePricingInfluence,
  selectTradeScopedSplitMeasurements,
} from "./liveTradePricingInfluence"
import {
  formatTradeExecutionSectionLabel,
  getTradeExecutionSectionId,
  getTradeExecutionSectionIds,
  type ComplexityProfile,
  type MeasurementInput,
  type TradeStack,
} from "./types"

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

test("typed execution section helpers preserve current output labels", () => {
  assert.equal(formatTradeExecutionSectionLabel("painting", "doors_frames"), "Doors / frames")
  assert.equal(formatTradeExecutionSectionLabel("drywall", "finish_texture"), "Finish / texture")
  assert.equal(formatTradeExecutionSectionLabel("wallcovering", "removal_prep"), "Removal / prep")
  assert.equal(getTradeExecutionSectionId("painting", "Review candidate: doors / frames"), "doors_frames")
  assert.equal(getTradeExecutionSectionId("drywall", "Patch / repair"), "patch_repair")
  assert.deepEqual(
    getTradeExecutionSectionIds("wallcovering", ["Review candidate: feature wall", "Install"]),
    ["feature_wall", "install"]
  )
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

test("painting influence can scale from repeated suite support while keeping lobby/common-area scope separate", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    detectedRooms: ["Suite", "Lobby"],
    likelyRoomTypes: ["suite", "lobby"],
    repeatedSpaceSignals: ["typical suite layout repeats by floor"],
    prototypeSignals: ["suite prototype plan"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Prototype suite repaint package with separate lobby refresh."],
        notes: ["Typical suite repeats by floor and lobby/common areas are separate."],
        rooms: [
          { roomName: "Suite 101", floorLabel: "L1", dimensionsText: null, areaSqft: 540, confidence: 88, evidence: [] },
          { roomName: "Suite 102", floorLabel: "L1", dimensionsText: null, areaSqft: 540, confidence: 88, evidence: [] },
          { roomName: "Suite 201", floorLabel: "L2", dimensionsText: null, areaSqft: 540, confidence: 88, evidence: [] },
          { roomName: "Main Lobby", floorLabel: "L1", dimensionsText: null, areaSqft: 900, confidence: 82, evidence: [] },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint repeated suites and separate lobby/common areas.",
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
  assert.ok(
    influence.basisAssumptions.some((item) => /suite \/ unit/i.test(item))
  )
  assert.ok(
    influence.notes.some((item) => /lobby\/common-area|corridor\/common-area/i.test(item))
  )
})

test("ambiguous repeated-room cues stay non-binding when no single repeatable room type is clear", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    detectedRooms: ["Guest Room", "Suite", "Lobby"],
    likelyRoomTypes: ["guest room", "suite", "lobby"],
    repeatedSpaceSignals: ["prototype room repeats by floor"],
    prototypeSignals: ["typical room prototype"],
    tradePackageSignals: ["painting"],
    takeoff: {
      floorSqft: null,
      wallSqft: null,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 18,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint repeated rooms and common areas.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(influence.engineInputs, undefined)
  assert.ok(
    influence.notes.some((item) => /multiple unit-style room groups|repeat counts are still not hard-supported/i.test(item))
  )
})

test("mixed room-type plans only scale the repeatable guest-room group for painting", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    detectedRooms: ["Guest Room", "Suite", "Lobby"],
    likelyRoomTypes: ["guest room", "suite", "lobby"],
    repeatedSpaceSignals: ["typical guest room layout repeats by floor"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repeated guest room repaint package with one suite upgrade and separate lobby refresh."],
        rooms: [
          { roomName: "Guest Room 101", floorLabel: "L1", dimensionsText: null, areaSqft: 320, confidence: 88, evidence: [] },
          { roomName: "Guest Room 102", floorLabel: "L1", dimensionsText: null, areaSqft: 320, confidence: 88, evidence: [] },
          { roomName: "Guest Room 201", floorLabel: "L2", dimensionsText: null, areaSqft: 320, confidence: 88, evidence: [] },
          { roomName: "Suite 401", floorLabel: "L4", dimensionsText: null, areaSqft: 620, confidence: 85, evidence: [] },
          { roomName: "Lobby", floorLabel: "L1", dimensionsText: null, areaSqft: 900, confidence: 82, evidence: [] },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint repeated guest rooms, one suite, and lobby common areas.",
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
})

test("shared-plan repeated guest-room painting support does not leak into drywall or wallcovering rows", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall", "wallcovering"],
    detectedRooms: ["Guest Room", "Corridor"],
    likelyRoomTypes: ["guest room", "corridor"],
    repeatedSpaceSignals: ["typical guest room layout repeats by floor"],
    tradePackageSignals: ["painting", "drywall", "wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint repeated guest rooms with separate corridor work."],
        rooms: [
          { roomName: "Guest Room 101", floorLabel: "L1", dimensionsText: null, areaSqft: 320, confidence: 88, evidence: [] },
          { roomName: "Guest Room 102", floorLabel: "L1", dimensionsText: null, areaSqft: 320, confidence: 88, evidence: [] },
          { roomName: "Guest Room 201", floorLabel: "L2", dimensionsText: null, areaSqft: 320, confidence: 88, evidence: [] },
          { roomName: "Corridor Level 1", floorLabel: "L1", dimensionsText: null, areaSqft: 500, confidence: 80, evidence: [] },
        ],
      }),
    ],
  })

  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint repeated guest rooms and corridor common areas.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })
  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Review guest room drywall scope.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })
  const wallcoveringInfluence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Review guest room wallcovering scope.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(paintingInfluence)
  assert.equal(paintingInfluence.engineInputs?.painting?.supportedRoomCount, 3)
  assert.equal(paintingInfluence.engineInputs?.painting?.interiorBaseSupport, "scaled")
  assert.ok(drywallInfluence)
  assert.equal(drywallInfluence.canAffectNumericPricing, false)
  assert.equal(drywallInfluence.engineInputs, undefined)
  assert.ok(wallcoveringInfluence)
  assert.equal(wallcoveringInfluence.canAffectNumericPricing, false)
  assert.equal(wallcoveringInfluence.engineInputs?.wallcovering?.supportedSqft, null)
  assert.match(
    wallcoveringInfluence.engineInputs?.wallcovering?.blocker || "",
    /no exact supported wall area/i
  )
})

test("strong typed painting evidence beats weak drywall wording in a shared-plan scenario", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall"],
    tradePackageSignals: ["painting", "drywall review"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint guest rooms. Review adjacent drywall only if needed."],
        notes: ["Drywall wording is descriptive only."],
        tradeFindings: [
          {
            trade: "painting",
            category: "wall_area",
            label: "Measured guest room wall paint area",
            confidence: 94,
            notes: ["Measured guest room walls only."],
            quantity: 2200,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "painting",
            category: "ceiling_area",
            label: "Measured guest room ceiling paint area",
            confidence: 91,
            notes: ["Measured guest room ceilings."],
            quantity: 1100,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint guest rooms.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })
  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Review drywall only if needed.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(paintingInfluence)
  assert.equal(paintingInfluence.supportLevel, "strong")
  assert.equal(paintingInfluence.canAffectNumericPricing, true)
  assert.ok(
    paintingInfluence.basisAssumptions.some((item) => /painting trade certainty stayed strong/i.test(item))
  )
  assert.ok(drywallInfluence)
  assert.equal(drywallInfluence.supportLevel, "weak")
  assert.equal(drywallInfluence.canAffectNumericPricing, false)
  assert.ok(
    drywallInfluence.basisAssumptions.some((item) => /drywall wording was present, but wording alone stayed low-authority|drywall trade certainty stayed weak/i.test(item))
  )
})

test("strong measured drywall assembly evidence beats weak painting wording", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall"],
    tradePackageSignals: ["paint review", "drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install new drywall partitions with finish. Paint review only."],
        tradeFindings: [
          {
            trade: "drywall",
            category: "assembly_area",
            label: "Measured wallboard area",
            confidence: 95,
            notes: ["Partition board area."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            category: "finish_texture_area",
            label: "Measured finish texture area",
            confidence: 90,
            notes: ["Level 4 finish area."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Install drywall partitions with finish.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })
  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Review paint only if needed.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(drywallInfluence)
  assert.equal(drywallInfluence.supportLevel, "strong")
  assert.equal(drywallInfluence.canAffectNumericPricing, true)
  assert.ok(
    drywallInfluence.basisAssumptions.some((item) => /drywall trade certainty stayed strong/i.test(item))
  )
  assert.ok(paintingInfluence)
  assert.equal(paintingInfluence.supportLevel, "weak")
  assert.equal(paintingInfluence.canAffectNumericPricing, false)
})

test("wallcovering corridor evidence stays trade-specific without inflating painting certainty", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "wallcovering"],
    tradePackageSignals: ["paint review", "wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Replace corridor wallcovering. Paint review only."],
        notes: ["Vinyl corridor wallcovering type W-1."],
        tradeFindings: [
          {
            trade: "wallcovering",
            category: "corridor_area",
            label: "Measured corridor wallcovering area",
            confidence: 93,
            notes: ["Measured corridor elevations only."],
            quantity: 900,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 3000,
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

  const wallcoveringInfluence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Remove and replace corridor wallcovering.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })
  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Review paint only if needed.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(wallcoveringInfluence)
  assert.equal(wallcoveringInfluence.supportLevel, "moderate")
  assert.equal(wallcoveringInfluence.canAffectNumericPricing, true)
  assert.ok(
    wallcoveringInfluence.basisAssumptions.some((item) => /wallcovering trade certainty stayed strong/i.test(item))
  )
  assert.ok(paintingInfluence)
  assert.equal(paintingInfluence.supportLevel, "weak")
  assert.equal(paintingInfluence.canAffectNumericPricing, false)
})

test("weak wording-only trade cues stay non-binding when typed or measured evidence is absent", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall", "wallcovering"],
    tradePackageSignals: ["possible paint", "possible drywall", "possible wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Review possible paint, drywall, and wallcovering scope."],
        notes: ["No measured findings or schedules yet."],
      }),
    ],
  })

  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Review possible paint scope.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })
  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Review possible drywall scope.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })
  const wallcoveringInfluence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Review possible wallcovering scope.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  for (const influence of [paintingInfluence, drywallInfluence, wallcoveringInfluence]) {
    assert.ok(influence)
    assert.equal(influence.supportLevel, "weak")
    assert.equal(influence.canAffectNumericPricing, false)
    assert.ok(
      influence.basisAssumptions.some((item) => /trade certainty stayed weak/i.test(item))
    )
  }
})

test("multi-trade split allocation keeps measured painting support isolated from drywall install quantities", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall"],
    tradePackageSignals: ["painting", "drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint guest rooms and install new drywall partitions."],
        tradeFindings: [
          {
            trade: "painting",
            category: "wall_area",
            label: "Guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            category: "assembly_area",
            label: "Measured wallboard area",
            confidence: 94,
            notes: ["New partition board area."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 4200,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 10,
      sourceNotes: [],
    },
  })

  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint guest rooms.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })
  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Install new drywall partitions with finish.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "painting",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: paintingInfluence,
      hasPlanIntelligence: true,
    }),
    null
  )
  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "drywall",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: drywallInfluence,
      hasPlanIntelligence: true,
    }),
    { totalSqft: 1600 }
  )
})

test("multi-trade split allocation keeps corridor wallcovering area from inflating painting rows", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "wallcovering"],
    tradePackageSignals: ["painting", "wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint guest rooms and replace corridor wallcovering."],
        tradeFindings: [
          {
            trade: "painting",
            category: "wall_area",
            label: "Measured guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "wallcovering",
            category: "corridor_area",
            label: "Measured corridor wallcovering area",
            confidence: 93,
            notes: ["Measured corridor elevations only."],
            quantity: 900,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 4200,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 10,
      sourceNotes: [],
    },
  })

  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint guest rooms.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })
  const wallcoveringInfluence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Remove and replace corridor wallcovering.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "painting",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: paintingInfluence,
      hasPlanIntelligence: true,
    }),
    null
  )
  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "wallcovering",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: wallcoveringInfluence,
      hasPlanIntelligence: true,
    }),
    null
  )
})

test("mixed shared-plan allocation leaves unsupported split trades non-binding instead of using generic fallback sqft", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall", "wallcovering"],
    tradePackageSignals: ["painting", "drywall", "wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint guest rooms and review related scope."],
        tradeFindings: [
          {
            trade: "painting",
            category: "wall_area",
            label: "Measured guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 4200,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 10,
      sourceNotes: [],
    },
  })

  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint guest rooms.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })
  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Review drywall scope.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })
  const wallcoveringInfluence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText: "Review wallcovering scope.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "painting",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: paintingInfluence,
      hasPlanIntelligence: true,
    }),
    null
  )
  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "drywall",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: drywallInfluence,
      hasPlanIntelligence: true,
    }),
    null
  )
  assert.deepEqual(
    selectTradeScopedSplitMeasurements({
      trade: "wallcovering",
      fallbackMeasurements: { totalSqft: 4200 },
      influence: wallcoveringInfluence,
      hasPlanIntelligence: true,
    }),
    null
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
  assert.ok(
    influence.basisAssumptions.some((item) => /no measured repair area/i.test(item))
  )
})

test("drywall install-like wording stays non-binding when only generic wall takeoff exists", () => {
  const plan = makePlan({
    detectedTrades: ["drywall"],
    tradePackageSignals: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install new drywall partitions with finish at corridor walls."],
        notes: ["Scope language suggests install and finish, but no measured drywall findings are present."],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1800,
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
    trade: "drywall",
    scopeText: "Install new drywall partitions with finish.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(influence.engineInputs, undefined)
  assert.ok(
    influence.basisAssumptions.some((item) => /generic wall takeoff/i.test(item))
  )
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
  assert.match(
    influence.engineInputs?.wallcovering?.blocker || "",
    /no exact supported wall area/i
  )
})

test("wallcovering full-area findings stay non-binding when feature-wall scope remains narrower", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install new wallcovering at feature wall only."],
        notes: ["Accent wall type W-2."],
        tradeFindings: [
          {
            trade: "wallcovering",
            category: "wall_area",
            label: "Measured wallcovering area",
            confidence: 90,
            notes: ["General wall area only; feature wall scope is called out elsewhere."],
            quantity: 900,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
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
  assert.match(
    influence.engineInputs?.wallcovering?.blocker || "",
    /no exact supported wall area/i
  )
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

test("measured flooring floor-area support drives flooring rows without wall-tile inflation", () => {
  const plan = makePlan({
    detectedTrades: ["flooring", "tile"],
    tradePackageSignals: ["flooring"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Replace flooring in guest rooms only."],
        tradeFindings: [
          {
            trade: "flooring",
            category: "floor_area",
            label: "Measured guest room flooring area",
            confidence: 93,
            notes: ["Measured finished floor area only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: 1800,
      wallSqft: 2600,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 10,
      sourceNotes: [],
    },
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "flooring",
    scopeText: "Replace guest room flooring.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("flooring"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.trade, "flooring")
  assert.equal(influence.supportLevel, "strong")
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.flooring?.supportedFloorSqft, 1800)
  assert.equal(influence.engineInputs?.flooring?.supportedWallTileSqft, null)
  assert.ok(influence.executionSections.includes("Flooring"))
  assert.ok(!influence.executionSections.includes("Wall tile"))
})

test("shower / wet-area tile support stays separate from general floor tile scope", () => {
  const plan = makePlan({
    detectedTrades: ["tile", "flooring"],
    tradePackageSignals: ["tile"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Tile shower walls and replace adjacent bathroom floor tile."],
        tradeFindings: [
          {
            trade: "tile",
            category: "shower_tile_area",
            label: "Measured shower tile area",
            confidence: 94,
            notes: ["Measured shower wall elevations only."],
            quantity: 220,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "flooring",
            category: "floor_area",
            label: "Measured bathroom floor tile area",
            confidence: 91,
            notes: ["Measured bathroom floor tile only."],
            quantity: 90,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "flooring",
    scopeText: "Install shower wall tile and bathroom floor tile.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("flooring"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.flooring?.supportedFloorSqft, 90)
  assert.equal(influence.engineInputs?.flooring?.supportedShowerTileSqft, 220)
  assert.equal(influence.engineInputs?.flooring?.wetAreaContext, true)
  assert.ok(influence.executionSections.includes("Shower tile"))
  assert.ok(
    influence.basisAssumptions.some((item) => /wet-area tile/i.test(item))
  )
})

test("backsplash tile support stays narrower than broad kitchen wall fallback", () => {
  const plan = makePlan({
    detectedTrades: ["tile"],
    tradePackageSignals: ["tile"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install kitchen backsplash tile only."],
        tradeFindings: [
          {
            trade: "tile",
            category: "backsplash_area",
            label: "Measured backsplash tile area",
            confidence: 92,
            notes: ["Measured backsplash area only."],
            quantity: 48,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 460,
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
    trade: "flooring",
    scopeText: "Install backsplash tile only.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("flooring"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.flooring?.supportedBacksplashSqft, 48)
  assert.equal(influence.engineInputs?.flooring?.supportedFloorSqft, null)
  assert.ok(influence.executionSections.includes("Backsplash tile"))
})

test("flooring/tile demolition stays non-binding without sufficient measured support", () => {
  const plan = makePlan({
    detectedTrades: ["flooring"],
    tradePackageSignals: ["flooring"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Remove existing flooring and prep substrate."],
        notes: ["Removal and prep only; no measured area."],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "flooring",
    scopeText: "Remove flooring and prep substrate.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("flooring"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.ok(
    influence.basisAssumptions.some((item) => /removal\/demo stayed non-binding/i.test(item))
  )
})

test("mixed flooring and painting shared-plan scenario keeps flooring evidence trade-specific", () => {
  const plan = makePlan({
    detectedTrades: ["flooring", "painting"],
    tradePackageSignals: ["flooring", "painting review"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Replace flooring in guest rooms. Paint review only."],
        tradeFindings: [
          {
            trade: "flooring",
            category: "floor_area",
            label: "Measured guest room flooring area",
            confidence: 93,
            notes: ["Measured flooring only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const flooringInfluence = buildLiveTradePricingInfluence({
    trade: "flooring",
    scopeText: "Replace guest room flooring.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("flooring"),
    complexityProfile: defaultComplexity,
  })
  const paintingInfluence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Review paint only if needed.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(flooringInfluence)
  assert.equal(flooringInfluence.supportLevel, "strong")
  assert.equal(flooringInfluence.canAffectNumericPricing, true)
  assert.ok(paintingInfluence)
  assert.equal(paintingInfluence.supportLevel, "weak")
  assert.equal(paintingInfluence.canAffectNumericPricing, false)
})

test("mixed tile and drywall shared-plan scenario keeps shower/wall tile evidence from inflating drywall certainty", () => {
  const plan = makePlan({
    detectedTrades: ["tile", "drywall"],
    tradePackageSignals: ["tile", "drywall review"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Tile shower walls. Review adjacent drywall only if needed."],
        tradeFindings: [
          {
            trade: "tile",
            category: "shower_tile_area",
            label: "Measured shower tile area",
            confidence: 94,
            notes: ["Measured shower wall elevations only."],
            quantity: 180,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const flooringInfluence = buildLiveTradePricingInfluence({
    trade: "flooring",
    scopeText: "Install shower wall tile.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("flooring"),
    complexityProfile: defaultComplexity,
  })
  const drywallInfluence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Review adjacent drywall only if needed.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(flooringInfluence)
  assert.equal(flooringInfluence.supportLevel, "strong")
  assert.equal(flooringInfluence.engineInputs?.flooring?.supportedShowerTileSqft, 180)
  assert.ok(drywallInfluence)
  assert.equal(drywallInfluence.supportLevel, "weak")
  assert.equal(drywallInfluence.canAffectNumericPricing, false)
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

test("typed painting findings can drive live support without relying on freeform labels", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Paint guest room surfaces per finish package."],
        tradeFindings: [
          {
            trade: "painting",
            category: "wall_area",
            label: "Area A",
            confidence: 92,
            notes: ["Guest room finish package quantity."],
            quantity: 2400,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "painting",
            category: "ceiling_area",
            label: "Area B",
            confidence: 90,
            notes: ["Ceiling finish package quantity."],
            quantity: 1200,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "painting",
            category: "door_openings",
            label: "Opening set",
            confidence: 88,
            notes: ["Door package quantity."],
            quantity: 24,
            unit: "doors",
            evidence: [],
          },
          {
            trade: "painting",
            category: "trim_lf",
            label: "Linear set",
            confidence: 86,
            notes: ["Trim package quantity."],
            quantity: 360,
            unit: "linear_ft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint guest room walls, ceilings, doors, and trim.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.painting?.supportedWallSqft, 2400)
  assert.equal(influence.engineInputs?.painting?.supportedCeilingSqft, 1200)
  assert.equal(influence.engineInputs?.painting?.supportedDoorCount, 24)
  assert.equal(influence.engineInputs?.painting?.supportedTrimLf, 360)
})

test("typed drywall findings can drive assembly routing without relying on freeform labels", () => {
  const plan = makePlan({
    detectedTrades: ["drywall"],
    tradePackageSignals: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Drywall tenant improvement package."],
        tradeFindings: [
          {
            trade: "drywall",
            category: "assembly_area",
            label: "Area A",
            confidence: 94,
            notes: ["Partition board package quantity."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            category: "finish_texture_area",
            label: "Area B",
            confidence: 90,
            notes: ["Finish package quantity."],
            quantity: 1600,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            category: "ceiling_area",
            label: "Area C",
            confidence: 88,
            notes: ["Ceiling board package quantity."],
            quantity: 400,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
            category: "partition_lf",
            label: "Linear D",
            confidence: 84,
            notes: ["Partition layout quantity."],
            quantity: 180,
            unit: "linear_ft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Install new drywall partitions with level 4 finish and ceiling drywall.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.drywall?.supportedSqft, 2000)
  assert.equal(influence.engineInputs?.drywall?.supportedFinishTextureSqft, 1600)
  assert.equal(influence.engineInputs?.drywall?.supportedPartitionLf, 180)
  assert.equal(influence.engineInputs?.drywall?.supportedSqftSupport, "measured")
})

test("typed wallcovering findings can keep selected-elevation support narrower than gross fallback", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install vinyl wallcovering at feature wall only."],
        tradeFindings: [
          {
            trade: "general renovation",
            category: "selected_elevation_area",
            label: "Area E",
            confidence: 91,
            notes: ["Feature package quantity."],
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

test("legacy label-based findings still remain compatible without typed categories", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    analyses: [
      makeAnalysis({
        tradeFindings: [
          {
            trade: "painting",
            label: "Measured guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 1200,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Repaint guest room walls.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.painting?.supportedWallSqft, 1200)
})

test("electrical counted schedule support beats wording-only electrical review cues", () => {
  const strongPlan = makePlan({
    detectedTrades: ["electrical", "drywall"],
    tradePackageSignals: ["electrical device refresh"],
    analyses: [
      makeAnalysis({
        discipline: "electrical",
        textSnippets: ["Electrical schedule with receptacles and switches."],
        schedules: [
          {
            scheduleType: "electrical",
            label: "Electrical schedule: 12 receptacles, 8 switches, 4 fixtures",
            quantity: 24,
            notes: ["Device count extracted from sheet."],
            confidence: 91,
            evidence: [],
          },
        ],
        tradeFindings: [
          {
            trade: "electrical",
            category: "device_count",
            label: "Electrical schedule device count",
            quantity: 24,
            unit: "devices",
            notes: ["Counted devices from plan schedule."],
            confidence: 92,
            evidence: [],
          },
        ],
      }),
      makeAnalysis({
        discipline: "architectural",
        textSnippets: ["Review drywall around devices."],
      }),
    ],
  })

  const strongElectrical = buildLiveTradePricingInfluence({
    trade: "electrical",
    scopeText: "Electrical review for switches and receptacles.",
    measurements: null,
    paintScope: null,
    planIntelligence: strongPlan,
    tradeStack: makeTradeStack("electrical"),
    complexityProfile: defaultComplexity,
  })

  const weakDrywall = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText: "Patch drywall near devices as needed.",
    measurements: null,
    paintScope: null,
    planIntelligence: strongPlan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(strongElectrical)
  assert.equal(strongElectrical.canAffectNumericPricing, true)
  assert.equal(strongElectrical.engineInputs?.electrical?.supportedDeviceCount, 24)
  assert.ok(strongElectrical.basisAssumptions.some((item) => /24 counted devices/i.test(item)))
  assert.ok(weakDrywall)
  assert.equal(weakDrywall.canAffectNumericPricing, false)
})

test("plumbing fixture-count support beats wording-only plumbing review cues", () => {
  const plan = makePlan({
    detectedTrades: ["plumbing"],
    analyses: [
      makeAnalysis({
        discipline: "plumbing",
        textSnippets: ["Fixture schedule for bathroom trim-out."],
        schedules: [
          {
            scheduleType: "fixture",
            label: "Fixture schedule: 2 toilets, 3 faucets",
            quantity: 5,
            notes: ["Fixture count extracted from plan."],
            confidence: 90,
            evidence: [],
          },
        ],
        tradeFindings: [
          {
            trade: "plumbing",
            category: "plumbing_fixture_count",
            label: "Plumbing fixture schedule count",
            quantity: 5,
            unit: "fixtures",
            notes: ["Counted plumbing fixtures from plan schedule."],
            confidence: 91,
            evidence: [],
          },
        ],
      }),
    ],
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "plumbing",
    scopeText: "Plumbing fixture trim-out review.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("plumbing"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.plumbing?.supportedFixtureCount, 5)
  assert.ok(influence.basisAssumptions.some((item) => /counted fixtures/i.test(item)))
})

test("weak wording-only electrical and plumbing cues stay non-binding without counted evidence", () => {
  const plan = makePlan({
    detectedTrades: ["electrical", "plumbing"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Electrical review as required."],
        notes: ["Plumbing review as needed."],
      }),
    ],
  })

  const electrical = buildLiveTradePricingInfluence({
    trade: "electrical",
    scopeText: "Review electrical rough-in as needed.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("electrical"),
    complexityProfile: defaultComplexity,
  })
  const plumbing = buildLiveTradePricingInfluence({
    trade: "plumbing",
    scopeText: "Review plumbing trim-out as needed.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("plumbing"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(electrical)
  assert.equal(electrical.canAffectNumericPricing, false)
  assert.match(electrical.engineInputs?.electrical?.blocker || "", /non-binding/i)
  assert.ok(plumbing)
  assert.equal(plumbing.canAffectNumericPricing, false)
  assert.match(plumbing.engineInputs?.plumbing?.blocker || "", /non-binding/i)
})

test("counted bathroom and kitchen support stays isolated by trade in shared-plan scenarios", () => {
  const plan = makePlan({
    detectedTrades: ["plumbing", "electrical", "painting"],
    analyses: [
      makeAnalysis({
        discipline: "plumbing",
        textSnippets: ["Bathroom fixture schedule."],
        tradeFindings: [
          {
            trade: "plumbing",
            category: "plumbing_fixture_count",
            label: "Bathroom fixture schedule count",
            quantity: 4,
            unit: "fixtures",
            notes: ["Bathroom fixture count."],
            confidence: 89,
            evidence: [],
          },
        ],
      }),
      makeAnalysis({
        discipline: "electrical",
        textSnippets: ["Kitchen electrical schedule."],
        tradeFindings: [
          {
            trade: "electrical",
            category: "device_count",
            label: "Kitchen electrical device count",
            quantity: 10,
            unit: "devices",
            notes: ["Kitchen electrical count."],
            confidence: 88,
            evidence: [],
          },
        ],
      }),
      makeAnalysis({
        discipline: "finish",
        textSnippets: ["Paint touch-up around vanity and kitchen walls."],
      }),
    ],
  })

  const plumbing = buildLiveTradePricingInfluence({
    trade: "plumbing",
    scopeText: "Plumbing fixture trim-out.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("plumbing"),
    complexityProfile: defaultComplexity,
  })
  const electrical = buildLiveTradePricingInfluence({
    trade: "electrical",
    scopeText: "Electrical device trim-out.",
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("electrical"),
    complexityProfile: defaultComplexity,
  })
  const painting = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText: "Paint touch-up around bathroom and kitchen work.",
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  assert.ok(plumbing)
  assert.equal(plumbing.engineInputs?.plumbing?.supportedFixtureCount, 4)
  assert.ok(electrical)
  assert.equal(electrical.engineInputs?.electrical?.supportedDeviceCount, 10)
  assert.ok(painting)
  assert.equal(painting.canAffectNumericPricing, false)
})
