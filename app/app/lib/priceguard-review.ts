import type {
  AreaScopeBreakdown,
  EstimateDefenseMode,
  EstimateRow,
  EstimateStructuredSection,
  MaterialsList,
  MissedScopeDetector,
  PriceGuardReport,
  PricingSource,
  ProfitLeakDetector,
  ProfitProtection,
  Schedule,
  ScopeXRay,
} from "./types"
import { buildScheduleSequencingReview } from "./schedule-sequencing-review"
import { buildScopePriceConsistencyReview } from "./scope-price-consistency-review"

type PricingInput = {
  labor?: number
  materials?: number
  subs?: number
  markup?: number
  total?: number
}

export type PriceGuardReviewLevel = "strong" | "review" | "profit_leak"

export type PriceGuardReview = {
  score: number
  level: PriceGuardReviewLevel
  headline: string
  summary: string
  missedScopeWarnings: string[]
  laborMaterialConfidenceNotes: string[]
  scopeClarityWarnings: string[]
  suggestedExclusions: string[]
  customerPriceDefenseNotes: string[]
  contractorRiskNotes: string[]
}

export type BuildPriceGuardReviewArgs = {
  hasResult: boolean
  selectedTrade?: string
  scopeText: string
  resultText?: string
  pricing: PricingInput
  schedule?: Schedule | null
  scopeSignals?: {
    needsReturnVisit?: boolean
    reason?: string
  } | null
  deposit?: {
    enabled?: boolean
    type?: "percent" | "fixed"
    value?: number
  } | null
  scopeQuality?: {
    score?: number
    warnings?: string[]
  } | null
  priceGuard?: PriceGuardReport | null
  priceGuardVerified?: boolean
  pricingSource?: PricingSource
  materialsList?: MaterialsList
  scopeXRay?: ScopeXRay
  areaScopeBreakdown?: AreaScopeBreakdown
  profitProtection?: ProfitProtection
  missedScopeDetector?: MissedScopeDetector
  profitLeakDetector?: ProfitLeakDetector
  estimateDefenseMode?: EstimateDefenseMode
  estimateRows?: EstimateRow[] | null
  estimateSections?: EstimateStructuredSection[] | null
}

