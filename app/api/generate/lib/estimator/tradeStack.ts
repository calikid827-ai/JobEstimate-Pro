import {
  buildEstimatorScopeFacts,
  type EstimatorScopeFacts,
} from "../../../../app/lib/estimator-scope-facts"
import type { TradeStack } from "./types"

const OPERATION = "(?:install|replace|reinstall|repair|remove|paint|prime|patch|skim|texture|sand|prep|hang|finish|refinish|rough[-\\s]*in|run|relocate|mount|connect|reconnect|disconnect|plumb|repipe|wire|rewire)"
const LEADING_OPERATION = new RegExp(`^(?:(?:the\\s+)?(?:contractor|we)\\s+(?:will|to)\\s+)?${OPERATION}\\b`)
const COORDINATED_OPERATION = new RegExp(`\\b(?:and|then)\\s+(?:(?:the\\s+)?contractor\\s+(?:will|to)\\s+)?${OPERATION}\\b`)
const SUPPLY_AND_INSTALL = /\b(?:and|then)\s+(?:(?:the\s+)?contractor\s+(?:will|to)\s+)?(?:install|replace|reinstall|repair|remove|relocate|connect|reconnect|disconnect|plumb|repipe|wire|rewire)\b/
const NEGATED_OPERATION = new RegExp(`^(?:no|without)\\b|\\b(?:not|never|don['’]t)\\s+(?:to\\s+)?${OPERATION}\\b`)

function hasAffirmativeOperation(text: string) {
  return !NEGATED_OPERATION.test(text) &&
    (LEADING_OPERATION.test(text) || COORDINATED_OPERATION.test(text))
}

