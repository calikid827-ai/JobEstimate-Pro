import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import {
  appendStagedPlanUploadChunk,
  beginStagedPlanUploadSession,
  cleanupStagedPlanUpload,
  cleanupStagedPlanUploadSession,
  completeStagedPlanUploadSession,
  finalizeSelectedPageStagedUpload,
  stagePlanUpload,
} from "./staging"
import { MAX_TOTAL_PLAN_FILE_BYTES, validateCombinedPlanBytes } from "../../../../lib/plan-upload"

const require = createRequire(import.meta.url)
const PDFDocument = require("pdfkit")

async function makePdfFile(pages: string[]): Promise<File> {
  const doc = new PDFDocument({ autoFirstPage: false, margin: 36 })
  const chunks: Buffer[] = []

  doc.on("data", (chunk: Buffer) => chunks.push(chunk))

  for (const text of pages) {
    doc.addPage({ size: [612, 792], margin: 36 })
    doc.fontSize(18).text(text, 48, 48, { width: 500 })
  }

  doc.end()

  const bytes = await new Promise<Buffer>((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)))
    doc.once("error", reject)
  })

  return new File([new Uint8Array(bytes)], "hotel-set.pdf", { type: "application/pdf" })
}

test("staging computes pdf source page count while streaming without pre-reading the full file", async () => {
  const file = await makePdfFile([
    "Cover sheet",
    "A1.1 floor plan guest room",
    "A8.1 finish plan guest room repaint",
  ])

  const manifest = await stagePlanUpload({
    file,
    sourcePageCount: null,
  })

  try {
    assert.equal(manifest.mimeType, "application/pdf")
    assert.equal(manifest.sourcePageCount, 3)
    assert(manifest.bytes > 0)
  } finally {
    await cleanupStagedPlanUpload(manifest.stagedUploadId)
  }
})

test("staged upload oversized validation keeps clear 413 recovery text", () => {
  assert.throws(
    () => validateCombinedPlanBytes(MAX_TOTAL_PLAN_FILE_BYTES + 1),
    /Combined plan upload size exceeds/
  )
})

test("selected pages can be finalized into a smaller staged pdf artifact before downstream analysis", async () => {
  const file = await makePdfFile([
    "Cover sheet general notes",
    "A1.1 floor plan guest room cluster",
    "A8.1 finish plan guest room repaint walls ceilings",
    "A9.1 interior elevations guest bath tile shower wall",
    "A9.2 interior elevations vanity backsplash wet area",
    "RCP reflected ceiling plan lighting fixtures guest room",
    "E1.0 electrical schedule receptacles switches fixtures",
    "P1.0 plumbing fixture schedule toilets lavatories shower valves",
  ])

  const session = await beginStagedPlanUploadSession({
    uploadId: "plan_upload_1",
    name: "hotel-set.pdf",
    mimeType: "application/pdf",
    expectedBytes: file.size,
    sourcePageCount: 8,
    selectedSourcePages: [2, 4],
  })

  const bytes = new Uint8Array(await file.arrayBuffer())
  for (let offset = 0; offset < bytes.byteLength; offset += 1024) {
    await appendStagedPlanUploadChunk({
      uploadSessionId: session.uploadSessionId,
      chunk: bytes.slice(offset, offset + 1024),
    })
  }

  const completed = await completeStagedPlanUploadSession(session.uploadSessionId)
  const finalized = await finalizeSelectedPageStagedUpload({
    stagedUploadId: completed.stagedUploadId,
    selectedSourcePages: [2, 4],
  })

  try {
    assert(finalized)
    assert.equal(finalized?.selectedPageUploadMode, "server-derived-selected-pages")
    assert.deepEqual(finalized?.sourcePageNumberMap, [2, 4])
    assert.equal(finalized?.sourcePageCount, 2)
    assert.equal(finalized?.originalSourcePageCount, 8)
    assert.equal(finalized?.originalBytes, file.size)
    assert(finalized!.bytes > 0)
    assert.match(String(finalized?.selectedPageUploadNote || ""), /reduced to selected pages on the server/i)
  } finally {
    await cleanupStagedPlanUpload(completed.stagedUploadId)
    await cleanupStagedPlanUploadSession(session.uploadSessionId)
  }
})

