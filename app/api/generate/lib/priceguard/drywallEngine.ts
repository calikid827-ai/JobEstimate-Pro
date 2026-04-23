// ./lib/priceguard/drywallEngine.ts

type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}
type SectionBucket = {
  section: string
  labor: number
  materials: number
  subs: number
  total: number
}
type SectionPricingDetail = SectionBucket & {
  pricingBasis: "direct" | "burden"
  unit?: "sqft" | "linear_ft" | "days" | "lump_sum"
  quantity?: number
  notes?: string[]
  provenance?: {
    quantitySupport: "measured" | "scaled_prototype" | "support_only"
    sourceBasis: Array<"trade_finding" | "takeoff" | "schedule" | "repeated_space_rollup">
    summary?: string
  }
}

export type DrywallDeterministicResult = {
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
  jobType: "install_finish" | "patch_repair" | "unknown"
  signals: {
    sqft?: number | null
    sheets?: number | null
    patchCount?: number | null
    includesCeilings?: boolean
    finishLevel?: 3 | 4 | 5 | null
    isTextureMatch?: boolean
    isCeilingPatch?: boolean
  }
  notes: string[]
  sectionBuckets?: SectionBucket[]
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
    return {
      section: section.section,
      labor: Math.round(section.labor),
      materials: Math.round(section.materials),
      subs: Math.round(section.subs),
      total,
    }
  })
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

function parseSheets(scopeText: string): { sheets: number; sheetSqft: number } | null {
  const t = scopeText.toLowerCase()

  // Common sheet sizes: 4x8 (32 sqft), 4x10 (40), 4x12 (48)
  // Examples:
  // "12 sheets of drywall", "8 4x8 sheets", "10 sheets 4x12"
  const sheets = sumMatches(t, /(\d{1,4})\s*(sheets?|boards?)\s*(of\s*)?(drywall|sheetrock)\b/g)
  if (sheets <= 0) return null

  let sheetSqft = 32 // default to 4x8
  if (/\b4\s*x\s*10\b/.test(t)) sheetSqft = 40
  if (/\b4\s*x\s*12\b/.test(t)) sheetSqft = 48
  if (/\b4\s*x\s*8\b/.test(t)) sheetSqft = 32

  return { sheets, sheetSqft }
}

