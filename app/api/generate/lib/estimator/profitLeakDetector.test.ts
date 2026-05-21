import test from "node:test"
import assert from "node:assert/strict"

import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import { detectProfitLeaks } from "./profitLeakDetector"
import type {
  ComplexityProfile,
  EstimateBasis,
  PriceGuardReport,
  Pricing,
  ScheduleBlock,
  TradeStack,
} from "./types"

function pricing(overrides: Partial<Pricing> = {}): Pricing {
  return {
    labor: overrides.labor ?? 1000,
    materials: overrides.materials ?? 500,
    subs: overrides.subs ?? 100,
    markup: overrides.markup ?? 15,
    total: overrides.total ?? 1800,
  }
}

function basis(overrides: Partial<EstimateBasis> = {}): EstimateBasis {
  return {
    units: ["days"],
    quantities: { days: 2 },
    laborRate: 85,
    hoursPerUnit: 0,
    crewDays: 2,
    mobilization: 100,
    assumptions: [],
    ...overrides,
  }
}

function priceGuard(overrides: Partial<PriceGuardReport> = {}): PriceGuardReport {
  return {
    status: "review",
    confidence: overrides.confidence ?? 55,
    pricingSource: "ai",
    appliedRules: [],
    assumptions: [],
    warnings: [],
    details: {
      stateAdjusted: false,
    },
    ...overrides,
  }
}

function complexity(overrides: Partial<ComplexityProfile> = {}): ComplexityProfile {
  return {
    class: "simple",
    requireDaysBasis: false,
    permitLikely: false,
    multiPhase: false,
    multiTrade: false,
    hasDemo: false,
    notes: [],
    minCrewDays: 1,
    maxCrewDays: 2,
    minMobilization: 100,
    minSubs: 0,
    crewSizeMin: 1,
    crewSizeMax: 2,
    hoursPerDayEffective: 6,
    minPhaseVisits: 1,
    ...overrides,
  }
}

function tradeStack(trades: string[]): TradeStack {
  return {
    primaryTrade: trades[0] || "painting",
    trades,
    activities: [],
    signals: [],
    isMultiTrade: trades.length > 1,
  }
}

function schedule(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    startDate: "2026-05-20",
    crewDays: 2,
    visits: 1,
    calendarDays: { min: 2, max: 2 },
    workDaysPerWeek: 5,
    rationale: [],
    ...overrides,
  }
}

function detect(scopeText: string, overrides: Partial<Parameters<typeof detectProfitLeaks>[0]> = {}) {
  return detectProfitLeaks({
    pricing: pricing(overrides.pricing),
    estimateBasis: basis(),
    pricingSource: "ai",
    priceGuardVerified: false,
    priceGuard: priceGuard(),
    trade: "painting",
    tradeStack: tradeStack(["painting", "drywall", "carpentry", "flooring"]),
    complexityProfile: complexity(),
    planIntelligence: null,
    photoScopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
    },
    schedule: schedule(),
    scopeText,
    scopeFacts: buildEstimatorScopeFacts(scopeText),
    ...overrides,
  })
}

function labels(result: ReturnType<typeof detectProfitLeaks>): string[] {
  return [
    ...(result?.likelyProfitLeaks || []),
    ...(result?.pricingReviewPrompts || []),
  ].map((item) => item.label)
}

function assertNoCoordinationLeak(result: ReturnType<typeof detectProfitLeaks>) {
  assert.equal(labels(result).some((label) => /coordination burden|coordination load|pricing spread/i.test(label)), false)
}

test("painting exclusions with polluted multi-trade stack do not create coordination burden leak", () => {
  const result = detect(
    "Paint walls only. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."
  )

  assertNoCoordinationLeak(result)
})

test("electrical by-others drywall and painting do not create multi-trade profit leak", () => {
  const scope =
    "Electrical rough-in for vanity lights and GFCI outlets. Drywall patching and painting by others. Owner-supplied fixtures."
  const result = detect(scope, {
    trade: "electrical",
    tradeStack: tradeStack(["electrical", "drywall", "painting", "carpentry", "plumbing"]),
    scopeFacts: buildEstimatorScopeFacts(scope),
  })

  assertNoCoordinationLeak(result)
})

test("bathroom tile with plumbing and glass by others does not create plumbing/glass coordination leak", () => {
  const scope =
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include protection and cleanup."
  const result = detect(scope, {
    trade: "bathroom tile",
    tradeStack: tradeStack(["tile", "plumbing", "glass", "carpentry"]),
    complexityProfile: complexity({ class: "remodel", minMobilization: 100 }),
    scopeFacts: buildEstimatorScopeFacts(scope),
  })

  assertNoCoordinationLeak(result)
})

test("wallcovering-only by-others scope does not create multi-trade profit leak", () => {
  const scope =
    "Install wallcovering with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering."
  const result = detect(scope, {
    trade: "wallcovering",
    tradeStack: tradeStack(["wallcovering", "painting", "electrical", "furniture"]),
    scopeFacts: buildEstimatorScopeFacts(scope),
  })

  assertNoCoordinationLeak(result)
})

test("carpentry protection and by-others scope does not create multi-trade or protection false positive", () => {
  const scope =
    "Replace 120 LF of baseboards. Painting by others. Flooring protection only. Existing flooring to remain."
  const result = detect(scope, {
    trade: "carpentry",
    tradeStack: tradeStack(["carpentry", "painting", "flooring"]),
    complexityProfile: complexity({ class: "simple", minMobilization: 100 }),
    scopeFacts: buildEstimatorScopeFacts(scope),
  })

  assertNoCoordinationLeak(result)
  assert.equal(labels(result).some((label) => /protection/i.test(label)), false)
})

test("true mixed renovation keeps coordination profit leak diagnostics", () => {
  const scope =
    "Demo bathroom finishes, rough-in electrical and plumbing, install shower tile, flooring, baseboards, and paint walls."
  const result = detect(scope, {
    trade: "general renovation",
    tradeStack: tradeStack(["demolition", "electrical", "plumbing", "tile", "flooring", "painting"]),
    scopeFacts: buildEstimatorScopeFacts(scope),
  })

  assert.equal(labels(result).some((label) => /coordination burden/i.test(label)), true)
})

test("true wet-area remodel keeps wet-area and demo review behavior", () => {
  const scope = "Bathroom remodel with waterproof shower tile and new vanity."
  const result = detect(scope, {
    trade: "bathroom tile",
    tradeStack: tradeStack(["tile"]),
    complexityProfile: complexity({ class: "remodel", minMobilization: 600 }),
    photoScopeAssist: {
      missingScopeFlags: ["Photos suggest demo/removal work may be needed."],
      suggestedAdditions: [],
    },
    estimateBasis: basis({ mobilization: 100 }),
    scopeFacts: buildEstimatorScopeFacts(scope),
  })

  assert.equal(labels(result).some((label) => /wet-area protection/i.test(label)), true)
  assert.equal(labels(result).some((label) => /demo and haul-off/i.test(label)), true)
})

test("no-facts path remains backward-compatible for polluted multi-trade stack", () => {
  const scope = "Paint walls only. Flooring protection only."
  const result = detectProfitLeaks({
    pricing: pricing(),
    estimateBasis: basis(),
    pricingSource: "ai",
    priceGuardVerified: false,
    priceGuard: priceGuard(),
    trade: "painting",
    tradeStack: tradeStack(["painting", "flooring"]),
    complexityProfile: complexity(),
    planIntelligence: null,
    photoScopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
    },
    schedule: schedule(),
    scopeText: scope,
  })

  assert.equal(labels(result).some((label) => /coordination burden/i.test(label)), true)
})
