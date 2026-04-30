import type {
  PlanEvidenceBundle,
  PlanEvidenceRef,
  PlanEstimatorPackage,
  PlanExplanationReadback,
  PlanIntelligence,
  PlanReadbackSupportLevel,
  PlanRoomFinding,
  PlanScheduleItem,
  PlanSheetAnalysis,
  PlanSheetIndexEntry,
  PlanTakeoff,
  PlanTradeFinding,
} from "./types"

function uniqStrings(values: string[], max = 20): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function uniqEvidence(evidence: PlanEvidenceRef[], max = 8): PlanEvidenceRef[] {
  const seen = new Set<string>()
  const sorted = [...evidence].sort((a, b) => b.confidence - a.confidence)
  const out: PlanEvidenceRef[] = []

  for (const item of sorted) {
    const key = [
      item.uploadId,
      item.sourcePageNumber,
      item.pageNumber,
      item.sheetNumber || "",
      item.excerpt,
    ].join("|")

    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= max) break
  }

  return out
}

function sumPositive(values: Array<number | null | undefined>): number | null {
  const nums = values
    .map((value) => (Number.isFinite(Number(value)) ? Number(value) : null))
    .filter((value): value is number => value !== null && value > 0)

  if (!nums.length) return null
  return nums.reduce((sum, value) => sum + value, 0)
}

function formatSheetLabel(sheet: PlanSheetIndexEntry): string {
  const left = sheet.sheetNumber || `Page ${sheet.pageNumber}`
  const right = sheet.sheetTitle ? ` - ${sheet.sheetTitle}` : ""
  return `${left}${right}`
}

function collectRoomEvidence(rooms: PlanRoomFinding[]): PlanEvidenceRef[] {
  return rooms.flatMap((room) => room.evidence || [])
}

function collectTradeEvidence(trades: PlanTradeFinding[]): PlanEvidenceRef[] {
  return trades.flatMap((finding) => finding.evidence || [])
}

function collectScheduleEvidence(schedules: PlanScheduleItem[]): PlanEvidenceRef[] {
  return schedules.flatMap((item) => item.evidence || [])
}

const BATHROOM_DETAIL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{1,3}(?:\s*[xX]\s*\d{1,3}){1,2}\s+vanity\b/i, label: "Vanity" },
  { pattern: /\bvan\b/i, label: "Vanity" },
  { pattern: /\bvanity\b/i, label: "Vanity" },
  { pattern: /\btub\/shower\b/i, label: "Tub/Shower" },
  { pattern: /\bshower\b/i, label: "Shower" },
  { pattern: /\btub\b/i, label: "Tub" },
  { pattern: /\btoilet\b|\bwc\b|\bwater closet\b/i, label: "WC/Toilet" },
  { pattern: /\blav(?:atory)?\b|\blav\/sink\b|\bsink\b/i, label: "Lav/Sink" },
]

function normalizeBathroomDetailLabel(value: string): string {
  const text = String(value || "").replace(/[ \t]+/g, " ").trim()
  if (!text) return ""

  const vanityWithDimension = text.match(/\b\d{1,3}(?:\s*[xX]\s*\d{1,3}){1,2}\s+vanity\b/i)?.[0]
  if (vanityWithDimension) {
    return vanityWithDimension.replace(/\s+/g, "").replace(/vanity$/i, " vanity")
  }
  if (/\bvanity\b|\bvan\b/i.test(text)) return "vanity"
  if (/\btub\/shower\b/i.test(text) || (/\btub\b/i.test(text) && /\bshower\b/i.test(text))) {
    return "tub/shower"
  }
  if (/\bshower\b/i.test(text)) return "shower"
  if (/\btub\b/i.test(text)) return "tub"
  if (/\btoilet\b/i.test(text)) return "toilet"
  if (/\bwc\b|\bwater closet\b/i.test(text)) return "WC"
  if (/\blav(?:atory)?\b|\blav\/sink\b|\bsink\b/i.test(text)) return "lav/sink"

  return text
}

function collapseBathroomDetailLabels(values: string[]): string[] {
  const normalized = uniqStrings(values.map(normalizeBathroomDetailLabel), 12)

  const hasTubShower = normalized.includes("tub/shower")
  const dimensionedVanity = normalized.find((value) => /\b\d{1,3}x\d{1,3}(?:x\d{1,3})?\s+vanity\b/i.test(value))
  const hasVanity = !!dimensionedVanity || normalized.includes("vanity")
  const hasToilet = normalized.includes("toilet")

  return normalized.filter((value) => {
    if (hasTubShower && (value === "tub" || value === "shower")) return false
    if (dimensionedVanity && value === "vanity") return false
    if (hasVanity && value === "lav/sink") return false
    if (hasToilet && value === "WC") return false
    return true
  })
}

function extractBathroomLayoutDetails(analyses: PlanSheetAnalysis[]): string[] {
  const rawTexts = [
    ...analyses.flatMap((analysis) => analysis.textSnippets || []),
    ...analyses.flatMap((analysis) => analysis.notes || []),
    ...analyses.flatMap((analysis) => (analysis.schedules || []).map((item) => item.label)),
    ...analyses.flatMap((analysis) => (analysis.schedules || []).flatMap((item) => item.notes || [])),
    ...analyses.flatMap((analysis) =>
      (analysis.schedules || []).flatMap((item) => (item.evidence || []).map((ref) => ref.excerpt))
    ),
    ...analyses.flatMap((analysis) => (analysis.tradeFindings || []).map((item) => item.label)),
    ...analyses.flatMap((analysis) => (analysis.tradeFindings || []).flatMap((item) => item.notes || [])),
    ...analyses.flatMap((analysis) =>
      (analysis.tradeFindings || []).flatMap((item) => (item.evidence || []).map((ref) => ref.excerpt))
    ),
  ]

  const out: string[] = []
  const seen = new Set<string>()

  for (const text of rawTexts) {
    const normalized = String(text || "").replace(/[ \t]+/g, " ").trim()
    if (!normalized) continue

    for (const candidate of BATHROOM_DETAIL_PATTERNS) {
      const match = normalized.match(candidate.pattern)
      if (!match) continue
      const detail = match[0].replace(/[ \t]+/g, " ").trim()
      const value = detail || candidate.label
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(value)
      break
    }
  }

  return collapseBathroomDetailLabels(out).slice(0, 6)
}

function extractBathroomLayoutDetailsFromTexts(texts: string[]): string[] {
  const analyses: PlanSheetAnalysis[] = [
    {
      uploadId: "synthetic",
      uploadName: "synthetic",
      sourcePageNumber: 1,
      pageNumber: 1,
      sheetNumber: null,
      sheetTitle: null,
      discipline: "unknown",
      textSnippets: texts,
      notes: [],
      rooms: [],
      schedules: [],
      tradeFindings: [],
      scaleText: null,
      revision: null,
      confidence: 0,
    },
  ]

  return extractBathroomLayoutDetails(analyses)
}

function getBathroomTradeSpecificityScore(finding: PlanTradeFinding): number {
  const details = extractBathroomLayoutDetailsFromTexts([
    finding.label,
    ...(finding.notes || []),
    ...(finding.evidence || []).map((ref) => ref.excerpt),
  ])

  let score = details.length * 10
  if (finding.trade === "plumbing") score += 20
  if (/\bbathroom fixture layout referenced\b/i.test(finding.label)) score += 5
  if (/\bfixtures?\/layout\b/i.test(finding.label)) score -= 2
  if (/\b\d{1,3}x\d{1,3}(?:x\d{1,3})?\s+vanity\b/i.test(finding.label)) score += 3

  return score
}

function isSubsetOfDetails(left: string[], right: string[]): boolean {
  if (left.length > right.length) return false
  const rightSet = new Set(right)
  return left.every((item) => rightSet.has(item))
}

function normalizeTradeFindingLabel(finding: PlanTradeFinding): string {
  if (finding.trade !== "plumbing") return finding.label

  const details = extractBathroomLayoutDetailsFromTexts([
    finding.label,
    ...(finding.notes || []),
    ...(finding.evidence || []).map((ref) => ref.excerpt),
  ])

  if (!details.length) return finding.label

  return `Bathroom fixture layout referenced: ${details.join(", ")}`
}

function normalizeAnalysisTradeFindings(analysis: PlanSheetAnalysis): PlanSheetAnalysis {
  const normalizedTradeFindings = (analysis.tradeFindings || []).map((finding) => ({
    ...finding,
    label: normalizeTradeFindingLabel(finding),
  }))

  const plumbingBathroomGroups: Array<{
    details: string[]
    finding: PlanTradeFinding
  }> = []
  const out: PlanTradeFinding[] = []

  for (const finding of normalizedTradeFindings) {
    if (finding.trade !== "plumbing") {
      out.push(finding)
      continue
    }

    const details = extractBathroomLayoutDetailsFromTexts([
      finding.label,
      ...(finding.notes || []),
      ...(finding.evidence || []).map((ref) => ref.excerpt),
    ])

    if (!details.length) {
      out.push(finding)
      continue
    }

    const existingIndex = plumbingBathroomGroups.findIndex((entry) => {
      return (
        isSubsetOfDetails(details, entry.details) ||
        isSubsetOfDetails(entry.details, details)
      )
    })

    if (existingIndex === -1) {
      plumbingBathroomGroups.push({ details, finding })
      continue
    }

    const existing = plumbingBathroomGroups[existingIndex].finding
    if (getBathroomTradeSpecificityScore(finding) > getBathroomTradeSpecificityScore(existing)) {
      plumbingBathroomGroups[existingIndex] = { details, finding }
    }
  }

  return {
    ...analysis,
    tradeFindings: [
      ...out,
      ...plumbingBathroomGroups.map((entry) => entry.finding),
    ],
  }
}

function buildTakeoff(analyses: PlanSheetAnalysis[]): PlanTakeoff {
  const allRooms = analyses.flatMap((analysis) => analysis.rooms || [])
  const allSchedules = analyses.flatMap((analysis) => analysis.schedules || [])

  const doorCount = sumPositive(
    allSchedules
      .filter((item) => item.scheduleType === "door")
      .map((item) => item.quantity)
  )
  const windowCount = sumPositive(
    allSchedules
      .filter((item) => item.scheduleType === "window")
      .map((item) => item.quantity)
  )
  const deviceCount = sumPositive(
    allSchedules
      .filter((item) => item.scheduleType === "electrical")
      .map((item) => item.quantity)
  )
  const fixtureCount = sumPositive(
    allSchedules
      .filter((item) => item.scheduleType === "fixture")
      .map((item) => item.quantity)
  )

  const roomCount = uniqStrings(allRooms.map((room) => room.roomName), 200).length || null

  const sourceNotes = uniqStrings(
    analyses.flatMap((analysis) => analysis.notes || []),
    12
  )

  return {
    floorSqft: null,
    wallSqft: null,
    ceilingSqft: null,
    trimLf: null,
    doorCount,
    windowCount,
    deviceCount,
    fixtureCount,
    roomCount,
    sourceNotes,
  }
}

function buildScopeAssist(args: {
  analyses: PlanSheetAnalysis[]
  scopeText: string
  trade: string
  detectedTrades: string[]
  detectedRooms: string[]
}) {
  const scopeText = args.scopeText.toLowerCase()
  const missingScopeFlags: string[] = []
  const suggestedAdditions: string[] = []
  const conflicts: string[] = []
  const bathroomLayoutDetails = extractBathroomLayoutDetails(args.analyses)
  const hasBathroomRoom = args.detectedRooms.some((room) => /\bbath(room)?\b/i.test(room))
  const hasSpecificBathroomSuggestion =
    hasBathroomRoom &&
    bathroomLayoutDetails.length > 0 &&
    !/\bvanity\b|\btoilet\b|\bwc\b|\bwater closet\b|\bshower\b|\btub\b|\blav(?:atory)?\b|\bsink\b/i.test(
      scopeText
    )

  if (args.detectedRooms.length > 0) {
    const missingRooms = args.detectedRooms.filter(
      (room) => !scopeText.includes(room.toLowerCase())
    )

    if (missingRooms.length > 0) {
      missingScopeFlags.push(
        `Plan-reviewed spaces not clearly reflected in scope: ${missingRooms.slice(0, 4).join(", ")}.`
      )
    }
  }

  const schedules = args.analyses.flatMap((analysis) => analysis.schedules || [])
  if (schedules.some((item) => item.scheduleType === "door") && !/\bdoor/.test(scopeText)) {
    suggestedAdditions.push("Confirm whether door-related scope from the plan set is included.")
  }
  if (schedules.some((item) => item.scheduleType === "window") && !/\bwindow/.test(scopeText)) {
    suggestedAdditions.push("Confirm whether window-related scope from the plan set is included.")
  }
  if (
    schedules.some((item) => item.scheduleType === "electrical") &&
    !/\belectrical|outlet|switch|lighting|device/.test(scopeText)
  ) {
    suggestedAdditions.push("Confirm electrical devices, lighting, or power scope shown in plans.")
  }
  if (
    schedules.some((item) => item.scheduleType === "fixture") &&
    !/\bfixture|plumbing|electrical/.test(scopeText) &&
    !hasSpecificBathroomSuggestion
  ) {
    suggestedAdditions.push("Confirm fixture-related work shown in plans.")
  }
  if (hasSpecificBathroomSuggestion) {
    suggestedAdditions.push(
      `Confirm bathroom fixture/layout scope shown in plans: ${bathroomLayoutDetails.join(", ")}.`
    )
  }

  if (
    args.trade &&
    args.trade !== "general renovation" &&
    args.detectedTrades.length > 0 &&
    !args.detectedTrades.includes(args.trade)
  ) {
    conflicts.push(
      `Selected trade "${args.trade}" does not match plan-detected trades: ${args.detectedTrades.join(", ")}.`
    )
  }

  return {
    missingScopeFlags: uniqStrings(missingScopeFlags, 8),
    suggestedAdditions: uniqStrings(suggestedAdditions, 8).filter(
      (item) =>
        item !== "Confirm fixture-related work shown in plans." ||
        !suggestedAdditions.some((x) => x.startsWith("Confirm bathroom fixture/layout scope shown in plans:"))
    ),
    conflicts: uniqStrings(conflicts, 8),
  }
}

function buildEvidenceBundle(analyses: PlanSheetAnalysis[]): PlanEvidenceBundle {
  const roomEvidence = collectRoomEvidence(analyses.flatMap((analysis) => analysis.rooms || []))
  const tradeEvidence = collectTradeEvidence(
    analyses.flatMap((analysis) => analysis.tradeFindings || [])
  )
  const scheduleEvidence = collectScheduleEvidence(
    analyses.flatMap((analysis) => analysis.schedules || [])
  )

  const quantityEvidence = analyses
    .flatMap((analysis) => analysis.schedules || [])
    .filter((item) => Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0)
    .flatMap((item) => item.evidence || [])

  const riskEvidence = analyses
    .filter((analysis) => (analysis.notes || []).length > 0)
    .flatMap((analysis) => [
      ...collectScheduleEvidence(analysis.schedules || []),
      ...collectTradeEvidence(analysis.tradeFindings || []),
    ])

  return {
    summaryRefs: uniqEvidence([...roomEvidence, ...tradeEvidence, ...scheduleEvidence], 8),
    quantityRefs: uniqEvidence(quantityEvidence, 8),
    riskRefs: uniqEvidence(riskEvidence, 8),
  }
}

const SHEET_ROLE_PATTERNS: Array<{
  role: string
  pattern: RegExp
}> = [
  { role: "demo plan", pattern: /\bdemo(?:lition)?\b/ },
  { role: "finish schedule", pattern: /\bfinish schedule\b/ },
  { role: "fixture schedule", pattern: /\bfixture schedule\b|\bplumbing fixture schedule\b/ },
  { role: "door schedule", pattern: /\bdoor schedule\b/ },
  { role: "reflected ceiling plan", pattern: /\breflected ceiling plan\b|\brcp\b/ },
  { role: "electrical plan", pattern: /\belectrical plan\b|\bpower plan\b|\blighting plan\b/ },
  { role: "plumbing plan", pattern: /\bplumbing plan\b|\bsanitary\b|\bdomestic water\b/ },
  { role: "finish plan", pattern: /\bfinish plan\b|\bfinish legend\b|\bfinish notes\b/ },
  { role: "floor plan", pattern: /\bfloor plan\b/ },
  { role: "elevation/detail", pattern: /\belevation\b|\bdetail\b|\bsection\b/ },
  { role: "typical room sheet", pattern: /\btyp(?:ical)?\b.*\b(room|unit|suite)\b|\bprototype\b|\bunit type\b/ },
  { role: "bathroom sheet", pattern: /\bbath(room)?\b|\brestroom\b|\btoilet room\b/ },
  { role: "corridor sheet", pattern: /\bcorridor\b|\bhallway\b|\bhall\b/ },
  { role: "common area sheet", pattern: /\blobby\b|\breception\b|\bamenity\b|\bcommon area\b|\bpublic area\b/ },
]

function collectPlanTextCorpus(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
}): string[] {
  return uniqStrings(
    [
      ...args.sheetIndex.map((sheet) => sheet.sheetTitle || ""),
      ...args.sheetIndex.map((sheet) => sheet.sheetNumber || ""),
      ...args.analyses.flatMap((analysis) => analysis.textSnippets || []),
      ...args.analyses.flatMap((analysis) => analysis.notes || []),
      ...args.analyses.flatMap((analysis) => (analysis.rooms || []).map((room) => room.roomName)),
      ...args.analyses.flatMap((analysis) => (analysis.schedules || []).map((item) => item.label)),
      ...args.analyses.flatMap((analysis) => (analysis.schedules || []).flatMap((item) => item.notes || [])),
      ...args.analyses.flatMap((analysis) => (analysis.tradeFindings || []).map((finding) => finding.label)),
      ...args.analyses.flatMap((analysis) => (analysis.tradeFindings || []).flatMap((finding) => finding.notes || [])),
    ],
    200
  )
}

const ROOM_TYPE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "guest room", pattern: /\bguest\s*room\b|\btyp(?:ical)?\s*(?:guest|hotel)\s*room\b/i },
  { label: "guest bathroom", pattern: /\bguest\s*(?:bath|bathroom)\b|\bguest\s*rm\s*bath\b/i },
  { label: "bathroom", pattern: /\bbath(room)?\b|\brestroom\b|\bwc\b/i },
  { label: "corridor", pattern: /\bcorridor\b|\bhallway\b|\bhall\b/i },
  { label: "unit", pattern: /\bunit\b|\btyp(?:ical)?\s*unit\b/i },
  { label: "suite", pattern: /\bsuite\b/i },
  { label: "bedroom", pattern: /\bbed(room)?\b/i },
  { label: "kitchen", pattern: /\bkitchen(?:ette)?\b/i },
  { label: "lobby", pattern: /\blobby\b|\breception\b/i },
]