function parsePatchCount(scopeText: string): number | null {
  const t = scopeText.toLowerCase()

  // "patch 6 holes", "repair 3 holes", "fix 4 patches"
  const holes = sumMatches(t, /(\d{1,4})\s*(holes?|patches?|repairs?)\b/g)
  if (holes > 0) return holes

  // "patching: 5"
  const colon = t.match(/patch(ing)?\s*[:\-]\s*(\d{1,4})\b/)
  if (colon?.[2]) {
    const n = Number(colon[2])
    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}

function hasInstallFinishSignals(scopeText: string): boolean {
  const t = scopeText.toLowerCase()
  return /\b(hang|install|sheetrock|drywall)\b/.test(t) && /\b(tape|mud|finish|skim|texture)\b/.test(t)
}

function hasPatchSignals(scopeText: string): boolean {
  const t = scopeText.toLowerCase()
  return /\b(patch|patching|repair|fix|hole|crack|dent)\b/.test(t)
}

function parseFinishLevel(scopeText: string): 3 | 4 | 5 | null {
  const t = scopeText.toLowerCase()
  const m = t.match(/\blevel\s*(3|4|5)\b/)
  if (!m?.[1]) return null
  const n = Number(m[1])
  if (n === 3 || n === 4 || n === 5) return n
  return null
}

function includesCeilings(scopeText: string): boolean {
  const t = scopeText.toLowerCase()
  return /\bceiling|ceilings\b/.test(t)
}

function isCeilingPatch(scopeText: string): boolean {
  const t = scopeText.toLowerCase()
  return /\bceiling|ceilings\b/.test(t) && /\bpatch|repair|hole|crack\b/.test(t)
}

function isTextureMatch(scopeText: string): boolean {
  const t = scopeText.toLowerCase()
  return /\b(texture|knockdown|orange\s*peel|skip\s*trowel|match\s*texture)\b/.test(t)
}

function buildEstimateBasis(args: {
  pricing: Pricing
  laborRate: number
  sqft: number | null
  crewDays: number
  mobilization: number
  assumptions: string[]
  sectionPricing?: SectionPricingDetail[]
}): DrywallDeterministicResult["estimateBasis"] {
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

function buildDrywallSectionPricing(args: {
  sectionBuckets: SectionBucket[]
  partitionLf: number | null
  supportedSqftSupport?: "measured" | null
  assemblySource?: "trade_finding" | "takeoff" | null
  finishTextureSource?: "trade_finding" | "takeoff" | null
  repairSource?: "trade_finding" | null
  ceilingSource?: "trade_finding" | "takeoff" | null
}): SectionPricingDetail[] {
  return args.sectionBuckets.map((bucket) => {
    if (bucket.section === "Partition-related scope") {
      return {
        ...bucket,
        pricingBasis: "burden",
        unit: args.partitionLf && args.partitionLf > 0 ? "linear_ft" : undefined,
        quantity: args.partitionLf && args.partitionLf > 0 ? args.partitionLf : undefined,
        notes: ["Partition section remains burden-based and does not imply full board/finish assembly pricing."],
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: ["trade_finding"],
          summary: "Partition burden remains non-standalone until a fuller measured assembly basis exists.",
        },
      }
    }

    return {
      ...bucket,
      pricingBasis: "direct",
      notes:
        args.supportedSqftSupport === "measured"
          ? ["Measured drywall support backs this direct row."]
          : undefined,
      provenance:
        args.supportedSqftSupport === "measured"
          ? {
              quantitySupport: "measured",
              sourceBasis: [
                bucket.section === "Patch / repair"
                  ? args.repairSource || "trade_finding"
                  : bucket.section === "Finish / texture"
                    ? args.finishTextureSource || args.assemblySource || "takeoff"
                    : bucket.section === "Ceiling drywall"
                      ? args.ceilingSource || args.assemblySource || "takeoff"
                      : args.assemblySource || "takeoff",
              ],
              summary:
                bucket.section === "Patch / repair"
                  ? "Direct patch/repair row is backed by measured repair area."
                  : bucket.section === "Finish / texture"
                    ? "Direct finish/texture row is backed by measured finish/texture or assembly area."
                    : bucket.section === "Ceiling drywall"
                      ? "Direct ceiling drywall row is backed by measured ceiling drywall area."
                      : "Direct drywall row is backed by measured assembly area.",
            }
          : undefined,
    }
  })
}

// -----------------------------
// MAIN ENGINE
// -----------------------------
export function computeDrywallDeterministic(args: {
  scopeText: string
  stateMultiplier: number
  measurements?: { totalSqft?: number | null } | null
  planSectionInputs?: {
    supportedSqft?: number | null
    supportedPartitionLf?: number | null
    includeCeilings?: boolean
    forcePatchRepair?: boolean
    forceInstallFinish?: boolean
    hasFinishTextureSection?: boolean
    supportedSqftSupport?: "measured" | null
    supportedFinishTextureSqft?: number | null
    assemblySource?: "trade_finding" | "takeoff" | null
    finishTextureSource?: "trade_finding" | "takeoff" | null
    repairSource?: "trade_finding" | null
    ceilingSource?: "trade_finding" | "takeoff" | null
  } | null
}): DrywallDeterministicResult {
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

  // Prefer measurement sqft if provided
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
  const sheetsInfo = parseSheets(scope)
  const patchCount = parsePatchCount(scope)

  const finishLevel = parseFinishLevel(scope)
  const ceilingFlag =
    typeof args.planSectionInputs?.includeCeilings === "boolean"
      ? args.planSectionInputs.includeCeilings
      : includesCeilings(scope)
  const textureFlag =
    !!args.planSectionInputs?.hasFinishTextureSection || isTextureMatch(scope)
  const ceilingPatchFlag = isCeilingPatch(scope)

  // Decide a working sqft
  const sqftFromSheets = sheetsInfo ? Math.round(sheetsInfo.sheets * sheetsInfo.sheetSqft) : null
  const sqft =
    measSqft ??
    supportedSqft ??
    textSqft ??
    sqftFromSheets ??
    null

  const patchLike =
    args.planSectionInputs?.forcePatchRepair === true
      ? true
      : args.planSectionInputs?.forceInstallFinish === true
        ? false
        : hasPatchSignals(scope)
  const installLike = args.planSectionInputs?.forceInstallFinish || hasInstallFinishSignals(scope)

  // -----------------------------
  // Job type selection
  // -----------------------------
  // 1) Patch/repair (count-based OR sqft-based)
  if (patchLike) {
    // Require explicit patchCount OR explicit sqft OR sheets
    if (!patchCount && !sqft) {
      return {
        okForDeterministic: false,
        okForVerified: false,
        pricing: null,
        estimateBasis: null,
        jobType: "patch_repair",
        signals: {
          sqft: null,
          sheets: sheetsInfo?.sheets ?? null,
          patchCount: patchCount ?? null,
          includesCeilings: ceilingFlag,
          finishLevel,
          isTextureMatch: textureFlag,
          isCeilingPatch: ceilingPatchFlag,
        },
        notes: ["Patch/repair language present but no explicit quantities (count/sqft/sheets) → avoid deterministic"],
        sectionBuckets: [],
      }
    }

    const pricing = priceDrywallPatchRepair({
      patchCount: patchCount ?? null,
      sqft: sqft ?? null,
      stateMultiplier: args.stateMultiplier,
      finishLevel,
      textureMatch: textureFlag,
      ceilingPatch: ceilingPatchFlag,
    })
    const laborRate = 95
    const mobilization = 250
    const crewDays =
      patchCount && patchCount > 0
        ? patchCount <= 4
          ? 1
          : patchCount <= 10
          ? 2
          : Math.max(2, Math.ceil((patchCount * 1.1 + 2.75) / 8))
        : sqft && sqft > 0
        ? Math.max(1, Math.round((((sqft * 0.14 + 3.25) / 8) * 2)) / 2)
        : 1
    const estimateBasis = buildEstimateBasis({
      pricing,
      laborRate,
      sqft: sqft ?? null,
      crewDays,
      mobilization,
      assumptions: [
        patchCount ? `${patchCount} patch / repair location(s) informed the live drywall pricing route.` : null,
        sqft
          ? supportedSqft && !textSqft && !measSqft
            ? `${sqft} repair sqft came from plan-aware section support.`
            : `${sqft} repair sqft informed the live drywall pricing route.`
          : null,
        args.planSectionInputs?.supportedSqftSupport === "measured"
          ? "Repair sqft support remained measured rather than inferred from repeated rooms or generic wall area."
          : null,
        finishLevel ? `Finish level ${finishLevel} was carried into patch / repair pricing.` : null,
        textureFlag ? "Texture-match burden was included in patch / repair pricing." : null,
        ceilingPatchFlag ? "Ceiling patch routing stayed separate inside drywall pricing." : null,
        args.planSectionInputs?.supportedPartitionLf
          ? `${Math.round(args.planSectionInputs.supportedPartitionLf)} partition LF was identified, but partition LF remains routing-only until a safe LF-to-board model exists.`
          : null,
      ].filter(Boolean) as string[],
      sectionPricing: buildDrywallSectionPricing({
        sectionBuckets: pricing.sectionBuckets,
        partitionLf: args.planSectionInputs?.supportedPartitionLf ?? null,
        supportedSqftSupport: args.planSectionInputs?.supportedSqftSupport ?? null,
        assemblySource: args.planSectionInputs?.assemblySource ?? null,
        finishTextureSource: args.planSectionInputs?.finishTextureSource ?? null,
        repairSource: args.planSectionInputs?.repairSource ?? null,
        ceilingSource: args.planSectionInputs?.ceilingSource ?? null,
      }),
    })

    const okForVerified = !!patchCount || !!textSqft || !!sheetsInfo // measurement-only sqft is deterministic but not “verified”
    return {
      okForDeterministic: true,
      okForVerified,
      pricing,
      estimateBasis,
      jobType: "patch_repair",
      signals: {
        sqft: sqft ?? null,
        sheets: sheetsInfo?.sheets ?? null,
        patchCount: patchCount ?? null,
        includesCeilings: ceilingFlag,
        finishLevel,
        isTextureMatch: textureFlag,
        isCeilingPatch: ceilingPatchFlag,
      },
      notes: [
        "Drywall patch/repair pricing applied",
        args.planSectionInputs?.forcePatchRepair
          ? "Plan-aware section routing kept drywall in patch / repair pricing."
          : null,
      ].filter(Boolean) as string[],
      sectionBuckets: pricing.sectionBuckets,
    }
  }

  // 2) Install + tape/finish
  if (installLike) {
    // Must have sqft or sheets or measurement sqft
    if (!sqft) {
      return {
        okForDeterministic: false,
        okForVerified: false,
        pricing: null,
        estimateBasis: null,
        jobType: "install_finish",
        signals: {
          sqft: null,
          sheets: sheetsInfo?.sheets ?? null,
          patchCount: null,
          includesCeilings: ceilingFlag,
          finishLevel,
          isTextureMatch: textureFlag,
          isCeilingPatch: false,
        },
        notes: ["Install/finish language present but no sqft/sheets parsed → avoid deterministic"],
        sectionBuckets: [],
      }
    }

    const pricing = priceDrywallInstallFinish({
      sqft,
      stateMultiplier: args.stateMultiplier,
      includesCeilings: ceilingFlag,
      finishLevel,
      textureMatch: textureFlag,
      partitionLf: args.planSectionInputs?.supportedPartitionLf ?? null,
    })
    const laborRate = 95
    const baseLaborHours =
      sqft *
        (0.09 + (ceilingFlag ? 0.02 : 0) + (finishLevel === 3 ? -0.01 : 0) + (finishLevel === 5 ? 0.03 : 0) + (textureFlag ? 0.015 : 0)) +
      4.5
    const crewDays = Math.max(1, Math.round(((baseLaborHours / 8) * 2)) / 2)
    const mobilization =
      sqft <= 150 ? 275 :
      sqft <= 400 ? 425 :
      650
    const estimateBasis = buildEstimateBasis({
      pricing,
      laborRate,
      sqft,
      crewDays,
      mobilization,
      assumptions: [
        supportedSqft && !textSqft && !measSqft
          ? `${sqft} drywall sqft came from plan-aware section support.`
          : `${sqft} drywall sqft informed the live install / finish pricing route.`,
        args.planSectionInputs?.supportedSqftSupport === "measured"
          ? "Install/hang sqft support remained measured rather than inferred from repeated-room or partition cues alone."
          : null,
        ceilingFlag ? "Ceiling drywall was included in the live install / finish route." : null,
        finishLevel ? `Finish level ${finishLevel} was carried into install / finish pricing.` : null,
        textureFlag || args.planSectionInputs?.hasFinishTextureSection
          ? "Finish / texture burden was included in install / finish pricing."
          : null,
        args.planSectionInputs?.supportedPartitionLf
          ? `${Math.round(args.planSectionInputs.supportedPartitionLf)} partition LF increased install fragmentation burden without converting LF into invented board area.`
          : null,
      ].filter(Boolean) as string[],
      sectionPricing: buildDrywallSectionPricing({
        sectionBuckets: pricing.sectionBuckets,
        partitionLf: args.planSectionInputs?.supportedPartitionLf ?? null,
        supportedSqftSupport: args.planSectionInputs?.supportedSqftSupport ?? null,
        assemblySource: args.planSectionInputs?.assemblySource ?? null,
        finishTextureSource: args.planSectionInputs?.finishTextureSource ?? null,
        repairSource: args.planSectionInputs?.repairSource ?? null,
        ceilingSource: args.planSectionInputs?.ceilingSource ?? null,
      }),
    })

    // Verified if sqft was explicit in text or sheets were explicit (measurement-only sqft = deterministic, not verified)
    const okForVerified = !!textSqft || !!sheetsInfo
    return {
      okForDeterministic: true,
      okForVerified,
      pricing,
      estimateBasis,
      jobType: "install_finish",
      signals: {
        sqft,
        sheets: sheetsInfo?.sheets ?? null,
        patchCount: null,
        includesCeilings: ceilingFlag,
        finishLevel,
        isTextureMatch: textureFlag,
        isCeilingPatch: false,
      },
      notes: [
        "Drywall install + finish pricing applied",
        args.planSectionInputs?.forceInstallFinish
          ? "Plan-aware section routing kept drywall in install / hang pricing."
          : null,
      ].filter(Boolean) as string[],
      sectionBuckets: pricing.sectionBuckets,
    }
  }

  // 3) Drywall-ish but ambiguous: only go deterministic if sqft/sheets explicitly exist
  if (/\b(drywall|sheetrock)\b/i.test(scope) && sqft) {
    const pricing = priceDrywallInstallFinish({
      sqft,
      stateMultiplier: args.stateMultiplier,
      includesCeilings: ceilingFlag,
      finishLevel,
      textureMatch: textureFlag,
      partitionLf: args.planSectionInputs?.supportedPartitionLf ?? null,
    })
    const laborRate = 95
    const baseLaborHours =
      sqft *
        (0.09 + (ceilingFlag ? 0.02 : 0) + (finishLevel === 3 ? -0.01 : 0) + (finishLevel === 5 ? 0.03 : 0) + (textureFlag ? 0.015 : 0)) +
      4.5
    const crewDays = Math.max(1, Math.round(((baseLaborHours / 8) * 2)) / 2)
    const mobilization =
      sqft <= 150 ? 275 :
      sqft <= 400 ? 425 :
      650
    const estimateBasis = buildEstimateBasis({
      pricing,
      laborRate,
      sqft,
      crewDays,
      mobilization,
      assumptions: [
        supportedSqft && !textSqft && !measSqft
          ? `${sqft} drywall sqft came from plan-aware section support.`
          : `${sqft} drywall sqft informed the live install / finish pricing route.`,
        args.planSectionInputs?.supportedSqftSupport === "measured"
          ? "Install/hang sqft support remained measured rather than inferred from repeated-room or partition cues alone."
          : null,
        ceilingFlag ? "Ceiling drywall was included in the live install / finish route." : null,
        finishLevel ? `Finish level ${finishLevel} was carried into install / finish pricing.` : null,
        textureFlag || args.planSectionInputs?.hasFinishTextureSection
          ? "Finish / texture burden was included in install / finish pricing."
          : null,
        args.planSectionInputs?.supportedPartitionLf
          ? `${Math.round(args.planSectionInputs.supportedPartitionLf)} partition LF increased install fragmentation burden without converting LF into invented board area.`
          : null,
      ].filter(Boolean) as string[],
      sectionPricing: buildDrywallSectionPricing({
        sectionBuckets: pricing.sectionBuckets,
        partitionLf: args.planSectionInputs?.supportedPartitionLf ?? null,
        supportedSqftSupport: args.planSectionInputs?.supportedSqftSupport ?? null,
        assemblySource: args.planSectionInputs?.assemblySource ?? null,
        finishTextureSource: args.planSectionInputs?.finishTextureSource ?? null,
        repairSource: args.planSectionInputs?.repairSource ?? null,
        ceilingSource: args.planSectionInputs?.ceilingSource ?? null,
      }),
    })

    const okForVerified = !!textSqft || !!sheetsInfo
    return {
      okForDeterministic: true,
      okForVerified,
      pricing,
      estimateBasis,
      jobType: "install_finish",
      signals: {
        sqft,
        sheets: sheetsInfo?.sheets ?? null,
        patchCount: null,
        includesCeilings: ceilingFlag,
        finishLevel,
        isTextureMatch: textureFlag,
        isCeilingPatch: false,
      },
      notes: ["Drywall mentioned; sqft available → applied install/finish baseline"],
      sectionBuckets: pricing.sectionBuckets,
    }
  }

  return {
    okForDeterministic: false,
    okForVerified: false,
    pricing: null,
    estimateBasis: null,
    jobType: "unknown",
    signals: {
      sqft: sqft ?? null,
      sheets: sheetsInfo?.sheets ?? null,
      patchCount: patchCount ?? null,
      includesCeilings: ceilingFlag,
      finishLevel,
      isTextureMatch: textureFlag,
      isCeilingPatch: ceilingPatchFlag,
    },
    notes: ["No deterministic drywall pattern matched"],
    sectionBuckets: [],
  }
}

// -----------------------------
// PRICERS
// -----------------------------
function priceDrywallInstallFinish(args: {
  sqft: number
  stateMultiplier: number
  includesCeilings: boolean
  finishLevel: 3 | 4 | 5 | null
  textureMatch: boolean
  partitionLf?: number | null
}): Pricing & { sectionBuckets: SectionBucket[] } {
  const pricing = computeDrywallInstallFinishCore(args)

  const baselineFinishLevel = args.finishLevel === 3 ? 3 : 4
  const baseNoCeiling =
    args.includesCeilings || args.textureMatch || baselineFinishLevel !== args.finishLevel || (args.partitionLf || 0) > 0
      ? computeDrywallInstallFinishCore({
          sqft: args.sqft,
          stateMultiplier: args.stateMultiplier,
          includesCeilings: false,
          finishLevel: baselineFinishLevel,
          textureMatch: false,
          partitionLf: 0,
        })
      : pricing
  const withCeilingsNoFinish =
    args.includesCeilings
      ? computeDrywallInstallFinishCore({
          sqft: args.sqft,
          stateMultiplier: args.stateMultiplier,
          includesCeilings: true,
          finishLevel: baselineFinishLevel,
          textureMatch: false,
          partitionLf: 0,
        })
      : baseNoCeiling
  const withFinishNoPartition =
    args.textureMatch || args.finishLevel !== baselineFinishLevel
      ? computeDrywallInstallFinishCore({
          sqft: args.sqft,
          stateMultiplier: args.stateMultiplier,
          includesCeilings: args.includesCeilings,
          finishLevel: args.finishLevel,
          textureMatch: args.textureMatch,
          partitionLf: 0,
        })
      : withCeilingsNoFinish

  const ceilingBucket = {
    section: "Ceiling drywall",
    labor: Math.max(0, withCeilingsNoFinish.labor - baseNoCeiling.labor),
    materials: Math.max(0, withCeilingsNoFinish.materials - baseNoCeiling.materials),
    subs: Math.max(0, withCeilingsNoFinish.subs - baseNoCeiling.subs),
  }
  const finishBucket = {
    section: "Finish / texture",
    labor: Math.max(0, withFinishNoPartition.labor - withCeilingsNoFinish.labor),
    materials: Math.max(0, withFinishNoPartition.materials - withCeilingsNoFinish.materials),
    subs: Math.max(0, withFinishNoPartition.subs - withCeilingsNoFinish.subs),
  }
  const partitionBucket = {
    section: "Partition-related scope",
    labor: Math.max(0, pricing.labor - withFinishNoPartition.labor),
    materials: Math.max(0, pricing.materials - withFinishNoPartition.materials),
    subs: Math.max(0, pricing.subs - withFinishNoPartition.subs),
  }
  const installBucket = {
    section: "Install / hang",
    labor: Math.max(
      0,
      pricing.labor - ceilingBucket.labor - finishBucket.labor - partitionBucket.labor
    ),
    materials: Math.max(
      0,
      pricing.materials - ceilingBucket.materials - finishBucket.materials - partitionBucket.materials
    ),
    subs: Math.max(0, pricing.subs - ceilingBucket.subs - finishBucket.subs - partitionBucket.subs),
  }

  return {
    ...pricing,
    sectionBuckets: finalizeSectionBuckets({
      pricing,
      sections: [installBucket, ceilingBucket, finishBucket, partitionBucket],
    }),
  }
}

function computeDrywallInstallFinishCore(args: {
  sqft: number
  stateMultiplier: number
  includesCeilings: boolean
  finishLevel: 3 | 4 | 5 | null
  textureMatch: boolean
  partitionLf?: number | null
}): Pricing {
  const laborRate = 95
  const markup = 25
  let hrsPerSqft = 0.09
  if (args.includesCeilings) hrsPerSqft += 0.02
  if (args.finishLevel === 3) hrsPerSqft -= 0.01
  if (args.finishLevel === 5) hrsPerSqft += 0.03
  if (args.textureMatch) hrsPerSqft += 0.015

  const partitionLf =
    typeof args.partitionLf === "number" && args.partitionLf > 0
      ? Math.round(args.partitionLf)
      : 0
  const partitionDensity = partitionLf > 0 ? partitionLf / Math.max(1, args.sqft) : 0

  let laborHrs = args.sqft * hrsPerSqft + 4.5
  if (partitionDensity > 0) {
    const fragmentationFactor = Math.min(0.14, partitionDensity * 0.8)
    laborHrs *= 1 + fragmentationFactor
    laborHrs += Math.min(4, partitionLf / 180)
  }
  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  let materials = Math.round(args.sqft * 1.05 + 160)
  if (partitionLf > 0) {
    materials += Math.round(Math.min(180, partitionLf * 0.12))
  }

  const mobilization =
    args.sqft <= 150 ? 275 :
    args.sqft <= 400 ? 425 :
    650
  const dumpFee = args.sqft >= 350 ? 180 : 0
  const supervision = Math.round((labor + materials) * 0.06)
  const subs = mobilization + dumpFee + supervision
  const total = Math.round((labor + materials + subs) * (1 + markup / 100))
  return clampPricing({ labor, materials, subs, markup, total })
}

function priceDrywallPatchRepair(args: {
  patchCount: number | null
  sqft: number | null
  stateMultiplier: number
  finishLevel: 3 | 4 | 5 | null
  textureMatch: boolean
  ceilingPatch: boolean
}): Pricing & { sectionBuckets: SectionBucket[] } {
  const laborRate = 95
  const markup = 25

  // If they gave explicit patch count, use per-patch model with strong minimums.
  const patchCount = args.patchCount ?? 0

  // Patch labor hours
  let laborHrs = 0
  if (patchCount > 0) {
    // Per patch baseline assumes small/medium holes
    let hrsPerPatch = 1.1
    if (args.ceilingPatch) hrsPerPatch += 0.25
    if (args.finishLevel === 5) hrsPerPatch += 0.35
    if (args.textureMatch) hrsPerPatch += 0.25

    laborHrs = patchCount * hrsPerPatch + 2.75 // setup/cleanup/return trip allowance
  } else if (args.sqft && args.sqft > 0) {
    // If sqft exists but no count, price as small-area repair
    let hrsPerSqft = 0.14
    if (args.ceilingPatch) hrsPerSqft += 0.03
    if (args.finishLevel === 5) hrsPerSqft += 0.04
    if (args.textureMatch) hrsPerSqft += 0.02

    laborHrs = args.sqft * hrsPerSqft + 3.25
  } else {
    // Should not happen because caller guards, but keep safe
    laborHrs = 5.0
  }

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // Materials for patching: mud, tape, corner bead, texture, sanding, primer touch-up allowance
  const materials =
    patchCount > 0
      ? Math.round(Math.max(95, patchCount * 18) + (args.textureMatch ? 35 : 0))
      : Math.round(Math.max(120, (args.sqft ?? 0) * 1.25) + (args.textureMatch ? 35 : 0))

  // Strong mobilization minimum for repair calls
  const mobilization = 250
  const supervision = Math.round((labor + materials) * 0.05)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))
  const pricing = clampPricing({ labor, materials, subs, markup, total })
  const finishBucket = {
    section: "Finish / texture",
    labor: args.textureMatch ? Math.round(labor * 0.12) : 0,
    materials: args.textureMatch ? 35 : 0,
    subs: 0,
  }
  const ceilingBucket = {
    section: "Ceiling drywall",
    labor: args.ceilingPatch ? Math.round(labor * 0.08) : 0,
    materials: 0,
    subs: 0,
  }
  const patchBucket = {
    section: "Patch / repair",
    labor: Math.max(0, pricing.labor - finishBucket.labor - ceilingBucket.labor),
    materials: Math.max(0, pricing.materials - finishBucket.materials),
    subs: pricing.subs,
  }

  return {
    ...pricing,
    sectionBuckets: finalizeSectionBuckets({
      pricing,
      sections: [patchBucket, finishBucket, ceilingBucket],
    }),
  }
}
