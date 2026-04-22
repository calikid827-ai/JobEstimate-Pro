import type {
  ComplexityProfile,
  TradeStack,
} from "./types"
import type { PlanIntelligence } from "../plans/types"

export type MissedScopeItem = {
  label: string
  reason: string
  evidence: string[]
  confidence: number
}

export type MissedScopeDetector = {
  likelyMissingScope: MissedScopeItem[]
  recommendedConfirmations: MissedScopeItem[]
}

type DetectorArgs = {
  trade: string
  scopeText: string
  planIntelligence: PlanIntelligence | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
}

type JobType =
  | "bathroom_remodel"
  | "kitchen_remodel"
  | "patch_and_paint"
  | "baseboard_install"
  | "vanity_swap"
  | "tub_to_shower_conversion"
  | null

type RuleKind = "likely" | "confirm"

type Candidate = {
  kind: RuleKind
  label: string
  reason: string
  evidence: string[]
  confidence: number
}

type DetectorContext = {
  trade: string
  scopeText: string
  scope: string
  planIntelligence: PlanIntelligence | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
  jobType: JobType
  planTexts: string[]
  photoTexts: string[]
}

function uniqStrings(values: string[], max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, " ").trim()
}

function hasScope(ctx: DetectorContext, pattern: RegExp): boolean {
  return pattern.test(ctx.scope)
}

function findPlanText(ctx: DetectorContext, pattern: RegExp): string | null {
  return ctx.planTexts.find((value) => pattern.test(value)) ?? null
}

function findPhotoText(ctx: DetectorContext, pattern: RegExp): string | null {
  return ctx.photoTexts.find((value) => pattern.test(value)) ?? null
}

function collectEvidence(parts: Array<string | null | undefined>, max = 4): string[] {
  return uniqStrings(parts.filter(Boolean) as string[], max)
}

function isShortRemodelScope(ctx: DetectorContext): boolean {
  const words = ctx.scopeText.trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length <= 12
}

function hasBathroomFixtureScope(ctx: DetectorContext): boolean {
  return hasScope(ctx, /\bvanity\b|\bsink\b|\blav\b|\bfaucet\b|\btoilet\b|\bwc\b|\bwater closet\b/)
}

function hasBathroomShowerScope(ctx: DetectorContext): boolean {
  return hasScope(ctx, /\bshower\b|\btub\b|\btile\b/)
}

function bathroomRemodelOmissionMode(ctx: DetectorContext): boolean {
  return (
    ctx.jobType === "bathroom_remodel" &&
    ctx.complexityProfile?.class === "remodel" &&
    isShortRemodelScope(ctx) &&
    (hasBathroomFixtureScope(ctx) || hasBathroomShowerScope(ctx) || !!ctx.tradeStack?.isMultiTrade)
  )
}

function detectJobType(args: DetectorArgs): JobType {
  const scope = args.scopeText.toLowerCase()
  const rooms = args.planIntelligence?.detectedRooms || []
  const hasBathroom =
    /\bbath(room)?\b/.test(scope) ||
    rooms.some((room: string) => /\bbath(room)?\b/i.test(room))
  const hasKitchen =
    /\bkitchen\b/.test(scope) ||
    rooms.some((room: string) => /\bkitchen\b/i.test(room))

  if (/\btub\s*(to|-|\/)?\s*shower\b|\bconvert\b.*\btub\b.*\bshower\b|\bshower conversion\b/.test(scope)) {
    return "tub_to_shower_conversion"
  }

  if (/\bvanity\b/.test(scope) && /\b(replace|swap|swap out|remove and replace|install new)\b/.test(scope)) {
    return "vanity_swap"
  }

  if (hasBathroom && /\b(remodel|renovat|gut|demo|retile|new layout|replace|conversion)\b/.test(scope)) {
    return "bathroom_remodel"
  }

  if (hasKitchen && /\b(remodel|renovat|demo|replace|new layout|cabinet|counter)\b/.test(scope)) {
    return "kitchen_remodel"
  }

  if (/\b(baseboard|baseboards|base board)\b/.test(scope) && /\b(install|replace|new)\b/.test(scope)) {
    return "baseboard_install"
  }

  if (/\b(patch|repair|texture)\b/.test(scope) && /\b(paint|prime|repaint)\b/.test(scope)) {
    return "patch_and_paint"
  }

  return null
}

