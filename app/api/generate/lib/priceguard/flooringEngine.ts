// lib/priceguard/flooringEngine.ts
import {
  formatTradeExecutionSectionLabel,
  getTradeExecutionSectionId,
  type EstimateBasis,
  type EstimateSectionProvenance,
} from "../estimator/types"

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
  planSectionInputs?: {
    supportedFloorSqft: number | null
    supportedWallTileSqft: number | null
    supportedShowerTileSqft: number | null
    supportedBacksplashSqft: number | null
    supportedRemovalSqft: number | null
    supportedPrepSqft: number | null
    supportedBaseLf: number | null
    areaSource: "trade_finding" | "takeoff" | null
    hasFlooringSection: boolean
    hasWallTileSection: boolean
    hasShowerTileSection: boolean
    hasBacksplashSection: boolean
    hasRemovalDemoSection: boolean
    hasUnderlaymentPrepSection: boolean
    hasBaseSection: boolean
    wetAreaContext: boolean
    supportedSqftSupport: "measured" | null
    blocker?: string | null
  } | null
}

export type FlooringDeterministicResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  flooringType: FlooringType
  sqft: number | null
  flags: { demo: boolean; baseboards: boolean }
  pricing: DeterministicPricing
  notes: string[]
  estimateBasis?: EstimateBasis | null
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

type SectionPricingDetail = {
  section: string
  labor: number
  materials: number
  subs: number
  total: number
  pricingBasis: "direct" | "burden"
  unit?: EstimateBasis["units"][number]
  quantity?: number
  notes?: string[]
  provenance?: EstimateSectionProvenance
}

function clampSectionMoney(n: number) {
  return Math.max(0, Math.round(n))
}

function moneyForSection(labor: number, materials: number, subs: number, markupPct: number) {
  return clampSectionMoney((labor + materials + subs) * (1 + markupPct / 100))
}

