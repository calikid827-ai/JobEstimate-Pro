import {
  buildEstimatorScopeFacts,
  type EstimatorScopeFacts,
  type EstimatorScopeTrade,
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

export function materialItemIncludedText(facts: EstimatorScopeFacts) {
  return facts.clauses
    .filter(
      (clause) =>
        clause.includedWork ||
        (!clause.excludedByOthers &&
          !clause.protectionOnly &&
          !clause.coordinationOnly &&
          !clause.existingCondition &&
          !clause.ownerSupplied &&
          !clause.customerSupplied &&
          !clause.contractorSupplied &&
          !clause.permitInspection)
    )
    .map((clause) => clause.text)
    .join(" ")
}

export function shouldAddKitchenBacksplashItems(facts: EstimatorScopeFacts) {
  return /\b(backsplash|tile)\b/i.test(materialItemIncludedText(facts))
}

export function shouldAddKitchenFlooringItems(facts: EstimatorScopeFacts) {
  return (
    facts.includedTrades.includes("flooring") ||
    /\b(floor|flooring|lvp|vinyl plank|laminate|hardwood|tile floor)\b/i.test(
      materialItemIncludedText(facts)
    )
  )
}

export function shouldAddKitchenPaintItems(facts: EstimatorScopeFacts) {
  return (
    facts.includedTrades.includes("painting") ||
    /\b(paint|painting|prime|primer)\b/i.test(materialItemIncludedText(facts))
  )
}

export function shouldAddIncludedDemoItems(facts: EstimatorScopeFacts) {
  if (facts.baseboardReplacementRemovalContext) return false
  return /\b(demo|demolition|tear\s*out|remove)\b/i.test(materialItemIncludedText(facts))
}

export function shouldAddFlooringTileSettingItems(facts: EstimatorScopeFacts) {
  return (
    facts.includedTrades.includes("flooring") &&
    /\b(tile|porcelain|ceramic)\b/i.test(materialItemIncludedText(facts))
  )
}

export function shouldAddDrywallTextureMaterial(facts: EstimatorScopeFacts) {
  if (facts.patchTextureExcluded && !facts.patchTextureIncluded) return false
  return /\b(texture|orange\s*peel|knockdown)\b/i.test(materialItemIncludedText(facts))
}

export function shouldAddDrywallPrimerMaterial(facts: EstimatorScopeFacts) {
  if (facts.patchTextureExcluded && !facts.patchTextureIncluded) return false
  return /\b(prime|primer|paint)\b/i.test(materialItemIncludedText(facts))
}

function includesAnyTrade(facts: EstimatorScopeFacts, trades: EstimatorScopeTrade[]) {
  return trades.some((trade) => facts.includedTrades.includes(trade))
}

function hasBoundaryOnlyTrade(facts: EstimatorScopeFacts, trades: EstimatorScopeTrade[]) {
  return trades.some(
    (trade) =>
      facts.excludedTrades.includes(trade) ||
      facts.protectionTrades.includes(trade) ||
      facts.coordinationTrades.includes(trade) ||
      facts.existingConditionTrades.includes(trade)
  )
}

export function filterMaterialConfirmItems(
  items: string[] | undefined,
  facts: EstimatorScopeFacts
) {
  return (items || []).filter((item) => {
    const text = String(item || "").toLowerCase()

    if (
      /\b(primer|sealer|patch|patching|texture|drywall)\b/.test(text) &&
      facts.patchTextureExcluded &&
      !facts.patchTextureIncluded
    ) {
      return false
    }

    if (
      /\b(plumbing|valve|drain|faucet|toilet|sink|vanity|fixture)\b/.test(text) &&
      !includesAnyTrade(facts, ["plumbing"]) &&
      !includesAnyTrade(facts, ["electrical"]) &&
      (hasBoundaryOnlyTrade(facts, ["plumbing"]) || facts.materialResponsibilities.length > 0)
    ) {
      return false
    }

    if (
      /\b(electrical|device|outlet|switch|light|fixture)\b/.test(text) &&
      !includesAnyTrade(facts, ["electrical"]) &&
      (hasBoundaryOnlyTrade(facts, ["electrical"]) || facts.materialResponsibilities.length > 0)
    ) {
      return false
    }

    if (
      /\b(flooring|floor material|underlayment|baseboard|trim footage|base material)\b/.test(text) &&
      !includesAnyTrade(facts, ["flooring", "carpentry"]) &&
      hasBoundaryOnlyTrade(facts, ["flooring", "carpentry"])
    ) {
      return false
    }

    if (
      /\b(baseboard|trim linear|trim footage|base material)\b/.test(text) &&
      (facts.tileTrimContext || facts.baseboardReplacementRemovalContext) &&
      !hasIncludedInteriorTrimScope(facts)
    ) {
      return false
    }

    return true
  })
}

export function flooringTransitionTrimConfirmation(facts: EstimatorScopeFacts) {
  if (
    facts.existingConditionTrades.includes("carpentry") ||
    facts.existingConditionTrades.includes("flooring") ||
    facts.protectionTrades.includes("flooring")
  ) {
    return "Confirm exact transition count."
  }

  return "Confirm exact transition count and trim footage."
}

export function shouldAddCombinedMaterialsNote(args: {
  facts: EstimatorScopeFacts
  splitScopes: RouteDisplayScopeChunk[]
}) {
  return args.facts.trueMixedTrades && args.splitScopes.length > 1
}

export function shouldShowTrueMixedTradeDiagnostic(facts: EstimatorScopeFacts) {
  return facts.trueMixedTrades
}