function buildContext(args: DetectorArgs): DetectorContext {
  const plan = args.planIntelligence

  return {
    trade: args.trade,
    scopeText: args.scopeText,
    scope: (args.scopeText || "").toLowerCase(),
    planIntelligence: plan,
    photoScopeAssist: args.photoScopeAssist,
    complexityProfile: args.complexityProfile,
    tradeStack: args.tradeStack,
    jobType: detectJobType(args),
    planTexts: uniqStrings(
      [
        plan?.summary || "",
        ...(plan?.notes || []),
        ...(plan?.scopeAssist?.missingScopeFlags || []),
        ...(plan?.scopeAssist?.suggestedAdditions || []),
        ...(plan?.analyses || []).flatMap((analysis) => [
          ...(analysis.textSnippets || []),
          ...(analysis.notes || []),
          ...(analysis.schedules || []).map((item) => item.label),
          ...(analysis.tradeFindings || []).map((item) => item.label),
        ]),
      ],
      40
    ),
    photoTexts: uniqStrings(
      [
        ...(args.photoScopeAssist.missingScopeFlags || []),
        ...(args.photoScopeAssist.suggestedAdditions || []),
      ],
      24
    ),
  }
}

function maybeCandidate(
  kind: RuleKind,
  label: string,
  reason: string,
  evidence: string[],
  confidence: number
): Candidate | null {
  if (!evidence.length) return null
  return {
    kind,
    label,
    reason,
    evidence: uniqStrings(evidence, 4),
    confidence: Math.max(1, Math.min(100, Math.round(confidence))),
  }
}

