type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

type WallcoveringMaterialType = "vinyl" | "paper" | "unknown"
type SectionBucket = {
  section: string
  labor: number
  materials: number
  subs: number
  total: number
}
type SectionPricingDetail = SectionBucket & {
  pricingBasis: "direct" | "burden"
  unit?: "sqft" | "days" | "lump_sum"
  quantity?: number
  notes?: string[]
  provenance?: {
    quantitySupport: "measured" | "scaled_prototype" | "support_only"
    sourceBasis: Array<"trade_finding" | "takeoff" | "schedule" | "repeated_space_rollup">
    summary?: string
  }
}

export type WallcoveringDeterministicResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  pricing: Pricing | null
  estimateBasis: {
    units: ("sqft" | "days" | "lump_sum")[]
    quantities: {
      sqft?: number
      days?: number
      lump_sum?: number
    }
    laborRate: number
    hoursPerUnit?: number
    crewDays: number
    mobilization: number
    assumptions: string[]
    sectionPricing?: SectionPricingDetail[]
  } | null
  jobType: "install" | "removal_prep" | "remove_and_install" | "unknown"
  signals: {
    sqft?: number | null
    materialType?: WallcoveringMaterialType | null
    hasRemoval?: boolean
    hasInstall?: boolean
    corridor?: boolean
    featureWall?: boolean
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

function finalizeSectionBuckets(args: {
  sections: Array<Omit<SectionBucket, "total">>
  pricing: Pricing
}): SectionBucket[] {
  const positive = args.sections.filter(
    (section) => section.labor > 0 || section.materials > 0 || section.subs > 0
  )
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
  const m = t.match(/(\d{1,6}(?:\.\d{1,2})?)\s*(sq\.?\s*ft|sqft|sf|square\s*feet|square\s*foot)\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function detectMaterialType(scopeText: string): WallcoveringMaterialType {
  const t = scopeText.toLowerCase()
  if (/\b(vinyl wallcovering|vinyl type|type w[-\s]?\d+|type wc[-\s]?\d+)\b/.test(t)) {
    return "vinyl"
  }
  if (/\b(wallpaper|paper wallcovering|patterned paper)\b/.test(t)) {
    return "paper"
  }
  return "unknown"
}

function buildEstimateBasis(args: {
  pricing: Pricing
  laborRate: number
  sqft: number | null
  crewDays: number
  mobilization: number
  assumptions: string[]
  sectionPricing?: SectionPricingDetail[]
}): WallcoveringDeterministicResult["estimateBasis"] {
  const impliedLaborHours =
    args.laborRate > 0 ? Number(args.pricing.labor || 0) / args.laborRate : 0

  return {
    units: args.sqft && args.sqft > 0 ? ["days", "sqft"] : ["days", "lump_sum"],
    quantities: {
      sqft: args.sqft ?? undefined,
      days: args.crewDays,
      lump_sum: args.sqft && args.sqft > 0 ? undefined : 1,
    },
    laborRate: args.laborRate,
    hoursPerUnit:
      args.sqft && args.sqft > 0
        ? Math.round((impliedLaborHours / args.sqft) * 1000) / 1000
        : undefined,
    crewDays: args.crewDays,
    mobilization: args.mobilization,
    assumptions: args.assumptions,
    sectionPricing: args.sectionPricing,
  }
}

function buildWallcoveringSectionPricing(args: {
  sectionBuckets: SectionBucket[]
  sqft: number
  supportedSqftSupport?: "measured" | null
  coverageKind?: "full_area" | "corridor_area" | "selected_elevation" | null
  areaSource?: "trade_finding" | "takeoff" | null
}): SectionPricingDetail[] {
  return args.sectionBuckets.map((bucket) => {
    if (bucket.section === "Corridor burden") {
      return {
        ...bucket,
        pricingBasis: "burden",
        notes: ["Corridor burden is surfaced structurally, but remains embedded in the core wallcovering engine."],
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: [args.areaSource || "trade_finding"],
          summary: "Corridor burden remains embedded/reference-only and never becomes a standalone direct row.",
        },
      }
    }

    return {
      ...bucket,
      pricingBasis: "direct",
      unit: "sqft",
      quantity: args.sqft,
      notes:
        args.supportedSqftSupport === "measured"
          ? ["Measured wall-area support backs this direct wallcovering row."]
          : undefined,
      provenance:
        args.supportedSqftSupport === "measured"
          ? {
              quantitySupport: "measured",
              sourceBasis: [args.areaSource || "takeoff"],
              summary:
                args.coverageKind === "selected_elevation"
                  ? "Direct wallcovering row is backed by measured selected-elevation area."
                  : args.coverageKind === "corridor_area"
                    ? "Direct wallcovering row is backed by measured corridor/common-area wallcovering area."
                    : "Direct wallcovering row is backed by measured full-area wallcovering quantity.",
            }
          : undefined,
    }
  })
}

export function computeWallcoveringDeterministic(args: {
  scopeText: string
  stateMultiplier: number
  measurements?: { totalSqft?: number | null } | null
  planSectionInputs?: {
    supportedSqft?: number | null
    hasRemovalPrepSection?: boolean
    hasInstallSection?: boolean
    hasCorridorSection?: boolean
    hasFeatureSection?: boolean
    materialType?: WallcoveringMaterialType | null
    supportedSqftSupport?: "measured" | null
    coverageKind?: "full_area" | "corridor_area" | "selected_elevation" | null
    areaSource?: "trade_finding" | "takeoff" | null
  } | null
}): WallcoveringDeterministicResult {
  const scope = String(args.scopeText || "").trim()
  if (!scope) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      jobType: "unknown",
      signals: {},
      notes: ["Empty scopeText"],
      sectionBuckets: [],
    }
  }

  const measSqft =
    args.measurements?.totalSqft && Number(args.measurements.totalSqft) > 0
      ? Number(args.measurements.totalSqft)
      : null
  const supportedSqft =
    typeof args.planSectionInputs?.supportedSqft === "number" &&
    args.planSectionInputs.supportedSqft > 0
      ? Math.round(args.planSectionInputs.supportedSqft)
      : null
  const textSqft = parseSqftFromText(scope)
  const sqft = supportedSqft ?? measSqft ?? textSqft ?? null

  const hasRemoval =
    !!args.planSectionInputs?.hasRemovalPrepSection ||
    /\b(remove|removal|strip|demo existing|substrate prep|adhesive cleanup|strip-out)\b/i.test(scope)
  const hasInstall =
    !!args.planSectionInputs?.hasInstallSection ||
    /\b(install|apply|hang|new wallcovering|new wallpaper)\b/i.test(scope)
  const corridor = !!args.planSectionInputs?.hasCorridorSection || /\bcorridor|hallway|lobby|common area\b/i.test(scope)
  const featureWall = !!args.planSectionInputs?.hasFeatureSection || /\bfeature wall|accent wall\b/i.test(scope)
  const materialType = args.planSectionInputs?.materialType || detectMaterialType(scope)

  if (!sqft || sqft <= 0) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      jobType: "unknown",
      signals: {
        sqft: null,
        materialType,
        hasRemoval,
        hasInstall,
        corridor,
        featureWall,
      },
      notes: ["Wallcovering scope exists but no exact supported wall area is available."],
      sectionBuckets: [],
    }
  }

  if (hasInstall && materialType === "unknown") {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      jobType: "unknown",
      signals: {
        sqft,
        materialType,
        hasRemoval,
        hasInstall,
        corridor,
        featureWall,
      },
      notes: [
        "Wallcovering install area is supported, but material type is too vague for safe live numeric pricing.",
      ],
      sectionBuckets: [],
    }
  }

  const laborRate = 95
  const markup = 25

  let installHrs = 0
  let removalHrs = 0
  let corridorBurdenHrs = 0

  if (hasInstall) {
    const installBaseHrsPerSqft = materialType === "paper" ? 0.09 : 0.075
    let installHrsPerSqft = installBaseHrsPerSqft
    if (corridor) installHrsPerSqft *= 1.08
    if (featureWall) installHrsPerSqft *= 1.05
    installHrs = sqft * installHrsPerSqft + 2.5
    if (corridor) {
      const noCorrInstallHrs =
        sqft * installBaseHrsPerSqft * (featureWall ? 1.05 : 1) + 2.5
      corridorBurdenHrs += Math.max(0, installHrs - noCorrInstallHrs)
    }
  }

  if (hasRemoval) {
    const removalBaseHrsPerSqft = 0.04
    let removalHrsPerSqft = removalBaseHrsPerSqft
    if (corridor) removalHrsPerSqft *= 1.06
    if (featureWall) removalHrsPerSqft *= 0.92
    removalHrs = sqft * removalHrsPerSqft + 2
    if (corridor) {
      const noCorrRemovalHrs =
        sqft * removalBaseHrsPerSqft * (featureWall ? 0.92 : 1) + 2
      corridorBurdenHrs += Math.max(0, removalHrs - noCorrRemovalHrs)
    }
  }

  if (!hasInstall && !hasRemoval) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      jobType: "unknown",
      signals: {
        sqft,
        materialType,
        hasRemoval,
        hasInstall,
        corridor,
        featureWall,
      },
      notes: ["Wallcovering area is supported, but install/remove routing is still too weak."],
      sectionBuckets: [],
    }
  }

  let labor = Math.round((installHrs + removalHrs) * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  let materials = 0
  if (hasInstall) {
    const materialPerSqft = materialType === "paper" ? 2.4 : 1.95
    materials += Math.round(sqft * materialPerSqft + 95)
  }
  if (hasRemoval) {
    materials += Math.round(sqft * 0.22 + 45)
  }

  const mobilization =
    sqft <= 250 ? 275 :
    sqft <= 800 ? 425 :
    650
  const supervision = Math.round((labor + materials) * 0.06)
  const subs = mobilization + supervision
  const total = Math.round((labor + materials + subs) * (1 + markup / 100))
  const pricing = clampPricing({ labor, materials, subs, markup, total })
  const installLabor =
    hasInstall ? Math.round(installHrs * laborRate * args.stateMultiplier) : 0
  const installMaterials =
    hasInstall
      ? Math.round(sqft * (materialType === "paper" ? 2.4 : 1.95) + 95)
      : 0
  const removalLabor =
    hasRemoval ? Math.round(removalHrs * laborRate * args.stateMultiplier) : 0
  const removalMaterials =
    hasRemoval ? Math.round(sqft * 0.22 + 45) : 0
  const corridorAdjustment =
    corridor && corridorBurdenHrs > 0
      ? Math.round(corridorBurdenHrs * laborRate * args.stateMultiplier)
      : 0
  const baseSubs = mobilization + supervision

  const crewDays = Math.max(1, Math.round((((installHrs + removalHrs) / 8) * 2)) / 2)
  const sectionBuckets = finalizeSectionBuckets({
    pricing,
    sections: [
      hasInstall
        ? {
            section: "Install",
            labor: installLabor,
            materials: installMaterials,
            subs: hasRemoval ? Math.round(baseSubs * 0.45) : baseSubs,
          }
        : null,
      hasRemoval
        ? {
            section: "Removal / prep",
            labor: removalLabor,
            materials: removalMaterials,
            subs: hasInstall ? Math.round(baseSubs * 0.35) : baseSubs,
          }
        : null,
      corridor && corridorAdjustment > 0
        ? {
            section: "Corridor burden",
            labor: corridorAdjustment,
            materials: hasInstall ? 18 : 8,
            subs: hasInstall || hasRemoval ? Math.round(baseSubs * 0.2) : 0,
          }
        : null,
    ].filter(Boolean) as Array<Omit<SectionBucket, "total">>,
  })
  const estimateBasis = buildEstimateBasis({
    pricing,
    laborRate,
    sqft,
    crewDays,
    mobilization,
    assumptions: [
      `${sqft} exact wallcovering sqft informed live numeric pricing.`,
      hasInstall ? `Material type: ${materialType}.` : null,
      hasRemoval ? "Removal / substrate prep was included in live wallcovering pricing." : null,
      corridor ? "Corridor wallcovering burden was included in live pricing." : null,
      featureWall ? "Feature-wall routing stayed limited to the exact supported area." : null,
      args.planSectionInputs?.supportedSqftSupport === "measured"
        ? "Wallcovering area support remained measured rather than inferred from room/package cues."
        : null,
    ].filter(Boolean) as string[],
    sectionPricing: buildWallcoveringSectionPricing({
      sectionBuckets,
      sqft,
      supportedSqftSupport: args.planSectionInputs?.supportedSqftSupport ?? null,
      coverageKind: args.planSectionInputs?.coverageKind ?? null,
      areaSource: args.planSectionInputs?.areaSource ?? null,
    }),
  })

  return {
    okForDeterministic: true,
    okForVerified: !!supportedSqft || !!textSqft,
    pricing,
    estimateBasis,
    jobType:
      hasInstall && hasRemoval
        ? "remove_and_install"
        : hasRemoval
        ? "removal_prep"
        : "install",
    signals: {
      sqft,
      materialType,
      hasRemoval,
      hasInstall,
      corridor,
      featureWall,
    },
    notes: [
      hasInstall && hasRemoval
        ? "Wallcovering remove-and-install deterministic pricing applied."
        : hasRemoval
        ? "Wallcovering removal/prep deterministic pricing applied."
        : "Wallcovering install deterministic pricing applied.",
    ],
    sectionBuckets,
  }
}
