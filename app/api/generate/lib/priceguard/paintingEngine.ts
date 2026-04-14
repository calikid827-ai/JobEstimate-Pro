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

function sumMatches(text: string, re: RegExp): number {
  let total = 0
  for (const m of text.matchAll(re)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) total += n
  }
  return total
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
  }
}

// -----------------------------
// MAIN ENGINE
// -----------------------------
export function computePaintingDeterministic(args: {
  scopeText: string
  stateMultiplier: number
  measurements?: any | null
  paintScope?: PaintScope | null
  photoAnalysis?: PaintingPhotoAnalysis | null
}): PaintingDeterministicResult {
  const notes: string[] = []
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

  const textSqft = parseSqftFromText(scope)
  const sqft = measSqft ?? textSqft ?? null

  const rooms = parseRoomCount(scope)
  const doors = parseDoorCount(scope)
  const coats = parseCoats(scope)
  const isVacant = parseVacancy(scope)
  const prepLevel = parsePrepLevel(scope)
  const finalPaintScope = inferPaintScope(scope, args.paintScope ?? null)
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
    }
  }

  // mixed rooms + doors deterministic
  if (rooms && rooms > 0 && doors && doors > 0) {
    const roomPriced = pricePaintingInterior({
      sqft,
      rooms,
      stateMultiplier: args.stateMultiplier,
      paintScope: finalPaintScope,
      coats,
      isVacant,
      prepLevel,
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
        `${rooms} room(s) parsed from scope text.`,
        `${doors} door(s) parsed from scope text.`,
        `${coats} coat(s) assumed.`,
        `Paint scope: ${finalPaintScope}.`,
        `Prep level: ${prepLevel}.`,
        isVacant ? "Vacant unit productivity applied." : "Occupied/interior protection productivity applied.",
      ],
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
      notes: ["Painting mixed-scope deterministic pricing applied"],
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
        sqft ? `${sqft} sqft used for pricing basis.` : `${rooms} room(s) used for pricing basis.`,
        `${coats} coat(s) assumed.`,
        `Paint scope: ${finalPaintScope}.`,
        `Prep level: ${prepLevel}.`,
        isVacant ? "Vacant unit productivity applied." : "Occupied/interior protection productivity applied.",
      ],
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
      notes: ["Painting interior deterministic pricing applied"],
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
  }
}

// -----------------------------
// PRICERS
// -----------------------------
function pricePaintingInterior(args: {
  sqft: number | null
  rooms: number | null
  stateMultiplier: number
  paintScope: PaintScope
  coats: number
  isVacant: boolean
  prepLevel: "light" | "medium" | "heavy"
}): {
  pricing: Pricing
  laborRate: number
  crewDays: number
  mobilization: number
} {
  const laborRate = 75
  const markup = 25

  let sqft = args.sqft

  // Fallback room-to-sqft assumptions if sqft missing
  if ((!sqft || sqft <= 0) && args.rooms && args.rooms > 0) {
    sqft =
      args.rooms <= 2
        ? args.rooms * 250
        : args.rooms <= 4
        ? args.rooms * 325
        : args.rooms * 350
  }

  sqft = Math.max(150, Number(sqft || 0))

  // Convert floor sqft into estimated paintable surface area
  // These multipliers are intentionally more realistic for interior residential repainting
  let scopeMultiplier =
    args.paintScope === "walls"
      ? 1.75
      : args.paintScope === "walls_ceilings"
      ? 2.15
      : 2.45

  let effectivePaintArea = sqft * scopeMultiplier

  // Coat factor
  const coatFactor =
    args.coats <= 1 ? 0.78 :
    args.coats === 2 ? 1.0 :
    1.22

  effectivePaintArea *= coatFactor

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

  // Prep adjustment
  if (args.prepLevel === "light") sqftPerLaborHour *= 1.08
  if (args.prepLevel === "heavy") sqftPerLaborHour *= 0.72

  // Setup / masking / cleanup / cut-in / handling time
  const setupHrs =
    sqft <= 700
      ? 6
      : sqft <= 1400
      ? 10
      : 14

  const laborHrs = effectivePaintArea / sqftPerLaborHour + setupHrs

  let labor = Math.round(laborHrs * laborRate)
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
      sqft <= 700
        ? 140
        : sqft <= 1400
        ? 235
        : 325
    )

  if (args.prepLevel === "medium") materials += 100
  if (args.prepLevel === "heavy") materials += 225

  // Mobilization / overhead
  const mobilization =
    sqft <= 500
      ? 325
      : sqft <= 1000
      ? 525
      : sqft <= 1600
      ? 750
      : 950

  const supervisionPct =
    sqft <= 1000
      ? 0.06
      : sqft <= 2000
      ? 0.07
      : 0.08

  const supervision = Math.round((labor + materials) * supervisionPct)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  // Crew-day realism
  let crewDays =
    laborHrs <= 8
      ? 1
      : laborHrs <= 16
      ? 2
      : laborHrs <= 24
      ? 3
      : laborHrs <= 32
      ? 4
      : Math.ceil(laborHrs / 8)

  // Minimum duration floors for more realistic condo / house repaint schedules
  if (sqft >= 900 && args.paintScope === "walls") {
    crewDays = Math.max(crewDays, 2)
  }

  if (sqft >= 1100 && args.paintScope === "walls") {
    crewDays = Math.max(crewDays, 2.5)
  }

  if (sqft >= 1100 && args.paintScope === "walls_ceilings") {
    crewDays = Math.max(crewDays, 3)
  }

  if (args.paintScope === "full" && sqft >= 1100) {
    crewDays = Math.max(crewDays, 4)
  }

  if (args.prepLevel === "heavy" && sqft >= 900) {
    crewDays = Math.max(crewDays, 3)
  }

  crewDays = Math.round(crewDays * 2) / 2

  return {
    pricing: clampPricing({ labor, materials, subs, markup, total }),
    laborRate,
    crewDays,
    mobilization,
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

  return {
    pricing: clampPricing({ labor, materials, subs, markup, total }),
    laborRate,
    crewDays,
    mobilization,
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