function getBathroomRules(ctx: DetectorContext): Candidate[] {
  const out: Candidate[] = []
  const hasRemodelSignal =
    ctx.jobType === "bathroom_remodel" || ctx.jobType === "tub_to_shower_conversion"
  if (!hasRemodelSignal) return out
  const omissionMode = bathroomRemodelOmissionMode(ctx)

  const demoPhotoFlag = findPhotoText(ctx, /\bdemo|demolition|remove|tear[-\s]*out|haul|disposal/i)
  const waterproofPlan = findPlanText(ctx, /\bwaterproof|membrane|pan\b/i)
  const drainPlan = findPlanText(ctx, /\bdrain\b|\bshower pan\b/i)
  const wetAreaPlan = findPlanText(ctx, /\bshower\b|\btub\b|\btile\b/i)
  const fixturePlan = findPlanText(ctx, /\bvanity\b|\blav\b|\bsink\b|\bfaucet\b/i)
  const toiletPlan = findPlanText(ctx, /\btoilet\b|\bwc\b|\bwater closet\b/i)
  const valvePlan = findPlanText(ctx, /\bvalve\b|\btrim\b|\bfaucet\b|\bplumb\b/i)
  const protectionPhoto = findPhotoText(ctx, /\bprotection|mask|containment|cleanup|access\b/i)
  const trimPhoto = findPhotoText(ctx, /\btrim|baseboards?|casing|transition\b/i)
  const patchPhoto = findPhotoText(ctx, /\bpatch|paint|touch[-\s]*up\b/i)

  if (!hasScope(ctx, /\bdemo|demolition|remove|tear\s*out|haul|disposal\b/) && (demoPhotoFlag || ctx.complexityProfile?.hasDemo)) {
    const candidate = maybeCandidate(
      "likely",
      "Demolition / haul-off",
      "Written bathroom remodel scope appears to miss demolition and haul-off, which are typically required before new fixture and finish work can proceed.",
      collectEvidence([
        "Scope text does not clearly mention demo/tear-out/haul-off.",
        demoPhotoFlag,
        ctx.complexityProfile?.hasDemo ? "Complexity profile indicates demolition is likely." : null,
      ]),
      demoPhotoFlag ? 92 : 78
    )
    if (candidate) out.push(candidate)
  }

  if (
    !hasScope(ctx, /\bwaterproof|waterproofing|membrane\b/) &&
    (ctx.jobType === "tub_to_shower_conversion" || waterproofPlan || wetAreaPlan || ctx.tradeStack?.isMultiTrade)
  ) {
    const candidate = maybeCandidate(
      waterproofPlan || ctx.jobType === "tub_to_shower_conversion" || omissionMode ? "likely" : "confirm",
      "Waterproofing",
      "Written bathroom remodel scope appears to miss waterproofing even though the shower/wet-area work implies it.",
      collectEvidence([
        waterproofPlan,
        wetAreaPlan,
        ctx.jobType === "tub_to_shower_conversion"
          ? "Scope text includes tub-to-shower conversion language."
          : "Bathroom remodel scope implies wet-area work.",
        ctx.tradeStack?.isMultiTrade ? "Trade stack indicates multi-trade remodel coordination." : null,
      ]),
      waterproofPlan || ctx.jobType === "tub_to_shower_conversion" ? 90 : omissionMode ? 82 : 72
    )
    if (candidate) out.push(candidate)
  }

  if (
    !hasScope(ctx, /\bbacker\b|\bsubstrate\b|\bcement board\b|\bhardie\b|\bdensshield\b/) &&
    wetAreaPlan
  ) {
    const candidate = maybeCandidate(
      "confirm",
      "Substrate / backer board",
      "Shower or tile-related bathroom work should confirm substrate/backer board scope.",
      collectEvidence([
        wetAreaPlan,
        "Scope text does not clearly mention substrate/backer board work.",
      ]),
      74
    )
    if (candidate) out.push(candidate)
  }

  if (
    !hasScope(ctx, /\bpan\b|\bdrain\b/) &&
    (ctx.jobType === "tub_to_shower_conversion" || drainPlan || wetAreaPlan)
  ) {
    const candidate = maybeCandidate(
      drainPlan ? "likely" : "confirm",
      "Shower pan / drain work",
      "Written bathroom remodel scope should confirm shower pan and drain work because shower-related remodel signals are present.",
      collectEvidence([
        drainPlan,
        wetAreaPlan,
        ctx.jobType === "tub_to_shower_conversion"
          ? "Scope text includes tub-to-shower conversion language."
          : "Bathroom remodel scope implies shower-related work.",
      ]),
      drainPlan ? 88 : 70
    )
    if (candidate) out.push(candidate)
  }

  if (
    !hasScope(ctx, /\bvalve\b|\btrim\b|\bplumb\b|\bdisconnect\b|\breconnect\b|\bfaucet\b/) &&
    (ctx.jobType === "tub_to_shower_conversion" || valvePlan || wetAreaPlan)
  ) {
    const candidate = maybeCandidate(
      valvePlan || ctx.jobType === "tub_to_shower_conversion" || omissionMode ? "likely" : "confirm",
      "Valve / trim / plumbing reconnect",
      "Written bathroom remodel scope appears to miss valve, trim, or plumbing reconnect work required to complete the listed fixture/shower items.",
      collectEvidence([
        valvePlan,
        wetAreaPlan,
        "Scope text does not clearly mention valve/trim/plumbing reconnect work.",
      ]),
      valvePlan || ctx.jobType === "tub_to_shower_conversion" ? 84 : omissionMode ? 80 : 68
    )
    if (candidate) out.push(candidate)
  }

  if (!hasScope(ctx, /\bvanity\b|\bsink\b|\blav\b|\bfaucet\b/) && fixturePlan) {
    const candidate = maybeCandidate(
      "likely",
      "Vanity / sink / faucet scope",
      "Plan-reviewed bathroom fixture/layout signals suggest vanity or sink-related work that is not clearly listed in scope.",
      collectEvidence([
        fixturePlan,
        "Scope text does not clearly mention vanity/sink/faucet work.",
      ]),
      85
    )
    if (candidate) out.push(candidate)
  }

  if (!hasScope(ctx, /\btoilet\b|\bwc\b|\bwater closet\b|\breset\b/) && toiletPlan) {
    const candidate = maybeCandidate(
      "likely",
      "Toilet reset / install",
      "Plan-reviewed bathroom fixture/layout signals suggest toilet-related work that is not clearly listed in scope.",
      collectEvidence([
        toiletPlan,
        "Scope text does not clearly mention toilet reset/install work.",
      ]),
      83
    )
    if (candidate) out.push(candidate)
  }

  if (
    !hasScope(ctx, /\bprotect|protection|containment|cleanup|mask|masking\b/) &&
    (protectionPhoto || ctx.complexityProfile?.class === "remodel")
  ) {
    const candidate = maybeCandidate(
      protectionPhoto || omissionMode ? "likely" : "confirm",
      "Protection / containment / cleanup",
      "Written bathroom remodel scope appears to miss protection, containment, or cleanup language needed around adjacent finishes and occupied space.",
      collectEvidence([
        protectionPhoto,
        ctx.complexityProfile?.class === "remodel"
          ? "Complexity profile classified this as remodel work."
          : null,
        "Scope text does not clearly mention protection/containment/cleanup.",
      ]),
      protectionPhoto ? 80 : omissionMode ? 76 : 66
    )
    if (candidate) out.push(candidate)
  }

  if (!hasScope(ctx, /\bpatch\b|\bpaint\b|\btouch[-\s]*up\b/) && patchPhoto) {
    const candidate = maybeCandidate(
      "confirm",
      "Patch / paint touch-up",
      "Bathroom remodel layout changes may require patching or paint touch-up around adjacent disturbed finishes.",
      collectEvidence([
        patchPhoto,
        "Scope text does not clearly mention patch/paint touch-up.",
      ]),
      64
    )
    if (candidate) out.push(candidate)
  }

  if (!hasScope(ctx, /\btrim\b|\bbaseboard\b|\btransition\b|\bcasing\b/) && trimPhoto) {
    const candidate = maybeCandidate(
      "confirm",
      "Trim / base / floor transition risk",
      "Bathroom layout changes may affect trim, base, or floor transition conditions that should be confirmed.",
      collectEvidence([
        trimPhoto,
        "Scope text does not clearly mention trim/base/transition adjustments.",
      ]),
      63
    )
    if (candidate) out.push(candidate)
  }

  return out
}

