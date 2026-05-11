export type ScopeQualityResult = {
  score: number
  warnings: string[]
}

type ScopeTradeGroup =
  | "general_renovation"
  | "painting"
  | "drywall"
  | "flooring"
  | "electrical"
  | "plumbing"
  | "bathroom_tile"
  | "wallcovering"
  | "carpentry"

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function addWarning(
  warnings: string[],
  warning: string,
  scoreChange: { value: number },
  penalty: number
) {
  if (!warnings.some((item) => item.toLowerCase() === warning.toLowerCase())) {
    warnings.push(warning)
    scoreChange.value -= penalty
  }
}

function resolveScopeTradeGroup(scope: string, trade?: string): ScopeTradeGroup {
  const selected = normalize(trade || "")

  if (selected === "painting") return "painting"
  if (selected === "drywall") return "drywall"
  if (selected === "flooring") return "flooring"
  if (selected === "electrical") return "electrical"
  if (selected === "plumbing") return "plumbing"
  if (selected === "bathroom_tile" || selected === "tile") return "bathroom_tile"
  if (selected === "wallcovering" || selected === "wallpaper") return "wallcovering"
  if (selected === "carpentry") return "carpentry"
  if (selected === "general_renovation" || selected === "general") return "general_renovation"

  if (hasAny(scope, ["wallpaper", "wallcovering", "wall covering", "vinyl wallcovering"])) {
    return "wallcovering"
  }

  if (hasAny(scope, ["bathroom", "shower", "tub", "tile", "waterproof", "waterproofing"])) {
    return "bathroom_tile"
  }

  if (hasAny(scope, ["outlet", "receptacle", "switch", "circuit", "breaker", "panel", "wiring", "rewire", "lighting", "rough-in electrical"])) {
    return "electrical"
  }

  if (hasAny(scope, ["toilet", "faucet", "sink", "vanity", "shower valve", "supply line", "drain", "plumbing", "rough-in plumbing"])) {
    return "plumbing"
  }

  if (hasAny(scope, ["lvp", "laminate", "hardwood", "carpet", "flooring", "floor tile", "transition strip", "underlayment"])) {
    return "flooring"
  }

  if (hasAny(scope, ["drywall", "sheetrock", "gypsum", "texture match", "level 5", "level five"])) {
    return "drywall"
  }

  if (hasAny(scope, ["paint", "painting", "coat", "primer", "prime", "walls", "ceilings", "trim"])) {
    return "painting"
  }

  return "general_renovation"
}

const QUANTITY_PATTERNS = [
  /\b\d+(\.\d+)?\s?(sq\.?\s?ft|sf|square feet|square foot|lf|linear feet|linear foot|ln ft)\b/,
  /\b\d+\s?(rooms?|bedrooms?|bathrooms?|areas?|walls?|ceilings?|doors?|windows?|outlets?|switches?|fixtures?|lights?|receptacles?|circuits?|panels?|sinks?|toilets?|faucets?|vanities?|showers?|sheets?|patches?)\b/,
]

const MATERIAL_RESPONSIBILITY_TERMS = [
  "owner supplied",
  "owner-supplied",
  "by owner",
  "customer supplied",
  "contractor supplied",
  "include material",
  "includes material",
  "materials included",
  "allowance",
  "selection",
  "supplied by",
  "provide",
]

const EXCLUSION_TERMS = [
  "exclude",
  "excludes",
  "not included",
  "by owner",
  "allowance",
  "hidden damage",
  "unless approved",
  "permit",
  "permits",
]

const VAGUE_TERMS = [
  "as needed",
  "tbd",
  "misc",
  "various",
  "etc",
  "general repairs",
  "touch up",
  "touch-ups",
  "fix up",
  "make ready",
]

function hasQuantityDetail(text: string) {
  return matchesAny(text, QUANTITY_PATTERNS) || hasAny(text, ["per plan", "per plans", "selected sheets"])
}

function hasMeasuredQuantityDetail(text: string) {
  return matchesAny(text, QUANTITY_PATTERNS)
}

function hasMaterialResponsibility(text: string) {
  return hasAny(text, MATERIAL_RESPONSIBILITY_TERMS)
}

function hasExclusionBoundary(text: string) {
  return hasAny(text, EXCLUSION_TERMS)
}

function applySharedWarnings(text: string, warnings: string[], score: { value: number }) {
  if (text.length < 20) {
    addWarning(warnings, "Scope description is very short", score, 20)
  }

  if (hasAny(text, VAGUE_TERMS)) {
    addWarning(warnings, "Scope uses vague wording. Replace open-ended language with specific included work.", score, 10)
  }
}

