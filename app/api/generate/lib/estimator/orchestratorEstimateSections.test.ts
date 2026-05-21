import assert from "node:assert/strict"
import test from "node:test"

import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import { buildTradeQuantityCandidateGates } from "../plans/tradeQuantityCandidateGates"
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
  PhotoAnalysis,
  PriceGuardReport,
  Pricing,
  ScheduleBlock,
  ScopeSignals,
  ScopeXRay,
  TradeStack,
} from "./types"
import type { EvidenceAuthorityReadback } from "./evidenceAuthority"
import type { PlanIntelligence, PlanTradeQuantityCandidate } from "../plans/types"

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

function makePhotoAnalysis(): PhotoAnalysis {
  return {
    summary: "Photos show painted drywall walls with minor prep.",
    observations: ["Visible wall patching and furniture protection needs."],
    detectedConditions: ["minor wall damage"],
    jobSummary: {
      probableArea: "interior_room",
      detectedTrades: ["painting"],
      detectedRoomTypes: ["bedroom"],
      detectedMaterials: ["drywall"],
      detectedConditions: ["minor wall damage"],
      detectedFixtures: [],
      detectedAccessIssues: [],
      detectedDemoNeeds: [],
      complexityFlags: [],
      mergedQuantities: {
        doors: 2,
        windows: null,
        vanities: null,
        toilets: null,
        sinks: null,
        outlets: null,
        switches: null,
        recessedLights: null,
        cabinets: null,
        appliances: null,
        wallSqft: 380,
        ceilingSqft: null,
        floorSqft: null,
        trimLf: null,
      },
      quantitySources: {
        wallSqft: "reference_scaled",
        ceilingSqft: null,
        floorSqft: null,
        trimLf: null,
      },
      exteriorSummary: {
        isExterior: false,
        stories: null,
        substrate: null,
        access: null,
        trimComplexity: null,
        prepLevel: null,
        garageDoors: null,
        entryDoors: null,
        windows: null,
        bodyWallSqft: null,
      },
      pricingDrivers: [],
      missingViews: [],
      confidenceScore: 76,
    },
  }
}

function makePlanCandidate(
  overrides: Partial<PlanTradeQuantityCandidate> = {}
): PlanTradeQuantityCandidate {
  return {
    candidateKey: "door-schedule-count",
    trade: "carpentry",
    category: "door schedule count candidates",
    quantity: 12,
    unit: "doors",
    quantityStatus: "count_only",
    confidence: 82,
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
    ],
    assumptions: ["Explicit quantity/count column summed to 12."],
    warnings: ["Candidate only - not measured takeoff support."],
    eligibleForPricing: false,
    ...overrides,
  }
}

