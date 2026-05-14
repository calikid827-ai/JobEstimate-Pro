import type {
  EstimateStructuredSection,
  MaterialsList,
  ScopeXRay,
} from "./types"
import { normalizeTypedScope } from "./typed-scope-normalization"

export type ScopePriceConsistencyReview = {
  missedScopeWarnings: string[]
  laborMaterialConfidenceNotes: string[]
  scopeClarityWarnings: string[]
  suggestedExclusions: string[]
  contractorRiskNotes: string[]
}

export type BuildScopePriceConsistencyReviewArgs = {
  selectedTrade?: string
  scopeText: string
  resultText?: string
  scopeXRay?: ScopeXRay
  materialsList?: MaterialsList
  estimateSections?: EstimateStructuredSection[] | null
}

type TradeGroup =
  | "painting"
  | "drywall"
  | "flooring"
  | "electrical"
  | "plumbing"
  | "bathroom_tile"
  | "wallcovering"
  | "carpentry"
  | "general_renovation"

const TRADE_GROUPS: TradeGroup[] = [
  "painting",
  "drywall",
  "flooring",
  "electrical",
  "plumbing",
  "bathroom_tile",
  "wallcovering",
  "carpentry",
  "general_renovation",
]

const TRADE_LABELS: Record<TradeGroup, string> = {
  painting: "painting",
  drywall: "drywall",
  flooring: "flooring",
  electrical: "electrical",
  plumbing: "plumbing",
  bathroom_tile: "bathroom/tile",
  wallcovering: "wallcovering",
  carpentry: "carpentry",
  general_renovation: "general renovation",
}

const TRUE_WORK_PATTERNS: Record<Exclude<TradeGroup, "general_renovation">, RegExp[]> = {
  painting: [
    /\bpaint(?:ing|ed)?\b/,
    /\bcoat(?:s)?\b/,
    /\bsheen\b/,
  ],
  drywall: [
    /\bdrywall\b|\bsheetrock\b|\bgypsum\b/,
    /\bskim(?:\s+coat)?\b/,
    /\btexture\s+match\b/,
    /\bpatch(?:ing|es)?\b/,
  ],
  flooring: [
    /\bflooring\b|\bfloor\b/,
    /\blvp\b|\blaminate\b|\bhardwood\b|\bcarpet\b/,
    /\btransition(?:s)?\b|\bunderlayment\b/,
  ],
  electrical: [
    /\belectrical\b|\bwiring\b|\brough[-\s]*in\b/,
    /\boutlet(?:s)?\b|\bswitch(?:es)?\b|\breceptacle(?:s)?\b/,
    /\bcircuit(?:s)?\b|\bbreaker(?:s)?\b|\bpanel(?:s)?\b/,
    /\blight(?:s|ing)?\b|\bfixture(?:s)?\b/,
  ],
  plumbing: [
    /\bplumbing\b|\brough[-\s]*in\b/,
    /\btoilet(?:s)?\b|\bfaucet(?:s)?\b|\bsink(?:s)?\b|\bvanit(?:y|ies)\b/,
    /\bdrain(?:s)?\b|\bsupply\s+line(?:s)?\b|\bvalve(?:s)?\b/,
  ],
  bathroom_tile: [
    /\btile\b|\bgrout\b|\bthinset\b/,
    /\bwaterproof(?:ing)?\b|\bmembrane\b|\bshower\b|\btub\b/,
    /\bbacker\s*board\b|\bcement\s*board\b|\bpan\b/,
  ],
  wallcovering: [
    /\bwallcovering\b|\bwall\s*covering\b|\bwallpaper\b/,
    /\bvinyl\s+wallcovering\b|\bpattern\s+match\b|\bseam(?:s)?\b/,
  ],
  carpentry: [
    /\bbaseboard(?:s)?\b|\btrim\b|\bcasing\b|\bcrown\b/,
    /\bcarpentry\b|\bcabinet(?:s|ry)?\b|\bshel(?:f|ving)\b/,
  ],
}

