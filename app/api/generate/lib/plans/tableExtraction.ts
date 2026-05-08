import type {
  PlanExtractedTable,
  PlanExtractedTableRow,
  PlanExtractedTableType,
  PlanPageImage,
  PlanSheetIndexEntry,
  PlanSheetRole,
} from "./types"

type ExtractPlanTablesArgs = {
  selectedPages: PlanPageImage[]
  sheetIndex: PlanSheetIndexEntry[]
}

const ROLE_TO_TABLE_TYPE: Partial<Record<PlanSheetRole, PlanExtractedTableType>> = {
  finish_schedule: "finish_schedule",
  fixture_schedule: "fixture_schedule",
  door_schedule: "door_schedule",
  window_schedule: "window_schedule",
  legend: "legend",
}

const TABLE_PATTERNS: Array<{
  tableType: PlanExtractedTableType
  patterns: RegExp[]
  label: string
}> = [
  {
    tableType: "finish_schedule",
    patterns: [/\bfinish(?:es)?\s+(?:schedule|matrix)\b/i, /\broom\s+finish(?:es)?\b/i],
    label: "finish schedule",
  },
  {
    tableType: "fixture_schedule",
    patterns: [/\b(?:plumbing\s+)?fixture\s+schedule\b/i, /\bfixture\s+count\b/i],
    label: "fixture schedule",
  },
  {
    tableType: "door_schedule",
    patterns: [/\bdoor\s+schedule\b/i, /\bdoor\s+type\b/i],
    label: "door schedule",
  },
  {
    tableType: "window_schedule",
    patterns: [/\bwindow\s+schedule\b/i, /\bglazing\s+schedule\b/i],
    label: "window schedule",
  },
  {
    tableType: "legend",
    patterns: [/\blegend\b/i, /\babbreviations?\b/i, /\bsymbols?\b/i],
    label: "legend",
  },
]

const GENERIC_TABLE_PATTERNS = [
  /\bschedule\b/i,
  /\bmatrix\b/i,
  /\btable\b/i,
]

const HEADER_HINTS = [
  "room",
  "area",
  "floor",
  "base",
  "wall",
  "ceiling",
  "finish",
  "type",
  "mark",
  "size",
  "material",
  "hardware",
  "count",
  "qty",
  "fixture",
  "door",
  "window",
  "symbol",
  "description",
]

function collapseLine(value: string): string {
  return value.replace(/[ \t]+/g, " ").trim()
}

function normalizeLines(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map(collapseLine)
    .filter(Boolean)
}

function splitCells(line: string): string[] {
  const raw = String(line || "").trim()
  const trimmed = collapseLine(raw)
  if (!trimmed) return []

  const pipeCells = raw.split("|").map(collapseLine).filter(Boolean)
  if (pipeCells.length >= 2) return pipeCells

  const tabCells = raw.split("\t").map(collapseLine).filter(Boolean)
  if (tabCells.length >= 2) return tabCells

  const wideSpaceCells = raw.split(/\s{2,}/).map(collapseLine).filter(Boolean)
  if (wideSpaceCells.length >= 2) return wideSpaceCells

  const commaCells = trimmed.split(",").map(collapseLine).filter(Boolean)
  if (commaCells.length >= 3) return commaCells

  return []
}

function headerScore(cells: string[]): number {
  const normalized = cells.map((cell) => cell.toLowerCase())
  return normalized.filter((cell) =>
    HEADER_HINTS.some((hint) => new RegExp(`\\b${hint}\\b`, "i").test(cell))
  ).length
}

function findHeadingIndex(lines: string[], tableType: PlanExtractedTableType): number {
  const specific = TABLE_PATTERNS.find((entry) => entry.tableType === tableType)
  if (specific) {
    const index = lines.findIndex((line) =>
      specific.patterns.some((pattern) => pattern.test(line))
    )
    if (index >= 0) return index
  }

  return lines.findIndex((line) => GENERIC_TABLE_PATTERNS.some((pattern) => pattern.test(line)))
}

function inferTableType(
  sheet: PlanSheetIndexEntry | null,
  text: string
): { tableType: PlanExtractedTableType; warnings: string[] } | null {
  const classified = sheet?.classification?.sheetRole
  const classifiedType = classified ? ROLE_TO_TABLE_TYPE[classified] : null
  const warnings: string[] = []

  if (classifiedType) return { tableType: classifiedType, warnings }

  for (const entry of TABLE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      warnings.push(`Table type inferred from ${entry.label} text pattern.`)
      return { tableType: entry.tableType, warnings }
    }
  }

  if (GENERIC_TABLE_PATTERNS.some((pattern) => pattern.test(text))) {
    warnings.push("Table or schedule text was detected, but the schedule type is unclear.")
    return { tableType: "unknown", warnings }
  }

  return null
}

