import assert from "node:assert/strict"
import test from "node:test"

import { computeDrywallDeterministic } from "../priceguard/drywallEngine"
import { computePaintingDeterministic } from "../priceguard/paintingEngine"
import { computeWallcoveringDeterministic } from "../priceguard/wallcoveringEngine"
import type { PlanIntelligence, PlanSheetAnalysis } from "../plans/types"
import { buildLiveTradePricingInfluence, mergeLiveTradePricingInfluenceIntoBasis } from "./liveTradePricingInfluence"
import { decidePricingOwner } from "./pricingOwner"
import type {
  ComplexityProfile,
  MeasurementInput,
  PricingOwnerContext,
  TradeStack,
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
    ...overrides,
  }
}

function makeMeasurements(totalSqft: number): MeasurementInput {
  return {
    units: "ft",
    totalSqft,
    rows: [],
  }
}

function makeOwnerContext(
  overrides: Partial<PricingOwnerContext> = {}
): PricingOwnerContext {
  return {
    trade: "painting",
    effectivePaintScope: "walls",
    useBigJobPricing: false,
    anchorHit: null,
    multiTradeDet: {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      perTrade: [],
      notes: [],
    },
    paintingDet: null,
    wallcoveringDet: null,
    flooringDet: null,
    electricalDet: null,
    plumbingDet: null,
    drywallDet: null,
    mixedPaintPricing: null,
    doorPricing: null,
    bigJobPricing: null,
    photoPaintPricing: null,
    ...overrides,
  }
}

function sumSectionTotals(basis: { sectionPricing?: Array<{ total: number }> } | null | undefined): number {
  return (basis?.sectionPricing || []).reduce((sum, section) => sum + Number(section.total || 0), 0)
}

test("painting live seam changes real totals and carries estimateBasis through owner resolution", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    repeatedSpaceSignals: ["repeated guest room type"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Paint guest room walls, ceilings, doors, trim, and corridor surfaces."],
        notes: ["Door schedule and finish plan included."],
        tradeFindings: [
          {
            trade: "painting",
            label: "Measured guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 4200,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "painting",
            label: "Measured guest room ceiling paint area",
            confidence: 89,
            notes: ["Measured guest room ceiling area."],
            quantity: 2100,
            unit: "sqft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 4200,
      ceilingSqft: 2100,
      trimLf: 480,
      doorCount: 48,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 24,
      sourceNotes: [],
    },
  })

  const scopeText = "Repaint hotel guest rooms and corridor."
  const measurements = makeMeasurements(1800)

  const base = computePaintingDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements,
    paintScope: "walls",
  })

  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText,
    measurements,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computePaintingDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements,
    paintScope: influence?.paintScopeOverride || "walls",
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.painting || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  const decision = decidePricingOwner(
    makeOwnerContext({
      trade: "painting",
      effectivePaintScope: influence?.paintScopeOverride || "walls",
      paintingDet: {
        pricing: planAware.pricing,
        okForVerified: planAware.okForVerified,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: planAwareBasis,
      },
    })
  )

  assert.ok(base.pricing)
  assert.ok(planAware.pricing)
  assert.ok((planAware.pricing?.total || 0) > (base.pricing?.total || 0))
  assert.equal(decision.owner, "painting_engine")
  assert.ok(
    decision.estimateBasis?.assumptions.some(
      (item) => /measured wall sqft|measured ceiling sqft|door opening|trim/i.test(item)
    )
  )
  assert.ok(decision.estimateBasis?.sectionPricing?.some((section) => section.section === "Walls"))
  assert.ok(decision.estimateBasis?.sectionPricing?.some((section) => section.section === "Ceilings"))
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.quantitySupport,
    "measured"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.supportCategory,
    "wall_area"
  )
  assert.match(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.quantityDetail || "",
    /4200 sqft/i
  )
  assert.deepEqual(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.sourceBasis,
    ["trade_finding"]
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Doors / frames")
      ?.provenance?.supportCategory,
    "door_openings"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Trim / casing")
      ?.provenance?.supportCategory,
    "trim_lf"
  )
  assert.equal(sumSectionTotals(decision.estimateBasis), planAware.pricing?.total || 0)
})