function detectLikelyRoomTypes(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  detectedRooms: string[]
}): string[] {
  const corpus = [
    ...args.detectedRooms,
    ...collectPlanTextCorpus({ sheetIndex: args.sheetIndex, analyses: args.analyses }),
  ].join(" ")

  const matched = ROOM_TYPE_PATTERNS.filter((entry) => entry.pattern.test(corpus)).map(
    (entry) => entry.label
  )

  return uniqStrings([...args.detectedRooms, ...matched], 10)
}

function hasTypicalLayoutSignals(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
}): boolean {
  const text = collectPlanTextCorpus(args).join(" ").toLowerCase()
  return /\btyp(?:ical)?\b|\bprototype\b|\btyp\b|\bunit type\b|\bmodel\b/.test(text)
}

function buildRepeatedSpaceSignals(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  likelyRoomTypes: string[]
}): string[] {
  const textCorpus = collectPlanTextCorpus({
    sheetIndex: args.sheetIndex,
    analyses: args.analyses,
  }).join(" ")
  const repeatedSignals: string[] = []

  const analysesWithBathrooms = args.analyses.filter((analysis) => {
    const text = [
      analysis.sheetTitle || "",
      ...(analysis.textSnippets || []),
      ...(analysis.notes || []),
      ...(analysis.rooms || []).map((room) => room.roomName),
      ...(analysis.schedules || []).map((item) => item.label),
      ...(analysis.tradeFindings || []).map((finding) => finding.label),
    ].join(" ")

    return /\bbath(room)?\b|\bshower\b|\bvanity\b|\btoilet\b|\bwc\b|\blav(?:atory)?\b|\bsink\b/i.test(
      text
    )
  }).length

  if (analysesWithBathrooms >= 2) {
    repeatedSignals.push("Repeated bathroom or wet-area layout signals appear across multiple plan pages.")
  }

  const bathroomLayoutDetails = extractBathroomLayoutDetails(args.analyses)
  if (bathroomLayoutDetails.length >= 2 && analysesWithBathrooms >= 2) {
    repeatedSignals.push(
      `Repeated bathroom fixture/layout cues appear in the plan set: ${bathroomLayoutDetails.join(", ")}.`
    )
  }

  if (
    hasTypicalLayoutSignals({ sheetIndex: args.sheetIndex, analyses: args.analyses }) &&
    (args.likelyRoomTypes.includes("guest room") ||
      args.likelyRoomTypes.includes("guest bathroom") ||
      args.likelyRoomTypes.includes("unit"))
  ) {
    repeatedSignals.push("Typical or prototype room-layout behavior is likely present in the plan set.")
  }

  if (
    /\bguest\s*room\b/i.test(textCorpus) &&
    /\bcorridor\b|\bhallway\b|\bhall\b/i.test(textCorpus)
  ) {
    repeatedSignals.push("Guest room and corridor plan signals appear together, suggesting a repeatable room-plus-corridor package.")
  }

  return uniqStrings(repeatedSignals, 6)
}

function buildTradePackageSignals(args: {
  analyses: PlanSheetAnalysis[]
  detectedTrades: string[]
  likelyRoomTypes: string[]
}): string[] {
  const textCorpus = collectPlanTextCorpus({ sheetIndex: [], analyses: args.analyses }).join(" ")
  const scheduleTypes = uniqStrings(
    args.analyses.flatMap((analysis) => (analysis.schedules || []).map((item) => item.scheduleType)),
    12
  )
  const signals: string[] = []
  const trades = new Set(args.detectedTrades)

  const hasWetArea =
    /\bshower\b|\btub\b|\bwet area\b|\bwaterproof\b|\bpan\b|\bdrain\b/i.test(textCorpus)
  const hasFinishSignals =
    scheduleTypes.includes("finish") || /\bfinish\b|\bpaint\b|\bwallcover(?:ing)?\b/i.test(textCorpus)
  const hasFixtureSignals = scheduleTypes.includes("fixture") || /\bvanity\b|\btoilet\b|\blav\b/i.test(textCorpus)
  const hasFlooringSignals =
    trades.has("flooring") || /\bfloor(?:ing)?\b|\bcarpet\b|\blvt\b|\btile\b/i.test(textCorpus)
  const hasPaintSignals =
    trades.has("painting") || /\bpaint(?:ing)?\b|\bwallcover(?:ing)?\b/i.test(textCorpus)
  const hasCorridorSignals = args.likelyRoomTypes.includes("corridor")

  if (hasWetArea && (trades.has("plumbing") || trades.has("tile"))) {
    signals.push("Wet-area remodel package signals: plumbing, tile, and waterproofing-adjacent scope.")
  }
  if (hasFixtureSignals && trades.has("plumbing")) {
    signals.push("Fixture package signals: vanity, lav/sink, toilet, or related plumbing fixture work.")
  }
  if (hasFinishSignals && hasPaintSignals) {
    signals.push("Finish package signals: paint, finish schedule, or wallcovering scope is indicated.")
  }
  if (hasFlooringSignals) {
    signals.push("Flooring package signals: floor finish replacement or repeated floor-scope cues are present.")
  }
  if (hasCorridorSignals && (hasPaintSignals || hasFlooringSignals)) {
    signals.push("Corridor refresh package signals: corridor finish work appears tied to broader room-package scope.")
  }
  if (
    args.likelyRoomTypes.includes("guest room") &&
    (hasPaintSignals || hasFlooringSignals || hasFixtureSignals)
  ) {
    signals.push("Guest room refresh package signals: room finishes and fixture-related work may scale together.")
  }

  return uniqStrings(signals, 6)
}

function buildScalableScopeSignals(args: {
  repeatedSpaceSignals: string[]
  likelyRoomTypes: string[]
  tradePackageSignals: string[]
  analyses: PlanSheetAnalysis[]
}): string[] {
  const signals: string[] = []
  const textCorpus = collectPlanTextCorpus({ sheetIndex: [], analyses: args.analyses }).join(" ")
  const bathroomLayoutDetails = extractBathroomLayoutDetails(args.analyses)

  if (args.repeatedSpaceSignals.length > 0 && bathroomLayoutDetails.length > 0) {
    signals.push(
      `Repeated bathroom layout cues may support scalable wet-area pricing logic: ${bathroomLayoutDetails.join(", ")}.`
    )
  }
  if (
    args.likelyRoomTypes.includes("guest room") ||
    args.likelyRoomTypes.includes("unit") ||
    args.likelyRoomTypes.includes("suite")
  ) {
    signals.push("Repeated room or unit-type signals may support prototype-based room-package estimating.")
  }
  if (
    args.likelyRoomTypes.includes("corridor") &&
    args.tradePackageSignals.some((item) => /\bcorridor\b|\bfinish\b|\bflooring\b/i.test(item))
  ) {
    signals.push("Corridor-related finish scope may scale separately from repeated room interiors.")
  }
  if (/\bfinish schedule\b|\bpaint\b|\bwallcover(?:ing)?\b|\bfloor(?:ing)?\b/i.test(textCorpus)) {
    signals.push("Repeated finish-package cues may help scale paint, wallcovering, or flooring allowances.")
  }

  return uniqStrings(signals, 6)
}

function buildBidAssistNotes(args: {
  repeatedSpaceSignals: string[]
  likelyRoomTypes: string[]
  scalableScopeSignals: string[]
  tradePackageSignals: string[]
  scopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
    conflicts: string[]
  }
}): string[] {
  const notes: string[] = []

  if (
    args.likelyRoomTypes.includes("guest room") ||
    args.likelyRoomTypes.includes("guest bathroom") ||
    args.likelyRoomTypes.includes("corridor")
  ) {
    notes.push("Plan set shows room-type signals that may support package-based bidding rather than one-off room pricing.")
  }
  if (args.repeatedSpaceSignals.length > 0) {
    notes.push("Repeated-space signals suggest checking whether the job should be priced from a prototype room plus scalable repeats.")
  }
  if (args.scalableScopeSignals.length > 0) {
    notes.push("Scalable scope cues are present; confirm whether repeated rooms, units, or corridor areas are all in current bid coverage.")
  }
  if (args.tradePackageSignals.length > 0 && args.scopeAssist.suggestedAdditions.length > 0) {
    notes.push("Plan-driven trade packages are stronger than the written scope alone; confirm inclusions before flattening allowances.")
  }

  return uniqStrings(notes, 6)
}

function classifySheetRoles(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
}): string[] {
  const roleCounts = new Map<string, number>()

  for (const analysis of args.analyses) {
    const text = [
      analysis.sheetTitle || "",
      analysis.sheetNumber || "",
      ...(analysis.textSnippets || []),
      ...(analysis.notes || []),
      ...(analysis.rooms || []).map((room) => room.roomName),
      ...(analysis.schedules || []).map((item) => item.label),
      ...(analysis.tradeFindings || []).map((finding) => finding.label),
    ]
      .join(" ")
      .toLowerCase()

    const matchedRoles = new Set<string>()
    for (const entry of SHEET_ROLE_PATTERNS) {
      if (entry.pattern.test(text)) {
        matchedRoles.add(entry.role)
      }
    }

    if (analysis.discipline === "electrical") matchedRoles.add("electrical plan")
    if (analysis.discipline === "plumbing") matchedRoles.add("plumbing plan")
    if (analysis.discipline === "finish" || analysis.discipline === "interior") {
      if (/\bfinish\b|\bpaint\b|\bwallcover/i.test(text)) matchedRoles.add("finish plan")
    }
    if (analysis.rooms.some((room) => /\bbath(room)?\b/i.test(room.roomName))) {
      matchedRoles.add("bathroom sheet")
    }

    for (const role of matchedRoles.size ? matchedRoles : new Set(["unknown"])) {
      roleCounts.set(role, (roleCounts.get(role) || 0) + 1)
    }
  }

  return Array.from(roleCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    .map(([role, count]) =>
      count > 1 && role !== "unknown" ? `${role} (${count} sheet${count === 1 ? "" : "s"})` : role
    )
    .slice(0, 10)
}

function buildPrototypeSignals(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  likelyRoomTypes: string[]
  repeatedSpaceSignals: string[]
  sheetRoleSignals: string[]
}): string[] {
  const textCorpus = collectPlanTextCorpus(args).join(" ")
  const signals: string[] = []
  const hasTypicalLabels = /\btyp(?:ical)?\b|\bprototype\b|\bunit type\b|\bmodel\b/i.test(textCorpus)
  const hasTypicalRoomSheet = args.sheetRoleSignals.some((item) => item.startsWith("typical room sheet"))

  if (
    hasTypicalLabels &&
    (args.likelyRoomTypes.includes("guest room") ||
      args.likelyRoomTypes.includes("unit") ||
      args.likelyRoomTypes.includes("suite"))
  ) {
    signals.push("Prototype or typical room behavior is likely present from room-type labels in the plan set.")
  }
  if (hasTypicalRoomSheet) {
    signals.push("At least one sheet reads like a typical room or unit-type reference sheet.")
  }
  if (
    args.repeatedSpaceSignals.some((item) => /\bprototype\b|\btypical\b|\brepeatable\b/i.test(item)) ||
    (hasTypicalLabels && args.repeatedSpaceSignals.length > 0)
  ) {
    signals.push("Repeated-space cues suggest the bid may be anchored by a prototype room plus repeated application.")
  }

  return uniqStrings(signals, 6)
}

function buildRepeatScalingSignals(args: {
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  repeatedSpaceSignals: string[]
  scalableScopeSignals: string[]
  likelyRoomTypes: string[]
  tradePackageSignals: string[]
}): string[] {
  const signals: string[] = []

  if (args.prototypeSignals.length > 0 && args.repeatedSpaceSignals.length > 0) {
    signals.push("Prototype-style sheets plus repeated-space signals suggest repeat-scaling may be appropriate for bidding.")
  }
  if (
    args.likelyRoomTypes.includes("guest room") ||
    args.likelyRoomTypes.includes("guest bathroom") ||
    args.likelyRoomTypes.includes("unit")
  ) {
    signals.push("Room or unit-type signals suggest pricing packages may repeat even when total counts are not explicit.")
  }
  if (
    args.sheetRoleSignals.some((item) => item.startsWith("corridor sheet")) &&
    args.tradePackageSignals.some((item) => /\bcorridor\b/i.test(item))
  ) {
    signals.push("Corridor sheets appear separable from room packages, which may support distinct scaling logic.")
  }
  if (args.scalableScopeSignals.length > 0) {
    signals.push(args.scalableScopeSignals[0])
  }

  return uniqStrings(signals, 6)
}

function buildPackageGroupingSignals(args: {
  sheetRoleSignals: string[]
  likelyRoomTypes: string[]
  tradePackageSignals: string[]
  prototypeSignals: string[]
}): string[] {
  const signals: string[] = []
  const hasCorridorSheets = args.sheetRoleSignals.some((item) => item.startsWith("corridor sheet"))
  const hasBathroomSheets = args.sheetRoleSignals.some((item) => item.startsWith("bathroom sheet"))
  const hasTypicalRoomSheets = args.sheetRoleSignals.some((item) => item.startsWith("typical room sheet"))

  if (
    hasTypicalRoomSheets &&
    (args.likelyRoomTypes.includes("guest room") || args.likelyRoomTypes.includes("unit"))
  ) {
    signals.push("Room-package grouping signals: typical room or unit sheets may anchor repeatable room pricing packages.")
  }
  if (hasBathroomSheets && args.tradePackageSignals.some((item) => /\bwet-area\b|\bfixture\b/i.test(item))) {
    signals.push("Bathroom-package grouping signals: bathroom sheets align with wet-area and fixture package scope.")
  }
  if (hasCorridorSheets) {
    signals.push("Corridor/common-area grouping signals: corridor work may need its own package outside repeated room interiors.")
  }
  if (
    args.sheetRoleSignals.some((item) => item.startsWith("common area sheet")) &&
    args.likelyRoomTypes.some((item) => item === "lobby" || item === "corridor")
  ) {
    signals.push("Common-area support signals: public-area sheets appear distinct from unit or room packages.")
  }

  return uniqStrings(signals, 6)
}

function buildBidStrategyNotes(args: {
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  repeatScalingSignals: string[]
  packageGroupingSignals: string[]
  bidAssistNotes: string[]
}): string[] {
  const notes: string[] = []

  if (args.prototypeSignals.length > 0) {
    notes.push("Prototype-like sheets suggest defending the bid around a typical room or unit package rather than isolated room counts.")
  }
  if (args.packageGroupingSignals.length > 0) {
    notes.push("Sheet roles suggest the job may break into room, bathroom, corridor, or common-area packages for estimating.")
  }
  if (args.repeatScalingSignals.length > 0) {
    notes.push("Repeat-scaling cues are present; confirm how many repeat applications are in bid coverage before flattening unit pricing.")
  }
  if (
    args.sheetRoleSignals.some((item) => item.startsWith("finish schedule")) ||
    args.sheetRoleSignals.some((item) => item.startsWith("fixture schedule"))
  ) {
    notes.push("Schedule sheets appear present; use them to defend package inclusions even if counts are not fully explicit.")
  }
  if (args.bidAssistNotes.length > 0) {
    notes.push(args.bidAssistNotes[0])
  }

  return uniqStrings(notes, 6)
}

function extractRoleName(value: string): string {
  return String(value || "").replace(/\s*\(\d+\s+sheets?\)\s*$/i, "").trim()
}

function hasRole(sheetRoleSignals: string[], role: string): boolean {
  return sheetRoleSignals.map(extractRoleName).includes(role)
}

function hasTradeFindingCategory(
  analyses: PlanSheetAnalysis[],
  category: NonNullable<PlanTradeFinding["category"]>
): boolean {
  return analyses.some((analysis) =>
    (analysis.tradeFindings || []).some((finding) => finding.category === category)
  )
}

function hasTradeFindingLabel(analyses: PlanSheetAnalysis[], pattern: RegExp): boolean {
  return analyses.some((analysis) =>
    (analysis.tradeFindings || []).some((finding) => pattern.test(finding.label))
  )
}

function buildCrossSheetLinkSignals(args: {
  analyses: PlanSheetAnalysis[]
  sheetRoleSignals: string[]
  detectedTrades: string[]
  likelyRoomTypes: string[]
  repeatedSpaceSignals: string[]
}): string[] {
  const signals: string[] = []
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const trades = new Set(args.detectedTrades)
  const hasFinishSchedule = roleNames.includes("finish schedule")
  const hasFinishPlan = roleNames.includes("finish plan")
  const hasFixtureSchedule = roleNames.includes("fixture schedule")
  const hasDoorSchedule = roleNames.includes("door schedule")
  const hasRcp = roleNames.includes("reflected ceiling plan")
  const hasElevation = roleNames.includes("elevation/detail")
  const hasDemo = roleNames.includes("demo plan")

  if (hasFinishSchedule && (hasFinishPlan || hasElevation)) {
    signals.push("Selected finish schedules and finish/elevation sheets reinforce finish scope across the plan set.")
  }
  if (hasFixtureSchedule && (hasElevation || args.likelyRoomTypes.includes("bathroom"))) {
    signals.push("Selected fixture schedules and bathroom/elevation sheets reinforce wet-area fixture context conservatively.")
  }
  if (hasRcp && (hasRole(args.sheetRoleSignals, "electrical plan") || hasFixtureSchedule)) {
    signals.push("Selected reflected ceiling plans and lighting/fixture sheets reinforce ceiling and fixture context without crossing trade authority.")
  }
  if (hasDoorSchedule && (hasFinishPlan || hasElevation)) {
    signals.push("Selected door schedules and finish/elevation sheets reinforce opening-related finish context where direct support already exists.")
  }
  if (
    hasDemo &&
    (hasFinishPlan || hasElevation || hasTradeFindingCategory(args.analyses, "demolition_area"))
  ) {
    signals.push("Selected demolition sheets and finish/install sheets reinforce removal context, but do not create install authority by themselves.")
  }
  if (
    args.repeatedSpaceSignals.length > 0 &&
    (hasFinishPlan || hasElevation || hasRcp) &&
    (args.likelyRoomTypes.includes("guest room") ||
      args.likelyRoomTypes.includes("suite") ||
      args.likelyRoomTypes.includes("unit"))
  ) {
    signals.push("Selected room, ceiling, and elevation sheets reinforce repeated room-type behavior across the plan set.")
  }
  if (
    trades.has("tile") &&
    hasFixtureSchedule &&
    hasElevation &&
    (args.likelyRoomTypes.includes("bathroom") || args.likelyRoomTypes.includes("guest bathroom"))
  ) {
    signals.push("Selected bath elevations and fixture schedules reinforce tile and wet-area context without inflating unrelated finishes.")
  }

  return uniqStrings(signals, 8)
}

