export type EstimatorScopeTrade =
  | "painting"
  | "drywall"
  | "flooring"
  | "electrical"
  | "plumbing"
  | "bathroom_tile"
  | "wallcovering"
  | "carpentry"
  | "demolition"
  | "glass"
  | "furniture_moving"

export type EstimatorMaterialResponsibility =
  | "owner_supplied"
  | "customer_supplied"
  | "contractor_supplied"
  | "allowance"

export type EstimatorScopeFactClause = {
  text: string
  includedWork: boolean
  excludedByOthers: boolean
  protectionOnly: boolean
  coordinationOnly: boolean
  existingCondition: boolean
  ownerSupplied: boolean
  customerSupplied: boolean
  contractorSupplied: boolean
  permitInspection: boolean
  quantityLocation: boolean
  trades: EstimatorScopeTrade[]
}

export type EstimatorScopeFacts = {
  rawText: string
  normalizedText: string
  clauses: EstimatorScopeFactClause[]
  includedWorkText: string
  boundaryText: string
  includedTrades: EstimatorScopeTrade[]
  excludedTrades: EstimatorScopeTrade[]
  coordinationTrades: EstimatorScopeTrade[]
  protectionTrades: EstimatorScopeTrade[]
  existingConditionTrades: EstimatorScopeTrade[]
  materialResponsibilities: EstimatorMaterialResponsibility[]
  patchTextureIncluded: boolean
  patchTextureExcluded: boolean
  tileTrimContext: boolean
  wallcoveringPrepContext: boolean
  baseboardReplacementRemovalContext: boolean
  trueMixedTrades: boolean
  hasIncludedWork: boolean
  hasExclusionOrByOthersBoundary: boolean
  hasMaterialResponsibility: boolean
  hasPermitResponsibility: boolean
  hasQuantityLocationSignal: boolean
}

const QUANTITY_LOCATION_PATTERNS = [
  /\b\d+(\.\d+)?\s?(sq\.?\s?ft|sf|square feet|square foot|lf|linear feet|linear foot|ln ft)\b/,
  /\b\d+\s?(rooms?|bedrooms?|bathrooms?|areas?|walls?|ceilings?|doors?|windows?|outlets?|switches?|fixtures?|lights?|receptacles?|circuits?|panels?|sinks?|toilets?|faucets?|vanities?|showers?|sheets?|patches?)\b/,
  /\b\d+\s+\d+(?:\.\d+)?\s*['’′]?\s*[x×]\s*\d+(?:\.\d+)?\s*['’′]?\s+(?:rooms?|bedrooms?|bathrooms?)\b/,
  /\brooms?\s+\d+[a-z]?\s*(?:-|to|through|thru)\s*\d+[a-z]?\b/,
  /\b(?:room|area|unit|suite)\s+\d+[a-z]?\b/,
  /\bper plans?\b|\bselected sheets?\b/,
]

const WORK_VERB_PATTERN =
  /\b(install|replace|repair|remove|removal|reinstall|reset|demo|demolish|paint|prime|patch|skim|texture|match|waterproof|rough[-\s]*in|run|relocate|set|mount|hang|finish|caulk|sand|prep|touch[-\s]*up|r&r|remove and reinstall)\b/

const EXCLUDED_BY_OTHERS_PATTERN =
  /\b(exclude|excluded|excludes|excluding|not included|not part of|does not include|does not cover|by others|by owner|owner to|owner will|customer to|customer will|gc to|general contractor to|separate contractor|separate trade|nic)\b/

const PROTECTION_PATTERN =
  /\b(protect|protection|safeguard|cover|covered|mask|masking|drop cloth|adjacent finishes?)\b/

const FLOOR_PROTECTION_PAINT_CONTEXT_PATTERN =
  /\b(protect|protection|safeguard|cover|covered|mask|masking|drop cloths?)\b.{0,80}\b(floors?|flooring)\b.{0,80}\b(overspray|paint\s+drips?|drips?)\b|\b(floors?|flooring)\b.{0,80}\b(protect|protected|protection|covered|mask|masked|masking|drop cloths?)\b.{0,80}\b(overspray|paint\s+drips?|drips?)\b/i