function checkPainting(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm painting area, rooms, or square footage.", score, 18)
  }

  if (!hasAny(text, ["wall", "walls", "ceiling", "ceilings", "trim", "baseboard", "baseboards", "door", "doors", "cabinet", "cabinets", "surface", "surfaces", "exterior", "siding"])) {
    addWarning(warnings, "Confirm painted surfaces such as walls, ceilings, trim, doors, cabinets, or exterior areas.", score, 14)
  }

  if (!hasAny(text, ["prep", "preparation", "patch", "repair", "sand", "caulk", "fill", "prime", "primer", "scrape", "mask", "protect"])) {
    addWarning(warnings, "Confirm prep, patching, protection, and primer expectations.", score, 10)
  }

  if (!hasAny(text, ["coat", "coats", "paint", "primer", "finish"])) {
    addWarning(warnings, "Confirm paint system, coat count, or finish expectations.", score, 8)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm whether paint and materials are contractor-supplied or owner-supplied.", score, 8)
  }
}

function checkDrywall(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text) && !hasAny(text, ["small patch", "medium patch", "large patch"])) {
    addWarning(warnings, "Confirm drywall patch count, sheet count, or square footage.", score, 18)
  }

  if (!matchesAny(text, [/\bwall(s)?\b/, /\bceiling(s)?\b/, /\bpatch(es)?\b/, /\bsheet(s)?\b/, /\bopening(s)?\b/])) {
    addWarning(warnings, "Confirm drywall location, such as wall, ceiling, patch, sheet, or opening.", score, 12)
  }

  if (!hasAny(text, ["level 3", "level 4", "level 5", "level three", "level four", "level five", "finish", "texture", "smooth", "orange peel", "knockdown", "match"])) {
    addWarning(warnings, "Confirm finish level, texture match, and whether paint is excluded.", score, 12)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm drywall material and texture responsibility.", score, 8)
  }
}

function checkFlooring(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm flooring square footage or affected rooms.", score, 18)
  }

  if (!hasAny(text, ["lvp", "vinyl", "laminate", "hardwood", "engineered", "tile", "carpet", "flooring product", "floor material"])) {
    addWarning(warnings, "Confirm flooring product type and finish selection.", score, 14)
  }

  if (!hasAny(text, ["remove", "removal", "demo", "demolition", "tear out", "tear-out", "existing", "subfloor", "level", "leveling", "prep"])) {
    addWarning(warnings, "Confirm removal, subfloor prep, and leveling expectations.", score, 10)
  }

  if (!hasAny(text, ["base", "baseboard", "baseboards", "shoe", "quarter round", "transition", "transitions", "threshold", "trim"])) {
    addWarning(warnings, "Confirm base, trim, transitions, and threshold scope.", score, 8)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm whether flooring, underlayment, and trims are contractor-supplied or owner-supplied.", score, 8)
  }
}

function checkElectrical(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm electrical device, fixture, circuit, panel, or rough-in counts.", score, 18)
  }

  if (!hasAny(text, ["outlet", "outlets", "receptacle", "receptacles", "switch", "switches", "light", "lights", "lighting", "fixture", "fixtures", "circuit", "circuits", "breaker", "panel", "wiring", "rewire", "rough-in", "rough in"])) {
    addWarning(warnings, "Confirm electrical scope type: devices, fixtures, wiring, circuits, panel work, or rough-in.", score, 14)
  }

  if (!hasAny(text, ["access", "open wall", "open ceiling", "attic", "crawl", "conduit", "surface mount", "fishing", "rough-in", "rough in"])) {
    addWarning(warnings, "Confirm access conditions and whether patching is excluded.", score, 8)
  }

  if (!hasAny(text, ["permit", "inspection", "inspect", "code", "utility", "panel"])) {
    addWarning(warnings, "Confirm permit, inspection, code, or utility coordination assumptions.", score, 8)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm whether fixtures, devices, and trims are contractor-supplied or owner-supplied.", score, 8)
  }
}

function checkPlumbing(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm plumbing fixture count, rough-in count, or affected locations.", score, 18)
  }

  if (!hasAny(text, ["toilet", "sink", "faucet", "vanity", "shower", "tub", "valve", "drain", "supply", "water line", "waste", "rough-in", "rough in", "fixture", "fixtures"])) {
    addWarning(warnings, "Confirm plumbing scope type: fixtures, supply lines, drains, valves, or rough-in.", score, 14)
  }

  if (!hasAny(text, ["access", "open wall", "open ceiling", "crawl", "slab", "wall repair", "floor repair", "tile repair", "patch", "rough-in", "rough in"])) {
    addWarning(warnings, "Confirm access conditions and whether wall, floor, or tile repair is excluded.", score, 8)
  }

  if (!hasAny(text, ["permit", "inspection", "inspect", "code", "shutoff", "shut off"])) {
    addWarning(warnings, "Confirm permit, inspection, shutoff, or code assumptions.", score, 8)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm whether fixtures, valves, trims, and plumbing materials are contractor-supplied or owner-supplied.", score, 8)
  }
}

