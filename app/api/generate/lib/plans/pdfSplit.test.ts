import assert from "node:assert/strict"
import test from "node:test"

import { sanitizePlanUploads } from "./ingest"
import { splitPlanUploadsToPages } from "./pdfSplit"
import { buildSheetIndex } from "./sheetIndex"

function makePdfDataUrl(pageCount: number): string {
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
  const uploads = sanitizePlanUploads([
    {
      name: "hotel-plan-set.pdf",
      dataUrl: makePdfDataUrl(4),
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

  const sheetIndex = await buildSheetIndex(pages)
  assert.equal(sheetIndex.length, 4)
  assert.equal(sheetIndex[1].uploadId, "plan_upload_1")
  assert.equal(sheetIndex[1].pageNumber, 2)
  assert.equal(sheetIndex[1].sourcePageNumber, 2)
  assert.equal(sheetIndex[1].pageLabel, "Page 2")
  assert.equal(sheetIndex[1].selectedForAnalysis, true)
})

test("mixed pdf and image uploads preserve page ordering and source attribution", async () => {
  const uploads = sanitizePlanUploads([
    {
      name: "A-set.pdf",
      dataUrl: makePdfDataUrl(3),
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

