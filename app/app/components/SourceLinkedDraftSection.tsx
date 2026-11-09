"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Job } from "../lib/types"
import type { Study } from "../../lib/plan-study/types"
import type { Draft, DraftCommercial, DraftItem, DraftItemCalculation, DraftRevision, DraftUnit } from "../lib/source-linked-draft-types"
import type { createOwnerLocalPersistence } from "../lib/local-persistence"
import { createSourceLinkedDraftStore } from "../lib/source-linked-draft-store"
import { approveCosts, calculateDraft, checkStudyFreshness, confirmQuantity, createContractorItem, createDraft, importStudySelection, replaceStudySelection, snapshotStudySelection, updateDraftItem, workingCopy } from "../lib/source-linked-draft"
import { calculateProfitTargetMarkup } from "../lib/profit-target"
import PlanStudySection from "./PlanStudySection"

type Props = {
  ownerId: string
  ownerKey: string
  jobs: Job[]
  storage: ReturnType<typeof createOwnerLocalPersistence>
  isCurrent: () => boolean
  fetcher: typeof fetch
  defaults: DraftCommercial
}
const box = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, marginTop: 12 } as const
const button = { padding: "9px 12px", minHeight: 44, border: "1px solid #94a3b8", borderRadius: 7, background: "white", cursor: "pointer" } as const
const input = { padding: 8, width: "100%", boxSizing: "border-box" } as const
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 } as const
const units: Array<{ value: DraftUnit; label: string }> = [{ value: "sqft", label: "Square feet" }, { value: "linear_ft", label: "Linear feet" }, { value: "doors", label: "Doors" }, { value: "lump_sum", label: "Explicit lump sum" }]
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value)
const numberOrUnknown = (value: string) => value.trim() ? Number(value) : null
const problemText = (error: unknown) => error instanceof Error ? error.message : "The draft could not be updated."

/** This workspace never supplies legacy result/history, PDFs, approvals or invoices. */
export default function SourceLinkedDraftSection(props: Props) {
  const [jobId, setJobId] = useState("")
  const selectedJobRef = useRef("")
  const { jobs, isCurrent } = props
  const job = jobs.find((item) => item.id === jobId)
  const currentJob = useCallback((id: string) => isCurrent() && selectedJobRef.current === id && jobs.some((item) => item.id === id), [isCurrent, jobs])
  if (!props.isCurrent()) return <section data-no-print aria-label="Internal estimate drafts" style={box}><p role="alert">The owner session changed. Reopen the signed-in workspace before viewing or saving drafts.</p></section>
  return <section id="internal-estimate-drafts" data-no-print aria-label="Internal estimate drafts" style={box}>
    <h3 style={{ margin: "0 0 8px" }}>Internal estimate drafts · source-linked</h3>
    <p>Choose a job, select retained evidence or enter your own scope, then confirm quantities and approve direct costs. These drafts stay in this browser for this signed-in owner. They are not customer documents or cloud backups.</p>
    <label>Draft job<select aria-label="Draft job" value={job?.id || ""} style={input} onChange={(event) => { selectedJobRef.current = event.target.value; setJobId(event.target.value) }}>
      <option value="">Choose an existing job</option>{props.jobs.map((item) => <option key={item.id} value={item.id}>{item.jobName || "Untitled job"} · {item.clientName || "Client"}</option>)}
    </select></label>
    <p style={{ fontSize: 13 }}>Save a revision before switching jobs; switching closes the unsaved working copy. The first validation scope is a bounded painting area.</p>
    {!props.jobs.length && <p>Create a job through the existing estimate workflow first. No job or estimate is created automatically here.</p>}
    {job ? <JobDraftWorkspace key={`${props.ownerKey}:${job.id}`} {...props} job={job} currentJob={currentJob} /> : <PlanStudySection fetcher={props.fetcher} ownerKey={props.ownerKey} />}
  </section>
}