const FLOOR_TRUE_WORK_PATTERN =
  /\b(install|replace|repair|remove|removal|level|underlayment|demo|demolition)\b.{0,80}\b(floors?|flooring|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\b|\b(floors?|flooring|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\b.{0,80}\b(install|replacement|replace|repair|remove|removal|level|underlayment|demo|demolition)\b/i

const DRYWALL_SUBSTRATE_PAINT_CONTEXT_PATTERN =
  /\b(?:standard|existing|paintable|previously\s+painted)?\s*(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b.{0,120}\b(?:paint|painting|painted|receive\s+paint|coats?)\b|\b(?:paint|painting|painted|coats?)\b.{0,120}\b(?:over\s+)?(?:standard|existing|paintable|previously\s+painted)?\s*(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b/i

const DRYWALL_EXISTING_CONDITION_CONTEXT_PATTERN =
  /\b(?:assumes?|existing|standard)\b.{0,100}\b(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?|walls?\s+and\s+ceilings?)\b.{0,180}\b(?:without|no|not)\b.{0,120}\b(?:concealed\s+damage\s+requiring\s+corrective\s+work|corrective\s+work|(?:extensive\s+)?demolition|(?:extensive\s+)?repairs?|repair\s+work|replacement|major\s+repairs?)\b/i

const DRYWALL_TRUE_WORK_PATTERN =
  /\b(install|replace|repair|patch|hang|finish|texture|demo|demolition)\b.{0,80}\b(drywall|sheetrock|gypsum)\b|\b(drywall|sheetrock|gypsum)\b.{0,80}\b(install|replacement|replace|repair|patch|hang|finish|texture|demo|demolition)\b/i

const ELECTRICAL_COVER_HANDLING_PAINT_CONTEXT_PATTERN =
  /\b(?:remove|removal|reinstall|reinstallation|removed|reinstalled|handling|handled)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(?:painting|paint|painting\s+only|no\s+electrical\s+work|without\s+(?:wiring|device|circuit))\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,100}\b(?:remove|removal|reinstall|reinstallation|removed|reinstalled|handling|handled)\b.{0,120}\b(?:painting|paint|painting\s+only|no\s+electrical\s+work|without\s+(?:wiring|device|circuit))\b|\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\b.{0,180}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,160}\b(?:without|only|painting|paint)\b/i

const COORDINATION_PATTERN =
  /\b(coordinate|coordination|avoid interference|no interference|not interfere|work around|working around|around existing)\b/

const EXISTING_CONDITION_PATTERN =
  /\b(existing|remain|to remain|leave in place|salvage|reuse|protect in place)\b/

const OWNER_SUPPLIED_PATTERN =
  /\b(owner[-\s]+supplied|owner\s+(?:(?:will|to)\s+)?(?:suppl(?:y|ies)|provides?)|by owner)\b/

const CUSTOMER_SUPPLIED_PATTERN =
  /\b(customer[-\s]+supplied|customer\s+(?:(?:will|to)\s+)?(?:suppl(?:y|ies)|provides?))\b/

const CONTRACTOR_SUPPLIED_PATTERN =
  /\b(contractor[-\s]+supplied|contractor\s+(?:(?:will|to)\s+)?(?:suppl(?:y|ies)|provides?))\b/

const ALLOWANCE_PATTERN = /\b(allowance|material selection|finish selection|materials? included|include materials?)\b/

const PERMIT_INSPECTION_PATTERN = /\b(permit|permits|inspection|inspect|code)\b/

const BOUNDARY_CONTINUATION_PATTERN =
  /\b(drywall|sheetrock|skim|texture|texture matching|texture match|trim|ceiling paint|electrical|plumbing|flooring|carpentry|baseboards?|painting|paint|demo|demolition|glass|furniture moving|fixtures?|tile)\b/

const TRADE_PATTERNS: Array<{ trade: EstimatorScopeTrade; pattern: RegExp }> = [
  { trade: "painting", pattern: /\b(paint|painting|primer|prime|coats?)\b/ },
  { trade: "drywall", pattern: /\b(drywall|sheetrock|gypsum|skim\s*coat|texture\s*match|texture\s*matching|level\s+[345]|patch(?:ing|es)?)\b/ },
  { trade: "flooring", pattern: /\b(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet|underlayment|transitions?)\b/ },
  { trade: "electrical", pattern: /\b(electrical|electrician|wiring|conduits?|outlets?|receptacles?|devices?|switches?|circuits?|breakers?|panels?|gfcis?|lighting|lights?|light fixtures?|vanity lights?|rough[-\s]*in)\b/ },
  { trade: "plumbing", pattern: /\b(plumbing|plumber|water lines?|supply lines?|drains?|valves?|toilets?|faucets?|sinks?|vanit(?:y|ies)(?!\s+lights?)|shower valves?)\b/ },
  { trade: "bathroom_tile", pattern: /\b(tile|tiling|grout|thinset|waterproof(?:ing)?|membrane|shower|tub|backer\s*board|cement\s*board|tile\s+trim|edge\s+trim)\b/ },
  { trade: "wallcovering", pattern: /\b(wallcovering|wall\s+covering|wallpaper|vinyl\s+wallcovering|paper\s+hanging|pattern\s+match|pattern\s+repeat|seams?)\b/ },
  { trade: "carpentry", pattern: /\b(carpentry|carpenter|framing|blocking|baseboards?|casing|crown|millwork|trim|doors?|cabinets?)\b/ },
  { trade: "demolition", pattern: /\b(demo|demolition|tear[-\s]*out|remove\s+existing|haul[-\s]*off|haul\s+away)\b/ },
  { trade: "glass", pattern: /\b(glass|shower\s+glass)\b/ },
  { trade: "furniture_moving", pattern: /\b(furniture moving|move furniture|moving furniture)\b/ },
]

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values))
}