function cleanText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalize(value: string) {
  return cleanText(value).toLowerCase()
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

type PriceGuardTradeGroup =
  | "painting"
  | "drywall"
  | "flooring"
  | "electrical"
  | "plumbing"
  | "bathroom_tile"
  | "wallcovering"
  | "carpentry"
  | "general_renovation"
  | null

function resolvePriceGuardTrade(selectedTrade: string | undefined, text: string): PriceGuardTradeGroup {
  const selected = normalize(selectedTrade || "")

  if (selected === "painting") return "painting"
  if (selected === "drywall") return "drywall"
  if (selected === "flooring") return "flooring"
  if (selected === "electrical") return "electrical"
  if (selected === "plumbing") return "plumbing"
  if (selected === "bathroom_tile" || selected === "tile") return "bathroom_tile"
  if (selected === "wallcovering" || selected === "wallpaper") return "wallcovering"
  if (selected === "carpentry") return "carpentry"
  if (selected === "general_renovation" || selected === "general") return "general_renovation"

  if (hasAny(text, ["wallpaper", "wallcovering", "wall covering", "vinyl wallcovering"])) {
    return "wallcovering"
  }
  if (hasAny(text, ["shower", "tub", "tile", "waterproof", "waterproofing", "bathroom remodel"])) {
    return "bathroom_tile"
  }
  if (hasAny(text, ["outlet", "receptacle", "switch", "circuit", "breaker", "panel", "wiring", "lighting"])) {
    return "electrical"
  }
  if (hasAny(text, ["toilet", "faucet", "sink", "vanity", "drain", "supply line", "plumbing"])) {
    return "plumbing"
  }
  if (hasAny(text, ["lvp", "laminate", "hardwood", "carpet", "flooring", "transition strip", "underlayment"])) {
    return "flooring"
  }
  if (hasAny(text, ["drywall", "sheetrock", "gypsum", "texture match", "level 5", "level five"])) {
    return "drywall"
  }
  if (hasAny(text, ["baseboard", "baseboards", "casing", "crown", "shelving", "cabinet install"])) {
    return "carpentry"
  }
  if (hasAny(text, ["paint", "painting", "coat", "primer", "prime", "walls", "ceilings", "trim"])) {
    return "painting"
  }
  if (hasAny(text, ["renovation", "remodel", "ada", "unit", "per plans"])) {
    return "general_renovation"
  }

  return null
}

function hasQuantityDetail(text: string) {
  return matchesAny(text, [
    /\b\d+(\.\d+)?\s?(sq\.?\s?ft|sf|square feet|square foot|lf|linear feet|linear foot|ln ft)\b/,
    /\b\d+\s?(rooms?|areas?|walls?|ceilings?|doors?|windows?|outlets?|switches?|fixtures?|lights?|receptacles?|circuits?|sinks?|toilets?|faucets?|vanities?|showers?|patches?)\b/,
    /\b\d+(\.\d+)?\s+(?:[a-z]+\s+){1,3}(rooms?|areas?|walls?|ceilings?|doors?|windows?|outlets?|switches?|fixtures?|lights?|receptacles?|circuits?|sinks?|toilets?|faucets?|vanities?|showers?|patches?)\b/,
  ]) || hasAny(text, ["per plan", "per plans", "selected sheets"])
}

function hasMaterialBoundary(text: string) {
  return hasAny(text, [
    "owner supplied",
    "owner-supplied",
    "customer supplied",
    "contractor supplied",
    "contractor-supplied",
    "by owner",
    "allowance",
    "material selection",
    "finish selection",
    "supplied by",
    "provide",
  ])
}

function hasExclusionBoundary(text: string) {
  return hasAny(text, [
    "exclude",
    "excludes",
    "excluded",
    "not included",
    "by others",
    "by owner",
    "allowance",
    "hidden damage",
    "unless approved",
    "work by others",
  ])
}

function hasPermitBoundary(text: string) {
  return hasAny(text, ["permit", "permits", "inspection", "inspections", "code", "utility coordination"])
}

function addTradeReviewNote(
  target: string[],
  warning: string,
  scoreChange: { value: number },
  penalty = 3
) {
  const before = target.length
  addUnique(target, warning, 6)
  if (target.length > before) scoreChange.value -= penalty
}

function applyTradeSpecificMissedScopeChecks(args: {
  trade: PriceGuardTradeGroup
  text: string
  missedScopeWarnings: string[]
  scopeClarityWarnings: string[]
  suggestedExclusions: string[]
  contractorRiskNotes: string[]
  score: { value: number }
}) {
  const {
    trade,
    text,
    missedScopeWarnings,
    scopeClarityWarnings,
    suggestedExclusions,
    contractorRiskNotes,
    score,
  } = args

  if (!trade) return

  if (trade === "painting") {
    if (!hasAny(text, ["wall", "walls", "ceiling", "ceilings", "trim", "door", "doors", "cabinet", "exterior", "siding"])) {
      addTradeReviewNote(scopeClarityWarnings, "Painting scope should confirm included surfaces before sending.", score)
    }
    if (!hasAny(text, ["coat", "coats", "primer", "prime", "finish", "sheen"])) {
      addTradeReviewNote(missedScopeWarnings, "Paint system, coat count, or finish sheen is not clearly stated.", score)
    }
    if (!hasAny(text, ["mask", "protect", "protection", "cover", "plastic", "drop cloth", "occupied"])) {
      addTradeReviewNote(missedScopeWarnings, "Masking/protection for adjacent finishes or occupied areas is not clearly stated.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm paint/material supply and finish selection responsibility.", score)
    }
  } else if (trade === "drywall") {
    if (!hasQuantityDetail(text) && !hasAny(text, ["small patch", "medium patch", "large patch"])) {
      addTradeReviewNote(scopeClarityWarnings, "Drywall scope should confirm patch count, sheet count, or affected square footage.", score)
    }
    if (!hasAny(text, ["level 3", "level 4", "level 5", "level three", "level four", "level five", "texture", "smooth", "orange peel", "knockdown", "match"])) {
      addTradeReviewNote(missedScopeWarnings, "Drywall finish level or texture match is not clearly stated.", score)
    }
    if (!hasAny(text, ["paint excluded", "painting excluded", "paint by others", "prime", "primer", "paint"])) {
      addTradeReviewNote(suggestedExclusions, "Clarify whether primer/paint is included or by others after drywall work.", score)
    }
    if (!hasAny(text, ["dust", "protection", "containment", "plastic"])) {
      addTradeReviewNote(missedScopeWarnings, "Drywall dust protection, cleanup, or debris handling is not clearly stated.", score)
    }
  } else if (trade === "flooring") {
    if (!hasAny(text, ["lvp", "vinyl", "laminate", "hardwood", "engineered", "tile", "carpet", "flooring product", "floor material"])) {
      addTradeReviewNote(scopeClarityWarnings, "Flooring product type and finish selection should be confirmed.", score)
    }
    if (!hasAny(text, ["remove", "removal", "demo", "demolition", "tear out", "tear-out", "existing"])) {
      addTradeReviewNote(missedScopeWarnings, "Existing flooring removal and disposal are not clearly stated.", score)
    }
    if (!hasAny(text, ["subfloor", "level", "leveling", "prep", "underlayment", "moisture"])) {
      addTradeReviewNote(missedScopeWarnings, "Subfloor prep, leveling, underlayment, or moisture assumptions are not clearly stated.", score)
    }
    if (!hasAny(text, ["base", "baseboard", "baseboards", "shoe", "quarter round", "transition", "transitions", "threshold"])) {
      addTradeReviewNote(missedScopeWarnings, "Base, shoe, thresholds, and transitions are not clearly addressed.", score)
    }
  } else if (trade === "electrical") {
    if (!hasQuantityDetail(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Electrical scope should confirm device, fixture, circuit, or panel counts.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm whether fixtures, devices, lamps, and trims are contractor-supplied or owner-supplied.", score)
    }
    if (!hasAny(text, ["access", "open wall", "open ceiling", "attic", "crawl", "surface mount", "conduit", "fishing", "patch", "patching"])) {
      addTradeReviewNote(missedScopeWarnings, "Electrical access and wall/ceiling patching responsibility are not clearly stated.", score)
    }
    if (!hasPermitBoundary(text)) {
      addTradeReviewNote(suggestedExclusions, "Clarify permit, inspection, code, and utility coordination assumptions for electrical work.", score)
    }
  } else if (trade === "plumbing") {
    if (!hasQuantityDetail(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Plumbing scope should confirm fixture, valve, drain, supply, or rough-in counts.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm whether fixtures, valves, trims, and plumbing materials are contractor-supplied or owner-supplied.", score)
    }
    if (!hasAny(text, ["access", "open wall", "open ceiling", "crawl", "slab", "patch", "wall repair", "floor repair", "tile repair"])) {
      addTradeReviewNote(missedScopeWarnings, "Plumbing access and wall/floor/tile repair responsibility are not clearly stated.", score)
    }
    if (!hasAny(text, ["shutoff", "shut off", "water shut", "permit", "inspection", "code"])) {
      addTradeReviewNote(suggestedExclusions, "Clarify shutoff, permit, inspection, and code assumptions for plumbing work.", score)
    }
  } else if (trade === "bathroom_tile") {
    if (!hasAny(text, ["demo", "demolition", "remove", "removal", "tear out", "tear-out", "haul", "disposal"])) {
      addTradeReviewNote(missedScopeWarnings, "Bathroom/tile demolition, haul-off, and disposal are not clearly stated.", score)
    }
    if (!hasAny(text, ["waterproof", "waterproofing", "membrane", "pan", "backer", "cement board", "substrate", "mud bed"])) {
      addTradeReviewNote(missedScopeWarnings, "Waterproofing, backer board, pan, or substrate prep is not clearly stated.", score)
    }
    if (!hasAny(text, ["fixture", "fixtures", "toilet", "vanity", "faucet", "valve", "plumbing", "electrical", "fan", "light"])) {
      addTradeReviewNote(scopeClarityWarnings, "Fixture, plumbing, and electrical boundaries should be confirmed for bathroom/tile work.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm tile, grout, trim, fixture, and finish material responsibility.", score)
    }
    if (!hasExclusionBoundary(text)) {
      addTradeReviewNote(suggestedExclusions, "Clarify exclusions for glass, accessories, hidden damage, plumbing, electrical, and finish upgrades.", score)
    }
  } else if (trade === "wallcovering") {
    if (!hasQuantityDetail(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Wallcovering scope should confirm wall area, linear footage, or affected rooms.", score)
    }
    if (!hasAny(text, ["remove", "removal", "strip", "existing", "skim", "prime", "primer", "substrate", "wall condition", "repair"])) {
      addTradeReviewNote(missedScopeWarnings, "Existing wallcovering removal, wall repair, or substrate prep is not clearly stated.", score)
    }
    if (!hasAny(text, ["pattern", "repeat", "match", "seam", "seams", "waste", "layout"])) {
      addTradeReviewNote(missedScopeWarnings, "Pattern repeat, seam layout, matching, and waste assumptions are not clearly stated.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm wallcovering material, adhesive, and finish selection responsibility.", score)
    }
  } else if (trade === "carpentry") {
    if (!hasQuantityDetail(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Carpentry scope should confirm item count, linear footage, or affected areas.", score)
    }
    if (!hasAny(text, ["paint", "stain", "finish", "caulk", "fill", "patch", "hardware"])) {
      addTradeReviewNote(missedScopeWarnings, "Carpentry finish, caulk, paint/stain, patching, or hardware responsibility is not clearly stated.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm wood, trim, hardware, and finish material responsibility.", score)
    }
  } else if (trade === "general_renovation") {
    if (!hasAny(text, ["paint", "drywall", "floor", "flooring", "tile", "plumbing", "electrical", "carpentry", "fixture", "fixtures", "demo", "finish", "finishes"])) {
      addTradeReviewNote(scopeClarityWarnings, "General renovation scope should confirm which trades are included.", score)
    }
    if (!hasAny(text, ["demo", "demolition", "remove", "removal", "repair", "replace", "install", "prep", "rough-in", "rough in"])) {
      addTradeReviewNote(missedScopeWarnings, "Renovation demolition, prep, rough-in, and finish-work limits are not clearly stated.", score)
    }
    if (!hasMaterialBoundary(text)) {
      addTradeReviewNote(scopeClarityWarnings, "Confirm finish selections, fixture responsibility, and material allowances.", score)
    }
    if (!hasExclusionBoundary(text)) {
      addTradeReviewNote(suggestedExclusions, "Clarify exclusions, allowances, permits, hidden damage, and work by others.", score)
    }
    if (!hasAny(text, ["schedule", "sequence", "sequencing", "phasing", "rough-in", "inspection", "return trip"])) {
      addTradeReviewNote(contractorRiskNotes, "Multi-trade sequencing or return-trip assumptions should be reviewed before sending.", score)
    }
  }
}

function resolvedScopeQualityWarning(warning: string, reviewedText: string) {
  const warningText = normalize(warning)

  if (
    warningText.includes("job size") ||
    warningText.includes("area") ||
    warningText.includes("square footage") ||
    warningText.includes("affected rooms") ||
    warningText.includes("linear footage") ||
    warningText.includes("plan pages") ||
    warningText.includes("count")
  ) {
    return /\b\d+(\.\d+)?\b/.test(reviewedText) || hasAny(reviewedText, [
      "linear feet",
      "linear foot",
      "lf",
      "ln ft",
      "sq ft",
      "square feet",
      "room",
      "rooms",
      "quantity",
      "quantities",
      "selected sheets",
      "per plan",
      "per plans",
    ])
  }

  if (warningText.includes("surface")) {
    return hasAny(reviewedText, [
      "wall",
      "walls",
      "ceiling",
      "ceilings",
      "trim",
      "baseboard",
      "baseboards",
      "moulding",
      "molding",
      "surface",
      "surfaces",
    ])
  }

  if (
    warningText.includes("prep") ||
    warningText.includes("demolition") ||
    warningText.includes("removal") ||
    warningText.includes("substrate") ||
    warningText.includes("wall condition") ||
    warningText.includes("subfloor")
  ) {
    return hasAny(reviewedText, [
      "prep",
      "preparation",
      "prepare",
      "patch",
      "repair",
      "sand",
      "caulk",
      "fill",
      "prime",
      "remove",
      "removal",
      "demo",
      "demolition",
      "substrate",
      "subfloor",
      "leveling",
      "wall condition",
    ])
  }

  if (
    warningText.includes("work process") ||
    warningText.includes("scope type") ||
    warningText.includes("work limits") ||
    warningText.includes("finish limits") ||
    warningText.includes("trade")
  ) {
    return hasAny(reviewedText, [
      "install",
      "installation",
      "measure",
      "measuring",
      "cut",
      "cutting",
      "fit",
      "fasten",
      "nail",
      "caulk",
      "paint",
      "coat",
      "finish",
      "finishing",
      "cleanup",
      "replace",
      "rough-in",
      "rough in",
      "device",
      "fixture",
      "plumbing",
      "electrical",
      "flooring",
      "tile",
      "drywall",
      "painting",
    ])
  }

  if (
    warningText.includes("material") ||
    warningText.includes("supplied") ||
    warningText.includes("allowance") ||
    warningText.includes("selection")
  ) {
    return hasAny(reviewedText, [
      "material",
      "materials",
      "allowance",
      "selection",
      "owner supplied",
      "owner-supplied",
      "by owner",
      "contractor supplied",
      "contractor-supplied",
      "supplied by",
      "provide",
    ])
  }

  if (
    warningText.includes("exclusion") ||
    warningText.includes("excluded") ||
    warningText.includes("permit") ||
    warningText.includes("inspection")
  ) {
    return hasAny(reviewedText, [
      "exclude",
      "excludes",
      "excluded",
      "not included",
      "allowance",
      "permit",
      "permits",
      "inspection",
      "inspections",
      "hidden damage",
      "work by others",
    ])
  }

  if (warningText.includes("access")) {
    return hasAny(reviewedText, [
      "access",
      "attic",
      "crawl",
      "open wall",
      "open ceiling",
      "patch",
      "patching",
      "repair",
      "surface mount",
      "ladder",
      "scaffold",
    ])
  }

  if (warningText.includes("pattern") || warningText.includes("repeat")) {
    return hasAny(reviewedText, [
      "pattern",
      "repeat",
      "match",
      "waste",
      "seams",
      "material",
    ])
  }

  if (warningText.includes("very short")) {
    return reviewedText.length >= 80
  }

  return false
}

function addUnique(items: string[], value: string, max = 6) {
  const clean = cleanText(value)
  if (!clean) return
  if (items.some((item) => item.toLowerCase() === clean.toLowerCase())) return
  if (items.length >= max) return
  items.push(clean)
}

function addMany(items: string[], values: string[] | undefined, max = 6) {
  for (const value of values || []) addUnique(items, value, max)
}

function excludedPatchTextureOnly(text: string) {
  return (
    /\b(excludes?|excluded|excluding|does not include|does not cover|not included|by others|without)\b.{0,80}\b(drywall repair|drywall patch|patching|skim coat|texture match|texture matching|texture)\b/i.test(text) ||
    /\b(drywall repair|drywall patch|patching|skim coat|texture match|texture matching|texture)\b.{0,80}\b(excluded|by others|not included|does not include|does not cover)\b/i.test(text)
  )
}

function includedPatchTextureWork(text: string) {
  return /\b(include|includes|included|repair|patch|patching|skim|texture|match)\b.{0,80}\b(drywall repair|drywall patch|patching|skim coat|texture match|texture matching|texture)\b/i.test(text) &&
    !excludedPatchTextureOnly(text)
}

function unresolvedMaterialConfirmItems(items: string[] | undefined, combinedText: string) {
  return (items || []).filter((item) => {
    const text = normalize(item)
    if (
      /\b(primer|sealer)\b/.test(text) &&
      /\b(after patching|patching|patch|texture|drywall)\b/.test(text) &&
      excludedPatchTextureOnly(combinedText) &&
      !includedPatchTextureWork(combinedText)
    ) {
      return false
    }
    return true
  })
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function buildPriceGuardReview(args: BuildPriceGuardReviewArgs): PriceGuardReview | null {
  if (!args.hasResult) return null

  const scopeText = cleanText(args.scopeText)
  const resultText = cleanText(args.resultText || "")
  const combinedText = normalize(`${scopeText} ${resultText}`)

  const labor = Math.max(0, Number(args.pricing.labor || 0))
  const materials = Math.max(0, Number(args.pricing.materials || 0))
  const subs = Math.max(0, Number(args.pricing.subs || 0))
  const markup = Math.max(0, Number(args.pricing.markup || 0))
  const total = Math.max(0, Number(args.pricing.total || 0))
  const directCost = labor + materials + subs
  const laborShare = total > 0 ? labor / total : 0
  const materialShare = total > 0 ? materials / total : 0
  const rowCount = (args.estimateRows || []).length
  const sectionCount = (args.estimateSections || []).length

  const missedScopeWarnings: string[] = []
  const laborMaterialConfidenceNotes: string[] = []
  const scopeClarityWarnings: string[] = []
  const suggestedExclusions: string[] = []
  const customerPriceDefenseNotes: string[] = []
  const contractorRiskNotes: string[] = []
  let score = 100
  const scoreChange = { value: score }

  if (!scopeText || scopeText.length < 35) {
    addUnique(scopeClarityWarnings, "Scope description is short. Add affected rooms, quantities, surfaces, and finish expectations.")
    score -= 14
  }

  const unresolvedScopeQualityWarnings = (args.scopeQuality?.warnings || []).filter(
    (warning) => !resolvedScopeQualityWarning(warning, combinedText)
  )

  if (unresolvedScopeQualityWarnings.length > 0) {
    addMany(scopeClarityWarnings, unresolvedScopeQualityWarnings, 4)
    score -= Math.min(8, unresolvedScopeQualityWarnings.length * 3)
  }

  if (/\b(tbd|as needed|misc|various|etc|general repairs?|touch[- ]?ups?|fix up|make ready)\b/i.test(combinedText)) {
    addUnique(scopeClarityWarnings, "Scope uses vague wording. Replace open-ended language with specific included work.")
    score -= 8
  }

  scoreChange.value = score
  applyTradeSpecificMissedScopeChecks({
    trade: resolvePriceGuardTrade(args.selectedTrade, combinedText),
    text: combinedText,
    missedScopeWarnings,
    scopeClarityWarnings,
    suggestedExclusions,
    contractorRiskNotes,
    score: scoreChange,
  })
  score = scoreChange.value

  const sequencingReview = buildScheduleSequencingReview({
    selectedTrade: args.selectedTrade,
    scopeText: args.scopeText,
    resultText: args.resultText,
    schedule: args.schedule,
    scopeSignals: args.scopeSignals,
    estimateSections: args.estimateSections,
  })

  if (sequencingReview) {
    addMany(contractorRiskNotes, sequencingReview.contractorRiskNotes, 6)
    addMany(scopeClarityWarnings, sequencingReview.scopeClarityWarnings, 6)
    addMany(suggestedExclusions, sequencingReview.suggestedExclusions, 6)
    addMany(missedScopeWarnings, sequencingReview.missedScopeWarnings, 6)
  }

  const scopePriceConsistencyReview = buildScopePriceConsistencyReview({
    selectedTrade: args.selectedTrade,
    scopeText: args.scopeText,
    resultText: args.resultText,
    scopeXRay: args.scopeXRay,
    materialsList: args.materialsList,
    estimateSections: args.estimateSections,
  })

  addMany(contractorRiskNotes, scopePriceConsistencyReview.contractorRiskNotes, 6)
  addMany(scopeClarityWarnings, scopePriceConsistencyReview.scopeClarityWarnings, 6)
  addMany(laborMaterialConfidenceNotes, scopePriceConsistencyReview.laborMaterialConfidenceNotes, 6)
  addMany(suggestedExclusions, scopePriceConsistencyReview.suggestedExclusions, 6)
  addMany(missedScopeWarnings, scopePriceConsistencyReview.missedScopeWarnings, 6)

  if (!hasAny(combinedText, ["prep", "preparation", "prepare", "patch", "repair", "sand", "demo", "remove", "scrape", "caulk", "fill", "prime", "substrate"])) {
    addUnique(missedScopeWarnings, "Prep or demolition expectations are not clearly stated.")
    addUnique(suggestedExclusions, "Excludes hidden damage, substrate repairs, or prep beyond the written scope unless approved in writing.")
    score -= 8
  }

  if (!hasAny(combinedText, ["material", "materials", "consumable", "consumables", "fixture", "paint", "tile", "flooring", "baseboard", "trim", "moulding", "molding", "allowance", "owner supplied", "contractor supplied"])) {
    addUnique(missedScopeWarnings, "Material responsibility or allowance language is not clear.")
    addUnique(suggestedExclusions, "Excludes material upgrades, fixture changes, and finish selections not listed in this estimate.")
    score -= 8
  }

  if (!hasAny(combinedText, ["cleanup", "clean up", "haul", "disposal", "dispose", "debris", "trash"])) {
    addUnique(missedScopeWarnings, "Cleanup, debris removal, or disposal is not clearly addressed.")
    addUnique(suggestedExclusions, "Excludes dump fees, hazardous material handling, and disposal beyond normal job debris unless listed.")
    score -= 6
  }

  if (!hasAny(combinedText, ["protect", "protection", "mask", "cover", "containment", "dust", "plastic"])) {
    addUnique(missedScopeWarnings, "Protection for adjacent finishes, dust, or occupied areas is not clearly stated.")
    score -= 6
  }

  if (!hasAny(combinedText, ["exclude", "excludes", "not included", "allowance", "by owner", "owner supplied"])) {
    addUnique(scopeClarityWarnings, "Exclusions or allowance boundaries are thin. Add scope protection before sending.")
    score -= 8
  }

  if (total <= 0 || directCost <= 0) {
    addUnique(laborMaterialConfidenceNotes, "Pricing is incomplete. Confirm labor, materials, other costs, and total before sending.")
    score -= 20
  } else {
    if (labor <= 0 || laborShare < 0.18) {
      addUnique(laborMaterialConfidenceNotes, "Labor appears low compared with total. Confirm crew hours, setup, protection, and return trips.")
      score -= 10
    }

    if (materials <= 0 || materialShare < 0.06) {
      addUnique(laborMaterialConfidenceNotes, "Materials appear light. Confirm supplies, consumables, protection, and finish allowances.")
      score -= 8
    }

    if (markup < 15) {
      addUnique(contractorRiskNotes, "Markup is below a conservative launch-safe threshold. Check overhead and profit before sending.")
      score -= 12
    } else if (markup < 20) {
      addUnique(contractorRiskNotes, "Markup is usable but tight. Confirm overhead, callbacks, and contingency are covered.")
      score -= 6
    }
  }

  const hasScheduleRationale = (args.schedule?.rationale?.length ?? 0) > 0
  const hasCrewOrCalendarDuration = Boolean(args.schedule?.crewDays || args.schedule?.calendarDays)
  const hasSiteVisits = Number(args.schedule?.visits || 0) > 0

  if (!args.schedule || (!hasScheduleRationale && !hasCrewOrCalendarDuration && !hasSiteVisits)) {
    addUnique(scopeClarityWarnings, "Schedule assumptions are missing or thin. Add expected duration and timing assumptions.")
    addUnique(suggestedExclusions, "Excludes delays from material availability, client changes, inspections, or site access issues.")
    score -= 7
  } else if (!hasCrewOrCalendarDuration && hasSiteVisits) {
    addUnique(
      laborMaterialConfidenceNotes,
      "Schedule has a site-visit count but no crew-days or calendar duration. Confirm expected timing before sending."
    )
    addUnique(
      customerPriceDefenseNotes,
      "Schedule planning includes expected site visits; confirm the final calendar window with the customer before work starts."
    )
    score -= 3
  }

  if (!args.deposit?.enabled) {
    addUnique(contractorRiskNotes, "Payment/deposit clarity is missing. Add deposit or payment terms before sending.")
    score -= 6
  }

  if (!hasAny(combinedText, ["approve", "approval", "signature", "authorized", "acceptance"])) {
    addUnique(scopeClarityWarnings, "Customer approval language is not prominent. Confirm the customer knows approval authorizes the listed scope and price.")
    score -= 5
  }

  const materialConfirmItems = unresolvedMaterialConfirmItems(args.materialsList?.confirmItems, combinedText)
  if (materialConfirmItems.length) {
    addMany(missedScopeWarnings, materialConfirmItems.slice(0, 3), 6)
    score -= Math.min(6, materialConfirmItems.length * 2)
  }

  if (args.areaScopeBreakdown?.missingConfirmations?.length) {
    addMany(missedScopeWarnings, args.areaScopeBreakdown.missingConfirmations.slice(0, 3), 6)
    score -= Math.min(8, args.areaScopeBreakdown.missingConfirmations.length * 2)
  }

  if (args.missedScopeDetector) {
    addMany(
      missedScopeWarnings,
      args.missedScopeDetector.likelyMissingScope.map((item) => item.label || item.reason).slice(0, 3),
      6
    )
    addMany(
      scopeClarityWarnings,
      args.missedScopeDetector.recommendedConfirmations.map((item) => item.label || item.reason).slice(0, 2),
      6
    )
  }

  if (args.profitLeakDetector) {
    addMany(
      contractorRiskNotes,
      args.profitLeakDetector.likelyProfitLeaks.map((item) => item.label || item.reason).slice(0, 3),
      6
    )
    addMany(
      laborMaterialConfidenceNotes,
      args.profitLeakDetector.pricingReviewPrompts.map((item) => item.label || item.reason).slice(0, 2),
      6
    )
  }

  if (args.profitProtection?.warnings.length) {
    addMany(contractorRiskNotes, args.profitProtection.warnings.slice(0, 3), 6)
    if (args.profitProtection.status === "danger") score -= 18
    else if (args.profitProtection.status === "warning") score -= 8
  }

  addMany(suggestedExclusions, args.estimateDefenseMode?.exclusionNotes.slice(0, 3), 6)

  if (args.priceGuardVerified || args.priceGuard?.status === "verified") {
    addUnique(customerPriceDefenseNotes, "PriceGuard screened the estimate against deterministic pricing safeguards and common underpricing risks.")
  } else if (args.pricingSource === "deterministic") {
    addUnique(customerPriceDefenseNotes, "Pricing is supported by deterministic trade logic for the detected scope.")
  } else {
    addUnique(customerPriceDefenseNotes, "Pricing is based on the written scope and should be reviewed against final quantities and selections.")
  }

  if (rowCount > 0 || sectionCount > 0) {
    addUnique(customerPriceDefenseNotes, "The price is organized around structured scope sections, which makes included work easier to defend.")
  }

  if (args.schedule?.crewDays || args.schedule?.calendarDays) {
    addUnique(customerPriceDefenseNotes, "Schedule assumptions are included so the customer can understand timing and crew impact.")
  } else if (hasSiteVisits) {
    addUnique(customerPriceDefenseNotes, "Site visit assumptions are included to show expected coordination even though duration should be confirmed.")
  }

  addMany(customerPriceDefenseNotes, args.estimateDefenseMode?.homeownerFriendlyJustification.slice(0, 2), 5)
  addMany(customerPriceDefenseNotes, args.profitProtection?.reasons.slice(0, 2), 5)

  if (missedScopeWarnings.length > 0 || contractorRiskNotes.length > 0) {
    addUnique(contractorRiskNotes, "PriceGuard found possible profit leaks. Review the notes before sending this estimate.")
  }

  if (suggestedExclusions.length === 0) {
    addUnique(suggestedExclusions, "Excludes work not specifically described in the written scope.")
  }

  if (customerPriceDefenseNotes.length === 0) {
    addUnique(customerPriceDefenseNotes, "This price reflects labor, material, other cost, markup, and the written scope assumptions.")
  }

  const finalScore = clampScore(score)
  const level: PriceGuardReviewLevel =
    finalScore >= 82 ? "strong" : finalScore >= 62 ? "review" : "profit_leak"

  return {
    score: finalScore,
    level,
    headline:
      level === "strong"
        ? "PriceGuard review looks strong."
        : level === "review"
        ? "This estimate may need stronger scope protection."
        : "PriceGuard found possible profit leaks.",
    summary:
      level === "strong"
        ? "Core pricing and scope signals look send-ready, with normal contractor review still recommended."
        : level === "review"
        ? "Add these notes before sending to the customer."
        : "Review pricing, exclusions, payment terms, and missed scope before this leaves your shop.",
    missedScopeWarnings,
    laborMaterialConfidenceNotes,
    scopeClarityWarnings,
    suggestedExclusions,
    customerPriceDefenseNotes,
    contractorRiskNotes,
  }
}
