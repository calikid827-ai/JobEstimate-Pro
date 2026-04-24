import assert from "node:assert/strict"
import test from "node:test"

import {
  applyFinalPricingProtections,
  finalizeEstimateBasis,
  resolvePricingFromOwner,
  type BasisFinalizeHelpers,
  type PricingFinalizeHelpers,
} from "./finalize"
import { decidePricingOwner } from "./pricingOwner"
import type {
  AIResponse,
  ComplexityProfile,
  EstimateBasis,
  Pricing,
  PricingOwnerContext,
} from "./types"

function makePricing(overrides: Partial<Pricing> = {}): Pricing {
  return {
    labor: overrides.labor ?? 0,
    materials: overrides.materials ?? 0,
    subs: overrides.subs ?? 0,
    markup: overrides.markup ?? 20,
    total: overrides.total ?? 0,
  }
}

function makeAiDraft(pricing: Pricing, estimateBasis: EstimateBasis | null = null): AIResponse {
  return {
    documentType: "Estimate",
    trade: "painting",
    description: "Plan-aware estimate draft.",
    pricing,
    estimateBasis,
  }
}

function makeOwnerContext(overrides: Partial<PricingOwnerContext> = {}): PricingOwnerContext {
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

function makeBasis(overrides: Partial<EstimateBasis> = {}): EstimateBasis {
  return {
    units: ["days"],
    quantities: { days: 2 },
    laborRate: 75,
    hoursPerUnit: 8,
    crewDays: 2,
    mobilization: 250,
    assumptions: ["plan-aware basis"],
    sectionPricing: [
      {
        section: "Walls",
        labor: 700,
        materials: 240,
        subs: 120,
        total: 1272,
        pricingBasis: "direct",
        provenance: {
          quantitySupport: "measured",
          sourceBasis: ["trade_finding"],
          supportCategory: "wall_area",
          summary: "Measured wall support backed direct painting section.",
        },
      },
      {
        section: "Prep / protection",
        labor: 60,
        materials: 10,
        subs: 8,
        total: 94,
        pricingBasis: "burden",
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: ["trade_finding"],
          blockedReason: "Prep/protection stays embedded.",
        },
      },
    ],
    ...overrides,
  }
}

