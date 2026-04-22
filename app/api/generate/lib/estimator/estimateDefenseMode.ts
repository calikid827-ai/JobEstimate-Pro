import type { PlanIntelligence } from "../plans/types"
import type { MissedScopeDetector } from "./missedScopeDetector"
import type { ProfitLeakDetector } from "./profitLeakDetector"
import type {
  EstimateBasis,
  PriceGuardReport,
  Pricing,
  ScheduleBlock,
  TradeStack,
  ComplexityProfile,
} from "./types"

export type EstimateDefenseMode = {
  whyThisPriceHolds: string[]
  includedScopeHighlights: string[]
  exclusionNotes: string[]
  allowanceNotes: string[]
  homeownerFriendlyJustification: string[]
  estimatorDefenseNotes: string[]
  optionalValueEngineeringIdeas: string[]
}

type DetectorArgs = {
  scopeText: string
  trade: string
  tradeStack: TradeStack | null
  pricing: Pricing
  pricingSource: "ai" | "deterministic" | "merged"
  priceGuardVerified: boolean
  estimateBasis: EstimateBasis | null
  missedScopeDetector: MissedScopeDetector | null
  profitLeakDetector: ProfitLeakDetector | null
  planIntelligence: PlanIntelligence | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  schedule: ScheduleBlock
  priceGuard: PriceGuardReport
  complexityProfile: ComplexityProfile | null
}

function uniqStrings(values: string[], max = 5): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function collect(values: Array<string | null | undefined>, max = 5): string[] {
  return uniqStrings(values.filter(Boolean) as string[], max)
}

