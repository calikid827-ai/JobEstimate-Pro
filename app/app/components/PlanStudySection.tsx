"use client"

import { lazy, Suspense, useState } from "react"
import type { Citation, Finding, Study } from "../../lib/plan-study/types"
import { activePages, STUDY_LIMITS } from "../../lib/plan-study/types"
import { formatPlanUploadBytes } from "../../lib/plan-upload"
import { usePlanStudy } from "../lib/use-plan-study"
const PlanStudyEvidenceViewer = lazy(() => import("./PlanStudyEvidenceViewer"))

const buttonStyle = { padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", minHeight: 44, cursor: "pointer", fontWeight: 650 } as const
const boxStyle = { padding: 12, border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" } as const
const kindLabels: Record<Finding["kind"], string> = { requirement: "Source requirement", assumption: "Assumption", conflict: "Conflict to resolve", boundary: "Boundary / exclusion", question: "Unanswered question" }

function citationLabel(study: Study, citation: Citation): string {
  const document = study.documents.find((item) => item.id === citation.documentVersionId)
  const page = document?.pages.find((item) => item.id === citation.pageId)
  return `${document?.name || "Retained source"} · physical page ${page?.pageNumber || "?"}`
}

function AnswerForm({ finding, study, busy, onSave }: { finding: Finding; study: Study; busy: boolean; onSave: (answer: string) => void }) {
  const saved = [...study.decisions].reverse().find((decision) => decision.findingId === finding.id && decision.status === "active")
  const [answer, setAnswer] = useState(saved?.answer || "")
  return <form onSubmit={(event) => { event.preventDefault(); if (answer.trim()) onSave(answer.trim()) }} style={{ display: "grid", gap: 8, marginTop: 10 }}>
    <label style={{ display: "grid", gap: 6 }}>Your answer to “{finding.title}”
      <textarea aria-label={`Answer: ${finding.title}`} value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={2000} rows={3} disabled={busy} style={{ width: "100%", padding: 8, boxSizing: "border-box" }} />
    </label>
    {saved && <p style={{ margin: 0, color: "#166534", fontSize: 13 }}>Saved answer: {saved.answer}</p>}
    <button type="submit" disabled={busy || !answer.trim() || answer.trim() === saved?.answer} style={{ ...buttonStyle, justifySelf: "start" }}>Save study answer</button>
  </form>
}

/** Internal study tools never mutate Estimate scope, measurements, prices or customer output. */
export default function PlanStudySection({ fetcher, ownerKey }: { fetcher: typeof fetch; ownerKey: string }) {
  const state = usePlanStudy(fetcher, ownerKey)
  const [title, setTitle] = useState("Painting and wallcovering plan study")
  const [evidence, setEvidence] = useState<Citation | null>(null)
  const study = state.study
  const pages = study ? activePages(study) : []
  const prepared = pages.filter((page) => page.rendering === "complete" && ["complete", "empty"].includes(page.extraction)).length
  const analyzed = pages.filter((page) => page.analysis === "complete").length
  const limited = pages.filter((page) => page.analysis === "limited").length
  const incomplete = pages.length - analyzed - limited
  const uncertain = study?.attempts.some((attempt) => ["unknown", "running"].includes(attempt.status))
  const hasPendingPreparation = pages.some((page) => page.extraction === "pending" || page.rendering === "pending")
  const completed = study?.synthesis === "complete" && incomplete === 0

  return <details data-plan-study data-no-print style={{ marginTop: 16, ...boxStyle }} onToggle={(event) => { if (event.currentTarget.open && !state.loaded && !state.busy) void state.list() }}>
    <summary style={{ cursor: "pointer", fontWeight: 800, minHeight: 32 }}>Study a plan package · painting &amp; wallcovering</summary>
    <p style={{ color: "#475569", lineHeight: 1.5, fontSize: 13 }}>Read the package, inspect cited evidence, and retain your answers. Study answers stay separate from source requirements and your Estimate. Quantities are unverified clues and do not become measurements or pricing inputs.</p>
    <p style={{ fontSize: 13 }}>This first slice accepts PDF originals up to {STUDY_LIMITS.maxFileBytes / 1024 / 1024} MiB each, {STUDY_LIMITS.maxDocuments} active documents and {STUDY_LIMITS.maxPages} physical pages per package. Every accepted page is inventoried; larger packages are rejected explicitly. A separately configured owner study allowance is required for model review. Creating a study does not grant or replenish it.</p>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 8 }}>
      <label style={{ display: "grid", gap: 5, flex: "1 1 220px" }}>Study title<input aria-label="Study title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} style={{ padding: 9, width: "100%", boxSizing: "border-box" }} /></label>
      <button type="button" disabled={state.busy || !title.trim()} style={buttonStyle} onClick={() => { setEvidence(null); void state.create(title.trim()) }}>New study</button>
      <button type="button" disabled={state.busy} style={buttonStyle} onClick={() => { void state.list() }}>Refresh saved studies</button>
    </div>
    {state.studies.length > 0 && <label style={{ display: "grid", gap: 5, marginTop: 12 }}>Open saved study<select aria-label="Open saved study" value={study?.id || ""} disabled={state.busy} onChange={(event) => { if (event.target.value) { setEvidence(null); void state.open(event.target.value) } }} style={{ padding: 9, width: "100%" }}><option value="">Choose a study</option>{state.studies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
    {state.problem && <p role="alert" data-study-problem={state.problem.code} style={{ ...boxStyle, borderColor: "#fbbf24", background: "#fffbeb" }}><strong>{state.problem.code}</strong>: {state.problem.message}</p>}
    {state.busy && <p role="status">Saving or processing one recorded step…</p>}
    {study && <div key={study.id} style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <h3 style={{ margin: 0 }}>{study.title}</h3>
      <label style={{ display: "grid", gap: 5 }}>Add a PDF to this retained package<input aria-label="Add study PDF" type="file" accept=".pdf,application/pdf" disabled={state.busy || study.documents.filter((document) => document.active).length >= STUDY_LIMITS.maxDocuments} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) { setEvidence(null); void state.upload(file) } }} /></label>
      <p data-study-coverage style={{ margin: 0, fontWeight: 650 }}>{pages.length} physical page{pages.length === 1 ? "" : "s"} indexed · {prepared} text/image preparations complete · {analyzed} substantively reviewed · {limited} limited/unreadable · {incomplete} incomplete</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" disabled={state.busy || !hasPendingPreparation} style={buttonStyle} onClick={() => { void state.prepare() }}>Prepare next page</button>
        <button type="button" disabled={state.busy || !pages.length || hasPendingPreparation || Boolean(uncertain) || Boolean(completed)} style={buttonStyle} onClick={() => { void state.review() }}>Review next recorded step</button>
        <button type="button" disabled={state.busy} style={buttonStyle} onClick={() => { setEvidence(null); void state.open(study.id) }}>Reopen recorded state</button>
      </div>
      {uncertain && <p role="status" style={{ color: "#92400e" }}>A review attempt is running or has an unknown outcome. Its allowance reservation is retained. Reopen to observe its recorded result; an unknown outcome requires reconciliation before another provider attempt.</p>}
      <details><summary style={{ cursor: "pointer" }}>Every page and processing record</summary>
        <p style={{ fontSize: 13 }}>Indexing confirms a retained physical page. Extracting text or rendering an image does not establish substantive review or semantic accuracy. Empty extraction can mean an image-only or unreadable page.</p>
        {study.documents.filter((document) => document.active).map((document) => <div key={document.id} style={{ ...boxStyle, marginTop: 8 }}>
          <strong>{document.name}</strong> · {document.pageCount} physical pages · {formatPlanUploadBytes(document.bytes)}
          <label style={{ display: "grid", gap: 5, marginTop: 8 }}>Replace this source with a new immutable PDF version<input aria-label={`Replace ${document.name}`} type="file" accept=".pdf,application/pdf" disabled={state.busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) { setEvidence(null); void state.upload(file, document.id) } }} /></label>
          <ol style={{ paddingLeft: 22 }}>{document.pages.map((page) => <li key={page.id} data-study-page={page.id} style={{ marginTop: 10, overflowWrap: "anywhere" }}>
            Physical page {page.pageNumber}: indexed; text {page.extraction}; image {page.rendering}; substantive analysis {page.analysis}.
            {page.issue && <div>{page.issue}</div>}
            <button type="button" disabled={page.rendering !== "complete" || !["complete", "empty"].includes(page.extraction)} style={{ ...buttonStyle, marginTop: 5, marginLeft: 6 }} onClick={() => setEvidence({ documentVersionId: document.id, pageId: page.id, sourceSha256: document.sha256, anchor: { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 } } })}>Open {document.name} page {page.pageNumber}</button>
          </li>)}</ol>
        </div>)}
        {study.attempts.length > 0 && <ul>{study.attempts.map((attempt, index) => <li key={attempt.id}>Review attempt {index + 1}: {attempt.kind}, {attempt.status}{attempt.errorCode ? ` (${attempt.errorCode})` : ""}. Reserved input/output: {attempt.reservation.inputTokens}/{attempt.reservation.outputTokens} tokens{attempt.usage ? `; reported use: ${attempt.usage.inputTokens}/${attempt.usage.outputTokens}` : "; actual usage not recorded"}.</li>)}</ul>}
      </details>
      <section aria-label="Painting and wallcovering briefing" style={{ display: "grid", gap: 10 }}>
        <h4 style={{ margin: 0 }}>Painting &amp; wallcovering briefing</h4>
        <p style={{ margin: 0, fontSize: 13 }}>{completed ? "Recorded review steps are complete for the current source package." : "This briefing is incomplete until all current pages and the cross-document review are recorded."} {study.modelLabel ? `Review source: ${study.modelLabel}.` : "No model review has been recorded."} Citations are checked for retained-source identity and valid anchors; this does not prove the model interpreted them correctly.</p>
        {study.synthesisReviewStatus === "limited" && <p role="status">Cross-document analysis is limited; the recorded step does not establish complete package coverage.</p>}
        {Boolean(study.synthesisLimitations?.length) && <ul aria-label="Cross-document review limitations">{study.synthesisLimitations!.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
        {study.findings.length === 0 && <p>No current findings have been returned. Prepared pages alone do not establish requirements.</p>}
        {study.findings.map((finding) => <article key={finding.id} data-study-finding={finding.id} style={boxStyle}>
          <div style={{ fontSize: 12, color: "#475569" }}>{kindLabels[finding.kind]} · {finding.trade}</div>
          <h5 style={{ fontSize: 15, margin: "5px 0" }}>{finding.title}</h5>
          <p style={{ margin: "5px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{finding.detail}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{finding.citations.map((citation, index) => <button key={index} type="button" style={buttonStyle} onClick={() => setEvidence(citation)}>Evidence {index + 1}: {citationLabel(study, citation)}</button>)}</div>
          {finding.limitations.length > 0 && <ul style={{ fontSize: 13 }}>{finding.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
          {(finding.kind === "question" || finding.kind === "conflict") && <AnswerForm key={`${finding.id}:${study.revision}`} finding={finding} study={study} busy={state.busy} onSave={(answer) => { void state.answer(finding.id, answer) }} />}
        </article>)}
      </section>
      {study.decisions.length > 0 && <section aria-label="Saved study answers" style={boxStyle}>
        <h4 style={{ margin: "0 0 8px" }}>Saved study answers</h4>
        <p style={{ fontSize: 13 }}>These are your decisions, not source requirements or Estimate instructions. They are not applied to an Estimate automatically.</p>
        <ul>{study.decisions.map((decision) => <li key={decision.id} data-study-decision-status={decision.status} style={{ marginTop: 8 }}><strong>{decision.status === "needs_reconfirmation" ? "Needs reconfirmation — source replaced" : "Saved"}</strong> — {decision.findingTitle}: {decision.answer}</li>)}</ul>
      </section>}
      {evidence && <Suspense fallback={<p role="status">Opening retained evidence…</p>}><PlanStudyEvidenceViewer key={`${study.id}:${evidence.documentVersionId}:${evidence.pageId}:${evidence.sourceSha256}`} study={study} citation={evidence} fetcher={fetcher} onClose={() => setEvidence(null)} /></Suspense>}
    </div>}
  </details>
}
