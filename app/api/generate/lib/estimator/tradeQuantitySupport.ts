import type {
  PlanEvidenceRef,
  PlanIntelligence,
  PlanScheduleItem,
  PlanSheetAnalysis,
  PlanTradeFinding,
} from "../plans/types"
import type { EstimateSkeletonHandoff } from "./estimateSkeletonHandoff"
import type { EstimateStructureConsumption } from "./estimateStructureConsumption"
import type { TradePackagePricingPrep } from "./tradePackagePricingPrep"

export type TradeQuantitySupportTrade =
  | "painting"
  | "drywall"
  | "wallcovering"

type TradeQuantitySignalUnit =
  | "sqft"
  | "linear_ft"
  | "rooms"
  | "doors"
  | "openings"
  | "each"
  | "unknown"

type TradeQuantitySignalConfidence = "low" | "medium" | "high"

type TradeQuantitySignalSource =
  | "takeoff"
  | "trade_finding"
  | "schedule"
  | "package_signal"
  | "room_signal"
  | "scope_text"

export type TradeQuantitySignal = {
  label: string
  quantity: number | null
  unit: TradeQuantitySignalUnit
  exactQuantity: boolean
  confidence: TradeQuantitySignalConfidence
  source: TradeQuantitySignalSource
  note: string
  evidenceRefs: PlanEvidenceRef[]
}

export type TradeQuantityConfidence = {
  level: "strong" | "moderate" | "weak"
  reasons: string[]
}

export type TradeQuantitySupport = {
  trade: TradeQuantitySupportTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradeAreaSignals: TradeQuantitySignal[]
  tradeLinearSignals: TradeQuantitySignal[]
  tradeOpeningSignals: TradeQuantitySignal[]
  tradeCoverageHints: string[]
  tradeQuantityConfidence: TradeQuantityConfidence
  tradeQuantityReviewNotes: string[]
} | null

function uniqStrings(values: Array<string | null | undefined>, max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function uniqSignals(values: TradeQuantitySignal[], max = 8): TradeQuantitySignal[] {
  const seen = new Set<string>()
  const out: TradeQuantitySignal[] = []

  for (const value of values) {
    const key = [
      value.label.toLowerCase(),
      String(value.quantity ?? ""),
      value.unit,
      value.source,
      value.note.toLowerCase(),
    ].join("|")

    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= max) break
  }

  return out
}

function getTradeSignalConfidence(value: number | null, highThreshold = 80): TradeQuantitySignalConfidence {
  if (value != null && value >= highThreshold) return "high"
  if (value != null && value >= 55) return "medium"
  return "low"
}

function detectTargetTrade(args: {
  trade: string
  scopeText: string
  planIntelligence: PlanIntelligence | null
  tradePackagePricingPrep: TradePackagePricingPrep
}): TradeQuantitySupportTrade | null {
  if (args.tradePackagePricingPrep?.trade) {
    return args.tradePackagePricingPrep.trade
  }

  const directTrade = String(args.trade || "").trim().toLowerCase()
  if (directTrade === "painting" || directTrade === "drywall") {
    return directTrade
  }
  if (directTrade === "wallcovering") return "wallcovering"

  const corpus = [
    args.scopeText,
    args.planIntelligence?.summary || "",
    ...(args.planIntelligence?.detectedTrades || []),
    ...(args.planIntelligence?.tradePackageSignals || []),
    ...(args.planIntelligence?.packageScopeCandidates || []),
    ...(args.planIntelligence?.analyses || []).flatMap((analysis) => [
      ...(analysis.textSnippets || []),
      ...(analysis.notes || []),
      ...(analysis.schedules || []).map((item) => item.label),
      ...(analysis.tradeFindings || []).map((item) => item.label),
    ]),
  ]
    .join(" ")
    .toLowerCase()

  if (/\b(wallcover(?:ing)?|wallpaper|feature wall)\b/.test(corpus)) {
    return "wallcovering"
  }
  if (/\b(drywall|sheetrock|partition|patch|texture|skim coat)\b/.test(corpus)) {
    return "drywall"
  }
  if (/\b(paint|painting|finish schedule|prime|primer)\b/.test(corpus)) {
    return "painting"
  }

  return null
}

