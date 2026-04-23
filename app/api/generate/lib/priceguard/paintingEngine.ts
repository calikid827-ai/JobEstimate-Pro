import type { EstimateSectionProvenance } from "../estimator/types"

type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

type ExteriorSubstrate = "stucco" | "siding" | "mixed" | "unknown"
type ExteriorAccess = "low" | "medium" | "high"
type ExteriorTrimComplexity = "low" | "medium" | "high"

type PaintingPhotoAnalysis = {
  summary?: string
  observations?: string[]
  detectedMaterials?: string[]
  detectedConditions?: string[]
  detectedAccessIssues?: string[]
  detectedFixtures?: string[]
  quantitySignals?: {
    doors?: number | null
    windows?: number | null
  }
  confidence?: "low" | "medium" | "high"
}

type PaintScope = "walls" | "walls_ceilings" | "full"
type SectionBucket = {
  section: string
  labor: number
  materials: number
  subs: number
  total: number
}
type SectionPricingDetail = SectionBucket & {
  pricingBasis: "direct" | "burden"
  unit?: "sqft" | "linear_ft" | "rooms" | "doors" | "days" | "lump_sum"
  quantity?: number
  notes?: string[]
  provenance?: EstimateSectionProvenance
}

export type PaintingDeterministicResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  pricing: Pricing | null
  estimateBasis: {
    units: ("sqft" | "rooms" | "doors" | "days" | "lump_sum")[]
    quantities: {
      sqft?: number
      rooms?: number
      doors?: number
      days?: number
      lump_sum?: number
    }
    laborRate: number
    hoursPerUnit: number
    crewDays: number
    mobilization: number
    assumptions: string[]
    sectionPricing?: SectionPricingDetail[]
  } | null
  jobType:
    | "interior_repaint"
    | "walls_only"
    | "walls_ceilings"
    | "full_interior"
    | "doors_only"
    | "mixed_scope"
    | "exterior_repaint"
    | "unknown"
  signals: {
    sqft?: number | null
    rooms?: number | null
    doors?: number | null
    coats?: number | null
    isVacant?: boolean
    prepLevel?: "light" | "medium" | "heavy"
    paintScope?: PaintScope | null
    isExterior?: boolean
    stories?: 1 | 2 | 3 | null
    substrate?: ExteriorSubstrate
    access?: ExteriorAccess
    trimComplexity?: ExteriorTrimComplexity
    garageDoors?: number | null
    entryDoors?: number | null
    approxBodyWallSqft?: number | null
  }
  notes: string[]
  sectionBuckets?: SectionBucket[]
}

function clampPricing(pricing: Pricing): Pricing {
  const MAX_TOTAL = 10_000_000
  return {
    labor: Math.max(0, Math.round(pricing.labor)),
    materials: Math.max(0, Math.round(pricing.materials)),
    subs: Math.max(0, Math.round(pricing.subs)),
    markup: Math.min(25, Math.max(15, Math.round(pricing.markup))),
    total: Math.min(MAX_TOTAL, Math.max(0, Math.round(pricing.total))),
  }
}

function diffPricing(next: Pricing, prev: Pricing): Pricing {
  return clampPricing({
    labor: next.labor - prev.labor,
    materials: next.materials - prev.materials,
    subs: next.subs - prev.subs,
    markup: next.markup,
    total: 0,
  })
}

function finalizeSectionBuckets(args: {
  sections: Array<Omit<SectionBucket, "total">>
  pricing: Pricing
}): SectionBucket[] {
  const positive = args.sections
    .map((section) => ({
      ...section,
      labor: Math.max(0, Math.round(section.labor)),
      materials: Math.max(0, Math.round(section.materials)),
      subs: Math.max(0, Math.round(section.subs)),
    }))
    .filter((section) => section.labor > 0 || section.materials > 0 || section.subs > 0)

  if (!positive.length) return []

  let totalAssigned = 0
  return positive.map((section, index) => {
    const base = section.labor + section.materials + section.subs
    const total =
      index === positive.length - 1
        ? Math.max(0, args.pricing.total - totalAssigned)
        : Math.max(0, Math.round(base * (1 + args.pricing.markup / 100)))
    totalAssigned += total
    return { ...section, total }
  })
}

