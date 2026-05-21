import { parsePlumbingFixtureBreakdown } from "../priceguard/plumbingEngine"
import type { EstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import type {
  ComplexityProfile,
  MissingInputKey,
  PhotoAnalysis,
  PhotoEstimateDecision,
  PhotoPacketScore,
  PhotoPricingImpact,
  PricingPolicy,
  EstimateMode,
  TradeStack,
} from "./types"

export type RoutePhotoInput = {
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

type QuantityEstimateMethod = "reference_scaled" | "visual_guess" | "count_based"

export type PhotoQuantityInputs = {
  userMeasuredSqft: number | null
  parsedSqft: number | null
  photoWallSqft: number | null
  photoCeilingSqft: number | null
  photoFloorSqft: number | null
  photoWallSqftSource: QuantityEstimateMethod | null
  photoCeilingSqftSource: QuantityEstimateMethod | null
  photoFloorSqftSource: QuantityEstimateMethod | null
  photoTrimLfSource: QuantityEstimateMethod | null
  effectiveFloorSqft: number | null
  effectiveWallSqft: number | null
  effectivePaintSqft: number | null
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

function parseSqft(text: string): number | null {
  const t = String(text || "")
    .toLowerCase()
    .replace(/,/g, "")

  const m = t.match(/(\d{1,7}(?:\.\d+)?)\s*(sq\s*ft|sqft|square\s*feet|sf)\b/)
  if (!m?.[1]) return null

  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
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

function parseLinearFt(text: string): number | null {
  const t = String(text || "").toLowerCase()

  const m =
    t.match(/(\d{1,5})\s*(linear\s*ft|linear\s*feet|lin\s*ft|lf)\b/) ||
    t.match(/(\d{1,5})\s*(ft|feet)\s+of\s+(?:base|baseboard|trim)\b/)

  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

export function scorePhotoPacket(photos: RoutePhotoInput[]): PhotoPacketScore {
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

export function derivePhotoPricingImpact(args: {
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

export function buildPhotoScopeAssist(args: {
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

export function getPhotoEstimatedSqft(photoAnalysis: PhotoAnalysis | null): {
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

export function getEffectiveQuantityInputs(args: {
  measurements: any | null
  scopeText: string
  photoAnalysis: PhotoAnalysis | null
}): PhotoQuantityInputs {
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

export function isMeasurementHeavyTrade(args: {
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

export function hasUsablePhotoQuantities(args: {
  trade: string
  scopeText: string
  rooms: number | null
  doors: number | null
  quantityInputs: PhotoQuantityInputs
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

export function buildPhotoMissingInputs(args: {
  trade: string
  scopeText: string
  rooms: number | null
  doors: number | null
  quantityInputs: PhotoQuantityInputs
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

export function buildPhotoEstimateDecision(args: {
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
  quantityInputs: PhotoQuantityInputs
  complexityProfile: ComplexityProfile | null
  tradeStack: TradeStack | null
  scopeFacts?: EstimatorScopeFacts | null
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

  if (args.tradeStack?.isMultiTrade && (!args.scopeFacts || args.scopeFacts.trueMixedTrades)) {
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
