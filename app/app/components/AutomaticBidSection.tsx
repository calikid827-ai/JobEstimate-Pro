"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ProjectInventory } from "../../lib/project-library/types"
import type { Job } from "../lib/types"
import type { createOwnerLocalPersistence } from "../lib/local-persistence"
import type { Draft, DraftCommercial, DraftRevision } from "../lib/source-linked-draft-types"
import type { ApprovedPricingProfile, AutomaticBidPreparation, PricingRule } from "../lib/automatic-bid-types"
import type { ProposalProfile } from "../lib/customer-proposal-types"
import { approvePricingProfile, approveAutomaticCosts, automaticReviewFingerprint, checkProjectFreshness, confirmAutomaticQuantities, createAutomaticDraft, discoverAutomaticLocations, fetchCurrentProjectInventory, prepareAutomaticBid, refreshAutomaticDraftSources } from "../lib/automatic-bid"
import { createAutomaticBidStore } from "../lib/automatic-bid-store"
import { createSourceLinkedDraftStore } from "../lib/source-linked-draft-store"
import { approveCosts, calculateDraft, confirmQuantity, updateDraftItem, workingCopy } from "../lib/source-linked-draft"
import { DraftItemEditor } from "./SourceLinkedDraftSection"
import CustomerProposalSection from "./CustomerProposalSection"

type Props = {
  ownerId: string; ownerKey: string; job: Job; inventory: ProjectInventory | null
  storage: ReturnType<typeof createOwnerLocalPersistence>; isCurrent: () => boolean; fetcher: typeof fetch
  defaults: DraftCommercial; companyProfile: ProposalProfile
  onProfile?: (profile: ApprovedPricingProfile) => void; onSavedRevision?: (revision: DraftRevision) => void
  onInventory?: (inventory: ProjectInventory) => void
}
type EditableRule = { id: string; surface: PricingRule["surface"]; substrate: string; condition: string; coats: string; labor: string; materials: string; other: string }
const blankRule = (): EditableRule => ({ id: crypto.randomUUID(), surface: "walls", substrate: "", condition: "", coats: "", labor: "", materials: "", other: "" })
const box = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 14, marginTop: 12 } as const
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 } as const
const input = { width: "100%", padding: 8, boxSizing: "border-box" } as const
const button = { minHeight: 44, padding: "9px 12px", border: "1px solid #94a3b8", borderRadius: 7, background: "white", cursor: "pointer" } as const
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
const message = (error: unknown) => error instanceof Error ? error.message : "The prepared estimate could not be completed."

