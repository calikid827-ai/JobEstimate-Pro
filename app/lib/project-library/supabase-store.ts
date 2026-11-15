import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { emptyInventory, ownedFile } from "./service"
import { PROJECT_LIMITS, ProjectLibraryError, type ProjectFile, type ProjectInventory, type ProjectLibraryStore } from "./types"

export const PROJECT_BUCKET = "project-originals-private"
function unavailable(): never { throw new ProjectLibraryError(503, "PROJECT_LIBRARY_NOT_CONFIGURED", "Project library requires its reviewed schema, private storage bucket and server configuration. Originals were not stored in this browser or a temporary substitute.") }
/** Production always uses the authenticated metadata/private-storage adapter. */
export class SupabaseProjectLibraryStore implements ProjectLibraryStore {
  private client?: SupabaseClient
  private get db() {
    if (!this.client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) unavailable()
      this.client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    }
    return this.client
  }
  async ready() { const result = await this.db.rpc("project_library_ready"); if (result.error || result.data !== 1) unavailable() }
  async get(ownerId: string, projectId: string): Promise<ProjectInventory> {
    const result = await this.db.from("project_libraries").select("owner_id,project_id,revision,snapshot").eq("owner_id", ownerId).eq("project_id", projectId).maybeSingle()
    if (result.error) unavailable()
    if (!result.data) return emptyInventory(ownerId, projectId)
    const record = result.data.snapshot as ProjectInventory
    if (record.ownerId !== ownerId || record.projectId !== projectId || !Array.isArray(record.files) || record.files.some(file => file.ownerId !== ownerId || file.projectId !== projectId || !file.objectKey.startsWith(`${ownerId}/${projectId}/${file.id}/`))) unavailable()
    return { ...record, revision: result.data.revision }
  }
  async save(ownerId: string, inventory: ProjectInventory, expectedRevision: number) {
    if (inventory.ownerId !== ownerId || inventory.files.some(file => file.ownerId !== ownerId || file.projectId !== inventory.projectId)) throw new ProjectLibraryError(403, "PROJECT_OWNER_MISMATCH", "Project ownership changed.")
    const result = await this.db.rpc("project_library_save", { p_owner: ownerId, p_project: inventory.projectId, p_expected: expectedRevision, p_snapshot: inventory })
    if (result.error) {
      if (result.error.message.includes("PROJECT_CHANGED")) throw new ProjectLibraryError(409, "PROJECT_CHANGED", "The project inventory changed. Retry this file without restarting other transfers.")
      unavailable()
    }
    return this.get(ownerId, inventory.projectId)
  }
  private async assertFile(ownerId: string, file: ProjectFile) { const inventory = await this.get(ownerId, file.projectId); const current = ownedFile(inventory, ownerId, file.id); if (current.objectKey !== file.objectKey) throw new ProjectLibraryError(404, "PROJECT_FILE_NOT_FOUND", "Project source is unavailable.") }
  async ticket(ownerId: string, file: ProjectFile) {
    await this.assertFile(ownerId, file)
    const signed = await this.db.storage.from(PROJECT_BUCKET).createSignedUploadUrl(file.objectKey, { upsert: false })
    if (signed.error || !signed.data) unavailable()
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    // Public Supabase direct storage hostname; local/self-hosted URLs retain theirs.
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
    // Idempotent deterministic derived copy only; original keys are never upserted.
    const result = await this.db.storage.from(PROJECT_BUCKET).upload(key, bytes, { contentType: "image/jpeg", upsert: true })
    if (result.error) unavailable()
    return key
  }
  async withPreparation<T>(ownerId: string, projectId: string, fileId: string, run: () => Promise<T>): Promise<T> {
    await this.assertFile(ownerId, (await this.get(ownerId, projectId)).files.find(file => file.id === fileId) ?? (() => { throw new ProjectLibraryError(404, "PROJECT_FILE_NOT_FOUND", "The project file is unavailable.") })())
    const token = randomUUID()
    const claim = await this.db.rpc("project_library_claim_preparation", { p_owner: ownerId, p_project: projectId, p_file: fileId, p_token: token })
    if (claim.error) unavailable()
    if (claim.data !== true) throw new ProjectLibraryError(409, "PROJECT_PREPARATION_BUSY", "Another project page is being prepared for this owner. Retry after it finishes; no original or result was replaced.")
    try { return await run() }
    finally { await this.db.rpc("project_library_release_preparation", { p_owner: ownerId, p_token: token }) }
  }
}
