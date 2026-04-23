import type {
  AIResponse,
  ComplexityProfile,
  EffectivePaintScope,
  EstimateBasis,
  PaintScope,
  PhotoPricingImpact,
  Pricing,
  PricingOwnerDecision,
  TradeStack,
} from "./types"

export type BasisFinalizeHelpers = {
  normalizeBasisSafe: (basis: EstimateBasis | null) => EstimateBasis | null
  syncEstimateBasisMath: (args: {
    pricing: Pricing
    basis: EstimateBasis | null
  }) => EstimateBasis | null
  enforceEstimateBasis: (args: {
    trade: string
    pricing: Pricing
    basis: EstimateBasis | null
    parsed: { rooms: number | null; doors: number | null; sqft: number | null }
    complexity: ComplexityProfile | null
  }) => EstimateBasis
  buildEstimateBasisFallback: (args: {
    trade: string
    pricing: Pricing
    parsed: { rooms: number | null; doors: number | null; sqft: number | null }
    complexity: ComplexityProfile | null
  }) => EstimateBasis
}

export type PricingFinalizeHelpers = {
  applyAiRealism: (args: {
    pricing: Pricing
    trade: string
  }) => Pricing

  compressCrossTradeMobilization: (args: {
    pricing: Pricing
    basis: EstimateBasis | null
    cp: ComplexityProfile | null
    tradeStack: TradeStack | null
    scopeText: string
    pricingSource: "ai" | "deterministic" | "merged"
    detSource: string | null
  }) => {
    pricing: Pricing
    basis: EstimateBasis | null
    applied: boolean
    note: string
  }

  enforcePhaseVisitCrewDaysFloor: (args: {
    pricing: Pricing
    basis: EstimateBasis | null
    cp: ComplexityProfile | null
    scopeText: string
  }) => {
    pricing: Pricing
    basis: EstimateBasis | null
    applied: boolean
    note: string
  }

  clampPricing: (pricing: Pricing) => Pricing
  coercePricing: (value: unknown) => Pricing
  alignEstimateBasisSectionPricing: (args: {
    pricing: Pricing
    basis: EstimateBasis | null
  }) => EstimateBasis | null

  applyPermitBuffer: (args: {
    pricing: Pricing
    trade: string
    cp: ComplexityProfile | null
    pricingSource: "ai" | "deterministic" | "merged"
    priceGuardVerified: boolean
    detSource: string | null
  }) => {
    pricing: Pricing
    applied: boolean
    note: string
  }

  applyMinimumCharge: (
    trade: string,
    total: number
  ) => {
    applied: boolean
    total: number
    minimum: number | null
  }
}

export type DescriptionFinalizeHelpers = {
  syncDescriptionLeadToDocumentType: (
    text: string,
    documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  ) => string
  appendExecutionPlanSentence: (args: {
    description: string
    documentType: string
    trade: string
    cp: ComplexityProfile | null
    basis: EstimateBasis | null
    scopeText: string
    tradeStack?: TradeStack | null
    workDaysPerWeek?: 5 | 6 | 7
  }) => string
  appendTradeCoordinationSentence: (description: string, stack: TradeStack | null) => string
  appendPermitCoordinationSentence: (
    description: string,
    cp: ComplexityProfile | null
  ) => string
  polishDescriptionWith4o: (args: {
    description: string
    documentType: string
    trade: string
  }) => Promise<string>
}

