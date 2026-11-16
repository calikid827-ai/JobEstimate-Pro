import { requireOwner, withOwnerResponse, type OwnerAuthAdapter } from "../owner-auth"
import type { ProjectLibraryStore } from "../project-library/types"
import { ProjectLibraryError } from "../project-library/types"
import { projectId } from "../project-library/validation"
import { ProjectAnalysisError } from "./types"
import type { AnalysisStore } from "./store"
import type { ProjectAnalysisProvider } from "./provider"
import { analysisRequestSchema } from "./validation"
import { runProjectAnalysis, verifyAnalysisSources } from "./service"

async function requestBody(req: Request) {
  const reader = req.body?.getReader()
  if (!reader) throw new ProjectAnalysisError(400, "ANALYSIS_INPUT_INVALID", "Choose the exact target/context sources to analyze.")
  let size = 0, text = ""
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true })
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16000) { await reader.cancel(); throw new ProjectAnalysisError(413, "ANALYSIS_INPUT_LIMIT", "Send source identities only. Source text and images are retrieved from the retained private library.") }; text += decoder.decode(chunk.value, { stream: true }) }
    const parsed = analysisRequestSchema.safeParse(JSON.parse(text + decoder.decode()))
    if (!parsed.success) throw new Error()
    return parsed.data
  } catch (error) { if (error instanceof ProjectAnalysisError) throw error; throw new ProjectAnalysisError(400, "ANALYSIS_INPUT_INVALID", "The analysis request contains invalid source identities or unsupported fields.") }
  finally { reader.releaseLock() }
}
/** Dependency injection is for controlled tests, never a browser/request choice. */
export function createProjectAnalysisHandlers(deps: { library: ProjectLibraryStore; analyses: AnalysisStore; provider: ProjectAnalysisProvider; auth?: OwnerAuthAdapter }) {
  return { analysis: (req: Request, rawProjectId: string) => withOwnerResponse(async () => {
    const owner = await requireOwner(req, deps.auth)
    try {
      const id = projectId(rawProjectId)
      await deps.analyses.ready()
      if (req.method === "GET") {
        const url = new URL(req.url), analysisId = url.searchParams.get("analysisId")
        if (analysisId) {
          if (analysisId.length > 500 || analysisId.trim() !== analysisId) throw new ProjectAnalysisError(400, "ANALYSIS_INPUT_INVALID", "Select an exact analysis identity.")
          const analysis = await deps.analyses.get(owner.id, id, analysisId)
          if (url.searchParams.get("verifyCurrent") === "1") {
            await deps.library.ready()
            await verifyAnalysisSources(deps.library, owner.id, id, analysis.sourceVersions)
          }
          return Response.json({ analysis })
        }
        return Response.json(await deps.analyses.list(owner.id, id, url.searchParams.get("cursor") ?? undefined))
      }
      if (req.method !== "POST") throw new ProjectAnalysisError(405, "ANALYSIS_METHOD_INVALID", "Use a read or explicit analysis operation.")
      return Response.json({ analysis: await runProjectAnalysis(deps, owner.id, id, await requestBody(req)) })
    } catch (error) {
      if (error instanceof ProjectAnalysisError || error instanceof ProjectLibraryError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
      return Response.json({ code: "ANALYSIS_UNAVAILABLE", error: "The package reader is unavailable. Reopen its retained attempt record; an unknown provider outcome must not be retried blindly." }, { status: 503 })
    }
  }) }
}
