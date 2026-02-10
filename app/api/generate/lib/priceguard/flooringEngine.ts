// lib/priceguard/flooringEngine.ts

export type FlooringType =
  | "lvp"
  | "laminate"
  | "tile"
  | "hardwood"
  | "carpet"
  | "unknown"

export type DeterministicPricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

export type FlooringDeterministicInput = {
  scopeText: string
  stateMultiplier?: number // pass your computed multiplier (already in route.ts)
  measurements?: { totalSqft?: number } | null
}

export type FlooringDeterministicResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  flooringType: FlooringType
  sqft: number | null
  flags: { demo: boolean; baseboards: boolean }
  pricing: DeterministicPricing
  notes: string[]
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

function moneyTotal(labor: number, materials: number, subs: number, markupPct: number) {
  const base = labor + materials + subs
  return clampMoney(base * (1 + markupPct / 100))
}

function detectFlooringType(text: string): FlooringType {
  const t = (text || "").toLowerCase()
  if (/\b(lvp|vinyl\s+plank|luxury\s+vinyl)\b/.test(t)) return "lvp"
  if (/\b(laminate)\b/.test(t)) return "laminate"
  if (/\b(tile|porcelain|ceramic)\b/.test(t)) return "tile"
  if (/\b(hardwood|engineered\s+wood|wood\s+floor)\b/.test(t)) return "hardwood"
  if (/\b(carpet)\b/.test(t)) return "carpet"
  return "unknown"
}

function detectSqft(text: string): number | null {
  const t = (text || "").toLowerCase()
  const m = t.match(/\b(\d{2,6})\s*(sq\.?\s*ft|sqft|square\s*feet|sf)\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function hasDemo(text: string) {
  return /\b(demo|demolition|remove|removal|rip\s*out|tear\s*out|pull\s*up|dispose|haul\s*away)\b/i.test(text)
}

function hasBaseboards(text: string) {
  return /\b(baseboard|base\s*boards|trim|shoe\s*mold|quarter\s*round)\b/i.test(text)
}

type RateBand = {
  laborPerSqft: [number, number]
  materialsPerSqft: [number, number]
  minimumLabor: number
}

function mid([a, b]: [number, number]) {
  return (a + b) / 2
}

function rateBand(type: FlooringType): RateBand {
  switch (type) {
    case "lvp":
    case "laminate":
      return { laborPerSqft: [3.5, 5.0], materialsPerSqft: [2.5, 4.5], minimumLabor: 1000 }
    case "tile":
      return { laborPerSqft: [7.0, 12.0], materialsPerSqft: [4.0, 8.0], minimumLabor: 1800 }
    case "hardwood":
      return { laborPerSqft: [6.0, 10.0], materialsPerSqft: [4.0, 9.0], minimumLabor: 1800 }
    case "carpet":
      return { laborPerSqft: [2.5, 4.0], materialsPerSqft: [2.0, 5.0], minimumLabor: 900 }
    default:
      return { laborPerSqft: [4.0, 6.0], materialsPerSqft: [3.0, 6.0], minimumLabor: 1000 }
  }
}

export function computeFlooringDeterministic(
  input: FlooringDeterministicInput
): FlooringDeterministicResult {
  const text = input.scopeText || ""

  const measuredSqft =
    input.measurements?.totalSqft && Number(input.measurements.totalSqft) > 0
      ? Number(input.measurements.totalSqft)
      : null

  const parsedSqft = detectSqft(text)
  const sqft = measuredSqft ?? parsedSqft

  const type = detectFlooringType(text)
  const demo = hasDemo(text)
  const baseboards = hasBaseboards(text)

  const mult = Number.isFinite(input.stateMultiplier) ? Number(input.stateMultiplier) : 1.0
  const band = rateBand(type)

  const notes: string[] = []
  if (type === "unknown") notes.push("Flooring type not explicit; used conservative default.")
  if (!sqft) notes.push("Square footage not detected; cannot deterministic-price in v1.")

  const okForDeterministic = Boolean(sqft)
  const okForVerified = Boolean(sqft) && type !== "unknown"

  const markup = 20

  if (!okForDeterministic) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      flooringType: type,
      sqft: null,
      flags: { demo, baseboards },
      pricing: { labor: 0, materials: 0, subs: 0, markup, total: 0 },
      notes,
    }
  }

  let labor = (sqft as number) * mid(band.laborPerSqft) * mult
  let materials = (sqft as number) * mid(band.materialsPerSqft)
  let subs = 0

  labor = Math.max(labor, band.minimumLabor * mult)

  if (demo) {
    subs += Math.max(400, (sqft as number) * 2.0)
    notes.push("Demo/removal detected.")
  }

  if (baseboards) {
    subs += 250
    notes.push("Baseboards/trim work detected (allowance added).")
  }

  labor = clampMoney(labor)
  materials = clampMoney(materials)
  subs = clampMoney(subs)

  const total = moneyTotal(labor, materials, subs, markup)

  return {
    okForDeterministic,
    okForVerified,
    flooringType: type,
    sqft: sqft as number,
    flags: { demo, baseboards },
    pricing: { labor, materials, subs, markup, total },
    notes,
  }
}