function splitClauses(text: string): string[] {
  return normalize(text)
    .replace(/[•●▪◦]/g, ", ")
    .split(/\s*(?:[.;\n\r]+|,\s+|\s+-\s+)\s*/)
    .map((clause) => clause.trim())
    .filter(Boolean)
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function isFloorProtectionPaintContext(text: string) {
  return FLOOR_PROTECTION_PAINT_CONTEXT_PATTERN.test(text) && !FLOOR_TRUE_WORK_PATTERN.test(text)
}

function detectTrades(text: string): EstimatorScopeTrade[] {
  let trades = TRADE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ trade }) => trade)

  if (
    trades.includes("drywall") &&
    trades.includes("painting") &&
    DRYWALL_SUBSTRATE_PAINT_CONTEXT_PATTERN.test(text) &&
    !DRYWALL_TRUE_WORK_PATTERN.test(text)
  ) {
    trades = trades.filter((trade) => trade !== "drywall")
  }

  if (trades.includes("drywall") && DRYWALL_EXISTING_CONDITION_CONTEXT_PATTERN.test(text)) {
    trades = trades.filter((trade) => trade !== "drywall")
  }

  if (trades.includes("electrical") && ELECTRICAL_COVER_HANDLING_PAINT_CONTEXT_PATTERN.test(text)) {
    trades = trades.filter((trade) => trade !== "electrical")
  }

  if (
    trades.includes("bathroom_tile") &&
    /\b(tile\s+trim|edge\s+trim|trim\s+piece|trim\s+pieces|schluter|jolly|bullnose|trim)\b/.test(text) &&
    !/\b(baseboards?|casing|crown|door|window|finish\s+carpentry|carpentry)\b/.test(text)
  ) {
    return trades.filter((trade) => trade !== "carpentry")
  }

  if (
    trades.includes("wallcovering") &&
    trades.includes("painting") &&
    /\b(wall\s+prep|primer|prime|substrate|adhesive|layout|pattern)\b/.test(text) &&
    !/\bpaint(?:ing)?\s+(walls?|ceilings?|trim|doors?|cabinets?)\b|\brepaint\b|\bfinish\s+coats?\b|\bcoating\s+application\b/.test(
      text
    )
  ) {
    trades = trades.filter((trade) => trade !== "painting")
  }

  return uniq(trades)
}

