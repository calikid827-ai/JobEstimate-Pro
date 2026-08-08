import type {
  PlanExtractedTable,
  PlanRoomFinishMatrix,
  PlanRoomFinishMatrixRow,
} from "./types"

export type PlanFinishSemanticCategory =
  | "paint_coating"
  | "wallcovering"
  | "acoustical_ceiling"
  | "rubber_base"
  | "vinyl_base"
  | "wood"
  | "tile"
  | "flooring"

export type PlanFinishSemanticStatus =
  | "resolved"
  | "unresolved"
  | "conflicted"
  | "blocked"

export type PlanFinishSurface = "wall" | "ceiling" | "base" | "floor"

export type PlanFinishResolutionMethod =
  | "explicit_schedule_value"
  | "legend_code"
  | null

export type PlanScheduleFinishSource = {
  uploadId: string
  uploadName: string
  pageNumber: number
  sourcePageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  sourceMatrixIndex: number
  sourceTableIndex: number
  rowIndex: number
  sourceColumnIndex: number | null
  sourceColumnLabel: string | null
  surface: PlanFinishSurface
  roomName: string | null
  roomNumber: string | null
  rawFinishValue: string
  rawRowText: string
  confidence: number
  warnings: string[]
}

export type PlanLegendDefinitionSource = {
  uploadId: string
  uploadName: string
  pageNumber: number
  sourcePageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  sourceTableIndex: number
  rowIndex: number
  rawCode: string
  rawDefinition: string
  rawRowText: string
  confidence: number
  warnings: string[]
}

export type PlanFinishSemanticRecord = {
  id: string
  surface: PlanFinishSurface
  rawFinishValue: string
  resolvedFinishCategory: PlanFinishSemanticCategory | null
  resolutionMethod: PlanFinishResolutionMethod
  semanticStatus: PlanFinishSemanticStatus
  scheduleSource: PlanScheduleFinishSource
  legendSources: PlanLegendDefinitionSource[]
  confidence: number
  warnings: string[]
  blockers: string[]
}

export type PlanScopeBoundarySemanticCandidate = {
  id: string
  semanticRecordId: string
  trade: "painting"
  subjectKey: "ceilings"
  surface: "ceiling"
  rawFinishValue: string
  resolvedFinishCategory: "paint_coating"
  resolutionMethod: Exclude<PlanFinishResolutionMethod, null>
  semanticStatus: "resolved"
  scheduleSource: PlanScheduleFinishSource
  legendSources: PlanLegendDefinitionSource[]
  confidence: number
  warnings: []
  blockers: []
  eligibleForFutureScopeReview: true
  pricingAuthoritative: false
  pricingEligibleNow: false
  quantityAuthoritative: false
  mutatesTypedScope: false
  generatesEstimate: false
  persistsState: false
}

export type BuildPlanScopeBoundaryCandidatesResult = {
  candidates: PlanScopeBoundarySemanticCandidate[]
  reviewOnly: PlanFinishSemanticRecord[]
}

type SurfaceSpec = {
  surface: PlanFinishSurface
  value: (row: PlanRoomFinishMatrixRow) => string | null | undefined
  scheduleHeaders: ReadonlySet<string>
}

type LegendColumnResolution =
  | { status: "qualified"; codeIndex: number; definitionIndex: number }
  | { status: "blocked"; blocker: string }

type LegendLookupResult = {
  sources: PlanLegendDefinitionSource[]
  blockers: string[]
}

const MIN_AUTHORITY_CONFIDENCE = 70

const CODE_HEADERS = new Set([
  "code",
  "finish code",
  "material code",
  "mark",
  "symbol",
])

const DEFINITION_HEADERS = new Set([
  "description",
  "finish description",
  "material",
  "material description",
  "finish",
])

