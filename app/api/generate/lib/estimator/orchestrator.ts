import { decidePricingOwner } from "./pricingOwner"
import { buildEstimateDefenseMode } from "./estimateDefenseMode"
import { buildTradeExecutionPricingPrep } from "./tradeExecutionPricingPrep"
import { buildTradeEstimateGenerationInputs } from "./tradeEstimateGenerationInputs"
import {
  applyTradePricingExecutionBridgeToBasis,
  buildTradePricingExecutionBridge,
} from "./tradePricingExecutionBridge"
import {
  applyTradePricingInterpretationBridgeToBasis,
  buildTradePricingInterpretationBridge,
} from "./tradePricingInterpretationBridge"
import {
  applyConsolidatedTradePricingSectionExecutionBridgeToBasis,
  applyTradePricingSectionExecutionBridgeToBasis,
  buildTradePricingSectionExecutionBridge,
} from "./tradePricingSectionExecutionBridge"
import { buildEstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "./estimateStructureConsumption"
import { detectMissedScope } from "./missedScopeDetector"
import { detectProfitLeaks } from "./profitLeakDetector"
import { buildTradeAssembledPricingInputs } from "./tradeAssembledPricingInputs"
import { buildTradePricingBasisBridge } from "./tradePricingBasisBridge"
import { buildTradePricingInputDraft } from "./tradePricingInputDraft"
import { buildTradePreparedPricingInputs } from "./tradePreparedPricingInputs"
import { buildTradePricingPrepAnalysis } from "./tradePricingPrepAnalysis"
import { buildTradePackagePricingPrep } from "./tradePackagePricingPrep"
import { buildTradeQuantitySupport } from "./tradeQuantitySupport"
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
  EstimateEmbeddedBurden,
  EstimateRow,
  EstimateStructuredSection,
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

function parseStructuredSectionLabel(args: {
  label: string
  fallbackTrade: string
}): { trade: string; section: string } {
  const raw = String(args.label || "").trim()
  const match = raw.match(/^([a-z][a-z\s/_-]*):\s+(.+)$/i)
  const knownTrades = new Set([
    "painting",
    "drywall",
    "wallcovering",
    "flooring",
    "electrical",
    "plumbing",
    "carpentry",
    "texture",
    "general renovation",
  ])

  if (match?.[1] && match?.[2]) {
    const trade = match[1].trim().toLowerCase()
    if (knownTrades.has(trade)) {
      return {
        trade,
        section: match[2].trim(),
      }
    }
  }

  return {
    trade: args.fallbackTrade,
    section: raw,
  }
}

function buildEstimateSections(args: {
  trade: string
  basis: EstimateBasis | null
}): EstimateStructuredSection[] | null {
  const sections = args.basis?.sectionPricing
  if (!Array.isArray(sections) || !sections.length) return null

  return sections.map((section) => {
    const parsed = parseStructuredSectionLabel({
      label: section.section,
      fallbackTrade: args.trade,
    })

    return {
      trade: parsed.trade,
      section: parsed.section,
      label: section.section,
      pricingBasis: section.pricingBasis,
      estimatorTreatment:
        section.pricingBasis === "direct"
          ? "section_row"
          : "embedded_burden",
      amount: Number(section.total || 0),
      labor: Number(section.labor || 0),
      materials: Number(section.materials || 0),
      subs: Number(section.subs || 0),
      unit: section.unit,
      quantity: section.quantity,
      notes: [...(section.notes || [])],
    }
  })
}

function buildEstimateRows(
  sections: EstimateStructuredSection[] | null
): EstimateRow[] | null {
  if (!sections?.length) return null

  const rows = sections
    .filter(
      (section) =>
        section.pricingBasis === "direct" &&
        section.estimatorTreatment === "section_row"
    )
    .map((section) => ({
      trade: section.trade,
      section: section.section,
      label: section.label,
      amount: Number(section.amount || 0),
      labor: Number(section.labor || 0),
      materials: Number(section.materials || 0),
      subs: Number(section.subs || 0),
      unit: section.unit,
      quantity: section.quantity,
      notes: [...section.notes],
      pricingBasis: "direct" as const,
      estimatorTreatment: "section_row" as const,
      rowSource: "estimate_sections" as const,
    }))

  return rows.length ? rows : null
}

function buildEstimateEmbeddedBurdens(
  sections: EstimateStructuredSection[] | null
): EstimateEmbeddedBurden[] | null {
  if (!sections?.length) return null

  const burdens = sections
    .filter(
      (section) =>
        section.pricingBasis === "burden" &&
        section.estimatorTreatment === "embedded_burden"
    )
    .map((section) => ({
      trade: section.trade,
      section: section.section,
      label: section.label,
      amount: Number(section.amount || 0),
      labor: Number(section.labor || 0),
      materials: Number(section.materials || 0),
      subs: Number(section.subs || 0),
      unit: section.unit,
      quantity: section.quantity,
      notes: [...section.notes],
      pricingBasis: "burden" as const,
      estimatorTreatment: "embedded_burden" as const,
      rowSource: "estimate_sections" as const,
    }))

  return burdens.length ? burdens : null
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
  const tradeQuantitySupport = buildTradeQuantitySupport({
    trade: ctx.trade,
    scopeText: ctx.scopeChange,
    planIntelligence: ctx.planIntelligence,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradePackagePricingPrep,
  })
  const tradePricingBasisBridge = buildTradePricingBasisBridge({
    trade: ctx.trade,
    scopeText: ctx.scopeChange,
    planIntelligence: ctx.planIntelligence,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })
  const tradePricingInputDraft = buildTradePricingInputDraft({
    tradePricingBasisBridge,
    tradeQuantitySupport,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    planIntelligence: ctx.planIntelligence,
    scopeText: ctx.scopeChange,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })
  const tradePreparedPricingInputs = buildTradePreparedPricingInputs({
    tradePricingInputDraft,
    tradePricingBasisBridge,
    tradePackagePricingPrep,
    estimateSkeletonHandoff,
    estimateStructureConsumption,
    planIntelligence: ctx.planIntelligence,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })
  const tradeAssembledPricingInputs = buildTradeAssembledPricingInputs({
    tradePreparedPricingInputs,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })
  const tradeEstimateGenerationInputs = buildTradeEstimateGenerationInputs({
    tradeAssembledPricingInputs,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })
  const tradeExecutionPricingPrep = buildTradeExecutionPricingPrep({
    tradeEstimateGenerationInputs,
    tradeStack: ctx.tradeStack,
    complexityProfile: ctx.complexityProfile,
  })

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
  const tradePricingExecutionBridge = buildTradePricingExecutionBridge({
    tradeExecutionPricingPrep,
    effectivePaintScope: ctx.effectivePaintScope,
    effectiveSqft,
    rooms: ctx.rooms,
    doors: ctx.doors,
  })
  const influencedEstimateBasis = applyTradePricingExecutionBridgeToBasis({
    basis: estimateBasis,
    tradePricingExecutionBridge,
  })
  const tradePricingInterpretationBridge = buildTradePricingInterpretationBridge({
    basis: influencedEstimateBasis,
    tradePricingExecutionBridge,
  })
  const interpretedEstimateBasis = applyTradePricingInterpretationBridgeToBasis({
    basis: influencedEstimateBasis,
    tradePricingInterpretationBridge,
  })
  const tradePricingSectionExecutionBridge = buildTradePricingSectionExecutionBridge({
    basis: interpretedEstimateBasis,
    tradePricingInterpretationBridge,
  })
  const sectionExecutionPreviewBasis = applyTradePricingSectionExecutionBridgeToBasis({
    basis: interpretedEstimateBasis,
    tradePricingSectionExecutionBridge,
  })
  const sectionExecutedEstimateBasis = applyConsolidatedTradePricingSectionExecutionBridgeToBasis({
    basis: sectionExecutionPreviewBasis,
    tradePricingExecutionBridge,
    tradePricingInterpretationBridge,
    tradePricingSectionExecutionBridge,
  })

  const protectedResult = applyFinalPricingProtections({
    pricing: resolvedPricing.pricing,
    trade: ctx.trade,
    pricingSource: resolvedPricing.pricingSource,
    priceGuardVerified: resolvedPricing.priceGuardVerified,
    detSource: resolvedPricing.detSource,
    complexity: ctx.complexityProfile,
    photoImpact: ctx.photoImpact,
    basis: sectionExecutedEstimateBasis,
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
  const estimateSections = buildEstimateSections({
    trade: ctx.trade,
    basis: finalBasis,
  })
  const estimateRows = buildEstimateRows(estimateSections)
  const estimateEmbeddedBurdens =
    buildEstimateEmbeddedBurdens(estimateSections)

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

  const tradePricingPrepAnalysis =
    buildTradePricingPrepAnalysis(tradePackagePricingPrep)

  if (tradePackagePricingPrep && tradePricingPrepAnalysis) {
    const isWeakSupport = tradePackagePricingPrep.supportLevel === "weak"

    scopeXRay.riskFlags = Array.from(
      new Set([
        ...(scopeXRay.riskFlags || []),
        ...tradePackagePricingPrep.tradePackageRiskFlags.slice(0, isWeakSupport ? 1 : 2),
      ])
    ).slice(0, 8)

    scopeXRay.needsConfirmation = Array.from(
      new Set([
        ...(scopeXRay.needsConfirmation || []),
        ...tradePricingPrepAnalysis.tradeReviewActions.slice(0, isWeakSupport ? 2 : 3),
      ])
    ).slice(0, 8)
  }

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
    tradeQuantitySupport,
    tradePricingPrepAnalysis,
    tradePricingBasisBridge,
    tradePricingInputDraft,
    tradePreparedPricingInputs,
    tradeAssembledPricingInputs,
    tradeEstimateGenerationInputs,
    tradeExecutionPricingPrep,
    tradePricingExecutionBridge,
    tradePricingInterpretationBridge,
    tradePricingSectionExecutionBridge,
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
    estimateRows,
    estimateEmbeddedBurdens,
    estimateSections,
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
