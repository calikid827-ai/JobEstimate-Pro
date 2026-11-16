import { z } from "zod"
import { ANALYSIS_LIMITS, ProjectAnalysisError, type AnalysisFact, type AnalysisPacket, type AnalysisResult, type AnalysisTakeoffInput, type ProjectAnalysisRecord } from "./types"

const identity = z.string().min(1).max(500).refine(value => value.trim() === value)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const text = z.string().min(1).max(4000)
const ids = z.array(identity).max(24)
const origin = z.enum(["explicit_text", "printed_visual", "observation"])
const fact = <T extends z.ZodType>(value: T) => z.object({ value, citationIds: ids.min(1), origin }).strict()
const factText = z.string().min(1).max(500).refine(value => Boolean(value.trim()))
const number = z.number().finite().min(0).max(1_000_000)
export const sourceRefSchema = z.object({ fileId: identity, sourceVersion: z.number().int().positive(), sourceSha256: hash, pageNumber: z.number().int().min(1).max(1000) }).strict()
const bounds = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
const citation = sourceRefSchema.extend({ id: identity, anchor: z.union([
  z.object({ kind: z.literal("text"), quote: text }).strict(),
  z.object({ kind: z.literal("image"), bounds, visibleText: z.string().max(4000).nullable() }).strict(),
]) }).strict()
const takeoff = z.object({
  id: identity, findingIds: ids.min(1), location: fact(factText).nullable(),
  surface: fact(z.enum(["walls", "ceilings", "doors"])).nullable(),
  inputs: z.object({
    lengthFt: fact(number).nullable(), widthFt: fact(number).nullable(), wallHeightFt: fact(number).nullable(),
    openingsSqft: fact(number).nullable(), netAreaSqft: fact(number).nullable(), count: fact(number.int()).nullable(),
    substrate: fact(factText).nullable(), condition: fact(factText).nullable(),
    coats: fact(z.number().int().min(1).max(6)).nullable(), finish: fact(factText).nullable(), extent: fact(factText).nullable(),
  }).strict(), limitations: z.array(text).max(12),
}).strict()
export const analysisOutputSchema = z.object({
  citations: z.array(citation).max(80),
  findings: z.array(z.object({ id: identity, kind: z.enum(["requirement", "assumption", "question", "conflict", "boundary", "observation"]), title: z.string().min(1).max(240), detail: text, citationIds: ids.min(1), relatedFindingIds: ids, affectedWorkIds: ids, limitations: z.array(text).max(12) }).strict()).max(40),
  takeoffInputs: z.array(takeoff).max(40), reviewStatus: z.enum(["reviewed", "limited"]), limitations: z.array(text).max(24),
}).strict()
const sourceSchema = sourceRefSchema.extend({
  role: z.enum(["target", "context"]), name: z.string().max(500), relativePath: z.string().max(2000), mimeType: identity,
  textSha256: hash, textCharacters: z.number().int().min(0).max(80000), imageSha256: hash.nullable(),
  textStatus: z.enum(["complete", "empty", "failed", "unavailable"]), imageStatus: z.enum(["provided", "unsupported", "not_provided", "failed"]), issues: z.array(text).max(12),
}).strict()
const usage = z.object({ inputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), outputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()
const instant = z.string().refine(value => Number.isFinite(Date.parse(value)))
const recordSchema = z.object({
  id: identity, ownerId: identity, projectId: identity, fingerprint: hash, attemptNumber: z.number().int().min(1).max(ANALYSIS_LIMITS.attemptsPerFingerprint),
  sourceVersions: z.array(sourceSchema).min(1).max(ANALYSIS_LIMITS.targets + ANALYSIS_LIMITS.context),
  status: z.enum(["running", "complete", "failed", "unknown"]), createdAt: instant, leaseExpiresAt: instant, modelLabel: text,
  resultIdentity: hash.nullable(), result: analysisOutputSchema.nullable(), usage: usage.optional(), errorCode: identity.optional(),
}).strict()
export const analysisRequestSchema = z.object({ targets: z.array(sourceRefSchema).min(1).max(ANALYSIS_LIMITS.targets), context: z.array(sourceRefSchema).max(ANALYSIS_LIMITS.context), retryFailed: z.boolean().optional() }).strict()

export const sourceKey = (source: { fileId: string; pageNumber: number }) => `${source.fileId}:${source.pageNumber}`
const unique = (values: string[]) => new Set(values).size === values.length
const resultBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
function resultStructure(result: AnalysisResult) {
  if (resultBytes(result) > 96000 || !unique([...result.citations, ...result.findings, ...result.takeoffInputs].map(item => item.id))) return false
  const citations = new Set(result.citations.map(c => c.id)), findings = new Set(result.findings.map(f => f.id)), works = new Set(result.takeoffInputs.map(w => w.id))
  for (const c of result.citations) if (c.anchor.kind === "image" && (c.anchor.bounds.x + c.anchor.bounds.width > 1.000001 || c.anchor.bounds.y + c.anchor.bounds.height > 1.000001)) return false
  for (const f of result.findings) if (!unique(f.citationIds) || f.citationIds.some(id => !citations.has(id)) || f.relatedFindingIds.some(id => !findings.has(id) || id === f.id) || f.affectedWorkIds.some(id => !works.has(id)) || f.kind === "conflict" && f.citationIds.length < 2) return false
  for (const w of result.takeoffInputs) {
    if (!unique(w.findingIds) || w.findingIds.some(id => !findings.has(id))) return false
    for (const input of [w.location, w.surface, ...Object.values(w.inputs)]) if (input && (!unique(input.citationIds) || input.citationIds.some(id => !citations.has(id)))) return false
  }
  return result.reviewStatus !== "limited" || result.limitations.length > 0
}
/** Browser-safe strict parsing. It checks bindings/shape, not interpretation truth. */
export function parseProjectAnalysisRecord(value: unknown): ProjectAnalysisRecord | null {
  const parsed = recordSchema.safeParse(value)
  if (!parsed.success) return null
  const record = parsed.data
  if (!unique(record.sourceVersions.map(sourceKey)) || !record.sourceVersions.some(s => s.role === "target") || record.sourceVersions.filter(s => s.role === "target").length > ANALYSIS_LIMITS.targets || record.sourceVersions.filter(s => s.role === "context").length > ANALYSIS_LIMITS.context) return null
  if (record.sourceVersions.some(s => (s.imageStatus === "provided") !== Boolean(s.imageSha256))) return null
  if (record.status === "complete") {
    if (!record.result || !record.resultIdentity || !record.usage || !resultStructure(record.result)) return null
    const prefix = `${record.id}:`
    if ([...record.result.citations, ...record.result.findings, ...record.result.takeoffInputs].some(item => !item.id.startsWith(prefix))) return null
    for (const ref of record.result.citations) if (!record.sourceVersions.some(s => s.fileId === ref.fileId && s.sourceVersion === ref.sourceVersion && s.sourceSha256 === ref.sourceSha256 && s.pageNumber === ref.pageNumber)) return null
  } else if (record.result !== null || record.resultIdentity !== null) return null
  return record
}
export const parseAnalysisRecord = parseProjectAnalysisRecord

function fail(message: string): never { throw new ProjectAnalysisError(422, "INVALID_ANALYSIS", message) }
function numericSupport(text: string, value: number, field: string) {
  return [...text.matchAll(/[+-]?\d+(?:,\d{3})*(?:\.\d+)?/g)].some(match => {
    if (Number(match[0].replaceAll(",", "")) !== value) return false
    const before = text.slice(Math.max(0, match.index! - 48), match.index), after = text.slice(match.index! + match[0].length)
    if (/\b(?:about|approx(?:imately)?\.?|between|to|or)\s*$/i.test(before)) return false
    if (["lengthFt", "widthFt", "wallHeightFt"].includes(field)) return /^\s*(?:ft\b|feet\b|foot\b|['′])(?!\s*[-–]\s*\d)/i.test(after)
    if (["openingsSqft", "netAreaSqft"].includes(field)) return /^\s*(?:sq\.?\s*(?:ft|feet)\b|sqft\b|sf\b|square\s+feet\b|ft[²2])/i.test(after)
    if (field === "coats") return /^\s*coats?\b/i.test(after) || /\bcoats?\s*[:=]?\s*$/i.test(before)
    if (field === "count") return /^\s*(?:doors?|ea|each)\b/i.test(after) || /\b(?:doors?(?:\s+count)?|count)\s*[:=#]?\s*$/i.test(before)
    return true
  })
}
/** Exact supplied evidence/identity gates; contractor review still establishes authority. */
export function validateAnalysisResult(value: unknown, packet: AnalysisPacket, attemptId: string): AnalysisResult {
  const parsed = analysisOutputSchema.safeParse(value)
  if (!parsed.success || !resultStructure(parsed.data)) fail("The AI response has invalid fields, identities or relationships. No findings were published.")
  const result = parsed.data
  for (const ref of result.citations) {
    const source = packet.sources.find(s => sourceKey(s) === sourceKey(ref) && s.sourceVersion === ref.sourceVersion && s.sourceSha256 === ref.sourceSha256)
    if (!source) fail("A citation did not match an exact retained source version in this request.")
    if (ref.anchor.kind === "text") {
      if (source.textStatus !== "complete" || !source.text.includes(ref.anchor.quote)) fail("A quotation is not present in the supplied retained text.")
    } else if (!source.image || source.imageStatus !== "provided" || !source.imageSha256) fail("A visual citation refers to an image that was not supplied.")
  }
  function checkFact(input: AnalysisFact<string | number> | null, field: string) {
    if (!input) return
    const refs = input.citationIds.map(id => result.citations.find(c => c.id === id)!)
    const sources = refs.map(ref => packet.sources.find(s => sourceKey(s) === sourceKey(ref))!)
    if (typeof input.value === "number" && input.origin === "observation") fail("Observed conditions cannot supply measured takeoff numbers. Leave the measurement unknown and ask a question.")
    if ((field === "location" || typeof input.value === "number") && sources.some(s => s.mimeType.startsWith("image/")) && input.origin !== "observation") fail("Photos may propose visible conditions/location clues, not room identity or measured takeoff inputs.")
    if (input.origin === "explicit_text" && refs.some(ref => ref.anchor.kind !== "text")) fail("A text-derived input must cite supplied text.")
    if (input.origin === "printed_visual" && refs.some((ref, i) => ref.anchor.kind !== "image" || sources[i].mimeType !== "application/pdf" || !ref.anchor.visibleText?.trim())) fail("Printed visual inputs require visible annotations in a supplied plan-page image.")
    const quoted = refs.map(ref => ref.anchor.kind === "text" ? ref.anchor.quote : ref.anchor.visibleText ?? "")
    if (field === "location" && input.origin !== "observation") {
      const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim()
      const escaped = normalize(String(input.value)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const literal = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u")
      if (!quoted.some(quote => literal.test(normalize(quote)))) fail("A proposed room/location identity is absent from its cited source wording.")
    }
    if (field === "surface" && input.origin !== "observation") {
      const surface = input.value === "walls" ? /\bwalls?\b/i : input.value === "ceilings" ? /\bceilings?\b/i : /\bdoors?\b/i
      if (!quoted.some(quote => surface.test(quote))) fail("The proposed work surface is absent from its cited source wording.")
    }
    if (typeof input.value === "number" && input.origin !== "observation") {
      const supported = refs.some(ref => numericSupport(ref.anchor.kind === "text" ? ref.anchor.quote : ref.anchor.visibleText ?? "", input.value as number, field))
      if (!supported) fail("A proposed number lacks a cited printed value/unit. No model quantity was substituted.")
    }
  }
  for (const work of result.takeoffInputs as AnalysisTakeoffInput[]) {
    checkFact(work.location, "location"); checkFact(work.surface, "surface")
    for (const [field, input] of Object.entries(work.inputs)) checkFact(input, field)
  }
  // Exact per-source issues are retained on the record, without folding/truncating
  // them into model findings or pretending an absent image was inspected.
  const limited = result.reviewStatus === "limited" || packet.sources.some(s => s.issues.length > 0)
  const limitations = [...result.limitations]
  if (limited && limitations.length < 24) limitations.push("Coverage is limited. Review the retained per-source text/image status and issues; context use is not independent package review.")
  const idsMap = new Map([...result.citations, ...result.findings, ...result.takeoffInputs].map((item, index) => [item.id, `${attemptId}:${index}`]))
  if (idsMap.size !== result.citations.length + result.findings.length + result.takeoffInputs.length) fail("Finding, work and citation identities must be distinct.")
  const remap = (values: string[]) => values.map(id => idsMap.get(id)!)
  const factCopy = <T>(value: AnalysisFact<T> | null) => value ? { ...value, citationIds: remap(value.citationIds) } : null
  return {
    citations: result.citations.map(ref => ({ ...ref, id: idsMap.get(ref.id)! })),
    findings: result.findings.map(f => ({ ...f, id: idsMap.get(f.id)!, citationIds: remap(f.citationIds), relatedFindingIds: remap(f.relatedFindingIds), affectedWorkIds: remap(f.affectedWorkIds) })),
    takeoffInputs: result.takeoffInputs.map(w => ({ ...w, id: idsMap.get(w.id)!, findingIds: remap(w.findingIds), location: factCopy(w.location), surface: factCopy(w.surface), inputs: {
      lengthFt: factCopy(w.inputs.lengthFt), widthFt: factCopy(w.inputs.widthFt), wallHeightFt: factCopy(w.inputs.wallHeightFt),
      openingsSqft: factCopy(w.inputs.openingsSqft), netAreaSqft: factCopy(w.inputs.netAreaSqft), count: factCopy(w.inputs.count),
      substrate: factCopy(w.inputs.substrate), condition: factCopy(w.inputs.condition), coats: factCopy(w.inputs.coats), finish: factCopy(w.inputs.finish), extent: factCopy(w.inputs.extent),
    } })),
    reviewStatus: limited ? "limited" : "reviewed", limitations: [...new Set(limitations)],
  }
}