function JobDraftWorkspace({ ownerId, ownerKey, storage, isCurrent, fetcher, defaults, job, currentJob }: Props & { job: Job; currentJob: (id: string) => boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const draftRef = useRef(draft)
  const mounted = useRef(true)
  const [revisions, setRevisions] = useState<DraftRevision[]>([])
  const [recorded, setRecorded] = useState<DraftRevision | null>(null)
  const [selectedRevision, setSelectedRevision] = useState("")
  const [saved, setSaved] = useState<{ id: string; fingerprint: string } | null>(null)
  const [problem, setProblem] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [importLocation, setImportLocation] = useState("")
  const [marginTarget, setMarginTarget] = useState("")
  const latestAccess = useRef({ isCurrent, currentJob })
  useLayoutEffect(() => { latestAccess.current = { isCurrent, currentJob } }, [isCurrent, currentJob])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { draftRef.current = draft }, [draft])
  const accessible = useCallback(() => mounted.current && latestAccess.current.isCurrent() && latestAccess.current.currentJob(job.id), [job.id])
  const store = useMemo(() => createSourceLinkedDraftStore(ownerId, storage, (id) => id === job.id && accessible()), [ownerId, storage, job.id, accessible])
  const loadList = useCallback(() => {
    if (!accessible()) return
    const result = store.list(job.id)
    if (result.ok) setRevisions(result.revisions)
    else setProblem(result.error)
  }, [accessible, store, job.id])
  useEffect(() => { loadList() }, [loadList])
  const calculation = useMemo(() => {
    if (!draft) return { value: null, error: "" }
    try { return { value: calculateDraft(draft), error: "" } } catch (error) { return { value: null, error: problemText(error) } }
  }, [draft])
  const replacementItems = (draft?.items || []).flatMap((item) => item.source.kind === "study" && item.location.trim().toLowerCase() === importLocation.trim().toLowerCase()
    ? [{ id: item.id, studyId: item.source.snapshot.studyId, findingId: item.source.snapshot.finding.id }] : [])

  function change(next: Draft) {
    if (!accessible()) { setProblem("The selected owner or job is no longer current. Reopen the workspace."); return }
    draftRef.current = next
    setDraft(next); setProblem(""); setNotice("")
  }
  function changeItem(id: string, update: (item: DraftItem) => DraftItem) {
    if (!draft) return
    try { change({ ...draft, items: draft.items.map((item) => item.id === id ? update(item) : item) }) } catch (error) { setProblem(problemText(error)) }
  }
  const observeStudy = useCallback((study: Study) => {
    if (!accessible() || study.ownerId !== ownerId) return
    setDraft((current) => {
      if (!current) return current
      let changed = false
      const items = current.items.map((item) => {
        if (item.source.kind !== "study" || item.source.snapshot.studyId !== study.id) return item
        const freshness = checkStudyFreshness(item.source.snapshot, study)
        if (freshness === item.source.freshness) return item
        changed = true
        return updateDraftItem(item, { source: { ...item.source, freshness } })
      })
      if (!changed) return current
      const next = { ...current, items }; draftRef.current = next; return next
    })
  }, [accessible, ownerId])
  const selectStudy = useCallback((study: Study, findingId: string, decisionIds: string[]) => {
    if (!accessible()) return
    const current = draftRef.current
    if (!current) { setProblem("Create or reopen an internal draft first."); return }
    try {
      const next = importStudySelection(current, snapshotStudySelection(study, findingId, decisionIds), importLocation.trim())
      draftRef.current = next; setDraft(next); setProblem(""); setNotice("Finding added as unresolved. Confirm its scope and quantity, then approve costs separately.")
    } catch (error) { setProblem(problemText(error)) }
  }, [accessible, importLocation])
  const replaceStudy = useCallback((study: Study, findingId: string, decisionIds: string[], itemId: string) => {
    if (!accessible() || busy) return
    const current = draftRef.current
    if (!current || current.ownerId !== ownerId || current.job.id !== job.id || study.ownerId !== ownerId) { setProblem("Reopen the current owner and job draft before replacing evidence."); return }
    try {
      const matches = current.items.filter((item) => item.source.kind === "study" && item.source.snapshot.studyId === study.id && item.source.snapshot.finding.id === findingId && item.location.trim().toLowerCase() === importLocation.trim().toLowerCase())
      if (matches.length !== 1 || matches[0].id !== itemId) throw new Error("Choose the exact existing item's location before replacing its evidence.")
      const next = replaceStudySelection(current, itemId, snapshotStudySelection(study, findingId, decisionIds))
      draftRef.current = next; setDraft(next); setProblem(""); setNotice("Retained evidence replaced on the working item. Resolve its scope and confirm quantity, then approve direct costs separately. Saved revisions are unchanged.")
    } catch (error) { setProblem(problemText(error)) }
  }, [accessible, busy, importLocation, job.id, ownerId])
  async function refreshSources() {
    const captured = draftRef.current
    if (!captured || !accessible()) return
    setBusy(true); setProblem("")
    const ids = [...new Set(captured.items.flatMap((item) => item.source.kind === "study" ? [item.source.snapshot.studyId] : []))]
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const response = await fetcher(`/api/plan-studies/${encodeURIComponent(id)}`)
        const body = await response.json()
        return { id, study: response.ok && body?.study?.id === id && body.study.ownerId === ownerId ? body.study as Study : null }
      } catch { return { id, study: null } }
    }))
    if (!accessible()) return
    const current = draftRef.current
    if (current && current.id === captured.id) {
      const items = current.items.map((item) => {
        if (item.source.kind !== "study") return item
        const source = item.source
        const observed = results.find((result) => result.id === source.snapshot.studyId)
        if (!observed) return item
        return updateDraftItem(item, { source: { ...source, freshness: checkStudyFreshness(source.snapshot, observed.study) } })
      })
      change({ ...current, items })
      setNotice("Linked sources checked. Unavailable or changed evidence remains visible and unpriced.")
    }
    setBusy(false)
  }
  async function saveRevision() {
    const captured = draftRef.current
    if (!captured || !accessible()) return
    setBusy(true); setProblem(""); setNotice("")
    try {
      const result = await store.save(captured)
      if (!accessible()) return
      if (!result.ok) { setProblem(result.error); return }
      setRecorded(result.revision); setSelectedRevision(result.revision.id); loadList()
      const current = draftRef.current
      if (current?.id === captured.id) {
        const unchanged = current === captured
        const next = { ...current, basedOnRevisionId: result.revision.id }
        draftRef.current = next; setDraft(next)
        setSaved(unchanged ? { id: result.revision.id, fingerprint: JSON.stringify(next) } : null)
        if (!unchanged) setNotice("A revision was saved; newer working changes are still unsaved.")
      }
    } catch (error) { if (accessible()) setProblem(problemText(error)) }
    finally { if (accessible()) setBusy(false) }
  }

  return <>
    <div style={{ ...grid, marginTop: 12 }}>
      <button type="button" style={button} disabled={busy} onClick={() => {
        if (!accessible()) return
        try {
          const next = createDraft(ownerId, { id: job.id, name: job.jobName, clientName: job.clientName, address: job.jobAddress }, { ...defaults })
          change(next); setRecorded(null); setSaved(null); setSelectedRevision("")
        } catch (error) { setProblem(problemText(error)) }
      }}>New internal draft</button>
      <label>Saved browser revision<select aria-label="Saved browser revision" style={input} value={selectedRevision} disabled={busy} onChange={(event) => {
        const revision = revisions.find((item) => item.id === event.target.value)
        if (!revision || !accessible()) return
        change(workingCopy(revision)); setRecorded(revision); setSaved(null); setSelectedRevision(revision.id)
      }}><option value="">Choose a saved revision</option>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.draft.title} · {new Date(revision.savedAt).toLocaleString()} · {revision.id}</option>)}</select></label>
      <button type="button" style={button} disabled={busy} onClick={loadList}>Refresh browser revisions</button>
    </div>
    {problem && <p role="alert">{problem} The working copy has not been marked saved.</p>}
    {notice && <p role="status">{notice}</p>}
    {draft && <div data-draft-id={draft.id} style={box}>
      <h4 style={{ marginTop: 0 }}>Internal draft for {draft.job.name}</h4>
      <p role="status">{saved?.fingerprint === JSON.stringify(draft) ? `Saved in this browser · revision ${saved.id}` : "Unsaved working copy"}. No customer PDF, sharing or invoice is available for these drafts.</p>
      <label>Draft title<input aria-label="Draft title" value={draft.title} style={input} disabled={busy} onChange={(event) => change({ ...draft, title: event.target.value })} /></label>
      <div style={{ ...grid, marginTop: 10 }}>
        <label>Location for added scope<input aria-label="Location for added scope" value={importLocation} style={input} disabled={busy} onChange={(event) => setImportLocation(event.target.value)} placeholder="Room, area or work location" /></label>
        <button type="button" style={button} disabled={busy} onClick={() => change({ ...draft, items: [...draft.items, createContractorItem({ location: importLocation.trim() })] })}>Add contractor-written scope</button>
      </div>
      <p>Use the Plan Study below to add specific findings and individually selected saved answers. Different locations remain separate work; repeated additions at the same location are rejected. To update retained evidence, enter the existing item&apos;s location and use its explicit replacement action below.</p>
      {draft.items.length === 0 && <p>No items yet. Add written scope or choose an established Study finding below.</p>}
      {draft.items.map((item, index) => <DraftItemEditor key={item.id} item={item} index={index} line={calculation.value?.items.find((line) => line.itemId === item.id)} disabled={busy} onPatch={(patch) => changeItem(item.id, (current) => updateDraftItem(current, patch))} onQuantity={() => changeItem(item.id, (current) => confirmQuantity(current, ownerId))} onCosts={() => changeItem(item.id, (current) => approveCosts(current, ownerId))} />)}
      <fieldset disabled={busy} style={box}><legend>Commercial settings for this revision</legend>
        <p>These are a snapshot of your defaults. Later Rate Card changes do not reprice a saved draft. Markup and pre-tax margin are different.</p>
        <div style={grid}>
          <label>Markup %<input aria-label="Draft markup percent" type="number" min={0} max={500} step="any" value={Number.isFinite(draft.commercial.markupPct) ? draft.commercial.markupPct : ""} style={input} onChange={(event) => change({ ...draft, commercial: { ...draft.commercial, markupPct: event.target.value === "" ? NaN : Number(event.target.value) } })} /></label>
          <label>Target pre-tax margin %<input aria-label="Draft target margin percent" type="number" value={marginTarget} style={input} onChange={(event) => setMarginTarget(event.target.value)} /></label>
          <button type="button" style={button} onClick={() => {
            const c = calculation.value
            if (!c || !marginTarget.trim()) return
            const markup = calculateProfitTargetMarkup({ labor: c.labor, materials: c.materials, subs: c.other, markup: draft.commercial.markupPct }, Number(marginTarget))
            if (markup === null) { setProblem("A supported priced cost and margin target are required."); return }
            change({ ...draft, commercial: { ...draft.commercial, markupPct: markup } })
          }}>Apply draft margin target</button>
          <label><input aria-label="Draft tax enabled" type="checkbox" checked={draft.commercial.taxEnabled} onChange={(event) => change({ ...draft, commercial: { ...draft.commercial, taxEnabled: event.target.checked } })} /> Tax enabled</label>
          <label>Tax %<input aria-label="Draft tax percent" type="number" min={0} max={25} step="any" value={Number.isFinite(draft.commercial.taxRate) ? draft.commercial.taxRate : ""} style={input} onChange={(event) => change({ ...draft, commercial: { ...draft.commercial, taxRate: event.target.value === "" ? NaN : Number(event.target.value) } })} /></label>
          <label><input aria-label="Draft deposit enabled" type="checkbox" checked={draft.commercial.depositEnabled} onChange={(event) => change({ ...draft, commercial: { ...draft.commercial, depositEnabled: event.target.checked } })} /> Deposit enabled</label>
          <label>Deposit type<select aria-label="Draft deposit type" value={draft.commercial.depositType} style={input} onChange={(event) => change({ ...draft, commercial: { ...draft.commercial, depositType: event.target.value as "percent" | "fixed" } })}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></label>
          <label>Deposit value<input aria-label="Draft deposit value" type="number" min={0} step="any" value={Number.isFinite(draft.commercial.depositValue) ? draft.commercial.depositValue : ""} style={input} onChange={(event) => change({ ...draft, commercial: { ...draft.commercial, depositValue: event.target.value === "" ? NaN : Number(event.target.value) } })} /></label>
        </div>
      </fieldset>
      {calculation.error && <p role="alert">{calculation.error}</p>}
      {calculation.value && <section aria-label="Draft pricing review" style={box}>
        <h4>{calculation.value.unresolvedCount ? "Partial priced amount — unresolved work remains" : calculation.value.pricedCount ? "Priced included scope — internal review only" : "No priced included scope yet"}</h4>
        <p>{calculation.value.pricedCount} priced items · {calculation.value.unresolvedCount} unpriced/unresolved · {calculation.value.excludedCount} exclusions. Exclusions and unknown amounts are not priced zero-cost work.</p>
        <dl style={grid}>{[["Labor direct cost", calculation.value.labor], ["Materials direct cost", calculation.value.materials], ["Other direct cost", calculation.value.other], ["Direct cost subtotal", calculation.value.directCost], ["Markup amount", calculation.value.markupAmount], ["Pre-tax subtotal", calculation.value.subtotal], ["Tax", calculation.value.taxAmount], ["Whole-dollar rounding adjustment", calculation.value.roundingAdjustment], ["Priced total", calculation.value.total], ["Deposit collection (included in total)", calculation.value.depositDue], ["Remaining balance", calculation.value.remaining]].map(([label, amount]) => <div key={String(label)}><dt>{label}</dt><dd style={{ marginLeft: 0, fontWeight: 700 }}>{dollars(Number(amount))}</dd></div>)}</dl>
        <p>Pre-tax margin: {calculation.value.marginPct}%. Item components round to cents; commercial total rounds to whole dollars. Deposit is a collection against the total, not added revenue.</p>
      </section>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="button" style={button} disabled={busy} onClick={() => { void refreshSources() }}>Check linked source freshness</button>
        <button type="button" style={button} disabled={busy || !calculation.value} onClick={() => { void saveRevision() }}>{busy ? "Checking or saving…" : "Save new browser revision"}</button>
      </div>
      {recorded && <details style={{ marginTop: 12 }}><summary>Recorded saved revision — {recorded.id}</summary><p>Saved {new Date(recorded.savedAt).toLocaleString()}. Recorded priced total: {dollars(recorded.calculation.total)}{recorded.calculation.partial ? " (partial)" : ""}. These historical calculations remain unchanged; the working copy separately checks source freshness.</p><p>Predecessor revision: {recorded.parentRevisionId || "None"}.</p></details>}
    </div>}
    <PlanStudySection fetcher={fetcher} ownerKey={`${ownerKey}:${job.id}`} draftSelection={{ ownerId, enabled: Boolean(draft) && !busy && accessible(), onSelect: selectStudy, replacementItems, onReplace: replaceStudy, onStudyObserved: observeStudy }} />
  </>
}