// Resolve the existing material question from explicit scope relationships, rather
// than from a supplier word elsewhere in the scope or a transient dropdown value.
const MATERIAL_SUBJECT_NEGATION = /^(?:no|none\s+of(?:\s+the)?|not(?:\s+any|\s+the)?|neither|zero|without)\b\s*/

function materialSubject(subject: string) {
  subject = normalize(subject)
  const keys = uniq(subject.replace(/\bpainting\b/g, "paint").replace(/\b(?:sheetrock|gypsum)\b/g, "drywall")
    .match(/\b[a-z]+\b/g)?.filter((word) =>
      !["the", "and", "or", "nor", "but", "all", "any", "no", "none", "not", "neither", "zero", "without", "of", "main", "standard", "finish", "finishing", "material", "materials", "electrical", "plumbing", "listed", "included", "described", "in", "this", "scope"].includes(word)
    ).map((word) => word.replace(/s$/, "")) || [])
  const generic = /^(?:the\s+)?(?:(?:all|main|standard)\s+)?materials?(?:\s+and\s+fixtures?)?(?:\s+(?:listed|included|described)\s+in\s+(?:this|the)\s+scope)?$/.test(subject)
  return { keys, generic }
}

export function hasMaterialResponsibilityForTrade(
  facts: Pick<EstimatorScopeFacts, "clauses" | "includedTrades"> & Partial<Pick<EstimatorScopeFacts, "rawText">>,
  trade: string,
  requestedSubject?: string
): boolean {
  // Keep a material list and its comma-separated exclusions in one relationship.
  // The general scope-clause splitter intentionally separates those commas.
  const supplierClauses = facts.rawText == null
    ? facts.clauses.map((clause) => clause.text)
    : facts.rawText.toLowerCase().split(/[.;\n\r]+/).map(normalize)
  const statements = supplierClauses.flatMap((clause) =>
    clause.split(/(?:\s+(?:and|while|but)\s+|,\s*)(?=(?:the\s+)?(?:owner|customer|contractor)\b)/)
  ).flatMap((text) => {
    const direct = /\b(owner|customer|contractor)(?:[-\s]+(supplied)|\s+(?:(will|to|does)\s+)?(?:(not|never)\s+)?(suppl(?:y|ies)|provides?))\s+(.+)/.exec(text)
    const reverse = /^(.+?)\s+(?:(?:will\s+be|to\s+be|is|are)\s+)?(?:(not)\s+)?(?:supplied|provided)\s+by\s+(?:the\s+)?(owner|customer|contractor)\b/.exec(text)
    if (!direct && !reverse) return []
    const supplier = (direct?.[1] || reverse?.[3]) === "contractor" ? "contractor" : "owner"
    const rawSubject = (direct?.[6] || reverse?.[1] || "").replace(/[()]/g, " ").replace(/\s+(?:and|while|but)$/, "").trim()
    const [included, ...excludedSubjects] = rawSubject.split(/\s+\b(?:except(?:\s+for)?|excluding|other\s+than|(?:but\s+)?not)\b\s+/)
    const includedSubject = included.replace(/,\s*$/, "").trim()
    const excludedKeys = materialSubject(excludedSubjects.join(" and ")).keys
    // A denial may live in the material list rather than beside the verb.
    // Keep affirmative alternatives in that list separate from the denied item.
    const subjectParts = /\b(?:no|none|neither|zero|without|not)\b/.test(includedSubject)
      ? includedSubject.split(/\s+(and|or|nor|but)\s+/)
      : [includedSubject]
    let subjectNegative = false
    return subjectParts.flatMap((part, index) => {
      if (index % 2) return []
      subjectNegative = MATERIAL_SUBJECT_NEGATION.test(part) || (subjectNegative && subjectParts[index - 1] !== "but")
      const subject = part.replace(MATERIAL_SUBJECT_NEGATION, "").trim()
      const trades = detectTrades(subject)
      const { keys, generic } = materialSubject(subject)
      if (!generic && !trades.length && !/\bfixtures?\b/.test(subject)) return []
      return [{
        supplier, subject, trades, generic, keys, excludedKeys,
        negative: Boolean(subjectNegative || direct?.[4] || reverse?.[2] || /\b(?:not|no|without)\s+$/.test(text.slice(0, direct?.index || 0))),
        uncertain: /\?|\b(if|unless|might|may|pending|unconfirmed|undecided|not\s+(?:yet\s+)?confirmed|to\s+be\s+(?:confirmed|determined))\b/.test(text),
      }]
    })
  })
  // Descriptive work such as "Add painting ..." can name the material scope
  // without matching an included-work verb. Use that existing clause evidence
  // only for this question; boundary and supplier clauses cannot create a target.
  const materialScopeTrades = facts.includedTrades.length ? facts.includedTrades : uniq(
    facts.clauses.filter((clause) =>
      !clause.excludedByOthers && !clause.protectionOnly && !clause.coordinationOnly &&
      !clause.existingCondition && !clause.ownerSupplied && !clause.customerSupplied &&
      !clause.contractorSupplied && !clause.permitInspection && !ALLOWANCE_PATTERN.test(clause.text)
    ).flatMap((clause) => clause.trades)
  )
  const targets = TRADE_PATTERNS.some((entry) => entry.trade === trade)
    ? [trade]
    : materialScopeTrades.filter((included) =>
      // Bare hole/imperfection patch prep in painting does not establish a
      // separate drywall material-supply question. Explicit drywall work does.
      included !== "drywall" || !materialScopeTrades.includes("painting") ||
      facts.clauses.some((clause) => clause.includedWork && /\b(drywall|sheetrock|gypsum|skim|texture)\b/.test(clause.text))
    )
  const relevant = (statement: typeof statements[number], target: string) =>
    statement.generic || statement.trades.includes(target as EstimatorScopeTrade) ||
    (["electrical", "plumbing", "bathroom_tile"].includes(target) && /\bfixtures?\b/.test(statement.subject))
  const overlaps = (left: typeof statements[number], right: typeof statements[number]) =>
    (left.generic && right.generic) ||
    left.keys.some((key) => !right.excludedKeys.includes(key) && (right.generic || right.keys.includes(key))) ||
    right.keys.some((key) => !left.excludedKeys.includes(key) && left.generic)

  const resolvesMaterial = (key: string) => {
    const applicable = statements.filter((statement) =>
      !statement.excludedKeys.includes(key) && (statement.generic || statement.keys.includes(key))
    )
    const positive = applicable.filter((statement) => !statement.negative && !statement.uncertain)
    return positive.length > 0 && !positive.some((answer) => applicable.some((other) =>
      other.uncertain || (other.negative ? other.supplier === answer.supplier : other.supplier !== answer.supplier)
    ))
  }
  const requested = requestedSubject ? materialSubject(requestedSubject) : null
  if (requested && !requested.keys.every(resolvesMaterial)) return false
  if (requested && !requested.generic && requested.keys.length) return true

  return (targets.length ? targets : ["general_renovation"]).every((target) => {
    // The existing painting question names paint. Primer alone is an answer
    // about a different material, even though both have painting-trade evidence.
    const applicable = statements.filter((statement) => relevant(statement, target))
    if (target === "painting" && applicable.length && !resolvesMaterial("paint")) return false
    const positive = applicable.filter((statement) => !statement.negative && !statement.uncertain)
    if (!positive.length) {
      // Retain the existing allowance/selection treatment; explicit supply
      // contradictions still require clarification below.
      return !applicable.length && facts.clauses.some((clause) => ALLOWANCE_PATTERN.test(clause.text))
    }
    return !positive.some((answer) => applicable.some((other) =>
      overlaps(answer, other) &&
      (other.uncertain || (other.negative ? other.supplier === answer.supplier : other.supplier !== answer.supplier))
    ))
  })
}

