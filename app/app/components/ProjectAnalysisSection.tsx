"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ProjectInventory } from "../../lib/project-library/types"
import type { AnalysisRequest, AnalysisSourceRef, ProjectAnalysisRecord } from "../../lib/project-analysis/types"
import { createProjectAnalysisClient } from "../../lib/project-analysis/client"

type Props = {
  ownerId: string; projectId: string; inventory: ProjectInventory | null; selectedFileIds: string[]
  fetcher: typeof fetch; isCurrent: () => boolean; disabled?: boolean
  onRecords: (records: ProjectAnalysisRecord[]) => void
  onCompleted: (records: ProjectAnalysisRecord[]) => void
}
type Choice = { fileId: string; pageNumber: number }
const box = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, marginTop: 12 } as const
const button = { minHeight: 42, padding: "8px 12px", border: "1px solid #94a3b8", borderRadius: 7, background: "white", cursor: "pointer" } as const
const errorText = (error: unknown) => error instanceof Error ? error.message : "Project review could not be completed. Earlier results remain retained."
const sourceKey = (source: AnalysisSourceRef) => `${source.fileId}:${source.sourceVersion}:${source.sourceSha256}:${source.pageNumber}`
const sourceRef = ({ fileId, sourceVersion, sourceSha256, pageNumber }: AnalysisSourceRef): AnalysisSourceRef => ({ fileId, sourceVersion, sourceSha256, pageNumber })
const isCurrentRecord = (record: ProjectAnalysisRecord, inventory: ProjectInventory | null) => Boolean(inventory && record.ownerId === inventory.ownerId && record.projectId === inventory.projectId && record.sourceVersions.every(source => inventory.files.some(file => file.id === source.fileId && file.active && file.sourceVersion === source.sourceVersion && file.sha256 === source.sourceSha256 && file.status === "uploaded")))

