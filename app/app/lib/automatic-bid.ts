import { z } from "zod"
import type { ProjectFile, ProjectInventory } from "../../lib/project-library/types"
import { approveCosts, confirmQuantity, createContractorItem, createDraft, parseDraft, updateDraftItem } from "./source-linked-draft"
import type { Draft, DraftCommercial, DraftJob, ProjectSelectionSnapshot, SourceFreshness } from "./source-linked-draft-types"
import type { ApprovedPricingProfile, AutomaticBidCandidate, AutomaticBidCoverage, AutomaticBidException, AutomaticBidPreparation, PricingRule, PricingSurface } from "./automatic-bid-types"

const short = z.string().trim().min(1).max(500)
const amount = z.number().finite().min(0).max(1_000_000)
const ruleSchema = z.object({ id: short, surface: z.enum(["walls", "ceilings", "doors"]), substrate: short, condition: short, coats: z.number().int().min(1).max(6), unit: z.enum(["sqft", "doors"]), labor: amount, materials: amount, other: amount }).strict().refine((rule) => rule.unit === (rule.surface === "doors" ? "doors" : "sqft"), "Rate unit must match the work surface")
const profileSchema = z.object({ schemaVersion: z.literal(1), id: short, ownerId: short, name: short, version: z.number().int().positive(), approvedBy: short, approvedAt: z.number().finite().positive(), rules: z.array(ruleSchema).min(1).max(100) }).strict()
const currentInventorySchema = z.object({
  schemaVersion: z.literal(1), ownerId: short, projectId: short, revision: z.number().int().min(0),
  files: z.array(z.object({
    id: short, ownerId: short, projectId: short, name: z.string().max(500), relativePath: z.string().max(2000), mimeType: short,
    size: z.number().finite().min(0), sha256: z.string().regex(/^[a-f0-9]{64}$/i), sourceVersion: z.number().int().positive(), active: z.boolean(),
    status: z.enum(["selected", "uploading", "uploaded", "failed", "unsupported"]), preparation: z.enum(["pending", "partial", "prepared", "failed", "unsupported"]),
    pageCount: z.number().int().min(0).max(1000).nullable(),
    pages: z.array(z.object({ pageNumber: z.number().int().min(1).max(1000), text: z.string().max(80000), extraction: z.enum(["complete", "empty", "failed"]), review: z.literal("pending"), issue: z.string().optional() }).strict()).max(1000),
    objectKey: z.string(), createdAt: z.string(),
  }).passthrough()).max(10000),
}).strict()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ")
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("")
}
export function parseApprovedPricingProfile(value: unknown): ApprovedPricingProfile | null {
  const result = profileSchema.safeParse(value)
  if (!result.success || result.data.approvedBy !== result.data.ownerId || new Set(result.data.rules.map((rule) => rule.id)).size !== result.data.rules.length) return null
  return clone(result.data)
}
export function approvePricingProfile(input: Omit<ApprovedPricingProfile, "schemaVersion" | "approvedBy" | "approvedAt">, ownerId: string, at = Date.now()): ApprovedPricingProfile {
  if (input.ownerId !== ownerId) throw new Error("Approve a pricing profile only in its own owner workspace.")
  const profile = parseApprovedPricingProfile({ ...input, schemaVersion: 1, approvedBy: ownerId, approvedAt: at })
  if (!profile) throw new Error("Enter a valid named profile version and explicit per-unit labor, materials and other costs for each exact condition.")
  const keys = profile.rules.map((rule) => canonical([rule.surface, normalize(rule.substrate), normalize(rule.condition), rule.coats]))
  if (new Set(keys).size !== keys.length) throw new Error("Each surface, substrate, work condition and coat count needs one unambiguous rate rule.")
  return profile
}
export function matchApprovedRate(profile: ApprovedPricingProfile, work: { surface: PricingSurface; substrate: string; condition: string; coats: number }, ownerId: string): { rule: PricingRule | null; reason: string | null } {
  const valid = parseApprovedPricingProfile(profile)
  if (!valid || valid.ownerId !== ownerId) return { rule: null, reason: "Choose a pricing profile explicitly approved by this owner." }
  const matches = valid.rules.filter((rule) => rule.surface === work.surface && normalize(rule.substrate) === normalize(work.substrate) && normalize(rule.condition) === normalize(work.condition) && rule.coats === work.coats)
  return matches.length === 1 ? { rule: clone(matches[0]), reason: null } : { rule: null, reason: matches.length ? "More than one rate matches these conditions; revise the pricing profile." : `No approved ${work.surface} rate matches ${work.substrate}, ${work.condition}, ${work.coats} coats. Add the exact rule or correct the estimate manually.` }
}