const SURFACE_SPECS: readonly SurfaceSpec[] = [
  {
    surface: "wall",
    value: (row) => row.finishes.wallFinish,
    scheduleHeaders: new Set(["wall", "wall finish", "wall material", "w"]),
  },
  {
    surface: "ceiling",
    value: (row) => row.finishes.ceilingFinish,
    scheduleHeaders: new Set([
      "ceiling",
      "ceiling finish",
      "ceiling material",
      "clg",
      "clg finish",
      "c",
    ]),
  },
  {
    surface: "base",
    value: (row) => row.finishes.baseFinish,
    scheduleHeaders: new Set(["base", "base finish", "base material", "b"]),
  },
  {
    surface: "floor",
    value: (row) => row.finishes.floorFinish,
    scheduleHeaders: new Set([
      "floor",
      "floor finish",
      "floor material",
      "flooring",
      "flooring finish",
      "f",
    ]),
  },
]

function clean(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeHeader(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeCode(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ")
}

function normalizeDefinitionText(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ")
}

function normalizeMaterialText(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasAuthorityBlockingFinishLanguage(value: string): boolean {
  const text = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!text) return false

  return [
    /\bno\s+(?:paint|painting|coat|coating)\b/,
    /\bnot\s+(?:painted|coated)\b/,
    /\bdo\s+not\s+(?:paint|coat)\b/,
    /\b(?:paint|painting|coat|coating)\s+not\s+required\b/,
    /\bremove\s+(?:paint|painting|coat|coating)\b/,
    /\b(?:paint|painting|coat|coating)\s+by\s+others\b/,
    /\bexisting\s+(?:paint|painting|coat|coating)\b/,
    /\bexisting\s+to\s+remain\b/,
    /\bno\s+work\b/,
  ].some((pattern) => pattern.test(text))
}

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const text = clean(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }

  return result
}

function minimumConfidence(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return 0
  return Math.max(0, Math.min(100, Math.round(Math.min(...finite))))
}

function sameNullableText(first: string | null, second: string | null): boolean {
  return first === second
}

function isCodeLike(value: string): boolean {
  const compact = clean(value)
  if (!compact || /\s{2,}/.test(compact)) return false
  return /^[a-z]{1,8}\s*[-.]?\s*\d+(?:[-.]\d+)*[a-z0-9]*$/i.test(compact)
}

function containsCodeLikeToken(value: string): boolean {
  return /(?:^|[^a-z0-9])[a-z]{1,8}\s*[-.]?\s*\d+(?:[-.]\d+)*[a-z0-9]*(?=$|[^a-z0-9])/i.test(
    clean(value)
  )
}

function classifyMaterialText(value: string): PlanFinishSemanticCategory[] {
  const text = normalizeMaterialText(value)
  if (!text) return []

  const categories = new Set<PlanFinishSemanticCategory>()
  const acousticalCeiling =
    /\b(?:acoustic|acoustical)\s+(?:ceiling\s+)?(?:tile|tiles|panel|panels|board|boards)\b/.test(
      text
    )

  if (/\b(?:paint|painting|painted|coating|coatings)\b/.test(text)) {
    categories.add("paint_coating")
  }
  if (/\b(?:wallcovering|wall\s+covering|wallpaper)\b/.test(text)) {
    categories.add("wallcovering")
  }
  if (acousticalCeiling) categories.add("acoustical_ceiling")
  if (/\brubber\s+(?:wall\s+)?base\b/.test(text)) {
    categories.add("rubber_base")
  }
  if (/\bvinyl\s+(?:wall\s+)?base\b/.test(text)) {
    categories.add("vinyl_base")
  }
  if (/\b(?:wood|wooden)\b/.test(text)) categories.add("wood")
  if (!acousticalCeiling && /\b(?:ceramic\s+|porcelain\s+|stone\s+)?tile\b/.test(text)) {
    categories.add("tile")
  }
  if (
    /\b(?:flooring|carpet|carpeting|lvt|lvp|vinyl\s+flooring|hardwood\s+flooring|laminate\s+flooring)\b/.test(
      text
    )
  ) {
    categories.add("flooring")
  }

  return [...categories]
}

function hasMixedScheduleAlternatives(value: string): boolean {
  const parts = clean(value)
    .split(/\s*(?:\+|\/|;|,|\bor\b)\s*/i)
    .map(clean)
    .filter(Boolean)

  if (parts.length <= 1) return false
  if (parts.some(isCodeLike)) return true

  const categories = parts.flatMap(classifyMaterialText)
  return categories.length === 0 || new Set(categories).size !== 1
}

function deterministicRecordId(source: PlanScheduleFinishSource): string {
  const parts = [
    source.uploadId,
    String(source.sourcePageNumber),
    String(source.sourceTableIndex),
    String(source.rowIndex),
    source.surface,
    normalizeCode(source.rawFinishValue),
  ]
  return `plan-finish-semantic:${parts.map(encodeURIComponent).join(":")}`
}

function findUniqueHeaderIndex(
  columns: readonly string[],
  accepted: ReadonlySet<string>
): number | null {
  const matches = columns.flatMap((column, index) =>
    accepted.has(normalizeHeader(column)) ? [index] : []
  )
  return matches.length === 1 ? matches[0] : null
}

function resolveLegendColumns(table: PlanExtractedTable): LegendColumnResolution {
  const codeMatches = table.columns.flatMap((column, index) =>
    CODE_HEADERS.has(normalizeHeader(column)) ? [index] : []
  )
  const definitionMatches = table.columns.flatMap((column, index) =>
    DEFINITION_HEADERS.has(normalizeHeader(column)) ? [index] : []
  )

  if (codeMatches.length === 0) {
    return { status: "blocked", blocker: "Legend code column was not clear." }
  }
  if (codeMatches.length > 1) {
    return { status: "blocked", blocker: "Legend has multiple possible code columns." }
  }
  if (definitionMatches.length === 0) {
    return { status: "blocked", blocker: "Legend definition column was not clear." }
  }
  if (definitionMatches.length > 1) {
    return {
      status: "blocked",
      blocker: "Legend has multiple possible definition columns.",
    }
  }
  if (codeMatches[0] === definitionMatches[0]) {
    return { status: "blocked", blocker: "Legend code and definition columns overlap." }
  }

  return {
    status: "qualified",
    codeIndex: codeMatches[0],
    definitionIndex: definitionMatches[0],
  }
}

function tableContainsExactCode(table: PlanExtractedTable, code: string): boolean {
  const normalizedCode = normalizeCode(code)
  return table.rows.some((row) =>
    row.cells.some((cell) => normalizeCode(cell) === normalizedCode)
  )
}

function findLegendSources(
  tables: readonly PlanExtractedTable[],
  rawCode: string,
  scheduleUploadId: string
): LegendLookupResult {
  const sources: PlanLegendDefinitionSource[] = []
  const blockers: string[] = []
  const normalizedCode = normalizeCode(rawCode)

  tables.forEach((table, sourceTableIndex) => {
    if (
      table.tableType !== "legend" ||
      table.uploadId !== scheduleUploadId
    ) {
      return
    }

    const columns = resolveLegendColumns(table)
    if (columns.status === "blocked") {
      if (tableContainsExactCode(table, rawCode)) {
        blockers.push(
          `Legend table ${sourceTableIndex} contains the exact code but ${columns.blocker.toLowerCase()}`
        )
      }
      return
    }

    for (const row of table.rows) {
      const code = String(row.cells[columns.codeIndex] ?? "")
      if (normalizeCode(code) !== normalizedCode) continue

      const rawDefinition = String(row.cells[columns.definitionIndex] ?? "")
      sources.push({
        uploadId: table.uploadId,
        uploadName: table.uploadName,
        pageNumber: table.pageNumber,
        sourcePageNumber: table.sourcePageNumber,
        sheetNumber: table.sheetNumber,
        sheetTitle: table.sheetTitle,
        sourceTableIndex,
        rowIndex: row.rowIndex,
        rawCode: code,
        rawDefinition,
        rawRowText: row.rawText,
        confidence: minimumConfidence([table.confidence, row.confidence]),
        warnings: uniqueStrings([...table.warnings, ...row.warnings]),
      })
    }
  })

  return { sources, blockers: uniqueStrings(blockers) }
}

function buildScheduleSource(args: {
  tables: readonly PlanExtractedTable[]
  matrix: PlanRoomFinishMatrix
  sourceMatrixIndex: number
  row: PlanRoomFinishMatrixRow
  spec: SurfaceSpec
  rawFinishValue: string
}): { source: PlanScheduleFinishSource; blockers: string[] } {
  const { matrix, row, spec } = args
  const sourceTable = args.tables[matrix.sourceTableIndex]
  const blockers: string[] = []
  let sourceColumnIndex: number | null = null
  let sourceColumnLabel: string | null = null
  let sourceTableRow: PlanExtractedTable["rows"][number] | null = null

  if (!sourceTable) {
    blockers.push("Source table index does not resolve to an extracted table.")
  } else {
    if (sourceTable.tableType !== "finish_schedule") {
      blockers.push("Source table is not a finish schedule.")
    }
    if (
      sourceTable.uploadId !== matrix.uploadId ||
      sourceTable.uploadName !== matrix.uploadName ||
      sourceTable.pageNumber !== matrix.pageNumber ||
      sourceTable.sourcePageNumber !== matrix.sourcePageNumber ||
      !sameNullableText(sourceTable.sheetNumber, matrix.sheetNumber) ||
      !sameNullableText(sourceTable.sheetTitle, matrix.sheetTitle)
    ) {
      blockers.push("Matrix identity does not match its source finish schedule.")
    }

    const matchingRows = sourceTable.rows.filter(
      (candidate) => candidate.rowIndex === row.rowIndex
    )
    if (matchingRows.length !== 1) {
      blockers.push("Matrix row does not uniquely identify a source schedule row.")
    } else {
      sourceTableRow = matchingRows[0]
      if (clean(sourceTableRow.rawText) !== clean(row.rawRowText)) {
        blockers.push("Matrix raw row does not match its source schedule row.")
      }
    }

    sourceColumnIndex = findUniqueHeaderIndex(
      sourceTable.columns,
      spec.scheduleHeaders
    )
    if (sourceColumnIndex == null) {
      blockers.push(`Source ${spec.surface} finish column is not unique.`)
    } else {
      sourceColumnLabel = clean(sourceTable.columns[sourceColumnIndex]) || null
      if (
        sourceTableRow &&
        clean(sourceTableRow.cells[sourceColumnIndex]) !== clean(args.rawFinishValue)
      ) {
        blockers.push(
          `Matrix ${spec.surface} finish does not match the source schedule cell.`
        )
      }
    }
  }

  const warnings = uniqueStrings([
    ...matrix.warnings,
    ...row.warnings,
    ...(sourceTable?.warnings || []),
    ...(sourceTableRow?.warnings || []),
  ])
  if (warnings.length > 0) {
    blockers.push("Schedule evidence contains authority-blocking warnings.")
  }

  const confidence = minimumConfidence([
    matrix.confidence,
    row.confidence,
    sourceTable?.confidence ?? 0,
    sourceTableRow?.confidence ?? 0,
  ])
  if (confidence < MIN_AUTHORITY_CONFIDENCE) {
    blockers.push("Schedule evidence confidence is below the authority threshold.")
  }

  return {
    source: {
      uploadId: matrix.uploadId,
      uploadName: matrix.uploadName,
      pageNumber: matrix.pageNumber,
      sourcePageNumber: matrix.sourcePageNumber,
      sheetNumber: matrix.sheetNumber,
      sheetTitle: matrix.sheetTitle,
      sourceMatrixIndex: args.sourceMatrixIndex,
      sourceTableIndex: matrix.sourceTableIndex,
      rowIndex: row.rowIndex,
      sourceColumnIndex,
      sourceColumnLabel,
      surface: spec.surface,
      roomName: row.roomName,
      roomNumber: row.roomNumber,
      rawFinishValue: args.rawFinishValue,
      rawRowText: row.rawRowText,
      confidence,
      warnings,
    },
    blockers: uniqueStrings(blockers),
  }
}

function resolveLegendCode(args: {
  tables: readonly PlanExtractedTable[]
  rawCode: string
  scheduleUploadId: string
  scheduleConfidence: number
}): Omit<
  PlanFinishSemanticRecord,
  "id" | "surface" | "rawFinishValue" | "scheduleSource"
> {
  const lookup = findLegendSources(
    args.tables,
    args.rawCode,
    args.scheduleUploadId
  )
  const warnings = uniqueStrings(
    lookup.sources.flatMap((source) => source.warnings)
  )
  const blockers = [...lookup.blockers]

  if (warnings.length > 0) {
    blockers.push("Legend evidence contains authority-blocking warnings.")
  }
  if (
    lookup.sources.some(
      (source) => source.confidence < MIN_AUTHORITY_CONFIDENCE
    )
  ) {
    blockers.push("Legend evidence confidence is below the authority threshold.")
  }

  const confidence = minimumConfidence([
    args.scheduleConfidence,
    ...lookup.sources.map((source) => source.confidence),
  ])

  if (blockers.length > 0) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "blocked",
      legendSources: lookup.sources,
      confidence,
      warnings,
      blockers: uniqueStrings(blockers),
    }
  }

  if (lookup.sources.length === 0) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "unresolved",
      legendSources: [],
      confidence: args.scheduleConfidence,
      warnings: [],
      blockers: ["No exact authority-capable legend definition was found."],
    }
  }

  if (
    lookup.sources.some((source) =>
      hasAuthorityBlockingFinishLanguage(source.rawDefinition)
    )
  ) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "blocked",
      legendSources: lookup.sources,
      confidence,
      warnings: [],
      blockers: [
        "At least one exact legend definition contains authority-blocking finish language.",
      ],
    }
  }

  const classifications = lookup.sources.map((source) =>
    classifyMaterialText(source.rawDefinition)
  )
  if (classifications.some((categories) => categories.length === 0)) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "unresolved",
      legendSources: lookup.sources,
      confidence,
      warnings: [],
      blockers: ["At least one exact legend definition has unresolved material meaning."],
    }
  }
  if (classifications.some((categories) => categories.length > 1)) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "conflicted",
      legendSources: lookup.sources,
      confidence,
      warnings: [],
      blockers: ["A legend definition maps to multiple material categories."],
    }
  }

  const definitions = new Set(
    lookup.sources.map((source) =>
      normalizeDefinitionText(source.rawDefinition)
    )
  )
  if (definitions.size !== 1) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "conflicted",
      legendSources: lookup.sources,
      confidence,
      warnings: [],
      blockers: ["Exact legend rows define the same code differently."],
    }
  }

  const categories = new Set(
    classifications.flatMap((classification) => classification)
  )
  if (categories.size !== 1) {
    return {
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "conflicted",
      legendSources: lookup.sources,
      confidence,
      warnings: [],
      blockers: ["Exact legend definitions conflict on material category."],
    }
  }

  return {
    resolvedFinishCategory: [...categories][0],
    resolutionMethod: "legend_code",
    semanticStatus: "resolved",
    legendSources: lookup.sources,
    confidence,
    warnings: [],
    blockers: [],
  }
}

