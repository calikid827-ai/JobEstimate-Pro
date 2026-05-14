import test from "node:test"
import assert from "node:assert/strict"

import { buildPriceGuardReview } from "./priceguard-review"
import type { MaterialsList, ScopeXRay } from "./types"

function buildReview({
  selectedTrade,
  scopeText,
  resultText = "",
  schedule,
  materialsList,
  scopeXRay,
}: {
  selectedTrade: string
  scopeText: string
  resultText?: string
  materialsList?: MaterialsList
  scopeXRay?: ScopeXRay
  schedule?: {
    crewDays: number
    visits: number
    calendarDays: { min: number; max: number }
    workDaysPerWeek: number
    rationale: string[]
  }
}) {
  return buildPriceGuardReview({
    hasResult: true,
    selectedTrade,
    scopeText,
    resultText,
    pricing: {
      labor: 1400,
      materials: 700,
      subs: 0,
      markup: 25,
      total: 2800,
    },
    materialsList,
    scopeXRay,
    schedule: schedule || {
      crewDays: 1,
      visits: 1,
      calendarDays: { min: 1, max: 2 },
      workDaysPerWeek: 5,
      rationale: ["Normal crew sequencing included."],
    },
    deposit: {
      enabled: true,
      type: "percent",
      value: 50,
    },
  })
}

function baseScopeXRay({
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

function reviewText(review: ReturnType<typeof buildReview>) {
  assert.ok(review)
  return [
    ...review.missedScopeWarnings,
    ...review.laborMaterialConfidenceNotes,
    ...review.scopeClarityWarnings,
    ...review.suggestedExclusions,
    ...review.contractorRiskNotes,
  ]
    .join(" | ")
    .toLowerCase()
}

test("PriceGuard adds electrical-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "electrical",
      scopeText: "Install bathroom lighting.",
      resultText: "Install lighting. Includes cleanup, protection, and customer approval.",
    })
  )

  assert.match(text, /device, fixture, circuit, or panel counts/)
  assert.match(text, /fixtures, devices, lamps, and trims/)
  assert.match(text, /access and wall\/ceiling patching/)
  assert.match(text, /permit, inspection, code/)
  assert.doesNotMatch(text, /painted surfaces/)
})

test("generated electrical text resolves trade-specific review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "electrical",
      scopeText: "Install bathroom lighting.",
      resultText:
        "Install 4 owner supplied light fixtures. Includes permit and inspection coordination, access through open ceiling, patching by others and excluded, cleanup, protection, and customer approval.",
    })
  )

  assert.doesNotMatch(text, /device, fixture, circuit, or panel counts/)
  assert.doesNotMatch(text, /fixtures, devices, lamps, and trims/)
  assert.doesNotMatch(text, /access and wall\/ceiling patching/)
  assert.doesNotMatch(text, /permit, inspection, code/)
})

test("PriceGuard adds plumbing-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "plumbing",
      scopeText: "Bathroom plumbing updates.",
      resultText: "Complete plumbing updates with cleanup, protection, and customer approval.",
    })
  )

  assert.match(text, /fixture, valve, drain, supply, or rough-in counts/)
  assert.match(text, /fixtures, valves, trims/)
  assert.match(text, /access and wall\/floor\/tile repair/)
  assert.match(text, /shutoff, permit, inspection/)
})

test("PriceGuard adds flooring-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "flooring",
      scopeText: "Install new flooring in two rooms.",
      resultText: "Install flooring with cleanup, protection, owner approval, and excluded hidden damage.",
    })
  )

  assert.match(text, /product type and finish selection/)
  assert.match(text, /removal and disposal/)
  assert.match(text, /subfloor prep/)
  assert.match(text, /thresholds, and transitions/)
})

test("PriceGuard adds drywall-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "drywall",
      scopeText: "Repair drywall.",
      resultText: "Repair drywall with materials, cleanup, and customer approval.",
    })
  )

  assert.match(text, /patch count, sheet count/)
  assert.match(text, /finish level or texture match/)
  assert.match(text, /primer\/paint/)
  assert.match(text, /dust protection/)
})

test("PriceGuard adds painting-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "painting",
      scopeText: "Paint room.",
      resultText: "Paint room with cleanup, exclusions, and customer approval.",
    })
  )

  assert.match(text, /included surfaces/)
  assert.match(text, /coat count/)
  assert.match(text, /masking\/protection/)
  assert.match(text, /paint\/material supply/)
})

test("PriceGuard adds bathroom tile-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "bathroom_tile",
      scopeText: "Bathroom tile remodel.",
      resultText: "Install bathroom tile with cleanup, protection, and customer approval.",
    })
  )

  assert.match(text, /demolition, haul-off/)
  assert.match(text, /waterproofing, backer board/)
  assert.match(text, /fixture, plumbing, and electrical boundaries/)
  assert.match(text, /tile, grout, trim/)
})

test("PriceGuard adds wallcovering-specific missed-scope review notes", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "wallcovering",
      scopeText: "Install wallpaper.",
      resultText: "Install wallpaper with cleanup, protection, exclusions, and customer approval.",
    })
  )

  assert.match(text, /wall area, linear footage/)
  assert.match(text, /removal, wall repair/)
  assert.match(text, /pattern repeat/)
  assert.match(text, /material, adhesive/)
})

