export const MAX_JOB_PLANS = 20
export const MAX_TOTAL_PLAN_PAYLOAD = 45_000_000
export const MAX_PLAN_SOURCE_PAGES = 120
export const MAX_PLAN_FILE_BYTES = 40 * 1024 * 1024
export const MAX_TOTAL_PLAN_FILE_BYTES = 90 * 1024 * 1024
export const PLAN_UPLOAD_STREAM_CHUNK_BYTES = 1024 * 1024
export const MAX_FUNCTION_REQUEST_PAYLOAD_BYTES = 4 * 1024 * 1024
export const PLAN_UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024
export const MAX_DERIVED_PLAN_FILE_BYTES = 28 * 1024 * 1024
export const MAX_SELECTED_PAGE_EXPORT_COUNT = 80
export const PLAN_SELECTION_INDEXING_STATUS =
  "Indexing selected plan file(s) for page selection..."

export const ALLOWED_PLAN_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])

const PDF_PAGE_PATTERN = /\/Type\s*\/Page\b/g

export type PlanSourceKind = "image" | "pdf"

export type LocalPlanPageSelection = {
  sourcePageNumber: number
  label: string
  selected: boolean
}

export type PlanSelectedPageUploadMode =
  | "original"
  | "browser-derived-selected-pages"
  | "server-derived-selected-pages"
  | "original-fallback"

export type StagedPlanUploadSummary = {
  stagedUploadId: string
  name: string
  mimeType: string
  bytes: number
  originalBytes?: number | null
  sourcePageCount: number | null
  originalSourcePageCount?: number | null
  sourcePageNumberMap?: number[] | null
  selectedPageUploadMode?: PlanSelectedPageUploadMode
  selectedPageUploadNote?: string | null
}

export type PlanUploadBeginResponse = {
  ok: true
  uploadSessionId: string
  chunkBytes: number
}

export type PlanUploadStageSuccessResponse = {
  ok: true
  staged: StagedPlanUploadSummary[]
}

export type PlanUploadStageErrorResponse = {
  ok: false
  code: string
  message: string
}

export type PlanUploadModeSummary = {
  mode: PlanSelectedPageUploadMode
  label: string
  detail: string
  usedFallback: boolean
  reducedBeforeUpload: boolean
}

export function isSelectedPageExportCapacityError(error: unknown): boolean {
  const typedError = error as {
    status?: number
    code?: string
    message?: string
  }
  const code = String(typedError?.code || typedError?.message || "").toUpperCase()
  return (
    typedError?.status === 413 ||
    code.includes("DERIVED_PLAN_TOO_LARGE") ||
    code.includes("TOO_MANY_SELECTED_PAGES")
  )
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return String(error || "Unknown error.").trim()
}

export function resolvePlanUploadDisplayMode(args: {
  mode: PlanSelectedPageUploadMode | null | undefined
  sourceKind: PlanSourceKind
  selectedPages: number
  totalPages: number
  stagedUploadId?: string | null
}): PlanSelectedPageUploadMode {
  if (args.mode) return args.mode
  if (
    !args.stagedUploadId &&
    args.sourceKind === "pdf" &&
    args.selectedPages > 0 &&
    args.selectedPages < args.totalPages
  ) {
    return "browser-derived-selected-pages"
  }
  return "original"
}

export function buildPlanUploadStageSuccessResponse(
  staged: StagedPlanUploadSummary[]
): PlanUploadStageSuccessResponse {
  return {
    ok: true,
    staged,
  }
}

export function buildPlanUploadBeginResponse(uploadSessionId: string): PlanUploadBeginResponse {
  return {
    ok: true,
    uploadSessionId,
    chunkBytes: PLAN_UPLOAD_CHUNK_BYTES,
  }
}

export function buildPlanUploadStageErrorResponse(
  code: string,
  message: string
): PlanUploadStageErrorResponse {
  return {
    ok: false,
    code,
    message,
  }
}