function buildFlooringSectionPricing(args: {
  sectionAreas: Array<{ section: string; sqft: number }>
  baseLf: number | null
  demoSqft: number | null
  prepSqft: number | null
  labor: number
  materials: number
  subs: number
  markup: number
  areaSource: "trade_finding" | "takeoff" | null
  measuredSupport: boolean
  wetAreaContext: boolean
}): SectionPricingDetail[] {
  const totalSectionSqft = args.sectionAreas.reduce((sum, item) => sum + item.sqft, 0)
  const subsWithoutBaseAndDemo =
    Math.max(
      0,
      args.subs -
        (args.baseLf && args.baseLf > 0 ? 250 : 0) -
        (args.demoSqft && args.demoSqft > 0 ? Math.max(400, args.demoSqft * 2.0) : 0)
    )
  const sections: SectionPricingDetail[] = []

  for (const sectionArea of args.sectionAreas) {
    const share = totalSectionSqft > 0 ? sectionArea.sqft / totalSectionSqft : 0
    const labor = clampSectionMoney(args.labor * share)
    const materials = clampSectionMoney(args.materials * share)
    const subs = clampSectionMoney(subsWithoutBaseAndDemo * share)
    const sectionId = getTradeExecutionSectionId("flooring", sectionArea.section)
    const supportCategory =
      sectionId === "wall_tile"
        ? "wall_tile_area"
        : sectionId === "shower_tile"
          ? "shower_tile_area"
          : sectionId === "backsplash_tile"
            ? "backsplash_area"
            : "floor_area"

    sections.push({
      section: sectionArea.section,
      labor,
      materials,
      subs,
      total: moneyForSection(labor, materials, subs, args.markup),
      pricingBasis: "direct",
      unit: "sqft",
      quantity: sectionArea.sqft,
      notes: args.measuredSupport
        ? [
            sectionId === "shower_tile"
              ? "Measured wet-area tile support backs this direct row."
              : sectionId === "backsplash_tile"
                ? "Measured backsplash tile support backs this direct row."
                : sectionId === "wall_tile"
                  ? "Measured wall tile support backs this direct row."
                  : "Measured floor-area support backs this direct row.",
          ]
        : undefined,
      provenance: args.measuredSupport
        ? {
            quantitySupport: "measured",
            sourceBasis: args.areaSource ? [args.areaSource] : [],
            summary:
              sectionId === "shower_tile"
                ? "Direct shower tile row is backed by exact wet-area tile coverage."
                : sectionId === "backsplash_tile"
                  ? "Direct backsplash tile row is backed by exact measured backsplash coverage."
                  : sectionId === "wall_tile"
                    ? "Direct wall tile row is backed by exact measured wall-tile coverage."
                    : "Direct flooring row is backed by exact measured floor area.",
            supportCategory,
            quantityDetail: `${sectionArea.sqft} sqft was used for this section.`,
            diagnosticDetails: [
              "direct_row_allowed: exact flooring/tile coverage is present.",
              args.wetAreaContext && sectionId === "shower_tile"
                ? "wet_area_context: shower tile remained scoped to wet-area coverage."
                : null,
            ].filter(Boolean) as string[],
          }
        : undefined,
    })
  }

  if (args.demoSqft && args.demoSqft > 0) {
    const subs = clampSectionMoney(Math.max(400, args.demoSqft * 2.0))
    sections.push({
      section: formatTradeExecutionSectionLabel("flooring", "removal_demo"),
      labor: 0,
      materials: 0,
      subs,
      total: moneyForSection(0, 0, subs, args.markup),
      pricingBasis: "direct",
      unit: "sqft",
      quantity: args.demoSqft,
      notes: ["Measured removal/demo support backs this separate removal section."],
      provenance: {
        quantitySupport: "measured",
        sourceBasis: ["trade_finding"],
        summary: "Direct removal/demo row is backed by explicit measured removal area.",
        supportCategory: "demolition_area",
        quantityDetail: `${args.demoSqft} sqft of measured removal area was used for this row.`,
      },
    })
  }

  if (args.baseLf && args.baseLf > 0) {
    const subs = 250
    sections.push({
      section: formatTradeExecutionSectionLabel("flooring", "base_trim"),
      labor: 0,
      materials: 0,
      subs,
      total: moneyForSection(0, 0, subs, args.markup),
      pricingBasis: "direct",
      unit: "linear_ft",
      quantity: args.baseLf,
      notes: ["Measured base / trim footage supports this separate base row."],
      provenance: {
        quantitySupport: "measured",
        sourceBasis: ["trade_finding"],
        summary: "Direct base/trim row is backed by measured base footage.",
        supportCategory: "base_lf",
        quantityDetail: `${args.baseLf} LF of measured base / trim was used for this row.`,
      },
    })
  }

  if (args.prepSqft && args.prepSqft > 0) {
    sections.push({
      section: formatTradeExecutionSectionLabel("flooring", "underlayment_prep"),
      labor: 0,
      materials: 0,
      subs: 0,
      total: 0,
      pricingBasis: "burden",
      unit: "sqft",
      quantity: args.prepSqft,
      notes: ["Prep / underlayment remains embedded/reference-only in this pass."],
      provenance: {
        quantitySupport: "support_only",
        sourceBasis: ["trade_finding"],
        summary: "Prep / underlayment support remains embedded and non-authoritative.",
        supportCategory: "underlayment_prep_area",
        blockedReason:
          "Prep / underlayment remains embedded/reference-only unless fuller direct install basis is already safe.",
      },
    })
  }

  return sections
}