function buildScheduleReconciliationSignals(args: {
  analyses: PlanSheetAnalysis[]
  sheetRoleSignals: string[]
  detectedTrades: string[]
}): string[] {
  const signals: string[] = []
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const hasFinishSchedule = roleNames.includes("finish schedule")
  const hasFixtureSchedule = roleNames.includes("fixture schedule")
  const hasDoorSchedule = roleNames.includes("door schedule")
  const hasRcp = roleNames.includes("reflected ceiling plan")
  const hasElevation = roleNames.includes("elevation/detail")

  if (hasFinishSchedule && hasTradeFindingLabel(args.analyses, /\bfinish-related work referenced\b/i)) {
    signals.push("Finish schedules now reconcile against finish-plan evidence instead of standing alone.")
  }
  if (
    hasFixtureSchedule &&
    args.analyses.some((analysis) =>
      (analysis.tradeFindings || []).some((finding) => finding.trade === "plumbing" || finding.trade === "electrical")
    )
  ) {
    signals.push("Fixture schedules now reconcile against related plumbing/electrical sheet context before strengthening trade certainty.")
  }
  if (hasDoorSchedule && hasTradeFindingCategory(args.analyses, "door_openings")) {
    signals.push("Door schedule references now reconcile against opening-related sheet context before informing finish scope.")
  }
  if (hasRcp && hasFixtureSchedule) {
    signals.push("Reflected ceiling plans now reconcile with selected fixture or lighting schedules to improve ceiling/lighting context conservatively.")
  }
  if (hasElevation && hasFinishSchedule) {
    signals.push("Elevations now reconcile with finish schedules to narrow vertical finish context instead of broadening unrelated floor scope.")
  }

  return uniqStrings(signals, 8)
}

function buildCrossSheetConflictSignals(args: {
  analyses: PlanSheetAnalysis[]
  sheetRoleSignals: string[]
}): string[] {
  const signals: string[] = []
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const hasDemo = roleNames.includes("demo plan")
  const hasFinishSchedule = roleNames.includes("finish schedule")
  const hasFinishPlan = roleNames.includes("finish plan")
  const hasFixtureSchedule = roleNames.includes("fixture schedule")
  const hasElevation = roleNames.includes("elevation/detail")

  if (
    hasDemo &&
    (hasFinishSchedule || hasFinishPlan) &&
    !hasTradeFindingCategory(args.analyses, "demolition_area")
  ) {
    signals.push("Demo sheets are selected alongside finish/install sheets, but removal remains non-binding where measured demo support is thin.")
  }
  if (
    hasFixtureSchedule &&
    hasElevation &&
    !args.analyses.some((analysis) =>
      (analysis.tradeFindings || []).some((finding) => finding.trade === "plumbing" || finding.trade === "tile")
    )
  ) {
    signals.push("Fixture schedules and elevations are both selected, but cross-sheet wet-area linkage stays conservative where trade support remains indirect.")
  }
  if (
    hasFinishSchedule &&
    hasElevation &&
    hasTradeFindingCategory(args.analyses, "selected_elevation_area") &&
    !hasTradeFindingCategory(args.analyses, "wall_area")
  ) {
    signals.push("Elevation-supported finish scope remains narrower than full-wall authority even when finish schedules are selected.")
  }

  return uniqStrings(signals, 6)
}

function buildPlanSetSynthesisNotes(args: {
  crossSheetLinkSignals: string[]
  scheduleReconciliationSignals: string[]
  crossSheetConflictSignals: string[]
  pricingAnchorSignals: string[]
}): string[] {
  const notes: string[] = []

  if (args.crossSheetLinkSignals.length > 0) {
    notes.push(args.crossSheetLinkSignals[0])
  }
  if (args.scheduleReconciliationSignals.length > 0) {
    notes.push(args.scheduleReconciliationSignals[0])
  }
  if (args.crossSheetConflictSignals.length > 0) {
    notes.push(args.crossSheetConflictSignals[0])
  }
  if (args.pricingAnchorSignals.length > 0) {
    notes.push(`Cross-sheet anchor note: ${args.pricingAnchorSignals[0]}`)
  }

  return uniqStrings(notes, 6)
}

function summarizeQuantities(findings: PlanTradeFinding[]): string | null {
  const quantified = findings.filter(
    (finding) => Number.isFinite(Number(finding.quantity)) && Number(finding.quantity) > 0
  )
  if (!quantified.length) return null

  const parts = quantified.slice(0, 3).map((finding) => {
    const quantity = Number(finding.quantity)
    const rounded = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1)
    const unitLabel =
      finding.unit === "sqft"
        ? "sqft"
        : finding.unit === "linear_ft"
          ? "LF"
          : finding.unit === "fixtures"
            ? "fixtures"
            : finding.unit === "devices"
              ? "devices"
              : finding.unit === "doors"
                ? "doors"
                : finding.unit === "rooms"
                  ? "rooms"
                  : "units"
    const category = finding.category ? finding.category.replace(/_/g, " ") : finding.label
    return `${rounded} ${unitLabel} from ${category}`
  })

  return parts.join("; ")
}

function summarizeSchedules(items: PlanScheduleItem[]): string | null {
  if (!items.length) return null

  const parts = items.slice(0, 3).map((item) => {
    if (Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0) {
      return `${item.label}${item.quantity ? ` (${item.quantity})` : ""}`
    }
    return item.label
  })

  return parts.join("; ")
}

function buildPackageEvidence(args: {
  findings?: PlanTradeFinding[]
  schedules?: PlanScheduleItem[]
  rooms?: PlanRoomFinding[]
}): PlanEvidenceRef[] {
  return uniqEvidence(
    [
      ...collectTradeEvidence(args.findings || []),
      ...collectScheduleEvidence(args.schedules || []),
      ...collectRoomEvidence(args.rooms || []),
    ],
    10
  )
}

function buildEstimatorPackages(args: {
  analyses: PlanSheetAnalysis[]
  likelyRoomTypes: string[]
  repeatedSpaceSignals: string[]
  prototypeSignals: string[]
  packageGroupingSignals: string[]
  tradePackageSignals: string[]
  scheduleReconciliationSignals: string[]
  crossSheetConflictSignals: string[]
}): PlanEstimatorPackage[] {
  const findings = args.analyses.flatMap((analysis) => analysis.tradeFindings || [])
  const schedules = args.analyses.flatMap((analysis) => analysis.schedules || [])
  const rooms = args.analyses.flatMap((analysis) => analysis.rooms || [])
  const roleText = collectPlanTextCorpus({ sheetIndex: [], analyses: args.analyses }).join(" ")
  const packages: PlanEstimatorPackage[] = []

  const addPackage = (pkg: PlanEstimatorPackage | null) => {
    if (!pkg) return
    if (packages.some((item) => item.key === pkg.key)) return
    packages.push(pkg)
  }

  const finishFindings = findings.filter(
    (finding) =>
      ["painting", "wallcovering", "flooring"].includes(finding.trade) &&
      [
        "wall_area",
        "ceiling_area",
        "trim_lf",
        "door_openings",
        "floor_area",
        "base_lf",
      ].includes(String(finding.category || ""))
  )
  const finishSchedules = schedules.filter((item) => item.scheduleType === "finish")
  const guestRoomRooms = rooms.filter((room) => /\bguest room\b|\bbed(room)?\b|\bsuite\b|\bunit\b/i.test(room.roomName))
  const hasRepeatedRoomSupport =
    args.repeatedSpaceSignals.length > 0 &&
    (args.likelyRoomTypes.includes("guest room") ||
      args.likelyRoomTypes.includes("suite") ||
      args.likelyRoomTypes.includes("unit"))

  addPackage(
    finishFindings.length > 0 || finishSchedules.length > 0 || hasRepeatedRoomSupport
      ? {
          key: "guest-room-finish-package",
          title: "Guest room finish package",
          primaryTrade:
            finishFindings.find((finding) => finding.trade === "painting")?.trade ||
            finishFindings[0]?.trade ||
            "painting",
          roomGroup:
            args.likelyRoomTypes.find((item) => ["guest room", "suite", "unit"].includes(item)) ||
            "guest room",
          supportType:
            finishFindings.length > 0
              ? "quantity_backed"
              : hasRepeatedRoomSupport
                ? "scaled_prototype"
                : finishSchedules.length > 0
                  ? "schedule_backed"
                  : "support_only",
          scopeBreadth: "broad",
          confidenceLabel:
            finishFindings.length > 0
              ? "strong"
              : hasRepeatedRoomSupport
                ? "moderate"
                : finishSchedules.length > 0
                  ? "moderate"
                  : "limited",
          quantitySummary: summarizeQuantities(finishFindings),
          scheduleSummary: summarizeSchedules(finishSchedules),
          executionNotes: uniqStrings(
            [
              hasRepeatedRoomSupport
                ? "Prototype/repeated-room support can organize the package around a typical guest room before scaling."
                : "",
              args.packageGroupingSignals.find((item) => /\broom-package grouping/i.test(item)) || "",
              args.scheduleReconciliationSignals.find((item) => /\bfinish schedules now reconcile/i.test(item)) || "",
            ].filter(Boolean),
            4
          ),
          cautionNotes: uniqStrings(
            [
              finishFindings.length === 0 && finishSchedules.length > 0
                ? "Schedule support reinforces room finish scope, but should not manufacture unsupported full-room totals by itself."
                : "",
            ].filter(Boolean),
            3
          ),
          evidence: buildPackageEvidence({
            findings: finishFindings,
            schedules: finishSchedules,
            rooms: guestRoomRooms,
          }),
        }
      : null
  )

  const wetAreaFindings = findings.filter(
    (finding) =>
      ["plumbing", "tile", "flooring"].includes(finding.trade) &&
      [
        "plumbing_fixture_count",
        "shower_tile_area",
        "wall_tile_area",
        "backsplash_area",
        "selected_elevation_area",
      ].includes(String(finding.category || ""))
  )
  const wetAreaSchedules = schedules.filter((item) => item.scheduleType === "fixture")
  const wetAreaRooms = rooms.filter((room) => /\bbath(room)?\b|\bguest bathroom\b|\brestroom\b/i.test(room.roomName))
  const hasWetAreaQuantity = wetAreaFindings.some(
    (finding) =>
      finding.category === "plumbing_fixture_count" ||
      finding.category === "shower_tile_area" ||
      finding.category === "wall_tile_area" ||
      finding.category === "backsplash_area"
  )
  const hasWetAreaElevationOnly = wetAreaFindings.some(
    (finding) => finding.category === "selected_elevation_area"
  )
  const wetAreaNarrowOnly =
    wetAreaFindings.length > 0 &&
    wetAreaFindings.every((finding) =>
      ["selected_elevation_area", "shower_tile_area", "wall_tile_area", "backsplash_area"].includes(
        String(finding.category || "")
      )
    )

  addPackage(
    wetAreaFindings.length > 0 || wetAreaSchedules.length > 0
      ? {
          key: "wet-area-package",
          title: "Wet-area fixture and finish package",
          primaryTrade:
            wetAreaFindings.find((finding) => finding.trade === "plumbing")?.trade ||
            wetAreaFindings[0]?.trade ||
            "plumbing",
          roomGroup:
            args.likelyRoomTypes.find((item) => ["guest bathroom", "bathroom"].includes(item)) ||
            "bathroom",
          supportType:
            wetAreaNarrowOnly && hasWetAreaElevationOnly
              ? "elevation_only"
              : hasWetAreaQuantity
                ? "quantity_backed"
                : wetAreaSchedules.length > 0
                  ? "schedule_backed"
                  : "support_only",
          scopeBreadth: wetAreaNarrowOnly ? "narrow" : "broad",
          confidenceLabel:
            wetAreaNarrowOnly && hasWetAreaElevationOnly
              ? "moderate"
              : hasWetAreaQuantity
                ? "strong"
                : wetAreaSchedules.length > 0
                  ? "moderate"
                  : "limited",
          quantitySummary: summarizeQuantities(wetAreaFindings),
          scheduleSummary: summarizeSchedules(wetAreaSchedules),
          executionNotes: uniqStrings(
            [
              args.scheduleReconciliationSignals.find((item) => /\bfixture schedules now reconcile/i.test(item)) || "",
              args.tradePackageSignals.find((item) => /\bwet-area remodel package signals\b/i.test(item)) || "",
            ].filter(Boolean),
            4
          ),
          cautionNotes: uniqStrings(
            [
              wetAreaNarrowOnly
                ? "Bath elevations and vertical tile cues stay narrower than full-room or full-floor authority."
                : "",
              wetAreaSchedules.length > 0 && !hasWetAreaQuantity
                ? "Fixture schedules reinforce the wet-area package, but they do not create unsupported installation totals by themselves."
                : "",
            ].filter(Boolean),
            4
          ),
          evidence: buildPackageEvidence({
            findings: wetAreaFindings,
            schedules: wetAreaSchedules,
            rooms: wetAreaRooms,
          }),
        }
      : null
  )

  const corridorFindings = findings.filter(
    (finding) =>
      ["painting", "wallcovering", "flooring"].includes(finding.trade) &&
      ["corridor_area", "floor_area", "wall_area"].includes(String(finding.category || "")) &&
      /\bcorridor\b|\bhall/i.test([finding.label, ...(finding.notes || [])].join(" "))
  )
  const corridorHasSignal =
    args.likelyRoomTypes.includes("corridor") ||
    args.tradePackageSignals.some((item) => /\bcorridor\b/i.test(item))

  addPackage(
    corridorFindings.length > 0 || corridorHasSignal
      ? {
          key: "corridor-package",
          title: "Corridor/common-area finish package",
          primaryTrade: corridorFindings[0]?.trade || "painting",
          roomGroup: args.likelyRoomTypes.includes("corridor") ? "corridor" : "common area",
          supportType: corridorFindings.length > 0 ? "quantity_backed" : "support_only",
          scopeBreadth: "broad",
          confidenceLabel: corridorFindings.length > 0 ? "strong" : "limited",
          quantitySummary: summarizeQuantities(corridorFindings),
          scheduleSummary: null,
          executionNotes: uniqStrings(
            [
              "Corridor/common-area work should remain separate from repeated guest-room interiors.",
              args.packageGroupingSignals.find((item) => /\bcorridor\/common-area grouping/i.test(item)) || "",
            ].filter(Boolean),
            3
          ),
          cautionNotes: uniqStrings(
            [
              corridorFindings.length === 0
                ? "Corridor package is supported by grouping signals only and should stay non-binding until direct corridor quantities are stronger."
                : "",
            ].filter(Boolean),
            3
          ),
          evidence: buildPackageEvidence({ findings: corridorFindings }),
        }
      : null
  )

  const ceilingElectricalFindings = findings.filter(
    (finding) =>
      ["electrical", "painting"].includes(finding.trade) &&
      ["electrical_fixture_count", "device_count", "ceiling_area"].includes(String(finding.category || ""))
  )
  const electricalSchedules = schedules.filter((item) => item.scheduleType === "electrical" || item.scheduleType === "fixture")
  const hasCeilingContext = /\breflected ceiling plan\b|\brcp\b/i.test(roleText)

  addPackage(
    (ceilingElectricalFindings.length > 0 || electricalSchedules.length > 0) && hasCeilingContext
      ? {
          key: "ceiling-light-fixture-package",
          title: "Ceiling / light / fixture package",
          primaryTrade:
            ceilingElectricalFindings.find((finding) => finding.trade === "electrical")?.trade ||
            "electrical",
          roomGroup: args.likelyRoomTypes.find((item) => ["guest room", "corridor"].includes(item)) || null,
          supportType:
            ceilingElectricalFindings.some((finding) =>
              ["electrical_fixture_count", "device_count", "ceiling_area"].includes(String(finding.category || ""))
            )
              ? "quantity_backed"
              : "schedule_backed",
          scopeBreadth: "narrow",
          confidenceLabel:
            ceilingElectricalFindings.length > 0 && electricalSchedules.length > 0
              ? "strong"
              : "moderate",
          quantitySummary: summarizeQuantities(ceilingElectricalFindings),
          scheduleSummary: summarizeSchedules(electricalSchedules),
          executionNotes: uniqStrings(
            [
              "RCP and fixture/light schedule support can organize ceiling-adjacent work without crossing into unrelated wall or floor packages.",
              args.scheduleReconciliationSignals.find((item) => /\breflected ceiling plans now reconcile/i.test(item)) || "",
            ].filter(Boolean),
            4
          ),
          cautionNotes: ["Ceiling-light-fixture context should remain trade-specific and not inflate unrelated finish or drywall authority."],
          evidence: buildPackageEvidence({
            findings: ceilingElectricalFindings,
            schedules: electricalSchedules,
          }),
        }
      : null
  )

  const demoFindings = findings.filter(
    (finding) =>
      finding.category === "demolition_area" ||
      /\bdemo(?:lition)?\b|\bremoval\b/i.test([finding.label, ...(finding.notes || [])].join(" "))
  )
  const hasDemoRole = /\bdemo(?: plan)?\b/i.test(roleText)

  addPackage(
    demoFindings.length > 0 || hasDemoRole
      ? {
          key: "demo-removal-package",
          title: "Demo / removal package",
          primaryTrade: demoFindings[0]?.trade || "general renovation",
          roomGroup: null,
          supportType: demoFindings.length > 0 ? "demo_only" : "support_only",
          scopeBreadth: "narrow",
          confidenceLabel: demoFindings.length > 0 ? "moderate" : "limited",
          quantitySummary: summarizeQuantities(demoFindings),
          scheduleSummary: null,
          executionNotes: ["Demo/removal scope can be packaged separately from install work when demolition sheets are selected."],
          cautionNotes: uniqStrings(
            [
              "Removal/demo support does not create install authority by itself.",
              args.crossSheetConflictSignals.find((item) => /\bremoval remains non-binding\b/i.test(item)) || "",
            ].filter(Boolean),
            4
          ),
          evidence: buildPackageEvidence({ findings: demoFindings }),
        }
      : null
  )

  return packages.slice(0, 8)
}

function buildHighValueSheetSignals(args: {
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  packageGroupingSignals: string[]
  repeatScalingSignals: string[]
}): string[] {
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const signals: string[] = []

  const priorityRoles: Array<{ role: string; level: "anchor" | "high-value" | "support" }> = [
    { role: "typical room sheet", level: "anchor" },
    { role: "finish schedule", level: "anchor" },
    { role: "fixture schedule", level: "anchor" },
    { role: "bathroom sheet", level: "high-value" },
    { role: "corridor sheet", level: "high-value" },
    { role: "finish plan", level: "high-value" },
    { role: "floor plan", level: "support" },
    { role: "plumbing plan", level: "support" },
    { role: "electrical plan", level: "support" },
  ]

  for (const entry of priorityRoles) {
    if (roleNames.includes(entry.role)) {
      signals.push(`${entry.level}: ${entry.role}`)
    }
  }

  if (signals.length === 0 && args.prototypeSignals.length > 0) {
    signals.push("anchor: prototype or typical room references appear to drive estimating value")
  }
  if (signals.length === 0 && args.packageGroupingSignals.length > 0) {
    signals.push("high-value: package-grouping sheets appear more important than general support sheets")
  }
  if (signals.length === 0 && args.repeatScalingSignals.length > 0) {
    signals.push("high-value: repeat-scaling cues suggest some sheets are stronger pricing anchors than others")
  }

  return uniqStrings(signals, 8)
}

