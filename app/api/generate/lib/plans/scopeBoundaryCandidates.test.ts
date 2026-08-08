import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPlanScopeBoundaryCandidates,
  type BuildPlanScopeBoundaryCandidatesResult,
  type PlanFinishSurface,
} from "./scopeBoundaryCandidates"
import type {
  PlanExtractedTable,
  PlanRoomFinishMatrix,
  PlanRoomFinishMatrixRow,
} from "./types"

type FinishValues = {
  wall?: string | null
  ceiling?: string | null
  base?: string | null
  floor?: string | null
}

type SourceWarnings = {
  finishTable?: string[]
  finishTableRow?: string[]
  matrix?: string[]
  matrixRow?: string[]
}

function makeFinishTable(args: {
  finishes?: FinishValues
  warnings?: SourceWarnings
  overrides?: Partial<PlanExtractedTable>
} = {}): PlanExtractedTable {
  const finishes = args.finishes || {}
  return {
    tableType: "finish_schedule",
    columns: ["Room", "Wall Finish", "Base", "Ceiling", "Floor"],
    rows: [
      {
        rowIndex: 1,
        cells: [
          "101 Guest Room",
          finishes.wall || "",
          finishes.base || "",
          finishes.ceiling || "",
          finishes.floor || "",
        ],
        rawText: "101 Guest Room finish schedule row",
        confidence: 82,
        warnings: args.warnings?.finishTableRow || [],
      },
    ],
    rawText: "A8.1 Finish Schedule",
    uploadId: "schedule-upload",
    uploadName: "finish-plans.pdf",
    pageNumber: 1,
    sourcePageNumber: 3,
    sheetNumber: "A8.1",
    sheetTitle: "Room Finish Schedule",
    confidence: 86,
    extractionMethod: "deterministic",
    warnings: args.warnings?.finishTable || [],
    ...args.overrides,
  }
}

function makeMatrix(args: {
  finishes?: FinishValues
  warnings?: SourceWarnings
  overrides?: Partial<PlanRoomFinishMatrix>
  rowOverrides?: Partial<PlanRoomFinishMatrixRow>
} = {}): PlanRoomFinishMatrix {
  const finishes = args.finishes || {}
  return {
    tableType: "finish_schedule",
    sourceTableIndex: 0,
    rows: [
      {
        rowIndex: 1,
        roomName: "Guest Room",
        roomNumber: "101",
        roomType: "bedroom",
        finishes: {
          wallFinish: finishes.wall ?? null,
          baseFinish: finishes.base ?? null,
          ceilingFinish: finishes.ceiling ?? null,
          floorFinish: finishes.floor ?? null,
        },
        notes: null,
        rawRowText: "101 Guest Room finish schedule row",
        confidence: 80,
        warnings: args.warnings?.matrixRow || [],
        ...args.rowOverrides,
      },
    ],
    rawText: "A8.1 Finish Schedule",
    uploadId: "schedule-upload",
    uploadName: "finish-plans.pdf",
    pageNumber: 1,
    sourcePageNumber: 3,
    sheetNumber: "A8.1",
    sheetTitle: "Room Finish Schedule",
    confidence: 84,
    extractionMethod: "deterministic",
    warnings: args.warnings?.matrix || [],
    ...args.overrides,
  }
}

function makeLegendTable(args: {
  rows?: Array<{
    code: string
    definition: string
    warnings?: string[]
  }>
  columns?: string[]
  rowCells?: string[][]
  warnings?: string[]
  overrides?: Partial<PlanExtractedTable>
} = {}): PlanExtractedTable {
  const rows = args.rows || [{ code: "P-1", definition: "Paint" }]
  return {
    tableType: "legend",
    columns: args.columns || ["Code", "Description"],
    rows: rows.map((row, index) => ({
      rowIndex: index + 1,
      cells: args.rowCells?.[index] || [row.code, row.definition],
      rawText: `${row.code} | ${row.definition}`,
      confidence: 81,
      warnings: row.warnings || [],
    })),
    rawText: "A9.1 Finish Legend",
    uploadId: "schedule-upload",
    uploadName: "finish-plans.pdf",
    pageNumber: 2,
    sourcePageNumber: 7,
    sheetNumber: "A9.1",
    sheetTitle: "Finish Legend",
    confidence: 85,
    extractionMethod: "deterministic",
    warnings: args.warnings || [],
    ...args.overrides,
  }
}

