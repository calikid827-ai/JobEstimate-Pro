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

export type CrewDailyPlanItem = {
  label: string
  crewSize: number | null
  tasks: string[]
  reminders: string[]
  risks: string[]
  guidanceOnly: true
}

export type CrewPlanningReadback = {
  recommendedCrewSize: number | null
  crewDayBasis: number | null
  durationRange: string | null
  options: CrewPlanOption[]
  dailyPlan: CrewDailyPlanItem[]
  dailyPlanNotes: string[]
  dailyPlanConfidence: "placeholder" | "schedule_based" | "risk_based"
  sequence: string[]
  bottlenecks: string[]
  risks: string[]
  basis: string[]
  planningNotes: string[]
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
  return /\b(hotel|motel|multi[-\s]?unit|units?|guest\s*rooms?|corridors?|floor[-\s]?by[-\s]?floor|floors?\s+\d+(?:\s*[-–]\s*\d+)?|room\s+release|rooms?\s+released|occupied\s+rooms?|unit stack)\b/i.test(
    scopeText
  )
}

function stripProtectionOnlyFlooringContext(scopeText: string): string {
  return clean(scopeText).replace(
    /\b(protect(?:s|ed|ing|ion)?|cover(?:ed|ing)?|drop\s+cloths?|floor\s+protection)\b.{0,80}\b(flooring|floors?|floor)\b|\b(flooring|floors?|floor)\b.{0,80}\b(protect(?:s|ed|ing|ion)?|cover(?:ed|ing)?|drop\s+cloths?|floor\s+protection)\b/gi,
    " "
  )
}

function stripPaintingElectricalPrepContext(scopeText: string): string {
  return clean(scopeText).replace(
    /\b(mask(?:ed|ing)?(?:\s+tape)?|protect(?:s|ed|ing|ion)?|cover(?:s|ed|ing)?|tape)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?|outlets?|switches?|electrical\s+fixtures?|light\s+fixtures?)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?|outlets?|switches?|electrical\s+fixtures?|light\s+fixtures?)\b.{0,100}\b(mask(?:ed|ing)?|protect(?:ed|ing|ion)?|cover(?:ed|ing)?|tape|to\s+remain|remain)\b|\b(remov(?:e|ed|al)?|removal)\b.{0,40}\b(reinstall(?:ed|ation|ing)?|reinstallation)\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(paint|painting|painted)\b|\b(remov(?:e|ed|al)?|removal)\b\s*\/\s*\b(reinstall(?:ed|ation|ing)?|reinstallation)\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(paint|painting|painted)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\b(remov(?:e|ed|al)?|removal|reinstall(?:ed|ation|ing)?|reinstallation)\b.{0,80}\b(reinstall(?:ed|ation|ing)?|reinstallation|remov(?:e|ed|al)?|removal)\b.{0,120}\b(paint|painting|painted)\b/gi,
    " "
  )
}