export function computeFlooringDeterministic(
  input: FlooringDeterministicInput
): FlooringDeterministicResult {
  const text = input.scopeText || ""
  const planSectionInputs = input.planSectionInputs || null

  const measuredSqft =
    planSectionInputs?.supportedFloorSqft && Number(planSectionInputs.supportedFloorSqft) > 0
      ? Number(planSectionInputs.supportedFloorSqft)
      : input.measurements?.totalSqft && Number(input.measurements.totalSqft) > 0
        ? Number(input.measurements.totalSqft)
        : null

  const parsedSqft = detectSqft(text)
  const sectionAreas: Array<{ section: string; sqft: number }> = [
    planSectionInputs?.supportedFloorSqft && planSectionInputs.supportedFloorSqft > 0
      ? {
          section: formatTradeExecutionSectionLabel("flooring", "flooring"),
          sqft: Math.round(planSectionInputs.supportedFloorSqft),
        }
      : null,
    planSectionInputs?.supportedWallTileSqft && planSectionInputs.supportedWallTileSqft > 0
      ? {
          section: formatTradeExecutionSectionLabel("flooring", "wall_tile"),
          sqft: Math.round(planSectionInputs.supportedWallTileSqft),
        }
      : null,
    planSectionInputs?.supportedShowerTileSqft && planSectionInputs.supportedShowerTileSqft > 0
      ? {
          section: formatTradeExecutionSectionLabel("flooring", "shower_tile"),
          sqft: Math.round(planSectionInputs.supportedShowerTileSqft),
        }
      : null,
    planSectionInputs?.supportedBacksplashSqft && planSectionInputs.supportedBacksplashSqft > 0
      ? {
          section: formatTradeExecutionSectionLabel("flooring", "backsplash_tile"),
          sqft: Math.round(planSectionInputs.supportedBacksplashSqft),
        }
      : null,
  ].filter(Boolean) as Array<{ section: string; sqft: number }>
  const supportedScopedSqft = sectionAreas.reduce((sum, item) => sum + item.sqft, 0)
  const sqft = supportedScopedSqft > 0 ? supportedScopedSqft : measuredSqft ?? parsedSqft

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
      estimateBasis: null,
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

  const estimateBasis: EstimateBasis = {
    units: [
      ...(sqft ? ["sqft" as const] : []),
      ...(planSectionInputs?.supportedBaseLf ? ["linear_ft" as const] : []),
    ],
    quantities: {
      ...(sqft ? { sqft } : {}),
      ...(planSectionInputs?.supportedBaseLf ? { linear_ft: Math.round(planSectionInputs.supportedBaseLf) } : {}),
    },
    laborRate: 85,
    crewDays: Math.max(1, Math.round((((labor / 85) / 8) * 2)) / 2),
    mobilization: 0,
    assumptions: [
      `${sqft} sqft informed live flooring/tile pricing.`,
      planSectionInputs?.supportedFloorSqft
        ? "Floor-area support remained scoped to floor coverage only."
        : null,
      planSectionInputs?.supportedWallTileSqft
        ? "Wall-tile support stayed separate from floor-area pricing."
        : null,
      planSectionInputs?.supportedShowerTileSqft
        ? "Wet-area tile support stayed limited to shower / wet-area coverage."
        : null,
      planSectionInputs?.supportedBacksplashSqft
        ? "Backsplash support stayed narrower than broad kitchen wall area."
        : null,
      planSectionInputs?.supportedRemovalSqft
        ? "Measured removal area supported direct removal/demo routing."
        : null,
      planSectionInputs?.supportedPrepSqft
        ? "Prep/underlayment remained embedded/reference-only in this pass."
        : null,
    ].filter(Boolean) as string[],
    sectionPricing: buildFlooringSectionPricing({
      sectionAreas:
        sectionAreas.length > 0
          ? sectionAreas
          : sqft
            ? [{ section: formatTradeExecutionSectionLabel("flooring", "flooring"), sqft }]
            : [],
      baseLf: planSectionInputs?.supportedBaseLf ?? null,
      demoSqft: planSectionInputs?.supportedRemovalSqft ?? null,
      prepSqft: planSectionInputs?.supportedPrepSqft ?? null,
      labor,
      materials,
      subs,
      markup,
      areaSource: planSectionInputs?.areaSource ?? (measuredSqft ? "takeoff" : null),
      measuredSupport: planSectionInputs?.supportedSqftSupport === "measured" || !!planSectionInputs?.areaSource,
      wetAreaContext: !!planSectionInputs?.wetAreaContext,
    }),
  }

  return {
    okForDeterministic,
    okForVerified,
    flooringType: type,
    sqft: sqft as number,
    flags: { demo, baseboards },
    pricing: { labor, materials, subs, markup, total },
    notes,
    estimateBasis,
  }
}