function build(args: {
  finishes?: FinishValues
  legends?: PlanExtractedTable[]
  warnings?: SourceWarnings
  finishTableOverrides?: Partial<PlanExtractedTable>
  matrixOverrides?: Partial<PlanRoomFinishMatrix>
  rowOverrides?: Partial<PlanRoomFinishMatrixRow>
  additionalTables?: PlanExtractedTable[]
}): BuildPlanScopeBoundaryCandidatesResult {
  const finishTable = makeFinishTable({
    finishes: args.finishes,
    warnings: args.warnings,
    overrides: args.finishTableOverrides,
  })
  const matrix = makeMatrix({
    finishes: args.finishes,
    warnings: args.warnings,
    overrides: args.matrixOverrides,
    rowOverrides: args.rowOverrides,
  })

  return buildPlanScopeBoundaryCandidates({
    extractedTables: [
      finishTable,
      ...(args.legends || []),
      ...(args.additionalTables || []),
    ],
    roomFinishMatrices: [matrix],
  })
}

function reviewRecord(
  result: BuildPlanScopeBoundaryCandidatesResult,
  surface: PlanFinishSurface
) {
  const record = result.reviewOnly.find((item) => item.surface === surface)
  assert.ok(record, `Expected ${surface} review-only record.`)
  return record
}

test("resolves explicit clean ceiling paint as the only future scope candidate", () => {
  const result = build({ finishes: { ceiling: "Paint" } })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.reviewOnly.length, 0)
  assert.deepEqual(
    {
      trade: result.candidates[0].trade,
      subjectKey: result.candidates[0].subjectKey,
      surface: result.candidates[0].surface,
      category: result.candidates[0].resolvedFinishCategory,
      method: result.candidates[0].resolutionMethod,
    },
    {
      trade: "painting",
      subjectKey: "ceilings",
      surface: "ceiling",
      category: "paint_coating",
      method: "explicit_schedule_value",
    }
  )
})

test("blocks negative, instructional, existing-work, and by-others schedule text", () => {
  const values = [
    "No Paint",
    "No Coating",
    "Not Painted",
    "Not Coated",
    "Do Not Paint",
    "Do Not Coat",
    "Paint Not Required",
    "Coating Not Required",
    "Remove Paint",
    "Remove Coating",
    "Paint By Others",
    "Painting By Others",
    "Coating By Others",
    "Existing Paint",
    "Existing Coating",
    "Existing Paint - No Work",
    "Existing to Remain",
    "No Work",
  ]

  for (const value of values) {
    const result = build({ finishes: { ceiling: value } })
    const record = reviewRecord(result, "ceiling")

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
    assert.equal(record.resolvedFinishCategory, null)
    assert.equal(record.rawFinishValue, value)
  }
})

test("keeps explicit non-candidate material semantics review-only by surface", () => {
  const cases: Array<{
    finishes: FinishValues
    surface: PlanFinishSurface
    category: string
  }> = [
    {
      finishes: { ceiling: "Acoustical Ceiling Tile" },
      surface: "ceiling",
      category: "acoustical_ceiling",
    },
    { finishes: { wall: "Paint" }, surface: "wall", category: "paint_coating" },
    {
      finishes: { wall: "Vinyl Wallcovering" },
      surface: "wall",
      category: "wallcovering",
    },
    { finishes: { base: "Rubber Base" }, surface: "base", category: "rubber_base" },
    { finishes: { base: "Vinyl Base" }, surface: "base", category: "vinyl_base" },
    { finishes: { base: "Wood Base" }, surface: "base", category: "wood" },
    { finishes: { floor: "Porcelain Tile" }, surface: "floor", category: "tile" },
    {
      finishes: { floor: "Luxury Vinyl Flooring" },
      surface: "floor",
      category: "flooring",
    },
  ]

  for (const item of cases) {
    const result = build({ finishes: item.finishes })
    const record = reviewRecord(result, item.surface)
    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "resolved")
    assert.equal(record.resolvedFinishCategory, item.category)
    assert.equal(record.resolutionMethod, "explicit_schedule_value")
  }
})

