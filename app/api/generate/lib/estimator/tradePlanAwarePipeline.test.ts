import assert from "node:assert/strict"
import test from "node:test"

import type { PlanIntelligence, PlanSheetAnalysis } from "../plans/types"
import { buildEstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "./estimateStructureConsumption"
import { buildTradePackagePricingPrep } from "./tradePackagePricingPrep"
import { buildTradePricingBasisBridge } from "./tradePricingBasisBridge"
import { buildTradePricingInputDraft } from "./tradePricingInputDraft"
import { buildTradeQuantitySupport } from "./tradeQuantitySupport"
import type { ComplexityProfile, TradeStack } from "./types"

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
    ...restOverrides,
    takeoff,
    scopeAssist,
    evidence,
  }
}

function runPlanAwarePipeline(args: {
  trade: string
  scopeText: string
  planIntelligence: PlanIntelligence | null
  tradeStack?: TradeStack | null
  complexityProfile?: ComplexityProfile | null
}) {
  const tradeStack = args.tradeStack ?? makeTradeStack(args.trade)
  const complexityProfile = args.complexityProfile ?? defaultComplexity

  const estimateSkeletonHandoff = buildEstimateSkeletonHandoff(args.planIntelligence)
  const estimateStructureConsumption = buildEstimateStructureConsumption(
    estimateSkeletonHandoff
  )
  const tradePackagePricingPrep = buildTradePackagePricingPrep({
    trade: args.trade,
    planIntelligence: args.planIntelligence,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    scopeText: args.scopeText,
    tradeStack,
    complexityProfile,
  })
  const tradeQuantitySupport = buildTradeQuantitySupport({
    trade: args.trade,
    scopeText: args.scopeText,
    planIntelligence: args.planIntelligence,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradePackagePricingPrep,
  })
  const tradePricingBasisBridge = buildTradePricingBasisBridge({
    trade: args.trade,
    scopeText: args.scopeText,
    planIntelligence: args.planIntelligence,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradeStack,
    complexityProfile,
  })
  const tradePricingInputDraft = buildTradePricingInputDraft({
    tradePricingBasisBridge,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    planIntelligence: args.planIntelligence,
    scopeText: args.scopeText,
    tradeStack,
    complexityProfile,
  })

  return {
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradePackagePricingPrep,
    tradeQuantitySupport,
    tradePricingBasisBridge,
    tradePricingInputDraft,
  }
}

test("painting with strong support builds conservative measured drafts", () => {
  const plan = makePlan({
    confidenceScore: 92,
    detectedTrades: ["painting"],
    detectedRooms: ["Guest Room", "Corridor"],
    pricingPackageSignals: ["Guest room package", "Corridor package", "Finish package"],
    prototypePackageSignals: ["Prototype guest room repaint"],
    packagePricingBasisSignals: ["Guest room prototype", "Corridor repaint"],
    tradePackageSignals: ["painting", "finish package"],
    estimatePackageCandidates: ["Guest room package", "Corridor package", "Finish package"],
    repeatedSpaceSignals: ["Guest room layout repeats by floor"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Corridor repaint at Level 2", "Paint walls and ceilings in guest rooms"],
        notes: ["Finish schedule confirms interior repaint scope."],
        schedules: [
          {
            scheduleType: "finish",
            label: "Finish schedule",
            quantity: null,
            notes: ["Paint walls and ceilings throughout guest rooms and corridors."],
            confidence: 92,
            evidence: [],
          },
          {
            scheduleType: "door",
            label: "Door schedule",
            quantity: 24,
            notes: ["Paint guest room doors and frames."],
            confidence: 89,
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 2400,
      ceilingSqft: 1200,
      trimLf: 800,
      doorCount: 24,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: 24,
      sourceNotes: ["Plan takeoff for guest rooms and corridors."],
    },
    summary: "Hotel remodel with repeated guest rooms and corridor repaint.",
  })

  const result = runPlanAwarePipeline({
    trade: "painting",
    scopeText: "Paint guest room walls and ceilings, repaint corridors, doors, and trim.",
    planIntelligence: plan,
  })

  assert.equal(result.tradeQuantitySupport?.trade, "painting")
  assert.equal(result.tradeQuantitySupport?.supportLevel, "strong")
  assert.ok(
    result.tradeQuantitySupport?.tradeAreaSignals.some(
      (item) => item.label === "Wall coverage support" && item.exactQuantity
    )
  )
  assert.ok(
    result.tradeQuantitySupport?.tradeAreaSignals.some(
      (item) => item.label === "Ceiling coverage support" && item.exactQuantity
    )
  )

  assert.equal(result.tradePricingBasisBridge?.supportLevel, "strong")
  assert.ok(
    result.tradePricingBasisBridge?.tradePricingBasisDraft.includes(
      "Basis draft: walls + ceilings package."
    )
  )
  assert.ok(
    result.tradePricingBasisBridge?.tradePricingBasisDraft.includes(
      "Carry corridor repaint as a separate basis from room interiors."
    )
  )

  assert.ok(result.tradePricingInputDraft)
  assert.ok(result.tradePricingInputDraft?.tradeScopePricingSections.includes("Walls"))
  assert.ok(result.tradePricingInputDraft?.tradeScopePricingSections.includes("Ceilings"))
  assert.ok(result.tradePricingInputDraft?.tradeScopePricingSections.includes("Corridor repaint"))
  assert.ok(result.tradePricingInputDraft?.tradeScopePricingSections.includes("Prep / protection"))
})

test("painting with weak support stays review-oriented and avoids measured sections", () => {
  const plan = makePlan({
    confidenceScore: 52,
    detectedTrades: ["painting"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Interior finish refresh notes only."],
        notes: ["Scope appears to include light finish refresh."],
      }),
    ],
    summary: "Interior finish refresh cues only.",
  })

  const result = runPlanAwarePipeline({
    trade: "painting",
    scopeText: "Review finish refresh and repaint needs where required.",
    planIntelligence: plan,
  })

  assert.equal(result.tradeQuantitySupport?.supportLevel, "weak")
  assert.equal(result.tradePricingBasisBridge?.supportLevel, "weak")
  assert.ok(
    result.tradePricingInputDraft?.tradePricingInputDraft.some((item) =>
      item.includes("review-oriented")
    )
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.every((item) =>
      item.startsWith("Review candidate:")
    )
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeMeasurementInputDraft.every(
      (item) => !/\(\d+\s+(sqft|doors|linear_ft)\)/.test(item)
    )
  )
})

