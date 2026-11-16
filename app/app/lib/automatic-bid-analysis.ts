import type { AnalysisCitation, AnalysisFact, ProjectAnalysisRecord } from "../../lib/project-analysis/types"
import { parseProjectAnalysisRecord } from "../../lib/project-analysis/validation"
import type { ProjectInventory } from "../../lib/project-library/types"
import type { ProjectAnalysisBinding, ProjectSelectionSnapshot } from "./source-linked-draft-types"
import type { PricingSurface } from "./automatic-bid-types"

type Source = ProjectSelectionSnapshot["sources"][number]
export type AnalysisFields = Partial<Record<"substrate" | "condition" | "coats" | "wall" | "ceiling" | "extent" | "length" | "width" | "height" | "openings" | "wallArea" | "ceilingArea" | "doors", string | number>>
export type AnalysisWorkRecord = {
  location: string; surface: PricingSurface; text: string; source: Source; additionalSources: Source[]
  fields: AnalysisFields; bindings: ProjectAnalysisBinding[]; limitations: string[]; workIdentity: string
}
export type AnalysisDecision = {
  location: string; surface: PricingSurface | null; message: string; sourceFileIds: string[]
  sources: Source[]; bindings: ProjectAnalysisBinding[]; limitations: string[]
}
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ")
const unique = <T>(values: T[]) => [...new Set(values)]
const refKey = (value: { fileId: string; pageNumber: number }) => `${value.fileId}:${value.pageNumber}`
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function hasLiteralLocation(quote: string, value: string): boolean {
  const text = normalize(quote), location = normalize(value)
  if (!location) return false
  for (let offset = text.indexOf(location); offset >= 0; offset = text.indexOf(location, offset + 1)) {
    const before = text[offset - 1] ?? "", after = text[offset + location.length] ?? ""
    if ((!before || !/[\p{L}\p{N}_]/u.test(before)) && (!after || !/[\p{L}\p{N}_]/u.test(after))) return true
  }
  return false
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
export function analysisInterpretationFingerprint(record: ProjectAnalysisRecord, workIds: string[], findingIds: string[], citationIds: string[]): string {
  return canonical({ work: record.result!.takeoffInputs.filter(work => workIds.includes(work.id)), findings: record.result!.findings.filter(finding => findingIds.includes(finding.id)), citations: record.result!.citations.filter(citation => citationIds.includes(citation.id)) })
}

function binding(record: ProjectAnalysisRecord, workIds: string[], findingIds: string[], citationIds: string[]): ProjectAnalysisBinding {
  return {
    runId: record.id, resultIdentity: record.resultIdentity!, modelLabel: record.modelLabel,
    interpretationFingerprint: analysisInterpretationFingerprint(record, workIds, findingIds, citationIds),
    workIds: unique(workIds), findingIds: unique(findingIds), citationIds: unique(citationIds),
    sourceVersions: record.sourceVersions.map(({ fileId, sourceVersion, sourceSha256, pageNumber }) => ({ fileId, sourceVersion, sourceSha256, pageNumber })),
  }
}
function evidence(record: ProjectAnalysisRecord, citation: AnalysisCitation, inventory: ProjectInventory): Source {
  const file = inventory.files.find(value => value.id === citation.fileId)
  const source = record.sourceVersions.find(value => refKey(value) === refKey(citation))
  if (!file || !source || source.sourceSha256 !== citation.sourceSha256 || source.sourceVersion !== citation.sourceVersion) throw new Error("AI evidence does not identify the supplied source version.")
  if (file.ownerId !== record.ownerId || file.projectId !== record.projectId || !file.active || file.status !== "uploaded" || file.sourceVersion !== citation.sourceVersion || file.sha256 !== citation.sourceSha256) throw new Error("An AI source was replaced or is unavailable. Analyze the current version before preparing the bid.")
  const base = { fileId: file.id, name: file.name, relativePath: file.relativePath, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, pageNumber: citation.pageNumber, citationId: citation.id, analysisRunId: record.id }
  if (citation.anchor.kind === "text") {
    const page = file.pages.find(value => value.pageNumber === citation.pageNumber)
    if (!page || page.contentLoaded === false || page.extraction !== "complete" || !page.text.includes(citation.anchor.quote)) throw new Error("An AI quotation could not be checked against its current prepared page. Retrieve that source content before preparing the bid.")
    return { ...base, quote: citation.anchor.quote, anchor: copy(citation.anchor) }
  }
  if (!source.imageSha256 || source.imageStatus !== "provided") throw new Error("AI visual evidence has no recorded supplied-image identity.")
  return { ...base, quote: citation.anchor.visibleText ?? "", anchor: copy(citation.anchor), imageSha256: source.imageSha256 }
}

function factAllowed(fact: AnalysisFact<string | number> | null, record: ProjectAnalysisRecord, authority: "measurement" | "scope" | "condition", location = false): boolean {
  if (!fact) return false
  const citations = fact.citationIds.map(id => record.result!.citations.find(citation => citation.id === id))
  if (!citations.length || citations.some(citation => !citation)) return false
  if (location && !citations.some(citation => hasLiteralLocation(citation!.anchor.kind === "text" ? citation!.anchor.quote : citation!.anchor.visibleText ?? "", String(fact.value)))) return false
  if (authority === "condition" && fact.origin === "observation") return true
  if (fact.origin === "observation") return false
  return citations.every(citation => {
    const source = record.sourceVersions.find(value => refKey(value) === refKey(citation!))
    if (!source || source.mimeType.startsWith("image/")) return false
    if (fact.origin === "explicit_text") return citation!.anchor.kind === "text" && source.textStatus === "complete"
    return source.mimeType === "application/pdf" && source.imageStatus === "provided" && citation!.anchor.kind === "image" && Boolean(citation!.anchor.visibleText?.trim())
  })
}

/** Validated interpretation supplies proposed fields, never a second pricing engine. */
export function readAnalysisInputs(raw: ProjectAnalysisRecord[], ownerId: string, projectId: string, inventory: ProjectInventory) {
  if (raw.length > 20 || new Set(raw.map(record => record.id)).size !== raw.length) throw new Error("Select at most 20 distinct recorded analysis results for one bounded bid.")
  const analyses = raw.map(value => {
    const record = parseProjectAnalysisRecord(value)
    if (!record || record.ownerId !== ownerId || record.projectId !== projectId || record.status !== "complete" || !record.resultIdentity || !record.result) throw new Error("Only completed, validated analysis for this owner and project can supply proposed bid inputs.")
    for (const source of record.sourceVersions) {
      const file = inventory.files.find(value => value.id === source.fileId)
      if (!file || !file.active || file.ownerId !== ownerId || file.projectId !== projectId || file.status !== "uploaded" || file.sourceVersion !== source.sourceVersion || file.sha256 !== source.sourceSha256) throw new Error("An analysis target or context source changed. Analyze the current sources before preparing a new bid.")
    }
    return record
  })
  const records: AnalysisWorkRecord[] = [], decisions: AnalysisDecision[] = [], blockedScopes: Array<{ location: string; surface: PricingSurface }> = []
  for (const record of analyses) {
    const result = record.result!
    const cited = new Map(result.citations.map(citation => [citation.id, evidence(record, citation, inventory)]))
    const decision = (message: string, location: string, surface: PricingSurface | null, workIds: string[], findingIds: string[], citationIds: string[], limitations: string[] = []) => {
      const sources = unique(citationIds).map(id => cited.get(id)).filter((source): source is Source => Boolean(source))
      decisions.push({ location, surface, message, sourceFileIds: unique(sources.map(source => source.fileId)), sources, bindings: sources.length ? [binding(record, workIds, findingIds, citationIds)] : [], limitations: unique([...result.limitations, ...limitations]) })
    }
    const unresolved = new Set<string>()
    for (const finding of result.findings) {
      const linked = result.takeoffInputs.filter(work => work.findingIds.includes(finding.id) || finding.affectedWorkIds.includes(work.id))
      const blocking = ["question", "conflict", "assumption", "boundary"].includes(finding.kind)
      if (blocking) finding.affectedWorkIds.concat(linked.map(work => work.id)).forEach(id => unresolved.add(id))
      if (blocking || !linked.length) {
        const location = linked.length === 1 && linked[0].location ? linked[0].location.value : "Package decision"
        const surface = linked.length === 1 ? linked[0].surface?.value ?? null : null
        decision(`${finding.title}: ${finding.detail}`, location, surface, linked.map(work => work.id), [finding.id], finding.citationIds, finding.limitations)
      }
    }
    for (const work of result.takeoffInputs) {
      if (unresolved.has(work.id)) {
        if (work.location && work.surface) blockedScopes.push({ location: work.location.value, surface: work.surface.value })
        continue
      }
      const location = work.location?.value.trim() || "Location needs confirmation", surface = work.surface?.value ?? null
      const facts = [work.location, work.surface, ...Object.values(work.inputs)].filter((value): value is NonNullable<typeof value> => value !== null)
      const findingIds = unique([...work.findingIds, ...result.findings.filter(finding => finding.affectedWorkIds.includes(work.id)).map(finding => finding.id)])
      const citationIds = unique([...facts.flatMap(fact => fact.citationIds), ...result.findings.filter(finding => findingIds.includes(finding.id)).flatMap(finding => finding.citationIds)])
      if (!factAllowed(work.location, record, "scope", true) || !factAllowed(work.surface, record, "scope") || !surface) {
        decision("Confirm the explicit work location and surface. Photo location clues and inferred scope do not establish a measured work item.", location, surface, [work.id], findingIds, citationIds, work.limitations)
        continue
      }
      const unsupported = Object.entries(work.inputs).filter(([, fact]) => fact && typeof fact.value === "number" && !factAllowed(fact, record, "measurement")).map(([field]) => field)
      if (unsupported.length) {
        decision(`Measurements need confirmation: ${unsupported.join(", ")}. Observations and photo interpretation do not establish measured quantities.`, location, surface, [work.id], findingIds, citationIds, work.limitations)
        blockedScopes.push({ location, surface })
        continue
      }
      const fields: AnalysisFields = {}
      const put = (key: keyof AnalysisFields, fact: AnalysisFact<string | number> | null, authority: "measurement" | "scope" | "condition") => { if (factAllowed(fact, record, authority)) fields[key] = typeof fact!.value === "string" ? normalize(fact!.value) : fact!.value }
      put("substrate", work.inputs.substrate, "condition"); put("condition", work.inputs.condition, "condition"); put("coats", work.inputs.coats, "measurement")
      put("length", work.inputs.lengthFt, "measurement"); put("width", work.inputs.widthFt, "measurement"); put("height", work.inputs.wallHeightFt, "measurement"); put("openings", work.inputs.openingsSqft, "measurement")
      put(surface === "ceilings" ? "ceilingArea" : "wallArea", work.inputs.netAreaSqft, "measurement")
      if (surface === "doors") put("doors", work.inputs.count, "measurement")
      else put(surface === "walls" ? "wall" : "ceiling", work.inputs.finish, "scope")
      put("extent", work.inputs.extent, "scope")
      const sources = citationIds.map(id => cited.get(id)).filter((source): source is Source => Boolean(source))
      if (!sources.length) throw new Error("The proposed AI work has no retained source evidence.")
      const factIdentity = (fact: AnalysisFact<string | number> | null) => fact ? {
        value: typeof fact.value === "string" ? normalize(fact.value) : fact.value, origin: fact.origin,
        citations: fact.citationIds.map(id => { const citation = result.citations.find(value => value.id === id)!; return canonical({ fileId: citation.fileId, sourceVersion: citation.sourceVersion, sourceSha256: citation.sourceSha256, pageNumber: citation.pageNumber, anchor: citation.anchor }) }).sort(),
      } : null
      const workIdentity = canonical({ location: factIdentity(work.location), surface: factIdentity(work.surface), inputs: Object.fromEntries(Object.entries(work.inputs).map(([name, fact]) => [name, factIdentity(fact)])) })
      records.push({ location, surface, text: "", source: sources[0], additionalSources: sources.slice(1), fields, bindings: [binding(record, [work.id], findingIds, citationIds)], workIdentity, limitations: unique([...result.limitations, ...work.limitations, "AI interpretations are proposed inputs. The contractor must review the cited text/visual evidence and confirm quantities separately from costs."]) })
    }
    if (result.reviewStatus === "limited") decision(`AI review is limited: ${result.limitations.join(" ") || "Review the missing or unsupported source coverage before treating this selected scope as complete."}`, "Package decision", null, [], result.findings.map(finding => finding.id), result.citations.map(citation => citation.id))
  }
  return { analyses, records, decisions, blockedScopes }
}

/** Exact recorded identities and dependencies are checked again before new saves/exports. */
export async function verifyAnalysisBindings(fetcher: typeof fetch, ownerId: string, projectId: string, snapshots: ProjectSelectionSnapshot[], isCurrent: () => boolean): Promise<void> {
  if (snapshots.some(snapshot => snapshot.ownerId !== ownerId || snapshot.projectId !== projectId)) throw new Error("Recorded AI evidence belongs to another owner or project.")
  const bindings = snapshots.flatMap(snapshot => snapshot.analyses ?? [])
  const byRun = new Map<string, ProjectAnalysisBinding[]>()
  for (const bound of bindings) byRun.set(bound.runId, [...(byRun.get(bound.runId) ?? []), bound])
  for (const [id, expected] of byRun) {
    if (!isCurrent()) throw new Error("The owner or project changed before checking recorded AI evidence.")
    let response: Response, body: unknown
    try {
      response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/analysis?analysisId=${encodeURIComponent(id)}&verifyCurrent=1`, { cache: "no-store" })
      body = await response.json()
    } catch { throw new Error("Recorded AI evidence could not be verified. Reopen the current analysis before saving or exporting.") }
    const record = parseProjectAnalysisRecord(body && typeof body === "object" ? (body as Record<string, unknown>).analysis : null)
    if (!isCurrent()) throw new Error("The owner or project changed while checking recorded AI evidence.")
    if (!response.ok || !record || record.id !== id || record.ownerId !== ownerId || record.projectId !== projectId || record.status !== "complete" || !record.result || !record.resultIdentity) throw new Error("Recorded AI evidence could not be verified. Reopen the current analysis before saving or exporting.")
    for (const bound of expected) {
      const actual = record.sourceVersions.map(({ fileId, sourceVersion, sourceSha256, pageNumber }) => ({ fileId, sourceVersion, sourceSha256, pageNumber }))
      const normalizeRefs = (refs: typeof actual) => refs.map(ref => JSON.stringify(ref)).sort().join("|")
      if (bound.resultIdentity !== record.resultIdentity || bound.modelLabel !== record.modelLabel || normalizeRefs(bound.sourceVersions) !== normalizeRefs(actual) || bound.interpretationFingerprint !== analysisInterpretationFingerprint(record, bound.workIds, bound.findingIds, bound.citationIds) || bound.findingIds.some(findingId => !record.result!.findings.some(finding => finding.id === findingId)) || bound.workIds.some(workId => !record.result!.takeoffInputs.some(work => work.id === workId)) || bound.citationIds.some(citationId => !record.result!.citations.some(citation => citation.id === citationId))) throw new Error("Recorded AI inputs or findings changed. Reconfirm affected work in a new estimate revision.")
    }
    for (const source of snapshots.flatMap(snapshot => snapshot.sources).filter(source => source.analysisRunId === id)) {
      const citation = record.result.citations.find(citation => citation.id === source.citationId)
      const recordedSource = record.sourceVersions.find(value => value.fileId === source.fileId && value.pageNumber === source.pageNumber)
      if (!citation || !recordedSource || source.fileId !== citation.fileId || source.sourceVersion !== citation.sourceVersion || source.sourceSha256 !== citation.sourceSha256 || source.pageNumber !== citation.pageNumber || canonical(source.anchor) !== canonical(citation.anchor) || source.quote !== (citation.anchor.kind === "text" ? citation.anchor.quote : citation.anchor.visibleText ?? "") || citation.anchor.kind === "image" && source.imageSha256 !== recordedSource.imageSha256) throw new Error("Recorded AI citation bindings changed. Replace affected evidence and reconfirm the work.")
    }
  }
}
