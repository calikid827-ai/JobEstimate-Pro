import { getIncludedScopeText } from "./scopeSplitter"

type ScopeQuantityReviewArgs = {
  scopeText: string
  pricingSource: "ai" | "deterministic" | "merged"
  rooms: number | null
  doors: number | null
  measurements?: {
    totalSqft?: number | null
    rows?: {
      label?: string
      lengthFt?: number
      heightFt?: number
      qty?: number
    }[] | null
  } | null
}

function hasMeasuredWallRow(measurements: ScopeQuantityReviewArgs["measurements"]): boolean {
  // This establishes wall-area presence only, not complete bedroom coverage.
  // Attribution and usable dimensions must belong to the same supplied row.
  return measurements?.rows?.some(({ label, lengthFt, heightFt, qty }) =>
    typeof label === "string" && /^(?:bedroom\s+)?walls?(?:\s+area)?$/i.test(label.trim()) &&
    typeof lengthFt === "number" && Number.isFinite(lengthFt) && lengthFt > 0 && lengthFt <= 1000 &&
    typeof heightFt === "number" && Number.isFinite(heightFt) && heightFt > 0 && heightFt <= 30 &&
    typeof qty === "number" && Number.isInteger(qty) && qty > 0 && qty <= 500
  ) ?? false
}

export function buildScopeQuantityReviewWarning(args: ScopeQuantityReviewArgs): string | null {
  const hasDoors = typeof args.doors === "number" && args.doors > 0
  const hasRooms = typeof args.rooms === "number" && args.rooms > 0
  const hasMeas = !!(args.measurements?.totalSqft && args.measurements.totalSqft > 0)

  if (args.pricingSource !== "ai") return null

  // Read the original included work once, not the descriptions distributed to trades.
  // This fact is review prose only; existing pricing-facing counts remain unchanged.
  const includedScope = getIncludedScopeText(args.scopeText)
  const segments = includedScope.split(/\s*,\s*/)
  const bedroomCounts = new Set<number>()
  if (!/\b(?:do\s+not|don['’]t|not|no)\b/i.test(includedScope)) {
    for (const segment of segments) {
      const match = segment.match(
        /^(?:paint|painting|repaint|patch|patching)\s+(?:bedroom\s+)?walls?\s+(?:only\s+)?in\s+([1-9]\d*)\s+bedrooms?$/i
      )
      if (match && Number.isSafeInteger(Number(match[1]))) bedroomCounts.add(Number(match[1]))
    }
  }

  if (bedroomCounts.size === 1) {
    const bedrooms = [...bedroomCounts][0]
    const hasExplicitWallArea = segments.some((segment) =>
      /^(?:measured\s+)?wall\s+area\s+(?:is\s+)?[1-9]\d*(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet)$/i.test(segment)
    )
    const hasPatching = segments.some((segment) => /^(?:patch|patching)\b/i.test(segment))
    const confirmations: string[] = []
    if (!hasMeasuredWallRow(args.measurements) && !hasExplicitWallArea) confirmations.push("measured wall area")
    if (hasPatching) confirmations.push("patch dimensions/extent")

    if (confirmations.length > 0) {
      return `${bedrooms} ${bedrooms === 1 ? "bedroom is" : "bedrooms are"} specified. Confirm ${confirmations.join(" and ")} before final approval.`
    }
    return null
  }

  if (args.pricingSource === "ai" && !hasDoors && !hasRooms && !hasMeas) {
    return "No explicit quantities detected (doors/rooms/sqft). Add quantities for stronger pricing protection."
  }

  return null
}
