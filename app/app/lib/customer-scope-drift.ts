import type { EstimateStructuredSection, ScopeXRay, UiTrade } from "./types"

type PlanTradeReadback = {
  trade?: string
  supportLevel?: "direct" | "reinforced" | "review" | string
}

type PlanIntelligenceLike = {
  detectedTrades?: string[]
  planReadback?: {
    tradeScopeReadback?: PlanTradeReadback[]
  } | null
} | null

type DriftTrade =
  | "electrical"
  | "plumbing"
  | "drywall"
  | "flooring"
  | "painting"
  | "bathroom_tile"
  | "demolition"
  | "carpentry"
  | "wallcovering"

type TradeRule = {
  id: DriftTrade
  label: string
  aliases: string[]
  mentionPattern: RegExp
  supportPattern: RegExp
}

export type CustomerScopeReviewWarning = {
  label: string
  message: string
  details?: string[]
}

export type CustomerScopeReviewGuard = {
  summary: string | null
  warnings: CustomerScopeReviewWarning[]
}

export type BuildCustomerScopeTradeDriftWarningArgs = {
  selectedTrade: UiTrade
  writtenScope: string
  resultText: string
  estimateSections: EstimateStructuredSection[] | null
  scopeXRay: ScopeXRay
  planIntelligence: PlanIntelligenceLike
}

const TRADE_RULES: TradeRule[] = [
  {
    id: "electrical",
    label: "electrical",
    aliases: ["electrical", "electrician"],
    mentionPattern:
      /\b(electrical|electrician|wiring|rewire|outlets?|receptacles?|switches?|circuits?|breakers?|electrical\s+panels?|lighting|light\s+fixtures?|can\s+lights?|recessed\s+lights?|recessed\s+lighting|rough[- ]?in|electrical\s+coordination|electrical\s+trade)\b/i,
    supportPattern:
      /\b(electrical|electrician|wiring|rewire|outlets?|receptacles?|switches?|circuits?|breakers?|electrical\s+panels?|lighting|light\s+fixtures?|can\s+lights?|recessed\s+lights?|recessed\s+lighting|rough[- ]?in)\b/i,
  },
  {
    id: "plumbing",
    label: "plumbing",
    aliases: ["plumbing", "plumber"],
    mentionPattern:
      /\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|drainage|valves?|toilets?|faucets?|sinks?|vanit(?:y|ies)|shower\s+valves?|tubs?|plumbing\s+rough[- ]?in|rough[- ]?in\s+plumbing)\b/i,
    supportPattern:
      /\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|drainage|valves?|toilets?|faucets?|sinks?|vanit(?:y|ies)|shower\s+valves?|tubs?|plumbing\s+rough[- ]?in|rough[- ]?in\s+plumbing)\b/i,
  },
  {
    id: "drywall",
    label: "drywall",
    aliases: ["drywall", "sheetrock", "gypsum"],
    mentionPattern:
      /\b(drywall|sheetrock|gypsum|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown)\b/i,
    supportPattern:
      /\b(drywall|sheetrock|gypsum|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown|\b\d+\s?(patches?|sheets?)\b)\b/i,
  },
  {
    id: "flooring",
    label: "flooring",
    aliases: ["flooring", "floor", "lvp", "laminate", "hardwood", "carpet"],
    mentionPattern:
      /\b(flooring|lvp|luxury\s+vinyl|laminate|hardwood|engineered\s+wood|carpet|underlayment|floor\s+installation|floor\s+install|transitions?)\b/i,
    supportPattern:
      /\b(flooring|lvp|luxury\s+vinyl|laminate|hardwood|engineered\s+wood|carpet|underlayment|floor\s+installation|floor\s+install|transitions?|\b\d+(\.\d+)?\s?(sq\.?\s?ft|sf|square\s+feet)\b)\b/i,
  },
  {
    id: "painting",
    label: "painting",
    aliases: ["painting", "paint", "painter"],
    mentionPattern:
      /\b(painting|paint|painter|primer|prime|coats?|painted\s+(walls?|ceilings?|trim|doors?|cabinets?))\b/i,
    supportPattern:
      /\b(painting|paint|painter|primer|prime|coats?|painted\s+(walls?|ceilings?|trim|doors?|cabinets?))\b/i,
  },
  {
    id: "bathroom_tile",
    label: "bathroom/tile",
    aliases: ["bathroom_tile", "tile", "tiling"],
    mentionPattern:
      /\b(tile|tiling|grout|waterproofing|waterproof|backer\s*board|cement\s*board|shower\s+pan|mud\s+bed|tile\s+(shower|floor|walls?)|shower\s+tile|bathroom\s+tile)\b/i,
    supportPattern:
      /\b(tile|tiling|grout|waterproofing|waterproof|backer\s*board|cement\s*board|shower\s+pan|mud\s+bed|tile\s+(shower|floor|walls?)|shower\s+tile|bathroom\s+tile)\b/i,
  },
  {
    id: "demolition",
    label: "demolition",
    aliases: ["demolition", "demo"],
    mentionPattern: /\b(demolition|demo|tear[- ]?out|remove\s+existing|haul[- ]?off|haul\s+away)\b/i,
    supportPattern: /\b(demolition|demo|tear[- ]?out|remove\s+existing|haul[- ]?off|haul\s+away)\b/i,
  },
  {
    id: "carpentry",
    label: "carpentry",
    aliases: ["carpentry", "carpenter", "framing", "trim", "baseboard", "baseboards"],
    mentionPattern:
      /\b(carpentry|carpenter|framing|blocking|baseboards?|casing|crown|trim\s+install|door\s+(install|replacement)|shelving|millwork)\b/i,
    supportPattern:
      /\b(carpentry|carpenter|framing|blocking|baseboards?|casing|crown|trim\s+install|door\s+(install|replacement)|shelving|millwork|\b\d+(\.\d+)?\s?(lf|linear\s+feet|linear\s+foot)\b)\b/i,
  },
  {
    id: "wallcovering",
    label: "wallcovering",
    aliases: ["wallcovering", "wallpaper", "wall covering"],
    mentionPattern:
      /\b(wallcovering|wall\s+covering|wallpaper|vinyl\s+wallcovering|grasscloth|wallcovering\s+adhesive|pattern\s+repeat|wallcovering\s+seams?)\b/i,
    supportPattern:
      /\b(wallcovering|wall\s+covering|wallpaper|vinyl\s+wallcovering|grasscloth|wallcovering\s+adhesive|pattern\s+repeat|wallcovering\s+seams?)\b/i,
  },
]