/** Review stays inside the selected project's existing bid workflow. No call runs on mount. */
export default function ProjectAnalysisSection(props: Props) {
  const latest = useRef(props), mounted = useRef(true)
  useLayoutEffect(() => { latest.current = props }, [props])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = useCallback(() => mounted.current && latest.current.isCurrent() && latest.current.ownerId === props.ownerId && latest.current.projectId === props.projectId, [props.ownerId, props.projectId])
  const client = useMemo(() => createProjectAnalysisClient(props.fetcher, props.projectId, current), [props.fetcher, props.projectId, current])
  const [records, setRecords] = useState<ProjectAnalysisRecord[]>([])
  const [selected, setSelected] = useState<string[]>([]), selectedRef = useRef<string[]>([])
  const [targets, setTargets] = useState<Choice[]>([]), [context, setContext] = useState<Choice[]>([])
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(""), [notice, setNotice] = useState("")
  const files = props.inventory?.files.filter(file => file.active && file.status === "uploaded") ?? []
  const available = files.filter(file => file.mimeType === "application/pdf" || file.mimeType.startsWith("text/") || file.mimeType.startsWith("image/"))
  const selectedFiles = available.filter(file => props.selectedFileIds.includes(file.id))
  const knownPages = selectedFiles.flatMap(file => Array.from({ length: file.pageCount ?? 0 }, (_, i) => ({ fileId: file.id, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, pageNumber: i + 1 })))
  const currentResults = records.filter(record => record.status === "complete" && record.result && isCurrentRecord(record, props.inventory))
  const reviewed = new Set(currentResults.filter(record => record.result?.reviewStatus === "reviewed").flatMap(record => record.sourceVersions.filter(source => source.role === "target").map(sourceKey)))
  const limited = new Set(currentResults.filter(record => record.result?.reviewStatus === "limited").flatMap(record => record.sourceVersions.filter(source => source.role === "target").map(sourceKey)))
  const nextPages = knownPages.filter(source => !reviewed.has(sourceKey(source)) && !limited.has(sourceKey(source)))
  const refresh = useCallback(async () => {
    try {
      const result = await client.list()
      if (result.analyses.some(record => record.ownerId !== props.ownerId || record.projectId !== props.projectId)) throw new Error("The review history did not match the current owner and project.")
      if (current()) setRecords(result.analyses)
    }
    catch (error) { if (current()) setProblem(errorText(error)) }
  }, [client, current, props.ownerId, props.projectId])
  useEffect(() => { void refresh() }, [refresh])
  function selectRecords(ids: string[], collection = records) {
    selectedRef.current = ids; setSelected(ids)
    latest.current.onRecords(collection.filter(record => ids.includes(record.id) && record.status === "complete" && record.result && isCurrentRecord(record, latest.current.inventory)))
  }
  function ref(choice: Choice): AnalysisSourceRef {
    const file = files.find(item => item.id === choice.fileId)
    if (!file || !Number.isInteger(choice.pageNumber) || choice.pageNumber < 1 || choice.pageNumber > (file.pageCount ?? 0)) throw new Error("Choose a prepared, current file and a valid physical page. Refresh the library after replacing a source.")
    return { fileId: file.id, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, pageNumber: choice.pageNumber }
  }
  async function run(request?: AnalysisRequest) {
    if (!current() || busy || props.disabled) return
    setBusy(true); setProblem(""); setNotice("")
    try {
      const targetRefs = request?.targets ?? targets.map(ref)
      const targetKeys = new Set(targetRefs.map(sourceKey))
      const body = request ?? { targets: targetRefs, context: context.map(ref).filter(source => !targetKeys.has(sourceKey(source))) }
      const response = await client.run(body)
      if (!current()) return
      const record = response.analysis
      if (record.ownerId !== props.ownerId || record.projectId !== props.projectId) throw new Error("The review response did not match the current owner and project.")
      const collection = [record, ...records.filter(previous => previous.id !== record.id)]
      setRecords(collection)
      if (record.status === "complete" && record.result && isCurrentRecord(record, latest.current.inventory)) {
        const ids = [...new Set([...selectedRef.current, record.id])]
        selectRecords(ids, collection)
        const usable = collection.filter(item => ids.includes(item.id) && item.status === "complete" && item.result && isCurrentRecord(item, latest.current.inventory))
        latest.current.onCompleted(usable)
        setNotice("Review recorded. Supported inputs can fill the existing estimate; quantities and costs still need your separate approval. Limited or unanswered work stays a decision.")
      } else setNotice(record.status === "unknown" ? "The provider outcome is unknown. Its reservation stays held; do not retry blindly. Reconciliation is required." : record.status === "running" ? "This exact review is already running. Refresh its recorded status; another click does not start a duplicate." : "This review failed. Earlier results remain retained. Check its issue before choosing the one bounded retry.")
    } catch (error) { if (current()) setProblem(errorText(error)) }
    finally { if (current()) setBusy(false) }
  }
  function choices(value: Choice[], update: (value: Choice[]) => void, role: "target" | "context", maximum: number) {
    return <fieldset disabled={busy || props.disabled} style={box}><legend>{role === "target" ? "Pages or photos to review" : "Related plans, specifications, notes and addenda"}</legend>
      {value.map((choice, index) => <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <label>Source<select aria-label={`AI ${role} source ${index + 1}`} style={{ maxWidth: "100%", padding: 7 }} value={choice.fileId} onChange={event => update(value.map((entry, i) => i === index ? { fileId: event.target.value, pageNumber: 1 } : entry))}><option value="">Choose retained source</option>{available.map(file => <option key={file.id} value={file.id}>{file.relativePath} · v{file.sourceVersion} · {file.preparation}</option>)}</select></label>
        <label>Physical page<input aria-label={`AI ${role} page ${index + 1}`} type="number" min={1} max={files.find(file => file.id === choice.fileId)?.pageCount ?? 1} style={{ width: 85, padding: 7 }} value={choice.pageNumber} onChange={event => update(value.map((entry, i) => i === index ? { ...entry, pageNumber: Number(event.target.value) } : entry))} /></label>
        <button type="button" style={button} onClick={() => update(value.filter((_, i) => i !== index))}>Remove {role} {index + 1}</button>
      </div>)}
      <button type="button" style={button} disabled={value.length >= maximum} onClick={() => update([...value, { fileId: "", pageNumber: 1 }])}>Add {role === "target" ? "review source" : "context source"}</button>
      <p>{role === "target" ? "Up to four physical pages or photos per click. A photo is one source, not a measured room." : "Up to eight related pages. Context helps connect requirements; supplying context is not independent review of those pages."}</p>
    </fieldset>
  }
  if (!props.isCurrent()) return null
  return <section aria-label="AI package review" style={box} data-project-analysis>
    <h4>Read project sources with AI</h4>
    <p>Connect the selected work to plans, specifications, schedules, notes, addenda and visible site conditions. AI proposes evidence-backed inputs; the existing calculator and your approved rates set the draft price.</p>
    <p>{knownPages.filter(source => reviewed.has(sourceKey(source))).length} selected pages/photos have a recorded review; {knownPages.filter(source => limited.has(sourceKey(source))).length} have limited results; {nextPages.length} known selected pages/photos remain without a completed result. {selectedFiles.filter(file => file.pageCount === null).length} selected sources still have unknown page coverage. Context-only pages and processing copies are not counted as reviewed.</p>
    <button type="button" style={button} disabled={busy || props.disabled || !nextPages.length} onClick={() => setTargets(nextPages.slice(0, 4).map(source => ({ fileId: source.fileId, pageNumber: source.pageNumber })))}>Choose next pending batch</button>
    <details open={!records.length}><summary>Review selection and related context</summary>{choices(targets, setTargets, "target", 4)}{choices(context, setContext, "context", 8)}</details>
    <button type="button" style={button} disabled={busy || props.disabled || !targets.length} onClick={() => { void run() }}>{busy ? "Reading this bounded batch…" : "Read selected sources"}</button>{" "}
    <button type="button" style={button} disabled={busy || props.disabled} onClick={() => { void refresh() }}>Refresh recorded reviews</button>
    <p>Uses the configured provider only after a durable allowance reservation. Closed or missing allowances stop new analysis. No allowance is granted by uploading files or opening this screen.</p>
    {problem && <p role="alert">{problem}</p>}{notice && <p role="status">{notice}</p>}
    <details open={records.length > 0}><summary>Recorded analysis, decisions and evidence · {records.length}</summary>
      {records.map(record => <section key={record.id} style={box} data-analysis-record={record.id}><h5>Review {record.id} · {record.status}{record.result ? ` / ${record.result.reviewStatus}` : ""}</h5>
        <p>{record.modelLabel} · attempt {record.attemptNumber}. {isCurrentRecord(record, props.inventory) ? "Current source versions." : "Historical or unavailable source versions; cannot fill a current bid."}</p>
        {record.errorCode && <p role="status">{record.errorCode}</p>}
        {record.status === "complete" && record.result && <>
          <label><input aria-label={`Use AI review ${record.id}`} type="checkbox" checked={selected.includes(record.id)} disabled={busy || props.disabled || !isCurrentRecord(record, props.inventory) && !selected.includes(record.id)} onChange={event => selectRecords(event.target.checked ? [...selectedRef.current, record.id] : selectedRef.current.filter(id => id !== record.id))} /> Use this recorded review to propose bid inputs. This does not approve quantities or costs.</label>
          <p>{record.result.takeoffInputs.length} proposed work records · {record.result.findings.filter(finding => ["question", "conflict", "assumption", "boundary"].includes(finding.kind)).length} questions, conflicts or scope decisions. Package completion is not established.</p>
          <ul>{record.result.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>
          {record.result.findings.map(finding => <details key={finding.id}><summary>{finding.kind}: {finding.title}</summary><p>{finding.detail}</p><ul>{finding.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul><p>Finding {finding.id}; related records: {finding.relatedFindingIds.join(", ") || "none recorded"}.</p>{finding.citationIds.map(id => {
            const citation = record.result!.citations.find(item => item.id === id), source = citation && record.sourceVersions.find(item => item.fileId === citation.fileId && item.pageNumber === citation.pageNumber)
            return citation ? <p key={id}>{source?.relativePath ?? citation.fileId} · v{citation.sourceVersion} · page {citation.pageNumber}: {citation.anchor.kind === "text" ? citation.anchor.quote : `Visible image region (${citation.anchor.bounds.x}, ${citation.anchor.bounds.y}, ${citation.anchor.bounds.width}, ${citation.anchor.bounds.height})${citation.anchor.visibleText ? ` · model transcription: ${citation.anchor.visibleText}` : ""}`}</p> : null
          })}</details>)}
        </>}
        <details><summary>Exact sources and coverage</summary>{record.sourceVersions.map(source => <div key={sourceKey(source)}><p>{source.relativePath} · v{source.sourceVersion} · page {source.pageNumber} · {source.role === "context" ? "context supplied, not independently reviewed" : "review target"} · {source.textCharacters} text characters · {source.imageSha256 ? "image supplied" : "no image supplied"}</p><ul>{source.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>)}</details>
        {record.status === "failed" && record.attemptNumber < 2 && <button type="button" style={button} disabled={busy || props.disabled || !isCurrentRecord(record, props.inventory)} onClick={() => { void run({ targets: record.sourceVersions.filter(source => source.role === "target").map(sourceRef), context: record.sourceVersions.filter(source => source.role === "context").map(sourceRef), retryFailed: true }) }}>Retry this failed review once</button>}
        {record.status === "unknown" && <p role="status">Outcome unknown: reservation retained. Reconciliation is required before another provider attempt.</p>}
      </section>)}
    </details>
  </section>
}