function makePlanIntelligence(
  candidates: PlanTradeQuantityCandidate[] = [makePlanCandidate()]
): PlanIntelligence {
  return {
    ok: true,
    uploadsCount: 1,
    pagesCount: 2,
    indexedPagesCount: 2,
    selectedPagesCount: 2,
    skippedPagesCount: 0,
    sheetIndex: [
      {
        uploadId: "upload-1",
        uploadName: "plans.pdf",
        pageNumber: 1,
        sourcePageNumber: 1,
        pageLabel: "1",
        sheetNumber: "A1.1",
        sheetTitle: "Floor Plan",
        discipline: "architectural",
        confidence: 80,
        revision: null,
        selectedForAnalysis: true,
        renderedFromPdf: true,
        renderedImageAvailable: true,
        classification: {
          sheetRole: "floor_plan",
          discipline: "architectural",
          confidence: 80,
          method: "deterministic",
          signals: ["Floor plan"],
          warnings: [],
        },
      },
    ],
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
      summaryRefs: [
        {
          uploadId: "upload-1",
          uploadName: "plans.pdf",
          sourcePageNumber: 1,
          pageNumber: 1,
          sheetNumber: "A1.1",
          sheetTitle: "Floor Plan",
          excerpt: "Guestroom floor plan",
          confidence: 80,
        },
      ],
      quantityRefs: [],
      riskRefs: [],
    },
    detectedTrades: ["painting"],
    detectedRooms: ["guest room"],
    extractedTables: [],
    roomFinishMatrices: [],
    repeatedRoomPackages: [],
    tradeQuantityCandidates: candidates,
    tradeQuantityCandidateGates: buildTradeQuantityCandidateGates(candidates),
    summary: "Plan readback summary.",
    confidenceScore: 78,
  }
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
    scopeFacts: buildEstimatorScopeFacts("Paint walls."),
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
        provenance: {
          quantitySupport: "measured",
          sourceBasis: ["trade_finding"],
          summary: "Direct wall row is backed by measured wall area.",
          supportCategory: "wall_area",
          quantityDetail: "1400 sqft of measured wall support was used for this row.",
          diagnosticDetails: ["direct_row_allowed: measured wall area is present."],
        },
      },
      {
        section: "Prep / protection",
        labor: 500,
        materials: 180,
        subs: 120,
        total: 960,
        pricingBasis: "burden",
        notes: ["Embedded burden"],
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: ["repeated_space_rollup"],
          summary: "Embedded burden remains non-standalone and non-authoritative.",
          supportCategory: "prep_protection",
          blockedReason: "Prep / protection remains embedded until a standalone measurable basis exists.",
          diagnosticDetails: ["embedded_burden_only: burden remains reference-only."],
        },
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
  assert.equal(payload.estimateRows?.[0]?.provenance?.quantitySupport, "measured")
  assert.deepEqual(payload.estimateRows?.[0]?.provenance?.sourceBasis, ["trade_finding"])
  assert.equal(payload.estimateRows?.[0]?.provenance?.supportCategory, "wall_area")
  assert.match(payload.estimateRows?.[0]?.provenance?.quantityDetail || "", /1400 sqft/i)
  assert.ok(payload.estimateEmbeddedBurdens)
  assert.equal(payload.estimateEmbeddedBurdens?.length, 1)
  assert.equal(payload.estimateEmbeddedBurdens?.[0]?.section, "Prep / protection")
  assert.equal(
    payload.estimateEmbeddedBurdens?.[0]?.provenance?.quantitySupport,
    "support_only"
  )
  assert.equal(
    payload.estimateEmbeddedBurdens?.[0]?.provenance?.supportCategory,
    "prep_protection"
  )
  assert.match(
    payload.estimateEmbeddedBurdens?.[0]?.provenance?.blockedReason || "",
    /embedded/i
  )
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
              provenance: {
                quantitySupport: "measured",
                sourceBasis: ["trade_finding"],
                summary: "Painting wall row is backed by measured wall area.",
                supportCategory: "wall_area",
                quantityDetail: "Measured painting wall area was used for this row.",
              },
            },
            {
              section: "wallcovering: Install",
              labor: 900,
              materials: 700,
              subs: 150,
              total: 2100,
              pricingBasis: "direct",
              provenance: {
                quantitySupport: "measured",
                sourceBasis: ["trade_finding"],
                summary: "Wallcovering install row is backed by measured corridor area.",
                supportCategory: "corridor_area",
                coverageKind: "corridor_area",
                quantityDetail: "Exact corridor/common-area wallcovering sqft was used for this row.",
              },
            },
            {
              section: "painting: Prep / protection",
              labor: 500,
              materials: 150,
              subs: 200,
              total: 1020,
              pricingBasis: "burden",
              provenance: {
                quantitySupport: "support_only",
                sourceBasis: ["repeated_space_rollup"],
                summary: "Painting burden remains embedded.",
                supportCategory: "prep_protection",
                blockedReason: "Prep / protection remains embedded.",
              },
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
  assert.equal(
    payload.estimateRows?.find((row) => row.trade === "painting")?.provenance?.quantitySupport,
    "measured"
  )
  assert.equal(
    payload.estimateRows?.find((row) => row.trade === "wallcovering")?.provenance?.quantitySupport,
    "measured"
  )
  assert.equal(
    payload.estimateRows?.find((row) => row.trade === "painting")?.provenance?.supportCategory,
    "wall_area"
  )
  assert.equal(
    payload.estimateRows?.find((row) => row.trade === "wallcovering")?.provenance?.coverageKind,
    "corridor_area"
  )
  assert.deepEqual(
    payload.estimateRows?.map((row) => row.section).sort(),
    ["Walls", "Install"].sort()
  )
  assert.ok(
    !payload.estimateRows?.some((row) => row.section === "Prep / protection")
  )
  assert.ok(
    payload.estimateEmbeddedBurdens?.some((section) => section.trade === "painting")
  )
  assert.equal(
    payload.estimateEmbeddedBurdens?.find((section) => section.trade === "painting")?.provenance
      ?.quantitySupport,
    "support_only"
  )
  assert.match(
    payload.estimateEmbeddedBurdens?.find((section) => section.trade === "painting")?.provenance
      ?.blockedReason || "",
    /embedded/i
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

test("orchestrator passes scope facts into estimate explanation builder", async () => {
  let receivedTrueMixedTrades: boolean | null = null
  let receivedIncludedTrades: string[] = []
  const deps = makeDeps()
  deps.buildEstimateExplanation = (args) => {
    receivedTrueMixedTrades = args.scopeFacts?.trueMixedTrades ?? null
    receivedIncludedTrades = args.scopeFacts?.includedTrades ?? []
    return makeExplanation()
  }

  await runEstimatorOrchestrator({
    ctx: makeContext({
      scopeChange: "Paint walls. Flooring protection only.",
      scopeFacts: buildEstimatorScopeFacts("Paint walls. Flooring protection only."),
    }),
    aiDraft,
    deps,
    includeDebugEstimateBasis: false,
  })

  assert.equal(receivedTrueMixedTrades, false)
  assert.deepEqual(receivedIncludedTrades, ["painting"])
})

test("orchestrator builds evidence authority internally without returning it in payload", async () => {
  let readback: EvidenceAuthorityReadback | undefined
  const pricing = makePricing({ labor: 1200, materials: 400, subs: 200, markup: 20, total: 2160 })
  const basis = makeBasis({
    units: ["sqft"],
    quantities: { sqft: 420 },
    crewDays: 2,
  })

  const payload = await runEstimatorOrchestrator({
    ctx: makeContext({
      scopeChange:
        "Paint 2 bedrooms and 4 doors, 420 sqft. Excludes drywall repair, flooring by others, owner-supplied paint, and protect existing cabinets only.",
      enrichedScopeText:
        "Paint 2 bedrooms and 4 doors, 420 sqft. Excludes drywall repair, flooring by others, owner-supplied paint, and protect existing cabinets only.",
      scopeFacts: buildEstimatorScopeFacts(
        "Paint 2 bedrooms and 4 doors, 420 sqft. Excludes drywall repair, flooring by others, owner-supplied paint, and protect existing cabinets only."
      ),
      quantityInputs: {
        userMeasuredSqft: 420,
        parsedSqft: 420,
        photoWallSqft: 380,
        photoCeilingSqft: null,
        photoFloorSqft: null,
        photoWallSqftSource: "reference_scaled",
        effectiveFloorSqft: null,
        effectiveWallSqft: 420,
        effectivePaintSqft: 420,
      },
      photoAnalysis: makePhotoAnalysis(),
      planIntelligence: makePlanIntelligence(),
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
    includeDebugEstimateBasis: false,
    onEvidenceAuthorityReadback: (value) => {
      readback = value
    },
  })

  assert.equal(payload.pricing.total, 2160)
  assert.equal(payload.pricingSource, "deterministic")
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "evidenceAuthorityReadback"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "evidenceAuthority"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "estimateBasis"), false)
  const capturedReadback = readback
  assert.ok(capturedReadback)

  const included = capturedReadback.items.find((item) => item.id === "typed-scope:included")
  const boundary = capturedReadback.items.find((item) => item.id === "typed-scope:boundary")
  const userSqft = capturedReadback.items.find((item) => item.id === "quantity:user:measured_sqft")
  const parsedSqft = capturedReadback.items.find((item) => item.id === "quantity:parsed:parsed_sqft")
  const deterministicSqft = capturedReadback.items.find(
    (item) => item.id === "deterministic-estimate-basis:sqft"
  )
  const photoObservation = capturedReadback.items.find((item) => item.id === "photo:observations")
  const photoWallSqft = capturedReadback.items.find((item) => item.id === "photo:quantity:wallSqft")
  const planCandidate = capturedReadback.items.find(
    (item) => item.id === "plan:quantity-candidate:door-schedule-count"
  )

  assert.equal(included?.authority, "pricing_authoritative")
  assert.equal(included?.pricingAuthoritative, true)
  assert.equal(boundary?.authority, "excluded_or_boundary_context")
  assert.equal(boundary?.pricingAuthoritative, false)
  assert.equal(userSqft?.authority, "user_confirmed_quantity")
  assert.equal(parsedSqft?.authority, "parsed_typed_quantity")
  assert.equal(deterministicSqft?.authority, "deterministic_pricing_basis")
  assert.equal(photoObservation?.authority, "review_only")
  assert.equal(photoObservation?.pricingAuthoritative, false)
  assert.equal(photoWallSqft?.source, "photo_reference_scaled_quantity")
  assert.equal(photoWallSqft?.authority, "review_only")
  assert.equal(photoWallSqft?.pricingAuthoritative, false)
  assert.equal(planCandidate?.authority, "future_measured_takeoff_candidate")
  assert.equal(planCandidate?.pricingAuthoritative, false)
  assert.equal(planCandidate?.pricingEligibleNow, false)
})
