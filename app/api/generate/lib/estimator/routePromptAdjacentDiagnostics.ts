import { getIncludedScopeText } from "../priceguard/scopeSplitter"
import type {
  EstimatorScopeFacts,
  EstimatorScopeTrade,
} from "../../../../app/lib/estimator-scope-facts"

export type RoutePromptComplexityProfile = {
  class: "simple" | "medium" | "complex" | "remodel"
  requireDaysBasis: boolean
  permitLikely: boolean
  multiPhase: boolean
  multiTrade: boolean
  hasDemo: boolean
  notes: string[]
  minCrewDays: number
  maxCrewDays: number
  minMobilization: number
  minSubs: number
  crewSizeMin: number
  crewSizeMax: number
  hoursPerDayEffective: number
  minPhaseVisits: number
}

export type RoutePromptEstimateBasis = {
  units: string[]
  quantities?: Record<string, number | undefined>
  crewDays?: number
}

export type RoutePromptTradeStack = {
  primaryTrade: string
  trades: string[]
  activities: string[]
  signals: string[]
  isMultiTrade: boolean
}

function normalizeTradeForScopeFacts(trade: string): EstimatorScopeTrade | null {
  const value = String(trade || "").trim().toLowerCase().replace(/[_-]+/g, " ")
  if (!value) return null

  if (/\bpaint(ing)?\b/.test(value)) return "painting"
  if (/\bdrywall\b|\bpatch(ing)?\b|\btexture\b|\bskim\b/.test(value)) return "drywall"
  if (/\bfloor(ing)?\b|\blvp\b|\bvinyl\b|\blaminate\b|\bhardwood\b|\bcarpet\b/.test(value)) return "flooring"
  if (/\belectrical\b|\belectric\b|\boutlet\b|\bgfci\b|\blight\b|\bfixture\b/.test(value)) return "electrical"
  if (/\bplumb(ing)?\b|\bfaucet\b|\btoilet\b|\bdrain\b|\bsupply\b/.test(value)) return "plumbing"
  if (/\bbath(room)?\b|\btile\b|\bshower\b|\bwaterproof\b|\bgrout\b/.test(value)) return "bathroom_tile"
  if (/\bwall\s*covering\b|\bwallcovering\b|\bwallpaper\b/.test(value)) return "wallcovering"
  if (/\bcarpent(ry|er)\b|\bbaseboard\b|\btrim\b|\bcasing\b|\bcrown\b|\bmillwork\b/.test(value)) return "carpentry"
  if (/\bdemo(lition)?\b|\btear\s*out\b|\bremoval\b/.test(value)) return "demolition"
  if (/\bglass\b|\bshower\s*door\b|\benclosure\b/.test(value)) return "glass"
  if (/\bfurniture\b/.test(value)) return "furniture_moving"

  return null
}

function includedCoordinationTrades(
  stack: RoutePromptTradeStack,
  facts: EstimatorScopeFacts | null | undefined
): string[] {
  const stackTrades = stack.trades
    .filter(Boolean)
    .filter((trade) => trade !== stack.primaryTrade)

  if (!facts) return stackTrades.slice(0, 3)

  const included = new Set(facts.includedTrades)
  const includedStackTrades = stackTrades.filter((trade) => {
    const normalized = normalizeTradeForScopeFacts(trade)
    return !!normalized && included.has(normalized)
  })

  const primaryTrade = normalizeTradeForScopeFacts(stack.primaryTrade)
  const primaryIncluded = !!primaryTrade && included.has(primaryTrade)
  const includedTradeCount = new Set([
    ...(primaryIncluded ? [primaryTrade] : []),
    ...includedStackTrades
      .map((trade) => normalizeTradeForScopeFacts(trade))
      .filter((trade): trade is EstimatorScopeTrade => !!trade),
  ]).size

  if (!facts.trueMixedTrades && includedTradeCount < 2) return []

  return includedStackTrades.slice(0, 3)
}

export function cleanupDocumentTypeLead(text: string) {
  return String(text || "")
    .replace(
      /^This\s+Change Order\s*\/\s*Estimate\s*\/\s*Estimate\b/i,
      "This Change Order / Estimate"
    )
    .replace(/^This\s+Estimate\s*\/\s*Estimate\b/i, "This Estimate")
    .replace(/^This\s+Change Order\s*\/\s*Change Order\b/i, "This Change Order")
    .replace(
      /^This\s+Change Order\s*\/\s*Estimate\s*\/\s*Change Order\b/i,
      "This Change Order / Estimate"
    )
    .trim()
}

