type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
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
    | "unknown"
  signals: {
    sqft?: number | null
    rooms?: number | null
    doors?: number | null
    coats?: number | null
    isVacant?: boolean
    prepLevel?: "light" | "medium" | "heavy"
    paintScope?: PaintScope | null
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
  const t = scopeText.toLowerCase()
  const m = t.match(/(\d{1,6})\s*(sq\s*ft|sqft|square\s*feet|sf)\b/)
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

  // fallback room-to-sqft assumptions if sqft missing
  if ((!sqft || sqft <= 0) && args.rooms && args.rooms > 0) {
    sqft = args.rooms <= 2
      ? args.rooms * 220
      : args.rooms <= 4
      ? args.rooms * 300
      : args.rooms * 325
  }

  sqft = Math.max(100, Number(sqft || 0))

  // production base: floor sqft converted into paintable scope multiplier
  let scopeMultiplier = 1.0
  if (args.paintScope === "walls") scopeMultiplier = 1.0
  if (args.paintScope === "walls_ceilings") scopeMultiplier = 1.35
  if (args.paintScope === "full") scopeMultiplier = 1.65

  let effectivePaintArea = sqft * scopeMultiplier

  // coats
  const coatFactor =
    args.coats <= 1 ? 0.78 :
    args.coats === 2 ? 1.0 :
    1.22

  effectivePaintArea *= coatFactor

  // productivity
  let sqftPerLaborHour =
    args.paintScope === "walls" ? 165 :
    args.paintScope === "walls_ceilings" ? 135 :
    110

  if (args.isVacant) sqftPerLaborHour *= 1.08
  else sqftPerLaborHour *= 0.94

  if (args.prepLevel === "light") sqftPerLaborHour *= 1.08
  if (args.prepLevel === "heavy") sqftPerLaborHour *= 0.72

  const setupHrs =
    sqft <= 700 ? 4.5 :
    sqft <= 1400 ? 7.5 :
    10.5

  const laborHrs = effectivePaintArea / sqftPerLaborHour + setupHrs

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // materials
  const coverageSqftPerGallon = 325
  const gallons = effectivePaintArea / coverageSqftPerGallon * 1.12

  const paintCostPerGallon =
    args.paintScope === "full" ? 34 :
    args.paintScope === "walls_ceilings" ? 30 :
    28

  let materials =
    Math.round(gallons * paintCostPerGallon) +
    (sqft <= 700 ? 110 : sqft <= 1400 ? 185 : 260)

  if (args.prepLevel === "medium") materials += 75
  if (args.prepLevel === "heavy") materials += 175

  // subs / mobilization
  const mobilization =
    sqft <= 500 ? 250 :
    sqft <= 1000 ? 400 :
    sqft <= 1600 ? 575 :
    800

  const supervisionPct =
    sqft <= 1000 ? 0.05 :
    sqft <= 2000 ? 0.06 :
    0.08

  const supervision = Math.round((labor + materials) * supervisionPct)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  // crew-days realism
  let crewDays =
    laborHrs <= 8 ? 1 :
    laborHrs <= 16 ? 2 :
    laborHrs <= 24 ? 3 :
    laborHrs <= 32 ? 4 :
    Math.ceil(laborHrs / 8)

  if (sqft >= 1200 && args.paintScope === "walls_ceilings") {
    crewDays = Math.max(crewDays, 2.5)
  }

  if (sqft >= 1400 && args.paintScope === "walls_ceilings") {
    crewDays = Math.max(crewDays, 3)
  }

  if (args.paintScope === "full" && sqft >= 1200) {
    crewDays = Math.max(crewDays, 4)
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