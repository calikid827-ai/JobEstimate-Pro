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

  if (complexity?.class === "remodel" && markup <= 18) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Remodel margin looks thin",
      reason: "Markup looks light for remodel coordination, callbacks, and unknowns already implied by this scope.",
      evidence: collectEvidence([
        `Markup is ${markup}%.`,
        "Complexity profile classified this as remodel work.",
        args.tradeStack?.isMultiTrade ? "Trade stack indicates multi-trade coordination." : null,
      ]),
      confidence: args.tradeStack?.isMultiTrade ? 92 : 84,
    })
    if (candidate) out.push(candidate)
  } else if (complexity?.class === "remodel" && markup <= 20 && !args.priceGuardVerified) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Review remodel markup buffer",
      reason: "Markup may be light for a remodel scope that still carries coordination and unknown-condition risk.",
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
      label: "Multi-trade coordination under-covered",
      reason: "This job carries multi-trade coordination risk, but the margin buffer looks light for sequencing, supervision, and returns.",
      evidence: collectEvidence([
        `Markup is ${markup}%.`,
        `Trade stack includes: ${(args.tradeStack.trades || []).slice(0, 4).join(", ")}.`,
        "Pricing is not verified deterministic.",
      ]),
      confidence: 86,
    })
    if (candidate) out.push(candidate)
  }

  if (wetAreaRemodel && !hasExplicitProtection(scope) && mobilization < Math.max(450, Number(complexity?.minMobilization || 0))) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Wet-area setup / protection looks under-carried",
      reason: "Wet-area remodel scope usually needs stronger protection, containment, and cleanup allowance than this estimate shows.",
      evidence: collectEvidence([
        `Setup/other allowance is about $${Math.round(mobilization)}.`,
        "Wet-area bathroom remodel signals are present.",
        "Scope text does not clearly mention protection or containment.",
      ]),
      confidence: 84,
    })
    if (candidate) out.push(candidate)
  }

  if ((bathroomRemodel || complexity?.class === "remodel") && !hasExplicitDemo(scope) && missingFlags.some((flag) => /\bdemo|remove|tear[-\s]*out|disposal/i.test(flag))) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Demo / disposal burden may be missing from price",
      reason: "Remodel scope appears to carry tear-out or disposal burden, but the written scope does not clearly price that burden in.",
      evidence: collectEvidence([
        "Scope text does not clearly mention demo/disposal.",
        missingFlags.find((flag) => /\bdemo|remove|tear[-\s]*out|disposal/i.test(flag)),
        complexity?.class === "remodel" ? "Complexity profile classified this as remodel work." : null,
      ]),
      confidence: 82,
    })
    if (candidate) out.push(candidate)
  }

  if ((visits >= 2 || (crewDays > 0 && crewDays <= 1.5)) && total < 2500 && mobilization < 300) {
    const candidate = maybeCandidate({
      kind: "likely",
      label: "Fragmented visit burden looks under-protected",
      reason: "This estimate appears to carry multiple trip or setup burden without much margin in the setup/other bucket.",
      evidence: collectEvidence([
        visits >= 2 ? `Schedule indicates about ${visits} visit(s).` : null,
        crewDays > 0 ? `Crew-days are about ${crewDays}.` : null,
        `Setup/other allowance is about $${Math.round(mobilization)}.`,
        `Total price is about $${Math.round(total)}.`,
      ]),
      confidence: 80,
    })
    if (candidate) out.push(candidate)
  }

  if (lowConfidence && quantityWeak && (complexity?.class === "remodel" || args.tradeStack?.isMultiTrade)) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Scope complexity is outrunning quantity support",
      reason: "The scope carries remodel or coordination complexity, but the estimate is being carried with limited quantity support and modest review confidence.",
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

  if (mobilization < Math.max(200, Number(complexity?.minMobilization || 0) * 0.6) && total > 0) {
    const candidate = maybeCandidate({
      kind: "review",
      label: "Setup / mobilization allowance looks light",
      reason: "The setup/other bucket looks light for the current job profile and could leave travel, setup, and overhead under-recovered.",
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
      label: "Allowance-heavy scope is leaning on weak pricing confidence",
      reason: "The scope still has unresolved allowance-style scope questions, but the estimate is leaning on AI pricing with limited confidence buffer.",
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
      label: "Pricing looks flat for listed coordination load",
      reason: "The estimate is carrying multi-trade scope, but the final spread above base cost looks flatter than the coordination burden suggests.",
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

  const pricingReviewPrompts = merged
    .filter((item) => item.kind === "review")
    .filter(
      (item) =>
        !likelyProfitLeaks.some(
          (existing) => normalizeLabel(existing.label) === normalizeLabel(item.label)
        )
    )
    .map((item) => ({
      label: item.label,
      reason: item.reason,
      evidence: item.evidence,
      confidence: item.confidence,
      severity: item.severity,
    }))
    .slice(0, 6)

  if (likelyProfitLeaks.length === 0 && pricingReviewPrompts.length === 0) {
    return null
  }

  return {
    likelyProfitLeaks,
    pricingReviewPrompts,
  }
}