/** Trade labels describe included work, not materials supplied or nearby trades. */
export function detectTradeStack(args: {
  scopeText: string
  primaryTrade: string
  scopeFacts?: EstimatorScopeFacts
}): TradeStack {
  const facts = args.scopeFacts ?? buildEstimatorScopeFacts(args.scopeText)
  const primary = args.primaryTrade.trim().toLowerCase().replace(/_/g, " ")
  // Keep comma-list boundaries, but do not carry a previous sentence's
  // exclusion into an independent affirmative instruction. The original facts
  // remain unchanged for other consumers.
  const independentWork = new Map(
    facts.rawText.split(/[.;\n\r]+/).flatMap((sentence) =>
      buildEstimatorScopeFacts(sentence).clauses.filter((clause) =>
        !clause.excludedByOthers && hasAffirmativeOperation(clause.text)
      ).map((clause) => [clause.text, clause] as const)
    )
  )
  const workClauses = facts.clauses.map((clause) =>
    clause.excludedByOthers ? independentWork.get(clause.text) ?? clause : clause
  ).filter((clause) => {
    const explicitWork = hasAffirmativeOperation(clause.text)
    if (clause.excludedByOthers || clause.protectionOnly || clause.coordinationOnly) return false
    if (clause.existingCondition && !explicitWork) return false
    if (NEGATED_OPERATION.test(clause.text)) return false
    const supplier = clause.ownerSupplied || clause.customerSupplied || clause.contractorSupplied
    // Material lists can contain "paint and texture" or "paint and finish".
    // Require a leading instruction or an explicit supply-and-install relation.
    if (supplier) return explicitWork && (LEADING_OPERATION.test(clause.text) || SUPPLY_AND_INSTALL.test(clause.text))
    if (clause.includedWork || explicitWork) return true
    if (!supplier && /^(?:(?:interior|exterior)\s+)?painting\s+(?:of\s+)?(?:(?:the|all|existing)\s+)?(?:walls?|ceilings?|bedrooms?|rooms?|doors?|trim|cabinets?|floors?)\b|^(?:electrical\s+)?(?:wiring|rewiring)\b(?!\s+(?:materials?|supplies))/.test(clause.text)) return true
    return false
  })
  const included = workClauses.map((clause) => clause.text).join(" ")
  const workTrades = new Set(workClauses.flatMap((clause) => clause.trades))
  const detected = new Map<string, string>()
  const activities: string[] = []
  const signals: string[] = []
  const addActivity = (activity: string, signal: string) => {
    activities.push(activity)
    signals.push(signal)
  }

  if (workTrades.has("painting")) detected.set("painting", "Painting work detected")
  // Shared facts also tag surfaces/contexts. A shower valve is not tile work,
  // drywall seams are not wallcovering, and painting floors is not flooring.
  if (workClauses.some((clause) => clause.trades.includes("bathroom_tile") &&
      /\b(?:tile|tiling|grout|thinset|porcelain|ceramic|backsplash|tub\s*surround|shower\s+walls?|waterproof(?:ing)?|membrane|backer\s*board)\b/.test(clause.text))) {
    detected.set("tile", "Tile work detected")
  }
  if (workClauses.some((clause) => clause.trades.includes("wallcovering") &&
      /\b(?:wallcovering|wall\s+covering|wallpaper|paper\s+hanging)\b/.test(clause.text))) {
    detected.set("wallcovering", "Wallcovering work detected")
  }
  if (workClauses.some((clause) => clause.trades.includes("flooring") &&
      /\b(?:install|replace|repair|remove|removal|level|underlayment|refinish|sand)\b/.test(clause.text))) {
    detected.set("flooring", "Flooring work detected")
  }

  // 'Supply' and generic 'fixtures' have no plumbing/electrical authority.
  if (workTrades.has("plumbing")) detected.set("plumbing", "Plumbing work detected")
  if (workTrades.has("electrical") &&
      /\b(?:electrical|electrician|wir(?:e|ing)|conduits?|outlets?|receptacles?|devices?|switches?|circuits?|breakers?|panels?|gfcis?|lighting|lights?|recessed|can\s*light)\b/.test(included)) {
    detected.set("electrical", "Electrical work detected")
  }
  // A specific selected trade can disambiguate fixture installation, but not
  // procurement alone or a written exclusion of that trade.
  if ((primary === "plumbing" || primary === "electrical") &&
      !facts.excludedTrades.includes(primary) &&
      workClauses.some((clause) => /\bfixtures?\b/.test(clause.text) &&
        !clause.trades.includes("plumbing") && !clause.trades.includes("electrical") &&
        hasAffirmativeOperation(clause.text))) {
    detected.set(primary, `${primary === "plumbing" ? "Plumbing" : "Electrical"} fixture installation detected`)
  }

  const drywallClauses = workClauses.filter((clause) => clause.trades.includes("drywall"))
  const paintPatchPrep = detected.has("painting") && drywallClauses.length > 0 &&
    drywallClauses.every((clause) =>
      /\b(?:patch|patching|repair|prep|sand)\b/.test(clause.text) &&
      !/\b(?:install|replace|hang|skim|texture|level\s+[345]|sheets?|partitions?|framing)\b/.test(clause.text)
    )
  if (paintPatchPrep) {
    addActivity("surface preparation", "Painting patch preparation; drying/return sequencing remains applicable")
  } else if (drywallClauses.length) {
    detected.set("drywall", "Drywall work detected")
  }
  if (workClauses.some((clause) => clause.trades.includes("carpentry") &&
      /\b(?:install|replace|replacement|remove|removal|hang|frame|framing|blocking|carpentry)\b/.test(clause.text))) {
    detected.set("carpentry", "Carpentry work detected")
  }
  if (/\b(?:demo|demolition|tear\s*out|remove\s+existing|haul\s*away|dispose)\b/.test(included)) {
    addActivity("demolition", "Demo detected")
  }
  if (/\b(?:waterproof|waterproofing|membrane|pan|curb|cement\s*board|durock|hardie)\b/.test(included)) {
    addActivity("waterproofing", "Wet-area waterproofing detected")
  }

  const trades = [...detected.keys()]
  if (detected.has(primary)) {
    trades.splice(trades.indexOf(primary), 1)
    trades.unshift(primary)
  }
  signals.push(...trades.map((trade) => detected.get(trade)!))
  return {
    primaryTrade: primary || "unknown",
    trades,
    activities,
    signals,
    isMultiTrade: trades.length >= 2,
  }
}
