import assert from "node:assert/strict"
import test from "node:test"

import { extractRoomFinishMatricesFromTables } from "./roomFinishMatrix"
import type { PlanExtractedTable } from "./types"

function makeTable(overrides: Partial<PlanExtractedTable> = {}): PlanExtractedTable {
  return {
    tableType: "finish_schedule",
    columns: ["Room", "Wall Finish", "Base", "Ceiling", "Floor", "Notes"],
    rows: [
      {
        rowIndex: 1,
        cells: ["101 Guest Room", "P-1", "B-1", "ACT-1", "CPT-1", "Accent wall at headboard"],
        rawText: "101 Guest Room | P-1 | B-1 | ACT-1 | CPT-1 | Accent wall at headboard",
        confidence: 75,
        warnings: [],
      },
      {
        rowIndex: 2,
        cells: ["102 Bath", "TILE-1", "B-2", "GYP", "TILE-2", "Wet wall tile"],
        rawText: "102 Bath | TILE-1 | B-2 | GYP | TILE-2 | Wet wall tile",
        confidence: 75,
        warnings: [],
      },
    ],
    rawText: "A8.1 Finish Schedule",
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    pageNumber: 1,
    sourcePageNumber: 3,
    sheetNumber: "A8.1",
    sheetTitle: "Finish Schedule",
    confidence: 80,
    extractionMethod: "deterministic",
    warnings: [],
    ...overrides,
  }
}

test("extracts room finish matrix rows from clear finish schedule columns", () => {
  const matrices = extractRoomFinishMatricesFromTables([makeTable()])

  assert.equal(matrices.length, 1)
  assert.equal(matrices[0].rows.length, 2)
  assert.equal(matrices[0].sourcePageNumber, 3)
  assert.equal(matrices[0].rows[0].roomNumber, "101")
  assert.equal(matrices[0].rows[0].roomName, "Guest Room")
  assert.equal(matrices[0].rows[0].roomType, "bedroom")
  assert.equal(matrices[0].rows[0].finishes.wallFinish, "P-1")
  assert.equal(matrices[0].rows[0].finishes.baseFinish, "B-1")
  assert.equal(matrices[0].rows[0].finishes.ceilingFinish, "ACT-1")
  assert.equal(matrices[0].rows[0].finishes.floorFinish, "CPT-1")
  assert.equal(matrices[0].rows[0].notes, "Accent wall at headboard")
  assert(matrices[0].confidence >= 70)
})

test("does not extract a matrix when finish schedule columns are unclear", () => {
  const matrices = extractRoomFinishMatricesFromTables([
    makeTable({
      columns: ["Item", "Description"],
      rows: [
        {
          rowIndex: 1,
          cells: ["A", "Coordinate finishes with owner"],
          rawText: "A | Coordinate finishes with owner",
          confidence: 45,
          warnings: ["Columns were not clear."],
        },
      ],
      confidence: 45,
      warnings: ["Columns were not clear."],
    }),
  ])

  assert.equal(matrices.length, 0)
})

test("ignores non-finish schedule tables", () => {
  const matrices = extractRoomFinishMatricesFromTables([
    makeTable({
      tableType: "door_schedule",
      columns: ["Mark", "Size", "Type"],
      rows: [
        {
          rowIndex: 1,
          cells: ["D101", "3-0 x 7-0", "HM"],
          rawText: "D101 | 3-0 x 7-0 | HM",
          confidence: 75,
          warnings: [],
        },
      ],
    }),
  ])

  assert.equal(matrices.length, 0)
})