function buildPricingAnchorSignals(args: {
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  repeatedSpaceSignals: string[]
  tradePackageSignals: string[]
  packageGroupingSignals: string[]
}): string[] {
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const signals: string[] = []

  if (roleNames.includes("typical room sheet") && args.prototypeSignals.length > 0) {
    signals.push("Typical room sheets look like pricing anchors for repeatable room-package estimating.")
  }
  if (roleNames.includes("bathroom sheet") && args.tradePackageSignals.some((item) => /\bwet-area\b|\bfixture\b/i.test(item))) {
    signals.push("Bathroom sheets look like pricing anchors for wet-area and fixture package scope.")
  }
  if (roleNames.includes("finish schedule")) {
    signals.push("Finish schedules look like pricing anchors for finish-package carry and repeatable room refresh scope.")
  }
  if (roleNames.includes("fixture schedule")) {
    signals.push("Fixture schedules look like pricing anchors where bathroom or plumbing fixture work is implied.")
  }
  if (roleNames.includes("corridor sheet") && args.packageGroupingSignals.some((item) => /\bcorridor\b/i.test(item))) {
    signals.push("Corridor sheets look like pricing anchors for corridor or common-path finish packages.")
  }
  if (signals.length === 0 && args.repeatedSpaceSignals.length > 0) {
    signals.push("Repeated-space cues suggest some sheets are acting as package anchors even if a formal schedule is not obvious.")
  }

  return uniqStrings(signals, 6)
}

function buildBidCoverageGaps(args: {
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  repeatScalingSignals: string[]
  repeatedSpaceSignals: string[]
  tradePackageSignals: string[]
  scalableScopeSignals: string[]
  likelyRoomTypes: string[]
  takeoff: PlanTakeoff
}): string[] {
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const gaps: string[] = []
  const hasFinishSchedule = roleNames.includes("finish schedule")
  const hasFixtureSchedule = roleNames.includes("fixture schedule")
  const hasCorridorSheet = roleNames.includes("corridor sheet")
  const hasTypicalRoomSheet = roleNames.includes("typical room sheet")
  const hasBathroomSheet = roleNames.includes("bathroom sheet")
  const hasWetAreaPackage = args.tradePackageSignals.some((item) => /\bwet-area\b/i.test(item))
  const hasFixturePackage = args.tradePackageSignals.some((item) => /\bfixture package\b/i.test(item))
  const hasCorridorPackage = args.tradePackageSignals.some((item) => /\bcorridor\b/i.test(item))

  if (
    (args.repeatedSpaceSignals.length > 0 || args.scalableScopeSignals.length > 0) &&
    !hasFinishSchedule
  ) {
    gaps.push("Repeated room/package signals are present, but no finish schedule is clearly anchored in the uploaded set.")
  }
  if ((hasBathroomSheet || hasFixturePackage || hasWetAreaPackage) && !hasFixtureSchedule) {
    gaps.push("Bathroom or fixture package signals are present, but fixture-schedule support looks limited in the uploaded set.")
  }
  if ((hasCorridorSheet || hasCorridorPackage) && !hasFinishSchedule) {
    gaps.push("Corridor package signals are present, but corridor-finish support looks thin without a clear finish schedule.")
  }
  if ((args.prototypeSignals.length > 0 || hasTypicalRoomSheet) && !args.takeoff.roomCount) {
    gaps.push("Prototype behavior is likely, but repeat counts are not clearly supported from current structured plan signals.")
  }
  if (hasWetAreaPackage && !hasBathroomSheet) {
    gaps.push("Wet-area scope is likely, but bathroom/detail-sheet support looks limited in the uploaded set.")
  }
  if (args.tradePackageSignals.length >= 2 && roleNames.filter((role) => /schedule/.test(role)).length === 0) {
    gaps.push("Trade-package signals are broad, but schedule-style anchor sheets look limited in the current upload set.")
  }

  return uniqStrings(gaps, 6)
}

function buildEstimatingPrioritySignals(args: {
  highValueSheetSignals: string[]
  pricingAnchorSignals: string[]
  bidCoverageGaps: string[]
}): string[] {
  const signals: string[] = []

  if (args.pricingAnchorSignals.length > 0) {
    signals.push(`Anchor first: ${args.pricingAnchorSignals[0]}`)
  }
  if (args.highValueSheetSignals.length > 1) {
    signals.push(`High-value follow-up: ${args.highValueSheetSignals.slice(1, 3).join("; ")}.`)
  } else if (args.highValueSheetSignals.length === 1) {
    signals.push(`High-value follow-up: ${args.highValueSheetSignals[0]}.`)
  }
  if (args.bidCoverageGaps.length > 0) {
    signals.push(`Coverage review: ${args.bidCoverageGaps[0]}`)
  }

  return uniqStrings(signals, 5)
}

function buildBidExecutionNotes(args: {
  pricingAnchorSignals: string[]
  bidCoverageGaps: string[]
  estimatingPrioritySignals: string[]
  bidStrategyNotes: string[]
  prototypeSignals: string[]
}): string[] {
  const notes: string[] = []

  if (args.pricingAnchorSignals.length > 0) {
    notes.push("Start the bid around the strongest anchor sheets before spreading pricing across the whole set.")
  }
  if (args.prototypeSignals.length > 0) {
    notes.push("If typical-room behavior is real, defend the estimate as a prototype package plus repeated application rather than isolated room pricing.")
  }
  if (args.bidCoverageGaps.length > 0) {
    notes.push("Coverage gaps suggest the uploaded set may not fully support all package assumptions yet; keep those assumptions visible in the bid.")
  }
  if (args.bidStrategyNotes.length > 0) {
    notes.push(args.bidStrategyNotes[0])
  }
  if (args.estimatingPrioritySignals.length > 0) {
    notes.push(args.estimatingPrioritySignals[0])
  }

  return uniqStrings(notes, 6)
}

function buildPricingPackageSignals(args: {
  likelyRoomTypes: string[]
  sheetRoleSignals: string[]
  tradePackageSignals: string[]
  packageGroupingSignals: string[]
  repeatedSpaceSignals: string[]
}): string[] {
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const signals: string[] = []

  if (
    args.likelyRoomTypes.includes("guest room") &&
    (roleNames.includes("typical room sheet") ||
      args.tradePackageSignals.some((item) => /\bguest room refresh package\b/i.test(item)))
  ) {
    signals.push("Guest room package signals: repeated room-refresh pricing may be anchored by typical room sheets and finish cues.")
  }
  if (
    (args.likelyRoomTypes.includes("guest bathroom") || roleNames.includes("bathroom sheet")) &&
    args.tradePackageSignals.some((item) => /\bwet-area\b|\bfixture package\b/i.test(item))
  ) {
    signals.push("Guest bathroom package signals: bathroom sheets and wet-area/fixture cues may support repeated bathroom pricing packages.")
  }
  if (
    roleNames.includes("corridor sheet") &&
    args.tradePackageSignals.some((item) => /\bcorridor\b/i.test(item))
  ) {
    signals.push("Corridor package signals: corridor sheets may support separate corridor refresh pricing.")
  }
  if (
    roleNames.includes("common area sheet") ||
    args.packageGroupingSignals.some((item) => /\bcommon-area\b|\bpublic-area\b/i.test(item))
  ) {
    signals.push("Common-area package signals: public-area sheets may need separate non-repeat package treatment.")
  }
  if (args.tradePackageSignals.some((item) => /\bwet-area\b/i.test(item))) {
    signals.push("Wet-area package signals: tile, plumbing, and bathroom-detail cues support a wet-area pricing package.")
  }
  if (
    args.tradePackageSignals.some((item) => /\bfinish package\b/i.test(item)) ||
    roleNames.includes("finish schedule")
  ) {
    signals.push("Finish package signals: finish schedules and finish-plan cues may anchor repeated finish allowances.")
  }
  if (signals.length === 0 && args.repeatedSpaceSignals.length > 0) {
    signals.push("Package-style estimating signals are present, but package type remains only partially defined from the uploaded set.")
  }

  return uniqStrings(signals, 8)
}

function buildPrototypePackageSignals(args: {
  prototypeSignals: string[]
  pricingPackageSignals: string[]
  sheetRoleSignals: string[]
}): string[] {
  const roleNames = args.sheetRoleSignals.map(extractRoleName)
  const signals: string[] = []

  if (
    args.prototypeSignals.length > 0 &&
    args.pricingPackageSignals.some((item) => /\bguest room package\b/i.test(item))
  ) {
    signals.push("Prototype guest room package likely: typical room behavior appears strong enough to anchor repeated room pricing.")
  }
  if (
    args.prototypeSignals.length > 0 &&
    args.pricingPackageSignals.some((item) => /\bguest bathroom package\b/i.test(item))
  ) {
    signals.push("Prototype bathroom package likely: repeated bathroom cues may support a repeatable bathroom package anchor.")
  }
  if (roleNames.includes("typical room sheet") && args.prototypeSignals.length > 0) {
    signals.push("Typical room sheets appear to function as prototype-package anchors rather than support-only references.")
  }

  return uniqStrings(signals, 6)
}

function buildPackageScopeCandidates(args: {
  pricingPackageSignals: string[]
  tradePackageSignals: string[]
  packageGroupingSignals: string[]
}): string[] {
  const candidates: string[] = []

  if (args.pricingPackageSignals.some((item) => /\bguest room package\b/i.test(item))) {
    candidates.push("guest room package")
  }
  if (
    args.pricingPackageSignals.some((item) => /\bbathroom package\b/i.test(item)) ||
    args.tradePackageSignals.some((item) => /\bwet-area\b|\bfixture package\b/i.test(item))
  ) {
    candidates.push("guest bathroom package")
  }
  if (args.pricingPackageSignals.some((item) => /\bcorridor package\b/i.test(item))) {
    candidates.push("corridor package")
  }
  if (args.pricingPackageSignals.some((item) => /\bcommon-area package\b/i.test(item))) {
    candidates.push("common-area package")
  }
  if (args.pricingPackageSignals.some((item) => /\bwet-area package\b/i.test(item))) {
    candidates.push("wet-area package")
  }
  if (args.pricingPackageSignals.some((item) => /\bfinish package\b/i.test(item))) {
    candidates.push("finish package")
  }
  if (candidates.length === 0 && args.packageGroupingSignals.length > 0) {
    candidates.push("package grouping likely, but exact estimating package boundaries remain only partially supported")
  }

  return uniqStrings(candidates, 8)
}

function buildPackageScalingGuidance(args: {
  prototypePackageSignals: string[]
  repeatScalingSignals: string[]
  packageScopeCandidates: string[]
  bidCoverageGaps: string[]
  takeoff: PlanTakeoff
}): string[] {
  const guidance: string[] = []

  if (args.prototypePackageSignals.length > 0) {
    guidance.push("Use prototype-led pricing logic first, then scale cautiously only where repeated-space support is visible in the plan set.")
  }
  if (args.packageScopeCandidates.includes("guest room package")) {
    guidance.push("Scale guest room packages from the prototype room condition only; do not assume repeat counts beyond current support.")
  }
  if (args.packageScopeCandidates.includes("guest bathroom package")) {
    guidance.push("Scale bathroom packages only where repeated bathroom layout cues stay materially consistent across sheets.")
  }
  if (args.packageScopeCandidates.includes("corridor package")) {
    guidance.push("Carry corridor scope as a separate package from room interiors rather than blending it into room-unit pricing.")
  }
  if (args.packageScopeCandidates.includes("common-area package")) {
    guidance.push("Treat common-area work as non-repeat or limited-repeat scope unless the plan set clearly shows repeated public-area conditions.")
  }
  if (!args.takeoff.roomCount && args.repeatScalingSignals.length > 0) {
    guidance.push("Repeat-scaling is likely, but counts remain unsupported; keep the estimate framework package-based rather than quantity-assumptive.")
  }
  if (args.bidCoverageGaps.length > 0) {
    guidance.push("Coverage gaps suggest scaling should stay conditional until anchor sheets or schedules are better supported.")
  }

  return uniqStrings(guidance, 8)
}

function buildPackageConfidenceNotes(args: {
  pricingPackageSignals: string[]
  prototypePackageSignals: string[]
  bidCoverageGaps: string[]
  pricingAnchorSignals: string[]
}): string[] {
  const notes: string[] = []

  if (args.prototypePackageSignals.length > 0 && args.bidCoverageGaps.length === 0) {
    notes.push("Prototype-package confidence is relatively stronger because anchor behavior is visible without major coverage gaps.")
  }
  if (args.pricingPackageSignals.length > 0 && args.pricingAnchorSignals.length > 0) {
    notes.push("Package confidence is supported by both package cues and identifiable anchor sheets.")
  }
  if (args.bidCoverageGaps.length > 0) {
    notes.push("Package confidence is limited by uploaded-set coverage gaps; keep package assumptions explicit in the bid.")
  }
  if (args.pricingPackageSignals.length === 0) {
    notes.push("Package confidence remains low where room/package boundaries are not yet clearly anchored by the plan set.")
  }

  return uniqStrings(notes, 6)
}

function buildEstimatingFrameworkNotes(args: {
  packageScopeCandidates: string[]
  packageScalingGuidance: string[]
  packageConfidenceNotes: string[]
  bidExecutionNotes: string[]
}): string[] {
  const notes: string[] = []

  if (args.packageScopeCandidates.length > 0) {
    notes.push(`Estimating framework candidate: ${args.packageScopeCandidates.slice(0, 3).join(", ")}.`)
  }
  if (args.packageScalingGuidance.length > 0) {
    notes.push(args.packageScalingGuidance[0])
  }
  if (args.packageConfidenceNotes.length > 0) {
    notes.push(args.packageConfidenceNotes[0])
  }
  if (args.bidExecutionNotes.length > 0) {
    notes.push(args.bidExecutionNotes[0])
  }

  return uniqStrings(notes, 6)
}

function buildEstimateStructureSignals(args: {
  packageScopeCandidates: string[]
  prototypePackageSignals: string[]
  pricingAnchorSignals: string[]
  pricingPackageSignals: string[]
}): string[] {
  const signals: string[] = []

  if (args.packageScopeCandidates.includes("guest room package")) {
    signals.push("Guest room package likely belongs as a primary estimate bucket.")
  }
  if (args.packageScopeCandidates.includes("guest bathroom package")) {
    signals.push("Guest bathroom package likely belongs as a separate wet-area estimate bucket.")
  }
  if (args.packageScopeCandidates.includes("corridor package")) {
    signals.push("Corridor package likely belongs as a distinct finish or common-path estimate bucket.")
  }
  if (args.packageScopeCandidates.includes("common-area package")) {
    signals.push("Common-area package likely belongs as a separate non-repeat or allowance-backed estimate bucket.")
  }
  if (args.prototypePackageSignals.length > 0 && args.pricingAnchorSignals.length > 0) {
    signals.push("Prototype-driven package anchors suggest the estimate should be structured around package buckets before detail allowances.")
  }
  if (signals.length === 0 && args.pricingPackageSignals.length > 0) {
    signals.push("Plan signals support package-based estimate structure, but package boundaries remain only partially defined.")
  }

  return uniqStrings(signals, 8)
}

function buildEstimatePackageCandidates(args: {
  packageScopeCandidates: string[]
  pricingPackageSignals: string[]
  packageConfidenceNotes: string[]
}): string[] {
  const candidates: string[] = []

  if (args.packageScopeCandidates.includes("guest room package")) {
    candidates.push("Primary bucket: guest room package")
  }
  if (args.packageScopeCandidates.includes("guest bathroom package")) {
    candidates.push("Primary bucket: guest bathroom package")
  }
  if (args.packageScopeCandidates.includes("corridor package")) {
    candidates.push("Primary bucket: corridor package")
  }
  if (args.packageScopeCandidates.includes("common-area package")) {
    candidates.push("Support/allowance bucket: common-area package")
  }
  if (args.packageScopeCandidates.includes("finish package")) {
    candidates.push("Support/allowance bucket: finish package")
  }
  if (args.packageScopeCandidates.includes("wet-area package")) {
    candidates.push("Support/allowance bucket: wet-area package")
  }
  if (candidates.length === 0 && args.pricingPackageSignals.length > 0) {
    candidates.push("Package buckets are likely, but current plan support is not yet strong enough to separate them confidently.")
  }

  return uniqStrings(candidates, 8)
}

function buildPackageTradeScopeSignals(args: {
  estimatePackageCandidates: string[]
  tradePackageSignals: string[]
  detectedTrades: string[]
  sheetRoleSignals: string[]
}): string[] {
  const signals: string[] = []
  const trades = new Set(args.detectedTrades)
  const roleNames = args.sheetRoleSignals.map(extractRoleName)

  if (args.estimatePackageCandidates.some((item) => /\bguest room package\b/i.test(item))) {
    const parts: string[] = []
    if (trades.has("painting")) parts.push("painting")
    if (trades.has("flooring")) parts.push("flooring")
    if (trades.has("carpentry")) parts.push("carpentry")
    if (parts.length > 0) {
      signals.push(`Guest room package trade coverage likely includes: ${parts.join(", ")}.`)
    }
  }
  if (args.estimatePackageCandidates.some((item) => /\bguest bathroom package\b/i.test(item))) {
    const parts: string[] = []
    if (trades.has("plumbing")) parts.push("plumbing")
    if (trades.has("tile")) parts.push("tile")
    if (trades.has("painting")) parts.push("painting")
    if (parts.length > 0) {
      signals.push(`Guest bathroom package trade coverage likely includes: ${parts.join(", ")}.`)
    }
  }
  if (args.estimatePackageCandidates.some((item) => /\bcorridor package\b/i.test(item))) {
    const parts: string[] = []
    if (trades.has("painting")) parts.push("painting")
    if (trades.has("flooring")) parts.push("flooring")
    if (roleNames.includes("electrical plan")) parts.push("electrical support")
    if (parts.length > 0) {
      signals.push(`Corridor package trade coverage likely includes: ${parts.join(", ")}.`)
    }
  }
  if (args.estimatePackageCandidates.some((item) => /\bcommon-area package\b/i.test(item))) {
    signals.push("Common-area package trade coverage may need separate coordination rather than being rolled into repeated room packages.")
  }

  return uniqStrings(signals, 8)
}

