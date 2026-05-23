import type {
  AreaScopeBreakdown,
  EstimateRow,
  EstimateStructuredSection,
  Schedule,
  ScopeSignals,
  ScopeXRay,
  UiTrade,
} from "./types"

export type CrewPlanOptionLabel = "Small crew" | "Standard crew" | "Push schedule"

export type CrewPlanOption = {
  label: CrewPlanOptionLabel
  crewSize: number
  estimatedWorkDays: number | null
  notes: string[]
}

export type CrewPlanningReadback = {
  recommendedCrewSize: number | null
  crewDayBasis: number | null
  durationRange: string | null
  options: CrewPlanOption[]
  sequence: string[]
  bottlenecks: string[]
  risks: string[]
  basis: string[]
  estimatorOnly: true
  affectsPricing: false
  hasSchedulingRisks: boolean
}

export type BuildCrewPlanningReadbackArgs = {
  selectedTrade?: UiTrade | string | null
  scopeText: string
  schedule?: Schedule | null
  pricingLabor?: number | null
  estimateRows?: EstimateRow[] | null
  estimateSections?: EstimateStructuredSection[] | null
  scopeXRay?: ScopeXRay | null
  areaScopeBreakdown?: AreaScopeBreakdown | null
  priceGuardReview?: {
    contractorRiskNotes?: string[]
  } | null
  scopeSignals?: ScopeSignals | null
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase()
}

function addUnique(target: string[], value: string, max = 6): void {
  const next = clean(value)
  if (!next || target.length >= max) return
  const key = normalize(next)
  if (target.some((item) => normalize(item) === key)) return
  target.push(next)
}

function ceilDays(crewDays: number | null, crewSize: number): number | null {
  if (!crewDays || !Number.isFinite(crewDays) || crewDays <= 0) return null
  return Math.max(1, Math.ceil(crewDays / Math.max(1, crewSize)))
}

function detectHotelMultiUnit(scopeText: string): boolean {
  return /\b(hotel|motel|multi[-\s]?unit|units?|guest\s*rooms?|rooms?\s*\d+|corridors?|floors?|floor\s+\d+|occupied\s+rooms?|room release|unit stack)\b/i.test(
    scopeText
  )
}

function detectTrade(selectedTrade: BuildCrewPlanningReadbackArgs["selectedTrade"], scopeText: string): string {
  const selected = normalize(selectedTrade)
  if (selected) return selected
  const text = normalize(scopeText)
  if (/\bpaint|primer|coats?\b/.test(text)) return "painting"
  if (/\bdrywall|sheetrock|patch|texture\b/.test(text)) return "drywall"
  if (/\bfloor|lvp|tile|carpet|laminate\b/.test(text)) return "flooring"
  if (/\belectrical|outlet|switch|fixture|lighting\b/.test(text)) return "electrical"
  if (/\bplumbing|toilet|sink|faucet|drain\b/.test(text)) return "plumbing"
  return "general"
}

function recommendedCrewSize(args: {
  trade: string
  scopeText: string
  crewDays: number | null
  hotelMultiUnit: boolean
}): number | null {
  if (args.hotelMultiUnit) return 6
  if (args.trade === "painting") return Number(args.crewDays || 0) > 2 ? 3 : 2
  if (args.trade === "drywall" || args.trade === "flooring") return 2
  if (args.trade === "electrical" || args.trade === "plumbing") return 1
  if (/\bsmall|touch[-\s]?up|minor\b/i.test(args.scopeText)) return 1
  return args.crewDays ? 2 : null
}

function buildDurationRange(schedule?: Schedule | null): string | null {
  if (schedule?.calendarDays) {
    return `${schedule.calendarDays.min}-${schedule.calendarDays.max} calendar days`
  }
  if (schedule?.crewDays != null) {
    return `${schedule.crewDays} crew-day${schedule.crewDays === 1 ? "" : "s"}`
  }
  return null
}

function buildOptions(crewDays: number | null, recommended: number | null): CrewPlanOption[] {
  const standard = Math.max(1, recommended || 1)
  const small = Math.max(1, standard - 1)
  const push = Math.max(standard + 1, standard === 1 ? 2 : standard + 2)

  return [
    {
      label: "Small crew",
      crewSize: small,
      estimatedWorkDays: ceilDays(crewDays, small),
      notes: ["Lower manpower, usually longer duration, lower coordination load."],
    },
    {
      label: "Standard crew",
      crewSize: standard,
      estimatedWorkDays: ceilDays(crewDays, standard),
      notes: ["Recommended planning baseline from the current schedule."],
    },
    {
      label: "Push schedule",
      crewSize: push,
      estimatedWorkDays: ceilDays(crewDays, push),
      notes: ["More workers only helps if access, staging, and materials are ready."],
    },
  ]
}

