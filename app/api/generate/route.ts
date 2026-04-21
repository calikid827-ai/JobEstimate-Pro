import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

import {
  GenerateSchema,
  cleanScopeText,
  jsonError,
  assertSameOrigin,
  readJsonWithLimit,
} from "./lib/guards"

import { buildEstimatorContext } from "./lib/estimator/context"
import { rateLimit } from "./lib/rateLimit"
import { computeFlooringDeterministic } from "./lib/priceguard/flooringEngine"
import { computeElectricalDeterministic } from "./lib/priceguard/electricalEngine"
import {
  computePlumbingDeterministic,
  hasHeavyPlumbingSignals,
  parsePlumbingFixtureBreakdown,
} from "./lib/priceguard/plumbingEngine"

import { computeDrywallDeterministic } from "./lib/priceguard/drywallEngine"
import { computePaintingDeterministic } from "./lib/priceguard/paintingEngine"
import { applyMinimumCharge } from "./lib/priceguard/minimumCharges"
import { detectScopeSignals } from "./lib/priceguard/scopeSignals"

import type {
  ComplexityProfile as EstimatorComplexityProfile,
  EstimateBasis as EstimatorEstimateBasis,
  EstimateExplanation as EstimatorEstimateExplanation,
  PhotoAnalysis as EstimatorPhotoAnalysis,
  PhotoPricingImpact as EstimatorPhotoPricingImpact,
  PriceGuardReport as EstimatorPriceGuardReport,
  ScheduleBlock as EstimatorScheduleBlock,
  ScopeSignals as EstimatorScopeSignals,
  ScopeXRay as EstimatorScopeXRay,
  SplitScopeItem as EstimatorSplitScopeItem,
  TradeStack as EstimatorTradeStack,
} from "./lib/estimator/types"
import { splitScopeByTrade, isMultiTradeScope } from "./lib/priceguard/scopeSplitter"
import {
  runEstimatorOrchestrator,
  type OrchestratorDeps,
} from "./lib/estimator/orchestrator"
import { runPlanIntelligence } from "./lib/plans/orchestrator"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// -----------------------------
// ENV VALIDATION
// -----------------------------
if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY missing")

if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")

if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

// -----------------------------
// CLIENTS
// -----------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// -----------------------------
// CONSTANTS
// -----------------------------
const FREE_LIMIT = 3
const DEV_ALWAYS_PAID = [
  "test12345@gmail.com"
]
const PRIMARY_MODEL = "gpt-4.1-mini" as const
const DESCRIPTION_POLISH_MODEL = "gpt-4o" as const

const PHOTO_ANALYSIS_MODEL = "gpt-4o" as const
const MAX_PHOTOS = 8
const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // 8 MB decoded size per image
const ALLOWED_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

const ENFORCE_PHOTO_ESTIMATE_DECISION = false

// -----------------------------
// TYPES
// -----------------------------
type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

type ScheduleBlock = {
  startDate: string
  crewDays: number | null
  visits: number | null
  calendarDays: { min: number; max: number } | null
  workDaysPerWeek: 5 | 6 | 7
  rationale: string[]
}

type PaintScope = "walls" | "walls_ceilings" | "full"
type EffectivePaintScope = PaintScope | "doors_only"

type SplitScopeItem = {
  trade: string
  scope: string
  signals?: string[]
}

type MultiTradeDetTradeResult = {
  trade: string
  scope: string
  pricing: Pricing
  laborRate: number
  crewDays: number
  source: string
  notes: string[]
}

type MultiTradeDeterministicResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  pricing: Pricing | null
  estimateBasis: EstimateBasis | null
  perTrade: MultiTradeDetTradeResult[]
  notes: string[]
}

type MaterialsList = {
  items: Array<{
    label: string
    quantity: string
    category: "material" | "consumable" | "hardware" | "protection"
    confidence?: "low" | "medium" | "high"
  }>
  confirmItems: string[]
  notes: string[]
} | null

type AreaScopeBreakdown = {
  detectedArea: {
    floorSqft: number | null
    wallSqft: number | null
    paintSqft: number | null
    trimLf: number | null
  }
  allowances: {
    prepDemo: string[]
    protectionSetup: string[]
    materialsDrivers: string[]
    scheduleDrivers: string[]
  }
  missingConfirmations: string[]
}

function buildMaterialsList(args: {
  trade: string
  scopeText: string
  splitScopes: SplitScopeItem[]
  effectivePaintScope: EffectivePaintScope | null
  rooms: number | null
  doors: number | null
  quantityInputs: ReturnType<typeof getEffectiveQuantityInputs>
  photoAnalysis: PhotoAnalysis | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  anchorId?: string | null
}): MaterialsList {
  
  const items: NonNullable<MaterialsList>["items"] = []
  const confirmItems: string[] = []
  const notes: string[] = []

  const s = (args.scopeText || "").toLowerCase()

  const addItem = (
    label: string,
    quantity: string,
    category: "material" | "consumable" | "hardware" | "protection",
    confidence?: "low" | "medium" | "high"
  ) => {
    const cleanLabel = String(label || "").trim()
    const cleanQty = String(quantity || "").trim()
    if (!cleanLabel || !cleanQty) return

    const exists = items.some(
      (x) =>
        x.label.toLowerCase() === cleanLabel.toLowerCase() &&
        x.quantity.toLowerCase() === cleanQty.toLowerCase() &&
        x.category === category
    )
    if (exists) return

    items.push({
      label: cleanLabel,
      quantity: cleanQty,
      category,
      confidence,
    })
  }

  const paintSqft =
    args.quantityInputs.effectivePaintSqft ??
    args.quantityInputs.effectiveWallSqft

  const floorSqft = args.quantityInputs.effectiveFloorSqft

  if (args.anchorId === "kitchen_remodel_v1") {
  const sqft = args.quantityInputs.effectiveFloorSqft ?? 200

  addItem("Cabinets / cabinetry package", "allowance", "material", "medium")
  addItem("Countertop material", "allowance", "material", "medium")
  addItem("Sink / faucet set", "allowance", "material", "medium")

  if (/\b(backsplash|tile)\b/.test(s)) {
    addItem("Backsplash tile", "allowance", "material", "medium")
    addItem("Thinset / mortar", "allowance", "material", "medium")
    addItem("Grout", "allowance", "material", "medium")
  }

  if (/\b(floor|flooring|lvp|vinyl plank|laminate|hardwood|tile floor)\b/.test(s)) {
    addItem("Flooring material", `~${Math.ceil(sqft * 1.1)} sqft`, "material", "high")

    if (/\b(tile|porcelain|ceramic)\b/.test(s)) {
      addItem("Thinset / mortar", "allowance", "material", "medium")
      addItem("Grout", "allowance", "material", "medium")
    } else {
      addItem("Underlayment", `~${Math.ceil(sqft)} sqft`, "material", "medium")
    }

    addItem("Transitions / reducers", "allowance", "hardware", "medium")
  }

  if (/\b(paint|painting|prime|primer)\b/.test(s)) {
    addItem("Primer / paint", "allowance", "material", "medium")
  }

  if (/\b(demo|demolition|tear\s*out|remove)\b/.test(s)) {
    addItem("Demo bags / disposal supplies", "1 lot", "consumable", "high")
    addItem("Dust containment materials", "1 lot", "protection", "high")
  }

  addItem("Fasteners / screws / anchors / adhesive", "1 lot", "hardware", "high")
  addItem("Masking / floor / adjacent finish protection", "1 lot", "protection", "high")

  confirmItems.push(
    "Confirm cabinet count / layout before ordering.",
    "Confirm countertop material and edge selection.",
    "Confirm backsplash extent and final tile selections.",
    "Confirm sink / faucet / appliance scope before buying."
  )
}

if (args.anchorId === "bathroom_remodel_v1") {
  const floorSqft = args.quantityInputs.effectiveFloorSqft ?? 60

  addItem("Vanity / sink / faucet allowance", "allowance", "material", "medium")
  addItem("Toilet / plumbing trim allowance", "allowance", "material", "medium")
  addItem("Waterproofing materials", "allowance", "material", "high")
  addItem("Tile / setting materials", "allowance", "material", "medium")
  addItem("Thinset / mortar", "allowance", "material", "medium")
  addItem("Grout / sealant / caulk", "allowance", "consumable", "high")
  addItem("Protection / masking materials", "1 lot", "protection", "high")
  addItem("Demo / disposal supplies", "1 lot", "consumable", "high")

  if (floorSqft > 0) {
    addItem("Bathroom flooring allowance", `~${Math.ceil(floorSqft * 1.1)} sqft`, "material", "medium")
  }

  confirmItems.push(
    "Confirm shower wall tile extent.",
    "Confirm valve / drain / plumbing relocation scope.",
    "Confirm fixture finish level before buying."
  )
}

if (args.anchorId === "flooring_only_v1") {
  const sqft = args.quantityInputs.effectiveFloorSqft ?? 180

  addItem("Flooring material", `~${Math.ceil(sqft * 1.1)} sqft`, "material", "high")

  if (/\b(tile|porcelain|ceramic)\b/.test(s)) {
    addItem("Thinset / mortar", "allowance", "material", "medium")
    addItem("Grout", "allowance", "material", "medium")
  } else {
    addItem("Underlayment", `~${Math.ceil(sqft)} sqft`, "material", "medium")
  }

  addItem("Transitions / reducers", "allowance", "hardware", "medium")
  addItem("Base / quarter round", "confirm quantity", "material", "medium")
  addItem("Caulk / adhesive / misc install supplies", "1 lot", "consumable", "high")
  addItem("Floor protection", "1 lot", "protection", "high")

  confirmItems.push("Confirm exact transition count and trim footage.")
}

if (args.anchorId === "kitchen_refresh_v1") {
  const sqft = args.quantityInputs.effectiveFloorSqft ?? 200

  addItem("Cabinets / cabinet finish materials", "allowance", "material", "medium")
  addItem("Countertop allowance", "allowance", "material", "medium")
  addItem("Sink / faucet set", "allowance", "material", "medium")

  if (/\b(backsplash|tile)\b/.test(s)) {
    addItem("Backsplash tile", "allowance", "material", "medium")
    addItem("Thinset / mortar", "allowance", "material", "medium")
    addItem("Grout", "allowance", "material", "medium")
  }

  if (/\b(floor|flooring|lvp|vinyl plank|laminate|hardwood|tile floor)\b/.test(s)) {
    addItem("Flooring material", `~${Math.ceil(sqft * 1.1)} sqft`, "material", "high")
    addItem("Underlayment", `~${Math.ceil(sqft)} sqft`, "material", "medium")
    addItem("Transitions / reducers", "allowance", "hardware", "medium")
  }

  addItem("Masking / adjacent finish protection", "1 lot", "protection", "high")
  addItem("Fasteners / adhesive / misc install supplies", "1 lot", "hardware", "medium")

  confirmItems.push(
    "Confirm cabinet scope is repaint, replace, or install.",
    "Confirm countertop and backsplash selections before buying.",
    "Confirm appliance scope before ordering materials."
  )
}

  if (args.trade === "painting") {
  const job = args.photoAnalysis?.jobSummary ?? null
  const exteriorSummary = job?.exteriorSummary ?? null

  const looksExteriorPainting =
    exteriorSummary?.isExterior === true ||
    /\b(exterior|outside|stucco|siding|fascia|soffit|eaves?|garage door|front door|rear elevation|front elevation|side of house|body color|trim color)\b/.test(
      s
    )

  const coatCount =
    /\b(three|3)\s+coat/.test(s) || /\b3\s*coats?\b/.test(s)
      ? 3
      : /\b(one|1)\s+coat/.test(s) || /\b1\s*coats?\b/.test(s)
      ? 1
      : 2

  if (looksExteriorPainting) {
    const exteriorBodySqft = positiveOrNull(
      exteriorSummary?.bodyWallSqft ??
        args.quantityInputs.photoWallSqft ??
        args.quantityInputs.effectiveWallSqft
    )

    const substrate = exteriorSummary?.substrate ?? "unknown"
    const bodyCoverageSqftPerGallon = substrate === "stucco" ? 250 : 300

    const bodyGallons = exteriorBodySqft
      ? Math.max(
          2,
          Math.ceil(
            ((exteriorBodySqft * Math.max(1, coatCount)) / bodyCoverageSqftPerGallon) * 1.15
          )
        )
      : null

    const garageDoors = positiveOrNull(exteriorSummary?.garageDoors) ?? 0
    const entryDoors = positiveOrNull(exteriorSummary?.entryDoors) ?? 0

    const trimGallonsBase =
      exteriorSummary?.trimComplexity === "high"
        ? 5
        : exteriorSummary?.trimComplexity === "medium"
        ? 3
        : 2

    const trimGallons = Math.max(
      1,
      Math.ceil(trimGallonsBase + garageDoors * 1 + entryDoors * 0.5)
    )

    if (bodyGallons) {
      addItem(
        "Exterior body paint / primer",
        `~${bodyGallons} gal`,
        "material",
        args.quantityInputs.userMeasuredSqft || args.quantityInputs.parsedSqft
          ? "high"
          : "medium"
      )
    } else {
      addItem("Exterior body paint / primer", "allowance", "material", "medium")
    }

    addItem("Trim / fascia / eaves paint", `~${trimGallons} gal`, "material", "medium")

    if (garageDoors > 0 || entryDoors > 0) {
      const enamelGallons = Math.max(1, Math.ceil(garageDoors * 1 + entryDoors * 0.5))
      addItem(
        "Door / garage door enamel",
        `~${enamelGallons} gal`,
        "material",
        "medium"
      )
    }

    addItem(
      "Exterior caulk / patch materials",
      "1 lot",
      "consumable",
      exteriorSummary?.prepLevel === "heavy" ? "high" : "medium"
    )
    addItem(
      "Masking plastic / tape / paper / landscaping protection",
      "1 lot",
      "protection",
      "high"
    )
    addItem(
      "Roller covers / brushes / sanding supplies",
      "1 lot",
      "consumable",
      "high"
    )

    if (
      exteriorSummary?.access === "medium" ||
      exteriorSummary?.access === "high" ||
      (args.photoAnalysis?.detectedAccessIssues?.length ?? 0) > 0
    ) {
      notes.push(
        "Access / landscaping conditions may change protection, ladder, or masking needs."
      )
    }

    if (
      !args.quantityInputs.userMeasuredSqft &&
      !args.quantityInputs.parsedSqft &&
      !exteriorBodySqft
    ) {
      confirmItems.push("Confirm exact exterior body wall square footage before buying paint.")
    }
  } else {
    const estimatedSqft =
      paintSqft ??
      (args.rooms
        ? args.rooms * (args.effectivePaintScope === "walls" ? 380 : 460)
        : null)

    if (estimatedSqft && estimatedSqft > 0) {
      const gallons = Math.max(1, Math.ceil((estimatedSqft * 2) / 325))
      addItem(
        "Interior paint / primer",
        `~${gallons} gal`,
        "material",
        args.quantityInputs.userMeasuredSqft ? "high" : "medium"
      )
    }

    if (args.doors && args.doors > 0) {
      addItem("Door / trim enamel", `for ${args.doors} door(s)`, "material", "medium")
    }

    addItem("Caulk / spackle / filler", "1 lot", "consumable", "medium")
    addItem("Masking plastic / tape / paper", "1 lot", "protection", "high")
    addItem("Roller covers / brushes / sanding supplies", "1 lot", "consumable", "high")
  }
}

  if (args.trade === "flooring") {
    if (floorSqft && floorSqft > 0) {
      addItem("Flooring material", `~${Math.ceil(floorSqft * 1.1)} sqft`, "material", "high")
      addItem("Underlayment", `~${Math.ceil(floorSqft)} sqft`, "material", "medium")
    }

    addItem("Transitions / reducers", "allowance", "hardware", "medium")
    addItem("Floor protection", "1 lot", "protection", "high")

    if (/\b(tile|porcelain|ceramic)\b/.test(s)) {
      addItem("Thinset / mortar", "allowance", "material", "medium")
      addItem("Grout", "allowance", "material", "medium")
      addItem("Spacers / wedges", "1 lot", "consumable", "medium")
    }
  }

  if (args.trade === "drywall") {
    addItem("Drywall / patch material", "allowance", "material", "medium")
    addItem("Joint compound", "allowance", "material", "high")
    addItem("Drywall tape", "1 lot", "consumable", "high")
    addItem("Sanding supplies", "1 lot", "consumable", "high")

    if (/\b(texture|orange\s*peel|knockdown)\b/.test(s)) {
      addItem("Texture material", "allowance", "material", "medium")
    }

    if (/\b(prime|primer|paint)\b/.test(s)) {
      addItem("Primer", "allowance", "material", "medium")
    }
  }

  if (args.trade === "electrical") {
    const breakdown = parseElectricalDeviceBreakdown(args.scopeText)
    if (breakdown?.total) {
      addItem("Electrical devices / fixtures", `${breakdown.total} total`, "material", "high")
    }

    addItem("Wire nuts / connectors / misc electrical hardware", "1 lot", "hardware", "medium")
    addItem("Protection / masking", "1 lot", "protection", "medium")
  }

  if (args.trade === "plumbing" && args.anchorId !== "bathroom_remodel_v1") {
    const breakdown = parsePlumbingFixtureBreakdown(args.scopeText)
    if (breakdown?.total) {
      addItem("Plumbing fixture supplies", `${breakdown.total} fixture set(s)`, "material", "high")
    }

    addItem("Supply lines / stops / seals / misc plumbing hardware", "1 lot", "hardware", "medium")
    addItem("Protection / cleanup materials", "1 lot", "protection", "medium")
  }

  if (args.trade === "carpentry") {
    addItem("Fasteners / adhesive / shims", "1 lot", "hardware", "medium")
    addItem("Surface protection", "1 lot", "protection", "medium")

    const lf = parseLinearFt(args.scopeText)
    if (lf && lf > 0) {
      addItem("Trim / base material", `~${lf} LF`, "material", "high")
    }
  }

  const hasSpecializedItems = items.length > 0

if (args.trade === "general renovation" && !hasSpecializedItems) {
  addItem("General protection materials", "1 lot", "protection", "high")
  addItem("Consumables / misc install materials", "1 lot", "consumable", "medium")
  addItem("Fasteners / misc hardware", "1 lot", "hardware", "medium")
}

  for (const flag of args.photoScopeAssist.missingScopeFlags || []) {
    confirmItems.push(flag)
  }

  if (args.photoAnalysis?.detectedAccessIssues?.length) {
    notes.push("Visible access/protection conditions may affect final shopping list.")
  }

  if (args.splitScopes.length > 1) {
    notes.push("List combines materials implied across split scopes. Verify final selections by trade.")
  }

  return items.length || confirmItems.length || notes.length
    ? {
        items,
        confirmItems: Array.from(new Set(confirmItems)),
        notes: Array.from(new Set(notes)),
      }
    : null
}

type ScopeXRay = {
  detectedScope: {
    primaryTrade: string
    splitScopes: Array<{
      trade: string
      scope: string
    }>
    paintScope: string | null
    state: string
  }
  quantities: Array<{
    label: string
    value: string
    source: QuantitySource
  }>
  pricingMethod: {
    pricingSource: "ai" | "deterministic" | "merged"
    detSource: string | null
    anchorId: string | null
    verified: boolean
    stateAdjusted: boolean
  }
  scheduleLogic: {
    crewDays: number | null
    visits: number | null
    reasons: string[]
  }
  riskFlags: string[]
  needsConfirmation: string[]
}

function buildScopeXRay(args: {
  trade: string
  splitScopes: EstimatorSplitScopeItem[]
  effectivePaintScope: string | null
  rawState: string
  stateAbbrev: string
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
  anchorId: string | null
  priceGuardVerified: boolean
  usedNationalBaseline: boolean
  rooms: number | null
  doors: number | null
  quantityInputs: {
    userMeasuredSqft: number | null
    parsedSqft: number | null
    photoWallSqft: number | null
    photoCeilingSqft: number | null
    photoFloorSqft: number | null
    effectiveFloorSqft: number | null
    effectiveWallSqft: number | null
    effectivePaintSqft: number | null
  }
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  photoAnalysis: EstimatorPhotoAnalysis | null
  scopeSignals?: EstimatorScopeSignals | null
  complexityProfile: EstimatorComplexityProfile | null
  tradeStack: EstimatorTradeStack | null
  schedule: EstimatorScheduleBlock
}): EstimatorScopeXRay {
  const quantities: ScopeXRay["quantities"] = []

  const photoJob = args.photoAnalysis?.jobSummary ?? null
  const exteriorSummary = photoJob?.exteriorSummary ?? null

  const exteriorBodySqft = positiveOrNull(
    exteriorSummary?.bodyWallSqft ??
      midpointFromRange(
        args.photoAnalysis?.exteriorSignals?.bodyWallSqftMin,
        args.photoAnalysis?.exteriorSignals?.bodyWallSqftMax
      )
  )

  if (args.quantityInputs.userMeasuredSqft) {
  quantities.push({
    label: "Measured area",
    value: `${args.quantityInputs.userMeasuredSqft} sqft`,
    source: "user",
  })
}

if (
  args.quantityInputs.parsedSqft &&
  args.quantityInputs.parsedSqft !== args.quantityInputs.userMeasuredSqft
) {
  quantities.push({
    label: "Parsed area",
    value: `${args.quantityInputs.parsedSqft} sqft`,
    source: "parsed",
  })
}

if (args.quantityInputs.photoFloorSqft) {
  quantities.push({
    label: "Photo-estimated floor area",
    value: `${args.quantityInputs.photoFloorSqft} sqft`,
    source: "photo",
  })
}

if (args.quantityInputs.photoWallSqft) {
  quantities.push({
    label: "Photo-estimated wall area",
    value: `${args.quantityInputs.photoWallSqft} sqft`,
    source:
      args.photoAnalysis?.jobSummary?.quantitySources?.wallSqft === "reference_scaled"
        ? "photo_reference"
        : "photo",
  })
}
  
  const photoWindows = positiveOrNull(
    exteriorSummary?.windows ?? args.photoAnalysis?.quantitySignals?.windows
  )
  const photoGarageDoors = positiveOrNull(exteriorSummary?.garageDoors)
  const photoEntryDoors = positiveOrNull(exteriorSummary?.entryDoors)

  if (photoWindows) {
    quantities.push({
      label: "Windows visible",
      value: String(photoWindows),
      source: "photo",
    })
  }

  if (photoGarageDoors) {
    quantities.push({
      label: "Garage doors visible",
      value: String(photoGarageDoors),
      source: "photo",
    })
  }

  if (photoEntryDoors) {
    quantities.push({
      label: "Entry doors visible",
      value: String(photoEntryDoors),
      source: "photo",
    })
  }

  const riskFlags = Array.from(
    new Set([
      ...(args.photoScopeAssist.missingScopeFlags || []),
      ...(args.photoAnalysis?.scopeCompletenessFlags || []),
      ...(args.complexityProfile?.permitLikely
        ? ["Permit/inspection coordination may affect cost and timing."]
        : []),
      ...(args.tradeStack?.isMultiTrade
        ? ["Multiple trades require coordination and sequencing."]
        : []),
    ])
  ).slice(0, 8)

  const needsConfirmation: string[] = []

  if (
    !args.quantityInputs.userMeasuredSqft &&
    !args.quantityInputs.parsedSqft &&
    !exteriorBodySqft
  ) {
    needsConfirmation.push("Confirm exact measured quantities before final approval.")
  }

  const scopeBlob = args.splitScopes.map((x) => x.scope).join(" ").toLowerCase()

  const isExteriorPainting =
    args.trade === "painting" &&
    (
      exteriorSummary?.isExterior === true ||
      /\b(exterior|outside|stucco|siding|fascia|soffit|eaves?|garage door|front door)\b/.test(
        scopeBlob
      )
    )

  const needsInteriorTrimFootage =
    !isExteriorPainting &&
    args.splitScopes.some(
      (x) =>
        x.trade === "carpentry" ||
        /\b(baseboard|trim|casing|quarter round|shoe mold)\b/i.test(x.scope)
    ) &&
    !/(\d{1,5})\s*(linear\s*ft|lf|feet)\b/i.test(scopeBlob)

  if (needsInteriorTrimFootage) {
    needsConfirmation.push("Confirm exact baseboard / trim linear footage.")
  }

  if (args.splitScopes.some((x) => /patch|texture|drywall/i.test(x.scope))) {
    needsConfirmation.push("Confirm exact patch / texture extent.")
  }

  if (args.scopeSignals?.needsReturnVisit) {
    needsConfirmation.push("Schedule assumes return visits / phase sequencing.")
  }

  return {
    detectedScope: {
      primaryTrade: args.trade,
      splitScopes: (args.splitScopes || []).map((x) => ({
        trade: x.trade,
        scope: x.scope,
      })),
      paintScope: args.effectivePaintScope,
      state: args.rawState || args.stateAbbrev || "N/A",
    },
    quantities,
    pricingMethod: {
      pricingSource: args.pricingSource,
      detSource: args.detSource,
      anchorId: args.anchorId,
      verified: args.priceGuardVerified,
      stateAdjusted: !args.usedNationalBaseline,
    },
    scheduleLogic: {
      crewDays: args.schedule.crewDays,
      visits: args.schedule.visits,
      reasons: args.schedule.rationale || [],
    },
    riskFlags,
    needsConfirmation: Array.from(new Set(needsConfirmation)).slice(0, 8),
  }
}

function buildAreaScopeBreakdown(args: {
  trade: string
  scopeText: string
  splitScopes: SplitScopeItem[]
  effectivePaintScope: EffectivePaintScope | null
  quantityInputs: ReturnType<typeof getEffectiveQuantityInputs>
  photoAnalysis: PhotoAnalysis | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  complexityProfile: ComplexityProfile | null
}): AreaScopeBreakdown {
  const s = (args.scopeText || "").toLowerCase()

  const job = args.photoAnalysis?.jobSummary ?? null
  const exteriorSummary = job?.exteriorSummary ?? null

  const isExteriorPainting =
    args.trade === "painting" &&
    (
      exteriorSummary?.isExterior === true ||
      /\b(exterior|outside|stucco|siding|fascia|soffit|eaves?|garage door|front door)\b/.test(s)
    )

  const photoExteriorBodySqft = positiveOrNull(
    exteriorSummary?.bodyWallSqft ??
      midpointFromRange(
        args.photoAnalysis?.exteriorSignals?.bodyWallSqftMin,
        args.photoAnalysis?.exteriorSignals?.bodyWallSqftMax
      )
  )

  const interiorTrimWords =
    /\b(baseboard|baseboards|base board|casing|casings|quarter round|shoe mold)\b/.test(s)

  const exteriorTrimWords =
    /\b(eaves?|fascia|soffit|garage door|entry door|front door|window trim|exterior trim)\b/.test(s)

  const trimLf = isExteriorPainting
    ? null
    : parseLinearFt(args.scopeText) ??
      (interiorTrimWords
        ? estimateBaseboardLfFromFloorSqft(args.quantityInputs.effectiveFloorSqft)
        : null)

  const prepDemo: string[] = []
  const protectionSetup: string[] = []
  const materialsDrivers: string[] = []
  const scheduleDrivers: string[] = []
  const missingConfirmations: string[] = []

  if (/\b(demo|demolition|tear\s*out|remove|haul\s*away|dispose)\b/.test(s)) {
    prepDemo.push("Demolition / removal work detected")
  }

  if (/\b(patch|repair|texture|skim|orange peel|knockdown|surface prep|prep|scrape|sand|caulk)\b/.test(s)) {
    prepDemo.push("Surface prep / patch / finish prep detected")
  }

  if (isExteriorPainting) {
    protectionSetup.push("Exterior masking / landscaping / access setup likely required")

    if ((args.photoAnalysis?.detectedAccessIssues?.length ?? 0) > 0) {
      protectionSetup.push("Visible access conditions may increase setup and masking time")
    }
  } else {
    if (
      /\b(mask|masking|protect|protection|cover|containment)\b/.test(s) ||
      (args.photoAnalysis?.detectedAccessIssues?.length ?? 0) > 0
    ) {
      protectionSetup.push("Protection / masking / occupied-space setup likely required")
    }

    if (
      /\b(furniture|occupied|tight access|limited access|clutter)\b/.test(
        [
          ...(args.photoAnalysis?.detectedConditions || []),
          ...(args.photoAnalysis?.detectedAccessIssues || []),
        ].join(" ").toLowerCase()
      )
    ) {
      protectionSetup.push("Access conditions may increase setup / protection time")
    }
  }

  if (!isExteriorPainting && args.quantityInputs.effectiveFloorSqft) {
    materialsDrivers.push(
      `Floor area influencing material quantities: ${args.quantityInputs.effectiveFloorSqft} sqft`
    )
  }

  if (isExteriorPainting) {
    if (photoExteriorBodySqft) {
      materialsDrivers.push(
        `Exterior body wall area influencing coating quantities: ${photoExteriorBodySqft} sqft`
      )
    }

    if (
      exteriorTrimWords ||
      (positiveOrNull(exteriorSummary?.garageDoors) ?? 0) > 0 ||
      (positiveOrNull(exteriorSummary?.entryDoors) ?? 0) > 0
    ) {
      materialsDrivers.push("Exterior trim / eaves / door surfaces included")
    }
  } else {
    if (args.quantityInputs.effectiveWallSqft) {
      materialsDrivers.push(
        `Wall area influencing material quantities: ${args.quantityInputs.effectiveWallSqft} sqft`
      )
    }

    if (args.quantityInputs.effectivePaintSqft && args.trade === "painting") {
      materialsDrivers.push(
        `Paintable area influencing coating quantities: ${args.quantityInputs.effectivePaintSqft} sqft`
      )
    }

    if (trimLf) {
      materialsDrivers.push(`Trim / base footage influencing material quantities: ${trimLf} LF`)
    }

    if (args.effectivePaintScope === "doors_only") {
      materialsDrivers.push("Doors-only paint scope detected")
    } else if (args.effectivePaintScope === "walls_ceilings") {
      materialsDrivers.push("Walls + ceilings paint scope detected")
    } else if (args.effectivePaintScope === "full") {
      materialsDrivers.push("Full interior paint scope detected")
    }
  }

  if (args.complexityProfile?.multiPhase) {
    scheduleDrivers.push("Multi-phase sequencing likely")
  }

  if (args.complexityProfile?.multiTrade) {
    scheduleDrivers.push("Multi-trade coordination likely")
  }

  if (args.complexityProfile?.permitLikely) {
    scheduleDrivers.push("Permit / inspection coordination may affect duration")
  }

  if ((args.photoAnalysis?.detectedDemoNeeds?.length ?? 0) > 0) {
    scheduleDrivers.push("Photo-visible demo / prep conditions may affect production speed")
  }

  if ((args.photoAnalysis?.detectedAccessIssues?.length ?? 0) > 0) {
    scheduleDrivers.push("Photo-visible access constraints may affect schedule")
  }

  if (isExteriorPainting) {
    if (
      !args.quantityInputs.userMeasuredSqft &&
      !args.quantityInputs.parsedSqft &&
      !photoExteriorBodySqft
    ) {
      missingConfirmations.push("Confirm exact exterior body wall square footage")
    }
  } else {
    if (!args.quantityInputs.userMeasuredSqft && !args.quantityInputs.parsedSqft) {
      missingConfirmations.push("Confirm measured square footage")
    }

    if (interiorTrimWords && !trimLf) {
      missingConfirmations.push("Confirm exact trim / baseboard linear footage")
    }
  }

  for (const flag of args.photoScopeAssist.missingScopeFlags || []) {
    missingConfirmations.push(flag)
  }

  return {
    detectedArea: {
      floorSqft: isExteriorPainting ? null : positiveOrNull(args.quantityInputs.effectiveFloorSqft),
      wallSqft: isExteriorPainting
        ? photoExteriorBodySqft
        : positiveOrNull(args.quantityInputs.effectiveWallSqft),
      paintSqft: isExteriorPainting
        ? photoExteriorBodySqft
        : positiveOrNull(args.quantityInputs.effectivePaintSqft),
      trimLf: isExteriorPainting ? null : positiveOrNull(trimLf),
    },
    allowances: {
      prepDemo: Array.from(new Set(prepDemo)),
      protectionSetup: Array.from(new Set(protectionSetup)),
      materialsDrivers: Array.from(new Set(materialsDrivers)),
      scheduleDrivers: Array.from(new Set(scheduleDrivers)),
    },
    missingConfirmations: Array.from(new Set(missingConfirmations)).slice(0, 8),
  }
}

function buildScheduleBlock(args: {
  basis: EstimatorEstimateBasis | null
  cp: EstimatorComplexityProfile | null
  trade: string
  tradeStack: EstimatorTradeStack | null
  scopeText: string
  workDaysPerWeek: 5 | 6 | 7
  photoImpact?: EstimatorPhotoPricingImpact | null
  scopeSignals?: EstimatorScopeSignals | null
}): EstimatorScheduleBlock {
  
  const b = args.basis
  const sched = args.workDaysPerWeek

  const crewDaysRaw = Number(b?.crewDays ?? b?.quantities?.days ?? 0)

let crewDays =
  Number.isFinite(crewDaysRaw) && crewDaysRaw > 0
    ? Math.round(crewDaysRaw * 2) / 2
    : null

if (args.scopeSignals?.needsReturnVisit && crewDays !== null && crewDays < 2) {
  crewDays = 2
}

  const phase = inferPhaseVisitsFromSignals({ scopeText: args.scopeText, cp: args.cp })
  const visits = phase?.visits ? Number(phase.visits) : null

  const cal = crewDays
    ? estimateCalendarDaysRange({
        crewDays,
        cp: args.cp,
        trade: args.trade,
        tradeStack: args.tradeStack,
        scopeText: args.scopeText,
        workDaysPerWeek: sched,
      })
    : null

  return {
  startDate: new Date().toISOString().slice(0, 10),
  crewDays,
  visits,
  calendarDays: cal ? { min: cal.minDays, max: cal.maxDays } : null,
  workDaysPerWeek: sched,
  rationale: cal?.rationale ?? [],
}
}

