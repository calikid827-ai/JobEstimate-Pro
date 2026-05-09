import assert from "node:assert/strict"
import test from "node:test"

import { buildTradeQuantityCandidates } from "./tradeQuantityCandidates"
import type {
  PlanExtractedTable,
  PlanRepeatedRoomPackage,
  PlanRoomFinishMatrix,
} from "./types"

function makeFinishMatrix(): PlanRoomFinishMatrix {
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
          wallFinish: "P-1",
          baseFinish: "B-1",
          ceilingFinish: "ACT-1",
          floorFinish: "CPT-1",
        },
        notes: null,
        rawRowText: "101 Guest Room | P-1 | B-1 | ACT-1 | CPT-1",
        confidence: 78,
        warnings: [],
      },
      {
        rowIndex: 2,
        roomName: "Bath",
        roomNumber: "102",
        roomType: "bathroom",
        finishes: {
          wallFinish: "VWC-1",
          baseFinish: "B-2",
          ceilingFinish: "GYP",
          floorFinish: "TILE-1",
        },
        notes: null,
        rawRowText: "102 Bath | VWC-1 | B-2 | GYP | TILE-1",
        confidence: 74,
        warnings: [],
      },
    ],
    rawText: "A8.1 Finish Schedule",
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    pageNumber: 1,
    sourcePageNumber: 4,
    sheetNumber: "A8.1",
    sheetTitle: "Finish Schedule",
    confidence: 80,
    extractionMethod: "deterministic",
    warnings: [],
  }
}

function makeScheduleTable(
  tableType: PlanExtractedTable["tableType"],
  rows: PlanExtractedTable["rows"],
  columns = ["Mark", "Type", "Count"]
): PlanExtractedTable {
  return {
    tableType,
    columns,
    rows,
    rawText: `${tableType} text`,
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    pageNumber: 2,
    sourcePageNumber: 5,
    sheetNumber: "A6.1",
    sheetTitle: tableType,
    confidence: 78,
    extractionMethod: "deterministic",
    warnings: [],
  }
}

function makeRepeatedPackage(): PlanRepeatedRoomPackage {
  return {
    packageKey: "guest-room-wall-p-1",
    roomType: "bedroom",
    roomNames: ["Guest Room"],
    roomNumbers: ["101", "102", "103"],
    repeatCount: 3,
    finishSignature: "wall:p-1|base:b-1|ceiling:act-1|floor:cpt-1",
    sourceRows: [
      {
        sourceMatrixIndex: 0,
        sourceTableIndex: 0,
        rowIndex: 1,
        roomName: "Guest Room",
        roomNumber: "101",
        rawRowText: "101 Guest Room",
        pageNumber: 1,
        sourcePageNumber: 4,
        sheetNumber: "A8.1",
        sheetTitle: "Finish Schedule",
        confidence: 75,
      },
      {
        sourceMatrixIndex: 0,
        sourceTableIndex: 0,
        rowIndex: 2,
        roomName: "Guest Room",
        roomNumber: "102",
        rawRowText: "102 Guest Room",
        pageNumber: 1,
        sourcePageNumber: 4,
        sheetNumber: "A8.1",
        sheetTitle: "Finish Schedule",
        confidence: 75,
      },
    ],
    confidence: 80,
    extractionMethod: "deterministic",
    warnings: ["Repeated room package is diagnostic only; do not use repeat count as measured quantity support."],
  }
}

test("finish matrix creates painting, wallcovering, base, ceiling, and flooring candidates", () => {
  const candidates = buildTradeQuantityCandidates({
    extractedTables: [],
    roomFinishMatrices: [makeFinishMatrix()],
    repeatedRoomPackages: [],
  })

  assert(candidates.some((candidate) => candidate.category === "painting finish rows"))
  assert(candidates.some((candidate) => candidate.category === "wallcovering finish rows"))
  assert(candidates.some((candidate) => candidate.category === "baseboard/base finish candidates"))
  assert(candidates.some((candidate) => candidate.category === "ceiling finish candidates"))
  assert(candidates.some((candidate) => candidate.category === "flooring finish rows"))
  assert(candidates.every((candidate) => candidate.eligibleForPricing === false))
  assert(
    candidates.every((candidate) =>
      candidate.warnings.some((warning) => /not measured takeoff support/i.test(warning))
    )
  )
})

test("door schedule rows create door count candidates", () => {
  const candidates = buildTradeQuantityCandidates({
    extractedTables: [
      makeScheduleTable("door_schedule", [
        {
          rowIndex: 1,
          cells: ["D101", "HM", "1"],
          rawText: "D101 | HM | 1",
          confidence: 75,
          warnings: [],
        },
        {
          rowIndex: 2,
          cells: ["D102", "WD", "1"],
          rawText: "D102 | WD | 1",
          confidence: 75,
          warnings: [],
        },
      ]),
    ],
    roomFinishMatrices: [],
    repeatedRoomPackages: [],
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].category, "door schedule count candidates")
  assert.equal(candidates[0].unit, "doors")
  assert.equal(candidates[0].quantity, 2)
  assert.equal(candidates[0].quantityStatus, "count_only")
})

test("fixture schedule rows create fixture count candidates", () => {
  const candidates = buildTradeQuantityCandidates({
    extractedTables: [
      makeScheduleTable("fixture_schedule", [
        {
          rowIndex: 1,
          cells: ["WC-1", "Toilet", "12"],
          rawText: "WC-1 | Toilet | 12",
          confidence: 75,
          warnings: [],
        },
        {
          rowIndex: 2,
          cells: ["LAV-1", "Lavatory", "10"],
          rawText: "LAV-1 | Lavatory | 10",
          confidence: 75,
          warnings: [],
        },
      ]),
    ],
    roomFinishMatrices: [],
    repeatedRoomPackages: [],
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].category, "fixture schedule count candidates")
  assert.equal(candidates[0].unit, "fixtures")
  assert.equal(candidates[0].quantity, 22)
})

test("repeated room packages create repeated-room count candidates", () => {
  const candidates = buildTradeQuantityCandidates({
    extractedTables: [],
    roomFinishMatrices: [],
    repeatedRoomPackages: [makeRepeatedPackage()],
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].category, "repeated room package count candidates")
  assert.equal(candidates[0].quantity, 3)
  assert.equal(candidates[0].unit, "rooms")
  assert.equal(candidates[0].eligibleForPricing, false)
})

test("phase 6 candidates are never pricing eligible", () => {
  const candidates = buildTradeQuantityCandidates({
    extractedTables: [
      makeScheduleTable("window_schedule", [
        {
          rowIndex: 1,
          cells: ["W1", "AL", "4"],
          rawText: "W1 | AL | 4",
          confidence: 75,
          warnings: [],
        },
      ]),
    ],
    roomFinishMatrices: [makeFinishMatrix()],
    repeatedRoomPackages: [makeRepeatedPackage()],
  })

  assert(candidates.length > 0)
  assert(candidates.every((candidate) => candidate.eligibleForPricing === false))
  assert(candidates.every((candidate) => candidate.quantityStatus !== "candidate"))
})