function buildPackagePricingBasisSignals(args: {
  estimatePackageCandidates: string[]
  prototypePackageSignals: string[]
  packageScalingGuidance: string[]
  takeoff: PlanTakeoff
  sheetRoleSignals: string[]
}): string[] {
  const signals: string[] = []
  const roleNames = args.sheetRoleSignals.map(extractRoleName)

  if (args.estimatePackageCandidates.some((item) => /\bguest room package\b/i.test(item))) {
    signals.push("Guest room package pricing basis should start from prototype-room scope, then scale only where repeated-room support is visible.")
  }
  if (args.estimatePackageCandidates.some((item) => /\bguest bathroom package\b/i.test(item))) {
    signals.push("Guest bathroom package pricing basis should start from bathroom-layout consistency and fixture/wet-area support, not assumed counts.")
  }
  if (args.estimatePackageCandidates.some((item) => /\bcorridor package\b/i.test(item))) {
    signals.push("Corridor package pricing basis should stay separate from room pricing and lean on corridor-sheet and finish-support cues.")
  }
  if (roleNames.includes("finish schedule")) {
    signals.push("Finish schedules can support allowance-style pricing basis across repeated finish packages.")
  }
  if (roleNames.includes("fixture schedule")) {
    signals.push("Fixture schedules can support bathroom or plumbing package structure without forcing hard counts.")
  }
  if (!args.takeoff.roomCount && args.prototypePackageSignals.length > 0) {
    signals.push("Structured counts remain limited, so pricing basis should stay prototype-led rather than quantity-led.")
  }

  return uniqStrings(signals, 8)
}

function buildPackageAllowanceSignals(args: {
  estimatePackageCandidates: string[]
  sheetRoleSignals: string[]
  bidCoverageGaps: string[]
  packageConfidenceNotes: string[]
}): string[] {
  const signals: string[] = []
  const roleNames = args.sheetRoleSignals.map(extractRoleName)

  if (args.estimatePackageCandidates.some((item) => /\bcommon-area package\b/i.test(item))) {
    signals.push("Common-area scope may need an allowance-style bucket unless the uploaded set clearly defines repeated public-area work.")
  }
  if (args.estimatePackageCandidates.some((item) => /\bfinish package\b/i.test(item)) && roleNames.includes("finish schedule")) {
    signals.push("Finish schedules support finish allowances across repeated packages where exact counts remain unresolved.")
  }
  if (args.bidCoverageGaps.length > 0) {
    signals.push("Coverage gaps suggest some package buckets should stay allowance-backed until missing anchor support is resolved.")
  }
  if (args.packageConfidenceNotes.some((item) => /\blimited\b/i.test(item))) {
    signals.push("Lower-confidence package signals should be carried as support or allowance buckets rather than fully production-driven buckets.")
  }

  return uniqStrings(signals, 8)
}

function buildEstimateAssemblyGuidance(args: {
  estimatePackageCandidates: string[]
  packagePricingBasisSignals: string[]
  packageAllowanceSignals: string[]
  estimatingPrioritySignals: string[]
}): string[] {
  const guidance: string[] = []

  if (args.estimatePackageCandidates.length > 0) {
    guidance.push(`Assemble the estimate around package buckets first: ${args.estimatePackageCandidates.slice(0, 3).join("; ")}.`)
  }
  if (args.packagePricingBasisSignals.length > 0) {
    guidance.push(args.packagePricingBasisSignals[0])
  }
  if (args.packageAllowanceSignals.length > 0) {
    guidance.push(args.packageAllowanceSignals[0])
  }
  if (args.estimatingPrioritySignals.length > 0) {
    guidance.push(args.estimatingPrioritySignals[0])
  }

  return uniqStrings(guidance, 8)
}

function buildEstimateScaffoldNotes(args: {
  estimateStructureSignals: string[]
  estimatePackageCandidates: string[]
  packageTradeScopeSignals: string[]
  estimateAssemblyGuidance: string[]
  estimatingFrameworkNotes: string[]
}): string[] {
  const notes: string[] = []

  if (args.estimateStructureSignals.length > 0) {
    notes.push(args.estimateStructureSignals[0])
  }
  if (args.estimatePackageCandidates.length > 0) {
    notes.push(`Estimate scaffold candidate: ${args.estimatePackageCandidates.slice(0, 3).join(", ")}.`)
  }
  if (args.packageTradeScopeSignals.length > 0) {
    notes.push(args.packageTradeScopeSignals[0])
  }
  if (args.estimateAssemblyGuidance.length > 0) {
    notes.push(args.estimateAssemblyGuidance[0])
  }
  if (args.estimatingFrameworkNotes.length > 0) {
    notes.push(args.estimatingFrameworkNotes[0])
  }

  return uniqStrings(notes, 8)
}

function buildSummary(args: {
  sheetIndex: PlanSheetIndexEntry[]
  detectedTrades: string[]
  detectedRooms: string[]
  takeoff: PlanTakeoff
  analyses: PlanSheetAnalysis[]
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  repeatScalingSignals: string[]
  packageGroupingSignals: string[]
  bidStrategyNotes: string[]
  highValueSheetSignals: string[]
  pricingAnchorSignals: string[]
  bidCoverageGaps: string[]
  estimatingPrioritySignals: string[]
  bidExecutionNotes: string[]
  pricingPackageSignals: string[]
  prototypePackageSignals: string[]
  packageScopeCandidates: string[]
  packageScalingGuidance: string[]
  packageConfidenceNotes: string[]
  estimatingFrameworkNotes: string[]
  estimateStructureSignals: string[]
  estimatePackageCandidates: string[]
  packageTradeScopeSignals: string[]
  packagePricingBasisSignals: string[]
  packageAllowanceSignals: string[]
  estimateAssemblyGuidance: string[]
  estimateScaffoldNotes: string[]
  estimatorPackages: PlanEstimatorPackage[]
  crossSheetLinkSignals: string[]
  scheduleReconciliationSignals: string[]
  crossSheetConflictSignals: string[]
  planSetSynthesisNotes: string[]
  repeatedSpaceSignals: string[]
  likelyRoomTypes: string[]
  scalableScopeSignals: string[]
  tradePackageSignals: string[]
  bidAssistNotes: string[]
  scopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
    conflicts: string[]
  }
}): string {
  const parts: string[] = []

  if (args.sheetIndex.length > 0) {
    parts.push(`Reviewed ${args.sheetIndex.length} plan page(s).`)
  }
  if (args.detectedTrades.length > 0) {
    parts.push(`Detected trades: ${args.detectedTrades.join(", ")}.`)
  }
  if (args.detectedRooms.length > 0) {
    parts.push(`Detected spaces: ${args.detectedRooms.slice(0, 6).join(", ")}.`)
  }
  if (args.likelyRoomTypes.length > 0) {
    parts.push(`Likely room types: ${args.likelyRoomTypes.slice(0, 6).join(", ")}.`)
  }
  if (args.sheetRoleSignals.length > 0) {
    parts.push(`Sheet roles: ${args.sheetRoleSignals.slice(0, 4).join(", ")}.`)
  }

  const bathroomLayoutDetails = extractBathroomLayoutDetails(args.analyses)
  const hasBathroomRoom = args.detectedRooms.some((room) => /\bbath(room)?\b/i.test(room))
  if (hasBathroomRoom && bathroomLayoutDetails.length > 0) {
    parts.push(`Bathroom fixture/layout signals: ${bathroomLayoutDetails.join(", ")}.`)
  }
  if (args.repeatedSpaceSignals.length > 0) {
    parts.push(args.repeatedSpaceSignals[0])
  }
  if (args.tradePackageSignals.length > 0) {
    parts.push(args.tradePackageSignals[0])
  }
  if (args.estimatorPackages.length > 0) {
    const topPackage = args.estimatorPackages[0]
    parts.push(
      `Estimator-ready package: ${topPackage.title} (${topPackage.supportType.replace(/_/g, " ")}, ${topPackage.scopeBreadth} scope).`
    )
  }
  if (args.scalableScopeSignals.length > 0) {
    parts.push(args.scalableScopeSignals[0])
  }
  if (args.prototypeSignals.length > 0) {
    parts.push(args.prototypeSignals[0])
  }
  if (args.packageGroupingSignals.length > 0) {
    parts.push(args.packageGroupingSignals[0])
  }
  if (args.crossSheetLinkSignals.length > 0) {
    parts.push(args.crossSheetLinkSignals[0])
  }
  if (args.scheduleReconciliationSignals.length > 0) {
    parts.push(args.scheduleReconciliationSignals[0])
  }
  if (args.crossSheetConflictSignals.length > 0) {
    parts.push(args.crossSheetConflictSignals[0])
  }
  if (args.pricingAnchorSignals.length > 0) {
    parts.push(args.pricingAnchorSignals[0])
  }
  if (args.bidCoverageGaps.length > 0) {
    parts.push(args.bidCoverageGaps[0])
  }
  if (args.pricingPackageSignals.length > 0) {
    parts.push(args.pricingPackageSignals[0])
  }
  if (args.packageScalingGuidance.length > 0) {
    parts.push(args.packageScalingGuidance[0])
  }
  if (args.estimateStructureSignals.length > 0) {
    parts.push(args.estimateStructureSignals[0])
  }
  if (args.estimateAssemblyGuidance.length > 0) {
    parts.push(args.estimateAssemblyGuidance[0])
  }

  const quantityParts: string[] = []
  if (args.takeoff.roomCount) quantityParts.push(`${args.takeoff.roomCount} room(s)`)
  if (args.takeoff.doorCount) quantityParts.push(`${args.takeoff.doorCount} door(s)`)
  if (args.takeoff.windowCount) quantityParts.push(`${args.takeoff.windowCount} window(s)`)
  if (args.takeoff.deviceCount) quantityParts.push(`${args.takeoff.deviceCount} device(s)`)
  if (args.takeoff.fixtureCount) quantityParts.push(`${args.takeoff.fixtureCount} fixture(s)`)
  if (quantityParts.length > 0) {
    parts.push(`Structured schedule signals: ${quantityParts.join(", ")}.`)
  }

  if (args.scopeAssist.conflicts.length > 0) {
    parts.push(`Plan review found ${args.scopeAssist.conflicts.length} scope conflict(s) to confirm.`)
  } else if (
    args.scopeAssist.missingScopeFlags.length > 0 ||
    args.scopeAssist.suggestedAdditions.length > 0
  ) {
    parts.push("Plan review surfaced follow-up scope confirmations.")
  }

  return parts.join(" ").trim()
}

function buildNotes(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  sheetRoleSignals: string[]
  prototypeSignals: string[]
  repeatScalingSignals: string[]
  packageGroupingSignals: string[]
  bidStrategyNotes: string[]
  highValueSheetSignals: string[]
  pricingAnchorSignals: string[]
  bidCoverageGaps: string[]
  estimatingPrioritySignals: string[]
  bidExecutionNotes: string[]
  pricingPackageSignals: string[]
  prototypePackageSignals: string[]
  packageScopeCandidates: string[]
  packageScalingGuidance: string[]
  packageConfidenceNotes: string[]
  estimatingFrameworkNotes: string[]
  estimateStructureSignals: string[]
  estimatePackageCandidates: string[]
  packageTradeScopeSignals: string[]
  packagePricingBasisSignals: string[]
  packageAllowanceSignals: string[]
  estimateAssemblyGuidance: string[]
  estimateScaffoldNotes: string[]
  estimatorPackages: PlanEstimatorPackage[]
  crossSheetLinkSignals: string[]
  scheduleReconciliationSignals: string[]
  crossSheetConflictSignals: string[]
  planSetSynthesisNotes: string[]
  repeatedSpaceSignals: string[]
  likelyRoomTypes: string[]
  scalableScopeSignals: string[]
  tradePackageSignals: string[]
  bidAssistNotes: string[]
  scopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
    conflicts: string[]
  }
}): string[] {
  const baseNotes = [
    ...args.analyses.flatMap((analysis) => analysis.notes || []),
    ...args.sheetRoleSignals,
    ...args.prototypeSignals,
    ...args.repeatScalingSignals,
    ...args.packageGroupingSignals,
    ...args.bidStrategyNotes,
    ...args.highValueSheetSignals,
    ...args.pricingAnchorSignals,
    ...args.bidCoverageGaps,
    ...args.estimatingPrioritySignals,
    ...args.bidExecutionNotes,
    ...args.pricingPackageSignals,
    ...args.prototypePackageSignals,
    ...args.packageScopeCandidates,
    ...args.packageScalingGuidance,
    ...args.packageConfidenceNotes,
    ...args.estimatingFrameworkNotes,
    ...args.estimateStructureSignals,
    ...args.estimatePackageCandidates,
    ...args.packageTradeScopeSignals,
    ...args.packagePricingBasisSignals,
    ...args.packageAllowanceSignals,
    ...args.estimateAssemblyGuidance,
    ...args.estimateScaffoldNotes,
    ...args.estimatorPackages.map(
      (pkg) =>
        `${pkg.title}: ${pkg.supportType.replace(/_/g, " ")} ${pkg.scopeBreadth} package${pkg.quantitySummary ? ` backed by ${pkg.quantitySummary}` : ""}.`
    ),
    ...args.estimatorPackages.flatMap((pkg) => pkg.executionNotes || []),
    ...args.estimatorPackages.flatMap((pkg) => pkg.cautionNotes || []),
    ...args.crossSheetLinkSignals,
    ...args.scheduleReconciliationSignals,
    ...args.crossSheetConflictSignals,
    ...args.planSetSynthesisNotes,
    ...args.repeatedSpaceSignals,
    ...args.scalableScopeSignals,
    ...args.tradePackageSignals,
    ...args.bidAssistNotes,
    ...args.scopeAssist.missingScopeFlags,
    ...args.scopeAssist.suggestedAdditions,
    ...args.scopeAssist.conflicts,
  ]

  const bathroomLayoutDetails = extractBathroomLayoutDetails(args.analyses)
  const hasBathroomRoom = args.analyses.some((analysis) =>
    (analysis.rooms || []).some((room) => /\bbath(room)?\b/i.test(room.roomName))
  )
  const notes = uniqStrings(
    baseNotes.filter((note) => {
      if (!hasBathroomRoom || bathroomLayoutDetails.length === 0) return true
      return !/\bbathroom fixture\/layout signals reviewed\b|\bvisible bathroom fixture\/layout labels\b/i.test(
        note
      )
    }),
    16
  )
  if (
    hasBathroomRoom &&
    bathroomLayoutDetails.length > 0 &&
    !notes.some((note) => /\bbathroom fixture\/layout\b|\bvisible bathroom fixture\/layout\b/i.test(note))
  ) {
    notes.unshift(`Bathroom fixture/layout signals reviewed: ${bathroomLayoutDetails.join(", ")}.`)
  }

  if (args.sheetIndex.length > 0 && notes.length === 0) {
    return ["Plan pages were normalized and indexed for sheet-level review."]
  }

  return notes
}

function buildConfidenceScore(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  evidence: PlanEvidenceBundle
  detectedTrades: string[]
  detectedRooms: string[]
}) {
  const values = [
    ...args.sheetIndex.map((sheet) => sheet.confidence),
    ...args.analyses.map((analysis) => analysis.confidence),
  ].filter((value) => Number.isFinite(value) && value > 0)

  const base = values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 10

  let score = base
  if (args.detectedTrades.length > 0) score += 5
  if (args.detectedRooms.length > 0) score += 5
  if (args.evidence.summaryRefs.length > 0) score += 5
  if (args.evidence.quantityRefs.length > 0) score += 5

  return Math.max(10, Math.min(95, score))
}

function formatFindingQuantity(finding: PlanTradeFinding): string | null {
  if (typeof finding.quantity !== "number" || !Number.isFinite(finding.quantity) || finding.quantity <= 0) {
    return null
  }

  const rounded = Number.isInteger(finding.quantity)
    ? finding.quantity.toLocaleString()
    : finding.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return `${rounded} ${finding.unit.replace(/_/g, " ")}`
}

function getPackageReadbackSupport(supportType: PlanEstimatorPackage["supportType"]): PlanReadbackSupportLevel {
  if (supportType === "quantity_backed") return "direct"
  if (supportType === "schedule_backed" || supportType === "scaled_prototype") return "reinforced"
  return "review"
}

type AreaQuantityRollup = {
  areaGroup: string
  areaType: PlanExplanationReadback["areaQuantityReadback"][number]["areaType"]
  directQuantities: string[]
  reinforcedQuantities: string[]
  reviewNotes: string[]
  evidence: PlanEvidenceRef[]
  supportLevel: PlanReadbackSupportLevel
}

function classifyAreaGroup(value: string): Pick<AreaQuantityRollup, "areaGroup" | "areaType"> {
  if (/\bguest\s*(room|suite)|typical\s*(room|unit)\b/i.test(value)) {
    return { areaGroup: "guest rooms", areaType: "guest_room" }
  }
  if (/\bbath|toilet|lavator|shower|wet[-\s]?area|fixture\b/i.test(value)) {
    return { areaGroup: "bathrooms / wet areas", areaType: "bathroom_wet_area" }
  }
  if (/\bcorridor|hallway|public path|common path\b/i.test(value)) {
    return { areaGroup: "corridors", areaType: "corridor" }
  }
  if (/\blobby|common|public|amenity|reception|club|leasing\b/i.test(value)) {
    return { areaGroup: "common areas", areaType: "common_area" }
  }
  if (/\bceiling|rcp|light|fixture|device|receptacle|switch|electrical\b/i.test(value)) {
    return { areaGroup: "ceiling / fixture zones", areaType: "ceiling_fixture_zone" }
  }
  if (/\bdemo(?:lition)?|removal|remove\b/i.test(value)) {
    return { areaGroup: "demo / removal zones", areaType: "demo_removal_zone" }
  }
  return { areaGroup: "general affected areas", areaType: "general_area" }
}

function classifyFindingArea(finding: PlanTradeFinding): Pick<AreaQuantityRollup, "areaGroup" | "areaType"> {
  const text = [
    finding.label,
    finding.category || "",
    finding.trade,
    ...finding.notes,
    ...finding.evidence.map((ref) => `${ref.sheetNumber || ""} ${ref.sheetTitle || ""} ${ref.excerpt}`),
  ].join(" ")
  if (finding.category === "demolition_area") return { areaGroup: "demo / removal zones", areaType: "demo_removal_zone" }
  if (finding.category === "corridor_area") return { areaGroup: "corridors", areaType: "corridor" }
  if (
    finding.category === "selected_elevation_area" ||
    finding.category === "wall_tile_area" ||
    finding.category === "shower_tile_area" ||
    finding.category === "plumbing_fixture_count"
  ) {
    return { areaGroup: "bathrooms / wet areas", areaType: "bathroom_wet_area" }
  }
  if (
    finding.category === "device_count" ||
    finding.category === "switch_count" ||
    finding.category === "receptacle_count" ||
    finding.category === "electrical_fixture_count" ||
    finding.category === "ceiling_area"
  ) {
    return { areaGroup: "ceiling / fixture zones", areaType: "ceiling_fixture_zone" }
  }
  return classifyAreaGroup(text)
}

