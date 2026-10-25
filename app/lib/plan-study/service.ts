import { createHash, randomUUID } from "node:crypto"
import type { StudyStore } from "./store"
import { activePages, STUDY_LIMITS, StudyError, type Artifact, type Study, type StudyDocument } from "./types"
import { inspectPdf, preparePdfPage } from "./pdf"

export const hashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const conflict = () => new StudyError(409, "STUDY_CHANGED", "The study changed. Reopen it before continuing.")
export function assertRevision(study: Study, expected: number) {
  if (!Number.isSafeInteger(expected) || study.revision !== expected) throw conflict()
}
function artifact(ownerId: string, studyId: string, versionId: string, kind: Artifact["kind"], bytes: Uint8Array, pageId?: string): Artifact {
  const id = randomUUID()
  return { id, ownerId, studyId, documentVersionId: versionId, ...(pageId ? { pageId } : {}), kind,
    storageKey: `${ownerId}/${studyId}/${versionId}/${id}`, mime: kind === "original" ? "application/pdf" : "image/png", sha256: hashBytes(bytes) }
}
export async function addDocument(store: StudyStore, ownerId: string, studyId: string, expectedRevision: number, name: string, bytes: Uint8Array, replacesDocumentId?: string) {
  const study = await store.get(ownerId, studyId)
  assertRevision(study, expectedRevision)
  if (bytes.length === 0 || bytes.length > STUDY_LIMITS.maxFileBytes) throw new StudyError(413, "STUDY_FILE_LIMIT", "Each Plan Study PDF must be no larger than 3 MiB. No pages were omitted.")
  if (study.documents.length >= 48) throw new StudyError(413, "STUDY_VERSION_LIMIT", "This study has reached its retained source-version limit.")
  const previous = replacesDocumentId ? study.documents.find((d) => d.id === replacesDocumentId && d.active) : undefined
  if (replacesDocumentId && !previous) throw new StudyError(404, "STUDY_SOURCE_NOT_FOUND", "The source to replace is unavailable in this study.")
  const active = study.documents.filter((d) => d.active && d.id !== previous?.id)
  if (active.length >= STUDY_LIMITS.maxDocuments) throw new StudyError(413, "STUDY_DOCUMENT_LIMIT", "This slice supports eight active PDFs per package. No source was truncated.")
  if (active.reduce((n, d) => n + d.bytes, 0) + bytes.length > STUDY_LIMITS.maxPackageBytes) throw new StudyError(413, "STUDY_PACKAGE_LIMIT", "This slice supports 20 MiB per active package. No sources were truncated.")
  let inspected: Awaited<ReturnType<typeof inspectPdf>>
  try { inspected = await inspectPdf(bytes) } catch { throw new StudyError(422, "STUDY_PDF_INVALID", "The original PDF could not be inventoried. Encrypted, damaged or unsupported files are not silently accepted.") }
  if (inspected.sha256 !== hashBytes(bytes)) throw new StudyError(422, "STUDY_HASH_MISMATCH", "The source could not be verified.")
  if (active.reduce((n, d) => n + d.pageCount, 0) + inspected.pageCount > STUDY_LIMITS.maxPages) throw new StudyError(413, "STUDY_PAGE_LIMIT", "This slice supports 48 physical pages per package. Split the package explicitly; no pages were omitted.")
  const id = randomUUID()
  const original = artifact(ownerId, studyId, id, "original", bytes)
  const doc: StudyDocument = { id, name: name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "Plan.pdf", sha256: inspected.sha256, pageCount: inspected.pageCount, bytes: bytes.length,
    originalArtifactId: original.id, active: true, ...(previous ? { replacesDocumentId: previous.id } : {}),
    pages: Array.from({ length: inspected.pageCount }, (_, index) => ({ id: randomUUID(), documentVersionId: id, pageNumber: index + 1, sourceSha256: inspected.sha256,
      indexing: "complete", extraction: "pending", rendering: "pending", analysis: "pending", blocks: [] })) }
  // An unreferenced object after a failed CAS is never exposed. See setup's orphan retention procedure.
  await store.putArtifact(original, bytes)
  const next = structuredClone(study)
  if (previous) next.documents.find((d) => d.id === previous.id)!.active = false
  next.documents.push(doc)
  next.sourceRevision++
  next.synthesis = "pending"
  delete next.synthesisReviewStatus
  next.synthesisLimitations = []
  next.findings = []
  for (const page of activePages(next)) page.analysis = "pending"
  for (const decision of next.decisions) {
    if (previous && decision.documentVersionIds.includes(previous.id)) decision.status = "needs_reconfirmation"
  }
  return store.save(ownerId, next, expectedRevision)
}
export async function prepareNextPage(store: StudyStore, ownerId: string, studyId: string, expectedRevision: number, pageId?: string) {
  const study = await store.get(ownerId, studyId)
  assertRevision(study, expectedRevision)
  const page = activePages(study).find((p) => pageId ? p.id === pageId : p.extraction === "pending" || p.rendering === "pending")
  if (!page) throw new StudyError(409, "STUDY_PAGE_UNAVAILABLE", "There is no pending physical page to prepare.")
  if (page.extraction !== "pending" && page.rendering !== "pending") return study
  const doc = study.documents.find((d) => d.id === page.documentVersionId && d.active)!
  const { artifact: source, bytes } = await store.getArtifact(ownerId, studyId, doc.originalArtifactId)
  if (source.documentVersionId !== doc.id || source.kind !== "original" || source.sha256 !== doc.sha256 || hashBytes(bytes) !== doc.sha256) throw new StudyError(422, "STUDY_SOURCE_MISMATCH", "The retained source failed its integrity check.")
  const next = structuredClone(study)
  const target = activePages(next).find((p) => p.id === page.id)!
  try {
    const prepared = await preparePdfPage(bytes, page.pageNumber)
    if (prepared.blocks.reduce((n, b) => n + b.text.length, 0) > STUDY_LIMITS.maxTextCharactersPerPage) throw new StudyError(413, "STUDY_TEXT_LIMIT", "This page exceeds the extraction limit; it was not truncated or marked reviewed.")
    const image = artifact(ownerId, studyId, doc.id, "page-image", prepared.png, page.id)
    await store.putArtifact(image, prepared.png)
    Object.assign(target, { blocks: prepared.blocks, extraction: prepared.extraction, rendering: prepared.render, imageArtifactId: image.id, width: prepared.width, height: prepared.height })
  } catch (error) {
    const unsupported = new Set(["PDF_ANNOTATIONS_UNSUPPORTED", "PDF_XFA_UNSUPPORTED", "PDF_INLINE_IMAGES_UNSUPPORTED", "PDF_IMAGE_CODEC_UNSUPPORTED", "PDF_IMAGE_COLORSPACE_UNSUPPORTED", "PDF_CONTENT_FILTER_UNSUPPORTED", "PDF_CONTENT_UNSUPPORTED", "PDF_JPEG_UNSUPPORTED", "PDF_STREAM_FILTER_UNSUPPORTED", "PDF_IMAGE_PARAMETERS_UNSUPPORTED"])
    const limited = new Set(["PDF_DECODED_BYTES_LIMIT", "PDF_DECODED_BYTES_LIMIT_OR_INVALID_STREAM", "PDF_DECODED_IMAGE_LIMIT", "PDF_DECODED_IMAGE_LIMIT_OR_INCOMPLETE", "PDF_DECODED_CONTENT_LIMIT", "PDF_IMAGE_LIMIT", "PDF_PACKAGE_IMAGE_LIMIT", "PDF_PAGE_RASTER_LIMIT", "PDF_PAGE_TEXT_LIMIT", "PDF_PAGE_SIZE_INVALID", "PDF_IMAGE_DIMENSIONS_MISMATCH"])
    const code = error instanceof Error ? error.message : ""
    target.extraction = "failed"; target.rendering = "failed"
    target.issue = error instanceof StudyError ? error.message : unsupported.has(code)
      ? "Unsupported PDF image or drawing-content encoding. Preparation stopped; this page has not been substantively reviewed."
      : limited.has(code) ? "PDF decoding or raster limits were exceeded, or image data was invalid. Preparation stopped; this page has not been substantively reviewed."
      : "Page preparation failed. This page has not been substantively reviewed."
  }
  return store.save(ownerId, next, expectedRevision)
}
export async function answerQuestion(store: StudyStore, ownerId: string, studyId: string, expectedRevision: number, findingId: string, answer: string) {
  const study = await store.get(ownerId, studyId)
  assertRevision(study, expectedRevision)
  const finding = study.findings.find((f) => f.id === findingId && (f.kind === "question" || f.kind === "conflict"))
  if (!finding) throw new StudyError(404, "STUDY_QUESTION_UNAVAILABLE", "This current study question is unavailable.")
  const value = answer.trim()
  if (!value || value.length > 4000) throw new StudyError(400, "STUDY_ANSWER_INVALID", "Enter an answer of 1–4,000 characters.")
  const next = structuredClone(study)
  next.decisions = next.decisions.filter((d) => d.findingId !== findingId)
  next.decisions.push({ id: randomUUID(), findingId, findingTitle: finding.title, answer: value, documentVersionIds: [...new Set(finding.citations.map((c) => c.documentVersionId))], sourceRevision: study.sourceRevision, status: "active", createdAt: new Date().toISOString() })
  return store.save(ownerId, next, expectedRevision)
}
export async function readEvidence(store: StudyStore, ownerId: string, studyId: string, artifactId: string, documentVersionId: string) {
  const study = await store.get(ownerId, studyId)
  const doc = study.documents.find((d) => d.id === documentVersionId)
  if (!doc) throw new StudyError(404, "STUDY_EVIDENCE_UNAVAILABLE", "This retained source is unavailable.")
  const result = await store.getArtifact(ownerId, studyId, artifactId)
  const meta = result.artifact
  if (meta.documentVersionId !== doc.id || !(meta.kind === "original" && doc.originalArtifactId === meta.id || meta.kind === "page-image" && doc.pages.some((p) => p.id === meta.pageId && p.imageArtifactId === meta.id)) || hashBytes(result.bytes) !== meta.sha256) throw new StudyError(404, "STUDY_EVIDENCE_UNAVAILABLE", "This retained evidence is unavailable.")
  return result
}