test("drywall repair scenario stays conservative and does not invent patch quantities", () => {
  const plan = makePlan({
    confidenceScore: 58,
    detectedTrades: ["drywall"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Patch damaged gypsum board in guest rooms."],
        notes: ["Repair localized drywall damage in guest rooms."],
      }),
    ],
    summary: "Guest room drywall patch scope.",
  })

  const result = runPlanAwarePipeline({
    trade: "drywall",
    scopeText: "Patch and repair drywall in guest rooms.",
    planIntelligence: plan,
  })

  assert.equal(result.tradeQuantitySupport?.supportLevel, "moderate")
  assert.equal(result.tradePricingBasisBridge?.supportLevel, "moderate")
  assert.ok(
    result.tradePricingBasisBridge?.tradeScopeInclusionDraft.includes(
      "Patch / repair scope should stay distinct from broader install-and-finish scope."
    )
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes("Patch / repair")
  )
  assert.equal(result.tradePricingInputDraft?.tradeMeasurementInputDraft.length, 0)
  assert.ok(
    result.tradePricingBasisBridge?.tradePricingBasisNotes.some((item) =>
      item.includes("Do not convert repeated room support into patch counts or exact patch area")
    ) ||
      result.tradePackagePricingPrep?.tradePackageReviewNotes.some((item) =>
        item.includes("Do not invent sheet counts, patch counts, or finish levels")
      )
  )
})

