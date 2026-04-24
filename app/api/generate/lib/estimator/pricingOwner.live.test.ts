import assert from "node:assert/strict"
import test from "node:test"

import { decidePricingOwner } from "./pricingOwner"
import type {
  EstimateBasis,
  MultiTradeDeterministicResult,
  PricingOwnerContext,
} from "./types"

function makeBasis(label: string): EstimateBasis {
  return {
    units: ["days"],
    quantities: { days: 2 },
    laborRate: 75,
    hoursPerUnit: 8,
    crewDays: 2,
    mobilization: 250,
    assumptions: [label],
    sectionPricing: [
      {
        section: `${label} section`,
        labor: 100,
        materials: 50,
        subs: 25,
        total: 210,
        pricingBasis: "direct",
      },
    ],
  }
}

function makeCtx(
  overrides: Partial<PricingOwnerContext> = {}
): PricingOwnerContext {
  const baseMultiTrade: MultiTradeDeterministicResult = {
    okForDeterministic: false,
    okForVerified: false,
    pricing: null,
    estimateBasis: null,
    perTrade: [],
    notes: [],
  }

  return {
    trade: "painting",
    effectivePaintScope: "walls",
    useBigJobPricing: false,
    anchorHit: null,
    multiTradeDet: baseMultiTrade,
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

test("painting owner selection carries deterministic estimateBasis when plan-aware numeric pricing is present", () => {
  const basis = makeBasis("painting basis")
  const decision = decidePricingOwner(
    makeCtx({
      trade: "painting",
      paintingDet: {
        pricing: { labor: 1200, materials: 400, subs: 200, markup: 20, total: 2160 },
        okForVerified: true,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: basis,
      },
    })
  )

  assert.equal(decision.owner, "painting_engine")
  assert.equal(decision.detSource, "painting_engine_v1_verified")
  assert.equal(decision.estimateBasis, basis)
  assert.equal(decision.estimateBasis?.sectionPricing?.[0]?.section, "painting basis section")
})

test("drywall owner selection carries deterministic estimateBasis when plan-aware numeric pricing is present", () => {
  const basis = makeBasis("drywall basis")
  const decision = decidePricingOwner(
    makeCtx({
      trade: "drywall",
      drywallDet: {
        pricing: { labor: 1800, materials: 650, subs: 300, markup: 20, total: 3300 },
        okForVerified: false,
        verifiedSource: "drywall_engine_v1_verified",
        source: "drywall_engine_v1",
        estimateBasis: basis,
      },
    })
  )

  assert.equal(decision.owner, "drywall_engine")
  assert.equal(decision.detSource, "drywall_engine_v1")
  assert.equal(decision.estimateBasis, basis)
  assert.equal(decision.estimateBasis?.sectionPricing?.[0]?.section, "drywall basis section")
})

test("wallcovering owner selection carries deterministic estimateBasis when safe numeric pricing is present", () => {
  const basis = makeBasis("wallcovering basis")
  const decision = decidePricingOwner(
    makeCtx({
      trade: "wallcovering",
      wallcoveringDet: {
        pricing: { labor: 1400, materials: 900, subs: 250, markup: 25, total: 3188 },
        okForVerified: true,
        verifiedSource: "wallcovering_engine_v1_verified",
        source: "wallcovering_engine_v1",
        estimateBasis: basis,
      },
    })
  )

  assert.equal(decision.owner, "wallcovering_engine")
  assert.equal(decision.detSource, "wallcovering_engine_v1_verified")
  assert.equal(decision.estimateBasis, basis)
  assert.equal(decision.estimateBasis?.sectionPricing?.[0]?.section, "wallcovering basis section")
})

test("weak support stays non-binding because owner resolution falls back when no deterministic pricing survives", () => {
  const decision = decidePricingOwner(
    makeCtx({
      trade: "wallcovering",
    })
  )

  assert.equal(decision.owner, "ai")
  assert.equal(decision.baselinePricing, null)
  assert.equal(decision.estimateBasis, null)
})

test("multi-trade owner resolution remains authoritative over per-trade deterministic candidates", () => {
  const multiTradeBasis = makeBasis("multi-trade basis")
  const decision = decidePricingOwner(
    makeCtx({
      multiTradeDet: {
        okForDeterministic: true,
        okForVerified: true,
        pricing: { labor: 4000, materials: 1800, subs: 700, markup: 20, total: 7800 },
        estimateBasis: multiTradeBasis,
        perTrade: [
          {
            trade: "painting",
            scope: "Paint guest rooms.",
            pricing: { labor: 1000, materials: 400, subs: 200, markup: 20, total: 1920 },
            laborRate: 75,
            crewDays: 2,
            source: "painting_engine_v1_verified",
            notes: [],
          },
          {
            trade: "wallcovering",
            scope: "Install wallcovering.",
            pricing: { labor: 1200, materials: 800, subs: 250, markup: 25, total: 2813 },
            laborRate: 95,
            crewDays: 2,
            source: "wallcovering_engine_v1_verified",
            notes: [],
          },
        ],
        notes: [],
      },
      paintingDet: {
        pricing: { labor: 1000, materials: 400, subs: 200, markup: 20, total: 1920 },
        okForVerified: true,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: makeBasis("painting basis"),
      },
      wallcoveringDet: {
        pricing: { labor: 1200, materials: 800, subs: 250, markup: 25, total: 2813 },
        okForVerified: true,
        verifiedSource: "wallcovering_engine_v1_verified",
        source: "wallcovering_engine_v1",
        estimateBasis: makeBasis("wallcovering basis"),
      },
    })
  )

  assert.equal(decision.owner, "multi_trade_combiner")
  assert.equal(decision.detSource, "multi_trade_combiner_v1")
  assert.equal(decision.estimateBasis, multiTradeBasis)
  assert.equal(decision.estimateBasis?.sectionPricing?.[0]?.section, "multi-trade basis section")
})

test("scaled prototype painting basis stays non-measured while owner resolution remains unchanged", () => {
  const basis = makeBasis("scaled prototype painting")
  basis.sectionPricing = [
    {
      section: "Walls",
      labor: 700,
      materials: 240,
      subs: 120,
      total: 1272,
      pricingBasis: "direct",
      provenance: {
        quantitySupport: "scaled_prototype",
        sourceBasis: ["repeated_space_rollup"],
        roomGroupBasis: "guest room",
        summary: "Repeated guest-room prototype support drove wall section scaling.",
      },
    },
    {
      section: "Corridor repaint",
      labor: 80,
      materials: 15,
      subs: 10,
      total: 126,
      pricingBasis: "burden",
      provenance: {
        quantitySupport: "support_only",
        sourceBasis: ["trade_finding"],
        blockedReason: "Corridor scope stayed embedded and non-standalone.",
      },
    },
  ]

  const decision = decidePricingOwner(
    makeCtx({
      trade: "painting",
      paintingDet: {
        pricing: { labor: 780, materials: 255, subs: 130, markup: 20, total: 1398 },
        okForVerified: false,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: basis,
      },
    })
  )

  assert.equal(decision.owner, "painting_engine")
  assert.equal(decision.detSource, "painting_engine_v1")
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((item) => item.section === "Walls")?.provenance
      ?.quantitySupport,
    "scaled_prototype"
  )
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((item) => item.section === "Corridor repaint")
      ?.pricingBasis,
    "burden"
  )
})