test("allows the explicit same-category phrase Paint / Coating", () => {
  const result = build({ finishes: { ceiling: "Paint / Coating" } })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].resolvedFinishCategory, "paint_coating")
})

test("resolves an exact ceiling finish code through a clear legend", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable({
        rows: [
          {
            code: "P-1",
            definition: "Sherwin-Williams ProMar 200 Paint",
          },
        ],
      }),
    ],
  })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].resolutionMethod, "legend_code")
  assert.equal(result.candidates[0].resolvedFinishCategory, "paint_coating")
})

test("resolves a same-upload legend from a different page and sheet", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable({
        overrides: {
          pageNumber: 5,
          sourcePageNumber: 20,
          sheetNumber: "A20.1",
          sheetTitle: "Finish Legend",
        },
      }),
    ],
  })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].legendSources.length, 1)
  assert.equal(result.candidates[0].legendSources[0].uploadId, "schedule-upload")
  assert.equal(result.candidates[0].legendSources[0].sourcePageNumber, 20)
  assert.equal(result.candidates[0].legendSources[0].sheetNumber, "A20.1")
})

test("ignores an exact code legend from an unrelated upload", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable({
        overrides: {
          uploadId: "unrelated-upload",
          uploadName: "unrelated-plans.pdf",
        },
      }),
    ],
  })
  const record = reviewRecord(result, "ceiling")

  assert.equal(result.candidates.length, 0)
  assert.equal(record.semanticStatus, "unresolved")
  assert.deepEqual(record.legendSources, [])
})

test("does not let an unrelated legend conflict poison same-upload resolution", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable(),
      makeLegendTable({
        rows: [{ code: "P-1", definition: "Wallcovering" }],
        overrides: {
          uploadId: "unrelated-upload",
          uploadName: "unrelated-plans.pdf",
        },
      }),
    ],
  })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].resolvedFinishCategory, "paint_coating")
  assert.deepEqual(
    result.candidates[0].legendSources.map((source) => source.uploadId),
    ["schedule-upload"]
  )
})

test("matches legend codes by case and surrounding whitespace only", () => {
  const result = build({
    finishes: { ceiling: "  p-1  " },
    legends: [
      makeLegendTable({ rows: [{ code: " P-1 ", definition: "Paint" }] }),
    ],
  })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].resolutionMethod, "legend_code")
})

test("does not let a code-like value bypass legend resolution by adding prose", () => {
  const result = build({ finishes: { ceiling: "P-1 Paint" } })
  const record = reviewRecord(result, "ceiling")

  assert.equal(result.candidates.length, 0)
  assert.equal(record.semanticStatus, "blocked")
  assert.equal(record.resolvedFinishCategory, null)
})

test("does not use prefix, substring, or related-family code matches", () => {
  for (const legendCode of ["P-10", "P", "VWC-1"]) {
    const scheduleCode = legendCode === "VWC-1" ? "WC-1" : "P-1"
    const result = build({
      finishes: { ceiling: scheduleCode },
      legends: [
        makeLegendTable({ rows: [{ code: legendCode, definition: "Paint" }] }),
      ],
    })
    const record = reviewRecord(result, "ceiling")

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "unresolved")
    assert.equal(record.legendSources.length, 0)
  }
})

