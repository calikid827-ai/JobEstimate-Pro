type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

function clampPricing(pricing: Pricing): Pricing {
  const MAX_TOTAL = 10_000_000
  return {
    labor: Math.max(0, pricing.labor),
    materials: Math.max(0, pricing.materials),
    subs: Math.max(0, pricing.subs),
    markup: Math.min(25, Math.max(15, pricing.markup)),
    total: Math.min(MAX_TOTAL, Math.max(0, pricing.total)),
  }
}

function sumMatches(t: string, re: RegExp) {
  let total = 0
  for (const m of t.matchAll(re)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) total += n
  }
  return total
}

export function parsePlumbingFixtureBreakdown(scopeText: string) {
  const t = scopeText.toLowerCase()

  const toilets = sumMatches(t, /(\d{1,4})\s*(toilet|commode)s?\b/g)
  const faucets = sumMatches(t, /(\d{1,4})\s*(faucet)s?\b/g)
  const sinks = sumMatches(t, /(\d{1,4})\s*(sink)s?\b/g)
  const vanities = sumMatches(t, /(\d{1,4})\s*(vanity|vanities)\b/g)

  // shower valve / mixing valve / cartridge / trim kit
  const showerValves = sumMatches(
    t,
    /(\d{1,4})\s*(shower\s*valve|mixing\s*valve|diverter|trim\s*kit|cartridge)s?\b/g
  )

  const total = toilets + faucets + sinks + vanities + showerValves
  return total > 0 ? { toilets, faucets, sinks, vanities, showerValves, total } : null
}

export function hasHeavyPlumbingSignals(text: string): boolean {
  const t = (text || "").toLowerCase()
  return /\b(repipe|repiping|whole\s*house\s*repipe|water\s*heater|tankless|sewer|main\s*line|drain\s*line|gas\s*line|trench|slab\s*leak|new\s*rough[-\s]*in|full\s*rough[-\s]*in|rough\s*plumbing|rough[-\s]*in|permit|inspection)\b/.test(t)
}

export function computePlumbingDeterministic(args: {
  scopeText: string
  stateMultiplier: number
}): {
  okForDeterministic: boolean
  okForVerified: boolean
  jobType: "fixture_swaps" | "unknown"
  signals: any
  notes: string[]
  pricing: Pricing | null
} {
  const notes: string[] = []
  const t = (args.scopeText || "").toLowerCase()

  // Block heavy / high-variance plumbing
  const heavySignals = hasHeavyPlumbingSignals(args.scopeText)

  // Also block obvious remodel/gut scopes (too many dependencies)
  const remodelSignals =
  /\b(gut|full\s+remodel|remodel|renovation|rebuild|demo|demolition|tile|waterproof|membrane|shower\s+pan|tub\s+surround|rough[-\s]*in|relocat(e|ing)|move\s+(drain|valve|supply))\b/.test(t)

  if (heavySignals || remodelSignals) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      jobType: "unknown",
      signals: { heavySignals, remodelSignals },
      notes: ["Skipped: scope looks like heavy/high-variance plumbing or remodel work."],
      pricing: null,
    }
  }

  const breakdown = parsePlumbingFixtureBreakdown(args.scopeText)
  if (!breakdown) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      jobType: "unknown",
      signals: { breakdown: null },
      notes: ["Skipped: no explicit fixture counts found for deterministic pricing."],
      pricing: null,
    }
  }

  // Determine swap vs add
  const isAddWork = /\b(add|adding|install(ing)?|new)\b/.test(t)
  const isSwapWork = /\b(replace|replacing|swap|swapping|remove\s+and\s+replace)\b/.test(t)
  const treatAsAdd = isAddWork && !isSwapWork

  const laborRate = 125
  const markup = 25

  // Hours per fixture (tunable)
  const hrsPerToilet = treatAsAdd ? 2.25 : 1.75
  const hrsPerFaucet = treatAsAdd ? 1.6 : 1.1
  const hrsPerSink = treatAsAdd ? 2.25 : 1.5
  const hrsPerVanity = treatAsAdd ? 5.5 : 4.25
  const hrsPerShowerValve = treatAsAdd ? 5.0 : 3.75

  const troubleshootHrs =
    /\b(leak|leaking|clog|clogged|diagnos|troubleshoot|not\s+working)\b/.test(t)
      ? 1.5
      : 0

  const laborHrs =
    breakdown.toilets * hrsPerToilet +
    breakdown.faucets * hrsPerFaucet +
    breakdown.sinks * hrsPerSink +
    breakdown.vanities * hrsPerVanity +
    breakdown.showerValves * hrsPerShowerValve +
    troubleshootHrs +
    1.25 // setup/protection/test

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // Materials allowances (mid-market)
  const matPerToilet = 85   // wax ring, supply line, shims, hardware
  const matPerFaucet = 45   // supplies, sealant, connectors
  const matPerSink = 65     // trap, connectors, sealant
  const matPerVanity = 140  // trap, valves, lines, misc
  const matPerShowerValve = 95 // fittings, sealants, misc

  const materials = Math.round(
    breakdown.toilets * matPerToilet +
      breakdown.faucets * matPerFaucet +
      breakdown.sinks * matPerSink +
      breakdown.vanities * matPerVanity +
      breakdown.showerValves * matPerShowerValve
  )

  const mobilization =
    breakdown.total <= 2 ? 225 :
    breakdown.total <= 6 ? 325 :
    450

  const supervision = Math.round((labor + materials) * 0.05)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  // Verified: only when it’s purely fixture swaps/adds with explicit counts and no heavy/remodel signals
  const okForVerified = true

  const pricing = clampPricing({ labor, materials, subs, markup, total })

  notes.push("Deterministic plumbing: fixture-level count-based pricing applied.")
  if (treatAsAdd) notes.push("Detected add/install language (treated as add-work).")
  if (troubleshootHrs > 0) notes.push("Troubleshooting/leak/diagnosis allowance included.")

  return {
    okForDeterministic: true,
    okForVerified,
    jobType: "fixture_swaps",
    signals: { breakdown, treatAsAdd, troubleshootHrs },
    notes,
    pricing,
  }
}