function getKitchenRules(ctx: DetectorContext): Candidate[] {
  if (ctx.jobType !== "kitchen_remodel") return []
  const out: Candidate[] = []
  const demoPhotoFlag = findPhotoText(ctx, /\bdemo|demolition|remove|tear[-\s]*out|haul|disposal/i)
  const planElectrical = findPlanText(ctx, /\belectrical devices|lighting|power scope shown in plans\b|\boutlet\b|\bswitch\b|\blighting\b/i)

  if (!hasScope(ctx, /\bdemo|demolition|remove|tear\s*out|haul|disposal\b/)) {
    const candidate = maybeCandidate(
      "likely",
      "Demolition / haul-off",
      "Kitchen remodel scope appears to omit demolition or haul-off despite remodel signals.",
      collectEvidence([
        "Scope text does not clearly mention demo/tear-out/haul-off.",
        demoPhotoFlag,
        ctx.complexityProfile?.class === "remodel" ? "Complexity profile classified this as remodel work." : null,
      ]),
      demoPhotoFlag ? 88 : 74
    )
    if (candidate) out.push(candidate)
  }

  if (!hasScope(ctx, /\belectrical|lighting|outlet|switch|device\b/) && planElectrical) {
    const candidate = maybeCandidate(
      "confirm",
      "Electrical / device scope",
      "Kitchen plan review suggests electrical/device scope that is not clearly reflected in the written scope.",
      collectEvidence([planElectrical, "Scope text does not clearly mention electrical/device work."]),
      72
    )
    if (candidate) out.push(candidate)
  }

  return out
}

function getPatchAndPaintRules(ctx: DetectorContext): Candidate[] {
  if (ctx.jobType !== "patch_and_paint") return []
  const out: Candidate[] = []

  if (!hasScope(ctx, /\bprime|primer|stain[-\s]*block|seal\b/)) {
    const candidate = maybeCandidate(
      "confirm",
      "Primer / sealer after patching",
      "Patch-and-paint work should confirm whether primer or sealer is included after repairs.",
      collectEvidence(["Scope text includes patch/repair plus paint language, but no primer/sealer wording."]),
      70
    )
    if (candidate) out.push(candidate)
  }

  const protectionPhoto = findPhotoText(ctx, /\bprotection|mask|access handling\b/i)
  if (protectionPhoto) {
    const candidate = maybeCandidate(
      "confirm",
      "Protection / masking",
      "Visible conditions suggest masking or protection scope should be confirmed.",
      collectEvidence([protectionPhoto]),
      68
    )
    if (candidate) out.push(candidate)
  }

  return out
}

function getBaseboardRules(ctx: DetectorContext): Candidate[] {
  if (ctx.jobType !== "baseboard_install") return []
  if (hasScope(ctx, /\bcaulk|fill|paint|touch[-\s]*up\b/)) return []

  const trimPhoto = findPhotoText(ctx, /\btrim|baseboards?\b/i)
  const candidate = maybeCandidate(
    "confirm",
    "Finish-ready trim scope",
    "Baseboard install scope should confirm whether caulk, fill, and paint touch-up are included.",
    collectEvidence([
      "Scope text mentions baseboard install without finish-ready trim language.",
      trimPhoto,
    ]),
    66
  )

  return candidate ? [candidate] : []
}

function getVanitySwapRules(ctx: DetectorContext): Candidate[] {
  if (ctx.jobType !== "vanity_swap") return []
  if (hasScope(ctx, /\bplumb|disconnect|reconnect|trap|supply|faucet|sink\b/)) return []

  const fixturePlan = findPlanText(ctx, /\bvanity\b|\blav\b|\bsink\b|\bfaucet\b/i)
  const candidate = maybeCandidate(
    "confirm",
    "Plumbing disconnect / reconnect",
    "Vanity replacement scope should confirm plumbing disconnect/reconnect and sink hookup work.",
    collectEvidence([
      "Scope text includes vanity replacement language without clear plumbing reconnect wording.",
      fixturePlan,
    ]),
    74
  )

  return candidate ? [candidate] : []
}

