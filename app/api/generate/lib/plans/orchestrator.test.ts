import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { runPlanIntelligence } from "./orchestrator"
import { buildEstimateSkeletonHandoff } from "../estimator/estimateSkeletonHandoff"
import { buildEstimateStructureConsumption } from "../estimator/estimateStructureConsumption"

const require = createRequire(import.meta.url)
const PDFDocument = require("pdfkit")

function makeImageDataUrl(label: string): string {
  return `data:image/png;base64,${Buffer.from(label, "utf8").toString("base64")}`
}

async function makePdfDataUrl(pages: string[]): Promise<string> {
  const doc = new PDFDocument({ autoFirstPage: false, margin: 36 })
  const chunks: Buffer[] = []

  doc.on("data", (chunk: Buffer) => chunks.push(chunk))

  for (const text of pages) {
    doc.addPage({ size: [612, 792], margin: 36 })
    doc.fontSize(18).text(text, 48, 48, { width: 500 })
  }

  doc.end()

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)))
    doc.once("error", reject)
  })

  return `data:application/pdf;base64,${buffer.toString("base64")}`
}

async function makePdfBuffer(pages: string[]): Promise<Buffer> {
  const dataUrl = await makePdfDataUrl(pages)
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")
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
  const pdfDataUrl = await makePdfDataUrl([
    "Cover Sheet General Notes Code Summary",
    "A1.1 Finish Plan guest room repaint walls ceilings trim doors",
    "E1.0 Electrical Schedule 12 outlets 6 switches 2 fixtures",
    "A9.1 Interior Elevations guest bath vanity shower tile",
    "P1.0 Plumbing Fixture Schedule 4 toilets 4 lavatories 2 shower valves",
  ])

  const result = await runPlanIntelligence({
    rawPlans: [
      {
        name: "hotel-finish-set.pdf",
        dataUrl: pdfDataUrl,
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
  assert(result.sheetIndex.every((sheet) => sheet.renderedFromPdf === true))
  assert(result.sheetIndex.every((sheet) => sheet.renderedImageAvailable === true))
  assert.deepEqual(
    result.analyses.map((analysis) => analysis.sourcePageNumber),
    [2, 4]
  )
  assert(result.detectedTrades.includes("painting"))
  assert(!result.detectedTrades.includes("electrical"))
})

test("mixed upload selection preserves estimator compatibility with selected indexed pages only", async () => {
  const pdfDataUrl = await makePdfDataUrl([
    "P1.0 Plumbing Fixture Schedule 4 toilets 4 lavatories",
    "A6.0 Reflected Ceiling Plan guest room light fixtures",
    "A9.2 Interior Elevations vanity backsplash tile",
  ])

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
        dataUrl: pdfDataUrl,
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
  assert(
    result.analyses.some((analysis) =>
      analysis.tradeFindings.some((finding) => finding.trade === "plumbing")
    )
  )
})

test("selected rendered pdf pages contribute real plan findings and smarter sheet classification", async () => {
  const pdfDataUrl = await makePdfDataUrl([
    "A6.1 Reflected Ceiling Plan ceiling cloud and light fixtures",
    "A8.2 Finish Schedule paint wallcovering flooring",
    "P2.0 Fixture Schedule 6 toilets 8 lavatories 4 shower valves",
    "A9.1 Interior Elevations vanity backsplash tile accent wall",
  ])

  const result = await runPlanIntelligence({
    rawPlans: [
      {
        name: "interiors-plan-set.pdf",
        dataUrl: pdfDataUrl,
        note: "Interiors package",
        selectedSourcePages: [1, 2, 3, 4],
      },
    ],
    scopeText: "Refresh finishes, ceilings, and bath fixtures.",
    trade: "general renovation",
  })

  assert(result)
  assert.equal(result.pagesCount, 4)
  assert(result.detectedTrades.includes("painting"))
  assert(
    result.sheetIndex.some(
      (sheet) =>
        sheet.sheetNumber === "A6-1" &&
        sheet.renderedFromPdf === true &&
        sheet.renderedImageAvailable === true &&
        sheet.discipline !== "unknown"
    )
  )
  assert(
    result.analyses.some((analysis) =>
      analysis.schedules.some((item) => item.scheduleType === "fixture")
    )
  )
  assert(
    result.analyses.some((analysis) =>
      analysis.tradeFindings.some((finding) => finding.trade === "plumbing")
    )
  )
})

test("selected pages synthesize cross-sheet schedule and plan context conservatively", async () => {
  const pdfDataUrl = await makePdfDataUrl([
    "A8.1 Finish Plan guest room wall finish paint wallcovering",
    "A8.2 Finish Schedule guest room finish matrix paint wallcovering flooring",
    "A9.1 Interior Elevations guest bathroom shower tile backsplash vanity wall",
    "P2.0 Fixture Schedule 4 toilets 4 lavatories 2 shower valves",
  ])

  const result = await runPlanIntelligence({
    rawPlans: [
      {
        name: "hotel-interiors.pdf",
        dataUrl: pdfDataUrl,
        note: "Hotel interiors and schedules",
        selectedSourcePages: [1, 2, 3, 4],
      },
    ],
    scopeText: "Refresh guest room finishes and bathroom fixture areas.",
    trade: "general renovation",
  })

  assert(result)
  assert(result.crossSheetLinkSignals?.some((item) => /finish schedules and finish\/elevation sheets reinforce finish scope/i.test(item)))
  assert(result.crossSheetLinkSignals?.some((item) => /fixture schedules and bathroom\/elevation sheets reinforce wet-area fixture context conservatively/i.test(item)))
  assert(result.scheduleReconciliationSignals?.some((item) => /Finish schedules now reconcile against finish-plan evidence/i.test(item)))
  assert(result.planSetSynthesisNotes?.length)
  assert(result.detectedTrades.includes("painting"))
  assert(result.detectedTrades.includes("plumbing"))
  assert(result.sheetIndex.every((sheet) => sheet.selectedForAnalysis))
})

test("temp-file-backed large pdf transport feeds the same split/render/analyze seam", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "scopeguard-plan-orchestrator-test-"))

  try {
    const pdfPath = path.join(tempRoot, "large-hotel-set.pdf")
    await writeFile(
      pdfPath,
      await makePdfBuffer([
        "Cover Sheet General Notes Code Summary",
        "A8.1 Finish Plan guest room paint walls ceilings",
        "A8.2 Finish Schedule guest room finish matrix paint wallcovering flooring",
        "P2.0 Fixture Schedule 4 toilets 4 lavatories 2 shower valves",
      ])
    )

    const result = await runPlanIntelligence({
      rawPlans: [
        {
          uploadId: "multipart_plan_upload",
          name: "large-hotel-set.pdf",
          note: "Reliable transport upload",
          transport: "multipart-temp",
          mimeType: "application/pdf",
          tempFilePath: pdfPath,
          bytes: 12_000_000,
          selectedSourcePages: [2, 3, 4],
        },
      ],
      scopeText: "Refresh guest room finishes and bath fixture areas.",
      trade: "general renovation",
    })

    assert(result)
    assert.equal(result.indexedPagesCount, 4)
    assert.equal(result.selectedPagesCount, 3)
    assert.equal(result.pagesCount, 3)
    assert.equal(result.skippedPagesCount, 1)
    assert(result.detectedTrades.includes("painting"))
    assert(result.detectedTrades.includes("plumbing"))
    assert.deepEqual(
      result.analyses.map((analysis) => analysis.sourcePageNumber),
      [2, 3, 4]
    )
    assert(result.sheetIndex.every((sheet) => sheet.uploadId === "multipart_plan_upload"))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("browser-derived, server-derived, and fallback upload modes preserve identical estimator-ready package behavior downstream", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "scopeguard-plan-upload-mode-test-"))

  try {
    const pdfPath = path.join(tempRoot, "selected-pages.pdf")
    await writeFile(
      pdfPath,
      await makePdfBuffer([
        "A8.1 Finish Plan guest room repaint wall finish",
        "A8.2 Finish Schedule guest room paint wallcovering flooring",
      ])
    )

    const makeRawPlan = (mode: "browser-derived-selected-pages" | "server-derived-selected-pages" | "original-fallback") => ({
      uploadId: `upload-${mode}`,
      name: `selected-pages-${mode}.pdf`,
      note: `Mode ${mode}`,
      transport: "multipart-temp",
      mimeType: "application/pdf",
      tempFilePath: pdfPath,
      bytes: 4_000_000,
      originalBytes: 18_000_000,
      sourcePageNumberMap: [3, 7],
      selectedSourcePages: [3, 7],
      selectedPageUploadMode: mode,
      selectedPageUploadNote: `${mode} note`,
    })

    const browserResult = await runPlanIntelligence({
      rawPlans: [makeRawPlan("browser-derived-selected-pages")],
      scopeText: "Refresh guest room finishes.",
      trade: "painting",
    })
    const serverResult = await runPlanIntelligence({
      rawPlans: [makeRawPlan("server-derived-selected-pages")],
      scopeText: "Refresh guest room finishes.",
      trade: "painting",
    })
    const fallbackResult = await runPlanIntelligence({
      rawPlans: [makeRawPlan("original-fallback")],
      scopeText: "Refresh guest room finishes.",
      trade: "painting",
    })

    const summarizePackages = (result: NonNullable<typeof browserResult>) =>
      (result.estimatorPackages || []).map((pkg) => ({
        key: pkg.key,
        supportType: pkg.supportType,
        scopeBreadth: pkg.scopeBreadth,
        sourcePages: pkg.evidence.map((ref) => ref.sourcePageNumber),
      }))

    const summarizeSections = (result: NonNullable<typeof browserResult>) =>
      (
        buildEstimateStructureConsumption(buildEstimateSkeletonHandoff(result))
          ?.structuredEstimateSections || []
      ).map((section) => ({
        title: section.sectionTitle,
        readiness: section.sectionReadiness,
        quantityNormalization: section.quantityNormalization,
        safeForSectionBuild: section.safeForSectionBuild,
        measurementDrafts: section.tradeMeasurementDrafts,
        inputCandidates: section.normalizedEstimatorInputCandidates,
        sourcePages: section.evidence.map((ref) => ref.sourcePageNumber),
      }))

    assert(browserResult && serverResult && fallbackResult)
    assert.deepEqual(summarizePackages(browserResult), summarizePackages(serverResult))
    assert.deepEqual(summarizePackages(browserResult), summarizePackages(fallbackResult))
    assert.deepEqual(summarizeSections(browserResult), summarizeSections(serverResult))
    assert.deepEqual(summarizeSections(browserResult), summarizeSections(fallbackResult))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