export function normalizePlanUploadStageError(error: unknown): {
  status: number
  body: PlanUploadStageErrorResponse
} {
  const typedError = error as {
    status?: number
    code?: string
    message?: string
    name?: string
  }

  if (typedError?.status) {
    return {
      status: typedError.status,
      body: buildPlanUploadStageErrorResponse(
        typedError.code || "PLAN_UPLOAD_ERROR",
        typedError.message || "Plan upload failed."
      ),
    }
  }

  const message = String(typedError?.message || error || "").trim()
  const lowered = message.toLowerCase()

  if (
    lowered.includes("failed to parse body as formdata") ||
    lowered.includes("failed to parse form data") ||
    lowered.includes("multipart") ||
    lowered.includes("boundary") ||
    lowered.includes("unexpected end of form")
  ) {
    return {
      status: 400,
      body: buildPlanUploadStageErrorResponse(
        "INVALID_PLAN_UPLOAD_BODY",
        "Plan upload could not be parsed. Retry the upload, or split the PDF into smaller packages."
      ),
    }
  }

  if (
    lowered.includes("body too large") ||
    lowered.includes("request entity too large") ||
    lowered.includes("payload too large") ||
    lowered.includes("function_payload_too_large")
  ) {
    return {
      status: 413,
      body: buildPlanUploadStageErrorResponse(
        "PLAN_UPLOAD_TOO_LARGE",
        "Plan upload is too large for staging. Reduce selected pages further or split the PDF into smaller packages."
      ),
    }
  }

  if (
    lowered.includes("enospc") ||
    lowered.includes("no space left") ||
    lowered.includes("eacces") ||
    lowered.includes("eperm") ||
    lowered.includes("read-only file system") ||
    lowered.includes("erofs")
  ) {
    return {
      status: 500,
      body: buildPlanUploadStageErrorResponse(
        "PLAN_STAGING_UNAVAILABLE",
        "Plan staging is temporarily unavailable on the server. Retry the upload, or split the PDF into smaller packages."
      ),
    }
  }

  return {
    status: 500,
    body: buildPlanUploadStageErrorResponse("PLAN_UPLOAD_ERROR", "Plan upload failed."),
  }
}

export async function readPlanUploadStageErrorMessage(response: Response): Promise<string> {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase()

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as Partial<PlanUploadStageErrorResponse> | null
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim()
    }
  } else {
    const text = (await response.text().catch(() => "")).trim()
    const normalizedText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const looksLikeGenericHtml =
      !normalizedText ||
      /^payload too large$/i.test(normalizedText) ||
      /^request entity too large$/i.test(normalizedText)

    if (normalizedText && !looksLikeGenericHtml) {
      return normalizedText
    }
  }

  if (response.status === 413) {
    return "Plan upload is too large for staging. Reduce selected pages further or split the PDF into smaller packages."
  }

  if (response.status === 403) {
    return "Invalid request origin."
  }

  if (response.status === 400) {
    return "Plan upload could not be parsed. Retry the upload, or split the PDF into smaller packages."
  }

  return "Could not stage selected plan file(s)."
}

export function countPdfPagesFromBytes(bytes: Uint8Array): number {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return 0

  const decoder = new TextDecoder("latin1")
  const text = decoder.decode(bytes)
  const matches = text.match(PDF_PAGE_PATTERN)
  return matches?.length ?? 0
}

export function clampPlanSourcePageCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 1
  return Math.max(1, Math.min(MAX_PLAN_SOURCE_PAGES, Math.floor(count)))
}

function getLocalPlanIndexingErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return String(error || "Unknown PDF indexing error.").trim()
}

export function getPlanSourceKind(file: Pick<File, "type">): PlanSourceKind {
  return file.type === "application/pdf" ? "pdf" : "image"
}

export async function getLocalPlanSourcePageCount(file: File): Promise<number> {
  if (getPlanSourceKind(file) !== "pdf") return 1

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (error) {
    throw new Error(`Could not read ${file.name} for local page indexing: ${getLocalPlanIndexingErrorMessage(error)}`)
  }

  try {
    const { PDFDocument } = await import("pdf-lib")
    const pdf = await PDFDocument.load(bytes)
    const pageCount = pdf.getPageCount()
    if (pageCount > 0) return clampPlanSourcePageCount(pageCount)
  } catch (error) {
    const countedPages = countPdfPagesFromBytes(bytes)
    if (countedPages > 0) return clampPlanSourcePageCount(countedPages)

    throw new Error(`Could not index pages in ${file.name}: ${getLocalPlanIndexingErrorMessage(error)}`)
  }

  const countedPages = countPdfPagesFromBytes(bytes)
  if (countedPages > 0) return clampPlanSourcePageCount(countedPages)

  throw new Error(`Could not index pages in ${file.name}: no PDF pages were detected.`)
}