function getWordCount(value: string): number {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function isBathroomRemodel(args: DetectorArgs): boolean {
  const scope = (args.scopeText || "").toLowerCase()
  const planBlob = [
    args.planIntelligence?.summary || "",
    ...(args.planIntelligence?.detectedRooms || []),
    ...(args.planIntelligence?.notes || []),
  ]
    .join(" ")
    .toLowerCase()

  return (
    /\bbath(room)?\b/.test(`${scope} ${planBlob}`) &&
    /\b(remodel|renovat|replace|shower|tile|vanity|toilet|conversion)\b/.test(
      `${scope} ${planBlob}`
    )
  )
}

function isWetAreaWork(args: DetectorArgs): boolean {
  const scope = (args.scopeText || "").toLowerCase()
  const planBlob = [
    args.planIntelligence?.summary || "",
    ...(args.planIntelligence?.notes || []),
    ...(args.planIntelligence?.scopeAssist?.suggestedAdditions || []),
  ]
    .join(" ")
    .toLowerCase()

  return /\b(shower|tub|tile|wet area|pan|drain|waterproof)\b/.test(
    `${scope} ${planBlob}`
  )
}

function hasLowQuantitySupport(args: DetectorArgs): boolean {
  const basis = args.estimateBasis
  const takeoff = args.planIntelligence?.takeoff

  const hasBasisQty =
    !!basis &&
    Object.values(basis.quantities || {}).some((value) => Number(value || 0) > 0)

  const hasPlanQty =
    Number(takeoff?.doorCount || 0) > 0 ||
    Number(takeoff?.fixtureCount || 0) > 0 ||
    Number(takeoff?.deviceCount || 0) > 0 ||
    Number(takeoff?.roomCount || 0) > 0

  return !hasBasisQty && !hasPlanQty
}

function getAllowanceSignals(args: DetectorArgs): string[] {
  const allowances: string[] = []
  const suggested = args.photoScopeAssist.suggestedAdditions || []
  const missed = args.missedScopeDetector

  if (
    suggested.some((item) => /\ballowance|confirm|clarify|selection\b/i.test(item)) ||
    missed?.recommendedConfirmations.some((item) => item.confidence <= 72)
  ) {
    allowances.push("Finish selections or exact inclusions still need confirmation.")
  }

  if (hasLowQuantitySupport(args) && Number(args.priceGuard.confidence || 0) <= 65) {
    allowances.push("Quantities are still being carried with limited hard takeoff support.")
  }

  return uniqStrings(allowances, 3)
}

export function buildEstimateDefenseMode(
  args: DetectorArgs
): EstimateDefenseMode | null {
  const markup = Number(args.pricing.markup || 0)
  const total = Number(args.pricing.total || 0)
  const labor = Number(args.pricing.labor || 0)
  const materials = Number(args.pricing.materials || 0)
  const subs = Number(args.pricing.subs || 0)
  const visits = Number(args.schedule.visits || 0)
  const crewDays = Number(args.schedule.crewDays || 0)
  const lowConfidence = Number(args.priceGuard.confidence || 0) <= 62
  const shortScope = getWordCount(args.scopeText || "") > 0 && getWordCount(args.scopeText || "") <= 12
  const bathroomRemodel = isBathroomRemodel(args)
  const wetAreaWork = isWetAreaWork(args)
  const multiTrade = !!args.tradeStack?.isMultiTrade
  const qtyWeak = hasLowQuantitySupport(args)
  const likelyLeaks = args.profitLeakDetector?.likelyProfitLeaks || []
  const missedLikely = args.missedScopeDetector?.likelyMissingScope || []
  const allowanceNotes = getAllowanceSignals(args)
  const topTradeList = (args.tradeStack?.trades || []).slice(0, 3).join(", ")
  const fixtureSignal = uniqStrings(
    [
      ...(args.planIntelligence?.analyses || []).flatMap((analysis) =>
        analysis.schedules
          .filter((item) => item.scheduleType === "fixture")
          .map((item) => item.label)
      ),
      ...(args.planIntelligence?.analyses || []).flatMap((analysis) =>
        analysis.tradeFindings
          .filter((item) => item.trade === "plumbing" || item.trade === "tile")
          .map((item) => item.label)
      ),
    ],
    3
  ).join(", ")

  const whyThisPriceHolds = collect([
    bathroomRemodel ? "Bathroom remodel pricing is carrying fixture, finish, and coordination exposure beyond the short written scope." : null,
    wetAreaWork ? "Wet-area work usually carries waterproofing, protection, cleanup, and sequencing burden even when the written scope is abbreviated." : null,
    multiTrade ? `The job is not single-trade only; coordination is implied across ${topTradeList || "multiple trades"}.` : null,
    visits >= 2 ? `The schedule shows about ${visits} site visits, which adds setup and return-trip burden.` : null,
    crewDays > 1 ? `The work plan carries about ${crewDays} crew-days rather than a one-trip service call.` : null,
    args.priceGuardVerified
      ? "Pricing is anchored by a verified or protected pricing path rather than free-form AI math alone."
      : null,
    markup > 0 ? `The total includes labor, materials, subs, and a ${markup}% markup carry.` : null,
  ])

  const includedScopeHighlights = collect([
    bathroomRemodel ? "Included price should be understood as remodel-level bathroom work, not just fixture swap labor." : null,
    wetAreaWork ? "Wet-area scope is being priced with setup, cleanup, and job management burden in mind." : null,
    fixtureSignal ? `Plan signals indicate bathroom fixture/layout work such as ${fixtureSignal}.` : null,
    labor > 0 ? `Labor is carrying the core installation and coordination effort on this job.` : null,
    materials > 0 ? "Materials carry is present for the visible finish and installation scope." : null,
    subs > 0 ? "The estimate includes non-labor carry that can cover setup, specialty work, or trade support." : null,
  ])

  const exclusionNotes = collect([
    missedLikely.length > 0
      ? `Price defense should stay contingent on omitted-scope review items such as ${missedLikely
          .slice(0, 2)
          .map((item) => item.label.toLowerCase())
          .join(" and ")} being confirmed.`
      : null,
    wetAreaWork && !/\bwaterproof|pan|drain\b/i.test(args.scopeText)
      ? "Waterproofing assemblies, pan work, drain work, and concealed corrections should not be over-promised unless they are explicitly included."
      : null,
    shortScope
      ? "Short written scopes should not be defended as all-inclusive without confirming finish selections, hidden conditions, and exact tie-in work."
      : null,
  ])

  const homeownerFriendlyJustification = collect([
    bathroomRemodel
      ? "Bathroom remodel pricing is driven by more than the visible fixtures; the work usually includes prep, protection, coordination, and finish-ready installation steps."
      : null,
    wetAreaWork
      ? "Wet-area work costs more than dry-area work because setup, cleanup, and failure-risk management are higher."
      : null,
    visits >= 2
      ? "The job is not priced like a one-visit handyman stop because it likely needs more than one trip to complete cleanly."
      : null,
    lowConfidence && qtyWeak
      ? "Some details still need field confirmation, so the estimate should be presented as a supported working number rather than as a blind fixed-price promise."
      : null,
  ])

  const estimatorDefenseNotes = collect([
    likelyLeaks[0]
      ? `Lead defense with margin exposure around ${likelyLeaks[0].label.toLowerCase()}; that is the cleanest explanation for why the number cannot be flattened further.`
      : null,
    bathroomRemodel && shortScope
      ? "Do not let a short bathroom scope collapse the defense into fixture-only language; hold the line on remodel coordination and wet-area burden."
      : null,
    multiTrade
      ? "Frame the number around sequencing and coordination instead of isolated line-item labor."
      : null,
    lowConfidence && qtyWeak
      ? "Present the estimate as a scoped working number with review points, not as a fully locked takeoff-driven GMP."
      : null,
    args.pricingSource === "ai" && !args.priceGuardVerified
      ? "Keep the defense grounded in visible scope, schedule, and trade burden rather than source-of-price language."
      : null,
  ])

  const optionalValueEngineeringIdeas = collect([
    wetAreaWork ? "If budget pressure comes up, value-engineer finish selections before compressing waterproofing, prep, or protection carry." : null,
    bathroomRemodel ? "Hold the core remodel scope and reduce owner-facing upgrades or finish allowances first." : null,
    multiTrade ? "Reduce coordination exposure by separating optional trade adds instead of flattening the whole margin structure." : null,
    visits >= 2 ? "If schedule flexibility exists, combine site tasks into fewer trips before cutting markup or setup carry." : null,
  ])

  const estimatorAllowanceNotes = collect([
    ...allowanceNotes,
    args.profitLeakDetector?.pricingReviewPrompts.some((item) =>
      /\bquantity support\b/i.test(item.label)
    )
      ? "Takeoff and quantity support are still light enough that exact field counts should stay reviewable."
      : null,
    args.profitLeakDetector?.pricingReviewPrompts.some((item) =>
      /\ballowance-heavy\b/i.test(item.label)
    )
      ? "Allowance-style assumptions should stay visible in the estimate defense instead of being implied as fixed inclusions."
      : null,
  ])

  const result: EstimateDefenseMode = {
    whyThisPriceHolds,
    includedScopeHighlights,
    exclusionNotes,
    allowanceNotes: estimatorAllowanceNotes,
    homeownerFriendlyJustification,
    estimatorDefenseNotes,
    optionalValueEngineeringIdeas,
  }

  const hasContent = Object.values(result).some(
    (items) => Array.isArray(items) && items.length > 0
  )

  if (!hasContent || total <= 0) {
    return null
  }

  return result
}
