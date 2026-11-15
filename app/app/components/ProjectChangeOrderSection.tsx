"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ProjectInventory } from "../../lib/project-library/types"
import type { createOwnerLocalPersistence } from "../lib/local-persistence"
import type { DraftCommercial, DraftItem, DraftJob, DraftRevision } from "../lib/source-linked-draft-types"
import type { ApprovedPricingProfile } from "../lib/automatic-bid-types"
import type { ProposalDetails, ProposalProfile } from "../lib/customer-proposal-types"
import { createSourceLinkedDraftStore } from "../lib/source-linked-draft-store"
import { createAutomaticBidStore } from "../lib/automatic-bid-store"
import { createProjectChangeOrderStore } from "../lib/project-change-order-store"
import { applyChangePricing, changeSourceProblems, createChangeOrderSnapshot, exactBaselineMatches, prepareChangeOrder, reviewChangeOrder, selectChangeFiles, summarizeChangeOrder, updateChangeRow, verifyCurrentChangeSources } from "../lib/project-change-order"
import type { BaselineRole, ChangeKind, ChangeOrderSnapshot, ProjectChangeOrder } from "../lib/project-change-order"
import { renderCustomerProposalHtml, renderCustomerProposalPdf } from "../lib/customer-proposal-render"
import { proposalDetailsProblems } from "../lib/customer-proposal"

export type ProjectChangeOrderProps = {
  ownerId: string; job: DraftJob; storage: ReturnType<typeof createOwnerLocalPersistence>; isCurrent: () => boolean;
  defaults: DraftCommercial; companyProfile: ProposalProfile; inventory: ProjectInventory | null;
  profile?: ApprovedPricingProfile | null; onOpenLegacy?: () => void; fetcher?: typeof fetch;
  onInventory?: (inventory: ProjectInventory) => void;
}
const box = { padding: 14, border: "1px solid #cbd5e1", borderRadius: 10, marginTop: 12 } as const
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 } as const
const input = { width: "100%", padding: 8, boxSizing: "border-box" } as const
const button = { minHeight: 44, padding: "9px 12px", border: "1px solid #94a3b8", borderRadius: 7, background: "white", cursor: "pointer" } as const
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
const errorText = (error: unknown) => error instanceof Error ? error.message : "The change draft could not be completed."
const numberOrNull = (value: string) => value.trim() ? Number(value) : null
function initialDetails(job: DraftJob, profile: ProposalProfile): ProposalDetails {
  const now = new Date()
  return { company: { name: profile.name, address: profile.address, phone: profile.phone, email: profile.email, license: profile.license }, customerName: job.clientName, projectName: job.name, projectAddress: job.address, date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, reference: "", clarifications: "", allowances: "", schedule: "", terms: "" }
}

