import type {
  PlanExtractedTable,
  PlanPageReadStatus,
  PlanRepeatedRoomPackage,
  PlanRoomFinishMatrix,
  PlanSheetIndexEntry,
  PlanTradeQuantityCandidate,
  PlanTradeQuantityCandidateTrade,
  PlanTradeQuantityCandidateUnit,
} from "./types"

type CandidateInput = {
  extractedTables: PlanExtractedTable[]
  roomFinishMatrices: PlanRoomFinishMatrix[]
  repeatedRoomPackages: PlanRepeatedRoomPackage[]
  sheetIndex?: PlanSheetIndexEntry[]
  pageReadStatuses?: PlanPageReadStatus[]
}

type CandidateSourceRef = PlanTradeQuantityCandidate["sourceRefs"][number]

const REVIEW_ONLY_WARNING = "Candidate only - not measured takeoff support."

function normalizeKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function uniqueWarnings(values: string[]): string[] {
  return uniqueStrings(values).slice(0, 12)
}

function clampConfidence(value: number): number {
  return Math.max(25, Math.min(90, Math.round(value)))
}

function average(values: number[]): number {
  if (!values.length) return 50
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function matrixSourceRef(
  matrix: PlanRoomFinishMatrix,
  rowIndex: number
): CandidateSourceRef {
  return {
    pageNumber: matrix.pageNumber,
    sourcePageNumber: matrix.sourcePageNumber,
    sheetNumber: matrix.sheetNumber,
    sheetTitle: matrix.sheetTitle,
    rowIndex,
    sourceTableIndex: matrix.sourceTableIndex,
  }
}

function tableSourceRef(
  table: PlanExtractedTable,
  tableIndex: number,
  rowIndex?: number
): CandidateSourceRef {
  return {
    pageNumber: table.pageNumber,
    sourcePageNumber: table.sourcePageNumber,
    sheetNumber: table.sheetNumber,
    sheetTitle: table.sheetTitle,
    rowIndex,
    sourceTableIndex: tableIndex,
  }
}

function finishText(value: string | null | undefined): string {
  return String(value || "").toLowerCase()
}

function isWallcoveringFinish(value: string | null | undefined): boolean {
  const text = finishText(value)
  return /\b(?:wc|vwc|wallcover(?:ing)?|vinyl wallcovering)\b/.test(text)
}

function isPaintFinish(value: string | null | undefined): boolean {
  const text = finishText(value)
  if (!text || isWallcoveringFinish(text)) return false
  return /\b(?:p|pt|paint|epoxy paint)\b/i.test(text)
}

function buildFinishCandidate(args: {
  matrix: PlanRoomFinishMatrix
  matrixIndex: number
  category: string
  trade: PlanTradeQuantityCandidateTrade
  rows: PlanRoomFinishMatrix["rows"]
  finishKind: "wall" | "base" | "ceiling" | "floor"
  confidencePenalty?: number
}): PlanTradeQuantityCandidate | null {
  if (!args.rows.length) return null

  const sourceRefs = args.rows.map((row) => ({
    ...matrixSourceRef(args.matrix, row.rowIndex),
    sourceMatrixIndex: args.matrixIndex,
  }))
  const rowWarnings = args.rows.flatMap((row) => row.warnings)
  const confidence = clampConfidence(
    average(args.rows.map((row) => row.confidence)) - (args.confidencePenalty ?? 0)
  )

  return {
    candidateKey: normalizeKey(
      `${args.matrix.pageNumber}-${args.matrix.sourceTableIndex}-${args.finishKind}-${args.category}`
    ),
    trade: args.trade,
    category: args.category,
    quantity: args.rows.length,
    unit: "rooms",
    quantityStatus: "needs_measurement",
    confidence,
    sourceType: "finish_matrix",
    sourceRefs,
    assumptions: [
      `${args.rows.length} finish schedule row${args.rows.length === 1 ? "" : "s"} include ${args.finishKind} finish values.`,
      "Room-row counts are review aids only; area or linear measurements are still required.",
    ],
    warnings: uniqueWarnings([
      REVIEW_ONLY_WARNING,
      "Finish row count does not provide measured SF/LF quantity support.",
      ...rowWarnings,
    ]),
    eligibleForPricing: false,
  }
}

function finishMatrixCandidates(matrices: PlanRoomFinishMatrix[]): PlanTradeQuantityCandidate[] {
  const candidates: PlanTradeQuantityCandidate[] = []

  matrices.forEach((matrix, matrixIndex) => {
    const rowsWithWall = matrix.rows.filter((row) => row.finishes.wallFinish)
    const paintRows = rowsWithWall.filter((row) => isPaintFinish(row.finishes.wallFinish))
    const wallcoveringRows = rowsWithWall.filter((row) => isWallcoveringFinish(row.finishes.wallFinish))
    const otherWallRows = rowsWithWall.filter(
      (row) => !isPaintFinish(row.finishes.wallFinish) && !isWallcoveringFinish(row.finishes.wallFinish)
    )
    const baseRows = matrix.rows.filter((row) => row.finishes.baseFinish)
    const ceilingRows = matrix.rows.filter((row) => row.finishes.ceilingFinish)
    const floorRows = matrix.rows.filter((row) => row.finishes.floorFinish)

    const finishCandidates = [
      buildFinishCandidate({
        matrix,
        matrixIndex,
        category: "painting finish rows",
        trade: "painting",
        rows: paintRows.length ? paintRows : otherWallRows,
        finishKind: "wall",
        confidencePenalty: paintRows.length ? 0 : 10,
      }),
      buildFinishCandidate({
        matrix,
        matrixIndex,
        category: "wallcovering finish rows",
        trade: "painting",
        rows: wallcoveringRows,
        finishKind: "wall",
      }),
      buildFinishCandidate({
        matrix,
        matrixIndex,
        category: "baseboard/base finish candidates",
        trade: "carpentry",
        rows: baseRows,
        finishKind: "base",
      }),
      buildFinishCandidate({
        matrix,
        matrixIndex,
        category: "ceiling finish candidates",
        trade: "painting",
        rows: ceilingRows,
        finishKind: "ceiling",
      }),
      buildFinishCandidate({
        matrix,
        matrixIndex,
        category: "flooring finish rows",
        trade: "flooring",
        rows: floorRows,
        finishKind: "floor",
      }),
    ]

    candidates.push(
      ...finishCandidates.filter(
        (candidate): candidate is PlanTradeQuantityCandidate => candidate !== null
      )
    )
  })

  return candidates
}

function findCountColumn(columns: string[]): number | null {
  const index = columns.findIndex((column) =>
    /\b(?:qty|quantity|count|total)\b/i.test(String(column || ""))
  )
  return index >= 0 ? index : null
}

function sumExplicitCountColumn(table: PlanExtractedTable): number | null {
  const countIndex = findCountColumn(table.columns)
  if (countIndex == null) return null

  let foundNumeric = false
  const sum = table.rows.reduce((total, row) => {
    const value = row.cells[countIndex]
    const match = String(value || "").match(/\b(\d+(?:\.\d+)?)\b/)
    if (!match) return total
    foundNumeric = true
    return total + Number(match[1])
  }, 0)

  return foundNumeric ? sum : null
}

function scheduleCandidateMeta(
  table: PlanExtractedTable
): {
  trade: PlanTradeQuantityCandidateTrade
  category: string
  unit: PlanTradeQuantityCandidateUnit
} | null {
  if (table.tableType === "door_schedule") {
    return { trade: "carpentry", category: "door schedule count candidates", unit: "doors" }
  }
  if (table.tableType === "window_schedule") {
    return { trade: "carpentry", category: "window schedule count candidates", unit: "windows" }
  }
  if (table.tableType === "fixture_schedule") {
    return { trade: "plumbing", category: "fixture schedule count candidates", unit: "fixtures" }
  }
  return null
}

function scheduleTableCandidates(tables: PlanExtractedTable[]): PlanTradeQuantityCandidate[] {
  const candidates: PlanTradeQuantityCandidate[] = []

  tables.forEach((table, tableIndex) => {
    const meta = scheduleCandidateMeta(table)
    if (!meta || table.rows.length === 0) return

    const explicitCount = sumExplicitCountColumn(table)
    const quantity = explicitCount ?? table.rows.length
    const sourceRefs = table.rows.map((row) => tableSourceRef(table, tableIndex, row.rowIndex))
    const countAssumption =
      explicitCount == null
        ? `${table.rows.length} schedule row${table.rows.length === 1 ? "" : "s"} counted; no clear quantity/count column was summed.`
        : `Explicit quantity/count column summed to ${quantity}.`

    candidates.push({
      candidateKey: normalizeKey(`${table.pageNumber}-${tableIndex}-${table.tableType}-count`),
      trade: meta.trade,
      category: meta.category,
      quantity,
      unit: meta.unit,
      quantityStatus: "count_only",
      confidence: clampConfidence(table.confidence - table.warnings.length * 3),
      sourceType: "schedule_table",
      sourceRefs,
      assumptions: [
        countAssumption,
        "Schedule counts are review-only candidates until estimator confirms duplicates, alternates, and scope applicability.",
      ],
      warnings: uniqueWarnings([
        REVIEW_ONLY_WARNING,
        "Schedule count candidate is not pricing-eligible in Phase 6.",
        ...table.warnings,
        ...table.rows.flatMap((row) => row.warnings),
      ]),
      eligibleForPricing: false,
    })
  })

  return candidates
}

function repeatedRoomPackageCandidates(
  packages: PlanRepeatedRoomPackage[]
): PlanTradeQuantityCandidate[] {
  return packages.map((pkg) => ({
    candidateKey: normalizeKey(`${pkg.packageKey}-repeat-count`),
    trade: "general",
    category: "repeated room package count candidates",
    quantity: pkg.repeatCount,
    unit: "rooms",
    quantityStatus: "count_only",
    confidence: clampConfidence(pkg.confidence),
    sourceType: "repeated_room_package",
    sourceRefs: pkg.sourceRows.map((row) => ({
      pageNumber: row.pageNumber,
      sourcePageNumber: row.sourcePageNumber,
      sheetNumber: row.sheetNumber,
      sheetTitle: row.sheetTitle,
      rowIndex: row.rowIndex,
      sourceTableIndex: row.sourceTableIndex,
      sourceMatrixIndex: row.sourceMatrixIndex,
    })),
    assumptions: [
      `${pkg.repeatCount} room row${pkg.repeatCount === 1 ? "" : "s"} are represented in this repeated room package.`,
      "Repeated-room count is diagnostic only and is not measured quantity support.",
    ],
    warnings: uniqueWarnings([
      REVIEW_ONLY_WARNING,
      "Repeated room package candidate is not pricing-eligible in Phase 6.",
      ...pkg.warnings,
    ]),
    eligibleForPricing: false,
  }))
}

function classificationCandidateWarnings(args: {
  sheetIndex?: PlanSheetIndexEntry[]
  pageReadStatuses?: PlanPageReadStatus[]
}): string[] {
  const selectedWeakSheets = (args.sheetIndex || []).filter(
    (sheet) =>
      sheet.selectedForAnalysis &&
      (!sheet.classification ||
        sheet.classification.sheetRole === "unknown" ||
        sheet.classification.confidence < 60)
  ).length
  const degradedPages = (args.pageReadStatuses || []).filter(
    (status) =>
      status.selected &&
      (status.failureReasons.length > 0 ||
        (status.textStatus !== "extracted" && status.imageStatus !== "rendered"))
  ).length

  return [
    ...(selectedWeakSheets > 0
      ? [`${selectedWeakSheets} selected sheet classification${selectedWeakSheets === 1 ? "" : "s"} need review.`]
      : []),
    ...(degradedPages > 0
      ? [`${degradedPages} selected page${degradedPages === 1 ? "" : "s"} had degraded read support.`]
      : []),
  ]
}

export function buildTradeQuantityCandidates(
  args: CandidateInput
): PlanTradeQuantityCandidate[] {
  const candidates = [
    ...finishMatrixCandidates(args.roomFinishMatrices),
    ...scheduleTableCandidates(args.extractedTables),
    ...repeatedRoomPackageCandidates(args.repeatedRoomPackages),
  ]
  const sharedDiagnosticWarnings = classificationCandidateWarnings(args)

  return candidates.map((candidate) => ({
    ...candidate,
    warnings: uniqueWarnings([...candidate.warnings, ...sharedDiagnosticWarnings]),
    eligibleForPricing: false,
  }))
}