const EXCLUDED_TRADE_PATTERN =
  /\b(excludes?|excluded|not\s+included|not\s+part\s+of|by\s+others|by\s+owner|owner\s+provided|owner\s+supplied|separate\s+contractor|separate\s+trade|NIC)\b/i

const SUPPORTED_REMOVAL_TRADE_PATTERN =
  /\b(flooring|lvp|laminate|hardwood|carpet|tile|tiling|paint|painting|drywall|sheetrock|baseboards?|trim|carpentry|wallcovering|wallpaper)\b/i

const ELECTRICAL_SYSTEM_PATTERN =
  /\b(electrical\s+rough[- ]?in|rough[- ]?in\s+electrical|wiring|rewire|circuits?|breakers?|electrical\s+panels?|outlets?|receptacles?|switches?)\b/i

const PLUMBING_SYSTEM_PATTERN =
  /\b(plumbing\s+rough[- ]?in|rough[- ]?in\s+plumbing|water\s+lines?|supply\s+lines?|drains?|drainage|waste\s+lines?|valves?)\b/i

const WALL_FLOOR_REPAIR_PATTERN =
  /\b(wall\s+repairs?|floor\s+repairs?|flooring\s+repairs?|drywall\s+repairs?|sheetrock\s+repairs?|carpentry\s+repairs?)\b/i

const PAINTING_ADJACENT_DRYWALL_PATTERN =
  /\b(drywall\s+repairs?|sheetrock\s+repairs?|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown)\b/i

const MINOR_PAINT_PATCH_PATTERN =
  /\b(minor|nail[- ]?hole|small)\b.{0,40}\b(patch(?:ing|es)?|repair(?:s)?)\b|\b(patch(?:ing|es)?|repair(?:s)?)\b.{0,40}\b(minor|nail[- ]?hole|small)\b/i

