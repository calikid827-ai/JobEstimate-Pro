import assert from "node:assert/strict"
import test from "node:test"

import { runPlanIntelligence } from "./orchestrator"

function makeImageDataUrl(label: string): string {
  return `data:image/png;base64,${Buffer.from(label, "utf8").toString("base64")}`
}

function makePdfDataUrl(pageCount: number): string {
  const body = [
    "%PDF-1.4",
    ...Array.from({ length: pageCount }, (_, index) => `<< /Type /Page /PageNum ${index + 1} >>`),
    "%%EOF",
  ].join("\n")

  return `data:application/pdf;base64,${Buffer.from(body, "utf8").toString("base64")}`
}

test("selected-sheet analysis only uses user-selected pages", async () => {
  const result = await runPlanIntelligence({
    rawPlans: [
      {
        name: "selected-finish-plan.png",
        dataUrl: makeImageDataUrl("paint"),
        note: "Guest room finish plan with paint walls and ceilings.",
        selectedSourcePages: [1],
      },
      {
        name: "unselected-electrical-plan.png",
        dataUrl: makeImageDataUrl("electrical"),
        note: "Electrical power plan with receptacles and devices.",
        selectedSourcePages: [],
      },
    ],
    scopeText: "Repaint hotel guest rooms.",
    trade: "painting",
  })

  assert(result)
  assert.equal(result.pagesCount, 1)
  assert.equal(result.indexedPagesCount, 2)
  assert.equal(result.selectedPagesCount, 1)
  assert.equal(result.skippedPagesCount, 1)
  assert.equal(result.sheetIndex.length, 1)
  assert.equal(result.analyses.length, 1)
  assert(result.detectedTrades.includes("painting"))
  assert(!result.detectedTrades.includes("electrical"))
})

test("unselected pdf pages do not contribute plan findings", async () => {
  const result = await runPlanIntelligence({
    rawPlans: [
      {
        name: "hotel-finish-set.pdf",
        dataUrl: makePdfDataUrl(5),
        note: "Hotel finish set",
        selectedSourcePages: [2, 4],
      },
    ],
    scopeText: "Guest room repaint only.",
    trade: "painting",
  })

  assert(result)
  assert.equal(result.pagesCount, 2)
  assert.equal(result.indexedPagesCount, 5)
  assert.equal(result.selectedPagesCount, 2)
  assert.equal(result.skippedPagesCount, 3)
  assert.equal(result.sheetIndex.length, 2)
  assert.deepEqual(
    result.analyses.map((analysis) => analysis.sourcePageNumber),
    [2, 4]
  )
})

test("mixed upload selection preserves estimator compatibility with selected indexed pages only", async () => {
  const result = await runPlanIntelligence({
    rawPlans: [
      {
        name: "guest-room-finish-plan.png",
        dataUrl: makeImageDataUrl("guest-room"),
        note: "Guest room finish plan and reflected ceiling plan.",
        selectedSourcePages: [1],
      },
      {
        name: "general-notes.png",
        dataUrl: makeImageDataUrl("notes"),
        note: "General notes and code information.",
        selectedSourcePages: [],
      },
      {
        name: "fixture-schedule.pdf",
        dataUrl: makePdfDataUrl(3),
        note: "Plumbing fixture schedule and electrical fixture schedule.",
        selectedSourcePages: [1, 3],
      },
    ],
    scopeText: "Refresh guest room finishes and update fixtures.",
    trade: "general renovation",
  })

  assert(result)
  assert.equal(result.indexedPagesCount, 5)
  assert.equal(result.selectedPagesCount, 3)
  assert.equal(result.pagesCount, 3)
  assert.equal(result.skippedPagesCount, 2)
  assert.equal(result.analyses.length, 3)
  assert.equal(result.analyses[0].uploadName, "guest-room-finish-plan.png")
  assert.deepEqual(
    result.analyses.slice(1).map((analysis) => analysis.sourcePageNumber),
    [1, 3]
  )
})

