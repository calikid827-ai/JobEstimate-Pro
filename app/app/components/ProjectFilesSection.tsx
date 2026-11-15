"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createProjectLibraryClient, projectFileHash, runProjectQueue } from "../../lib/project-library/client"
import { expandProjectZip } from "../../lib/project-library/archive"
import { PROJECT_LIMITS, type ProjectFile, type ProjectInventory } from "../../lib/project-library/types"
import { mimeForName, safeRelativePath } from "../../lib/project-library/validation"

type Props = { ownerId: string; projectId: string; fetcher: typeof fetch; isCurrent: () => boolean; onInventory: (inventory: ProjectInventory) => void; transferFetcher?: typeof fetch }
type Selected = { id: string; file: File; path: string; record?: ProjectFile; state: "selected" | "hashing" | "uploading" | "uploaded" | "failed"; uploaded: number; issue?: string }
const button = { minHeight: 40, padding: "8px 12px", border: "1px solid #94a3b8", borderRadius: 7, background: "white", cursor: "pointer" } as const
const input = { padding: 8, maxWidth: "100%" } as const
const size = (value: number) => `${(value / 1024 ** 2).toFixed(1)} MiB`
const problem = (error: unknown) => error instanceof Error ? error.message : "The project operation failed."

/** One retained project library feeds bids and change orders; originals never enter localStorage. */
export default function ProjectFilesSection(props: Props) {
  const latest = useRef(props), mounted = useRef(true), active = useRef<AbortController | null>(null)
  latest.current = props
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort() } }, [])
  const current = useCallback(() => mounted.current && latest.current.isCurrent() && latest.current.ownerId === props.ownerId && latest.current.projectId === props.projectId, [props.ownerId, props.projectId])
  const client = useMemo(() => createProjectLibraryClient(props.fetcher, props.projectId, current, props.transferFetcher), [props.fetcher, props.projectId, props.transferFetcher, current])
  const [inventory, setInventory] = useState<ProjectInventory | null>(null), inventoryRef = useRef<ProjectInventory | null>(null)
  const [selected, setSelected] = useState<Selected[]>([]), selectedRef = useRef<Selected[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [page, setPage] = useState(0)
  const acceptInventory = useCallback((value: ProjectInventory) => {
    if (!current() || value.ownerId !== props.ownerId || value.projectId !== props.projectId) return
    if (inventoryRef.current && inventoryRef.current.revision > value.revision) return
    inventoryRef.current = value; setInventory(value); latest.current.onInventory(value)
  }, [current, props.ownerId, props.projectId])
  const refresh = useCallback(async () => { try { acceptInventory((await client.list()).inventory) } catch (cause) { if (current()) setError(problem(cause)) } }, [acceptInventory, client, current])
  useEffect(() => { void refresh() }, [refresh])
  function update(id: string, value: Partial<Selected>) {
    if (!current()) return
    selectedRef.current = selectedRef.current.map(entry => entry.id === id ? { ...entry, ...value } : entry)
    setSelected(selectedRef.current)
  }
  async function choose(files: FileList | null) {
    if (!files || !current() || busy) return
    setError(""); setNotice("")
    const additions: Selected[] = []
    for (const file of Array.from(files)) {
      try {
        const path = safeRelativePath(file.webkitRelativePath || file.name)
        if (file.size < 1 || file.size > PROJECT_LIMITS.maxFileBytes) throw new Error(`${path}: original exceeds 100 MiB or is empty.`)
        if (!mimeForName(file.name)) throw new Error(`${path}: unsupported file type; not uploaded.`)
        additions.push({ id: crypto.randomUUID(), file, path, state: "selected", uploaded: 0 })
      } catch (cause) { setError(previous => [previous, problem(cause)].filter(Boolean).join(" ")) }
    }
    selectedRef.current = [...selectedRef.current, ...additions]; setSelected(selectedRef.current)
    setNotice(`${additions.length} file${additions.length === 1 ? "" : "s"} selected, not uploaded. Choose Upload selected files to retain them in project storage.`)
  }
  async function importZip(files: FileList | null) {
    const archive = files?.[0]
    if (!archive || busy || !current()) return
    setBusy(true); setError(""); setNotice("Checking ZIP paths, entry counts and expanded sizes…")
    try {
      const originalPath = safeRelativePath(archive.name)
      const entries = expandProjectZip(new Uint8Array(await archive.arrayBuffer()))
      if (!current()) return
      const additions: Selected[] = [{ id: crypto.randomUUID(), file: archive, path: originalPath, state: "selected", uploaded: 0 }]
      const unsupported: string[] = []
      for (const entry of entries) {
        const name = entry.relativePath.split("/").pop()!
        if (!mimeForName(name) || !entry.bytes.length) { unsupported.push(entry.relativePath); continue }
        additions.push({ id: crypto.randomUUID(), file: new File([new Uint8Array(entry.bytes)], name, { type: mimeForName(name)! }), path: `${originalPath}/${entry.relativePath}`, state: "selected", uploaded: 0 })
      }
      if (unsupported.length) setError(`ZIP contains ${unsupported.length} empty/unsupported entries not selected: ${unsupported.join(", ")}. The original archive remains selected.`)
      selectedRef.current = [...selectedRef.current, ...additions]; setSelected(selectedRef.current)
      setNotice(`${additions.length} source records selected, including the original archive. Paths remain under ${originalPath}. Nothing has been uploaded or reviewed yet.`)
    } catch (cause) { if (current()) setError(problem(cause)) }
    finally { if (current()) setBusy(false) }
  }
  async function uploads(onlyId?: string) {
    if (busy || !current()) return
    setBusy(true); setError(""); setNotice(""); const controller = new AbortController(); active.current = controller
    const pending = selectedRef.current.filter(entry => (!onlyId || entry.id === onlyId) && entry.state !== "uploaded")
    const ready: Selected[] = []
    try {
      // Hash/register sequentially, avoiding N full-file hash buffers in memory.
      for (const item of pending) {
        if (!current() || controller.signal.aborted) break
        try {
          update(item.id, { state: "hashing", issue: undefined })
          const sha256 = await projectFileHash(item.file)
          const resume = inventoryRef.current?.files.find(file => file.active && file.relativePath === item.path && file.sha256 === sha256 && file.size === item.file.size && file.status !== "uploaded")
          const registered = resume ? { file: resume, inventory: inventoryRef.current! } : await client.register({ name: item.file.name, relativePath: item.path, size: item.file.size, mimeType: mimeForName(item.file.name)!, sha256, selectionId: item.record?.id || item.id })
          acceptInventory(registered.inventory)
          const queued = { ...item, record: registered.file }; ready.push(queued)
          update(item.id, { record: registered.file, state: "selected" })
        } catch (cause) { update(item.id, { state: "failed", issue: problem(cause) }) }
      }
      await runProjectQueue(ready, PROJECT_LIMITS.uploadConcurrency, async item => {
        if (!current() || controller.signal.aborted) return
        try {
          update(item.id, { state: "uploading", issue: undefined })
          const result = await client.upload(item.file, item.record!, (uploaded) => update(item.id, { uploaded }), controller.signal)
          acceptInventory(result.inventory); update(item.id, { state: "uploaded", uploaded: item.file.size })
        } catch (cause) { update(item.id, { state: "failed", issue: problem(cause) }) }
      })
      if (current()) setNotice("Transfer batch finished or paused. Uploaded files are retained; retry failed files individually. Uploading does not mean analysis is complete.")
    } finally { active.current = null; if (current()) { setBusy(false); await refresh() } }
  }
  async function prepare(fileId?: string, retryPage?: number) {
    if (busy || !current()) return
    setBusy(true); setError(""); setNotice("Preparing one file/page at a time. Originals and finished pages are retained.")
    const controller = new AbortController(); active.current = controller
    try {
      const files = (inventoryRef.current?.files || []).filter(file => file.status === "uploaded" && (fileId ? file.id === fileId : file.active && !["prepared", "unsupported", "failed"].includes(file.preparation)))
      for (const file of files) {
        let latestFile = file, requested = retryPage
        do {
          if (!current() || controller.signal.aborted) return
          const result = await client.prepare(file.id, requested); requested = undefined
          acceptInventory(result.inventory); latestFile = result.inventory.files.find(entry => entry.id === file.id)!
        } while (latestFile.preparation === "partial")
      }
      if (current()) setNotice("Preparation batch finished. Embedded text and image processing copies are available where supported; substantive scope/visual review remains separate.")
    } catch (cause) { if (current()) setError(problem(cause)) }
    finally { active.current = null; if (current()) setBusy(false) }
  }
  const files = inventory?.files || [], shown = files.slice(page * 50, page * 50 + 50)
  const uploaded = files.filter(file => file.status === "uploaded").length, prepared = files.filter(file => file.preparation === "prepared").length
  if (!props.isCurrent()) return null
  return <section aria-label="Project files" style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: 14, marginTop: 12 }}>
    <h3>Project files</h3>
    <p>Keep the job package here once, then reuse it for bids and change orders. Originals are retained in private project storage, not browser-only storage.</p>
    <p>{files.length} retained source records · {uploaded} uploaded · {prepared} prepared · {files.filter(file => file.preparation === "failed" || file.status === "failed").length} failed · {files.filter(file => file.preparation === "unsupported").length} unsupported for preparation. Prepared files and page text are not a completed scope review.</p>
    <details><summary>File limits and processing coverage</summary><p>Joint limits: 10,000 records / 25 GiB originals per project, plus 3 MiB of combined inventory and prepared text; larger or denser inventories need pagination. Originals: 100 MiB each; 3 concurrent transfers and 1 preparation operation. ZIP: 2,000 entries / 256 MiB expanded / 100× ratio, no nested expansion. PDF: 1,000 pages per file. Photos are not counted as rooms.</p></details>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <label>Bulk files<input aria-label="Project files selection" type="file" multiple disabled={busy} style={input} onChange={event => { void choose(event.target.files); event.target.value = "" }} /></label>
      <label>Folder<input aria-label="Project folder selection" type="file" multiple {...{ webkitdirectory: "" }} disabled={busy} style={input} onChange={event => { void choose(event.target.files); event.target.value = "" }} /></label>
      <label>ZIP<input aria-label="Project ZIP selection" type="file" accept=".zip,application/zip" disabled={busy} style={input} onChange={event => { void importZip(event.target.files); event.target.value = "" }} /></label>
    </div>
    <p>If folder selection is unavailable, select multiple files or import a ZIP. After a reload, reselect the same original files to resume unfinished storage transfers; earlier completed files stay retained.</p>
    <button type="button" style={button} disabled={busy || !selected.length} onClick={() => { void uploads() }}>Upload selected files</button>{" "}
    <button type="button" style={button} disabled={busy || !uploaded} onClick={() => { void prepare() }}>Prepare pending files</button>{" "}
    <button type="button" style={button} disabled={busy} onClick={() => { void refresh() }}>Refresh project files</button>{" "}
    {busy && <button type="button" style={button} onClick={() => active.current?.abort()}>Pause batch</button>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {selected.length > 0 && <details><summary>Selected transfers · {selected.length} files</summary><ul>{selected.map(item => <li key={item.id} style={{ overflowWrap: "anywhere" }}>{item.path} · {item.state} · {size(item.uploaded)} / {size(item.file.size)}{item.issue && <span role="status"> · {item.issue}</span>}{item.state === "failed" && <button type="button" style={button} disabled={busy} onClick={() => { void uploads(item.id) }}>Retry {item.file.name}</button>}</li>)}</ul></details>}
    <details style={{ marginTop: 12 }}><summary>Browse retained files, versions and page records · {files.length}</summary>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", marginTop: 14, textAlign: "left" }}><thead><tr><th>Source</th><th>Transfer / preparation</th><th>Coverage / next action</th></tr></thead><tbody>{shown.map(file => <tr key={file.id}>
      <td style={{ overflowWrap: "anywhere" }}>{file.relativePath}<br />v{file.sourceVersion} · {file.active ? "current source" : "historical source"} · {size(file.size)}{file.duplicateOfId && <p>Duplicate content of {file.duplicateOfId}; separate record retained.</p>}</td>
      <td>{file.status} / {file.preparation}{file.image && <p>{file.image.width}×{file.image.height} original; processing copy {file.image.processingWidth}×{file.image.processingHeight}</p>}{file.issue && <p role="status">{file.issue}</p>}</td>
      <td>{file.pages.length} prepared page records / {file.pageCount ?? "unknown"} total · scope review pending.
        {file.status === "uploaded" && <><button type="button" style={button} disabled={busy} onClick={() => { void client.download(file.id).then(result => { if (current()) { const link = document.createElement("a"); link.href = result.url; link.rel = "noopener noreferrer"; link.target = "_blank"; link.click() } }).catch(cause => { if (current()) setError(problem(cause)) }) }}>Open retained original</button>{" "}<button type="button" style={button} disabled={busy} onClick={() => { void prepare(file.id) }}>{file.preparation === "failed" ? "Retry preparation" : "Prepare this file"}</button></>}
        <details><summary>Page records and source identity</summary><p>File {file.id} · SHA-256 {file.sha256}</p>{file.pages.map(item => <div key={item.pageNumber}><strong>Page {item.pageNumber} · extraction {item.extraction} · review {item.review}</strong>{item.issue && <p>{item.issue}</p>}<pre style={{ whiteSpace: "pre-wrap" }}>{item.text}</pre>{item.extraction === "failed" && <button type="button" style={button} disabled={busy} onClick={() => { void prepare(file.id, item.pageNumber) }}>Retry page {item.pageNumber}</button>}</div>)}</details>
      </td></tr>)}</tbody></table></div>
    {files.length > 50 && <p><button type="button" style={button} disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous 50</button> Records {page * 50 + 1}–{Math.min(files.length, page * 50 + 50)} of {files.length} <button type="button" style={button} disabled={(page + 1) * 50 >= files.length} onClick={() => setPage(value => value + 1)}>Next 50</button></p>}
    </details>
  </section>
}
