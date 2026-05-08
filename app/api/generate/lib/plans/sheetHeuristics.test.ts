import assert from "node:assert/strict"
import test from "node:test"

import { buildSheetIndexEntryFromPage } from "./sheetHeuristics"
import type { PlanPageImage, PlanSheetDiscipline, PlanSheetRole } from "./types"

function makePage(args: {
  name: string
  text?: string
  note?: string
}): PlanPageImage {
  return {
    uploadId: "upload-1",
    uploadName: args.name,
    uploadNote: args.note || "",
    sourceMimeType: "application/pdf",
    sourceKind: "pdf",
    sourcePageNumber: 1,
    pageNumber: 1,
    imageDataUrl: "",
    width: null,
    height: null,
    selectedForAnalysis: true,
    renderedFromPdf: true,
    renderedImageAvailable: true,
    extractedText: args.text || null,
  }
}

function assertClassification(args: {
  name: string
  text?: string
  role: PlanSheetRole
  discipline: PlanSheetDiscipline
}) {
  const result = buildSheetIndexEntryFromPage(makePage({ name: args.name, text: args.text }))

  assert.equal(result.classification.sheetRole, args.role)
  assert.equal(result.classification.discipline, args.discipline)
  assert.equal(result.classification.method, "deterministic")
  assert(result.classification.confidence >= 60)
  assert(result.classification.signals.length > 0)
}

test("classifies common selected sheet names and text patterns", () => {
  const cases: Array<{
    name: string
    text?: string
    role: PlanSheetRole
    discipline: PlanSheetDiscipline
  }> = [
    {
      name: "A2.1 Floor Plan.pdf",
      text: "A2.1 Floor Plan room partition wall layout door swing",
      role: "floor_plan",
      discipline: "architectural",
    },
    {
      name: "A8.2 Finish Schedule.pdf",
      text: "A8.2 Finish Schedule guest room finish matrix paint wallcovering flooring base",
      role: "finish_schedule",
      discipline: "finish",
    },
    {
      name: "P2.0 Fixture Schedule.pdf",
      text: "P2.0 Plumbing Fixture Schedule toilets lavatories shower valve sink",
      role: "fixture_schedule",
      discipline: "plumbing",
    },
    {
      name: "A7.1 Door Schedule.pdf",
      text: "A7.1 Door Schedule door type frame hardware set",
      role: "door_schedule",
      discipline: "architectural",
    },
    {
      name: "A7.2 Window Schedule.pdf",
      text: "A7.2 Window Schedule glazing window type frame",
      role: "window_schedule",
      discipline: "architectural",
    },
    {
      name: "A6.1 RCP.pdf",
      text: "A6.1 Reflected Ceiling Plan ceiling grid lighting fixtures diffusers",
      role: "reflected_ceiling_plan",
      discipline: "finish",
    },
    {
      name: "A9.1 Interior Elevations.pdf",
      text: "A9.1 Interior Elevations vanity millwork feature wall",
      role: "elevation",
      discipline: "interior",
    },
    {
      name: "AD1.1 Demo Plan.pdf",
      text: "AD1.1 Demolition Plan remove existing to remain",
      role: "demo_plan",
      discipline: "architectural",
    },
    {
      name: "G0.2 Legend.pdf",
      text: "G0.2 Symbol Legend abbreviations general notes keynotes",
      role: "legend",
      discipline: "general",
    },
  ]

  for (const item of cases) {
    assertClassification(item)
  }
})

test("keeps unclear sheets as unknown structured classification", () => {
  const result = buildSheetIndexEntryFromPage(
    makePage({
      name: "scan-page.pdf",
      text: "random scanned title block without useful sheet role words",
    })
  )

  assert.equal(result.classification.sheetRole, "unknown")
  assert.equal(result.classification.method, "deterministic")
  assert(result.classification.confidence < 60)
  assert(result.classification.warnings.some((warning) => /No strong deterministic/i.test(warning)))
})
