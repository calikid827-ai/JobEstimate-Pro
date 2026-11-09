import type { Finding, Study, StudyAttempt } from "../../../app/lib/plan-study/types"

/**
 * This is an offline UI fixture, not a captured Study snapshot or a new model result.
 * All identities, source text, citations, page records and decisions are synthetic.
 * Only the explicitly named excerpts below are captured verbatim from the completed
 * authored-QA evaluation (2026-10-25, response call_2f1b904b08794fa29e6f4852cad44d36).
 * The original full artifact directory is no longer available. Its printed citation
 * anchors were abbreviated as [Object], so none have been reconstructed as captures.
 */
export const capturedSynthesisLimitations = [
  "This synthesis reconciles the supplied text blocks and recorded page findings for F101 and A201. Page images were not supplied directly in this synthesis input, so prior visual observations were not independently reverified and no image-only conclusions are asserted.",
  "Referenced A602, specification 09 91 23, and specification 09 72 00 are absent; their requirements remain unknown.",
  "The PT-1 wall-extent discrepancy remains unresolved. PT-2 coating details, substrate conditions, dimensioned geometry, and installation/access constraints are not established.",
  "No measured quantities, prices, contractor scope authorization, or verified coverage have been inferred.",
]
export const capturedExtentFinding = {
  kind: "conflict" as const,
  title: "Unresolved PT-1 wall extent",
  detail: "F101 assigns PT-1 to Room 101 and 102 walls without a height qualification; A201 expressly identifies PT-1 above the chair rail. Preserve this as an unresolved extent discrepancy. No supplied authority establishes that either sheet overrides the other. Confirm whether PT-1 is limited to upper walls, the finish below the rail, the rail finish, and rail elevations. Neither full-height painting nor exclusion of lower walls is established.",
}

export const briefingScenarios = ["limited", "pending", "failed", "unknown", "running", "limited-page", "legacy", "ambiguous", "answer-boundaries"] as const
export type BriefingScenario = typeof briefingScenarios[number]

const sourceId = "synthetic-source-v1"
const sha256 = "a".repeat(64)
const citation = (pageId: string, blockId: string, quote: string) => ({
  documentVersionId: sourceId, pageId, sourceSha256: sha256,
  anchor: { kind: "text" as const, blockId, quote },
})
const finish = citation("synthetic-page-1", "synthetic-block-1", "Room 101 walls: PT-1.")
const extent = citation("synthetic-page-2", "synthetic-block-2", "Apply PT-1 above the chair rail. Refer to A602, not included.")

