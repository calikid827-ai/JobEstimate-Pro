import type {
  PlanExtractedTable,
  PlanRoomFinishMatrix,
  PlanRoomFinishMatrixRow,
} from "./types"

type ColumnMap = {
  roomIndex: number | null
  roomNumberIndex: number | null
  wallIndex: number | null
  baseIndex: number | null
  ceilingIndex: number | null
  floorIndex: number | null
  notesIndex: number | null
}

function normalizeHeader(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cellAt(cells: string[], index: number | null): string | null {
  if (index == null || index < 0 || index >= cells.length) return null
  const value = String(cells[index] || "").trim()
  return value || null
}

function findColumn(columns: string[], patterns: RegExp[]): number | null {
  const index = columns.findIndex((column) => {
    const normalized = normalizeHeader(column)
    return patterns.some((pattern) => pattern.test(normalized))
  })

  return index >= 0 ? index : null
}

function buildColumnMap(columns: string[]): ColumnMap {
  const roomNumberIndex = findColumn(columns, [
    /\broom\s*(?:no|number|#)\b/,
    /\brm\s*(?:no|number|#)?\b/,
    /^#$/,
  ])
  const roomIndex = findColumn(columns, [
    /\broom\s*(?:name|area|space)?\b/,
    /\barea\b/,
    /\bspace\b/,
  ])

  return {
    roomIndex,
    roomNumberIndex,
    wallIndex: findColumn(columns, [/\bwall\b/, /\bwall\s*finish\b/, /^w$/]),
    baseIndex: findColumn(columns, [/\bbase\b/, /\bbase\s*finish\b/, /^b$/]),
    ceilingIndex: findColumn(columns, [/\bceiling\b/, /\bclg\b/, /\bceiling\s*finish\b/, /^c$/]),
    floorIndex: findColumn(columns, [/\bfloor\b/, /\bflooring\b/, /\bfloor\s*finish\b/, /^f$/]),
    notesIndex: findColumn(columns, [/\bnotes?\b/, /\bremarks?\b/, /\bcomments?\b/]),
  }
}

function countFinishColumns(map: ColumnMap): number {
  return [
    map.wallIndex,
    map.baseIndex,
    map.ceilingIndex,
    map.floorIndex,
  ].filter((index) => index != null).length
}

function inferRoomNumberAndName(value: string | null): {
  roomName: string | null
  roomNumber: string | null
} {
  const text = String(value || "").trim()
  if (!text) return { roomName: null, roomNumber: null }

  const leadingNumber = text.match(/^([A-Z]?\d{1,5}[A-Z]?)(?:\s+|-)(.+)$/i)
  if (leadingNumber?.[1] && leadingNumber?.[2]) {
    return {
      roomNumber: leadingNumber[1].trim(),
      roomName: leadingNumber[2].trim(),
    }
  }

  return { roomName: text, roomNumber: null }
}

function inferRoomType(roomName: string | null): string | null {
  const text = String(roomName || "").toLowerCase()
  if (!text) return null
  if (/\bbath(?:room)?\b|\btoilet\b|\bwc\b/.test(text)) return "bathroom"
  if (/\bkitchen\b/.test(text)) return "kitchen"
  if (/\bbed(?:room)?\b|\bguest\s*room\b/.test(text)) return "bedroom"
  if (/\bcorridor\b|\bhall(?:way)?\b/.test(text)) return "corridor"
  if (/\blobby\b|\bentry\b|\bvestibule\b/.test(text)) return "public area"
  if (/\boffice\b/.test(text)) return "office"
  if (/\bcloset\b|\bstorage\b/.test(text)) return "support"
  return null
}

function buildMatrixRows(table: PlanExtractedTable, map: ColumnMap): PlanRoomFinishMatrixRow[] {
  return table.rows
    .map((row): PlanRoomFinishMatrixRow | null => {
      const cells = row.cells || []
      if (!cells.length) return null

      const roomCell = cellAt(cells, map.roomIndex)
      const inferredRoom = inferRoomNumberAndName(roomCell)
      const roomNumber = cellAt(cells, map.roomNumberIndex) ?? inferredRoom.roomNumber
      const roomName = inferredRoom.roomName
      const finishes = {
        wallFinish: cellAt(cells, map.wallIndex),
        baseFinish: cellAt(cells, map.baseIndex),
        ceilingFinish: cellAt(cells, map.ceilingIndex),
        floorFinish: cellAt(cells, map.floorIndex),
      }
      const finishValues = Object.values(finishes).filter(Boolean)
      const warnings = [
        ...row.warnings,
        ...(!roomName && !roomNumber ? ["Room name or number was not clear."] : []),
        ...(finishValues.length === 0 ? ["No clear finish values were found in this row."] : []),
      ]
      const confidence =
        row.confidence -
        (!roomName && !roomNumber ? 20 : 0) -
        (finishValues.length === 0 ? 25 : 0) -
        (warnings.length > row.warnings.length ? 5 : 0)

      if (!roomName && !roomNumber && finishValues.length === 0) return null

      return {
        rowIndex: row.rowIndex,
        roomName,
        roomNumber,
        roomType: inferRoomType(roomName),
        finishes,
        notes: cellAt(cells, map.notesIndex),
        rawRowText: row.rawText,
        confidence: Math.max(25, Math.min(90, Math.round(confidence))),
        warnings,
      }
    })
    .filter((row): row is PlanRoomFinishMatrixRow => row !== null)
}

function averageRowConfidence(rows: PlanRoomFinishMatrixRow[], warnings: string[]): number {
  if (!rows.length) return 35
  const rowAverage = rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
  return Math.max(25, Math.min(90, Math.round(rowAverage - warnings.length * 3)))
}

export function extractRoomFinishMatricesFromTables(
  tables: PlanExtractedTable[]
): PlanRoomFinishMatrix[] {
  const matrices: PlanRoomFinishMatrix[] = []

  tables.forEach((table, tableIndex) => {
    if (table.tableType !== "finish_schedule") return

    const map = buildColumnMap(table.columns)
    const finishColumnCount = countFinishColumns(map)
    const hasRoomColumn = map.roomIndex != null || map.roomNumberIndex != null
    const warnings = [
      ...(!hasRoomColumn ? ["Room name or room number column was not clear."] : []),
      ...(finishColumnCount === 0 ? ["No wall, base, ceiling, or floor finish columns were clear."] : []),
      ...(finishColumnCount > 0 && finishColumnCount < 2
        ? ["Only one finish column was clear; estimator review is required."]
        : []),
    ]

    if (!hasRoomColumn || finishColumnCount === 0) {
      return
    }

    const rows = buildMatrixRows(table, map)
    if (!rows.length) return

    matrices.push({
      tableType: "finish_schedule",
      sourceTableIndex: tableIndex,
      rows,
      rawText: table.rawText,
      uploadId: table.uploadId,
      uploadName: table.uploadName,
      pageNumber: table.pageNumber,
      sourcePageNumber: table.sourcePageNumber,
      sheetNumber: table.sheetNumber,
      sheetTitle: table.sheetTitle,
      confidence: averageRowConfidence(rows, warnings),
      extractionMethod: "deterministic",
      warnings,
    })
  })

  return matrices
}
