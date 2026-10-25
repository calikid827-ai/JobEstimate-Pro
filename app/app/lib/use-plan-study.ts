"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Study } from "../../lib/plan-study/types"

export type StudyProblem = { code: string; message: string }

/** Study persistence always comes from owner-authenticated routes, never browser storage. */
export function usePlanStudy(fetcher: typeof fetch, ownerKey: string) {
  const [studies, setStudies] = useState<Study[]>([])
  const [study, setStudy] = useState<Study | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<StudyProblem | null>(null)
  const [loaded, setLoaded] = useState(false)
  const scope = useRef({ ownerKey, generation: 0 })
  const requests = useRef(new Set<AbortController>())
  const pending = useRef(false)

  useEffect(() => {
    scope.current = { ownerKey, generation: scope.current.generation + 1 }
    setStudies([]); setStudy(null); setProblem(null); setLoaded(false); setBusy(false)
    return () => {
      scope.current.generation += 1
      for (const request of requests.current) request.abort()
      requests.current.clear()
      pending.current = false
    }
  }, [ownerKey])

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T | undefined> => {
    // This guard also prevents a second rapid click before React disables its button.
    if (pending.current) return undefined
    pending.current = true
    setBusy(true); setProblem(null)
    const captured = { ...scope.current }
    const controller = new AbortController()
    requests.current.add(controller)
    const current = () => captured.ownerKey === scope.current.ownerKey && captured.generation === scope.current.generation && !controller.signal.aborted
    try {
      const response = await fetcher(path, { ...init, signal: controller.signal })
      const value = await response.json()
      if (!current()) return undefined
      if (!response.ok) {
        setProblem({ code: typeof value.code === "string" ? value.code : "STUDY_REQUEST_FAILED", message: typeof value.error === "string" ? value.error : "The study request could not be completed." })
        return undefined
      }
      return value as T
    } catch {
      if (current()) setProblem({ code: "STUDY_CONNECTION_INTERRUPTED", message: "The connection was interrupted. Reopen the study to check its recorded state before continuing. A review attempt with an unknown outcome must be reconciled before another attempt." })
      return undefined
    } finally {
      requests.current.delete(controller)
      if (current()) { pending.current = false; setBusy(false) }
    }
  }, [fetcher])

  const accept = useCallback((value: Study) => {
    setStudy(value)
    setStudies((current) => [value, ...current.filter((item) => item.id !== value.id)])
  }, [])

  const list = useCallback(async () => {
    const data = await request<{ studies: Study[] }>("/api/plan-studies")
    if (data) { setStudies(data.studies); setLoaded(true) }
  }, [request])
  const open = useCallback(async (id: string) => {
    const data = await request<{ study: Study }>(`/api/plan-studies/${encodeURIComponent(id)}`)
    if (data) accept(data.study)
  }, [request, accept])
  const create = useCallback(async (title: string) => {
    const data = await request<{ study: Study }>("/api/plan-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) })
    if (data) accept(data.study)
  }, [request, accept])
  const mutate = useCallback(async (kind: "prepare" | "steps" | "decisions", body: Record<string, unknown>) => {
    if (!study) return
    const data = await request<{ study: Study }>(`/api/plan-studies/${encodeURIComponent(study.id)}/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, expectedRevision: study.revision }) })
    if (data) accept(data.study)
  }, [study, request, accept])
  const upload = useCallback(async (file: File, replacesDocumentId?: string) => {
    if (!study) return
    const form = new FormData()
    form.set("file", file)
    form.set("expectedRevision", String(study.revision))
    if (replacesDocumentId) form.set("replacesDocumentId", replacesDocumentId)
    const data = await request<{ study: Study }>(`/api/plan-studies/${encodeURIComponent(study.id)}/documents`, { method: "POST", body: form })
    if (data) accept(data.study)
  }, [study, request, accept])

  return { studies, study, busy, problem, loaded, list, open, create, upload,
    prepare: () => mutate("prepare", {}),
    review: () => mutate("steps", { idempotencyKey: crypto.randomUUID() }),
    answer: (findingId: string, answer: string) => mutate("decisions", { findingId, answer }),
  }
}