export function briefingBrowserStudy(scenario: BriefingScenario = "limited"): Study {
  const page1: StudyAttempt = {
    id: "synthetic-page-attempt-1", idempotencyKey: "synthetic-request-1", studyId: "synthetic-study", ownerId: "synthetic-owner", sourceRevision: 1,
    sourceVersions: [{ documentVersionId: sourceId, sha256 }], kind: "page", pageId: "synthetic-page-1", status: "complete", claimToken: "synthetic-claim-1",
    reservation: { inputTokens: 200000, outputTokens: 6000 }, usage: { inputTokens: 100, outputTokens: 30 }, createdAt: "2026-10-25T12:00:00Z", leaseExpiresAt: "2026-10-25T12:05:00Z",
  }
  const page2: StudyAttempt = { ...structuredClone(page1), id: "synthetic-page-attempt-2", idempotencyKey: "synthetic-request-2", pageId: "synthetic-page-2" }
  const synthesis: StudyAttempt = { ...structuredClone(page1), id: "synthetic-synthesis-attempt", idempotencyKey: "synthetic-request-3", kind: "synthesis" }
  delete synthesis.pageId
  const pageFindings: Finding[] = [
    { id: `${page1.id}:0`, kind: "requirement", trade: "painting", title: "Synthetic PT-1 source requirement", detail: "Synthetic page-level observation retained separately from the package briefing.", citations: [finish], limitations: [] },
    { id: `${page1.id}:1`, kind: "conflict", trade: "painting", title: capturedExtentFinding.title, detail: "Synthetic page-1 interpretation of the same extent issue. Historical classifications are preserved for review.", citations: [finish, extent], limitations: [] },
    { id: `${page2.id}:0`, kind: "conflict", trade: "painting", title: capturedExtentFinding.title, detail: "Synthetic page-2 interpretation of the same extent issue. This record is not a separate package action.", citations: [finish, extent], limitations: [] },
    { id: `${page2.id}:1`, kind: "requirement", trade: "shared", title: "Synthetic page-only access coordination", detail: "This distinct page observation is deliberately absent from synthesis; synthesis is not an exhaustive substitute for page records.", citations: [extent], limitations: ["Synthetic access windows remain unknown."] },
  ]
  const synthesisFindings: Finding[] = [
    { id: `${synthesis.id}:0`, ...capturedExtentFinding, trade: "painting", citations: [finish, extent], limitations: [] },
    { id: `${synthesis.id}:1`, kind: "question", trade: "shared", title: "Synthetic missing A602 question", detail: "A602 is absent. Its contents remain unknown; obtain the referenced source before deciding the termination detail.", citations: [extent], limitations: ["Synthetic citation binding; missing-reference wording is reconstructed, not captured."] },
  ]
  const study: Study = {
    id: "synthetic-study", ownerId: "synthetic-owner", title: "Synthetic offline briefing study", revision: 9, sourceRevision: 1,
    documents: [{ id: sourceId, name: "synthetic-sources.pdf", sha256, bytes: 1000, pageCount: 2, originalArtifactId: "synthetic-original", active: true,
      pages: [
        { id: "synthetic-page-1", documentVersionId: sourceId, sourceSha256: sha256, pageNumber: 1, indexing: "complete", extraction: "complete", rendering: "complete", analysis: "complete", imageArtifactId: "synthetic-image-1", blocks: [{ id: "synthetic-block-1", text: finish.anchor.quote, bounds: { x: .1, y: .1, width: .8, height: .1 } }] },
        { id: "synthetic-page-2", documentVersionId: sourceId, sourceSha256: sha256, pageNumber: 2, indexing: "complete", extraction: "complete", rendering: "complete", analysis: "complete", imageArtifactId: "synthetic-image-2", blocks: [{ id: "synthetic-block-2", text: extent.anchor.quote, bounds: { x: .1, y: .1, width: .8, height: .1 } }] },
      ],
    }],
    findings: [...pageFindings, ...synthesisFindings], decisions: [], attempts: [page1, page2, synthesis], synthesis: "complete", synthesisReviewStatus: "limited",
    synthesisLimitations: [...capturedSynthesisLimitations], modelLabel: "Synthetic UI dependencies; explicitly identified wording excerpts captured from the completed evaluation", createdAt: "2026-10-25T12:00:00Z", updatedAt: "2026-10-25T12:30:00Z",
  }
  if (["pending", "failed", "unknown", "running"].includes(scenario)) {
    study.findings = pageFindings
    delete study.synthesisReviewStatus
    study.synthesisLimitations = []
    if (scenario === "pending") { study.synthesis = "pending"; study.attempts = [page1, page2] }
    else {
      synthesis.status = scenario as "failed" | "unknown" | "running"
      if (scenario === "failed") synthesis.errorCode = "SYNTHETIC_FAILURE"
      study.synthesis = scenario === "running" ? "pending" : scenario as "failed" | "unknown"
    }
  }
  if (scenario === "limited-page") {
    study.documents[0].pages[1].analysis = "limited"
    study.documents[0].pages[1].issue = "Synthetic page limitation: lower-wall details unreadable."
  }
  if (scenario === "legacy") {
    study.attempts = []
    study.findings = study.findings.map((finding, index) => ({ ...finding, id: `synthetic-legacy-${index}` }))
  }
  if (scenario === "ambiguous") study.attempts.push({ ...structuredClone(synthesis), kind: "page", pageId: "synthetic-page-2" })
  if (scenario === "answer-boundaries") study.decisions = [
    { id: "synthetic-old-revision-answer", findingId: `${synthesis.id}:0`, findingTitle: capturedExtentFinding.title, answer: "Synthetic earlier-source answer; must not populate a current form.", sourceRevision: 0, documentVersionIds: [sourceId], status: "active", createdAt: study.createdAt },
    { id: "synthetic-other-version-answer", findingId: `${synthesis.id}:1`, findingTitle: "Synthetic missing A602 question", answer: "Synthetic other-version answer; must not populate a current form.", sourceRevision: 1, documentVersionIds: ["synthetic-other-source"], status: "active", createdAt: study.createdAt },
  ]
  return study
}

/** Synthetic server-side replacement; it does not upload, prepare or call a route. */
export function replaceBriefingBrowserSource(study: Study): Study {
  const next = structuredClone(study)
  const old = next.documents.find((document) => document.active)!
  old.active = false
  const replacement = structuredClone(old)
  replacement.id = "synthetic-source-v2"
  replacement.sha256 = "c".repeat(64)
  replacement.active = true
  replacement.replacesDocumentId = old.id
  replacement.originalArtifactId = "synthetic-original-v2"
  for (const page of replacement.pages) {
    page.id += "-v2"; page.documentVersionId = replacement.id; page.sourceSha256 = replacement.sha256; page.analysis = "pending"
  }
  next.documents.push(replacement)
  next.sourceRevision++
  next.revision++
  next.findings = []
  next.synthesis = "pending"
  delete next.synthesisReviewStatus
  next.synthesisLimitations = []
  for (const decision of next.decisions) decision.status = "needs_reconfirmation"
  return next
}
