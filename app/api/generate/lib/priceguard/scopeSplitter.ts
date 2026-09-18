export type SplitTrade =
  | "painting"
  | "drywall"
  | "texture"
  | "flooring"
  | "tile"
  | "wallcovering"
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

type IncludedSegment = {
  description: string
  pricingScope: string
}

type ScopeContext = {
  paintingContext: boolean
  exteriorPaintingContext: boolean
  wallcoveringContext: boolean
  tileContext: boolean
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

  const wallcoveringContext =
    /\b(wallcovering|wall\s*covering|wallpaper|paper\s*hanging)\b/.test(s)

  const tileContext =
    /\b(tile|tiling|grout|thinset|waterproof|waterproofing|membrane|shower\s+walls?|tub\s+surround|cement\s*board|backer\s*board)\b/.test(
      s
    )

  return {
    paintingContext,
    exteriorPaintingContext,
    wallcoveringContext,
    tileContext,
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
      /\s*,\s*|(?<=[.!?])\s+|\s+\bthen\b\s+|\s+\balso\b\s+|\s+\band\s+(?=(?:paint|painting|prime|primer|repaint|patch|repair|replace|install|remove|demo|demolition|texture|skim|frame|tile|floor|flooring|hang|mount|relocate|move|wire|plumb|add|protect|protection|coordinate|coordination|existing|owner|furniture)\b)/i
    )
    .map((s) => s.trim().replace(/[.!?]+$/g, ""))
    .filter(Boolean)
}