test("structured section basis alone does not become pricing authority when deterministic pricing is absent", () => {
  const basis = makeBasis("non-authoritative basis")
  const decision = decidePricingOwner(
    makeCtx({
      trade: "drywall",
      drywallDet: {
        pricing: null,
        okForVerified: false,
        verifiedSource: "drywall_engine_v1_verified",
        source: "drywall_engine_v1",
        estimateBasis: basis,
      },
    })
  )

  assert.equal(decision.owner, "ai")
  assert.equal(decision.baselinePricing, null)
  assert.equal(decision.estimateBasis, null)
})

test("multi-trade owner stays authoritative over richer per-trade provenance bases", () => {
  const multiTradeBasis = makeBasis("multi-trade plan-aware basis")
  multiTradeBasis.sectionPricing = [
    {
      section: "painting: Walls",
      labor: 900,
      materials: 300,
      subs: 120,
      total: 1584,
      pricingBasis: "direct",
      provenance: {
        quantitySupport: "measured",
        sourceBasis: ["trade_finding"],
        supportCategory: "wall_area",
      },
    },
    {
      section: "drywall: Install / hang",
      labor: 1100,
      materials: 420,
      subs: 180,
      total: 2040,
      pricingBasis: "direct",
      provenance: {
        quantitySupport: "measured",
        sourceBasis: ["trade_finding"],
        supportCategory: "assembly_area",
      },
    },
    {
      section: "shared: Coordination",
      labor: 250,
      materials: 0,
      subs: 100,
      total: 420,
      pricingBasis: "burden",
      provenance: {
        quantitySupport: "support_only",
        sourceBasis: ["trade_finding"],
        blockedReason: "Shared coordination stayed embedded.",
      },
    },
  ]

  const decision = decidePricingOwner(
    makeCtx({
      multiTradeDet: {
        okForDeterministic: true,
        okForVerified: true,
        pricing: { labor: 2600, materials: 720, subs: 400, markup: 20, total: 4464 },
        estimateBasis: multiTradeBasis,
        perTrade: [],
        notes: [],
      },
      paintingDet: {
        pricing: { labor: 1000, materials: 300, subs: 120, markup: 20, total: 1704 },
        okForVerified: true,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: makeBasis("painting-only basis"),
      },
      drywallDet: {
        pricing: { labor: 1100, materials: 420, subs: 180, markup: 20, total: 2040 },
        okForVerified: true,
        verifiedSource: "drywall_engine_v1_verified",
        source: "drywall_engine_v1",
        estimateBasis: makeBasis("drywall-only basis"),
      },
    })
  )

  assert.equal(decision.owner, "multi_trade_combiner")
  assert.equal(decision.estimateBasis, multiTradeBasis)
  assert.equal(
    decision.estimateBasis?.sectionPricing?.find((item) => item.section === "shared: Coordination")
      ?.provenance?.quantitySupport,
    "support_only"
  )
})