function pickHeader(lines: string[], headingIndex: number): {
  columns: string[]
  headerIndex: number | null
  warnings: string[]
} {
  for (let index = headingIndex + 1; index < Math.min(lines.length, headingIndex + 8); index += 1) {
    const cells = splitCells(lines[index])
    if (cells.length >= 2 && headerScore(cells) >= 1) {
      return { columns: cells, headerIndex: index, warnings: [] }
    }
  }

  return {
    columns: [],
    headerIndex: null,
    warnings: ["Columns were not clear; raw row text was preserved for estimator review."],
  }
}

function buildRows(args: {
  lines: string[]
  headingIndex: number
  headerIndex: number | null
  columns: string[]
}): PlanExtractedTableRow[] {
  const startIndex = args.headerIndex == null ? args.headingIndex + 1 : args.headerIndex + 1
  const candidateLines = args.lines.slice(startIndex, Math.min(args.lines.length, startIndex + 24))
  const rows: PlanExtractedTableRow[] = []

  for (const line of candidateLines) {
    if (/^(?:notes?|remarks?)\s*:/i.test(line) && rows.length > 0) break
    if (TABLE_PATTERNS.some((entry) => entry.patterns.some((pattern) => pattern.test(line))) && rows.length > 0) {
      break
    }

    const cells = splitCells(line)
    if (args.columns.length > 0 && cells.length >= 2) {
      rows.push({
        rowIndex: rows.length + 1,
        cells,
        rawText: line,
        confidence: cells.length >= Math.min(args.columns.length, 2) ? 75 : 60,
        warnings:
          cells.length < args.columns.length
            ? ["Row has fewer cells than the detected header."]
            : [],
      })
      continue
    }

    if (args.columns.length === 0 && rows.length < 8 && /\b[A-Z0-9][A-Z0-9.-]{0,8}\b/.test(line)) {
      rows.push({
        rowIndex: rows.length + 1,
        cells: cells.length >= 2 ? cells : [],
        rawText: line,
        confidence: cells.length >= 2 ? 55 : 40,
        warnings: ["Row could not be split into clear columns."],
      })
    }
  }

  return rows
}

function averageConfidence(rows: PlanExtractedTableRow[], columns: string[], warnings: string[]): number {
  if (!rows.length) return columns.length ? 50 : 35

  const rowAverage = rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
  const columnBoost = columns.length >= 2 ? 10 : -10
  const warningPenalty = warnings.length * 5
  return Math.max(25, Math.min(90, Math.round(rowAverage + columnBoost - warningPenalty)))
}

export function extractPlanTablesFromPages(args: ExtractPlanTablesArgs): PlanExtractedTable[] {
  const sheetsByPageNumber = new Map(args.sheetIndex.map((sheet) => [sheet.pageNumber, sheet]))
  const tables: PlanExtractedTable[] = []

  for (const page of args.selectedPages) {
    if (!page.selectedForAnalysis) continue

    const text = String(page.extractedText || "").trim()
    if (!text) continue

    const sheet = sheetsByPageNumber.get(page.pageNumber) ?? null
    const inferred = inferTableType(sheet, text)
    if (!inferred) continue

    const lines = normalizeLines(text)
    if (!lines.length) continue

    const headingIndex = Math.max(0, findHeadingIndex(lines, inferred.tableType))
    const header = pickHeader(lines, headingIndex)
    const rows = buildRows({
      lines,
      headingIndex,
      headerIndex: header.headerIndex,
      columns: header.columns,
    })
    const warnings = [
      ...inferred.warnings,
      ...header.warnings,
      ...(rows.length === 0 ? ["No reliable schedule rows were split from the detected table text."] : []),
      ...(inferred.tableType === "unknown" ? ["Unknown table type; do not use as measured quantity support."] : []),
    ]
    const rawLines = lines.slice(headingIndex, Math.min(lines.length, headingIndex + 28))

    tables.push({
      tableType: inferred.tableType,
      columns: header.columns,
      rows,
      rawText: rawLines.join("\n"),
      uploadId: page.uploadId,
      uploadName: page.uploadName,
      pageNumber: page.pageNumber,
      sourcePageNumber: page.sourcePageNumber,
      sheetNumber: sheet?.sheetNumber ?? null,
      sheetTitle: sheet?.sheetTitle ?? null,
      confidence: averageConfidence(rows, header.columns, warnings),
      extractionMethod: "deterministic",
      warnings,
    })
  }

  return tables
}