function getTubToShowerRules(ctx: DetectorContext): Candidate[] {
  if (ctx.jobType !== "tub_to_shower_conversion") return []
  const out: Candidate[] = []

  if (!hasScope(ctx, /\bdemo|demolition|remove|tear\s*out|dispose|disposal\b/)) {
    const candidate = maybeCandidate(
      "likely",
      "Tub removal / disposal",
      "Tub-to-shower conversion scope appears to omit tub removal or disposal language.",
      collectEvidence(["Scope text includes tub-to-shower conversion language."]),
      82
    )
    if (candidate) out.push(candidate)
  }

  if (!hasScope(ctx, /\bvalve|drain|plumb|waterproof|pan\b/)) {
    const candidate = maybeCandidate(
      "confirm",
      "Shower plumbing / waterproofing",
      "Tub-to-shower conversion should confirm shower valve, drain, waterproofing, and pan-related scope.",
      collectEvidence([
        "Scope text includes tub-to-shower conversion language without plumbing/waterproofing detail.",
        ctx.tradeStack?.isMultiTrade ? "Trade stack indicates multi-trade conversion work." : null,
      ]),
      76
    )
    if (candidate) out.push(candidate)
  }

  return out
}

function getGenericRules(ctx: DetectorContext): Candidate[] {
  const out: Candidate[] = []
  const planGeneralFixture = findPlanText(ctx, /\bfixture-related work shown in plans\b/)
  const protectionPhoto = findPhotoText(ctx, /\bprotection|mask|access handling\b/i)

  if (planGeneralFixture && !findPlanText(ctx, /\bbathroom fixture\/layout\b/)) {
    const candidate = maybeCandidate(
      "confirm",
      "Fixture-related scope",
      "Plan review found fixture-related work that is not clearly reflected in the written scope.",
      collectEvidence([planGeneralFixture]),
      62
    )
    if (candidate) out.push(candidate)
  }

  if (
    protectionPhoto &&
    ctx.complexityProfile?.class !== "simple" &&
    !hasScope(ctx, /\bprotect|protection|mask|masking\b/) &&
    ctx.jobType !== "bathroom_remodel" &&
    ctx.jobType !== "tub_to_shower_conversion"
  ) {
    const candidate = maybeCandidate(
      "confirm",
      "Protection / access handling",
      "Visible access or protection conditions should be confirmed in the written scope.",
      collectEvidence([
        protectionPhoto,
        "Complexity profile indicates non-simple execution conditions.",
      ]),
      60
    )
    if (candidate) out.push(candidate)
  }

  return out
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
      best.set(key, {
        ...item,
        evidence: uniqStrings(item.evidence, 4),
      })
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max)
}

export function detectMissedScope(args: DetectorArgs): MissedScopeDetector | null {
  const ctx = buildContext(args)

  const candidates = [
    ...getBathroomRules(ctx),
    ...getKitchenRules(ctx),
    ...getPatchAndPaintRules(ctx),
    ...getBaseboardRules(ctx),
    ...getVanitySwapRules(ctx),
    ...getTubToShowerRules(ctx),
    ...getGenericRules(ctx),
  ]

  const merged = mergeCandidates(candidates, 10)
  const likelyMissingScope = merged
    .filter((item) => item.kind === "likely")
    .map((item) => ({
      label: item.label,
      reason: item.reason,
      evidence: item.evidence,
      confidence: item.confidence,
    }))
    .slice(0, 6)

  const recommendedConfirmations = merged
    .filter((item) => item.kind === "confirm")
    .filter(
      (item) =>
        !likelyMissingScope.some(
          (missing) => normalizeLabel(missing.label) === normalizeLabel(item.label)
        ) &&
        !(
          item.label === "Protection / access handling" &&
          likelyMissingScope.some((missing) => missing.label === "Protection / containment / cleanup")
        )
    )
    .map((item) => ({
      label: item.label,
      reason: item.reason,
      evidence: item.evidence,
      confidence: item.confidence,
    }))
    .slice(0, 6)

  if (likelyMissingScope.length === 0 && recommendedConfirmations.length === 0) {
    return null
  }

  return {
    likelyMissingScope,
    recommendedConfirmations,
  }
}
