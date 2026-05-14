import test from "node:test"
import assert from "node:assert/strict"

import { buildScopePriceConsistencyReview } from "./scope-price-consistency-review"
import type { EstimateStructuredSection, MaterialsList, ScopeXRay } from "./types"

function scopeXRay({
  primaryTrade = "",
  splitScopes = [],
  anchorId = null,
}: {
  primaryTrade?: string
  splitScopes?: Array<{ trade: string; scope: string }>
  anchorId?: string | null
}): ScopeXRay {
  return {
    detectedScope: {
      primaryTrade,
      splitScopes,
      paintScope: null,
      state: "",
    },
    quantities: [],
    pricingMethod: {
      pricingSource: anchorId ? "deterministic" : "ai",
      detSource: anchorId ? "anchor" : null,
      anchorId,
      verified: Boolean(anchorId),
      stateAdjusted: false,
    },
    scheduleLogic: {
      crewDays: null,
      visits: null,
      reasons: [],
    },
    riskFlags: [],
    needsConfirmation: [],
  }
}

function materials(labels: string[]): MaterialsList {
  return {
    items: labels.map((label) => ({
      label,
      quantity: "verify",
      category: "material" as const,
      confidence: "medium" as const,
    })),
    confirmItems: [],
    notes: [],
  }
}

function section(trade: string): EstimateStructuredSection {
  return {
    trade,
    section: trade,
    label: `${trade} section`,
    pricingBasis: "direct",
    estimatorTreatment: "section_row",
    amount: 1000,
    labor: 700,
    materials: 300,
    subs: 0,
    notes: [],
  }
}

function reviewText(review: ReturnType<typeof buildScopePriceConsistencyReview>) {
  return [
    ...review.missedScopeWarnings,
    ...review.laborMaterialConfidenceNotes,
    ...review.scopeClarityWarnings,
    ...review.suggestedExclusions,
    ...review.contractorRiskNotes,
  ].join(" | ").toLowerCase()
}

test("Case 7A painting scope stays quiet for flooring anchor and material noise", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText:
      "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls only in living room and hallway." }],
    }),
    materialsList: materials(["Paint", "Roller covers", "Masking tape and plastic"]),
    estimateSections: [section("painting")],
  })

  const text = reviewText(review)
  assert.doesNotMatch(text, /flooring anchor|flooring items|general renovation/)
})

test("painting scope exclusion list does not become painting and drywall mixed scope", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText:
      "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls only in living room and hallway." }],
    }),
    materialsList: materials(["Caulk / spackle / filler", "Roller covers", "Masking tape"]),
    estimateSections: [section("painting")],
  })

  const text = reviewText(review)
  assert.doesNotMatch(text, /multiple trades/)
  assert.doesNotMatch(text, /drywall/)
})

test("true painting plus LVP mixed scope remains accepted", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "general_renovation",
    scopeText: "Paint walls in living room and install LVP flooring with transitions.",
    scopeXRay: scopeXRay({
      primaryTrade: "general_renovation",
      splitScopes: [
        { trade: "painting", scope: "Paint walls in living room." },
        { trade: "flooring", scope: "Install LVP flooring with transitions." },
      ],
      anchorId: "flooring_only_v1",
    }),
    materialsList: materials(["Paint", "LVP flooring", "Underlayment", "Transitions"]),
    estimateSections: [section("painting"), section("flooring")],
  })

  assert.equal(reviewText(review), "")
})

test("flooring anchor and materials without flooring support warn", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText: "Paint walls in hallway. Flooring protection only. Flooring excluded.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls in hallway." }],
      anchorId: "flooring_only_v1",
    }),
    materialsList: materials(["LVP flooring", "Underlayment", "Transitions"]),
    estimateSections: [section("painting")],
  })

  const text = reviewText(review)
  assert.match(text, /pricing anchor appears flooring-based/)
  assert.match(text, /materials list includes flooring items/)
})

test("painting prep caulk spackle and filler do not warn as drywall materials", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText: "Paint walls in hallway. Flooring protection only. Flooring excluded.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls in hallway." }],
    }),
    materialsList: materials(["Caulk", "Spackle", "Filler", "Masking tape"]),
    estimateSections: [section("painting")],
  })

  assert.doesNotMatch(reviewText(review), /drywall items/)
})