test("drywall install scenario builds install, finish, ceiling, and partition sections", () => {
  const plan = makePlan({
    confidenceScore: 90,
    detectedTrades: ["drywall"],
    tradePackageSignals: ["drywall"],
    estimatePackageCandidates: ["Guest room package"],
    analyses: [
      makeAnalysis({
        textSnippets: ["New partitions and gypsum board hang and finish scope."],
        notes: ["Level 5 finish at feature walls."],
        tradeFindings: [
          {
            trade: "drywall",
            label: "Drywall hang and finish",
            quantity: 1800,
            unit: "sqft",
            notes: ["Install and finish new gypsum board partitions."],
            confidence: 90,
            evidence: [],
          },
          {
            trade: "general renovation",
            label: "Partition run",
            quantity: 420,
            unit: "linear_ft",
            notes: ["Partition length across guest room stack."],
            confidence: 86,
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1800,
      ceilingSqft: 600,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: ["Drywall scope measured from reflected ceiling and partition plans."],
    },
    summary: "Drywall install, hang, finish, and partition scope.",
  })

  const result = runPlanAwarePipeline({
    trade: "drywall",
    scopeText: "Install drywall partitions, hang board, finish, and texture ceilings where noted.",
    planIntelligence: plan,
  })

  assert.equal(result.tradeQuantitySupport?.supportLevel, "strong")
  assert.ok(
    result.tradeQuantitySupport?.tradeLinearSignals.some(
      (item) => item.label === "Partition linear support" && item.exactQuantity
    )
  )
  assert.equal(result.tradePricingBasisBridge?.supportLevel, "strong")
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes("Install / hang")
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes("Finish / texture")
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes("Ceiling drywall")
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes(
      "Partition-related scope"
    )
  )
})

test("wallcovering corridor scenario builds corridor, removal/prep, and install drafts", () => {
  const plan = makePlan({
    confidenceScore: 84,
    detectedTrades: ["painting"],
    pricingPackageSignals: ["Corridor package", "Finish package"],
    tradePackageSignals: ["wallcovering"],
    sheetRoleSignals: ["Finish plan"],
    estimatePackageCandidates: ["Corridor package", "Finish package"],
    analyses: [
      makeAnalysis({
        textSnippets: ["Remove existing corridor wallcovering and install new vinyl wallcovering."],
        notes: ["Corridor runs continue floor to floor."],
        schedules: [
          {
            scheduleType: "finish",
            label: "Finish schedule",
            quantity: null,
            notes: ["Corridor wallcovering type W-1."],
            confidence: 88,
            evidence: [],
          },
        ],
      }),
    ],
    takeoff: {
      floorSqft: null,
      wallSqft: 1600,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: ["Corridor wall area measured from finish plans."],
    },
    summary: "Corridor wallcovering removal and new install package.",
  })

  const result = runPlanAwarePipeline({
    trade: "wallcovering",
    scopeText: "Remove corridor wallcovering, prep substrate, and install new vinyl wallcovering.",
    planIntelligence: plan,
  })

  assert.equal(result.tradeQuantitySupport?.trade, "wallcovering")
  assert.equal(result.tradeQuantitySupport?.supportLevel, "moderate")
  assert.equal(result.tradePricingBasisBridge?.supportLevel, "moderate")
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes(
      "Corridor wallcovering"
    )
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeScopePricingSections.includes("Removal / prep")
  )
  assert.ok(result.tradePricingInputDraft?.tradeScopePricingSections.includes("Install"))
})

test("wallcovering weak support stays review-oriented and avoids invented coverage counts", () => {
  const plan = makePlan({
    confidenceScore: 50,
    analyses: [
      makeAnalysis({
        textSnippets: ["Generic finish refresh notes."],
        notes: ["Interior finish selections to be confirmed."],
      }),
    ],
    summary: "Generic finish cues only.",
  })

  const result = runPlanAwarePipeline({
    trade: "wallcovering",
    scopeText: "Review finish selections and possible wallcovering needs.",
    planIntelligence: plan,
  })

  assert.equal(result.tradeQuantitySupport?.supportLevel, "weak")
  assert.equal(result.tradePricingBasisBridge?.supportLevel, "weak")
  assert.ok(
    result.tradePricingInputDraft?.tradePricingInputDraft.some((item) =>
      item.includes("review-oriented")
    )
  )
  assert.ok(
    result.tradePricingInputDraft?.tradeMeasurementInputDraft.every(
      (item) => !/\(\d+\s+sqft\)/.test(item)
    )
  )
  assert.ok(
    !result.tradePricingInputDraft?.tradePricingInputNotes.some((item) =>
      /\belevation count\b|\bcoverage count\b/i.test(item)
    )
  )
})

test("null upstream support returns null safely across bridge layers", () => {
  const estimateSkeletonHandoff = buildEstimateSkeletonHandoff(null)
  const estimateStructureConsumption = buildEstimateStructureConsumption(null)
  const tradePackagePricingPrep = buildTradePackagePricingPrep({
    trade: "",
    planIntelligence: null,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    scopeText: "",
    tradeStack: null,
    complexityProfile: defaultComplexity,
  })
  const tradeQuantitySupport = buildTradeQuantitySupport({
    trade: "",
    scopeText: "",
    planIntelligence: null,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradePackagePricingPrep,
  })
  const tradePricingBasisBridge = buildTradePricingBasisBridge({
    trade: "",
    scopeText: "",
    planIntelligence: null,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradeStack: null,
    complexityProfile: defaultComplexity,
  })
  const tradePricingInputDraft = buildTradePricingInputDraft({
    tradePricingBasisBridge,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    planIntelligence: null,
    scopeText: "",
    tradeStack: null,
    complexityProfile: defaultComplexity,
  })

  assert.equal(estimateSkeletonHandoff, null)
  assert.equal(estimateStructureConsumption, null)
  assert.equal(tradePackagePricingPrep, null)
  assert.equal(tradeQuantitySupport, null)
  assert.equal(tradePricingBasisBridge, null)
  assert.equal(tradePricingInputDraft, null)
})
