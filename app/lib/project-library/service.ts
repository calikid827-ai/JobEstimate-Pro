import { createHash } from "node:crypto"
import { PROJECT_LIMITS, ProjectLibraryError, type ProjectFile, type ProjectInventory, type ProjectLibraryStore } from "./types"
import { assertOriginalType, validateRegistration } from "./validation"
import { prepareProjectImage, prepareProjectPdfPage } from "./preparation"

export function emptyInventory(ownerId: string, projectId: string): ProjectInventory { return { schemaVersion: 1, ownerId, projectId, revision: 0, files: [] } }
export function assertProjectInventoryBudget(inventory: ProjectInventory, nextRevision: number) {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...inventory, revision: nextRevision })).byteLength
  if (bytes > PROJECT_LIMITS.maxInventoryBytes) throw new ProjectLibraryError(413, "PROJECT_INVENTORY_LIMIT", "Project inventory and prepared text exceed the 3 MiB serialized metadata budget. Originals and earlier source records/results remain retained. Larger or denser inventories need paginated metadata before more results can be added; package coverage is not complete.")
}
async function saveInventory(store: ProjectLibraryStore, ownerId: string, inventory: ProjectInventory, expectedRevision: number) {
  // The shared service enforces this in production and controlled local stores.
  // Include the actual next revision so a digit boundary cannot exceed the cap.
  assertProjectInventoryBudget(inventory, expectedRevision + 1)
  return store.save(ownerId, inventory, expectedRevision)
}
export function ownedFile(inventory: ProjectInventory, ownerId: string, fileId: string): ProjectFile {
  const file = inventory.files.find(entry => entry.id === fileId && entry.ownerId === ownerId && entry.projectId === inventory.projectId)
  if (inventory.ownerId !== ownerId || !file) throw new ProjectLibraryError(404, "PROJECT_FILE_NOT_FOUND", "The project file is unavailable for this account.")
  return file
}
export async function registerProjectFile(store: ProjectLibraryStore, ownerId: string, projectId: string, raw: unknown) {
  const input = validateRegistration(raw), inventory = await store.get(ownerId, projectId)
  const existing = inventory.files.find(file => file.id === input.selectionId)
  if (existing) {
    if (existing.relativePath !== input.relativePath || existing.sha256 !== input.sha256 || existing.size !== input.size) throw new ProjectLibraryError(409, "PROJECT_SELECTION_CHANGED", "The upload identity belongs to different content. Select a new source version.")
    return { inventory, file: existing }
  }
  if (inventory.files.length >= PROJECT_LIMITS.maxFiles || inventory.files.reduce((sum, file) => sum + file.size, input.size) > PROJECT_LIMITS.maxProjectBytes) throw new ProjectLibraryError(413, "PROJECT_STORAGE_LIMIT", "This project exceeds its explicit 10,000-file or 25 GiB original-storage reservation limit.")
  const predecessors = inventory.files.filter(file => file.relativePath === input.relativePath)
  const prior = predecessors.find(file => file.active)
  const duplicate = inventory.files.find(file => file.sha256 === input.sha256 && file.size === input.size)
  const file: ProjectFile = {
    id: input.selectionId, ownerId, projectId, name: input.name, relativePath: input.relativePath, mimeType: input.mimeType,
    size: input.size, sha256: input.sha256, sourceVersion: Math.max(0, ...predecessors.map(entry => entry.sourceVersion)) + 1, active: true,
    ...(prior ? { replacesId: prior.id } : {}), ...(duplicate ? { duplicateOfId: duplicate.id } : {}),
    status: "selected", preparation: "pending", pageCount: null, pages: [], createdAt: new Date().toISOString(),
    objectKey: `${ownerId}/${projectId}/${input.selectionId}/original`,
  }
  const saved = await saveInventory(store, ownerId, { ...inventory, files: [...inventory.files.map(entry => entry.relativePath === input.relativePath ? { ...entry, active: false } : entry), file] }, inventory.revision)
  return { inventory: saved, file: ownedFile(saved, ownerId, file.id) }
}
async function saveFile(store: ProjectLibraryStore, ownerId: string, inventory: ProjectInventory, file: ProjectFile) {
  return saveInventory(store, ownerId, { ...inventory, files: inventory.files.map(entry => entry.id === file.id ? file : entry) }, inventory.revision)
}
export async function recordUploadSession(store: ProjectLibraryStore, ownerId: string, projectId: string, fileId: string, uploadUrl: unknown) {
  const inventory = await store.get(ownerId, projectId), file = ownedFile(inventory, ownerId, fileId), ticket = await store.ticket(ownerId, file)
  let url: URL
  try { url = new URL(String(uploadUrl)) } catch { throw new ProjectLibraryError(400, "PROJECT_UPLOAD_INVALID", "The upload session URL is invalid.") }
  const endpoint = new URL(ticket.endpoint)
  if (url.origin !== endpoint.origin || !url.pathname.startsWith(endpoint.pathname + "/") || url.username || url.password || url.search || url.hash) throw new ProjectLibraryError(400, "PROJECT_UPLOAD_INVALID", "The upload session must belong to the authorized storage endpoint.")
  if (file.status === "uploaded") return inventory
  return saveFile(store, ownerId, inventory, { ...file, uploadUrl: url.href, status: "uploading", issue: undefined })
}
export async function completeProjectUpload(store: ProjectLibraryStore, ownerId: string, projectId: string, fileId: string) {
  const inventory = await store.get(ownerId, projectId), file = ownedFile(inventory, ownerId, fileId)
  if (file.status === "uploaded") return inventory
  try {
    const bytes = await store.download(ownerId, file)
    if (bytes.byteLength !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Original content does not match its registered size and SHA-256. Select the original file and retry.")
    assertOriginalType(bytes, file.mimeType)
    return saveFile(store, ownerId, inventory, { ...file, status: "uploaded", issue: undefined })
  } catch (error) {
    return saveFile(store, ownerId, inventory, { ...file, status: "failed", issue: error instanceof Error ? error.message : "Original verification failed; record retained for retry." })
  }
}
async function prepareOne(store: ProjectLibraryStore, ownerId: string, projectId: string, fileId: string, retryPage?: number) {
  const inventory = await store.get(ownerId, projectId), file = ownedFile(inventory, ownerId, fileId)
  if (file.status !== "uploaded") throw new ProjectLibraryError(409, "PROJECT_UPLOAD_REQUIRED", "Finish and verify the original upload before preparation.")
  if (file.preparation === "prepared" && retryPage === undefined) return inventory
  const pageNumber = retryPage ?? Array.from({ length: file.pageCount ?? 1 }, (_, index) => index + 1).find(number => !file.pages.some(page => page.pageNumber === number && page.extraction !== "failed")) ?? 1
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > PROJECT_LIMITS.maxPagesPerPdf) throw new ProjectLibraryError(400, "PROJECT_PAGE_INVALID", "Select a valid preparation page.")
  try {
    if (!file.mimeType.startsWith("image/") && file.mimeType !== "application/pdf" && !file.mimeType.startsWith("text/")) return saveFile(store, ownerId, inventory, { ...file, preparation: "unsupported", issue: file.mimeType === "application/zip" ? "Original archive retained. Imported members are separate source records; this archive itself has no page review." : "Original retained. This format needs an external conversion before text/visual review; no analysis was claimed." })
    const bytes = await store.download(ownerId, file)
    if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Retained source changed. No prepared result was reused.")
    let next = { ...file }
    if (file.mimeType === "application/pdf") {
      const result = await prepareProjectPdfPage(bytes, pageNumber)
      next = { ...next, pageCount: result.pageCount, pages: [...file.pages.filter(page => page.pageNumber !== pageNumber), result.page].sort((a, b) => a.pageNumber - b.pageNumber) }
      next.preparation = next.pages.length === result.pageCount && next.pages.every(page => page.extraction !== "failed") ? "prepared" : "partial"
    } else if (file.mimeType.startsWith("text/")) {
      if (bytes.length > PROJECT_LIMITS.maxTextBytes) throw new Error("Text file exceeds the 8 MiB preparation limit; original retained.")
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      if (text.length > PROJECT_LIMITS.maxPageText) throw new Error("Text file exceeds 80,000 characters; no content was truncated.")
      next = { ...next, pageCount: 1, preparation: "prepared", pages: [{ pageNumber: 1, text, extraction: text.trim() ? "complete" : "empty", review: "pending" }] }
    } else {
      const result = await prepareProjectImage(bytes, file.mimeType)
      const processingKey = store.putProcessing ? await store.putProcessing(ownerId, file, result.bytes) : undefined
      next = { ...next, pageCount: 1, preparation: "prepared", image: { width: result.width, height: result.height, processingWidth: result.processingWidth, processingHeight: result.processingHeight, processingKey }, pages: [{ pageNumber: 1, text: "", extraction: "empty", review: "pending", issue: "Processing copy prepared; visual scope review is still pending. Photo count is not a room count." }] }
    }
    next.issue = undefined
    const otherPages = inventory.files.filter(entry => entry.id !== file.id).flatMap(entry => entry.pages)
    if (otherPages.length + next.pages.length > PROJECT_LIMITS.maxPreparedPages || [...otherPages, ...next.pages].reduce((sum, page) => sum + page.text.length, 0) > PROJECT_LIMITS.maxPreparedCharacters) throw new Error("Project preparation exceeds 10,000 page records or 16 MiB of extracted characters. Originals and earlier results remain retained; no coverage was marked complete.")
    return saveFile(store, ownerId, inventory, next)
  } catch (error) {
    return saveFile(store, ownerId, inventory, { ...file, preparation: "failed", issue: error instanceof Error ? error.message : "Preparation failed; original retained for retry.", pages: [...file.pages.filter(page => page.pageNumber !== pageNumber), { pageNumber, text: "", extraction: "failed", review: "pending", issue: "Preparation failed. Retry this page; it has not been reviewed." }] })
  }
}

let preparationTail = Promise.resolve()
/** Bound decoder memory in each server process; production also claims an owner-wide DB lease. */
export async function prepareProjectFile(store: ProjectLibraryStore, ownerId: string, projectId: string, fileId: string, retryPage?: number) {
  const previous = preparationTail
  let release = () => {}
  preparationTail = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    const run = () => prepareOne(store, ownerId, projectId, fileId, retryPage)
    return store.withPreparation ? await store.withPreparation(ownerId, projectId, fileId, run) : await run()
  } finally { release() }
}