/** Rechecks exact file versions and the quoted prepared text, never title similarity. */
export function checkProjectFreshness(snapshot: ProjectSelectionSnapshot, inventory: ProjectInventory | null): SourceFreshness {
  if (!inventory) return "unavailable"
  if (inventory.ownerId !== snapshot.ownerId || inventory.projectId !== snapshot.projectId) return "changed"
  for (const source of snapshot.sources) {
    const matches = inventory.files.filter((file) => file.id === source.fileId && file.active)
    if (matches.length !== 1) return "changed"
    const file = matches[0]
    if (file.ownerId !== snapshot.ownerId || file.projectId !== snapshot.projectId || file.sourceVersion !== source.sourceVersion || file.sha256 !== source.sourceSha256) return "changed"
    if (file.status !== "uploaded" || !["prepared", "partial"].includes(file.preparation)) return "unavailable"
    const pages = file.pages.filter((page) => page.pageNumber === source.pageNumber)
    if (pages.length !== 1 || pages[0].extraction !== "complete") return "unavailable"
    if (!pages[0].text.includes(source.quote)) return "changed"
  }
  return "current"
}

/** A cached workspace inventory is not authority for another client's replacements. */
export async function fetchCurrentProjectInventory(fetcher: typeof fetch, ownerId: string, projectId: string, isCurrent: () => boolean): Promise<ProjectInventory> {
  if (!isCurrent()) throw new Error("The owner or project changed before checking source versions.")
  let response: Response
  try { response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/files`, { cache: "no-store" }) }
  catch { throw new Error("Current project sources could not be verified. Refresh Project Files before saving or exporting.") }
  if (!isCurrent()) throw new Error("The owner or project changed while checking source versions.")
  let body: unknown
  try { body = await response.json() } catch { throw new Error("Current project sources returned an unreadable response. No save or export was authorized.") }
  const parsed = currentInventorySchema.safeParse(body && typeof body === "object" ? (body as Record<string, unknown>).inventory : null)
  if (!response.ok || !parsed.success || parsed.data.ownerId !== ownerId || parsed.data.projectId !== projectId || parsed.data.files.some((file) => file.ownerId !== ownerId || file.projectId !== projectId) || new Set(parsed.data.files.map((file) => file.id)).size !== parsed.data.files.length) throw new Error("Current project ownership or source versions could not be verified. Refresh Project Files before saving or exporting.")
  if (!isCurrent()) throw new Error("The owner or project changed before source verification finished.")
  return clone(parsed.data as ProjectInventory)
}

type RecordText = { location: string; text: string; source: ProjectSelectionSnapshot["sources"][number] }
function roomRecords(file: ProjectFile): RecordText[] {
  return file.pages.filter((page) => page.extraction === "complete").flatMap((page) => {
    const matches = [...page.text.matchAll(/(?:^|[\n;|])\s*(?:Room|Location|Area)\s*:\s*([^\n;|]{1,120})/gi)]
    return matches.map((match, index) => {
      const end = index + 1 < matches.length ? matches[index + 1].index! : page.text.length
      const quote = page.text.slice(match.index!, end).trim()
      return { location: match[1].trim(), text: quote, source: { fileId: file.id, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, name: file.name, relativePath: file.relativePath, pageNumber: page.pageNumber, quote } }
    }).filter((record) => record.source.quote.length <= 40000)
  })
}
export function discoverAutomaticLocations(inventory: ProjectInventory | null): string[] {
  if (!inventory) return []
  return [...new Set(inventory.files.filter((file) => file.active && file.status === "uploaded" && ["prepared", "partial"].includes(file.preparation) && file.mimeType === "application/pdf").flatMap(roomRecords).map((record) => record.location))]
}
type Field = { value: string | number | null; conflict: boolean }
function field(records: RecordText[], label: string, valuePattern: string, numeric = false): Field {
  const values = records.flatMap((record) => [...record.text.matchAll(new RegExp(`(?:^|[\\n;|])\\s*(?:${label})\\s*:\\s*(${valuePattern})(?=\\s*(?:[\\n;|]|$))`, "gi"))].map((match) => numeric ? Number(match[1]) : normalize(match[1])))
  const distinct = [...new Set(values)]
  return { value: distinct.length === 1 ? distinct[0] : null, conflict: distinct.length > 1 }
}
const decimal = "[0-9]+(?:\\.[0-9]+)?"
const feet = `${decimal}\\s*(?:ft|feet|foot|')`
const area = `${decimal}\\s*(?:sq\\.?\\s*ft|sqft|sf|ft2|ft²)`
function numericField(records: RecordText[], label: string, suffix: string): Field {
  const found = field(records, label, suffix)
  return { value: found.value === null ? null : Number(String(found.value).match(/^[0-9]+(?:\.[0-9]+)?/)?.[0]), conflict: found.conflict }
}
function coverageFor(inventory: ProjectInventory, selected: ProjectFile[]): AutomaticBidCoverage {
  const active = inventory.files.filter((file) => file.active)
  const records: AutomaticBidCoverage["records"] = []
  for (const file of active) {
    if (!selected.some((value) => value.id === file.id)) { records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: null, state: "pending", reason: "Not selected for this bounded bid preparation; not reviewed." }); continue }
    if (file.status !== "uploaded") { records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: null, state: file.status === "failed" ? "failed" : file.status === "unsupported" ? "unsupported" : "pending", reason: file.issue || "File is not uploaded." }); continue }
    if (file.mimeType !== "application/pdf") { records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: null, state: "unsupported", reason: "Retained original is available. Automatic painting takeoff does not inspect photos or this document format." }); continue }
    if (!["prepared", "partial"].includes(file.preparation)) { records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: null, state: file.preparation === "failed" ? "failed" : file.preparation === "unsupported" ? "unsupported" : "pending", reason: file.issue || "Document preparation has not produced current usable text." }); continue }
    if (!file.pages.length && !file.pageCount) records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: null, state: "pending", reason: file.issue || "Document pages are not prepared." })
    for (const page of file.pages) records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: page.pageNumber, state: page.extraction === "complete" ? "text_checked" : page.extraction === "failed" ? "failed" : "unsupported", reason: page.extraction === "complete" ? "Checked explicit room/finish schedule text only; drawing geometry and images were not interpreted." : page.issue || "No supported extracted text on this page." })
    for (let number = 1; number <= (file.pageCount ?? 0); number++) if (!file.pages.some((page) => page.pageNumber === number)) records.push({ fileId: file.id, sourceVersion: file.sourceVersion, pageNumber: number, state: "pending", reason: "This known PDF page has not been prepared or checked." })
  }
  return { filesTotal: active.length, uploadedFiles: active.filter((file) => file.status === "uploaded").length, preparedFiles: active.filter((file) => file.preparation === "prepared").length, pagesTotal: active.filter((file) => file.mimeType === "application/pdf").reduce((sum, file) => sum + (file.pageCount ?? 0), 0), textPagesChecked: records.filter((record) => record.state === "text_checked").length, pendingFiles: active.filter((file) => file.status !== "uploaded" || file.preparation !== "prepared" || !selected.some((value) => value.id === file.id)).length, unreviewedPhotos: active.filter((file) => file.mimeType.startsWith("image/")).length, records,
    limitations: ["This preparation checks explicit printed room/finish schedules for the selected locations. It does not measure arbitrary drawings, inspect photos or establish complete project coverage.", "Photo count is not room count. Unselected, failed, unsupported and pending content remains in the project inventory."] }
}

