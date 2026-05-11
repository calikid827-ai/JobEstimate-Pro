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

function hasActionableMention(rule: TradeRule, resultText: string, args: BuildCustomerScopeTradeDriftWarningArgs) {
  return sentenceParts(resultText).some((part) => {
    if (!rule.mentionPattern.test(part)) return false
    if (EXCLUDED_TRADE_PATTERN.test(part)) return false
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

export function buildCustomerScopeTradeDriftWarning(args: BuildCustomerScopeTradeDriftWarningArgs): string | null {
  if (!String(args.resultText || "").trim()) return null

  const unsupportedTrades = TRADE_RULES.filter(
    (rule) => hasActionableMention(rule, args.resultText, args) && !isTradeSupported(rule, args)
  )

  if (unsupportedTrades.length === 0) return null

  const visibleTradeLabels = unsupportedTrades.slice(0, 2).map((rule) => rule.label)
  const extraCount = unsupportedTrades.length - visibleTradeLabels.length
  const tradeText =
    extraCount > 0
      ? `${formatTradeList(visibleTradeLabels)} and ${extraCount} other trade${extraCount === 1 ? "" : "s"}`
      : formatTradeList(visibleTradeLabels)

  return `Customer-Facing Scope mentions ${tradeText} work, but ${visibleTradeLabels.length === 1 && extraCount === 0 ? "that trade is" : "those trades are"} not strongly supported by the selected trade, written scope, priced sections, or plan readback. Review this wording before sending.`
}