export function resolvePricingFromOwner(args: {
  ownerDecision: PricingOwnerDecision
  aiDraft: AIResponse
  helpers: Pick<PricingFinalizeHelpers, "clampPricing" | "coercePricing">
}): {
  pricing: Pricing
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
  priceGuardVerified: boolean
} {
  const { clampPricing, coercePricing } = args.helpers
  const aiPricing = clampPricing(coercePricing(args.aiDraft.pricing))
  const baseline = args.ownerDecision.baselinePricing
    ? clampPricing(coercePricing(args.ownerDecision.baselinePricing))
    : null

  if (args.ownerDecision.owner === "ai" || !baseline) {
    return {
      pricing: aiPricing,
      pricingSource: "ai",
      detSource: null,
      priceGuardVerified: false,
    }
  }

  if (args.ownerDecision.owner === "merged") {
    const mergedMarkup = Math.min(
      25,
      Math.max(15, Math.max(aiPricing.markup, baseline.markup))
    )

    const labor = Math.max(aiPricing.labor, baseline.labor)
    const materials = Math.max(aiPricing.materials, baseline.materials)
    const subs = Math.max(aiPricing.subs, baseline.subs)
    const base = labor + materials + subs
    const total = Math.round(base * (1 + mergedMarkup / 100))

    return {
      pricing: clampPricing({
        labor,
        materials,
        subs,
        markup: mergedMarkup,
        total,
      }),
      pricingSource: "merged",
      detSource: args.ownerDecision.detSource,
      priceGuardVerified: false,
    }
  }

  return {
    pricing: baseline,
    pricingSource: "deterministic",
    detSource: args.ownerDecision.detSource,
    priceGuardVerified: args.ownerDecision.verified,
  }
}

export function finalizeEstimateBasis(args: {
  ownerDecision: PricingOwnerDecision
  aiDraft: AIResponse
  pricing: Pricing
  trade: string
  effectiveSqft: number | null
  rooms: number | null
  doors: number | null
  complexity: ComplexityProfile | null
  helpers: BasisFinalizeHelpers
}): EstimateBasis | null {
  const { normalizeBasisSafe, syncEstimateBasisMath, enforceEstimateBasis, buildEstimateBasisFallback } =
    args.helpers

  const parsed = {
    rooms: args.rooms,
    doors: args.doors,
    sqft: args.effectiveSqft,
  }

  const ownerBasis = args.ownerDecision.estimateBasis ?? null
  const aiBasis = args.aiDraft.estimateBasis ?? null

  let basis: EstimateBasis | null =
    ownerBasis ??
    aiBasis ??
    buildEstimateBasisFallback({
      trade: args.trade,
      pricing: args.pricing,
      parsed,
      complexity: args.complexity,
    })

  basis = enforceEstimateBasis({
    trade: args.trade,
    pricing: args.pricing,
    basis,
    parsed,
    complexity: args.complexity,
  })

  basis = normalizeBasisSafe(basis)
  basis = syncEstimateBasisMath({
    pricing: args.pricing,
    basis,
  })

  return basis
}