test("strong trade scopes avoid trade-specific missed-scope review notes", () => {
  const strongCases = [
    {
      selectedTrade: "painting",
      scopeText:
        "Paint walls and trim in 3 rooms. Includes patching, primer, two coats, satin finish, masking/protection, cleanup, contractor supplied materials, excluded hidden damage, and customer approval.",
      absent: [/included surfaces/, /coat count/, /masking\/protection/, /paint\/material supply/],
    },
    {
      selectedTrade: "plumbing",
      scopeText:
        "Replace 1 owner supplied toilet and 1 faucet. Includes water shutoff, permit and inspection assumptions, vanity access, wall/floor/tile repair excluded, cleanup, protection, and customer approval.",
      absent: [/fixture, valve, drain, supply/, /fixtures, valves, trims/, /access and wall\/floor\/tile repair/, /shutoff, permit, inspection/],
    },
    {
      selectedTrade: "flooring",
      scopeText:
        "Install 500 sq ft owner supplied LVP. Includes existing flooring removal and disposal, subfloor prep, underlayment, transitions, thresholds, base shoe, cleanup, protection, hidden damage excluded, and customer approval.",
      absent: [/product type and finish selection/, /removal and disposal/, /subfloor prep/, /thresholds, and transitions/],
    },
    {
      selectedTrade: "drywall",
      scopeText:
        "Repair 4 drywall patches. Includes material, dust protection, cleanup, level 4 finish, orange peel texture match, primer only with paint by others, excluded hidden damage, and customer approval.",
      absent: [/patch count, sheet count/, /finish level or texture match/, /primer\/paint/, /dust protection/],
    },
    {
      selectedTrade: "bathroom_tile",
      scopeText:
        "Remodel shower tile. Includes demolition, haul-off, waterproofing membrane, backer board, pan, substrate prep, owner supplied tile/grout/trim, fixture/plumbing/electrical boundaries, glass excluded, hidden damage excluded, cleanup, protection, and customer approval.",
      absent: [/demolition, haul-off/, /waterproofing, backer board/, /fixture, plumbing, and electrical boundaries/, /tile, grout, trim/],
    },
    {
      selectedTrade: "wallcovering",
      scopeText:
        "Install 300 sq ft owner supplied vinyl wallcovering. Includes existing removal, wall repair, substrate prep, primer, pattern repeat, seam layout, waste allowance, adhesive, cleanup, protection, exclusions, and customer approval.",
      absent: [/wall area, linear footage/, /removal, wall repair/, /pattern repeat/, /material, adhesive/],
    },
  ]

  for (const item of strongCases) {
    const text = reviewText(buildReview(item))
    for (const pattern of item.absent) {
      assert.doesNotMatch(text, pattern, item.selectedTrade)
    }
  }
})

test("PriceGuard includes schedule sequencing review notes through existing fields", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "bathroom_tile",
      scopeText: "Waterproof shower walls, install tile, grout, and reinstall fixtures.",
      resultText: "Includes waterproofing membrane, shower tile, grout, cleanup, and customer approval.",
      schedule: {
        crewDays: 1,
        visits: 1,
        calendarDays: { min: 1, max: 1 },
        workDaysPerWeek: 5,
        rationale: ["One site visit assumed."],
      },
    })
  )

  assert.match(text, /grout cure/)
  assert.match(text, /fixture\/accessory return coordination/)
})

test("PriceGuard includes scope-to-price consistency notes through existing fields", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "painting",
      scopeText: "Paint walls in hallway. Flooring protection only. Flooring excluded.",
      resultText: "Paint walls with cleanup and customer approval.",
      scopeXRay: baseScopeXRay({
        primaryTrade: "painting",
        splitScopes: [{ trade: "painting", scope: "Paint walls in hallway." }],
        anchorId: "flooring_only_v1",
      }),
      materialsList: {
        items: [
          {
            label: "LVP flooring",
            quantity: "verify",
            category: "material",
          },
        ],
        confirmItems: [],
        notes: [],
      },
    })
  )

  assert.match(text, /pricing anchor appears flooring-based/)
  assert.match(text, /materials list includes flooring items/)
})

test("PriceGuard suppresses primer after patching material confirmation when drywall patching is excluded", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "painting",
      scopeText:
        "Paint walls only in living room and hallway. Two coats, contractor-supplied paint. Excludes drywall repair, skim coat, and texture matching.",
      resultText:
        "Includes wall painting, masking, protection, cleanup, and approval. Drywall repair and texture matching are excluded. Allowing patch/texture dry time before painting is only a schedule consideration for work by others.",
      materialsList: {
        items: [],
        confirmItems: ["Primer / sealer after patching"],
        notes: [],
      },
    })
  )

  assert.doesNotMatch(text, /primer \/ sealer after patching/)
})

test("PriceGuard preserves primer after patching confirmation for true patch-and-paint", () => {
  const text = reviewText(
    buildReview({
      selectedTrade: "painting",
      scopeText: "Patch drywall, prime, and paint one room.",
      resultText: "Includes patching, primer, paint, cleanup, and approval.",
      materialsList: {
        items: [],
        confirmItems: ["Primer / sealer after patching"],
        notes: [],
      },
    })
  )

  assert.match(text, /primer \/ sealer after patching/)
})