export async function prepareAutomaticBid(input: { ownerId: string; job: DraftJob; inventory: ProjectInventory; selectedFileIds: string[]; locations: string[]; profile: ApprovedPricingProfile }, now = Date.now()): Promise<AutomaticBidPreparation> {
  const { ownerId, job, inventory } = input
  const profile = parseApprovedPricingProfile(input.profile)
  if (!profile || profile.ownerId !== ownerId || inventory.ownerId !== ownerId || inventory.projectId !== job.id) throw new Error("Choose an approved own pricing profile and the current project's file inventory.")
  if (inventory.files.some((file) => file.ownerId !== ownerId || file.projectId !== job.id)) throw new Error("The inventory contains a file from another owner or project.")
  const locations = [...new Map(input.locations.map((location): [string, string] => [normalize(location), location.trim()]).filter(([key]) => Boolean(key))).values()]
  if (!locations.length || locations.length > 200 || locations.some((location) => location.length > 120)) throw new Error("Select 1–200 explicit work locations from the project documents.")
  const ids = [...new Set(input.selectedFileIds)].sort()
  if (!ids.length || ids.length > 1000) throw new Error("Select relevant uploaded documents for this bid.")
  const files = ids.map((id) => {
    const matches = inventory.files.filter((file) => file.active && file.id === id && file.ownerId === ownerId && file.projectId === job.id)
    if (matches.length !== 1) throw new Error("A selected file is missing, replaced or belongs to another project.")
    return matches[0]
  })
  const sourceTextBytes = files.reduce((sum, file) => sum + file.pages.reduce((size, page) => size + page.text.length * 2, 0), 0)
  if (sourceTextBytes > 32 * 1024 * 1024) throw new Error("This selection exceeds the 32 MiB prepared-text batch limit. Keep all originals in Project Files and prepare smaller relevant document/location batches.")
  const id = await digest({ ownerId, projectId: job.id, locations: locations.map(normalize).sort(), files: files.map((file) => ({ id: file.id, sourceVersion: file.sourceVersion, sha256: file.sha256, status: file.status, preparation: file.preparation, pages: file.pages })), profile })
  const coverage = coverageFor(inventory, files)
  const records = files.filter((file) => file.status === "uploaded" && ["prepared", "partial"].includes(file.preparation) && file.mimeType === "application/pdf").flatMap(roomRecords)
  const candidates: AutomaticBidCandidate[] = [], exceptions: AutomaticBidException[] = []
  const exception = (location: string, surface: PricingSurface | null, message: string, sources: RecordText[], itemId?: string) => exceptions.push({ id: `${id}:exception:${exceptions.length}`, location, surface, message, sourceFileIds: [...new Set(sources.map((record) => record.source.fileId))], ...(itemId ? { itemId } : {}) })
  for (const location of locations) {
    const room = records.filter((record) => normalize(record.location) === normalize(location))
    if (!room.length) { exception(location, null, "No explicit room schedule was found for this location. Open the cited files or add contractor scope; no quantity was inferred.", []); continue }
    const substrate = field(room, "Substrate", "[^;|\\n]+"), condition = field(room, "Condition|Work condition", "[^;|\\n]+"), coats = field(room, "Coats|Paint coats", "[1-6]", true)
    const wall = field(room, "Walls?|Wall finish|Wall scope", "[^;|\\n]+"), ceiling = field(room, "Ceilings?|Ceiling finish|Ceiling scope", "[^;|\\n]+")
    const wallExtent = field(room, "Wall extent|Paint extent", "[^;|\\n]+")
    const length = numericField(room, "Length|Room length", feet), width = numericField(room, "Width|Room width", feet), height = numericField(room, "Height|Wall height", feet)
    const openings = numericField(room, "Openings area|Opening area|Deduct openings", area), wallArea = numericField(room, "Net wall area|Paintable wall area", area), ceilingArea = numericField(room, "Ceiling area|Paintable ceiling area", area), doors = field(room, "Doors to paint|Paint doors", decimal, true)
    for (const surface of ["walls", "ceilings", "doors"] as const) {
      const scope = surface === "walls" ? wall : surface === "ceilings" ? ceiling : doors
      if (scope.value === null && !scope.conflict) {
        if (surface !== "doors") exception(location, surface, `The ${surface} finish or scope is not explicit. Confirm whether it is included; no automatic quantity was added.`, room)
        continue
      }
      if (surface !== "doors" && scope.value !== "paint" && scope.value !== "painting") {
        if (scope.conflict) exception(location, surface, `Sources contain incompatible ${surface} finish requirements. Resolve the applicable requirement before pricing.`, room)
        else if (!["none", "not painted", "excluded", "by others", "no paint"].includes(String(scope.value))) exception(location, surface, `The ${surface} finish “${scope.value}” is not a supported paint instruction. Review its specification.`, room)
        continue
      }
      const dimensions = surface === "walls" ? [wallArea, length, width, height, openings] : surface === "ceilings" ? [ceilingArea, length, width] : [doors]
      if ([substrate, condition, coats, ...dimensions].some((value) => value.conflict)) { exception(location, surface, "Conflicting dimensions, quantities or work conditions require a contractor decision; values were not combined.", room); continue }
      let quantity: number | null = null, equation = ""
      if (surface === "walls") {
        const partialExtent = wallExtent.value !== null && !["full height", "full walls", "all walls"].includes(String(wallExtent.value)) || room.some((record) => /chair[ -]?rail|wainscot|upper[ -]walls?|lower[ -]walls?|partial[ -]height/i.test(record.text))
        if (wallExtent.conflict || wallArea.value === null && partialExtent) { exception(location, surface, "Wall extent is partial or unclear. Supply an explicit applicable net paintable wall area or correct the bounded wall scope; full-height painting was not assumed.", room); continue }
        const geometric = [length.value, width.value, height.value, openings.value].every((value) => typeof value === "number") ? 2 * (Number(length.value) + Number(width.value)) * Number(height.value) - Number(openings.value) : null
        if (!partialExtent && wallArea.value !== null && geometric !== null && Math.abs(Number(wallArea.value) - geometric) > .01) { exception(location, surface, "The recorded net wall area does not reconcile with the stated geometry and openings. Confirm the applicable quantity.", room); continue }
        if (typeof wallArea.value === "number") { quantity = wallArea.value; equation = `Recorded net wall area = ${quantity} sq ft` }
        else if (geometric !== null) { quantity = geometric; equation = `2 × (${length.value} + ${width.value}) × ${height.value} − ${openings.value} = ${quantity} sq ft` }
      } else if (surface === "ceilings") {
        if (typeof ceilingArea.value === "number" && typeof length.value === "number" && typeof width.value === "number" && Math.abs(ceilingArea.value - length.value * width.value) > .01) { exception(location, surface, "The stated ceiling area conflicts with length × width. Confirm which quantity applies.", room); continue }
        if (typeof ceilingArea.value === "number") { quantity = ceilingArea.value; equation = `Recorded ceiling area = ${quantity} sq ft` }
        else if (typeof length.value === "number" && typeof width.value === "number") { quantity = length.value * width.value; equation = `${length.value} × ${width.value} = ${quantity} sq ft` }
      } else if (typeof doors.value === "number" && Number.isInteger(doors.value)) { quantity = doors.value; equation = `Recorded doors to paint = ${quantity} doors` }
      if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) { exception(location, surface, surface === "walls" ? "Need explicit net wall area, or length, width, wall height and openings deduction in feet/square feet. Missing openings were not assumed zero." : `Need supported explicit ${surface} dimensions or count; no quantity was inferred.`, room); continue }
      if (substrate.value === null || condition.value === null || coats.value === null) { exception(location, surface, "Quantity support exists, but substrate, work condition or paint coat count is missing. Supply the applicable source or use the correction editor.", room); continue }
      const matched = matchApprovedRate(profile, { surface, substrate: String(substrate.value), condition: String(condition.value), coats: Number(coats.value) }, ownerId)
      const candidateId = `${id}:item:${candidates.length}`
      const rule = matched.rule
      const source: ProjectSelectionSnapshot = { ownerId, projectId: job.id, preparationId: id, sources: room.map((record) => clone(record.source)), equation, pricingProfile: { id: profile.id, version: profile.version, approvedBy: profile.approvedBy, approvedAt: profile.approvedAt, rule }, limitations: clone(coverage.limitations) }
      const item = { ...createContractorItem({ id: candidateId, trade: "painting", location, description: `Paint ${surface} — ${condition.value} ${substrate.value}, ${coats.value} coats.`, disposition: "unresolved", quantity, unit: surface === "doors" ? "doors" : "sqft", measurementBasis: equation }), source: { kind: "project" as const, snapshot: source, freshness: "current" as const }, costs: { unit: surface === "doors" ? "doors" as const : "sqft" as const, labor: rule?.labor ?? null, materials: rule?.materials ?? null, other: rule?.other ?? null, source: rule ? `Approved pricing profile ${profile.name} · ${profile.id} · version ${profile.version} · rule ${rule.id}` : "No matching approved rate" } }
      candidates.push({ id: candidateId, surface, item, equation, pricingIssue: matched.reason })
      if (matched.reason) exception(location, surface, matched.reason, room, candidateId)
    }
  }
  if (candidates.length + exceptions.length > 1000) throw new Error("This bounded bid exceeds 1,000 work decisions. Prepare a smaller set of locations.")
  return { schemaVersion: 1, id, ownerId, projectId: job.id, createdAt: now, profile: clone(profile), locations, selectedFileIds: ids, candidates, exceptions, coverage }
}

