export type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

export type BathRoughInResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  pricing: Pricing
  jobType: "bath_plumbing_rough_in"
  signals: {
    mentionsBath: boolean
    roughIn: boolean
    valveRelocation: boolean
    newShowerOrTub: boolean
    drainWork: boolean
    supplyWork: boolean
    demoOrTileContext: boolean
    count?: {
      valves: number
      drains: number
      supplies: number
    }
  }
  notes: string[]
}

function clampPricing(p: Pricing): Pricing {
  const MAX_TOTAL = 10_000_000
  return {
    labor: Math.max(0, p.labor),
    materials: Math.max(0, p.materials),
    subs: Math.max(0, p.subs),
    markup: Math.min(25, Math.max(15, p.markup)),
    total: Math.min(MAX_TOTAL, Math.max(0, p.total)),
  }
}

// optional: parse explicit counts if present
function sumMatches(t: string, re: RegExp) {
  let total = 0
  for (const m of t.matchAll(re)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) total += n
  }
  return total
}

function parseRoughInCounts(text: string) {
  const t = text.toLowerCase()

  // explicit: "2 valves", "1 shower valve", etc.
  const valves = sumMatches(t, /(\d{1,3})\s*(shower\s*valve|mixing\s*valve|valve)s?\b/g)

  // explicit: "1 drain", "2 drains", "shower drain"
  const drains = sumMatches(t, /(\d{1,3})\s*(drain|shower\s*drain|tub\s*drain)s?\b/g)

  // explicit: "2 supply lines", "1 water line"
  const supplies = sumMatches(t, /(\d{1,3})\s*(supply\s*line|water\s*line|hot\s*line|cold\s*line|supply)s?\b/g)

  const any = valves + drains + supplies > 0
  return any ? { valves, drains, supplies } : null
}

export function computeBathroomPlumbingRoughInDeterministic(args: {
  scopeText: string
  stateMultiplier: number
}): BathRoughInResult {
  const s = (args.scopeText || "").toLowerCase()
  const notes: string[] = []

  const mentionsBath =
    /\b(bath|bathroom|shower|tub|tub\s*surround)\b/.test(s)

  // signals that this is build/remodel plumbing, not fixture swaps
  const roughIn =
    /\b(rough[-\s]*in|rough\s*plumb|new\s*rough[-\s]*in|full\s*rough[-\s]*in)\b/.test(s)

  const valveRelocation =
    /\b(valve\s*relocation|relocat(e|ing)\s+(the\s*)?valve|move\s+(the\s*)?valve)\b/.test(s)

  const newShowerOrTub =
    /\b(new\s+(shower|tub)|install\s+(shower|tub)|convert|conversion|shower\s*to\s*tub|tub\s*to\s*shower)\b/.test(s)

  const drainWork =
    /\b(move\s+(the\s*)?drain|relocat(e|ion|ing)\s+(the\s*)?drain|new\s+drain|drain\s+line|p[-\s]*trap|trap\s+arm)\b/.test(s)

  const supplyWork =
    /\b(new\s+(supply|water\s*line)|move\s+(the\s*)?(hot|cold)\s*line|relocat(e|ion|ing)\s+(supply|water\s*line)|run\s+new\s+line)\b/.test(s)

  const demoOrTileContext =
    /\b(demo|demolition|tear\s*out|gut|tile|wall\s*tile|shower\s*walls?|tub\s*surround|waterproof|backer\s*board|cement\s*board|durock|hardie)\b/.test(s)

  // Decide if this engine should activate
  const shouldActivate =
    mentionsBath && (roughIn || valveRelocation || newShowerOrTub || drainWork || supplyWork) && demoOrTileContext

  if (!shouldActivate) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: { labor: 0, materials: 0, subs: 0, markup: 25, total: 0 },
      jobType: "bath_plumbing_rough_in",
      signals: {
        mentionsBath,
        roughIn,
        valveRelocation,
        newShowerOrTub,
        drainWork,
        supplyWork,
        demoOrTileContext,
      },
      notes: ["Not enough bathroom rough-in signals to deterministically price."],
    }
  }

  // Optional explicit counts increase confidence
  const counts = parseRoughInCounts(s)

  // ---- Deterministic pricing model ----
  // Baselines assume: 1 bathroom wet-area rough-in touch-up
  // (valve move + drain/supply adjustments) — not full-house plumbing.
  const laborRate = 140 // plumber blended rate
  const markup = 25

  // base “bath rough-in coordination” hours
  let laborHrs = 6.0

  // add hours based on signals
  if (roughIn) laborHrs += 6.0
  if (valveRelocation) laborHrs += 4.5
  if (newShowerOrTub) laborHrs += 3.0
  if (drainWork) laborHrs += 4.0
  if (supplyWork) laborHrs += 3.0

  // if explicit counts exist, use them (count-based override)
  if (counts) {
    // replace “signal adds” with unit-based adds (more deterministic)
    // keep the coordination base
    laborHrs = 6.0
    laborHrs += counts.valves * 4.5
    laborHrs += counts.drains * 4.0
    laborHrs += counts.supplies * 2.5
    notes.push(`Used explicit rough-in counts: valves=${counts.valves}, drains=${counts.drains}, supplies=${counts.supplies}`)
  } else {
    notes.push("No explicit rough-in counts found; priced by strong signals.")
  }

  // clamp to reasonable minimum/maximum for a single bathroom rough-in
  laborHrs = Math.max(8, Math.min(28, laborHrs))

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // materials allowance (fittings, valves parts, pipe, consumables)
  let materials = 0
  materials += 220 // base fittings/consumables
  if (valveRelocation || (counts?.valves ?? 0) > 0) materials += 180
  if (drainWork || (counts?.drains ?? 0) > 0) materials += 140
  if (supplyWork || (counts?.supplies ?? 0) > 0) materials += 120
  if (roughIn) materials += 150

  // if explicit counts, scale materials a bit more
  if (counts) {
    materials =
      200 +
      counts.valves * 160 +
      counts.drains * 130 +
      counts.supplies * 90
  }

  materials = Math.round(materials)

  // subs: mobilization + coordination + (optional) inspection/permit placeholder if mentioned
  const mobilization = 300
  const supervision = Math.round((labor + materials) * 0.06)

  const permitMentioned = /\b(permit|inspection)\b/.test(s)
  const permitAllowance = permitMentioned ? 250 : 0
  if (permitMentioned) notes.push("Permit/inspection language detected; added allowance.")

  const subs = mobilization + supervision + permitAllowance

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  // Verified: only if explicit counts OR extremely strong “rough-in + valveRelocation + drainWork”
  const okForVerified =
    !!counts || (roughIn && valveRelocation && drainWork)

  return {
    okForDeterministic: true,
    okForVerified,
    pricing: clampPricing({ labor, materials, subs, markup, total }),
    jobType: "bath_plumbing_rough_in",
    signals: {
      mentionsBath,
      roughIn,
      valveRelocation,
      newShowerOrTub,
      drainWork,
      supplyWork,
      demoOrTileContext,
      count: counts ?? undefined,
    },
    notes,
  }
}