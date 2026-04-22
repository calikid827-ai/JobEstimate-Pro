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
    !/\bfixture|plumbing|electrical/.test(scopeText)
  ) {
    suggestedAdditions.push("Confirm fixture-related work shown in plans.")
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
    suggestedAdditions: uniqStrings(suggestedAdditions, 8),
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
  const notes = uniqStrings(
    [
      ...args.analyses.flatMap((analysis) => analysis.notes || []),
      ...args.scopeAssist.missingScopeFlags,
      ...args.scopeAssist.suggestedAdditions,
      ...args.scopeAssist.conflicts,
    ],
    16
  )

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
  const detectedSheets = uniqStrings(args.sheetIndex.map(formatSheetLabel), 24)
  const detectedRooms = uniqStrings(
    args.analyses.flatMap((analysis) => (analysis.rooms || []).map((room) => room.roomName)),
    24
  )
  const detectedTrades = uniqStrings(
    args.analyses.flatMap((analysis) =>
      (analysis.tradeFindings || []).map((finding) => finding.trade)
    ),
    12
  )

  const takeoff = buildTakeoff(args.analyses)
  const scopeAssist = buildScopeAssist({
    analyses: args.analyses,
    scopeText: args.scopeText,
    trade: args.trade,
    detectedTrades,
    detectedRooms,
  })
  const evidence = buildEvidenceBundle(args.analyses)
  const notes = buildNotes({
    sheetIndex: args.sheetIndex,
    analyses: args.analyses,
    scopeAssist,
  })
  const summary = buildSummary({
    sheetIndex: args.sheetIndex,
    detectedTrades,
    detectedRooms,
    takeoff,
    scopeAssist,
  })
  const confidenceScore = buildConfidenceScore({
    sheetIndex: args.sheetIndex,
    analyses: args.analyses,
    evidence,
    detectedTrades,
    detectedRooms,
  })

  return {
    sheetIndex: args.sheetIndex,
    analyses: args.analyses,
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
