import { decidePricingOwner } from "./pricingOwner"
import { buildEstimateDefenseMode } from "./estimateDefenseMode"
import { buildEstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "./estimateStructureConsumption"
import { detectMissedScope } from "./missedScopeDetector"
import { detectProfitLeaks } from "./profitLeakDetector"
import { buildTradePackagePricingPrep } from "./tradePackagePricingPrep"
import {
  applyFinalPricingProtections,
  deriveEffectiveSqft,
  finalizeDescription,
  finalizeEstimateBasis,
  normalizeDocumentType,
  resolvePricingFromOwner,
  type BasisFinalizeHelpers,
  type DescriptionFinalizeHelpers,
  type PricingFinalizeHelpers,
} from "./finalize"
import type {
  AIResponse,
  EstimatorContext,
  EstimatorPayload,
  EstimateExplanation,
  EstimateBasis,
  PriceGuardReport,
  ScheduleBlock,
  ScopeXRay,
  ComplexityProfile,
  TradeStack,
  PhotoPricingImpact,
  ScopeSignals,
  SplitScopeItem,
  PhotoAnalysis,
} from "./types"

export type OrchestratorDeps = {
  basis: BasisFinalizeHelpers
  pricing: PricingFinalizeHelpers
  description: DescriptionFinalizeHelpers

  buildScheduleBlock: (args: {
  basis: EstimateBasis | null
  cp: ComplexityProfile | null
  trade: string
  tradeStack: TradeStack | null
  scopeText: string
  workDaysPerWeek: 5 | 6 | 7
  photoImpact?: PhotoPricingImpact | null
  scopeSignals?: ScopeSignals | null
}) => ScheduleBlock

  buildScopeXRay: (args: {
  trade: string
  splitScopes: SplitScopeItem[]
  effectivePaintScope: string | null
  rawState: string
  stateAbbrev: string
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
  anchorId: string | null
  priceGuardVerified: boolean
  usedNationalBaseline: boolean
  rooms: number | null
  doors: number | null
  quantityInputs: {
    userMeasuredSqft: number | null
    parsedSqft: number | null
    photoWallSqft: number | null
    photoCeilingSqft: number | null
    photoFloorSqft: number | null
    effectiveFloorSqft: number | null
    effectiveWallSqft: number | null
    effectivePaintSqft: number | null
  }
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  photoAnalysis: PhotoAnalysis | null
  scopeSignals?: ScopeSignals | null
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
  schedule: ScheduleBlock
}) => ScopeXRay

  buildPriceGuardReport: (args: {
    pricingSource: "ai" | "deterministic" | "merged"
    priceGuardVerified: boolean
    priceGuardAnchorStrict: boolean
    stateAbbrev: string
    rooms: number | null
    doors: number | null
    measurements: EstimatorContext["measurements"] | null
    effectivePaintScope: EstimatorContext["effectivePaintScope"]
    anchorId: string | null
    detSource: string | null
    usedNationalBaseline: boolean
  }) => PriceGuardReport

  buildEstimateExplanation: (args: {
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
  trade: string
  priceGuardVerified: boolean
  priceGuardProtected: boolean
  photoImpact: PhotoPricingImpact | null
  minApplied: boolean
  minAmount?: number | null
  scopeSignals?: ScopeSignals | null
  complexityProfile: ComplexityProfile | null
  priceGuard: PriceGuardReport
}) => EstimateExplanation
}

function coerceDraft(draft: AIResponse): AIResponse {
  return {
    documentType: normalizeDocumentType(draft.documentType),
    trade: draft.trade || "",
    description: draft.description || "",
    pricing: draft.pricing,
    estimateBasis: draft.estimateBasis ?? null,
  }
}

export async function runEstimatorOrchestrator(args: {
  ctx: EstimatorContext
  aiDraft: AIResponse
  deps: OrchestratorDeps
  includeDebugEstimateBasis?: boolean
  engineDebug?: {
    flooring?: Record<string, unknown> | null
    electrical?: Record<string, unknown> | null
    plumbing?: Record<string, unknown> | null
    drywall?: Record<string, unknown> | null
  }
}): Promise<EstimatorPayload> {
  const { ctx, deps } = args
  const draft = coerceDraft(args.aiDraft)

  const ownerDecision = decidePricingOwner(ctx)

  const resolvedPricing = resolvePricingFromOwner({
    ownerDecision,
    aiDraft: draft,
    helpers: {
      clampPricing: deps.pricing.clampPricing,
      coercePricing: deps.pricing.coercePricing,
    },
  })

  const effectiveSqft = deriveEffectiveSqft({
    trade: ctx.trade,
    quantityInputs: ctx.quantityInputs,
  })

  const estimateBasis = finalizeEstimateBasis({
    ownerDecision,
    aiDraft: draft,
    pricing: resolvedPricing.pricing,
    trade: ctx.trade,
    effectiveSqft,
    rooms: ctx.rooms,
    doors: ctx.doors,
    complexity: ctx.complexityProfile,
    helpers: deps.basis,
  })

  const protectedResult = applyFinalPricingProtections({
    pricing: resolvedPricing.pricing,
    trade: ctx.trade,
    pricingSource: resolvedPricing.pricingSource,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    detSource: resolvedPricing.detSource,
    complexity: ctx.complexityProfile,
    photoImpact: ctx.photoImpact,
    basis: estimateBasis,
    tradeStack: ctx.tradeStack,
    scopeText: ctx.scopeChange,
    helpers: deps.pricing,
  })

  let finalBasis = protectedResult.basis
  let finalPricing = protectedResult.pricing

  const phaseFloor = deps.pricing.enforcePhaseVisitCrewDaysFloor({
    pricing: finalPricing,
    basis: finalBasis,
    cp: ctx.complexityProfile,
    scopeText: ctx.scopeChange,
  })

  finalPricing = phaseFloor.pricing
  finalBasis = phaseFloor.basis

  if (
    ctx.photoImpact.extraCrewDays > 0 &&
    finalBasis &&
    finalBasis.units.includes("days")
  ) {
    const currentCrewDays = Number(
      finalBasis.crewDays ?? finalBasis.quantities?.days ?? 0
    )

    if (Number.isFinite(currentCrewDays) && currentCrewDays > 0) {
      const bumpedCrewDays =
        Math.round((currentCrewDays + ctx.photoImpact.extraCrewDays) * 2) / 2

      finalBasis = {
        ...finalBasis,
        crewDays: bumpedCrewDays,
        quantities: {
          ...finalBasis.quantities,
          days: bumpedCrewDays,
        },
        assumptions: Array.isArray(finalBasis.assumptions)
          ? [
              ...finalBasis.assumptions,
              "Photo-visible conditions increased schedule allowance.",
            ]
          : ["Photo-visible conditions increased schedule allowance."],
      }
    }
  }

  finalBasis = deps.basis.normalizeBasisSafe(finalBasis)
  finalBasis = deps.basis.syncEstimateBasisMath({
    pricing: finalPricing,
    basis: finalBasis,
  })

  const description = await finalizeDescription({
  draft,
  trade: ctx.trade,
  scopeText: ctx.enrichedScopeText,
  complexity: ctx.complexityProfile,
  tradeStack: ctx.tradeStack,
  basis: finalBasis,
  workDaysPerWeek: ctx.workDaysPerWeek,
  helpers: deps.description,
})

  const schedule = deps.buildScheduleBlock({
    basis: finalBasis,
    cp: ctx.complexityProfile,
    trade: ctx.trade,
    tradeStack: ctx.tradeStack,
    scopeText: ctx.scopeChange,
    workDaysPerWeek: ctx.workDaysPerWeek,
    photoImpact: ctx.photoImpact,
    scopeSignals: ctx.scopeSignals,
  })

  const priceGuard = deps.buildPriceGuardReport({
    pricingSource: resolvedPricing.pricingSource,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    priceGuardAnchorStrict: false,
    stateAbbrev: ctx.stateAbbrev,
    rooms: ctx.rooms,
    doors: ctx.doors,
    measurements: ctx.measurements,
    effectivePaintScope: ctx.effectivePaintScope,
    anchorId: ownerDecision.anchorId,
    detSource: resolvedPricing.detSource,
    usedNationalBaseline: ctx.usedNationalBaseline,
  })

  if (ctx.photoImpact.reasons.length > 0) {
    priceGuard.appliedRules.push(
      ...ctx.photoImpact.reasons.map((r) => `Photo-confirmed: ${r}`)
    )
    priceGuard.confidence = Math.max(
      0,
      Math.min(99, Math.round(priceGuard.confidence + ctx.photoImpact.confidenceBoost))
    )
  }

if (ctx.planIntelligence?.ok) {
  priceGuard.appliedRules.push(
    `Plan intelligence reviewed ${ctx.planIntelligence.pagesCount} plan page(s).`
  )

  const boost =
    ctx.planIntelligence.confidenceScore >= 85
      ? 5
      : ctx.planIntelligence.confidenceScore >= 65
      ? 3
      : 1

  priceGuard.confidence = Math.max(
    0,
    Math.min(99, Math.round(priceGuard.confidence + boost))
  )
}

  if (protectedResult.minimumApplied && protectedResult.minimumAmount) {
    priceGuard.appliedRules.push(
      `Minimum service charge applied for ${ctx.trade}: $${protectedResult.minimumAmount}`
    )
  }

  const explanation = deps.buildEstimateExplanation({
    pricingSource: resolvedPricing.pricingSource,
    detSource: resolvedPricing.detSource,
    trade: ctx.trade,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    priceGuardProtected:
      resolvedPricing.pricingSource === "deterministic" ||
      resolvedPricing.pricingSource === "merged",
    photoImpact: ctx.photoImpact,
    minApplied: protectedResult.minimumApplied,
    minAmount: protectedResult.minimumAmount,
    scopeSignals: ctx.scopeSignals,
    complexityProfile: ctx.complexityProfile,
    priceGuard,
  })

  const scopeXRay = deps.buildScopeXRay({
    trade: ctx.trade,
    splitScopes: ctx.splitScopes,
    effectivePaintScope: ctx.effectivePaintScope,
    rawState: ctx.rawState,
    stateAbbrev: ctx.stateAbbrev,
    pricingSource: resolvedPricing.pricingSource,
    detSource: resolvedPricing.detSource,
    anchorId: ownerDecision.anchorId,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    usedNationalBaseline: ctx.usedNationalBaseline,
    rooms: ctx.rooms,
    doors: ctx.doors,
    quantityInputs: ctx.quantityInputs,
    photoScopeAssist: ctx.photoScopeAssist,
    photoAnalysis: ctx.photoAnalysis,
    scopeSignals: ctx.scopeSignals,
    complexityProfile: ctx.complexityProfile,
    tradeStack: ctx.tradeStack,
    schedule,
  })

  const missedScopeDetector = detectMissedScope({
    trade: ctx.trade,
    scopeText: ctx.scopeChange,
    planIntelligence: ctx.planIntelligence,
    photoScopeAssist: ctx.photoScopeAssist,
    complexityProfile: ctx.complexityProfile,
    tradeStack: ctx.tradeStack,
  })

  const profitLeakDetector = detectProfitLeaks({
    pricing: finalPricing,
    estimateBasis: finalBasis,
    pricingSource: resolvedPricing.pricingSource,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    priceGuard,
    trade: ctx.trade,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
    planIntelligence: ctx.planIntelligence,
    photoScopeAssist: ctx.photoScopeAssist,
    schedule,
    scopeText: ctx.scopeChange,
  })

  const estimateDefenseMode = buildEstimateDefenseMode({
    scopeText: ctx.scopeChange,
    trade: ctx.trade,
    tradeStack: ctx.tradeStack,
    pricing: finalPricing,
    pricingSource: resolvedPricing.pricingSource,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    estimateBasis: finalBasis,
    missedScopeDetector,
    profitLeakDetector,
    planIntelligence: ctx.planIntelligence,
    photoScopeAssist: ctx.photoScopeAssist,
    schedule,
    priceGuard,
    complexityProfile: ctx.complexityProfile,
  })

  const estimateSkeletonHandoff = buildEstimateSkeletonHandoff(ctx.planIntelligence)
  const estimateStructureConsumption = buildEstimateStructureConsumption(
    estimateSkeletonHandoff
  )
  const tradePackagePricingPrep = buildTradePackagePricingPrep({
    trade: ctx.trade,
    planIntelligence: ctx.planIntelligence,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    scopeText: ctx.scopeChange,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })

  if (missedScopeDetector) {
    scopeXRay.riskFlags = Array.from(
      new Set([
        ...(scopeXRay.riskFlags || []),
        ...missedScopeDetector.likelyMissingScope.map(
          (item) => `Possible omitted scope: ${item.label}.`
        ),
      ])
    ).slice(0, 8)

    scopeXRay.needsConfirmation = Array.from(
      new Set([
        ...(scopeXRay.needsConfirmation || []),
        ...missedScopeDetector.recommendedConfirmations.map(
          (item) => `Confirm scope item: ${item.label}.`
        ),
      ])
    ).slice(0, 8)
  }

  if (profitLeakDetector) {
    scopeXRay.riskFlags = Array.from(
      new Set([
        ...(scopeXRay.riskFlags || []),
        ...profitLeakDetector.likelyProfitLeaks.map(
          (item) => `Profit leak risk: ${item.label}.`
        ),
      ])
    ).slice(0, 8)

    scopeXRay.needsConfirmation = Array.from(
      new Set([
        ...(scopeXRay.needsConfirmation || []),
        ...profitLeakDetector.pricingReviewPrompts.map(
          (item) => `Pricing review: ${item.label}.`
        ),
      ])
    ).slice(0, 8)
  }

  const payload: EstimatorPayload = {
    documentType: draft.documentType,
    trade: ctx.trade,
    text: description,
    pricing: finalPricing,
    schedule,
    scopeXRay,
    explanation,
    scopeSignals: ctx.scopeSignals,
    photoAnalysis: ctx.photoAnalysis,
    photoImpact: ctx.photoImpact,
    photoScopeAssist: ctx.photoScopeAssist,
    photoPacketScore: ctx.photoPacketScore,
    photoEstimateDecision: ctx.photoEstimateDecision,
    planIntelligence: ctx.planIntelligence,
    missedScopeDetector,
    profitLeakDetector,
    estimateDefenseMode,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradePackagePricingPrep,
    materialsList: ctx.materialsList,
    areaScopeBreakdown: ctx.areaScopeBreakdown,
    splitScopes: ctx.splitScopes,
    multiTrade: ctx.multiTradeDet
      ? {
          okForDeterministic: ctx.multiTradeDet.okForDeterministic,
          okForVerified: ctx.multiTradeDet.okForVerified,
          perTrade: ctx.multiTradeDet.perTrade,
          notes: ctx.multiTradeDet.notes,
        }
      : null,
    pricingSource: resolvedPricing.pricingSource,
    detSource: resolvedPricing.detSource,
    priceGuardAnchor: ownerDecision.anchorId,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    priceGuardProtected:
      resolvedPricing.pricingSource === "deterministic" ||
      resolvedPricing.pricingSource === "merged",
    priceGuard,
    flooring: args.engineDebug?.flooring ?? null,
    electrical: args.engineDebug?.electrical ?? null,
    plumbing: args.engineDebug?.plumbing ?? null,
    drywall: args.engineDebug?.drywall ?? null,
    ...(args.includeDebugEstimateBasis ? { estimateBasis: finalBasis } : {}),
  }

  return payload
}
