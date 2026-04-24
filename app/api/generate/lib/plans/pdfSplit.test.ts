import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { sanitizePlanUploads } from "./ingest"
import { splitPlanUploadsToPages } from "./pdfSplit"
import { buildSheetIndex } from "./sheetIndex"

const require = createRequire(import.meta.url)
const PDFDocument = require("pdfkit")

async function makeRenderedPdfDataUrl(pages: string[]): Promise<string> {
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

function makeIndexedPdfDataUrl(pageCount: number): string {
  const body = [
    "%PDF-1.4",
    ...Array.from({ length: pageCount }, (_, index) => `<< /Type /Page /PageNum ${index + 1} >>`),
    "%%EOF",
  ].join("\n")

  return `data:application/pdf;base64,${Buffer.from(body, "utf8").toString("base64")}`
}

function makeImageDataUrl(): string {
  return `data:image/png;base64,${Buffer.from("image", "utf8").toString("base64")}`
}

test("multi-page pdf plan set is accepted and split into indexed pages", async () => {
  const pdfDataUrl = await makeRenderedPdfDataUrl([
    "A1.0 Finish Plan Guest Room Paint Walls and Ceilings",
    "RCP 1 Reflected Ceiling Plan Lighting Fixtures",
    "Door Schedule D1 D2 D3",
    "Interior Elevations Guest Bath Vanity",
  ])

  const uploads = sanitizePlanUploads([
    {
      name: "hotel-plan-set.pdf",
      dataUrl: pdfDataUrl,
      note: "Guest room plan set",
      selectedSourcePages: [2, 4],
    },
  ])

  assert.equal(uploads.length, 1)
  assert.deepEqual(uploads[0].selectedSourcePages, [2, 4])

  const pages = await splitPlanUploadsToPages(uploads)
  assert.equal(pages.length, 4)
  assert.deepEqual(
    pages.map((page) => page.sourcePageNumber),
    [1, 2, 3, 4]
  )
  assert.deepEqual(
    pages.map((page) => page.selectedForAnalysis),
    [false, true, false, true]
  )
  assert.equal(pages[0].renderedFromPdf, true)
  assert.equal(pages[0].renderedImageAvailable, false)
  assert.equal(pages[1].renderedImageAvailable, true)
  assert.match(pages[1].imageDataUrl, /^data:image\/png;base64,/)
  assert.match(String(pages[1].extractedText || ""), /Reflected Ceiling Plan/i)

  const sheetIndex = await buildSheetIndex(pages)
  assert.equal(sheetIndex.length, 4)
  assert.equal(sheetIndex[1].uploadId, "plan_upload_1")
  assert.equal(sheetIndex[1].pageNumber, 2)
  assert.equal(sheetIndex[1].sourcePageNumber, 2)
  assert.equal(sheetIndex[1].pageLabel, "Page 2")
  assert.equal(sheetIndex[1].selectedForAnalysis, true)
  assert.equal(sheetIndex[1].renderedFromPdf, true)
  assert.equal(sheetIndex[1].renderedImageAvailable, true)
  assert.notEqual(sheetIndex[1].discipline, "unknown")
})

test("mixed pdf and image uploads preserve page ordering and source attribution", async () => {
  const pdfDataUrl = await makeRenderedPdfDataUrl([
    "A1.0 Floor Plan Guest Room",
    "E1.0 Electrical Schedule 10 outlets 4 switches 2 fixtures",
    "P1.0 Plumbing Fixture Schedule 6 toilets 8 lavatories",
  ])

  const uploads = sanitizePlanUploads([
    {
      name: "A-set.pdf",
      dataUrl: pdfDataUrl,
      note: "Architectural set",
      selectedSourcePages: [1, 3],
    },
    {
      name: "fixture-schedule.png",
      dataUrl: makeImageDataUrl(),
      note: "Fixture schedule",
      selectedSourcePages: [1],
    },
  ])

  const pages = await splitPlanUploadsToPages(uploads)
  assert.equal(pages.length, 4)

  assert.deepEqual(
    pages.map((page) => ({
      uploadId: page.uploadId,
      pageNumber: page.pageNumber,
      sourcePageNumber: page.sourcePageNumber,
      sourceKind: page.sourceKind,
    })),
    [
      {
        uploadId: "plan_upload_1",
        pageNumber: 1,
        sourcePageNumber: 1,
        sourceKind: "pdf",
      },
      {
        uploadId: "plan_upload_1",
        pageNumber: 2,
        sourcePageNumber: 2,
        sourceKind: "pdf",
      },
      {
        uploadId: "plan_upload_1",
        pageNumber: 3,
        sourcePageNumber: 3,
        sourceKind: "pdf",
      },
      {
        uploadId: "plan_upload_2",
        pageNumber: 4,
        sourcePageNumber: 1,
        sourceKind: "image",
      },
    ]
  )
  assert.equal(pages[0].renderedImageAvailable, true)
  assert.equal(pages[1].renderedImageAvailable, false)
  assert.equal(pages[2].renderedImageAvailable, true)
})

test("plan ingest no longer enforces the older 10-upload cap", () => {
  const uploads = sanitizePlanUploads(
    Array.from({ length: 12 }, (_, index) => ({
      name: `plan-${index + 1}.png`,
      dataUrl: makeImageDataUrl(),
      note: `Plan ${index + 1}`,
      selectedSourcePages: [1],
    }))
  )

  assert.equal(uploads.length, 12)
})

test("indexed-only fallback still works when page rendering input is not a real renderable pdf", async () => {
  const uploads = sanitizePlanUploads([
    {
      name: "indexed-only.pdf",
      dataUrl: makeIndexedPdfDataUrl(3),
      note: "Fallback index only",
      selectedSourcePages: [1, 2],
    },
  ])

  const pages = await splitPlanUploadsToPages(uploads)
  assert.equal(pages.length, 3)
  assert.equal(pages[0].renderedFromPdf, false)
  assert.equal(pages[0].renderedImageAvailable, false)
})