test("true drywall material labels still warn when drywall is unsupported", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText: "Paint walls in hallway. Drywall repair excluded.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls in hallway." }],
    }),
    materialsList: materials(["Drywall sheet", "Joint compound", "Drywall tape"]),
    estimateSections: [section("painting")],
  })

  assert.match(reviewText(review), /materials list includes drywall items/)
})

test("flooring adhesive and misc install supplies do not warn as wallcovering materials", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "general_renovation",
    scopeText: "Paint walls in living room and install LVP flooring with transitions.",
    scopeXRay: scopeXRay({
      primaryTrade: "general_renovation",
      splitScopes: [
        { trade: "painting", scope: "Paint walls in living room." },
        { trade: "flooring", scope: "Install LVP flooring with transitions." },
      ],
      anchorId: "flooring_only_v1",
    }),
    materialsList: materials(["Paint", "LVP flooring", "Flooring adhesive", "Misc install supplies"]),
    estimateSections: [section("painting"), section("flooring")],
  })

  assert.doesNotMatch(reviewText(review), /wallcovering items/)
})

test("electrical materials and sections without electrical support warn", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "plumbing",
    scopeText: "Replace toilet and faucet. Electrical by others.",
    scopeXRay: scopeXRay({
      primaryTrade: "plumbing",
      splitScopes: [{ trade: "plumbing", scope: "Replace toilet and faucet." }],
    }),
    materialsList: materials(["Outlet", "Switch", "Electrical wire"]),
    estimateSections: [section("plumbing"), section("electrical")],
  })

  const text = reviewText(review)
  assert.match(text, /materials list includes electrical items/)
})

test("bathroom tile with plumbing by others does not warn for owner fixture language", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "bathroom_tile",
    scopeText:
      "Waterproof shower walls and install tile. Plumbing by others. Owner-supplied tile and fixtures.",
    scopeXRay: scopeXRay({
      primaryTrade: "tile",
      splitScopes: [{ trade: "tile", scope: "Waterproof shower walls and install tile." }],
    }),
    materialsList: materials(["Tile", "Grout", "Waterproofing membrane", "Owner-supplied fixtures to verify"]),
    estimateSections: [section("tile")],
  })

  const text = reviewText(review)
  assert.doesNotMatch(text, /plumbing items/)
  assert.match(text, /owner\/customer-supplied materials/)
})

test("wallcovering prep and primer does not warn as painting drift", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "wallcovering",
    scopeText:
      "Install wallcovering with wall prep and primer included. Painting, electrical, and furniture moving by others.",
    scopeXRay: scopeXRay({
      primaryTrade: "wallcovering",
      splitScopes: [{ trade: "wallcovering", scope: "Install wallcovering with wall prep and primer included." }],
    }),
    materialsList: materials(["Wallcovering adhesive", "Primer", "Wall prep supplies"]),
    estimateSections: [section("wallcovering")],
  })

  const text = reviewText(review)
  assert.doesNotMatch(text, /painting items/)
  assert.doesNotMatch(text, /multiple trades/)
})

test("wallcovering material labels without wallcovering support still warn", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText: "Paint walls in hallway.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls in hallway." }],
    }),
    materialsList: materials(["Wallpaper rolls", "Wallcovering seam adhesive"]),
    estimateSections: [section("painting")],
  })

  assert.match(reviewText(review), /materials list includes wallcovering items/)
})

test("owner-supplied LVP creates material responsibility note only", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "flooring",
    scopeText: "Install owner-supplied LVP flooring with transitions.",
    scopeXRay: scopeXRay({
      primaryTrade: "flooring",
      splitScopes: [{ trade: "flooring", scope: "Install owner-supplied LVP flooring with transitions." }],
      anchorId: "flooring_only_v1",
    }),
    materialsList: materials(["Transitions", "Floor protection"]),
    estimateSections: [section("flooring")],
  })

  const text = reviewText(review)
  assert.match(text, /owner\/customer-supplied materials/)
  assert.doesNotMatch(text, /pricing anchor appears flooring-based/)
  assert.doesNotMatch(text, /materials list includes flooring items/)
})