function getPlanTexts(planIntelligence: PlanIntelligence | null): string[] {
  if (!planIntelligence?.ok) return []

  return [
    planIntelligence.summary || "",
    ...(planIntelligence.notes || []),
    ...(planIntelligence.detectedRooms || []),
    ...(planIntelligence.detectedTrades || []),
    ...(planIntelligence.repeatedSpaceSignals || []),
    ...(planIntelligence.likelyRoomTypes || []),
    ...(planIntelligence.pricingAnchorSignals || []),
    ...(planIntelligence.packageScopeCandidates || []),
    ...(planIntelligence.tradePackageSignals || []),
    ...(planIntelligence.analyses || []).flatMap((analysis) => [
      ...(analysis.textSnippets || []),
      ...(analysis.notes || []),
      ...(analysis.rooms || []).map((room) => room.roomName),
      ...(analysis.schedules || []).map((item) => item.label),
      ...(analysis.schedules || []).flatMap((item) => item.notes || []),
      ...(analysis.tradeFindings || []).map((item) => item.label),
      ...(analysis.tradeFindings || []).flatMap((item) => item.notes || []),
      ...(analysis.tradeFindings || []).flatMap((item) =>
        (item.evidence || []).map((ref) => ref.excerpt)
      ),
    ]),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
}

function joinLower(texts: string[]): string {
  return texts.join(" ").toLowerCase()
}

function buildTakeoffEvidence(planIntelligence: PlanIntelligence | null): PlanEvidenceRef[] {
  return (planIntelligence?.evidence?.quantityRefs || []).slice(0, 3)
}

function collectScheduleSignals(
  analyses: PlanSheetAnalysis[],
  pattern: RegExp
): PlanScheduleItem[] {
  return analyses.flatMap((analysis) =>
    (analysis.schedules || []).filter((schedule) => {
      const blob = [schedule.label, ...(schedule.notes || [])].join(" ")
      return pattern.test(blob)
    })
  )
}

function collectTradeFindings(
  analyses: PlanSheetAnalysis[],
  matchTrade: PlanTradeFinding["trade"] | null,
  pattern: RegExp
): PlanTradeFinding[] {
  return analyses.flatMap((analysis) =>
    (analysis.tradeFindings || []).filter((finding) => {
      if (matchTrade && finding.trade === matchTrade) return true
      const blob = [finding.label, ...(finding.notes || [])].join(" ")
      return pattern.test(blob)
    })
  )
}

function buildSignal(args: {
  label: string
  quantity: number | null
  unit: TradeQuantitySignalUnit
  exactQuantity: boolean
  confidence: TradeQuantitySignalConfidence
  source: TradeQuantitySignalSource
  note: string
  evidenceRefs?: PlanEvidenceRef[]
}): TradeQuantitySignal {
  return {
    label: args.label,
    quantity: args.quantity,
    unit: args.unit,
    exactQuantity: args.exactQuantity,
    confidence: args.confidence,
    source: args.source,
    note: args.note,
    evidenceRefs: (args.evidenceRefs || []).slice(0, 3),
  }
}

function getPackageBucketHints(args: {
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  trade: TradeQuantitySupportTrade
}): string[] {
  const matcher =
    args.trade === "painting"
      ? /\bpainting\b|\bfinish\b/i
      : args.trade === "drywall"
      ? /\bdrywall\b/i
      : /\bwallcover(?:ing)?\b|\bfinish\b/i

  const fromHandoff = (args.handoff?.estimatorBucketDrafts || [])
    .filter((bucket) =>
      matcher.test(bucket.likelyTradeCoverage.join(" ")) ||
      matcher.test(bucket.likelyScopeBasis.join(" "))
    )
    .map((bucket) => bucket.bucketName)

  const fromStructure = (args.structure?.structuredEstimateBuckets || [])
    .filter((bucket) =>
      matcher.test(bucket.likelyTradeCoverage.join(" ")) ||
      matcher.test(bucket.likelyScopeBasis.join(" "))
    )
    .map((bucket) => bucket.bucketName)

  return uniqStrings([...fromHandoff, ...fromStructure], 4)
}

function buildPaintingQuantitySupport(args: {
  planIntelligence: PlanIntelligence | null
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  tradePackagePricingPrep: TradePackagePricingPrep
  scopeText: string
}): TradeQuantitySupport {
  const plan = args.planIntelligence
  const analyses = plan?.analyses || []
  const texts = getPlanTexts(plan)
  const blob = joinLower(texts.concat(args.scopeText))
  const evidence = buildTakeoffEvidence(plan)
  const packageBuckets = getPackageBucketHints({
    handoff: args.handoff,
    structure: args.structure,
    trade: "painting",
  })
  const finishSchedules = collectScheduleSignals(
    analyses,
    /\bfinish schedule\b|\bfinish plan\b|\bpaint\b/i
  )
  const doorSchedules = collectScheduleSignals(
    analyses,
    /\bdoor schedule\b|\bdoors?\b/i
  )

  const areaSignals: TradeQuantitySignal[] = []
  const linearSignals: TradeQuantitySignal[] = []
  const openingSignals: TradeQuantitySignal[] = []

  if ((plan?.takeoff.wallSqft || 0) > 0) {
    areaSignals.push(
      buildSignal({
        label: "Wall coverage support",
        quantity: plan?.takeoff.wallSqft ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: "high",
        source: "takeoff",
        note: "Plan takeoff includes wall area that may support painting coverage.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.ceilingSqft || 0) > 0) {
    areaSignals.push(
      buildSignal({
        label: "Ceiling coverage support",
        quantity: plan?.takeoff.ceilingSqft ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: "high",
        source: "takeoff",
        note: "Plan takeoff includes ceiling area that may support painting coverage.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.roomCount || 0) > 0) {
    areaSignals.push(
      buildSignal({
        label: "Repeated room package support",
        quantity: plan?.takeoff.roomCount ?? null,
        unit: "rooms",
        exactQuantity: true,
        confidence:
          (plan?.repeatedSpaceSignals || []).length > 0 ? "high" : "medium",
        source: "takeoff",
        note:
          "Room count can support repeated-space painting packages, but not paintable area by itself.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.trimLf || 0) > 0 && /\b(trim|base|baseboard|casing|frame)\b/.test(blob)) {
    linearSignals.push(
      buildSignal({
        label: "Trim / frame linear support",
        quantity: plan?.takeoff.trimLf ?? null,
        unit: "linear_ft",
        exactQuantity: true,
        confidence: "medium",
        source: "takeoff",
        note:
          "Linear trim footage exists, but confirm which trim/casing items are actually in the painting scope.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.doorCount || 0) > 0 && (doorSchedules.length > 0 || /\bdoor|frame|casing\b/.test(blob))) {
    openingSignals.push(
      buildSignal({
        label: "Door opening support",
        quantity: plan?.takeoff.doorCount ?? null,
        unit: "doors",
        exactQuantity: true,
        confidence: doorSchedules.length > 0 ? "high" : "medium",
        source: "takeoff",
        note:
          "Door count is present; confirm whether slabs only or slabs plus frames/casing are included.",
        evidenceRefs: evidence.concat(
          doorSchedules.flatMap((item) => item.evidence || []).slice(0, 2)
        ),
      })
    )
  }

  if (finishSchedules.length > 0 && areaSignals.length === 0) {
    areaSignals.push(
      buildSignal({
        label: "Finish-plan painting coverage cue",
        quantity: null,
        unit: "unknown",
        exactQuantity: false,
        confidence: "medium",
        source: "schedule",
        note:
          "Finish schedule support exists, but it does not by itself prove exact painted area.",
        evidenceRefs: finishSchedules.flatMap((item) => item.evidence || []).slice(0, 3),
      })
    )
  }

  const coverageHints = uniqStrings(
    [
      (plan?.takeoff.wallSqft || 0) > 0 && (plan?.takeoff.ceilingSqft || 0) > 0
        ? "Support exists for walls plus ceilings."
        : null,
      (plan?.takeoff.wallSqft || 0) > 0 && (plan?.takeoff.ceilingSqft || 0) <= 0
        ? "Support is stronger for walls than for ceilings."
        : null,
      (plan?.takeoff.doorCount || 0) > 0
        ? "Door-related support exists; confirm whether frames/casing ride with the same quantity."
        : null,
      packageBuckets.length > 0
        ? `Package buckets may help organize painting quantities around ${packageBuckets.join(", ")}.`
        : null,
      /\bcorridor\b/.test(blob)
        ? "Corridor painting may need to stay separate from room interiors."
        : null,
      /\b(walls and ceilings|ceiling plan|rcp)\b/.test(blob)
        ? "Coverage cues suggest walls plus ceilings rather than walls only."
        : null,
      /\b(trim|doors?|frames?|casing)\b/.test(blob)
        ? "Broader finish-refresh cues may include openings and trim, but confirm inclusion before scaling quantity."
        : null,
    ],
    6
  )

  const reviewNotes = uniqStrings(
    [
      areaSignals.every((item) => !item.exactQuantity)
        ? "Painting area is still not hard-counted; verify wall/ceiling sqft before using this for pricing."
        : null,
      (plan?.takeoff.doorCount || 0) > 0
        ? "Do not assume door count also covers frames, casing, or adjacent trim without explicit scope support."
        : null,
      linearSignals.length === 0 && /\btrim|baseboard|casing|frame\b/.test(blob)
        ? "Trim/frame language is present, but linear support is still weak."
        : null,
      (plan?.repeatedSpaceSignals || []).length > 0 && (plan?.takeoff.roomCount || 0) <= 0
        ? "Repeated-space cues exist, but repeat counts are still not hard-supported."
        : null,
      ...(args.tradePackagePricingPrep?.tradePackageMeasurementHints || []).slice(0, 2),
    ],
    6
  )

  const quantityReasonParts = uniqStrings(
    [
      areaSignals.some((item) => item.exactQuantity)
        ? "Exact takeoff-backed area support exists."
        : null,
      openingSignals.some((item) => item.exactQuantity)
        ? "Opening counts are visible in plan support."
        : null,
      (plan?.repeatedSpaceSignals || []).length > 0
        ? "Repeated-space signals strengthen package-style quantity support."
        : null,
      finishSchedules.length > 0
        ? "Finish schedules reinforce paint coverage cues."
        : null,
      reviewNotes.length > 0 && !areaSignals.some((item) => item.exactQuantity)
        ? "Review notes still dominate over hard quantities."
        : null,
    ],
    4
  )

  const supportLevel: TradeQuantityConfidence["level"] =
    areaSignals.filter((item) => item.exactQuantity).length >= 2 ||
    (areaSignals.some((item) => item.exactQuantity) &&
      openingSignals.some((item) => item.exactQuantity))
      ? "strong"
      : areaSignals.length > 0 || openingSignals.length > 0 || coverageHints.length > 1
      ? "moderate"
      : "weak"

  return {
    trade: "painting",
    supportLevel,
    tradeAreaSignals: uniqSignals(areaSignals),
    tradeLinearSignals: uniqSignals(linearSignals),
    tradeOpeningSignals: uniqSignals(openingSignals),
    tradeCoverageHints: coverageHints,
    tradeQuantityConfidence: {
      level: supportLevel,
      reasons: quantityReasonParts,
    },
    tradeQuantityReviewNotes: reviewNotes,
  }
}

function buildDrywallQuantitySupport(args: {
  planIntelligence: PlanIntelligence | null
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  tradePackagePricingPrep: TradePackagePricingPrep
  scopeText: string
}): TradeQuantitySupport {
  const plan = args.planIntelligence
  const analyses = plan?.analyses || []
  const texts = getPlanTexts(plan)
  const blob = joinLower(texts.concat(args.scopeText))
  const evidence = buildTakeoffEvidence(plan)
  const packageBuckets = getPackageBucketHints({
    handoff: args.handoff,
    structure: args.structure,
    trade: "drywall",
  })

  const drywallFindings = collectTradeFindings(
    analyses,
    "drywall",
    /\bdrywall|sheetrock|partition|patch|texture|skim\b/i
  )
  const partitionFindings = collectTradeFindings(
    analyses,
    null,
    /\bpartition|gyp|gypsum|wall type\b/i
  )
  const quantifiedSqftFinding = drywallFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft"
  )

  const patchLike = /\b(patch|repair|hole|crack|texture|skim)\b/.test(blob)
  const installLike = /\b(hang|install|partition|wall type|sheetrock|drywall)\b/.test(blob)

  const areaSignals: TradeQuantitySignal[] = []
  const linearSignals: TradeQuantitySignal[] = []
  const openingSignals: TradeQuantitySignal[] = []

  if (quantifiedSqftFinding) {
    areaSignals.push(
      buildSignal({
        label: patchLike && !installLike
          ? "Measured patch / repair area support"
          : "Measured drywall assembly area support",
        quantity: quantifiedSqftFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedSqftFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          patchLike && !installLike
            ? "Measured repair area exists in plan findings and can support patch/repair routing without inventing patch counts."
            : "Measured drywall area exists in plan findings and can support install/hang routing more safely than gross wall takeoff alone.",
        evidenceRefs: quantifiedSqftFinding.evidence || [],
      })
    )
  }

  if ((plan?.takeoff.wallSqft || 0) > 0 && (installLike || partitionFindings.length > 0)) {
    areaSignals.push(
      buildSignal({
        label: "Wall-area drywall support",
        quantity: plan?.takeoff.wallSqft ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: drywallFindings.length > 0 ? "high" : "medium",
        source: "takeoff",
        note:
          "Wall area exists and aligns with drywall/partition cues, but confirm whether this is gross wall area or drywall scope area.",
        evidenceRefs: evidence.concat(
          drywallFindings.flatMap((item) => item.evidence || []).slice(0, 2)
        ),
      })
    )
  }

  if ((plan?.takeoff.ceilingSqft || 0) > 0 && /\bceiling|soffit\b/.test(blob)) {
    areaSignals.push(
      buildSignal({
        label: "Ceiling drywall support",
        quantity: plan?.takeoff.ceilingSqft ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: "medium",
        source: "takeoff",
        note:
          "Ceiling area exists, but verify whether the drywall scope truly includes ceilings rather than just finish references.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.roomCount || 0) > 0 && patchLike && (plan?.repeatedSpaceSignals || []).length > 0) {
    areaSignals.push(
      buildSignal({
        label: "Repeated room repair pattern support",
        quantity: plan?.takeoff.roomCount ?? null,
        unit: "rooms",
        exactQuantity: true,
        confidence: "medium",
        source: "takeoff",
        note:
          "Room count can support repeated drywall repair patterns, but not patch counts or exact patch area.",
        evidenceRefs: evidence,
      })
    )
  }

  if (partitionFindings.some((finding) => finding.quantity && finding.unit === "linear_ft")) {
    const best = partitionFindings.find(
      (finding) => finding.quantity && finding.unit === "linear_ft"
    )
    linearSignals.push(
      buildSignal({
        label: "Partition linear support",
        quantity: best?.quantity ?? null,
        unit: "linear_ft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(best?.confidence ?? null),
        source: "trade_finding",
        note:
          "Partition-related linear support exists, but confirm whether it maps to framed wall length or drywall finish coverage.",
        evidenceRefs: best?.evidence || [],
      })
    )
  }

  if (drywallFindings.length > 0 && areaSignals.length === 0 && linearSignals.length === 0) {
    const best = drywallFindings[0]
    areaSignals.push(
      buildSignal({
        label: "Drywall scope cue",
        quantity: null,
        unit: "unknown",
        exactQuantity: false,
        confidence: getTradeSignalConfidence(best.confidence, 75),
        source: "trade_finding",
        note:
          "Drywall scope is visible in plan findings, but quantity support is still descriptive rather than measured.",
        evidenceRefs: best.evidence || [],
      })
    )
  }

  const coverageHints = uniqStrings(
    [
      patchLike ? "Scope cues lean toward patch / repair rather than full hang-and-finish." : null,
      installLike ? "Scope cues lean toward install / hang / finish rather than isolated repair." : null,
      packageBuckets.length > 0
        ? `Package buckets may help organize drywall quantities around ${packageBuckets.join(", ")}.`
        : null,
      /\bpartition|wall type\b/.test(blob)
        ? "Partition cues suggest broader install coverage rather than isolated damage repair."
        : null,
      /\btexture|orange peel|knockdown|level 5|skim\b/.test(blob)
        ? "Finish/texture cues affect how drywall area should be interpreted."
        : null,
      (plan?.repeatedSpaceSignals || []).length > 0 && patchLike
        ? "Repeated-space signals may support repeated-room repair patterns."
        : null,
    ],
    6
  )

  const reviewNotes = uniqStrings(
    [
      patchLike
        ? "Do not convert repeated room support into patch counts or exact patch area without stronger evidence."
        : null,
      patchLike && !quantifiedSqftFinding
        ? "Patch/repair routing should stay non-binding until measured repair area exists."
        : null,
      installLike && areaSignals.every((item) => !item.exactQuantity)
        ? "Install/hang cues exist, but measured drywall area is still weak."
        : null,
      (plan?.takeoff.ceilingSqft || 0) > 0 && !/\bceiling\b/.test(blob)
        ? "Ceiling quantity exists in plan takeoff, but ceiling drywall inclusion still needs confirmation."
        : null,
      linearSignals.length === 0 && /\bpartition|wall type\b/.test(blob)
        ? "Partition cues exist, but no safe linear quantity is confirmed yet."
        : null,
      ...(args.tradePackagePricingPrep?.tradePackageMeasurementHints || []).slice(0, 2),
    ],
    6
  )

  const supportLevel: TradeQuantityConfidence["level"] =
    areaSignals.filter((item) => item.exactQuantity).length >= 2 ||
    (areaSignals.some((item) => item.exactQuantity) &&
      linearSignals.some((item) => item.exactQuantity))
      ? "strong"
      : areaSignals.length > 0 || linearSignals.length > 0 || coverageHints.length > 1
      ? "moderate"
      : "weak"

  return {
    trade: "drywall",
    supportLevel,
    tradeAreaSignals: uniqSignals(areaSignals),
    tradeLinearSignals: uniqSignals(linearSignals),
    tradeOpeningSignals: uniqSignals(openingSignals),
    tradeCoverageHints: coverageHints,
    tradeQuantityConfidence: {
      level: supportLevel,
      reasons: uniqStrings(
        [
          areaSignals.some((item) => item.exactQuantity)
            ? "Exact area support exists for at least part of the drywall scope."
            : null,
          quantifiedSqftFinding && patchLike && !installLike
            ? "Measured repair-area support exists for patch routing."
            : null,
          linearSignals.some((item) => item.exactQuantity)
            ? "Partition-related linear support exists."
            : null,
          patchLike ? "Patch/repair cues were detected." : null,
          installLike ? "Install/hang/finish cues were detected." : null,
          reviewNotes.length > 0 && !areaSignals.some((item) => item.exactQuantity)
            ? "Review guidance still outweighs measured quantity support."
            : null,
        ],
        4
      ),
    },
    tradeQuantityReviewNotes: reviewNotes,
  }
}

function buildWallcoveringQuantitySupport(args: {
  planIntelligence: PlanIntelligence | null
  handoff: EstimateSkeletonHandoff | null
  structure: EstimateStructureConsumption | null
  tradePackagePricingPrep: TradePackagePricingPrep
  scopeText: string
}): TradeQuantitySupport {
  const plan = args.planIntelligence
  const analyses = plan?.analyses || []
  const texts = getPlanTexts(plan)
  const blob = joinLower(texts.concat(args.scopeText))
  const evidence = buildTakeoffEvidence(plan)
  const packageBuckets = getPackageBucketHints({
    handoff: args.handoff,
    structure: args.structure,
    trade: "wallcovering",
  })

  const wallcoveringCue =
    /\b(wallcover(?:ing)?|wallpaper|feature wall|accent wall|vinyl wallcovering)\b/.test(
      blob
    )
  const corridorCue = /\bcorridor|hallway|common area|lobby\b/.test(blob)
  const featureCue = /\bfeature wall|accent wall\b/.test(blob)
  const removalCue = /\b(remove|removal|strip|demo existing)\b/.test(blob)
  const installCue = /\binstall|apply|hang\b/.test(blob)
  const finishSchedules = collectScheduleSignals(
    analyses,
    /\bfinish schedule\b|\bfinish plan\b|\bwallcover(?:ing)?\b/i
  )

  const areaSignals: TradeQuantitySignal[] = []
  const linearSignals: TradeQuantitySignal[] = []
  const openingSignals: TradeQuantitySignal[] = []

  if ((plan?.takeoff.wallSqft || 0) > 0 && wallcoveringCue) {
    areaSignals.push(
      buildSignal({
        label: "Wall-area support for wallcovering",
        quantity: plan?.takeoff.wallSqft ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: featureCue ? "medium" : "high",
        source: "takeoff",
        note:
          "Wall area exists, but confirm whether it represents full-room coverage, corridor coverage, or only selected elevations.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.roomCount || 0) > 0 && wallcoveringCue && (plan?.repeatedSpaceSignals || []).length > 0) {
    areaSignals.push(
      buildSignal({
        label: "Repeated room wallcovering support",
        quantity: plan?.takeoff.roomCount ?? null,
        unit: "rooms",
        exactQuantity: true,
        confidence: "medium",
        source: "takeoff",
        note:
          "Repeated room count can support repeated wallcovering packages, but not exact elevation coverage.",
        evidenceRefs: evidence,
      })
    )
  }

  if (finishSchedules.length > 0 && areaSignals.length === 0) {
    areaSignals.push(
      buildSignal({
        label: "Finish-plan wallcovering cue",
        quantity: null,
        unit: "unknown",
        exactQuantity: false,
        confidence: "medium",
        source: "schedule",
        note:
          "Finish schedule cues support wallcovering review, but exact coverage is still unresolved.",
        evidenceRefs: finishSchedules.flatMap((item) => item.evidence || []).slice(0, 3),
      })
    )
  }

  const coverageHints = uniqStrings(
    [
      corridorCue ? "Coverage cues point toward corridor or common-area wallcovering." : null,
      featureCue ? "Coverage cues point toward feature-wall or accent-wall scope rather than full-room coverage." : null,
      wallcoveringCue && !featureCue && !corridorCue
        ? "Coverage cues point toward broader room wallcovering rather than a single feature wall."
        : null,
      removalCue ? "Removal / strip-out cues exist alongside wallcovering support." : null,
      installCue ? "Install / hang cues exist alongside wallcovering support." : null,
      packageBuckets.length > 0
        ? `Package buckets may help organize wallcovering quantities around ${packageBuckets.join(", ")}.`
        : null,
    ],
    6
  )

  const reviewNotes = uniqStrings(
    [
      areaSignals.every((item) => !item.exactQuantity)
        ? "Wallcovering quantity support is still descriptive; confirm elevations before using it for pricing."
        : null,
      featureCue
        ? "Do not spread feature-wall support across the full room without elevation confirmation."
        : null,
      corridorCue && (plan?.takeoff.wallSqft || 0) > 0
        ? "Gross wall area may overstate corridor wallcovering if only selected elevations are covered."
        : null,
      removalCue && !installCue
        ? "Removal support is present, but reinstall coverage is not yet equally clear."
        : null,
      ...(args.tradePackagePricingPrep?.tradePackageMeasurementHints || []).slice(0, 2),
    ],
    6
  )

  const supportLevel: TradeQuantityConfidence["level"] =
    areaSignals.some((item) => item.exactQuantity) && coverageHints.length >= 2
      ? "moderate"
      : areaSignals.length > 0 || coverageHints.length > 1
      ? "moderate"
      : "weak"

  return {
    trade: "wallcovering",
    supportLevel,
    tradeAreaSignals: uniqSignals(areaSignals),
    tradeLinearSignals: uniqSignals(linearSignals),
    tradeOpeningSignals: uniqSignals(openingSignals),
    tradeCoverageHints: coverageHints,
    tradeQuantityConfidence: {
      level: supportLevel,
      reasons: uniqStrings(
        [
          wallcoveringCue ? "Wallcovering-specific cues were detected." : null,
          areaSignals.some((item) => item.exactQuantity)
            ? "Takeoff-backed wall area exists."
            : null,
          corridorCue ? "Corridor/common-area cues were detected." : null,
          featureCue ? "Feature-wall cues were detected." : null,
          reviewNotes.length > 0 && !areaSignals.some((item) => item.exactQuantity)
            ? "Review guidance still outweighs measured support."
            : null,
        ],
        4
      ),
    },
    tradeQuantityReviewNotes: reviewNotes,
  }
}

export function buildTradeQuantitySupport(args: {
  trade: string
  scopeText: string
  planIntelligence: PlanIntelligence | null
  estimateSkeletonHandoff: EstimateSkeletonHandoff | null
  estimateStructureConsumption: EstimateStructureConsumption | null
  tradePackagePricingPrep: TradePackagePricingPrep
}): TradeQuantitySupport {
  const plan = args.planIntelligence
  if (!plan?.ok) return null

  const targetTrade = detectTargetTrade({
    trade: args.trade,
    scopeText: args.scopeText,
    planIntelligence: plan,
    tradePackagePricingPrep: args.tradePackagePricingPrep,
  })

  if (!targetTrade) return null

  if (targetTrade === "painting") {
    return buildPaintingQuantitySupport({
      planIntelligence: plan,
      handoff: args.estimateSkeletonHandoff,
      structure: args.estimateStructureConsumption,
      tradePackagePricingPrep: args.tradePackagePricingPrep,
      scopeText: args.scopeText,
    })
  }

  if (targetTrade === "drywall") {
    return buildDrywallQuantitySupport({
      planIntelligence: plan,
      handoff: args.estimateSkeletonHandoff,
      structure: args.estimateStructureConsumption,
      tradePackagePricingPrep: args.tradePackagePricingPrep,
      scopeText: args.scopeText,
    })
  }

  return buildWallcoveringQuantitySupport({
    planIntelligence: plan,
    handoff: args.estimateSkeletonHandoff,
    structure: args.estimateStructureConsumption,
    tradePackagePricingPrep: args.tradePackagePricingPrep,
    scopeText: args.scopeText,
  })
}