function buildSemanticRecord(args: {
  tables: readonly PlanExtractedTable[]
  matrix: PlanRoomFinishMatrix
  sourceMatrixIndex: number
  row: PlanRoomFinishMatrixRow
  spec: SurfaceSpec
  rawFinishValue: string
}): PlanFinishSemanticRecord {
  const schedule = buildScheduleSource(args)
  const id = deterministicRecordId(schedule.source)

  if (schedule.blockers.length > 0) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "blocked",
      scheduleSource: schedule.source,
      legendSources: [],
      confidence: schedule.source.confidence,
      warnings: schedule.source.warnings,
      blockers: schedule.blockers,
    }
  }

  if (hasMixedScheduleAlternatives(args.rawFinishValue)) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "blocked",
      scheduleSource: schedule.source,
      legendSources: [],
      confidence: schedule.source.confidence,
      warnings: [],
      blockers: ["Schedule finish value contains multiple or ambiguous alternatives."],
    }
  }

  if (isCodeLike(args.rawFinishValue)) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      scheduleSource: schedule.source,
      ...resolveLegendCode({
        tables: args.tables,
        rawCode: args.rawFinishValue,
        scheduleUploadId: schedule.source.uploadId,
        scheduleConfidence: schedule.source.confidence,
      }),
    }
  }

  if (containsCodeLikeToken(args.rawFinishValue)) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "blocked",
      scheduleSource: schedule.source,
      legendSources: [],
      confidence: schedule.source.confidence,
      warnings: [],
      blockers: [
        "Schedule finish value combines a code-like identifier with other text.",
      ],
    }
  }

  if (hasAuthorityBlockingFinishLanguage(args.rawFinishValue)) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "blocked",
      scheduleSource: schedule.source,
      legendSources: [],
      confidence: schedule.source.confidence,
      warnings: [],
      blockers: ["Schedule finish value contains authority-blocking language."],
    }
  }

  const categories = classifyMaterialText(args.rawFinishValue)
  if (categories.length > 1) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "conflicted",
      scheduleSource: schedule.source,
      legendSources: [],
      confidence: schedule.source.confidence,
      warnings: [],
      blockers: ["Schedule finish value maps to multiple material categories."],
    }
  }
  if (categories.length === 0) {
    return {
      id,
      surface: args.spec.surface,
      rawFinishValue: args.rawFinishValue,
      resolvedFinishCategory: null,
      resolutionMethod: null,
      semanticStatus: "unresolved",
      scheduleSource: schedule.source,
      legendSources: [],
      confidence: schedule.source.confidence,
      warnings: [],
      blockers: ["Schedule finish value does not prove a material category."],
    }
  }

  return {
    id,
    surface: args.spec.surface,
    rawFinishValue: args.rawFinishValue,
    resolvedFinishCategory: categories[0],
    resolutionMethod: "explicit_schedule_value",
    semanticStatus: "resolved",
    scheduleSource: schedule.source,
    legendSources: [],
    confidence: schedule.source.confidence,
    warnings: [],
    blockers: [],
  }
}

