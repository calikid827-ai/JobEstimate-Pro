import type { EstimateStructuredSection, Schedule, ScopeSignals } from "./types"
import {
  buildEstimatorScopeFacts,
  type EstimatorScopeFacts,
  type EstimatorScopeTrade,
} from "./estimator-scope-facts"

export type ScheduleSequencingReview = {
  contractorRiskNotes: string[]
  scopeClarityWarnings: string[]
  suggestedExclusions: string[]
  missedScopeWarnings: string[]
}

export type BuildScheduleSequencingReviewArgs = {
  selectedTrade?: string
  scopeText: string
  resultText?: string
  schedule?: Schedule | null
  scopeSignals?: ScopeSignals
  estimateSections?: EstimateStructuredSection[] | null
}

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function addUnique(items: string[], value: string, max = 3) {
  const clean = String(value || "").replace(/\s+/g, " ").trim()
  if (!clean) return
  if (items.some((item) => item.toLowerCase() === clean.toLowerCase())) return
  if (items.length >= max) return
  items.push(clean)
}

function resolveTrade(args: BuildScheduleSequencingReviewArgs, text: string, facts: EstimatorScopeFacts) {
  const selected = normalize(args.selectedTrade || "")
  if (selected && selected !== "general_renovation" && selected !== "general renovation") return selected

  const sectionTrade = normalize(args.estimateSections?.[0]?.trade || "")
  if (sectionTrade && sectionTrade !== "general_renovation" && sectionTrade !== "general renovation") {
    return sectionTrade
  }

  if (facts.trueMixedTrades) return "general_renovation"
  if (facts.includedTrades.includes("wallcovering")) return "wallcovering"
  if (facts.includedTrades.includes("bathroom_tile")) return "bathroom_tile"
  if (facts.includedTrades.includes("electrical")) return "electrical"
  if (facts.includedTrades.includes("plumbing")) return "plumbing"
  if (facts.includedTrades.includes("flooring")) return "flooring"
  if (facts.includedTrades.includes("drywall")) return "drywall"
  if (facts.includedTrades.includes("painting")) return "painting"

  if (hasAny(text, [/\bwallcovering|wallpaper|wall covering\b/])) return "wallcovering"
  if (hasAny(text, [/\bbathroom|shower|tub|waterproof|tile\b/])) return "bathroom_tile"
  if (hasAny(text, [/\belectrical|outlets?|switches?|wiring|circuits?|panel|breakers?\b/])) return "electrical"
  if (hasAny(text, [/\bplumbing|toilets?|faucets?|sinks?|drains?|supply lines?|valves?\b/])) return "plumbing"
  if (hasAny(text, [/\bflooring|lvp|laminate|hardwood|carpet|subfloor|transitions?\b/])) return "flooring"
  if (hasAny(text, [/\bdrywall|sheetrock|skim|texture|patch\b/])) return "drywall"
  if (hasAny(text, [/\bpaint|painting|primer|prime|coats?\b/])) return "painting"
  return "general_renovation"
}

function scheduleText(args: BuildScheduleSequencingReviewArgs) {
  return normalize([...(args.schedule?.rationale || []), args.scopeSignals?.reason || ""].join(" "))
}

function hasMultiVisitSchedule(args: BuildScheduleSequencingReviewArgs, text: string) {
  const visits = Number(args.schedule?.visits || 0)
  const crewDays = Number(args.schedule?.crewDays || 0)
  if (visits >= 2 || crewDays >= 2 || args.scopeSignals?.needsReturnVisit) return true

  return hasAny(text, [
    /\breturn trip|return visit|multiple visits?|multi[-\s]*visit|phase|phasing|sequencing\b/,
    /\bdry time|drying time|cure time|curing|set time|grout cure\b/,
  ])
}

function hasScheduleSequencingLanguage(text: string) {
  return hasAny(text, [
    /\bsequence|sequencing|phase|phasing|return trip|return visit|multiple visits?\b/,
    /\bdry time|drying time|cure time|curing|set time|grout cure\b/,
    /\bbefore\s+(paint|painting|fixture|fixtures|trim|base|baseboard|wallcovering|install)\b/,
  ])
}

function hasInspectionAccessPatchLanguage(text: string) {
  const hasInspection = hasAny(text, [/\bpermit|inspection|inspect|code\b/])
  const hasAccess = hasAny(text, [/\baccess|open wall|open ceiling|attic|crawl|slab\b/])
  const hasPatch = hasAny(text, [
    /\bpatch|patching|close[-\s]*up|wall repair|ceiling repair|repair by others|patching by others\b/,
  ])

  return hasInspection && hasAccess && hasPatch
}