export function applyFinalPricingProtections(args: {
  pricing: Pricing
  trade: string
  pricingSource: "ai" | "deterministic" | "merged"
  priceGuardVerified: boolean
  detSource: string | null
  complexity: ComplexityProfile | null
  photoImpact: PhotoPricingImpact
  tradeStack: TradeStack | null
  scopeText: string
  basis: EstimateBasis | null
  helpers: PricingFinalizeHelpers
}): {
  pricing: Pricing
  basis: EstimateBasis | null
  minimumApplied: boolean
  minimumAmount: number | null
} {
  const {
    clampPricing,
    applyAiRealism,
    compressCrossTradeMobilization,
    alignEstimateBasisSectionPricing,
    applyPermitBuffer,
    applyMinimumCharge,
  } = args.helpers

  let pricing = clampPricing(args.pricing)
  let basis = args.basis

  if (args.pricingSource === "ai") {
    pricing = clampPricing(
      applyAiRealism({
        pricing,
        trade: args.trade,
      })
    )
  }

  const compressed = compressCrossTradeMobilization({
    pricing,
    basis,
    cp: args.complexity,
    tradeStack: args.tradeStack,
    scopeText: args.scopeText,
    pricingSource: args.pricingSource,
    detSource: args.detSource,
  })

  pricing = clampPricing(compressed.pricing)
  basis = compressed.basis

  const permit = applyPermitBuffer({
    pricing,
    trade: args.trade,
    cp: args.complexity,
    pricingSource: args.pricingSource,
    priceGuardVerified: args.priceGuardVerified,
    detSource: args.detSource,
  })

  pricing = clampPricing(permit.pricing)

  const minResult = applyMinimumCharge(args.trade, pricing.total)
  if (minResult.applied) {
    const diff = minResult.total - pricing.total
    pricing = clampPricing({
      ...pricing,
      subs: Math.round(pricing.subs + diff),
      total: minResult.total,
    })
  }

  if (args.photoImpact.reasons.length > 0) {
    const labor = Math.round(pricing.labor + args.photoImpact.laborDelta)
    const materials = Math.round(pricing.materials + args.photoImpact.materialsDelta)
    const subs = Math.round(pricing.subs + args.photoImpact.subsDelta)
    const base = labor + materials + subs
    const total = Math.round(base * (1 + pricing.markup / 100))

    pricing = clampPricing({
      labor,
      materials,
      subs,
      markup: pricing.markup,
      total,
    })
  }

  basis = alignEstimateBasisSectionPricing({
    pricing,
    basis,
  })

  return {
    pricing,
    basis,
    minimumApplied: minResult.applied,
    minimumAmount: minResult.applied ? minResult.minimum : null,
  }
}

export async function finalizeDescription(args: {
  draft: AIResponse
  trade: string
  scopeText: string
  complexity: ComplexityProfile | null
  tradeStack: TradeStack | null
  basis: EstimateBasis | null
  workDaysPerWeek: 5 | 6 | 7
  helpers: DescriptionFinalizeHelpers
}): Promise<string> {
  const {
    syncDescriptionLeadToDocumentType,
    appendExecutionPlanSentence,
    appendTradeCoordinationSentence,
    appendPermitCoordinationSentence,
    polishDescriptionWith4o,
  } = args.helpers

  let description = syncDescriptionLeadToDocumentType(
    args.draft.description,
    args.draft.documentType
  )

  description = appendExecutionPlanSentence({
    description,
    documentType: args.draft.documentType,
    trade: args.trade,
    cp: args.complexity,
    basis: args.basis,
    scopeText: args.scopeText,
    tradeStack: args.tradeStack,
    workDaysPerWeek: args.workDaysPerWeek,
  })

  description = appendTradeCoordinationSentence(description, args.tradeStack)
  description = appendPermitCoordinationSentence(description, args.complexity)

  description = await polishDescriptionWith4o({
    description,
    documentType: args.draft.documentType,
    trade: args.trade,
  })

  if (args.tradeStack) {
  description = appendTradeCoordinationSentence(description, args.tradeStack)
}

  return syncDescriptionLeadToDocumentType(
    description,
    args.draft.documentType
  )
}

export function normalizeDocumentType(
  documentType: string | null | undefined
): "Change Order" | "Estimate" | "Change Order / Estimate" {
  if (documentType === "Change Order") return "Change Order"
  if (documentType === "Estimate") return "Estimate"
  return "Change Order / Estimate"
}

export function deriveEffectiveSqft(args: {
  trade: string
  quantityInputs: {
    effectiveFloorSqft: number | null
    effectiveWallSqft: number | null
    effectivePaintSqft: number | null
  }
}): number | null {
  if (args.trade === "flooring") return args.quantityInputs.effectiveFloorSqft
  if (args.trade === "drywall") return args.quantityInputs.effectiveWallSqft
  if (args.trade === "painting") return args.quantityInputs.effectivePaintSqft
  return null
}

export function deriveEffectivePaintScope(args: {
  trade: string
  paintScope: PaintScope | null
  doorsOnly: boolean
}): EffectivePaintScope | null {
  if (args.trade !== "painting") return null
  if (args.doorsOnly) return "doors_only"
  return args.paintScope ?? "walls"
}