function splitIntoSentences(scopeText: string): string[] {
  const text = normalizeScopeText(scopeText)

  if (!text) return []

  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function isBoundaryOnlySegment(segment: string): boolean {
  const s = segment.toLowerCase().trim()
  if (!s) return true

  const hasWorkVerb =
    /\b(paint|painting|prime|primer|repaint|patch|repair|replace|install|remove|demo|demolition|texture|skim|frame|hang|mount|relocate|move|wire|plumb|add|rough[- ]?in)\b/.test(
      s
    )

  if (
    /\b(excludes?|excluded|excluding|does\s+not\s+(?:include|cover)|not\s+included|not\s+part\s+of|by\s+others|by\s+owner|separate\s+(?:contractor|trade)|NIC)\b/.test(
      s
    )
  ) {
    return true
  }

  if (
    /\b(owner\s+provided|owner\s+supplied|owner-provided|owner-supplied)\b/.test(
      s
    ) &&
    !hasWorkVerb
  ) {
    return true
  }

  if (/\b(existing|remain|to\s+remain|remain\s+in\s+place)\b/.test(s) && !hasWorkVerb) {
    return true
  }

  if (
    /\b(coordinate|coordination)\b/.test(s) &&
    /\b(only|with|trade|trades|avoid|interference)\b/.test(s)
  ) {
    return true
  }

  if (
    /\b(protect|protection|mask|masking|cover|covering|safeguard|floor protection|surface protection|adjacent finish protection)\b/.test(
      s
    ) &&
    !hasWorkVerb
  ) {
    return true
  }

  if (
    /\b(coordinate|coordination|avoid(?:ing)? interference|no interference|without interference|work(?:ing)? around|existing)\b/.test(
      s
    ) &&
    !hasWorkVerb
  ) {
    return true
  }

  if (
    /\b(cleanup|clean up|customer approval|final approval|contractor supplied|contractor-supplied|owner supplied|owner-supplied)\b/.test(
      s
    ) &&
    !hasWorkVerb
  ) {
    return true
  }

  return false
}

function getIncludedSegments(scopeText: string): IncludedSegment[] {
  return splitIntoSentences(scopeText)
    .flatMap((sentence) => {
      if (isBoundaryOnlySegment(sentence)) return []
      // Only an adjacent coordinated pair within one clause can share its object.
      // Keep the original per-operation input at the point of distribution;
      // descriptive context is not new deterministic quantity authority.
      return sentence.split(/\s*,\s*|\s+\bthen\b\s+|\s+\balso\b\s+/i).flatMap((clause) => {
        const segments = splitIntoSegments(clause).map((pricingScope) => ({
          description: pricingScope,
          pricingScope,
        }))
        for (let i = 0; i < segments.length - 1; i++) {
          const first = segments[i]
          const second = segments[i + 1]
          const verb = /^(paint|patch)$/i.exec(first.pricingScope)
          const shared = /^(paint|patch)\s+(walls?\b.*)$/i.exec(second.pricingScope)
          if (
            verb && shared && verb[1].toLowerCase() !== shared[1].toLowerCase() &&
            !isBoundaryOnlySegment(second.pricingScope)
          ) {
            first.description = `${verb[1]} ${shared[2]}`
          }
        }
        return segments
      })
    })
    .filter((segment) => !isBoundaryOnlySegment(segment.pricingScope))
}

export function getIncludedScopeText(scopeText: string): string {
  // Existing anchor and quantity consumers retain the original included text.
  return getIncludedSegments(scopeText)
    .map((segment) => segment.pricingScope)
    .join(", ")
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

  if (context.paintingContext && /\b(?:one|two|three|\d+)\s+coats?\b/.test(s)) {
    signals.push("painting coat count")
    return { trade: "painting", signals }
  }

  if (
    /\b(wallcovering|wall\s*covering|wallpaper|paper\s*hanging)\b/.test(s) ||
    (context.wallcoveringContext && /\b(wall\s+prep|primer|prime)\b/.test(s))
  ) {
    signals.push("wallcovering keywords")
    return { trade: "wallcovering", signals }
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
    /\b(floor|flooring|carpet|lvp|vinyl plank|luxury vinyl|laminate|hardwood|engineered wood|tile floor|install flooring)\b/.test(s)
  ) {
    signals.push("flooring keywords")
    return { trade: "flooring", signals }
  }

  if (
    /\b(wall\s*tile|shower\s+walls?|tub\s+surround|waterproof|waterproofing|membrane|thinset|grout|install\s+tile)\b/.test(s)
  ) {
    signals.push("tile keywords")
    return { trade: "tile", signals }
  }

  if (
    context.tileContext &&
    /\b(demo|demolition|remove|removal|tear\s*out|cement\s*board|backer\s*board|durock|hardie(?:backer)?|membrane|waterproof|waterproofing)\b/.test(s)
  ) {
    signals.push("tile prep context")
    return { trade: "tile", signals }
  }

  if (
    context.tileContext &&
    /\b(tile\s+trim|edge\s+trim|trim\s+piece|trim\s+pieces|schluter|jolly|bullnose|trim)\b/.test(s) &&
    !/\b(baseboards?|casing|crown|door|window|finish\s+carpentry|carpentry)\b/.test(s)
  ) {
    signals.push("tile trim context")
    return { trade: "tile", signals }
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

function splitScope(scopeText: string, purpose: "description" | "pricingScope"): ScopeChunk[] {
  const segments = getIncludedSegments(scopeText)
  const includedScopeText = segments.map((segment) => segment.pricingScope).join(", ")

  if (!segments.length) return []

  const context = buildScopeContext(includedScopeText)
  const buckets = new Map<SplitTrade, SegmentBucket>()

  for (const segment of segments) {
    const detected = detectTradeForSegment(segment.pricingScope, context)

    if (!buckets.has(detected.trade)) {
      buckets.set(detected.trade, createBucket(detected.trade))
    }

    const bucket = buckets.get(detected.trade)!
    bucket.phrases.push(segment[purpose])
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

export function splitScopeByTrade(scopeText: string): ScopeChunk[] {
  return splitScope(scopeText, "description")
}

// Internal pricing input selection shares the parser; no provenance is added to
// ScopeChunk or the API. Measurements supplied independently remain separate.
export function splitScopeByTradeForPricing(scopeText: string): ScopeChunk[] {
  return splitScope(scopeText, "pricingScope")
}

export function isMultiTradeScope(scopeText: string): boolean {
  const chunks = splitScopeByTrade(scopeText)
  const realTrades = chunks
    .map((c) => c.trade)
    .filter((t) => t !== "general renovation")

  return new Set(realTrades).size >= 2
}