type PriceGuardStatus =
  | "verified"
  | "deterministic"
  | "adjusted"
  | "review"
  | "ai"

type PriceGuardReport = {
  status: PriceGuardStatus
  confidence: number // 0–99
  pricingSource: "ai" | "deterministic" | "merged"
  appliedRules: string[]
  assumptions: string[]
  warnings: string[]
  details: {
    stateAdjusted: boolean
    stateAbbrev?: string
    rooms?: number | null
    doors?: number | null
    paintScope?: string | null
    anchorId?: string | null
    detSource?: string | null
    priceGuardAnchorStrict?: boolean
  }
}

function clampConfidence(n: number) {
  const x = Math.round(n)
  return Math.max(0, Math.min(99, x))
}

function buildPriceGuardReport(args: {
  pricingSource: "ai" | "deterministic" | "merged"
  priceGuardVerified: boolean
  priceGuardAnchorStrict: boolean
  stateAbbrev: string
  rooms: number | null
  doors: number | null
  measurements: any | null
  effectivePaintScope: string | null
  anchorId: string | null
  detSource: string | null
  usedNationalBaseline: boolean
}): EstimatorPriceGuardReport {
  const appliedRules: string[] = []
  const assumptions: string[] = []
  const warnings: string[] = []

  let score = 100

  const stateAdjusted = !args.usedNationalBaseline && !!args.stateAbbrev

  if (args.pricingSource === "deterministic") {
    appliedRules.push("Deterministic pricing engine applied")
    score -= args.priceGuardVerified ? 2 : 8
  } else if (args.pricingSource === "merged") {
    appliedRules.push("PriceGuard safety floor enforced (AI merged with PriceGuard baseline)")
    score -= 10
  } else {
    score -= 40
    warnings.push("Pricing relied primarily on AI due to scope ambiguity or missing quantities.")
  }

  if (!stateAdjusted) {
    score -= 10
    assumptions.push("State not selected — used national baseline labor rates.")
  } else {
    appliedRules.push("State labor adjustment applied")
  }

  const hasDoors = typeof args.doors === "number" && args.doors > 0
  const hasRooms = typeof args.rooms === "number" && args.rooms > 0
  const hasMeas = !!(args.measurements?.totalSqft && args.measurements.totalSqft > 0)

  if (hasDoors) appliedRules.push("Door quantity detected")
  if (hasRooms) appliedRules.push("Room quantity detected")
  if (hasMeas) appliedRules.push("User measurements used")

  if (args.pricingSource === "ai" && !hasDoors && !hasRooms && !hasMeas) {
    score -= 30
    warnings.push("No explicit quantities detected (doors/rooms/sqft). Add quantities for stronger pricing protection.")
  }

  if (args.effectivePaintScope === "doors_only") {
    appliedRules.push("Doors-only scope classification enforced")
    score += 4
  }
  if (hasDoors && hasRooms) {
    appliedRules.push("Mixed scope resolved deterministically (rooms + doors)")
    score += 4
  }

  if (args.anchorId) {
    appliedRules.push(`Pricing anchor applied: ${args.anchorId}`)
    score += 6
  }

  if (hasMeas) score += 6

  score = clampConfidence(score)

  let status: PriceGuardStatus = "ai"
  if (args.priceGuardVerified && args.pricingSource === "deterministic") status = "verified"
  else if (args.pricingSource === "deterministic") status = "deterministic"
  else if (args.pricingSource === "merged") status = "adjusted"
  else status = score >= 70 ? "review" : "ai"

  return {
    status,
    confidence: score,
    pricingSource: args.pricingSource,
    appliedRules,
    assumptions,
    warnings,
    details: {
  stateAdjusted,
  stateAbbrev: args.stateAbbrev || undefined,
  rooms: args.rooms,
  doors: args.doors,
  paintScope: args.effectivePaintScope,
  anchorId: args.anchorId,
  detSource: args.detSource,
  priceGuardAnchorStrict: args.priceGuardAnchorStrict,
},
  }
}

type PricingUnit =
  | "sqft"
  | "linear_ft"
  | "rooms"
  | "doors"
  | "fixtures"
  | "devices"
  | "days"
  | "lump_sum"

type EstimateBasis = {
  units: PricingUnit[]                 // 1–3 items
  quantities: Partial<Record<PricingUnit, number>>
  laborRate: number                    // hourly
  hoursPerUnit?: number                // optional when unit-based
  crewDays?: number                    // optional when days-based
  mobilization: number
  assumptions: string[]
}

type AIResponse = {
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  trade: string
  description: string
  pricing: Pricing
  estimateBasis?: EstimateBasis        // ✅ internal-only, optional
}

type PhotoInput = {
  name: string
  dataUrl: string
  roomTag?: string
  shotType?:
    | "overview"
    | "corner"
    | "wall"
    | "ceiling"
    | "floor"
    | "fixture"
    | "damage"
    | "measurement"
  note?: string
  reference?: {
    kind?: "none" | "custom"
    label?: string
    realWidthIn?: number | null
  }
}

type PhotoFinding = {
  photoName: string
  roomTag: string
  shotType:
    | "overview"
    | "corner"
    | "wall"
    | "ceiling"
    | "floor"
    | "fixture"
    | "damage"
    | "measurement"

  areaType:
    | "exterior_front"
    | "exterior_rear"
    | "exterior_side"
    | "interior_room"
    | "bathroom"
    | "kitchen"
    | "hallway"
    | "ceiling"
    | "floor"
    | "detail"
    | "unknown"

  detectedRoomType: string | null
  detectedTrade: string | null
  detectedMaterials: string[]
  detectedConditions: string[]
  detectedFixtures: string[]
  detectedAccessIssues: string[]
  detectedDemoNeeds: string[]
  complexityFlags: string[]

  quantitySignals: {
    doors?: number | null
    windows?: number | null
    vanities?: number | null
    toilets?: number | null
    sinks?: number | null
    outlets?: number | null
    switches?: number | null
    recessedLights?: number | null
    cabinets?: number | null
    appliances?: number | null

    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null

    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
    estimatedTrimLfMin?: number | null
    estimatedTrimLfMax?: number | null

    estimateMethod?: "reference_scaled" | "visual_guess" | "count_based" | null
  }

  scaleSignals: {
    referenceProvided: boolean
    referenceVisible: boolean | null
    referenceSamePlane: boolean | null
    referenceUsable: boolean | null
    scaleConfidence: "low" | "medium" | "high" | null
    referenceLabel: string | null
    referenceRealWidthIn: number | null
  }

  exteriorSignals?: {
    isExterior?: boolean | null
    stories?: 1 | 2 | 3 | null
    substrate?: "stucco" | "siding" | "mixed" | "unknown" | null
    access?: "low" | "medium" | "high" | null
    trimComplexity?: "low" | "medium" | "high" | null
    prepLevel?: "light" | "medium" | "heavy" | null
    garageDoors?: number | null
    entryDoors?: number | null
    windows?: number | null
    bodyWallSqftMin?: number | null
    bodyWallSqftMax?: number | null
  }

  scopeCompletenessFlags: string[]
  reasoning: string[]
  confidence: "low" | "medium" | "high"
}

type QuantityEstimateMethod = "reference_scaled" | "visual_guess" | "count_based"

type QuantitySource =
  | "user"
  | "parsed"
  | "photo"
  | "photo_reference"
  | "estimated"

type RangeCandidate = {
  min: number | null
  max: number | null
  confidence: "low" | "medium" | "high"
  shotType: PhotoFinding["shotType"]
  estimateMethod: QuantityEstimateMethod | null
  referenceUsable: boolean
  referenceSamePlane: boolean
}

type PhotoJobSummary = {
  probableArea:
    | "exterior_house"
    | "interior_room"
    | "bathroom"
    | "kitchen"
    | "mixed"
    | "unknown"

  detectedTrades: string[]
  detectedRoomTypes: string[]
  detectedMaterials: string[]
  detectedConditions: string[]
  detectedFixtures: string[]
  detectedAccessIssues: string[]
  detectedDemoNeeds: string[]
  complexityFlags: string[]

  mergedQuantities: {
    doors: number | null
    windows: number | null
    vanities: number | null
    toilets: number | null
    sinks: number | null
    outlets: number | null
    switches: number | null
    recessedLights: number | null
    cabinets: number | null
    appliances: number | null

    wallSqft: number | null
    ceilingSqft: number | null
    floorSqft: number | null
    trimLf: number | null
  }

  quantitySources: {
    wallSqft: QuantityEstimateMethod | null
    ceilingSqft: QuantityEstimateMethod | null
    floorSqft: QuantityEstimateMethod | null
    trimLf: QuantityEstimateMethod | null
  }

  exteriorSummary: {
    isExterior: boolean
    stories: 1 | 2 | 3 | null
    substrate: "stucco" | "siding" | "mixed" | "unknown" | null
    access: "low" | "medium" | "high" | null
    trimComplexity: "low" | "medium" | "high" | null
    prepLevel: "light" | "medium" | "heavy" | null
    garageDoors: number | null
    entryDoors: number | null
    windows: number | null
    bodyWallSqft: number | null
  }

  pricingDrivers: string[]
  missingViews: string[]
  confidenceScore: number
}

type PhotoAnalysis = {
  summary?: string
  observations?: string[]
  suggestedScopeNotes?: string[]

  detectedRoomTypes?: string[]
  detectedTrades?: string[]
  detectedMaterials?: string[]
  detectedConditions?: string[]
  detectedFixtures?: string[]
  detectedAccessIssues?: string[]
  detectedDemoNeeds?: string[]

  quantitySignals?: {
    doors?: number | null
    windows?: number | null
    vanities?: number | null
    toilets?: number | null
    sinks?: number | null
    outlets?: number | null
    switches?: number | null
    recessedLights?: number | null
    cabinets?: number | null
    appliances?: number | null

    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null

    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
    estimatedTrimLfMin?: number | null
    estimatedTrimLfMax?: number | null
  }

  exteriorSignals?: {
    isExterior?: boolean | null
    stories?: 1 | 2 | 3 | null
    substrate?: "stucco" | "siding" | "mixed" | "unknown" | null
    access?: "low" | "medium" | "high" | null
    trimComplexity?: "low" | "medium" | "high" | null
    prepLevel?: "light" | "medium" | "heavy" | null
    garageDoors?: number | null
    entryDoors?: number | null
    windows?: number | null
    bodyWallSqftMin?: number | null
    bodyWallSqftMax?: number | null
  }

  tradeSignals?: {
    flooringType?: string[]
    electricalScope?: string[]
    plumbingScope?: string[]
    drywallScope?: string[]
    carpentryScope?: string[]
    remodelScope?: string[]
  }

  scopeCompletenessFlags?: string[]
  confidence?: "low" | "medium" | "high"

  // NEW
  perPhoto?: PhotoFinding[]
  jobSummary?: PhotoJobSummary | null
}

function getDataUrlMime(dataUrl: string): string | null {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,/i)
  return m?.[1]?.toLowerCase() ?? null
}

function getBase64Payload(dataUrl: string): string {
  const idx = String(dataUrl || "").indexOf(",")
  return idx >= 0 ? dataUrl.slice(idx + 1) : ""
}

function estimateBase64DecodedBytes(dataUrl: string): number {
  const payload = getBase64Payload(dataUrl).replace(/\s/g, "")
  if (!payload) return 0

  const padding =
    payload.endsWith("==") ? 2 :
    payload.endsWith("=") ? 1 :
    0

  return Math.floor((payload.length * 3) / 4) - padding
}

function sanitizePhotoInputs(photos: unknown): PhotoInput[] {
  if (!Array.isArray(photos)) return []

  const cleaned: PhotoInput[] = []

  for (const raw of photos.slice(0, MAX_PHOTOS)) {
    const name =
      typeof (raw as any)?.name === "string" && (raw as any).name.trim()
        ? (raw as any).name.trim().slice(0, 120)
        : "photo"

    const dataUrl =
      typeof (raw as any)?.dataUrl === "string"
        ? (raw as any).dataUrl.trim()
        : ""

    if (!dataUrl.startsWith("data:image/")) continue

    const mime = getDataUrlMime(dataUrl)
    if (!mime || !ALLOWED_PHOTO_MIME.has(mime)) continue

    const bytes = estimateBase64DecodedBytes(dataUrl)
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_PHOTO_BYTES) continue

    const roomTag =
      typeof (raw as any)?.roomTag === "string"
        ? (raw as any).roomTag.trim().slice(0, 40)
        : ""

    const shotTypeRaw =
      typeof (raw as any)?.shotType === "string"
        ? (raw as any).shotType.trim()
        : "overview"

    const shotType: PhotoInput["shotType"] =
      shotTypeRaw === "overview" ||
      shotTypeRaw === "corner" ||
      shotTypeRaw === "wall" ||
      shotTypeRaw === "ceiling" ||
      shotTypeRaw === "floor" ||
      shotTypeRaw === "fixture" ||
      shotTypeRaw === "damage" ||
      shotTypeRaw === "measurement"
        ? shotTypeRaw
        : "overview"

    const note =
      typeof (raw as any)?.note === "string"
        ? (raw as any).note.trim().slice(0, 240)
        : ""

    const refRaw = (raw as any)?.reference

const hasCustomReference =
  refRaw &&
  typeof refRaw === "object" &&
  refRaw.kind === "custom" &&
  Number.isFinite(Number(refRaw.realWidthIn)) &&
  Number(refRaw.realWidthIn) > 0

const reference: PhotoInput["reference"] = hasCustomReference
  ? {
      kind: "custom",
      label:
        typeof refRaw.label === "string"
          ? refRaw.label.trim().slice(0, 40)
          : "",
      realWidthIn: Number(refRaw.realWidthIn),
    }
  : undefined

cleaned.push({
  name,
  dataUrl,
  roomTag,
  shotType,
  note,
  ...(reference ? { reference } : {}),
})
  }

  return cleaned
}

function buildPhotoContext(photos: PhotoInput[] | null | undefined): string {
  if (!photos || photos.length === 0) return ""

  const counts = {
    overview: 0,
    corner: 0,
    ceiling: 0,
    floor: 0,
    damage: 0,
    measurement: 0,
  }

  for (const photo of photos) {
    if (photo.shotType === "overview") counts.overview += 1
    if (photo.shotType === "corner") counts.corner += 1
    if (photo.shotType === "ceiling") counts.ceiling += 1
    if (photo.shotType === "floor") counts.floor += 1
    if (photo.shotType === "damage") counts.damage += 1
    if (photo.shotType === "measurement") counts.measurement += 1
  }

  const checklist = [
    `overview: ${counts.overview >= 1 ? "yes" : "no"}`,
    `opposite corners: ${counts.corner >= 2 ? "yes" : "no"}`,
    `ceiling: ${counts.ceiling >= 1 ? "yes" : "no"}`,
    `floor: ${counts.floor >= 1 ? "yes" : "no"}`,
    `damage/detail: ${counts.damage >= 1 ? "yes" : "no"}`,
    `measurement shot: ${counts.measurement >= 1 ? "yes" : "no"}`,
  ]

  const lines = photos.map((photo, index) => {
  const roomTag = photo.roomTag?.trim() || "unspecified room"
  const shotType = photo.shotType || "overview"
  const note = photo.note?.trim() || ""

  const parts = [
    `Photo ${index + 1}:`,
    `- room tag: ${roomTag}`,
    `- shot type: ${shotType}`,
  ]

  if (note) {
    parts.push(`- note: ${note}`)
  }

  if (
    photo.reference?.kind === "custom" &&
    photo.reference?.label?.trim() &&
    typeof photo.reference.realWidthIn === "number" &&
    Number.isFinite(photo.reference.realWidthIn)
  ) {
    parts.push(
      `- measurement reference: ${photo.reference.label.trim()} = ${photo.reference.realWidthIn} in`
    )
  }

  return parts.join("\n")
})

  return [
    "PHOTO METADATA",
    checklist.join(" | "),
    "",
    ...lines,
  ].join("\n")
}

type AnchorResult = {
  id: string
  pricing: Pricing
}

type AnchorContext = {
  scope: string
  trade: string
  stateMultiplier: number
  measurements: any | null
  rooms: number | null
  doors: number | null
  photoWallSqft?: number | null
  photoCeilingSqft?: number | null
  photoFloorSqft?: number | null
}

type PricingAnchor = {
  id: string
  when: (ctx: AnchorContext) => boolean
  price: (ctx: AnchorContext) => Pricing | null
}

// -----------------------------
// HELPERS
// -----------------------------
function uniqStrings(arr: string[], max = 20): string[] {
  return Array.from(new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))).slice(0, max)
}

function safeMaxInt(...values: Array<number | null | undefined>): number | null {
  const nums = values
    .map((x) => (Number.isFinite(Number(x)) ? Number(x) : null))
    .filter((x): x is number => x !== null && x > 0)

  return nums.length ? Math.max(...nums.map((x) => Math.round(x))) : null
}

function positiveOrNull(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function midpointFromRange(min?: number | null, max?: number | null): number | null {
  const a = Number.isFinite(Number(min)) ? Number(min) : null
  const b = Number.isFinite(Number(max)) ? Number(max) : null

  if (a && b) return Math.round((a + b) / 2)
  if (a) return Math.round(a)
  if (b) return Math.round(b)
  return null
}

function rangeMid(min?: number | null, max?: number | null) {
  const a = Number.isFinite(Number(min)) ? Number(min) : null
  const b = Number.isFinite(Number(max)) ? Number(max) : null
  if (a != null && b != null) return Math.round((a + b) / 2)
  if (a != null) return Math.round(a)
  if (b != null) return Math.round(b)
  return null
}

function rangeSpread(min?: number | null, max?: number | null) {
  const a = Number.isFinite(Number(min)) ? Number(min) : null
  const b = Number.isFinite(Number(max)) ? Number(max) : null
  if (a != null && b != null) return Math.abs(b - a)
  return 9999
}

function scoreRangeCandidate(c: RangeCandidate) {
  let score = 0

  if (c.estimateMethod === "reference_scaled") score += 8
  if (c.referenceUsable) score += 5
  if (c.referenceSamePlane) score += 4
  if (c.shotType === "measurement") score += 3

  if (c.confidence === "high") score += 3
  else if (c.confidence === "medium") score += 1

  const spread = rangeSpread(c.min, c.max)
  if (spread <= 30) score += 2
  else if (spread >= 120) score -= 2

  return score
}

function pickBestRangeValue(candidates: RangeCandidate[]): number | null {
  const valid = candidates.filter((c) => rangeMid(c.min, c.max) != null)
  if (!valid.length) return null

  const sorted = [...valid].sort(
    (a, b) => scoreRangeCandidate(b) - scoreRangeCandidate(a)
  )

  const topScore = scoreRangeCandidate(sorted[0])
  const top = sorted
    .filter((c) => scoreRangeCandidate(c) >= topScore - 2)
    .slice(0, 3)

  const mids = top
    .map((c) => rangeMid(c.min, c.max))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)

  if (!mids.length) return null

  return mids[Math.floor(mids.length / 2)]
}

function pickBestRangeMethod(
  candidates: RangeCandidate[]
): QuantityEstimateMethod | null {
  const valid = candidates.filter((c) => rangeMid(c.min, c.max) != null)
  if (!valid.length) return null

  const sorted = [...valid].sort(
    (a, b) => scoreRangeCandidate(b) - scoreRangeCandidate(a)
  )

  return sorted[0]?.estimateMethod ?? null
}

function pickHighestAreaType(findings: PhotoFinding[]): PhotoJobSummary["probableArea"] {
  if (findings.some((f) => f.exteriorSignals?.isExterior)) return "exterior_house"
  if (findings.some((f) => f.areaType === "bathroom")) return "bathroom"
  if (findings.some((f) => f.areaType === "kitchen")) return "kitchen"
  if (findings.some((f) => f.areaType === "interior_room")) return "interior_room"

  const distinct = new Set(findings.map((f) => f.areaType))
  if (distinct.size > 1) return "mixed"

  return "unknown"
}

function mergePhotoFindings(findings: PhotoFinding[]): PhotoJobSummary | null {
  if (!findings.length) return null

  const detectedTrades = uniqStrings(findings.flatMap((f) => (f.detectedTrade ? [f.detectedTrade] : [])), 8)
  const detectedRoomTypes = uniqStrings(findings.flatMap((f) => (f.detectedRoomType ? [f.detectedRoomType] : [])), 8)
  const detectedMaterials = uniqStrings(findings.flatMap((f) => f.detectedMaterials || []), 16)
  const detectedConditions = uniqStrings(findings.flatMap((f) => f.detectedConditions || []), 16)
  const detectedFixtures = uniqStrings(findings.flatMap((f) => f.detectedFixtures || []), 16)
  const detectedAccessIssues = uniqStrings(findings.flatMap((f) => f.detectedAccessIssues || []), 12)
  const detectedDemoNeeds = uniqStrings(findings.flatMap((f) => f.detectedDemoNeeds || []), 12)
  const complexityFlags = uniqStrings(findings.flatMap((f) => f.complexityFlags || []), 12)

  const probableArea = pickHighestAreaType(findings)

  const wallCandidates: RangeCandidate[] = findings.map((f) => ({
  min:
    f.quantitySignals?.estimatedWallSqftMin ??
    f.exteriorSignals?.bodyWallSqftMin ??
    null,
  max:
    f.quantitySignals?.estimatedWallSqftMax ??
    f.exteriorSignals?.bodyWallSqftMax ??
    null,
  confidence: f.confidence,
  shotType: f.shotType,
  estimateMethod: f.quantitySignals?.estimateMethod ?? null,
  referenceUsable: f.scaleSignals?.referenceUsable === true,
  referenceSamePlane: f.scaleSignals?.referenceSamePlane === true,
}))

const ceilingCandidates: RangeCandidate[] = findings.map((f) => ({
  min: f.quantitySignals?.estimatedCeilingSqftMin ?? null,
  max: f.quantitySignals?.estimatedCeilingSqftMax ?? null,
  confidence: f.confidence,
  shotType: f.shotType,
  estimateMethod: f.quantitySignals?.estimateMethod ?? null,
  referenceUsable: f.scaleSignals?.referenceUsable === true,
  referenceSamePlane: f.scaleSignals?.referenceSamePlane === true,
}))

const floorCandidates: RangeCandidate[] = findings.map((f) => ({
  min: f.quantitySignals?.estimatedFloorSqftMin ?? null,
  max: f.quantitySignals?.estimatedFloorSqftMax ?? null,
  confidence: f.confidence,
  shotType: f.shotType,
  estimateMethod: f.quantitySignals?.estimateMethod ?? null,
  referenceUsable: f.scaleSignals?.referenceUsable === true,
  referenceSamePlane: f.scaleSignals?.referenceSamePlane === true,
}))

const trimCandidates: RangeCandidate[] = findings.map((f) => ({
  min: f.quantitySignals?.estimatedTrimLfMin ?? null,
  max: f.quantitySignals?.estimatedTrimLfMax ?? null,
  confidence: f.confidence,
  shotType: f.shotType,
  estimateMethod: f.quantitySignals?.estimateMethod ?? null,
  referenceUsable: f.scaleSignals?.referenceUsable === true,
  referenceSamePlane: f.scaleSignals?.referenceSamePlane === true,
}))

const wallSqft = pickBestRangeValue(wallCandidates)
const ceilingSqft = pickBestRangeValue(ceilingCandidates)
const floorSqft = pickBestRangeValue(floorCandidates)
const trimLf = pickBestRangeValue(trimCandidates)

  const shotTypes = new Set(findings.map((f) => f.shotType))
  const missingViews: string[] = []

  if (probableArea === "exterior_house") {
    if (!findings.some((f) => f.areaType === "exterior_front")) missingViews.push("Front elevation not clearly shown")
    if (!findings.some((f) => f.areaType === "exterior_rear")) missingViews.push("Rear elevation not clearly shown")
    if (!findings.some((f) => f.areaType === "exterior_side")) missingViews.push("Side elevation not clearly shown")
  }

  if (!shotTypes.has("measurement")) {
    missingViews.push("No measurement reference photo provided")
  }

  if (!shotTypes.has("damage") && detectedConditions.length > 0) {
    missingViews.push("Condition closeups could improve confidence")
  }

  const isExterior = findings.some((f) => f.exteriorSignals?.isExterior === true)

  const exteriorStories = safeMaxInt(...findings.map((f) => f.exteriorSignals?.stories ?? null)) as 1 | 2 | 3 | null

  const exteriorSubstrates = uniqStrings(
    findings
      .map((f) => f.exteriorSignals?.substrate)
      .filter(Boolean) as string[],
    4
  )

  const substrate =
    exteriorSubstrates.length === 0
      ? null
      : exteriorSubstrates.length === 1
      ? (exteriorSubstrates[0] as "stucco" | "siding" | "mixed" | "unknown")
      : "mixed"

  const accessValues = uniqStrings(
    findings
      .map((f) => f.exteriorSignals?.access)
      .filter(Boolean) as string[],
    4
  )

  const trimComplexityValues = uniqStrings(
    findings
      .map((f) => f.exteriorSignals?.trimComplexity)
      .filter(Boolean) as string[],
    4
  )

  const prepValues = uniqStrings(
    findings
      .map((f) => f.exteriorSignals?.prepLevel)
      .filter(Boolean) as string[],
    4
  )

  const access =
    accessValues.includes("high") ? "high" :
    accessValues.includes("medium") ? "medium" :
    accessValues.includes("low") ? "low" :
    null

  const trimComplexity =
    trimComplexityValues.includes("high") ? "high" :
    trimComplexityValues.includes("medium") ? "medium" :
    trimComplexityValues.includes("low") ? "low" :
    null

  const prepLevel =
    prepValues.includes("heavy") ? "heavy" :
    prepValues.includes("medium") ? "medium" :
    prepValues.includes("light") ? "light" :
    null

  const pricingDrivers: string[] = []

  if (isExterior) pricingDrivers.push("Exterior setup, masking, and elevation access should affect labor")
  if (exteriorStories && exteriorStories >= 2) pricingDrivers.push("Two-story height likely increases labor and setup")
  if ((safeMaxInt(...findings.map((f) => f.quantitySignals?.windows ?? null), ...findings.map((f) => f.exteriorSignals?.windows ?? null)) ?? 0) >= 8) {
    pricingDrivers.push("Higher window count likely increases cut-in and masking time")
  }
  if (detectedConditions.length > 0) pricingDrivers.push("Visible condition/prep issues should affect labor")
  if (detectedAccessIssues.length > 0) pricingDrivers.push("Visible access constraints should affect setup and production speed")
  if (detectedDemoNeeds.length > 0) pricingDrivers.push("Visible demo/removal needs should affect labor and disposal")
  if (complexityFlags.length > 0) pricingDrivers.push("Visible complexity should affect labor and schedule")

  const confidenceBase =
    findings.reduce((sum, f) => {
      if (f.confidence === "high") return sum + 1
      if (f.confidence === "medium") return sum + 0.7
      return sum + 0.4
    }, 0) / findings.length

  const confidencePenalty = Math.min(0.35, missingViews.length * 0.08)
  const confidenceScore = Math.max(20, Math.min(98, Math.round((confidenceBase - confidencePenalty) * 100)))

  return {
    probableArea,
    detectedTrades,
    detectedRoomTypes,
    detectedMaterials,
    detectedConditions,
    detectedFixtures,
    detectedAccessIssues,
    detectedDemoNeeds,
    complexityFlags,
    mergedQuantities: {
      doors: safeMaxInt(...findings.map((f) => f.quantitySignals?.doors ?? null)),
      windows: safeMaxInt(
        ...findings.map((f) => f.quantitySignals?.windows ?? null),
        ...findings.map((f) => f.exteriorSignals?.windows ?? null)
      ),
      vanities: safeMaxInt(...findings.map((f) => f.quantitySignals?.vanities ?? null)),
      toilets: safeMaxInt(...findings.map((f) => f.quantitySignals?.toilets ?? null)),
      sinks: safeMaxInt(...findings.map((f) => f.quantitySignals?.sinks ?? null)),
      outlets: safeMaxInt(...findings.map((f) => f.quantitySignals?.outlets ?? null)),
      switches: safeMaxInt(...findings.map((f) => f.quantitySignals?.switches ?? null)),
      recessedLights: safeMaxInt(...findings.map((f) => f.quantitySignals?.recessedLights ?? null)),
      cabinets: safeMaxInt(...findings.map((f) => f.quantitySignals?.cabinets ?? null)),
      appliances: safeMaxInt(...findings.map((f) => f.quantitySignals?.appliances ?? null)),
      wallSqft,
      ceilingSqft,
      floorSqft,
      trimLf,
    },
    quantitySources: {
  wallSqft: pickBestRangeMethod(wallCandidates),
  ceilingSqft: pickBestRangeMethod(ceilingCandidates),
  floorSqft: pickBestRangeMethod(floorCandidates),
  trimLf: pickBestRangeMethod(trimCandidates),
},
    exteriorSummary: {
      isExterior,
      stories: exteriorStories,
      substrate,
      access,
      trimComplexity,
      prepLevel,
      garageDoors: safeMaxInt(...findings.map((f) => f.exteriorSignals?.garageDoors ?? null)),
      entryDoors: safeMaxInt(...findings.map((f) => f.exteriorSignals?.entryDoors ?? null)),
      windows: safeMaxInt(...findings.map((f) => f.exteriorSignals?.windows ?? null)),
      bodyWallSqft: safeMaxInt(
        ...findings.map((f) =>
          midpointFromRange(
            f.exteriorSignals?.bodyWallSqftMin,
            f.exteriorSignals?.bodyWallSqftMax
          )
        )
      ),
    },
    pricingDrivers: uniqStrings(pricingDrivers, 10),
    missingViews: uniqStrings(missingViews, 8),
    confidenceScore,
  }
}

