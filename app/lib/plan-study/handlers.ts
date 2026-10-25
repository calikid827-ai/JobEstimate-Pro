import { requireOwner, withOwnerResponse, type OwnerAuthAdapter } from "../owner-auth"
import { StudyError, STUDY_LIMITS } from "./types"
import type { StudyStore } from "./store"
import { addDocument, answerQuestion, prepareNextPage, readEvidence } from "./service"
import { runStudyStep, type StudyProvider } from "./runner"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function id(value: string) { if (!uuid.test(value)) throw new StudyError(404, "STUDY_NOT_FOUND", "The requested study resource is unavailable."); return value }
function integer(value: unknown) { const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value; if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new StudyError(400, "STUDY_INPUT_INVALID", "A current study revision is required."); return n }
function text(value: unknown, max: number) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new StudyError(400, "STUDY_INPUT_INVALID", "A required study field is invalid."); return value.trim() }
async function body(req: Request, limit: number) {
  if (!req.body) return new Uint8Array()
  const reader = req.body.getReader(), parts: Uint8Array[] = []; let size = 0
  try { while (true) { const read = await reader.read(); if (read.done) break; size += read.value.byteLength; if (size > limit) { await reader.cancel(); throw new StudyError(413, "STUDY_REQUEST_LIMIT", "The upload exceeds this slice's explicit size limit. No content was truncated.") } parts.push(read.value) } } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length } return bytes
}
async function json(req: Request) {
  try { const result = JSON.parse(new TextDecoder().decode(await body(req, 12000))); if (!result || Array.isArray(result) || typeof result !== "object") throw new Error(); return result as Record<string, unknown> } catch (error) { if (error instanceof StudyError) throw error; throw new StudyError(400, "STUDY_INPUT_INVALID", "The study request is invalid.") }
}
/** Dependency injection is explicit in tests; production always supplies the real adapters. */
export function createPlanStudyHandlers(deps: { store: StudyStore; provider: StudyProvider; auth?: OwnerAuthAdapter }) {
  const run = (req: Request, operation: (ownerId: string) => Promise<Response>) => withOwnerResponse(async () => {
    const owner = await requireOwner(req, deps.auth)
    try { await deps.store.ready(); return await operation(owner.id) } catch (error) {
      if (error instanceof StudyError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
      return Response.json({ code: "STUDY_UNAVAILABLE", error: "Plan Study is unavailable. No temporary storage or unverified result was substituted." }, { status: 503 })
    }
  })
  return {
    collection: (req: Request) => run(req, async (owner) => {
      if (req.method === "GET") return Response.json({ studies: await deps.store.list(owner) })
      const input = await json(req)
      return Response.json({ study: await deps.store.create(owner, text(input.title, 160)) }, { status: 201 })
    }),
    study: (req: Request, studyId: string) => run(req, async (owner) => Response.json({ study: await deps.store.get(owner, id(studyId)) })),
    documents: (req: Request, studyId: string) => run(req, async (owner) => {
      id(studyId)
      // Establish ownership before parsing, hashing or writing any supplied content.
      await deps.store.get(owner, studyId)
      if (!req.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new StudyError(400, "STUDY_INPUT_INVALID", "Upload an original PDF using the document control.")
      const bytes = await body(req, STUDY_LIMITS.maxFileBytes + 32 * 1024)
      const form = await new Response(bytes, { headers: { "content-type": req.headers.get("content-type")! } }).formData()
      const file = form.get("file")
      if (!(file instanceof File) || form.getAll("file").length !== 1) throw new StudyError(400, "STUDY_INPUT_INVALID", "One original PDF is required per upload.")
      const replaces = form.get("replacesDocumentId")
      return Response.json({ study: await addDocument(deps.store, owner, studyId, integer(form.get("expectedRevision")), file.name, new Uint8Array(await file.arrayBuffer()), replaces ? id(text(replaces, 36)) : undefined) })
    }),
    prepare: (req: Request, studyId: string) => run(req, async (owner) => {
      const input = await json(req)
      return Response.json({ study: await prepareNextPage(deps.store, owner, id(studyId), integer(input.expectedRevision), input.pageId ? id(text(input.pageId, 36)) : undefined) })
    }),
    steps: (req: Request, studyId: string) => run(req, async (owner) => {
      const input = await json(req)
      return Response.json({ study: await runStudyStep(deps.store, owner, id(studyId), integer(input.expectedRevision), text(input.idempotencyKey, 100), deps.provider) })
    }),
    decisions: (req: Request, studyId: string) => run(req, async (owner) => {
      const input = await json(req)
      return Response.json({ study: await answerQuestion(deps.store, owner, id(studyId), integer(input.expectedRevision), text(input.findingId, 200), text(input.answer, 4000)) })
    }),
    evidence: (req: Request, studyId: string, artifactId: string) => run(req, async (owner) => {
      const version = id(new URL(req.url).searchParams.get("documentVersionId") || "")
      const result = await readEvidence(deps.store, owner, id(studyId), id(artifactId), version)
      return new Response(result.bytes as BodyInit, { headers: { "Content-Type": result.artifact.mime, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline" } })
    }),
  }
}
