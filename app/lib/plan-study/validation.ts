import { z } from "zod"
import { activePages, StudyError, type Study, type ReviewResult, type StudyAttempt } from "./types"

const boundedText = z.string().min(1).max(8000)
const bounds = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
const citation = z.object({
  documentVersionId: z.string().min(1), pageId: z.string().min(1), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  anchor: z.union([
    z.object({ kind: z.literal("text"), blockId: z.string().min(1), quote: boundedText }).strict(),
    z.object({ kind: z.literal("image"), bounds }).strict(),
  ]),
}).strict()
export const reviewOutputSchema = z.object({
  findings: z.array(z.object({
    id: z.string().min(1).max(120), kind: z.enum(["requirement", "assumption", "conflict", "boundary", "question"]),
    trade: z.enum(["painting", "wallcovering", "shared"]), title: z.string().min(1).max(240), detail: boundedText,
    citations: z.array(citation).min(1).max(12), limitations: z.array(boundedText).max(12),
  }).strict()).max(80),
  pageStatus: z.enum(["complete", "limited"]), limitations: z.array(boundedText).max(24),
}).strict()
export function validateReview(study: Study, attempt: StudyAttempt, result: ReviewResult): ReviewResult {
  const parsed = reviewOutputSchema.safeParse({ findings: result.findings, pageStatus: result.pageStatus, limitations: result.limitations })
  if (!parsed.success) throw new StudyError(422, "INVALID_REVIEW", "The returned review was incomplete or malformed. No findings were published.")
  if (attempt.sourceRevision !== study.sourceRevision) throw new StudyError(409, "SOURCE_CHANGED", "Sources changed while this review was running.")
  const pages = activePages(study)
  const seen = new Set<string>()
  for (const finding of parsed.data.findings) {
    if (seen.has(finding.id)) throw new StudyError(422, "INVALID_REVIEW", "Repeated finding identities were rejected.")
    seen.add(finding.id)
    for (const ref of finding.citations) {
      const page = pages.find((p) => p.id === ref.pageId && p.documentVersionId === ref.documentVersionId && p.sourceSha256 === ref.sourceSha256)
      if (!page || page.extraction === "pending" || page.extraction === "failed" || page.rendering !== "complete") {
        throw new StudyError(422, "INVALID_CITATION", "A returned citation did not match a prepared source version. No findings were published.")
      }
      if (ref.anchor.kind === "text") {
        const anchor = ref.anchor
        const block = page.blocks.find((b) => b.id === anchor.blockId)
        if (!block || !block.text.includes(anchor.quote)) throw new StudyError(422, "INVALID_CITATION", "A returned quotation was not present in its source block. No findings were published.")
      } else {
        const box = ref.anchor.bounds
        if (!page.imageArtifactId || box.x + box.width > 1.000001 || box.y + box.height > 1.000001) {
          throw new StudyError(422, "INVALID_CITATION", "A returned image reference was outside its retained page. No findings were published.")
        }
      }
    }
  }
  if (!result.modelLabel || !Number.isSafeInteger(result.usage.inputTokens) || result.usage.inputTokens < 0 || !Number.isSafeInteger(result.usage.outputTokens) || result.usage.outputTokens < 0) {
    throw new StudyError(422, "INVALID_USAGE", "Usage could not be established. The attempt requires reconciliation.")
  }
  return { ...result, ...parsed.data, findings: parsed.data.findings.map((f, index) => ({ ...f, id: `${attempt.id}:${index}` })) }
}
/** Structural validation checks identity/anchors, not the truth or completeness of a model interpretation. */
export const CITATION_NOTICE = "References are checked against retained source versions. This does not establish semantic accuracy, complete coverage, measurements, or pricing authority."