async function analyzeJobPhotos(args: {
  photos: PhotoInput[]
  scopeText: string
  trade: string
}): Promise<PhotoAnalysis | null> {
  const safePhotos = sanitizePhotoInputs(args.photos)
  if (!safePhotos.length) return null

  const cleanStrings = (value: any, max = 10) =>
    Array.isArray(value)
      ? value
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: string) => x.trim())
          .slice(0, max)
      : []

  const safeNum = (value: any) =>
    Number.isFinite(Number(value)) ? Number(value) : null

  const safeInt = (value: any) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.round(n) : null
  }

  const safeConfidence = (
    value: any
  ): "low" | "medium" | "high" =>
    value === "high" || value === "medium" ? value : "low"

  const safeCeilingHeight = (
    value: any
  ): "standard" | "tall" | "vaulted" | null =>
    value === "standard" || value === "tall" || value === "vaulted"
      ? value
      : null

  const safeStories = (value: any): 1 | 2 | 3 | null =>
    value === 1 || value === 2 || value === 3 ? value : null

  const safeExteriorSubstrate = (
    value: any
  ): "stucco" | "siding" | "mixed" | "unknown" | null =>
    value === "stucco" ||
    value === "siding" ||
    value === "mixed" ||
    value === "unknown"
      ? value
      : null

  const safeExteriorAccess = (
    value: any
  ): "low" | "medium" | "high" | null =>
    value === "low" || value === "medium" || value === "high"
      ? value
      : null

  const safeTrimComplexity = (
    value: any
  ): "low" | "medium" | "high" | null =>
    value === "low" || value === "medium" || value === "high"
      ? value
      : null

  const safePrepLevel = (
    value: any
  ): "light" | "medium" | "heavy" | null =>
    value === "light" || value === "medium" || value === "heavy"
      ? value
      : null

  const safeEstimateMethod = (
  value: any
): QuantityEstimateMethod | null =>
  value === "reference_scaled" ||
  value === "visual_guess" ||
  value === "count_based"
    ? value
    : null

  const safeScaleConfidence = (
  value: any
): "low" | "medium" | "high" | null =>
  value === "low" || value === "medium" || value === "high"
    ? value
    : null

  async function analyzeSinglePhoto(photo: PhotoInput): Promise<PhotoFinding> {
    const referenceMeta =
  photo.reference?.kind === "custom" &&
  typeof photo.reference?.realWidthIn === "number" &&
  Number.isFinite(photo.reference.realWidthIn)
    ? `
- referenceKind: custom
- referenceLabel: ${photo.reference.label || "reference"}
- referenceRealWidthIn: ${photo.reference.realWidthIn}`
    : ""

    const content: any[] = [
      {
        type: "text",
        text: `
You are analyzing ONE contractor job site photo for estimating support.

Return ONLY valid JSON with this exact shape:
{
  "areaType": "exterior_front | exterior_rear | exterior_side | interior_room | bathroom | kitchen | hallway | ceiling | floor | detail | unknown",
  "detectedRoomType": "bathroom | kitchen | hallway | bedroom | living room | exterior | unknown | null",
  "detectedTrade": "painting | drywall | flooring | carpentry | plumbing | electrical | general renovation | null",
  "detectedMaterials": ["..."],
  "detectedConditions": ["..."],
  "detectedFixtures": ["..."],
  "detectedAccessIssues": ["..."],
  "detectedDemoNeeds": ["..."],
  "complexityFlags": ["..."],
  "quantitySignals": {
    "doors": null,
    "windows": null,
    "vanities": null,
    "toilets": null,
    "sinks": null,
    "outlets": null,
    "switches": null,
    "recessedLights": null,
    "cabinets": null,
    "appliances": null,
    "ceilingHeightCategory": null,
    "estimatedWallSqftMin": null,
    "estimatedWallSqftMax": null,
    "estimatedCeilingSqftMin": null,
    "estimatedCeilingSqftMax": null,
    "estimatedFloorSqftMin": null,
    "estimatedFloorSqftMax": null,
    "estimatedTrimLfMin": null,
    "estimatedTrimLfMax": null,
    "estimateMethod": null
},
"scaleSignals": {
  "referenceProvided": false,
  "referenceVisible": null,
  "referenceSamePlane": null,
  "referenceUsable": null,
  "scaleConfidence": null,
  "referenceLabel": null,
  "referenceRealWidthIn": null
 },
  "exteriorSignals": {
    "isExterior": null,
    "stories": null,
    "substrate": null,
    "access": null,
    "trimComplexity": null,
    "prepLevel": null,
    "garageDoors": null,
    "entryDoors": null,
    "windows": null,
    "bodyWallSqftMin": null,
    "bodyWallSqftMax": null
  },
  "scopeCompletenessFlags": ["..."],
  "reasoning": ["..."],
  "confidence": "low | medium | high"
}

Rules:
- Analyze ONLY this one photo.
- Be conservative.
- Do not invent hidden conditions.
- Use the user metadata heavily: roomTag, shotType, note, reference.
- A custom reference is a scale clue, not a guarantee.
- Use null instead of guessing when uncertain.
- Use short contractor-style phrases.
- No markdown.
- No extra text.
- If a custom reference is provided, first decide whether the reference object is actually visible in the image.
- Only use the reference for scale when the reference appears to be on the same plane or a very similar depth plane as the target surface.
- If the reference is usable, set:
  - scaleSignals.referenceProvided = true
  - scaleSignals.referenceVisible = true
  - scaleSignals.referenceSamePlane = true or false
  - scaleSignals.referenceUsable = true
  - quantitySignals.estimateMethod = "reference_scaled"
- If the reference is not visible or not usable for scale:
  - keep referenceUsable = false
  - set estimateMethod = "visual_guess" or "count_based"
- Use tighter min/max ranges when reference scaling is usable.
- Use wider ranges or null when the reference is weak, distorted, angled, or on a different plane.
- Never pretend the reference gives exact measurements.

Global scope:
${args.scopeText}

Primary trade:
${args.trade}

Photo metadata:
- name: ${photo.name || "photo"}
- roomTag: ${photo.roomTag || "unknown"}
- shotType: ${photo.shotType || "overview"}
- note: ${photo.note?.trim() || "not provided"}${referenceMeta}
        `.trim(),
      },
      {
        type: "image_url",
        image_url: {
          url: photo.dataUrl,
        },
      },
    ]

    const resp = await openai.chat.completions.create({
      model: PHOTO_ANALYSIS_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content,
        },
      ],
    })

    const raw = resp.choices[0]?.message?.content?.trim()
    const parsed = raw ? JSON.parse(raw) : {}

    const q = parsed?.quantitySignals ?? {}
    const ex = parsed?.exteriorSignals ?? {}
    const scale = parsed?.scaleSignals ?? {}

    return {
      photoName: photo.name || "photo",
      roomTag: photo.roomTag || "",
      shotType: photo.shotType || "overview",
      areaType:
        parsed?.areaType === "exterior_front" ||
        parsed?.areaType === "exterior_rear" ||
        parsed?.areaType === "exterior_side" ||
        parsed?.areaType === "interior_room" ||
        parsed?.areaType === "bathroom" ||
        parsed?.areaType === "kitchen" ||
        parsed?.areaType === "hallway" ||
        parsed?.areaType === "ceiling" ||
        parsed?.areaType === "floor" ||
        parsed?.areaType === "detail"
          ? parsed.areaType
          : "unknown",
      detectedRoomType:
        typeof parsed?.detectedRoomType === "string" && parsed.detectedRoomType.trim()
          ? parsed.detectedRoomType.trim()
          : null,
      detectedTrade:
        typeof parsed?.detectedTrade === "string" && parsed.detectedTrade.trim()
          ? parsed.detectedTrade.trim()
          : null,
      detectedMaterials: cleanStrings(parsed?.detectedMaterials, 10),
      detectedConditions: cleanStrings(parsed?.detectedConditions, 10),
      detectedFixtures: cleanStrings(parsed?.detectedFixtures, 10),
      detectedAccessIssues: cleanStrings(parsed?.detectedAccessIssues, 8),
      detectedDemoNeeds: cleanStrings(parsed?.detectedDemoNeeds, 8),
      complexityFlags: cleanStrings(parsed?.complexityFlags, 8),
      quantitySignals: {
  doors: safeInt(q?.doors),
  windows: safeInt(q?.windows),
  vanities: safeInt(q?.vanities),
  toilets: safeInt(q?.toilets),
  sinks: safeInt(q?.sinks),
  outlets: safeInt(q?.outlets),
  switches: safeInt(q?.switches),
  recessedLights: safeInt(q?.recessedLights),
  cabinets: safeInt(q?.cabinets),
  appliances: safeInt(q?.appliances),
  ceilingHeightCategory: safeCeilingHeight(q?.ceilingHeightCategory),
  estimatedWallSqftMin: safeNum(q?.estimatedWallSqftMin),
  estimatedWallSqftMax: safeNum(q?.estimatedWallSqftMax),
  estimatedCeilingSqftMin: safeNum(q?.estimatedCeilingSqftMin),
  estimatedCeilingSqftMax: safeNum(q?.estimatedCeilingSqftMax),
  estimatedFloorSqftMin: safeNum(q?.estimatedFloorSqftMin),
  estimatedFloorSqftMax: safeNum(q?.estimatedFloorSqftMax),
  estimatedTrimLfMin: safeNum(q?.estimatedTrimLfMin),
  estimatedTrimLfMax: safeNum(q?.estimatedTrimLfMax),
  estimateMethod: safeEstimateMethod(q?.estimateMethod),
},
scaleSignals: {
  referenceProvided:
    typeof scale?.referenceProvided === "boolean"
      ? scale.referenceProvided
      : photo.reference?.kind === "custom",
  referenceVisible:
    typeof scale?.referenceVisible === "boolean"
      ? scale.referenceVisible
      : null,
  referenceSamePlane:
    typeof scale?.referenceSamePlane === "boolean"
      ? scale.referenceSamePlane
      : null,
  referenceUsable:
    typeof scale?.referenceUsable === "boolean"
      ? scale.referenceUsable
      : null,
  scaleConfidence: safeScaleConfidence(scale?.scaleConfidence),
  referenceLabel:
    typeof scale?.referenceLabel === "string" && scale.referenceLabel.trim()
      ? scale.referenceLabel.trim().slice(0, 40)
      : photo.reference?.label?.trim() || null,
  referenceRealWidthIn: safeNum(
    scale?.referenceRealWidthIn ?? photo.reference?.realWidthIn
  ),
},
      exteriorSignals: {
        isExterior: typeof ex?.isExterior === "boolean" ? ex.isExterior : null,
        stories: safeStories(safeInt(ex?.stories)),
        substrate: safeExteriorSubstrate(ex?.substrate),
        access: safeExteriorAccess(ex?.access),
        trimComplexity: safeTrimComplexity(ex?.trimComplexity),
        prepLevel: safePrepLevel(ex?.prepLevel),
        garageDoors: safeInt(ex?.garageDoors),
        entryDoors: safeInt(ex?.entryDoors),
        windows: safeInt(ex?.windows),
        bodyWallSqftMin: safeNum(ex?.bodyWallSqftMin),
        bodyWallSqftMax: safeNum(ex?.bodyWallSqftMax),
      },
      scopeCompletenessFlags: cleanStrings(parsed?.scopeCompletenessFlags, 8),
      reasoning: cleanStrings(parsed?.reasoning, 8),
      confidence: safeConfidence(parsed?.confidence),
    }
  }

  try {
    const perPhoto = await Promise.all(safePhotos.map((photo) => analyzeSinglePhoto(photo)))
    const jobSummary = mergePhotoFindings(perPhoto)

    const summaryTextParts: string[] = []

    if (jobSummary?.probableArea && jobSummary.probableArea !== "unknown") {
      summaryTextParts.push(`Probable job area: ${jobSummary.probableArea.replaceAll("_", " ")}`)
    }

    if (jobSummary?.detectedTrades?.length) {
      summaryTextParts.push(`Visible trades/signals: ${jobSummary.detectedTrades.join(", ")}`)
    }

    if (jobSummary?.detectedConditions?.length) {
      summaryTextParts.push(`Visible conditions: ${jobSummary.detectedConditions.slice(0, 4).join(", ")}`)
    }

    if (jobSummary?.detectedAccessIssues?.length) {
      summaryTextParts.push(`Access/setup issues: ${jobSummary.detectedAccessIssues.slice(0, 3).join(", ")}`)
    }

    if (jobSummary?.probableArea === "exterior_house" && jobSummary.exteriorSummary.isExterior) {
      const ex = jobSummary.exteriorSummary
      summaryTextParts.push(
        `Exterior signals: ${[
          ex.stories ? `${ex.stories}-story` : null,
          ex.substrate ? ex.substrate : null,
          ex.access ? `access ${ex.access}` : null,
          ex.prepLevel ? `prep ${ex.prepLevel}` : null,
        ]
          .filter(Boolean)
          .join(", ")}`
      )
    }

    return {
      summary: summaryTextParts.join(". "),
      observations: uniqStrings(perPhoto.flatMap((p) => p.reasoning || []), 10),
      suggestedScopeNotes: uniqStrings(
        [
          ...(jobSummary?.pricingDrivers || []),
          ...(jobSummary?.detectedConditions?.length
            ? ["Include visible prep/repair conditions where applicable."]
            : []),
          ...(jobSummary?.detectedAccessIssues?.length
            ? ["Include masking, protection, and access/setup allowances."]
            : []),
          ...(jobSummary?.probableArea === "exterior_house"
            ? ["Include exterior masking, elevation access, and visible prep conditions."]
            : []),
        ],
        10
      ),

      detectedRoomTypes: jobSummary?.detectedRoomTypes || [],
      detectedTrades: jobSummary?.detectedTrades || [],
      detectedMaterials: jobSummary?.detectedMaterials || [],
      detectedConditions: jobSummary?.detectedConditions || [],
      detectedFixtures: jobSummary?.detectedFixtures || [],
      detectedAccessIssues: jobSummary?.detectedAccessIssues || [],
      detectedDemoNeeds: jobSummary?.detectedDemoNeeds || [],

     quantitySignals: {
  doors: positiveOrNull(jobSummary?.mergedQuantities.doors),
  windows: positiveOrNull(jobSummary?.mergedQuantities.windows),
  vanities: positiveOrNull(jobSummary?.mergedQuantities.vanities),
  toilets: positiveOrNull(jobSummary?.mergedQuantities.toilets),
  sinks: positiveOrNull(jobSummary?.mergedQuantities.sinks),
  outlets: positiveOrNull(jobSummary?.mergedQuantities.outlets),
  switches: positiveOrNull(jobSummary?.mergedQuantities.switches),
  recessedLights: positiveOrNull(jobSummary?.mergedQuantities.recessedLights),
  cabinets: positiveOrNull(jobSummary?.mergedQuantities.cabinets),
  appliances: positiveOrNull(jobSummary?.mergedQuantities.appliances),
  ceilingHeightCategory: null,
  estimatedWallSqftMin: positiveOrNull(jobSummary?.mergedQuantities.wallSqft),
  estimatedWallSqftMax: positiveOrNull(jobSummary?.mergedQuantities.wallSqft),
  estimatedCeilingSqftMin: positiveOrNull(jobSummary?.mergedQuantities.ceilingSqft),
  estimatedCeilingSqftMax: positiveOrNull(jobSummary?.mergedQuantities.ceilingSqft),
  estimatedFloorSqftMin: positiveOrNull(jobSummary?.mergedQuantities.floorSqft),
  estimatedFloorSqftMax: positiveOrNull(jobSummary?.mergedQuantities.floorSqft),
  estimatedTrimLfMin: positiveOrNull(jobSummary?.mergedQuantities.trimLf),
  estimatedTrimLfMax: positiveOrNull(jobSummary?.mergedQuantities.trimLf),
},

exteriorSignals: {
  isExterior: jobSummary?.exteriorSummary.isExterior ?? null,
  stories: jobSummary?.exteriorSummary.stories ?? null,
  substrate: jobSummary?.exteriorSummary.substrate ?? null,
  access: jobSummary?.exteriorSummary.access ?? null,
  trimComplexity: jobSummary?.exteriorSummary.trimComplexity ?? null,
  prepLevel: jobSummary?.exteriorSummary.prepLevel ?? null,
  garageDoors: positiveOrNull(jobSummary?.exteriorSummary.garageDoors),
  entryDoors: positiveOrNull(jobSummary?.exteriorSummary.entryDoors),
  windows: positiveOrNull(jobSummary?.exteriorSummary.windows),
  bodyWallSqftMin: positiveOrNull(jobSummary?.exteriorSummary.bodyWallSqft),
  bodyWallSqftMax: positiveOrNull(jobSummary?.exteriorSummary.bodyWallSqft),
},

      tradeSignals: {
        flooringType: [],
        electricalScope: [],
        plumbingScope: [],
        drywallScope: [],
        carpentryScope: [],
        remodelScope: [],
      },

      scopeCompletenessFlags: uniqStrings(
        [
          ...perPhoto.flatMap((p) => p.scopeCompletenessFlags || []),
          ...(jobSummary?.missingViews || []),
        ],
        10
      ),
      confidence:
        (jobSummary?.confidenceScore ?? 0) >= 80
          ? "high"
          : (jobSummary?.confidenceScore ?? 0) >= 55
          ? "medium"
          : "low",

      perPhoto,
      jobSummary,
    }
  } catch (err) {
    console.warn("Photo analysis failed:", err)
    return null
  }
}

type PhotoPricingImpact = {
  laborDelta: number
  materialsDelta: number
  subsDelta: number
  extraCrewDays: number
  confidenceBoost: number
  reasons: string[]
}

type EstimateExplanation = {
  priceReasons: string[]
  scheduleReasons: string[]
  photoReasons: string[]
  protectionReasons: string[]
}

type PhotoPacketScore = {
  score: number
  strengths: string[]
  missingShots: string[]
}

type EstimateMode = "photo_only" | "photo_assisted" | "measurement_required"

type PricingPolicy = "allow" | "allow_with_warning" | "block"

type MissingInputKey =
  | "measurements"
  | "floor_sqft"
  | "wall_sqft"
  | "paint_sqft"
  | "room_count"
  | "door_count"
  | "fixture_count"
  | "device_count"
  | "linear_ft"
  | "one_wall_length"

type PhotoEstimateDecision = {
  estimateMode: EstimateMode
  pricingPolicy: PricingPolicy
  pricingAllowed: boolean
  confidence: number
  confidenceBand: "low" | "medium" | "high"
  missingInputs: MissingInputKey[]
  reasons: string[]
  blockers: string[]
}

function scorePhotoPacket(photos: PhotoInput[]): PhotoPacketScore {
  if (!photos.length) {
    return {
      score: 0,
      strengths: [],
      missingShots: ["No photos uploaded"],
    }
  }

  const shotTypes = new Set(photos.map((p) => p.shotType || "overview"))
  const roomTags = new Set(
    photos.map((p) => (p.roomTag || "").trim().toLowerCase()).filter(Boolean)
  )

  let score = 40
  const strengths: string[] = []
  const missingShots: string[] = []

  if (shotTypes.has("overview")) {
    score += 15
    strengths.push("Has overview photo")
  } else {
    missingShots.push("Add at least 1 overview photo")
  }

  if (shotTypes.has("wall") || shotTypes.has("corner")) {
    score += 15
    strengths.push("Has wall/corner coverage")
  } else {
    missingShots.push("Add wall or corner shots")
  }

  if (shotTypes.has("floor")) {
    score += 8
    strengths.push("Has floor coverage")
  }

  if (shotTypes.has("ceiling")) {
    score += 8
    strengths.push("Has ceiling coverage")
  }

  if (shotTypes.has("fixture")) {
    score += 8
    strengths.push("Has fixture/detail coverage")
  }

  if (shotTypes.has("damage")) {
    score += 6
    strengths.push("Has condition/damage closeups")
  }

  if (shotTypes.has("measurement")) {
    score += 10
    strengths.push("Has measurement-oriented shot")
  } else {
    missingShots.push("Add a measurement/reference shot")
  }

  if (roomTags.size >= 1) {
    score += 5
    strengths.push("Rooms are tagged")
  } else {
    missingShots.push("Tag each photo to a room")
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    strengths,
    missingShots: missingShots.slice(0, 6),
  }
}

function derivePhotoPricingImpact(args: {
  analysis: PhotoAnalysis | null
  trade: string
  scopeText: string
}): PhotoPricingImpact {
  const job = args.analysis?.jobSummary

  const text = [
    args.analysis?.summary || "",
    ...(args.analysis?.observations || []),
    ...(args.analysis?.suggestedScopeNotes || []),
    ...(job?.detectedConditions || []),
    ...(job?.detectedAccessIssues || []),
    ...(job?.detectedDemoNeeds || []),
    ...(job?.complexityFlags || []),
    ...(job?.pricingDrivers || []),
    ...(job?.missingViews || []),
  ]
    .join(" ")
    .toLowerCase()

  let laborDelta = 0
  let materialsDelta = 0
  let subsDelta = 0
  let extraCrewDays = 0
  let confidenceBoost = 0
  const reasons: string[] = []

  if (!text.trim()) {
    return {
      laborDelta,
      materialsDelta,
      subsDelta,
      extraCrewDays,
      confidenceBoost,
      reasons,
    }
  }

  if (/\b(peeling|flaking|damaged|patch|repair|crack|water damage|stain|surface damage|failed caulk)\b/.test(text)) {
    laborDelta += 200
    materialsDelta += 60
    confidenceBoost += 4
    reasons.push("Visible prep and surface correction conditions")
  }

  if (/\b(masking|protection|occupied|furnished|tight working area|tight access|limited access|obstruction|clutter|landscaping|narrow side yard)\b/.test(text)) {
    laborDelta += 150
    subsDelta += 100
    extraCrewDays += 0.5
    confidenceBoost += 3
    reasons.push("Visible access and protection complexity")
  }

  if (/\b(debris|demo|demolition|tear-out|haul away|disposal|finish removal)\b/.test(text)) {
    subsDelta += 175
    extraCrewDays += 0.5
    confidenceBoost += 3
    reasons.push("Visible demo or disposal handling")
  }

  if (job?.exteriorSummary?.isExterior) {
    laborDelta += 150
    reasons.push("Exterior setup and masking conditions")
  }

  if ((job?.exteriorSummary?.stories ?? 0) >= 2) {
    laborDelta += 225
    subsDelta += 100
    extraCrewDays += 0.5
    reasons.push("Two-story elevation access")
  }

  if ((job?.exteriorSummary?.windows ?? 0) >= 8) {
    laborDelta += 100
    reasons.push("Higher exterior window count increases cut-in and masking time")
  }

  if (job?.exteriorSummary?.prepLevel === "heavy") {
    laborDelta += 250
    materialsDelta += 80
    reasons.push("Heavy visible prep conditions")
  } else if (job?.exteriorSummary?.prepLevel === "medium") {
    laborDelta += 125
    materialsDelta += 40
    reasons.push("Moderate visible prep conditions")
  }

  if (job?.confidenceScore && job.confidenceScore >= 80) confidenceBoost += 2
  else if (job?.confidenceScore && job.confidenceScore >= 55) confidenceBoost += 1

  return {
    laborDelta: Math.round(laborDelta),
    materialsDelta: Math.round(materialsDelta),
    subsDelta: Math.round(subsDelta),
    extraCrewDays,
    confidenceBoost: Math.min(10, confidenceBoost),
    reasons,
  }
}

function buildPhotoScopeAssist(args: {
  photoAnalysis: PhotoAnalysis | null
  scopeText: string
  trade: string
}): {
  missingScopeFlags: string[]
  suggestedAdditions: string[]
} {
  const scope = (args.scopeText || "").toLowerCase()
  const photo = args.photoAnalysis
  const job = photo?.jobSummary

  const missingScopeFlags: string[] = []
  const suggestedAdditions: string[] = []

  if (!photo || !job) {
    return { missingScopeFlags, suggestedAdditions }
  }

  const mentionsCeiling = /\b(ceiling|ceilings)\b/.test(scope)
  const mentionsTrim = /\b(trim|baseboard|baseboards|casing|casings)\b/.test(scope)
  const mentionsProtection = /\b(protect|protection|mask|masking|cover)\b/.test(scope)
  const mentionsDemo = /\b(demo|demolition|remove|tear\s*out)\b/.test(scope)
  const mentionsExteriorPrep = /\b(scrape|sand|prep|caulk|patch|repair)\b/.test(scope)

  if (
    (job.mergedQuantities.ceilingSqft || 0) > 0 &&
    job.detectedRoomTypes.some((x) => /bathroom|kitchen|bedroom|living|hall/i.test(x)) &&
    !mentionsCeiling &&
    args.trade === "painting"
  ) {
    missingScopeFlags.push("Photos suggest ceiling work may exist but scope does not mention it.")
    suggestedAdditions.push("Add ceiling prep/paint if applicable.")
  }

  if ((job.mergedQuantities.trimLf || 0) > 0 && !mentionsTrim) {
    missingScopeFlags.push("Visible trim/baseboards may not be included in the written scope.")
    suggestedAdditions.push("Add trim/baseboard/casing scope if applicable.")
  }

  if (job.detectedAccessIssues.length > 0 && !mentionsProtection) {
    missingScopeFlags.push("Photos show access/protection conditions not clearly addressed in scope.")
    suggestedAdditions.push("Add masking, furniture protection, landscaping protection, or access handling language.")
  }

  const strongDemoSignals = (job.detectedDemoNeeds || []).some((x) =>
  /\b(demo|demolition|tear[-\s]*out|remove|removal|haul|disposal|replace wood|rot)\b/i.test(x)
)

if (strongDemoSignals && !mentionsDemo) {
  missingScopeFlags.push("Photos suggest demo/removal work may be needed.")
  suggestedAdditions.push("Add demolition/removal/disposal scope if applicable.")
}

  const strongExteriorSignal =
  job.probableArea === "exterior_house" && job.exteriorSummary.isExterior

if (strongExteriorSignal && !mentionsExteriorPrep && args.trade === "painting") {
  suggestedAdditions.push(
    "Include visible exterior prep such as scraping, sanding, patching, caulking, and masking where applicable."
  )
}

for (const flag of job.missingViews || []) {
  missingScopeFlags.push(flag)
}

for (const driver of job.pricingDrivers || []) {
  if (!/exterior/i.test(driver) || strongExteriorSignal) {
    suggestedAdditions.push(driver)
  }
}

  return {
    missingScopeFlags: Array.from(new Set(missingScopeFlags)).slice(0, 8),
    suggestedAdditions: Array.from(new Set(suggestedAdditions)).slice(0, 8),
  }
}

function buildPhotoQuantityHints(photoAnalysis: PhotoAnalysis | null): string {
  const job = photoAnalysis?.jobSummary
  if (!job) return ""

  const q = job.mergedQuantities
  const lines: string[] = []

  if (q.wallSqft) lines.push(`Estimated wall area from photos: ${q.wallSqft} sqft`)
  if (q.ceilingSqft) lines.push(`Estimated ceiling area from photos: ${q.ceilingSqft} sqft`)
  if (q.floorSqft) lines.push(`Estimated floor area from photos: ${q.floorSqft} sqft`)
  if (q.trimLf) lines.push(`Estimated trim/base footage from photos: ${q.trimLf} LF`)

  if (q.doors) lines.push(`Doors visible across photo set: ${q.doors}`)
  if (q.windows) lines.push(`Windows visible across photo set: ${q.windows}`)
  if (q.outlets) lines.push(`Outlets visible across photo set: ${q.outlets}`)
  if (q.switches) lines.push(`Switches visible across photo set: ${q.switches}`)
  if (q.recessedLights) lines.push(`Recessed lights visible across photo set: ${q.recessedLights}`)
  if (q.vanities) lines.push(`Vanities visible across photo set: ${q.vanities}`)
  if (q.toilets) lines.push(`Toilets visible across photo set: ${q.toilets}`)
  if (q.sinks) lines.push(`Sinks visible across photo set: ${q.sinks}`)
  if (q.cabinets) lines.push(`Cabinets visible across photo set: ${q.cabinets}`)
  if (q.appliances) lines.push(`Appliances visible across photo set: ${q.appliances}`)

  return lines.length ? lines.map((x) => `- ${x}`).join("\n") : ""
}

function buildExteriorPhotoHints(photoAnalysis: PhotoAnalysis | null): string {
  const ex = photoAnalysis?.jobSummary?.exteriorSummary
  if (!ex?.isExterior) return ""

  const lines: string[] = []

  lines.push("Exterior job detected from photos.")
  if (ex.stories) lines.push(`Stories: ${ex.stories}`)
  if (ex.substrate) lines.push(`Substrate: ${ex.substrate}`)
  if (ex.access) lines.push(`Access difficulty: ${ex.access}`)
  if (ex.trimComplexity) lines.push(`Trim complexity: ${ex.trimComplexity}`)
  if (ex.prepLevel) lines.push(`Prep level: ${ex.prepLevel}`)
  if (typeof ex.garageDoors === "number") lines.push(`Garage doors: ${ex.garageDoors}`)
  if (typeof ex.entryDoors === "number") lines.push(`Entry doors: ${ex.entryDoors}`)
  if (typeof ex.windows === "number") lines.push(`Windows: ${ex.windows}`)
  if (typeof ex.bodyWallSqft === "number") lines.push(`Estimated exterior body wall area: ${ex.bodyWallSqft} sqft`)

  return lines.map((x) => `- ${x}`).join("\n")
}

function midpoint(min?: number | null, max?: number | null): number | null {
  const a = Number(min || 0)
  const b = Number(max || 0)

  if (a > 0 && b > 0) return Math.round((a + b) / 2)
  if (a > 0) return Math.round(a)
  if (b > 0) return Math.round(b)

  return null
}

function getPhotoEstimatedSqft(photoAnalysis: PhotoAnalysis | null): {
  wallSqft: number | null
  ceilingSqft: number | null
  floorSqft: number | null
} {
  const job = photoAnalysis?.jobSummary
  if (job) {
    return {
      wallSqft: job.mergedQuantities.wallSqft ?? null,
      ceilingSqft: job.mergedQuantities.ceilingSqft ?? null,
      floorSqft: job.mergedQuantities.floorSqft ?? null,
    }
  }

  const q = photoAnalysis?.quantitySignals
  const ex = photoAnalysis?.exteriorSignals

  return {
    wallSqft:
      midpointFromRange(q?.estimatedWallSqftMin, q?.estimatedWallSqftMax) ??
      midpointFromRange(ex?.bodyWallSqftMin, ex?.bodyWallSqftMax),
    ceilingSqft: midpointFromRange(q?.estimatedCeilingSqftMin, q?.estimatedCeilingSqftMax),
    floorSqft: midpointFromRange(q?.estimatedFloorSqftMin, q?.estimatedFloorSqftMax),
  }
}

function getEffectiveQuantityInputs(args: {
  measurements: any | null
  scopeText: string
  photoAnalysis: PhotoAnalysis | null
}) {
  const parsedSqft = parseSqft(args.scopeText)
  const photoSqft = getPhotoEstimatedSqft(args.photoAnalysis)
  const quantitySources = args.photoAnalysis?.jobSummary?.quantitySources

  const userMeasuredSqft =
    args.measurements?.totalSqft && Number(args.measurements.totalSqft) > 0
      ? Number(args.measurements.totalSqft)
      : null

  return {
    userMeasuredSqft,
    parsedSqft,

    photoWallSqft: photoSqft.wallSqft,
    photoCeilingSqft: photoSqft.ceilingSqft,
    photoFloorSqft: photoSqft.floorSqft,

    photoWallSqftSource: quantitySources?.wallSqft ?? null,
    photoCeilingSqftSource: quantitySources?.ceilingSqft ?? null,
    photoFloorSqftSource: quantitySources?.floorSqft ?? null,
    photoTrimLfSource: quantitySources?.trimLf ?? null,

    effectiveFloorSqft:
      userMeasuredSqft ??
      parsedSqft ??
      photoSqft.floorSqft ??
      null,

    effectiveWallSqft:
      userMeasuredSqft ??
      parsedSqft ??
      photoSqft.wallSqft ??
      null,

    effectivePaintSqft:
      userMeasuredSqft ??
      parsedSqft ??
      photoSqft.wallSqft ??
      null,
  }
}

function clampScore100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function hasAnyPositive(values: Array<number | null | undefined>) {
  return values.some((v) => Number.isFinite(Number(v)) && Number(v) > 0)
}

function isPhotoFriendlyTrade(trade: string) {
  const t = (trade || "").toLowerCase()
  return (
    t === "painting" ||
    t === "flooring" ||
    t === "drywall" ||
    t === "carpentry" ||
    t === "electrical" ||
    t === "plumbing"
  )
}

function isMeasurementHeavyTrade(args: {
  trade: string
  scopeText: string
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
}) {
  const t = (args.trade || "").toLowerCase()
  const s = (args.scopeText || "").toLowerCase()
  const cp = args.complexityProfile

  if (cp?.class === "remodel" || cp?.class === "complex") return true
  if (cp?.multiTrade || args.tradeStack?.isMultiTrade) return true
  if (t === "general renovation") return true

  if (
    /\b(remodel|renovation|gut|rebuild|rough[-\s]*in|relocat(e|ion|ing)|move\s+(drain|supply|valve|line)|panel|service\s*upgrade)\b/.test(
      s
    )
  ) {
    return true
  }

  return false
}

function hasUsablePhotoQuantities(args: {
  trade: string
  scopeText: string
  rooms: number | null
  doors: number | null
  quantityInputs: ReturnType<typeof getEffectiveQuantityInputs>
  photoAnalysis: PhotoAnalysis | null
}) {
  const t = (args.trade || "").toLowerCase()
  const q = args.quantityInputs
  const job = args.photoAnalysis?.jobSummary ?? null

  const hasPaintQty =
    hasAnyPositive([
      q.effectivePaintSqft,
      q.effectiveWallSqft,
      q.userMeasuredSqft,
      q.parsedSqft,
      args.rooms,
      args.doors,
    ])

  const hasFloorQty = hasAnyPositive([
    q.effectiveFloorSqft,
    q.photoFloorSqft,
    q.userMeasuredSqft,
    q.parsedSqft,
  ])

  const hasDrywallQty = hasAnyPositive([
    q.effectiveWallSqft,
    q.photoWallSqft,
    q.userMeasuredSqft,
    q.parsedSqft,
  ])

  const hasTrimQty =
    hasAnyPositive([
      parseLinearFt(args.scopeText),
      job?.mergedQuantities.trimLf,
      q.effectiveFloorSqft,
    ])

  const hasDeviceQty =
    !!parseElectricalDeviceBreakdown(args.scopeText)?.total ||
    hasAnyPositive([
      job?.mergedQuantities.outlets,
      job?.mergedQuantities.switches,
      job?.mergedQuantities.recessedLights,
    ])

  const hasFixtureQty =
    !!parsePlumbingFixtureBreakdown(args.scopeText)?.total ||
    hasAnyPositive([
      job?.mergedQuantities.toilets,
      job?.mergedQuantities.sinks,
      job?.mergedQuantities.vanities,
    ])

  if (t === "painting") return hasPaintQty
  if (t === "flooring") return hasFloorQty
  if (t === "drywall") return hasDrywallQty
  if (t === "carpentry") return hasTrimQty
  if (t === "electrical") return hasDeviceQty
  if (t === "plumbing") return hasFixtureQty

  return hasAnyPositive([
    q.effectiveFloorSqft,
    q.effectiveWallSqft,
    q.effectivePaintSqft,
    args.rooms,
    args.doors,
  ])
}