export default function AutomaticBidSection(props: Props) {
  const latest = useRef(props), mounted = useRef(true)
  useLayoutEffect(() => { latest.current = props }, [props])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const accessible = useCallback(() => mounted.current && latest.current.isCurrent() && latest.current.ownerId === props.ownerId && latest.current.job.id === props.job.id, [props.ownerId, props.job.id])
  const profileStore = useMemo(() => createAutomaticBidStore(props.ownerId, props.storage, accessible), [props.ownerId, props.storage, accessible])
  const revisionStore = useMemo(() => createSourceLinkedDraftStore(props.ownerId, props.storage, (id) => id === props.job.id && accessible()), [props.ownerId, props.storage, props.job.id, accessible])
  const [profile, setProfile] = useState<ApprovedPricingProfile | null>(null)
  const [profileName, setProfileName] = useState("")
  const [rules, setRules] = useState<EditableRule[]>(() => [blankRule()])
  const [profileReviewed, setProfileReviewed] = useState(false)
  const [locations, setLocations] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [preparation, setPreparation] = useState<AutomaticBidPreparation | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const [recorded, setRecorded] = useState<DraftRevision | null>(null)
  const [revisions, setRevisions] = useState<DraftRevision[]>([])
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [quantityReview, setQuantityReview] = useState("")
  const [costReview, setCostReview] = useState("")
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(""), [notice, setNotice] = useState("")
  const [observedInventory, setObservedInventory] = useState<ProjectInventory | null | undefined>(undefined)
  const inventory = observedInventory === undefined ? props.inventory : observedInventory
  const currentDraft = draft ? refreshAutomaticDraftSources(draft, inventory) : null
  const calculation = useMemo(() => { try { return currentDraft ? calculateDraft(currentDraft) : null } catch { return null } }, [currentDraft])
  const activeFiles = inventory?.files.filter((file) => file.active) ?? []
  const profileInputsMatch = Boolean(profile && profileName.trim() === profile.name && rules.length === profile.rules.length && rules.every((rule, index) => {
    const saved = profile.rules[index]
    return rule.id === saved.id && rule.surface === saved.surface && rule.substrate.trim() === saved.substrate && rule.condition.trim() === saved.condition && ["coats", "labor", "materials", "other"].every((field) => rule[field as "coats" | "labor" | "materials" | "other"].trim() !== "" && Number(rule[field as "coats" | "labor" | "materials" | "other"]) === saved[field as "coats" | "labor" | "materials" | "other"])
  }))
  const job = useMemo(() => ({ id: props.job.id, name: props.job.jobName, clientName: props.job.clientName, address: props.job.jobAddress }), [props.job.id, props.job.jobName, props.job.clientName, props.job.jobAddress])
  function change(next: Draft) { draftRef.current = next; setDraft(next); setQuantityReview(""); setCostReview(""); setNotice("") }
  const loadRevisions = useCallback(() => { const result = revisionStore.list(props.job.id); if (result.ok) setRevisions(result.revisions); else setProblem(result.error) }, [revisionStore, props.job.id])
  const loadCurrentInventory = useCallback(async () => {
    try {
      const current = await fetchCurrentProjectInventory(latest.current.fetcher, props.ownerId, props.job.id, accessible)
      if (!accessible()) throw new Error("The current project changed.")
      setObservedInventory(current); latest.current.onInventory?.(current)
      return current
    } catch (error) { if (accessible()) setObservedInventory(null); throw error }
  }, [props.ownerId, props.job.id, accessible])
  const verifySources = useCallback(async () => {
    const current = await loadCurrentInventory()
    const working = draftRef.current
    if (!working || !accessible()) throw new Error("Reopen the current estimate before verifying its project sources.")
    const checked = refreshAutomaticDraftSources(working, current)
    if (JSON.stringify(checked) !== JSON.stringify(working)) { draftRef.current = checked; setDraft(checked); setQuantityReview(""); setCostReview("") }
    if (working.items.some((item) => item.disposition !== "excluded" && item.source.kind === "project" && checkProjectFreshness(item.source.snapshot, current) !== "current")) throw new Error("Project files changed or are unavailable. Refresh the affected evidence, reconfirm quantities and costs, and save a new estimate revision before creating or exporting the proposal.")
  }, [loadCurrentInventory, accessible])
  useEffect(() => {
    const saved = profileStore.listProfiles()
    if (!saved.ok) { setProblem(saved.error); return }
    if (saved.profiles[0]) { const selected = saved.profiles[0]; setProfile(selected); setProfileName(selected.name); setRules(selected.rules.map((rule) => ({ ...rule, coats: String(rule.coats), labor: String(rule.labor), materials: String(rule.materials), other: String(rule.other) }))); latest.current.onProfile?.(selected) }
  }, [profileStore])
  useEffect(loadRevisions, [loadRevisions])
  useEffect(() => { setObservedInventory(undefined) }, [props.inventory])
  useEffect(() => {
    if (!inventory) return
    setLocations((value) => value || discoverAutomaticLocations(inventory).join("\n"))
    const active = new Set(inventory.files.filter((file) => file.active).map((file) => file.id))
    setSelectedFiles((value) => { const retained = value.filter((id) => active.has(id)); return retained.length ? retained : inventory.files.filter((file) => file.active && file.mimeType === "application/pdf" && file.status === "uploaded").map((file) => file.id) })
  }, [inventory])
  useEffect(() => {
    const current = draftRef.current
    if (!current) return
    const checked = refreshAutomaticDraftSources(current, inventory)
    if (JSON.stringify(checked) !== JSON.stringify(current)) { draftRef.current = checked; setDraft(checked); setQuantityReview(""); setCostReview("") }
  }, [inventory])
  async function saveProfile() {
    if (!accessible() || !profileReviewed || busy) return
    setBusy(true); setProblem("")
    try {
      const nextRules = rules.map((rule) => {
        if ([rule.coats, rule.labor, rule.materials, rule.other].some((value) => !value.trim())) throw new Error("Enter all rate components; use 0 only for an intentional zero.")
        return { ...rule, unit: rule.surface === "doors" ? "doors" as const : "sqft" as const, coats: Number(rule.coats), labor: Number(rule.labor), materials: Number(rule.materials), other: Number(rule.other) }
      })
      const next = approvePricingProfile({ id: profile?.id || crypto.randomUUID(), ownerId: props.ownerId, name: profileName, version: (profile?.version ?? 0) + 1, rules: nextRules }, props.ownerId)
      const saved = await profileStore.saveProfile(next)
      if (!accessible()) return
      if (!saved.ok) throw new Error(saved.error)
      setProfile(saved.profile); props.onProfile?.(saved.profile); setProfileReviewed(false); setNotice(`Pricing profile version ${saved.profile.version} saved and read back. Existing estimates keep their recorded rates.`)
    } catch (error) { if (accessible()) setProblem(message(error)) }
    finally { if (accessible()) setBusy(false) }
  }
  async function prepare() {
    if (!accessible() || busy || !profile || !profileInputsMatch || !inventory) return
    setBusy(true); setProblem(""); setNotice("")
    try {
      const capturedInventory = await loadCurrentInventory()
      if (!accessible()) return
      const result = await prepareAutomaticBid({ ownerId: props.ownerId, job, inventory: capturedInventory, selectedFileIds: selectedFiles, locations: locations.split(/\n|,/), profile })
      if (!accessible()) return
      const existing = revisionStore.list(job.id)
      if (!existing.ok) throw new Error(existing.error)
      const prior = existing.revisions.find((revision) => revision.draftId === `automatic-${result.id}`)
      const next = prior ? refreshAutomaticDraftSources(workingCopy(prior), capturedInventory) : createAutomaticDraft(result, job, props.defaults)
      setPreparation(result); setRecorded(prior ?? null); change(next); setSelectedItems(result.candidates.map((candidate) => candidate.id)); setNotice(prior ? "This exact preparation already has a saved revision. Reopened it instead of adding duplicate work." : `${result.candidates.length} supported takeoff items prepared; ${result.exceptions.length} decisions remain. Review before confirming quantities and costs.`)
    } catch (error) { if (accessible()) setProblem(message(error)) }
    finally { if (accessible()) setBusy(false) }
  }
  async function saveRevision() {
    const captured = draftRef.current
    if (!captured || !accessible() || busy) return
    setBusy(true); setProblem(""); setNotice("")
    try {
      const currentInventory = await loadCurrentInventory()
      if (!accessible()) return
      const checked = refreshAutomaticDraftSources(captured, currentInventory)
      if (JSON.stringify(checked) !== JSON.stringify(captured)) { change(checked); throw new Error("Source versions changed. Review affected quantities and costs before saving.") }
      const result = await revisionStore.save(checked)
      if (!accessible()) return
      if (!result.ok) throw new Error(result.error)
      const current = draftRef.current
      if (current !== captured) { setNotice("The captured revision was saved; newer working edits remain unsaved."); loadRevisions(); return }
      const next = { ...current, basedOnRevisionId: result.revision.id }
      draftRef.current = next; setDraft(next); setRecorded(result.revision); loadRevisions(); props.onSavedRevision?.(result.revision); setNotice("Prepared estimate revision saved and read back. Review the customer proposal below.")
    } catch (error) { if (accessible()) setProblem(message(error)) }
    finally { if (accessible()) setBusy(false) }
  }
  function patchRule(index: number, patch: Partial<EditableRule>) { setRules((current) => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule)); setProfileReviewed(false) }
  if (!props.isCurrent()) return null
  return <section data-automatic-bid aria-label="Prepare a Bid" style={box}>
    <h3>Prepare a Bid</h3><p>Use retained project documents to prepare supported painting scope. Review the remaining decisions, then save an estimate and open its customer proposal.</p>
    {problem && <p role="alert">{problem}</p>}{notice && <p role="status">{notice}</p>}
    <details open={!profile}><summary>Approved painting pricing profile{profile ? ` · ${profile.name} v${profile.version}` : " · required"}</summary>
      <p>Enter your company costs for the exact surface, substrate, work condition and coat count. No substitute rate or production assumption is supplied. Each approval creates a new browser-local version.</p>
      <label>Profile name<input aria-label="Pricing profile name" style={input} value={profileName} disabled={busy} onChange={(event) => { setProfileName(event.target.value); setProfileReviewed(false) }} /></label>
      {rules.map((rule, index) => <fieldset key={rule.id} disabled={busy} style={box}><legend>Rate {index + 1}</legend><div style={grid}>
        <label>Surface<select aria-label={`Rate ${index + 1} surface`} style={input} value={rule.surface} onChange={(event) => patchRule(index, { surface: event.target.value as PricingRule["surface"] })}><option value="walls">Walls · sq ft</option><option value="ceilings">Ceilings · sq ft</option><option value="doors">Doors · count</option></select></label>
        {(["substrate", "condition", "coats", "labor", "materials", "other"] as const).map((field) => <label key={field}>{field}<input aria-label={`Rate ${index + 1} ${field}`} style={input} value={rule[field]} type={["coats", "labor", "materials", "other"].includes(field) ? "number" : "text"} min={0} step="any" onChange={(event) => patchRule(index, { [field]: event.target.value })} /></label>)}
      </div><button type="button" style={button} disabled={rules.length === 1} onClick={() => { setRules((current) => current.filter((_, i) => i !== index)); setProfileReviewed(false) }}>Remove rate {index + 1}</button></fieldset>)}
      <button type="button" style={button} disabled={busy || rules.length >= 100} onClick={() => { setRules((current) => [...current, blankRule()]); setProfileReviewed(false) }}>Add pricing rule</button>
      <label style={{ display: "block", marginTop: 10 }}><input aria-label="Pricing profile costs approved" type="checkbox" checked={profileReviewed} disabled={busy} onChange={(event) => setProfileReviewed(event.target.checked)} /> I approve these exact company unit costs and work conditions.</label>
      <button type="button" style={button} disabled={!profileReviewed || busy} onClick={() => { void saveProfile() }}>Save approved pricing profile</button>
    </details>
    {profile && !profileInputsMatch && <p role="status">Pricing profile edits are not saved or approved. Save a new approved version before preparing with those rates. Earlier estimates keep their recorded profile.</p>}
    <section aria-label="Bid source selection" style={box}><h4>Project Files → Prepared Estimate</h4>
      {!inventory ? <p>Load or refresh the project library first. Originals must be retained on the server before preparation. A failed source check blocks saving and export.</p> : <>
        <p>{activeFiles.length} active project files. Select relevant documents for this bounded bid; unselected files and all unreviewed photos remain visible in coverage.</p>
        <details><summary>Relevant project documents · {selectedFiles.length} selected</summary>{activeFiles.map((file) => <label key={file.id} style={{ display: "block" }}><input type="checkbox" aria-label={`Bid source ${file.relativePath}`} disabled={busy} checked={selectedFiles.includes(file.id)} onChange={(event) => setSelectedFiles((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} /> {file.relativePath} · v{file.sourceVersion} · {file.status} / {file.preparation}</label>)}</details>
        <label>Locations to quote · one per line<textarea aria-label="Bid locations" style={input} rows={4} value={locations} disabled={busy} onChange={(event) => setLocations(event.target.value)} /></label>
        <p>Locations found in explicit room schedules are suggested automatically. Check the selected locations. Supported takeoff uses stated feet/square feet and paint conditions; arbitrary drawing measurement, OCR and photo interpretation are not implemented.</p>
      </>}
      <button type="button" style={button} disabled={busy || !profile || !profileInputsMatch || !inventory} onClick={() => { void prepare() }}>{busy ? "Preparing or saving…" : "Prepare painting bid"}</button>
    </section>
    <label style={{ display: "block", marginTop: 12 }}>Saved prepared estimate revision<select aria-label="Saved prepared estimate revision" style={input} disabled={busy} value={recorded?.id ?? ""} onChange={(event) => {
      const selected = revisions.find((revision) => revision.id === event.target.value)
      if (!selected || !accessible()) return
      setRecorded(selected); setPreparation(null); change(refreshAutomaticDraftSources(workingCopy(selected), inventory)); setSelectedItems(selected.draft.items.filter((item) => item.source.kind === "project").map((item) => item.id))
    }}><option value="">Choose a saved revision</option>{revisions.filter((revision) => revision.draftId.startsWith("automatic-")).map((revision) => <option key={revision.id} value={revision.id}>{revision.draft.title} · {revision.id}</option>)}</select></label>
    {preparation && <section data-bid-preparation={preparation.id} style={box}><h4>{preparation.candidates.length} supported takeoff items · {preparation.exceptions.length} decisions</h4><p>Prepared locations: {preparation.locations.join(", ")} · {preparation.profile.name} v{preparation.profile.version}. Prepare again to apply a different selection.</p>
      <p>{preparation.coverage.textPagesChecked} of {preparation.coverage.pagesTotal} known PDF pages checked for schedule text. {preparation.coverage.unreviewedPhotos} photos remain unreviewed. Upload and text extraction are not full scope review.</p>
      <details open={preparation.exceptions.length > 0}><summary>Decisions and unsupported work</summary>{preparation.exceptions.length ? <ul>{preparation.exceptions.map((issue) => <li key={issue.id}>{issue.location}{issue.surface ? ` · ${issue.surface}` : ""}: {issue.message}</li>)}</ul> : <p>No extraction exception in the selected schedule records. Package coverage still remains bounded.</p>}</details>
      <details><summary>Source coverage and calculation details</summary><ul>{preparation.coverage.limitations.map((value) => <li key={value}>{value}</li>)}</ul><ul>{preparation.coverage.records.map((record, i) => <li key={i}>{activeFiles.find((file) => file.id === record.fileId)?.relativePath ?? record.fileId} · v{record.sourceVersion}{record.pageNumber ? ` · page ${record.pageNumber}` : ""} · {record.state}: {record.reason}</li>)}</ul></details>
    </section>}
    {currentDraft && <section aria-label="Prepared estimate review" style={box}><h4>Decisions → Proposal</h4>
      <p>Review supported items together. Exceptions stay unresolved until corrected or explicitly excluded in the correction editor. Unresolved work prevents a complete customer quote.</p>
      <div style={{ overflowX: "auto" }}><table><thead><tr><th>Select</th><th>Location / work</th><th>Quantity / equation</th><th>Rate source</th><th>Review</th></tr></thead><tbody>{currentDraft.items.filter((item) => item.source.kind === "project").map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`Review prepared ${item.location} ${item.id}`} checked={selectedItems.includes(item.id)} disabled={busy} onChange={(event) => { setSelectedItems((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)); setQuantityReview(""); setCostReview("") }} /></td><td>{item.location}: {item.description}</td><td>{item.quantity} {item.unit}<details><summary>Evidence and equation</summary><p>{item.measurementBasis}</p>{item.source.kind === "project" && item.source.snapshot.sources.map((source, i) => <p key={i}>{source.relativePath} · v{source.sourceVersion} · page {source.pageNumber}: {source.quote}</p>)}</details></td><td>{item.costs.source}</td><td>{item.quantityConfirmation ? "Quantity confirmed" : "Quantity pending"}; {item.costApproval ? "costs approved" : "costs pending"}</td></tr>)}</tbody></table></div>
      <label style={{ display: "block" }}><input aria-label="Reviewed takeoff sources and quantities" type="checkbox" checked={quantityReview === automaticReviewFingerprint(currentDraft)} disabled={busy} onChange={(event) => setQuantityReview(event.target.checked ? automaticReviewFingerprint(currentDraft) : "")} /> I reviewed the selected scope, source references and quantity equations.</label>
      <button type="button" style={button} disabled={busy || !quantityReview || !selectedItems.length} onClick={() => { try { change(confirmAutomaticQuantities(currentDraft, selectedItems, quantityReview, props.ownerId)) } catch (error) { setProblem(message(error)) } }}>Confirm selected takeoff</button>
      <label style={{ display: "block" }}><input aria-label="Reviewed matched pricing costs" type="checkbox" checked={costReview === automaticReviewFingerprint(currentDraft)} disabled={busy} onChange={(event) => setCostReview(event.target.checked ? automaticReviewFingerprint(currentDraft) : "")} /> I reviewed the exact matched cost rules for the selected work.</label>
      <button type="button" style={button} disabled={busy || !costReview || !selectedItems.length} onClick={() => { try { change(approveAutomaticCosts(currentDraft, selectedItems, costReview, props.ownerId)) } catch (error) { setProblem(message(error)) } }}>Approve selected costs</button>
      {calculation && <p data-bid-price-summary><strong>{calculation.partial ? "Partial priced amount — decisions remain" : "Priced selected scope"}: {dollars(calculation.total)}</strong> · {calculation.pricedCount} priced, {calculation.unresolvedCount} unresolved/unpriced, {calculation.excludedCount} explicitly excluded. Deposit {dollars(calculation.depositDue)} is included; remaining {dollars(calculation.remaining)}.</p>}
      <details><summary>Correct scope, quantities, rates or exclusions</summary>{currentDraft.items.map((item, index) => <DraftItemEditor key={item.id} item={item} index={index} line={calculation?.items.find((line) => line.itemId === item.id)} disabled={busy} onPatch={(patch) => { try { change({ ...currentDraft, items: currentDraft.items.map((entry) => entry.id === item.id ? updateDraftItem(entry, patch) : entry) }) } catch (error) { setProblem(message(error)) } }} onQuantity={() => { try { change({ ...currentDraft, items: currentDraft.items.map((entry) => entry.id === item.id ? confirmQuantity(entry, props.ownerId) : entry) }) } catch (error) { setProblem(message(error)) } }} onCosts={() => { try { change({ ...currentDraft, items: currentDraft.items.map((entry) => entry.id === item.id ? approveCosts(entry, props.ownerId) : entry) }) } catch (error) { setProblem(message(error)) } }} />)}</details>
      <button type="button" style={button} disabled={busy} onClick={() => { void verifySources().then(() => { if (accessible()) setNotice("Project source versions checked against the server inventory.") }).catch((error) => { if (accessible()) setProblem(message(error)) }) }}>Check project source versions</button>
      <button type="button" style={button} disabled={busy || !calculation} onClick={() => { void saveRevision() }}>Save prepared estimate revision</button>
    </section>}
    {recorded && currentDraft && <CustomerProposalSection key={`${props.ownerKey}:${job.id}:${recorded.id}`} ownerId={props.ownerId} jobId={job.id} revision={recorded} workingDraft={currentDraft} companyProfile={props.companyProfile} storage={props.storage} isCurrent={accessible} verifySources={verifySources} />}
  </section>
}