test("preserves exact schedule and legend provenance for code resolution", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [makeLegendTable()],
  })
  const candidate = result.candidates[0]

  assert.ok(candidate)
  assert.deepEqual(
    {
      uploadId: candidate.scheduleSource.uploadId,
      uploadName: candidate.scheduleSource.uploadName,
      pageNumber: candidate.scheduleSource.pageNumber,
      sourcePageNumber: candidate.scheduleSource.sourcePageNumber,
      sheetNumber: candidate.scheduleSource.sheetNumber,
      sheetTitle: candidate.scheduleSource.sheetTitle,
      sourceMatrixIndex: candidate.scheduleSource.sourceMatrixIndex,
      sourceTableIndex: candidate.scheduleSource.sourceTableIndex,
      rowIndex: candidate.scheduleSource.rowIndex,
      columnIndex: candidate.scheduleSource.sourceColumnIndex,
      columnLabel: candidate.scheduleSource.sourceColumnLabel,
      roomName: candidate.scheduleSource.roomName,
      roomNumber: candidate.scheduleSource.roomNumber,
      rawFinishValue: candidate.scheduleSource.rawFinishValue,
      rawRowText: candidate.scheduleSource.rawRowText,
    },
    {
      uploadId: "schedule-upload",
      uploadName: "finish-plans.pdf",
      pageNumber: 1,
      sourcePageNumber: 3,
      sheetNumber: "A8.1",
      sheetTitle: "Room Finish Schedule",
      sourceMatrixIndex: 0,
      sourceTableIndex: 0,
      rowIndex: 1,
      columnIndex: 3,
      columnLabel: "Ceiling",
      roomName: "Guest Room",
      roomNumber: "101",
      rawFinishValue: "P-1",
      rawRowText: "101 Guest Room finish schedule row",
    }
  )
  assert.deepEqual(
    candidate.legendSources.map((source) => ({
      uploadId: source.uploadId,
      uploadName: source.uploadName,
      pageNumber: source.pageNumber,
      sourcePageNumber: source.sourcePageNumber,
      sheetNumber: source.sheetNumber,
      sheetTitle: source.sheetTitle,
      sourceTableIndex: source.sourceTableIndex,
      rowIndex: source.rowIndex,
      rawCode: source.rawCode,
      rawDefinition: source.rawDefinition,
      rawRowText: source.rawRowText,
    })),
    [
      {
        uploadId: "schedule-upload",
        uploadName: "finish-plans.pdf",
        pageNumber: 2,
        sourcePageNumber: 7,
        sheetNumber: "A9.1",
        sheetTitle: "Finish Legend",
        sourceTableIndex: 1,
        rowIndex: 1,
        rawCode: "P-1",
        rawDefinition: "Paint",
        rawRowText: "P-1 | Paint",
      },
    ]
  )
})

test("keeps missing, manufacturer-only, color-only, and high-confidence codes unresolved", () => {
  const cases = [
    [] as PlanExtractedTable[],
    [makeLegendTable({ rows: [{ code: "P-1", definition: "Sherwin-Williams" }] })],
    [makeLegendTable({ rows: [{ code: "P-1", definition: "SW 7005 Pure White" }] })],
    [
      makeLegendTable({
        rows: [{ code: "P-1", definition: "Sherwin-Williams" }],
        overrides: { confidence: 100 },
      }),
    ],
  ]

  for (const legends of cases) {
    const result = build({ finishes: { ceiling: "P-1" }, legends })
    const record = reviewRecord(result, "ceiling")
    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "unresolved")
    assert.equal(record.resolvedFinishCategory, null)
  }
})

test("blocks authority language in same-upload legend definitions", () => {
  const definitions = [
    "No Paint",
    "Do Not Paint",
    "Paint Not Required",
    "Paint By Others",
    "Existing Paint - No Work",
    "Remove Paint",
  ]

  for (const definition of definitions) {
    const result = build({
      finishes: { ceiling: "P-1" },
      legends: [
        makeLegendTable({ rows: [{ code: "P-1", definition }] }),
      ],
    })
    const record = reviewRecord(result, "ceiling")

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
    assert.equal(record.resolvedFinishCategory, null)
    assert.equal(record.legendSources.length, 1)
    assert.equal(record.legendSources[0].rawDefinition, definition)
  }
})