function buildPhotoMissingInputs(args: {
  trade: string
  scopeText: string
  rooms: number | null
  doors: number | null
  quantityInputs: ReturnType<typeof getEffectiveQuantityInputs>
  photoAnalysis: PhotoAnalysis | null
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
}): MissingInputKey[] {
  const t = (args.trade || "").toLowerCase()
  const s = (args.scopeText || "").toLowerCase()
  const q = args.quantityInputs
  const job = args.photoAnalysis?.jobSummary ?? null

  const out: MissingInputKey[] = []

  const isExteriorPainting =
    t === "painting" &&
    (
      job?.exteriorSummary?.isExterior === true ||
      /\b(exterior|outside|stucco|siding|fascia|soffit|eaves?|front door|garage door)\b/.test(
        s
      )
    )

  if (isMeasurementHeavyTrade(args)) {
    out.push("measurements")
  }

  if (t === "painting") {
    if (isExteriorPainting) {
      if (!hasAnyPositive([job?.exteriorSummary?.bodyWallSqft, q.userMeasuredSqft, q.parsedSqft])) {
        out.push("wall_sqft")
      }
    } else {
      if (!hasAnyPositive([q.effectivePaintSqft, q.effectiveWallSqft, q.userMeasuredSqft, q.parsedSqft])) {
        if (args.doors && args.doors > 0) out.push("door_count")
        else if (args.rooms && args.rooms > 0) out.push("room_count")
        else out.push("paint_sqft")
      }
    }
  }

  if (t === "flooring") {
    if (!hasAnyPositive([q.effectiveFloorSqft, q.photoFloorSqft, q.userMeasuredSqft, q.parsedSqft])) {
      out.push("floor_sqft")
      out.push("one_wall_length")
    }
  }

  if (t === "drywall") {
    if (!hasAnyPositive([q.effectiveWallSqft, q.photoWallSqft, q.userMeasuredSqft, q.parsedSqft])) {
      out.push("wall_sqft")
    }
  }

  if (t === "carpentry") {
    const lf = parseLinearFt(args.scopeText)
    const photoTrimLf = positiveOrNull(job?.mergedQuantities.trimLf)

    if (!hasAnyPositive([lf, photoTrimLf])) {
      out.push("linear_ft")
      if (!hasAnyPositive([q.effectiveFloorSqft, q.photoFloorSqft])) {
        out.push("one_wall_length")
      }
    }
  }

  if (t === "electrical") {
    const breakdown = parseElectricalDeviceBreakdown(args.scopeText)
    const hasDevices =
      !!breakdown?.total ||
      hasAnyPositive([
        job?.mergedQuantities.outlets,
        job?.mergedQuantities.switches,
        job?.mergedQuantities.recessedLights,
      ])

    if (!hasDevices) out.push("device_count")
  }

  if (t === "plumbing") {
    const breakdown = parsePlumbingFixtureBreakdown(args.scopeText)
    const hasFixtures =
      !!breakdown?.total ||
      hasAnyPositive([
        job?.mergedQuantities.toilets,
        job?.mergedQuantities.sinks,
        job?.mergedQuantities.vanities,
      ])

    if (!hasFixtures) out.push("fixture_count")
  }

  return Array.from(new Set(out)).slice(0, 3) as MissingInputKey[]
}

function buildPhotoEstimateDecision(args: {
  trade: string
  scopeText: string
  rooms: number | null
  doors: number | null
  photosCount: number
  photoPacketScore: PhotoPacketScore
  photoAnalysis: PhotoAnalysis | null
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  quantityInputs: ReturnType<typeof getEffectiveQuantityInputs>
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
}): PhotoEstimateDecision {
  const reasons: string[] = []
  const blockers: string[] = []

  const packetScore = Number(args.photoPacketScore?.score || 0)
  const jobConfidence = Number(args.photoAnalysis?.jobSummary?.confidenceScore || 0)
  const missingViews = args.photoAnalysis?.jobSummary?.missingViews?.length ?? 0
  const missingScopeFlags = args.photoScopeAssist?.missingScopeFlags?.length ?? 0

  const heavyScope = isMeasurementHeavyTrade({
    trade: args.trade,
    scopeText: args.scopeText,
    complexityProfile: args.complexityProfile,
    tradeStack: args.tradeStack,
  })

  const usableQuantities = hasUsablePhotoQuantities({
    trade: args.trade,
    scopeText: args.scopeText,
    rooms: args.rooms,
    doors: args.doors,
    quantityInputs: args.quantityInputs,
    photoAnalysis: args.photoAnalysis,
  })

  const missingInputs = buildPhotoMissingInputs({
    trade: args.trade,
    scopeText: args.scopeText,
    rooms: args.rooms,
    doors: args.doors,
    quantityInputs: args.quantityInputs,
    photoAnalysis: args.photoAnalysis,
    complexityProfile: args.complexityProfile,
    tradeStack: args.tradeStack,
  })

let confidence =
  packetScore > 0 && jobConfidence > 0
    ? Math.round(packetScore * 0.45 + jobConfidence * 0.55)
    : packetScore || jobConfidence || 0

const hasReferenceScaledQty =
  args.photoAnalysis?.jobSummary?.quantitySources?.wallSqft === "reference_scaled" ||
  args.photoAnalysis?.jobSummary?.quantitySources?.floorSqft === "reference_scaled" ||
  args.photoAnalysis?.jobSummary?.quantitySources?.ceilingSqft === "reference_scaled" ||
  args.photoAnalysis?.jobSummary?.quantitySources?.trimLf === "reference_scaled"

if (hasReferenceScaledQty) {
  confidence += 10
  reasons.push("Reference-scaled photo quantities were available.")
}

  if (usableQuantities) confidence += 8
  else confidence -= 10

  if (isPhotoFriendlyTrade(args.trade)) confidence += 4

  if (args.complexityProfile?.class === "medium") confidence -= 6
  if (args.complexityProfile?.class === "complex") confidence -= 14
  if (args.complexityProfile?.class === "remodel") confidence -= 24

  if (args.tradeStack?.isMultiTrade) confidence -= 12

  confidence -= missingViews * 5
  confidence -= missingScopeFlags * 4

  if (args.photosCount <= 0) confidence = 0

  confidence = clampScore100(confidence)

  if (packetScore >= 80) reasons.push("Photo packet coverage is strong.")
  else if (packetScore >= 60) reasons.push("Photo packet coverage is usable but not complete.")
  else if (packetScore > 0) reasons.push("Photo packet coverage is weak.")

  if (usableQuantities) {
    reasons.push("Photos and scope produced usable quantity signals.")
  } else {
    reasons.push("Photos did not produce enough trusted quantities for strong pricing.")
  }

  if (missingViews > 0) {
    reasons.push(`Missing photo coverage detected (${missingViews} missing view item(s)).`)
  }

  if (missingScopeFlags > 0) {
    reasons.push(`Photo scope review found ${missingScopeFlags} missing scope/clarity flag(s).`)
  }

  if (args.tradeStack?.isMultiTrade) {
    reasons.push("Multiple trades were detected, which increases pricing risk.")
  }

  if (args.complexityProfile?.class === "remodel") {
    reasons.push("Remodel-level scope increases hidden-condition risk.")
  }

  if (args.photosCount <= 0) {
    blockers.push("No photos were uploaded.")
  }

  if (!args.photoAnalysis?.jobSummary && args.photosCount > 0) {
    blockers.push("Photos were uploaded but job-level photo analysis was too weak.")
  }

  if (packetScore < 45 && args.photosCount > 0) {
    blockers.push("Photo packet is too weak for reliable pricing.")
  }

  if (heavyScope && !hasAnyPositive([
    args.quantityInputs.userMeasuredSqft,
    args.quantityInputs.parsedSqft,
    args.quantityInputs.effectiveFloorSqft,
    args.quantityInputs.effectiveWallSqft,
  ])) {
    blockers.push("This scope needs measurements because the job is too complex for photo-only pricing.")
  }

  let estimateMode: EstimateMode = "measurement_required"
  let pricingPolicy: PricingPolicy = "block"

  if (blockers.length === 0) {
    if (
      confidence >= 85 &&
      missingInputs.length === 0 &&
      isPhotoFriendlyTrade(args.trade) &&
      !heavyScope
    ) {
      estimateMode = "photo_only"
      pricingPolicy = "allow"
    } else if (
      confidence >= 65 &&
      missingInputs.length <= 2
    ) {
      estimateMode = "photo_assisted"
      pricingPolicy = "allow_with_warning"
    } else {
      estimateMode = "measurement_required"
      pricingPolicy = "block"
    }
  }

  const confidenceBand =
    confidence >= 85 ? "high" :
    confidence >= 65 ? "medium" :
    "low"

  return {
    estimateMode,
    pricingPolicy,
    pricingAllowed: pricingPolicy !== "block",
    confidence,
    confidenceBand,
    missingInputs,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    blockers: Array.from(new Set(blockers)).slice(0, 6),
  }
}

function buildEstimateExplanation(args: {
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
  trade: string
  priceGuardVerified: boolean
  priceGuardProtected: boolean
  photoImpact: EstimatorPhotoPricingImpact | null
  minApplied: boolean
  minAmount?: number | null
  scopeSignals?: EstimatorScopeSignals | null
  complexityProfile: EstimatorComplexityProfile | null
  priceGuard: EstimatorPriceGuardReport
}): EstimatorEstimateExplanation {
  const priceReasons: string[] = []
  const scheduleReasons: string[] = []
  const photoReasons: string[] = []
  const protectionReasons: string[] = []

  if (args.pricingSource === "deterministic") {
  if (args.detSource) {
    priceReasons.push(
      `Price was based on fixed contractor pricing rules for ${args.detSource.replaceAll("_", " ")}.`
    )
  } else {
    priceReasons.push("Price was based on fixed contractor pricing rules for this type of job.")
  }
  } else if (args.pricingSource === "merged") {
  priceReasons.push("Initial AI pricing was adjusted upward where needed to keep the estimate in a safer range.")
} else {
  priceReasons.push("Price was generated from the written scope and interpreted job conditions.")
}

  if (args.photoImpact && args.photoImpact.reasons.length > 0) {
    for (const r of args.photoImpact.reasons) {
      photoReasons.push(r)
      priceReasons.push(`Photos affected pricing: ${r}.`)
    }

    if (args.photoImpact.extraCrewDays > 0) {
      scheduleReasons.push(
        `Photos increased schedule allowance by about ${args.photoImpact.extraCrewDays} crew day(s).`
      )
    }
  }

  if (args.scopeSignals?.needsReturnVisit) {
    scheduleReasons.push(
      args.scopeSignals.reason || "Scope requires at least one return visit."
    )
  }

  if (args.complexityProfile?.permitLikely) {
    scheduleReasons.push("Permit/inspection coordination may extend total duration.")
  }

  if (args.complexityProfile?.multiTrade) {
    scheduleReasons.push("Multiple trades require sequencing and coordination.")
  }

  if (args.complexityProfile?.multiPhase) {
    scheduleReasons.push("Work appears to require multiple phases instead of a single trip.")
  }

  if (args.minApplied) {
    protectionReasons.push(
      `Minimum service charge protection applied${args.minAmount ? ` ($${args.minAmount})` : ""}.`
    )
  }

  if (args.priceGuardProtected) {
    protectionReasons.push("PriceGuard protection was active on this estimate.")
  }

  if (args.priceGuardVerified) {
    protectionReasons.push("Verified deterministic pricing logic was used.")
  }

  for (const rule of args.priceGuard.appliedRules || []) {
    if (
      /minimum service charge|deterministic pricing engine applied|priceguard safety floor|state labor adjustment applied/i.test(rule)
    ) {
      protectionReasons.push(rule)
    }
  }

if (priceReasons.length === 0) {
  priceReasons.push("Pricing was based on the job scope, trade, and typical contractor cost patterns.")
}

if (scheduleReasons.length === 0 && args.complexityProfile?.class !== "simple") {
  scheduleReasons.push("Schedule reflects the expected coordination and execution time for this scope.")
}

if (protectionReasons.length === 0) {
  protectionReasons.push("Estimate includes built-in pricing safeguards to avoid underpricing.")
}

  return {
    priceReasons,
    scheduleReasons,
    photoReasons,
    protectionReasons,
  }
}

function wantsDebug(req: NextRequest) {
  return req.headers.get("x-debug") === "1"
}

async function tryGetCachedResult(args: { email: string; requestId: string }) {
  const { data, error } = await supabase
    .from("generation_results")
    .select("response")
    .eq("email", args.email)
    .eq("request_id", args.requestId)
    .maybeSingle()

  if (error) {
    console.warn("generation_results read failed:", error)
    return null
  }

  return (data?.response ?? null) as any | null
}

async function tryStoreCachedResult(args: { email: string; requestId: string; response: any }) {
  // Best-effort: never fail the request if caching fails
  const { error } = await supabase
    .from("generation_results")
    .insert({
      email: args.email,
      request_id: args.requestId,
      response: args.response,
    })

  if (error) {
    // If it already exists (duplicate key), ignore
    // Supabase/PostgREST typically returns 409 or a PG error code; we just ignore all insert errors here.
    console.warn("generation_results insert failed (ignored):", error)
  }
}

async function respondAndCache(args: {
  email: string
  requestId: string
  payload: any
  status?: number
  cache?: boolean
}) {
  const status = args.status ?? 200
  const cache =
    args.cache ??
    (status >= 200 &&
      status < 300 &&
      args.payload &&
      args.payload.ok !== false &&          // don’t cache {ok:false,...}
      args.payload.code !== "FREE_LIMIT")   // extra belt+suspenders

  if (cache) {
    await tryStoreCachedResult({
      email: args.email,
      requestId: args.requestId,
      response: args.payload,
    })
  }

  return NextResponse.json(args.payload, { status })
}

function enforcePhaseVisitCrewDaysFloor(args: {
  pricing: Pricing
  basis: EstimateBasis | null
  cp: ComplexityProfile | null
  scopeText: string
}): { pricing: Pricing; basis: EstimateBasis | null; applied: boolean; note: string } {
  const cp = args.cp
  const b = args.basis

  if (!cp || !b || !isValidEstimateBasis(b)) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  const hasDaysUnit = Array.isArray(b.units) && b.units.includes("days")
  if (!hasDaysUnit) {
    // If complexity requires days basis, your validator will already flag it.
    // This enforcer only adjusts when days-based basis exists.
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  const { visits, phases } = inferPhaseVisitsFromSignals({
    scopeText: args.scopeText,
    cp,
  })

  // --- Minimum crewDays by visits (and class) ---
  // These are "show-up realism" floors. Keep them conservative but meaningful.
  let minByVisits = 0

  if (visits <= 1) minByVisits = 0
  else if (visits === 2) minByVisits = cp.class === "remodel" || cp.class === "complex" ? 1.5 : 1.0
  else minByVisits = cp.class === "remodel" || cp.class === "complex" ? 2.5 : 2.0

  // If permit/inspection is implied, add a small return-visit allowance
  if (cp.permitLikely || phases.some(p => /permit|inspection/i.test(p))) {
    minByVisits += 0.5
  }

  // Final required min = max(class floor, visit floor)
  const requiredMinCrewDays = Math.max(Number(cp.minCrewDays ?? 0), minByVisits)

  const crewDaysCurrent = Number(b.crewDays ?? b.quantities?.days ?? 0)
  if (!Number.isFinite(crewDaysCurrent) || crewDaysCurrent <= 0) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // If already meets the floor, do nothing
  if (crewDaysCurrent >= requiredMinCrewDays) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // --- Apply bump ---
  const bumpedCrewDays = Math.round(requiredMinCrewDays * 2) / 2 // nearest 0.5
  const laborRate = Number(b.laborRate)

  // crew realism (for labor math)
  const crewSize = Math.max(1, Number(cp.crewSizeMin ?? 1))
  const hrsPerDay = Math.max(5.5, Math.min(8, Number(cp.hoursPerDayEffective ?? 7)))
  const impliedMinLaborHours = bumpedCrewDays * crewSize * hrsPerDay
  const impliedMinLaborDollars = Math.round(impliedMinLaborHours * laborRate)

  const p = coercePricing(args.pricing)

  // bump labor to meet the implied minimum for this many visits/days
  const laborNew = Math.max(Math.round(p.labor || 0), impliedMinLaborDollars)

  // bump subs to account for additional mobilization/returns (stay conservative)
  const subsNew = Math.max(Math.round(p.subs || 0), Number(cp.minSubs ?? 0), Number(cp.minMobilization ?? 0))

  const markupNew = Math.min(25, Math.max(15, Number(p.markup || 20)))
  const base = Math.round(laborNew + Number(p.materials || 0) + subsNew)
  const totalNew = Math.round(base * (1 + markupNew / 100))

  // mutate basis to match
  const basisNew: EstimateBasis = {
    ...b,
    crewDays: bumpedCrewDays,
    quantities: { ...(b.quantities || {}), days: bumpedCrewDays },
    assumptions: Array.isArray(b.assumptions)
      ? [...b.assumptions, `Multi-phase scope implies ~${visits} visit(s) (${phases.slice(0, 3).join(", ") || "sequencing"}); crewDays floor enforced.`]
      : [`Multi-phase scope implies ~${visits} visit(s); crewDays floor enforced.`],
  }

  const pricingNew: Pricing = clampPricing({
    labor: laborNew,
    materials: Number(p.materials || 0),
    subs: subsNew,
    markup: markupNew,
    total: totalNew,
  })

  return {
    pricing: pricingNew,
    basis: basisNew,
    applied: true,
    note: `CrewDays bumped to ${bumpedCrewDays} due to multi-phase sequencing (${visits} visit(s)).`,
  }
}

async function polishDescriptionWith4o(args: {
  description: string
  documentType: string
  trade: string
}): Promise<string> {
  const d = (args.description || "").trim()
  if (!d || d.length < 20) return d

  const polishPrompt = `
You are a licensed U.S. construction project manager rewriting scope language for a formal contract document.

TASK:
Rewrite the following scope description to improve clarity, sequencing language, and contractual tone.

REQUIREMENTS:
- Do NOT change the meaning or scope.
- Do NOT add or remove work.
- Do NOT mention pricing or costs.
- Do NOT introduce guarantees or warranties.
- Avoid vague phrases such as "as needed".
- Avoid banned phrases: ensure, industry standards, quality standards, compliance, durability, aesthetic appeal.
- Keep professional contract-ready tone.
- Preserve sequencing language (demo, prep, coordination, etc).
- Preserve the original level of detail and approximate length (do not shorten).
- Preserve paragraph breaks and any lists/newlines.
- Only improve clarity/contract tone; do not compress.
- Do NOT remove sequencing steps.
- Do NOT merge multiple steps into one sentence.
- Opening sentence must still begin with:
  "This ${args.documentType}"

TRADE:
${args.trade}

SCOPE:
${d}

Return ONLY the rewritten paragraph.
`

  try {
    const resp = await openai.chat.completions.create({
      model: DESCRIPTION_POLISH_MODEL,
      temperature: 0.3,
      messages: [{ role: "user", content: polishPrompt }],
    })

    const out = resp.choices[0]?.message?.content?.trim()
    if (!out || out.length < 20) return d

    // Final safety: preserve opening token
    if (!/^This\s+(Change Order \/ Estimate|Change Order|Estimate)/i.test(out)) {
  return d
}

    return out
  } catch (e) {
    console.warn("4o polish failed — using original description.", e)
    return d
  }
}

function defaultDeterministicDescription(args: {
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  trade: string
  scopeText: string
  jobType?: string | null
}): string {
  const dt = args.documentType
  const t = args.trade
  const s = (args.scopeText || "").trim()

  if (t === "plumbing" && args.jobType === "fixture_swaps") {
    return `This ${dt} covers fixture-level plumbing work as described, including isolation, removal and replacement, reconnection, functional testing, and cleanup. Scope: ${s}`
  }

  if (t === "electrical" && args.jobType === "device_work") {
    return `This ${dt} covers device-level electrical work as described, including replacement/installation of devices, protection of surrounding finishes, testing, and cleanup. Scope: ${s}`
  }

  if (t === "flooring") {
    return `This ${dt} covers flooring installation work as described, including surface preparation, layout, installation, transitions as applicable, and cleanup. Scope: ${s}`
  }

  if (t === "drywall") {
    return `This ${dt} covers drywall repair work as described, including preparation, patching, finishing, and cleanup. Scope: ${s}`
  }

  return `This ${dt} covers the described scope of work as provided, including labor, materials, protection, and cleanup. Scope: ${s}`
}

function cleanupDocumentTypeLead(text: string) {
  return String(text || "")
    .replace(
      /^This\s+Change Order\s*\/\s*Estimate\s*\/\s*Estimate\b/i,
      "This Change Order / Estimate"
    )
    .replace(/^This\s+Estimate\s*\/\s*Estimate\b/i, "This Estimate")
    .replace(/^This\s+Change Order\s*\/\s*Change Order\b/i, "This Change Order")
    .replace(
      /^This\s+Change Order\s*\/\s*Estimate\s*\/\s*Change Order\b/i,
      "This Change Order / Estimate"
    )
    .trim()
}

function syncDescriptionLeadToDocumentType(
  text: string,
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
) {
  let d = String(text || "").trim()
  if (!d) return d

  d = d.replace(
    /^This\s+(?:Change Order \/ Estimate|Change Order|Estimate)(?:\s*\/\s*(?:Change Order \/ Estimate|Change Order|Estimate))?\b/i,
    `This ${documentType}`
  )

  return cleanupDocumentTypeLead(d)
}

function isValidPricing(p: any): p is Pricing {
  return (
    typeof p?.labor === "number" &&
    typeof p?.materials === "number" &&
    typeof p?.subs === "number" &&
    typeof p?.markup === "number" &&
    typeof p?.total === "number"
  )
}

// ✅ Put coercePricing OUTSIDE clampPricing (top-level helper)
function coercePricing(p: any): Pricing {
  return {
    labor: Number(p?.labor ?? 0),
    materials: Number(p?.materials ?? 0),
    subs: Number(p?.subs ?? 0),
    markup: Number(p?.markup ?? 0),
    total: Number(p?.total ?? 0),
  }
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

function applyAiRealism(args: {
  pricing: Pricing
  trade: string
}): Pricing {
  const p = { ...coercePricing(args.pricing) }
  const trade = (args.trade || "").toLowerCase()

  if (p.markup < 12) p.markup = 15
  if (p.markup > 30) p.markup = 25

  switch (trade) {
    case "painting":
      if (p.materials > p.labor * 0.5) p.materials = Math.round(p.labor * 0.35)
      break

    case "flooring":
    case "tile":
      if (p.materials < p.labor * 0.6) p.materials = Math.round(p.labor * 0.8)
      if (p.materials > p.labor * 1.8) p.materials = Math.round(p.labor * 1.4)
      break

    case "electrical":
    case "plumbing":
      if (p.materials > p.labor * 0.75) p.materials = Math.round(p.labor * 0.5)
      break

    case "carpentry":
    case "general renovation":
      if (p.materials < p.labor * 0.4) p.materials = Math.round(p.labor * 0.6)
      break
  }

  const base = p.labor + p.materials
  if (p.subs > base * 0.5) {
    p.subs = Math.round(base * 0.3)
  }

  const totalBase = p.labor + p.materials + p.subs
  p.total = totalBase + Math.round(totalBase * (p.markup / 100))

  return clampPricing(p)
}

function isValidEstimateBasis(b: any): b is EstimateBasis {
  if (!b || typeof b !== "object") return false
  if (!Array.isArray(b.units) || b.units.length < 1 || b.units.length > 3) return false
  if (!b.quantities || typeof b.quantities !== "object") return false
  if (!Number.isFinite(Number(b.laborRate)) || Number(b.laborRate) <= 0) return false
  if (!Number.isFinite(Number(b.mobilization)) || Number(b.mobilization) < 0) return false
  if (!Array.isArray(b.assumptions)) return false
  return true
}

function normalizeEstimateBasisUnits(basis: EstimateBasis): EstimateBasis {
  // Prefer days if present (project-based)
  if (basis.units.includes("days")) {
    const cd = Number(basis.crewDays ?? basis.quantities?.days ?? 0)
    const crewDays = Number.isFinite(cd) && cd > 0 ? cd : 1
    return {
      ...basis,
      units: ["days"],
      crewDays,
      quantities: { ...(basis.quantities || {}), days: crewDays },
      hoursPerUnit: 0,
    }
  }

  // Prefer explicit count units over lump_sum
  const preferred: PricingUnit[] = [
    "sqft",
    "linear_ft",
    "rooms",
    "doors",
    "fixtures",
    "devices",
  ]

  for (const u of preferred) {
    const q = Number(basis.quantities?.[u] ?? 0)
    if (basis.units.includes(u) && Number.isFinite(q) && q > 0) {
      return {
        ...basis,
        units: [u],
        crewDays: undefined,
      }
    }
  }

  // Otherwise force lump_sum
  return {
    ...basis,
    units: ["lump_sum"],
    quantities: { ...(basis.quantities || {}), lump_sum: 1 },
    crewDays: undefined,
  }
}

function syncEstimateBasisMath(args: {
  pricing: Pricing
  basis: EstimateBasis | null
}): EstimateBasis | null {
  const raw = args.basis
  if (!raw || !isValidEstimateBasis(raw)) return raw

  const b = normalizeEstimateBasisUnits(raw)
  const labor = Number(args.pricing?.labor ?? 0)
  const laborRate = Number(b.laborRate ?? 0)

  if (!Number.isFinite(laborRate) || laborRate <= 0) {
    return b
  }

  // Days-based jobs: crewDays is the real driver, so hoursPerUnit should stay 0
  if (b.units.includes("days")) {
    const crewDaysRaw = Number(b.crewDays ?? b.quantities?.days ?? 0)
    const crewDays =
      Number.isFinite(crewDaysRaw) && crewDaysRaw > 0
        ? Math.round(crewDaysRaw * 2) / 2
        : 1

    return {
      ...b,
      crewDays,
      quantities: {
        ...(b.quantities || {}),
        days: crewDays,
      },
      hoursPerUnit: 0,
    }
  }

  const primaryUnit = b.units[0]
  const qty = Number(b.quantities?.[primaryUnit] ?? 0)

  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      ...b,
      hoursPerUnit: 0,
    }
  }

  const impliedLaborHours = labor / laborRate
  const hoursPerUnit = Math.round((impliedLaborHours / qty) * 1000) / 1000

  return {
    ...b,
    hoursPerUnit,
  }
}

function normalizeBasisSafe(basis: any): any {
  return basis && isValidEstimateBasis(basis)
    ? normalizeEstimateBasisUnits(basis)
    : basis
}

function pickLaborRateByTrade(trade: string): number {
  const t = (trade || "").toLowerCase()
  if (t === "electrical") return 115
  if (t === "plumbing") return 125
  if (t === "tile" || t === "flooring") return 95
  if (t === "painting") return 75
  if (t === "drywall") return 70
  if (t === "carpentry") return 90
  return 95 // general renovation default
}

function defaultMobilizationByComplexity(cp: ComplexityProfile | null): number {
  if (!cp) return 250
  return Math.max(0, Number(cp.minMobilization ?? 0))
}

function buildEstimateBasisFallback(args: {
  trade: string
  pricing: Pricing
  parsed: { rooms: number | null; doors: number | null; sqft: number | null }
  complexity: ComplexityProfile | null
}): EstimateBasis {
  const trade = (args.trade || "").toLowerCase()
  const cp = args.complexity
  const p = coercePricing(args.pricing)

  const laborRate = pickLaborRateByTrade(trade)

  // Decide primary unit:
  // 1) If complexity demands days → days
  // 2) Else prefer explicit qty: sqft > doors > rooms
  // 3) Else fallback → lump_sum
  let unit: PricingUnit = "lump_sum"
  if (cp?.requireDaysBasis) unit = "days"
  else if (args.parsed.sqft && args.parsed.sqft > 0) unit = "sqft"
  else if (args.parsed.doors && args.parsed.doors > 0) unit = "doors"
  else if (args.parsed.rooms && args.parsed.rooms > 0) unit = "rooms"
  else unit = "lump_sum"

  const quantities: Partial<Record<PricingUnit, number>> = {}
  if (args.parsed.sqft && args.parsed.sqft > 0) quantities.sqft = args.parsed.sqft
  if (args.parsed.doors && args.parsed.doors > 0) quantities.doors = args.parsed.doors
  if (args.parsed.rooms && args.parsed.rooms > 0) quantities.rooms = args.parsed.rooms

  // If we're forced into "days", ensure days exists.
  // Otherwise if unit is lump_sum, store as 1.
  if (unit === "days") {
    const impliedLaborHours = Math.max(1, Number(p.labor || 0) / laborRate)
    const crewSize = Math.max(1, Number(cp?.crewSizeMin ?? 1))
    const hrsPerDay = Math.max(5.5, Math.min(8, Number(cp?.hoursPerDayEffective ?? 7)))
    const impliedCrewDays = impliedLaborHours / (crewSize * hrsPerDay)

    const minCD = Number(cp?.minCrewDays ?? 0.5)
    const maxCD = Number(cp?.maxCrewDays ?? 25)
    const crewDays = Math.max(minCD, Math.min(maxCD, Math.round(impliedCrewDays * 2) / 2))

    quantities.days = crewDays
  } else if (unit === "lump_sum") {
    quantities.lump_sum = 1
  } else {
    // unit is sqft/doors/rooms but might be missing quantity (if parsing was null)
    const q = Number(quantities[unit] ?? 0)
    if (!Number.isFinite(q) || q <= 0) {
      // if we can't trust quantity, fallback to lump_sum=1
      unit = "lump_sum"
      quantities.lump_sum = 1
    }
  }

  // Derive hoursPerUnit from labor dollars when meaningful
  const impliedLaborHours = Math.max(1, Number(p.labor || 0) / laborRate)

  let hoursPerUnit = 0
  if (unit === "days") {
    // hoursPerUnit doesn't apply well to days; keep 0 and let crewDays speak
    hoursPerUnit = 0
  } else {
    const q = Number(quantities[unit] ?? 1)
    hoursPerUnit = q > 0 ? Math.round((impliedLaborHours / q) * 1000) / 1000 : 0
  }

  const mobilization = Math.max(
    defaultMobilizationByComplexity(cp),
    Number.isFinite(Number(p.subs)) ? Math.min(Math.round(Number(p.subs)), Math.max(150, defaultMobilizationByComplexity(cp))) : defaultMobilizationByComplexity(cp)
  )

  const assumptions: string[] = []
  assumptions.push("Estimate basis auto-generated to enforce consistent pricing math.")
  if (unit === "lump_sum") assumptions.push("Scope lacked explicit quantities; priced as lump sum under mid-market assumptions.")
  if (unit !== "days" && cp?.requireDaysBasis) assumptions.push("Complexity required days basis; crewDays derived from labor dollars and class minimums.")
  if (cp?.permitLikely) assumptions.push("Permit/inspection coordination may require additional scheduling/returns depending on jurisdiction.")

  const out: EstimateBasis = {
    units: [unit],
    quantities,
    laborRate,
    hoursPerUnit,
    crewDays: unit === "days" ? Number(quantities.days ?? 0) : undefined,
    mobilization,
    assumptions,
  }

  return out
}

function normalizePricingMath(p: Pricing): Pricing {
  const labor = Math.round(Number(p?.labor ?? 0))
  const materials = Math.round(Number(p?.materials ?? 0))
  const subs = Math.round(Number(p?.subs ?? 0))

  // if markup comes as 0.2 meaning 20%, fix it
  let markup = Number(p?.markup ?? 20)
  if (markup > 0 && markup <= 1) markup = markup * 100
  markup = Math.min(25, Math.max(15, Math.round(markup)))

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return clampPricing({ labor, materials, subs, markup, total })
}

function enforceEstimateBasis(args: {
  trade: string
  pricing: Pricing
  basis: any
  parsed: { rooms: number | null; doors: number | null; sqft: number | null }
  complexity: ComplexityProfile | null
}): EstimateBasis {
  const b = args.basis
  if (isValidEstimateBasis(b)) return b

  return buildEstimateBasisFallback({
    trade: args.trade,
    pricing: args.pricing,
    parsed: args.parsed,
    complexity: args.complexity,
  })
}

function approxEqual(a: number, b: number, pct = 0.08) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (b === 0) return a === 0
  return Math.abs(a - b) / Math.abs(b) <= pct
}

function computePermitCoordinationAllowance(args: {
  trade: string
  cp: ComplexityProfile | null
}): { dollars: number; note: string } {
  const t = (args.trade || "").toLowerCase()
  const cp = args.cp

  if (!cp?.permitLikely) return { dollars: 0, note: "" }

  // Conservative, mid-market allowances (not permit fees themselves; coordination + return visits)
  // NOTE: We keep it simple and forgiving to avoid overpricing.
  let dollars = 0

  if (t === "electrical") dollars = 650
  else if (t === "plumbing") dollars = 550
  else if (t === "general renovation") dollars = 750
  else dollars = 450

  // Complex/remodel tends to need more admin/coordination/returns
  if (cp.class === "complex") dollars += 250
  if (cp.class === "remodel") dollars += 350

  const note =
    "Permit/inspection coordination allowance included for scheduling, return visits, and administrative handling as applicable."

  return { dollars, note }
}

function applyPermitBuffer(args: {
  pricing: Pricing
  trade: string
  cp: ComplexityProfile | null
  pricingSource: "ai" | "deterministic" | "merged"
  priceGuardVerified: boolean
  detSource: string | null
}): { pricing: Pricing; applied: boolean; note: string } {
  const cp = args.cp
  if (!cp?.permitLikely) return { pricing: args.pricing, applied: false, note: "" }

  // Avoid double-counting when you already have a verified deterministic engine or a known remodel anchor.
  const ds = (args.detSource || "").toLowerCase()
  const looksLikeAlreadyCovered =
    args.priceGuardVerified ||
    ds.includes("verified") ||
    ds.includes("anchor:bathroom_remodel") ||
    ds.includes("anchor:kitchen_remodel")

  if (looksLikeAlreadyCovered) {
    return { pricing: args.pricing, applied: false, note: "" }
  }

  const allow = computePermitCoordinationAllowance({ trade: args.trade, cp })
  if (!allow.dollars) return { pricing: args.pricing, applied: false, note: "" }

  // Apply to subs (mobilization/overhead bucket), recompute total
  const p = coercePricing(args.pricing)
  const subsNew = Math.round(Number(p.subs || 0) + allow.dollars)

  const mergedMarkup = Math.min(25, Math.max(15, Number(p.markup || 20)))
  const base = Math.round(Number(p.labor || 0) + Number(p.materials || 0) + subsNew)
  const totalNew = Math.round(base * (1 + mergedMarkup / 100))

  const out: Pricing = clampPricing({
    labor: Number(p.labor || 0),
    materials: Number(p.materials || 0),
    subs: subsNew,
    markup: mergedMarkup,
    total: totalNew,
  })

  return { pricing: out, applied: true, note: allow.note }
}