export function isResolvedMaterialSupplyPrompt(
  message: string,
  args: { scopeText: string; selectedTrade?: string | null }
): boolean {
  const prompt = normalize(message).replace(/[.!?]+$/, "")
  const question = /^(?:confirm\s+)?who\s+(?:(?:will\s+)?(?:suppl(?:y|ies)|provides?)|is\s+responsible\s+for\s+(?:supplying|providing))\s+(.+)$/.exec(prompt)
  const genericResponsibility = /^confirm\s+(?:the\s+)?materials?\s+supply\s+responsibility$/.test(prompt)
  const subject = question?.[1] || (genericResponsibility ? "materials" : "")
  if (!subject) return false
  // Only supplier-only prompts are redundant. Product selection, delivery,
  // quantities and any unknown/compound instruction remain actionable.
  const subjectWords = subject.match(/\b[a-z]+\b/g) || []
  const allowedWords = new Set([
    "the", "main", "all", "standard", "finish", "finishing", "and", "or", "listed", "in", "this", "scope",
    "material", "materials", "paint", "painting", "fixture", "fixtures", "device", "devices", "electrical",
    "plumbing", "drywall", "sheetrock", "gypsum", "tile", "wallcovering", "flooring", "carpentry", "primer",
    "grout", "thinset", "membrane", "underlayment", "transition", "transitions", "outlet", "outlets",
    "receptacle", "receptacles", "switch", "switches", "valve", "valves", "faucet", "faucets",
    "baseboard", "baseboards", "door", "doors", "cabinet", "cabinets", "wallpaper",
  ])
  if (!subjectWords.length || !subjectWords.every((word) => allowedWords.has(word)) || /[^a-z\s-]/.test(subject)) return false
  const facts = buildEstimatorScopeFacts(args.scopeText)
  const subjectTrades = detectTrades(subject)
  if (!subjectTrades.length && !/\b(materials?|fixtures?|devices?)\b/.test(subject)) return false
  return hasMaterialResponsibilityForTrade(
    facts, args.selectedTrade || "general_renovation", subject
  )
}

