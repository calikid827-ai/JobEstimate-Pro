import { requireOwner, withOwnerResponse, type OwnerAuthAdapter } from "../owner-auth"
import { completeProjectUpload, ownedFile, prepareProjectFile, recordUploadSession, registerProjectFile } from "./service"
import { PROJECT_LIMITS, ProjectLibraryError, type ProjectInventory, type ProjectLibraryStore } from "./types"
import { projectId } from "./validation"
import { getProjectFile, getProjectPage, getProjectRevision, listProjectFiles, pageLimit, parsePageCursor, projectFileSummary, projectPageMetadata } from "./pagination"

function boundedJson(value: unknown) {
  const text = JSON.stringify(value)
  if (new TextEncoder().encode(text).byteLength > PROJECT_LIMITS.maxResponseBytes) throw new ProjectLibraryError(413, "PROJECT_RESPONSE_LIMIT", "Request a smaller page. Source records and content were preserved without truncation.")
  return new Response(text, { headers: { "Content-Type": "application/json" } })
}
function mutation(inventory: ProjectInventory, ids: string[], fileId?: string) {
  const files = inventory.files.filter(file => ids.includes(file.id)).map(projectFileSummary)
  return boundedJson({ mutation: true, inventory: { ...inventory, files }, totalFiles: inventory.files.length, ...(fileId ? { file: files.find(file => file.id === fileId) } : {}) })
}

async function json(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 16000) throw new ProjectLibraryError(413, "PROJECT_METADATA_LIMIT", "Send file metadata only; transfer originals directly to authorized storage.")
  const reader = req.body?.getReader(); let text = "", size = 0
  if (!reader) throw new ProjectLibraryError(400, "PROJECT_INPUT_INVALID", "A project operation is required.")
  try {
    const decoder = new TextDecoder()
    while (true) { const read = await reader.read(); if (read.done) break; size += read.value.length; if (size > 16000) { await reader.cancel(); throw new ProjectLibraryError(413, "PROJECT_METADATA_LIMIT", "File bytes do not belong in metadata requests.") }; text += decoder.decode(read.value, { stream: true }) }
    const value: unknown = JSON.parse(text + decoder.decode())
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error()
    return value as Record<string, unknown>
  } catch (error) { if (error instanceof ProjectLibraryError) throw error; throw new ProjectLibraryError(400, "PROJECT_INPUT_INVALID", "The project operation is invalid.") }
  finally { reader.releaseLock() }
}
/** Controlled adapters are test-only dependencies; no request can choose them. */
export function createProjectLibraryHandlers(deps: { store: ProjectLibraryStore; auth?: OwnerAuthAdapter }) {
  return { files: (req: Request, rawProjectId: string) => withOwnerResponse(async () => {
    const owner = await requireOwner(req, deps.auth)
    try {
      const id = projectId(rawProjectId)
      await deps.store.ready()
      if (req.method === "GET") {
        const query = new URL(req.url).searchParams
        if (query.get("view") === "content") {
          const file = await getProjectFile(deps.store, owner.id, id, query.get("fileId") || "")
          const page = await getProjectPage(deps.store, owner.id, id, file.id, Number(query.get("pageNumber")))
          const current = await getProjectFile(deps.store, owner.id, id, file.id)
          return boundedJson({ ownerId: owner.id, projectId: id, fileId: file.id, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, active: current.active, page })
        }
        if (query.get("view") === "pages") {
          const before = await getProjectRevision(deps.store, owner.id, id)
          const file = await getProjectFile(deps.store, owner.id, id, query.get("fileId") || "")
          const revision = await getProjectRevision(deps.store, owner.id, id), start = parsePageCursor(query.get("cursor") ?? undefined, revision, PROJECT_LIMITS.maxPagesPerPdf), limit = pageLimit(query.has("limit") ? Number(query.get("limit")) : undefined, PROJECT_LIMITS.pageMetadataPageSize)
          if (before !== revision) throw new ProjectLibraryError(409, "PROJECT_CHANGED", "Project changed during source-page discovery. Restart that listing.")
          const pages = [...file.pages].sort((a, b) => a.pageNumber - b.pageNumber).slice(start, start + limit).map(projectPageMetadata)
          return boundedJson({ file: { ...projectFileSummary(file), pages }, revision, totalPages: file.pages.length, nextCursor: start + pages.length < file.pages.length ? `${revision}:${start + pages.length}` : null })
        }
        if (query.has("view")) throw new ProjectLibraryError(400, "PROJECT_VIEW_INVALID", "Choose inventory, source pages or exact page content.")
        return boundedJson(await listProjectFiles(deps.store, owner.id, id, { cursor: query.get("cursor") ?? undefined, limit: query.has("limit") ? Number(query.get("limit")) : undefined }))
      }
      const input = await json(req)
      if (input.action === "register") { const result = await registerProjectFile(deps.store, owner.id, id, input.file); return mutation(result.inventory, [result.file.id, ...(result.file.replacesId ? [result.file.replacesId] : [])], result.file.id) }
      if (typeof input.fileId !== "string") throw new ProjectLibraryError(400, "PROJECT_FILE_INVALID", "Select an exact project file.")
      const inventory = await deps.store.get(owner.id, id), file = ownedFile(inventory, owner.id, input.fileId)
      if (input.action === "ticket") return boundedJson({ file: projectFileSummary(file), ticket: await deps.store.ticket(owner.id, file) })
      if (input.action === "session") return mutation(await recordUploadSession(deps.store, owner.id, id, file.id, input.uploadUrl), [file.id])
      if (input.action === "complete") return mutation(await completeProjectUpload(deps.store, owner.id, id, file.id), [file.id])
      if (input.action === "prepare") return mutation(await prepareProjectFile(deps.store, owner.id, id, file.id, typeof input.pageNumber === "number" ? input.pageNumber : undefined), [file.id])
      if (input.action === "download") return Response.json({ url: await deps.store.signedDownload(owner.id, file) })
      throw new ProjectLibraryError(400, "PROJECT_ACTION_INVALID", "Choose a supported project operation.")
    } catch (error) {
      if (error instanceof ProjectLibraryError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
      return Response.json({ code: "PROJECT_LIBRARY_UNAVAILABLE", error: "Project library is unavailable. Originals were not substituted with browser-only storage." }, { status: 503 })
    }
  }) }
}
