import assert from "node:assert/strict"
import test from "node:test"

import { runEstimatorOrchestrator, type OrchestratorDeps } from "./orchestrator"
import type {
  AIResponse,
  ComplexityProfile,
  EstimateBasis,
  EstimateExplanation,
  EstimatorContext,
  GenerateInput,
  PhotoEstimateDecision,
  PhotoPacketScore,
  PhotoPricingImpact,
  PriceGuardReport,
  Pricing,
  ScheduleBlock,
  ScopeSignals,
  ScopeXRay,
  TradeStack,
} from "./types"

function makePricing(pricing: Partial<Pricing>): Pricing {
  return {
    labor: pricing.labor ?? 0,
    materials: pricing.materials ?? 0,
    subs: pricing.subs ?? 0,
    markup: pricing.markup ?? 20,
    total: pricing.total ?? 0,
  }
}

function makeBasis(overrides: Partial<EstimateBasis> = {}): EstimateBasis {
  return {
    units: ["days"],
    quantities: { days: 2 },
    laborRate: 75,
    hoursPerUnit: 0,
    crewDays: 2,
    mobilization: 250,
    assumptions: ["deterministic basis"],
    ...overrides,
  }
}

const complexity: ComplexityProfile = {
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

const tradeStack: TradeStack = {
  primaryTrade: "painting",
  trades: ["painting"],
  activities: [],
  signals: [],
  isMultiTrade: false,
}

const scopeSignals: ScopeSignals = null
const photoImpact: PhotoPricingImpact = {
  laborDelta: 0,
  materialsDelta: 0,
  subsDelta: 0,
  extraCrewDays: 0,
  confidenceBoost: 0,
  reasons: [],
}
const photoPacketScore: PhotoPacketScore = {
  score: 0,
  strengths: [],
  missingShots: [],
}
const photoEstimateDecision: PhotoEstimateDecision = {
  estimateMode: "measurement_required",
  pricingPolicy: "allow",
  pricingAllowed: true,
  confidence: 0,
  confidenceBand: "low",
  missingInputs: [],
  reasons: [],
  blockers: [],
}

function makeSchedule(): ScheduleBlock {
  return {
    startDate: "2026-04-22",
    crewDays: 2,
    visits: 1,
    calendarDays: { min: 2, max: 2 },
    workDaysPerWeek: 5,
    rationale: [],
  }
}

function makeScopeXRay(): ScopeXRay {
  return {
    detectedScope: {
      primaryTrade: "painting",
      splitScopes: [],
      paintScope: "walls",
      state: "CA",
    },
    quantities: [],
    pricingMethod: {
      pricingSource: "deterministic",
      detSource: "painting_engine_v1_verified",
      anchorId: null,
      verified: true,
      stateAdjusted: false,
    },
    scheduleLogic: {
      crewDays: 2,
      visits: 1,
      reasons: [],
    },
    riskFlags: [],
    needsConfirmation: [],
  }
}

function makePriceGuard(): PriceGuardReport {
  return {
    status: "verified",
    confidence: 95,
    pricingSource: "deterministic",
    appliedRules: [],
    assumptions: [],
    warnings: [],
    details: {
      stateAdjusted: false,
    },
  }
}

function makeExplanation(): EstimateExplanation {
  return {
    priceReasons: [],
    scheduleReasons: [],
    photoReasons: [],
    protectionReasons: [],
  }
}

function makeDeps(): OrchestratorDeps {
  return {
    basis: {
      normalizeBasisSafe: (basis) => basis,
      syncEstimateBasisMath: ({ basis }) => basis,
      enforceEstimateBasis: ({ basis }) =>
        basis ??
        makeBasis({
          units: ["lump_sum"],
          quantities: { lump_sum: 1 },
        }),
      buildEstimateBasisFallback: () =>
        makeBasis({
          units: ["lump_sum"],
          quantities: { lump_sum: 1 },
        }),
    },
    pricing: {
      applyAiRealism: ({ pricing }) => pricing,
      compressCrossTradeMobilization: ({ pricing, basis }) => ({
        pricing,
        basis,
        applied: false,
        note: "",
      }),
      enforcePhaseVisitCrewDaysFloor: ({ pricing, basis }) => ({
        pricing,
        basis,
        applied: false,
        note: "",
      }),
      clampPricing: (pricing) => pricing,
      coercePricing: (value) => makePricing(value as Partial<Pricing>),
      alignEstimateBasisSectionPricing: ({ basis }) => basis,
      applyPermitBuffer: ({ pricing }) => ({
        pricing,
        applied: false,
        note: "",
      }),
      applyMinimumCharge: (_trade, total) => ({
        applied: false,
        total,
        minimum: null,
      }),
    },
    description: {
      syncDescriptionLeadToDocumentType: (text) => text,
      appendExecutionPlanSentence: ({ description }) => description,
      appendTradeCoordinationSentence: (description) => description,
      appendPermitCoordinationSentence: (description) => description,
      polishDescriptionWith4o: async ({ description }) => description,
    },
    buildScheduleBlock: () => makeSchedule(),
    buildScopeXRay: () => makeScopeXRay(),
    buildPriceGuardReport: () => makePriceGuard(),
    buildEstimateExplanation: () => makeExplanation(),
  }
}

function makeContext(overrides: Partial<EstimatorContext> = {}): EstimatorContext {
  return {
    input: {} as GenerateInput,
    normalizedEmail: "test@example.com",
    requestId: "req-1",
    scopeChange: "Paint walls.",
    enrichedScopeText: "Paint walls.",
    tradeLabel: "painting",
    rawState: "California",
    stateAbbrev: "CA",
    stateMultiplier: 1,
    usedNationalBaseline: false,
    measurements: null,
    photos: null,
    paintScope: "walls",
    workDaysPerWeek: 5,
    rooms: null,
    doors: null,
    splitScopes: [],
    tradeStack,
    complexityProfile: complexity,
    scopeSignals,
    quantityInputs: {
      userMeasuredSqft: null,
      parsedSqft: null,
      photoWallSqft: null,
      photoCeilingSqft: null,
      photoFloorSqft: null,
      effectiveFloorSqft: null,
      effectiveWallSqft: null,
      effectivePaintSqft: null,
    },
    photoPacketScore,
    photoAnalysis: null,
    photoImpact,
    photoScopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
    },
    photoEstimateDecision,
    planIntelligence: null,
    materialsList: null,
    areaScopeBreakdown: {
      detectedArea: {
        floorSqft: null,
        wallSqft: null,
        paintSqft: null,
        trimLf: null,
      },
      allowances: {
        prepDemo: [],
        protectionSetup: [],
        materialsDrivers: [],
        scheduleDrivers: [],
      },
      missingConfirmations: [],
    },
    trade: "painting",
    effectivePaintScope: "walls",
    useBigJobPricing: false,
    anchorHit: null,
    multiTradeDet: null,
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

const aiDraft: AIResponse = {
  documentType: "Estimate",
  trade: "painting",
  description: "This Estimate covers painting.",
  pricing: makePricing({ labor: 100, materials: 50, subs: 25, markup: 20, total: 210 }),
  estimateBasis: null,
}

test("orchestrator payload exposes estimateSections from winning deterministic basis", async () => {
  const pricing = makePricing({ labor: 1200, materials: 400, subs: 200, markup: 20, total: 2160 })
  const basis = makeBasis({
    sectionPricing: [
      {
        section: "Walls",
        labor: 700,
        materials: 220,
        subs: 80,
        total: 1200,
        pricingBasis: "direct",
        unit: "sqft",
        quantity: 1400,
      },
      {
        section: "Prep / protection",
        labor: 500,
        materials: 180,
        subs: 120,
        total: 960,
        pricingBasis: "burden",
        notes: ["Embedded burden"],
      },
    ],
  })

  const payload = await runEstimatorOrchestrator({
    ctx: makeContext({
      paintingDet: {
        pricing,
        okForVerified: true,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: basis,
      },
    }),
    aiDraft,
    deps: makeDeps(),
    includeDebugEstimateBasis: true,
  })

  assert.equal(payload.pricing.total, 2160)
  assert.ok(payload.estimateSections)
  assert.equal(payload.estimateSections?.length, 2)
  assert.equal(payload.estimateSections?.[0]?.estimatorTreatment, "section_row")
  assert.equal(payload.estimateSections?.[1]?.estimatorTreatment, "embedded_burden")
  assert.ok(payload.estimateRows)
  assert.equal(payload.estimateRows?.length, 1)
  assert.equal(payload.estimateRows?.[0]?.section, "Walls")
  assert.equal(payload.estimateRows?.[0]?.pricingBasis, "direct")
  assert.ok(payload.estimateEmbeddedBurdens)
  assert.equal(payload.estimateEmbeddedBurdens?.length, 1)
  assert.equal(payload.estimateEmbeddedBurdens?.[0]?.section, "Prep / protection")
  assert.equal(
    payload.estimateSections?.reduce((sum, section) => sum + section.amount, 0),
    payload.pricing.total
  )
  assert.equal(
    payload.estimateRows?.reduce((sum, row) => sum + row.amount, 0),
    1200
  )
})

test("orchestrator payload exposes combined structured estimateSections when multi-trade wins", async () => {
  const payload = await runEstimatorOrchestrator({
    ctx: makeContext({
      trade: "painting",
      tradeStack: {
        ...tradeStack,
        trades: ["painting", "wallcovering"],
        isMultiTrade: true,
      },
      multiTradeDet: {
        okForDeterministic: true,
        okForVerified: true,
        pricing: makePricing({ labor: 2600, materials: 1300, subs: 500, markup: 20, total: 5280 }),
        estimateBasis: makeBasis({
          laborRate: 85,
          crewDays: 4,
          quantities: { days: 4 },
          sectionPricing: [
            {
              section: "painting: Walls",
              labor: 1200,
              materials: 450,
              subs: 150,
              total: 2160,
              pricingBasis: "direct",
            },
            {
              section: "wallcovering: Install",
              labor: 900,
              materials: 700,
              subs: 150,
              total: 2100,
              pricingBasis: "direct",
            },
            {
              section: "painting: Prep / protection",
              labor: 500,
              materials: 150,
              subs: 200,
              total: 1020,
              pricingBasis: "burden",
            },
          ],
        }),
        perTrade: [
          {
            trade: "painting",
            scope: "Paint walls.",
            pricing: makePricing({ labor: 1200, materials: 450, subs: 150, markup: 20, total: 2160 }),
            laborRate: 75,
            crewDays: 2,
            source: "painting_engine_v1_verified",
            notes: [],
          },
          {
            trade: "wallcovering",
            scope: "Install wallcovering.",
            pricing: makePricing({ labor: 900, materials: 700, subs: 150, markup: 20, total: 2100 }),
            laborRate: 95,
            crewDays: 2,
            source: "wallcovering_engine_v1_verified",
            notes: [],
          },
        ],
        notes: [],
      },
    }),
    aiDraft,
    deps: makeDeps(),
    includeDebugEstimateBasis: true,
  })

  assert.equal(payload.pricing.total, 5280)
  assert.ok(payload.estimateSections)
  assert.ok(payload.estimateRows)
  assert.ok(payload.estimateEmbeddedBurdens)
  assert.ok(payload.estimateSections?.some((section) => section.trade === "painting"))
  assert.ok(payload.estimateSections?.some((section) => section.trade === "wallcovering"))
  assert.ok(payload.estimateRows?.some((row) => row.trade === "painting"))
  assert.ok(payload.estimateRows?.some((row) => row.trade === "wallcovering"))
  assert.deepEqual(
    payload.estimateRows?.map((row) => row.section).sort(),
    ["painting: Walls", "wallcovering: Install"].sort()
  )
  assert.ok(
    !payload.estimateRows?.some((row) => row.section === "painting: Prep / protection")
  )
  assert.ok(
    payload.estimateEmbeddedBurdens?.some((section) => section.trade === "painting")
  )
  assert.equal(
    payload.estimateSections?.reduce((sum, section) => sum + section.amount, 0),
    payload.pricing.total
  )
  assert.equal(
    payload.estimateRows?.reduce((sum, row) => sum + row.amount, 0),
    4260
  )
})
