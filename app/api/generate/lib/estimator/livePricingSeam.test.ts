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
  assert.equal(sumSectionTotals(planAwareBasis), planAware.pricing?.total || 0)
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

test("wallcovering live seam changes real totals and carries estimateBasis through owner resolution", () => {
  const plan = makePlan({
    detectedTrades: ["wallcovering"],
    repeatedSpaceSignals: ["repeated corridor segment"],
    tradePackageSignals: ["wallcovering"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Remove corridor wallcovering and install new vinyl wallcovering."],
        notes: ["Corridor wallcovering type W-1."],
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
  assert.equal(sumSectionTotals(decision.estimateBasis), planAware.pricing?.total || 0)
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