function compressCrossTradeMobilization(args: {
  pricing: Pricing
  basis: EstimateBasis | null
  cp: ComplexityProfile | null
  tradeStack: TradeStack | null
  scopeText: string
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
}): { pricing: Pricing; basis: EstimateBasis | null; applied: boolean; note: string } {
  const p = coercePricing(args.pricing)
  const b = args.basis
  const cp = args.cp
  const stack = args.tradeStack
  const s = (args.scopeText || "").toLowerCase()

  // --- decide if we should compress ---
  const scopeHintsMultiTrade =
    /\b(plumb|plumbing|toilet|vanity|faucet|shower|valve|drain|supply)\b/.test(s) &&
    /\b(electric|electrical|outlet|switch|panel|lighting|fixture)\b/.test(s)

  const remodelHints =
    /\b(remodel|renovation|gut|rebuild|demo|demolition|tile|waterproof|membrane|shower|tub)\b/.test(s)

  // Treat remodels as likely multi-trade *even if tradeStack missed it*
  // (this is why your “bathroom remodel” can still get protected).
  const isLikelyMultiTrade =
    !!stack?.isMultiTrade ||
    !!cp?.multiTrade ||
    (cp?.class === "remodel" && remodelHints) ||
    scopeHintsMultiTrade

  if (!isLikelyMultiTrade) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // Don’t compress verified deterministic engines too aggressively.
  // (Anchors/engines may already be tuned; we only want to prevent absurd stacking.)
  const isVerifiedLike = args.pricingSource === "deterministic" && !!args.detSource?.includes("verified")

  const labor = Math.max(0, Number(p.labor || 0))
  const materials = Math.max(0, Number(p.materials || 0))
  const subs = Math.max(0, Number(p.subs || 0))

  const baseLM = labor + materials
  if (baseLM <= 0 || subs <= 0) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // --- caps (conservative) ---
  // Multi-trade: subs should generally be a smaller share of LM (mobilization is shared across trades).
  // Keep it forgiving to avoid underpricing.
  const pctCap = isVerifiedLike ? 0.28 : 0.22 // verified-like gets a looser cap
  const hardMin = Math.max(450, Number(cp?.minSubs ?? 0), Number(cp?.minMobilization ?? 0))
  const maxAllowed = Math.max(hardMin, Math.round(baseLM * pctCap))

  if (subs <= maxAllowed) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  const subsNew = maxAllowed
  const markupNew = Math.min(25, Math.max(15, Number(p.markup || 20)))
  const base = Math.round(labor + materials + subsNew)
  const totalNew = Math.round(base * (1 + markupNew / 100))

  const pricingNew: Pricing = clampPricing({
    labor,
    materials,
    subs: subsNew,
    markup: markupNew,
    total: totalNew,
  })

  // Keep estimateBasis aligned (mobilization lives conceptually inside subs)
  let basisNew: EstimateBasis | null = b
  if (b && isValidEstimateBasis(b)) {
    const mob = Number(b.mobilization || 0)
    const mobNew = Math.min(mob, subsNew)

    basisNew = {
      ...b,
      mobilization: Number.isFinite(mobNew) ? Math.round(mobNew) : b.mobilization,
      assumptions: Array.isArray(b.assumptions)
        ? [...b.assumptions, "Cross-trade mobilization compressed to avoid stacked multi-trade overhead."]
        : ["Cross-trade mobilization compressed to avoid stacked multi-trade overhead."],
    }
  }

  return {
    pricing: pricingNew,
    basis: basisNew,
    applied: true,
    note: `Cross-trade mobilization compressed (subs capped from ${subs} → ${subsNew}).`,
  }
}

// -----------------------------
// PATCH: Cross-Trade Mobilization Compression
// Goal: prevent "stacked mobilization" on true multi-trade jobs when AI is pricing.
// -----------------------------
function applyCrossTradeMobilizationCompression(args: {
  pricing: Pricing
  basis: EstimateBasis | null
  tradeStack: TradeStack | null
  cp: ComplexityProfile | null
  scopeText: string
  pricingSource: "ai" | "deterministic" | "merged"
}): { pricing: Pricing; basis: EstimateBasis | null; applied: boolean; note: string } {
  const cp = args.cp
  const b = args.basis

  // Only compress when AI is the pricing owner (never touch deterministic/merged)
  if (args.pricingSource !== "ai") {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // Only compress on true multi-trade jobs
  if (!args.tradeStack?.isMultiTrade) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // Only meaningful on medium/complex/remodel (avoid messing with simple callouts)
  if (!cp || (cp.class !== "medium" && cp.class !== "complex" && cp.class !== "remodel")) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // We only do this when the estimate is days-based (project-style coordination)
  if (!b || !isValidEstimateBasis(b)) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }
  const hasDaysUnit = Array.isArray(b.units) && b.units.includes("days")
  if (!hasDaysUnit) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  const p = coercePricing(args.pricing)

  // If subs is already minimal-ish, don't compress (avoid thrash)
  // (This makes the patch mostly a "downward correction" only when subs is inflated)
  const base0 = Math.round(Number(p.labor || 0) + Number(p.materials || 0))
  if (base0 <= 0) return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }

  // Target subs as "project coordination + single mobilization"
  // - percent band: 8%–14% depending on class
  // - minimums: cp.minSubs and cp.minMobilization
  const pct =
    cp.class === "remodel" ? 0.14 :
    cp.class === "complex" ? 0.12 :
    0.10 // medium

  const targetCoordination = Math.round(base0 * pct)

  // Single mobilization concept (keep it at least the complexity minimum)
  const singleMobilization = Math.max(cp.minMobilization ?? 0, Number(b.mobilization ?? 0), 0)

  // Target subs = max(minSubs floor, coordination%, single mobilization)
  const targetSubs = Math.max(
    Math.round(cp.minSubs ?? 0),
    targetCoordination,
    Math.round(singleMobilization)
  )

  // Only apply if current subs is "meaningfully above" target (10%+ or $150+)
  const currentSubs = Math.round(Number(p.subs || 0))
  const delta = currentSubs - targetSubs
  const meaningful = delta > 150 && delta / Math.max(1, targetSubs) > 0.10
  if (!meaningful) {
    return { pricing: args.pricing, basis: args.basis, applied: false, note: "" }
  }

  // Apply compressed subs and recompute total
  const markupNew = Math.min(25, Math.max(15, Number(p.markup || 20)))
  const base = Math.round(Number(p.labor || 0) + Number(p.materials || 0) + targetSubs)
  const totalNew = Math.round(base * (1 + markupNew / 100))

  const pricingNew: Pricing = clampPricing({
    labor: Math.round(Number(p.labor || 0)),
    materials: Math.round(Number(p.materials || 0)),
    subs: targetSubs,
    markup: markupNew,
    total: totalNew,
  })

  const trades = (args.tradeStack.trades || []).filter(Boolean).slice(0, 4)
  const note =
    `Cross-trade mobilization compressed for multi-trade project (${trades.join(", ") || "multi-trade"}): subs ${currentSubs} → ${targetSubs}.`

  const basisNew: EstimateBasis = {
    ...b,
    mobilization: Math.max(Number(b.mobilization ?? 0), singleMobilization),
    assumptions: Array.isArray(b.assumptions)
      ? [...b.assumptions, `Multi-trade project coordination; mobilization/overhead treated as shared project cost (compressed).`]
      : [`Multi-trade project coordination; mobilization/overhead treated as shared project cost (compressed).`],
  }

  return { pricing: pricingNew, basis: basisNew, applied: true, note }
}

function appendPermitCoordinationSentence(desc: string, cp: ComplexityProfile | null): string {
  let d = (desc || "").trim()
  if (!d) return d
  if (!cp?.permitLikely) return d

  // prevent duplicates
  if (/\bpermit\b/i.test(d) || /\binspection\b/i.test(d)) return d

  return (d +
    " Scope includes allowance for permit/inspection coordination, scheduling, and required return visits as applicable.").trim()
}

type JobComplexityClass = "simple" | "medium" | "complex" | "remodel"

type ComplexityProfile = {
  class: JobComplexityClass
  requireDaysBasis: boolean
  permitLikely: boolean
  multiPhase: boolean
  multiTrade: boolean
  hasDemo: boolean
  notes: string[]

  // guard rails for pricing structure
  minCrewDays: number
  maxCrewDays: number
  minMobilization: number
  minSubs: number

  // ✅ NEW: crew realism
  crewSizeMin: number
  crewSizeMax: number
  hoursPerDayEffective: number // productive hours per person/day (6–8 typical)
  minPhaseVisits: number       // how many "show-ups" (return trips) implied
}

function buildComplexityProfile(args: { scopeText: string; trade: string }): ComplexityProfile {
  const s = (args.scopeText || "").toLowerCase()
  const trade = (args.trade || "").toLowerCase()

  const notes: string[] = []

  const hasDemo =
    /\b(demo|demolition|tear\s*out|remove\s+existing|haul\s*away|dispose|dump)\b/.test(s)

  const remodelSignals =
    /\b(remodel|renovation|gut|rebuild|full\s*replace|convert|conversion)\b/.test(s)

  const permitSignals =
    /\b(permit|inspection|inspector|code|required|city)\b/.test(s) ||
    /\b(panel|service\s*upgrade|meter|subpanel)\b/.test(s)

  const roughInOrRelocate =
    /\b(rough[-\s]*in|relocat(e|ing|ion)|move\s+(drain|supply|valve|line)|new\s+circuit|run\s+new\s+wire|trench)\b/.test(s)

  const wetAreaSignals =
    /\b(shower|tub|pan|curb|waterproof|membrane|red\s*guard|cement\s*board|durock|hardie(backer)?|thinset|mud\s*bed)\b/.test(s)

  const multiPhase =
    hasDemo || roughInOrRelocate || wetAreaSignals || permitSignals

  const multiTradeSignals =
    /\b(plumb|plumbing)\b/.test(s) &&
    /\b(electric|electrical)\b/.test(s)

  const finishTradeSignals =
    /\b(tile|backsplash|cabinet|counter(top)?|floor|flooring|drywall|paint|painting|trim|baseboard)\b/.test(s)

  const multiTrade = multiTradeSignals || (remodelSignals && finishTradeSignals)

  // --- classify ---
  let cls: JobComplexityClass = "simple"

  // “remodel” wins
  if (remodelSignals || (wetAreaSignals && hasDemo)) {
    cls = "remodel"
    notes.push("Remodel / rebuild signals detected.")
  } else if (permitSignals || roughInOrRelocate) {
    cls = "complex"
    notes.push("Permit/rough-in/relocation signals detected.")
  } else if (hasDemo || multiTrade) {
    cls = "medium"
    notes.push("Demo or multi-trade coordination signals detected.")
  } else {
    cls = "simple"
  }

  const permitLikely = permitSignals
  if (permitLikely) notes.push("Permit/inspection likely.")

  if (hasDemo) notes.push("Demolition/haul-away implied.")
  if (roughInOrRelocate) notes.push("Rough-in or relocation scope implied.")
  if (wetAreaSignals) notes.push("Wet-area / waterproofing signals detected.")
  if (multiTrade) notes.push("Multi-trade coordination likely.")

  // --- force “days” basis for complex/remodel (and for heavy electrical/plumbing patterns) ---
  const requireDaysBasis =
  cls === "complex" ||
  cls === "remodel" ||
  multiPhase ||
  hasDemo ||
  multiTrade ||
  (trade === "electrical" && /\b(panel|service\s*upgrade|rewire)\b/.test(s)) ||
  (trade === "plumbing" && /\b(rough[-\s]*in|relocat|move\s+drain|move\s+supply)\b/.test(s))

  // --- guardrail minimums by class ---
  // These are intentionally forgiving but block “0.5 day remodels”
  const bands =
  cls === "simple"
    ? {
        minCrewDays: 0.5, maxCrewDays: 3,
        minMobilization: 175, minSubs: 175,
        crewSizeMin: 1, crewSizeMax: 2,
        hoursPerDayEffective: 7,
        minPhaseVisits: 1,
      }
    : cls === "medium"
      ? {
          minCrewDays: 1, maxCrewDays: 7,
          minMobilization: 350, minSubs: 350,
          crewSizeMin: 1, crewSizeMax: 3,
          hoursPerDayEffective: 7,
          minPhaseVisits: 1,
        }
      : cls === "complex"
        ? {
            minCrewDays: 2, maxCrewDays: 14,
            minMobilization: 550, minSubs: 550,
            crewSizeMin: 2, crewSizeMax: 4,
            hoursPerDayEffective: 6.5,
            minPhaseVisits: 2, // permits/rough-in => return
          }
        : {
            minCrewDays: 3, maxCrewDays: 25,
            minMobilization: 750, minSubs: 750,
            crewSizeMin: 2, crewSizeMax: 5,
            hoursPerDayEffective: 6.25,
            minPhaseVisits: 2, // remodels tend to be multi-visit
          }

  return {
    class: cls,
    requireDaysBasis,
    permitLikely,
    multiPhase,
    multiTrade,
    hasDemo,
    notes,
    ...bands,
  }
}

function inferPhaseVisitsFromSignals(args: {
  scopeText: string
  cp: ComplexityProfile | null
}): { visits: number; phases: string[] } {
  const s = (args.scopeText || "").toLowerCase()
  const cp = args.cp

  const phases: string[] = []

  const hasDemo =
    /\b(demo|demolition|tear\s*out|remove\s+existing|haul\s*away|dispose|dump)\b/.test(s)

  const hasRoughOrRelocate =
    /\b(rough[-\s]*in|relocat(e|ing|ion)|move\s+(drain|supply|valve|line)|new\s+circuit|run\s+new\s+wire|trench)\b/.test(s)

  const hasWetArea =
    /\b(shower|tub|pan|curb|waterproof|membrane|red\s*guard|cement\s*board|durock|hardie(backer)?|thinset|mud\s*bed)\b/.test(s)

  const hasPermit =
    /\b(permit|inspection|inspector|code|required|city)\b/.test(s) ||
    /\b(panel|service\s*upgrade|meter|subpanel)\b/.test(s)

  // Finish-trade sequencing signals
  const hasFlooring =
    /\b(floor|flooring|lvp|vinyl\s*plank|laminate|hardwood|engineered\s*wood|carpet|tile\s+floor)\b/.test(s)

  const hasBaseboardOrTrim =
    /\b(baseboard|baseboards|base\s*board|trim|shoe\s*mold|quarter\s*round|casing)\b/.test(s)

  const hasTextureOrPatch =
    /\b(texture|orange\s*peel|knockdown|skim\s*coat|patch|patching|drywall\s*repair|drywall\s*patch|mudding|tape\s*and\s*mud)\b/.test(s)

  const hasPaint =
    /\b(paint|painting|prime|primer|repaint)\b/.test(s)

  const flooringBaseboardSequence = hasFlooring && hasBaseboardOrTrim
  const texturePaintSequence = hasTextureOrPatch && hasPaint
  const flooringPaintSequence = hasFlooring && hasPaint

  if (hasDemo) phases.push("demolition/removal")
  if (hasRoughOrRelocate) phases.push("rough-in/relocation")
  if (hasPermit) phases.push("permit/inspection coordination")
  if (hasWetArea) phases.push("wet-area sequencing/cure time")

  if (flooringBaseboardSequence) {
    phases.push("flooring before trim/baseboard")
  }

  if (texturePaintSequence) {
    phases.push("patch/texture dry time before paint")
  } else if (flooringPaintSequence) {
    phases.push("finish protection / flooring-paint coordination")
  }

  let visits = 1

  const hardSignals = [hasDemo, hasRoughOrRelocate, hasPermit, hasWetArea].filter(Boolean).length
  const finishSequencing =
    flooringBaseboardSequence || texturePaintSequence || flooringPaintSequence

  // Any meaningful sequencing at all should usually be at least 2 visits
  if (hardSignals >= 1 || finishSequencing) {
    visits = 2
  }

  // Stronger multi-step sequencing patterns should be 3 visits
  if (
    (hasDemo && hasRoughOrRelocate) ||
    (hasWetArea && (hasDemo || hasRoughOrRelocate)) ||
    (flooringBaseboardSequence && texturePaintSequence) ||
    (hasFlooring && hasBaseboardOrTrim && hasTextureOrPatch) ||
    (hasFlooring && hasTextureOrPatch && hasPaint)
  ) {
    visits = 3
  }

  // Permit + other phase almost always means another return
  if (hasPermit && (hasDemo || hasRoughOrRelocate || hasWetArea)) {
    visits = Math.max(visits, 3)
  }

  // Respect complexity profile minimums
  if (cp?.minPhaseVisits) {
    visits = Math.max(visits, cp.minPhaseVisits)
  }

  return {
    visits,
    phases: Array.from(new Set(phases)),
  }
}