/** Proposed changes remain separate from the selected agreement and legacy issuance. */
export default function ProjectChangeOrderSection(props: ProjectChangeOrderProps) {
  const { ownerId, job, storage } = props
  const latest = useRef(props)
  const mounted = useRef(true)
  const [record, setRecord] = useState<ProjectChangeOrder | null>(null)
  const [details, setDetails] = useState<ProposalDetails>(() => initialDetails(job, props.companyProfile))
  const currentState = useRef({ record, details })
  const verifiedInventoryRef = useRef<ProjectInventory | null>(null)
  useLayoutEffect(() => { latest.current = props; currentState.current = { record, details } }, [props, record, details])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const accessible = useCallback(() => mounted.current && latest.current.isCurrent() && latest.current.ownerId === ownerId && latest.current.job.id === job.id, [ownerId, job.id])
  const pending = useRef<{ id: string; fingerprint: string } | null>(null)
  const changes = useMemo(() => createProjectChangeOrderStore(ownerId, storage, id => id === job.id && accessible(), snapshot => {
    const verified = verifiedInventoryRef.current, loaded = latest.current.inventory
    const inventory = verified && (!loaded || verified.revision >= loaded.revision) ? verified : loaded
    return accessible() && pending.current?.id === snapshot.id && pending.current.fingerprint === JSON.stringify(currentState.current) && JSON.stringify(snapshot.draft) === JSON.stringify(currentState.current.record) && JSON.stringify(snapshot.details) === JSON.stringify(currentState.current.details) && !changeSourceProblems(snapshot.draft, inventory).length
  }), [ownerId, job.id, storage, accessible])
  const estimates = useMemo(() => createSourceLinkedDraftStore(ownerId, storage, id => id === job.id && accessible()), [ownerId, storage, job.id, accessible])
  const [revisions, setRevisions] = useState<DraftRevision[]>([])
  const [snapshots, setSnapshots] = useState<ChangeOrderSnapshot[]>([])
  const [saved, setSaved] = useState<ChangeOrderSnapshot | null>(null)
  const [baselineRole, setBaselineRole] = useState<BaselineRole>("none")
  const [baselineId, setBaselineId] = useState("")
  const [request, setRequest] = useState("")
  const [fileIds, setFileIds] = useState<string[]>([])
  const [storedProfiles, setStoredProfiles] = useState<ApprovedPricingProfile[]>([])
  const [profileKey, setProfileKey] = useState("")
  const [quantityReviewed, setQuantityReviewed] = useState(false)
  const [costsReviewed, setCostsReviewed] = useState(false)
  const [documentReviewed, setDocumentReviewed] = useState(false)
  const [verifiedInventory, setVerifiedInventory] = useState<ProjectInventory | null>(null)
  const [sourceCheckOk, setSourceCheckOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")
  const [notice, setNotice] = useState("")
  const activeProfile = props.profile ?? storedProfiles.find(profile => `${profile.id}:${profile.version}` === profileKey) ?? null
  const refresh = useCallback(() => {
    if (!accessible()) return
    const estimateList = estimates.list(job.id), changeList = changes.list(job.id)
    if (estimateList.ok) setRevisions(estimateList.revisions); else setProblem(estimateList.error)
    if (changeList.ok) setSnapshots(changeList.value); else setProblem(changeList.error)
    const profiles = createAutomaticBidStore(ownerId, storage, accessible).listProfiles()
    if (profiles.ok) setStoredProfiles(profiles.profiles)
  }, [accessible, estimates, changes, job.id, ownerId, storage])
  useEffect(() => { refresh() }, [refresh])
  function invalidate() { setSaved(null); setQuantityReviewed(false); setCostsReviewed(false); setDocumentReviewed(false); setSourceCheckOk(false); setNotice(""); setProblem("") }
  function changeTop(run: () => void) { if (!accessible() || busy) return; run(); setRecord(null); invalidate() }
  function changeDetails(next: ProposalDetails) { if (!accessible() || busy) return; setDetails(next); setSaved(null); setDocumentReviewed(false); setNotice("") }
  function editRow(id: string, patch: Parameters<typeof updateChangeRow>[2]) {
    if (!record || !accessible() || busy) return
    try { setRecord(updateChangeRow(record, id, patch)); invalidate() } catch (error) { setProblem(errorText(error)) }
  }
  const knownInventory = verifiedInventory && (!props.inventory || verifiedInventory.revision >= props.inventory.revision) ? verifiedInventory : props.inventory
  const summary = record ? summarizeChangeOrder(record, knownInventory) : null
  const currentSaved = Boolean(saved && record && JSON.stringify(saved.draft) === JSON.stringify(record) && JSON.stringify(saved.details) === JSON.stringify(details))
  const canExport = Boolean(currentSaved && saved?.customer && summary && !summary.partial && !summary.safeExportLimitation && documentReviewed && (!record?.sourceFiles.length || sourceCheckOk) && !busy && accessible())
  const html = useMemo(() => saved?.customer ? renderCustomerProposalHtml(saved.customer, { kind: "change_order_draft" }) : "", [saved])
  useEffect(() => { if (record && changeSourceProblems(record, knownInventory).length) setSourceCheckOk(false) }, [record, knownInventory])
  function observeFresh(inventory: ProjectInventory | null) { if (inventory) { verifiedInventoryRef.current = inventory; setVerifiedInventory(inventory); latest.current.onInventory?.(inventory) }; setSourceCheckOk(true) }
  async function checkSources() {
    if (!record || !accessible() || busy) return
    setBusy(true); setProblem(""); setSourceCheckOk(false)
    try { const fresh = await verifyCurrentChangeSources(record, latest.current.fetcher, accessible); if (accessible()) { observeFresh(fresh); setNotice("The exact linked file versions were checked against the server. Export checks them again.") } }
    catch (error) { if (accessible()) setProblem(errorText(error)) }
    finally { if (accessible()) setBusy(false) }
  }

  async function save() {
    if (!record || !accessible() || busy) return
    setBusy(true); setProblem(""); setNotice(""); setSourceCheckOk(false)
    try {
      const before = JSON.stringify({ record, details })
      const fresh = await verifyCurrentChangeSources(record, latest.current.fetcher, accessible)
      observeFresh(fresh)
      if (before !== JSON.stringify(currentState.current)) throw new Error("The change wording or project changed while checking sources. Review and save again.")
      const snapshot = createChangeOrderSnapshot(record, details, fresh ?? latest.current.inventory)
      pending.current = { id: snapshot.id, fingerprint: JSON.stringify(currentState.current) }
      const result = await changes.save(snapshot)
      if (!accessible()) return
      if (!result.ok) throw new Error(result.error)
      const afterSave = await verifyCurrentChangeSources(record, latest.current.fetcher, accessible)
      observeFresh(afterSave)
      if (before !== JSON.stringify(currentState.current)) throw new Error("The change draft changed before save confirmation. The captured browser record remains historical; review the current wording again.")
      setSaved(result.value); refresh()
      setNotice(result.value.customer ? "Change snapshot saved and read back in this browser. Review the draft before local PDF export; nothing is sent or agreed." : "Internal change draft saved and read back in this browser. Resolve the remaining decisions before customer export.")
    } catch (error) { if (accessible()) { setSourceCheckOk(false); setProblem(errorText(error)) } }
    finally { pending.current = null; if (accessible()) setBusy(false) }
  }
  async function exportPdf() {
    if (!canExport || !saved?.customer) return
    const captured = saved
    setBusy(true); setProblem(""); setNotice(""); setSourceCheckOk(false)
    try {
      const beforeRender = await verifyCurrentChangeSources(captured.draft, latest.current.fetcher, accessible)
      observeFresh(beforeRender)
      const bytes = await renderCustomerProposalPdf(captured.customer!, { kind: "change_order_draft" })
      const afterRender = await verifyCurrentChangeSources(captured.draft, latest.current.fetcher, accessible)
      observeFresh(afterRender)
      const current = currentState.current
      if (!accessible() || JSON.stringify(current.record) !== JSON.stringify(captured.draft) || JSON.stringify(current.details) !== JSON.stringify(captured.details) || changeSourceProblems(captured.draft, afterRender ?? latest.current.inventory).length) throw new Error("The project, source files or change wording changed while preparing the PDF. Review and save again.")
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }))
      try { const anchor = document.createElement("a"); anchor.href = url; anchor.download = `proposed-change-${captured.customer!.reference.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80)}.pdf`; anchor.click() } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1500) }
      setNotice("Proposed change draft PDF prepared for local download. The original agreement and contract total were not changed.")
    } catch (error) { if (accessible()) { setSourceCheckOk(false); setProblem(errorText(error)) } }
    finally { if (accessible()) setBusy(false) }
  }
  if (!props.isCurrent()) return null
  return <section aria-label="Project change order" style={box}>
    <h3 style={{ marginTop: 0 }}>Create a Change Order · {job.name}</h3>
    <p>Paste the request, reuse this project&apos;s files and review the proposed change. The original agreement stays unchanged.</p>
    <fieldset disabled={busy} style={box}><legend>Request and agreed scope</legend>
      <div style={grid}>
        <label>Scope comparison<select aria-label="Change scope comparison" style={input} value={baselineRole} onChange={event => changeTop(() => { setBaselineRole(event.target.value as BaselineRole); setBaselineId("") })}><option value="none">No agreed baseline · comparison unverified</option><option value="unaccepted_bid">Revise an unaccepted bid</option><option value="agreed_scope">I identify an agreed scope revision</option></select></label>
        {baselineRole !== "none" && <label>Exact saved estimate revision<select aria-label="Change baseline revision" style={input} value={baselineId} onChange={event => changeTop(() => setBaselineId(event.target.value))}><option value="">Choose explicitly</option>{revisions.map(revision => <option key={revision.id} value={revision.id}>{revision.draft.title} · {revision.id} · {dollars(revision.calculation.total)}{revision.calculation.partial ? " partial" : ""}</option>)}</select></label>}
      </div>
      <label style={{ display: "block", marginTop: 10 }}>Description or pasted GC request<textarea aria-label="Change request" style={input} rows={5} value={request} onChange={event => changeTop(() => setRequest(event.target.value))} placeholder={"Room 101 | Add paint walls 120 sqft; substrate: drywall; condition: repaint; coats: 2\nOne line per change. Missing quantities and costs stay as decisions."} /></label>
      <p>Only quantities stated in the request are extracted here. No drawing measurement, photo count or automatic contract comparison is inferred. An exact approved pricing-profile match can fill the costs; other work stays unpriced.</p>
      <details><summary>Use existing project files · {fileIds.length} selected</summary><p>References reuse uploaded originals and exact versions; they do not claim that every page or photo was reviewed.</p>{props.inventory?.files.filter(file => file.active).map(file => <label key={file.id} style={{ display: "block", padding: 4 }}><input type="checkbox" checked={fileIds.includes(file.id)} disabled={file.status !== "uploaded"} onChange={event => changeTop(() => setFileIds(event.target.checked ? [...fileIds, file.id] : fileIds.filter(id => id !== file.id)))} /> {file.relativePath} · v{file.sourceVersion} · {file.status} / {file.preparation}</label>) ?? <p>Refresh Project Files to select existing uploads. A description-only draft remains available.</p>}</details>
      <p>Pricing profile: {activeProfile ? `${activeProfile.name} · version ${activeProfile.version}` : "None selected; enter exact approved costs or prepare a pricing profile in Prepare a Bid."}</p>
      {!props.profile && <label>Approved profile version<select aria-label="Change pricing profile" style={input} value={profileKey} onChange={event => changeTop(() => setProfileKey(event.target.value))}><option value="">Choose explicitly or enter costs manually</option>{storedProfiles.map(profile => <option key={`${profile.id}:${profile.version}`} value={`${profile.id}:${profile.version}`}>{profile.name} · version {profile.version}</option>)}</select></label>}
      <button type="button" style={button} disabled={!request.trim() || baselineRole !== "none" && !baselineId} onClick={() => {
        try { const baseline = baselineRole === "none" ? null : revisions.find(revision => revision.id === baselineId) ?? null; setRecord(prepareChangeOrder({ ownerId, job, commercial: props.defaults, request, baselineRole, baselineRevision: baseline, sourceFiles: selectChangeFiles(props.inventory, ownerId, job.id, fileIds), pricingProfile: activeProfile })); invalidate(); setNotice("Change request prepared. Review the classifications, quantities and exact costs below.") } catch (error) { setProblem(errorText(error)) }
      }}>Prepare change draft</button>
    </fieldset>
    {record && summary && <>
      <p role="status">{summary.comparison}</p>
      <p>{summary.partial ? "Partial priced change — decisions remain" : "Reviewed proposed change"}: additions {dollars(summary.additions.total)} · deductions/credits −{dollars(summary.deductions.total)} · net {dollars(summary.delta)}.</p>
      <details><summary>Signed price calculation</summary><p>Additions and deductions/credits each use the captured commercial settings and the shared estimate calculation, including whole-dollar rounding. The displayed net is the difference between those group totals. A credit is not automatically matched to an original contract unit price.</p></details>
      {summary.proposedContractTotal !== null && <p>Proposed contract value if this change is agreed: {dollars(summary.proposedContractTotal)}. This is a comparison only; the recorded agreement is unchanged.</p>}
      {summary.blockers.length > 0 && <details open><summary>Remaining decisions · {summary.blockers.length}</summary><ul>{summary.blockers.map((message, index) => <li key={index}>{message}</li>)}</ul></details>}
      {summary.safeExportLimitation && <p role="status">{summary.safeExportLimitation}</p>}
      {record.sourceFiles.length > 0 && <p><button type="button" style={button} disabled={busy} onClick={() => { void checkSources() }}>Check current linked file versions</button>{" "}{sourceCheckOk ? "Current versions checked; export checks again." : "Current linked versions need verification before customer export."}</p>}
      <fieldset disabled={busy} style={box}><legend>Review and correct the prepared changes</legend>
        {record.rows.map((row, index) => <details key={row.item.id} open={record.rows.length <= 3} style={box}><summary>{index + 1}. {row.item.location || "Location needed"} · {row.kind.replaceAll("_", " ")} · {row.item.description}</summary>
          <div style={{ ...grid, marginTop: 10 }}>
            <label>Classification<select aria-label={`Change ${index + 1} classification`} style={input} value={row.kind} onChange={event => editRow(row.item.id, { kind: event.target.value as ChangeKind })}>{([['addition', 'Addition'], ['deduction', 'Deduction'], ['credit', 'Credit'], ['already_included', 'Already included · no new charge'], ['unclear', 'Responsibility unclear']] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Location<input aria-label={`Change ${index + 1} location`} style={input} value={row.item.location} onChange={event => editRow(row.item.id, { item: { location: event.target.value } })} /></label>
            <label>Quantity<input aria-label={`Change ${index + 1} quantity`} style={input} type="number" min="0" value={row.item.quantity ?? ""} onChange={event => editRow(row.item.id, { item: { quantity: numberOrNull(event.target.value) } })} /></label>
            <label>Unit<select aria-label={`Change ${index + 1} unit`} style={input} value={row.item.unit} onChange={event => { const unit = event.target.value as DraftItem["unit"]; editRow(row.item.id, { item: { unit, costs: { ...row.item.costs, unit } } }) }}>{([['sqft', 'Square feet'], ['linear_ft', 'Linear feet'], ['doors', 'Doors'], ['lump_sum', 'Explicit lump sum (quantity 1)']] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label>Customer work description<textarea aria-label={`Change ${index + 1} description`} style={input} rows={2} value={row.item.description} onChange={event => editRow(row.item.id, { item: { description: event.target.value } })} /></label>
          <label>Quantity basis<input aria-label={`Change ${index + 1} quantity basis`} style={input} value={row.item.measurementBasis} onChange={event => editRow(row.item.id, { item: { measurementBasis: event.target.value } })} /></label>
          {exactBaselineMatches(record, row).length > 0 && <p>Exact location/description match in the selected revision. Decide whether this work was already included; no charge is excluded automatically.</p>}
          {row.rateIssue && <p>{row.rateIssue}</p>}
          <div style={grid}>{(["labor", "materials", "other"] as const).map(component => <label key={component}>{component} direct cost per unit<input aria-label={`Change ${index + 1} ${component} cost`} style={input} type="number" min="0" value={row.item.costs[component] ?? ""} onChange={event => editRow(row.item.id, { item: { costs: { ...row.item.costs, [component]: numberOrNull(event.target.value) } } })} /></label>)}</div>
          <label>Approved-cost basis<input aria-label={`Change ${index + 1} cost basis`} style={input} value={row.item.costs.source} onChange={event => editRow(row.item.id, { item: { costs: { ...row.item.costs, source: event.target.value } } })} /></label>
        </details>)}
        <button type="button" style={{ ...button, marginTop: 10 }} disabled={!activeProfile} onClick={() => { setRecord(applyChangePricing(record, activeProfile)); invalidate() }}>Reapply exact approved profile rates</button>
        <label style={{ display: "block", marginTop: 10 }}><input aria-label="Change quantities reviewed" type="checkbox" checked={quantityReviewed} onChange={event => setQuantityReviewed(event.target.checked)} /> I reviewed the classifications, work locations and supported quantities.</label>
        <label style={{ display: "block" }}><input aria-label="Change costs reviewed" type="checkbox" checked={costsReviewed} onChange={event => setCostsReviewed(event.target.checked)} /> I approve the exact direct costs shown for the supported rows.</label>
        <button type="button" style={{ ...button, marginTop: 10 }} disabled={!quantityReviewed || !costsReviewed} onClick={() => { try { setRecord(reviewChangeOrder(record, ownerId)); setSaved(null); setDocumentReviewed(false); setNotice("Supported rows confirmed; remaining exceptions stay unpriced.") } catch (error) { setProblem(errorText(error)) } }}>Confirm supported changes as a batch</button>
      </fieldset>
      <details style={box} open><summary>Customer draft details</summary><p>These fields do not change the price. Describe only allowances already included in the estimate; revise the estimate to change scope or price. Check your wording: confidential text and contradictions are not automatically removed.</p>
        <div style={grid}>{([['customerName', 'Change customer name'], ['projectName', 'Change project name'], ['projectAddress', 'Change project address'], ['reference', 'Change reference'], ['date', 'Change date']] as const).map(([field, label]) => <label key={field}>{label}<input aria-label={label} type={field === "date" ? "date" : "text"} style={input} value={details[field]} onChange={event => changeDetails({ ...details, [field]: event.target.value })} /></label>)}</div>
        <div style={grid}>{(["name", "address", "phone", "email", "license"] as const).map(field => <label key={field}>Company {field}<input aria-label={`Change company ${field}`} style={input} value={details.company[field]} onChange={event => changeDetails({ ...details, company: { ...details.company, [field]: event.target.value } })} /></label>)}</div>
        {(["clarifications", "allowances", "schedule", "terms"] as const).map(field => <label key={field} style={{ display: "block", marginTop: 8 }}>Change {field}<textarea aria-label={`Change ${field}`} style={input} rows={2} value={details[field]} onChange={event => changeDetails({ ...details, [field]: event.target.value })} /></label>)}
        {proposalDetailsProblems(details).length > 0 && <p>Customer export also needs: {proposalDetailsProblems(details).join(" ")}</p>}
      </details>
      <button type="button" style={{ ...button, marginTop: 12 }} disabled={busy} onClick={() => { void save() }}>Save new browser change snapshot</button>
    </>}
    <div style={{ ...grid, marginTop: 12 }}><label>Saved change draft<select aria-label="Saved change draft" style={input} disabled={busy} value={saved?.id ?? ""} onChange={event => {
      if (!accessible()) return
      const chosen = snapshots.find(snapshot => snapshot.id === event.target.value)
      if (!chosen) return
      setRecord(chosen.draft); setDetails(chosen.details); setRequest(chosen.draft.request); setBaselineRole(chosen.draft.baselineRole); setBaselineId(chosen.draft.baselineRevision?.id ?? ""); setFileIds(chosen.draft.sourceFiles.map(file => file.id)); setSaved(chosen); setDocumentReviewed(false); setSourceCheckOk(false); setQuantityReviewed(false); setCostsReviewed(false); setNotice("Historical change draft opened. Its content is unchanged; review it and verify current project files before export.")
    }}><option value="">Choose a saved change draft</option>{snapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshot.details.reference || "Internal draft"} · {new Date(snapshot.createdAt).toLocaleString()} · {snapshot.id}</option>)}</select></label><button type="button" style={button} disabled={busy} onClick={refresh}>Refresh saved changes and profiles</button></div>
    <p>Change snapshots are browser-local, append-only drafts. They do not update agreed totals, issue a document or create an invoice.</p>
    {problem && <p role="alert">{problem}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Checking or preparing the change draft…</p>}
    {saved?.customer && <div style={box}><p>Recorded customer draft · {saved.id}. This is proposed work, not an agreement.</p><div aria-label="Customer change draft preview" dangerouslySetInnerHTML={{ __html: html }} /><label style={{ display: "block", marginTop: 10 }}><input aria-label="Change customer wording reviewed" type="checkbox" checked={documentReviewed} disabled={busy} onChange={event => setDocumentReviewed(event.target.checked)} /> I reviewed this saved customer wording, price and comparison limitation.</label><button type="button" style={{ ...button, marginTop: 10 }} disabled={!canExport} onClick={() => { void exportPdf() }}>Export proposed change draft PDF</button></div>}
    {props.onOpenLegacy && <details style={{ marginTop: 12 }}><summary>Existing change-order generator</summary><p>The existing generator remains available as a secondary tool. Its provider/allowance requirements and legacy document limitations still apply; this action does not run it.</p><button type="button" style={button} onClick={props.onOpenLegacy}>Open existing change-order generator</button></details>}
  </section>
}