test("browser-derived selected-page uploads preserve original source numbering through staging", async () => {
  const file = await makePdfFile([
    "Cover sheet general notes",
    "A1.1 floor plan guest room cluster",
    "A8.1 finish plan guest room repaint walls ceilings",
    "A9.1 interior elevations guest bath tile shower wall",
  ])

  const reducedFile = await makePdfFile([
    "A1.1 floor plan guest room cluster",
    "A9.1 interior elevations guest bath tile shower wall",
  ])

  const session = await beginStagedPlanUploadSession({
    uploadId: "plan_upload_browser_1",
    name: "hotel-set.selected-pages.pdf",
    mimeType: "application/pdf",
    expectedBytes: reducedFile.size,
    originalBytes: file.size,
    sourcePageCount: 2,
    originalSourcePageCount: 4,
    sourcePageNumberMap: [2, 4],
    selectedPageUploadMode: "browser-derived-selected-pages",
    selectedSourcePages: [2, 4],
  })

  const bytes = new Uint8Array(await reducedFile.arrayBuffer())
  await appendStagedPlanUploadChunk({
    uploadSessionId: session.uploadSessionId,
    chunk: bytes,
  })

  const completed = await completeStagedPlanUploadSession(session.uploadSessionId)
  const finalized = await finalizeSelectedPageStagedUpload({
    stagedUploadId: completed.stagedUploadId,
    selectedSourcePages: [2, 4],
  })

  try {
    assert(finalized)
    assert.equal(finalized?.selectedPageUploadMode, "browser-derived-selected-pages")
    assert.deepEqual(finalized?.sourcePageNumberMap, [2, 4])
    assert.equal(finalized?.sourcePageCount, 2)
    assert.equal(finalized?.originalSourcePageCount, 4)
    assert.equal(finalized?.originalBytes, file.size)
    assert.equal(finalized?.bytes, reducedFile.size)
    assert.match(String(finalized?.selectedPageUploadNote || ""), /reduced in the browser before the first upload/i)
  } finally {
    await cleanupStagedPlanUpload(completed.stagedUploadId)
    await cleanupStagedPlanUploadSession(session.uploadSessionId)
  }
})

test("fallback mode stays explicit when server-side selected-page derivation cannot be completed", async () => {
  const invalidPdfBytes = Buffer.from(
    [
      "%PDF-1.4",
      "<< /Type /Page /PageNum 1 >>",
      "<< /Type /Page /PageNum 2 >>",
      "<< /Type /Page /PageNum 3 >>",
      "%%EOF",
    ].join("\n"),
    "utf8"
  )

  const file = new File([new Uint8Array(invalidPdfBytes)], "indexed-only.pdf", {
    type: "application/pdf",
  })

  const session = await beginStagedPlanUploadSession({
    uploadId: "plan_upload_fallback_1",
    name: "indexed-only.pdf",
    mimeType: "application/pdf",
    expectedBytes: file.size,
    sourcePageCount: 3,
    selectedSourcePages: [1, 2],
  })

  const bytes = new Uint8Array(await file.arrayBuffer())
  await appendStagedPlanUploadChunk({
    uploadSessionId: session.uploadSessionId,
    chunk: bytes,
  })

  const completed = await completeStagedPlanUploadSession(session.uploadSessionId)
  const finalized = await finalizeSelectedPageStagedUpload({
    stagedUploadId: completed.stagedUploadId,
    selectedSourcePages: [1, 2],
  })

  try {
    assert(finalized)
    assert.equal(finalized?.selectedPageUploadMode, "original-fallback")
    assert.equal(finalized?.bytes, file.size)
    assert.equal(finalized?.originalBytes, file.size)
    assert.match(String(finalized?.selectedPageUploadNote || ""), /fallback path/i)
    assert.match(String(finalized?.selectedPageUploadNote || ""), /First upload used/i)
  } finally {
    await cleanupStagedPlanUpload(completed.stagedUploadId)
    await cleanupStagedPlanUploadSession(session.uploadSessionId)
  }
})
