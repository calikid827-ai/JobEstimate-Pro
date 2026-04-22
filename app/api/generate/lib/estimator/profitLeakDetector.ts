import type { PlanIntelligence } from "../plans/types"
import type {
  ComplexityProfile,
  EstimateBasis,
  PriceGuardReport,
  Pricing,
  ScheduleBlock,
  TradeStack,
} from "./types"

export type ProfitLeakItem = {
  label: string
  reason: string
  evidence: string[]
  confidence: number
  severity: "high" | "medium"
}

export type ProfitLeakDetector = {
  likelyProfitLeaks: ProfitLeakItem[]
  pricingReviewPrompts: ProfitLeakItem[]
}

type DetectorArgs = {
  pricing: Pricing
  estimateBasis: EstimateBasis | null
  pricingSource: "ai" | "deterministic" | "merged"
  priceGuardVerified: boolean
  priceGuard: PriceGuardReport
  trade: string
  tradeStack: TradeStack | null
  complexityProfile: ComplexityProfile | null
  planIntelligence: PlanIntelligence | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  schedule: ScheduleBlock
  scopeText: string
}

type Candidate = ProfitLeakItem & {
  kind: "likely" | "review"
}

function uniqStrings(values: string[], max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, " ").trim()
}

function collectEvidence(parts: Array<string | null | undefined>, max = 4): string[] {
  return uniqStrings(parts.filter(Boolean) as string[], max)
}

function maybeCandidate(args: {
  kind: "likely" | "review"
  label: string
  reason: string
  evidence: string[]
  confidence: number
  severity?: "high" | "medium"
}): Candidate | null {
  if (!args.evidence.length) return null
  return {
    kind: args.kind,
    label: args.label,
    reason: args.reason,
    evidence: uniqStrings(args.evidence, 4),
    confidence: Math.max(1, Math.min(100, Math.round(args.confidence))),
    severity: args.severity ?? (args.kind === "likely" ? "high" : "medium"),
  }
}

function isBathroomRemodel(args: DetectorArgs): boolean {
  const scope = args.scopeText.toLowerCase()
  const planRooms = args.planIntelligence?.detectedRooms || []
  const hasBathroom =
    /\bbath(room)?\b/.test(scope) ||
    planRooms.some((room) => /\bbath(room)?\b/i.test(room))

  return (
    hasBathroom &&
    /\b(remodel|renovat|gut|demo|replace|conversion|tile|shower|vanity|toilet)\b/.test(scope)
  )
}

function isWetAreaRemodel(args: DetectorArgs): boolean {
  const scope = args.scopeText.toLowerCase()
  const planBlob = [
    args.planIntelligence?.summary || "",
    ...(args.planIntelligence?.notes || []),
    ...(args.planIntelligence?.scopeAssist?.suggestedAdditions || []),
  ]
    .join(" ")
    .toLowerCase()

  return (
    isBathroomRemodel(args) &&
    /\b(shower|tub|tile|wet area|pan|drain)\b/.test(`${scope} ${planBlob}`)
  )
}

function hasExplicitDemo(scope: string): boolean {
  return /\bdemo|demolition|remove|tear\s*out|haul|disposal|dumpster\b/.test(scope)
}

function hasExplicitProtection(scope: string): boolean {
  return /\bprotect|protection|mask|masking|containment|cleanup\b/.test(scope)
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

function getWordCount(value: string): number {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function isShortWrittenScope(scope: string): boolean {
  return getWordCount(scope) > 0 && getWordCount(scope) <= 12
}

function getMobilizationAllowance(args: DetectorArgs): number {
  const basisMob = Number(args.estimateBasis?.mobilization || 0)
  if (Number.isFinite(basisMob) && basisMob > 0) return basisMob
  return Number(args.pricing.subs || 0)
}

function mergeCandidates(items: Candidate[], max = 8): Candidate[] {
  const best = new Map<string, Candidate>()

  for (const item of items) {
    const key = `${item.kind}:${normalizeLabel(item.label)}`
    const existing = best.get(key)
    if (
      !existing ||
      item.confidence > existing.confidence ||
      (item.confidence === existing.confidence && item.evidence.length > existing.evidence.length)
    ) {
      best.set(key, item)
    }
  }

  return Array.from(best.values())
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1
      return a.label.localeCompare(b.label)
    })
    .slice(0, max)
}