/** No quantities or costs become approved just because preparation finished. */
export function createAutomaticDraft(preparation: AutomaticBidPreparation, job: DraftJob, commercial: DraftCommercial): Draft {
  if (preparation.ownerId !== preparation.profile.ownerId || preparation.projectId !== job.id) throw new Error("The prepared bid does not belong to this owner and project.")
  const draft = createDraft(preparation.ownerId, job, commercial, `automatic-${preparation.id}`)
  draft.title = `Prepared painting bid · ${job.name}`
  draft.items = preparation.candidates.map((candidate) => clone(candidate.item))
  for (const issue of preparation.exceptions.filter((entry) => !entry.itemId)) draft.items.push(createContractorItem({ id: issue.id, trade: "painting", location: issue.location, disposition: "unresolved", description: issue.surface ? `Resolve ${issue.surface} scope: ${issue.message}` : issue.message, note: "Unresolved automatic preparation exception. Contractor correction or explicit exclusion is required." }))
  const valid = parseDraft(draft)
  if (!valid) throw new Error("The automatic draft could not be validated. It has not been saved.")
  return valid
}
export function automaticReviewFingerprint(draft: Draft): string {
  return canonical(draft.items.map((item) => ({ ...item, quantityConfirmation: null, costApproval: null, source: item.source.kind === "contractor" ? item.source : { kind: item.source.kind, snapshot: item.source.snapshot } })))
}
export function confirmAutomaticQuantities(draft: Draft, itemIds: string[], reviewedFingerprint: string, ownerId: string, at = Date.now()): Draft {
  if (ownerId !== draft.ownerId || automaticReviewFingerprint(draft) !== reviewedFingerprint || new Set(itemIds).size !== itemIds.length) throw new Error("The prepared items changed. Review the current quantities and sources again.")
  const next = { ...clone(draft), items: draft.items.map((item) => {
    if (!itemIds.includes(item.id)) return clone(item)
    if (item.source.kind !== "project") throw new Error("Batch confirmation applies only to supported project takeoff items.")
    const included = updateDraftItem(item, { disposition: "included", scopeDecision: "Contractor reviewed the selected source requirements and supported takeoff equation." })
    return confirmQuantity(included, ownerId, at)
  }) }
  if (itemIds.some((id) => !draft.items.some((item) => item.id === id))) throw new Error("A selected prepared item no longer exists.")
  return next
}
export function approveAutomaticCosts(draft: Draft, itemIds: string[], reviewedFingerprint: string, ownerId: string, at = Date.now()): Draft {
  if (ownerId !== draft.ownerId || automaticReviewFingerprint(draft) !== reviewedFingerprint || new Set(itemIds).size !== itemIds.length) throw new Error("The prepared costs changed. Review the current pricing again.")
  if (itemIds.some((id) => !draft.items.some((item) => item.id === id))) throw new Error("A selected prepared item no longer exists.")
  return { ...clone(draft), items: draft.items.map((item) => itemIds.includes(item.id) ? approveCosts(item, ownerId, at) : clone(item)) }
}
export function refreshAutomaticDraftSources(draft: Draft, inventory: ProjectInventory | null): Draft {
  return { ...clone(draft), items: draft.items.map((item) => item.source.kind === "project" ? updateDraftItem(item, { source: { ...item.source, freshness: checkProjectFreshness(item.source.snapshot, inventory) } }) : clone(item)) }
}