export function syncDescriptionLeadToDocumentType(
  text: string,
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
) {
  let d = String(text || "").trim()
  if (!d) return d

  d = d.replace(
    /^This\s+(?:Change Order \/ Estimate|Change Order|Estimate)(?:\s*\/\s*(?:Change Order \/ Estimate|Change Order|Estimate))?\b/i,
    `This ${documentType}`
  )

  return cleanupDocumentTypeLead(d)
}

export function sentenceParts(value: string) {
  return String(value || "")
    .split(/(?<=[.!?;])\s+|\n+|\s+\b(?:and\s+)?(?=excludes?|excluding|excluded|does not include|does not cover|by others|without)\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function isExcludedPatchTextureContext(text: string) {
  return /\b(excludes?|excluded|excluding|not included|does not include|does not cover|by others|without)\b.{0,90}\b(texture|orange\s*peel|knockdown|skim\s*coat|patch|patching|drywall\s*repair|drywall\s*patch|mudding|tape\s*and\s*mud)\b/i.test(text) ||
    /\b(texture|orange\s*peel|knockdown|skim\s*coat|patch|patching|drywall\s*repair|drywall\s*patch|mudding|tape\s*and\s*mud)\b.{0,90}\b(excluded|not included|does not include|does not cover|by others|schedule consideration|dry time|drying time)\b/i.test(text)
}

export function hasIncludedPatchTextureSignal(scopeText: string) {
  return sentenceParts(scopeText).some((part) =>
    /\b(texture|orange\s*peel|knockdown|skim\s*coat|patch|patching|drywall\s*repair|drywall\s*patch|mudding|tape\s*and\s*mud)\b/i.test(part) &&
    !isExcludedPatchTextureContext(part)
  )
}

export function inferPhaseVisitsFromSignals(args: {
  scopeText: string
  includedScopeText?: string
  cp: RoutePromptComplexityProfile | null
}): { visits: number; phases: string[] } {
  const s = ((args.includedScopeText ?? getIncludedScopeText(args.scopeText)) || args.scopeText || "").toLowerCase()
  const cp = args.cp

  const phases: string[] = []

  const hasDemo =
    /\b(demo|demolition|tear\s*out|remove\s+existing|haul\s*away|dispose|dump)\b/.test(s)

  const hasRoughOrRelocate =
    /\b(rough[-\s]*in|relocat(e|ing|ion)|move\s+(drain|supply|valve|line)|new\s+circuit|run\s+new\s+wire|trench)\b/.test(s)

  const hasWetArea =
    /\b(shower|tub|pan|curb|waterproof|membrane|red\s*guard|cement\s*board|durock|hardie(backer)?|thinset|mud\s*bed)\b/.test(s)

  const hasPermit =
    /\b(permit|inspection|inspector|code|required|city)\b/.test(s) ||
    /\b(panel|service\s*upgrade|meter|subpanel)\b/.test(s)

  const hasFlooring =
    /\b(floor|flooring|lvp|vinyl\s*plank|laminate|hardwood|engineered\s*wood|carpet|tile\s+floor)\b/.test(s)

  const hasBaseboardOrTrim =
    /\b(baseboard|baseboards|base\s*board|trim|shoe\s*mold|quarter\s*round|casing)\b/.test(s)

  const hasTextureOrPatch =
    hasIncludedPatchTextureSignal(args.scopeText)

  const hasPaint =
    /\b(paint|painting|prime|primer|repaint)\b/.test(s)

  const flooringBaseboardSequence = hasFlooring && hasBaseboardOrTrim
  const texturePaintSequence = hasTextureOrPatch && hasPaint
  const flooringPaintSequence = hasFlooring && hasPaint

  if (hasDemo) phases.push("demolition/removal")
  if (hasRoughOrRelocate) phases.push("rough-in/relocation")
  if (hasPermit) phases.push("permit/inspection coordination")
  if (hasWetArea) phases.push("wet-area sequencing/cure time")

  if (flooringBaseboardSequence) {
    phases.push("flooring before trim/baseboard")
  }

  if (texturePaintSequence) {
    phases.push("patch/texture dry time before paint")
  } else if (flooringPaintSequence) {
    phases.push("finish protection / flooring-paint coordination")
  }

  let visits = 1

  const hardSignals = [hasDemo, hasRoughOrRelocate, hasPermit, hasWetArea].filter(Boolean).length
  const finishSequencing =
    flooringBaseboardSequence || texturePaintSequence || flooringPaintSequence

  if (hardSignals >= 1 || finishSequencing) {
    visits = 2
  }

  if (
    (hasDemo && hasRoughOrRelocate) ||
    (hasWetArea && (hasDemo || hasRoughOrRelocate)) ||
    (flooringBaseboardSequence && texturePaintSequence) ||
    (hasFlooring && hasBaseboardOrTrim && hasTextureOrPatch) ||
    (hasFlooring && hasTextureOrPatch && hasPaint)
  ) {
    visits = 3
  }

  if (hasPermit && (hasDemo || hasRoughOrRelocate || hasWetArea)) {
    visits = Math.max(visits, 3)
  }

  if (cp?.minPhaseVisits) {
    visits = Math.max(visits, cp.minPhaseVisits)
  }

  return {
    visits,
    phases: Array.from(new Set(phases)),
  }
}

function workdaysToElapsedDays(workdays: number, workDaysPerWeek: 5 | 6 | 7): number {
  const wd = Math.max(1, Math.round(workdays))
  const w = workDaysPerWeek

  if (w === 7) return wd

  const weeksTouched = Math.ceil(wd / w)
  const offDaysPerWeek = 7 - w

  return wd + (weeksTouched - 1) * offDaysPerWeek
}

export function estimateCalendarDaysRange(args: {
  crewDays: number
  cp: RoutePromptComplexityProfile | null
  trade: string
  tradeStack: RoutePromptTradeStack | null
  scopeText: string
  includedScopeText?: string
  workDaysPerWeek: 5 | 6 | 7
}): { minDays: number; maxDays: number; rationale: string[] } {
  const crewDays = Math.max(0.5, Number(args.crewDays || 0))
  const cp = args.cp
  const trade = (args.trade || "").toLowerCase()
  const s = ((args.includedScopeText ?? getIncludedScopeText(args.scopeText)) || args.scopeText || "").toLowerCase()
  const stack = args.tradeStack
  const workDaysPerWeek = args.workDaysPerWeek

  const rationale: string[] = []

  let minWorkdays = Math.ceil(crewDays)
  let maxWorkdays = Math.ceil(crewDays * 1.35)

  const { visits } = inferPhaseVisitsFromSignals({
    scopeText: args.scopeText,
    includedScopeText: args.includedScopeText,
    cp,
  })

  if (visits >= 2) { maxWorkdays += 1; rationale.push("multi-visit sequencing") }
  if (visits >= 3) { maxWorkdays += 1; rationale.push("multiple return trips") }

  const wetArea =
    /\b(shower|tub|pan|curb|waterproof|membrane|red\s*guard|thinset|grout|mud\s*bed)\b/.test(s)
  if (wetArea) {
    minWorkdays += 1
    maxWorkdays += 3
    rationale.push("wet-area cure/set time")
  }

  const drywallSignals =
    hasIncludedPatchTextureSignal(args.scopeText)
  if (drywallSignals) {
    minWorkdays += 1
    maxWorkdays += 2
    rationale.push("drywall dry/return")
  }

  const paintSignals = /\b(paint|painting|prime|primer|2\s*coats|two\s*coats|coat)\b/.test(s)
  if (trade === "painting" && paintSignals) {
    maxWorkdays += 1
    rationale.push("coat/dry time")
  }

  const flooringSignals = /\b(lvp|vinyl\s*plank|laminate|hardwood|engineered\s*wood)\b/.test(s)
  if (flooringSignals) {
    maxWorkdays += 1
    rationale.push("flooring acclimation")
  }

  if (cp?.permitLikely) {
    minWorkdays += 1
    maxWorkdays += 4
    rationale.push("permit/inspection scheduling")
  }

  if (stack?.isMultiTrade || cp?.multiTrade) {
    maxWorkdays += 2
    rationale.push("multi-trade coordination")
  }

  if (cp?.class === "complex") maxWorkdays += 1
  if (cp?.class === "remodel") maxWorkdays += 2

  minWorkdays = Math.max(1, minWorkdays)
  maxWorkdays = Math.max(minWorkdays, maxWorkdays)

  if (crewDays <= 1) {
    minWorkdays = 1
    maxWorkdays = Math.min(maxWorkdays, 3)
  }

  const minDays = workdaysToElapsedDays(minWorkdays, workDaysPerWeek)
  const maxDays = workdaysToElapsedDays(maxWorkdays, workDaysPerWeek)

  return { minDays, maxDays: Math.max(minDays, maxDays), rationale }
}

export function appendTradeCoordinationSentence(
  desc: string,
  stack: RoutePromptTradeStack | null,
  scopeFacts?: EstimatorScopeFacts | null
): string {
  let d = (desc || "").trim()
  if (!d) return d

  if (!stack?.isMultiTrade) return d

  const alreadyMentionsCoordination =
    /\bcoordination\b/i.test(d) ||
    /\bmulti[-\s]?trade\b/i.test(d) ||
    /\bmultiple trades\b/i.test(d)

  if (alreadyMentionsCoordination) return d

  const list = includedCoordinationTrades(stack, scopeFacts)

  if (list.length === 0) return d

  const phaseHint =
    Array.isArray(stack.activities) && stack.activities.length > 0
      ? ` with sequencing for ${stack.activities.slice(0, 2).join(" and ")}`
      : ""

  return (
    d +
    ` The scope includes coordination across ${list.join(", ")} activities${phaseHint} to maintain sequencing with existing conditions.`
  ).trim()
}

export function appendPermitCoordinationSentence(desc: string, cp: RoutePromptComplexityProfile | null): string {
  let d = (desc || "").trim()
  if (!d) return d
  if (!cp?.permitLikely) return d

  if (/\bpermit\b/i.test(d) || /\binspection\b/i.test(d)) return d

  return (d +
    " Scope includes allowance for permit/inspection coordination, scheduling, and required return visits as applicable.").trim()
}

export function appendExecutionPlanSentence(args: {
  description: string
  documentType: string
  trade: string
  cp: RoutePromptComplexityProfile | null
  basis: RoutePromptEstimateBasis | null
  scopeText: string
  includedScopeText?: string
  tradeStack?: RoutePromptTradeStack | null
  workDaysPerWeek?: 5 | 6 | 7
}): string {
  let d = (args.description || "").trim()
  if (!d) return d

  d = syncDescriptionLeadToDocumentType(
    d,
    args.documentType as "Change Order" | "Estimate" | "Change Order / Estimate"
  )

  const cp = args.cp
  const b = args.basis
  const { visits, phases } = inferPhaseVisitsFromSignals({
    scopeText: args.scopeText,
    includedScopeText: args.includedScopeText,
    cp,
  })

  const hasDays = !!(b && Array.isArray(b.units) && b.units.includes("days"))
  const cd = Number(b?.crewDays ?? b?.quantities?.days ?? 0)
  if (!hasDays || !Number.isFinite(cd) || cd <= 0) return d

  const rounded = Math.round(cd * 2) / 2
  const dayWord = rounded === 1 ? "day" : "days"

  const visitText = visits >= 2 ? ` across approximately ${visits} site visit(s)` : ""
  const phaseText =
    phases.length > 0 ? ` with sequencing for ${phases.slice(0, 3).join(", ")}` : ""

  const cal = estimateCalendarDaysRange({
    crewDays: rounded,
    cp,
    trade: args.trade,
    tradeStack: args.tradeStack ?? null,
    scopeText: args.scopeText,
    includedScopeText: args.includedScopeText,
    workDaysPerWeek: args.workDaysPerWeek ?? 5,
  })

  const sched = args.workDaysPerWeek ?? 5
  const scheduleText = sched === 5 ? " (5-day workweek)" : sched === 6 ? " (6-day workweek)" : " (7-day workweek)"
  const calText =
    cal.minDays === cal.maxDays
      ? `${cal.minDays} calendar day(s)`
      : `${cal.minDays}–${cal.maxDays} calendar day(s)`

  const sentence =
    ` Estimated duration: approximately ${rounded} crew-${dayWord}${visitText} (typically ${calText}${scheduleText})${phaseText}.`

  return (d + sentence).trim()
}
