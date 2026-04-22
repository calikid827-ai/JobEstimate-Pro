import type {
  PlanEvidenceBundle,
  PlanEvidenceRef,
  PlanIntelligence,
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
  if (args.scalableScopeSignals.length > 0) {
    parts.push(args.scalableScopeSignals[0])
  }
  if (args.prototypeSignals.length > 0) {
    parts.push(args.prototypeSignals[0])
  }
  if (args.packageGroupingSignals.length > 0) {
    parts.push(args.packageGroupingSignals[0])
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
    repeatedSpaceSignals,
    likelyRoomTypes,
    scalableScopeSignals,
    tradePackageSignals,
    bidAssistNotes,
    detectedSheets,
    notes,
    summary,
    confidenceScore,
  }
}
