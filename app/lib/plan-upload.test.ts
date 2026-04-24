import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import {
  buildSelectedPageUploadModeNote,
  buildSelectedPageUploadDebugSummary,
  buildSelectedPageUploadFallbackMessage,
  buildPlanUploadStageErrorResponse,
  buildPlanUploadStageSuccessResponse,
  exportSelectedPdfInBrowser,
  formatPlanUploadBytes,
  estimateSelectedPdfBytes,
  getPlanUploadPreflightIssue,
  getSelectedPageUploadModeSummary,
  MAX_DERIVED_PLAN_FILE_BYTES,
  MAX_PLAN_FILE_BYTES,
  MAX_SELECTED_PAGE_EXPORT_COUNT,
  normalizePlanUploadStageError,
  readPlanUploadStageErrorMessage,
} from "./plan-upload"

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

test("selected-page export estimates smaller transport bytes than the original pdf", () => {
  const estimated = estimateSelectedPdfBytes({
    originalBytes: 24 * 1024 * 1024,
    selectedPages: 8,
    totalPages: 40,
  })

  assert(estimated > 0)
  assert(estimated < 24 * 1024 * 1024)
})

test("preflight blocks when no plan pages are selected", () => {
  const issue = getPlanUploadPreflightIssue({
    name: "hotel-set.pdf",
    sourceKind: "pdf",
    originalBytes: 12 * 1024 * 1024,
    totalPages: 30,
    selectedPages: 0,
  })

  assert.match(String(issue || ""), /No pages selected/i)
})

test("preflight gives clear recovery guidance when selected-page export is still too large", () => {
  const issue = getPlanUploadPreflightIssue({
    name: "large-hotel-set.pdf",
    sourceKind: "pdf",
    originalBytes: Math.max(MAX_PLAN_FILE_BYTES - 1, MAX_DERIVED_PLAN_FILE_BYTES + 1),
    totalPages: MAX_SELECTED_PAGE_EXPORT_COUNT,
    selectedPages: MAX_SELECTED_PAGE_EXPORT_COUNT,
  })

  assert.match(String(issue || ""), /still too large after selected-page reduction/i)
  assert.match(String(issue || ""), /Reduce selected pages further or split the PDF/i)
})

test("preflight allows larger original pdfs on the reliable chunked path when selected pages are narrowed", () => {
  const issue = getPlanUploadPreflightIssue({
    name: "hotel-set.pdf",
    sourceKind: "pdf",
    originalBytes: MAX_PLAN_FILE_BYTES + 5 * 1024 * 1024,
    totalPages: 120,
    selectedPages: 12,
  })

  assert.equal(issue, null)
})

test("stage upload success response shape stays stable", () => {
  const response = buildPlanUploadStageSuccessResponse([
    {
      stagedUploadId: "plan_stage_1",
      name: "hotel-set.pdf",
      mimeType: "application/pdf",
      bytes: 1024,
      sourcePageCount: 12,
    },
  ])

  assert.deepEqual(response, {
    ok: true,
    staged: [
      {
        stagedUploadId: "plan_stage_1",
        name: "hotel-set.pdf",
        mimeType: "application/pdf",
        bytes: 1024,
        sourcePageCount: 12,
      },
    ],
  })
})

test("stage upload error response shape stays stable", () => {
  const response = buildPlanUploadStageErrorResponse(
    "PLAN_UPLOAD_TOO_LARGE",
    "Combined plan upload size exceeds 90 MB."
  )

  assert.deepEqual(response, {
    ok: false,
    code: "PLAN_UPLOAD_TOO_LARGE",
    message: "Combined plan upload size exceeds 90 MB.",
  })
})

test("stage upload error normalization preserves typed same-origin failures", () => {
  const normalized = normalizePlanUploadStageError({
    status: 403,
    code: "BAD_ORIGIN",
    message: "Invalid request origin.",
  })

  assert.equal(normalized.status, 403)
  assert.deepEqual(normalized.body, {
    ok: false,
    code: "BAD_ORIGIN",
    message: "Invalid request origin.",
  })
})

test("stage upload error normalization converts multipart parse failures into structured 400s", () => {
  const normalized = normalizePlanUploadStageError(
    new Error("Failed to parse body as FormData.")
  )

  assert.equal(normalized.status, 400)
  assert.equal(normalized.body.ok, false)
  assert.equal(normalized.body.code, "INVALID_PLAN_UPLOAD_BODY")
  assert.match(normalized.body.message, /could not be parsed/i)
})

test("stage upload error normalization converts oversize parser failures into structured 413s", () => {
  const normalized = normalizePlanUploadStageError(new Error("Request entity too large"))

  assert.equal(normalized.status, 413)
  assert.equal(normalized.body.code, "PLAN_UPLOAD_TOO_LARGE")
  assert.match(normalized.body.message, /too large for staging/i)
})

