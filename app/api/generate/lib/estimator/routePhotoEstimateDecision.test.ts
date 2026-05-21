import test from "node:test"
import assert from "node:assert/strict"

import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import {
  buildPhotoEstimateDecision,
  buildPhotoMissingInputs,
  buildPhotoScopeAssist,
  getEffectiveQuantityInputs,
  hasUsablePhotoQuantities,
  scorePhotoPacket,
} from "./routePhotoEstimateDecision"
import type {
  ComplexityProfile,
  PhotoAnalysis,
  TradeStack,
} from "./types"
import type { RoutePhotoInput } from "./routePhotoEstimateDecision"
import type { EstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"

const fullPhotos: RoutePhotoInput[] = [
  { name: "overview.jpg", dataUrl: "data:image/jpeg;base64,AA==", shotType: "overview", roomTag: "room" },
  { name: "wall.jpg", dataUrl: "data:image/jpeg;base64,AA==", shotType: "wall", roomTag: "room" },
  { name: "floor.jpg", dataUrl: "data:image/jpeg;base64,AA==", shotType: "floor", roomTag: "room" },
  { name: "ceiling.jpg", dataUrl: "data:image/jpeg;base64,AA==", shotType: "ceiling", roomTag: "room" },
  { name: "fixture.jpg", dataUrl: "data:image/jpeg;base64,AA==", shotType: "fixture", roomTag: "room" },
  { name: "measurement.jpg", dataUrl: "data:image/jpeg;base64,AA==", shotType: "measurement", roomTag: "room" },
]

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
    maxCrewDays: 1,
    minMobilization: 0,
    minSubs: 0,
    crewSizeMin: 1,
    crewSizeMax: 1,
    hoursPerDayEffective: 8,
    minPhaseVisits: 1,
    ...overrides,
  }
}

function tradeStack(overrides: Partial<TradeStack> = {}): TradeStack {
  return {
    primaryTrade: "painting",
    trades: ["painting"],
    activities: [],
    signals: [],
    isMultiTrade: false,
    ...overrides,
  }
}

