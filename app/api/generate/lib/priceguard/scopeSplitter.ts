export type SplitTrade =
  | "painting"
  | "drywall"
  | "texture"
  | "flooring"
  | "carpentry"
  | "electrical"
  | "plumbing"
  | "general renovation"

export type ScopeChunk = {
  trade: SplitTrade
  scope: string
  signals: string[]
}

type SegmentBucket = {
  trade: SplitTrade
  phrases: string[]
  signals: string[]
}

function normalizeScopeText(scopeText: string): string {
  return String(scopeText || "")
    .replace(/\r/g, "\n")
    .replace(/[•●▪◦]/g, ", ")
    .replace(/[;]+/g, ", ")
    .replace(/\band\/or\b/gi, " and ")
    .replace(/\s+/g, " ")
    .trim()
}

function splitIntoSegments(scopeText: string): string[] {
  const text = normalizeScopeText(scopeText)

  if (!text) return []

  return text
    .split(/\s*,\s*|\s+\band\b\s+|\s+\bthen\b\s+|\s+\balso\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

function detectTradeForSegment(segment: string): {
  trade: SplitTrade
  signals: string[]
} {
  const s = segment.toLowerCase()
  const signals: string[] = []

  if (
    /\b(texture|orange peel|knockdown|skip trowel|smooth texture|retexture|re-texture|skim coat)\b/.test(s)
  ) {
    signals.push("texture keywords")
    return { trade: "texture", signals }
  }

  if (
    /\b(drywall|sheetrock|patch|patching|tape and mud|taping|mudding|drywall repair)\b/.test(s)
  ) {
    signals.push("drywall keywords")
    return { trade: "drywall", signals }
  }

  if (
    /\b(floor|flooring|lvp|vinyl plank|luxury vinyl|laminate|hardwood|engineered wood|tile floor|install flooring)\b/.test(s)
  ) {
    signals.push("flooring keywords")
    return { trade: "flooring", signals }
  }

  if (
    /\b(baseboard|baseboards|trim|casing|casings|crown|crown molding|door install|doors|accent wall|wainscot|wall molding|framing|finish carpentry)\b/.test(s)
  ) {
    signals.push("carpentry keywords")
    return { trade: "carpentry", signals }
  }

  if (
    /\b(paint|painting|prime|primer|repaint|paint walls|paint ceiling|paint ceilings|paint trim|paint doors)\b/.test(s)
  ) {
    signals.push("painting keywords")
    return { trade: "painting", signals }
  }

  if (
    /\b(outlet|switch|fixture|light|lighting|panel|recessed|can light|electrical)\b/.test(s)
  ) {
    signals.push("electrical keywords")
    return { trade: "electrical", signals }
  }

  if (
    /\b(toilet|sink|faucet|vanity|shower valve|plumbing|drain|water line|supply line)\b/.test(s)
  ) {
    signals.push("plumbing keywords")
    return { trade: "plumbing", signals }
  }

  signals.push("fallback general renovation")
  return { trade: "general renovation", signals }
}

function createBucket(trade: SplitTrade): SegmentBucket {
  return {
    trade,
    phrases: [],
    signals: [],
  }
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)))
}

function mergeRelatedTrades(
  buckets: Map<SplitTrade, SegmentBucket>
): Map<SplitTrade, SegmentBucket> {
  const texture = buckets.get("texture")
  const drywall = buckets.get("drywall")

  if (texture && drywall) {
    drywall.phrases.push(...texture.phrases)
    drywall.signals.push(...texture.signals, "merged texture into drywall group")
    buckets.delete("texture")
  }

  return buckets
}

export function splitScopeByTrade(scopeText: string): ScopeChunk[] {
  const segments = splitIntoSegments(scopeText)

  if (!segments.length) return []

  const buckets = new Map<SplitTrade, SegmentBucket>()

  for (const segment of segments) {
    const detected = detectTradeForSegment(segment)

    if (!buckets.has(detected.trade)) {
      buckets.set(detected.trade, createBucket(detected.trade))
    }

    const bucket = buckets.get(detected.trade)!
    bucket.phrases.push(segment)
    bucket.signals.push(...detected.signals)
  }

  const merged = mergeRelatedTrades(buckets)

  const out: ScopeChunk[] = []

  for (const [, bucket] of merged.entries()) {
    const phrases = dedupeStrings(bucket.phrases)
    const signals = dedupeStrings(bucket.signals)

    if (!phrases.length) continue

    out.push({
      trade: bucket.trade,
      scope: phrases.join(", "),
      signals,
    })
  }

  return out
}

export function isMultiTradeScope(scopeText: string): boolean {
  const chunks = splitScopeByTrade(scopeText)
  const realTrades = chunks
    .map((c) => c.trade)
    .filter((t) => t !== "general renovation")

  return new Set(realTrades).size >= 2
}