const MATERIAL_PATTERNS: Record<Exclude<TradeGroup, "general_renovation">, RegExp[]> = {
  painting: [
    /\bpaint\b|\bprimer\b|\broller\b|\bbrush(?:es)?\b|\bpaint\s+tray\b/,
  ],
  drywall: [
    /\bdrywall\b|\bjoint\s+compound\b|\bdrywall\s+mud\b|\bdrywall\s+tape\b|\btexture\b/,
  ],
  flooring: [
    /\blvp\b|\bflooring\b|\blaminate\b|\bhardwood\b|\bcarpet\b/,
    /\bunderlayment\b|\btransition(?:s)?\b|\bquarter\s*round\b|\bbase\s*shoe\b/,
  ],
  electrical: [
    /\boutlet(?:s)?\b|\bswitch(?:es)?\b|\breceptacle(?:s)?\b|\bwire\b|\bwiring\b/,
    /\bcircuit(?:s)?\b|\bbreaker(?:s)?\b|\bpanel(?:s)?\b|\blight(?:s|ing)?\b/,
  ],
  plumbing: [
    /\btoilet(?:s)?\b|\bfaucet(?:s)?\b|\bsink(?:s)?\b|\bvalve(?:s)?\b/,
    /\bdrain(?:s)?\b|\bsupply\s+line(?:s)?\b|\bplumbing\b/,
  ],
  bathroom_tile: [
    /\btile\b|\bgrout\b|\bthinset\b|\bmembrane\b|\bbacker\s*board\b|\bcement\s*board\b/,
  ],
  wallcovering: [
    /\bwallcovering\b|\bwall\s*covering\b|\bwallpaper\b/,
    /\bvinyl\s+wallcovering\b|\bpattern\b|\bseam(?:s)?\b|\broll(?:s)?\b/,
  ],
  carpentry: [
    /\bbaseboard(?:s)?\b|\btrim\b|\bcasing\b|\bcrown\b|\bcabinet(?:s|ry)?\b/,
  ],
}

function normalize(value: string | undefined | null) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function addUnique(items: string[], value: string, max = 4) {
  const clean = String(value || "").replace(/\s+/g, " ").trim()
  if (!clean) return
  if (items.some((item) => item.toLowerCase() === clean.toLowerCase())) return
  if (items.length >= max) return
  items.push(clean)
}

function normalizeTrade(value: string | undefined | null): TradeGroup | null {
  const text = normalize(value).replace(/[\s-]+/g, "_")
  if (!text) return null
  if (text === "tile" || text === "bathroom" || text === "bathroom_tile") return "bathroom_tile"
  if (text === "wallpaper" || text === "wallcovering" || text === "wall_covering") return "wallcovering"
  if (text === "general" || text === "general_renovation" || text === "general_renovation/carpentry") {
    return "general_renovation"
  }
  if (TRADE_GROUPS.includes(text as TradeGroup)) return text as TradeGroup
  return null
}