function classifyScheduleArea(
  schedule: PlanScheduleItem,
  analysis: PlanSheetAnalysis
): Pick<AreaQuantityRollup, "areaGroup" | "areaType"> {
  if (schedule.scheduleType === "electrical") {
    return { areaGroup: "ceiling / fixture zones", areaType: "ceiling_fixture_zone" }
  }
  if (schedule.scheduleType === "fixture") {
    return { areaGroup: "bathrooms / wet areas", areaType: "bathroom_wet_area" }
  }
  return classifyAreaGroup(
    [
      schedule.scheduleType,
      schedule.label,
      ...schedule.notes,
      ...(analysis.rooms || []).map((room) => room.roomName),
      ...(analysis.tradeFindings || []).flatMap((finding) => [finding.label, ...finding.notes]),
    ].join(" ")
  )
}

function getOrCreateAreaRollup(
  rollups: Map<string, AreaQuantityRollup>,
  area: Pick<AreaQuantityRollup, "areaGroup" | "areaType">
): AreaQuantityRollup {
  const existing = rollups.get(area.areaGroup)
  if (existing) return existing
  const created: AreaQuantityRollup = {
    areaGroup: area.areaGroup,
    areaType: area.areaType,
    directQuantities: [],
    reinforcedQuantities: [],
    reviewNotes: [],
    evidence: [],
    supportLevel: "review",
  }
  rollups.set(area.areaGroup, created)
  return created
}

function buildAreaQuantityReadback(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  estimatorPackages: PlanEstimatorPackage[]
  detectedRooms: string[]
  repeatedSpaceSignals: string[]
  prototypeSignals: string[]
}): PlanExplanationReadback["areaQuantityReadback"] {
  const rollups = new Map<string, AreaQuantityRollup>()

  for (const room of args.detectedRooms) {
    const rollup = getOrCreateAreaRollup(rollups, classifyAreaGroup(room))
    rollup.reviewNotes.push(`${room} appears in selected sheet room detection.`)
  }

  for (const analysis of args.analyses) {
    for (const room of analysis.rooms || []) {
      const rollup = getOrCreateAreaRollup(rollups, classifyAreaGroup(room.roomName))
      if (typeof room.areaSqft === "number" && room.areaSqft > 0) {
        rollup.directQuantities.push(`${room.roomName}: ${room.areaSqft.toLocaleString()} sqft room area is directly shown.`)
        rollup.supportLevel = "direct"
      } else {
        rollup.reviewNotes.push(`${room.roomName} is identified, but room area/count remains review-only.`)
      }
      rollup.evidence = uniqEvidence([...rollup.evidence, ...(room.evidence || [])], 6)
    }

    for (const finding of analysis.tradeFindings || []) {
      const rollup = getOrCreateAreaRollup(rollups, classifyFindingArea(finding))
      const quantity = formatFindingQuantity(finding)
      if (quantity) {
        rollup.directQuantities.push(`${finding.label}: ${quantity} directly supported for ${finding.trade}.`)
        rollup.supportLevel = "direct"
      } else {
        rollup.reviewNotes.push(`${finding.label}: ${finding.trade} support is present, but no direct quantity is carried.`)
      }
      if (finding.category === "selected_elevation_area") {
        rollup.reviewNotes.push("Elevation-only support stays limited to shown wall/wet-area surfaces, not full-room authority.")
      }
      if (finding.category === "demolition_area" || /\bdemo(?:lition)?|removal|remove\b/i.test([finding.label, ...finding.notes].join(" "))) {
        rollup.reviewNotes.push("Demo/removal support stays removal-only and does not create install quantity authority.")
      }
      rollup.evidence = uniqEvidence([...rollup.evidence, ...(finding.evidence || [])], 6)
    }

    for (const schedule of analysis.schedules || []) {
      const rollup = getOrCreateAreaRollup(
        rollups,
        classifyScheduleArea(schedule, analysis)
      )
      if (typeof schedule.quantity === "number" && schedule.quantity > 0) {
        rollup.reinforcedQuantities.push(
          `${schedule.label}: ${schedule.quantity.toLocaleString()} scheduled item(s) provide count context, not automatic full takeoff authority.`
        )
      } else {
        rollup.reinforcedQuantities.push(`${schedule.label}: schedule support reinforces this area, but no count is explicit.`)
      }
      if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
      rollup.evidence = uniqEvidence([...rollup.evidence, ...(schedule.evidence || [])], 6)
    }
  }

  if (
    args.sheetIndex.some((sheet) =>
      /\bdemo(?:lition)?\b|\bremoval\b/i.test(`${sheet.sheetNumber || ""} ${sheet.sheetTitle || ""} ${sheet.pageLabel || ""}`)
    )
  ) {
    const rollup = getOrCreateAreaRollup(rollups, { areaGroup: "demo / removal zones", areaType: "demo_removal_zone" })
    rollup.reviewNotes.push("Demo/removal sheet support stays removal-only and does not create install quantity authority.")
  }

  for (const pkg of args.estimatorPackages) {
    const rollup = getOrCreateAreaRollup(
      rollups,
      classifyAreaGroup(`${pkg.roomGroup || ""} ${pkg.title} ${pkg.supportType} ${pkg.primaryTrade}`)
    )
    if (pkg.quantitySummary) {
      if (pkg.supportType === "quantity_backed") {
        rollup.directQuantities.push(`${pkg.title}: ${pkg.quantitySummary}.`)
        rollup.supportLevel = "direct"
      } else {
        rollup.reinforcedQuantities.push(`${pkg.title}: ${pkg.quantitySummary} is ${pkg.supportType.replace(/_/g, " ")} context.`)
        if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
      }
    }
    if (pkg.scheduleSummary) {
      rollup.reinforcedQuantities.push(`${pkg.title}: ${pkg.scheduleSummary} reinforces the area package.`)
      if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
    }
    if (pkg.supportType === "scaled_prototype") {
      rollup.reinforcedQuantities.push(`${pkg.title}: typical/repeated room support appears scale-oriented, not a measured total.`)
      if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
    }
    if (pkg.supportType === "elevation_only") {
      rollup.reviewNotes.push(`${pkg.title}: elevation-only support stays narrow to shown vertical/wet-area surfaces.`)
    }
    if (pkg.supportType === "demo_only") {
      rollup.reviewNotes.push(`${pkg.title}: removal-only support is separated from install-oriented scope.`)
    }
    rollup.evidence = uniqEvidence([...rollup.evidence, ...(pkg.evidence || [])], 6)
  }

  const prototypeText = uniqStrings([...args.repeatedSpaceSignals, ...args.prototypeSignals], 4).join(" ")
  if (prototypeText) {
    const rollup = getOrCreateAreaRollup(rollups, { areaGroup: "guest rooms", areaType: "guest_room" })
    rollup.reinforcedQuantities.push("Typical guest room / repeated room support appears present as scale-oriented support, not measured totals.")
    rollup.reviewNotes.push("Confirm actual repeat counts before treating prototype support as measured room quantity.")
    if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
  }

  return Array.from(rollups.values())
    .map((rollup) => {
      const quantityNarration = uniqStrings([...rollup.directQuantities, ...rollup.reinforcedQuantities], 8)
      const scopeNotes = uniqStrings(rollup.reviewNotes, 8)
      const supportText =
        rollup.supportLevel === "direct"
          ? "direct quantity support"
          : rollup.supportLevel === "reinforced"
            ? "reinforced support"
            : "review-only support"
      return {
        areaGroup: rollup.areaGroup,
        areaType: rollup.areaType,
        supportLevel: rollup.supportLevel,
        narration: `${rollup.areaGroup} read as ${supportText}${quantityNarration.length ? `: ${quantityNarration[0]}` : scopeNotes.length ? `: ${scopeNotes[0]}` : "."}`,
        quantityNarration,
        scopeNotes,
        evidence: uniqEvidence(rollup.evidence, 6),
      }
    })
    .filter((item) => item.quantityNarration.length > 0 || item.scopeNotes.length > 0)
    .slice(0, 8)
}

function buildSheetReadback(args: {
  sheet: PlanSheetIndexEntry
  analysis: PlanSheetAnalysis | null
}): PlanExplanationReadback["sheetNarration"][number] {
  const analysis = args.analysis
  const trades = uniqStrings((analysis?.tradeFindings || []).map((finding) => finding.trade), 6)
  const rooms = uniqStrings((analysis?.rooms || []).map((room) => room.roomName), 6)
  const schedules = uniqStrings((analysis?.schedules || []).map((item) => item.label || item.scheduleType), 4)
  const evidence = uniqEvidence([
    ...(analysis ? collectTradeEvidence(analysis.tradeFindings || []) : []),
    ...(analysis ? collectScheduleEvidence(analysis.schedules || []) : []),
    ...(analysis ? collectRoomEvidence(analysis.rooms || []) : []),
  ], 4)
  const hasQuantity = (analysis?.tradeFindings || []).some(
    (finding) => typeof finding.quantity === "number" && finding.quantity > 0
  )
  const hasSchedule = (analysis?.schedules || []).length > 0
  const supportLevel: PlanReadbackSupportLevel = hasQuantity ? "direct" : hasSchedule ? "reinforced" : "review"

  const left = args.sheet.sheetNumber || `Page ${args.sheet.pageNumber}`
  const title = args.sheet.sheetTitle || args.sheet.discipline
  const parts = [
    `${left} ${title}`.trim(),
    trades.length ? `points to ${trades.join(", ")} scope` : "",
    rooms.length ? `around ${rooms.join(", ")}` : "",
    schedules.length ? `with ${schedules.join(", ")} schedule support` : "",
  ].filter(Boolean)

  return {
    sheetNumber: args.sheet.sheetNumber,
    sheetTitle: args.sheet.sheetTitle,
    sourcePageNumber: args.sheet.sourcePageNumber,
    pageNumber: args.sheet.pageNumber,
    discipline: args.sheet.discipline,
    narration: `${parts.join(" ")}.`,
    detectedTrades: trades,
    detectedRooms: rooms,
    supportLevel,
    evidence,
  }
}

function buildTradeReadback(args: {
  detectedTrades: string[]
  estimatorPackages: PlanEstimatorPackage[]
  analyses: PlanSheetAnalysis[]
}): PlanExplanationReadback["tradeNarration"] {
  return args.detectedTrades.map((trade) => {
    const tradeFindings = args.analyses.flatMap((analysis) =>
      (analysis.tradeFindings || []).filter((finding) => finding.trade === trade)
    )
    const packages = args.estimatorPackages.filter((pkg) => pkg.primaryTrade === trade)
    const quantityFindings = tradeFindings.filter((finding) => typeof finding.quantity === "number" && finding.quantity > 0)
    const confidence: PlanExplanationReadback["tradeNarration"][number]["confidence"] =
      quantityFindings.length > 0 || packages.some((pkg) => pkg.confidenceLabel === "strong")
        ? "likely primary"
        : packages.length > 0 || tradeFindings.length > 0
          ? "supporting"
          : "review only"
    const roomGroups = uniqStrings(packages.map((pkg) => pkg.roomGroup || "").filter(Boolean), 4)
    const supportText =
      quantityFindings.length > 0
        ? `direct quantities such as ${quantityFindings.slice(0, 2).map((finding) => finding.label).join(", ")}`
        : packages.length > 0
          ? `${packages[0].supportType.replace(/_/g, " ")} package support`
          : "limited plan references"

    return {
      trade,
      confidence,
      narration: `${trade} reads as ${confidence} from ${supportText}${roomGroups.length ? ` in ${roomGroups.join(", ")}` : ""}.`,
      evidence: uniqEvidence([
        ...collectTradeEvidence(tradeFindings),
        ...packages.flatMap((pkg) => pkg.evidence || []),
      ], 5),
    }
  })
}

type TradeScopeRollup = {
  trade: PlanTradeFinding["trade"]
  directQuantities: string[]
  reinforcedSupport: string[]
  confirmationNotes: string[]
  areaGroups: string[]
  phaseTypes: PlanExplanationReadback["tradeScopeReadback"][number]["phaseTypes"]
  evidence: PlanEvidenceRef[]
  supportLevel: PlanReadbackSupportLevel
}

function phaseTypesForFinding(finding: PlanTradeFinding): TradeScopeRollup["phaseTypes"] {
  const text = [finding.label, finding.category || "", ...finding.notes].join(" ")
  const phases: TradeScopeRollup["phaseTypes"] = []
  if (finding.category === "demolition_area" || /\bdemo(?:lition)?|removal|remove\b/i.test(text)) {
    phases.push("demo_removal")
  }
  if (
    finding.category === "selected_elevation_area" ||
    finding.category === "wall_tile_area" ||
    finding.category === "shower_tile_area" ||
    finding.category === "plumbing_fixture_count" ||
    /\bwet[-\s]?area|bath|shower|tile|fixture\b/i.test(text)
  ) {
    phases.push("wet_area")
  }
  if (
    finding.category === "device_count" ||
    finding.category === "switch_count" ||
    finding.category === "receptacle_count" ||
    finding.category === "electrical_fixture_count" ||
    finding.category === "ceiling_area" ||
    /\bceiling|light|fixture|device|rcp\b/i.test(text)
  ) {
    phases.push("ceiling_fixture")
  }
  if (finding.category === "corridor_area" || /\bcorridor|common|public|lobby\b/i.test(text)) {
    phases.push("corridor_common")
  }
  if (/\bguest\s*(room|suite)|typical room\b/i.test(text)) {
    phases.push("guest_room")
  }
  if (
    finding.trade === "painting" ||
    finding.trade === "wallcovering" ||
    /\bfinish|paint|wallcovering|repaint|refresh\b/i.test(text)
  ) {
    phases.push("finish_refresh")
  }
  if (phases.length === 0 && finding.quantity && finding.quantity > 0) phases.push("install")
  if (phases.length === 0) phases.push("mixed_review")
  return uniqStrings(phases, 6) as TradeScopeRollup["phaseTypes"]
}

function phaseTypesForPackage(pkg: PlanEstimatorPackage): TradeScopeRollup["phaseTypes"] {
  const text = `${pkg.key} ${pkg.title} ${pkg.roomGroup || ""} ${pkg.supportType} ${pkg.primaryTrade}`
  const phases: TradeScopeRollup["phaseTypes"] = []
  if (pkg.supportType === "demo_only" || /\bdemo|removal\b/i.test(text)) phases.push("demo_removal")
  if (pkg.supportType === "elevation_only" || /\bwet-area|bath|shower|tile|fixture\b/i.test(text)) phases.push("wet_area")
  if (/\bceiling|light|fixture|electrical\b/i.test(text)) phases.push("ceiling_fixture")
  if (/\bcorridor|common\b/i.test(text)) phases.push("corridor_common")
  if (/\bguest room|typical\b/i.test(text)) phases.push("guest_room")
  if (/\bfinish|paint|wallcovering|flooring\b/i.test(text)) phases.push("finish_refresh")
  if (pkg.supportType === "quantity_backed" && phases.length === 0) phases.push("install")
  if (phases.length === 0) phases.push("mixed_review")
  return uniqStrings(phases, 6) as TradeScopeRollup["phaseTypes"]
}

function tradeForSchedule(schedule: PlanScheduleItem, detectedTrades: string[]): PlanTradeFinding["trade"] | null {
  if (schedule.scheduleType === "electrical") return "electrical"
  if (schedule.scheduleType === "fixture") return "plumbing"
  if (schedule.scheduleType === "door") return "carpentry"
  if (schedule.scheduleType === "finish") {
    if (detectedTrades.includes("wallcovering")) return "wallcovering"
    if (detectedTrades.includes("flooring")) return "flooring"
    if (detectedTrades.includes("painting")) return "painting"
    return "general renovation"
  }
  return null
}

function resolvePackageReadbackTrade(
  pkg: PlanEstimatorPackage,
  detectedTrades: string[]
): PlanTradeFinding["trade"] {
  if (detectedTrades.includes(pkg.primaryTrade)) return pkg.primaryTrade
  const text = `${pkg.key} ${pkg.title} ${pkg.roomGroup || ""} ${pkg.quantitySummary || ""} ${pkg.scheduleSummary || ""}`
  if (/\bwallcovering|wallcover|feature wall\b/i.test(text) && detectedTrades.includes("wallcovering")) {
    return "wallcovering"
  }
  if (/\bfloor|flooring\b/i.test(text) && detectedTrades.includes("flooring")) {
    return "flooring"
  }
  if (/\btile|shower|wet[-\s]?area\b/i.test(text) && detectedTrades.includes("tile")) {
    return "tile"
  }
  if (pkg.primaryTrade === "painting" && !detectedTrades.includes("painting")) {
    if (detectedTrades.includes("wallcovering")) return "wallcovering"
    if (detectedTrades.includes("flooring")) return "flooring"
    if (detectedTrades.includes("tile")) return "tile"
  }
  return pkg.primaryTrade
}

function getOrCreateTradeRollup(
  rollups: Map<string, TradeScopeRollup>,
  trade: PlanTradeFinding["trade"]
): TradeScopeRollup {
  const existing = rollups.get(trade)
  if (existing) return existing
  const created: TradeScopeRollup = {
    trade,
    directQuantities: [],
    reinforcedSupport: [],
    confirmationNotes: [],
    areaGroups: [],
    phaseTypes: [],
    evidence: [],
    supportLevel: "review",
  }
  rollups.set(trade, created)
  return created
}

function describePhaseTypes(phases: TradeScopeRollup["phaseTypes"]): string {
  const labels: Record<TradeScopeRollup["phaseTypes"][number], string> = {
    finish_refresh: "finish refresh",
    install: "install-oriented",
    demo_removal: "demo/removal-only",
    wet_area: "wet-area specialty",
    ceiling_fixture: "ceiling/light/fixture coordination",
    corridor_common: "corridor/common-area",
    guest_room: "guest-room",
    mixed_review: "mixed/review",
  }
  return phases.map((phase) => labels[phase]).join(", ")
}

