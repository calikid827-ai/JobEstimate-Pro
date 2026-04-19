import type {
  Pricing,
  PricingOwnerContext,
  PricingOwnerDecision,
} from "./types"

function hasPricing(pricing: Pricing | null | undefined): pricing is Pricing {
  return !!pricing
}

function mergedCandidateFromContext(
  ctx: PricingOwnerContext
): { pricing: Pricing; detSource: string; anchorId: string | null } | null {
  if (ctx.anchorHit?.pricing) {
    return {
      pricing: ctx.anchorHit.pricing,
      detSource: `anchor:${ctx.anchorHit.id}`,
      anchorId: ctx.anchorHit.id,
    }
  }

  if (ctx.bigJobPricing) {
    return {
      pricing: ctx.bigJobPricing,
      detSource: "painting_big_job",
      anchorId: null,
    }
  }

  if (ctx.doorPricing) {
    return {
      pricing: ctx.doorPricing,
      detSource: "painting_doors_only",
      anchorId: null,
    }
  }

  if (ctx.mixedPaintPricing) {
    return {
      pricing: ctx.mixedPaintPricing,
      detSource: "painting_rooms_plus_doors",
      anchorId: null,
    }
  }

  if (ctx.photoPaintPricing) {
    return {
      pricing: ctx.photoPaintPricing,
      detSource: "painting_photo_sqft",
      anchorId: null,
    }
  }

  return null
}

export function decidePricingOwner(ctx: PricingOwnerContext): PricingOwnerDecision {
  if (
    ctx.multiTradeDet?.okForDeterministic &&
    hasPricing(ctx.multiTradeDet.pricing)
  ) {
    return {
      owner: "multi_trade_combiner",
      detSource: "multi_trade_combiner_v1",
      anchorId: null,
      verified: !!ctx.multiTradeDet.okForVerified,
      baselinePricing: ctx.multiTradeDet.pricing,
      estimateBasis: ctx.multiTradeDet.estimateBasis ?? null,
    }
  }

  if (
    ctx.anchorHit?.id === "kitchen_remodel_v1" &&
    hasPricing(ctx.anchorHit.pricing)
  ) {
    return {
      owner: "deterministic_anchor",
      detSource: `anchor:${ctx.anchorHit.id}`,
      anchorId: ctx.anchorHit.id,
      verified: true,
      baselinePricing: ctx.anchorHit.pricing,
      estimateBasis: null,
    }
  }

  if (
    ctx.anchorHit?.id === "bathroom_remodel_v1" &&
    hasPricing(ctx.anchorHit.pricing)
  ) {
    return {
      owner: "deterministic_anchor",
      detSource: `anchor:${ctx.anchorHit.id}`,
      anchorId: ctx.anchorHit.id,
      verified: true,
      baselinePricing: ctx.anchorHit.pricing,
      estimateBasis: null,
    }
  }

  if (hasPricing(ctx.mixedPaintPricing)) {
    return {
      owner: "painting_rooms_plus_doors",
      detSource: "painting_rooms_plus_doors",
      anchorId: null,
      verified: false,
      baselinePricing: ctx.mixedPaintPricing,
      estimateBasis: null,
    }
  }

  if (
    ctx.effectivePaintScope === "doors_only" &&
    hasPricing(ctx.doorPricing)
  ) {
    return {
      owner: "painting_doors_only",
      detSource: "painting_doors_only",
      anchorId: null,
      verified: false,
      baselinePricing: ctx.doorPricing,
      estimateBasis: null,
    }
  }

  if (ctx.useBigJobPricing && hasPricing(ctx.bigJobPricing)) {
    return {
      owner: "painting_big_job",
      detSource: "painting_big_job",
      anchorId: null,
      verified: false,
      baselinePricing: ctx.bigJobPricing,
      estimateBasis: null,
    }
  }

  if (ctx.paintingDet?.pricing) {
    return {
      owner: "painting_engine",
      detSource: ctx.paintingDet.okForVerified
        ? ctx.paintingDet.verifiedSource
        : ctx.paintingDet.source,
      anchorId: null,
      verified: !!ctx.paintingDet.okForVerified,
      baselinePricing: ctx.paintingDet.pricing,
      estimateBasis: ctx.paintingDet.estimateBasis ?? null,
    }
  }

  if (ctx.flooringDet?.pricing) {
    return {
      owner: "flooring_engine",
      detSource: ctx.flooringDet.okForVerified
        ? ctx.flooringDet.verifiedSource
        : ctx.flooringDet.source,
      anchorId: null,
      verified: !!ctx.flooringDet.okForVerified,
      baselinePricing: ctx.flooringDet.pricing,
      estimateBasis: ctx.flooringDet.estimateBasis ?? null,
    }
  }

  if (ctx.electricalDet?.pricing) {
    return {
      owner: "electrical_engine",
      detSource: ctx.electricalDet.okForVerified
        ? ctx.electricalDet.verifiedSource
        : ctx.electricalDet.source,
      anchorId: null,
      verified: !!ctx.electricalDet.okForVerified,
      baselinePricing: ctx.electricalDet.pricing,
      estimateBasis: ctx.electricalDet.estimateBasis ?? null,
    }
  }

  if (ctx.plumbingDet?.pricing) {
    return {
      owner: "plumbing_engine",
      detSource: ctx.plumbingDet.okForVerified
        ? ctx.plumbingDet.verifiedSource
        : ctx.plumbingDet.source,
      anchorId: null,
      verified: !!ctx.plumbingDet.okForVerified,
      baselinePricing: ctx.plumbingDet.pricing,
      estimateBasis: ctx.plumbingDet.estimateBasis ?? null,
    }
  }

  if (ctx.drywallDet?.pricing) {
    return {
      owner: "drywall_engine",
      detSource: ctx.drywallDet.okForVerified
        ? ctx.drywallDet.verifiedSource
        : ctx.drywallDet.source,
      anchorId: null,
      verified: !!ctx.drywallDet.okForVerified,
      baselinePricing: ctx.drywallDet.pricing,
      estimateBasis: ctx.drywallDet.estimateBasis ?? null,
    }
  }

  const merged = mergedCandidateFromContext(ctx)
  if (merged) {
    return {
      owner: "merged",
      detSource: merged.detSource,
      anchorId: merged.anchorId,
      verified: false,
      baselinePricing: merged.pricing,
      estimateBasis: null,
    }
  }

  return {
    owner: "ai",
    detSource: null,
    anchorId: ctx.anchorHit?.id ?? null,
    verified: false,
    baselinePricing: null,
    estimateBasis: null,
  }
}