const complexity: ComplexityProfile = {
  class: "remodel",
  requireDaysBasis: true,
  permitLikely: true,
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

const basisHelpers: BasisFinalizeHelpers = {
  normalizeBasisSafe: (basis) => basis,
  syncEstimateBasisMath: ({ pricing, basis }) => {
    if (!basis?.sectionPricing?.length) return basis
    const sections = basis.sectionPricing
    const sectionTotal = sections.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const diff = pricing.total - sectionTotal
    if (!diff) return basis
    const lastIndex = sections.length - 1
    const adjusted = sections.map((section, index) =>
      index === lastIndex ? { ...section, total: Number(section.total || 0) + diff } : section
    )
    return { ...basis, sectionPricing: adjusted }
  },
  enforceEstimateBasis: ({ basis }) => basis ?? makeBasis(),
  buildEstimateBasisFallback: () => makeBasis(),
}

const pricingHelpers: PricingFinalizeHelpers = {
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
  alignEstimateBasisSectionPricing: ({ pricing, basis }) => {
    if (!basis?.sectionPricing?.length) return basis
    const current = basis.sectionPricing.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const diff = pricing.total - current
    if (!diff) return basis
    const lastIndex = basis.sectionPricing.length - 1
    return {
      ...basis,
      sectionPricing: basis.sectionPricing.map((section, index) =>
        index === lastIndex ? { ...section, total: Number(section.total || 0) + diff } : section
      ),
    }
  },
  applyPermitBuffer: ({ pricing, cp }) => {
    if (!cp?.permitLikely) return { pricing, applied: false, note: "" }
    return {
      pricing: {
        ...pricing,
        subs: pricing.subs + 50,
        total: pricing.total + 50,
      },
      applied: true,
      note: "permit buffer",
    }
  },
  applyMinimumCharge: (_trade, total) =>
    total < 1500
      ? {
          applied: true,
          total: 1500,
          minimum: 1500,
        }
      : {
          applied: false,
          total,
          minimum: null,
        },
}

test("strong measured painting support keeps owner authority while protections still apply", () => {
  const ownerDecision = decidePricingOwner(
    makeOwnerContext({
      trade: "painting",
      paintingDet: {
        pricing: makePricing({ labor: 700, materials: 240, subs: 120, markup: 20, total: 1272 }),
        okForVerified: true,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: makeBasis(),
      },
    })
  )

  const resolved = resolvePricingFromOwner({
    ownerDecision,
    aiDraft: makeAiDraft(makePricing({ labor: 500, materials: 150, subs: 50, total: 840 })),
    helpers: {
      clampPricing: pricingHelpers.clampPricing,
      coercePricing: pricingHelpers.coercePricing,
    },
  })

  const finalBasis = finalizeEstimateBasis({
    ownerDecision,
    aiDraft: makeAiDraft(makePricing({ total: 840 })),
    pricing: resolved.pricing,
    trade: "painting",
    effectiveSqft: 1200,
    rooms: null,
    doors: null,
    complexity,
    helpers: basisHelpers,
  })

  const protectedResult = applyFinalPricingProtections({
    pricing: resolved.pricing,
    trade: "painting",
    pricingSource: resolved.pricingSource,
    priceGuardVerified: resolved.priceGuardVerified,
    detSource: resolved.detSource,
    complexity,
    photoImpact: {
      laborDelta: 0,
      materialsDelta: 0,
      subsDelta: 0,
      extraCrewDays: 0,
      confidenceBoost: 0,
      reasons: [],
    },
    tradeStack: null,
    scopeText: "Paint walls.",
    basis: finalBasis,
    helpers: pricingHelpers,
  })

  assert.equal(ownerDecision.owner, "painting_engine")
  assert.equal(resolved.pricingSource, "deterministic")
  assert.equal(protectedResult.pricing.total, 1500)
  assert.equal(
    protectedResult.basis?.sectionPricing?.find((item) => item.section === "Walls")?.provenance
      ?.quantitySupport,
    "measured"
  )
})

test("scaled prototype painting support stays non-measured through protections", () => {
  const scaledBasis = makeBasis({
    sectionPricing: [
      {
        section: "Walls",
        labor: 620,
        materials: 210,
        subs: 110,
        total: 1128,
        pricingBasis: "direct",
        provenance: {
          quantitySupport: "scaled_prototype",
          sourceBasis: ["repeated_space_rollup"],
          roomGroupBasis: "guest room",
        },
      },
    ],
  })

  const ownerDecision = decidePricingOwner(
    makeOwnerContext({
      trade: "painting",
      paintingDet: {
        pricing: makePricing({ labor: 620, materials: 210, subs: 110, markup: 20, total: 1128 }),
        okForVerified: false,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: scaledBasis,
      },
    })
  )

  const resolved = resolvePricingFromOwner({
    ownerDecision,
    aiDraft: makeAiDraft(makePricing({ total: 900 })),
    helpers: {
      clampPricing: pricingHelpers.clampPricing,
      coercePricing: pricingHelpers.coercePricing,
    },
  })

  const protectedResult = applyFinalPricingProtections({
    pricing: resolved.pricing,
    trade: "painting",
    pricingSource: resolved.pricingSource,
    priceGuardVerified: resolved.priceGuardVerified,
    detSource: resolved.detSource,
    complexity,
    photoImpact: {
      laborDelta: 0,
      materialsDelta: 0,
      subsDelta: 0,
      extraCrewDays: 0,
      confidenceBoost: 0,
      reasons: [],
    },
    tradeStack: null,
    scopeText: "Paint repeated guest rooms.",
    basis: scaledBasis,
    helpers: pricingHelpers,
  })

  assert.equal(ownerDecision.owner, "painting_engine")
  assert.equal(
    protectedResult.basis?.sectionPricing?.[0]?.provenance?.quantitySupport,
    "scaled_prototype"
  )
  assert.equal(protectedResult.pricing.total, 1500)
})

test("ambiguous blocked basis stays non-authoritative even if section structure exists", () => {
  const ownerDecision = decidePricingOwner(
    makeOwnerContext({
      trade: "wallcovering",
      wallcoveringDet: {
        pricing: null,
        okForVerified: false,
        verifiedSource: "wallcovering_engine_v1_verified",
        source: "wallcovering_engine_v1",
        estimateBasis: makeBasis({
          sectionPricing: [
            {
              section: "Install",
              labor: 400,
              materials: 220,
              subs: 80,
              total: 840,
              pricingBasis: "direct",
              provenance: {
                quantitySupport: "support_only",
                sourceBasis: ["trade_finding"],
                blockedReason: "Selected-elevation support was unresolved.",
              },
            },
          ],
        }),
      },
    })
  )

  const resolved = resolvePricingFromOwner({
    ownerDecision,
    aiDraft: makeAiDraft(makePricing({ labor: 900, materials: 300, subs: 100, markup: 20, total: 1560 })),
    helpers: {
      clampPricing: pricingHelpers.clampPricing,
      coercePricing: pricingHelpers.coercePricing,
    },
  })

  assert.equal(ownerDecision.owner, "ai")
  assert.equal(ownerDecision.estimateBasis, null)
  assert.equal(resolved.pricingSource, "ai")
})

test("drywall and wallcovering plan-aware bases keep owner logic unchanged while rows remain downstream", () => {
  const multiTradeBasis = makeBasis({
    sectionPricing: [
      {
        section: "drywall: Install / hang",
        labor: 1000,
        materials: 350,
        subs: 140,
        total: 1788,
        pricingBasis: "direct",
        provenance: {
          quantitySupport: "measured",
          sourceBasis: ["trade_finding"],
          supportCategory: "assembly_area",
        },
      },
      {
        section: "wallcovering: Install",
        labor: 900,
        materials: 500,
        subs: 180,
        total: 1896,
        pricingBasis: "direct",
        provenance: {
          quantitySupport: "measured",
          sourceBasis: ["trade_finding"],
          supportCategory: "selected_elevation_area",
        },
      },
      {
        section: "shared: Coordination",
        labor: 150,
        materials: 0,
        subs: 80,
        total: 276,
        pricingBasis: "burden",
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: ["trade_finding"],
        },
      },
    ],
  })

  const ownerDecision = decidePricingOwner(
    makeOwnerContext({
      multiTradeDet: {
        okForDeterministic: true,
        okForVerified: true,
        pricing: makePricing({ labor: 2050, materials: 850, subs: 400, markup: 20, total: 3960 }),
        estimateBasis: multiTradeBasis,
        perTrade: [],
        notes: [],
      },
      drywallDet: {
        pricing: makePricing({ labor: 1000, materials: 350, subs: 140, markup: 20, total: 1788 }),
        okForVerified: true,
        verifiedSource: "drywall_engine_v1_verified",
        source: "drywall_engine_v1",
        estimateBasis: makeBasis(),
      },
      wallcoveringDet: {
        pricing: makePricing({ labor: 900, materials: 500, subs: 180, markup: 20, total: 1896 }),
        okForVerified: true,
        verifiedSource: "wallcovering_engine_v1_verified",
        source: "wallcovering_engine_v1",
        estimateBasis: makeBasis(),
      },
    })
  )

  assert.equal(ownerDecision.owner, "multi_trade_combiner")
  assert.equal(ownerDecision.estimateBasis, multiTradeBasis)
  assert.equal(
    ownerDecision.estimateBasis?.sectionPricing?.find((item) => item.section === "shared: Coordination")
      ?.pricingBasis,
    "burden"
  )
})
