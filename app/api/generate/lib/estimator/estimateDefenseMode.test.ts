import test from "node:test"
import assert from "node:assert/strict"

import { buildEstimateDefenseMode } from "./estimateDefenseMode"

function makeDefense(scopeText: string, overrides: Record<string, unknown> = {}) {
  return buildEstimateDefenseMode({
    scopeText,
    trade: "general renovation",
    tradeStack: {
      primaryTrade: "general renovation",
      trades: [],
      activities: [],
      signals: [],
      isMultiTrade: false,
    },
    pricing: {
      labor: 1000,
      materials: 500,
      subs: 0,
      markup: 20,
      total: 1800,
    },
    pricingSource: "ai",
    priceGuardVerified: false,
    estimateBasis: {
      units: ["lump_sum"],
      quantities: { lump_sum: 1 },
      laborRate: 85,
      crewDays: 1,
      mobilization: 150,
      assumptions: [],
    },
    missedScopeDetector: null,
    profitLeakDetector: null,
    planIntelligence: null,
    photoScopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
    },
    schedule: {
      startDate: "",
      crewDays: 1,
      visits: 1,
      calendarDays: null,
      workDaysPerWeek: 5,
      rationale: [],
    },
    priceGuard: {
      status: "ai",
      confidence: 75,
      pricingSource: "ai",
      appliedRules: [],
      assumptions: [],
      warnings: [],
      details: {
        stateAdjusted: false,
      },
    },
    complexityProfile: null,
    ...overrides,
  } as any)
}

function allNotes(result: ReturnType<typeof makeDefense>) {
  return Object.values(result || {})
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .join(" ")
}

test("painting exclusions do not create mixed or adjacent-trade estimate defense", () => {
  const result = makeDefense(
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
    {
      trade: "painting",
      tradeStack: {
        primaryTrade: "painting",
        trades: ["painting", "drywall", "carpentry"],
        activities: [],
        signals: [],
        isMultiTrade: true,
      },
    }
  )

  const notes = allNotes(result)
  assert.doesNotMatch(notes, /not single-trade|coordination is implied/i)
  assert.doesNotMatch(notes, /drywall|carpentry|flooring/i)
})

test("electrical vanity lights with by-others drywall and paint do not create plumbing or carpentry defense", () => {
  const result = makeDefense(
    "Electrical rough-in for 4 vanity lights and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied light fixtures. Include permit/inspection coordination, access through open walls, cleanup, and customer approval.",
    {
      trade: "electrical",
      tradeStack: {
        primaryTrade: "electrical",
        trades: ["electrical", "plumbing", "carpentry"],
        activities: [],
        signals: [],
        isMultiTrade: true,
      },
    }
  )

  const notes = allNotes(result)
  assert.doesNotMatch(notes, /not single-trade|coordination is implied/i)
  assert.doesNotMatch(notes, /plumbing|carpentry/i)
})

test("bathroom tile with plumbing by others keeps wet-area defense without plumbing multi-trade defense", () => {
  const result = makeDefense(
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include demo, cement board/backer, membrane, cleanup, protection, and customer approval.",
    {
      trade: "general renovation",
      tradeStack: {
        primaryTrade: "general renovation",
        trades: ["tile", "plumbing"],
        activities: ["waterproofing"],
        signals: [],
        isMultiTrade: true,
      },
    }
  )

  const notes = allNotes(result)
  assert.match(notes, /Wet-area work/i)
  assert.doesNotMatch(notes, /not single-trade|coordination is implied across tile, plumbing/i)
})

test("wallcovering-only general renovation does not create bathroom or rough-in defense noise", () => {
  const result = makeDefense(
    "Install wallcovering in lobby walls with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering. Include layout, pattern match, adhesive, cleanup, protection, and customer approval.",
    {
      trade: "general renovation",
      tradeStack: {
        primaryTrade: "general renovation",
        trades: ["wallcovering", "painting", "electrical"],
        activities: [],
        signals: [],
        isMultiTrade: true,
      },
    }
  )

  const notes = allNotes(result)
  assert.doesNotMatch(notes, /bathroom|wet-area|shower|rough-in|not single-trade/i)
})

test("baseboard replacement scope does not create demolition estimate defense", () => {
  const result = makeDefense(
    "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain. Include caulk/fill prep for painter, cleanup, and customer approval.",
    {
      trade: "carpentry",
      tradeStack: {
        primaryTrade: "carpentry",
        trades: ["carpentry", "demolition"],
        activities: ["demolition"],
        signals: [],
        isMultiTrade: true,
      },
    }
  )

  const notes = allNotes(result)
  assert.doesNotMatch(notes, /demolition|not single-trade|coordination is implied/i)
})

test("true mixed renovation still keeps multi-trade estimate defense", () => {
  const result = makeDefense(
    "Demo existing finishes, electrical rough-in, plumbing rough-in, drywall, flooring, baseboards, and painting.",
    {
      tradeStack: {
        primaryTrade: "general renovation",
        trades: ["electrical", "plumbing", "drywall", "flooring", "carpentry", "painting"],
        activities: ["demolition"],
        signals: [],
        isMultiTrade: true,
      },
    }
  )

  const notes = allNotes(result)
  assert.match(notes, /not single-trade|coordination is implied/i)
})

test("true bathroom remodel keeps wet-area and multi-trade estimate defense", () => {
  const result = makeDefense(
    "Bathroom remodel with waterproof shower walls, install tile, grout, shower valve plumbing rough-in, bathroom floor tile, baseboards, and painting.",
    {
      tradeStack: {
        primaryTrade: "general renovation",
        trades: ["tile", "plumbing", "flooring", "carpentry", "painting"],
        activities: ["waterproofing"],
        signals: [],
        isMultiTrade: true,
      },
      schedule: {
        startDate: "",
        crewDays: 3,
        visits: 3,
        calendarDays: null,
        workDaysPerWeek: 5,
        rationale: [],
      },
    }
  )

  const notes = allNotes(result)
  assert.match(notes, /Wet-area work|Bathroom remodel/i)
  assert.match(notes, /not single-trade|coordination is implied/i)
})
