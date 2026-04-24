export const MAX_JOB_PLANS = 20
export const MAX_TOTAL_PLAN_PAYLOAD = 45_000_000
export const MAX_PLAN_SOURCE_PAGES = 120
export const MAX_PLAN_FILE_BYTES = 40 * 1024 * 1024
export const MAX_TOTAL_PLAN_FILE_BYTES = 90 * 1024 * 1024
export const PLAN_UPLOAD_STREAM_CHUNK_BYTES = 1024 * 1024
export const MAX_DERIVED_PLAN_FILE_BYTES = 28 * 1024 * 1024
export const MAX_SELECTED_PAGE_EXPORT_COUNT = 80

export const ALLOWED_PLAN_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])

const PDF_PAGE_PATTERN = /\/Type\s*\/Page\b/g

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

  if (originalBytes > MAX_PLAN_FILE_BYTES) {
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