function checkBathroomTile(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm bathroom or tile area, affected rooms, or square footage.", score, 18)
  }

  if (!hasAny(text, ["demo", "demolition", "remove", "removal", "tear out", "tear-out", "existing"])) {
    addWarning(warnings, "Confirm demolition and removal scope.", score, 10)
  }

  if (!hasAny(text, ["tile", "shower", "floor", "walls", "wainscot", "backsplash", "waterproof", "waterproofing", "backer", "substrate", "mud bed", "pan"])) {
    addWarning(warnings, "Confirm tile area, waterproofing, substrate prep, and finish limits.", score, 14)
  }

  if (!hasAny(text, ["toilet", "vanity", "sink", "faucet", "shower valve", "fixture", "fixtures", "plumbing", "electrical", "fan", "light", "mirror", "accessory", "accessories"])) {
    addWarning(warnings, "Confirm fixture responsibility and any plumbing or electrical boundaries.", score, 12)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm tile, grout, fixtures, waterproofing, and finish material responsibility.", score, 8)
  }

  if (!hasExclusionBoundary(text)) {
    addWarning(warnings, "Confirm exclusions for hidden damage, permits, glass, plumbing, electrical, or finish upgrades.", score, 8)
  }
}

function checkWallcovering(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm wallcovering wall area, linear footage, or affected rooms.", score, 18)
  }

  if (!hasAny(text, ["vinyl", "fabric", "grasscloth", "mural", "material", "type", "commercial wallcovering"])) {
    addWarning(warnings, "Confirm wallcovering material type and finish selection.", score, 12)
  }

  if (!hasAny(text, ["remove", "removal", "strip", "existing", "prep", "skim", "prime", "primer", "repair", "sand", "substrate", "wall condition"])) {
    addWarning(warnings, "Confirm existing wallcovering removal, wall condition, and substrate prep.", score, 12)
  }

  if (!hasAny(text, ["pattern", "repeat", "match", "seam", "seams", "waste", "access", "height", "stair", "scaffold", "ladder"])) {
    addWarning(warnings, "Confirm pattern/repeat, seams, waste, and access constraints.", score, 8)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm whether wallcovering material and adhesive are contractor-supplied or owner-supplied.", score, 8)
  }
}

function checkCarpentry(text: string, warnings: string[], score: { value: number }) {
  if (!hasQuantityDetail(text)) {
    addWarning(warnings, "Confirm carpentry count, linear footage, or affected areas.", score, 18)
  }

  if (!hasAny(text, ["baseboard", "baseboards", "trim", "casing", "crown", "door", "doors", "shelving", "cabinet", "blocking", "frame", "framing", "wood", "carpentry"])) {
    addWarning(warnings, "Confirm carpentry item type and install or repair limits.", score, 14)
  }

  if (!hasAny(text, ["remove", "replace", "install", "repair", "patch", "caulk", "paint", "stain", "finish"])) {
    addWarning(warnings, "Confirm install, repair, finish, caulk, paint, or stain expectations.", score, 10)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm wood, trim, hardware, and finish material responsibility.", score, 8)
  }
}

function checkGeneralRenovation(text: string, warnings: string[], score: { value: number }) {
  if (!hasMeasuredQuantityDetail(text)) {
    addWarning(warnings, "Confirm affected rooms, areas, or plan pages for the renovation scope.", score, 18)
  }

  if (!hasAny(text, ["paint", "drywall", "floor", "flooring", "tile", "plumbing", "electrical", "carpentry", "fixture", "fixtures", "demo", "demolition", "finish", "finishes"])) {
    addWarning(warnings, "Confirm which trades are included in the renovation scope.", score, 14)
  }

  if (!hasAny(text, ["demo", "demolition", "remove", "removal", "repair", "replace", "install", "prep", "rough-in", "rough in"])) {
    addWarning(warnings, "Confirm demolition, preparation, rough-in, and finish-work limits.", score, 12)
  }

  if (!hasMaterialResponsibility(text)) {
    addWarning(warnings, "Confirm finish selections, fixture responsibility, and material allowances.", score, 10)
  }

  if (!hasExclusionBoundary(text)) {
    addWarning(warnings, "Confirm exclusions, allowances, permits, hidden damage, and work by others.", score, 10)
  }
}

export function checkScopeQuality(scope: string, trade?: string): ScopeQualityResult {
  const text = normalize(scope)
  const warnings: string[] = []
  const score = { value: 100 }

  applySharedWarnings(text, warnings, score)

  const group = resolveScopeTradeGroup(text, trade)

  if (group === "painting") checkPainting(text, warnings, score)
  else if (group === "drywall") checkDrywall(text, warnings, score)
  else if (group === "flooring") checkFlooring(text, warnings, score)
  else if (group === "electrical") checkElectrical(text, warnings, score)
  else if (group === "plumbing") checkPlumbing(text, warnings, score)
  else if (group === "bathroom_tile") checkBathroomTile(text, warnings, score)
  else if (group === "wallcovering") checkWallcovering(text, warnings, score)
  else if (group === "carpentry") checkCarpentry(text, warnings, score)
  else checkGeneralRenovation(text, warnings, score)

  return {
    score: Math.max(0, Math.min(100, score.value)),
    warnings,
  }
}
