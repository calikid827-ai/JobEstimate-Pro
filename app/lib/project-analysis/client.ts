import { parseProjectAnalysisRecord } from "./validation"
import type { AnalysisRequest, ProjectAnalysisRecord } from "./types"

/** No POST retries. Reopening the durable record resolves interrupted responses. */
export function createProjectAnalysisClient(fetcher: typeof fetch, projectId: string, isCurrent: () => boolean) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/analysis`
  const current = () => { if (!isCurrent()) throw new Error("The owner or project changed. Reopen the current project's analysis.") }
  async function request(url: string, body?: AnalysisRequest) {
    current()
    const response = await fetcher(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" })
    const value: unknown = await response.json(); current()
    if (!response.ok) throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : `Package review failed (${response.status}). Reopen its retained state.`)
    return value
  }
  function record(value: unknown) {
    const parsed = parseProjectAnalysisRecord(value)
    if (!parsed || parsed.projectId !== projectId) throw new Error("The analysis response did not match this project or its retained source bindings.")
    return parsed
  }
  async function listPage(cursor?: string) {
    const raw = await request(endpoint + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""))
    if (!raw || typeof raw !== "object" || !("analyses" in raw) || !Array.isArray(raw.analyses) || !("nextCursor" in raw) || raw.nextCursor !== null && typeof raw.nextCursor !== "string") throw new Error("The recorded analysis history could not be verified.")
    return { analyses: raw.analyses.map(record), nextCursor: raw.nextCursor as string | null }
  }
  return {
    listPage,
    async list() {
      const analyses: ProjectAnalysisRecord[] = [], seen = new Set<string>(); let cursor: string | undefined
      do {
        const page = await listPage(cursor)
        for (const item of page.analyses) { if (seen.has(item.id)) throw new Error("Analysis history changed while paging. Refresh its retained records."); seen.add(item.id); analyses.push(item) }
        if (page.nextCursor === cursor || analyses.length > 5000) throw new Error("Analysis history needs explicit cursor paging; no records were silently truncated.")
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      return { analyses }
    },
    async get(id: string) {
      const raw = await request(`${endpoint}?analysisId=${encodeURIComponent(id)}`)
      const analysis = record(raw && typeof raw === "object" && "analysis" in raw ? raw.analysis : null)
      if (analysis.id !== id) throw new Error("The reopened analysis identity changed.")
      return { analysis }
    },
    async run(input: AnalysisRequest) {
      const raw = await request(endpoint, input)
      return { analysis: record(raw && typeof raw === "object" && "analysis" in raw ? raw.analysis : null) }
    },
  }
}
