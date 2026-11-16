import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { emptyInventory } from "./service"
import { getProjectFile, inventoryPage, pageLimit, parsePageCursor, projectFileSummary, projectPageMetadata } from "./pagination"
import { PROJECT_LIMITS, ProjectLibraryError, type ProjectFile, type ProjectInventory, type ProjectInventoryPage, type ProjectLibraryStore, type ProjectPage } from "./types"

export const PROJECT_BUCKET = "project-originals-private"
function unavailable(): never { throw new ProjectLibraryError(503, "PROJECT_LIBRARY_NOT_CONFIGURED", "Project library requires its reviewed normalized schema, preserved legacy import, private storage bucket and server configuration. Originals were not replaced with browser storage.") }
type Head = { revision: number; file_count: number }
type FileRow = { file_id: string; source_version: number; source_sha256: string; active: boolean; metadata: ProjectFile }

/** Production uses normalized metadata/pages. No inventory query selects prepared text. */
export class SupabaseProjectLibraryStore implements ProjectLibraryStore {
  private client?: SupabaseClient
  constructor(client?: SupabaseClient) { this.client = client }
  private get db() {
    if (!this.client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) unavailable()
      this.client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    }
    return this.client
  }
  async ready() { const result = await this.db.rpc("project_library_ready"); if (result.error || result.data !== 2) unavailable() }
  private async head(ownerId: string, projectId: string): Promise<Head> {
    const result = await this.db.from("project_library_heads").select("revision,file_count").eq("owner_id", ownerId).eq("project_id", projectId).maybeSingle()
    if (result.error) unavailable()
    if (!result.data) {
      // A retained old snapshot must be explicitly imported during approved setup.
      const old = await this.db.from("project_libraries").select("owner_id").eq("owner_id", ownerId).eq("project_id", projectId).maybeSingle()
      if (old.error || old.data) unavailable()
      return { revision: 0, file_count: 0 }
    }
    if (!Number.isSafeInteger(result.data.revision) || result.data.revision < 0 || !Number.isSafeInteger(result.data.file_count) || result.data.file_count < 0 || result.data.file_count > PROJECT_LIMITS.maxFiles) unavailable()
    return result.data as Head
  }
  private file(row: FileRow, ownerId: string, projectId: string): ProjectFile {
    const value = row.metadata
    if (!value || value.ownerId !== ownerId || value.projectId !== projectId || value.id !== row.file_id || value.sourceVersion !== row.source_version || value.sha256 !== row.source_sha256 || value.active !== row.active || !value.objectKey.startsWith(`${ownerId}/${projectId}/${value.id}/`) || !Array.isArray(value.pages) || value.pages.length) unavailable()
    return projectFileSummary(value)
  }
  async list(ownerId: string, projectId: string, options: { cursor?: string; limit?: number } = {}): Promise<ProjectInventoryPage> {
    const head = await this.head(ownerId, projectId), start = parsePageCursor(options.cursor, head.revision), limit = pageLimit(options.limit)
    const result = await this.db.from("project_library_files").select("file_id,source_version,source_sha256,active,metadata").eq("owner_id", ownerId).eq("project_id", projectId).order("file_id", { ascending: true }).range(start, start + limit - 1)
    if (result.error || !Array.isArray(result.data)) unavailable()
    const after = await this.head(ownerId, projectId)
    if (after.revision !== head.revision) throw new ProjectLibraryError(409, "PROJECT_CHANGED", "Project changed while reading this inventory page. Restart discovery.")
    const files = (result.data as FileRow[]).map(row => this.file(row, ownerId, projectId))
    if (start < head.file_count && !files.length || start + files.length > head.file_count) unavailable()
    return inventoryPage({ ...emptyInventory(ownerId, projectId), revision: head.revision }, files, head.file_count, start)
  }
  async get(ownerId: string, projectId: string): Promise<ProjectInventory> {
    // Internal callers assemble summaries through bounded, revision-pinned queries.
    // HTTP responses use list(), never this complete assembled inventory.
    const result = { ...emptyInventory(ownerId, projectId) }; let cursor: string | undefined
    do { const page = await this.list(ownerId, projectId, { cursor }); result.revision = page.inventory.revision; result.files.push(...page.inventory.files); cursor = page.nextCursor ?? undefined } while (cursor)
    return result
  }
  async getRevision(ownerId: string, projectId: string): Promise<number> { return (await this.head(ownerId, projectId)).revision }
  async getFile(ownerId: string, projectId: string, fileId: string): Promise<ProjectFile | null> {
    const result = await this.db.from("project_library_files").select("file_id,source_version,source_sha256,active,metadata").eq("owner_id", ownerId).eq("project_id", projectId).eq("file_id", fileId).maybeSingle()
    if (result.error) unavailable()
    if (!result.data) return null
    const file = this.file(result.data as FileRow, ownerId, projectId), pages: ProjectPage[] = []
    // Page metadata is bounded separately and excludes text_content entirely.
    for (let start = 0; start < PROJECT_LIMITS.maxPagesPerPdf; start += PROJECT_LIMITS.pageMetadataPageSize) {
      const response = await this.db.from("project_library_pages").select("page_number,source_version,source_sha256,metadata").eq("owner_id", ownerId).eq("project_id", projectId).eq("file_id", fileId).order("page_number", { ascending: true }).range(start, start + PROJECT_LIMITS.pageMetadataPageSize - 1)
      if (response.error || !Array.isArray(response.data)) unavailable()
      for (const row of response.data) {
        if (row.source_version !== file.sourceVersion || row.source_sha256 !== file.sha256 || row.metadata?.pageNumber !== row.page_number) unavailable()
        pages.push(projectPageMetadata(row.metadata as ProjectPage))
      }
      if (response.data.length < PROJECT_LIMITS.pageMetadataPageSize) break
    }
    return { ...file, pages }
  }
  async getPage(ownerId: string, projectId: string, fileId: string, pageNumber: number): Promise<ProjectPage | null> {
    const file = await this.getFile(ownerId, projectId, fileId)
    if (!file) return null
    const result = await this.db.from("project_library_pages").select("page_number,source_version,source_sha256,metadata,text_content").eq("owner_id", ownerId).eq("project_id", projectId).eq("file_id", fileId).eq("page_number", pageNumber).maybeSingle()
    if (result.error) unavailable()
    if (!result.data) return null
    const row = result.data
    if (row.source_version !== file.sourceVersion || row.source_sha256 !== file.sha256 || row.page_number !== pageNumber || typeof row.text_content !== "string" || row.text_content.length > PROJECT_LIMITS.maxPageText) unavailable()
    return { ...row.metadata, pageNumber, text: row.text_content, textCharacters: row.text_content.length, contentLoaded: true }
  }
  async saveFiles(ownerId: string, projectId: string, files: ProjectFile[], expectedRevision: number) {
    if (!files.length || files.length > 2 || files.some(file => file.ownerId !== ownerId || file.projectId !== projectId)) throw new ProjectLibraryError(400, "PROJECT_MUTATION_INVALID", "Write one file/page operation at a time.")
    const payload = files.map(file => ({ ...projectFileSummary(file), pages: file.pages.filter(page => page.contentLoaded !== false) }))
    if (Buffer.byteLength(JSON.stringify(payload)) > PROJECT_LIMITS.maxMutationBytes) throw new ProjectLibraryError(413, "PROJECT_MUTATION_LIMIT", "This source operation exceeds its bounded request size.")
    const result = await this.db.rpc("project_library_save_files", { p_owner: ownerId, p_project: projectId, p_expected: expectedRevision, p_files: payload })
    if (result.error) {
      if (result.error.message.includes("PROJECT_CHANGED")) throw new ProjectLibraryError(409, "PROJECT_CHANGED", "The project inventory changed. Retry this operation; no other source was replaced.")
      unavailable()
    }
    if (result.data !== expectedRevision + 1) unavailable()
    const inventory = await this.get(ownerId, projectId)
    if (inventory.revision < expectedRevision + 1) unavailable()
    return inventory
  }
  async save(): Promise<ProjectInventory> { throw new ProjectLibraryError(503, "PROJECT_NORMALIZED_WRITE_REQUIRED", "Whole-inventory writes are disabled. Use the reviewed normalized file/page operation.") }
  private async assertFile(ownerId: string, file: ProjectFile) { const current = await getProjectFile(this, ownerId, file.projectId, file.id); if (current.objectKey !== file.objectKey || current.sha256 !== file.sha256 || current.sourceVersion !== file.sourceVersion) throw new ProjectLibraryError(404, "PROJECT_FILE_NOT_FOUND", "Project source is unavailable.") }
  async ticket(ownerId: string, file: ProjectFile) {
    await this.assertFile(ownerId, file)
    const signed = await this.db.storage.from(PROJECT_BUCKET).createSignedUploadUrl(file.objectKey, { upsert: false })
    if (signed.error || !signed.data) unavailable()
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")
    url.pathname = "/storage/v1/upload/resumable"; url.search = ""; url.hash = ""
    return { endpoint: url.href, headers: { "x-signature": signed.data!.token }, bucket: PROJECT_BUCKET, objectKey: file.objectKey, chunkBytes: PROJECT_LIMITS.chunkBytes }
  }
  async download(ownerId: string, file: ProjectFile) {
    await this.assertFile(ownerId, file)
    const result = await this.db.storage.from(PROJECT_BUCKET).download(file.objectKey)
    if (result.error || !result.data) throw new ProjectLibraryError(503, "PROJECT_ORIGINAL_UNAVAILABLE", "The private original is unavailable. Retry this file; other uploads remain retained.")
    return new Uint8Array(await result.data.arrayBuffer())
  }
  async signedDownload(ownerId: string, file: ProjectFile) {
    await this.assertFile(ownerId, file)
    const result = await this.db.storage.from(PROJECT_BUCKET).createSignedUrl(file.objectKey, 60, { download: file.name })
    if (result.error || !result.data) unavailable()
    return result.data!.signedUrl
  }
  async putProcessing(ownerId: string, file: ProjectFile, bytes: Uint8Array) {
    await this.assertFile(ownerId, file)
    const key = `${ownerId}/${file.projectId}/${file.id}/processing.jpg`
    const result = await this.db.storage.from(PROJECT_BUCKET).upload(key, bytes, { contentType: "image/jpeg", upsert: true })
    if (result.error) unavailable()
    return key
  }
  async withPreparation<T>(ownerId: string, projectId: string, fileId: string, run: () => Promise<T>): Promise<T> {
    await this.assertFile(ownerId, await getProjectFile(this, ownerId, projectId, fileId))
    const token = randomUUID(), claim = await this.db.rpc("project_library_claim_preparation", { p_owner: ownerId, p_project: projectId, p_file: fileId, p_token: token })
    if (claim.error) unavailable()
    if (claim.data !== true) throw new ProjectLibraryError(409, "PROJECT_PREPARATION_BUSY", "Another project page is being prepared for this owner. Retry after it finishes; no original or result was replaced.")
    try { return await run() } finally { await this.db.rpc("project_library_release_preparation", { p_owner: ownerId, p_token: token }) }
  }
}