function hasOwnerMaterialLeadTime(text: string) {
  return hasAny(text, [
    /\bowner[-\s]*supplied|customer[-\s]*supplied|by owner|owner provides?|customer provides?\b/,
    /\bmaterial selection|fixture selection|finish selection|allowance\b/,
  ])
}

function hasOwnerFixtureLeadTime(text: string) {
  return hasAny(text, [
    /\b(owner[-\s]*supplied|customer[-\s]*supplied|by owner|owner provides?|customer provides?)\b.{0,80}\b(fixtures?|toilets?|faucets?|sinks?|vanit(?:y|ies)|lights?)\b/,
    /\b(fixtures?|toilets?|faucets?|sinks?|vanit(?:y|ies)|lights?)\b.{0,80}\b(owner[-\s]*supplied|customer[-\s]*supplied|by owner|owner provides?|customer provides?)\b/,
    /\bfixture selection\b/,
  ])
}

function sentenceParts(value: string) {
  return String(value || "")
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function isExcludedOrContextOnly(text: string) {
  return hasAny(text, [
    /\b(excludes?|excluded|excluding|not included|does not include|does not cover|by others|without)\b/,
    /\b(schedule consideration|coordination only|by separate trade|dry time|drying time)\b/,
  ])
}

function hasIncludedPatchOrTextureWork(text: string) {
  return sentenceParts(text).some(
    (part) =>
      hasAny(part, [/\bpatch|patching|skim|texture|drywall repair|drywall patch|mud|joint compound\b/]) &&
      !isExcludedOrContextOnly(part)
  )
}

function leadTimeAlreadyAddressed(text: string) {
  return hasAny(text, [
    /\blead time|available before start|on site before|materials? on site|fixtures? on site\b/,
    /\bowner supplied .* before work|customer supplied .* before work\b/,
  ])
}

function factsIncludeTrade(facts: EstimatorScopeFacts, trade: EstimatorScopeTrade) {
  return facts.includedTrades.includes(trade)
}

function factsIncludeAnyTrade(facts: EstimatorScopeFacts, trades: EstimatorScopeTrade[]) {
  return trades.some((trade) => factsIncludeTrade(facts, trade))
}

export function buildScheduleSequencingReview(
  args: BuildScheduleSequencingReviewArgs
): ScheduleSequencingReview | null {
  const scopeFacts = buildEstimatorScopeFacts(args.scopeText)
  const scopeText = normalize(scopeFacts.includedWorkText || args.scopeText)
  const resultText = normalize(args.resultText || "")
  const schedText = scheduleText(args)
  const rawReviewText = normalize(`${args.scopeText} ${args.resultText || ""} ${schedText}`)
  const text = normalize(`${scopeText} ${resultText} ${schedText}`)
  if (!text) return null

  const trade = resolveTrade(args, text, scopeFacts)
  const hasMultiVisit = hasMultiVisitSchedule(args, text)
  const contractorRiskNotes: string[] = []
  const scopeClarityWarnings: string[] = []
  const suggestedExclusions: string[] = []
  const missedScopeWarnings: string[] = []

  const patchAndPaint =
    (scopeFacts.patchTextureIncluded || hasIncludedPatchOrTextureWork(resultText)) &&
    (factsIncludeTrade(scopeFacts, "painting") || hasAny(text, [/\bpaint|painting|prime|primer|coat|coats\b/]))

  if (
    (trade === "painting" || trade === "drywall" || trade === "general_renovation") &&
    patchAndPaint &&
    !hasMultiVisit
  ) {
    addUnique(
      contractorRiskNotes,
      "Patch/texture/paint sequencing may need dry time and a return visit before final finish."
    )
    addUnique(
      suggestedExclusions,
      "Excludes schedule delays from patch, texture, primer, or paint dry-time beyond the stated visit assumptions."
    )
  }

  const wetAreaTile =
    (trade === "bathroom_tile" || (trade === "general_renovation" && factsIncludeTrade(scopeFacts, "bathroom_tile"))) &&
    hasAny(text, [/\bshower|tub|wet area|pan|waterproof|waterproofing|membrane|backer|cement board|tile|grout\b/]) &&
    hasAny(text, [/\bwaterproof|waterproofing|membrane|pan|tile|grout\b/])

  if (wetAreaTile && !hasMultiVisit && !hasScheduleSequencingLanguage(text)) {
    addUnique(
      contractorRiskNotes,
      "Shower/tile sequencing may need waterproofing, tile, grout cure time, and fixture/accessory return coordination."
    )
    addUnique(
      suggestedExclusions,
      "Excludes delays from waterproofing cure time, grout cure time, inspections, fixture availability, or glass/accessory work by others."
    )
  }

  const roughIn =
    (trade === "electrical" ||
      trade === "plumbing" ||
      (trade === "general_renovation" && factsIncludeAnyTrade(scopeFacts, ["electrical", "plumbing"]))) &&
    hasAny(text, [/\brough[-\s]*in|run new|relocate|new circuit|supply line|drain line|water line|wiring\b/])

  if (roughIn && !hasInspectionAccessPatchLanguage(text)) {
    addUnique(
      scopeClarityWarnings,
      "Rough-in sequencing should confirm access, inspection/code assumptions, and patch/close-up responsibility."
    )
    addUnique(
      suggestedExclusions,
      "Excludes concealed-condition repairs, inspection delays, and wall/ceiling/floor patching unless specifically included."
    )
  }

  const flooringSequence =
    trade === "flooring" &&
    hasAny(text, [/\bdemo|remove|removal|tear out|existing\b/]) &&
    hasAny(text, [/\bsubfloor|level|leveling|prep|underlayment\b/]) &&
    hasAny(text, [/\binstall|installation|lvp|flooring|laminate|hardwood|carpet\b/]) &&
    hasAny(text, [/\btransition|transitions|threshold|base|baseboard|shoe|quarter round\b/])

  if (flooringSequence && !hasScheduleSequencingLanguage(text)) {
    addUnique(
      contractorRiskNotes,
      "Flooring sequence should be reviewed for demo, subfloor prep, install, transitions/base, and protection timing."
    )
    addUnique(
      suggestedExclusions,
      "Excludes delays from subfloor leveling, moisture issues, material acclimation, transition availability, or base/trim work by others."
    )
  }

  const wallcoveringSequence =
    (trade === "wallcovering" || scopeFacts.wallcoveringPrepContext) &&
    hasAny(text, [/\bremove|removal|strip|existing|wall repair|skim|prime|primer|prep|substrate\b/]) &&
    hasAny(text, [/\bpattern|repeat|match|layout|seam|seams|install|wallcovering|wallpaper\b/])

  if (wallcoveringSequence && !hasScheduleSequencingLanguage(text)) {
    addUnique(
      contractorRiskNotes,
      "Wallcovering sequence should confirm removal/prep, primer, layout, pattern match, and install timing."
    )
  }

  const generalSequence =
    trade === "general_renovation" &&
    scopeFacts.trueMixedTrades &&
    hasAny(text, [/\bdemo|demolition|remove|removal\b/]) &&
    hasAny(text, [/\brough[-\s]*in|plumbing|electrical|inspection|inspect\b/]) &&
    hasAny(text, [/\bdrywall|close[-\s]*up|patch|flooring|tile|paint|finish|finishes\b/])

  if (generalSequence && !hasScheduleSequencingLanguage(text)) {
    addUnique(
      contractorRiskNotes,
      "General renovation sequence should confirm demo, rough-in, inspection, close-up, and finish phase order."
    )
  }

  if (
    (scopeFacts.materialResponsibilities.includes("owner_supplied") ||
      scopeFacts.materialResponsibilities.includes("customer_supplied") ||
      hasOwnerMaterialLeadTime(text)) &&
    !leadTimeAlreadyAddressed(text)
  ) {
    const materialLabel = hasOwnerFixtureLeadTime(text) || hasOwnerFixtureLeadTime(rawReviewText) ? "materials or fixtures" : "materials"
    addUnique(
      contractorRiskNotes,
      `Owner-supplied ${materialLabel} may affect start date, return trips, and install sequencing if not on site before work starts.`
    )
    addUnique(
      suggestedExclusions,
      hasOwnerFixtureLeadTime(text)
        ? "Excludes delays or return trips caused by late owner-supplied materials, fixtures, selections, or missing parts."
        : "Excludes delays or return trips caused by late owner-supplied materials, selections, or missing parts."
    )
  }

  if (
    contractorRiskNotes.length === 0 &&
    scopeClarityWarnings.length === 0 &&
    suggestedExclusions.length === 0 &&
    missedScopeWarnings.length === 0
  ) {
    return null
  }

  return {
    contractorRiskNotes,
    scopeClarityWarnings,
    suggestedExclusions,
    missedScopeWarnings,
  }
}