function materialResponsibilitiesForClause(clause: EstimatorScopeFactClause) {
  const responsibilities: EstimatorMaterialResponsibility[] = []
  if (clause.ownerSupplied) responsibilities.push("owner_supplied")
  if (clause.customerSupplied) responsibilities.push("customer_supplied")
  if (clause.contractorSupplied) responsibilities.push("contractor_supplied")
  if (ALLOWANCE_PATTERN.test(clause.text)) responsibilities.push("allowance")
  return responsibilities
}

function classifyClause(text: string, boundaryCarry: boolean): EstimatorScopeFactClause {
  const ownerSupplied = OWNER_SUPPLIED_PATTERN.test(text)
  const customerSupplied = CUSTOMER_SUPPLIED_PATTERN.test(text)
  const contractorSupplied = CONTRACTOR_SUPPLIED_PATTERN.test(text)
  const permitInspection = PERMIT_INSPECTION_PATTERN.test(text)
  const quantityLocation = hasAny(text, QUANTITY_LOCATION_PATTERNS)
  const protection = PROTECTION_PATTERN.test(text)
  const coordination = COORDINATION_PATTERN.test(text)
  const existing = EXISTING_CONDITION_PATTERN.test(text)
  const explicitExcludedByOthers = EXCLUDED_BY_OTHERS_PATTERN.test(text)
  const continuedExclusion =
    boundaryCarry &&
    BOUNDARY_CONTINUATION_PATTERN.test(text) &&
    !ownerSupplied &&
    !customerSupplied &&
    !contractorSupplied &&
    !protection &&
    !coordination &&
    !existing &&
    !permitInspection
  const excludedByOthers = explicitExcludedByOthers || continuedExclusion
  const hasWorkVerb = WORK_VERB_PATTERN.test(text)
  const materialOnly = ownerSupplied || customerSupplied || contractorSupplied || ALLOWANCE_PATTERN.test(text)
  const protectionOnly = protection && (!hasWorkVerb || isFloorProtectionPaintContext(text)) && !excludedByOthers
  const coordinationOnly = coordination && !hasWorkVerb && !excludedByOthers
  const existingCondition = existing && !hasWorkVerb && !excludedByOthers
  const trades = detectTrades(text)
  const contextOnly =
    (DRYWALL_EXISTING_CONDITION_CONTEXT_PATTERN.test(text) && !trades.includes("drywall")) ||
    ELECTRICAL_COVER_HANDLING_PAINT_CONTEXT_PATTERN.test(text)

  return {
    text,
    includedWork:
      hasWorkVerb &&
      !excludedByOthers &&
      !protectionOnly &&
      !coordinationOnly &&
      !existingCondition &&
      !materialOnly &&
      !contextOnly,
    excludedByOthers,
    protectionOnly,
    coordinationOnly,
    existingCondition,
    ownerSupplied,
    customerSupplied,
    contractorSupplied,
    permitInspection,
    quantityLocation,
    trades,
  }
}