function buildTradeScopeReadback(args: {
  analyses: PlanSheetAnalysis[]
  detectedTrades: string[]
  estimatorPackages: PlanEstimatorPackage[]
  areaQuantityReadback: PlanExplanationReadback["areaQuantityReadback"]
  repeatedSpaceSignals: string[]
  prototypeSignals: string[]
  crossSheetConflictSignals: string[]
}): PlanExplanationReadback["tradeScopeReadback"] {
  const rollups = new Map<string, TradeScopeRollup>()

  for (const trade of args.detectedTrades as PlanTradeFinding["trade"][]) {
    getOrCreateTradeRollup(rollups, trade)
  }

  for (const analysis of args.analyses) {
    for (const finding of analysis.tradeFindings || []) {
      const rollup = getOrCreateTradeRollup(rollups, finding.trade)
      const quantity = formatFindingQuantity(finding)
      const area = classifyFindingArea(finding)
      rollup.areaGroups.push(area.areaGroup)
      rollup.phaseTypes.push(...phaseTypesForFinding(finding))
      if (quantity) {
        rollup.directQuantities.push(`${finding.label}: ${quantity} directly supported.`)
        rollup.supportLevel = "direct"
      } else {
        rollup.confirmationNotes.push(`${finding.label}: no direct quantity is carried for this trade item.`)
      }
      if (finding.category === "selected_elevation_area") {
        rollup.confirmationNotes.push("Elevation-only evidence stays narrow to shown wall/wet-area surfaces.")
      }
      if (finding.category === "demolition_area" || /\bdemo(?:lition)?|removal|remove\b/i.test([finding.label, ...finding.notes].join(" "))) {
        rollup.confirmationNotes.push("Demo/removal support remains separate from install authority.")
      }
      rollup.evidence = uniqEvidence([...rollup.evidence, ...(finding.evidence || [])], 6)
    }

    for (const schedule of analysis.schedules || []) {
      const trade = tradeForSchedule(schedule, args.detectedTrades)
      if (!trade) continue
      const rollup = getOrCreateTradeRollup(rollups, trade)
      const area = classifyScheduleArea(schedule, analysis)
      rollup.areaGroups.push(area.areaGroup)
      rollup.phaseTypes.push(
        schedule.scheduleType === "electrical"
          ? "ceiling_fixture"
          : schedule.scheduleType === "fixture"
            ? "wet_area"
            : "finish_refresh"
      )
      if (typeof schedule.quantity === "number" && schedule.quantity > 0) {
        rollup.reinforcedSupport.push(
          `${schedule.label}: ${schedule.quantity.toLocaleString()} scheduled item(s) reinforce ${trade}, but do not become full takeoff authority by themselves.`
        )
      } else {
        rollup.reinforcedSupport.push(`${schedule.label}: schedule support reinforces ${trade}, but no count is explicit.`)
      }
      if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
      rollup.evidence = uniqEvidence([...rollup.evidence, ...(schedule.evidence || [])], 6)
    }
  }

  for (const pkg of args.estimatorPackages) {
    const readbackTrade = resolvePackageReadbackTrade(pkg, args.detectedTrades)
    const rollup = getOrCreateTradeRollup(rollups, readbackTrade)
    rollup.areaGroups.push(classifyAreaGroup(`${pkg.roomGroup || ""} ${pkg.title}`).areaGroup)
    rollup.phaseTypes.push(...phaseTypesForPackage(pkg))
    if (pkg.quantitySummary) {
      const text = `${pkg.title}: ${pkg.quantitySummary}.`
      if (pkg.supportType === "quantity_backed") {
        rollup.directQuantities.push(text)
        rollup.supportLevel = "direct"
      } else {
        rollup.reinforcedSupport.push(`${text} This is ${pkg.supportType.replace(/_/g, " ")} support.`)
        if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
      }
    }
    if (pkg.scheduleSummary) {
      rollup.reinforcedSupport.push(`${pkg.title}: ${pkg.scheduleSummary} reinforces this trade.`)
      if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
    }
    if (pkg.supportType === "scaled_prototype") {
      rollup.reinforcedSupport.push(`${pkg.title}: repeated/prototype support is scale-oriented, not a measured total.`)
      if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
    }
    if (pkg.supportType === "elevation_only") {
      rollup.confirmationNotes.push(`${pkg.title}: narrow elevation-only scope; do not read as full-room authority.`)
    }
    if (pkg.supportType === "demo_only") {
      rollup.confirmationNotes.push(`${pkg.title}: removal-only scope; keep separate from install trade scope.`)
    }
    rollup.confirmationNotes.push(...(pkg.cautionNotes || []))
    rollup.evidence = uniqEvidence([...rollup.evidence, ...(pkg.evidence || [])], 6)
  }

  if (args.repeatedSpaceSignals.length > 0 || args.prototypeSignals.length > 0) {
    for (const trade of ["painting", "flooring", "wallcovering"] as PlanTradeFinding["trade"][]) {
      const rollup = rollups.get(trade)
      if (!rollup) continue
      if (rollup.areaGroups.some((area) => /\bguest rooms\b/i.test(area))) {
        rollup.reinforcedSupport.push("Repeated guest room / prototype support is scale-oriented for this trade, not measured room totals.")
        rollup.confirmationNotes.push("Confirm actual repeat counts before pricing this trade as measured room quantity.")
        if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
      }
    }
  }

  for (const area of args.areaQuantityReadback) {
    for (const trade of Array.from(rollups.keys()) as PlanTradeFinding["trade"][]) {
      const rollup = rollups.get(trade)
      if (!rollup) continue
      if (rollup.areaGroups.includes(area.areaGroup)) {
        rollup.evidence = uniqEvidence([...rollup.evidence, ...(area.evidence || [])], 6)
      }
    }
  }

  return Array.from(rollups.values())
    .map((rollup) => {
      const quantityNarration = uniqStrings(rollup.directQuantities, 8)
      const supportNarration = uniqStrings(rollup.reinforcedSupport, 8)
      const confirmationNotes = uniqStrings([...rollup.confirmationNotes, ...args.crossSheetConflictSignals], 8)
      const phaseTypes = uniqStrings(rollup.phaseTypes, 8) as TradeScopeRollup["phaseTypes"]
      const areaGroups = uniqStrings(rollup.areaGroups, 8)
      const role: PlanExplanationReadback["tradeScopeReadback"][number]["role"] =
        rollup.supportLevel === "direct"
          ? "likely primary"
          : rollup.supportLevel === "reinforced"
            ? "supporting"
            : "review only"
      const supportLabel =
        rollup.supportLevel === "direct"
          ? "direct quantity-backed"
          : rollup.supportLevel === "reinforced"
            ? "reinforced"
            : "review-only"
      return {
        trade: rollup.trade,
        role,
        supportLevel: rollup.supportLevel,
        phaseTypes,
        areaGroups,
        narration: `${rollup.trade} reads as ${role} ${supportLabel} support${areaGroups.length ? ` around ${areaGroups.join(", ")}` : ""}${phaseTypes.length ? ` with ${describePhaseTypes(phaseTypes)} scope character` : ""}.`,
        quantityNarration,
        supportNarration,
        confirmationNotes,
        evidence: uniqEvidence(rollup.evidence, 6),
      }
    })
    .filter(
      (item) =>
        item.quantityNarration.length > 0 ||
        item.supportNarration.length > 0 ||
        item.confirmationNotes.length > 0 ||
        item.evidence.length > 0
    )
    .slice(0, 10)
}

type GroupedScopeRollup = {
  groupKey: PlanExplanationReadback["groupedScopeReadback"][number]["groupKey"]
  title: string
  trades: PlanTradeFinding["trade"][]
  areaGroups: string[]
  scopeCharacter: PlanExplanationReadback["groupedScopeReadback"][number]["scopeCharacter"]
  directSupport: string[]
  reinforcedSupport: string[]
  confirmationNotes: string[]
  evidence: PlanEvidenceRef[]
  supportLevel: PlanReadbackSupportLevel
}

function classifyGroupedScope(
  trade: PlanExplanationReadback["tradeScopeReadback"][number]
): Pick<GroupedScopeRollup, "groupKey" | "title"> {
  const text = [
    trade.trade,
    ...trade.phaseTypes,
    ...trade.areaGroups,
    trade.narration,
    ...trade.confirmationNotes,
  ].join(" ")

  if (/\bdemo_removal\b|\bdemo\b|\bremoval\b/i.test(text)) {
    return { groupKey: "demo_removal", title: "Demo / Removal Scope" }
  }
  if (
    /\b(painting|wallcovering|flooring)\b/i.test(text) &&
    !/\bbathrooms? \/ wet areas\b|\bbath\b|\bshower\b|\bplumbing\b|\btile\b/i.test(text)
  ) {
    return { groupKey: "guest_room_finish", title: "Guest Room / Finish Refresh Scope" }
  }
  if (/\bceiling_fixture\b|\bceiling \/ fixture zones\b|\belectrical\b|\blight\b|\bdevice\b/i.test(text)) {
    return { groupKey: "ceiling_fixture", title: "Ceiling / Light / Fixture Scope" }
  }
  if (/\bcorridor_common\b|\bcorridors?\b|\bcommon areas?\b/i.test(text)) {
    return { groupKey: "corridor_common", title: "Corridor / Common-Area Scope" }
  }
  if (/\bwet_area\b|\bbathrooms? \/ wet areas\b|\bshower\b|\bplumbing\b|\btile\b/i.test(text)) {
    return { groupKey: "wet_area", title: "Wet-Area / Bathroom Scope" }
  }
  if (/\bguest_room\b|\bguest rooms?\b|\bfinish_refresh\b|\bpainting\b|\bwallcovering\b|\bflooring\b/i.test(text)) {
    return { groupKey: "guest_room_finish", title: "Guest Room / Finish Refresh Scope" }
  }
  return { groupKey: "general_scope", title: "General / Mixed Scope" }
}

function getOrCreateGroupedScope(
  rollups: Map<string, GroupedScopeRollup>,
  group: Pick<GroupedScopeRollup, "groupKey" | "title">
): GroupedScopeRollup {
  const existing = rollups.get(group.groupKey)
  if (existing) return existing
  const created: GroupedScopeRollup = {
    groupKey: group.groupKey,
    title: group.title,
    trades: [],
    areaGroups: [],
    scopeCharacter: [],
    directSupport: [],
    reinforcedSupport: [],
    confirmationNotes: [],
    evidence: [],
    supportLevel: "review",
  }
  rollups.set(group.groupKey, created)
  return created
}

function groupedScopeForAreaGroup(areaGroup: string): Pick<GroupedScopeRollup, "groupKey" | "title"> {
  if (/guest rooms?/i.test(areaGroup)) {
    return { groupKey: "guest_room_finish", title: "Guest Room / Finish Refresh Scope" }
  }
  if (/bathrooms? \/ wet areas|wet areas?/i.test(areaGroup)) {
    return { groupKey: "wet_area", title: "Wet-Area / Bathroom Scope" }
  }
  if (/corridors?|common areas?/i.test(areaGroup)) {
    return { groupKey: "corridor_common", title: "Corridor / Common-Area Scope" }
  }
  if (/ceiling \/ fixture zones/i.test(areaGroup)) {
    return { groupKey: "ceiling_fixture", title: "Ceiling / Light / Fixture Scope" }
  }
  if (/demo \/ removal zones/i.test(areaGroup)) {
    return { groupKey: "demo_removal", title: "Demo / Removal Scope" }
  }
  return { groupKey: "general_scope", title: "General / Mixed Scope" }
}

function buildGroupedScopeReadback(args: {
  tradeScopeReadback: PlanExplanationReadback["tradeScopeReadback"]
  areaQuantityReadback: PlanExplanationReadback["areaQuantityReadback"]
  crossSheetLinkSignals: string[]
  scheduleReconciliationSignals: string[]
  repeatedSpaceSignals: string[]
  prototypeSignals: string[]
  crossSheetConflictSignals: string[]
}): PlanExplanationReadback["groupedScopeReadback"] {
  const rollups = new Map<string, GroupedScopeRollup>()

  for (const trade of args.tradeScopeReadback) {
    const targetGroups = trade.areaGroups.length
      ? trade.areaGroups.map(groupedScopeForAreaGroup)
      : [classifyGroupedScope(trade)]
    for (const group of targetGroups) {
      const rollup = getOrCreateGroupedScope(rollups, group)
      rollup.trades.push(trade.trade)
      rollup.areaGroups.push(...trade.areaGroups.filter((area) => groupedScopeForAreaGroup(area).groupKey === group.groupKey))
      rollup.scopeCharacter.push(...trade.phaseTypes)
      rollup.reinforcedSupport.push(...trade.supportNarration)
      rollup.confirmationNotes.push(...trade.confirmationNotes)
      rollup.evidence = uniqEvidence([...rollup.evidence, ...(trade.evidence || [])], 8)
      if (trade.supportLevel === "direct") {
        rollup.supportLevel = "direct"
      } else if (trade.supportLevel === "reinforced" && rollup.supportLevel !== "direct") {
        rollup.supportLevel = "reinforced"
      }
    }
  }

  for (const area of args.areaQuantityReadback) {
    const group =
      area.areaType === "guest_room"
        ? { groupKey: "guest_room_finish" as const, title: "Guest Room / Finish Refresh Scope" }
        : area.areaType === "bathroom_wet_area"
          ? { groupKey: "wet_area" as const, title: "Wet-Area / Bathroom Scope" }
          : area.areaType === "corridor" || area.areaType === "common_area"
            ? { groupKey: "corridor_common" as const, title: "Corridor / Common-Area Scope" }
            : area.areaType === "ceiling_fixture_zone"
              ? { groupKey: "ceiling_fixture" as const, title: "Ceiling / Light / Fixture Scope" }
              : area.areaType === "demo_removal_zone"
                ? { groupKey: "demo_removal" as const, title: "Demo / Removal Scope" }
                : { groupKey: "general_scope" as const, title: "General / Mixed Scope" }
    const rollup = getOrCreateGroupedScope(rollups, group)
    rollup.areaGroups.push(area.areaGroup)
    rollup.directSupport.push(...(area.supportLevel === "direct" ? area.quantityNarration : []))
    rollup.reinforcedSupport.push(...(area.supportLevel !== "direct" ? area.quantityNarration : []))
    rollup.confirmationNotes.push(...area.scopeNotes)
    rollup.evidence = uniqEvidence([...rollup.evidence, ...(area.evidence || [])], 8)
    if (area.supportLevel === "direct") {
      rollup.supportLevel = "direct"
    } else if (area.supportLevel === "reinforced" && rollup.supportLevel !== "direct") {
      rollup.supportLevel = "reinforced"
    }
  }

  const reinforceGroup = (pattern: RegExp, group: Pick<GroupedScopeRollup, "groupKey" | "title">, text: string) => {
    if (!pattern.test(text)) return
    const rollup = getOrCreateGroupedScope(rollups, group)
    rollup.reinforcedSupport.push(text)
    if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
  }

  for (const signal of [...args.crossSheetLinkSignals, ...args.scheduleReconciliationSignals]) {
    reinforceGroup(/finish|paint|wallcover|floor/i, { groupKey: "guest_room_finish", title: "Guest Room / Finish Refresh Scope" }, signal)
    reinforceGroup(/wet[-\s]?area|bath|fixture|plumbing|tile/i, { groupKey: "wet_area", title: "Wet-Area / Bathroom Scope" }, signal)
    reinforceGroup(/ceiling|electrical|light|fixture/i, { groupKey: "ceiling_fixture", title: "Ceiling / Light / Fixture Scope" }, signal)
    reinforceGroup(/corridor|common/i, { groupKey: "corridor_common", title: "Corridor / Common-Area Scope" }, signal)
    reinforceGroup(/demo|removal/i, { groupKey: "demo_removal", title: "Demo / Removal Scope" }, signal)
  }

  if (args.repeatedSpaceSignals.length > 0 || args.prototypeSignals.length > 0) {
    const rollup = getOrCreateGroupedScope(rollups, {
      groupKey: "guest_room_finish",
      title: "Guest Room / Finish Refresh Scope",
    })
    rollup.reinforcedSupport.push("Repeated guest room / prototype behavior supports scale-oriented grouping, not measured totals.")
    rollup.confirmationNotes.push("Confirm repeat counts before treating this grouped scope as measured room totals.")
    if (rollup.supportLevel !== "direct") rollup.supportLevel = "reinforced"
  }

  for (const conflict of args.crossSheetConflictSignals) {
    const group = /demo|removal/i.test(conflict)
      ? { groupKey: "demo_removal" as const, title: "Demo / Removal Scope" }
      : /wet|bath|fixture|tile/i.test(conflict)
        ? { groupKey: "wet_area" as const, title: "Wet-Area / Bathroom Scope" }
        : { groupKey: "general_scope" as const, title: "General / Mixed Scope" }
    getOrCreateGroupedScope(rollups, group).confirmationNotes.push(conflict)
  }

  const order: PlanExplanationReadback["groupedScopeReadback"][number]["groupKey"][] = [
    "guest_room_finish",
    "wet_area",
    "corridor_common",
    "ceiling_fixture",
    "demo_removal",
    "general_scope",
  ]

  return Array.from(rollups.values())
    .sort((a, b) => order.indexOf(a.groupKey) - order.indexOf(b.groupKey))
    .map((rollup) => {
      const trades = uniqStrings(rollup.trades, 8) as PlanTradeFinding["trade"][]
      const areaGroups = uniqStrings(rollup.areaGroups, 8)
      const scopeCharacter = uniqStrings(rollup.scopeCharacter, 8) as GroupedScopeRollup["scopeCharacter"]
      const directSupport = uniqStrings(rollup.directSupport, 8)
      const reinforcedSupport = uniqStrings(rollup.reinforcedSupport, 8)
      const confirmationNotes = uniqStrings(rollup.confirmationNotes, 8)
      const role: PlanExplanationReadback["groupedScopeReadback"][number]["role"] =
        rollup.supportLevel === "direct"
          ? "primary"
          : rollup.supportLevel === "reinforced"
            ? "supporting"
            : "review only"
      return {
        groupKey: rollup.groupKey,
        title: rollup.title,
        role,
        supportLevel: rollup.supportLevel,
        scopeCharacter,
        trades,
        areaGroups,
        narration: `${rollup.title} reads as ${role} ${rollup.supportLevel} support${trades.length ? ` with ${trades.join(", ")}` : ""}${areaGroups.length ? ` around ${areaGroups.join(", ")}` : ""}.`,
        directSupport,
        reinforcedSupport,
        confirmationNotes,
        evidence: uniqEvidence(rollup.evidence, 8),
      }
    })
    .filter(
      (item) =>
        item.trades.length > 0 ||
        item.directSupport.length > 0 ||
        item.reinforcedSupport.length > 0 ||
        item.confirmationNotes.length > 0
    )
}

