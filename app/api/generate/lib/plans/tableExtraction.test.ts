import assert from "node:assert/strict"
import test from "node:test"

import { extractPlanTablesFromPages } from "./tableExtraction"
import type { PlanPageImage, PlanSheetIndexEntry, PlanSheetRole } from "./types"

function makePage(args: {
  pageNumber: number
  sourcePageNumber?: number
  selected?: boolean
  text: string
}): PlanPageImage {
  return {
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    uploadNote: "",
    sourceMimeType: "application/pdf",
    sourceKind: "pdf",
    sourcePageNumber: args.sourcePageNumber ?? args.pageNumber,
    pageNumber: args.pageNumber,
    imageDataUrl: "",
    width: null,
    height: null,
    selectedForAnalysis: args.selected !== false,
    renderedFromPdf: true,
    renderedImageAvailable: true,
    extractedText: args.text,
  }
}

function makeSheet(args: {
  pageNumber: number
  sourcePageNumber?: number
  role: PlanSheetRole
  title?: string
}): PlanSheetIndexEntry {
  return {
    uploadId: "upload-1",
    uploadName: "plans.pdf",
    sourcePageNumber: args.sourcePageNumber ?? args.pageNumber,
    pageNumber: args.pageNumber,
    pageLabel: `Page ${args.pageNumber}`,
    sheetNumber: `A${args.pageNumber}.0`,
    sheetTitle: args.title ?? null,
    discipline: args.role === "fixture_schedule" ? "plumbing" : "architectural",
    confidence: 80,
    revision: null,
    selectedForAnalysis: true,
    renderedFromPdf: true,
    renderedImageAvailable: true,
    classification: {
      sheetRole: args.role,
      discipline: args.role === "fixture_schedule" ? "plumbing" : "architectural",
      confidence: 80,
      method: "deterministic",
      signals: [args.role],
      warnings: [],
    },
  }
}

test("extracts finish schedule rows from selected sheet text", () => {
  const tables = extractPlanTablesFromPages({
    selectedPages: [
      makePage({
        pageNumber: 1,
        text: [
          "A8.1 Finish Schedule",
          "Room | Wall Finish | Base | Ceiling",
          "101 Guest Room | P-1 | B-1 | ACT-1",
          "102 Bath | TILE-1 | B-2 | GYP",
        ].join("\n"),
      }),
    ],
    sheetIndex: [makeSheet({ pageNumber: 1, role: "finish_schedule", title: "Finish Schedule" })],
  })

  assert.equal(tables.length, 1)
  assert.equal(tables[0].tableType, "finish_schedule")
  assert.deepEqual(tables[0].columns, ["Room", "Wall Finish", "Base", "Ceiling"])
  assert.equal(tables[0].rows.length, 2)
  assert.equal(tables[0].rows[0].cells[0], "101 Guest Room")
  assert(tables[0].confidence >= 70)
})

test("extracts door schedule rows from selected sheet text", () => {
  const tables = extractPlanTablesFromPages({
    selectedPages: [
      makePage({
        pageNumber: 2,
        text: [
          "A6.1 Door Schedule",
          "Mark | Size | Type | Hardware",
          "D101 | 3-0 x 7-0 | HM | H1",
          "D102 | 2-8 x 7-0 | WD | H2",
        ].join("\n"),
      }),
    ],
    sheetIndex: [makeSheet({ pageNumber: 2, role: "door_schedule", title: "Door Schedule" })],
  })

  assert.equal(tables.length, 1)
  assert.equal(tables[0].tableType, "door_schedule")
  assert.equal(tables[0].rows.length, 2)
  assert.equal(tables[0].rows[1].cells[0], "D102")
})

test("extracts fixture schedule rows from selected sheet text", () => {
  const tables = extractPlanTablesFromPages({
    selectedPages: [
      makePage({
        pageNumber: 3,
        text: [
          "P4.0 Plumbing Fixture Schedule",
          "Mark | Fixture | Count | Notes",
          "WC-1 | Toilet | 12 | ADA where noted",
          "LAV-1 | Lavatory | 12 | Wall hung",
        ].join("\n"),
      }),
    ],
    sheetIndex: [makeSheet({ pageNumber: 3, role: "fixture_schedule", title: "Fixture Schedule" })],
  })

  assert.equal(tables.length, 1)
  assert.equal(tables[0].tableType, "fixture_schedule")
  assert.equal(tables[0].rows.length, 2)
  assert.equal(tables[0].rows[0].cells[1], "Toilet")
})

test("marks unclear generic table text as unknown and low confidence", () => {
  const tables = extractPlanTablesFromPages({
    selectedPages: [
      makePage({
        pageNumber: 4,
        text: ["Coordination Schedule", "Item Alpha", "Item Beta"].join("\n"),
      }),
    ],
    sheetIndex: [makeSheet({ pageNumber: 4, role: "unknown", title: "Coordination Notes" })],
  })

  assert.equal(tables.length, 1)
  assert.equal(tables[0].tableType, "unknown")
  assert.equal(tables[0].columns.length, 0)
  assert(tables[0].warnings.some((warning) => /Unknown table type/i.test(warning)))
  assert(tables[0].confidence < 60)
})

test("extracts from selected pages only", () => {
  const tables = extractPlanTablesFromPages({
    selectedPages: [
      makePage({
        pageNumber: 1,
        selected: false,
        text: ["Door Schedule", "Mark | Size", "D1 | 3-0 x 7-0"].join("\n"),
      }),
      makePage({
        pageNumber: 2,
        sourcePageNumber: 7,
        selected: true,
        text: ["Window Schedule", "Mark | Size | Type", "W1 | 4-0 x 5-0 | AL"].join("\n"),
      }),
    ],
    sheetIndex: [
      makeSheet({ pageNumber: 1, role: "door_schedule", title: "Door Schedule" }),
      makeSheet({ pageNumber: 2, sourcePageNumber: 7, role: "window_schedule", title: "Window Schedule" }),
    ],
  })

  assert.equal(tables.length, 1)
  assert.equal(tables[0].tableType, "window_schedule")
  assert.equal(tables[0].sourcePageNumber, 7)
})
