export const MAX_JOB_PLANS = 20
export const MAX_TOTAL_PLAN_PAYLOAD = 45_000_000
export const MAX_PLAN_SOURCE_PAGES = 120
export const MAX_PLAN_FILE_BYTES = 40 * 1024 * 1024
export const MAX_TOTAL_PLAN_FILE_BYTES = 90 * 1024 * 1024
export const PLAN_UPLOAD_STREAM_CHUNK_BYTES = 1024 * 1024

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
