import {
  buildEstimatorScopeFacts,
  type EstimatorScopeFacts,
} from "../../../../app/lib/estimator-scope-facts"

export type RouteDisplayScopeChunk = {
  trade: string
  scope: string
}

export function buildRouteDisplayScopeFacts(scopeText: string): EstimatorScopeFacts {
  return buildEstimatorScopeFacts(scopeText)
}

function hasLinearFootQuantity(text: string) {
  return /(\d{1,5})\s*(linear\s*ft|linear\s*feet|lf|feet)\b/i.test(text)
}

function hasIncludedInteriorTrimScope(facts: EstimatorScopeFacts) {
  if (facts.tileTrimContext) return false
  return (
    facts.includedTrades.includes("carpentry") &&
    /\b(baseboard|baseboards|base board|casing|casings|quarter round|shoe mold|millwork|crown)\b/i.test(
      facts.includedWorkText
    )
  )
}

export function shouldConfirmInteriorTrimFootage(args: {
  facts: EstimatorScopeFacts
  splitScopes: RouteDisplayScopeChunk[]
  isExteriorPainting: boolean
}) {
  if (args.isExteriorPainting) return false
  if (hasLinearFootQuantity(args.facts.includedWorkText)) return false

  if (hasIncludedInteriorTrimScope(args.facts)) return true

  return args.splitScopes.some((chunk) => {
    if (chunk.trade === "tile") return false
    const scope = String(chunk.scope || "")
    if (hasLinearFootQuantity(scope)) return false
    return (
      chunk.trade === "carpentry" ||
      /\b(baseboard|baseboards|base board|casing|casings|quarter round|shoe mold)\b/i.test(scope)
    )
  })
}

export function shouldConfirmPatchTextureExtent(facts: EstimatorScopeFacts) {
  return facts.patchTextureIncluded
}

export function shouldAddAreaDemoDriver(facts: EstimatorScopeFacts) {
  if (facts.baseboardReplacementRemovalContext) return false
  return (
    facts.includedTrades.includes("demolition") ||
    /\b(demo|demolition|tear\s*out|remove\s+existing|haul\s*away|dispose)\b/i.test(
      facts.includedWorkText
    )
  )
}

export function shouldAddAreaSurfacePrepDriver(facts: EstimatorScopeFacts) {
  return (
    facts.patchTextureIncluded ||
    facts.wallcoveringPrepContext ||
    /\b(surface prep|scrape|sand|caulk|prep)\b/i.test(facts.includedWorkText)
  )
}

export function shouldAddAreaTrimMaterialDriver(args: {
  facts: EstimatorScopeFacts
  isExteriorPainting: boolean
}) {
  if (args.isExteriorPainting) return false
  return hasIncludedInteriorTrimScope(args.facts)
}