function buildSequence(trade: string, hotelMultiUnit: boolean): string[] {
  if (hotelMultiUnit) {
    return [
      "Confirm room/unit release plan, floor access, exclusions, and material staging.",
      "Start with a mockup or first-room approval before rolling production.",
      "Run rolling production with prep ahead, finish crew behind, and punch follow-up.",
      "Track completed rooms/areas daily before releasing the next group.",
    ]
  }

  if (trade === "painting") {
    return [
      "Confirm rooms, included surfaces, paint supply, and access.",
      "Protect floors/furniture and mask adjacent finishes.",
      "Complete included prep, patching, and spot prime as needed.",
      "Paint, clean up, and walk the job before release.",
    ]
  }

  if (trade === "flooring") {
    return [
      "Confirm areas, material readiness, transitions, and access.",
      "Prep/demo and correct substrate issues included in written scope.",
      "Install flooring, transitions, and trim scope that is included.",
      "Clean up, inspect, and protect finished areas.",
    ]
  }

  return [
    "Confirm scope boundaries, access, materials, and site readiness.",
    "Complete prep and protection before production work.",
    "Perform the included trade work in the planned sequence.",
    "Clean up, inspect, and document follow-up items.",
  ]
}

function collectRiskText(args: BuildCrewPlanningReadbackArgs): string[] {
  return [
    ...(args.schedule?.rationale || []),
    ...(args.scopeXRay?.scheduleLogic?.reasons || []),
    ...(args.scopeXRay?.riskFlags || []),
    ...(args.scopeXRay?.needsConfirmation || []),
    ...(args.areaScopeBreakdown?.allowances?.scheduleDrivers || []),
    ...(args.priceGuardReview?.contractorRiskNotes || []),
  ].map(clean).filter(Boolean)
}

export function buildCrewPlanningReadback(
  args: BuildCrewPlanningReadbackArgs
): CrewPlanningReadback {
  const scopeText = clean(args.scopeText)
  const trade = detectTrade(args.selectedTrade, scopeText)
  const hotelMultiUnit = detectHotelMultiUnit(scopeText)
  const crewDayBasis =
    args.schedule?.crewDays != null && Number.isFinite(Number(args.schedule.crewDays))
      ? Number(args.schedule.crewDays)
      : args.scopeXRay?.scheduleLogic?.crewDays != null
        ? Number(args.scopeXRay.scheduleLogic.crewDays)
        : null
  const recommended = recommendedCrewSize({
    trade,
    scopeText,
    crewDays: crewDayBasis,
    hotelMultiUnit,
  })
  const riskText = collectRiskText(args)
  const riskBlob = normalize(riskText.join(" "))
  const bottlenecks: string[] = []
  const risks: string[] = []
  const basis: string[] = []
  let hasSchedulingRisks = false

  if (crewDayBasis != null) addUnique(basis, `Uses existing schedule basis of ${crewDayBasis} crew-day${crewDayBasis === 1 ? "" : "s"}.`, 5)
  else addUnique(basis, "Schedule crew-days are not confirmed yet; crew plan is a planning placeholder.", 5)
  if (args.schedule?.visits != null) addUnique(basis, `Existing schedule shows ${args.schedule.visits} site visit${args.schedule.visits === 1 ? "" : "s"}.`, 5)
  if (Number(args.pricingLabor || 0) > 0) {
    addUnique(basis, `Labor budget reference: $${Math.round(Number(args.pricingLabor)).toLocaleString()} (not a labor-hour change).`, 5)
  }
  if ((args.estimateRows || args.estimateSections || []).length) {
    addUnique(basis, "Uses existing estimate line/section structure as planning context only.", 5)
  }

  if (args.scopeSignals?.needsReturnVisit || Number(args.schedule?.visits || 0) > 1) {
    addUnique(risks, "Return trip or multi-visit sequencing may affect crew availability.", 6)
    hasSchedulingRisks = true
  }
  if (/\b(dry|drying|cure|curing|grout|mud|compound|primer|coat)\b/.test(riskBlob)) {
    addUnique(risks, "Dry time, cure time, or coat sequencing may create waiting time.", 6)
    hasSchedulingRisks = true
  }
  if (/\b(access|occupied|phase|staging|elevator|parking|room release|corridor)\b/.test(riskBlob) || hotelMultiUnit) {
    addUnique(bottlenecks, "Access, staging, room release, or occupied-space constraints may control production speed.", 6)
    hasSchedulingRisks = true
  }
  if (/\b(exclude|excluded|by others|owner supplied|customer supplied|existing to remain|protection only|coordination only)\b/i.test(scopeText)) {
    addUnique(risks, "Boundary/by-others/owner-supplied items stay review-only and should not be added to crew scope.", 6)
  }
  if (hotelMultiUnit) {
    addUnique(bottlenecks, "Repeated rooms need a room-release plan, material staging, and punch follow-up tracking.", 6)
    addUnique(risks, "Plan/repeated-room signals are planning support only, not measured takeoff authority.", 6)
    hasSchedulingRisks = true
  }
  if (riskText.length === 0 && risks.length === 0) {
    addUnique(risks, "Confirm access, included surfaces, materials, and measured quantities before relying on the crew plan.", 6)
  }

  return {
    recommendedCrewSize: recommended,
    crewDayBasis,
    durationRange: buildDurationRange(args.schedule),
    options: buildOptions(crewDayBasis, recommended),
    sequence: buildSequence(trade, hotelMultiUnit),
    bottlenecks,
    risks,
    basis,
    estimatorOnly: true,
    affectsPricing: false,
    hasSchedulingRisks,
  }
}
