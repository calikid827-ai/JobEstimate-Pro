export const PROJECT_LIMITS = {
  maxFiles: 10000, maxProjectBytes: 25 * 1024 ** 3, maxFileBytes: 100 * 1024 ** 2,
  maxPagesPerPdf: 1000, maxPageText: 80000, maxTextBytes: 8 * 1024 ** 2,
  maxPreparedCharacters: 16 * 1024 ** 2, maxPreparedPages: 10000,
  inventoryPageSize: 50, pageMetadataPageSize: 100,
  maxFileMetadataBytes: 16 * 1024, maxResponseBytes: 512 * 1024, maxMutationBytes: 512 * 1024,
  uploadConcurrency: 3, processingConcurrency: 1, chunkBytes: 6 * 1024 ** 2,
  zipEntries: 2000, zipExpandedBytes: 256 * 1024 ** 2, zipRatio: 100, maxImagePixels: 60_000_000,
} as const

export type ProjectPage = { pageNumber: number; text: string; extraction: "complete" | "empty" | "failed"; review: "pending"; issue?: string; textCharacters?: number; contentLoaded?: boolean }
export type ProjectFile = {
  id: string; ownerId: string; projectId: string; name: string; relativePath: string;
  mimeType: string; size: number; sha256: string; sourceVersion: number; active: boolean;
  replacesId?: string; duplicateOfId?: string;
  status: "selected" | "uploading" | "uploaded" | "failed" | "unsupported";
  preparation: "pending" | "partial" | "prepared" | "failed" | "unsupported";
  pageCount: number | null; pages: ProjectPage[]; issue?: string;
  /** Inventory summaries deliberately omit page content; fetch exact pages on demand. */
  contentStatus?: "not_loaded" | "loaded";
  pageStats?: { prepared: number; failed: number; textCharacters: number };
  image?: { width: number; height: number; processingWidth?: number; processingHeight?: number; processingKey?: string }; createdAt: string;
  /** Storage identity and transfer URL never belong in takeoff/customer output. */
  objectKey: string; uploadUrl?: string;
}
export type ProjectInventory = { schemaVersion: 1; ownerId: string; projectId: string; revision: number; files: ProjectFile[] }
export type ProjectInventoryPage = { inventory: ProjectInventory; totalFiles: number; nextCursor: string | null }
export type ProjectPageMetadata = { file: ProjectFile; revision: number; totalPages: number; nextCursor: string | null }
export type ProjectPageContent = { ownerId: string; projectId: string; fileId: string; sourceVersion: number; sourceSha256: string; active: boolean; page: ProjectPage }
export type RegisterFile = { name: string; relativePath: string; mimeType: string; size: number; sha256: string; selectionId: string }
export type UploadTicket = { endpoint: string; headers: Record<string, string>; bucket: string; objectKey: string; chunkBytes: number }
export class ProjectLibraryError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}
export type ProjectLibraryStore = {
  ready(): Promise<void>
  get(ownerId: string, projectId: string): Promise<ProjectInventory>
  save(ownerId: string, inventory: ProjectInventory, expectedRevision: number): Promise<ProjectInventory>
  /** Production uses normalized rows; optional fallbacks support explicit controlled stores. */
  list?(ownerId: string, projectId: string, options: { cursor?: string; limit?: number }): Promise<ProjectInventoryPage>
  getFile?(ownerId: string, projectId: string, fileId: string): Promise<ProjectFile | null>
  getPage?(ownerId: string, projectId: string, fileId: string, pageNumber: number): Promise<ProjectPage | null>
  getRevision?(ownerId: string, projectId: string): Promise<number>
  saveFiles?(ownerId: string, projectId: string, files: ProjectFile[], expectedRevision: number): Promise<ProjectInventory>
  ticket(ownerId: string, file: ProjectFile): Promise<UploadTicket>
  download(ownerId: string, file: ProjectFile): Promise<Uint8Array>
  signedDownload(ownerId: string, file: ProjectFile): Promise<string>
  putProcessing?(ownerId: string, file: ProjectFile, bytes: Uint8Array): Promise<string>
  withPreparation?<T>(ownerId: string, projectId: string, fileId: string, run: () => Promise<T>): Promise<T>
}