function validateCrewAndSequencing(args: {
  pricing: Pricing
  basis: EstimateBasis | null
  cp: ComplexityProfile | null
  scopeText: string
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const p = args.pricing
  const b = args.basis
  const cp = args.cp

  if (!cp || !b || !isValidEstimateBasis(b)) return { ok: true, reasons }

  // Only enforce crewDays math when days-based estimate is present
  const hasDays = Array.isArray(b.units) && b.units.includes("days")
  if (!hasDays) return { ok: true, reasons }

  const crewDays = Number(b.crewDays ?? b.quantities?.days ?? 0)
  if (!Number.isFinite(crewDays) || crewDays <= 0) {
    reasons.push("days-based estimate missing/invalid crewDays.")
    return { ok: false, reasons }
  }

  const laborRate = Number(b.laborRate)
  const laborDollars = Number(p.labor)

  if (!Number.isFinite(laborRate) || laborRate <= 0) {
    reasons.push("days-based estimate missing/invalid laborRate.")
    return { ok: false, reasons }
  }
  if (!Number.isFinite(laborDollars) || laborDollars <= 0) {
    reasons.push("days-based estimate missing/invalid labor dollars.")
    return { ok: false, reasons }
  }

  const impliedLaborHours = laborDollars / laborRate

  // Choose a conservative “expected crew size” for validation:
  // Use the MIN crew size so the validation is forgiving (harder to false-flag).
  const crewSize = Math.max(1, Number(cp.crewSizeMin ?? 1))
  const hrsPerDay = Math.max(5.5, Math.min(8, Number(cp.hoursPerDayEffective ?? 7)))

  const impliedCrewDays = impliedLaborHours / (crewSize * hrsPerDay)

  if (Number.isFinite(impliedCrewDays) && impliedCrewDays > 0) {
    // very forgiving tolerance: allow 2.5x mismatch before flagging
    const ratio = impliedCrewDays / crewDays
    if (ratio > 2.5 || ratio < 0.4) {
      reasons.push(
        `CrewDays inconsistent with labor math: implied ${impliedCrewDays.toFixed(1)} crew-day(s) (crew=${crewSize}, ${hrsPerDay}h/day) vs crewDays=${crewDays}.`
      )
    }
  }

  // Sequencing / multi-visit enforcement (prevents “one trip remodel”)
  const phase = inferPhaseVisitsFromSignals({ scopeText: args.scopeText, cp })
  if (phase.visits >= 2) {
    // Minimum crewDays floor by visit count:
    // - 2 visits: at least 1.5 crewDays
    // - 3 visits: at least 2.5 crewDays
    const minByVisits = phase.visits === 2 ? 1.5 : 2.5
    if (crewDays < minByVisits && (cp.class === "complex" || cp.class === "remodel")) {
      reasons.push(
        `Multi-phase scope implies ${phase.visits} visit(s) (${phase.phases.join(", ")}); crewDays too low (${crewDays}).`
      )
    }
  }

  return { ok: reasons.length === 0, reasons }
}

// -----------------------------
// TRADE STACK (MULTI-TRADE DETECTOR)
// -----------------------------
type TradeStack = {
  primaryTrade: string
  trades: string[]        // actual trades only (plumbing/electrical/tile/drywall/carpentry/painting/flooring)
  activities: string[]    // phases/activities (demo/waterproofing/etc)
  signals: string[]
  isMultiTrade: boolean
}

function detectTradeStack(args: { scopeText: string; primaryTrade: string }): TradeStack {
const s = (args.scopeText || "").toLowerCase()
const primary = (args.primaryTrade || "").toLowerCase()

const trades: string[] = []
const activities: string[] = []
const signals: string[] = []

const addTrade = (t: string, why: string) => {
    if (!trades.includes(t)) trades.push(t)
    if (why && !signals.includes(why)) signals.push(why)
  }

const addActivity = (a: string, why: string) => {
    if (!activities.includes(a)) activities.push(a)
    if (why && !signals.includes(why)) signals.push(why)
  }

const REAL_TRADES = new Set([
  "painting",
  "drywall",
  "flooring",
  "carpentry",
  "plumbing",
  "electrical",
  "tile",
])

if (primary && REAL_TRADES.has(primary)) trades.push(primary)

  // --- PHASES/ACTIVITIES (do NOT count as "multi-trade") ---
  const hasDemo = /\b(demo|demolition|tear\s*out|remove\s+existing|haul\s*away|dispose)\b/.test(s)
  const hasWaterproof = /\b(waterproof|membrane|pan|curb|cement\s*board|durock|hardie)\b/.test(s)

  if (hasDemo) addActivity("demolition", "Demo detected")
  if (hasWaterproof) addActivity("waterproofing", "Wet-area waterproofing detected")

  // --- ACTUAL TRADES ---
  const hasTile = /\b(tile|grout|thinset|porcelain|ceramic|backsplash|tub\s*surround|shower\s+walls?)\b/.test(s)
  const hasPlumbing = /\b(toilet|sink|faucet|vanity|shower|tub|valve|drain|supply)\b/.test(s)
  const hasElectrical = /\b(outlet|switch|recessed|can\s*light|fixture|panel)\b/.test(s)
  const hasDrywall = /\b(drywall|sheetrock|texture|patch)\b/.test(s)
  const hasCarpentry = /\b(cabinet|vanity|trim|baseboard|framing|blocking|door)\b/.test(s)

  if (hasTile) addTrade("tile", "Tile detected")
  if (hasPlumbing) addTrade("plumbing", "Plumbing work detected")
  if (hasElectrical) addTrade("electrical", "Electrical work detected")
  if (hasDrywall) addTrade("drywall", "Drywall work detected")
  if (hasCarpentry) addTrade("carpentry", "Carpentry work detected")

  const uniqueTrades = trades.filter((t, i) => trades.indexOf(t) === i)

  // Multi-trade now means 2+ REAL trades (not demo/waterproofing)
  const isMultiTrade = uniqueTrades.length >= 2

  return {
    primaryTrade: primary || "unknown",
    trades: uniqueTrades,
    activities,
    signals,
    isMultiTrade,
  }
}

function appendTradeCoordinationSentence(desc: string, stack: TradeStack | null): string {
  let d = (desc || "").trim()
  if (!d) return d

  if (!stack?.isMultiTrade) return d

  const alreadyMentionsCoordination =
    /\bcoordination\b/i.test(d) ||
    /\bmulti[-\s]?trade\b/i.test(d) ||
    /\bmultiple trades\b/i.test(d)

  if (alreadyMentionsCoordination) return d

  const list = stack.trades
    .filter(Boolean)
    .filter((t) => t !== stack.primaryTrade)
    .slice(0, 3)

  if (list.length === 0) return d

  const phaseHint =
    Array.isArray(stack.activities) && stack.activities.length > 0
      ? ` with sequencing for ${stack.activities.slice(0, 2).join(" and ")}`
      : ""

  return (
    d +
    ` The scope includes coordination across ${list.join(", ")} activities${phaseHint} to maintain sequencing with existing conditions.`
  ).trim()
}

function estimateCalendarDaysRange(args: {
  crewDays: number
  cp: ComplexityProfile | null
  trade: string
  tradeStack: TradeStack | null
  scopeText: string
  workDaysPerWeek: 5 | 6 | 7
}): { minDays: number; maxDays: number; rationale: string[] } {
  const crewDays = Math.max(0.5, Number(args.crewDays || 0))
  const cp = args.cp
  const trade = (args.trade || "").toLowerCase()
  const s = (args.scopeText || "").toLowerCase()
  const stack = args.tradeStack
  const workDaysPerWeek = args.workDaysPerWeek

  const rationale: string[] = []

  // --- Start in WORKDAYS (not elapsed days yet) ---
  let minWorkdays = Math.ceil(crewDays)
  let maxWorkdays = Math.ceil(crewDays * 1.35)

  const { visits, phases } = inferPhaseVisitsFromSignals({ scopeText: args.scopeText, cp })

  if (visits >= 2) { maxWorkdays += 1; rationale.push("multi-visit sequencing") }
  if (visits >= 3) { maxWorkdays += 1; rationale.push("multiple return trips") }

  const wetArea =
    /\b(shower|tub|pan|curb|waterproof|membrane|red\s*guard|thinset|grout|mud\s*bed)\b/.test(s)
  if (wetArea) {
    minWorkdays += 1
    maxWorkdays += 3
    rationale.push("wet-area cure/set time")
  }

  const drywallSignals =
    /\b(drywall|sheetrock|tape|mud|mudding|texture|skim\s*coat|orange\s*peel|knockdown)\b/.test(s)
  if (drywallSignals) {
    minWorkdays += 1
    maxWorkdays += 2
    rationale.push("drywall dry/return")
  }

  const paintSignals = /\b(paint|painting|prime|primer|2\s*coats|two\s*coats|coat)\b/.test(s)
  if (trade === "painting" && paintSignals) {
    maxWorkdays += 1
    rationale.push("coat/dry time")
  }

  const flooringSignals = /\b(lvp|vinyl\s*plank|laminate|hardwood|engineered\s*wood)\b/.test(s)
  if (flooringSignals) {
    maxWorkdays += 1
    rationale.push("flooring acclimation")
  }

  if (cp?.permitLikely) {
    minWorkdays += 1
    maxWorkdays += 4
    rationale.push("permit/inspection scheduling")
  }

  if (stack?.isMultiTrade || cp?.multiTrade) {
    maxWorkdays += 2
    rationale.push("multi-trade coordination")
  }

  if (cp?.class === "complex") maxWorkdays += 1
  if (cp?.class === "remodel") maxWorkdays += 2

  // Guard rails (workdays)
  minWorkdays = Math.max(1, minWorkdays)
  maxWorkdays = Math.max(minWorkdays, maxWorkdays)

  if (crewDays <= 1) {
    minWorkdays = 1
    maxWorkdays = Math.min(maxWorkdays, 3)
  }

  // --- Convert to ELAPSED CALENDAR DAYS using schedule ---
  const minDays = workdaysToElapsedDays(minWorkdays, workDaysPerWeek)
  const maxDays = workdaysToElapsedDays(maxWorkdays, workDaysPerWeek)

  return { minDays, maxDays: Math.max(minDays, maxDays), rationale }
}

function clampWorkDaysPerWeek(n: any): 5 | 6 | 7 {
  return n === 6 ? 6 : n === 7 ? 7 : 5
}

function workdaysToElapsedDays(workdays: number, workDaysPerWeek: 5 | 6 | 7): number {
  const wd = Math.max(1, Math.round(workdays))
  const w = workDaysPerWeek

  if (w === 7) return wd

  // Number of calendar weeks touched by wd workdays
  const weeksTouched = Math.ceil(wd / w)
  const offDaysPerWeek = 7 - w

  return wd + (weeksTouched - 1) * offDaysPerWeek
}

function appendExecutionPlanSentence(args: {
  description: string
  documentType: string
  trade: string
  cp: ComplexityProfile | null
  basis: EstimateBasis | null
  scopeText: string
  tradeStack?: TradeStack | null
  workDaysPerWeek?: 5 | 6 | 7
}): string {
  let d = (args.description || "").trim()
  if (!d) return d

  d = syncDescriptionLeadToDocumentType(
    d,
    args.documentType as "Change Order" | "Estimate" | "Change Order / Estimate"
  )

  const cp = args.cp
  const b = args.basis
  const { visits, phases } = inferPhaseVisitsFromSignals({ scopeText: args.scopeText, cp })

  const hasDays = !!(b && Array.isArray(b.units) && b.units.includes("days"))
  const cd = Number(b?.crewDays ?? b?.quantities?.days ?? 0)
  if (!hasDays || !Number.isFinite(cd) || cd <= 0) return d

  const rounded = Math.round(cd * 2) / 2
  const dayWord = rounded === 1 ? "day" : "days"

  const visitText = visits >= 2 ? ` across approximately ${visits} site visit(s)` : ""
  const phaseText =
    phases.length > 0 ? ` with sequencing for ${phases.slice(0, 3).join(", ")}` : ""

 const cal = estimateCalendarDaysRange({
  crewDays: rounded,
  cp,
  trade: args.trade,
  tradeStack: args.tradeStack ?? null,
  scopeText: args.scopeText,
  workDaysPerWeek: args.workDaysPerWeek ?? 5,
})

const sched = args.workDaysPerWeek ?? 5
const scheduleText = sched === 5 ? " (5-day workweek)" : sched === 6 ? " (6-day workweek)" : " (7-day workweek)"
const calText =
  cal.minDays === cal.maxDays
    ? `${cal.minDays} calendar day(s)`
    : `${cal.minDays}–${cal.maxDays} calendar day(s)`

const sentence =
  ` Estimated duration: approximately ${rounded} crew-${dayWord}${visitText} (typically ${calText}${scheduleText})${phaseText}.`
  
  return (d + sentence).trim()
}

function validateAiMath(args: {
  pricing: Pricing
  basis: EstimateBasis | null
  parsedCounts: { rooms: number | null; doors: number | null; sqft: number | null }
  complexity?: ComplexityProfile | null
  scopeText?: string // ✅ NEW
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const p = args.pricing
  const b = args.basis

  // -----------------------------
  // Existing checks (UNCHANGED)
  // -----------------------------

  // 1) Total must match (tight)
  const impliedTotal = Math.round((p.labor + p.materials + p.subs) * (1 + p.markup / 100))
  if (!approxEqual(p.total, impliedTotal, 0.03)) {
    reasons.push("Total does not match base + markup.")
  }

  // 2) If no basis, fail (we want unit checking)
  if (!b || !isValidEstimateBasis(b)) {
    reasons.push("Missing/invalid estimateBasis.")
    return { ok: reasons.length === 0, reasons }
  }

  // 3) Must reflect explicit counts you already parsed (rooms/doors/sqft)
  if (args.parsedCounts.rooms && args.parsedCounts.rooms > 0) {
    const q = Number(b.quantities.rooms ?? 0)
    if (q !== args.parsedCounts.rooms) reasons.push("rooms quantity not carried into estimateBasis.")
  }

  if (args.parsedCounts.doors && args.parsedCounts.doors > 0) {
    const q = Number(b.quantities.doors ?? 0)
    if (q !== args.parsedCounts.doors) reasons.push("doors quantity not carried into estimateBasis.")
  }

  // (Small upgrade: you already parse sqft — enforce it if present)
  if (args.parsedCounts.sqft && args.parsedCounts.sqft > 0) {
    const q = Number(b.quantities.sqft ?? 0)
    if (q !== args.parsedCounts.sqft) reasons.push("sqft quantity not carried into estimateBasis.")
  }

  // 4) Mobilization sanity
  if (b.mobilization < 100 && (args.parsedCounts.doors || args.parsedCounts.rooms || args.parsedCounts.sqft)) {
    reasons.push("mobilization too low for small job.")
  }

  // 5) Labor scaling sanity (simple check)
  const hasCountUnit = b.units.some((u) =>
    ["doors", "rooms", "devices", "fixtures", "sqft", "linear_ft"].includes(u)
  )
  if (hasCountUnit && p.labor <= 0) reasons.push("Labor missing for unit-based estimate.")

  // -----------------------------
  // NEW: Production-rate sanity locking
  // -----------------------------

  // Only apply rate-locking when the AI claims ONE primary unit.
  // Multi-unit bases make "hours per unit" ambiguous and can false-flag.
  const primaryUnit: PricingUnit | null = Array.isArray(b.units) && b.units.length === 1 ? b.units[0] : null

  // Helper: wide, realistic bounds (intentionally forgiving)
  const getBands = (unit: PricingUnit): { min: number; max: number; label: string } | null => {
    switch (unit) {
      case "doors":
        return { min: 0.6, max: 2.5, label: "hrs/door" } // wide: paint doors, install doors, etc.
      case "rooms":
        return { min: 3.0, max: 18.0, label: "hrs/room" } // wide for repaint vs heavy prep
      case "sqft":
        return { min: 0.005, max: 0.25, label: "hrs/sqft" } // 4 sqft/hr (patching) to 200 sqft/hr (painting-ish)
      case "linear_ft":
        return { min: 0.02, max: 1.2, label: "hrs/linear_ft" } // baseboard/carpentry can vary a lot
      case "devices":
        return { min: 0.20, max: 2.5, label: "hrs/device" } // swaps vs add/troubleshoot
      case "fixtures":
        return { min: 0.60, max: 8.0, label: "hrs/fixture" } // faucet vs vanity vs valve
      case "days":
        return { min: 0.5, max: 25, label: "crewDays" } // super wide; still blocks 0 or 1000
      case "lump_sum":
        return null // can't rate-check lump sums
      default:
        return null
    }
  }

  // Only attempt if laborRate is sane and labor exists
  const laborRate = Number(b.laborRate)
  const laborDollars = Number(p.labor)

  if (
    primaryUnit &&
    Number.isFinite(laborRate) &&
    laborRate > 0 &&
    Number.isFinite(laborDollars) &&
    laborDollars > 0
  ) {
    const bands = getBands(primaryUnit)

    if (bands) {
      if (primaryUnit === "days") {
        // For "days" unit, compare to crewDays (preferred) or quantities.days
        const cd = Number(b.crewDays ?? b.quantities.days ?? 0)
        if (!Number.isFinite(cd) || cd <= 0) {
          reasons.push("days-based estimate missing crewDays/quantities.days.")
        } else if (cd < bands.min || cd > bands.max) {
          reasons.push(`Production rate unrealistic: crewDays=${cd} (expected ${bands.min}–${bands.max}).`)
        } else {
          // Optional sanity: implied hours shouldn't be wildly inconsistent with crewDays (assume ~8h/day)
          const impliedLaborHours = laborDollars / laborRate
          const impliedDaysAt8 = impliedLaborHours / 8
          if (Number.isFinite(impliedDaysAt8) && impliedDaysAt8 > 0) {
            // Super forgiving: allow 3x mismatch before flagging
            const ratio = impliedDaysAt8 / cd
            if (ratio > 3.0 || ratio < 0.33) {
              reasons.push(
                `Labor math inconsistent with crewDays: implied ${(impliedDaysAt8).toFixed(1)} day(s) @8h/day vs crewDays=${cd}.`
              )
            }
          }
        }
      } else {
        // For count/sqft/linear_ft/device/fixture/room/door
        const qty = Number(b.quantities?.[primaryUnit] ?? 0)
        if (!Number.isFinite(qty) || qty <= 0) {
          reasons.push(`${primaryUnit} unit selected but quantity missing/zero in estimateBasis.`)
        } else {
          const impliedLaborHours = laborDollars / laborRate
          const impliedHrsPerUnit = impliedLaborHours / qty

          if (!Number.isFinite(impliedHrsPerUnit) || impliedHrsPerUnit <= 0) {
            reasons.push(`Invalid implied production rate for ${primaryUnit}.`)
          } else {
            if (impliedHrsPerUnit < bands.min || impliedHrsPerUnit > bands.max) {
              reasons.push(
                `Production rate unrealistic for ${primaryUnit}: ${impliedHrsPerUnit.toFixed(3)} ${bands.label} (expected ${bands.min}–${bands.max}).`
              )
            }

            // If model provided hoursPerUnit, ensure it roughly matches implied math
            const hpu = Number(b.hoursPerUnit ?? 0)
            if (Number.isFinite(hpu) && hpu > 0) {
              if (!approxEqual(hpu, impliedHrsPerUnit, 0.18)) {
                reasons.push("hoursPerUnit does not match laborRate × quantity math.")
              }
            }
          }
        }
      }
    }
  }

    // -----------------------------
  // NEW: Complexity Profile enforcement
  // -----------------------------
  const cp = args.complexity ?? null

  if (cp?.requireDaysBasis) {
    // Must include "days" + crewDays
    const hasDaysUnit = Array.isArray(b.units) && b.units.includes("days")
    if (!hasDaysUnit) reasons.push(`Complexity requires days-based estimateBasis (missing "days" in units).`)

    const cd = Number(b.crewDays ?? b.quantities?.days ?? 0)
    if (!Number.isFinite(cd) || cd <= 0) {
      reasons.push("Complexity requires crewDays (missing/invalid crewDays).")
    } else {
      if (cd < cp.minCrewDays || cd > cp.maxCrewDays) {
        reasons.push(
          `crewDays out of range for ${cp.class}: ${cd} (expected ${cp.minCrewDays}–${cp.maxCrewDays}).`
        )
      }
    }
  }

  // Mobilization/subs minimums by complexity (for structure realism)
  if (cp) {
    if (Number(b.mobilization) < cp.minMobilization) {
      reasons.push(`mobilization too low for ${cp.class} job (min ${cp.minMobilization}).`)
    }
    if (Number(p.subs) < cp.minSubs) {
      reasons.push(`subs too low for ${cp.class} job (min ${cp.minSubs}).`)
    }
  }

  const cs = validateCrewAndSequencing({
  pricing: p,
  basis: b,
  cp: args.complexity ?? null,
  scopeText: args.scopeText ?? "",
})
if (!cs.ok) reasons.push(...cs.reasons)

  return { ok: reasons.length === 0, reasons }
}

// 🔍 Trade auto-detection
function autoDetectTrade(scope: string): string {
  const s = scope.toLowerCase()

  // Drywall should come BEFORE painting so "drywall patch" doesn't become painting
  if (/(drywall|sheetrock|skim\s*coat|tape\s*and\s*mud|taping|mudding|texture|orange\s*peel|knockdown)/.test(s))
    return "drywall"

  if (/(paint|painting|prime|primer)/.test(s))
    return "painting"

  if (/(floor|flooring|lvp|vinyl\s*plank|laminate|hardwood|carpet|tile\s+floor|floor\s+tile)/.test(s))
    return "flooring"

  if (/(electrical|outlet|switch|panel|lighting)/.test(s))
    return "electrical"

  if (/(plumb|toilet|sink|faucet|shower|water line)/.test(s))
    return "plumbing"

  if (/(carpentry|trim|baseboard|framing|cabinet)/.test(s))
    return "carpentry"

  return "general renovation"
}

function isMixedRenovation(scope: string) {
  const s = scope.toLowerCase()

  const hasPaint = /\b(paint|painting|repaint|prime|primer)\b/.test(s)
  const hasNonPaint =
    /\b(tile|grout|vanity|toilet|sink|faucet|shower|plumb|plumbing|electrical|outlet|switch|flooring|demo|demolition|remodel|install)\b/.test(s)

  return hasPaint && hasNonPaint
}

function parseSqft(text: string): number | null {
  const t = String(text || "")
    .toLowerCase()
    .replace(/,/g, "")

  const m = t.match(/(\d{1,7}(?:\.\d+)?)\s*(sq\s*ft|sqft|square\s*feet|sf)\b/)
  if (!m?.[1]) return null

  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseHasVanity(text: string): boolean {
  return /\bvanity\b/.test(text.toLowerCase())
}

function parseTile(text: string): boolean {
  return /\b(tile|porcelain|ceramic|grout)\b/.test(text.toLowerCase())
}

function parseDemo(text: string): boolean {
  return /\b(demo|demolition|remove|tear\s*out)\b/.test(text.toLowerCase())
}

function parseBathKeyword(text: string): boolean {
  return /\b(bath|bathroom|shower|tub)\b/.test(text.toLowerCase())
}

function parseKitchenKeyword(text: string): boolean {
  return /\b(kitchen|cabinet|cabinets|countertop|counter top|backsplash|range|cooktop|hood|dishwasher|microwave)\b/i.test(
    text
  )
}

function parseFlooringKeyword(text: string): boolean {
  return /\b(floor|flooring|lvp|vinyl plank|laminate|hardwood|engineered wood|carpet|tile floor|underlayment|baseboard)\b/i.test(
    text
  )
}

function parseWallTileKeyword(text: string): boolean {
  // helps prevent flooring-only anchor from triggering on shower wall tile jobs
  return /\b(shower\s+walls?|tub\s+surround|wall\s+tile|backsplash)\b/i.test(text)
}

function parseElectricalDeviceBreakdown(text: string) {
  const t = text.toLowerCase()

  const sumMatches = (re: RegExp) => {
    let total = 0
    for (const m of t.matchAll(re)) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) total += n
    }
    return total
  }

  // Allow up to 2 words between number and the thing
  // e.g. "2 new outlets", "4 existing switches", "6 gfci outlets"
  const outlets = sumMatches(/(\d{1,4})\s+(?:\w+\s+){0,2}(outlet|receptacle|plug)s?\b/g)
  const switches = sumMatches(/(\d{1,4})\s+(?:\w+\s+){0,2}switch(es)?\b/g)

  // e.g. "4 new recessed can lights", "6 can lights", "8 recessed lights"
  const recessed = sumMatches(
    /(\d{1,4})\s+(?:\w+\s+){0,2}(recessed|can)\s+lights?\b/g
  )

  const fixtures = sumMatches(
    /(\d{1,4})\s+(?:\w+\s+){0,2}(light\s*fixture|fixture|sconce)s?\b/g
  )

  const total = outlets + switches + recessed + fixtures
  return total > 0 ? { outlets, switches, recessed, fixtures, total } : null
}

function priceBathroomRemodelAnchor(args: {
  scope: string
  stateMultiplier: number
  measurements?: any | null
  fallbackFloorSqft?: number | null
}): Pricing | null {
  const s = args.scope.toLowerCase()

  const isBath = parseBathKeyword(s)
  const remodelSignals =
    /\b(remodel|renovation|gut|rebuild|demo|demolition|tile|waterproof|membrane|shower\s*pan|tub\s*surround|install\s+vanity|relocat(e|ing|ion)|move\s+(drain|valve|supply))\b/.test(s)

  if (!isBath || !remodelSignals) return null

  // Prefer user measurements; else parse; else assume small bath floor area
  const bathFloorSqft =
  (args.measurements?.totalSqft && args.measurements.totalSqft > 0
    ? Number(args.measurements.totalSqft)
    : null) ??
  parseSqft(s) ??
  (args.fallbackFloorSqft && args.fallbackFloorSqft > 0
    ? Number(args.fallbackFloorSqft)
    : null) ??
  60

  const hasDemo = parseDemo(s)
  const hasWallTile = /\b(tile|wall\s*tile|shower\s*walls?|tub\s*surround)\b/.test(s)
  const hasWaterproof = /\b(waterproof|membrane|red\s*guard|pan|curb)\b/.test(s)
  const hasVanity = parseHasVanity(s)
  const hasValveRelocate = /\b(relocat(e|ing|ion)|move\s+(the\s*)?valve|relocate\s+valve)\b/.test(s)

  // Estimate shower wall tile sqft when wall-tile is mentioned
  // Typical: 3 walls * (5ft wide * 8ft high) ≈ 120 sqft
  const wallTileSqft = hasWallTile ? 120 : 0

  // ---- Tunable anchors (bath remodel wet-area) ----
  const laborRate = 115 // was 85 (too low)
  const markup = 25

  // Labor hours (rough but realistic)
  let laborHrs = 0
  laborHrs += hasDemo ? 16 : 10                         // demo + haul prep
  laborHrs += hasValveRelocate ? 10 : 0                 // open wall + relocate + test
  laborHrs += hasWaterproof ? 10 : 0                    // prep + membrane/paint-on + details
  laborHrs += hasWallTile ? Math.max(28, wallTileSqft * 0.30) : 0 // tile walls incl layout/cuts
  laborHrs += hasVanity ? 6 : 0                         // set vanity + hook-ups
  laborHrs += 10                                        // protection, cleanup, coordination, returns

  // Hard floor so remodels can't come out “one day”
  laborHrs = Math.max(70, laborHrs)

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // Materials allowances (mid-market; not luxury finishes)
  let materials = 0

// baseline remodel consumables / protection / patch / misc
materials += 450

// demo/protection allowance
materials += hasDemo ? 250 : 100

// plumbing/electrical rough misc baseline for remodel context
materials += 300

// waterproofing / wet-area prep
materials += hasWaterproof ? 350 : 200

// wall finish / tile allowance
materials += hasWallTile
  ? Math.max(900, wallTileSqft * 10)
  : 600

// vanity / fixture allowance
materials += hasVanity ? 250 : 200

materials = Math.round(materials)

  // Subs / overhead (dump + supervision + mobilization)
  const mobilization = 750
  const dumpFee = hasDemo ? 450 : 0
  const supervision = Math.round((labor + materials) * 0.10)
  const subs = mobilization + dumpFee + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function priceKitchenRefreshAnchor(args: {
  scope: string
  stateMultiplier: number
  measurements?: any | null
  fallbackFloorSqft?: number | null
}): Pricing | null {
  const s = args.scope.toLowerCase()

  const isKitchen = /\bkitchen\b/.test(s) || parseKitchenKeyword(s)
  if (!isKitchen) return null

  // If it's a total gut/layout change, skip this anchor (future “kitchen_remodel” anchor)
  const majorRemodel =
  /\b(remodel|renovation|demo|demolition|gut|rebuild|rebuild|full\s*replace|replace\s+all|move\s+wall|remove\s+wall|relocat(e|ing)\s+plumb|relocat(e|ing)\s+electrical|new\s+layout|structural)\b/.test(s)
  if (majorRemodel) return null

  // Size signal (you said it will usually exist in text or measurements)
  const sqft =
  (args.measurements?.totalSqft && args.measurements.totalSqft > 0
    ? Number(args.measurements.totalSqft)
    : null) ??
  parseSqft(s) ??
  (args.fallbackFloorSqft && args.fallbackFloorSqft > 0
    ? Number(args.fallbackFloorSqft)
    : null) ??
  225

  // Cabinet intent
  const newCabinets =
    /\b(new\s+cabinets?|install\s+cabinets?|replace\s+cabinets?)\b/.test(s)

  const repaintCabinets =
    /\b(repaint\s+cabinets?|paint\s+cabinets?|cabinet\s+repaint|refinish\s+cabinets?)\b/.test(s)

  const hasBacksplash = /\b(backsplash|tile\s+backsplash)\b/.test(s)
  const hasPaint = /\b(paint|painting|prime|primer|repaint)\b/.test(s)
  const hasSinkFaucet = /\b(sink|faucet)\b/.test(s)
  const hasFlooring = /\b(floor|flooring|lvp|vinyl\s+plank|laminate|hardwood|tile\s+floor)\b/.test(s)
  const hasDemo = parseDemo(s)

  // Flooring type (only if flooring is included)
  const floorIsTile = hasFlooring && /\b(tile|porcelain|ceramic)\b/.test(s)
  const floorIsLvp = hasFlooring && /\b(lvp|vinyl\s+plank|luxury\s+vinyl)\b/.test(s)
  const floorIsLam = hasFlooring && /\b(laminate)\b/.test(s)

  const laborRate = 95
  const markup = 25

  // ---- Labor (tunable) ----
  let laborHrs = 0
  laborHrs += hasDemo ? 10 : 5

  // Cabinets:
  if (newCabinets) laborHrs += 26
  if (repaintCabinets) laborHrs += 22

  // Backsplash + paint + sink
  laborHrs += hasBacksplash ? 14 : 0
  laborHrs += hasPaint ? 10 : 0
  laborHrs += hasSinkFaucet ? 4 : 0

  // Optional flooring in kitchen scope (use sqft)
  if (hasFlooring) {
    const installHrsPerSqft =
      floorIsTile ? 0.10 :
      (floorIsLvp || floorIsLam) ? 0.045 :
      0.05

    const demoHrsPerSqft = hasDemo ? 0.02 : 0
    laborHrs += sqft * (installHrsPerSqft + demoHrsPerSqft)
  }

  // Minimum baseline for a “kitchen refresh” coordination
  laborHrs = Math.max(28, laborHrs + 6)

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // ---- Materials allowances (mid-market) ----
  let materials = 0

  if (newCabinets) materials += 6500
  if (repaintCabinets) materials += 350

  if (hasBacksplash) materials += 750
  if (hasPaint) materials += 200
  if (hasSinkFaucet) materials += 450

  if (hasFlooring) {
    const matPerSqft =
      floorIsTile ? 6.5 :
      floorIsLvp ? 3.8 :
      floorIsLam ? 3.2 :
      4.0

    const underlaymentPerSqft = floorIsTile ? 0 : 0.6
    materials += Math.round(sqft * (matPerSqft + underlaymentPerSqft) + 180)
  }

  materials = Math.round(materials)

  // ---- Subs / overhead ----
  const mobilization = 500
  const dumpFee = hasDemo ? 300 : 0
  const supervision = Math.round((labor + materials) * 0.08)
  const subs = mobilization + dumpFee + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function priceKitchenRemodelAnchor(args: {
  scope: string
  stateMultiplier: number
  measurements?: any | null
  fallbackFloorSqft?: number | null
}): Pricing | null {
  const s = args.scope.toLowerCase()

  const isKitchen = /\bkitchen\b/.test(s) || parseKitchenKeyword(s)
  if (!isKitchen) return null

  // Must look like a remodel (not just a refresh)
  const remodelSignals =
    /\b(remodel|renovation|gut|demo|demolition|rebuild|full\s*replace|replace\s+all|new\s+layout)\b/.test(s)

  if (!remodelSignals) return null

  const sqft =
  (args.measurements?.totalSqft && args.measurements.totalSqft > 0
    ? Number(args.measurements.totalSqft)
    : null) ??
  parseSqft(s) ??
  (args.fallbackFloorSqft && args.fallbackFloorSqft > 0
    ? Number(args.fallbackFloorSqft)
    : null) ??
  225

  const hasCabinets =
    /\b(cabinets?|cabinetry|install\s+cabinets?|replace\s+cabinets?)\b/.test(s)
  const hasCounters =
    /\b(counter(top)?s?|countertop|quartz|granite|laminate\s+counter)\b/.test(s)
  const hasBacksplash = /\b(backsplash|tile\s+backsplash)\b/.test(s)
  const hasSinkFaucet = /\b(sink|faucet)\b/.test(s)
  const hasFlooring =
    /\b(floor|flooring|lvp|vinyl\s+plank|laminate|hardwood|tile\s+floor)\b/.test(s)
  const hasPaint = /\b(paint|painting|prime|primer|repaint)\b/.test(s)

  const hasDemo = parseDemo(s) || /\b(remove\s+existing|tear\s*out)\b/.test(s)

  const floorIsTile = hasFlooring && /\b(tile|porcelain|ceramic)\b/.test(s)
  const floorIsLvp = hasFlooring && /\b(lvp|vinyl\s+plank|luxury\s+vinyl)\b/.test(s)
  const floorIsLam = hasFlooring && /\b(laminate)\b/.test(s)

  const laborRate = 105
  const markup = 25

  let laborHrs = 0
  laborHrs += hasDemo ? 18 : 10
  laborHrs += hasCabinets ? 40 : 20
  laborHrs += hasCounters ? 10 : 6
  laborHrs += hasBacksplash ? 16 : 0
  laborHrs += hasPaint ? 12 : 0
  laborHrs += hasSinkFaucet ? 6 : 0

  if (hasFlooring) {
    const installHrsPerSqft =
      floorIsTile ? 0.12 :
      (floorIsLvp || floorIsLam) ? 0.05 :
      0.055
    const demoHrsPerSqft = hasDemo ? 0.03 : 0
    laborHrs += sqft * (installHrsPerSqft + demoHrsPerSqft)
  }

  laborHrs = Math.max(70, laborHrs + 10)

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  let materials = 0
  materials += hasCabinets ? 9500 : 3500
  materials += hasCounters ? 2800 : 900
  materials += hasBacksplash ? 900 : 0
  materials += hasSinkFaucet ? 600 : 0
  materials += hasPaint ? 250 : 0

  if (hasFlooring) {
    const matPerSqft =
      floorIsTile ? 7.0 :
      floorIsLvp ? 4.1 :
      floorIsLam ? 3.4 :
      4.2
    const underlaymentPerSqft = floorIsTile ? 0 : 0.7
    materials += Math.round(sqft * (matPerSqft + underlaymentPerSqft) + 250)
  }

  materials = Math.round(materials)

  const mobilization = 650
  const dumpFee = hasDemo ? 450 : 150
  const supervision = Math.round((labor + materials) * 0.10)
  const coordinationAllowance = 500

  const subs = mobilization + dumpFee + supervision + coordinationAllowance

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function priceElectricalDeviceSwapsAnchor(args: {
  scope: string
  stateMultiplier: number
}): Pricing | null {
  const s = args.scope.toLowerCase()

  // Must be device-level work (not panels/rewires)
  const isDeviceWork =
    /\b(outlet|receptacle|switch|recessed|can\s*light|light\s*fixture|fixture|sconce|device)\b/.test(s)

  const isHeavyElectrical =
    /\b(panel|service|rewire|new\s+circuit|rough[-\s]*in|subpanel|meter|trench)\b/.test(s)

  if (!isDeviceWork || isHeavyElectrical) return null

  // Require explicit counts (your real-world workflow)
  const breakdown = parseElectricalDeviceBreakdown(s)
  if (!breakdown) return null

  const laborRate = 115
  const markup = 25

  const isAddWork =
  /\b(add|adding|install(ing)?|new\s+(circuit|run|line|home\s*run)|rough[-\s]*in)\b/.test(s)

const isSwapWork =
  /\b(replace|replacing|swap|swapping|change\s*out|remove\s+and\s+replace)\b/.test(s)

// If it explicitly says swap/replace, treat as swap even if “install” appears
const treatAsAdd = isAddWork && !isSwapWork

const hrsPerOutlet = treatAsAdd ? 0.85 : 0.45
const hrsPerSwitch = treatAsAdd ? 0.75 : 0.40
const hrsPerRecessed = treatAsAdd ? 1.10 : 0.70
const hrsPerFixture = treatAsAdd ? 0.95 : 0.65

  const troubleshootingAllowanceHrs =
    /\b(troubleshoot|not\s+working|diagnos)\b/.test(s) ? 1.5 : 0

  const laborHrs =
    breakdown.outlets * hrsPerOutlet +
    breakdown.switches * hrsPerSwitch +
    breakdown.recessed * hrsPerRecessed +
    breakdown.fixtures * hrsPerFixture +
    troubleshootingAllowanceHrs +
    1.25 // setup, protection, testing

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // Materials allowance per device (mid-market, not luxury fixtures)
  const matPerOutlet = 16
  const matPerSwitch = 14
  const matPerRecessed = 28
  const matPerFixture = 22

  const materials = Math.round(
    breakdown.outlets * matPerOutlet +
      breakdown.switches * matPerSwitch +
      breakdown.recessed * matPerRecessed +
      breakdown.fixtures * matPerFixture
  )

  const mobilization =
    breakdown.total <= 6 ? 225 :
    breakdown.total <= 15 ? 325 :
    450

  const supervision = Math.round((labor + materials) * 0.05)
  const subs = mobilization + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function priceFlooringOnlyAnchor(args: {
  scope: string
  stateMultiplier: number
  measurements?: any | null
  fallbackSqft?: number | null
}): Pricing | null {
  const s = args.scope.toLowerCase()

  // Must be flooring-ish
  const isFlooring = parseFlooringKeyword(s)
  if (!isFlooring) return null

  // Don’t let it catch wall tile / shower surround
  if (parseWallTileKeyword(s)) return null
  if (parseBathKeyword(s) && /\b(shower|tub)\b/.test(s)) return null

  // Sqft: prefer measurements.totalSqft, then parse, then default
  const sqft =
  (args.measurements?.totalSqft && args.measurements.totalSqft > 0
    ? Number(args.measurements.totalSqft)
    : null) ??
  parseSqft(s) ??
  (args.fallbackSqft && args.fallbackSqft > 0 ? Number(args.fallbackSqft) : null) ??
  180

  // Demo signal
  const hasDemo =
    parseDemo(s) || /\b(remove\s+existing|tear\s*out|haul\s*away|dispose)\b/.test(s)

  // Material class
  const isTile = /\b(tile|porcelain|ceramic)\b/.test(s) && /\bfloor\b/.test(s)
  const isHardwood = /\b(hardwood|engineered\s*wood)\b/.test(s)
  const isLaminate = /\b(laminate)\b/.test(s)
  const isCarpet = /\b(carpet)\b/.test(s)
  const isLvp = /\b(lvp|vinyl\s+plank|luxury\s+vinyl)\b/.test(s)

  const laborRate = 85
  const markup = 25

  // Labor hours per sqft (tunable)
  const installHrsPerSqft =
    isTile ? 0.12 :
    isHardwood ? 0.09 :
    isCarpet ? 0.06 :
    (isLaminate || isLvp) ? 0.05 :
    0.06

  const demoHrsPerSqft = hasDemo ? 0.03 : 0
  const baseHrs = sqft * (installHrsPerSqft + demoHrsPerSqft) + 8 // protection/transitions/cleanup

  let labor = Math.round(baseHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  // Materials allowance per sqft (mid-market)
  const matPerSqft =
    isTile ? 6.5 :
    isHardwood ? 7.5 :
    isCarpet ? 4.0 :
    isLaminate ? 3.2 :
    isLvp ? 3.8 :
    4.0

  const underlaymentPerSqft = isTile ? 0.0 : 0.6
  const transitionAllowance = 160

  const materials = Math.round(sqft * (matPerSqft + underlaymentPerSqft) + transitionAllowance)

  const mobilization = 400
  const dumpFee = hasDemo ? 300 : 0
  const supervision = Math.round((labor + materials) * 0.06)
  const subs = mobilization + dumpFee + supervision

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function pricePlumbingFixtureSwapsAnchor(args: {
  scope: string
  stateMultiplier: number
}): Pricing | null {
  const s = args.scope.toLowerCase()

  // Must be fixture-level work
  const isFixtureWork =
  /\b(toilet|commode|faucet|sink|vanity|shower\s*valve|mixing\s*valve|diverter|cartridge|trim\s*kit)\b/.test(s)

  // Exclude high-variance plumbing
  const isHeavyPlumbing = hasHeavyPlumbingSignals(s)
  // Exclude remodel scopes (should be handled elsewhere)
  const isRemodelScope =
    /\b(remodel|renovation|gut|rebuild|demo|demolition)\b/.test(s)

  if (!isFixtureWork || isHeavyPlumbing || isRemodelScope) return null

  // Require explicit counts
  const breakdown = parsePlumbingFixtureBreakdown(s)
  if (!breakdown) return null

  const laborRate = 125
  const markup = 25

  const isAddWork = /\b(add|adding|install(ing)?|new)\b/.test(s)
  const isSwapWork = /\b(replace|replacing|swap|swapping|remove\s+and\s+replace)\b/.test(s)
  const treatAsAdd = isAddWork && !isSwapWork

  // Tunable hours per fixture
  const hrsPerToilet = treatAsAdd ? 2.25 : 1.75
  const hrsPerFaucet = treatAsAdd ? 1.6 : 1.1
  const hrsPerSink = treatAsAdd ? 2.25 : 1.5
  const hrsPerVanity = treatAsAdd ? 5.5 : 4.25
  const hrsPerShowerValve = treatAsAdd ? 5.0 : 3.75

  const troubleshootHrs =
    /\b(leak|leaking|clog|clogged|diagnos|troubleshoot|not\s+working)\b/.test(s)
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

  // Mid-market supplies allowance per fixture (NOT the fixture itself)
  const matPerToilet = 85
  const matPerFaucet = 45
  const matPerSink = 65
  const matPerVanity = 140
  const matPerShowerValve = 95

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

  return { labor, materials, subs, markup, total }
}

function isPlumbingRemodelConflict(args: {
  scopeText: string
  complexity: ComplexityProfile | null
}): boolean {
  const s = (args.scopeText || "").toLowerCase()
  const cp = args.complexity

  const isBath =
    /\b(bath|bathroom|shower|tub)\b/.test(s)

  const remodelSignals =
    /\b(remodel|renovation|gut|rebuild|demo|demolition|tear\s*out)\b/.test(s)

  // “Not plumbing-only” signals (tile/wet-area/finish coordination)
  const nonPlumbingSignals =
    /\b(tile|wall\s*tile|tub\s*surround|shower\s+walls?|backsplash|waterproof|membrane|red\s*guard|cement\s*board|durock|hardie(backer)?|thinset|grout)\b/.test(s)

  // Rough-in / relocation is often part of remodel and should not be priced as “only plumbing”
  const relocateSignals =
    /\b(rough[-\s]*in|relocat(e|ing|ion)|move\s+(drain|supply|valve|line))\b/.test(s)

  // If complexity already classified as remodel/multiTrade, trust it
  const cpSaysRemodel = cp?.class === "remodel" || cp?.multiTrade === true

  // Conflict means: bathroom remodel patterns present + not plumbing-only
  return isBath && (remodelSignals || cpSaysRemodel) && (nonPlumbingSignals || relocateSignals)
}

const PRICEGUARD_ANCHORS: PricingAnchor[] = [
  
  // 1) Kitchen refresh (before bathroom so it doesn’t get “general renovation” collisions later)
  {
  id: "kitchen_remodel_v1",
  when: (ctx) => {
    const s = ctx.scope.toLowerCase()
    const isKitchen = /\bkitchen\b/.test(s) || parseKitchenKeyword(s)
    if (!isKitchen) return false

    return /\b(remodel|renovation|gut|demo|demolition|rebuild|full\s*replace|replace\s+all|new\s+layout)\b/.test(s)
  },
  price: (ctx) =>
  priceKitchenRemodelAnchor({
    scope: ctx.scope,
    stateMultiplier: ctx.stateMultiplier,
    measurements: ctx.measurements,
    fallbackFloorSqft: ctx.photoFloorSqft ?? null,
  }),
},
  
  {
    id: "kitchen_refresh_v1",
    when: (ctx) => /\bkitchen\b/i.test(ctx.scope) || parseKitchenKeyword(ctx.scope),
    price: (ctx) =>
  priceKitchenRefreshAnchor({
    scope: ctx.scope,
    stateMultiplier: ctx.stateMultiplier,
    measurements: ctx.measurements,
    fallbackFloorSqft: ctx.photoFloorSqft ?? null,
  }),
  },

  // 2) Bathroom remodel
  {
    id: "bathroom_remodel_v1",
    when: (ctx) => /\b(bath|bathroom|shower|tub)\b/i.test(ctx.scope),
    price: (ctx) =>
  priceBathroomRemodelAnchor({
    scope: ctx.scope,
    stateMultiplier: ctx.stateMultiplier,
    measurements: ctx.measurements,
    fallbackFloorSqft: ctx.photoFloorSqft ?? null,
  }),
  },

  // 3) Flooring-only
{
  id: "flooring_only_v1",
  when: (ctx) => {
    // ✅ Flooring trade should be handled by the flooring deterministic engine,
    // not by this generic anchor.
    if (ctx.trade === "flooring") return false

    const s = ctx.scope.toLowerCase()

    // Only trigger this anchor when flooring is IMPLIED inside another trade
    // (ex: kitchen refresh mentions flooring, general renovation mentions flooring, etc.)
    const mentionsFlooring =
      /\b(floor|flooring|lvp|vinyl\s+plank|laminate|hardwood|carpet|tile\s+floor)\b/.test(s)

    if (!mentionsFlooring) return false

    // Exclude *remodel* signals, not just the words kitchen/bath
    const looksLikeKitchenRemodel =
      (/\bkitchen\b/.test(s) || parseKitchenKeyword(s)) &&
      /\b(remodel|renovation|gut|cabinets?|counter(top)?|backsplash|sink)\b/.test(s)

    const looksLikeBathRemodel =
      (/\b(bath|bathroom)\b/.test(s) || parseBathKeyword(s)) &&
      /\b(remodel|renovation|gut|shower|tub|vanity|tile\s+walls?|surround)\b/.test(s)

    return !looksLikeKitchenRemodel && !looksLikeBathRemodel
  },
  price: (ctx) =>
  priceFlooringOnlyAnchor({
    scope: ctx.scope,
    stateMultiplier: ctx.stateMultiplier,
    measurements: ctx.measurements,
    fallbackSqft: ctx.photoFloorSqft ?? null,
  }),
},

// 4) Plumbing fixture swaps (strict, count-based)
{
  id: "plumbing_fixture_swaps_v1",
  when: (ctx) => {
  const s = ctx.scope.toLowerCase()

  // Must mention plumbing fixtures
  const hasFixtureWords =
    /\b(toilet|commode|faucet|sink|vanity|shower\s*valve|mixing\s*valve|diverter|cartridge|trim\s*kit)\b/.test(s)
  if (!hasFixtureWords) return false

  // Require explicit counts
  const breakdown = parsePlumbingFixtureBreakdown(s)
  if (!breakdown) return false

  // HARD plumbing signals (always block)
  const heavySignals = hasHeavyPlumbingSignals(s)

  // General remodel signals (non-fixture scope)
  const remodelSignals =
    /\b(remodel|renovation|gut|rebuild|demo|demolition|tile|backsplash|cabinets?|counter(top)?|shower\s+walls?|tub\s+surround)\b/.test(s)

  // SOFT bath-build block
  const mentionsBathWetArea =
    /\b(shower|tub|bath|bathroom|tub\s*surround)\b/.test(s)

  const bathBuildSignals =
    /\b(tile|wall\s*tile|shower\s*walls?|tub\s*surround|surround|pan|shower\s*pan|curb|waterproof|membrane|red\s*guard|backer\s*board|cement\s*board|hardie(backer)?|durock|mud\s*bed|thinset|grout|demo|demolition|tear\s*out|gut|rebuild|rough[-\s]*in|relocat(e|ion|ing)|move\s+(drain|valve|supply)|new\s+(shower|tub)|convert|conversion)\b/.test(s)

  const valveRelocation =
    /\b(valve\s*relocation|relocat(e|ing)\s+(the\s*)?valve|move\s+(the\s*)?valve)\b/.test(s)

  const softBathBuildBlock =
    mentionsBathWetArea && (bathBuildSignals || valveRelocation)

  return !heavySignals && !remodelSignals && !softBathBuildBlock
},
  price: (ctx) =>
    pricePlumbingFixtureSwapsAnchor({
      scope: ctx.scope,
      stateMultiplier: ctx.stateMultiplier,
    }),
},
  
  // 5) Electrical device swaps (strict, count-based)
  {
  id: "electrical_device_swaps_v1",
  when: (ctx) => {

    const s = ctx.scope.toLowerCase()

    const hasDeviceWords =
      /\b(outlet|receptacle|switch|recessed|can\s*light|light\s*fixture|fixture|sconce|devices?)\b/.test(s)

    const hasRemodelSignals =
      /\b(remodel|renovation|gut|demo|tile|vanity|toilet|shower|tub|kitchen|cabinets?|counter(top)?|backsplash)\b/.test(s)

    return hasDeviceWords && !hasRemodelSignals
  },
  price: (ctx) =>
    priceElectricalDeviceSwapsAnchor({
      scope: ctx.scope,
      stateMultiplier: ctx.stateMultiplier,
    }),
},
]

function runPriceGuardAnchors(ctx: AnchorContext): AnchorResult | null {
  for (const a of PRICEGUARD_ANCHORS) {
    if (!a.when(ctx)) continue
    const pricing = a.price(ctx)
    if (pricing) return { id: a.id, pricing }
  }
  return null
}

// 🧠 Estimate vs Change Order intent hint
function detectIntent(scope: string): string {
  const s = scope.toLowerCase()

  if (
    /(change order|additional work|not included|modify|revision|per original contract)/.test(
      s
    )
  ) {
    return "Likely a Change Order"
  }

  if (
    /(estimate|proposal|pricing for|quote|new work|anticipated work)/.test(s)
  ) {
    return "Likely an Estimate"
  }

  return "Unclear — could be either"
}

function parseRoomCount(text: string): number | null {
  const t = text.toLowerCase()

  const patterns = [
    /paint\s+(\d{1,6})\s+rooms?/i,
    /(\d{1,6})\s+rooms?/i,
    /rooms?\s*[:\-]\s*(\d{1,6})/i,
    /(\d{1,6})\s+guest\s+rooms?/i,
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

function parseDoorCount(text: string): number | null {
  const t = text.toLowerCase()

  const patterns = [
    // paint 12 doors / paint 12 interior doors / paint 12 prehung interior doors
    /paint\s+(\d{1,4})\s+(?:\w+\s+){0,2}doors?\b/i,

    // 12 doors / 12 interior doors / 12 prehung interior doors
    /(\d{1,4})\s+(?:\w+\s+){0,2}doors?\b/i,

    // doors: 12 / doors - 12
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

function parseRoomDims(text: string) {
  // 12x12 or 12 x 12
  const m = text.toLowerCase().match(/(\d{1,3})\s*x\s*(\d{1,3})/)
  const lengthFt = m ? Number(m[1]) : 14
  const widthFt = m ? Number(m[2]) : 25

  // 8 ft ceilings / 8' ceilings
  const h = text.toLowerCase().match(/(\d{1,2})\s*(ft|')\s*(ceiling|ceilings|high)/)
  const heightFt = h ? Number(h[1]) : 8.5

  return { lengthFt, widthFt, heightFt }
}

function getStateAbbrev(rawState: string) {
  const s = (rawState || "").trim()
  const up = s.toUpperCase()
  if (/^[A-Z]{2}$/.test(up)) return up

  const map: Record<string, string> = {
    CALIFORNIA: "CA",
    "NEW YORK": "NY",
    TEXAS: "TX",
    FLORIDA: "FL",
    WASHINGTON: "WA",
    MASSACHUSETTS: "MA",
    "NEW JERSEY": "NJ",
    COLORADO: "CO",
    ARIZONA: "AZ",
  }
  return map[up] || ""
}

function getStateLaborMultiplier(stateAbbrev: string) {
  const STATE_LABOR_MULTIPLIER: Record<string, number> = {
    AL: 0.98, AK: 1.10, AZ: 1.02, AR: 0.97, CA: 1.25, CO: 1.12, CT: 1.18,
    DE: 1.10, FL: 1.03, GA: 1.02, HI: 1.30, ID: 1.00, IL: 1.10, IN: 1.00,
    IA: 0.98, KS: 0.98, KY: 0.97, LA: 0.99, ME: 1.05, MD: 1.15, MA: 1.18,
    MI: 1.03, MN: 1.04, MS: 0.96, MO: 0.99, MT: 1.00, NE: 0.99, NV: 1.08,
    NH: 1.08, NJ: 1.20, NM: 0.98, NY: 1.22, NC: 1.01, ND: 1.00, OH: 1.00,
    OK: 0.98, OR: 1.12, PA: 1.05, RI: 1.15, SC: 1.00, SD: 0.99, TN: 1.00,
    TX: 1.05, UT: 1.03, VT: 1.06, VA: 1.08, WA: 1.15, WV: 0.96, WI: 1.02,
    WY: 1.00, DC: 1.30,
  }

  return STATE_LABOR_MULTIPLIER[stateAbbrev] ?? 1
}

function pricePaintingRooms(args: {
  scope: string
  rooms: number
  stateMultiplier: number
  paintScope: "walls" | "walls_ceilings" | "full"
}): Pricing {
  const s = args.scope.toLowerCase()
  const { lengthFt, widthFt, heightFt } = parseRoomDims(args.scope)

  const coatsMatch = s.match(/(\d)\s*coats?/)
  const coats = coatsMatch ? Math.max(1, Number(coatsMatch[1])) : 2

  // ✅ authoritative scope comes from dropdown
  const includeCeilings = args.paintScope !== "walls"
  const includeTrimDoors = args.paintScope === "full"

  const perimeter = 2 * (lengthFt + widthFt)
  const wallArea = perimeter * heightFt
  const ceilingArea = includeCeilings ? lengthFt * widthFt : 0

  const sqftPerRoomPerCoat = wallArea + ceilingArea
  const paintSqftPerRoom = sqftPerRoomPerCoat * coats

  // ---- tunable knobs ----
  const sqftPerLaborHour = 140
  const laborRate = 75
  const coverageSqftPerGallon = 325
  const paintCostPerGallon = 28
  const wasteFactor = 1.12
  const patchingPerRoom = /patch|patching/.test(s) ? 25 : 0
  const consumablesPerRoom = 18
  const markup = 25
  const setupHoursPerRoom = 1.25

  const trimDoorLaborHoursPerRoom = includeTrimDoors ? 0.75 : 0
  const trimDoorMaterialsPerRoom = includeTrimDoors ? 12 : 0
  // -----------------------

  const laborHoursTotal =
    (paintSqftPerRoom * args.rooms) / sqftPerLaborHour +
    setupHoursPerRoom * args.rooms +
    trimDoorLaborHoursPerRoom * args.rooms

  let labor = Math.round(laborHoursTotal * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const gallonsTotal =
    ((paintSqftPerRoom * args.rooms) / coverageSqftPerGallon) * wasteFactor

  const paintCost = Math.round(gallonsTotal * paintCostPerGallon)
  const patchCost = args.rooms * patchingPerRoom
  const consumables = args.rooms * consumablesPerRoom

  const materials =
    paintCost + patchCost + consumables + (trimDoorMaterialsPerRoom * args.rooms)

  const mobilization =
  args.rooms <= 2 ? 250 :
  args.rooms <= 5 ? 450 :
  args.rooms <= 10 ? 750 :
  1200
  const supervisionPct = args.rooms >= 50 ? 0.10 : 0.06
  const supervision = Math.round((labor + materials) * supervisionPct)

  const subs = mobilization + supervision
  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function pricePaintingDoors(args: {
  doors: number
  stateMultiplier: number
  includeDoorTrim?: boolean
  explicitTrimRequested?: boolean
}): Pricing {
  const laborRate = 75
  const markup = 25

  // Door slab baseline
  const laborHoursPerDoor = 0.9
  const materialPerDoor = 18

  // Door casing/frames baseline (DEFAULT ON for doors-only)
  const trimLaborHoursPerDoor = args.includeDoorTrim ? 0.35 : 0
  const trimMaterialPerDoor = args.includeDoorTrim ? 6 : 0

  // Optional bump if user explicitly mentions trim/casing/frames (small extra allowance)
  const explicitTrimBumpLaborHrsPerDoor = args.explicitTrimRequested ? 0.15 : 0
  const explicitTrimBumpMatPerDoor = args.explicitTrimRequested ? 2 : 0

  let laborHours =
    args.doors * (laborHoursPerDoor + trimLaborHoursPerDoor + explicitTrimBumpLaborHrsPerDoor)

  let labor = Math.round(laborHours * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const materials = Math.round(
    args.doors * (materialPerDoor + trimMaterialPerDoor + explicitTrimBumpMatPerDoor)
  )

  const subs = args.doors <= 6 ? 200 : 350

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function pricePaintingByPhotoSqft(args: {
  wallSqft: number
  ceilingSqft?: number | null
  stateMultiplier: number
  paintScope: "walls" | "walls_ceilings" | "full"
}): Pricing {
  const laborRate = 75
  const markup = 25

  const wallSqft = Math.max(0, Number(args.wallSqft || 0))
  const ceilingSqft =
    args.paintScope !== "walls"
      ? Math.max(0, Number(args.ceilingSqft || 0))
      : 0

  const totalPaintSqft = wallSqft + ceilingSqft

  const sqftPerLaborHour =
    args.paintScope === "full" ? 110 :
    args.paintScope === "walls_ceilings" ? 125 :
    140

  const laborHours = totalPaintSqft / sqftPerLaborHour + 4
  let labor = Math.round(laborHours * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const coverageSqftPerGallon = 325
  const wasteFactor = 1.12
  const paintCostPerGallon = 28
  const gallons = (totalPaintSqft / coverageSqftPerGallon) * wasteFactor

  const materials =
    Math.round(gallons * paintCostPerGallon) + 85

  const subs =
    totalPaintSqft <= 250 ? 250 :
    totalPaintSqft <= 600 ? 400 :
    650

  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  return { labor, materials, subs, markup, total }
}

function parseLinearFt(text: string): number | null {
  const t = String(text || "").toLowerCase()

  const m =
    t.match(/(\d{1,5})\s*(linear\s*ft|linear\s*feet|lin\s*ft|lf)\b/) ||
    t.match(/(\d{1,5})\s*(ft|feet)\s+of\s+(?:base|baseboard|trim)\b/)

  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function estimateBaseboardLfFromFloorSqft(floorSqft: number | null): number | null {
  if (!floorSqft || floorSqft <= 0) return null

  // Practical fallback for average residential perimeter coverage
  const estimated = Math.round(floorSqft * 0.38)

  return Math.max(120, Math.min(900, estimated))
}

function priceBaseboardCarpentrySimple(args: {
  scopeText: string
  stateMultiplier: number
  floorSqft: number | null
}): {
  pricing: Pricing
  laborRate: number
  crewDays: number
  mobilization: number
  notes: string[]
} | null {
  const s = (args.scopeText || "").toLowerCase()

  if (!/\b(baseboard|baseboards|base board|trim)\b/.test(s)) {
    return null
  }

  const lf =
    parseLinearFt(args.scopeText) ??
    estimateBaseboardLfFromFloorSqft(args.floorSqft)

  if (!lf || lf <= 0) return null

  const laborRate = 90
  const markup = 25

  const installHrsPerLf = 0.045
  const setupHrs = lf <= 200 ? 2.5 : lf <= 450 ? 4 : 5.5

  const laborHrs = lf * installHrsPerLf + setupHrs

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const materialsPerLf = 1.75
  const misc = lf <= 250 ? 85 : 140
  const materials = Math.round(lf * materialsPerLf + misc)

  const mobilization =
    lf <= 200 ? 275 :
    lf <= 450 ? 425 :
    575

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
    notes: [
      `Baseboard scope priced from ${lf} LF.`,
    ],
  }
}

function priceTexturePatchSimple(args: {
  scopeText: string
  stateMultiplier: number
  wholeJobSqft: number | null
}): {
  pricing: Pricing
  laborRate: number
  crewDays: number
  mobilization: number
  notes: string[]
} | null {
  const s = (args.scopeText || "").toLowerCase()

  if (!/\b(texture|orange\s*peel|knockdown|patch\s*texture|retexture)\b/.test(s)) {
    return null
  }

  const explicitSqft = parseSqft(args.scopeText)

  const patchSqft =
    explicitSqft ??
    (args.wholeJobSqft && args.wholeJobSqft > 0
      ? Math.max(100, Math.min(350, Math.round(args.wholeJobSqft * 0.12)))
      : 150)

  const laborRate = 70
  const markup = 25

  const hrsPerSqft = 0.08
  const setupHrs = 2.5
  const laborHrs = patchSqft * hrsPerSqft + setupHrs

  let labor = Math.round(laborHrs * laborRate)
  labor = Math.round(labor * args.stateMultiplier)

  const materialsPerSqft = 1.1
  const materials = Math.round(patchSqft * materialsPerSqft + 60)

  const mobilization =
    patchSqft <= 150 ? 225 :
    patchSqft <= 250 ? 325 :
    425

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
    notes: [
      explicitSqft
        ? `Texture scope priced from explicit ${patchSqft} sqft.`
        : `Texture scope priced from estimated ${patchSqft} sqft patch area.`,
    ],
  }
}

function buildCombinedEstimateBasisFromTrades(
  perTrade: MultiTradeDetTradeResult[]
): EstimateBasis | null {
  if (!perTrade.length) return null

  let totalLabor = 0
  let totalHours = 0
  let totalCrewDays = 0
  let totalSubs = 0

  for (const item of perTrade) {
    totalLabor += Number(item.pricing.labor || 0)
    totalCrewDays += Number(item.crewDays || 0)
    totalSubs += Number(item.pricing.subs || 0)

    if (item.laborRate > 0) {
      totalHours += Number(item.pricing.labor || 0) / item.laborRate
    }
  }

  const laborRate =
    totalHours > 0
      ? Math.round(totalLabor / totalHours)
      : 95

  const crewDays = Math.max(1, Math.round(totalCrewDays * 2) / 2)

  return {
    units: ["days"],
    quantities: {
      days: crewDays,
    },
    laborRate,
    hoursPerUnit: 0,
    crewDays,
    mobilization: Math.round(totalSubs),
    assumptions: [
      "Multi-trade estimate combined from split scope pricing.",
      ...perTrade.map((x) => `${x.trade}: ${x.source}`),
    ],
  }
}

function computeMultiTradeDeterministic(args: {
  splitScopes: SplitScopeItem[]
  fullScopeText: string
  stateMultiplier: number
  measurements?: any | null
  paintScope?: PaintScope | null
}): MultiTradeDeterministicResult {
  const pieces = (args.splitScopes || []).filter(
    (x) => x && typeof x.scope === "string" && x.scope.trim()
  )

  if (pieces.length < 2) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      perTrade: [],
      notes: ["Not enough split scopes for multi-trade pricing."],
    }
  }

  const overallSqft =
    (args.measurements?.totalSqft && Number(args.measurements.totalSqft) > 0
      ? Number(args.measurements.totalSqft)
      : null) ??
    parseSqft(args.fullScopeText)

  const perTrade: MultiTradeDetTradeResult[] = []
  const notes: string[] = []
  let pricedCount = 0

  for (const piece of pieces) {
    const trade = String(piece.trade || "").toLowerCase().trim()
    const scope = String(piece.scope || "").trim()

    if (!trade || !scope) continue

        if (trade === "flooring") {
      const det = computeFlooringDeterministic({
        scopeText: scope,
        stateMultiplier: args.stateMultiplier,
        measurements:
          overallSqft && overallSqft > 0
            ? { totalSqft: overallSqft }
            : args.measurements ?? null,
      })

      if (det?.okForDeterministic && det.pricing) {
        const flooringPricing = clampPricing(coercePricing(det.pricing))
        const flooringLaborRate = 85
        const flooringLaborHours =
          flooringLaborRate > 0 ? Number(flooringPricing.labor || 0) / flooringLaborRate : 0

        let flooringCrewDays =
          flooringLaborHours <= 8 ? 1 :
          flooringLaborHours <= 16 ? 2 :
          flooringLaborHours <= 24 ? 3 :
          Math.ceil(flooringLaborHours / 8)

        flooringCrewDays = Math.max(1, Math.round(flooringCrewDays * 2) / 2)

        perTrade.push({
          trade,
          scope,
          pricing: flooringPricing,
          laborRate: flooringLaborRate,
          crewDays: flooringCrewDays,
          source: det.okForVerified ? "flooring_engine_v1_verified" : "flooring_engine_v1",
          notes: det.notes || [],
        })
        pricedCount++
        continue
      }

      notes.push(`Unable to deterministically price flooring split: ${scope}`)
      continue
    }

    if (trade === "painting") {
      const det = computePaintingDeterministic({
        scopeText:
          overallSqft && !parseSqft(scope)
            ? `${scope} ${overallSqft} square feet`
            : scope,
        stateMultiplier: args.stateMultiplier,
        measurements:
          overallSqft && overallSqft > 0
            ? { totalSqft: overallSqft }
            : args.measurements ?? null,
        paintScope: args.paintScope ?? "walls",
      })

      if (det?.okForDeterministic && det.pricing) {
        perTrade.push({
          trade,
          scope,
          pricing: clampPricing(coercePricing(det.pricing)),
          laborRate: Number(det.estimateBasis?.laborRate || 75),
          crewDays: Number(det.estimateBasis?.crewDays ?? det.estimateBasis?.quantities?.days ?? 1),
          source: det.okForVerified ? "painting_engine_v1_verified" : "painting_engine_v1",
          notes: det.notes || [],
        })
        pricedCount++
        continue
      }

      notes.push(`Unable to deterministically price painting split: ${scope}`)
      continue
    }

        if (trade === "drywall") {
      const det = computeDrywallDeterministic({
        scopeText: scope,
        stateMultiplier: args.stateMultiplier,
        measurements:
          overallSqft && overallSqft > 0
            ? { totalSqft: overallSqft }
            : args.measurements ?? null,
      })

      if (det?.okForDeterministic && det.pricing) {
        const drywallPricing = clampPricing(coercePricing(det.pricing))
        const drywallLaborRate = 70
        const drywallLaborHours =
          drywallLaborRate > 0
            ? Number(drywallPricing.labor || 0) / drywallLaborRate
            : 0

        let drywallCrewDays =
          drywallLaborHours <= 8 ? 1 :
          drywallLaborHours <= 16 ? 2 :
          drywallLaborHours <= 24 ? 3 :
          Math.ceil(drywallLaborHours / 8)

        drywallCrewDays = Math.max(1, Math.round(drywallCrewDays * 2) / 2)

        perTrade.push({
          trade,
          scope,
          pricing: drywallPricing,
          laborRate: drywallLaborRate,
          crewDays: drywallCrewDays,
          source: det.okForVerified ? "drywall_engine_v1_verified" : "drywall_engine_v1",
          notes: det.notes || [],
        })
        pricedCount++
        continue
      }

      notes.push(`Unable to deterministically price drywall split: ${scope}`)
      continue
    }

    if (trade === "carpentry") {
      const det = priceBaseboardCarpentrySimple({
        scopeText: scope,
        stateMultiplier: args.stateMultiplier,
        floorSqft: overallSqft ?? null,
      })

      if (det?.pricing) {
        perTrade.push({
          trade,
          scope,
          pricing: det.pricing,
          laborRate: det.laborRate,
          crewDays: det.crewDays,
          source: "carpentry_baseboard_simple_v1",
          notes: det.notes,
        })
        pricedCount++
        continue
      }

      notes.push(`Unable to deterministically price carpentry split: ${scope}`)
      continue
    }

    if (trade === "texture") {
      const det = priceTexturePatchSimple({
        scopeText: scope,
        stateMultiplier: args.stateMultiplier,
        wholeJobSqft: overallSqft ?? null,
      })

      if (det?.pricing) {
        perTrade.push({
          trade,
          scope,
          pricing: det.pricing,
          laborRate: det.laborRate,
          crewDays: det.crewDays,
          source: "texture_patch_simple_v1",
          notes: det.notes,
        })
        pricedCount++
        continue
      }

      notes.push(`Unable to deterministically price texture split: ${scope}`)
      continue
    }

    notes.push(`No deterministic handler for split trade: ${trade}`)
  }

  if (!perTrade.length) {
    return {
      okForDeterministic: false,
      okForVerified: false,
      pricing: null,
      estimateBasis: null,
      perTrade: [],
      notes: ["No split scopes were priced deterministically.", ...notes],
    }
  }

  const labor = perTrade.reduce((sum, x) => sum + Number(x.pricing.labor || 0), 0)
  const materials = perTrade.reduce((sum, x) => sum + Number(x.pricing.materials || 0), 0)
  const subs = perTrade.reduce((sum, x) => sum + Number(x.pricing.subs || 0), 0)
  const markup = 25
  const base = labor + materials + subs
  const total = Math.round(base * (1 + markup / 100))

  const estimateBasis = buildCombinedEstimateBasisFromTrades(perTrade)

  const allPiecesPriced = pricedCount === pieces.length

const allPiecesVerified =
  allPiecesPriced &&
  perTrade.every((x) => /_verified$/.test(x.source))

return {
  okForDeterministic: allPiecesPriced,
  okForVerified: allPiecesVerified,
  pricing: clampPricing({ labor, materials, subs, markup, total }),
  estimateBasis,
  perTrade,
  notes: [
    `Priced ${pricedCount}/${pieces.length} split scopes deterministically.`,
    ...notes,
    ...perTrade.flatMap((x) => x.notes || []),
  ],
}
}

// -----------------------------
// API HANDLER
// -----------------------------
export async function POST(req: NextRequest) {
  try {
    
  if (!assertSameOrigin(req)) {
    return jsonError(403, "BAD_ORIGIN", "Invalid request origin.")
  }

  // Parse JSON with an actual byte limit (stream-safe)
let raw: any
try {
  raw = await readJsonWithLimit<any>(req, 25_000_000)
} catch (e: any) {
  if (e?.status === 413) {
    return jsonError(413, "BODY_TOO_LARGE", "Request too large.")
  }
  return jsonError(400, "BAD_JSON", "Invalid JSON body.")
}

const headerKey = req.headers.get("x-idempotency-key")?.trim()
const bodyKey =
  typeof raw?.requestId === "string"
    ? raw.requestId.trim()
    : ""

const requestId = headerKey || bodyKey || crypto.randomUUID()

// Only cache if client actually provided an idempotency key
const cacheEligible = !!(headerKey || bodyKey)

  const inputParsed = GenerateSchema.safeParse(raw)
if (!inputParsed.success) {
  console.log("BAD_INPUT issues:", inputParsed.error.issues)
  return NextResponse.json(
    {
      ok: false,
      code: "BAD_INPUT",
      message: "Invalid request fields.",
      issues: inputParsed.error.issues,
    },
    { status: 400 }
  )
}

const body = inputParsed.data

const workDaysPerWeek = clampWorkDaysPerWeek(body.workDaysPerWeek)

  body.scopeChange = cleanScopeText(body.scopeChange)

  const normalizedEmail = body.email.trim().toLowerCase()

  // -----------------------------
// IDEMPOTENCY REPLAY (FULL RESPONSE)
// -----------------------------
if (cacheEligible && requestId && normalizedEmail) {
  const cached = await tryGetCachedResult({ email: normalizedEmail, requestId })
  if (cached) return NextResponse.json(cached)
}

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const rl1 = rateLimit(`gen:ip:${ip}`, 20, 60_000)
  if (!rl1.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT",
        message: "Too many requests.",
        retry_after: Math.ceil((rl1.resetAt - Date.now()) / 1000),
      },
      { status: 429 }
    )
  }

  const rl2 = rateLimit(`gen:email:${normalizedEmail}`, 12, 60_000)
  if (!rl2.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT",
        message: "Too many requests.",
        retry_after: Math.ceil((rl2.resetAt - Date.now()) / 1000),
      },
      { status: 429 }
    )
  }
    const measurements = body.measurements ?? null
const rawPhotos = (body.photos ?? null) as PhotoInput[] | null
const photos = rawPhotos ? sanitizePhotoInputs(rawPhotos) : null

const plans = body.plans ?? null

if (rawPhotos && Array.isArray(rawPhotos) && rawPhotos.length > MAX_PHOTOS) {
  return NextResponse.json(
    {
      ok: false,
      code: "TOO_MANY_PHOTOS",
      message: `You can upload up to ${MAX_PHOTOS} photos per request.`,
    },
    { status: 400 }
  )
}

if (rawPhotos && Array.isArray(rawPhotos) && rawPhotos.length > 0 && (!photos || photos.length === 0)) {
  return NextResponse.json(
    {
      ok: false,
      code: "INVALID_PHOTOS",
      message: "Uploaded photos were invalid, unsupported, or too large.",
    },
    { status: 400 }
  )
}

const paintScope: PaintScope | null =
  body.paintScope === "walls" ||
  body.paintScope === "walls_ceilings" ||
  body.paintScope === "full"
    ? body.paintScope
    : null

    const scopeChange = body.scopeChange
    const scopeSignals = detectScopeSignals(scopeChange)
    const uiTradeRaw =
      typeof body.trade === "string" ? body.trade.trim().toLowerCase() : ""

    const uiTrade =
  uiTradeRaw === "auto-detect" ||
  uiTradeRaw === "auto detect" ||
  uiTradeRaw === "autodetect" ||
  uiTradeRaw === "auto"
    ? ""
    : uiTradeRaw === "bathroom_tile" || uiTradeRaw === "general_renovation"
      ? "general renovation"
      : uiTradeRaw
    const rawState = typeof body.state === "string" ? body.state.trim() : ""

 // -----------------------------
// ENTITLEMENTS / FREE LIMIT
// -----------------------------
let usage_count = 0
let free_limit = FREE_LIMIT

// ✅ Dev bypass: do NOT consume free generations for dev/test emails
if (!DEV_ALWAYS_PAID.includes(normalizedEmail)) {
  const { data, error } = await supabase.rpc("consume_free_generation", {
    p_email: normalizedEmail,
    p_free_limit: FREE_LIMIT,
    p_idempotency_key: requestId,
  })

  if (error) {
    console.error("consume_free_generation error:", error)
    return NextResponse.json({ error: "Entitlement check failed" }, { status: 500 })
  }

  const row =
    Array.isArray(data) ? data[0] :
    data && typeof data === "object" ? data :
    null

  if (!row) {
    console.error("consume_free_generation returned empty data:", data)
    return NextResponse.json({ error: "Entitlement check failed (empty)" }, { status: 500 })
  }

  const payload =
    (row as any).consume_free_generation ??
    (row as any).consume_free_gen ??
    row

  if (!payload || typeof payload.ok !== "boolean") {
    console.error("consume_free_generation unexpected shape:", data)
    return NextResponse.json({ error: "Entitlement check failed (shape)" }, { status: 500 })
  }

  // NEW SHAPE: ok, reason?, usage_count?, free_limit?
  usage_count = typeof payload.usage_count === "number" ? payload.usage_count : 0
  free_limit = typeof payload.free_limit === "number" ? payload.free_limit : FREE_LIMIT

  // ✅ Block if the function says no
  if (!payload.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "FREE_LIMIT",
        reason: payload.reason ?? "free_limit_reached",
        usage_count,
        free_limit,
      },
      { status: 403 }
    )
  }
}

    // -----------------------------
    // STATE NORMALIZATION
    // -----------------------------
    const jobState = rawState || "N/A"

    // -----------------------------
// TRADE + INTENT
// -----------------------------
let trade = uiTrade || autoDetectTrade(scopeChange)
trade = trade.trim().toLowerCase()

// If scope includes paint + other renovation work, don't let it become "painting"
if (trade === "painting" && isMixedRenovation(scopeChange)) {
  trade = "general renovation"
}

const splitScopes = splitScopeByTrade(scopeChange)
const splitMultiTrade = splitScopes.length >= 2 || isMultiTradeScope(scopeChange)

// If splitter found multiple trades, force the overall trade bucket to general renovation
if (splitMultiTrade) {
  trade = "general renovation"
}

const tradeStack = detectTradeStack({
  scopeText: scopeChange,
  primaryTrade: trade,
})

console.log("PG SPLIT SCOPES", splitScopes)
console.log("PG IS MULTI TRADE", splitMultiTrade)
console.log("PG TRADE STACK", tradeStack)

const paintScopeForJob: PaintScope | null = paintScope ?? null

const intentHint = detectIntent(scopeChange)

const complexityProfile = buildComplexityProfile({
  scopeText: scopeChange,
  trade,
})

const planIntelligence =
  plans && plans.length > 0
    ? await runPlanIntelligence({
        rawPlans: plans,
        scopeText: scopeChange,
        trade,
      })
    : null

const photoAnalysis =
  photos && photos.length > 0
    ? await analyzeJobPhotos({
        photos,
        scopeText: scopeChange,
        trade,
      })
    : null

const photoPacketScore = scorePhotoPacket(photos ?? [])    

const photoImpact = derivePhotoPricingImpact({
  analysis: photoAnalysis,
  trade,
  scopeText: scopeChange,
})

const photoScopeAssist = buildPhotoScopeAssist({
  photoAnalysis,
  scopeText: scopeChange,
  trade,
})

const quantityInputs = getEffectiveQuantityInputs({
  measurements,
  scopeText: scopeChange,
  photoAnalysis,
})

const rooms = parseRoomCount(scopeChange)
const doors = parseDoorCount(scopeChange)

const photoEstimateDecision = buildPhotoEstimateDecision({
  trade,
  scopeText: scopeChange,
  rooms,
  doors,
  photosCount: photos?.length ?? 0,
  photoPacketScore,
  photoAnalysis,
  photoScopeAssist,
  quantityInputs,
  complexityProfile,
  tradeStack,
})

if (
  ENFORCE_PHOTO_ESTIMATE_DECISION &&
  photoEstimateDecision.pricingPolicy === "block"
) {
  return NextResponse.json(
    {
      ok: false,
      code: "PHOTO_INPUTS_REQUIRED",
      message: "More measurements or guided inputs are needed before pricing this job.",
      photoEstimateDecision,
    },
    { status: 422 }
  )
}

const photoQuantityHints = buildPhotoQuantityHints(photoAnalysis)
const exteriorPhotoHints = buildExteriorPhotoHints(photoAnalysis)
const photoContext = buildPhotoContext(photos)

// Start with raw scope
let effectiveScopeChange = scopeChange

if (photoAnalysis?.summary) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO SUMMARY:
${photoAnalysis.summary}`.trim()
}

if (photoAnalysis?.observations?.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO OBSERVATIONS:
${photoAnalysis.observations.map((x) => `- ${x}`).join("\n")}`.trim()
}

if (photoAnalysis?.suggestedScopeNotes?.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO-BASED SCOPE NOTES:
${photoAnalysis.suggestedScopeNotes.map((x) => `- ${x}`).join("\n")}`.trim()
}

if (photoQuantityHints) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO QUANTITY HINTS:
${photoQuantityHints}`.trim()
}

if (exteriorPhotoHints) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO EXTERIOR SIGNALS:
${exteriorPhotoHints}`.trim()
}

if (photoScopeAssist.missingScopeFlags.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO SCOPE FLAGS:
${photoScopeAssist.missingScopeFlags.map((x) => `- ${x}`).join("\n")}`.trim()
}

if (photoScopeAssist.suggestedAdditions.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PHOTO SUGGESTED ADDITIONS:
${photoScopeAssist.suggestedAdditions.map((x) => `- ${x}`).join("\n")}`.trim()
}

if (planIntelligence?.summary) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PLAN SUMMARY:
${planIntelligence.summary}`.trim()
}

if (planIntelligence?.detectedSheets?.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PLAN SHEETS REVIEWED:
${planIntelligence.detectedSheets.map((x) => `- ${x}`).join("\n")}`.trim()
}

if (planIntelligence?.detectedTrades?.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PLAN-DETECTED TRADES:
${planIntelligence.detectedTrades.map((x) => `- ${x}`).join("\n")}`.trim()
}

if (planIntelligence?.notes?.length) {
  effectiveScopeChange =
    `${effectiveScopeChange}

PLAN NOTES:
${planIntelligence.notes.map((x) => `- ${x}`).join("\n")}`.trim()
}

const stateAbbrev = getStateAbbrev(rawState)
const usedNationalBaseline = !(typeof stateAbbrev === "string" && stateAbbrev.length === 2)
const stateMultiplier = getStateLaborMultiplier(stateAbbrev)

const multiTradeDet =
  splitMultiTrade
    ? computeMultiTradeDeterministic({
        splitScopes,
        fullScopeText: scopeChange,
        stateMultiplier,
        measurements,
        paintScope: paintScopeForJob ?? "walls",
      })
    : null

console.log("PG MULTI TRADE DET", {
  okForDeterministic: multiTradeDet?.okForDeterministic ?? null,
  okForVerified: multiTradeDet?.okForVerified ?? null,
  pricing: multiTradeDet?.pricing ?? null,
  perTrade: multiTradeDet?.perTrade?.map((x) => ({
    trade: x.trade,
    scope: x.scope,
    total: x.pricing.total,
    source: x.source,
    crewDays: x.crewDays,
  })) ?? [],
})

// -----------------------------
// Flooring deterministic engine (PriceGuard™)
// -----------------------------
const flooringDetMeasurements =
  quantityInputs.effectiveFloorSqft && quantityInputs.effectiveFloorSqft > 0
    ? { ...(measurements || {}), totalSqft: quantityInputs.effectiveFloorSqft }
    : measurements

const flooringDet =
  trade === "flooring"
    ? computeFlooringDeterministic({
        scopeText: scopeChange,
        stateMultiplier,
        measurements: flooringDetMeasurements,
      })
    : null

// ✅ apply deterministic pricing if possible (even if not verified)
const flooringDetPricing: Pricing | null =
  flooringDet?.okForDeterministic
    ? clampPricing(coercePricing(flooringDet.pricing))
    : null

  // Electrical deterministic engine (PriceGuard™)
const electricalDet =
  trade === "electrical"
    ? computeElectricalDeterministic({
        scopeText: scopeChange,
        stateMultiplier,
      })
    : null

    console.log("PG ELECTRICAL DET", electricalDet)

const electricalDetPricing: Pricing | null =
  electricalDet?.okForDeterministic
    ? clampPricing(coercePricing(electricalDet.pricing))
    : null

const plumbingDet =
  trade === "plumbing"
    ? computePlumbingDeterministic({
        scopeText: scopeChange,
        stateMultiplier,
      })
    : null

const plumbingScopeConflict =
  trade === "plumbing" &&
  isPlumbingRemodelConflict({
    scopeText: scopeChange,
    complexity: complexityProfile,
  })

const plumbingDetPricing: Pricing | null =
  plumbingScopeConflict
    ? null
    : plumbingDet?.okForDeterministic
      ? clampPricing(coercePricing(plumbingDet.pricing))
      : null

console.log("PG PLUMBING CONFLICT", {
  plumbingScopeConflict,
  jobType: plumbingDet?.jobType ?? null,
  okForDeterministic: plumbingDet?.okForDeterministic ?? null,
})

    // Drywall deterministic engine (PriceGuard™)
const drywallDetMeasurements =
  quantityInputs.effectiveWallSqft && quantityInputs.effectiveWallSqft > 0
    ? { ...(measurements || {}), totalSqft: quantityInputs.effectiveWallSqft }
    : measurements

const drywallDet =
  trade === "drywall"
    ? computeDrywallDeterministic({
        scopeText: scopeChange,
        stateMultiplier,
        measurements: drywallDetMeasurements,
      })
    : null

const drywallDetPricing: Pricing | null =
  drywallDet?.okForDeterministic
    ? clampPricing(coercePricing(drywallDet.pricing))
    : null

const paintingDetMeasurements =
  quantityInputs.effectivePaintSqft && quantityInputs.effectivePaintSqft > 0
    ? { ...(measurements || {}), totalSqft: quantityInputs.effectivePaintSqft }
    : measurements

const paintingDet =
  trade === "painting"
    ? computePaintingDeterministic({
        scopeText: scopeChange,
        stateMultiplier,
        measurements: paintingDetMeasurements,
        paintScope: paintScopeForJob ?? "walls",
        photoAnalysis,
      })
    : null

const paintingDetPricing: Pricing | null =
  paintingDet?.okForDeterministic
    ? clampPricing(coercePricing(paintingDet.pricing))
    : null

    
   
  console.log("PG FLAGS", {
  trade,
  painting_ok: paintingDet?.okForDeterministic,
  flooring_ok: flooringDet?.okForDeterministic,
  electrical_ok: electricalDet?.okForDeterministic,
  plumbing_ok: plumbingDet?.okForDeterministic,
  drywall_ok: drywallDet?.okForDeterministic,
  painting_type: paintingDet?.jobType,
  plumbing_type: plumbingDet?.jobType,
  drywall_type: drywallDet?.jobType,
})

// Only treat as painting when the final trade is painting
const looksLikePainting = trade === "painting"

const allowAnchors =
  !(trade === "electrical" || trade === "plumbing" || trade === "flooring" || trade === "drywall" || trade === "painting")
  || (trade === "plumbing" && !plumbingDetPricing)
  || (trade === "electrical" && !electricalDetPricing)
  || (trade === "flooring" && !flooringDetPricing)
  || (trade === "drywall" && !drywallDetPricing)
  || (trade === "painting" && !paintingDetPricing)

const allowBathAnchorInPlumbing =
  trade === "plumbing" && /\b(bath|bathroom|shower|tub)\b/i.test(scopeChange)

const anchorHit =
 (!allowAnchors && !allowBathAnchorInPlumbing)
    ? null
    : runPriceGuardAnchors({
    scope: scopeChange,
    trade,
    stateMultiplier,
    measurements,
    rooms,
    doors,
    photoWallSqft: quantityInputs.photoWallSqft,
    photoCeilingSqft: quantityInputs.photoCeilingSqft,
    photoFloorSqft: quantityInputs.photoFloorSqft,
  })

console.log("PG ANCHOR", { hit: anchorHit?.id ?? null })

const anchorPricing: Pricing | null = anchorHit?.pricing ?? null

console.log("PG ANCHOR PRICING", {
  hit: anchorHit?.id ?? null,
  hasAnchorPricing: !!anchorPricing,
  anchorTotal: anchorPricing?.total ?? null,
})

const useBigJobPricing =
  looksLikePainting &&
  typeof rooms === "number" &&
  rooms >= 50 &&
  !(measurements?.totalSqft && measurements.totalSqft > 0)

const roomishRe =
  /\b(rooms?|hallway|living\s*room|family\s*room|bed(room)?|kitchen|bath(room)?|dining|office|closet|stair|entry|walls?|ceilings?)\b/i

// Words that imply door-associated trim/casing/frames (allowed in doors-only)
const doorTrimRe =
  /\b(trim|casing|casings|door\s*frame(s)?|frames?|jambs?|door\s*trim|door\s*casing)\b/i

// Doors-only intent:
// - Painting + explicit door count
// - No rooms/walls/ceilings / named rooms
// - Door-trim language is allowed and still counts as doors-only
const doorsOnlyIntent =
  looksLikePainting &&
  typeof doors === "number" &&
  doors > 0 &&
  !roomishRe.test(scopeChange)

const mentionsDoorTrim = doorsOnlyIntent && doorTrimRe.test(scopeChange)

const useDoorPricing =
  doorsOnlyIntent &&
  doors <= 100 &&
  !(measurements?.totalSqft && measurements.totalSqft > 0)

// If doors-only job, paintScope is irrelevant
const effectivePaintScope: EffectivePaintScope =
  useDoorPricing ? "doors_only" : (paintScopeForJob ?? "walls")

  console.log("PG PARSE", {
  trade,
  stateAbbrev,
  paintScopeFromUI: paintScopeForJob,
  rooms,
  doors,
  looksLikePainting,
  doorsOnlyIntent,
  effectivePaintScope,
  scope: scopeChange,
})

const materialsList = buildMaterialsList({
  trade,
  scopeText: scopeChange, // use raw scope, not effectiveScopeChange
  splitScopes,
  effectivePaintScope: looksLikePainting ? effectivePaintScope : null,
  rooms,
  doors,
  quantityInputs,
  photoAnalysis,
  photoScopeAssist,
  anchorId: anchorHit?.id ?? null,
})

const areaScopeBreakdown = buildAreaScopeBreakdown({
  trade,
  scopeText: scopeChange,
  splitScopes,
  effectivePaintScope: looksLikePainting ? effectivePaintScope : null,
  quantityInputs,
  photoAnalysis,
  photoScopeAssist,
  complexityProfile,
})

// Paint scope normalization (so description matches dropdown)
if (looksLikePainting) {
  if (effectivePaintScope === "doors_only") {
    effectiveScopeChange = `${effectiveScopeChange}\n\nPaint scope selected: doors only (includes door slabs + frames/casing).`
  } else if (effectivePaintScope === "walls_ceilings") {
    effectiveScopeChange = `${effectiveScopeChange}\n\nPaint scope selected: walls and ceilings.`
  } else if (effectivePaintScope === "full") {
    effectiveScopeChange = `${effectiveScopeChange}\n\nPaint scope selected: walls, ceilings, trim, and doors.`
  } else {
    effectiveScopeChange = `${effectiveScopeChange}\n\nPaint scope selected: walls only.`
  }
}

const bigJobPricing: Pricing | null =
  useBigJobPricing && typeof rooms === "number"
    ? pricePaintingRooms({
        scope: effectiveScopeChange,
        rooms,
        stateMultiplier,
        paintScope: (paintScopeForJob ?? "walls"),
      })
    : null

const doorPricing: Pricing | null =
  useDoorPricing && typeof doors === "number"
    ? pricePaintingDoors({
        doors,
        stateMultiplier,
        includeDoorTrim: true,              // ✅ ALWAYS include casing/frames by default for doors-only
        explicitTrimRequested: mentionsDoorTrim, // ✅ optional bump if they explicitly say trim/casing/frames
      })
    : null

    const mixedPaintPricing: Pricing | null =
  looksLikePainting &&
  typeof rooms === "number" && rooms > 0 &&
  typeof doors === "number" && doors > 0 &&
  !(measurements?.totalSqft && measurements.totalSqft > 0)
    ? (() => {
        const roomDet = pricePaintingRooms({
          scope: effectiveScopeChange,
          rooms,
          stateMultiplier,
          paintScope: (paintScopeForJob ?? "walls"),
        })

        const doorDet = pricePaintingDoors({
          doors,
          stateMultiplier,
          includeDoorTrim: true,
          explicitTrimRequested: doorTrimRe.test(scopeChange),
        })

        const labor = roomDet.labor + doorDet.labor
        const materials = roomDet.materials + doorDet.materials
        const subs = roomDet.subs + doorDet.subs // or Math.max(...) if you prefer
        const markup = Math.max(roomDet.markup, doorDet.markup)

        const base = labor + materials + subs
        const total = Math.round(base * (1 + markup / 100))

        return { labor, materials, subs, markup, total }
      })()
    : null

    const photoPaintPricing: Pricing | null =
  looksLikePainting &&
  !(typeof rooms === "number" && rooms > 0) &&
  !(typeof doors === "number" && doors > 0) &&
  !(measurements?.totalSqft && measurements.totalSqft > 0) &&
  !!quantityInputs.photoWallSqft &&
  quantityInputs.photoWallSqft > 0
    ? pricePaintingByPhotoSqft({
        wallSqft: quantityInputs.photoWallSqft,
        ceilingSqft: quantityInputs.photoCeilingSqft,
        stateMultiplier,
        paintScope: paintScopeForJob ?? "walls",
      })
    : null

    type CtxPhoto = NonNullable<
  Parameters<typeof buildEstimatorContext>[0]["photos"]
>[number]

const ctxPhotos: CtxPhoto[] | null =
  photos?.map((p): CtxPhoto => ({
    name: p.name,
    dataUrl: p.dataUrl,
    roomTag: p.roomTag ?? "",
    shotType: (p.shotType ?? "overview") as CtxPhoto["shotType"],
    note: p.note ?? "",
    reference: {
      kind: p.reference?.kind === "custom" ? "custom" : "none",
      label: p.reference?.label ?? "",
      realWidthIn: p.reference?.realWidthIn ?? null,
    },
  })) ?? null

   const ctx = buildEstimatorContext({
  input: body,
  normalizedEmail,
  requestId,

  scopeChange,
  enrichedScopeText: effectiveScopeChange,
  trade,
  tradeLabel: trade,

  rawState,
  stateAbbrev,
  stateMultiplier,
  usedNationalBaseline,

  measurements,
  photos: ctxPhotos,

  paintScope: paintScopeForJob,
  effectivePaintScope: looksLikePainting ? effectivePaintScope : null,
  workDaysPerWeek,

  rooms,
  doors,

  splitScopes,
  tradeStack,
  complexityProfile,
  scopeSignals,

  quantityInputs,

  photoPacketScore,
  photoAnalysis,
  photoImpact,
  photoScopeAssist,
  photoEstimateDecision,

  planIntelligence,

  materialsList,
  areaScopeBreakdown,

  useBigJobPricing,
  anchorHit,
  multiTradeDet,

  paintingDet: paintingDetPricing
    ? {
        pricing: paintingDetPricing,
        okForVerified: !!paintingDet?.okForVerified,
        verifiedSource: "painting_engine_v1_verified",
        source: "painting_engine_v1",
        estimateBasis: null,
      }
    : null,

  flooringDet: flooringDetPricing
    ? {
        pricing: flooringDetPricing,
        okForVerified: !!flooringDet?.okForVerified,
        verifiedSource: "flooring_engine_v1_verified",
        source: "flooring_engine_v1",
        estimateBasis: null,
      }
    : null,

  electricalDet: electricalDetPricing
    ? {
        pricing: electricalDetPricing,
        okForVerified: !!electricalDet?.okForVerified,
        verifiedSource: "electrical_engine_v1_verified",
        source: "electrical_engine_v1",
        estimateBasis: null,
      }
    : null,

  plumbingDet: plumbingDetPricing
    ? {
        pricing: plumbingDetPricing,
        okForVerified: !!plumbingDet?.okForVerified,
        verifiedSource: "plumbing_engine_v1_verified",
        source: "plumbing_engine_v1",
        estimateBasis: null,
      }
    : null,

  drywallDet: drywallDetPricing
    ? {
        pricing: drywallDetPricing,
        okForVerified: !!drywallDet?.okForVerified,
        verifiedSource: "drywall_engine_v1_verified",
        source: "drywall_engine_v1",
        estimateBasis: null,
      }
    : null,

  mixedPaintPricing,
  doorPricing,
  bigJobPricing,
  photoPaintPricing,
})

    // -----------------------------
    // AI PROMPT (PRODUCTION-LOCKED)
    // -----------------------------
    const measurementSnippet =
  measurements?.totalSqft && measurements.totalSqft > 0
    ? `
MEASUREMENTS (USER-PROVIDED):
- Total area: ${measurements.totalSqft} sq ft
- Areas:
${(measurements.rows || [])
  .map(
    (r: any) =>
      `  - ${r.label || "Area"}: ${Number(r.lengthFt || 0)}ft x ${Number(
        r.heightFt || 0
      )}ft x qty ${Number(r.qty || 1)}`
  )
  .join("\n")}
`
    : ""
    
    const prompt = `
You are an expert U.S. construction estimator and licensed project manager.

Your task is to generate a professional construction document that may be either:
- A Change Order (modifying an existing contract), OR
- An Estimate (proposed or anticipated work)

PRE-ANALYSIS:
${intentHint}

INPUTS:
- Primary Trade Type: ${trade}
- Trade Stack (coordination): ${tradeStack.trades.join(", ") || "N/A"}
- Activities (sequencing): ${tradeStack.activities?.join(", ") || "N/A"}
- Stack Signals: ${tradeStack.signals.slice(0, 5).join(" | ") || "N/A"}
- Job State: ${jobState}
- Paint Scope: ${looksLikePainting ? effectivePaintScope : "N/A"}
- Photo Count: ${photos?.length ?? 0}
- Photo Summary: ${photoAnalysis?.summary ?? "N/A"}

COMPLEXITY PROFILE (SYSTEM-LOCKED — FOLLOW STRICTLY):
- class: ${complexityProfile.class}
- requireDaysBasis: ${complexityProfile.requireDaysBasis ? "YES" : "NO"}
- permitLikely: ${complexityProfile.permitLikely ? "YES" : "NO"}
- notes:
${complexityProfile.notes.map(n => `- ${n}`).join("\n")}
- minimums:
  - min crewDays: ${complexityProfile.minCrewDays}
  - min mobilization: ${complexityProfile.minMobilization}
  - min subs: ${complexityProfile.minSubs}

RULE:
If requireDaysBasis is YES, your estimateBasis MUST include:
- units includes "days"
- crewDays is set and realistic for the class

SCOPE OF WORK:
${effectiveScopeChange}

${measurementSnippet}

${photoContext ? `
${photoContext}

PHOTO METADATA RULES:
- Use room tags to separate scope by area when possible.
- Use shot type to understand what the image is trying to show.
- Use notes as higher-priority user hints about damage, access, prep, and special conditions.
- If a custom reference width is provided, treat it as a real-world scaling clue.
- Do not invent exact measurements from photos.
- You may infer relative scale, likely fixture size, likely wall span, or tighter review notes when a valid reference is provided.
- If photo metadata suggests missing scope items, reflect that in the description, schedule realism, material hints, and scope assumptions.
` : ""}

DOCUMENT RULES (CRITICAL):
- If modifying existing contract work → "Change Order"
- If proposing new work → "Estimate"
- If unclear → "Change Order / Estimate"
- The first sentence must begin with the exact selected document type:
  - If documentType is "Change Order", begin with: "This Change Order ..."
  - If documentType is "Estimate", begin with: "This Estimate ..."
  - If documentType is "Change Order / Estimate", begin with: "This Change Order / Estimate ..."
- Do not repeat, combine, or duplicate document types in the opening sentence.
- Do not write phrases like:
  - "This Change Order / Estimate / Estimate"
  - "This Estimate / Estimate"
  - "This Change Order / Change Order"
- Use professional, contract-ready language
- Describe labor activities, materials, preparation, and intent
- Write a thorough, contract-ready scope description with clear sequencing.
- Length: 180–450 words (or 10–18 sentences).
- Use line breaks for readability (plain text is fine). No markdown.
- Include: prep/protection, execution steps, materials/consumables, coordination/visits, cleanup.
- Do not add pricing, warranties, guarantees, or new scope not implied by the input.
- No disclaimers or markdown

DOCUMENT-TYPE TONE RULES (VERY IMPORTANT):

If documentType is "Change Order":
- Reference existing contract or original scope implicitly
- Clearly indicate work is additional, revised, or not previously included
- Use firm, contractual language
- The first sentence must start exactly with: "This Change Order ..."
- Frame the scope as authorized upon approval, without conditional or speculative language

If documentType is "Estimate":
- Frame work as proposed or anticipated
- Avoid implying an existing contract
- Use conditional language
- The first sentence must start exactly with: "This Estimate ..."

If documentType is "Change Order / Estimate":
- Use neutral language that could apply in either context
- Avoid firm contractual assumptions
- Clearly describe scope without asserting approval status
- The first sentence must start exactly with: "This Change Order / Estimate ..."

ADVANCED DESCRIPTION RULES:
- Reference existing conditions where applicable (e.g., "existing finishes", "current layout")
- Clarify whether work is additive, corrective, or preparatory
- Tie scope to client request or site conditions when possible
- Use neutral, professional contract language (not sales copy)
- Avoid vague phrases like "as needed" or "where required"
- Avoid generic filler phrases such as “ensure a professional finish” or “industry standards”
- Imply scope boundaries without listing exclusions explicitlys

ADVANCED CONTRACT LANGUAGE ENHANCEMENTS (OPTIONAL BUT PREFERRED):
- Reference sequencing or preparatory work when applicable (e.g., surface prep, demolition, protection)
- Imply scope limits by referencing existing conditions without listing exclusions
- Avoid absolute guarantees or warranties
- Use passive contractual phrasing when appropriate (e.g., "Work includes...", "Scope covers...")
- Where applicable, reference coordination with existing trades or finishes
- Avoid repeating sentence structures across documents

HARD STYLE RULE:
- Do not use phrases like “ensure”, “industry standards”, “quality standards”, “compliance”, “durability”, or “aesthetic appeal”.
- Replace them with concrete scope language (prep, masking, coatings, sequencing, protection, coordination).
- If you accidentally use any banned phrase, rewrite that sentence using concrete scope language instead.

ESTIMATING METHOD (STRICT):
You must price using a human estimator workflow:
1) Identify the primary "pricing units" for the scope (pick 1–3): sqft, linear ft, rooms, doors, fixtures, devices, days, lump sum.

QUANTITY EXTRACTION (REQUIRED):
If the scope includes an explicit quantity (e.g., "25 doors", "12 outlets", "3 toilets", "800 sqft"),
you MUST use that quantity in pricing. Do not treat count-based scopes as lump sums.
If a quantity is implied but not explicit, make a conservative assumption and price accordingly.

PRICING UNITS (REQUIRED):
You must choose pricing units ONLY from this list:
- sqft
- linear_ft
- rooms
- doors
- fixtures
- devices
- days
- lump_sum

Pick 1–3 units max and base labor/materials on those units.

2) Choose realistic production rates (labor hours per unit) for mid-market residential work.
3) Use typical U.S. mid-market contractor labor rates (do NOT adjust for state/location; state multiplier is handled by the system).
4) Set a materials allowance that matches the scope (paint/primer/trim caulk; tile/setting materials; plumbing fixtures; electrical devices).
5) Include a reasonable mobilization/overhead amount for small jobs.
6) Apply markup 15–25%.
7) Perform a final sanity check: total should scale with quantity (double scope ≈ meaningfully higher total).

PRICING RULES:
- Use realistic 2024–2025 U.S. contractor pricing
- Mid-market residential work
- Totals only (no line items)
- Round to whole dollars

MOBILIZATION MINIMUM (SMALL JOBS):
If the job is small (e.g., <= 6 doors, <= 6 devices, <= 2 fixtures, or <= 150 sqft),
include a mobilization/overhead minimum in "subs" of at least $150–$350 depending on the trade (do NOT adjust for state/location).

MEASUREMENT USAGE RULE (STRICT):
- If measurements are provided, reference the total square footage and (briefly) the labeled areas in the description.
- Use the square footage to influence pricing realism (larger sqft → higher labor/materials).
- If measurements are NOT provided, do NOT mention square footage, dimensions, or area estimates. Do not guess numbers.

PHOTO USAGE RULE (STRICT):
- If photo observations are present, use them only for visible conditions, access, prep, damage, demolition, finish complexity, and sequencing.
- Combine visible conditions with photo metadata such as room tags, shot type, notes, and measurement references.
- Prefer user-entered room tags and notes over weak visual guesses.
- Do NOT invent hidden conditions from photos.
- Do NOT let photos override explicit user-entered quantities.
- A measurement reference like "vanity = 36 in" or "door = 30 in" is a scale anchor, not a guarantee of full-room dimensions.
- Use photos and metadata to refine scope wording, material hints, missing confirmations, protection/setup notes, and schedule realism.
- Do not hallucinate unseen work.

TRADE PRICING GUIDANCE:
Use the "PRICING ANCHORS" section below to choose realistic units, production rates, and allowances per trade.

PRICING ANCHORS (HUMAN-LIKE BASELINES — USE AS GUIDES, NOT LINE ITEMS):
Painting:
- Interior repaint labor is usually dominant; materials are low.
- Doors: price must scale per door (count-based), not flat.
- Rooms: price scales per room and whether ceilings/trim/doors are included.

Flooring / Tile:
- Pricing typically scales by sqft for floors and by sqft for wall tile.
- Include demo/haulaway if implied, otherwise assume install only.

Electrical:
- Most items are priced per device/fixture (count-based), plus troubleshooting time if implied.
- Panel work is high labor + permit/inspection coordination allowances.

Plumbing:
- Fixtures are priced per fixture (toilet, faucet, vanity, shower valve).
- Include shutoff/drain/test time; materials vary widely based on fixture class.

Carpentry:
- Trim/baseboards scale per linear foot; door installs are per door; cabinets are lump sum or per linear run.

General Renovation:
- If scope is broad, use a realistic lump sum that reflects multiple trades and multiple days of labor.

MARKUP RULE:
- Suggest markup between 15–25%

MISSING INFO POLICY:
If key details are missing (brand level, finish level, demolition extent, access constraints),
make conservative mid-market assumptions and reflect them in pricing.
Do NOT ask questions. Do NOT add disclaimers.
Choose reasonable assumptions (e.g., standard materials, normal access, occupied home protection).

SCALING RULE (STRICT):
If the scope is count-based (doors/devices/fixtures), the total must increase meaningfully with the count.
If count increases by 50% or more, total should increase by at least 30% unless scope clearly changes in the opposite direction.

SCALING SANITY CHECK (REQUIRED):
If scope includes an explicit count N:
- Labor must scale with N (labor should not be identical for 5 vs 25).
- Materials must scale with N when materials are per-item (paint, devices, fixtures).
- If you output identical totals for different explicit counts, you MUST revise your pricing until totals scale.

ESTIMATE BASIS RULE (CRITICAL):
- You MUST include "estimateBasis" and it MUST match the pricing math (labor + materials + subs, then markup).
- "units" must be 1–3 items from the allowed list.
- If you detect explicit counts (doors/rooms/sqft/devices/fixtures), quantities must include them.

OUTPUT FORMAT (STRICT — REQUIRED):
Return ONLY valid JSON matching EXACTLY this schema.
All fields are REQUIRED. Do not omit any field.

{
  "documentType": "Change Order | Estimate | Change Order / Estimate",
  "trade": "<string>",
  "description": "<string>",
  "pricing": {
    "labor": <number>,
    "materials": <number>,
    "subs": <number>,
    "markup": <number>,
    "total": <number>
  },
  "estimateBasis": {
    "units": ["sqft | linear_ft | rooms | doors | fixtures | devices | days | lump_sum"],
    "quantities": {
      "sqft": <number>,
      "linear_ft": <number>,
      "rooms": <number>,
      "doors": <number>,
      "fixtures": <number>,
      "devices": <number>,
      "days": <number>,
      "lump_sum": <number>
    },
    "laborRate": <number>,
    "hoursPerUnit": <number>,
    "crewDays": <number>,
    "mobilization": <number>,
    "assumptions": ["<string>"]
  }
}

Rules:
- Use the exact field names shown (case-sensitive)
- Include ALL fields
- Use numbers only for pricing values
`

    // -----------------------------
// OPENAI CALL
// -----------------------------
let completion
try {
  completion = await openai.chat.completions.create({
    model: PRIMARY_MODEL,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  })
} catch (err: any) {
  // OpenAI SDK errors typically include: status, code, message
  const status = err?.status
  const code = err?.code

  // Rate limit → return 429 to the client (so your UI shows “Too many requests…”)
  if (status === 429 || code === "rate_limit_exceeded") {
    const retryAfter =
      err?.headers?.get?.("retry-after") ||
      err?.headers?.["retry-after"] ||
      null

    return NextResponse.json(
      {
        error: "OpenAI rate limit exceeded",
        retry_after: retryAfter,
      },
      { status: 429 }
    )
  }

  // Auth/config issues
  if (status === 401) {
    return NextResponse.json(
      { error: "OpenAI auth error (check API key)" },
      { status: 500 }
    )
  }

  console.error("OpenAI call failed:", err)
  return NextResponse.json(
    { error: "AI generation failed" },
    { status: 500 }
  )
}

    const rawContent = completion.choices[0]?.message?.content
if (!rawContent) throw new Error("Empty AI response")

let aiParsed: any
try {
  aiParsed = JSON.parse(rawContent)
} catch (e) {
  console.error("AI returned non-JSON:", rawContent)
  return NextResponse.json(
    { error: "AI response was not valid JSON" },
    { status: 500 }
  )
}

const normalized: any = {
  documentType: aiParsed.documentType ?? aiParsed.document_type,
  trade: aiParsed.trade,
  description: aiParsed.description,
  pricing: aiParsed.pricing,
  estimateBasis: aiParsed.estimateBasis ?? null,
}

normalized.pricing = clampPricing(coercePricing(normalized.pricing))

const effectiveSqft =
  trade === "flooring"
    ? quantityInputs.effectiveFloorSqft
    : trade === "drywall"
    ? quantityInputs.effectiveWallSqft
    : trade === "painting"
    ? quantityInputs.effectivePaintSqft
    : null
normalized.estimateBasis = syncEstimateBasisMath({
  pricing: normalized.pricing,
  basis: normalizeEstimateBasisUnits(
    enforceEstimateBasis({
      trade,
      pricing: normalized.pricing,
      basis: normalized.estimateBasis,
      parsed: { rooms, doors, sqft: effectiveSqft },
      complexity: complexityProfile,
    })
  ),
})

const aiBasis = (normalized.estimateBasis ?? null) as EstimateBasis | null

const v = validateAiMath({
  pricing: normalized.pricing,
  basis: aiBasis,
  parsedCounts: { rooms, doors, sqft: effectiveSqft },
  complexity: complexityProfile,
  scopeText: scopeChange,
})

if (!v.ok) {
  const repairPrompt = `${prompt}

REPAIR REQUIRED:
The prior JSON failed validation for these reasons:
- ${v.reasons.join("\n- ")}

Return corrected JSON using the SAME schema, and make estimateBasis match the pricing math exactly. Do not add extra fields.`

  // ✅ #2: Do NOT let repair failures crash the route
  try {
    const repair = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: repairPrompt }],
    })

    const repairContent = repair.choices[0]?.message?.content
    if (repairContent) {
      try {
        const repaired = JSON.parse(repairContent)

        normalized.documentType = repaired.documentType ?? normalized.documentType
        normalized.trade = repaired.trade ?? normalized.trade
        normalized.description = repaired.description ?? normalized.description
        normalized.pricing = clampPricing(coercePricing(repaired.pricing))
        normalized.estimateBasis = repaired.estimateBasis ?? normalized.estimateBasis

normalized.estimateBasis = syncEstimateBasisMath({
  pricing: normalized.pricing,
  basis: normalizeEstimateBasisUnits(
    enforceEstimateBasis({
      trade,
      pricing: normalized.pricing,
      basis: normalized.estimateBasis,
      parsed: { rooms, doors, sqft: effectiveSqft },
      complexity: complexityProfile,
    })
  ),
})
      } catch {
        console.warn("AI repair returned invalid JSON; continuing with original output.")
      }
    }
  } catch (e) {
    console.warn("AI repair call failed; continuing with original output.", e)
  }

  // ✅ #3: Re-validate once after repair (or attempted repair)
  const v2 = validateAiMath({
  pricing: normalized.pricing,
  basis: (normalized.estimateBasis ?? null) as EstimateBasis | null,
  parsedCounts: { rooms, doors, sqft: effectiveSqft },
  complexity: complexityProfile,
  scopeText: scopeChange,
})

  if (!v2.ok) {
    console.warn("AI output still failing validation after repair:", v2.reasons)
    // Optional (safe default): do nothing — your deterministic/merge safety floor still protects you later.
    // If you ever want to force non-AI behavior when it fails twice, this is the spot to do it.
  }
}

// ✅ Normalize documentType BEFORE any early returns (deterministic path included)
const allowedTypes = [
  "Change Order",
  "Estimate",
  "Change Order / Estimate",
] as const

if (!allowedTypes.includes(normalized.documentType)) {
  normalized.documentType = "Change Order / Estimate"
}

if (typeof normalized.description !== "string" || normalized.description.trim().length < 10) {
  const tradeLabel = typeof trade === "string" && trade.length ? trade : "the selected"
  normalized.description =
    `This ${normalized.documentType} covers the described scope of work as provided, including labor, materials, protection, and cleanup associated with ${tradeLabel} scope.`
}

// Clean up duplicated document type tokens in the first sentence
if (typeof normalized.description === "string") {
  normalized.description = syncDescriptionLeadToDocumentType(
    normalized.description,
    normalized.documentType
  )
}

const deps = {
  basis: {
    normalizeBasisSafe,
    syncEstimateBasisMath,
    enforceEstimateBasis,
    buildEstimateBasisFallback,
  },
  pricing: {
    applyAiRealism,
    compressCrossTradeMobilization,
    enforcePhaseVisitCrewDaysFloor,
    clampPricing,
    coercePricing,
    applyPermitBuffer,
    applyMinimumCharge,
  },
  description: {
    syncDescriptionLeadToDocumentType,
    appendExecutionPlanSentence,
    appendTradeCoordinationSentence,
    appendPermitCoordinationSentence,
    polishDescriptionWith4o,
  },
  buildScheduleBlock,
  buildScopeXRay,
  buildPriceGuardReport,
  buildEstimateExplanation,
} satisfies OrchestratorDeps

const payload = await runEstimatorOrchestrator({
  ctx,
  aiDraft: {
    documentType: normalized.documentType,
    trade: normalized.trade || trade,
    description: normalized.description,
    pricing: normalized.pricing,
    estimateBasis: normalized.estimateBasis ?? null,
  },
  deps,
  includeDebugEstimateBasis: wantsDebug(req),
  engineDebug: {
    flooring: flooringDet
      ? {
          okForDeterministic: flooringDet.okForDeterministic,
          okForVerified: flooringDet.okForVerified,
          flooringType: flooringDet.flooringType,
          sqft: flooringDet.sqft,
          notes: flooringDet.notes,
        }
      : null,
    electrical: electricalDet
      ? {
          okForDeterministic: electricalDet.okForDeterministic,
          okForVerified: electricalDet.okForVerified,
          jobType: electricalDet.jobType,
          signals: electricalDet.signals ?? null,
          notes: electricalDet.notes,
        }
      : null,
    plumbing: plumbingDet
      ? {
          okForDeterministic: plumbingDet.okForDeterministic,
          okForVerified: plumbingDet.okForVerified,
          jobType: plumbingDet.jobType,
          signals: plumbingDet.signals ?? null,
          notes: plumbingDet.notes,
        }
      : null,
    drywall: drywallDet
      ? {
          okForDeterministic: drywallDet.okForDeterministic,
          okForVerified: drywallDet.okForVerified,
          jobType: drywallDet.jobType,
          signals: drywallDet.signals ?? null,
          notes: drywallDet.notes,
        }
      : null,
  },
})

return await respondAndCache({
  email: normalizedEmail,
  requestId,
  payload,
  cache: cacheEligible,
})

  } catch (err) {
    console.error("Generate failed:", err)
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    )
  }
}