import { requireOwner, withOwnerResponse, type OwnerAuthAdapter } from "../owner-auth"
import { completeProjectUpload, ownedFile, prepareProjectFile, recordUploadSession, registerProjectFile } from "./service"
import { ProjectLibraryError, type ProjectLibraryStore } from "./types"
import { projectId } from "./validation"

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
      if (req.method === "GET") return Response.json({ inventory: await deps.store.get(owner.id, id) })
      const input = await json(req)
      if (input.action === "register") return Response.json(await registerProjectFile(deps.store, owner.id, id, input.file))
      if (typeof input.fileId !== "string") throw new ProjectLibraryError(400, "PROJECT_FILE_INVALID", "Select an exact project file.")
      const inventory = await deps.store.get(owner.id, id), file = ownedFile(inventory, owner.id, input.fileId)
      if (input.action === "ticket") return Response.json({ file, ticket: await deps.store.ticket(owner.id, file) })
      if (input.action === "session") return Response.json({ inventory: await recordUploadSession(deps.store, owner.id, id, file.id, input.uploadUrl) })
      if (input.action === "complete") return Response.json({ inventory: await completeProjectUpload(deps.store, owner.id, id, file.id) })
      if (input.action === "prepare") return Response.json({ inventory: await prepareProjectFile(deps.store, owner.id, id, file.id, typeof input.pageNumber === "number" ? input.pageNumber : undefined) })
      if (input.action === "download") return Response.json({ url: await deps.store.signedDownload(owner.id, file) })
      throw new ProjectLibraryError(400, "PROJECT_ACTION_INVALID", "Choose a supported project operation.")
    } catch (error) {
      if (error instanceof ProjectLibraryError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
      return Response.json({ code: "PROJECT_LIBRARY_UNAVAILABLE", error: "Project library is unavailable. Originals were not substituted with browser-only storage." }, { status: 503 })
    }
  }) }
}
