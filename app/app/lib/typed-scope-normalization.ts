export type TypedScopeClause = {
  text: string
  includedWork: boolean
  excludedByOthers: boolean
  protectionOnly: boolean
  coordinationOnly: boolean
  existingCondition: boolean
  materialResponsibility: boolean
  permitResponsibility: boolean
  quantityLocationSignal: boolean
}

export type TypedScopeNormalization = {
  normalizedText: string
  includedWorkText: string
  boundaryText: string
  clauses: TypedScopeClause[]
  hasIncludedWork: boolean
  hasExclusionOrByOthersBoundary: boolean
  hasMaterialResponsibility: boolean
  hasPermitResponsibility: boolean
  hasQuantityLocationSignal: boolean
}

const QUANTITY_LOCATION_PATTERNS = [
  /\b\d+(\.\d+)?\s?(sq\.?\s?ft|sf|square feet|square foot|lf|linear feet|linear foot|ln ft)\b/,
  /\b\d+\s?(rooms?|bedrooms?|bathrooms?|areas?|walls?|ceilings?|doors?|windows?|outlets?|switches?|fixtures?|lights?|receptacles?|circuits?|panels?|sinks?|toilets?|faucets?|vanities?|showers?|sheets?|patches?)\b/,
  /\brooms?\s+\d+[a-z]?\s*(?:-|to|through|thru)\s*\d+[a-z]?\b/,
  /\b(?:room|area|unit|suite)\s+\d+[a-z]?\b/,
  /\bper plans?\b|\bselected sheets?\b/,
]

const INCLUDED_WORK_PATTERN =
  /\b(install|replace|repair|remove|reinstall|reset|demo|demolish|paint|prime|patch|skim|texture|match|waterproof|rough[-\s]*in|run|relocate|set|mount|hang|finish|caulk|sand|prep|touch[-\s]*up|r&r|remove and reinstall)\b/

const EXCLUDED_BY_OTHERS_PATTERN =
  /\b(exclude|excluded|excludes|excluding|not included|not part of|by others|by owner|owner to|owner will|customer to|customer will|gc to|general contractor to|separate contractor|separate trade|nic)\b/

const PROTECTION_PATTERN =
  /\b(protect|protection|safeguard|cover|covered|mask|masking|drop cloth|adjacent finishes?)\b/

const COORDINATION_PATTERN =
  /\b(coordinate|coordination|avoid interference|no interference|not interfere|work around|working around|around existing)\b/

const EXISTING_CONDITION_PATTERN =
  /\b(existing|remain|to remain|leave in place|salvage|reuse|protect in place)\b/

const MATERIAL_RESPONSIBILITY_PATTERN =
  /\b(owner supplied|owner-supplied|owner supplies|customer supplied|customer-supplied|customer supplies|contractor supplied|contractor-supplied|contractor supplies|supplied by|owner provides?|customer provides?|contractor provides?|owner to provide|customer to provide|materials? included|include materials?|allowance|selection)\b/

const PERMIT_RESPONSIBILITY_PATTERN =
  /\b(permit|permits|inspection|inspect|code)\b/

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function splitClauses(text: string): string[] {
  return normalize(text)
    .split(/\s*(?:[.;\n\r]+|,\s+|\s+-\s+)\s*/)
    .map((clause) => clause.trim())
    .filter(Boolean)
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function classifyClause(text: string): TypedScopeClause {
  const excludedByOthers = EXCLUDED_BY_OTHERS_PATTERN.test(text)
  const materialResponsibility = MATERIAL_RESPONSIBILITY_PATTERN.test(text)
  const permitResponsibility = PERMIT_RESPONSIBILITY_PATTERN.test(text)
  const quantityLocationSignal = matchesAny(text, QUANTITY_LOCATION_PATTERNS)
  const protection = PROTECTION_PATTERN.test(text)
  const coordination = COORDINATION_PATTERN.test(text)
  const existingCondition = EXISTING_CONDITION_PATTERN.test(text)
  const hasWorkVerb = INCLUDED_WORK_PATTERN.test(text)
  const protectionOnly = protection && !hasWorkVerb && !excludedByOthers
  const coordinationOnly = coordination && !hasWorkVerb && !excludedByOthers
  const existingOnly = existingCondition && !hasWorkVerb && !excludedByOthers

  return {
    text,
    includedWork:
      hasWorkVerb &&
      !excludedByOthers &&
      !protectionOnly &&
      !coordinationOnly &&
      !existingOnly &&
      !materialResponsibility,
    excludedByOthers,
    protectionOnly,
    coordinationOnly,
    existingCondition: existingOnly,
    materialResponsibility,
    permitResponsibility,
    quantityLocationSignal,
  }
}

export function normalizeTypedScope(scope: string): TypedScopeNormalization {
  const normalizedText = normalize(scope)
  const clauses = splitClauses(scope).map(classifyClause)
  const includedClauses = clauses.filter((clause) => clause.includedWork)
  const boundaryClauses = clauses.filter(
    (clause) =>
      clause.excludedByOthers ||
      clause.protectionOnly ||
      clause.coordinationOnly ||
      clause.existingCondition ||
      clause.materialResponsibility ||
      clause.permitResponsibility
  )

  return {
    normalizedText,
    includedWorkText: includedClauses.map((clause) => clause.text).join(" "),
    boundaryText: boundaryClauses.map((clause) => clause.text).join(" "),
    clauses,
    hasIncludedWork: includedClauses.length > 0,
    hasExclusionOrByOthersBoundary: clauses.some((clause) => clause.excludedByOthers),
    hasMaterialResponsibility: clauses.some((clause) => clause.materialResponsibility),
    hasPermitResponsibility: clauses.some((clause) => clause.permitResponsibility),
    hasQuantityLocationSignal: clauses.some((clause) => clause.quantityLocationSignal),
  }
}