test("repeated guest room repaint package can scale from strong repeated-room support without pretending corridor burden is direct room scope", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    repeatedSpaceSignals: ["repeated guest room type"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repeated guest room repaint package with separate corridor/common-area repaint."],
        notes: ["Prototype room repeats across floors and corridor surfaces are called out separately."],
        schedules: [
          {
            scheduleType: "door",
            label: "Door schedule",
            quantity: 18,
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
      doorCount: 18,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 18,
      sourceNotes: [],
    },
  })

  const scopeText = "Repaint repeated guest rooms and corridor common areas."
  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText,
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computePaintingDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    paintScope: influence?.paintScopeOverride || "walls",
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.painting || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.painting?.supportedInteriorSqft, null)
  assert.equal(influence.engineInputs?.painting?.supportedRoomCount, 18)
  assert.equal(influence.engineInputs?.painting?.interiorBaseSupport, "scaled")
  assert.ok(planAware.pricing)
  assert.ok(
    planAwareBasis?.sectionPricing?.some(
      (section) =>
        section.section === "Walls" &&
        section.pricingBasis === "direct" &&
        section.notes?.some((note) => /scaled prototype coverage/i.test(note))
    )
  )
  assert.ok(
    planAwareBasis?.sectionPricing?.some(
      (section) => section.section === "Corridor repaint" && section.pricingBasis === "burden"
    )
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.quantitySupport,
    "scaled_prototype"
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.roomGroupBasis,
    "guest room"
  )
  assert.match(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Walls")?.provenance
      ?.quantityDetail || "",
    /18 repeated guest room/i
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Corridor repaint")
      ?.provenance?.quantitySupport,
    "support_only"
  )
  assert.match(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Corridor repaint")
      ?.provenance?.blockedReason || "",
    /embedded/i
  )
  assert.equal(sumSectionTotals(planAwareBasis), planAware.pricing?.total || 0)
})

test("room-type prototype rollups can drive painting scale support while keeping corridor burden separate", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    detectedRooms: ["Guest Room", "Corridor"],
    likelyRoomTypes: ["guest room", "corridor"],
    repeatedSpaceSignals: ["typical guest room layout repeats by floor"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Prototype guest room repaint package with separate corridor repaint."],
        notes: ["Typical guest room repeats by floor."],
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
            notes: ["Guest room door/frame set repeats by room type."],
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

  const scopeText = "Repaint repeated guest rooms and corridor common areas."
  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText,
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computePaintingDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    paintScope: influence?.paintScopeOverride || "walls",
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.painting || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.painting?.supportedRoomCount, 3)
  assert.equal(influence.engineInputs?.painting?.supportedDoorCount, 12)
  assert.equal(influence.engineInputs?.painting?.interiorBaseSupport, "scaled")
  assert.ok(planAware.pricing)
  assert.ok(
    planAwareBasis?.sectionPricing?.some(
      (section) => section.section === "Corridor repaint" && section.pricingBasis === "burden"
    )
  )
  assert.ok(
    planAwareBasis?.sectionPricing?.some(
      (section) =>
        section.section === "Walls" &&
        section.pricingBasis === "direct" &&
        section.notes?.some((note) => /scaled prototype coverage/i.test(note))
    )
  )
})

