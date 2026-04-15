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

type ScopeContext = {
  paintingContext: boolean
  exteriorPaintingContext: boolean
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

function buildScopeContext(scopeText: string): ScopeContext {
  const s = normalizeScopeText(scopeText).toLowerCase()

  const paintingContext =
    /\b(paint|painting|prime|primer|repaint)\b/.test(s)

  const exteriorPaintingContext =
    paintingContext &&
    /\b(exterior|outside|stucco|siding|body|trim|garage door|front door|entry door|fascia|soffit|eaves|shutters?)\b/.test(s)

  return {
    paintingContext,
    exteriorPaintingContext,
  }
}

function isExteriorPaintingAccessorySegment(segment: string): boolean {
  const s = segment.toLowerCase().trim()

  return /\b(body|trim|garage door|front door|entry door|fascia|soffit|eaves|shutters?|stucco|siding)\b/.test(
    s
  )
}

function splitIntoSegments(scopeText: string): string[] {
  const text = normalizeScopeText(scopeText)

  if (!text) return []

  return text
    .split(
      /\s*,\s*|\s+\bthen\b\s+|\s+\balso\b\s+|\s+\band\s+(?=(?:paint|painting|prime|primer|repaint|patch|repair|replace|install|remove|demo|demolition|texture|skim|frame|tile|floor|flooring|hang|mount|relocate|move|wire|plumb|add)\b)/i
    )
    .map((s) => s.trim())
    .filter(Boolean)
}

function detectTradeForSegment(
  segment: string,
  context: ScopeContext
): {
  trade: SplitTrade
  signals: string[]
} {
  const s = segment.toLowerCase()
  const signals: string[] = []

  if (
    context.exteriorPaintingContext &&
    isExteriorPaintingAccessorySegment(s) &&
    !/\b(install|replace|hang|frame|remove|demo|demolition)\b/.test(s)
  ) {
    signals.push("exterior painting accessory")
    return { trade: "painting", signals }
  }

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
    /\b(paint|painting|prime|primer|repaint|paint walls|paint ceiling|paint ceilings|paint trim|paint doors|paint exterior|exterior painting)\b/.test(s)
  ) {
    signals.push("painting keywords")
    return { trade: "painting", signals }
  }

  if (
    /\b(baseboard|baseboards|trim|casing|casings|crown|crown molding|door install|doors|accent wall|wainscot|wall molding|framing|finish carpentry)\b/.test(s)
  ) {
    signals.push("carpentry keywords")
    return { trade: "carpentry", signals }
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
  buckets: Map<SplitTrade, SegmentBucket>,
  context: ScopeContext
): Map<SplitTrade, SegmentBucket> {
  const texture = buckets.get("texture")
  const drywall = buckets.get("drywall")

  if (texture && drywall) {
    drywall.phrases.push(...texture.phrases)
    drywall.signals.push(...texture.signals, "merged texture into drywall group")
    buckets.delete("texture")
  }

  if (context.exteriorPaintingContext) {
    const painting = buckets.get("painting")
    const carpentry = buckets.get("carpentry")

    if (painting && carpentry) {
      const moveToPainting = carpentry.phrases.filter((p) =>
        isExteriorPaintingAccessorySegment(p)
      )

      if (moveToPainting.length > 0) {
        painting.phrases.push(...moveToPainting)
        painting.signals.push("merged exterior paint accessories into painting")

        carpentry.phrases = carpentry.phrases.filter(
          (p) => !isExteriorPaintingAccessorySegment(p)
        )

        if (carpentry.phrases.length === 0) {
          buckets.delete("carpentry")
        }
      }
    }
  }

  return buckets
}

export function splitScopeByTrade(scopeText: string): ScopeChunk[] {
  const segments = splitIntoSegments(scopeText)

  if (!segments.length) return []

  const context = buildScopeContext(scopeText)
  const buckets = new Map<SplitTrade, SegmentBucket>()

  for (const segment of segments) {
    const detected = detectTradeForSegment(segment, context)

    if (!buckets.has(detected.trade)) {
      buckets.set(detected.trade, createBucket(detected.trade))
    }

    const bucket = buckets.get(detected.trade)!
    bucket.phrases.push(segment)
    bucket.signals.push(...detected.signals)
  }

  const merged = mergeRelatedTrades(buckets, context)

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