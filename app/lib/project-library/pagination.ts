import { PROJECT_LIMITS, ProjectLibraryError, type ProjectFile, type ProjectInventory, type ProjectInventoryPage, type ProjectLibraryStore, type ProjectPage } from "./types"

export function pageStatistics(file: ProjectFile) {
  return file.pageStats ?? { prepared: file.pages.filter(page => page.extraction !== "failed").length, failed: file.pages.filter(page => page.extraction === "failed").length, textCharacters: file.pages.reduce((sum, page) => sum + (page.textCharacters ?? page.text.length), 0) }
}
export function projectFileSummary(file: ProjectFile): ProjectFile {
  return { ...file, pages: [], pageStats: pageStatistics(file), contentStatus: "not_loaded" }
}
export function projectPageMetadata(page: ProjectPage): ProjectPage {
  return { ...page, text: "", textCharacters: page.textCharacters ?? page.text.length, contentLoaded: false }
}
export function parsePageCursor(cursor: string | undefined, revision: number, maximum: number = PROJECT_LIMITS.maxFiles): number {
  if (!cursor) return 0
  const match = /^(\d+):(\d+)$/.exec(cursor)
  if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) > maximum) throw new ProjectLibraryError(400, "PROJECT_CURSOR_INVALID", "The page cursor is invalid. Start again from the first page.")
  if (Number(match[1]) !== revision) throw new ProjectLibraryError(409, "PROJECT_CHANGED", "The project changed during discovery. Restart the paginated listing; no source record was skipped.")
  return Number(match[2])
}
export function pageLimit(value: number | undefined, maximum: number = PROJECT_LIMITS.inventoryPageSize): number {
  if (value === undefined) return maximum
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new ProjectLibraryError(400, "PROJECT_PAGE_LIMIT", `Choose between 1 and ${maximum} records per page.`)
  return value
}
export function inventoryPage(inventory: ProjectInventory, candidateFiles: ProjectFile[], totalFiles: number, start: number): ProjectInventoryPage {
  const page: ProjectInventoryPage = { inventory: { ...inventory, files: [] }, totalFiles, nextCursor: null }
  for (const file of candidateFiles) {
    page.inventory.files.push(projectFileSummary(file))
    if (new TextEncoder().encode(JSON.stringify(page)).byteLength > PROJECT_LIMITS.maxResponseBytes - 100) { page.inventory.files.pop(); break }
  }
  if (candidateFiles.length && !page.inventory.files.length) throw new ProjectLibraryError(413, "PROJECT_RECORD_LIMIT", "One source metadata record exceeds the response bound. It was not silently skipped.")
  page.nextCursor = start + page.inventory.files.length < totalFiles ? `${inventory.revision}:${start + page.inventory.files.length}` : null
  return page
}
export async function listProjectFiles(store: ProjectLibraryStore, ownerId: string, projectId: string, options: { cursor?: string; limit?: number } = {}): Promise<ProjectInventoryPage> {
  if (store.list) return store.list(ownerId, projectId, options)
  const inventory = await store.get(ownerId, projectId)
  if (inventory.ownerId !== ownerId || inventory.projectId !== projectId) throw new ProjectLibraryError(404, "PROJECT_NOT_FOUND", "The project is unavailable for this owner.")
  const files = [...inventory.files].sort((a, b) => a.id.localeCompare(b.id)), start = parsePageCursor(options.cursor, inventory.revision), limit = pageLimit(options.limit)
  return inventoryPage(inventory, files.slice(start, start + limit), files.length, start)
}
export async function getProjectFile(store: ProjectLibraryStore, ownerId: string, projectId: string, fileId: string): Promise<ProjectFile> {
  const file = store.getFile ? await store.getFile(ownerId, projectId, fileId) : (await store.get(ownerId, projectId)).files.find(entry => entry.id === fileId)
  if (!file || file.ownerId !== ownerId || file.projectId !== projectId || file.id !== fileId) throw new ProjectLibraryError(404, "PROJECT_FILE_NOT_FOUND", "The exact project source is unavailable for this owner.")
  return file
}
export async function getProjectRevision(store: ProjectLibraryStore, ownerId: string, projectId: string): Promise<number> { return store.getRevision ? store.getRevision(ownerId, projectId) : (await store.get(ownerId, projectId)).revision }
export async function getProjectPage(store: ProjectLibraryStore, ownerId: string, projectId: string, fileId: string, pageNumber: number): Promise<ProjectPage> {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > PROJECT_LIMITS.maxPagesPerPdf) throw new ProjectLibraryError(400, "PROJECT_PAGE_INVALID", "Select an exact source page.")
  const file = await getProjectFile(store, ownerId, projectId, fileId)
  const page = store.getPage ? await store.getPage(ownerId, projectId, fileId, pageNumber) : file.pages.find(entry => entry.pageNumber === pageNumber)
  if (!page || page.pageNumber !== pageNumber || page.contentLoaded === false) throw new ProjectLibraryError(404, "PROJECT_PAGE_UNAVAILABLE", "This page content has not been prepared. Its coverage remains pending.")
  return { ...page, textCharacters: page.text.length, contentLoaded: true }
}
export function summarizedInventory(inventory: ProjectInventory): ProjectInventory { return { ...inventory, files: inventory.files.map(projectFileSummary) } }