test("repeated suite repaint package scales from suite prototypes while keeping lobby/common-area scope separate", () => {
  const plan = makePlan({
    detectedTrades: ["painting"],
    detectedRooms: ["Suite", "Lobby"],
    likelyRoomTypes: ["suite", "lobby"],
    repeatedSpaceSignals: ["typical suite layout repeats by floor"],
    prototypeSignals: ["suite prototype plan"],
    tradePackageSignals: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Prototype suite repaint package with separate lobby/common-area refresh."],
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

  const scopeText = "Repaint repeated suites and separate lobby/common areas."
  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText,
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computePaintingDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    paintScope: influence?.paintScopeOverride || "walls",
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.painting || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.painting?.supportedRoomCount, 3)
  assert.equal(influence.engineInputs?.painting?.interiorBaseSupport, "scaled")
  assert.ok(
    planAwareBasis?.assumptions.some((item) => /suite \/ unit/i.test(item))
  )
  assert.ok(
    influence?.notes.some((item) => /lobby\/common-area|corridor\/common-area/i.test(item))
  )
})

test("ambiguous repeated-room painting cues stay non-binding through the live seam", () => {
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

  const scopeText = "Repaint repeated rooms and common areas."
  const influence = buildLiveTradePricingInfluence({
    trade: "painting",
    scopeText,
    measurements: null,
    paintScope: "walls",
    planIntelligence: plan,
    tradeStack: makeTradeStack("painting"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computePaintingDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    paintScope: influence?.paintScopeOverride || "walls",
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.painting || null : null,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(planAware.pricing, null)
})

test("drywall live seam changes real totals and carries estimateBasis through owner resolution", () => {
  const plan = makePlan({
    detectedTrades: ["drywall"],
    tradePackageSignals: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install drywall partitions, finish level 4, include ceiling drywall and texture match."],
        tradeFindings: [
          {
            trade: "drywall",
            label: "Partition LF",
            confidence: 88,
            notes: [],
            quantity: 180,
            unit: "linear_ft",
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

  const scopeText = "Drywall tenant improvement."
  const influence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText,
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  const base = computeDrywallDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: { totalSqft: 1600 },
    planSectionInputs: {
      supportedSqft: 1600,
      forceInstallFinish: true,
    },
  })

  const planAware = computeDrywallDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: { totalSqft: influence?.engineInputs?.drywall?.supportedSqft || 1600 },
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.drywall || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  const decision = decidePricingOwner(
    makeOwnerContext({
      trade: "drywall",
      drywallDet: {
        pricing: planAware.pricing,
        okForVerified: planAware.okForVerified,
        verifiedSource: "drywall_engine_v1_verified",
        source: "drywall_engine_v1",
        estimateBasis: planAwareBasis,
      },
    })
  )

  assert.ok(base.pricing)
  assert.ok(planAware.pricing)
  assert.ok((planAware.pricing?.total || 0) > (base.pricing?.total || 0))
  assert.equal(decision.owner, "drywall_engine")
  assert.ok(decision.estimateBasis?.assumptions.some((item) => /supported sqft|partition lf|finish/i.test(item)))
  assert.ok((decision.estimateBasis?.sectionPricing?.length || 0) >= 2)
  assert.ok(
    decision.estimateBasis?.sectionPricing?.some(
      (section) => section.section === "Install / hang" && section.pricingBasis === "direct"
    )
  )
  assert.ok(
    decision.estimateBasis?.sectionPricing?.some(
      (section) => section.section === "Partition-related scope" && section.pricingBasis === "burden"
    )
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Install / hang")
      ?.provenance?.quantitySupport,
    "measured"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Install / hang")
      ?.provenance?.supportCategory,
    "assembly_area"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Finish / texture")
      ?.provenance?.supportCategory,
    "finish_texture_area"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Ceiling drywall")
      ?.provenance?.supportCategory,
    "ceiling_area"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find(
      (section) => section.section === "Partition-related scope"
    )?.provenance?.quantitySupport,
    "support_only"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find(
      (section) => section.section === "Partition-related scope"
    )?.provenance?.supportCategory,
    "partition_lf"
  )
  assert.ok(
    !decision.estimateBasis?.sectionPricing?.some((section) => section.section === "Patch / repair")
  )
  assert.equal(sumSectionTotals(decision.estimateBasis), planAware.pricing?.total || 0)
})

test("drywall repeated-room repair scenario stays non-binding without measured repair area through owner resolution", () => {
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

  const scopeText = "Patch and repair drywall in guest rooms."
  const influence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText,
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computeDrywallDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.drywall || null : null,
  })

  const decision = decidePricingOwner(
    makeOwnerContext({
      trade: "drywall",
      drywallDet: planAware.pricing
        ? {
            pricing: planAware.pricing,
            okForVerified: planAware.okForVerified,
            verifiedSource: "drywall_engine_v1_verified",
            source: "drywall_engine_v1",
            estimateBasis: planAware.estimateBasis,
          }
        : null,
    })
  )

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(planAware.pricing, null)
  assert.equal(decision.owner, "ai")
})

test("drywall mixed repair-install scope keeps repair non-binding when only measured assembly and ceiling area exist", () => {
  const plan = makePlan({
    detectedTrades: ["drywall"],
    tradePackageSignals: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repair damaged drywall at select areas and install new partitions with level 4 finish."],
        tradeFindings: [
          {
            trade: "drywall",
            label: "Measured wallboard area",
            confidence: 94,
            notes: ["New partition board area."],
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
          {
            trade: "drywall",
            label: "Partition LF",
            confidence: 88,
            notes: [],
            quantity: 180,
            unit: "linear_ft",
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 2200,
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

  const scopeText = "Repair damaged drywall and install new partitions with level 4 finish."
  const influence = buildLiveTradePricingInfluence({
    trade: "drywall",
    scopeText,
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("drywall"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computeDrywallDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: {
      totalSqft:
        influence?.engineInputs?.drywall?.supportedSqft || 2000,
    },
    planSectionInputs: influence?.canAffectNumericPricing ? influence.engineInputs?.drywall || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, true)
  assert.equal(influence.engineInputs?.drywall?.supportedSqft, 2000)
  assert.equal(influence.engineInputs?.drywall?.supportedFinishTextureSqft, 1600)
  assert.ok(planAware.pricing)
  assert.ok(
    !planAwareBasis?.sectionPricing?.some((section) => section.section === "Patch / repair")
  )
  assert.ok(
    planAwareBasis?.sectionPricing?.some((section) => section.section === "Finish / texture")
  )
  assert.ok(
    planAwareBasis?.sectionPricing?.some(
      (section) => section.section === "Partition-related scope" && section.pricingBasis === "burden"
    )
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Finish / texture")
      ?.provenance?.quantitySupport,
    "measured"
  )
})

test("wallcovering live seam changes real totals and carries estimateBasis through owner resolution", () => {
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

  const scopeText = "Remove and replace corridor wallcovering."
  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText,
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  const installOnly = computeWallcoveringDeterministic({
    scopeText: "Install new vinyl wallcovering at corridor.",
    stateMultiplier: 1,
    measurements: null,
    planSectionInputs: {
      supportedSqft: 1400,
      hasInstallSection: true,
      hasCorridorSection: true,
      materialType: "vinyl",
    },
  })

  const planAware = computeWallcoveringDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    planSectionInputs:
      influence?.canAffectNumericPricing ? influence.engineInputs?.wallcovering || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  const decision = decidePricingOwner(
    makeOwnerContext({
      trade: "wallcovering",
      wallcoveringDet: {
        pricing: planAware.pricing,
        okForVerified: planAware.okForVerified,
        verifiedSource: "wallcovering_engine_v1_verified",
        source: "wallcovering_engine_v1",
        estimateBasis: planAwareBasis,
      },
    })
  )

  assert.ok(installOnly.pricing)
  assert.ok(planAware.pricing)
  assert.ok((planAware.pricing?.total || 0) > (installOnly.pricing?.total || 0))
  assert.equal(decision.owner, "wallcovering_engine")
  assert.ok(decision.estimateBasis?.assumptions.some((item) => /supported wallcovering sqft|Removal \/ prep/i.test(item)))
  assert.ok(decision.estimateBasis?.sectionPricing?.some((section) => section.section === "Install"))
  assert.ok(
    decision.estimateBasis?.sectionPricing?.some((section) => section.section === "Removal / prep")
  )
  assert.ok(
    decision.estimateBasis?.sectionPricing?.some(
      (section) => section.section === "Corridor burden" && section.pricingBasis === "burden"
    )
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Install")
      ?.provenance?.quantitySupport,
    "measured"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Install")
      ?.provenance?.supportCategory,
    "corridor_area"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Corridor burden")
      ?.provenance?.quantitySupport,
    "support_only"
  )
  assert.match(
    decision.estimateBasis?.sectionPricing?.find((section) => section.section === "Corridor burden")
      ?.provenance?.blockedReason || "",
    /embedded/i
  )
  assert.equal(sumSectionTotals(decision.estimateBasis), planAware.pricing?.total || 0)
})

test("wallcovering selected-elevation scope stays narrower than gross fallback through owner resolution", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Install vinyl wallcovering at feature wall only."],
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

  const scopeText = "Install vinyl wallcovering at feature wall only."
  const influence = buildLiveTradePricingInfluence({
    trade: "wallcovering",
    scopeText,
    measurements: null,
    paintScope: null,
    planIntelligence: plan,
    tradeStack: makeTradeStack("wallcovering"),
    complexityProfile: defaultComplexity,
  })

  const planAware = computeWallcoveringDeterministic({
    scopeText,
    stateMultiplier: 1,
    measurements: null,
    planSectionInputs:
      influence?.canAffectNumericPricing ? influence.engineInputs?.wallcovering || null : null,
  })

  const planAwareBasis = mergeLiveTradePricingInfluenceIntoBasis({
    basis: planAware.estimateBasis,
    influence: influence!,
  })

  assert.ok(influence)
  assert.equal(influence.engineInputs?.wallcovering?.supportedSqft, 180)
  assert.equal(influence.engineInputs?.wallcovering?.coverageKind, "selected_elevation")
  assert.ok(planAware.pricing)
  assert.ok(
    planAwareBasis?.assumptions.some((item) => /selected-elevation sqft/i.test(item))
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Install")?.provenance
      ?.summary,
    "Direct wallcovering row is backed by measured selected-elevation area."
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Install")?.provenance
      ?.supportCategory,
    "selected_elevation_area"
  )
  assert.equal(
    planAwareBasis?.sectionPricing?.find((section) => section.section === "Install")?.provenance
      ?.coverageKind,
    "selected_elevation"
  )
})

test("shared-plan painting and drywall influences keep trade-safe quantities isolated in multi-trade style allocation", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "drywall"],
    detectedRooms: ["Guest Room", "Corridor"],
    likelyRoomTypes: ["guest room", "corridor"],
    repeatedSpaceSignals: ["typical guest room layout repeats by floor"],
    tradePackageSignals: ["painting", "drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint guest rooms and install new drywall partitions at corridors."],
        notes: ["Guest room repaint repeats by floor."],
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
            roomName: "Corridor Level 1",
            floorLabel: "L1",
            dimensionsText: null,
            areaSqft: 500,
            confidence: 80,
            evidence: [],
          },
        ],
        tradeFindings: [
          {
            trade: "painting",
            label: "Measured guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "drywall",
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
    scopeText: "Repaint repeated guest rooms and corridor common areas.",
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

  assert.ok(paintingInfluence)
  assert.ok(drywallInfluence)
  assert.equal(paintingInfluence.engineInputs?.painting?.supportedWallSqft, 1800)
  assert.equal(paintingInfluence.engineInputs?.painting?.supportedInteriorSqft, null)
  assert.equal(drywallInfluence.engineInputs?.drywall?.supportedSqft, 1600)
  assert.ok(paintingInfluence.executionSections.includes("Corridor repaint"))
  assert.equal(drywallInfluence.engineInputs?.drywall?.forcePatchRepair, false)
})

test("shared-plan painting and wallcovering influences avoid whole-job sqft leakage across split trades", () => {
  const plan = makePlan({
    detectedTrades: ["painting", "wallcovering"],
    detectedRooms: ["Guest Room", "Corridor"],
    likelyRoomTypes: ["guest room", "corridor"],
    repeatedSpaceSignals: ["typical guest room layout repeats by floor"],
    tradePackageSignals: ["painting", "wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Repaint guest rooms and replace corridor wallcovering."],
        tradeFindings: [
          {
            trade: "painting",
            label: "Measured guest room wall paint area",
            confidence: 92,
            notes: ["Measured guest room wall area only."],
            quantity: 1800,
            unit: "sqft",
            evidence: [],
          },
          {
            trade: "general renovation",
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
    scopeText: "Repaint repeated guest rooms and corridor common areas.",
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

  assert.ok(paintingInfluence)
  assert.ok(wallcoveringInfluence)
  assert.equal(paintingInfluence.engineInputs?.painting?.supportedWallSqft, 1800)
  assert.equal(wallcoveringInfluence.engineInputs?.wallcovering?.supportedSqft, 900)
  assert.equal(wallcoveringInfluence.engineInputs?.wallcovering?.coverageKind, "corridor_area")
  assert.ok(paintingInfluence.executionSections.includes("Corridor repaint"))
  assert.ok(wallcoveringInfluence.executionSections.includes("Corridor wallcovering"))
})

test("weak support stays non-binding in the live seam and does not create deterministic owner selection", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    analyses: [makeAnalysis({ notes: ["Review finish plan for accent wall finish selection."] })],
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

  const planAware = computeWallcoveringDeterministic({
    scopeText: "Review lobby finish updates.",
    stateMultiplier: 1,
    measurements: null,
    planSectionInputs:
      influence?.canAffectNumericPricing ? influence.engineInputs?.wallcovering || null : null,
  })

  const decision = decidePricingOwner(
    makeOwnerContext({
      trade: "wallcovering",
      wallcoveringDet: planAware.pricing
        ? {
            pricing: planAware.pricing,
            okForVerified: planAware.okForVerified,
            verifiedSource: "wallcovering_engine_v1_verified",
            source: "wallcovering_engine_v1",
            estimateBasis: planAware.estimateBasis,
          }
        : null,
    })
  )

  assert.ok(influence)
  assert.equal(influence.canAffectNumericPricing, false)
  assert.equal(planAware.pricing, null)
  assert.equal(decision.owner, "ai")
})

test("multi-trade precedence remains authoritative over live per-trade deterministic candidates", () => {
  const decision = decidePricingOwner(
    makeOwnerContext({
      trade: "painting",
      multiTradeDet: {
        okForDeterministic: true,
        okForVerified: true,
        pricing: { labor: 4200, materials: 1900, subs: 750, markup: 20, total: 8220 },
        estimateBasis: {
          units: ["days"],
          quantities: { days: 5 },
          laborRate: 85,
          hoursPerUnit: 0,
          crewDays: 5,
          mobilization: 750,
          assumptions: ["Multi-trade estimate combined from split scope pricing."],
          sectionPricing: [
            {
              section: "painting: Walls",
              labor: 1200,
              materials: 500,
              subs: 220,
              total: 2304,
              pricingBasis: "direct",
            },
            {
              section: "wallcovering: Install",
              labor: 1400,
              materials: 900,
              subs: 250,
              total: 3188,
              pricingBasis: "direct",
            },
            {
              section: "shared: Coordination",
              labor: 1600,
              materials: 500,
              subs: 280,
              total: 2728,
              pricingBasis: "burden",
            },
          ],
        },
        perTrade: [],
        notes: [],
      },
      paintingDet: {
        pricing: { labor: 1200, materials: 500, subs: 220, markup: 20, total: 2304 },
        okForVerified: true,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: {
          units: ["days"],
          quantities: { days: 2 },
          laborRate: 75,
          hoursPerUnit: 0,
          crewDays: 2,
          mobilization: 220,
          assumptions: ["painting basis"],
        },
      },
      wallcoveringDet: {
        pricing: { labor: 1400, materials: 900, subs: 250, markup: 25, total: 3188 },
        okForVerified: true,
        verifiedSource: "wallcovering_engine_v1_verified",
        source: "wallcovering_engine_v1",
        estimateBasis: {
          units: ["days"],
          quantities: { days: 2 },
          laborRate: 95,
          hoursPerUnit: 0,
          crewDays: 2,
          mobilization: 250,
          assumptions: ["wallcovering basis"],
        },
      },
    })
  )

  assert.equal(decision.owner, "multi_trade_combiner")
  assert.ok(decision.estimateBasis?.assumptions.includes("Multi-trade estimate combined from split scope pricing."))
  assert.equal(sumSectionTotals(decision.estimateBasis), 8220)
})