function toFutureScopeCandidate(
  record: PlanFinishSemanticRecord
): PlanScopeBoundarySemanticCandidate | null {
  if (
    record.surface !== "ceiling" ||
    record.semanticStatus !== "resolved" ||
    record.resolvedFinishCategory !== "paint_coating" ||
    record.resolutionMethod == null ||
    record.warnings.length > 0 ||
    record.blockers.length > 0
  ) {
    return null
  }

  return {
    id: `plan-scope-boundary:${record.id}`,
    semanticRecordId: record.id,
    trade: "painting",
    subjectKey: "ceilings",
    surface: "ceiling",
    rawFinishValue: record.rawFinishValue,
    resolvedFinishCategory: "paint_coating",
    resolutionMethod: record.resolutionMethod,
    semanticStatus: "resolved",
    scheduleSource: record.scheduleSource,
    legendSources: record.legendSources,
    confidence: record.confidence,
    warnings: [],
    blockers: [],
    eligibleForFutureScopeReview: true,
    pricingAuthoritative: false,
    pricingEligibleNow: false,
    quantityAuthoritative: false,
    mutatesTypedScope: false,
    generatesEstimate: false,
    persistsState: false,
  }
}

export function buildPlanScopeBoundaryCandidates(args: {
  extractedTables: readonly PlanExtractedTable[]
  roomFinishMatrices: readonly PlanRoomFinishMatrix[]
}): BuildPlanScopeBoundaryCandidatesResult {
  const candidates: PlanScopeBoundarySemanticCandidate[] = []
  const reviewOnly: PlanFinishSemanticRecord[] = []

  args.roomFinishMatrices.forEach((matrix, sourceMatrixIndex) => {
    matrix.rows.forEach((row) => {
      for (const spec of SURFACE_SPECS) {
        const rawFinishValue = String(spec.value(row) ?? "")
        if (!clean(rawFinishValue)) continue

        const record = buildSemanticRecord({
          tables: args.extractedTables,
          matrix,
          sourceMatrixIndex,
          row,
          spec,
          rawFinishValue,
        })
        const candidate = toFutureScopeCandidate(record)

        if (candidate) candidates.push(candidate)
        else reviewOnly.push(record)
      }
    })
  })

  return { candidates, reviewOnly }
}
