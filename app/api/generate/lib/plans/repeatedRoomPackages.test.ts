import assert from "node:assert/strict"
import test from "node:test"

import { detectRepeatedRoomPackagesFromMatrices } from "./repeatedRoomPackages"
import type { PlanRoomFinishMatrix } from "./types"

function makeMatrix(rows: PlanRoomFinishMatrix["rows"]): PlanRoomFinishMatrix {
  return {
    tableType: "finish_schedule",
    sourceTableIndex: 0,
    rows,
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

function makeRow(args: {
  rowIndex: number
  roomName: string
  roomNumber: string
  roomType: string | null
  wall?: string | null
  base?: string | null
  ceiling?: string | null
  floor?: string | null
  confidence?: number
}): PlanRoomFinishMatrix["rows"][number] {
  return {
    rowIndex: args.rowIndex,
    roomName: args.roomName,
    roomNumber: args.roomNumber,
    roomType: args.roomType,
    finishes: {
      wallFinish: args.wall === undefined ? "P-1" : args.wall,
      baseFinish: args.base === undefined ? "B-1" : args.base,
      ceilingFinish: args.ceiling === undefined ? "ACT-1" : args.ceiling,
      floorFinish: args.floor === undefined ? "CPT-1" : args.floor,
    },
    notes: null,
    rawRowText: `${args.roomNumber} ${args.roomName}`,
    confidence: args.confidence ?? 75,
    warnings: [],
  }
}

test("detects repeated guest rooms with the same finish signature", () => {
  const packages = detectRepeatedRoomPackagesFromMatrices([
    makeMatrix([
      makeRow({ rowIndex: 1, roomName: "Guest Room", roomNumber: "101", roomType: "bedroom" }),
      makeRow({ rowIndex: 2, roomName: "Guest Room", roomNumber: "102", roomType: "bedroom" }),
      makeRow({ rowIndex: 3, roomName: "Guest Room", roomNumber: "103", roomType: "bedroom" }),
    ]),
  ])

  assert.equal(packages.length, 1)
  assert.equal(packages[0].repeatCount, 3)
  assert.equal(packages[0].roomType, "bedroom")
  assert.deepEqual(packages[0].roomNumbers, ["101", "102", "103"])
  assert.match(packages[0].finishSignature, /wall:p-1/)
  assert(packages[0].confidence >= 70)
})

test("detects repeated bathrooms with the same finish signature", () => {
  const packages = detectRepeatedRoomPackagesFromMatrices([
    makeMatrix([
      makeRow({
        rowIndex: 1,
        roomName: "Bath",
        roomNumber: "201",
        roomType: "bathroom",
        wall: "TILE-1",
        base: "B-2",
        ceiling: "GYP",
        floor: "TILE-2",
      }),
      makeRow({
        rowIndex: 2,
        roomName: "Bath",
        roomNumber: "202",
        roomType: "bathroom",
        wall: "TILE-1",
        base: "B-2",
        ceiling: "GYP",
        floor: "TILE-2",
      }),
    ]),
  ])

  assert.equal(packages.length, 1)
  assert.equal(packages[0].repeatCount, 2)
  assert.equal(packages[0].roomType, "bathroom")
  assert.deepEqual(packages[0].roomNumbers, ["201", "202"])
})

test("does not group different rooms with different finish signatures", () => {
  const packages = detectRepeatedRoomPackagesFromMatrices([
    makeMatrix([
      makeRow({ rowIndex: 1, roomName: "Guest Room", roomNumber: "101", roomType: "bedroom", wall: "P-1" }),
      makeRow({ rowIndex: 2, roomName: "Guest Room", roomNumber: "102", roomType: "bedroom", wall: "P-2" }),
    ]),
  ])

  assert.equal(packages.length, 0)
})

test("detects repeated finish combinations across generic room rows", () => {
  const packages = detectRepeatedRoomPackagesFromMatrices([
    makeMatrix([
      makeRow({ rowIndex: 1, roomName: "Room A", roomNumber: "301", roomType: null }),
      makeRow({ rowIndex: 2, roomName: "Room B", roomNumber: "302", roomType: null }),
    ]),
  ])

  assert.equal(packages.length, 1)
  assert.equal(packages[0].roomType, null)
  assert.equal(packages[0].repeatCount, 2)
  assert(
    packages[0].warnings.some((warning) => /matching finish signature/i.test(warning))
  )
})

test("marks name/type-only repeated grouping as low confidence", () => {
  const packages = detectRepeatedRoomPackagesFromMatrices([
    makeMatrix([
      makeRow({
        rowIndex: 1,
        roomName: "Guest Room",
        roomNumber: "101",
        roomType: "bedroom",
        wall: "P-1",
        base: null,
        ceiling: null,
        floor: null,
        confidence: 55,
      }),
      makeRow({
        rowIndex: 2,
        roomName: "Guest Room",
        roomNumber: "102",
        roomType: "bedroom",
        wall: "P-2",
        base: null,
        ceiling: null,
        floor: null,
        confidence: 55,
      }),
    ]),
  ])

  assert.equal(packages.length, 1)
  assert.equal(packages[0].repeatCount, 2)
  assert(packages[0].confidence < 60)
  assert(
    packages[0].warnings.some((warning) => /room name\/type/i.test(warning))
  )
})