export function defaultSelectLocalPlanPage(args: {
  sourceKind: PlanSourceKind
  totalPages: number
  name: string
  note: string
}): boolean {
  if (args.sourceKind === "pdf" && args.totalPages > 1) return true

  const blob = `${args.name} ${args.note}`.toLowerCase()
  if (
    /\bcover\b|\bindex\b|\bgeneral notes?\b|\bcode\b|\blife safety\b|\blegend\b|\bsymbols?\b|\babbreviations?\b/.test(
      blob
    )
  ) {
    return false
  }

  return true
}

export function buildLocalPlanPageSelection(args: {
  sourceKind: PlanSourceKind
  totalPages: number
  name: string
  note: string
}): LocalPlanPageSelection[] {
  const totalPages = Math.max(1, Math.floor(Number(args.totalPages) || 0))
  const defaultSelected = defaultSelectLocalPlanPage(args)

  return Array.from({ length: totalPages }, (_, index) => ({
    sourcePageNumber: index + 1,
    label: args.sourceKind === "pdf" ? `Page ${index + 1}` : "Image 1",
    selected: defaultSelected,
  }))
}

export function getPlanSelectionIntakeIssue(args: {
  currentIndexedPages: number
  nextIndexedPages: number
  maxIndexedPages?: number
}): string | null {
  const maxIndexedPages =
    typeof args.maxIndexedPages === "number" && Number.isFinite(args.maxIndexedPages)
      ? args.maxIndexedPages
      : MAX_PLAN_SOURCE_PAGES
  const currentIndexedPages = Math.max(0, Math.floor(Number(args.currentIndexedPages) || 0))
  const nextIndexedPages = Math.max(0, Math.floor(Number(args.nextIndexedPages) || 0))

  if (currentIndexedPages + nextIndexedPages > maxIndexedPages) {
    return `Indexed plan pages exceeded the ${maxIndexedPages}-page limit.`
  }

  return null
}

export function validateDerivedPlanBytes(bytes: number) {
  if (bytes > MAX_DERIVED_PLAN_FILE_BYTES) {
    throw Object.assign(new Error("DERIVED_PLAN_TOO_LARGE"), {
      status: 413,
      code: "DERIVED_PLAN_TOO_LARGE",
      message:
        `Selected-page PDF is still too large after extraction. Reduce selected pages further or split the plan set into smaller packages.`,
    })
  }
}

export function validateSelectedPageExtractionCount(selectedPages: number[]) {
  if (selectedPages.length > MAX_SELECTED_PAGE_EXPORT_COUNT) {
    throw Object.assign(new Error("TOO_MANY_SELECTED_PAGES"), {
      status: 413,
      code: "TOO_MANY_SELECTED_PAGES",
      message:
        `Selected-page export is limited to ${MAX_SELECTED_PAGE_EXPORT_COUNT} PDF pages per plan. Reduce selected pages further or split the plan set.`,
    })
  }
}

export function validateCombinedPlanBytes(totalBytes: number) {
  if (totalBytes > MAX_TOTAL_PLAN_FILE_BYTES) {
    throw Object.assign(new Error("PLAN_UPLOAD_TOO_LARGE"), {
      status: 413,
      code: "PLAN_UPLOAD_TOO_LARGE",
      message: `Combined plan upload size exceeds ${Math.floor(MAX_TOTAL_PLAN_FILE_BYTES / (1024 * 1024))} MB.`,
    })
  }
}

export function buildSelectedPageUploadFallbackMessage(args: {
  name: string
  selectedPages: number
  totalPages: number
}): string | null {
  if (
    args.selectedPages > 0 &&
    args.totalPages > 1 &&
    args.selectedPages < args.totalPages
  ) {
    return `${args.name}: reduced selected-page PDF export is not available in the browser, so the original PDF will upload through reliable chunked staging before selected-page extraction.`
  }

  return null
}