function isBoundaryClause(clause: EstimatorScopeFactClause) {
  return (
    clause.excludedByOthers ||
    clause.protectionOnly ||
    clause.coordinationOnly ||
    clause.existingCondition ||
    clause.ownerSupplied ||
    clause.customerSupplied ||
    clause.contractorSupplied ||
    clause.permitInspection
  )
}

function hasTileTrimContext(text: string, includedTrades: EstimatorScopeTrade[]) {
  return (
    includedTrades.includes("bathroom_tile") &&
    /\b(tile|grout|thinset|waterproof|waterproofing|membrane|shower\s+walls?|tub\s+surround|cement\s*board|backer\s*board)\b/.test(
      text
    ) &&
    /\b(tile\s+trim|edge\s+trim|trim\s+piece|trim\s+pieces|schluter|jolly|bullnose|\btrim\b)\b/.test(text) &&
    !/\b(baseboards?|casing|crown|door|window|finish\s+carpentry|carpentry)\b/.test(text)
  )
}

function hasWallcoveringPrepContext(includedText: string) {
  return (
    /\b(wallcovering|wall\s+covering|wallpaper|vinyl\s+wallcovering)\b/.test(includedText) &&
    /\b(wall\s+prep|prep|primer|prime|substrate|pattern\s+match|pattern\s+repeat|adhesive|layout)\b/.test(includedText)
  )
}

function hasBaseboardReplacementRemovalContext(text: string) {
  return (
    /\b(replace|replacement|install|installation)\b.{0,80}\b(baseboards?|trim|casing|crown|millwork)\b/.test(text) ||
    /\b(baseboards?|trim|casing|crown|millwork)\b.{0,80}\b(replace|replacement|install|installation)\b/.test(text) ||
    /\b(remov(?:e|al|ing)|dispos(?:e|al|ing)|demolition)\b.{0,90}\b(existing\s+)?(baseboards?|trim|casing|crown|millwork)\b/.test(text) ||
    /\b(existing\s+)?(baseboards?|trim|casing|crown|millwork)\b.{0,90}\b(remov(?:e|al|ing)|dispos(?:e|al|ing)|demolition)\b/.test(text)
  )
}