test("resolves normalized exact duplicate legend definitions while retaining every source", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable({
        rows: [
          { code: "P-1", definition: "Paint" },
          { code: "p-1", definition: "   paint  " },
        ],
      }),
    ],
  })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].resolvedFinishCategory, "paint_coating")
  assert.equal(result.candidates[0].legendSources.length, 2)
  assert.deepEqual(
    result.candidates[0].legendSources.map((source) => source.rowIndex),
    [1, 2]
  )
  assert.deepEqual(
    result.candidates[0].legendSources.map((source) => source.rawDefinition),
    ["Paint", "   paint  "]
  )
})

test("fails closed when duplicate definitions share a category but not exact meaning", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable({
        rows: [
          { code: "P-1", definition: "Paint" },
          { code: "P-1", definition: "Latex Paint" },
        ],
      }),
    ],
  })
  const record = reviewRecord(result, "ceiling")

  assert.equal(result.candidates.length, 0)
  assert.equal(record.semanticStatus, "conflicted")
  assert.deepEqual(
    record.legendSources.map((source) => source.rawDefinition),
    ["Paint", "Latex Paint"]
  )
})

test("fails closed for materially different paint definitions", () => {
  const result = build({
    finishes: { ceiling: "P-1" },
    legends: [
      makeLegendTable({
        rows: [
          { code: "P-1", definition: "Interior Latex Paint" },
          { code: "P-1", definition: "Exterior Epoxy Paint" },
        ],
      }),
    ],
  })
  const record = reviewRecord(result, "ceiling")

  assert.equal(result.candidates.length, 0)
  assert.equal(record.semanticStatus, "conflicted")
  assert.equal(record.legendSources.length, 2)
})

test("fails closed for conflicting or partly unresolved duplicate definitions", () => {
  const cases: Array<{
    definitions: string[]
    status: "conflicted" | "unresolved"
  }> = [
    { definitions: ["Paint", "Wallcovering"], status: "conflicted" },
    { definitions: ["Paint", "Sherwin-Williams"], status: "unresolved" },
  ]

  for (const item of cases) {
    const result = build({
      finishes: { ceiling: "P-1" },
      legends: [
        makeLegendTable({
          rows: item.definitions.map((definition) => ({
            code: "P-1",
            definition,
          })),
        }),
      ],
    })
    const record = reviewRecord(result, "ceiling")

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, item.status)
    assert.equal(record.legendSources.length, 2)
  }
})

test("classifies legend definitions rather than code characters", () => {
  const cases: Array<{
    code: string
    definition: string
    category: string
  }> = [
    { code: "ACT-1", definition: "Acoustical Ceiling Tile", category: "acoustical_ceiling" },
    { code: "RB-1", definition: "Rubber Base", category: "rubber_base" },
    { code: "VWC-1", definition: "Vinyl Wallcovering", category: "wallcovering" },
  ]

  for (const item of cases) {
    const result = build({
      finishes: { ceiling: item.code },
      legends: [
        makeLegendTable({
          rows: [{ code: item.code, definition: item.definition }],
        }),
      ],
    })
    const record = reviewRecord(result, "ceiling")

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "resolved")
    assert.equal(record.resolvedFinishCategory, item.category)
  }
})

