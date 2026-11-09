"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { createOwnerLocalPersistence } from "../lib/local-persistence"
import type { Draft, DraftRevision } from "../lib/source-linked-draft-types"
import type { ProposalContext, ProposalDetails, ProposalProfile, ProposalSnapshot } from "../lib/customer-proposal-types"
import { assessProposalReadiness, createProposalSnapshot, defaultProposalDetails, proposalDetailsProblems, validateProposalSnapshotForContext } from "../lib/customer-proposal"
import { createCustomerProposalStore } from "../lib/customer-proposal-store"
import { renderCustomerProposalHtml, renderCustomerProposalPdf } from "../lib/customer-proposal-render"

type Props = {
  ownerId: string
  jobId: string
  revision: DraftRevision
  workingDraft: Draft | null
  companyProfile: ProposalProfile
  storage: ReturnType<typeof createOwnerLocalPersistence>
  isCurrent: () => boolean
}
const box = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, marginTop: 12 } as const
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 } as const
const input = { width: "100%", padding: 8, boxSizing: "border-box" } as const
const button = { minHeight: 44, padding: "9px 12px", borderRadius: 7, border: "1px solid #94a3b8", background: "white", cursor: "pointer" } as const
const errorText = (error: unknown) => error instanceof Error ? error.message : "The proposal could not be completed."
function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
function detailsFromSnapshot(snapshot: ProposalSnapshot): ProposalDetails {
  const value = snapshot.customer
  return { company: { ...value.company }, customerName: value.customer.name, projectName: value.project.name, projectAddress: value.project.address, date: value.date, reference: value.reference, clarifications: value.clarifications, allowances: value.allowances, schedule: value.schedule, terms: value.terms }
}