function photoAnalysis(overrides: Partial<PhotoAnalysis> = {}): PhotoAnalysis {
  return {
    summary: "Clear job photos.",
    observations: [],
    suggestedScopeNotes: [],
    jobSummary: {
      probableArea: "interior_room",
      detectedTrades: ["painting"],
      detectedRoomTypes: ["bedroom"],
      detectedMaterials: [],
      detectedConditions: [],
      detectedFixtures: [],
      detectedAccessIssues: [],
      detectedDemoNeeds: [],
      complexityFlags: [],
      mergedQuantities: {
        doors: null,
        windows: null,
        vanities: null,
        toilets: null,
        sinks: null,
        outlets: null,
        switches: null,
        recessedLights: null,
        cabinets: null,
        appliances: null,
        wallSqft: null,
        ceilingSqft: null,
        floorSqft: null,
        trimLf: null,
      },
      quantitySources: {
        wallSqft: null,
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
      confidenceScore: 88,
    },
    ...overrides,
  }
}

function decide(args: {
  trade: string
  scopeText: string
  photos?: RoutePhotoInput[]
  rooms?: number | null
  doors?: number | null
  measurements?: any | null
  analysis?: PhotoAnalysis | null
  complexityProfile?: ComplexityProfile | null
  stack?: TradeStack | null
  scopeFacts?: EstimatorScopeFacts | null
}) {
  const photos = args.photos ?? fullPhotos
  const analysis = args.analysis === undefined ? photoAnalysis() : args.analysis
  const packet = scorePhotoPacket(photos)
  const assist = buildPhotoScopeAssist({
    photoAnalysis: analysis,
    scopeText: args.scopeText,
    trade: args.trade,
  })
  const quantityInputs = getEffectiveQuantityInputs({
    measurements: args.measurements ?? null,
    scopeText: args.scopeText,
    photoAnalysis: analysis,
  })

  return buildPhotoEstimateDecision({
    trade: args.trade,
    scopeText: args.scopeText,
    rooms: args.rooms ?? null,
    doors: args.doors ?? null,
    photosCount: photos.length,
    photoPacketScore: packet,
    photoAnalysis: analysis,
    photoScopeAssist: assist,
    quantityInputs,
    complexityProfile: args.complexityProfile ?? null,
    tradeStack: args.stack ?? null,
    scopeFacts: args.scopeFacts,
  })
}

function policySnapshot(decision: ReturnType<typeof decide>) {
  return {
    pricingAllowed: decision.pricingAllowed,
    blockers: decision.blockers,
    confidence: decision.confidence,
    confidenceBand: decision.confidenceBand,
    estimateMode: decision.estimateMode,
    pricingPolicy: decision.pricingPolicy,
    missingInputs: decision.missingInputs,
  }
}

test("characterizes painting exclusions with polluted multi-trade stack", () => {
  const decision = decide({
    trade: "painting",
    scopeText:
      "Paint walls only, 500 sqft. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
    complexityProfile: complexity({ class: "medium", multiTrade: true }),
    stack: tradeStack({
      trades: ["painting", "drywall", "electrical", "plumbing", "flooring", "carpentry"],
      isMultiTrade: true,
    }),
  })

  assert.equal(decision.pricingPolicy, "allow_with_warning")
  assert.equal(decision.pricingAllowed, true)
  assert.ok(decision.missingInputs.includes("measurements"))
  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
})

test("characterizes electrical scope with drywall and painting by others as measurement-required", () => {
  const decision = decide({
    trade: "electrical",
    scopeText:
      "Electrical rough-in for 2 vanity light fixtures and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied fixtures.",
    stack: tradeStack({
      primaryTrade: "electrical",
      trades: ["electrical", "drywall", "painting", "carpentry", "plumbing"],
      isMultiTrade: true,
    }),
  })

  assert.equal(decision.pricingPolicy, "block")
  assert.equal(decision.pricingAllowed, false)
  assert.ok(decision.missingInputs.includes("measurements"))
  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
  assert.ok(
    decision.blockers.includes("This scope needs measurements because the job is too complex for photo-only pricing.")
  )
})

test("characterizes bathroom tile scope with by-others plumbing/glass as remodel and multi-trade risk", () => {
  const decision = decide({
    trade: "general renovation",
    scopeText:
      "Waterproof shower walls, install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures.",
    complexityProfile: complexity({ class: "remodel", multiTrade: true }),
    stack: tradeStack({
      primaryTrade: "tile",
      trades: ["tile", "plumbing", "glass"],
      isMultiTrade: true,
    }),
  })

  assert.equal(decision.pricingPolicy, "block")
  assert.ok(decision.missingInputs.includes("measurements"))
  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
  assert.ok(decision.reasons.includes("Remodel-level scope increases hidden-condition risk."))
})

test("characterizes wallcovering-only scope with by-others trades as multi-trade risk", () => {
  const decision = decide({
    trade: "general renovation",
    scopeText:
      "Install owner-supplied wallcovering with wall prep and primer. Painting, electrical, and furniture moving by others.",
    stack: tradeStack({
      primaryTrade: "wallcovering",
      trades: ["wallcovering", "painting", "electrical"],
      isMultiTrade: true,
    }),
  })

  assert.equal(decision.pricingPolicy, "block")
  assert.ok(decision.missingInputs.includes("measurements"))
  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
})

test("characterizes baseboard scope with protection/by-others context as blocked when stack is polluted", () => {
  const decision = decide({
    trade: "carpentry",
    scopeText:
      "Replace 120 LF baseboards. Painting by others. Flooring protection only. Existing flooring to remain.",
    stack: tradeStack({
      primaryTrade: "carpentry",
      trades: ["carpentry", "painting", "flooring"],
      isMultiTrade: true,
    }),
  })

  assert.equal(decision.pricingPolicy, "block")
  assert.ok(decision.missingInputs.includes("measurements"))
  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
  assert.ok(
    decision.blockers.includes("This scope needs measurements because the job is too complex for photo-only pricing.")
  )
})

test("characterizes true mixed renovation as multi-trade and measurement-required", () => {
  const decision = decide({
    trade: "general renovation",
    scopeText:
      "Demo, electrical rough-in, plumbing rough-in, drywall, flooring, baseboards, and painting.",
    complexityProfile: complexity({ class: "remodel", multiTrade: true, hasDemo: true }),
    stack: tradeStack({
      primaryTrade: "general renovation",
      trades: ["demolition", "electrical", "plumbing", "drywall", "flooring", "carpentry", "painting"],
      isMultiTrade: true,
    }),
  })

  assert.equal(decision.pricingPolicy, "block")
  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
  assert.ok(decision.reasons.includes("Remodel-level scope increases hidden-condition risk."))
})

test("gates polluted multi-trade reason with scope facts while preserving policy outputs", () => {
  const cases = [
    {
      name: "painting exclusions",
      trade: "painting",
      scopeText:
        "Paint walls only, 500 sqft. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
      complexityProfile: complexity({ class: "medium", multiTrade: true }),
      stack: tradeStack({
        trades: ["painting", "drywall", "electrical", "plumbing", "flooring", "carpentry"],
        isMultiTrade: true,
      }),
    },
    {
      name: "electrical by-others",
      trade: "electrical",
      scopeText:
        "Electrical rough-in for 2 vanity light fixtures and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied fixtures.",
      stack: tradeStack({
        primaryTrade: "electrical",
        trades: ["electrical", "drywall", "painting", "carpentry", "plumbing"],
        isMultiTrade: true,
      }),
    },
    {
      name: "bathroom tile by-others",
      trade: "general renovation",
      scopeText:
        "Waterproof shower walls, install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures.",
      complexityProfile: complexity({ class: "remodel", multiTrade: true }),
      stack: tradeStack({
        primaryTrade: "tile",
        trades: ["tile", "plumbing", "glass"],
        isMultiTrade: true,
      }),
    },
    {
      name: "wallcovering by-others",
      trade: "general renovation",
      scopeText:
        "Install owner-supplied wallcovering with wall prep and primer. Painting, electrical, and furniture moving by others.",
      stack: tradeStack({
        primaryTrade: "wallcovering",
        trades: ["wallcovering", "painting", "electrical"],
        isMultiTrade: true,
      }),
    },
    {
      name: "carpentry protection by-others",
      trade: "carpentry",
      scopeText:
        "Replace 120 LF baseboards. Painting by others. Flooring protection only. Existing flooring to remain.",
      stack: tradeStack({
        primaryTrade: "carpentry",
        trades: ["carpentry", "painting", "flooring"],
        isMultiTrade: true,
      }),
    },
  ]

  for (const item of cases) {
    const legacy = decide(item)
    const gated = decide({
      ...item,
      scopeFacts: buildEstimatorScopeFacts(item.scopeText),
    })

    assert.ok(
      legacy.reasons.includes("Multiple trades were detected, which increases pricing risk."),
      item.name
    )
    assert.equal(
      gated.reasons.includes("Multiple trades were detected, which increases pricing risk."),
      false,
      item.name
    )
    assert.deepEqual(policySnapshot(gated), policySnapshot(legacy), item.name)
  }
})

test("preserves true mixed renovation multi-trade reason with scope facts", () => {
  const scopeText =
    "Demo, electrical rough-in, plumbing rough-in, drywall, flooring, baseboards, and painting."

  const decision = decide({
    trade: "general renovation",
    scopeText,
    complexityProfile: complexity({ class: "remodel", multiTrade: true, hasDemo: true }),
    stack: tradeStack({
      primaryTrade: "general renovation",
      trades: ["demolition", "electrical", "plumbing", "drywall", "flooring", "carpentry", "painting"],
      isMultiTrade: true,
    }),
    scopeFacts: buildEstimatorScopeFacts(scopeText),
  })

  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
})

test("preserves no-facts backward-compatible multi-trade reason", () => {
  const decision = decide({
    trade: "painting",
    scopeText:
      "Paint walls only, 500 sqft. Excludes drywall repair, electrical, plumbing, flooring, and carpentry.",
    stack: tradeStack({
      trades: ["painting", "drywall", "electrical", "plumbing", "flooring", "carpentry"],
      isMultiTrade: true,
    }),
  })

  assert.ok(decision.reasons.includes("Multiple trades were detected, which increases pricing risk."))
})

test("characterizes simple photo-friendly painting as photo-only allowed", () => {
  const decision = decide({
    trade: "painting",
    scopeText: "Paint bedroom walls, 500 sqft.",
  })

  assert.equal(decision.estimateMode, "photo_only")
  assert.equal(decision.pricingPolicy, "allow")
  assert.equal(decision.pricingAllowed, true)
  assert.equal(decision.confidenceBand, "high")
  assert.deepEqual(decision.blockers, [])
})

test("characterizes no photos and weak photo packet blockers", () => {
  const noPhotos = decide({
    trade: "painting",
    scopeText: "Paint bedroom walls, 500 sqft.",
    photos: [],
  })

  assert.equal(noPhotos.pricingPolicy, "block")
  assert.equal(noPhotos.confidence, 0)
  assert.ok(noPhotos.blockers.includes("No photos were uploaded."))

  const weakPhoto = decide({
    trade: "painting",
    scopeText: "Paint bedroom walls, 500 sqft.",
    photos: [
      {
        name: "unknown.jpg",
        dataUrl: "data:image/jpeg;base64,AA==",
        shotType: "damage",
      },
    ],
    analysis: null,
  })

  assert.equal(weakPhoto.pricingPolicy, "block")
  assert.ok(weakPhoto.blockers.includes("Photos were uploaded but job-level photo analysis was too weak."))
  assert.equal(weakPhoto.blockers.includes("Photo packet is too weak for reliable pricing."), false)
  assert.equal(weakPhoto.reasons.includes("Photo packet coverage is weak."), true)
})

test("characterizes raw scope quantity parsing for devices, fixtures, LF trim, and exterior painting", () => {
  const electricalQuantityInputs = getEffectiveQuantityInputs({
    measurements: null,
    scopeText: "Owner-supplied 4 vanity light fixtures.",
    photoAnalysis: photoAnalysis(),
  })
  assert.equal(
    hasUsablePhotoQuantities({
      trade: "electrical",
      scopeText: "Owner-supplied 4 vanity light fixtures.",
      rooms: null,
      doors: null,
      quantityInputs: electricalQuantityInputs,
      photoAnalysis: photoAnalysis(),
    }),
    true
  )
  assert.deepEqual(
    buildPhotoMissingInputs({
      trade: "electrical",
      scopeText: "Owner-supplied 4 vanity light fixtures.",
      rooms: null,
      doors: null,
      quantityInputs: electricalQuantityInputs,
      photoAnalysis: photoAnalysis(),
      complexityProfile: null,
      tradeStack: null,
    }),
    []
  )

  const plumbingQuantityInputs = getEffectiveQuantityInputs({
    measurements: null,
    scopeText: "Plumbing by others to set 2 toilets and 2 faucets.",
    photoAnalysis: photoAnalysis(),
  })
  assert.equal(
    hasUsablePhotoQuantities({
      trade: "plumbing",
      scopeText: "Plumbing by others to set 2 toilets and 2 faucets.",
      rooms: null,
      doors: null,
      quantityInputs: plumbingQuantityInputs,
      photoAnalysis: photoAnalysis(),
    }),
    true
  )
  assert.deepEqual(
    buildPhotoMissingInputs({
      trade: "plumbing",
      scopeText: "Plumbing by others to set 2 toilets and 2 faucets.",
      rooms: null,
      doors: null,
      quantityInputs: plumbingQuantityInputs,
      photoAnalysis: photoAnalysis(),
      complexityProfile: null,
      tradeStack: null,
    }),
    []
  )

  const carpentryQuantityInputs = getEffectiveQuantityInputs({
    measurements: null,
    scopeText: "Replace 120 LF baseboards.",
    photoAnalysis: photoAnalysis(),
  })
  assert.equal(
    hasUsablePhotoQuantities({
      trade: "carpentry",
      scopeText: "Replace 120 LF baseboards.",
      rooms: null,
      doors: null,
      quantityInputs: carpentryQuantityInputs,
      photoAnalysis: photoAnalysis(),
    }),
    true
  )

  const exteriorDecision = decide({
    trade: "painting",
    scopeText: "Paint exterior stucco and trim.",
    analysis: photoAnalysis({
      jobSummary: {
        ...photoAnalysis().jobSummary!,
        exteriorSummary: {
          ...photoAnalysis().jobSummary!.exteriorSummary,
          isExterior: true,
          bodyWallSqft: null,
        },
      },
    }),
  })
  assert.ok(exteriorDecision.missingInputs.includes("wall_sqft"))
})