function parseSqftFromText(scopeText: string): number | null {
  const t = scopeText.toLowerCase().replace(/,/g, "")

  const m = t.match(
    /(\d{1,6}(?:\.\d{1,2})?)\s*(sq\.?\s*ft|sqft|sf|square\s*feet|square\s*foot)\b/i
  )

  if (!m?.[1]) return null

  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseRoomCount(scopeText: string): number | null {
  const t = scopeText.toLowerCase()

  const patterns = [
    /paint\s+(\d{1,4})\s+rooms?\b/i,
    /(\d{1,4})\s+bed(room)?\b/i,
    /(\d{1,4})\s+bed(room)?\s+(apartment|unit|house|home)\b/i,
    /(\d{1,4})\s+rooms?\b/i,
    /rooms?\s*[:\-]\s*(\d{1,4})\b/i,
  ]

  for (const p of patterns) {
    const m = t.match(p)
    if (m?.[1]) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  return null
}

function parseDoorCount(scopeText: string): number | null {
  const t = scopeText.toLowerCase()

  const patterns = [
    /paint\s+(\d{1,4})\s+(?:\w+\s+){0,2}doors?\b/i,
    /(\d{1,4})\s+(?:\w+\s+){0,2}doors?\b/i,
    /doors?\s*[:\-]\s*(\d{1,4})\b/i,
  ]

  for (const p of patterns) {
    const m = t.match(p)
    if (m?.[1]) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  return null
}

function parseCoats(scopeText: string): number {
  const t = scopeText.toLowerCase()

  const numeric = t.match(/\b([1-3])\s*coats?\b/)
  if (numeric?.[1]) {
    const n = Number(numeric[1])
    if (Number.isFinite(n) && n >= 1 && n <= 3) return n
  }

  if (/\b(two|2)\s+coat\b/.test(t)) return 2
  if (/\b(three|3)\s+coat\b/.test(t)) return 3
  if (/\b(one|1)\s+coat\b/.test(t)) return 1

  return 2
}

function parseVacancy(scopeText: string): boolean {
  const t = scopeText.toLowerCase()
  return /\b(vacant|empty|unoccupied)\b/.test(t)
}

function parsePrepLevel(scopeText: string): "light" | "medium" | "heavy" {
  const t = scopeText.toLowerCase()

  if (/\b(heavy\s+prep|extensive\s+prep|major\s+prep|skim|wallpaper\s+removal|significant\s+patch|lots\s+of\s+patch|texture\s+repair)\b/.test(t)) {
    return "heavy"
  }

  if (/\b(light\s+prep|minor\s+patch|minimal\s+patch|same\s+color\s+repaint|same-color\s+repaint)\b/.test(t)) {
    return "light"
  }

  return "medium"
}

function inferPaintScope(scopeText: string, paintScope?: PaintScope | null): PaintScope {
  if (paintScope === "walls" || paintScope === "walls_ceilings" || paintScope === "full") {
    return paintScope
  }

  const t = scopeText.toLowerCase()

  const mentionsCeilings = /\bceiling|ceilings\b/.test(t)
  const mentionsTrimDoors = /\b(trim|baseboard|baseboards|doors?|door\s*frames?|casing|casings)\b/.test(t)

  if (mentionsCeilings && mentionsTrimDoors) return "full"
  if (mentionsCeilings) return "walls_ceilings"
  return "walls"
}

function looksLikePainting(scopeText: string): boolean {
  return /\b(paint|painting|repaint|prime|primer|coat|coats)\b/i.test(scopeText)
}

function isDoorsOnlyIntent(scopeText: string, doors: number | null): boolean {
  if (!doors || doors <= 0) return false

  const t = scopeText.toLowerCase()
  const roomishRe =
    /\b(rooms?|hallway|living\s*room|family\s*room|bed(room)?|kitchen|bath(room)?|dining|office|closet|stair|entry|walls?|ceilings?)\b/i

  return !roomishRe.test(t)
}

function getPhotoBlob(photoAnalysis?: PaintingPhotoAnalysis | null): string {
  if (!photoAnalysis) return ""

  return [
    photoAnalysis.summary || "",
    ...(photoAnalysis.observations || []),
    ...(photoAnalysis.detectedMaterials || []),
    ...(photoAnalysis.detectedConditions || []),
    ...(photoAnalysis.detectedAccessIssues || []),
    ...(photoAnalysis.detectedFixtures || []),
  ]
    .join(" ")
    .toLowerCase()
}

function looksLikeExteriorPainting(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): boolean {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  const exteriorSignals =
    /\b(exterior|outside|stucco|siding|fascia|soffit|eaves?|garage door|front door|rear elevation|front elevation|side of house|body color|trim color)\b/

  const strongInteriorSignals =
    /\b(bedroom|bathroom|kitchen|hallway|living room|interior only|inside walls|ceilings inside)\b/

  return exteriorSignals.test(t) && !strongInteriorSignals.test(scopeText.toLowerCase())
}

function inferExteriorStories(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): 1 | 2 | 3 | null {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`

  if (/\b(three[-\s]?story|3[-\s]?story|third[-\s]?story)\b/i.test(t)) return 3
  if (/\b(two[-\s]?story|2[-\s]?story|second[-\s]?story)\b/i.test(t)) return 2
  if (/\b(one[-\s]?story|single[-\s]?story)\b/i.test(t)) return 1

  return null
}

function inferExteriorSubstrate(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): ExteriorSubstrate {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  const hasStucco = /\bstucco\b/.test(t)
  const hasSiding = /\b(siding|lap siding|wood siding|t1-11|hardie)\b/.test(t)

  if (hasStucco && hasSiding) return "mixed"
  if (hasStucco) return "stucco"
  if (hasSiding) return "siding"

  return "unknown"
}

function inferExteriorAccess(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): ExteriorAccess {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  if (/\b(very tight|steep|limited access|difficult access|narrow side yard|pool side obstruction|dense landscaping|tree coverage|lift required)\b/.test(t)) {
    return "high"
  }

  if (/\b(tight access|narrow|landscaping|shrubs|bushes|tree|meter|conduit|fence line|walkway only)\b/.test(t)) {
    return "medium"
  }

  return "low"
}

function inferExteriorPrepLevel(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): "light" | "medium" | "heavy" {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  if (/\b(peeling|failed paint|wood rot|heavy cracking|major crack|patch stucco|stucco repair|extensive prep|caulk failure|replace wood)\b/.test(t)) {
    return "heavy"
  }

  if (/\b(light fade|minor wear|wash only|minimal prep|clean and paint)\b/.test(t)) {
    return "light"
  }

  return "medium"
}

function inferExteriorTrimComplexity(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): ExteriorTrimComplexity {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  if (/\b(multiple gables|heavy trim package|decorative beams|extensive fascia|extensive eaves)\b/.test(t)) {
    return "high"
  }

  if (/\b(fascia|eaves|rafter tails|multiple gables|decorative trim|window trim|garage trim|door trim|beams)\b/.test(t)) {
    return "medium"
  }

  return "low"
}

function inferGarageDoorCount(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): number {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  const explicit =
    t.match(/\b(\d{1,2})\s+garage\s+doors?\b/i) ||
    t.match(/\bgarage\s+doors?\s*[:\-]\s*(\d{1,2})\b/i)

  if (explicit?.[1]) {
    const n = Number(explicit[1])
    if (Number.isFinite(n) && n > 0) return n
  }

  return /\bgarage\b/.test(t) ? 1 : 0
}

function inferEntryDoorCount(
  scopeText: string,
  photoAnalysis?: PaintingPhotoAnalysis | null
): number {
  const t = `${scopeText} ${getPhotoBlob(photoAnalysis)}`.toLowerCase()

  const explicit =
    t.match(/\b(\d{1,2})\s+(front|entry)\s+doors?\b/i) ||
    t.match(/\b(front|entry)\s+doors?\s*[:\-]\s*(\d{1,2})\b/i)

  if (explicit?.[2]) {
    const n = Number(explicit[2])
    if (Number.isFinite(n) && n > 0) return n
  }

  return /\b(front door|entry door)\b/.test(t) ? 1 : 0
}

function inferExteriorWindowCount(
  photoAnalysis?: PaintingPhotoAnalysis | null
): number | null {
  const n = Number(photoAnalysis?.quantitySignals?.windows ?? 0)
  return Number.isFinite(n) && n > 0 ? n : null
}

function estimateExteriorBodyWallSqft(args: {
  measuredFloorSqft: number | null
  textSqft: number | null
  stories: 1 | 2 | 3 | null
}): number {
  const baseFloorSqft = args.measuredFloorSqft ?? args.textSqft ?? null

  if (baseFloorSqft && baseFloorSqft > 0) {
    const multiplier =
      args.stories === 3 ? 1.8 :
      args.stories === 2 ? 1.55 :
      1.25

    return Math.round((baseFloorSqft * multiplier) / 25) * 25
  }

  const fallback =
    args.stories === 3 ? 3000 :
    args.stories === 2 ? 2200 :
    1500

  return fallback
}

function buildEstimateBasis(args: {
  pricing: Pricing
  laborRate: number
  sqft: number | null
  rooms: number | null
  doors: number | null
  crewDays: number
  mobilization: number
  preferredUnit: "sqft" | "rooms" | "doors" | "days"
  assumptions: string[]
  sectionPricing?: SectionPricingDetail[]
}): PaintingDeterministicResult["estimateBasis"] {
  const impliedLaborHours =
    args.laborRate > 0 ? Number(args.pricing.labor || 0) / args.laborRate : 0

  let hoursPerUnit = 0

  if (args.preferredUnit === "sqft" && args.sqft && args.sqft > 0) {
    hoursPerUnit = impliedLaborHours / args.sqft
  } else if (args.preferredUnit === "rooms" && args.rooms && args.rooms > 0) {
    hoursPerUnit = impliedLaborHours / args.rooms
  } else if (args.preferredUnit === "doors" && args.doors && args.doors > 0) {
    hoursPerUnit = impliedLaborHours / args.doors
  }

  return {
    units: ["days", args.preferredUnit],
    quantities: {
      sqft: args.sqft ?? undefined,
      rooms: args.rooms ?? undefined,
      doors: args.doors ?? undefined,
      days: args.crewDays,
    },
    laborRate: args.laborRate,
    hoursPerUnit: Math.round(hoursPerUnit * 1000) / 1000,
    crewDays: args.crewDays,
    mobilization: args.mobilization,
    assumptions: args.assumptions,
    sectionPricing: args.sectionPricing,
  }
}

function buildPaintingSectionPricing(args: {
  sectionBuckets: SectionBucket[]
  doorCount: number | null
  trimLf: number | null
  supportedWallSqft?: number | null
  supportedCeilingSqft?: number | null
  supportedRoomCount?: number | null
  interiorBaseSupport?: "measured" | "scaled" | null
  wallSupportSource?: "trade_finding" | "takeoff" | null
  ceilingSupportSource?: "trade_finding" | "takeoff" | null
  prototypeSupportSource?: "repeated_space_rollup" | "takeoff" | "schedule" | null
  prototypeRoomGroupLabel?: string | null
  doorCountSupport?: "measured" | null
  doorCountSource?: "trade_finding" | "takeoff" | "schedule" | null
  trimSupport?: "measured" | null
  trimSource?: "trade_finding" | "takeoff" | null
}): SectionPricingDetail[] {
  return args.sectionBuckets.map((bucket) => {
    if (bucket.section === "Doors / frames") {
      return {
        ...bucket,
        pricingBasis: "direct",
        unit: args.doorCount && args.doorCount > 0 ? "doors" : undefined,
        quantity: args.doorCount && args.doorCount > 0 ? args.doorCount : undefined,
        notes:
          args.doorCountSupport === "measured"
            ? ["Measured plan opening counts support this door/frame row."]
            : undefined,
        provenance:
          args.doorCountSupport === "measured"
            ? {
                quantitySupport: "measured",
                sourceBasis: args.doorCountSource ? [args.doorCountSource] : [],
                summary: "Direct door/frame row is backed by explicit counted openings.",
                supportCategory: "door_openings",
                quantityDetail:
                  args.doorCount && args.doorCount > 0
                    ? `${args.doorCount} explicit door/frame openings were used for this row.`
                    : undefined,
                diagnosticDetails: [
                  "direct_row_allowed: explicit counted openings are present.",
                  args.doorCountSource ? `source_basis: ${args.doorCountSource}` : null,
                ].filter(Boolean) as string[],
              }
            : undefined,
      }
    }

    if (bucket.section === "Trim / casing") {
      return {
        ...bucket,
        pricingBasis: "direct",
        unit: args.trimLf && args.trimLf > 0 ? "linear_ft" : undefined,
        quantity: args.trimLf && args.trimLf > 0 ? args.trimLf : undefined,
        notes:
          args.trimSupport === "measured"
            ? ["Measured plan trim/casing footage supports this row."]
            : undefined,
        provenance:
          args.trimSupport === "measured"
            ? {
                quantitySupport: "measured",
                sourceBasis: args.trimSource ? [args.trimSource] : [],
                summary: "Direct trim/casing row is backed by measured trim footage.",
                supportCategory: "trim_lf",
                quantityDetail:
                  args.trimLf && args.trimLf > 0
                    ? `${args.trimLf} LF of measured trim/casing footage was used for this row.`
                    : undefined,
                diagnosticDetails: [
                  "direct_row_allowed: measured trim/casing footage is present.",
                  args.trimSource ? `source_basis: ${args.trimSource}` : null,
                ].filter(Boolean) as string[],
              }
            : undefined,
      }
    }

    if (bucket.section === "Corridor repaint" || bucket.section === "Prep / protection") {
      return {
        ...bucket,
        pricingBasis: "burden",
        notes: ["Section remains embedded in the interior paint engine, but is now surfaced structurally."],
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: ["repeated_space_rollup"],
          summary: "Embedded burden remains non-standalone and non-authoritative.",
          supportCategory:
            bucket.section === "Corridor repaint" ? "corridor_scope" : "prep_protection",
          blockedReason:
            bucket.section === "Corridor repaint"
              ? "Corridor/common-area scope stays embedded and cannot become a standalone direct row in this pass."
              : "Prep/protection remains embedded and cannot become a standalone direct row in this pass.",
          diagnosticDetails: [
            "embedded_burden_only: section remains reference-only.",
            bucket.section === "Corridor repaint"
              ? "reason: corridor/common-area scope is kept separate from direct room rows."
              : "reason: prep/protection is surfaced for explanation but not promoted to billable direct scope.",
          ],
        },
      }
    }

    return {
      ...bucket,
      pricingBasis: "direct",
      notes:
        bucket.section === "Walls" || bucket.section === "Ceilings"
          ? args.interiorBaseSupport === "measured"
            ? ["Measured wall/ceiling support backs this direct row."]
            : args.interiorBaseSupport === "scaled"
            ? ["Strong repeated-room support backs this row as scaled prototype coverage, not as exact measured area."]
            : undefined
          : undefined,
      provenance:
        bucket.section === "Walls" || bucket.section === "Ceilings"
          ? args.interiorBaseSupport === "measured"
            ? {
                quantitySupport: "measured",
                sourceBasis: [
                  bucket.section === "Ceilings"
                    ? args.ceilingSupportSource || "takeoff"
                    : args.wallSupportSource || "takeoff",
                ],
                summary:
                  bucket.section === "Ceilings"
                    ? "Direct ceiling row is backed by measured ceiling area."
                    : "Direct wall row is backed by measured wall area.",
                supportCategory:
                  bucket.section === "Ceilings" ? "ceiling_area" : "wall_area",
                quantityDetail:
                  bucket.section === "Ceilings"
                    ? args.supportedCeilingSqft && args.supportedCeilingSqft > 0
                      ? `${args.supportedCeilingSqft} sqft of measured ceiling area was used for this row.`
                      : undefined
                    : args.supportedWallSqft && args.supportedWallSqft > 0
                      ? `${args.supportedWallSqft} sqft of measured wall area was used for this row.`
                      : undefined,
                diagnosticDetails: [
                  "direct_row_allowed: measured paintable area is present.",
                  bucket.section === "Ceilings"
                    ? `source_basis: ${args.ceilingSupportSource || "takeoff"}`
                    : `source_basis: ${args.wallSupportSource || "takeoff"}`,
                ],
              }
            : args.interiorBaseSupport === "scaled"
              ? {
                  quantitySupport: "scaled_prototype",
                  sourceBasis: [args.prototypeSupportSource || "repeated_space_rollup"],
                  summary: "Direct row is backed by repeated-unit prototype scaling, not measured area.",
                  supportCategory: "repeated_unit_count",
                  roomGroupBasis: args.prototypeRoomGroupLabel || undefined,
                  quantityDetail:
                    args.supportedRoomCount && args.supportedRoomCount > 0
                      ? `${args.supportedRoomCount} repeated ${args.prototypeRoomGroupLabel || "room"} instances supported prototype scaling for this row.`
                      : undefined,
                  diagnosticDetails: [
                    "direct_row_allowed: strong repeated-space support qualified as scaled prototype coverage.",
                    "not_measured_area: prototype scaling did not become measured wall/ceiling area.",
                    args.prototypeSupportSource
                      ? `source_basis: ${args.prototypeSupportSource}`
                      : null,
                  ].filter(Boolean) as string[],
                }
              : undefined
          : undefined,
    }
  })
}

// -----------------------------
// MAIN ENGINE
// -----------------------------
export function computePaintingDeterministic(args: {
  scopeText: string
  stateMultiplier: number
  measurements?: { totalSqft?: number | null } | null
  paintScope?: PaintScope | null
  photoAnalysis?: PaintingPhotoAnalysis | null
  planSectionInputs?: {
    supportedInteriorSqft?: number | null
    supportedWallSqft?: number | null
    supportedCeilingSqft?: number | null
    wallSupportSource?: "trade_finding" | "takeoff" | null
    ceilingSupportSource?: "trade_finding" | "takeoff" | null
    supportedRoomCount?: number | null
    prototypeSupportSource?: "repeated_space_rollup" | "takeoff" | "schedule" | null
    prototypeRoomGroupLabel?: string | null
    supportedDoorCount?: number | null
    doorCountSource?: "trade_finding" | "takeoff" | "schedule" | null
    supportedTrimLf?: number | null
    trimSource?: "trade_finding" | "takeoff" | null
    includeCeilings?: boolean
    hasCorridorSection?: boolean
    hasPrepProtectionSection?: boolean
    interiorBaseSupport?: "measured" | "scaled" | null
    doorCountSupport?: "measured" | null
    trimSupport?: "measured" | null
  } | null
}): PaintingDeterministicResult {
  const scope = (args.scopeText || "").trim()

  if (!scope) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      jobType: "unknown",
      signals: {},
      notes: ["Empty scopeText"],
    }
  }

  if (!looksLikePainting(scope)) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      jobType: "unknown",
      signals: {},
      notes: ["No painting signals detected"],
    }
  }

  const measSqft =
    args.measurements?.totalSqft && Number(args.measurements.totalSqft) > 0
      ? Number(args.measurements.totalSqft)
      : null
  const supportedInteriorSqft =
    typeof args.planSectionInputs?.supportedInteriorSqft === "number" &&
    args.planSectionInputs.supportedInteriorSqft > 0
      ? Math.round(args.planSectionInputs.supportedInteriorSqft)
      : null
  const supportedWallSqft =
    typeof args.planSectionInputs?.supportedWallSqft === "number" &&
    args.planSectionInputs.supportedWallSqft > 0
      ? Math.round(args.planSectionInputs.supportedWallSqft)
      : null
  const supportedCeilingSqft =
    typeof args.planSectionInputs?.supportedCeilingSqft === "number" &&
    args.planSectionInputs.supportedCeilingSqft > 0
      ? Math.round(args.planSectionInputs.supportedCeilingSqft)
      : null

  const textSqft = parseSqftFromText(scope)
  const sqft = supportedInteriorSqft ?? measSqft ?? textSqft ?? null

  const parsedRooms = parseRoomCount(scope)
  const parsedDoors = parseDoorCount(scope)
  const supportedRooms =
    typeof args.planSectionInputs?.supportedRoomCount === "number" &&
    args.planSectionInputs.supportedRoomCount > 0
      ? Math.round(args.planSectionInputs.supportedRoomCount)
      : null
  const supportedDoors =
    typeof args.planSectionInputs?.supportedDoorCount === "number" &&
    args.planSectionInputs.supportedDoorCount > 0
      ? Math.round(args.planSectionInputs.supportedDoorCount)
      : null
  const rooms = parsedRooms ?? supportedRooms
  const doors = parsedDoors ?? supportedDoors
  const coats = parseCoats(scope)
  const isVacant = args.planSectionInputs?.hasCorridorSection ? false : parseVacancy(scope)
  const parsedPrepLevel = parsePrepLevel(scope)
  const prepLevel =
    args.planSectionInputs?.hasPrepProtectionSection && parsedPrepLevel === "light"
      ? "medium"
      : parsedPrepLevel
  const finalPaintScope = args.planSectionInputs?.includeCeilings
    ? "walls_ceilings"
    : inferPaintScope(scope, args.paintScope ?? null)
  const doorsOnly = isDoorsOnlyIntent(scope, doors)

    const exteriorJob = looksLikeExteriorPainting(scope, args.photoAnalysis ?? null)

  if (exteriorJob) {
    const stories = inferExteriorStories(scope, args.photoAnalysis ?? null)
    const substrate = inferExteriorSubstrate(scope, args.photoAnalysis ?? null)
    const access = inferExteriorAccess(scope, args.photoAnalysis ?? null)
    const exteriorPrepLevel = inferExteriorPrepLevel(scope, args.photoAnalysis ?? null)
    const trimComplexity = inferExteriorTrimComplexity(scope, args.photoAnalysis ?? null)
    const garageDoors = inferGarageDoorCount(scope, args.photoAnalysis ?? null)
    const entryDoors = inferEntryDoorCount(scope, args.photoAnalysis ?? null)
    const windows = inferExteriorWindowCount(args.photoAnalysis ?? null)

    const approxBodyWallSqft = estimateExteriorBodyWallSqft({
      measuredFloorSqft: measSqft,
      textSqft,
      stories,
    })

    const priced = pricePaintingExterior({
      approxBodyWallSqft,
      stateMultiplier: args.stateMultiplier,
      substrate,
      stories,
      access,
      trimComplexity,
      prepLevel: exteriorPrepLevel,
      garageDoors,
      entryDoors,
      windows,
      coats,
    })

    const estimateBasis = buildEstimateBasis({
      pricing: priced.pricing,
      laborRate: priced.laborRate,
      sqft: approxBodyWallSqft,
      rooms: null,
      doors: null,
      crewDays: priced.crewDays,
      mobilization: priced.mobilization,
      preferredUnit: "sqft",
      assumptions: [
        measSqft || textSqft
          ? `${approxBodyWallSqft} exterior body wall sqft derived from provided sqft.`
          : `${approxBodyWallSqft} exterior body wall sqft estimated from story-count/photo heuristics.`,
        `Exterior substrate inferred as ${substrate}.`,
        `Exterior access inferred as ${access}.`,
        `Trim complexity inferred as ${trimComplexity}.`,
        `Exterior prep level: ${exteriorPrepLevel}.`,
        `${coats} coat(s) assumed.`,
        garageDoors > 0 ? `${garageDoors} garage door(s) included.` : `No garage door allowance added.`,
        entryDoors > 0 ? `${entryDoors} entry door(s) included.` : `No entry door allowance added.`,
      ],
    })

    return {
      okForDeterministic: true,
      okForVerified: !!measSqft || !!textSqft,
      pricing: priced.pricing,
      estimateBasis,
      jobType: "exterior_repaint",
      signals: {
        sqft: null,
        rooms: null,
        doors: null,
        coats,
        isVacant: false,
        prepLevel: exteriorPrepLevel,
        paintScope: null,
        isExterior: true,
        stories,
        substrate,
        access,
        trimComplexity,
        garageDoors,
        entryDoors,
        approxBodyWallSqft,
      },
      notes: [
        "Painting exterior deterministic pricing applied",
        !measSqft && !textSqft
          ? "Exterior price is photo-assisted and should be treated as non-verified until dimensions are confirmed."
          : "Exterior price used supplied sqft input.",
      ],
      sectionBuckets: [],
    }
  }

  // doors-only deterministic
  if (doorsOnly && doors && doors > 0) {
    const priced = pricePaintingDoors({
      doors,
      stateMultiplier: args.stateMultiplier,
      prepLevel,
      coats,
    })

    const estimateBasis = buildEstimateBasis({
      pricing: priced.pricing,
      laborRate: priced.laborRate,
      sqft: null,
      rooms: null,
      doors,
      crewDays: priced.crewDays,
      mobilization: priced.mobilization,
      preferredUnit: "doors",
      assumptions: [
        `${doors} doors parsed from scope text.`,
        `${coats} coat(s) assumed.`,
        `Prep level: ${prepLevel}.`,
        `Door pricing includes frames/casing baseline.`,
      ],
      sectionPricing: buildPaintingSectionPricing({
        sectionBuckets: priced.sectionBuckets,
        doorCount: doors,
        trimLf: null,
        supportedWallSqft: null,
        supportedCeilingSqft: null,
        supportedRoomCount: null,
        interiorBaseSupport: "measured",
        doorCountSource: "takeoff",
        doorCountSupport: "measured",
        trimSupport: null,
      }),
    })

    return {
      okForDeterministic: true,
      okForVerified: true,
      pricing: priced.pricing,
      estimateBasis,
      jobType: "doors_only",
      signals: {
        sqft: null,
        rooms: null,
        doors,
        coats,
        isVacant,
        prepLevel,
        paintScope: "walls",
      },
      notes: ["Painting doors-only deterministic pricing applied"],
      sectionBuckets: priced.sectionBuckets,
    }
  }

  const hasInteriorBase = !!((sqft && sqft > 0) || (rooms && rooms > 0))

  // mixed interior + doors deterministic
  if (hasInteriorBase && doors && doors > 0) {
    const roomPriced = pricePaintingInterior({
      sqft,
      rooms,
      stateMultiplier: args.stateMultiplier,
      paintScope: finalPaintScope,
      coats,
      isVacant,
      prepLevel,
      hasCorridorSection: !!args.planSectionInputs?.hasCorridorSection,
      hasPrepProtectionSection: !!args.planSectionInputs?.hasPrepProtectionSection,
      supportedTrimLf: args.planSectionInputs?.supportedTrimLf ?? null,
      exactWallSqft: supportedWallSqft,
      exactCeilingSqft: supportedCeilingSqft,
    })

    const doorPriced = pricePaintingDoors({
      doors,
      stateMultiplier: args.stateMultiplier,
      prepLevel,
      coats,
    })

    const labor = roomPriced.pricing.labor + doorPriced.pricing.labor
    const materials = roomPriced.pricing.materials + doorPriced.pricing.materials
    const subs = Math.max(roomPriced.pricing.subs, doorPriced.pricing.subs)
    const markup = Math.max(roomPriced.pricing.markup, doorPriced.pricing.markup)
    const base = labor + materials + subs
    const total = Math.round(base * (1 + markup / 100))
    const pricing = clampPricing({ labor, materials, subs, markup, total })

    const crewDays = Math.max(roomPriced.crewDays, doorPriced.crewDays)
    const mobilization = Math.max(roomPriced.mobilization, doorPriced.mobilization)

    const sectionBuckets = finalizeSectionBuckets({
      pricing,
      sections: [
        ...roomPriced.sectionBuckets.map((bucket) => ({
          section: bucket.section,
          labor: bucket.labor,
          materials: bucket.materials,
          subs: bucket.subs,
        })),
        ...doorPriced.sectionBuckets.map((bucket) => ({
          section: bucket.section,
          labor: bucket.labor,
          materials: bucket.materials,
          subs: bucket.subs,
        })),
      ],
    })

    const estimateBasis = buildEstimateBasis({
      pricing,
      laborRate: roomPriced.laborRate,
      sqft,
      rooms,
      doors,
      crewDays,
      mobilization,
      preferredUnit: sqft ? "sqft" : "rooms",
      assumptions: [
        rooms
          ? parsedRooms
            ? `${rooms} room(s) parsed from scope text.`
            : `${rooms} room(s) supported by plan-aware repeated-room routing.`
          : sqft
          ? supportedInteriorSqft && !textSqft && !measSqft
            ? `${sqft} sqft used for interior painting basis from measured plan-aware wall support.`
            : `${sqft} sqft used for interior painting basis.`
          : null,
        parsedDoors
          ? `${doors} door(s) parsed from scope text.`
          : `${doors} door(s) supported by plan-aware door/frame routing.`,
        args.planSectionInputs?.interiorBaseSupport === "scaled"
          ? "Interior base was scaled from strong repeated-room support rather than exact measured wall area."
          : args.planSectionInputs?.interiorBaseSupport === "measured"
          ? "Interior base was backed by measured sqft support."
          : null,
        `${coats} coat(s) assumed.`,
        `Paint scope: ${finalPaintScope}.`,
        `Prep level: ${prepLevel}.`,
        args.planSectionInputs?.supportedTrimLf && args.planSectionInputs.supportedTrimLf > 0
          ? `${Math.round(args.planSectionInputs.supportedTrimLf)} trim LF was carried into live trim/casing numeric pricing.`
          : null,
        supportedWallSqft
          ? supportedCeilingSqft && finalPaintScope === "walls_ceilings"
            ? `${supportedWallSqft} measured wall sqft and ${supportedCeilingSqft} measured ceiling sqft informed the live painting route.`
            : `${supportedWallSqft} measured wall sqft informed the live painting route.`
          : null,
        args.planSectionInputs?.hasCorridorSection
          ? "Corridor repaint remains separately routed in live prep, but corridor-specific numeric pricing still shares the main painting engine."
          : null,
        args.planSectionInputs?.hasPrepProtectionSection
          ? "Plan-aware prep / protection routing raised the live painting prep interpretation to at least medium."
          : null,
        isVacant ? "Vacant unit productivity applied." : "Occupied/interior protection productivity applied.",
      ].filter(Boolean) as string[],
      sectionPricing: buildPaintingSectionPricing({
        sectionBuckets,
        doorCount: doors,
        trimLf: args.planSectionInputs?.supportedTrimLf ?? null,
        supportedWallSqft,
        supportedCeilingSqft,
        supportedRoomCount: args.planSectionInputs?.supportedRoomCount ?? null,
        interiorBaseSupport: args.planSectionInputs?.interiorBaseSupport ?? null,
        wallSupportSource: args.planSectionInputs?.wallSupportSource ?? null,
        ceilingSupportSource: args.planSectionInputs?.ceilingSupportSource ?? null,
        prototypeSupportSource: args.planSectionInputs?.prototypeSupportSource ?? null,
        prototypeRoomGroupLabel: args.planSectionInputs?.prototypeRoomGroupLabel ?? null,
        doorCountSupport: args.planSectionInputs?.doorCountSupport ?? null,
        doorCountSource: args.planSectionInputs?.doorCountSource ?? null,
        trimSupport: args.planSectionInputs?.trimSupport ?? null,
        trimSource: args.planSectionInputs?.trimSource ?? null,
      }),
    })

    return {
      okForDeterministic: true,
      okForVerified: true,
      pricing,
      estimateBasis,
      jobType: "mixed_scope",
      signals: {
        sqft,
        rooms,
        doors,
        coats,
        isVacant,
        prepLevel,
        paintScope: finalPaintScope,
      },
      notes: [
        "Painting mixed-scope deterministic pricing applied",
        !parsedDoors && supportedDoors
          ? "Plan-aware door/frame support activated separate live numeric door pricing."
          : null,
      ].filter(Boolean) as string[],
      sectionBuckets,
    }
  }

  // interior repaint deterministic (sqft or rooms required)
  if (sqft || rooms) {
    const priced = pricePaintingInterior({
      sqft,
      rooms,
      stateMultiplier: args.stateMultiplier,
      paintScope: finalPaintScope,
      coats,
      isVacant,
      prepLevel,
      hasCorridorSection: !!args.planSectionInputs?.hasCorridorSection,
      hasPrepProtectionSection: !!args.planSectionInputs?.hasPrepProtectionSection,
      supportedTrimLf: args.planSectionInputs?.supportedTrimLf ?? null,
      exactWallSqft: supportedWallSqft,
      exactCeilingSqft: supportedCeilingSqft,
    })

    const estimateBasis = buildEstimateBasis({
      pricing: priced.pricing,
      laborRate: priced.laborRate,
      sqft,
      rooms,
      doors: null,
      crewDays: priced.crewDays,
      mobilization: priced.mobilization,
      preferredUnit: sqft ? "sqft" : "rooms",
      assumptions: [
        sqft
          ? args.planSectionInputs?.interiorBaseSupport === "measured" && !textSqft && !measSqft
            ? `${sqft} sqft used for pricing basis from measured plan-aware support.`
            : `${sqft} sqft used for pricing basis.`
          : parsedRooms
          ? `${rooms} room(s) used for pricing basis.`
          : `${rooms} room(s) supported by plan-aware repeated-room routing.`,
        args.planSectionInputs?.interiorBaseSupport === "scaled"
          ? "Interior base was scaled from strong repeated-room support rather than exact measured wall area."
          : null,
        `${coats} coat(s) assumed.`,
        `Paint scope: ${finalPaintScope}.`,
        `Prep level: ${prepLevel}.`,
        args.planSectionInputs?.supportedTrimLf && args.planSectionInputs.supportedTrimLf > 0
          ? `${Math.round(args.planSectionInputs.supportedTrimLf)} trim LF was carried into live trim/casing numeric pricing.`
          : null,
        supportedWallSqft
          ? supportedCeilingSqft && finalPaintScope === "walls_ceilings"
            ? `${supportedWallSqft} measured wall sqft and ${supportedCeilingSqft} measured ceiling sqft informed the live painting route.`
            : `${supportedWallSqft} measured wall sqft informed the live painting route.`
          : null,
        args.planSectionInputs?.hasCorridorSection
          ? "Corridor repaint remains separately routed in live prep, but corridor-specific numeric pricing still shares the main painting engine."
          : null,
        args.planSectionInputs?.hasPrepProtectionSection
          ? "Plan-aware prep / protection routing raised the live painting prep interpretation to at least medium."
          : null,
        isVacant ? "Vacant unit productivity applied." : "Occupied/interior protection productivity applied.",
      ].filter(Boolean) as string[],
      sectionPricing: buildPaintingSectionPricing({
        sectionBuckets: priced.sectionBuckets,
        doorCount: null,
        trimLf: args.planSectionInputs?.supportedTrimLf ?? null,
        supportedWallSqft,
        supportedCeilingSqft,
        supportedRoomCount: args.planSectionInputs?.supportedRoomCount ?? null,
        interiorBaseSupport: args.planSectionInputs?.interiorBaseSupport ?? null,
        wallSupportSource: args.planSectionInputs?.wallSupportSource ?? null,
        ceilingSupportSource: args.planSectionInputs?.ceilingSupportSource ?? null,
        prototypeSupportSource: args.planSectionInputs?.prototypeSupportSource ?? null,
        prototypeRoomGroupLabel: args.planSectionInputs?.prototypeRoomGroupLabel ?? null,
        doorCountSupport: args.planSectionInputs?.doorCountSupport ?? null,
        doorCountSource: args.planSectionInputs?.doorCountSource ?? null,
        trimSupport: args.planSectionInputs?.trimSupport ?? null,
        trimSource: args.planSectionInputs?.trimSource ?? null,
      }),
    })

    const okForVerified = !!textSqft || !!rooms

    return {
      okForDeterministic: true,
      okForVerified,
      pricing: priced.pricing,
      estimateBasis,
      jobType:
        finalPaintScope === "walls"
          ? "walls_only"
          : finalPaintScope === "walls_ceilings"
          ? "walls_ceilings"
          : "full_interior",
      signals: {
        sqft,
        rooms,
        doors: null,
        coats,
        isVacant,
        prepLevel,
        paintScope: finalPaintScope,
      },
      notes: [
        "Painting interior deterministic pricing applied",
        args.planSectionInputs?.includeCeilings && args.paintScope !== "walls_ceilings"
          ? "Plan-aware ceiling support changed live numeric painting scope from walls-only to walls plus ceilings."
          : null,
      ].filter(Boolean) as string[],
      sectionBuckets: priced.sectionBuckets,
    }
  }

  return {
    okForDeterministic: false,
    okForVerified: false,
    pricing: null,
    estimateBasis: null,
    jobType: "unknown",
    signals: {
      sqft,
      rooms,
      doors,
      coats,
      isVacant,
      prepLevel,
      paintScope: finalPaintScope,
    },
    notes: ["Painting scope detected but no usable sqft, room count, or door count found"],
    sectionBuckets: [],
  }
}

// -----------------------------
// PRICERS
// -----------------------------
function pricePaintingInterior(args: {
  sqft: number | null
  rooms: number | null
  exactWallSqft?: number | null
  exactCeilingSqft?: number | null
  stateMultiplier: number
  paintScope: PaintScope
  coats: number
  isVacant: boolean
  prepLevel: "light" | "medium" | "heavy"
  hasCorridorSection?: boolean
  hasPrepProtectionSection?: boolean
  supportedTrimLf?: number | null
}): {
  pricing: Pricing
  laborRate: number
  crewDays: number
  mobilization: number
  sectionBuckets: SectionBucket[]
} {
  const core = computePaintingInteriorCore(args)
  const { pricing, laborRate, crewDays, mobilization, wallAreaBase, ceilingAreaBase, trimPricing } =
    core

  const noPlanBurden = computePaintingInteriorCore({
    ...args,
    hasCorridorSection: false,
    hasPrepProtectionSection: false,
    supportedTrimLf: 0,
  }).pricing
  const corridorOnly =
    args.hasCorridorSection
      ? computePaintingInteriorCore({
          ...args,
          hasCorridorSection: true,
          hasPrepProtectionSection: false,
          supportedTrimLf: 0,
        }).pricing
      : null
  const prepOnly =
    args.hasPrepProtectionSection
      ? computePaintingInteriorCore({
          ...args,
          hasCorridorSection: !!args.hasCorridorSection,
          hasPrepProtectionSection: true,
          supportedTrimLf: 0,
        }).pricing
      : null

  const safeTrimPricing =
    trimPricing ??
    clampPricing({ labor: 0, materials: 0, subs: 0, markup: pricing.markup, total: 0 })
  const corridorPricing =
    corridorOnly
      ? diffPricing(corridorOnly, noPlanBurden)
      : clampPricing({ labor: 0, materials: 0, subs: 0, markup: pricing.markup, total: 0 })
  const prepPricing =
    prepOnly && corridorOnly
      ? diffPricing(prepOnly, corridorOnly)
      : prepOnly && !corridorOnly
        ? diffPricing(prepOnly, noPlanBurden)
        : clampPricing({ labor: 0, materials: 0, subs: 0, markup: pricing.markup, total: 0 })

  const residualBaseLabor =
    pricing.labor - safeTrimPricing.labor - corridorPricing.labor - prepPricing.labor
  const residualBaseMaterials =
    pricing.materials - safeTrimPricing.materials - corridorPricing.materials - prepPricing.materials
  const residualBaseSubs =
    pricing.subs - safeTrimPricing.subs - corridorPricing.subs - prepPricing.subs

  const wallAreaShare =
    wallAreaBase + ceilingAreaBase > 0 ? wallAreaBase / (wallAreaBase + ceilingAreaBase) : 1
  const wallBase = {
    section: "Walls",
    labor: Math.max(0, Math.round(residualBaseLabor * wallAreaShare)),
    materials: Math.max(0, Math.round(residualBaseMaterials * wallAreaShare)),
    subs: Math.max(0, Math.round(residualBaseSubs * wallAreaShare)),
  }
  const ceilingBase =
    ceilingAreaBase > 0
      ? {
          section: "Ceilings",
          labor: Math.max(0, residualBaseLabor - wallBase.labor),
          materials: Math.max(0, residualBaseMaterials - wallBase.materials),
          subs: Math.max(0, residualBaseSubs - wallBase.subs),
        }
      : null

  return {
    pricing,
    laborRate,
    crewDays,
    mobilization,
    sectionBuckets: finalizeSectionBuckets({
      pricing,
      sections: [
        wallBase,
        ceilingBase,
        safeTrimPricing.labor > 0 || safeTrimPricing.materials > 0
          ? {
              section: "Trim / casing",
              labor: safeTrimPricing.labor,
              materials: safeTrimPricing.materials,
              subs: safeTrimPricing.subs,
            }
          : null,
        args.hasCorridorSection && (corridorPricing.labor > 0 || corridorPricing.materials > 0)
          ? {
              section: "Corridor repaint",
              labor: corridorPricing.labor,
              materials: corridorPricing.materials,
              subs: corridorPricing.subs,
            }
          : null,
        args.hasPrepProtectionSection && (prepPricing.labor > 0 || prepPricing.materials > 0)
          ? {
              section: "Prep / protection",
              labor: prepPricing.labor,
              materials: prepPricing.materials,
              subs: prepPricing.subs,
            }
          : null,
      ].filter(Boolean) as Array<Omit<SectionBucket, "total">>,
    }),
  }
}

function computePaintingInteriorCore(args: {
  sqft: number | null
  rooms: number | null
  exactWallSqft?: number | null
  exactCeilingSqft?: number | null
  stateMultiplier: number
  paintScope: PaintScope
  coats: number
  isVacant: boolean
  prepLevel: "light" | "medium" | "heavy"
  hasCorridorSection?: boolean
  hasPrepProtectionSection?: boolean
  supportedTrimLf?: number | null
}) {
  const laborRate = 75
  const markup = 25

  let sqft = args.sqft
  const exactWallSqft =
    typeof args.exactWallSqft === "number" && args.exactWallSqft > 0
      ? Math.round(args.exactWallSqft)
      : null
  const exactCeilingSqft =
    (args.paintScope === "walls_ceilings" || args.paintScope === "full") &&
    typeof args.exactCeilingSqft === "number" &&
    args.exactCeilingSqft > 0
      ? Math.round(args.exactCeilingSqft)
      : null

  // Fallback room-to-sqft assumptions if sqft missing
  if ((!sqft || sqft <= 0) && args.rooms && args.rooms > 0) {
    sqft =
      args.rooms <= 2
        ? args.rooms * 250
        : args.rooms <= 4
        ? args.rooms * 325
        : args.rooms * 350
  }

  // Convert floor sqft into estimated paintable surface area
  // These multipliers are intentionally more realistic for interior residential repainting
  const scopeMultiplier =
    args.paintScope === "walls"
      ? 1.75
      : args.paintScope === "walls_ceilings"
      ? 2.15
      : 2.45

  // Coat factor
  const coatFactor =
    args.coats <= 1 ? 0.78 :
    args.coats === 2 ? 1.0 :
    1.22

  const canUseExactAreaPath =
    !!exactWallSqft && (args.paintScope === "walls" || !!exactCeilingSqft)
  const basisSqft =
    canUseExactAreaPath
      ? Math.max(
          150,
          Math.round(
            (Number(exactWallSqft || 0) + Number(exactCeilingSqft || 0)) /
              Math.max(1, scopeMultiplier)
          )
        )
      : Math.max(150, Number(sqft || 0))

  const wallAreaBase = canUseExactAreaPath
    ? Number(exactWallSqft || 0) * coatFactor
    : basisSqft * 1.75 * coatFactor
  const ceilingAreaBase =
    args.paintScope === "walls_ceilings" || args.paintScope === "full"
      ? canUseExactAreaPath
        ? Number(exactCeilingSqft || 0) * coatFactor
        : basisSqft * 0.4 * coatFactor
      : 0

  const effectivePaintArea = canUseExactAreaPath
    ? wallAreaBase + ceilingAreaBase
    : basisSqft * scopeMultiplier * coatFactor

  // Base production rates (sqft of paintable area per labor hour)
  // Tuned slower than before to better reflect real residential interiors
  let sqftPerLaborHour =
    args.paintScope === "walls"
      ? 115
      : args.paintScope === "walls_ceilings"
      ? 95
      : 80

  // Vacancy / occupancy adjustment
  if (args.isVacant) {
    sqftPerLaborHour *= 1.05
  } else {
    sqftPerLaborHour *= 0.82
  }

  if (args.hasCorridorSection) {
    sqftPerLaborHour *= 0.92
  }

  // Prep adjustment
  if (args.prepLevel === "light") sqftPerLaborHour *= 1.08
  if (args.prepLevel === "heavy") sqftPerLaborHour *= 0.72
  if (args.hasPrepProtectionSection) sqftPerLaborHour *= 0.94

  // Setup / masking / cleanup / cut-in / handling time
  let setupHrs =
    basisSqft <= 700
      ? 6
      : basisSqft <= 1400
      ? 10
      : 14

  if (args.hasCorridorSection) setupHrs += 2
  if (args.hasPrepProtectionSection) setupHrs += 1.5

  const laborHrs = effectivePaintArea / sqftPerLaborHour + setupHrs
  const trimLf =
    typeof args.supportedTrimLf === "number" && args.supportedTrimLf > 0
      ? Math.round(args.supportedTrimLf)
      : 0
  const trimLaborHrs =
    trimLf > 0
      ? Math.min(18, trimLf / 85 + (trimLf >= 120 ? 0.75 : 0.35))
      : 0

  let labor = Math.round((laborHrs + trimLaborHrs) * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // Materials
  const coverageSqftPerGallon = 325
  const wasteFactor = 1.12
  const gallons = (effectivePaintArea / coverageSqftPerGallon) * wasteFactor

  const paintCostPerGallon =
    args.paintScope === "full"
      ? 34
      : args.paintScope === "walls_ceilings"
      ? 30
      : 28

  let materials =
    Math.round(gallons * paintCostPerGallon) +
    (
      basisSqft <= 700
        ? 140
        : basisSqft <= 1400
        ? 235
        : 325
    )

  if (args.prepLevel === "medium") materials += 100
  if (args.prepLevel === "heavy") materials += 225
  if (args.hasPrepProtectionSection) materials += 85
  if (args.hasCorridorSection) materials += 45
  if (trimLf > 0) materials += Math.round(trimLf * 0.2 + 24)

  // Mobilization / overhead
  const mobilization =
    basisSqft <= 500
      ? 325
      : basisSqft <= 1000
      ? 525
      : basisSqft <= 1600
      ? 750
      : 950

  const supervisionPct =
    basisSqft <= 1000
      ? 0.06
      : basisSqft <= 2000
      ? 0.07
      : 0.08

  const supervision = Math.round((labor + materials) * supervisionPct)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  // Crew-day realism
  const totalLaborHrs = laborHrs + trimLaborHrs

  let crewDays =
    totalLaborHrs <= 8
      ? 1
      : totalLaborHrs <= 16
      ? 2
      : totalLaborHrs <= 24
      ? 3
      : totalLaborHrs <= 32
      ? 4
      : Math.ceil(totalLaborHrs / 8)

  // Minimum duration floors for more realistic condo / house repaint schedules
  if (basisSqft >= 900 && args.paintScope === "walls") {
    crewDays = Math.max(crewDays, 2)
  }

  if (basisSqft >= 1100 && args.paintScope === "walls") {
    crewDays = Math.max(crewDays, 2.5)
  }

  if (basisSqft >= 1100 && args.paintScope === "walls_ceilings") {
    crewDays = Math.max(crewDays, 3)
  }

  if (args.paintScope === "full" && basisSqft >= 1100) {
    crewDays = Math.max(crewDays, 4)
  }

  if (args.prepLevel === "heavy" && basisSqft >= 900) {
    crewDays = Math.max(crewDays, 3)
  }

  crewDays = Math.round(crewDays * 2) / 2

  return {
    pricing: clampPricing({ labor, materials, subs, markup, total }),
    laborRate,
    crewDays,
    mobilization,
    wallAreaBase,
    ceilingAreaBase,
    trimPricing:
      trimLf > 0
        ? clampPricing({
            labor: Math.round(trimLaborHrs * laborRate * args.stateMultiplier),
            materials: Math.round(trimLf * 0.2 + 24),
            subs: 0,
            markup,
            total: 0,
          })
        : null,
  }
}

function pricePaintingDoors(args: {
  doors: number
  stateMultiplier: number
  prepLevel: "light" | "medium" | "heavy"
  coats: number
}): {
  pricing: Pricing
  laborRate: number
  crewDays: number
  mobilization: number
  sectionBuckets: SectionBucket[]
} {
  const laborRate = 75
  const markup = 25

  let laborHoursPerDoor = 1.15 // slab + casing/frame baseline
  if (args.prepLevel === "light") laborHoursPerDoor -= 0.1
  if (args.prepLevel === "heavy") laborHoursPerDoor += 0.25

  if (args.coats === 1) laborHoursPerDoor -= 0.1
  if (args.coats >= 3) laborHoursPerDoor += 0.18

  const laborHrs = args.doors * laborHoursPerDoor + 2.25

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  let materialsPerDoor = 24
  if (args.prepLevel === "heavy") materialsPerDoor += 4
  if (args.coats >= 3) materialsPerDoor += 3

  const materials = Math.round(args.doors * materialsPerDoor + 45)

  const mobilization =
    args.doors <= 6 ? 225 :
    args.doors <= 15 ? 325 :
    450

  const supervision = Math.round((labor + materials) * 0.05)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  let crewDays =
    laborHrs <= 8 ? 1 :
    laborHrs <= 16 ? 2 :
    Math.ceil(laborHrs / 8)

  crewDays = Math.round(crewDays * 2) / 2

  const pricing = clampPricing({ labor, materials, subs, markup, total })
  return {
    pricing,
    laborRate,
    crewDays,
    mobilization,
    sectionBuckets: finalizeSectionBuckets({
      pricing,
      sections: [
        {
          section: "Doors / frames",
          labor,
          materials,
          subs,
        },
      ],
    }),
  }
}

function pricePaintingExterior(args: {
  approxBodyWallSqft: number
  stateMultiplier: number
  substrate: ExteriorSubstrate
  stories: 1 | 2 | 3 | null
  access: ExteriorAccess
  trimComplexity: ExteriorTrimComplexity
  prepLevel: "light" | "medium" | "heavy"
  garageDoors: number
  entryDoors: number
  windows: number | null
  coats: number
}): {
  pricing: Pricing
  laborRate: number
  crewDays: number
  mobilization: number
} {
  const laborRate = 85
  const markup = 25

  const stories = args.stories ?? 1
  const bodyWallSqft = Math.max(1200, Number(args.approxBodyWallSqft || 0))

  let bodySqftPerLaborHour =
    args.substrate === "stucco"
      ? 70
      : args.substrate === "siding"
      ? 58
      : 64

  if (stories === 2) bodySqftPerLaborHour *= 0.88
  if (stories === 3) bodySqftPerLaborHour *= 0.76

  if (args.access === "medium") bodySqftPerLaborHour *= 0.9
  if (args.access === "high") bodySqftPerLaborHour *= 0.78

  if (args.prepLevel === "light") bodySqftPerLaborHour *= 1.05
  if (args.prepLevel === "heavy") bodySqftPerLaborHour *= 0.75

  const coatFactor =
    args.coats <= 1 ? 0.74 :
    args.coats === 2 ? 1.0 :
    1.24

  const bodyLaborHrs = (bodyWallSqft * coatFactor) / bodySqftPerLaborHour

  const trimLaborHrs =
    args.trimComplexity === "high"
      ? 28
      : args.trimComplexity === "medium"
      ? 18
      : 10

  const setupLaborHrs =
    stories === 3
      ? 20
      : stories === 2
      ? 14
      : 8

  const garageDoorLaborHrs = args.garageDoors * 3.5
  const entryDoorLaborHrs = args.entryDoors * 1.75
  const windowMaskLaborHrs = Math.min(12, Number(args.windows || 0) * 0.2)

  const totalLaborHrs =
    bodyLaborHrs +
    trimLaborHrs +
    setupLaborHrs +
    garageDoorLaborHrs +
    entryDoorLaborHrs +
    windowMaskLaborHrs

  let labor = Math.round(totalLaborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const bodyCoverageSqftPerGallon =
    args.substrate === "stucco" ? 250 : 300

  const bodyGallons =
    ((bodyWallSqft * Math.max(1, args.coats)) / bodyCoverageSqftPerGallon) * 1.15

  const trimGallons =
    (args.trimComplexity === "high" ? 5 :
      args.trimComplexity === "medium" ? 3 : 1.5) +
    args.garageDoors * 1 +
    args.entryDoors * 0.5

  const bodyPaintCostPerGallon =
    args.substrate === "stucco" ? 38 : 40

  const trimPaintCostPerGallon = 45

  let materials =
    Math.round(bodyGallons * bodyPaintCostPerGallon) +
    Math.round(trimGallons * trimPaintCostPerGallon)

  materials +=
    stories === 1 ? 225 :
    stories === 2 ? 350 :
    500

  if (args.prepLevel === "medium") materials += 125
  if (args.prepLevel === "heavy") materials += 275

  let mobilization =
    stories === 1 ? 550 :
    stories === 2 ? 850 :
    1150

  if (args.access === "medium") mobilization += 100
  if (args.access === "high") mobilization += 250

  const equipmentAllowance =
    stories === 3 || args.access === "high"
      ? 350
      : 0

  const supervision = Math.round((labor + materials) * 0.08)
  const subs = mobilization + equipmentAllowance + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  const crewHoursPerDay =
    stories >= 2 ? 13 : 14

  let crewDays = totalLaborHrs / crewHoursPerDay

  if (stories === 1) crewDays = Math.max(crewDays, 2)
  if (stories === 2) crewDays = Math.max(crewDays, 3)
  if (stories === 3) crewDays = Math.max(crewDays, 4)

  if (args.prepLevel === "heavy") crewDays += 0.5

  crewDays = Math.round(crewDays * 2) / 2

  return {
    pricing: clampPricing({ labor, materials, subs, markup, total }),
    laborRate,
    crewDays,
    mobilization,
  }
}