test("ignores non-legend tables and blocks structurally unclear matching legends", () => {
  const generic = makeLegendTable({
    rows: [{ code: "P-1", definition: "Paint" }],
    overrides: { tableType: "unknown" },
  })
  const structuralCases = [
    makeLegendTable({
      columns: ["Item", "Description"],
      rowCells: [["P-1", "Paint"]],
    }),
    makeLegendTable({
      columns: ["Code", "Notes"],
      rowCells: [["P-1", "Paint"]],
    }),
    makeLegendTable({
      columns: ["Code", "Mark", "Description"],
      rowCells: [["P-1", "P-1", "Paint"]],
    }),
    makeLegendTable({
      columns: ["Code", "Description", "Material"],
      rowCells: [["P-1", "Paint", "Paint"]],
    }),
  ]

  const ignored = build({ finishes: { ceiling: "P-1" }, legends: [generic] })
  assert.equal(ignored.candidates.length, 0)
  assert.equal(reviewRecord(ignored, "ceiling").semanticStatus, "unresolved")

  for (const legend of structuralCases) {
    const result = build({ finishes: { ceiling: "P-1" }, legends: [legend] })
    const record = reviewRecord(result, "ceiling")
    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
  }
})

test("fails closed for warnings at every schedule and legend layer", () => {
  const scheduleCases: SourceWarnings[] = [
    { finishTable: ["Finish table warning."] },
    { finishTableRow: ["Finish schedule row warning."] },
    { matrix: ["Matrix warning."] },
    { matrixRow: ["Matrix row warning."] },
  ]

  for (const warnings of scheduleCases) {
    const result = build({ finishes: { ceiling: "Paint" }, warnings })
    const record = reviewRecord(result, "ceiling")
    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
    assert(record.warnings.length > 0)
  }

  const legendCases = [
    makeLegendTable({ warnings: ["Legend table warning."] }),
    makeLegendTable({
      rows: [
        {
          code: "P-1",
          definition: "Paint",
          warnings: ["Legend row warning."],
        },
      ],
    }),
  ]

  for (const legend of legendCases) {
    const result = build({
      finishes: { ceiling: "P-1" },
      legends: [legend],
    })
    const record = reviewRecord(result, "ceiling")
    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
    assert(record.warnings.length > 0)
  }
})

test("fails closed when schedule provenance cannot be reconciled", () => {
  const cases = [
    build({
      finishes: { ceiling: "Paint" },
      matrixOverrides: { sourceTableIndex: 99 },
    }),
    build({
      finishes: { ceiling: "Paint" },
      finishTableOverrides: { uploadId: "different-upload" },
    }),
    build({
      finishes: { ceiling: "Paint" },
      finishTableOverrides: {
        rows: [
          makeFinishTable({ finishes: { ceiling: "Paint" } }).rows[0],
          makeFinishTable({ finishes: { ceiling: "Paint" } }).rows[0],
        ],
      },
    }),
    build({
      finishes: { ceiling: "Paint" },
      finishTableOverrides: { columns: ["Room", "Ceiling", "Ceiling Finish"] },
    }),
  ]

  for (const result of cases) {
    const record = reviewRecord(result, "ceiling")
    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
    assert(record.blockers.length > 0)
  }
})

test("blocks mixed schedule values without choosing an alternative", () => {
  for (const value of ["P-1 / ACT-1", "P-1 + WC-1"]) {
    const result = build({
      finishes: { ceiling: value },
      legends: [
        makeLegendTable({
          rows: [
            { code: "P-1", definition: "Paint" },
            { code: "ACT-1", definition: "Acoustical Ceiling Tile" },
            { code: "WC-1", definition: "Wallcovering" },
          ],
        }),
      ],
    })
    const record = reviewRecord(result, "ceiling")

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "blocked")
    assert.equal(record.resolvedFinishCategory, null)
  }
})

