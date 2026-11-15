"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { Job } from "../lib/types"
import type { DraftCommercial } from "../lib/source-linked-draft-types"
import type { ProposalProfile } from "../lib/customer-proposal-types"
import type { createOwnerLocalPersistence } from "../lib/local-persistence"
import type { ProjectInventory } from "../../lib/project-library/types"
import type { ApprovedPricingProfile } from "../lib/automatic-bid-types"
import { JOBS_KEY } from "../lib/constants"
import ProjectFilesSection from "./ProjectFilesSection"
import AutomaticBidSection from "./AutomaticBidSection"
import ProjectChangeOrderSection from "./ProjectChangeOrderSection"

type Props = {
  ownerId: string; ownerKey: string; jobs: Job[]; selectedProjectId: string
  onProjectChange: (id: string) => void; onProjectsChange: (jobs: Job[]) => void
  storage: ReturnType<typeof createOwnerLocalPersistence>; isCurrent: () => boolean
  fetcher: typeof fetch; defaults: DraftCommercial; companyProfile: ProposalProfile
  onOpenLegacyChangeOrder: (projectId: string) => void
}
const box = { border: "1px solid #cbd5e1", borderRadius: 12, padding: 16, marginTop: 12 } as const
const button = { minHeight: 44, padding: "10px 16px", borderRadius: 8, border: "1px solid #315a86", cursor: "pointer" } as const

/** One selected project feeds retained files, bid preparation and change drafts. */
export default function ProjectWorkflowSection(props: Props) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [client, setClient] = useState("")
  const [address, setAddress] = useState("")
  const [problem, setProblem] = useState("")
  const [busy, setBusy] = useState(false)
  const latest = useRef(props)
  useLayoutEffect(() => { latest.current = props }, [props])
  const job = props.jobs.find(item => item.id === props.selectedProjectId)
  async function createProject() {
    if (!name.trim() || !client.trim() || busy || !props.isCurrent()) return
    setBusy(true); setProblem("")
    const owner = props.ownerId
    try {
      if (!navigator.locks?.request) throw Error("Project saving needs browser storage locking. No project was saved.")
      await navigator.locks.request(`jobestimatepro_owner:${encodeURIComponent(owner)}:${JOBS_KEY}`, async () => {
        if (!latest.current.isCurrent() || latest.current.ownerId !== owner) throw Error("The owner changed. Reopen the workspace.")
        const read = props.storage.readLocalValueChecked(JOBS_KEY)
        if (!read.ok) throw Error(read.error)
        const records: unknown = read.value === null ? [] : JSON.parse(read.value)
        if (!Array.isArray(records) || records.some(value => !value || typeof value !== "object" || typeof value.id !== "string")) throw Error("Existing project records could not be read. They were preserved.")
        const created: Job = { id: crypto.randomUUID(), createdAt: Date.now(), clientName: client.trim(), jobName: name.trim(), jobAddress: address.trim() }
        const next: Job[] = [created, ...records]
        const written = props.storage.writeLocalJsonChecked(JOBS_KEY, next, { expectedRaw: read.value })
        if (!written.ok) throw Error(written.error)
        if (!latest.current.isCurrent() || latest.current.ownerId !== owner) return
        props.onProjectsChange(next); props.onProjectChange(created.id); setCreating(false); setName(""); setClient(""); setAddress("")
      })
    } catch (error) { if (latest.current.isCurrent()) setProblem(error instanceof Error ? error.message : "The project was not saved.") }
    finally { if (latest.current.isCurrent()) setBusy(false) }
  }
  if (!props.isCurrent()) return null
  return <section aria-label="Project estimating workspace" data-project-workflow style={{ ...box, borderColor: "#315a86", background: "#f8fbff" }}>
    <h2 style={{ marginTop: 0, color: "#102a48" }}>Your project</h2>
    <label>Selected project<select aria-label="Selected project" style={{ width: "100%", padding: 10, marginTop: 6 }} value={job?.id || ""} onChange={event => { if (props.isCurrent()) props.onProjectChange(event.target.value) }}><option value="">Choose a project</option>{props.jobs.map(item => <option key={item.id} value={item.id}>{item.jobName} · {item.clientName}</option>)}</select></label>
    <button type="button" style={{ ...button, marginTop: 10 }} onClick={() => setCreating(!creating)}>New project</button>
    {creating && <fieldset disabled={busy} style={box}><legend>Project details</legend><label>Project name<input aria-label="New project name" value={name} onChange={event => setName(event.target.value)} /></label><label>Customer name<input aria-label="New project customer" value={client} onChange={event => setClient(event.target.value)} /></label><label>Project address<input aria-label="New project address" value={address} onChange={event => setAddress(event.target.value)} /></label><button type="button" style={button} disabled={!name.trim() || !client.trim()} onClick={() => { void createProject() }}>Save project</button><p>Project details and estimate revisions stay in this browser. Original files use private project storage.</p></fieldset>}
    {problem && <p role="alert">{problem}</p>}
    {job ? <SelectedProject key={`${props.ownerKey}:${job.id}`} {...props} job={job} /> : <p>Choose or create a project to add its files, prepare a bid or create a change order.</p>}
  </section>
}

function SelectedProject(props: Props & { job: Job }) {
  const [action, setAction] = useState<"bid" | "change" | null>(null)
  const [inventory, setInventory] = useState<ProjectInventory | null>(null)
  const [profile, setProfile] = useState<ApprovedPricingProfile | null>(null)
  const latest = useRef(props)
  const mounted = useRef(true)
  useLayoutEffect(() => { latest.current = props }, [props])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = useCallback(() => mounted.current && latest.current.isCurrent() && latest.current.selectedProjectId === props.job.id, [props.job.id])
  const observed = useCallback((next: ProjectInventory) => { if (current() && next.ownerId === props.ownerId && next.projectId === props.job.id) setInventory(next) }, [current, props.ownerId, props.job.id])
  return <>
    <div aria-label="Project actions" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
      <button type="button" aria-pressed={action === "bid"} style={{ ...button, background: action === "bid" ? "#102a48" : "white", color: action === "bid" ? "white" : "#102a48" }} onClick={() => setAction("bid")}>Prepare a Bid</button>
      <button type="button" aria-pressed={action === "change"} style={{ ...button, background: action === "change" ? "#102a48" : "white", color: action === "change" ? "white" : "#102a48" }} onClick={() => setAction("change")}>Create a Change Order</button>
    </div>
    <p>Project Files → Prepared Estimate → Decisions → Proposal. Both actions use this same project library.</p>
    <ProjectFilesSection ownerId={props.ownerId} projectId={props.job.id} fetcher={props.fetcher} isCurrent={current} onInventory={observed} />
    <div hidden={action !== "bid"}><AutomaticBidSection ownerId={props.ownerId} ownerKey={props.ownerKey} job={props.job} inventory={inventory} storage={props.storage} isCurrent={current} fetcher={props.fetcher} defaults={props.defaults} companyProfile={props.companyProfile} onProfile={setProfile} onInventory={observed} /></div>
    <div hidden={action !== "change"}><ProjectChangeOrderSection ownerId={props.ownerId} job={{ id: props.job.id, name: props.job.jobName, clientName: props.job.clientName, address: props.job.jobAddress }} inventory={inventory} storage={props.storage} isCurrent={current} fetcher={props.fetcher} onInventory={observed} defaults={props.defaults} companyProfile={props.companyProfile} profile={profile} onOpenLegacy={() => props.onOpenLegacyChangeOrder(props.job.id)} /></div>
  </>
}
