import type {
  PlanEvidenceRef,
  PlanIntelligence,
  PlanScheduleItem,
  PlanSheetAnalysis,
  PlanTradeFindingCategory,
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
  category?:
    | PlanTradeFindingCategory
    | "repeated_unit_count"
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

export type TradeCertainty = {
  level: "strong" | "moderate" | "weak"
  score: number
  reasons: string[]
}

export type TradeQuantitySupport = {
  trade: TradeQuantitySupportTrade
  supportLevel: "strong" | "moderate" | "weak"
  tradeCertainty: TradeCertainty
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

function getSupportLevelRank(level: "strong" | "moderate" | "weak"): number {
  if (level === "strong") return 3
  if (level === "moderate") return 2
  return 1
}

function takeMoreConservativeLevel(
  left: "strong" | "moderate" | "weak",
  right: "strong" | "moderate" | "weak"
): "strong" | "moderate" | "weak" {
  return getSupportLevelRank(left) <= getSupportLevelRank(right) ? left : right
}

function hasTradeCueText(trade: TradeQuantitySupportTrade, text: string): boolean {
  if (trade === "painting") return /\b(paint|painting|prime|primer)\b/.test(text)
  if (trade === "drywall") {
    return /\b(drywall|sheetrock|partition|wallboard|texture|skim|patch|repair)\b/.test(text)
  }
  return /\b(wallcover(?:ing)?|wallpaper|feature wall|accent wall|vinyl wallcovering)\b/.test(text)
}

function computeTradeCertainty(args: {
  trade: TradeQuantitySupportTrade
  exactMeasuredSignals: number
  typedFindingSignals: number
  scheduleSignals?: number
  takeoffAlignedSignals?: number
  repeatedPrototypeSignals?: number
  roomContextSignals?: number
  planTradeSignals?: number
  scopeCueSignals?: number
  blockers?: string[]
}): TradeCertainty {
  const scheduleSignals = args.scheduleSignals || 0
  const takeoffAlignedSignals = args.takeoffAlignedSignals || 0
  const repeatedPrototypeSignals = args.repeatedPrototypeSignals || 0
  const roomContextSignals = args.roomContextSignals || 0
  const planTradeSignals = args.planTradeSignals || 0
  const scopeCueSignals = args.scopeCueSignals || 0
  const blockers = uniqStrings(args.blockers || [], 4)

  const score =
    args.exactMeasuredSignals * 4 +
    args.typedFindingSignals * 2 +
    scheduleSignals * 2 +
    takeoffAlignedSignals +
    repeatedPrototypeSignals * 3 +
    roomContextSignals +
    planTradeSignals +
    scopeCueSignals -
    blockers.length * 2

  const level: TradeCertainty["level"] =
    score >= 7 ? "strong" : score >= 4 ? "moderate" : "weak"

  return {
    level,
    score,
    reasons: uniqStrings(
      [
        args.exactMeasuredSignals > 0
          ? `${args.exactMeasuredSignals} exact measured ${args.trade} support signal${args.exactMeasuredSignals === 1 ? "" : "s"} increased trade certainty.`
          : null,
        args.typedFindingSignals > 0
          ? `Typed ${args.trade} findings increased trade certainty beyond wording-only detection.`
          : null,
        scheduleSignals > 0
          ? `${args.trade} schedule evidence reinforced trade certainty.`
          : null,
        takeoffAlignedSignals > 0
          ? `Takeoff alignment supported ${args.trade} only where trade-specific cues already existed.`
          : null,
        repeatedPrototypeSignals > 0
          ? `Repeated-space / prototype support increased ${args.trade} certainty without acting as measured quantity.`
          : null,
        roomContextSignals > 0
          ? `Room-type context strengthened ${args.trade} certainty.`
          : null,
        planTradeSignals > 0
          ? `Plan trade cues explicitly pointed to ${args.trade}.`
          : null,
        scopeCueSignals > 0 && args.exactMeasuredSignals <= 0 && args.typedFindingSignals <= 0
          ? `${args.trade} wording was present, but wording alone stayed low-authority.`
          : null,
        ...blockers,
      ],
      6
    ),
  }
}

function detectTargetTrade(args: {
  trade: string
  scopeText: string
  planIntelligence: PlanIntelligence | null
  tradePackagePricingPrep: TradePackagePricingPrep
}): TradeQuantitySupportTrade | null {
  const directTrade = String(args.trade || "").trim().toLowerCase()
  if (directTrade === "painting" || directTrade === "drywall") {
    return directTrade
  }
  if (directTrade === "wallcovering") return "wallcovering"

  if (args.tradePackagePricingPrep?.trade) {
    return args.tradePackagePricingPrep.trade
  }

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
  const corpusText = corpus.join(" ").toLowerCase()
  const analyses = args.planIntelligence?.analyses || []

  const scoreTrade = (trade: TradeQuantitySupportTrade): number => {
    const detectedTradeSignals = (args.planIntelligence?.detectedTrades || []).filter((value) =>
      String(value || "").toLowerCase().includes(trade === "wallcovering" ? "wallcover" : trade)
    ).length
    const packageSignals = [
      ...(args.planIntelligence?.tradePackageSignals || []),
      ...(args.planIntelligence?.packageScopeCandidates || []),
    ].filter((value) =>
      hasTradeCueText(trade, String(value || "").toLowerCase())
    ).length
    const typedFindingSignals = collectTradeFindings(
      analyses,
      trade === "wallcovering" ? null : trade,
      trade === "painting"
        ? /\bpaint|painting|wall|ceiling|door|frame|trim|casing\b/i
        : trade === "drywall"
          ? /\bdrywall|sheetrock|partition|patch|texture|skim\b/i
          : /\bwallcover(?:ing)?|wallpaper|feature wall|accent wall|corridor\b/i,
      trade === "painting"
        ? ["wall_area", "ceiling_area", "trim_lf", "door_openings"]
        : trade === "drywall"
          ? ["repair_area", "assembly_area", "finish_texture_area", "ceiling_area", "partition_lf"]
          : ["wall_area", "corridor_area", "selected_elevation_area"],
      trade === "wallcovering" ? ["wallcovering", "general renovation"] : null
    ).length

    return detectedTradeSignals * 2 + packageSignals + typedFindingSignals * 3 + (hasTradeCueText(trade, corpusText) ? 1 : 0)
  }

  const scoredTrades = (["painting", "drywall", "wallcovering"] as TradeQuantitySupportTrade[]).map(
    (trade) => ({ trade, score: scoreTrade(trade) })
  )
  const sortedTrades = scoredTrades.sort((left, right) => right.score - left.score)
  if ((sortedTrades[0]?.score || 0) >= 2 && (sortedTrades[0]?.score || 0) > (sortedTrades[1]?.score || 0)) {
    return sortedTrades[0]?.trade || null
  }

  return hasTradeCueText("wallcovering", corpusText)
    ? "wallcovering"
    : hasTradeCueText("drywall", corpusText)
      ? "drywall"
      : hasTradeCueText("painting", corpusText)
        ? "painting"
        : null
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

type PrototypeRoomGroupKind =
  | "guest_room"
  | "suite"
  | "bathroom_cluster"
  | "corridor_hallway"
  | "lobby_common"
  | "amenity_support"
  | "one_off"

type PrototypeRoomRollup = {
  repeatedUnitCount: number | null
  repeatedUnitSource: "takeoff" | "room_signal" | null
  repeatedUnitGroup: PrototypeRoomGroupKind | null
  repeatedUnitGroupLabel: string | null
  hasUnitLikeRooms: boolean
  hasCorridorLikeRooms: boolean
  hasLobbyCommonRooms: boolean
  hasAmenitySupportRooms: boolean
  hasMixedPrototypeCandidates: boolean
}

function classifyPrototypeRoomGroup(value: string): PrototypeRoomGroupKind | null {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return null

  if (/\bcorridor|hallway|hall\b/.test(text)) return "corridor_hallway"
  if (/\blobby|common area|common room|common corridor|public area\b/.test(text)) {
    return "lobby_common"
  }
  if (
    /\bfitness|gym|laundry|storage|back of house|boh|office|break room|support|service|janitor|housekeeping|meeting room|conference|amenity|club room\b/.test(
      text
    )
  ) {
    return "amenity_support"
  }
  if (/\bbath(room)?|restroom|wc|water closet|toilet\b/.test(text)) {
    return "bathroom_cluster"
  }
  if (/\bsuite|studio|apartment|tenant unit|dwelling unit|unit\b/.test(text)) {
    return "suite"
  }
  if (/\bguest room|guestroom|bed(room)?|typical room\b/.test(text)) {
    return "guest_room"
  }
  if (/\bone[-\s]?off|unique|model\b/.test(text)) return "one_off"

  return null
}

function isPrototypeQualifier(kind: PrototypeRoomGroupKind | null): boolean {
  return kind === "guest_room" || kind === "suite"
}

function getPrototypeRoomGroupLabel(kind: PrototypeRoomGroupKind | null): string | null {
  if (kind === "guest_room") return "guest room"
  if (kind === "suite") return "suite / unit"
  if (kind === "bathroom_cluster") return "bathroom cluster"
  if (kind === "corridor_hallway") return "corridor / hallway"
  if (kind === "lobby_common") return "lobby / common area"
  if (kind === "amenity_support") return "amenity / support space"
  if (kind === "one_off") return "one-off room"
  return null
}

function pickPrototypeGroup(args: {
  measuredCounts: Map<PrototypeRoomGroupKind, number>
  hintedCounts: Map<PrototypeRoomGroupKind, number>
}): PrototypeRoomGroupKind | null {
  const measuredCandidates = Array.from(args.measuredCounts.entries()).filter(
    ([kind, count]) => isPrototypeQualifier(kind) && count >= 2
  )

  if (measuredCandidates.length === 1) return measuredCandidates[0][0]
  if (measuredCandidates.length > 1) {
    const sorted = measuredCandidates.sort((left, right) => right[1] - left[1])
    if ((sorted[0]?.[1] || 0) > (sorted[1]?.[1] || 0)) return sorted[0][0]

    const hintedCandidates = Array.from(args.hintedCounts.entries()).filter(([kind, count]) => {
      return isPrototypeQualifier(kind) && count > 0
    })
    if (hintedCandidates.length === 1) return hintedCandidates[0][0]
    return null
  }

  const hintedCandidates = Array.from(args.hintedCounts.entries()).filter(([kind, count]) => {
    return isPrototypeQualifier(kind) && count > 0
  })
  if (hintedCandidates.length === 1) return hintedCandidates[0][0]

  return null
}

function buildRepeatedSpaceRoomRollup(planIntelligence: PlanIntelligence | null): PrototypeRoomRollup {
  if (!planIntelligence?.ok) {
    return {
      repeatedUnitCount: null,
      repeatedUnitSource: null,
      repeatedUnitGroup: null,
      repeatedUnitGroupLabel: null,
      hasUnitLikeRooms: false,
      hasCorridorLikeRooms: false,
      hasLobbyCommonRooms: false,
      hasAmenitySupportRooms: false,
      hasMixedPrototypeCandidates: false,
    }
  }

  const inferredRoomLabels = [
    ...(planIntelligence.detectedRooms || []),
    ...(planIntelligence.likelyRoomTypes || []),
    ...(planIntelligence.repeatedSpaceSignals || []),
    ...(planIntelligence.prototypeSignals || []),
    ...(planIntelligence.prototypePackageSignals || []),
  ]
  const measuredRoomNames = (planIntelligence.analyses || []).flatMap((analysis) =>
    (analysis.rooms || []).map((room) => room.roomName)
  )
  const measuredCounts = new Map<PrototypeRoomGroupKind, number>()
  const hintedCounts = new Map<PrototypeRoomGroupKind, number>()

  for (const roomName of measuredRoomNames) {
    const kind = classifyPrototypeRoomGroup(roomName)
    if (!kind) continue
    measuredCounts.set(kind, (measuredCounts.get(kind) || 0) + 1)
  }

  for (const roomName of inferredRoomLabels) {
    const kind = classifyPrototypeRoomGroup(roomName)
    if (!kind) continue
    hintedCounts.set(kind, (hintedCounts.get(kind) || 0) + 1)
  }

  const hasPrototypeSignals =
    (planIntelligence.repeatedSpaceSignals || []).length > 0 ||
    (planIntelligence.prototypeSignals || []).length > 0 ||
    (planIntelligence.prototypePackageSignals || []).length > 0
  const selectedPrototypeGroup = pickPrototypeGroup({
    measuredCounts,
    hintedCounts,
  })
  const selectedPrototypeLabel = getPrototypeRoomGroupLabel(selectedPrototypeGroup)
  const prototypeCandidateKinds = Array.from(
    new Set(
      [...measuredCounts.keys(), ...hintedCounts.keys()].filter((kind) =>
        isPrototypeQualifier(kind)
      )
    )
  )

  if (
    hasPrototypeSignals &&
    selectedPrototypeGroup &&
    (measuredCounts.get(selectedPrototypeGroup) || 0) >= 2
  ) {
    return {
      repeatedUnitCount: measuredCounts.get(selectedPrototypeGroup) || null,
      repeatedUnitSource: "room_signal",
      repeatedUnitGroup: selectedPrototypeGroup,
      repeatedUnitGroupLabel: selectedPrototypeLabel,
      hasUnitLikeRooms: prototypeCandidateKinds.length > 0,
      hasCorridorLikeRooms:
        (measuredCounts.get("corridor_hallway") || 0) > 0 ||
        (hintedCounts.get("corridor_hallway") || 0) > 0,
      hasLobbyCommonRooms:
        (measuredCounts.get("lobby_common") || 0) > 0 ||
        (hintedCounts.get("lobby_common") || 0) > 0,
      hasAmenitySupportRooms:
        (measuredCounts.get("amenity_support") || 0) > 0 ||
        (hintedCounts.get("amenity_support") || 0) > 0,
      hasMixedPrototypeCandidates: prototypeCandidateKinds.length > 1,
    }
  }

  if (
    hasPrototypeSignals &&
    selectedPrototypeGroup &&
    prototypeCandidateKinds.length === 1 &&
    typeof planIntelligence.takeoff.roomCount === "number" &&
    planIntelligence.takeoff.roomCount > 0
  ) {
    return {
      repeatedUnitCount: Math.round(planIntelligence.takeoff.roomCount),
      repeatedUnitSource: "takeoff",
      repeatedUnitGroup: selectedPrototypeGroup,
      repeatedUnitGroupLabel: selectedPrototypeLabel,
      hasUnitLikeRooms: prototypeCandidateKinds.length > 0,
      hasCorridorLikeRooms:
        (measuredCounts.get("corridor_hallway") || 0) > 0 ||
        (hintedCounts.get("corridor_hallway") || 0) > 0,
      hasLobbyCommonRooms:
        (measuredCounts.get("lobby_common") || 0) > 0 ||
        (hintedCounts.get("lobby_common") || 0) > 0,
      hasAmenitySupportRooms:
        (measuredCounts.get("amenity_support") || 0) > 0 ||
        (hintedCounts.get("amenity_support") || 0) > 0,
      hasMixedPrototypeCandidates: false,
    }
  }

  return {
    repeatedUnitCount: null,
    repeatedUnitSource: null,
    repeatedUnitGroup: null,
    repeatedUnitGroupLabel: null,
    hasUnitLikeRooms: prototypeCandidateKinds.length > 0,
    hasCorridorLikeRooms:
      (measuredCounts.get("corridor_hallway") || 0) > 0 ||
      (hintedCounts.get("corridor_hallway") || 0) > 0,
    hasLobbyCommonRooms:
      (measuredCounts.get("lobby_common") || 0) > 0 ||
      (hintedCounts.get("lobby_common") || 0) > 0,
    hasAmenitySupportRooms:
      (measuredCounts.get("amenity_support") || 0) > 0 ||
      (hintedCounts.get("amenity_support") || 0) > 0,
    hasMixedPrototypeCandidates: prototypeCandidateKinds.length > 1,
  }
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
  pattern: RegExp,
  categories: PlanTradeFindingCategory[] = [],
  allowedTrades: PlanTradeFinding["trade"][] | null = null
): PlanTradeFinding[] {
  return analyses.flatMap((analysis) =>
    (analysis.tradeFindings || []).filter((finding) => {
      if (allowedTrades && !allowedTrades.includes(finding.trade)) return false
      if (!allowedTrades && matchTrade && finding.trade !== matchTrade) return false
      if (categories.length > 0) {
        const findingCategory = getTradeFindingCategory(finding)
        if (findingCategory && categories.includes(findingCategory)) return true
      }
      const blob = [finding.label, ...(finding.notes || [])].join(" ")
      return pattern.test(blob)
    })
  )
}

function getFindingBlob(finding: PlanTradeFinding): string {
  return [finding.label, ...(finding.notes || [])].join(" ")
}

function inferTradeFindingCategory(
  finding: PlanTradeFinding
): PlanTradeFindingCategory | undefined {
  const blob = getFindingBlob(finding).toLowerCase()

  if (finding.unit === "linear_ft" && /\bpartition|gyp|gypsum|wall type\b/.test(blob)) {
    return "partition_lf"
  }
  if (finding.unit === "linear_ft" && /\btrim|base|baseboard|casing|frame\b/.test(blob)) {
    return "trim_lf"
  }
  if ((finding.unit === "doors" || finding.unit === "each") && /\bdoor|frame|casing\b/.test(blob)) {
    return "door_openings"
  }
  if (
    finding.unit === "sqft" &&
    /\bfeature wall|accent wall|selected elevation|elevation\b/.test(blob)
  ) {
    return "selected_elevation_area"
  }
  if (finding.unit === "sqft" && /\bcorridor|hallway|lobby|common area\b/.test(blob)) {
    return "corridor_area"
  }
  if (finding.unit === "sqft" && /\bpatch|repair|hole|crack\b/.test(blob)) {
    return "repair_area"
  }
  if (finding.unit === "sqft" && /\bfinish|texture|level\s*[45]|skim\b/.test(blob)) {
    return "finish_texture_area"
  }
  if (finding.unit === "sqft" && /\bceiling|rcp|soffit\b/.test(blob)) {
    return "ceiling_area"
  }
  if (
    finding.trade === "drywall" &&
    finding.unit === "sqft" &&
    /\bdrywall|sheetrock|partition|wallboard|board area\b/.test(blob)
  ) {
    return "assembly_area"
  }
  if (finding.unit === "sqft" && /\bwall|paint|wallcover(?:ing)?|wallpaper\b/.test(blob)) {
    return "wall_area"
  }

  return undefined
}

function getTradeFindingCategory(
  finding: PlanTradeFinding
): PlanTradeFindingCategory | undefined {
  return finding.category || inferTradeFindingCategory(finding)
}

function findingHasCategory(
  finding: PlanTradeFinding,
  categories: PlanTradeFindingCategory[]
): boolean {
  const category = getTradeFindingCategory(finding)
  return !!category && categories.includes(category)
}

function buildSignal(args: {
  label: string
  category?: TradeQuantitySignal["category"]
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
    category: args.category,
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
  const paintingFindings = collectTradeFindings(
    analyses,
    "painting",
    /\bpaint|painting|wall|ceiling|door|frame|trim|casing\b/i,
    ["wall_area", "ceiling_area", "trim_lf", "door_openings"]
  )
  const repeatedSpaceRollup = buildRepeatedSpaceRoomRollup(plan)
  const quantifiedWallFinding = paintingFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft" &&
      (findingHasCategory(finding, ["wall_area"]) ||
        /\bwall/i.test(getFindingBlob(finding)))
  )
  const quantifiedCeilingFinding = paintingFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft" &&
      (findingHasCategory(finding, ["ceiling_area"]) ||
        /\bceiling|rcp|soffit/i.test(getFindingBlob(finding)))
  )
  const quantifiedTrimFinding = paintingFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "linear_ft" &&
      (findingHasCategory(finding, ["trim_lf"]) ||
        /\btrim|base|baseboard|casing|frame/i.test(getFindingBlob(finding)))
  )
  const quantifiedDoorFinding = paintingFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      (finding.unit === "doors" || finding.unit === "each") &&
      (findingHasCategory(finding, ["door_openings"]) ||
        /\bdoor|frame|casing/i.test(getFindingBlob(finding)))
  )
  const quantifiedDoorSchedule = doorSchedules.find(
    (schedule) => typeof schedule.quantity === "number" && schedule.quantity > 0
  )

  const areaSignals: TradeQuantitySignal[] = []
  const linearSignals: TradeQuantitySignal[] = []
  const openingSignals: TradeQuantitySignal[] = []

  if (quantifiedWallFinding) {
    areaSignals.push(
      buildSignal({
        label: "Wall coverage support",
        category: "wall_area",
        quantity: quantifiedWallFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedWallFinding.confidence ?? null, 75),
        source: "trade_finding",
        note: "Measured wall area exists in plan findings and can back direct painting wall rows.",
        evidenceRefs: quantifiedWallFinding.evidence || [],
      })
    )
  } else if ((plan?.takeoff.wallSqft || 0) > 0) {
    areaSignals.push(
      buildSignal({
        label: "Wall coverage support",
        category: "wall_area",
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

  if (quantifiedCeilingFinding) {
    areaSignals.push(
      buildSignal({
        label: "Ceiling coverage support",
        category: "ceiling_area",
        quantity: quantifiedCeilingFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedCeilingFinding.confidence ?? null, 75),
        source: "trade_finding",
        note: "Measured ceiling area exists in plan findings and can back direct painting ceiling rows.",
        evidenceRefs: quantifiedCeilingFinding.evidence || [],
      })
    )
  } else if ((plan?.takeoff.ceilingSqft || 0) > 0) {
    areaSignals.push(
      buildSignal({
        label: "Ceiling coverage support",
        category: "ceiling_area",
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

  if (repeatedSpaceRollup.repeatedUnitCount && repeatedSpaceRollup.repeatedUnitCount > 0) {
    areaSignals.push(
      buildSignal({
        label: repeatedSpaceRollup.repeatedUnitGroupLabel
          ? `Repeated ${repeatedSpaceRollup.repeatedUnitGroupLabel} prototype support`
          : "Repeated unit prototype support",
        category: "repeated_unit_count",
        quantity: repeatedSpaceRollup.repeatedUnitCount,
        unit: "rooms",
        exactQuantity: true,
        confidence: "high",
        source: repeatedSpaceRollup.repeatedUnitSource ?? "room_signal",
        note:
          repeatedSpaceRollup.hasCorridorLikeRooms
            ? `Repeated ${repeatedSpaceRollup.repeatedUnitGroupLabel || "unit"} count supports prototype painting rollups, while corridor/common-area scope stays separate from direct repeated-unit rows.`
            : `Repeated ${repeatedSpaceRollup.repeatedUnitGroupLabel || "unit"} count supports prototype painting rollups, but not measured paintable area by itself.`,
        evidenceRefs: evidence,
      })
    )
  }

  if (quantifiedTrimFinding) {
    linearSignals.push(
      buildSignal({
        label: "Trim / frame linear support",
        category: "trim_lf",
        quantity: quantifiedTrimFinding.quantity ?? null,
        unit: "linear_ft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedTrimFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured trim/casing footage exists in plan findings and can back direct trim/casing rows.",
        evidenceRefs: quantifiedTrimFinding.evidence || [],
      })
    )
  } else if ((plan?.takeoff.trimLf || 0) > 0 && /\b(trim|base|baseboard|casing|frame)\b/.test(blob)) {
    linearSignals.push(
      buildSignal({
        label: "Trim / frame linear support",
        category: "trim_lf",
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

  if (quantifiedDoorFinding) {
    openingSignals.push(
      buildSignal({
        label: "Door opening support",
        category: "door_openings",
        quantity: quantifiedDoorFinding.quantity ?? null,
        unit: "doors",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedDoorFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured door/frame counts exist in plan findings and can back direct door/frame rows.",
        evidenceRefs: quantifiedDoorFinding.evidence || [],
      })
    )
  } else if (quantifiedDoorSchedule) {
    openingSignals.push(
      buildSignal({
        label: "Door opening support",
        category: "door_openings",
        quantity: quantifiedDoorSchedule.quantity ?? null,
        unit: "doors",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedDoorSchedule.confidence ?? null, 75),
        source: "schedule",
        note:
          "Exact door schedule counts exist and can back direct door/frame rows without relying on broader takeoff counts.",
        evidenceRefs: quantifiedDoorSchedule.evidence || [],
      })
    )
  } else if ((plan?.takeoff.doorCount || 0) > 0 && (doorSchedules.length > 0 || /\bdoor|frame|casing\b/.test(blob))) {
    openingSignals.push(
      buildSignal({
        label: "Door opening support",
        category: "door_openings",
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
      repeatedSpaceRollup.hasUnitLikeRooms
        ? repeatedSpaceRollup.repeatedUnitGroupLabel
          ? `${repeatedSpaceRollup.repeatedUnitGroupLabel} signals support prototype/repeated-room painting rollups.`
          : "Unit-like room-type signals support prototype/repeated-room painting rollups."
        : null,
      repeatedSpaceRollup.hasCorridorLikeRooms
        ? "Corridor/common-area room-type signals should stay separate from repeated-unit direct rows."
        : null,
      repeatedSpaceRollup.hasLobbyCommonRooms
        ? "Lobby/common-area room-type signals should stay separate from guest-room or suite prototype rows."
        : null,
      repeatedSpaceRollup.hasAmenitySupportRooms
        ? "Amenity/support spaces should stay separate from repeated guest-room or suite prototype scaling."
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
      (plan?.takeoff.doorCount || 0) > 0 || !!quantifiedDoorSchedule
        ? "Do not assume door count also covers frames, casing, or adjacent trim without explicit scope support."
        : null,
      linearSignals.length === 0 && /\btrim|baseboard|casing|frame\b/.test(blob)
        ? "Trim/frame language is present, but linear support is still weak."
        : null,
      (plan?.repeatedSpaceSignals || []).length > 0 && !repeatedSpaceRollup.repeatedUnitCount
        ? "Repeated-space cues exist, but repeat counts are still not hard-supported."
        : null,
      repeatedSpaceRollup.hasMixedPrototypeCandidates && !repeatedSpaceRollup.repeatedUnitCount
        ? "Multiple unit-style room groups were detected, so prototype scaling stayed non-binding until one repeatable room type was clear."
        : null,
      repeatedSpaceRollup.hasCorridorLikeRooms && repeatedSpaceRollup.repeatedUnitCount
        ? "Repeated-unit rollups should not absorb corridor/common-area scope."
        : null,
      repeatedSpaceRollup.hasLobbyCommonRooms && repeatedSpaceRollup.repeatedUnitCount
        ? "Repeated-unit rollups should not absorb lobby/common-area scope."
        : null,
      ...(args.tradePackagePricingPrep?.tradePackageMeasurementHints || []).slice(0, 2),
    ],
    6
  )

  const quantityReasonParts = uniqStrings(
    [
      areaSignals.some((item) => item.exactQuantity && item.unit === "sqft")
        ? "Exact takeoff-backed area support exists."
        : null,
      repeatedSpaceRollup.repeatedUnitCount && repeatedSpaceRollup.repeatedUnitSource === "room_signal"
        ? "Measured room-group repetition supports prototype scaling without acting as measured paintable area."
        : null,
      openingSignals.some((item) => item.exactQuantity)
        ? "Opening counts are visible in plan support."
        : null,
      repeatedSpaceRollup.repeatedUnitCount
        ? repeatedSpaceRollup.repeatedUnitSource === "room_signal"
          ? repeatedSpaceRollup.repeatedUnitGroupLabel
            ? `Room-type signals provide a repeatable ${repeatedSpaceRollup.repeatedUnitGroupLabel} count for prototype painting support.`
            : "Room-type signals provide a repeatable unit count for prototype painting support."
          : repeatedSpaceRollup.repeatedUnitGroupLabel
            ? `Repeated-space signals strengthen ${repeatedSpaceRollup.repeatedUnitGroupLabel} package support.`
            : "Repeated-space signals strengthen package-style quantity support."
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

  const strongPrototypeSupport =
    repeatedSpaceRollup.repeatedUnitCount != null &&
    repeatedSpaceRollup.repeatedUnitCount >= 2 &&
    repeatedSpaceRollup.repeatedUnitSource === "room_signal"

  const quantitySupportLevel: TradeQuantityConfidence["level"] =
    areaSignals.filter((item) => item.exactQuantity).length >= 2 ||
    strongPrototypeSupport ||
    (areaSignals.some((item) => item.exactQuantity) &&
      openingSignals.some((item) => item.exactQuantity))
      ? "strong"
      : areaSignals.length > 0 || openingSignals.length > 0 || coverageHints.length > 1
      ? "moderate"
      : "weak"
  const tradeCertainty = computeTradeCertainty({
    trade: "painting",
    exactMeasuredSignals:
      [quantifiedWallFinding, quantifiedCeilingFinding, quantifiedTrimFinding, quantifiedDoorFinding].filter(Boolean).length +
      (quantifiedDoorSchedule ? 1 : 0),
    typedFindingSignals: paintingFindings.filter((finding) =>
      findingHasCategory(finding, ["wall_area", "ceiling_area", "trim_lf", "door_openings"])
    ).length,
    scheduleSignals: finishSchedules.length + (quantifiedDoorSchedule ? 1 : 0),
    takeoffAlignedSignals:
      ((plan?.takeoff.wallSqft || 0) > 0 ? 1 : 0) +
      ((plan?.takeoff.ceilingSqft || 0) > 0 ? 1 : 0) +
      ((plan?.takeoff.trimLf || 0) > 0 ? 1 : 0) +
      ((plan?.takeoff.doorCount || 0) > 0 ? 1 : 0),
    repeatedPrototypeSignals: strongPrototypeSupport ? 1 : 0,
    roomContextSignals:
      repeatedSpaceRollup.hasUnitLikeRooms || repeatedSpaceRollup.repeatedUnitGroupLabel ? 1 : 0,
    planTradeSignals:
      (plan?.detectedTrades || []).filter((value) => /paint/i.test(String(value || ""))).length +
      (plan?.tradePackageSignals || []).filter((value) => /paint/i.test(String(value || ""))).length,
    scopeCueSignals: /\bpaint|painting|prime|primer\b/.test(blob) ? 1 : 0,
    blockers: [
      (plan?.repeatedSpaceSignals || []).length > 0 && !repeatedSpaceRollup.repeatedUnitCount
        ? "Repeated-room wording stayed low-authority because no single measured room group was clear."
        : null,
      repeatedSpaceRollup.hasMixedPrototypeCandidates && !repeatedSpaceRollup.repeatedUnitCount
        ? "Multiple repeatable room groups were present, so painting trade certainty stayed conservative."
        : null,
      !quantifiedWallFinding &&
      !quantifiedCeilingFinding &&
      !quantifiedTrimFinding &&
      !quantifiedDoorFinding &&
      !quantifiedDoorSchedule &&
      finishSchedules.length === 0 &&
      !strongPrototypeSupport &&
      ((plan?.takeoff.wallSqft || 0) > 0 ||
        (plan?.takeoff.ceilingSqft || 0) > 0 ||
        (plan?.takeoff.trimLf || 0) > 0 ||
        (plan?.takeoff.doorCount || 0) > 0)
        ? "Painting certainty stayed conservative because only broad takeoff support existed without typed findings, schedules, or qualified prototype evidence."
        : null,
    ].filter(Boolean) as string[],
  })
  const supportLevel = takeMoreConservativeLevel(quantitySupportLevel, tradeCertainty.level)

  return {
    trade: "painting",
    supportLevel,
    tradeCertainty,
    tradeAreaSignals: uniqSignals(areaSignals),
    tradeLinearSignals: uniqSignals(linearSignals),
    tradeOpeningSignals: uniqSignals(openingSignals),
    tradeCoverageHints: coverageHints,
    tradeQuantityConfidence: {
      level: quantitySupportLevel,
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
    /\bdrywall|sheetrock|partition|patch|texture|skim\b/i,
    ["repair_area", "assembly_area", "finish_texture_area", "ceiling_area", "partition_lf"]
  )
  const partitionFindings = collectTradeFindings(
    analyses,
    null,
    /\bpartition|gyp|gypsum|wall type\b/i,
    ["partition_lf"]
  )
  const quantifiedRepairSqftFinding = drywallFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft" &&
      (findingHasCategory(finding, ["repair_area"]) ||
        /\bpatch|repair|hole|crack\b/i.test(getFindingBlob(finding)))
  )
  const quantifiedCeilingSqftFinding = drywallFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft" &&
      (findingHasCategory(finding, ["ceiling_area"]) ||
        /\bceiling|soffit/i.test(getFindingBlob(finding)))
  )
  const quantifiedAssemblySqftFinding = drywallFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft" &&
      (findingHasCategory(finding, ["assembly_area"]) ||
        !/\bpatch|repair|hole|crack|texture|skim|ceiling|soffit/i.test(
          getFindingBlob(finding)
        ))
  )
  const quantifiedFinishSqftFinding = drywallFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft" &&
      (findingHasCategory(finding, ["finish_texture_area"]) ||
        /\bfinish|texture|level\s*[45]|skim/i.test(getFindingBlob(finding)))
  )

  const patchLike = /\b(patch|repair|hole|crack|texture|skim)\b/.test(blob)
  const installLike = /\b(hang|install|partition|wall type|sheetrock|drywall)\b/.test(blob)

  const areaSignals: TradeQuantitySignal[] = []
  const linearSignals: TradeQuantitySignal[] = []
  const openingSignals: TradeQuantitySignal[] = []

  if (quantifiedRepairSqftFinding) {
    areaSignals.push(
      buildSignal({
        label: "Measured patch / repair area support",
        category: "repair_area",
        quantity: quantifiedRepairSqftFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedRepairSqftFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured repair area exists in plan findings and can support patch/repair routing without inventing patch counts.",
        evidenceRefs: quantifiedRepairSqftFinding.evidence || [],
      })
    )
  }

  if (quantifiedAssemblySqftFinding) {
    areaSignals.push(
      buildSignal({
        label: "Measured drywall assembly area support",
        category: "assembly_area",
        quantity: quantifiedAssemblySqftFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedAssemblySqftFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured drywall assembly area exists in plan findings and can support install/hang routing more safely than gross wall takeoff alone.",
        evidenceRefs: quantifiedAssemblySqftFinding.evidence || [],
      })
    )
  }

  if (quantifiedCeilingSqftFinding) {
    areaSignals.push(
      buildSignal({
        label: "Measured ceiling drywall area support",
        category: "ceiling_area",
        quantity: quantifiedCeilingSqftFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedCeilingSqftFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured ceiling drywall area exists in plan findings and can back direct ceiling drywall rows.",
        evidenceRefs: quantifiedCeilingSqftFinding.evidence || [],
      })
    )
  }

  if (quantifiedFinishSqftFinding) {
    areaSignals.push(
      buildSignal({
        label: "Measured finish / texture area support",
        category: "finish_texture_area",
        quantity: quantifiedFinishSqftFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(quantifiedFinishSqftFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured finish/texture area exists in plan findings and can support direct finish/texture rows more safely than broad assembly inference alone.",
        evidenceRefs: quantifiedFinishSqftFinding.evidence || [],
      })
    )
  }

  if (
    (plan?.takeoff.wallSqft || 0) > 0 &&
    (
      (installLike && !patchLike) ||
      partitionFindings.length > 0 ||
      !!quantifiedAssemblySqftFinding ||
      !!quantifiedFinishSqftFinding ||
      !!quantifiedCeilingSqftFinding
    )
  ) {
    areaSignals.push(
      buildSignal({
        label: "Wall-area drywall support",
        category: "assembly_area",
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
        category: "ceiling_area",
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
        category: "repeated_unit_count",
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
        category: "partition_lf",
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
      quantifiedFinishSqftFinding
        ? "Measured finish/texture area support exists for drywall finish routing."
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
      patchLike && !quantifiedRepairSqftFinding
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

  const quantitySupportLevel: TradeQuantityConfidence["level"] =
    areaSignals.filter((item) => item.exactQuantity).length >= 2 ||
    (areaSignals.some((item) => item.exactQuantity) &&
      linearSignals.some((item) => item.exactQuantity))
      ? "strong"
      : areaSignals.length > 0 || linearSignals.length > 0 || coverageHints.length > 1
      ? "moderate"
      : "weak"
  const tradeCertainty = computeTradeCertainty({
    trade: "drywall",
    exactMeasuredSignals:
      [quantifiedRepairSqftFinding, quantifiedAssemblySqftFinding, quantifiedFinishSqftFinding, quantifiedCeilingSqftFinding].filter(Boolean).length,
    typedFindingSignals: drywallFindings.filter((finding) =>
      findingHasCategory(finding, ["repair_area", "assembly_area", "finish_texture_area", "ceiling_area", "partition_lf"])
    ).length,
    takeoffAlignedSignals:
      ((plan?.takeoff.wallSqft || 0) > 0 && installLike && !patchLike ? 1 : 0) +
      ((plan?.takeoff.ceilingSqft || 0) > 0 && /\bceiling|soffit\b/.test(blob) ? 1 : 0),
    roomContextSignals:
      (plan?.repeatedSpaceSignals || []).length > 0 && patchLike ? 1 : 0,
    planTradeSignals:
      (plan?.detectedTrades || []).filter((value) => /drywall|sheetrock/i.test(String(value || ""))).length +
      (plan?.tradePackageSignals || []).filter((value) => /drywall|sheetrock/i.test(String(value || ""))).length,
    scopeCueSignals: patchLike || installLike ? 1 : 0,
    blockers: [
      patchLike && !quantifiedRepairSqftFinding
        ? "Repair wording existed, but measured repair area was missing."
        : null,
      installLike &&
      !quantifiedAssemblySqftFinding &&
      !quantifiedFinishSqftFinding &&
      !quantifiedCeilingSqftFinding
        ? "Install wording relied on generic drywall cues without measured assembly support."
        : null,
    ].filter(Boolean) as string[],
  })
  const supportLevel = takeMoreConservativeLevel(quantitySupportLevel, tradeCertainty.level)

  return {
    trade: "drywall",
    supportLevel,
    tradeCertainty,
    tradeAreaSignals: uniqSignals(areaSignals),
    tradeLinearSignals: uniqSignals(linearSignals),
    tradeOpeningSignals: uniqSignals(openingSignals),
    tradeCoverageHints: coverageHints,
    tradeQuantityConfidence: {
      level: quantitySupportLevel,
      reasons: uniqStrings(
        [
          areaSignals.some((item) => item.exactQuantity)
            ? "Exact area support exists for at least part of the drywall scope."
            : null,
          quantifiedRepairSqftFinding
            ? "Measured repair-area support exists for patch routing."
            : null,
          quantifiedFinishSqftFinding
            ? "Measured finish/texture area support exists for finish routing."
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
  const wallcoveringFindings = collectTradeFindings(
    analyses,
    null,
    /\bwallcover(?:ing)?|wallpaper|feature wall|accent wall|corridor\b/i,
    ["wall_area", "corridor_area", "selected_elevation_area"],
    ["wallcovering", "general renovation"]
  )
  const quantifiedWallcoveringSqftFinding = wallcoveringFindings.find(
    (finding) =>
      typeof finding.quantity === "number" &&
      finding.quantity > 0 &&
      finding.unit === "sqft"
  )
  const selectedElevationFinding =
    quantifiedWallcoveringSqftFinding &&
    (findingHasCategory(quantifiedWallcoveringSqftFinding, ["selected_elevation_area"]) ||
      /\bfeature wall|accent wall|selected elevation|elevation\b/i.test(
        getFindingBlob(quantifiedWallcoveringSqftFinding)
      )) &&
    !/\bgeneral wall area|full(?:-|\s)?area|overall wall area\b/i.test(
      getFindingBlob(quantifiedWallcoveringSqftFinding)
    )
      ? quantifiedWallcoveringSqftFinding
      : null
  const corridorWallcoveringFinding =
    quantifiedWallcoveringSqftFinding &&
    (findingHasCategory(quantifiedWallcoveringSqftFinding, ["corridor_area"]) ||
      /\bcorridor|hallway|lobby|common area\b/i.test(
        getFindingBlob(quantifiedWallcoveringSqftFinding)
      )) &&
    !/\bgeneral wall area|full(?:-|\s)?area|overall wall area\b/i.test(
      getFindingBlob(quantifiedWallcoveringSqftFinding)
    )
      ? quantifiedWallcoveringSqftFinding
      : null
  const fullAreaWallcoveringFinding =
    quantifiedWallcoveringSqftFinding &&
    (findingHasCategory(quantifiedWallcoveringSqftFinding, ["wall_area"]) ||
      !getTradeFindingCategory(quantifiedWallcoveringSqftFinding)) &&
    !selectedElevationFinding &&
    !corridorWallcoveringFinding
      ? quantifiedWallcoveringSqftFinding
      : null

  const areaSignals: TradeQuantitySignal[] = []
  const linearSignals: TradeQuantitySignal[] = []
  const openingSignals: TradeQuantitySignal[] = []

  if (selectedElevationFinding) {
    areaSignals.push(
      buildSignal({
        label: "Selected-elevation wallcovering area support",
        category: "selected_elevation_area",
        quantity: selectedElevationFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(selectedElevationFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured selected-elevation or feature-wall area exists in plan findings and stays narrower than gross full-room wall area.",
        evidenceRefs: selectedElevationFinding.evidence || [],
      })
    )
  } else if (corridorWallcoveringFinding) {
    areaSignals.push(
      buildSignal({
        label: "Corridor wallcovering area support",
        category: "corridor_area",
        quantity: corridorWallcoveringFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(corridorWallcoveringFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured corridor/common-area wallcovering area exists in plan findings and can back corridor install/remove rows while corridor burden stays embedded.",
        evidenceRefs: corridorWallcoveringFinding.evidence || [],
      })
    )
  } else if (fullAreaWallcoveringFinding && !featureCue && !corridorCue) {
    areaSignals.push(
      buildSignal({
        label: "Wall-area support for wallcovering",
        category: "wall_area",
        quantity: fullAreaWallcoveringFinding.quantity ?? null,
        unit: "sqft",
        exactQuantity: true,
        confidence: getTradeSignalConfidence(fullAreaWallcoveringFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "Measured wallcovering area exists in plan findings and can back direct install/remove rows more safely than gross wall area.",
        evidenceRefs: fullAreaWallcoveringFinding.evidence || [],
      })
    )
  } else if (fullAreaWallcoveringFinding && (featureCue || corridorCue)) {
    areaSignals.push(
      buildSignal({
        label: featureCue
          ? "Selected-elevation wallcovering ambiguity cue"
          : "Corridor wallcovering ambiguity cue",
        category: featureCue ? "selected_elevation_area" : "corridor_area",
        quantity: null,
        unit: "unknown",
        exactQuantity: false,
        confidence: getTradeSignalConfidence(fullAreaWallcoveringFinding.confidence ?? null, 75),
        source: "trade_finding",
        note:
          "A measured wallcovering finding exists, but narrower feature-wall or corridor cues remain unresolved, so full-area quantity stays non-binding until coverage is explicit.",
        evidenceRefs: fullAreaWallcoveringFinding.evidence || [],
      })
    )
  } else if ((plan?.takeoff.wallSqft || 0) > 0 && wallcoveringCue && !featureCue && !corridorCue) {
    areaSignals.push(
      buildSignal({
        label: "Wall-area support for wallcovering",
        category: "wall_area",
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
  } else if ((plan?.takeoff.wallSqft || 0) > 0 && wallcoveringCue && (featureCue || corridorCue)) {
    areaSignals.push(
      buildSignal({
        label: featureCue
          ? "Selected-elevation wallcovering cue"
          : "Corridor wallcovering cue",
        category: featureCue ? "selected_elevation_area" : "corridor_area",
        quantity: null,
        unit: "unknown",
        exactQuantity: false,
        confidence: "medium",
        source: "takeoff",
        note:
          "Gross wall-area takeoff exists, but it may overstate selected-elevation or corridor wallcovering coverage without narrower measured support.",
        evidenceRefs: evidence,
      })
    )
  }

  if ((plan?.takeoff.roomCount || 0) > 0 && wallcoveringCue && (plan?.repeatedSpaceSignals || []).length > 0) {
    areaSignals.push(
      buildSignal({
        label: "Repeated room wallcovering support",
        category: "repeated_unit_count",
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
      selectedElevationFinding
        ? "Measured selected-elevation wallcovering support is narrower than full-room wall area."
        : null,
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
      selectedElevationFinding
        ? "Selected-elevation wallcovering should remain narrower than broad wall-area fallback."
        : null,
      fullAreaWallcoveringFinding && (featureCue || corridorCue)
        ? "A full-area wallcovering finding exists, but narrower feature/corridor scope still needs explicit coverage before numeric pricing."
        : null,
      removalCue && !installCue
        ? "Removal support is present, but reinstall coverage is not yet equally clear."
        : null,
      ...(args.tradePackagePricingPrep?.tradePackageMeasurementHints || []).slice(0, 2),
    ],
    6
  )

  const quantitySupportLevel: TradeQuantityConfidence["level"] =
    areaSignals.some((item) => item.exactQuantity) && coverageHints.length >= 2
      ? "moderate"
      : areaSignals.length > 0 || coverageHints.length > 1
      ? "moderate"
      : "weak"
  const tradeCertainty = computeTradeCertainty({
    trade: "wallcovering",
    exactMeasuredSignals:
      [selectedElevationFinding, corridorWallcoveringFinding, fullAreaWallcoveringFinding].filter(Boolean).length,
    typedFindingSignals: wallcoveringFindings.filter((finding) =>
      findingHasCategory(finding, ["wall_area", "corridor_area", "selected_elevation_area"])
    ).length,
    scheduleSignals: finishSchedules.length,
    takeoffAlignedSignals: (plan?.takeoff.wallSqft || 0) > 0 && wallcoveringCue ? 1 : 0,
    planTradeSignals:
      (plan?.detectedTrades || []).filter((value) => /wallcover|wallpaper/i.test(String(value || ""))).length +
      (plan?.tradePackageSignals || []).filter((value) => /wallcover|wallpaper/i.test(String(value || ""))).length,
    scopeCueSignals: wallcoveringCue ? 1 : 0,
    blockers: [
      fullAreaWallcoveringFinding && (featureCue || corridorCue)
        ? "Full-area wallcovering wording conflicted with narrower feature or corridor cues."
        : null,
      corridorCue && !corridorWallcoveringFinding && !selectedElevationFinding && !fullAreaWallcoveringFinding
        ? "Corridor/common-area wording existed without exact corridor wallcovering area."
        : null,
      featureCue && !selectedElevationFinding
        ? "Feature-wall wording existed without exact selected-elevation wallcovering support."
        : null,
    ].filter(Boolean) as string[],
  })
  const supportLevel = takeMoreConservativeLevel(quantitySupportLevel, tradeCertainty.level)

  return {
    trade: "wallcovering",
    supportLevel,
    tradeCertainty,
    tradeAreaSignals: uniqSignals(areaSignals),
    tradeLinearSignals: uniqSignals(linearSignals),
    tradeOpeningSignals: uniqSignals(openingSignals),
    tradeCoverageHints: coverageHints,
    tradeQuantityConfidence: {
      level: quantitySupportLevel,
      reasons: uniqStrings(
        [
          wallcoveringCue ? "Wallcovering-specific cues were detected." : null,
          areaSignals.some((item) => item.exactQuantity)
            ? "Takeoff-backed wall area exists."
            : null,
          selectedElevationFinding
            ? "Selected-elevation wallcovering area is explicitly measured."
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