test("keeps resolved coded wall, wallcovering, base, and floor semantics review-only", () => {
  const cases: Array<{
    finishes: FinishValues
    code: string
    definition: string
    surface: PlanFinishSurface
    category: string
  }> = [
    {
      finishes: { wall: "P-1" },
      code: "P-1",
      definition: "Paint",
      surface: "wall",
      category: "paint_coating",
    },
    {
      finishes: { wall: "VWC-1" },
      code: "VWC-1",
      definition: "Vinyl Wallcovering",
      surface: "wall",
      category: "wallcovering",
    },
    {
      finishes: { base: "RB-1" },
      code: "RB-1",
      definition: "Rubber Base",
      surface: "base",
      category: "rubber_base",
    },
    {
      finishes: { floor: "F-1" },
      code: "F-1",
      definition: "Porcelain Tile",
      surface: "floor",
      category: "tile",
    },
  ]

  for (const item of cases) {
    const result = build({
      finishes: item.finishes,
      legends: [
        makeLegendTable({
          rows: [{ code: item.code, definition: item.definition }],
        }),
      ],
    })
    const record = reviewRecord(result, item.surface)

    assert.equal(result.candidates.length, 0)
    assert.equal(record.semanticStatus, "resolved")
    assert.equal(record.resolvedFinishCategory, item.category)
  }
})

test("asserts only non-authoritative future-review flags and never actionable", () => {
  const result = build({ finishes: { ceiling: "Paint" } })
  const candidate = result.candidates[0]

  assert.deepEqual(
    {
      eligibleForFutureScopeReview: candidate.eligibleForFutureScopeReview,
      pricingAuthoritative: candidate.pricingAuthoritative,
      pricingEligibleNow: candidate.pricingEligibleNow,
      quantityAuthoritative: candidate.quantityAuthoritative,
      mutatesTypedScope: candidate.mutatesTypedScope,
      generatesEstimate: candidate.generatesEstimate,
      persistsState: candidate.persistsState,
    },
    {
      eligibleForFutureScopeReview: true,
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      quantityAuthoritative: false,
      mutatesTypedScope: false,
      generatesEstimate: false,
      persistsState: false,
    }
  )
  assert.equal("actionable" in candidate, false)
  assert.equal(JSON.stringify(result).includes('"actionable"'), false)
})

test("ignores door, fixture, count, and quantity-like table data", () => {
  const unrelatedTables: PlanExtractedTable[] = [
    {
      ...makeLegendTable(),
      tableType: "door_schedule",
      columns: ["Mark", "Count", "Finish"],
      rows: [
        {
          rowIndex: 1,
          cells: ["D1", "20", "Paint"],
          rawText: "D1 | 20 | Paint",
          confidence: 90,
          warnings: [],
        },
      ],
    },
    {
      ...makeLegendTable(),
      tableType: "fixture_schedule",
      columns: ["Fixture", "Quantity"],
      rows: [
        {
          rowIndex: 1,
          cells: ["Light", "30"],
          rawText: "Light | 30",
          confidence: 90,
          warnings: [],
        },
      ],
    },
  ]

  const result = buildPlanScopeBoundaryCandidates({
    extractedTables: unrelatedTables,
    roomFinishMatrices: [],
  })

  assert.deepEqual(result, { candidates: [], reviewOnly: [] })
})

test("is deterministic and does not mutate tables, rows, matrices, or warnings", () => {
  const finishTable = makeFinishTable({ finishes: { ceiling: "P-1" } })
  const legend = makeLegendTable({
    rows: [
      { code: "P-1", definition: "Paint" },
      { code: "P-1", definition: "  paint  " },
    ],
  })
  const matrix = makeMatrix({ finishes: { ceiling: "P-1" } })
  const extractedTables = [finishTable, legend]
  const roomFinishMatrices = [matrix]
  const beforeTables = structuredClone(extractedTables)
  const beforeMatrices = structuredClone(roomFinishMatrices)

  const first = buildPlanScopeBoundaryCandidates({
    extractedTables,
    roomFinishMatrices,
  })
  const second = buildPlanScopeBoundaryCandidates({
    extractedTables,
    roomFinishMatrices,
  })

  assert.deepEqual(first, second)
  assert.deepEqual(extractedTables, beforeTables)
  assert.deepEqual(roomFinishMatrices, beforeMatrices)
  assert.equal(first.candidates[0].id, second.candidates[0].id)
  assert.match(
    first.candidates[0].id,
    /^plan-scope-boundary:plan-finish-semantic:/
  )
})