function textMatches(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function isPaintingPrepConsumable(label: string) {
  return /\b(caulk|spackle|filler|patching\s+compound|painter'?s\s+putty)\b/.test(label) &&
    !/\b(drywall|sheetrock|gypsum|joint\s+compound|drywall\s+tape|texture)\b/.test(label)
}

function detectIncludedTrades(scopeText: string) {
  const normalized = normalizeTypedScope(scopeText)
  const includedText = normalized.includedWorkText || normalized.normalizedText
  const trades = new Set<TradeGroup>()

  for (const trade of TRADE_GROUPS) {
    if (trade === "general_renovation") continue
    if (textMatches(includedText, TRUE_WORK_PATTERNS[trade])) trades.add(trade)
  }

  return {
    trades,
    includedText,
    hasMaterialResponsibility: normalized.hasMaterialResponsibility,
  }
}

function detectScopeXRayTrades(scopeXRay: ScopeXRay) {
  const trades = new Set<TradeGroup>()
  for (const item of scopeXRay?.detectedScope?.splitScopes || []) {
    const trade = normalizeTrade(item.trade)
    if (trade) trades.add(trade)
  }
  return trades
}

function detectSectionTrades(sections: EstimateStructuredSection[] | null | undefined) {
  const trades = new Set<TradeGroup>()
  for (const section of sections || []) {
    const trade = normalizeTrade(section.trade)
    if (trade) trades.add(trade)
  }
  return trades
}

function detectMaterialTrades(materialsList: MaterialsList, supportedTrades: Set<TradeGroup>) {
  const trades = new Set<TradeGroup>()

  for (const item of materialsList?.items || []) {
    const label = normalize(`${item.label} ${item.quantity}`)

    if (supportedTrades.has("painting") && isPaintingPrepConsumable(label)) {
      trades.add("painting")
      continue
    }

    if (
      supportedTrades.has("wallcovering") &&
      /\b(primer|wall\s+prep|wall\s+repair|adhesive)\b/.test(label)
    ) {
      trades.add("wallcovering")
      continue
    }

    if (
      supportedTrades.has("bathroom_tile") &&
      /\b(tile|grout|thinset|membrane|backer|cement board|waterproof)\b/.test(label)
    ) {
      trades.add("bathroom_tile")
      continue
    }

    for (const trade of TRADE_GROUPS) {
      if (trade === "general_renovation") continue
      if (textMatches(label, MATERIAL_PATTERNS[trade])) trades.add(trade)
    }
  }

  return trades
}

function hasTradeSupport(trade: TradeGroup, supportedTrades: Set<TradeGroup>) {
  return supportedTrades.has(trade)
}

function anchorTrade(anchorId: string | null | undefined): TradeGroup | null {
  const anchor = normalize(anchorId)
  if (!anchor) return null
  if (anchor.includes("floor")) return "flooring"
  if (anchor.includes("paint")) return "painting"
  if (anchor.includes("drywall")) return "drywall"
  if (anchor.includes("electrical")) return "electrical"
  if (anchor.includes("plumbing")) return "plumbing"
  if (anchor.includes("tile") || anchor.includes("bath")) return "bathroom_tile"
  if (anchor.includes("wallcover")) return "wallcovering"
  if (anchor.includes("carpentry") || anchor.includes("baseboard") || anchor.includes("trim")) return "carpentry"
  return null
}

function supportedTradeSummary(trades: Set<TradeGroup>) {
  return Array.from(trades)
    .filter((trade) => trade !== "general_renovation")
    .map((trade) => TRADE_LABELS[trade])
    .join(", ")
}

export function buildScopePriceConsistencyReview(
  args: BuildScopePriceConsistencyReviewArgs
): ScopePriceConsistencyReview {
  const missedScopeWarnings: string[] = []
  const laborMaterialConfidenceNotes: string[] = []
  const scopeClarityWarnings: string[] = []
  const suggestedExclusions: string[] = []
  const contractorRiskNotes: string[] = []

  const selectedTrade = normalizeTrade(args.selectedTrade)
  const included = detectIncludedTrades(args.scopeText)
  const xrayTrades = detectScopeXRayTrades(args.scopeXRay || null)
  const sectionTrades = detectSectionTrades(args.estimateSections)
  const supportedTrades = new Set<TradeGroup>([...included.trades, ...xrayTrades])

  if (selectedTrade && selectedTrade !== "general_renovation") {
    supportedTrades.add(selectedTrade)
  }

  const primaryTrade = normalizeTrade(args.scopeXRay?.detectedScope?.primaryTrade)
  const splitTradeCount = Array.from(xrayTrades).filter((trade) => trade !== "general_renovation").length
  const includedTradeCount = Array.from(included.trades).filter((trade) => trade !== "general_renovation").length

  if (
    selectedTrade &&
    selectedTrade !== "general_renovation" &&
    primaryTrade === "general_renovation" &&
    splitTradeCount > 1 &&
    includedTradeCount <= 1
  ) {
    addUnique(
      scopeClarityWarnings,
      `Scope-to-Price X-Ray reads as mixed/general renovation, but included typed scope only strongly supports ${TRADE_LABELS[selectedTrade]}. Confirm diagnostics are not using exclusions or protection language as included work.`
    )
  }

  const anchor = anchorTrade(args.scopeXRay?.pricingMethod?.anchorId)
  if (anchor && !hasTradeSupport(anchor, supportedTrades)) {
    addUnique(
      laborMaterialConfidenceNotes,
      `Pricing anchor appears ${TRADE_LABELS[anchor]}-based, but included scope and split scopes do not strongly support ${TRADE_LABELS[anchor]} work. Confirm the pricing method before sending.`
    )
  }

  const materialTrades = detectMaterialTrades(args.materialsList || null, supportedTrades)
  for (const trade of materialTrades) {
    if (!hasTradeSupport(trade, supportedTrades)) {
      addUnique(
        laborMaterialConfidenceNotes,
        `Materials List includes ${TRADE_LABELS[trade]} items, but included scope and diagnostics do not strongly support ${TRADE_LABELS[trade]} work. Confirm materials before buying or sending.`
      )
    }
  }

  for (const trade of sectionTrades) {
    if (trade !== "general_renovation" && !hasTradeSupport(trade, supportedTrades)) {
      addUnique(
        laborMaterialConfidenceNotes,
        `Estimate sections include ${TRADE_LABELS[trade]} pricing, but included scope and Scope-to-Price X-Ray do not strongly support ${TRADE_LABELS[trade]} work. Confirm section coverage before sending.`
      )
    }
  }

  const trueMixedIncluded = includedTradeCount > 1
  const diagnosticTradeCount = Array.from(new Set([...xrayTrades, ...sectionTrades])).filter(
    (trade) => trade !== "general_renovation"
  ).length

  if (trueMixedIncluded && diagnosticTradeCount < 2) {
    addUnique(
      missedScopeWarnings,
      `Typed scope appears to include multiple trades (${supportedTradeSummary(included.trades)}), but pricing diagnostics do not clearly show the mixed scope. Confirm trade coverage before sending.`
    )
  }

  if (included.hasMaterialResponsibility) {
    addUnique(
      laborMaterialConfidenceNotes,
      "Owner/customer-supplied materials are referenced. Confirm the estimate carries only contractor-supplied consumables, handling, protection, and return-trip risk."
    )
    addUnique(
      suggestedExclusions,
      "Excludes delays, defects, shortages, or reorders for owner/customer-supplied finish materials unless approved in writing."
    )
  }

  return {
    missedScopeWarnings,
    laborMaterialConfidenceNotes,
    scopeClarityWarnings,
    suggestedExclusions,
    contractorRiskNotes,
  }
}