export function formatPlanUploadBytes(bytes: number | null | undefined): string {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  if (value < 1024) return `${Math.round(value)} B`

  const kb = value / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`

  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`

  const gb = mb / 1024
  return `${gb.toFixed(1)} GB`
}

export function getSelectedPageUploadModeSummary(
  mode: PlanSelectedPageUploadMode | null | undefined
): PlanUploadModeSummary {
  switch (mode) {
    case "browser-derived-selected-pages":
      return {
        mode,
        label: "Browser-derived selected pages",
        detail: "Selected pages were reduced in the browser before the first upload.",
        usedFallback: false,
        reducedBeforeUpload: true,
      }
    case "server-derived-selected-pages":
      return {
        mode,
        label: "Server-derived selected pages",
        detail: "The original upload was staged first, then reduced to selected pages on the server.",
        usedFallback: true,
        reducedBeforeUpload: false,
      }
    case "original-fallback":
      return {
        mode,
        label: "Original PDF fallback",
        detail: "Selected-page reduction was attempted, but the original PDF had to upload through the fallback path.",
        usedFallback: true,
        reducedBeforeUpload: false,
      }
    case "original":
    default:
      return {
        mode: "original",
        label: "Original PDF",
        detail: "The original PDF uploaded without selected-page reduction.",
        usedFallback: false,
        reducedBeforeUpload: false,
      }
  }
}

export function buildSelectedPageUploadDebugSummary(args: {
  mode: PlanSelectedPageUploadMode | null | undefined
  originalBytes: number | null | undefined
  stagedBytes: number | null | undefined
  analyzedPages?: number | null | undefined
  originalSourcePageCount?: number | null | undefined
}): string {
  const summary = getSelectedPageUploadModeSummary(args.mode)
  const originalBytes = Number(args.originalBytes)
  const stagedBytes = Number(args.stagedBytes)
  const originalText = formatPlanUploadBytes(originalBytes)
  const stagedText = formatPlanUploadBytes(stagedBytes)

  const reductionText =
    Number.isFinite(originalBytes) &&
    originalBytes > 0 &&
    Number.isFinite(stagedBytes) &&
    stagedBytes > 0 &&
    stagedBytes < originalBytes
      ? `Reduced first upload from ${originalText} to ${stagedText}.`
      : `First upload used ${stagedText}.`

  const analyzedPages =
    typeof args.analyzedPages === "number" && Number.isFinite(args.analyzedPages) && args.analyzedPages > 0
      ? ` Selected pages: ${args.analyzedPages}.`
      : ""
  const originalPages =
    typeof args.originalSourcePageCount === "number" &&
    Number.isFinite(args.originalSourcePageCount) &&
    args.originalSourcePageCount > 0
      ? ` Original source pages: ${args.originalSourcePageCount}.`
      : ""

  return `${summary.label}. ${reductionText}${originalPages}${analyzedPages}`.trim()
}

export function buildSelectedPageUploadModeNote(args: {
  name: string
  mode: PlanSelectedPageUploadMode | null | undefined
  originalBytes?: number | null | undefined
  stagedBytes?: number | null | undefined
}): string {
  const summary = getSelectedPageUploadModeSummary(args.mode)
  const base = `${args.name}: ${summary.detail}`

  const originalBytes = Number(args.originalBytes)
  const stagedBytes = Number(args.stagedBytes)
  if (
    Number.isFinite(originalBytes) &&
    originalBytes > 0 &&
    Number.isFinite(stagedBytes) &&
    stagedBytes > 0 &&
    stagedBytes < originalBytes
  ) {
    return `${base} Upload reduced from ${formatPlanUploadBytes(originalBytes)} to ${formatPlanUploadBytes(stagedBytes)}.`
  }

  if (Number.isFinite(stagedBytes) && stagedBytes > 0) {
    return `${base} First upload used ${formatPlanUploadBytes(stagedBytes)}.`
  }

  return base
}

export type BrowserSelectedPdfExportResult = {
  file: File
  bytes: number
  sourcePageNumberMap: number[]
}