const FLOORING_ADJACENT_PATTERN =
  /\b(baseboard\s+(replacement|replace|install|installation|repair)|baseboards?\s+(replacement|replace|install|installation|repair)|painting\s+(walls?|trim|baseboards?)|paint\s+(walls?|trim|baseboards?)|carpentry\s+work|trim\s+install|casing|crown)\b/i

const NON_SCOPE_CONTEXT_PATTERN =
  /\b(protect(?:ing|ion)?|safeguard(?:ing)?|cover(?:ing)?|mask(?:ing)?|adjacent\s+finishes?|avoid(?:ing)?\s+interference|no\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination|work(?:ing)?\s+around|around\s+existing|existing\s+(?:flooring|floors?|baseboards?|trim|cabinetry|cabinets?|door\s+jambs?|closets?|transitions?))\b/i

const FLOORING_CONTEXT_ONLY_PATTERN =
  /\b(protect(?:ing|ion)?|safeguard(?:ing)?|cover(?:ing)?|work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference)\b.{0,80}\b(flooring|floors?|lvp|laminate|hardwood|carpet|transitions?)\b|\b(flooring|floors?|lvp|laminate|hardwood|carpet|transitions?)\b.{0,80}\b(protect(?:ing|ion)?|safeguard(?:ing)?|cover(?:ing)?|work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference)\b/i

