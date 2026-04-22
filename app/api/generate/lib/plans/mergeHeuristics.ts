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

function buildSummary(args: {
  sheetIndex: PlanSheetIndexEntry[]
  detectedTrades: string[]
  detectedRooms: string[]
  takeoff: PlanTakeoff
  analyses: PlanSheetAnalysis[]
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

  const bathroomLayoutDetails = extractBathroomLayoutDetails(args.analyses)
  const hasBathroomRoom = args.detectedRooms.some((room) => /\bbath(room)?\b/i.test(room))
  if (hasBathroomRoom && bathroomLayoutDetails.length > 0) {
    parts.push(`Bathroom fixture/layout signals: ${bathroomLayoutDetails.join(", ")}.`)
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
  scopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
    conflicts: string[]
  }
}): string[] {
  const baseNotes = [
    ...args.analyses.flatMap((analysis) => analysis.notes || []),
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
  const scopeAssist = buildScopeAssist({
    analyses: normalizedAnalyses,
    scopeText: args.scopeText,
    trade: args.trade,
    detectedTrades,
    detectedRooms,
  })
  const evidence = buildEvidenceBundle(normalizedAnalyses)
  const notes = buildNotes({
    sheetIndex: args.sheetIndex,
    analyses: normalizedAnalyses,
    scopeAssist,
  })
  const summary = buildSummary({
    sheetIndex: args.sheetIndex,
    detectedTrades,
    detectedRooms,
    takeoff,
    analyses: normalizedAnalyses,
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
    detectedSheets,
    notes,
    summary,
    confidenceScore,
  }
}