export async function exportSelectedPdfInBrowser(args: {
  file: File
  selectedSourcePages: number[]
}): Promise<BrowserSelectedPdfExportResult | null> {
  if (args.file.type !== "application/pdf") return null

  const selectedSourcePages = Array.from(
    new Set(
      args.selectedSourcePages
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  )

  if (!selectedSourcePages.length) return null

  validateSelectedPageExtractionCount(selectedSourcePages)

  const { PDFDocument } = await import("pdf-lib")
  const sourceBytes = await args.file.arrayBuffer()
  const sourcePdf = await PDFDocument.load(sourceBytes)
  const derivedPdf = await PDFDocument.create()

  const pageIndexes = selectedSourcePages
    .map((sourcePageNumber) => sourcePageNumber - 1)
    .filter((pageIndex) => pageIndex >= 0 && pageIndex < sourcePdf.getPageCount())

  if (!pageIndexes.length) return null

  const copiedPages = await derivedPdf.copyPages(sourcePdf, pageIndexes)
  for (const page of copiedPages) {
    derivedPdf.addPage(page)
  }

  const derivedBytes = await derivedPdf.save()
  validateDerivedPlanBytes(derivedBytes.byteLength)

  const baseName = args.file.name.replace(/\.pdf$/i, "") || "selected-pages"
  const derivedFile = new File([new Uint8Array(derivedBytes)], `${baseName}.selected-pages.pdf`, {
    type: "application/pdf",
    lastModified: Date.now(),
  })

  return {
    file: derivedFile,
    bytes: derivedBytes.byteLength,
    sourcePageNumberMap: selectedSourcePages.slice(0, copiedPages.length),
  }
}

export function estimateSelectedPdfBytes(args: {
  originalBytes: number
  selectedPages: number
  totalPages: number
}): number {
  const originalBytes = Number(args.originalBytes) || 0
  const selectedPages = Math.max(0, Math.floor(Number(args.selectedPages) || 0))
  const totalPages = Math.max(1, Math.floor(Number(args.totalPages) || 0))

  if (originalBytes <= 0 || selectedPages <= 0) return 0
  if (selectedPages >= totalPages) return originalBytes

  const ratio = selectedPages / totalPages
  const estimated = Math.ceil(originalBytes * Math.max(0.12, Math.min(1, ratio + 0.04)))
  return Math.min(originalBytes, estimated)
}

export function getPlanUploadPreflightIssue(args: {
  name: string
  sourceKind: "image" | "pdf"
  originalBytes: number
  totalPages: number
  selectedPages: number
}): string | null {
  const selectedPages = Math.max(0, Math.floor(Number(args.selectedPages) || 0))
  const totalPages = Math.max(1, Math.floor(Number(args.totalPages) || 0))
  const originalBytes = Math.max(0, Math.floor(Number(args.originalBytes) || 0))

  if (!selectedPages) {
    return `No pages selected for ${args.name}. Select at least one page or remove the plan.`
  }

  const usesSelectedPdfSubset =
    args.sourceKind === "pdf" && selectedPages > 0 && selectedPages < totalPages

  if (originalBytes > MAX_TOTAL_PLAN_FILE_BYTES) {
    return `${args.name} still exceeds the ${Math.floor(MAX_TOTAL_PLAN_FILE_BYTES / (1024 * 1024))} MB reliable upload limit. Reduce selected pages further or split the PDF into smaller packages.`
  }

  if (originalBytes > MAX_PLAN_FILE_BYTES && !usesSelectedPdfSubset) {
    return `${args.name} exceeds the ${Math.floor(MAX_PLAN_FILE_BYTES / (1024 * 1024))} MB upload limit. Split the PDF into smaller packages before generating.`
  }

  if (args.sourceKind === "pdf" && selectedPages > MAX_SELECTED_PAGE_EXPORT_COUNT) {
    return `${args.name} has ${selectedPages} selected pages, above the ${MAX_SELECTED_PAGE_EXPORT_COUNT}-page selected-export limit. Reduce selected pages or split the plan set.`
  }

  const estimatedTransportBytes =
    args.sourceKind === "pdf"
      ? estimateSelectedPdfBytes({
          originalBytes,
          selectedPages,
          totalPages,
        })
      : originalBytes

  if (args.sourceKind === "pdf" && estimatedTransportBytes > MAX_DERIVED_PLAN_FILE_BYTES) {
    return `${args.name} is still too large after selected-page reduction. Reduce selected pages further or split the PDF into smaller packages.`
  }

  return null
}
