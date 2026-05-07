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
} from "./types"

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
  scopeText: string
  resultText?: string
  pricing: PricingInput
  schedule?: Schedule | null
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

  if (!scopeText || scopeText.length < 35) {
    addUnique(scopeClarityWarnings, "Scope description is short. Add affected rooms, quantities, surfaces, and finish expectations.")
    score -= 14
  }

  if ((args.scopeQuality?.score ?? 100) < 80) {
    addMany(scopeClarityWarnings, args.scopeQuality?.warnings, 4)
    score -= 8
  }

  if (/\b(tbd|as needed|misc|various|etc|general repairs?|touch[- ]?ups?|fix up|make ready)\b/i.test(combinedText)) {
    addUnique(scopeClarityWarnings, "Scope uses vague wording. Replace open-ended language with specific included work.")
    score -= 8
  }

  if (!hasAny(combinedText, ["prep", "patch", "repair", "sand", "demo", "remove", "scrape"])) {
    addUnique(missedScopeWarnings, "Prep or demolition expectations are not clearly stated.")
    addUnique(suggestedExclusions, "Excludes hidden damage, substrate repairs, or prep beyond the written scope unless approved in writing.")
    score -= 8
  }

  if (!hasAny(combinedText, ["material", "materials", "fixture", "paint", "tile", "flooring", "allowance", "owner supplied", "contractor supplied"])) {
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

  if (!args.schedule || ((args.schedule.rationale?.length ?? 0) === 0 && !args.schedule.crewDays && !args.schedule.calendarDays)) {
    addUnique(scopeClarityWarnings, "Schedule assumptions are missing or thin. Add expected duration and timing assumptions.")
    addUnique(suggestedExclusions, "Excludes delays from material availability, client changes, inspections, or site access issues.")
    score -= 7
  }

  if (!args.deposit?.enabled) {
    addUnique(contractorRiskNotes, "Payment/deposit clarity is missing. Add deposit or payment terms before sending.")
    score -= 6
  }

  if (!hasAny(combinedText, ["approve", "approval", "signature", "authorized", "acceptance"])) {
    addUnique(scopeClarityWarnings, "Customer approval language is not prominent. Confirm the customer knows approval authorizes the listed scope and price.")
    score -= 5
  }

  if (args.materialsList?.confirmItems?.length) {
    addMany(missedScopeWarnings, args.materialsList.confirmItems.slice(0, 3), 6)
    score -= Math.min(6, args.materialsList.confirmItems.length * 2)
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
