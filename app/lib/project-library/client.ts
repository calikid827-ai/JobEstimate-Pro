import { PROJECT_LIMITS, type ProjectFile, type ProjectInventory, type UploadTicket } from "./types"

function checkCurrent(isCurrent: () => boolean, signal?: AbortSignal) {
  if (signal?.aborted || !isCurrent()) throw new Error("Project or owner changed. Transfer stopped; reselect the original to resume its retained upload.")
}
function storageURL(value: string, endpoint: string) {
  const url = new URL(value, endpoint), allowed = new URL(endpoint)
  if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname + "/") || url.username || url.password || url.search || url.hash) throw new Error("Storage returned an unexpected upload location.")
  return url.href
}
const offsetOf = (response: Response, size: number) => {
  const raw = response.headers.get("Upload-Offset")
  const offset = raw !== null && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) throw new Error("Storage returned an invalid upload offset.")
  return offset
}

/** Native TUS creation/HEAD/PATCH adapter. No file bytes pass through estimate APIs. */
export async function uploadProjectOriginal(options: {
  file: Blob; record: ProjectFile; ticket: UploadTicket; fetcher: typeof fetch;
  isCurrent: () => boolean; signal?: AbortSignal;
  onSession: (url: string) => Promise<void>; onProgress?: (uploaded: number, total: number) => void;
}) {
  const { file, record, ticket, fetcher, isCurrent, signal, onSession, onProgress } = options
  if (file.size !== record.size || file.size > PROJECT_LIMITS.maxFileBytes || ticket.chunkBytes !== PROJECT_LIMITS.chunkBytes) throw new Error("Original size or authorized transfer chunk does not match.")
  const endpoint = new URL(ticket.endpoint)
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))) throw new Error("Storage transfers require HTTPS or a controlled loopback test service.")
  const baseHeaders = { ...ticket.headers, "Tus-Resumable": "1.0.0" }
  let uploadUrl = record.uploadUrl ? storageURL(record.uploadUrl, ticket.endpoint) : "", offset = 0
  if (uploadUrl) {
    checkCurrent(isCurrent, signal)
    const head = await fetcher(uploadUrl, { method: "HEAD", headers: baseHeaders, signal, redirect: "error", credentials: "omit" })
    if (head.ok) offset = offsetOf(head, file.size)
    else if ([404, 410].includes(head.status)) uploadUrl = ""
    else throw new Error(`Storage resume failed (${head.status}). Retry this file; other files remain retained.`)
  }
  if (!uploadUrl) {
    checkCurrent(isCurrent, signal)
    const encode = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    const metadata = Object.entries({ bucketName: ticket.bucket, objectName: ticket.objectKey, contentType: record.mimeType, cacheControl: "3600" }).map(([key, value]) => `${key} ${encode(value)}`).join(",")
    const created = await fetcher(ticket.endpoint, { method: "POST", headers: { ...baseHeaders, "Upload-Length": String(file.size), "Upload-Metadata": metadata, "x-upsert": "false" }, signal, redirect: "error", credentials: "omit" })
    if (!created.ok || !created.headers.get("Location")) throw new Error(`Storage creation failed (${created.status}). Retry this file; no other upload was restarted.`)
    uploadUrl = storageURL(created.headers.get("Location")!, ticket.endpoint)
    checkCurrent(isCurrent, signal)
    await onSession(uploadUrl)
  }
  onProgress?.(offset, file.size)
  while (offset < file.size) {
    checkCurrent(isCurrent, signal)
    const end = Math.min(file.size, offset + ticket.chunkBytes)
    const response = await fetcher(uploadUrl, { method: "PATCH", headers: { ...baseHeaders, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" }, body: file.slice(offset, end), signal, redirect: "error", credentials: "omit" })
    if (!response.ok) throw new Error(`Storage transfer paused (${response.status}). Retry this file to resume from storage's confirmed offset.`)
    const received = offsetOf(response, file.size)
    if (received <= offset || received > end) throw new Error("Storage did not confirm the expected byte range. Retry this file.")
    offset = received; onProgress?.(offset, file.size)
  }
  checkCurrent(isCurrent, signal)
  return uploadUrl
}

export function createProjectLibraryClient(fetcher: typeof fetch, projectId: string, isCurrent: () => boolean, transferFetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/files`
  async function request<T>(body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      checkCurrent(isCurrent)
      const response = await fetcher(endpoint, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
      const result = await response.json()
      checkCurrent(isCurrent)
      if (response.ok) return result as T
      // Metadata CAS conflicts retry fresh server state; no file is uploaded twice.
      if (response.status === 409 && result.code === "PROJECT_CHANGED" && attempt < 5) continue
      throw new Error(typeof result.error === "string" ? result.error : `Project operation failed (${response.status}).`)
    }
    throw new Error("Project inventory changed repeatedly. Refresh and retry the individual file.")
  }
  return {
    list: () => request<{ inventory: ProjectInventory }>(),
    register: (file: { name: string; relativePath: string; size: number; sha256: string; mimeType: string; selectionId: string }) => request<{ inventory: ProjectInventory; file: ProjectFile }>({ action: "register", file }),
    prepare: (fileId: string, pageNumber?: number) => request<{ inventory: ProjectInventory }>({ action: "prepare", fileId, ...(pageNumber !== undefined ? { pageNumber } : {}) }),
    download: (fileId: string) => request<{ url: string }>({ action: "download", fileId }),
    async upload(file: Blob, record: ProjectFile, progress?: (uploaded: number, total: number) => void, signal?: AbortSignal) {
      // A final PATCH response may have been lost after Storage durably finished.
      // Recover that exact retained original before asking for another capability.
      if (record.uploadUrl) {
        const recovered = await request<{ inventory: ProjectInventory }>({ action: "complete", fileId: record.id })
        if (recovered.inventory.files.find(entry => entry.id === record.id)?.status === "uploaded") { progress?.(record.size, record.size); return recovered }
      }
      const { ticket } = await request<{ ticket: UploadTicket }>({ action: "ticket", fileId: record.id })
      await uploadProjectOriginal({ file, record, ticket, fetcher: transferFetcher, isCurrent, signal, onSession: async uploadUrl => { await request({ action: "session", fileId: record.id, uploadUrl }) }, onProgress: progress })
      const completed = await request<{ inventory: ProjectInventory }>({ action: "complete", fileId: record.id })
      const saved = completed.inventory.files.find(entry => entry.id === record.id)
      if (saved?.status !== "uploaded") throw new Error(saved?.issue || "Uploaded bytes have not passed server verification. Retry this file.")
      return completed
    },
  }
}

export async function projectFileHash(file: Blob): Promise<string> {
  if (file.size > PROJECT_LIMITS.maxFileBytes) throw new Error("Original exceeds the 100 MiB file limit.")
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("")
}
export async function runProjectQueue<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>) {
  let next = 0
  const count = Math.max(1, Math.min(PROJECT_LIMITS.uploadConcurrency, Math.floor(concurrency)))
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => { while (next < items.length) await run(items[next++]) }))
}