function isMarkupLeakLabel(label: string): boolean {
  return /\bmarkup|margin buffer|margin\b/i.test(label)
}

function isWetAreaLeakLabel(label: string): boolean {
  return /\bwet-area|protection and setup|protection\b/i.test(label)
}

function isCoordinationLeakLabel(label: string): boolean {
  return /\bcoordination burden|coordination load\b/i.test(label)
}

function isVisitLeakLabel(label: string): boolean {
  return /\breturn-trip burden|mobilization allowance\b/i.test(label)
}

function isQuantityReviewLabel(label: string): boolean {
  return /\bquantity support|allowance-heavy|pricing spread\b/i.test(label)
}

function suppressOverlappingReviews(
  likelyProfitLeaks: ProfitLeakItem[],
  reviewItems: ProfitLeakItem[]
): ProfitLeakItem[] {
  const hasMarkupLeak = likelyProfitLeaks.some((item) => isMarkupLeakLabel(item.label))
  const hasWetAreaLeak = likelyProfitLeaks.some((item) => isWetAreaLeakLabel(item.label))
  const hasCoordinationLeak = likelyProfitLeaks.some((item) => isCoordinationLeakLabel(item.label))
  const hasVisitLeak = likelyProfitLeaks.some((item) => isVisitLeakLabel(item.label))

  return reviewItems.filter((item) => {
    if (likelyProfitLeaks.some((existing) => normalizeLabel(existing.label) === normalizeLabel(item.label))) {
      return false
    }
    if (hasMarkupLeak && /\bmarkup\b/i.test(item.label)) return false
    if (hasWetAreaLeak && /\bsetup|mobilization|protection\b/i.test(item.label)) return false
    if (hasCoordinationLeak && /\bcoordination load|pricing spread\b/i.test(item.label)) return false
    if (hasVisitLeak && /\bmobilization allowance\b/i.test(item.label)) return false
    if ((hasMarkupLeak || hasCoordinationLeak) && isQuantityReviewLabel(item.label) && item.confidence < 78) {
      return false
    }
    return true
  })
}