export function buildEstimatorScopeFacts(scope: string): EstimatorScopeFacts {
  const rawText = String(scope || "")
  const normalizedText = normalize(rawText)
  const clauses: EstimatorScopeFactClause[] = []
  let boundaryCarry = false

  for (const text of splitClauses(rawText)) {
    const clause = classifyClause(text, boundaryCarry)
    clauses.push(clause)
    boundaryCarry =
      /\b(excludes?|excluded|excluding|does\s+not\s+(?:include|cover)|not\s+included|without)\b/.test(clause.text) ||
      (boundaryCarry &&
        clause.excludedByOthers &&
        !clause.ownerSupplied &&
        !clause.customerSupplied &&
        !clause.contractorSupplied &&
        !clause.protectionOnly &&
        !clause.coordinationOnly &&
        !clause.existingCondition &&
        !clause.permitInspection)
  }

  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index]
    if (!clause.excludedByOthers || !/\bby others|by owner|separate trade|separate contractor|nic\b/.test(clause.text)) {
      continue
    }

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = clauses[previousIndex]
      if (previous.includedWork || isBoundaryClause(previous) || previous.trades.length === 0) break
      previous.excludedByOthers = true
    }
  }

  const includedClauses = clauses.filter((clause) => clause.includedWork)
  const boundaryClauses = clauses.filter(isBoundaryClause)
  const includedWorkText = includedClauses.map((clause) => clause.text).join(" ")
  const boundaryText = boundaryClauses.map((clause) => clause.text).join(" ")
  const includedTrades = uniq(includedClauses.flatMap((clause) => clause.trades)).filter(
    (trade) => trade !== "demolition" && trade !== "glass" && trade !== "furniture_moving"
  )
  const excludedTrades = uniq(clauses.filter((clause) => clause.excludedByOthers).flatMap((clause) => clause.trades))
  const coordinationTrades = uniq(clauses.filter((clause) => clause.coordinationOnly).flatMap((clause) => clause.trades))
  const protectionTrades = uniq(clauses.filter((clause) => clause.protectionOnly).flatMap((clause) => clause.trades))
  const existingConditionTrades = uniq(clauses.filter((clause) => clause.existingCondition).flatMap((clause) => clause.trades))
  const materialResponsibilities = uniq(clauses.flatMap(materialResponsibilitiesForClause))
  const patchTextureIncluded = includedClauses.some((clause) =>
    /\b(patch|patching|drywall repair|drywall patch|skim\s*coat|texture\s*match|texture\s*matching|texture)\b/.test(clause.text)
  )
  const patchTextureExcluded = clauses.some(
    (clause) =>
      clause.excludedByOthers &&
      /\b(patch|patching|drywall repair|drywall patch|skim\s*coat|texture\s*match|texture\s*matching|texture)\b/.test(
        clause.text
      )
  )

  return {
    rawText,
    normalizedText,
    clauses,
    includedWorkText,
    boundaryText,
    includedTrades,
    excludedTrades,
    coordinationTrades,
    protectionTrades,
    existingConditionTrades,
    materialResponsibilities,
    patchTextureIncluded,
    patchTextureExcluded,
    tileTrimContext: hasTileTrimContext(normalizedText, includedTrades),
    wallcoveringPrepContext: hasWallcoveringPrepContext(includedWorkText),
    baseboardReplacementRemovalContext: hasBaseboardReplacementRemovalContext(includedWorkText),
    trueMixedTrades: includedTrades.length >= 2,
    hasIncludedWork: includedClauses.length > 0,
    hasExclusionOrByOthersBoundary: clauses.some((clause) => clause.excludedByOthers),
    hasMaterialResponsibility: materialResponsibilities.length > 0,
    hasPermitResponsibility: clauses.some((clause) => clause.permitInspection),
    hasQuantityLocationSignal: clauses.some((clause) => clause.quantityLocation),
  }
}