/** Receives a saved revision, never a legacy generated result or issued record. */
export default function CustomerProposalSection(props: Props) {
  const { ownerId, jobId, revision, storage } = props
  const latest = useRef(props)
  const mounted = useRef(true)
  useLayoutEffect(() => { latest.current = props }, [props])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const accessible = useCallback(() => mounted.current && latest.current.isCurrent(), [])
  const currentContext = useCallback((): ProposalContext => ({ ownerId, jobId, revision: latest.current.revision, workingDraft: latest.current.workingDraft }), [ownerId, jobId])
  const store = useMemo(() => createCustomerProposalStore(ownerId, storage, (id) => id === jobId && accessible(), (snapshot) => {
    if (!accessible()) return { ready: false, blockers: ["The owner or job changed. Reopen the current workspace."], limitations: [] }
    return validateProposalSnapshotForContext(snapshot, currentContext())
  }), [ownerId, storage, jobId, accessible, currentContext])
  const [details, setDetails] = useState<ProposalDetails>(() => defaultProposalDetails(revision, props.companyProfile, localDate()))
  const [reviewed, setReviewed] = useState(false)
  const [snapshots, setSnapshots] = useState<ProposalSnapshot[]>([])
  const [snapshot, setSnapshot] = useState<ProposalSnapshot | null>(null)
  const [readbackId, setReadbackId] = useState("")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")
  const [notice, setNotice] = useState("")
  const context: ProposalContext = { ownerId, jobId, revision, workingDraft: props.workingDraft }
  const readiness = assessProposalReadiness(context)
  const detailsProblems = proposalDetailsProblems(details)
  const exportReadiness = snapshot ? validateProposalSnapshotForContext(snapshot, context) : null
  const canExport = Boolean(snapshot && snapshot.id === readbackId && reviewed && exportReadiness?.ready && !busy && props.isCurrent())
  const customerHtml = useMemo(() => {
    if (!snapshot) return { html: "", error: "" }
    try { return { html: renderCustomerProposalHtml(snapshot.customer), error: "" } } catch (error) { return { html: "", error: errorText(error) } }
  }, [snapshot])
  const loadList = useCallback(() => {
    if (!accessible()) return
    const result = store.list(jobId, revision.id)
    if (result.ok) setSnapshots(result.snapshots)
    else setProblem(result.error)
  }, [accessible, store, jobId, revision.id])
  useEffect(() => { loadList() }, [loadList])

  function edit(next: ProposalDetails) {
    if (!accessible() || busy) return
    setDetails(next); setReviewed(false); setSnapshot(null); setReadbackId(""); setProblem(""); setNotice("")
  }
  async function saveSnapshot() {
    if (!accessible() || busy || !reviewed) return
    setBusy(true); setProblem(""); setNotice("")
    try {
      const created = createProposalSnapshot(currentContext(), details)
      const result = await store.save(created)
      if (!accessible()) return
      if (!result.ok) { setProblem(result.error); return }
      setSnapshot(result.snapshot); setReadbackId(result.snapshot.id); loadList()
      setNotice("Proposal snapshot saved and read back in this browser. It has not been sent, signed or issued.")
    } catch (error) { if (accessible()) setProblem(errorText(error)) }
    finally { if (accessible()) setBusy(false) }
  }
  async function exportPdf() {
    const captured = snapshot
    if (!captured || !canExport || !accessible()) return
    setBusy(true); setProblem(""); setNotice("")
    try {
      const checked = validateProposalSnapshotForContext(captured, currentContext())
      if (!checked.ready) throw new Error(checked.blockers.join(" "))
      const bytes = await renderCustomerProposalPdf(captured.customer)
      if (!accessible()) return
      const afterRender = validateProposalSnapshotForContext(captured, currentContext())
      if (!afterRender.ready) throw new Error("The estimate changed while preparing the PDF. Check and save the estimate before exporting.")
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      try {
        const link = document.createElement("a")
        const reference = captured.customer.reference.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "proposal"
        link.href = url; link.download = `proposal-${reference}.pdf`; link.click()
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1500) }
      setNotice("PDF prepared for local download from the saved proposal snapshot. No document was sent or marked issued.")
    } catch (error) { if (accessible()) setProblem(errorText(error)) }
    finally { if (accessible()) setBusy(false) }
  }

  if (!props.isCurrent()) return null
  return <section data-customer-proposal-workspace aria-label="Customer proposal workspace" style={box}>
    <h3 style={{ marginTop: 0 }}>Customer proposal preview and PDF</h3>
    <p style={{ overflowWrap: "anywhere" }}>Job: <strong>{revision.draft.job.name}</strong> · Draft: {revision.draftId} · Estimate revision: <strong>{revision.id}</strong>.</p>
    <p>This proposal uses the selected saved revision, not unsaved estimate edits or newer pricing defaults. Save a new estimate revision after changing scope or pricing. Save proposal details before choosing another estimate revision.</p>
    <section aria-label="Proposal readiness" style={box}>
      <h4 style={{ marginTop: 0 }}>{readiness.ready ? "Selected estimate scope is ready for proposal review" : "Not ready for customer use"}</h4>
      <p>Readiness covers only the selected bounded scope. It does not establish complete plan-package coverage.</p>
      {readiness.blockers.length > 0 && <ul>{readiness.blockers.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      <p>Use the estimate controls above to check linked sources, replace changed evidence and reconfirm quantities and costs. Save a new estimate revision when those inputs change.</p>
      {readiness.limitations.length > 0 && <details open><summary>Source coverage and limitations · contractor review</summary><ul>{readiness.limitations.map((message, index) => <li key={index}>{message}</li>)}</ul></details>}
    </section>
    <fieldset disabled={busy} style={box}><legend>Proposal details · review before saving</legend>
      <p>These details apply only to the proposal. They do not change the estimate price. Leave optional allowances, schedule and terms blank unless you have supplied and reviewed them.</p>
      <p>Describe allowances already included in the saved estimate. If an allowance or payment term changes the quoted scope, price or requested deposit, revise and save the estimate first. Check that your wording agrees with the recorded price summary.</p>
      <p>The app does not detect every contradiction or remove confidential wording you enter in customer-facing fields. Editing a proposal field clears its preview and review acknowledgment; save a new snapshot to export those edits.</p>
      <button type="button" style={button} onClick={() => edit({ ...details, company: { name: props.companyProfile.name, address: props.companyProfile.address, phone: props.companyProfile.phone, email: props.companyProfile.email, license: props.companyProfile.license } })}>Copy current company details</button>
      <div style={{ ...grid, marginTop: 10 }}>
        {(["name", "address", "phone", "email", "license"] as const).map((field) => <label key={field}>Company {field}<input aria-label={`Proposal company ${field}`} style={input} value={details.company[field]} onChange={(event) => edit({ ...details, company: { ...details.company, [field]: event.target.value } })} /></label>)}
        {([['customerName', 'Customer name'], ['projectName', 'Project name'], ['projectAddress', 'Project address'], ['reference', 'Proposal reference'], ['date', 'Proposal date']] as const).map(([field, label]) => <label key={field}>{label}<input aria-label={label} type={field === "date" ? "date" : "text"} style={input} value={details[field]} onChange={(event) => edit({ ...details, [field]: event.target.value })} /></label>)}
      </div>
      {([['clarifications', 'Proposal clarifications'], ['allowances', 'Proposal allowances'], ['schedule', 'Proposal schedule'], ['terms', 'Proposal terms']] as const).map(([field, label]) => <label key={field} style={{ display: "block", marginTop: 10 }}>{label}<textarea aria-label={label} style={input} rows={3} value={details[field]} onChange={(event) => edit({ ...details, [field]: event.target.value })} /></label>)}
      <h4>Scope selected from the saved estimate</h4>
      <ul>{revision.draft.items.map((item) => <li key={item.id}><strong>{item.disposition}</strong> · {item.location}: {item.description}</li>)}</ul>
      {detailsProblems.length > 0 && <ul aria-label="Proposal detail requirements">{detailsProblems.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      <label style={{ display: "flex", gap: 8, marginTop: 12 }}><input aria-label="Customer proposal details reviewed" type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I reviewed the customer details, included scope, exclusions and entered terms.</label>
      <button type="button" style={{ ...button, marginTop: 10 }} disabled={!reviewed || !readiness.ready || detailsProblems.length > 0} onClick={() => { void saveSnapshot() }}>Create and save proposal snapshot</button>
    </fieldset>
    <div style={{ ...grid, marginTop: 12 }}>
      <label>Saved browser proposal<select aria-label="Saved browser proposal" style={input} disabled={busy} value={snapshot?.id || ""} onChange={(event) => {
        if (!accessible()) return
        const chosen = snapshots.find((item) => item.id === event.target.value)
        if (!chosen) return
        setSnapshot(chosen); setReadbackId(chosen.id); setDetails(detailsFromSnapshot(chosen)); setReviewed(false); setProblem(""); setNotice("Historical snapshot opened. Review it and verify the selected estimate before exporting again. It is not marked sent, signed or issued.")
      }}><option value="">Choose a recorded proposal</option>{snapshots.map((item) => <option key={item.id} value={item.id}>{item.customer.reference} · {new Date(item.createdAt).toLocaleString()} · {item.id}</option>)}</select></label>
      <button type="button" style={button} disabled={busy} onClick={loadList}>Refresh saved proposals</button>
    </div>
    <p>Proposal snapshots are saved only in this browser for this owner and job. They are not cloud backups or signed, sent or issued records. New saves preserve earlier snapshots.</p>
    {busy && <p role="status">Checking or preparing the proposal…</p>}
    {problem && <p role="alert">{problem} A failed operation does not mark a proposal saved or exported.</p>}
    {notice && <p role="status">{notice}</p>}
    {snapshot && <>
      <p data-proposal-snapshot-id={snapshot.id} style={{ overflowWrap: "anywhere" }}>Recorded browser proposal: {snapshot.id} · estimate revision {snapshot.estimateRevisionId}.</p>
      {!reviewed && <p>Review the recorded customer content and check the review box before exporting.</p>}
      {exportReadiness && !exportReadiness.ready && <p role="status">PDF export is blocked: {exportReadiness.blockers.join(" ")}</p>}
      {customerHtml.error ? <p role="alert">{customerHtml.error}</p> : <div aria-label="Customer proposal preview" data-customer-proposal-preview style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: customerHtml.html }} />}
      <button type="button" style={{ ...button, marginTop: 12 }} disabled={!canExport || Boolean(customerHtml.error)} onClick={() => { void exportPdf() }}>{busy ? "Preparing proposal…" : "Export proposal PDF"}</button>
    </>}
  </section>
}