function stripDrywallPaintingPrepContext(scopeText: string): string {
  return clean(scopeText).replace(
    /\b(?:paint|painting|coats?)\b.{0,120}\b(?:over\s+)?(?:standard|existing|paintable|previously\s+painted)?\s*(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b|\b(?:standard|existing|paintable|previously\s+painted|prepared)?\s*(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b.{0,120}\b(?:paint|painting|painted|receive\s+paint|coats?)\b|\b(?:light\s+sanding\s+and\s+)?patching\s+(?:of\s+)?minor\s+(?:drywall|sheetrock|gypsum)\s+imperfections\b.{0,120}\b(?:paint\s+adhesion|painting|paint|coats?)\b|\b(?:assumes?|existing|standard)\b.{0,80}\b(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b.{0,160}\b(?:without|no|not)\b.{0,80}\b(?:extensive\s+)?(?:demolition|repairs?|repair\s+work|replacement|major\s+repairs?)\b/gi,
    " "
  )
}

function detectTypedTradeCategories(scopeText: string): string[] {
  const text = normalize(
    stripDrywallPaintingPrepContext(stripPaintingElectricalPrepContext(stripProtectionOnlyFlooringContext(scopeText)))
  )
  const trades: string[] = []
  const add = (trade: string, pattern: RegExp) => {
    if (pattern.test(text) && !trades.includes(trade)) trades.push(trade)
  }

  add("painting", /\bpaint|painting|painter|primer|prime|coats?\b/)
  add(
    "flooring",
    /\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|level(?:ing)?)\s+(?:\w+\s+){0,3}(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\b|\b(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\s+(?:\w+\s+){0,3}(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|level(?:ing)?)\b|\bflooring\s+demo(?:lition)?\b|\bdemo(?:lition)?\s+of\s+flooring\b|\bunderlayment|transitions?\b/
  )
  add("electrical", /\b(electrical|outlets?|receptacles?|switches?|light\s+fixtures?|electrical\s+fixtures?|lighting|wiring|circuits?|breakers?)\b/)
  add("drywall", /\b(drywall|sheetrock|skim\s+coat|texture\s+match|orange\s+peel|knockdown|finish\s+level|level\s+[345])\b/)
  add("bathroom/tile", /\b(tile|tiling|grout|waterproofing|waterproof|backer\s*board|cement\s*board|shower\s+pan|bathroom)\b/)
  add("plumbing", /\b(plumbing|plumber|toilets?|faucets?|sinks?|drains?|supply\s+lines?|water\s+lines?|valves?)\b/)

  return trades
}

function buildPlanningNotes(scopeText: string): string[] {
  const trades = detectTypedTradeCategories(scopeText)
  if (trades.length < 2) return []

  return [
    "Typed scope includes multiple trades. Crew plan is planning guidance only; confirm sequencing, access, and trade boundaries.",
  ]
}

function detectTrade(selectedTrade: BuildCrewPlanningReadbackArgs["selectedTrade"], scopeText: string): string {
  const selected = normalize(selectedTrade)
  const text = normalize(scopeText)
  const inferFromScope = () => {
    if (/\bpaint|painting|painter|primer|prime|coats?\b/.test(text)) return "painting"
    if (/\bdrywall|sheetrock|patch|texture\b/.test(text)) return "drywall"
    if (/\bfloor|lvp|tile|carpet|laminate\b/.test(text)) return "flooring"
    if (/\belectrical|outlet|switch|fixture|lighting\b/.test(text)) return "electrical"
    if (/\bplumbing|toilet|sink|faucet|drain\b/.test(text)) return "plumbing"
    return "general"
  }
  if (selected === "general" || selected === "general renovation" || selected === "general_renovation") {
    return inferFromScope()
  }
  if (selected) return selected
  return inferFromScope()
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
  if (schedule?.visits != null && Number(schedule.visits) > 0) {
    return `${schedule.visits} visit${schedule.visits === 1 ? "" : "s"} shown; work days need confirmation`
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

function buildDailyPlan(args: {
  trade: string
  scopeText: string
  schedule?: Schedule | null
  recommendedCrewSize: number | null
  hotelMultiUnit: boolean
  planningNotes: string[]
  riskText: string[]
}): {
  dailyPlan: CrewDailyPlanItem[]
  dailyPlanNotes: string[]
  dailyPlanConfidence: "placeholder" | "schedule_based" | "risk_based"
} {
  const text = normalize(args.scopeText)
  const riskBlob = normalize(args.riskText.join(" "))
  const hasReturnVisit =
    /\b(return|next\s+day|second\s+coat|dry\s*time|drying|cure|curing)\b/.test(text) ||
    /\b(return|multi[-\s]?visit|dry\s*time|drying|cure|curing|coat sequencing)\b/.test(riskBlob) ||
    Number(args.schedule?.visits || 0) > 1
  const crewSize = args.recommendedCrewSize
  const notes = ["Daily plan is estimator guidance only; confirm with the crew lead and site conditions before scheduling."]
  const confidence: "placeholder" | "schedule_based" | "risk_based" =
    args.schedule?.crewDays != null || args.schedule?.visits != null
      ? "schedule_based"
      : args.riskText.length > 0
        ? "risk_based"
        : "placeholder"
  const withTradeBoundaryReminder = (reminders: string[]) => {
    if (args.planningNotes.length > 0) {
      addUnique(reminders, "Typed scope includes multiple trades; confirm sequencing, access, and trade boundaries.", 5)
    }
    return reminders
  }

  if (args.hotelMultiUnit) {
    return {
      dailyPlan: [
        {
          label: "Release / Staging",
          crewSize,
          tasks: [
            "Confirm room/floor release plan with GC or site lead.",
            "Stage materials, protection, and access path before production starts.",
          ],
          reminders: ["Use rolling groups of rooms/areas; do not treat this as measured takeoff authority."],
          risks: ["Room release, elevator access, staging, and occupied-space constraints can control production speed."],
          guidanceOnly: true,
        },
        {
          label: "Rolling Production",
          crewSize,
          tasks: [
            "Run prep team ahead of finish team.",
            "Complete paint/finish work by released room group or floor.",
          ],
          reminders: ["Track started, finished, and blocked rooms daily."],
          risks: ["Dry time, access changes, or late room release can break the production rhythm."],
          guidanceOnly: true,
        },
        {
          label: "Punch / Release",
          crewSize,
          tasks: [
            "Punch completed rooms or areas before release.",
            "Clean up, remove protection, and document blocked follow-up items.",
          ],
          reminders: ["Confirm turnover expectations before releasing each group."],
          risks: ["Punch follow-up can stack up if room groups are released too quickly."],
          guidanceOnly: true,
        },
      ],
      dailyPlanNotes: notes,
      dailyPlanConfidence: confidence,
    }
  }

  if (args.trade === "painting" && hasReturnVisit) {
    return {
      dailyPlan: [
        {
          label: "Visit 1",
          crewSize,
          tasks: [
            "Confirm rooms, included surfaces, access, materials, and paint supply.",
            "Protect floors/furniture and mask adjacent finishes.",
            "Complete included prep, patching, spot prime, and first coat.",
          ],
          reminders: withTradeBoundaryReminder(["Confirm dry time before scheduling the return visit."]),
          risks: ["Dry time or coat sequencing may create waiting time."],
          guidanceOnly: true,
        },
        {
          label: "Visit 2",
          crewSize,
          tasks: [
            "Apply second coat after dry-time confirmation.",
            "Complete touchups, cleanup, and walkthrough.",
          ],
          reminders: withTradeBoundaryReminder(["Confirm customer access before the return visit."]),
          risks: ["Return-trip timing depends on site access and actual drying conditions."],
          guidanceOnly: true,
        },
      ],
      dailyPlanNotes: notes,
      dailyPlanConfidence: confidence,
    }
  }

  if (args.trade === "painting") {
    return {
      dailyPlan: [
        {
          label: args.schedule?.visits && args.schedule.visits > 1 ? "Visit 1" : "Day 1",
          crewSize,
          tasks: [
            "Confirm rooms, included surfaces, access, materials, and paint supply.",
            "Protect floors/furniture and mask adjacent finishes.",
            "Complete included prep, patching, and spot prime as needed.",
            "Paint, clean up, and walk the job before release.",
          ],
          reminders: withTradeBoundaryReminder(["Treat floor protection and masking as painting prep, not added trade scope."]),
          risks: args.planningNotes.length > 0
            ? ["Mixed typed scope needs estimator sequencing review before crew dispatch."]
            : [],
          guidanceOnly: true,
        },
      ],
      dailyPlanNotes: notes,
      dailyPlanConfidence: confidence,
    }
  }

  return {
    dailyPlan: [
      {
        label: args.schedule?.visits && args.schedule.visits > 1 ? "Visit 1" : "Planning Day",
        crewSize,
        tasks: [
          "Confirm scope boundaries, access, materials, and site readiness.",
          "Complete prep and protection before production work.",
          "Perform included work, then clean up and document follow-up items.",
        ],
        reminders: withTradeBoundaryReminder(["Confirm this plan against the written scope before dispatch."]),
        risks: args.planningNotes.length > 0 ? ["Mixed typed scope needs trade-boundary review."] : [],
        guidanceOnly: true,
      },
    ],
    dailyPlanNotes: notes,
    dailyPlanConfidence: confidence,
  }
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
  const planningNotes = buildPlanningNotes(scopeText)
  const dailyPlanReadback = buildDailyPlan({
    trade,
    scopeText,
    schedule: args.schedule,
    recommendedCrewSize: recommended,
    hotelMultiUnit,
    planningNotes,
    riskText,
  })
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
    dailyPlan: dailyPlanReadback.dailyPlan,
    dailyPlanNotes: dailyPlanReadback.dailyPlanNotes,
    dailyPlanConfidence: dailyPlanReadback.dailyPlanConfidence,
    sequence: buildSequence(trade, hotelMultiUnit),
    bottlenecks,
    risks,
    basis,
    planningNotes,
    estimatorOnly: true,
    affectsPricing: false,
    hasSchedulingRisks,
  }
}