function DraftItemEditor({ item, index, line, disabled, onPatch, onQuantity, onCosts }: { item: DraftItem; index: number; line?: DraftItemCalculation; disabled: boolean; onPatch: (patch: Partial<DraftItem>) => void; onQuantity: () => void; onCosts: () => void }) {
  return <fieldset disabled={disabled} data-draft-item={item.id} style={box}>
    <legend>Item {index + 1} · {item.source.kind === "study" ? "Plan Study-linked scope" : item.source.origin === "approved_assumption" ? "Contractor-supplied assumption" : "Contractor-written scope"}</legend>
    <div style={grid}>
      <label>Trade<input aria-label={`Item ${index + 1} trade`} value={item.trade} style={input} onChange={(event) => onPatch({ trade: event.target.value })} /></label>
      <label>Work location<input aria-label={`Item ${index + 1} location`} value={item.location} style={input} onChange={(event) => onPatch({ location: event.target.value })} /></label>
      <label>Scope status<select aria-label={`Item ${index + 1} status`} value={item.disposition} style={input} onChange={(event) => onPatch({ disposition: event.target.value as DraftItem["disposition"] })}><option value="unresolved">Unresolved</option><option value="included">Included — contractor choice</option><option value="excluded">Excluded</option></select></label>
    </div>
    <label>Work description<textarea aria-label={`Item ${index + 1} description`} rows={3} value={item.description} style={input} onChange={(event) => onPatch({ description: event.target.value })} /></label>
    <label>Contractor scope decision / assumption<textarea aria-label={`Item ${index + 1} scope decision`} rows={2} value={item.scopeDecision} style={input} onChange={(event) => onPatch({ scopeDecision: event.target.value })} /></label>
    {item.source.kind === "contractor" ? <div style={grid}>
      <label>Contractor input type<select aria-label={`Item ${index + 1} input type`} value={item.source.origin} style={input} onChange={(event) => onPatch({ source: { kind: "contractor", origin: event.target.value as "written_scope" | "approved_assumption", note: item.source.kind === "contractor" ? item.source.note : "" } })}><option value="written_scope">Written scope</option><option value="approved_assumption">Contractor assumption</option></select></label>
      <label>Contractor source note<input aria-label={`Item ${index + 1} source note`} value={item.source.note} style={input} onChange={(event) => onPatch({ source: { ...item.source as Extract<DraftItem["source"], { kind: "contractor" }>, note: event.target.value } })} /></label>
    </div> : <details><summary>Retained Study evidence · {item.source.freshness}</summary>
      <p>{item.source.snapshot.studyTitle} · source revision {item.source.snapshot.sourceRevision} · {item.source.snapshot.classification} record. Recorded classification: {item.source.snapshot.finding.kind}.</p>
      <p>{item.source.snapshot.finding.title}: {item.source.snapshot.finding.detail}</p>
      {item.source.snapshot.finding.citations.map((citation, i) => <p key={i} style={{ overflowWrap: "anywhere" }}>Document {citation.documentVersionId} · page {citation.pageId} · hash {citation.sourceSha256}{citation.anchor.kind === "text" ? ` · “${citation.anchor.quote}”` : " · retained image-region citation"}</p>)}
      {item.source.snapshot.decisions.length ? <ul>{item.source.snapshot.decisions.map((decision) => <li key={decision.id}>Selected answer {decision.id}: {decision.answer}</li>)}</ul> : <p>No saved Study answer was selected. Answers never approve quantities or costs.</p>}
      <ul>{[...item.source.snapshot.synthesisLimitations, ...item.source.snapshot.finding.limitations, ...item.source.snapshot.documents.flatMap((document) => document.pages.flatMap((page) => page.issue ? [page.issue] : []))].map((limit, i) => <li key={i}>{limit}</li>)}</ul>
    </details>}
    {item.source.kind === "study" && <p role="status">Source freshness: {item.source.freshness}. Historical evidence remains retained; only established current evidence can support new pricing.</p>}
    <div style={grid}>
      <label>Quantity<input aria-label={`Item ${index + 1} quantity`} type="number" min={0} step="any" value={item.quantity ?? ""} style={input} onChange={(event) => onPatch({ quantity: numberOrUnknown(event.target.value) })} /></label>
      <label>Work unit<select aria-label={`Item ${index + 1} unit`} value={item.unit} style={input} onChange={(event) => { const unit = event.target.value as DraftUnit; onPatch(unit === "lump_sum" ? { unit, quantity: 1, costs: { ...item.costs, unit } } : { unit }) }}>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
      <label>Measurement basis<input aria-label={`Item ${index + 1} measurement basis`} value={item.measurementBasis} style={input} placeholder="Measured, approved assumption, or explicit lump sum" onChange={(event) => onPatch({ measurementBasis: event.target.value })} /></label>
    </div>
    <button type="button" style={button} onClick={onQuantity}>Confirm this scope and quantity</button><p>{item.quantityConfirmation ? "Quantity confirmation recorded for these exact inputs." : "Quantity is not confirmed."}</p>
    <p>Direct costs per work unit. Leave unknown amounts blank; enter 0 only for an intentional zero. No production rate or conversion is inferred.</p>
    <div style={grid}>
      <label>Cost rate unit<select aria-label={`Item ${index + 1} cost unit`} value={item.costs.unit} style={input} onChange={(event) => onPatch({ costs: { ...item.costs, unit: event.target.value as DraftItem["costs"]["unit"] } })}>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}<option value="hour">Hourly — unsupported conversion</option></select></label>
      {(["labor", "materials", "other"] as const).map((field) => <label key={field}>{field} cost per unit<input aria-label={`Item ${index + 1} ${field} unit cost`} type="number" min={0} step="any" value={item.costs[field] ?? ""} style={input} onChange={(event) => onPatch({ costs: { ...item.costs, [field]: numberOrUnknown(event.target.value) } })} /></label>)}
      <label>Approved-cost source<input aria-label={`Item ${index + 1} cost source`} value={item.costs.source} style={input} placeholder="Company cost sheet/version or explicit contractor entry" onChange={(event) => onPatch({ costs: { ...item.costs, source: event.target.value } })} /></label>
    </div>
    <button type="button" style={button} onClick={onCosts}>Approve these direct costs</button><p>{item.costApproval ? "Cost approval recorded separately for these exact inputs." : "Direct costs are not approved."}</p>
    <p style={{ fontWeight: 700 }}>Pricing: {line?.status === "priced" ? dollars(line.directCost!) : line?.status === "excluded" ? "Excluded — no charge included" : "Unpriced"}</p>
    {Boolean(line?.reasons.length) && <ul>{line!.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
  </fieldset>
}
