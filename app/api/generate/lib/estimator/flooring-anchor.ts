import type { MeasurementInput, Pricing } from "./types"
import { getIncludedScopeText, splitScopeByTrade } from "../priceguard/scopeSplitter"
import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"

export type FlooringAnchorInput = {
  scope: string
  trade: string
  stateMultiplier: number
  measurements?: { totalSqft?: number; rows?: MeasurementInput["rows"] } | null
}

export function priceFlooringOnlyAnchor(args: FlooringAnchorInput): Pricing | null {
  // The dedicated flooring trade retains its existing engine.
  if (args.trade === "flooring") return null
  // Preserve numeric grouping before the existing scope splitter treats commas
  // as work separators (for example, "Install 1,200 sqft of LVP flooring").
  const scopeForSplitting = args.scope.replace(/(\d),(?=\d{3}\b)/g, "$1")
  const s = getIncludedScopeText(scopeForSplitting).toLowerCase()
  if (!/\b(floor|flooring|lvp|vinyl\s+plank|laminate|hardwood|carpet|tile\s+floor)\b/.test(s)) return null

  const looksLikeKitchenRemodel =
    /\b(kitchen|cabinet|cabinets|countertop|counter top|backsplash|range|cooktop|hood|dishwasher|microwave)\b/.test(s) &&
    /\b(remodel|renovation|gut|cabinets?|counter(top)?|backsplash|sink)\b/.test(s)
  const looksLikeBathRemodel =
    /\b(bath|bathroom|shower|tub)\b/.test(s) &&
    /\b(remodel|renovation|gut|shower|tub|vanity|tile\s+walls?|surround)\b/.test(s)
  if (looksLikeKitchenRemodel || looksLikeBathRemodel) return null
  if (!/\b(floor|flooring|lvp|vinyl plank|laminate|hardwood|engineered wood|carpet|tile floor|underlayment|baseboard)\b/.test(s)) return null
  if (/\b(shower\s+walls?|tub\s+surround|wall\s+tile|backsplash)\b/.test(s)) return null
  if (/\b(bath|bathroom|shower|tub)\b/.test(s) && /\b(shower|tub)\b/.test(s)) return null

  // This floor-only allowance cannot allocate a generic area or costs across trades.
  const splitScopes = splitScopeByTrade(scopeForSplitting)
  if (splitScopes.some((part) => part.trade !== "flooring" && part.trade !== "general renovation")) return null
  const nonFloorSurface = /\b(walls?|ceilings?|paint(?:ing)?|drywall|roof|siding)\b/i
  if (nonFloorSurface.test(s)) return null
  if (args.measurements?.rows?.some((row) => nonFloorSurface.test(row.label))) return null

  // Use raw scope: included-work filtering can remove a separate furnishing clause.
  // This allowance includes purchased finish flooring and cannot safely allocate an
  // owner/customer furnishing boundary. Declining it does not zero the job's costs.
  const facts = buildEstimatorScopeFacts(args.scope)
  if (
    facts.materialResponsibilities.some((value) => value === "owner_supplied" || value === "customer_supplied") ||
    /\b(owner|customer)[-\s]+(?:furnished|furnishes|to furnish|provided)\b/i.test(args.scope)
  ) return null

  // No replacement parser or new product rate: ambiguous direction/product uses
  // the non-anchor path instead of pricing the material being removed.
  if (/\b(replace|replaces|replaced|replacing|replacement|lvt)\b/.test(s)) return null
  const productPatterns = [
    /\b(tile|porcelain|ceramic)\b/,
    /\b(hardwood|engineered\s*wood)\b/,
    /\blaminate\b/,
    /\bcarpet\b/,
    /\b(lvp|vinyl\s+plank|luxury\s+vinyl)\b/,
  ]
  const products = productPatterns.filter((pattern) => pattern.test(s))
  if (products.length !== 1) return null
  const hasSupportedInstall = s.split(/,|\band\b/).some((part) => {
    // A product named for removal cannot establish the installed product.
    // Decline combined operation segments; a separate explicit installation
    // segment can still qualify. Keep the full scope below for demo pricing.
    if (/\b(remov(?:e|es|ed|ing|al)|demo|demolition|tear\s*out|haul\s*away|dispos(?:e|al))\b/.test(part)) return false
    const installation = /\b(install|installing|installation)\b/.exec(part)
    return !!installation && products[0].test(part.slice(installation.index + installation[0].length))
  })
  if (!hasSupportedInstall) return null

  const areaMatch = s.replace(/,/g, "").match(/(\d{1,7}(?:\.\d+)?)\s*(sq\s*ft|sqft|square\s*feet|sf)\b/)
  const parsedArea = areaMatch ? Number(areaMatch[1]) : null
  const parsedSqft = parsedArea != null && Number.isFinite(parsedArea) && parsedArea > 0 ? parsedArea : null
  const measuredSqft = args.measurements?.totalSqft
  // Only explicit contractor inputs reach this boundary; no room-count, photo,
  // plan, AI quantity, or default-area fallback is accepted here.
  const sqft =
    (typeof measuredSqft === "number" && Number.isFinite(measuredSqft) && measuredSqft > 0
      ? measuredSqft
      : null) ?? parsedSqft
  if (sqft == null) return null

  const hasDemo =
    /\b(demo|demolition|remove|tear\s*out)\b/.test(s) ||
    /\b(remove\s+existing|tear\s*out|haul\s*away|dispose)\b/.test(s)

  const isTile = /\b(tile|porcelain|ceramic)\b/.test(s) && /\bfloor\b/.test(s)
  const isHardwood = /\b(hardwood|engineered\s*wood)\b/.test(s)
  const isLaminate = /\b(laminate)\b/.test(s)
  const isCarpet = /\b(carpet)\b/.test(s)
  const isLvp = /\b(lvp|vinyl\s+plank|luxury\s+vinyl)\b/.test(s)
  if (!isTile && !isHardwood && !isLaminate && !isCarpet && !isLvp) return null

  const laborRate = 85
  const markup = 25
  const installHrsPerSqft =
    isTile ? 0.12 :
    isHardwood ? 0.09 :
    isCarpet ? 0.06 :
    (isLaminate || isLvp) ? 0.05 :
    0.06

  const demoHrsPerSqft = hasDemo ? 0.03 : 0
  const baseHrs = sqft * (installHrsPerSqft + demoHrsPerSqft) + 8
  let labor = Math.round(baseHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const matPerSqft =
    isTile ? 6.5 :
    isHardwood ? 7.5 :
    isCarpet ? 4.0 :
    isLaminate ? 3.2 :
    isLvp ? 3.8 :
    4.0
  const underlaymentPerSqft = isTile ? 0.0 : 0.6
  const transitionAllowance = 160
  const materials = Math.round(sqft * (matPerSqft + underlaymentPerSqft) + transitionAllowance)
  const mobilization = 400
  const dumpFee = hasDemo ? 300 : 0
  const supervision = Math.round((labor + materials) * 0.06)
  const subs = mobilization + dumpFee + supervision
  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}