function getAuditCandidates(args: DetectorArgs): Candidate[] {
  const out: Candidate[] = []
  const scope = (args.scopeText || "").toLowerCase()
  const markup = Number(args.pricing.markup || 0)
  const total = Number(args.pricing.total || 0)
  const base = Number(args.pricing.labor || 0) + Number(args.pricing.materials || 0) + Number(args.pricing.subs || 0)
  const mobilization = getMobilizationAllowance(args)
  const visits = Number(args.schedule.visits || 0)
  const crewDays = Number(args.schedule.crewDays || 0)
  const complexity = args.complexityProfile
  const missingFlags = args.photoScopeAssist.missingScopeFlags || []
  const suggested = args.photoScopeAssist.suggestedAdditions || []
  const lowConfidence = Number(args.priceGuard.confidence || 0) <= 62
  const bathroomRemodel = isBathroomRemodel(args)
  const wetAreaRemodel = isWetAreaRemodel(args)
  const quantityWeak = hasLowQuantitySupport(args)
  const shortScope = isShortWrittenScope(args.scopeText || "")
  const remodelCoordinationPressure =
    complexity?.class === "remodel" &&
    (bathroomRemodel || wetAreaRemodel || !!args.tradeStack?.isMultiTrade || shortScope)
  const weakMobilizationForRemodel =
    mobilization < Math.max(350, Number(complexity?.minMobilization || 0) * 0.7)

  if (
    complexity?.class === "remodel" &&
    (markup <= 18 || (markup <= 20 && remodelCoordinationPressure && !args.priceGuardVerified))
  ) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Margin buffer looks light for remodel coordination",
      reason: "This remodel is carrying coordination and unknown-condition exposure that usually wants more margin buffer than the current markup shows.",
      evidence: collectEvidence([
        `Markup is ${markup}%.`,
        "Complexity profile classified this as remodel work.",
        shortScope ? "Written scope is short for the amount of implied remodel work." : null,
        wetAreaRemodel ? "Wet-area remodel signals are present." : null,
        args.tradeStack?.isMultiTrade ? "Trade stack indicates multi-trade coordination." : null,
      ]),
      confidence:
        wetAreaRemodel || args.tradeStack?.isMultiTrade
          ? 92
          : bathroomRemodel || shortScope
            ? 88
            : 84,
    })
    if (candidate) out.push(candidate)
  } else if (complexity?.class === "remodel" && markup <= 20 && !args.priceGuardVerified) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Review remodel markup buffer",
      reason: "This remodel may be carrying more coordination and unknown-condition exposure than the current markup buffer comfortably covers.",
      evidence: collectEvidence([
        `Markup is ${markup}%.`,
        "Complexity profile classified this as remodel work.",
        !args.priceGuardVerified ? "Pricing is not coming from a verified deterministic engine." : null,
      ]),
      confidence: 72,
      severity: "medium",
    })
    if (candidate) out.push(candidate)
  }

  if (args.tradeStack?.isMultiTrade && markup <= 20 && !args.priceGuardVerified) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Coordination burden looks under-carried",
      reason: "This estimate is carrying multi-trade sequencing, supervision, and callback exposure without much coordination room in the margin.",
      evidence: collectEvidence([
        `Markup is ${markup}%.`,
        `Trade stack includes: ${(args.tradeStack.trades || []).slice(0, 4).join(", ")}.`,
        "Pricing is not verified deterministic.",
        shortScope ? "Written scope is short for the coordination load implied." : null,
      ]),
      confidence: shortScope || wetAreaRemodel ? 90 : 86,
    })
    if (candidate) out.push(candidate)
  }

  if (
    wetAreaRemodel &&
    !hasExplicitProtection(scope) &&
    mobilization < Math.max(450, Number(complexity?.minMobilization || 0))
  ) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Wet-area protection and setup look under-carried",
      reason: "Wet-area remodel work usually needs a stronger setup, containment, and cleanup carry than this estimate appears to be holding.",
      evidence: collectEvidence([
        `Setup/other allowance is about $${Math.round(mobilization)}.`,
        "Wet-area bathroom remodel signals are present.",
        "Scope text does not clearly mention protection or containment.",
      ]),
      confidence: shortScope || bathroomRemodel ? 89 : 84,
    })
    if (candidate) out.push(candidate)
  }

  if (
    (bathroomRemodel || complexity?.class === "remodel") &&
    !hasExplicitDemo(scope) &&
    missingFlags.some((flag) => /\bdemo|remove|tear[-\s]*out|disposal/i.test(flag))
  ) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Demo and haul-off do not look clearly carried",
      reason: "This remodel reads like it needs tear-out and disposal burden, but the written scope does not clearly show that burden being carried.",
      evidence: collectEvidence([
        "Scope text does not clearly mention demo/disposal.",
        missingFlags.find((flag) => /\bdemo|remove|tear[-\s]*out|disposal/i.test(flag)),
        complexity?.class === "remodel" ? "Complexity profile classified this as remodel work." : null,
        shortScope ? "Written scope is short for a remodel with implied removal work." : null,
      ]),
      confidence: bathroomRemodel || shortScope ? 88 : 82,
    })
    if (candidate) out.push(candidate)
  }

  if (
    (visits >= 2 || (crewDays > 0 && crewDays <= 1.5)) &&
    total < 2500 &&
    mobilization < 300
  ) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Return-trip burden looks under-carried",
      reason: "This job appears to need more than one setup or return trip, but the current setup carry looks thin for that burden.",
      evidence: collectEvidence([
        visits >= 2 ? `Schedule indicates about ${visits} visit(s).` : null,
        crewDays > 0 ? `Crew-days are about ${crewDays}.` : null,
        `Setup/other allowance is about $${Math.round(mobilization)}.`,
        `Total price is about $${Math.round(total)}.`,
      ]),
      confidence: visits >= 2 ? 86 : 80,
    })
    if (candidate) out.push(candidate)
  }

  if (lowConfidence && quantityWeak && (complexity?.class === "remodel" || args.tradeStack?.isMultiTrade)) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Quantity support is thin for this remodel carry",
      reason: "The estimate is carrying remodel or coordination exposure with limited quantity support and only modest review confidence.",
      evidence: collectEvidence([
        `PriceGuard confidence is ${args.priceGuard.confidence}.`,
        quantityWeak ? "Quantity/takeoff support is thin." : null,
        complexity?.class === "remodel" ? "Complexity profile classified this as remodel work." : null,
        args.tradeStack?.isMultiTrade ? "Trade stack indicates multi-trade coordination." : null,
      ]),
      confidence: 78,
      severity: "medium",
    })
    if (candidate) out.push(candidate)
  }

  if (
    mobilization < Math.max(200, Number(complexity?.minMobilization || 0) * 0.6) &&
    total > 0 &&
    !weakMobilizationForRemodel
  ) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Mobilization allowance may be light",
      reason: "The setup carry looks light for this job profile and could leave travel, setup, or small-job overhead under-recovered.",
      evidence: collectEvidence([
        `Setup/other allowance is about $${Math.round(mobilization)}.`,
        complexity?.minMobilization
          ? `Complexity baseline mobilization is ${complexity.minMobilization}.`
          : null,
      ]),
      confidence: complexity?.class === "simple" ? 62 : 74,
      severity: "medium",
    })
    if (candidate) out.push(candidate)
  }

  if (
    complexity?.class === "remodel" &&
    !args.priceGuardVerified &&
    args.pricingSource === "ai" &&
    markup <= 20 &&
    suggested.length > 0 &&
    lowConfidence
  ) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Allowance-heavy scope is riding weak pricing confidence",
      reason: "This scope still has unresolved allowance-style questions, and the estimate is leaning on limited confidence rather than strong quantity support.",
      evidence: collectEvidence([
        `PriceGuard confidence is ${args.priceGuard.confidence}.`,
        `Pricing source is ${args.pricingSource}.`,
        suggested[0] || null,
        `Markup is ${markup}%.`,
      ]),
      confidence: 76,
      severity: "medium",
    })
    if (candidate) out.push(candidate)
  }

  if (
    base > 0 &&
    args.tradeStack?.isMultiTrade &&
    markup <= 20 &&
    total < base * 1.18
  ) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Pricing spread looks flat for the coordination load",
      reason: "The final spread over base cost looks flatter than the coordination burden on this scope would usually justify.",
      evidence: collectEvidence([
        `Base cost is about $${Math.round(base)} with total about $${Math.round(total)}.`,
        `Markup is ${markup}%.`,
        `Trade stack includes: ${(args.tradeStack.trades || []).slice(0, 4).join(", ")}.`,
      ]),
      confidence: 73,
      severity: "medium",
    })
    if (candidate) out.push(candidate)
  }

  return out
}

export function detectProfitLeaks(args: DetectorArgs): ProfitLeakDetector | null {
  const merged = mergeCandidates(getAuditCandidates(args), 10)

  const likelyProfitLeaks = merged
    .filter((item) => item.kind === "likely")
    .map((item) => ({
      label: item.label,
      reason: item.reason,
      evidence: item.evidence,
      confidence: item.confidence,
      severity: item.severity,
    }))
    .slice(0, 6)

  const pricingReviewPrompts = suppressOverlappingReviews(
    likelyProfitLeaks,
    merged
    .filter((item) => item.kind === "review")
    .map((item) => ({
      label: item.label,
      reason: item.reason,
      evidence: item.evidence,
      confidence: item.confidence,
      severity: item.severity,
    }))
  ).slice(0, 6)

  if (likelyProfitLeaks.length === 0 && pricingReviewPrompts.length === 0) {
    return null
  }

  return {
    likelyProfitLeaks,
    pricingReviewPrompts,
  }
}