function buildPlanExplanationReadback(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  detectedTrades: string[]
  detectedRooms: string[]
  estimatorPackages: PlanEstimatorPackage[]
  crossSheetLinkSignals: string[]
  scheduleReconciliationSignals: string[]
  crossSheetConflictSignals: string[]
  repeatedSpaceSignals: string[]
  prototypeSignals: string[]
  scopeAssist: { missingScopeFlags: string[]; suggestedAdditions: string[]; conflicts: string[] }
}): PlanExplanationReadback {
  const sheetNarration = args.sheetIndex
    .map((sheet) =>
      buildSheetReadback({
        sheet,
        analysis:
          args.analyses.find(
            (analysis) =>
              analysis.uploadId === sheet.uploadId &&
              analysis.sourcePageNumber === sheet.sourcePageNumber &&
              analysis.pageNumber === sheet.pageNumber
          ) ?? null,
      })
    )
    .slice(0, 10)

  const tradeNarration = buildTradeReadback({
    detectedTrades: args.detectedTrades,
    estimatorPackages: args.estimatorPackages,
    analyses: args.analyses,
  }).slice(0, 8)

  const directlySupported = args.analyses
    .flatMap((analysis) => analysis.tradeFindings || [])
    .filter((finding) => typeof finding.quantity === "number" && finding.quantity > 0)
    .map((finding) => {
      const quantity = formatFindingQuantity(finding)
      return {
        text: `${finding.trade}: ${finding.label}${quantity ? ` (${quantity})` : ""} is directly supported by selected sheet evidence.`,
        supportLevel: "direct" as const,
        evidence: uniqEvidence(finding.evidence || [], 4),
      }
    })
    .slice(0, 8)

  const scheduleBacked = args.analyses
    .flatMap((analysis) => analysis.schedules || [])
    .map((schedule) => ({
      text:
        typeof schedule.quantity === "number" && schedule.quantity > 0
          ? `${schedule.label} is schedule-backed with ${schedule.quantity.toLocaleString()} item(s); confirm applicability before treating it as a full takeoff.`
          : `${schedule.label} is schedule-backed support, not a counted total by itself.`,
      supportLevel: "reinforced" as const,
      evidence: uniqEvidence(schedule.evidence || [], 4),
    }))

  const reinforcedByCrossSheet = [
    ...args.crossSheetLinkSignals,
    ...args.scheduleReconciliationSignals,
    ...args.repeatedSpaceSignals,
    ...args.prototypeSignals,
  ]
    .map((text) => ({
      text,
      supportLevel: "reinforced" as const,
      evidence: [] as PlanEvidenceRef[],
    }))
    .concat(scheduleBacked)
    .slice(0, 10)

  const packageReadback = args.estimatorPackages.slice(0, 8).map((pkg) => {
    const supportLevel = getPackageReadbackSupport(pkg.supportType)
    const scopeText =
      pkg.supportType === "elevation_only"
        ? "Elevation-only evidence is narrow and should stay limited to the shown wall/wet-area surfaces."
        : pkg.supportType === "demo_only"
          ? "Demo/removal support stays separate from install authority."
          : pkg.supportType === "scaled_prototype"
            ? "Prototype support can guide repeated-room scaling, not measured totals."
            : pkg.supportType === "schedule_backed"
              ? "Schedule support reinforces the package but should not be treated as a complete counted takeoff unless quantities are explicit."
              : pkg.supportType === "quantity_backed"
                ? "Selected sheets provide direct quantity support for this package."
                : "This is support context that still needs estimator review."

    return {
      key: pkg.key,
      title: pkg.title,
      narration: `${pkg.title}: ${pkg.primaryTrade} ${pkg.supportType.replace(/_/g, " ")} ${pkg.scopeBreadth} package${pkg.roomGroup ? ` around ${pkg.roomGroup}` : ""}. ${scopeText}`,
      supportLevel,
      evidence: uniqEvidence(pkg.evidence || [], 5),
    }
  })

  const elevationFindings = args.analyses.flatMap((analysis) =>
    (analysis.tradeFindings || []).filter((finding) => finding.category === "selected_elevation_area")
  )
  if (
    elevationFindings.length > 0 &&
    !packageReadback.some((item) => /Elevation-only evidence is narrow/i.test(item.narration))
  ) {
    packageReadback.push({
      key: "elevation-only-readback",
      title: "Elevation-only scope readback",
      narration: "Elevation-only evidence is narrow and should stay limited to the shown wall/wet-area surfaces.",
      supportLevel: "review",
      evidence: uniqEvidence(collectTradeEvidence(elevationFindings), 5),
    })
  }

  const hasDemoSheet = args.sheetIndex.some((sheet) =>
    /\bdemo(?:lition)?\b|\bremoval\b/i.test(`${sheet.sheetNumber || ""} ${sheet.sheetTitle || ""} ${sheet.pageLabel || ""}`)
  )
  const demoFindings = args.analyses.flatMap((analysis) =>
    (analysis.tradeFindings || []).filter(
      (finding) =>
        finding.category === "demolition_area" ||
        /\bdemo(?:lition)?\b|\bremoval\b/i.test([finding.label, ...(finding.notes || [])].join(" "))
    )
  )
  if (
    (hasDemoSheet || demoFindings.length > 0) &&
    !packageReadback.some((item) => /Demo\/removal support stays separate from install authority/i.test(item.narration))
  ) {
    packageReadback.push({
      key: "demo-removal-readback",
      title: "Demo / removal readback",
      narration: "Demo/removal support stays separate from install authority.",
      supportLevel: "review",
      evidence: uniqEvidence(collectTradeEvidence(demoFindings), 5),
    })
  }

  const needsConfirmation = uniqStrings(
    [
      ...args.scopeAssist.missingScopeFlags,
      ...args.scopeAssist.suggestedAdditions,
      ...args.scopeAssist.conflicts,
      ...args.crossSheetConflictSignals,
      ...args.estimatorPackages.flatMap((pkg) => pkg.cautionNotes || []),
      hasDemoSheet || demoFindings.length > 0
        ? "Removal/demo support does not create install authority by itself."
        : "",
    ],
    10
  ).map((text) => ({
    text,
    supportLevel: "review" as const,
    evidence: [] as PlanEvidenceRef[],
  }))

  const areaNarration = uniqStrings(
    [
      ...args.detectedRooms.map((room) => `${room} appears in the selected sheet set.`),
      ...args.estimatorPackages
        .map((pkg) =>
          pkg.roomGroup
            ? `${pkg.roomGroup} is carried as a ${pkg.supportType.replace(/_/g, " ")} ${pkg.scopeBreadth} area/package.`
            : ""
        )
        .filter(Boolean),
    ],
    10
  )
  const areaQuantityReadback = buildAreaQuantityReadback({
    sheetIndex: args.sheetIndex,
    analyses: args.analyses,
    estimatorPackages: args.estimatorPackages,
    detectedRooms: args.detectedRooms,
    repeatedSpaceSignals: args.repeatedSpaceSignals,
    prototypeSignals: args.prototypeSignals,
  })
  const tradeScopeReadback = buildTradeScopeReadback({
    analyses: args.analyses,
    detectedTrades: args.detectedTrades,
    estimatorPackages: args.estimatorPackages,
    areaQuantityReadback,
    repeatedSpaceSignals: args.repeatedSpaceSignals,
    prototypeSignals: args.prototypeSignals,
    crossSheetConflictSignals: args.crossSheetConflictSignals,
  })
  const groupedScopeReadback = buildGroupedScopeReadback({
    tradeScopeReadback,
    areaQuantityReadback,
    crossSheetLinkSignals: args.crossSheetLinkSignals,
    scheduleReconciliationSignals: args.scheduleReconciliationSignals,
    repeatedSpaceSignals: args.repeatedSpaceSignals,
    prototypeSignals: args.prototypeSignals,
    crossSheetConflictSignals: args.crossSheetConflictSignals,
  })

  const sheetTypes = uniqStrings(
    sheetNarration.map((sheet) => sheet.sheetTitle || sheet.discipline).filter(Boolean),
    5
  )
  const trades = args.detectedTrades.length ? args.detectedTrades.join(", ") : "limited trade"
  const headline = `Selected sheets appear to show ${sheetTypes.length ? sheetTypes.join(", ") : "plan"} support for ${trades} scope${args.detectedRooms.length ? ` around ${args.detectedRooms.slice(0, 3).join(", ")}` : ""}.`

  return {
    headline,
    sheetNarration,
    tradeNarration,
    tradeScopeReadback,
    groupedScopeReadback,
    areaNarration,
    areaQuantityReadback,
    directlySupported,
    reinforcedByCrossSheet,
    needsConfirmation,
    packageReadback,
  }
}

export function buildMergedPlanIntelligence(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  scopeText: string
  trade: string
}): Omit<PlanIntelligence, "ok" | "uploadsCount" | "pagesCount"> {
  const normalizedAnalyses = args.analyses.map(normalizeAnalysisTradeFindings)
  const detectedSheets = uniqStrings(args.sheetIndex.map(formatSheetLabel), 24)
  const detectedRooms = uniqStrings(
    normalizedAnalyses.flatMap((analysis) => (analysis.rooms || []).map((room) => room.roomName)),
    24
  )
  const detectedTrades = uniqStrings(
    normalizedAnalyses.flatMap((analysis) =>
      (analysis.tradeFindings || []).map((finding) => finding.trade)
    ),
    12
  )

  const takeoff = buildTakeoff(normalizedAnalyses)
  const likelyRoomTypes = detectLikelyRoomTypes({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    detectedRooms,
  })
  const sheetRoleSignals = classifySheetRoles({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
  })
  const repeatedSpaceSignals = buildRepeatedSpaceSignals({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    likelyRoomTypes,
  })
  const tradePackageSignals = buildTradePackageSignals({
    analyses: normalizedAnalyses,
    detectedTrades,
    likelyRoomTypes,
  })
  const scalableScopeSignals = buildScalableScopeSignals({
    repeatedSpaceSignals,
    likelyRoomTypes,
    tradePackageSignals,
    analyses: normalizedAnalyses,
  })
  const scopeAssist = buildScopeAssist({
    analyses: normalizedAnalyses,
    scopeText: args.scopeText,
    trade: args.trade,
    detectedTrades,
    detectedRooms,
  })
  const bidAssistNotes = buildBidAssistNotes({
    repeatedSpaceSignals,
    likelyRoomTypes,
    scalableScopeSignals,
    tradePackageSignals,
    scopeAssist,
  })
  const prototypeSignals = buildPrototypeSignals({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    likelyRoomTypes,
    repeatedSpaceSignals,
    sheetRoleSignals,
  })
  const repeatScalingSignals = buildRepeatScalingSignals({
    sheetRoleSignals,
    prototypeSignals,
    repeatedSpaceSignals,
    scalableScopeSignals,
    likelyRoomTypes,
    tradePackageSignals,
  })
  const packageGroupingSignals = buildPackageGroupingSignals({
    sheetRoleSignals,
    likelyRoomTypes,
    tradePackageSignals,
    prototypeSignals,
  })
  const bidStrategyNotes = buildBidStrategyNotes({
    sheetRoleSignals,
    prototypeSignals,
    repeatScalingSignals,
    packageGroupingSignals,
    bidAssistNotes,
  })
  const highValueSheetSignals = buildHighValueSheetSignals({
    sheetRoleSignals,
    prototypeSignals,
    packageGroupingSignals,
    repeatScalingSignals,
  })
  const pricingAnchorSignals = buildPricingAnchorSignals({
    sheetRoleSignals,
    prototypeSignals,
    repeatedSpaceSignals,
    tradePackageSignals,
    packageGroupingSignals,
  })
  const crossSheetLinkSignals = buildCrossSheetLinkSignals({
    analyses: normalizedAnalyses,
    sheetRoleSignals,
    detectedTrades,
    likelyRoomTypes,
    repeatedSpaceSignals,
  })
  const scheduleReconciliationSignals = buildScheduleReconciliationSignals({
    analyses: normalizedAnalyses,
    sheetRoleSignals,
    detectedTrades,
  })
  const crossSheetConflictSignals = buildCrossSheetConflictSignals({
    analyses: normalizedAnalyses,
    sheetRoleSignals,
  })
  const bidCoverageGaps = buildBidCoverageGaps({
    sheetRoleSignals,
    prototypeSignals,
    repeatScalingSignals,
    repeatedSpaceSignals,
    tradePackageSignals,
    scalableScopeSignals,
    likelyRoomTypes,
    takeoff,
  })
  const estimatingPrioritySignals = buildEstimatingPrioritySignals({
    highValueSheetSignals,
    pricingAnchorSignals,
    bidCoverageGaps,
  })
  const bidExecutionNotes = buildBidExecutionNotes({
    pricingAnchorSignals,
    bidCoverageGaps,
    estimatingPrioritySignals,
    bidStrategyNotes,
    prototypeSignals,
  })
  const pricingPackageSignals = buildPricingPackageSignals({
    likelyRoomTypes,
    sheetRoleSignals,
    tradePackageSignals,
    packageGroupingSignals,
    repeatedSpaceSignals,
  })
  const prototypePackageSignals = buildPrototypePackageSignals({
    prototypeSignals,
    pricingPackageSignals,
    sheetRoleSignals,
  })
  const packageScopeCandidates = buildPackageScopeCandidates({
    pricingPackageSignals,
    tradePackageSignals,
    packageGroupingSignals,
  })
  const packageScalingGuidance = buildPackageScalingGuidance({
    prototypePackageSignals,
    repeatScalingSignals,
    packageScopeCandidates,
    bidCoverageGaps,
    takeoff,
  })
  const packageConfidenceNotes = buildPackageConfidenceNotes({
    pricingPackageSignals,
    prototypePackageSignals,
    bidCoverageGaps,
    pricingAnchorSignals,
  })
  const estimatingFrameworkNotes = buildEstimatingFrameworkNotes({
    packageScopeCandidates,
    packageScalingGuidance,
    packageConfidenceNotes,
    bidExecutionNotes,
  })
  const estimateStructureSignals = buildEstimateStructureSignals({
    packageScopeCandidates,
    prototypePackageSignals,
    pricingAnchorSignals,
    pricingPackageSignals,
  })
  const estimatePackageCandidates = buildEstimatePackageCandidates({
    packageScopeCandidates,
    pricingPackageSignals,
    packageConfidenceNotes,
  })
  const packageTradeScopeSignals = buildPackageTradeScopeSignals({
    estimatePackageCandidates,
    tradePackageSignals,
    detectedTrades,
    sheetRoleSignals,
  })
  const packagePricingBasisSignals = buildPackagePricingBasisSignals({
    estimatePackageCandidates,
    prototypePackageSignals,
    packageScalingGuidance,
    takeoff,
    sheetRoleSignals,
  })
  const packageAllowanceSignals = buildPackageAllowanceSignals({
    estimatePackageCandidates,
    sheetRoleSignals,
    bidCoverageGaps,
    packageConfidenceNotes,
  })
  const estimateAssemblyGuidance = buildEstimateAssemblyGuidance({
    estimatePackageCandidates,
    packagePricingBasisSignals,
    packageAllowanceSignals,
    estimatingPrioritySignals,
  })
  const estimateScaffoldNotes = buildEstimateScaffoldNotes({
    estimateStructureSignals,
    estimatePackageCandidates,
    packageTradeScopeSignals,
    estimateAssemblyGuidance,
    estimatingFrameworkNotes,
  })
  const estimatorPackages = buildEstimatorPackages({
    analyses: normalizedAnalyses,
    likelyRoomTypes,
    repeatedSpaceSignals,
    prototypeSignals,
    packageGroupingSignals,
    tradePackageSignals,
    scheduleReconciliationSignals,
    crossSheetConflictSignals,
  })
  const planSetSynthesisNotes = buildPlanSetSynthesisNotes({
    crossSheetLinkSignals,
    scheduleReconciliationSignals,
    crossSheetConflictSignals,
    pricingAnchorSignals,
  })
  const evidence = buildEvidenceBundle(normalizedAnalyses)
  const notes = buildNotes({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    sheetRoleSignals,
    prototypeSignals,
    repeatScalingSignals,
    packageGroupingSignals,
    bidStrategyNotes,
    highValueSheetSignals,
    pricingAnchorSignals,
    bidCoverageGaps,
    estimatingPrioritySignals,
    bidExecutionNotes,
    pricingPackageSignals,
    prototypePackageSignals,
    packageScopeCandidates,
    packageScalingGuidance,
    packageConfidenceNotes,
    estimatingFrameworkNotes,
    estimateStructureSignals,
    estimatePackageCandidates,
    packageTradeScopeSignals,
    packagePricingBasisSignals,
    packageAllowanceSignals,
    estimateAssemblyGuidance,
    estimateScaffoldNotes,
    estimatorPackages,
    crossSheetLinkSignals,
    scheduleReconciliationSignals,
    crossSheetConflictSignals,
    planSetSynthesisNotes,
    repeatedSpaceSignals,
    likelyRoomTypes,
    scalableScopeSignals,
    tradePackageSignals,
    bidAssistNotes,
    scopeAssist,
  })
  const summary = buildSummary({
    sheetIndex: args.sheetIndex,
    detectedTrades,
    detectedRooms,
    takeoff,
    analyses: normalizedAnalyses,
    sheetRoleSignals,
    prototypeSignals,
    repeatScalingSignals,
    packageGroupingSignals,
    bidStrategyNotes,
    highValueSheetSignals,
    pricingAnchorSignals,
    bidCoverageGaps,
    estimatingPrioritySignals,
    bidExecutionNotes,
    pricingPackageSignals,
    prototypePackageSignals,
    packageScopeCandidates,
    packageScalingGuidance,
    packageConfidenceNotes,
    estimatingFrameworkNotes,
    estimateStructureSignals,
    estimatePackageCandidates,
    packageTradeScopeSignals,
    packagePricingBasisSignals,
    packageAllowanceSignals,
    estimateAssemblyGuidance,
    estimateScaffoldNotes,
    estimatorPackages,
    crossSheetLinkSignals,
    scheduleReconciliationSignals,
    crossSheetConflictSignals,
    planSetSynthesisNotes,
    repeatedSpaceSignals,
    likelyRoomTypes,
    scalableScopeSignals,
    tradePackageSignals,
    bidAssistNotes,
    scopeAssist,
  })
  const confidenceScore = buildConfidenceScore({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    evidence,
    detectedTrades,
    detectedRooms,
  })
  const planReadback = buildPlanExplanationReadback({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    detectedTrades,
    detectedRooms,
    estimatorPackages,
    crossSheetLinkSignals,
    scheduleReconciliationSignals,
    crossSheetConflictSignals,
    repeatedSpaceSignals,
    prototypeSignals,
    scopeAssist,
  })

  return {
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    takeoff,
    scopeAssist,
    evidence,
    detectedTrades,
    detectedRooms,
    sheetRoleSignals,
    prototypeSignals,
    repeatScalingSignals,
    packageGroupingSignals,
    bidStrategyNotes,
    highValueSheetSignals,
    pricingAnchorSignals,
    bidCoverageGaps,
    estimatingPrioritySignals,
    bidExecutionNotes,
    pricingPackageSignals,
    prototypePackageSignals,
    packageScopeCandidates,
    packageScalingGuidance,
    packageConfidenceNotes,
    estimatingFrameworkNotes,
    estimateStructureSignals,
    estimatePackageCandidates,
    packageTradeScopeSignals,
    packagePricingBasisSignals,
    packageAllowanceSignals,
    estimateAssemblyGuidance,
    estimateScaffoldNotes,
    estimatorPackages,
    crossSheetLinkSignals,
    scheduleReconciliationSignals,
    crossSheetConflictSignals,
    planSetSynthesisNotes,
    repeatedSpaceSignals,
    likelyRoomTypes,
    scalableScopeSignals,
    tradePackageSignals,
    bidAssistNotes,
    planReadback,
    detectedSheets,
    notes,
    summary,
    confidenceScore,
  }
}
