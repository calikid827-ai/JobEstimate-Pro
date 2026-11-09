"use client"

import { lazy, Suspense, useEffect, useState } from "react"
import type { Citation, Finding, Study } from "../../lib/plan-study/types"
import { activePages, STUDY_LIMITS } from "../../lib/plan-study/types"
import { buildStudyBriefing } from "../../lib/plan-study/briefing"
import { formatPlanUploadBytes } from "../../lib/plan-upload"
import { usePlanStudy } from "../lib/use-plan-study"
import { eligibleStudyDecisions } from "../lib/source-linked-draft"
const PlanStudyEvidenceViewer = lazy(() => import("./PlanStudyEvidenceViewer"))

const buttonStyle = { padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", minHeight: 44, cursor: "pointer", fontWeight: 650 } as const
const boxStyle = { padding: 12, border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" } as const
const kindLabels: Record<Finding["kind"], string> = { requirement: "Source requirement", assumption: "Assumption", conflict: "Conflict to resolve", boundary: "Boundary / exclusion", question: "Unanswered question" }

export type StudyDraftSelection = {
  ownerId: string
  enabled: boolean
  onSelect: (study: Study, findingId: string, decisionIds: string[]) => void
  replacementItems?: Array<{ id: string; studyId: string; findingId: string }>
  onReplace?: (study: Study, findingId: string, decisionIds: string[], itemId: string) => void
  onStudyObserved?: (study: Study) => void
}

function citationLabel(study: Study, citation: Citation): string {
  const document = study.documents.find((item) => item.id === citation.documentVersionId)
  const page = document?.pages.find((item) => item.id === citation.pageId)
  return `${document?.name || "Retained source"} · physical page ${page?.pageNumber || "?"}`
}

function AnswerForm({ finding, study, busy, onSave }: { finding: Finding; study: Study; busy: boolean; onSave: (answer: string) => void }) {
  const sourceIds = new Set(finding.citations.map((citation) => citation.documentVersionId))
  const saved = [...study.decisions].reverse().find((decision) => decision.findingId === finding.id && decision.status === "active"
    && decision.sourceRevision === study.sourceRevision && decision.documentVersionIds.length === sourceIds.size
    && new Set(decision.documentVersionIds).size === sourceIds.size && decision.documentVersionIds.every((id) => sourceIds.has(id)))
  const [answer, setAnswer] = useState(saved?.answer || "")
  return <form onSubmit={(event) => { event.preventDefault(); if (answer.trim()) onSave(answer.trim()) }} style={{ display: "grid", gap: 8, marginTop: 10 }}>
    <label style={{ display: "grid", gap: 6 }}>Your answer to “{finding.title}”
      <textarea aria-label={`Answer: ${finding.title}`} value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={2000} rows={3} disabled={busy} style={{ width: "100%", padding: 8, boxSizing: "border-box" }} />
    </label>
    {saved && <p style={{ margin: 0, color: "#166534", fontSize: 13 }}>Saved answer: {saved.answer}</p>}
    <button type="submit" disabled={busy || !answer.trim() || answer.trim() === saved?.answer} style={{ ...buttonStyle, justifySelf: "start" }}>Save study answer</button>
  </form>
}

function FindingDraftSelection({ finding, study, busy, selection }: { finding: Finding; study: Study; busy: boolean; selection: StudyDraftSelection }) {
  const [selectedDecisionIds, setSelectedDecisionIds] = useState<string[]>([])
  const decisions = eligibleStudyDecisions(study, finding.id)
  const matchingItems = (selection.replacementItems || []).filter((item) => item.studyId === study.id && item.findingId === finding.id)
  const replacementItem = matchingItems.length === 1 ? matchingItems[0] : undefined
  const matchingOwner = selection.ownerId === study.ownerId
  const enabled = selection.enabled && matchingOwner && !busy
  const unavailableReason = !matchingOwner ? "This study belongs to a different owner."
    : !selection.enabled ? "Choose a job and create or reopen an internal draft first."
    : busy ? "Wait for the recorded study operation to finish." : undefined
  return <fieldset data-study-draft-selection={finding.id} disabled={!enabled} title={unavailableReason} style={{ marginTop: 12, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}>
    <legend style={{ fontWeight: 650 }}>Internal draft handoff</legend>
    <p style={{ margin: "0 0 8px", fontSize: 13 }}>Add this finding with its recorded evidence. Select any saved answers to retain with it. The draft item starts unresolved; this does not confirm scope, quantities or company costs.</p>
    {decisions.length ? decisions.map((decision) => {
      const inputId = `draft-study-answer-${encodeURIComponent(study.id)}-${encodeURIComponent(finding.id)}-${encodeURIComponent(decision.id)}`
      return <label key={decision.id} htmlFor={inputId} style={{ display: "flex", alignItems: "start", gap: 8, margin: "8px 0", overflowWrap: "anywhere" }}>
        <input id={inputId} type="checkbox" checked={selectedDecisionIds.includes(decision.id)} onChange={(event) => {
          const checked = event.currentTarget.checked
          setSelectedDecisionIds((current) => checked ? [...current.filter((id) => id !== decision.id), decision.id] : current.filter((id) => id !== decision.id))
        }} />
        <span>Include saved answer: {decision.answer}</span>
      </label>
    }) : <p style={{ fontSize: 13 }}>No current saved answers are available for this finding. The finding can still be added as unresolved.</p>}
    <button type="button" disabled={!enabled} style={buttonStyle} onClick={() => {
      if (enabled) selection.onSelect(study, finding.id, [...selectedDecisionIds])
    }}>Add finding to internal draft</button>
    {replacementItem && selection.onReplace && <div style={{ marginTop: 10 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13 }}>This finding already has a draft item at the entered location. Replace its retained evidence with this finding and only the answers selected above. Entered scope and costs remain; the item becomes unresolved and needs scope/quantity confirmation and direct-cost approval again. Saved revisions remain unchanged.</p>
      <button type="button" disabled={!enabled} style={buttonStyle} onClick={() => {
        if (enabled) selection.onReplace?.(study, finding.id, [...selectedDecisionIds], replacementItem.id)
      }}>Replace retained evidence on draft item</button>
    </div>}
    {unavailableReason && <p style={{ margin: "8px 0 0", fontSize: 13 }}>{unavailableReason}</p>}
  </fieldset>
}

function FindingRecord({ finding, study, busy, allowAnswer, draftSelection, onEvidence, onAnswer }: { finding: Finding; study: Study; busy: boolean; allowAnswer: boolean; draftSelection?: StudyDraftSelection; onEvidence: (citation: Citation) => void; onAnswer: (answer: string) => void }) {
  const uniqueIdentity = study.findings.filter((item) => item.id === finding.id).length === 1
  return <article data-study-finding={finding.id} style={boxStyle}>
    <div style={{ fontSize: 12, color: "#475569" }}>{kindLabels[finding.kind]} · {finding.trade}</div>
    <h5 style={{ fontSize: 15, margin: "5px 0" }}>{finding.title}</h5>
    <p style={{ margin: "5px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{finding.detail}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{finding.citations.map((citation, index) => <button key={index} type="button" style={buttonStyle} onClick={() => onEvidence(citation)}>Evidence {index + 1}: {citationLabel(study, citation)}</button>)}</div>
    {finding.limitations.length > 0 && <ul style={{ fontSize: 13 }}>{finding.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
    {(finding.kind === "question" || finding.kind === "conflict") && (uniqueIdentity && allowAnswer
      ? <AnswerForm key={`${finding.id}:${study.revision}`} finding={finding} study={study} busy={busy} onSave={onAnswer} />
      : <p>Answer entry is unavailable until this finding’s identity and source provenance can be established. Existing answers remain in Saved study answers.</p>)}
    {draftSelection && uniqueIdentity && allowAnswer && <FindingDraftSelection key={`${study.ownerId}:${study.id}:${study.revision}:${finding.id}`} finding={finding} study={study} busy={busy} selection={draftSelection} />}
  </article>
}

/** Internal study tools never mutate Estimate scope, measurements, prices or customer output. */
export default function PlanStudySection({ fetcher, ownerKey, draftSelection }: { fetcher: typeof fetch; ownerKey: string; draftSelection?: StudyDraftSelection }) {
  const state = usePlanStudy(fetcher, ownerKey)
  const [title, setTitle] = useState("Painting and wallcovering plan study")
  const [evidence, setEvidence] = useState<Citation | null>(null)
  const study = state.study
  const observedOwnerId = draftSelection?.ownerId
  const onStudyObserved = draftSelection?.onStudyObserved
  useEffect(() => {
    if (study && study.ownerId === observedOwnerId) onStudyObserved?.(study)
  }, [study, observedOwnerId, onStudyObserved])
  const pages = study ? activePages(study) : []
  const prepared = pages.filter((page) => page.rendering === "complete" && ["complete", "empty"].includes(page.extraction)).length
  const analyzed = pages.filter((page) => page.analysis === "complete").length
  const limited = pages.filter((page) => page.analysis === "limited").length
  const incomplete = pages.length - analyzed - limited
  const uncertain = study?.attempts.some((attempt) => ["unknown", "running"].includes(attempt.status))
  const hasPendingPreparation = pages.some((page) => page.extraction === "pending" || page.rendering === "pending")
  const reviewStepsRecorded = study?.synthesis === "complete" && pages.length > 0 && incomplete === 0
  const briefing = study ? buildStudyBriefing(study) : null
  const coverageComplete = reviewStepsRecorded && limited === 0 && study?.synthesisReviewStatus === "complete" && Boolean(briefing?.synthesis)
  const findingRecord = (finding: Finding, index: number, allowAnswer = true) => study && <FindingRecord key={`${finding.id}:${index}`} finding={finding} study={study} busy={state.busy} allowAnswer={allowAnswer} draftSelection={draftSelection} onEvidence={setEvidence} onAnswer={(answer) => { void state.answer(finding.id, answer) }} />

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
        <button type="button" disabled={state.busy || !pages.length || hasPendingPreparation || Boolean(uncertain) || Boolean(reviewStepsRecorded)} style={buttonStyle} onClick={() => { void state.review() }}>Review next recorded step</button>
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
        {study.attempts.length > 0 && <ul>{study.attempts.map((attempt, index) => <li key={`${attempt.id}:${index}`}>Review attempt {index + 1}: {attempt.kind}, {attempt.status}{attempt.errorCode ? ` (${attempt.errorCode})` : ""}. Reserved input/output: {attempt.reservation.inputTokens}/{attempt.reservation.outputTokens} tokens{attempt.usage ? `; reported use: ${attempt.usage.inputTokens}/${attempt.usage.outputTokens}` : "; actual usage not recorded"}.</li>)}</ul>}
      </details>
      {pages.some((page) => page.analysis === "limited" || page.issue) && <section aria-label="Page review limitations" style={boxStyle}>
        <strong>Page review limitations</strong>
        <ul>{pages.filter((page) => page.analysis === "limited" || page.issue).map((page) => <li key={page.id}>{citationLabel(study, { documentVersionId: page.documentVersionId, pageId: page.id, sourceSha256: page.sourceSha256, anchor: { kind: "image", bounds: { x: 0, y: 0, width: 1, height: 1 } } })}: {page.issue || "Substantive review is limited; complete page coverage has not been established."}</li>)}</ul>
      </section>}
      <section aria-label="Painting and wallcovering briefing" style={{ display: "grid", gap: 10 }}>
        <h4 style={{ margin: 0 }}>Painting &amp; wallcovering briefing</h4>
        <p data-study-synthesis-execution style={{ margin: 0, fontSize: 13 }}>Package synthesis execution: {study.synthesis}. {coverageComplete ? "Recorded substantive coverage is complete for the current source package; this does not prove accuracy." : "Complete substantive package coverage has not been established."} {study.modelLabel ? `Review source: ${study.modelLabel}.` : "No model review has been recorded."} Citations are checked for retained-source identity and valid anchors; this does not prove the model interpreted them correctly.</p>
        {study.synthesisReviewStatus === "limited" && <p role="status">Cross-document analysis is limited; the recorded step does not establish complete package coverage.</p>}
        {study.synthesis === "complete" && !study.synthesisReviewStatus && <p role="status">The recorded synthesis has no substantive coverage status. Execution completion alone does not establish coverage.</p>}
        {Boolean(study.synthesisLimitations?.length) && <ul aria-label="Cross-document review limitations">{study.synthesisLimitations!.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
        {study.findings.length === 0 && <p>No current findings have been returned. Prepared pages alone do not establish requirements.</p>}
        <section aria-label="Package synthesis briefing" style={{ display: "grid", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Package synthesis briefing</h4>
          <p style={{ margin: 0, fontSize: 13 }}>The recorded synthesis is the primary package briefing. Supporting page records retain the earlier review passes; repeated observations across passes are not independent problems. Synthesis may not contain every page-level observation. Finding classifications and answers remain as recorded.</p>
          {briefing?.synthesis ? <div data-study-synthesis-attempt={briefing.synthesis.attempt.id} style={{ display: "grid", gap: 10 }}>{briefing.synthesis.findings.length ? briefing.synthesis.findings.map((finding, index) => findingRecord(finding, index)) : <p>No findings can be assigned to this synthesis from the recorded identities. This does not establish that the package has no unresolved issues; any unassigned records remain below.</p>}</div> : <p>No package synthesis briefing can be identified for the current sources from completed attempt records. Execution state: {study.synthesis}. Supporting and unassigned records remain available below.</p>}
        </section>
        {briefing?.provenanceNotice && <p role="status">{briefing.provenanceNotice}</p>}
        <details aria-label="Supporting page review records">
          <summary style={{ cursor: "pointer", fontWeight: 650 }}>Supporting page review records · {briefing?.supporting.reduce((count, group) => count + group.findings.length, 0) || 0} retained findings</summary>
          <p style={{ fontSize: 13 }}>These findings belong to recorded page-review passes, rather than additional package-level problems. Each retains its own evidence and answer identity, including observations not repeated in synthesis.</p>
          {briefing?.supporting.length ? briefing.supporting.map((group) => {
            const page = pages.find((item) => item.id === group.attempt.pageId)
            const document = study.documents.find((item) => item.id === page?.documentVersionId)
            return <section key={group.attempt.id} data-study-page-attempt={group.attempt.id} style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <h4 style={{ margin: 0 }}>{document?.name} · physical page {page?.pageNumber} · supporting review record</h4>
              <p style={{ margin: 0, fontSize: 13 }}>Attempt {group.attempt.id}. Page analysis: {page?.analysis}.</p>
              {group.findings.length ? group.findings.map((finding, index) => findingRecord(finding, index)) : <p>No findings can be assigned to this page-review attempt from the recorded identities; this is not proof of complete coverage.</p>}
            </section>
          }) : <p>No page findings with established current attempt provenance are recorded.</p>}
        </details>
        {Boolean(briefing?.unassigned.length) && <section aria-label="Records with unestablished provenance" style={{ display: "grid", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Retained records · provenance not established</h4>
          <p style={{ margin: 0, fontSize: 13 }}>These records remain accessible as recorded. Their origin cannot be safely assigned to a current page review or package synthesis; they are not counted as additional independent problems.</p>
          {briefing!.unassigned.map(({ finding, reason }, index) => <div key={`${finding.id}:${index}`}><p style={{ fontSize: 13 }}>{reason}</p>{findingRecord(finding, index, false)}</div>)}
        </section>}
      </section>
      {study.decisions.length > 0 && <section aria-label="Saved study answers" style={boxStyle}>
        <h4 style={{ margin: "0 0 8px" }}>Saved study answers</h4>
        <p style={{ fontSize: 13 }}>These are your decisions, not source requirements or Estimate instructions. They are not applied to an Estimate automatically.</p>
        <ul>{study.decisions.map((decision) => <li key={decision.id} data-study-decision-status={decision.status} style={{ marginTop: 8 }}><strong>{decision.status === "needs_reconfirmation" ? "Needs reconfirmation — source replaced" : "Saved"}</strong> — {decision.findingTitle}: {decision.answer} <span style={{ fontSize: 13 }}>(source revision {decision.sourceRevision})</span></li>)}</ul>
      </section>}
      {evidence && <Suspense fallback={<p role="status">Opening retained evidence…</p>}><PlanStudyEvidenceViewer key={`${study.id}:${evidence.documentVersionId}:${evidence.pageId}:${evidence.sourceSha256}`} study={study} citation={evidence} fetcher={fetcher} onClose={() => setEvidence(null)} /></Suspense>}
    </div>}
  </details>
}