test("contractor-supplied paint does not create owner material responsibility note", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "painting",
    scopeText: "Paint walls in hallway. Two coats. Contractor-supplied paint.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls in hallway." }],
    }),
    materialsList: materials(["Interior paint / primer", "Masking tape"]),
    estimateSections: [section("painting")],
  })

  assert.doesNotMatch(reviewText(review), /owner\/customer-supplied materials/)
})

test("flooring scope with painting by others and existing baseboards remains flooring only", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "flooring",
    scopeText:
      "Remove existing carpet and install owner-supplied LVP in bedrooms 201 and 202 with underlayment and transitions. Existing baseboards to remain. Painting by others. Include floor protection, cleanup, and customer approval.",
    scopeXRay: scopeXRay({
      primaryTrade: "flooring",
      splitScopes: [
        { trade: "general_renovation", scope: "Remove existing carpet." },
        { trade: "flooring", scope: "Install owner-supplied LVP with underlayment and transitions." },
      ],
      anchorId: "flooring_only_v1",
    }),
    materialsList: materials(["LVP flooring", "Underlayment", "Transitions", "Floor protection"]),
    estimateSections: [section("flooring")],
  })

  const text = reviewText(review)
  assert.match(text, /owner\/customer-supplied materials/)
  assert.doesNotMatch(text, /multiple trades/)
  assert.doesNotMatch(text, /painting/)
  assert.doesNotMatch(text, /carpentry/)
  assert.doesNotMatch(text, /pricing anchor appears flooring-based/)
})

test("flooring with baseboard replacement still detects carpentry mixed scope", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "flooring",
    scopeText: "Install LVP flooring with transitions and replace baseboards.",
    scopeXRay: scopeXRay({
      primaryTrade: "flooring",
      splitScopes: [{ trade: "flooring", scope: "Install LVP flooring with transitions." }],
      anchorId: "flooring_only_v1",
    }),
    materialsList: materials(["LVP flooring", "Transitions"]),
    estimateSections: [section("flooring")],
  })

  assert.match(reviewText(review), /multiple trades/)
})

test("true mixed scope missing from diagnostics creates missed-scope review note", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "general_renovation",
    scopeText: "Paint walls and install LVP flooring with transitions.",
    scopeXRay: scopeXRay({
      primaryTrade: "painting",
      splitScopes: [{ trade: "painting", scope: "Paint walls." }],
    }),
    materialsList: materials(["Paint"]),
    estimateSections: [section("painting")],
  })

  assert.match(reviewText(review), /pricing diagnostics do not clearly show the mixed scope/)
})

test("electrical vanity lights do not create plumbing mixed-scope warning", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "electrical",
    scopeText:
      "Electrical rough-in for 4 vanity lights and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied light fixtures. Include permit/inspection coordination, access through open walls, cleanup, and customer approval.",
    scopeXRay: scopeXRay({
      primaryTrade: "electrical",
      splitScopes: [
        {
          trade: "electrical",
          scope: "Electrical rough-in for 4 vanity lights and 2 GFCI outlets.",
        },
      ],
      anchorId: "electrical_engine_v1_verified",
    }),
    materialsList: materials(["Electrical devices / fixtures", "Electrical hardware", "Protection"]),
    estimateSections: [section("electrical")],
  })

  const text = reviewText(review)
  assert.doesNotMatch(text, /multiple trades/)
  assert.doesNotMatch(text, /plumbing/)
  assert.doesNotMatch(text, /carpentry/)
})

test("bathroom tile materials do not warn for plumbing or flooring when boundaries exclude them", () => {
  const review = buildScopePriceConsistencyReview({
    selectedTrade: "bathroom_tile",
    scopeText:
      "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include demo, cement board/backer, membrane, cleanup, protection, and customer approval.",
    scopeXRay: scopeXRay({
      primaryTrade: "tile",
      splitScopes: [
        {
          trade: "tile",
          scope: "Waterproof shower walls and install tile, grout, and trim.",
        },
      ],
      anchorId: "bathroom_remodel_v1",
    }),
    materialsList: materials([
      "Waterproofing materials",
      "Tile / setting materials",
      "Thinset / mortar",
      "Grout / sealant / caulk",
      "Protection / masking materials",
    ]),
    estimateSections: [section("tile")],
  })

  const text = reviewText(review)
  assert.doesNotMatch(text, /plumbing items/)
  assert.doesNotMatch(text, /flooring items/)
  assert.match(text, /owner\/customer-supplied materials/)
})