const FLOORING_TRUE_WORK_PATTERN =
  /\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|level(?:ing)?)\s+(?:\w+\s+){0,3}(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\b|\b(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\s+(?:\w+\s+){0,3}(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|level(?:ing)?)\b|\bunderlayment\b/i

const ELECTRICAL_CONTEXT_ONLY_PATTERN =
  /\b(no\s+interference|avoid(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination)\b.{0,80}\b(electrical|electrician|wiring|outlets?|switches?|lighting|fixtures?)\b|\b(electrical|electrician|wiring|outlets?|switches?|lighting|fixtures?)\b.{0,80}\b(no\s+interference|avoid(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination)\b/i

const PLUMBING_CONTEXT_ONLY_PATTERN =
  /\b(no\s+interference|avoid(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination)\b.{0,80}\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|valves?|fixtures?)\b|\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|valves?|fixtures?)\b.{0,80}\b(no\s+interference|avoid(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination)\b/i

const PLUMBING_TRUE_WORK_PATTERN =
  /\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|rough[- ]?in|plumb(?:ing)?|connect(?:ion|ing)?|reconnect(?:ion|ing)?|valves?|drains?|supply\s+lines?|water\s+lines?)\b.{0,60}\b(plumbing|plumber|fixtures?|toilets?|faucets?|sinks?|vanit(?:y|ies)|showers?|tubs?)\b|\b(plumbing|plumber|fixtures?|toilets?|faucets?|sinks?|vanit(?:y|ies)|showers?|tubs?)\b.{0,60}\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|rough[- ]?in|plumb(?:ing)?|connect(?:ion|ing)?|reconnect(?:ion|ing)?|valves?|drains?|supply\s+lines?|water\s+lines?)\b/i

const CARPENTRY_CONTEXT_ONLY_PATTERN =
  /\b(work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference|protect(?:ing|ion)?|safeguard(?:ing)?)\b.{0,100}\b(door\s+jambs?|closets?|transitions?|baseboards?|baseboard\s+finishes?|trim|cabinetry|cabinets?)\b|\b(door\s+jambs?|closets?|transitions?|baseboards?|baseboard\s+finishes?|trim|cabinetry|cabinets?)\b.{0,100}\b(work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference|protect(?:ing|ion)?|safeguard(?:ing)?)\b/i

const CARPENTRY_TRUE_WORK_PATTERN =
  /\b(baseboards?|casing|crown|trim|doors?|shelving|millwork|cabinetry|cabinets?)\s+(replacement|replace|install(?:ation|ing)?|repair(?:ing|s)?)\b|\b(replace(?:ment|ing)?|install(?:ation|ing)?|repair(?:ing|s)?)\s+(?:\w+\s+){0,2}(baseboards?|casing|crown|trim|doors?|shelving|millwork|cabinetry|cabinets?)\b|\b(framing|blocking|carpentry\s+work)\b/i

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function sentenceParts(value: string) {
  return String(value || "")
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function tradeMatches(rule: TradeRule, value: string) {
  const text = normalize(value)
  return rule.aliases.some((alias) => text.includes(alias)) || rule.supportPattern.test(text)
}

function selectedTradeSupports(rule: TradeRule, selectedTrade: UiTrade) {
  if (rule.id === "demolition") return false
  if (rule.id === "bathroom_tile") return selectedTrade === "bathroom_tile"
  return rule.aliases.includes(normalize(selectedTrade))
}

function planReadbackSupports(rule: TradeRule, planIntelligence: PlanIntelligenceLike) {
  return (
    planIntelligence?.planReadback?.tradeScopeReadback?.some(
      (item) =>
        tradeMatches(rule, item.trade || "") &&
        (item.supportLevel === "direct" || item.supportLevel === "reinforced")
    ) || false
  )
}

function pricedSectionsSupport(rule: TradeRule, estimateSections: EstimateStructuredSection[] | null) {
  if (rule.id === "demolition") return false
  return (estimateSections || []).some((section) => tradeMatches(rule, section.trade))
}

function writtenScopeSupports(rule: TradeRule, writtenScope: string) {
  return sentenceParts(writtenScope).some((part) => rule.supportPattern.test(part) && !EXCLUDED_TRADE_PATTERN.test(part))
}

function scopeXRaySupports(rule: TradeRule, scopeXRay: ScopeXRay) {
  return (scopeXRay?.detectedScope?.splitScopes || []).some(
    (item) => rule.supportPattern.test(item.scope || "") && !EXCLUDED_TRADE_PATTERN.test(item.scope || "")
  )
}

function isNormalSupportedRemoval(part: string, rule: TradeRule, args: BuildCustomerScopeTradeDriftWarningArgs) {
  if (rule.id !== "demolition") return false
  if (!SUPPORTED_REMOVAL_TRADE_PATTERN.test(part)) return false

  return TRADE_RULES.some(
    (candidate) =>
      candidate.id !== "demolition" &&
      candidate.supportPattern.test(part) &&
      isTradeSupported(candidate, args)
  )
}

function isNonScopeContextMention(part: string, rule: TradeRule) {
  if (!NON_SCOPE_CONTEXT_PATTERN.test(part)) return false

  if (rule.id === "flooring") {
    return FLOORING_CONTEXT_ONLY_PATTERN.test(part) && !FLOORING_TRUE_WORK_PATTERN.test(part)
  }
  if (rule.id === "electrical") {
    return ELECTRICAL_CONTEXT_ONLY_PATTERN.test(part) && !ELECTRICAL_SYSTEM_PATTERN.test(part)
  }
  if (rule.id === "plumbing") {
    return PLUMBING_CONTEXT_ONLY_PATTERN.test(part) && !PLUMBING_TRUE_WORK_PATTERN.test(part)
  }
  if (rule.id === "carpentry") {
    return CARPENTRY_CONTEXT_ONLY_PATTERN.test(part) && !CARPENTRY_TRUE_WORK_PATTERN.test(part)
  }

  return false
}

function hasActionableMention(rule: TradeRule, resultText: string, args: BuildCustomerScopeTradeDriftWarningArgs) {
  return sentenceParts(resultText).some((part) => {
    if (!rule.mentionPattern.test(part)) return false
    if (EXCLUDED_TRADE_PATTERN.test(part)) return false
    if (isNonScopeContextMention(part, rule)) return false
    if (rule.id === "bathroom_tile" && /\bbathrooms?\b/i.test(part) && !rule.supportPattern.test(part)) return false
    if (rule.id === "electrical" && /\bfixtures?\b/i.test(part) && !rule.supportPattern.test(part)) return false
    if (rule.id === "plumbing" && /\bfixtures?\b/i.test(part) && !rule.supportPattern.test(part)) return false
    if (isNormalSupportedRemoval(part, rule, args)) return false
    return true
  })
}

function isTradeSupported(rule: TradeRule, args: BuildCustomerScopeTradeDriftWarningArgs) {
  return (
    selectedTradeSupports(rule, args.selectedTrade) ||
    writtenScopeSupports(rule, args.writtenScope) ||
    pricedSectionsSupport(rule, args.estimateSections) ||
    scopeXRaySupports(rule, args.scopeXRay) ||
    planReadbackSupports(rule, args.planIntelligence)
  )
}

function formatTradeList(trades: string[]) {
  if (trades.length <= 1) return trades[0] || ""
  if (trades.length === 2) return `${trades[0]} and ${trades[1]}`
  return `${trades.slice(0, -1).join(", ")}, and ${trades[trades.length - 1]}`
}

function addWarning(warnings: CustomerScopeReviewWarning[], warning: CustomerScopeReviewWarning) {
  const key = `${warning.label} ${warning.message}`.toLowerCase()
  if (warnings.some((item) => `${item.label} ${item.message}`.toLowerCase() === key)) return
  warnings.push(warning)
}

function unsupportedTradeRules(args: BuildCustomerScopeTradeDriftWarningArgs) {
  return TRADE_RULES.filter(
    (rule) => hasActionableMention(rule, args.resultText, args) && !isTradeSupported(rule, args)
  )
}

function tradeExclusionConflict(rule: TradeRule, args: BuildCustomerScopeTradeDriftWarningArgs) {
  const writtenExcludesTrade = sentenceParts(args.writtenScope).some(
    (part) => EXCLUDED_TRADE_PATTERN.test(part) && rule.supportPattern.test(part)
  )
  if (!writtenExcludesTrade) return false

  if (rule.id === "electrical") {
    return sentenceParts(args.resultText).some(
      (part) => ELECTRICAL_SYSTEM_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
    )
  }
  if (rule.id === "plumbing") {
    return sentenceParts(args.resultText).some(
      (part) => PLUMBING_SYSTEM_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
    )
  }

  return hasActionableMention(rule, args.resultText, args)
}

function hasWallFloorRepairExclusionConflict(args: BuildCustomerScopeTradeDriftWarningArgs) {
  const writtenExcludesRepair = sentenceParts(args.writtenScope).some(
    (part) =>
      EXCLUDED_TRADE_PATTERN.test(part) &&
      /\b(wall|walls|floor|floors|flooring|drywall|sheetrock|carpentry|repair|repairs)\b/i.test(part)
  )

  return (
    writtenExcludesRepair &&
    sentenceParts(args.resultText).some(
      (part) => WALL_FLOOR_REPAIR_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
    )
  )
}

function hasPaintingAdjacentExpansion(args: BuildCustomerScopeTradeDriftWarningArgs) {
  const paintingRule = TRADE_RULES.find((rule) => rule.id === "painting")
  const drywallRule = TRADE_RULES.find((rule) => rule.id === "drywall")
  if (!paintingRule || !drywallRule) return false
  if (!isTradeSupported(paintingRule, args)) return false
  if (isTradeSupported(drywallRule, args)) return false
  if (MINOR_PAINT_PATCH_PATTERN.test(args.resultText) && !PAINTING_ADJACENT_DRYWALL_PATTERN.test(args.resultText)) {
    return false
  }

  return sentenceParts(args.resultText).some(
    (part) => PAINTING_ADJACENT_DRYWALL_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
  )
}

function hasFlooringAdjacentExpansion(args: BuildCustomerScopeTradeDriftWarningArgs) {
  const flooringRule = TRADE_RULES.find((rule) => rule.id === "flooring")
  const paintingRule = TRADE_RULES.find((rule) => rule.id === "painting")
  const carpentryRule = TRADE_RULES.find((rule) => rule.id === "carpentry")
  if (!flooringRule || !paintingRule || !carpentryRule) return false
  if (!isTradeSupported(flooringRule, args)) return false

  return sentenceParts(args.resultText).some((part) => {
    if (EXCLUDED_TRADE_PATTERN.test(part)) return false
    if (!FLOORING_ADJACENT_PATTERN.test(part)) return false
    const mentionsPainting = /\b(painting\s+(walls?|trim|baseboards?)|paint\s+(walls?|trim|baseboards?))\b/i.test(part)
    const mentionsCarpentry =
      /\b(baseboard\s+(replacement|replace|install|installation|repair)|baseboards?\s+(replacement|replace|install|installation|repair)|carpentry\s+work|trim\s+install|casing|crown)\b/i.test(part)

    return (
      (mentionsPainting && !isTradeSupported(paintingRule, args)) ||
      (mentionsCarpentry && !isTradeSupported(carpentryRule, args))
    )
  })
}

function buildUnsupportedTradeSummary(unsupportedTrades: TradeRule[]) {
  if (unsupportedTrades.length === 0) return null

  const visibleTradeLabels = unsupportedTrades.slice(0, 2).map((rule) => rule.label)
  const extraCount = unsupportedTrades.length - visibleTradeLabels.length
  const tradeText =
    extraCount > 0
      ? `${formatTradeList(visibleTradeLabels)} and ${extraCount} other trade${extraCount === 1 ? "" : "s"}`
      : formatTradeList(visibleTradeLabels)

  return `Customer-Facing Scope mentions ${tradeText} work, but ${visibleTradeLabels.length === 1 && extraCount === 0 ? "that trade is" : "those trades are"} not strongly supported by the selected trade, written scope, priced sections, or plan readback. Review this wording before sending.`
}

export function buildCustomerScopeReviewGuard(
  args: BuildCustomerScopeTradeDriftWarningArgs
): CustomerScopeReviewGuard {
  if (!String(args.resultText || "").trim()) {
    return { summary: null, warnings: [] }
  }

  const warnings: CustomerScopeReviewWarning[] = []
  const unsupportedTrades = unsupportedTradeRules(args)

  for (const rule of TRADE_RULES) {
    if (!tradeExclusionConflict(rule, args)) continue

    addWarning(warnings, {
      label: "Excluded scope conflict",
      message: `Written scope appears to exclude ${rule.label} work, but Customer-Facing Scope includes ${rule.label} system work. Review before sending.`,
      details: [`Confirm whether ${rule.label} work is excluded, by others, or actually included before customer output.`],
    })
  }

  if (hasWallFloorRepairExclusionConflict(args)) {
    addWarning(warnings, {
      label: "Excluded repair conflict",
      message:
        "Written scope appears to exclude wall, floor, drywall, flooring, or carpentry repair, but Customer-Facing Scope includes repair wording. Review before sending.",
      details: ["Confirm excluded repairs are not being promised in the customer-facing scope."],
    })
  }

  if (hasPaintingAdjacentExpansion(args)) {
    addWarning(warnings, {
      label: "Adjacent drywall expansion",
      message:
        "Customer-Facing Scope appears to expand a painting scope into drywall repair, skim coat, texture match, or finish-level work without strong support.",
      details: ["Minor nail-hole patching is okay, but drywall finishing or texture work should be confirmed before sending."],
    })
  }

  if (hasFlooringAdjacentExpansion(args)) {
    addWarning(warnings, {
      label: "Adjacent flooring expansion",
      message:
        "Customer-Facing Scope appears to expand a flooring scope into baseboard replacement, painting, or carpentry work without strong support.",
      details: ["Base shoe and transitions are okay when scoped; baseboard replacement, painting, or carpentry should be confirmed before sending."],
    })
  }

  if (unsupportedTrades.length > 0) {
    addWarning(warnings, {
      label: "Unsupported trade wording",
      message: buildUnsupportedTradeSummary(unsupportedTrades) || "",
      details: unsupportedTrades
        .slice(0, 2)
        .map((rule) => `Generated customer scope mentions ${rule.label} work without strong typed, priced, or plan-readback support.`),
    })
  }

  const summary =
    warnings[0]?.message || buildUnsupportedTradeSummary(unsupportedTrades)

  return {
    summary: summary || null,
    warnings,
  }
}

export function buildCustomerScopeTradeDriftWarning(args: BuildCustomerScopeTradeDriftWarningArgs): string | null {
  return buildCustomerScopeReviewGuard(args).summary
}
