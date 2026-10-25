"use client"

import { useEffect, useRef, useState } from "react"
import type { Citation, Study } from "../../lib/plan-study/types"

type Props = { study: Study; citation: Citation; fetcher: typeof fetch; onClose: () => void }
const WORKER = "/plan-study/pdf.worker-6.4.299.min.mjs"

/** Render retained package bytes. PDF actions, links, scripts and attachments are never activated. */
export default function PlanStudyEvidenceViewer({ study, citation, fetcher, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState("Opening retained source…")
  const [ready, setReady] = useState(false)
  const document = study.documents.find((d) => d.id === citation.documentVersionId && d.sha256 === citation.sourceSha256)
  const page = document?.pages.find((p) => p.id === citation.pageId && p.sourceSha256 === citation.sourceSha256)
  const blockId = citation.anchor.kind === "text" ? citation.anchor.blockId : undefined
  const textBlock = page?.blocks.find((b) => b.id === blockId)
  const prepared = page?.rendering === "complete" && ["complete", "empty"].includes(page.extraction)
  const valid = Boolean(prepared && document && page && (citation.anchor.kind === "image" || (textBlock && textBlock.text.includes(citation.anchor.quote))))
  const bounds = citation.anchor.kind === "image" ? citation.anchor.bounds : textBlock?.bounds

  useEffect(() => {
    closeRef.current?.focus()
    setReady(false)
    if (page && !prepared) { setStatus("Prepare this physical page before opening evidence. Failed or unsupported preparation remains unavailable."); return }
    if (!valid || !document || !page) { setStatus("This source reference is unavailable or no longer matches the retained version."); return }
    const controller = new AbortController()
    let disposed = false
    let destroy: (() => Promise<void>) | undefined
    setStatus("Opening retained source…")
    void (async () => {
      try {
        const url = `/api/plan-studies/${encodeURIComponent(study.id)}/evidence/${encodeURIComponent(document.originalArtifactId)}?documentVersionId=${encodeURIComponent(document.id)}`
        const response = await fetcher(url, { signal: controller.signal })
        if (!response.ok || response.headers.get("Content-Type")?.split(";")[0] !== "application/pdf") throw new Error("SOURCE_UNAVAILABLE")
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (disposed) return
        // Verify fetched bytes against the server-recorded immutable source identity.
        const digest = await crypto.subtle.digest("SHA-256", bytes)
        const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
        if (sha256 !== citation.sourceSha256) throw new Error("SOURCE_IDENTITY_CHANGED")
        const pdfjs = await import("pdfjs-dist")
        if (disposed) return
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER
        const loading = pdfjs.getDocument({
          data: bytes,
          enableXfa: false,
          useWasm: false,
          disableAutoFetch: true,
          disableStream: true,
          disableRange: true,
          maxImageSize: 4_000_000,
          stopAtErrors: true,
          verbosity: 0,
        })
        destroy = () => loading.destroy()
        const pdf = await loading.promise
        if (disposed) return
        if (pdf.numPages !== document.pageCount) throw new Error("SOURCE_PAGE_COUNT_CHANGED")
        const sourcePage = await pdf.getPage(page.pageNumber)
        if (disposed || !canvasRef.current) return
        const base = sourcePage.getViewport({ scale: 1 })
        if (!Number.isFinite(base.width * base.height) || base.width <= 0 || base.height <= 0) throw new Error("PAGE_SIZE_INVALID")
        const scale = Math.min(1.5, 4096 / base.width, 4096 / base.height, Math.sqrt((4_000_000 - 8193) / (base.width * base.height)))
        const viewport = sourcePage.getViewport({ scale })
        const canvas = canvasRef.current
        const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height)
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096 || width * height > 4_000_000) throw new Error("PAGE_RASTER_LIMIT")
        canvas.width = width; canvas.height = height
        const context = canvas.getContext("2d")
        if (!context) throw new Error("CANVAS_UNAVAILABLE")
        await sourcePage.render({ canvas, canvasContext: context, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise
        if (!disposed) { setReady(true); setStatus("Retained source open. Highlight identifies the cited area; verify its meaning in context.") }
      } catch {
        if (!disposed) setStatus("The retained source could not be opened. Reopen the study or check access; no external source was opened.")
      }
    })()
    return () => { disposed = true; controller.abort(); void destroy?.() }
  }, [study.id, citation, document, page, prepared, valid, fetcher])

  return (
    <section role="region" aria-label="Supporting plan evidence" className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900" onKeyDown={(event) => { if (event.key === "Escape") onClose() }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">Supporting evidence</h4>
          {document && page && <p>{document.name} · physical page {page.pageNumber} of {document.pageCount}</p>}
          {document && !document.active && <p role="status" className="font-semibold text-amber-800">Earlier retained source version — refresh the study and reconfirm affected decisions.</p>}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded border px-3 py-2">Close evidence</button>
      </div>
      <p role="status" className="my-3 text-sm">{status}</p>
      {citation.anchor.kind === "text" && <blockquote className="my-3 border-l-4 border-blue-300 pl-3">{citation.anchor.quote}</blockquote>}
      <div className="max-h-[70vh] overflow-auto border bg-slate-100">
        <div className="relative mx-auto w-fit max-w-full">
          <canvas ref={canvasRef} aria-label="Retained PDF source page" aria-hidden={!ready} style={{ display: ready ? "block" : "none", maxWidth: "100%", height: "auto" }} />
          {ready && bounds && <div aria-hidden="true" data-testid="study-evidence-highlight" style={{ position: "absolute", pointerEvents: "none", left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%`, border: "2px solid #b45309", background: "rgba(250,204,21,.22)" }} />}
        </div>
      </div>
      <p className="mt-3 text-sm">A valid source reference proves where the briefing points. It does not prove that the interpretation is correct. Study findings and answers do not become measurements, prices or Estimate scope automatically.</p>
    </section>
  )
}