test("client stage upload error parsing surfaces structured json messages", async () => {
  const response = new Response(
    JSON.stringify({
      ok: false,
      code: "PLAN_UPLOAD_TOO_LARGE",
      message: "Reduce selected pages further.",
    }),
    {
      status: 413,
      headers: { "content-type": "application/json" },
    }
  )

  assert.equal(await readPlanUploadStageErrorMessage(response), "Reduce selected pages further.")
})

test("client stage upload error parsing falls back to clear 413 recovery text", async () => {
  const response = new Response("<html><body>Payload Too Large</body></html>", {
    status: 413,
    headers: { "content-type": "text/html" },
  })

  assert.equal(
    await readPlanUploadStageErrorMessage(response),
    "Plan upload is too large for staging. Reduce selected pages further or split the PDF into smaller packages."
  )
})

test("selected-page upload fallback messaging is explicit when browser-side reduction is unavailable", () => {
  const message = buildSelectedPageUploadFallbackMessage({
    name: "hotel-set.pdf",
    selectedPages: 8,
    totalPages: 40,
  })

  assert.match(String(message || ""), /reduced selected-page pdf export is not available/i)
  assert.match(String(message || ""), /reliable chunked staging/i)
})

test("upload mode summary stays explicit for browser-derived, server-derived, fallback, and original modes", () => {
  assert.deepEqual(getSelectedPageUploadModeSummary("browser-derived-selected-pages"), {
    mode: "browser-derived-selected-pages",
    label: "Browser-derived selected pages",
    detail: "Selected pages were reduced in the browser before the first upload.",
    usedFallback: false,
    reducedBeforeUpload: true,
  })

  assert.deepEqual(getSelectedPageUploadModeSummary("server-derived-selected-pages"), {
    mode: "server-derived-selected-pages",
    label: "Server-derived selected pages",
    detail: "The original upload was staged first, then reduced to selected pages on the server.",
    usedFallback: true,
    reducedBeforeUpload: false,
  })

  assert.deepEqual(getSelectedPageUploadModeSummary("original-fallback"), {
    mode: "original-fallback",
    label: "Original PDF fallback",
    detail: "Selected-page reduction was attempted, but the original PDF had to upload through the fallback path.",
    usedFallback: true,
    reducedBeforeUpload: false,
  })

  assert.deepEqual(getSelectedPageUploadModeSummary("original"), {
    mode: "original",
    label: "Original PDF",
    detail: "The original PDF uploaded without selected-page reduction.",
    usedFallback: false,
    reducedBeforeUpload: false,
  })
})

test("upload debug summary distinguishes original and reduced staged bytes clearly", () => {
  assert.equal(formatPlanUploadBytes(12 * 1024 * 1024), "12.0 MB")

  const summary = buildSelectedPageUploadDebugSummary({
    mode: "browser-derived-selected-pages",
    originalBytes: 48 * 1024 * 1024,
    stagedBytes: 11 * 1024 * 1024,
    analyzedPages: 6,
    originalSourcePageCount: 24,
  })

  assert.match(summary, /Browser-derived selected pages/i)
  assert.match(summary, /Reduced first upload from 48.0 MB to 11.0 MB/i)
  assert.match(summary, /Original source pages: 24/i)
  assert.match(summary, /Selected pages: 6/i)
})

test("upload mode note makes fallback and server-derived recovery explicit", () => {
  const serverDerived = buildSelectedPageUploadModeNote({
    name: "hotel-set.pdf",
    mode: "server-derived-selected-pages",
    originalBytes: 40 * 1024 * 1024,
    stagedBytes: 9 * 1024 * 1024,
  })

  assert.match(serverDerived, /hotel-set\.pdf:/i)
  assert.match(serverDerived, /reduced to selected pages on the server/i)
  assert.match(serverDerived, /Upload reduced from 40.0 MB to 9.0 MB/i)

  const fallback = buildSelectedPageUploadModeNote({
    name: "hotel-set.pdf",
    mode: "original-fallback",
    stagedBytes: 40 * 1024 * 1024,
  })

  assert.match(fallback, /fallback path/i)
  assert.match(fallback, /First upload used 40.0 MB/i)
})

test("browser-side selected-page export creates a reduced pdf artifact with original source numbering", async () => {
  const file = await makePdfFile([
    "Cover sheet general notes",
    "A1.1 floor plan",
    "A8.1 finish plan repaint",
    "A9.1 elevations tile shower wall",
    "RCP reflected ceiling plan",
    "P1 fixture schedule",
  ])

  const derived = await exportSelectedPdfInBrowser({
    file,
    selectedSourcePages: [2, 4, 6],
  })

  assert(derived)
  assert.deepEqual(derived?.sourcePageNumberMap, [2, 4, 6])
  assert(derived!.bytes > 0)
  assert(derived!.bytes < file.size)
  assert.equal(derived?.file.type, "application/pdf")
})
