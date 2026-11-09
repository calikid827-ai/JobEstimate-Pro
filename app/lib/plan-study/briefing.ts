import type { Finding, Study, StudyAttempt } from "./types"

export type BriefingGroup = { attempt: StudyAttempt; findings: Finding[] }
export type StudyBriefing = {
  synthesis: BriefingGroup | null
  supporting: BriefingGroup[]
  unassigned: Array<{ finding: Finding; reason: string }>
  provenanceNotice?: string
}

/**
 * A presentation-only view of the retained ledger. validateReview assigns the
 * canonical `${attempt.id}:${index}` identities; array order and wording are not
 * provenance. Unassignable records stay accessible without changing their kind,
 * citations, identity, or answer association.
 */
export function buildStudyBriefing(study: Study): StudyBriefing {
  const documents = study.documents.filter((document) => document.active)
  const documentIds = new Set(documents.map((document) => document.id))
  const sourcesUnique = documents.length > 0 && documentIds.size === documents.length
  const attemptCounts = counts(study.attempts.map((attempt) => attempt.id))
  const findingCounts = counts(study.findings.map((finding) => finding.id))
  const attemptProblems = new Map<StudyAttempt, string>()
  for (const attempt of study.attempts) {
    let problem: string | undefined
    if (!attempt.id || attemptCounts.get(attempt.id) !== 1) problem = "The recorded review attempt identity is missing or ambiguous."
    else if (attempt.studyId !== study.id || attempt.ownerId !== study.ownerId) problem = "The recorded review attempt does not match this study and owner."
    else if (attempt.sourceRevision !== study.sourceRevision) problem = "The recorded review attempt belongs to a different source revision."
    else if (!sourcesUnique || !Array.isArray(attempt.sourceVersions)
      || attempt.sourceVersions.length !== documents.length
      || attempt.sourceVersions.some((version) => !version || typeof version.documentVersionId !== "string" || typeof version.sha256 !== "string")
      || new Set(attempt.sourceVersions.map((version) => version.documentVersionId)).size !== documents.length
      || documents.some((document) => !attempt.sourceVersions.some((version) => version.documentVersionId === document.id && version.sha256 === document.sha256))) {
      problem = "The recorded review attempt cannot be bound to the current source versions."
    } else if (attempt.status !== "complete") problem = "The recorded review attempt has no completed result."
    else if (attempt.kind === "page") {
      const pages = documents.flatMap((document) => document.pages).filter((page) => page.id === attempt.pageId)
      if (pages.length !== 1 || !documents.some((document) => document.id === pages[0].documentVersionId && document.sha256 === pages[0].sourceSha256)) {
        problem = "The recorded page-review target cannot be bound to a current source page."
      }
    } else if (attempt.kind !== "synthesis" || attempt.pageId != null) problem = "The recorded review step has an ambiguous kind or target."
    if (problem) attemptProblems.set(attempt, problem)
  }

  // Do not select a winner among competing current synthesis records, even when
  // only one says complete. Missing legacy revision metadata is also ambiguous.
  const synthesisAttempts = study.attempts.filter((attempt) => attempt.kind === "synthesis"
    && (attempt.sourceRevision === study.sourceRevision || !Number.isSafeInteger(attempt.sourceRevision)))
  const synthesisAttempt = study.synthesis === "complete" && synthesisAttempts.length === 1
    && !attemptProblems.has(synthesisAttempts[0]) ? synthesisAttempts[0] : null
  const result: StudyBriefing = {
    synthesis: synthesisAttempt ? { attempt: synthesisAttempt, findings: [] } : null,
    supporting: study.attempts.filter((attempt) => attempt.kind === "page" && !attemptProblems.has(attempt)).map((attempt) => ({ attempt, findings: [] })),
    unassigned: [],
  }

  for (const finding of study.findings) {
    const identity = /^(.*):(0|[1-9]\d*)$/.exec(finding.id)
    const attempt = identity && Number(identity[2]) < 80
      ? study.attempts.find((item) => item.id === identity[1]) : undefined
    let reason = findingCounts.get(finding.id) !== 1 ? "This finding identity occurs more than once; its review provenance is ambiguous."
      : !attempt ? "This finding has no canonical identity bound to a recorded review attempt."
      : attemptProblems.get(attempt)
    if (!reason && (!finding.citations.length || !finding.citations.every((citation) => {
      const document = documents.find((item) => item.id === citation.documentVersionId)
      const pages = document?.pages.filter((page) => page.id === citation.pageId)
      return document?.sha256 === citation.sourceSha256 && pages?.length === 1
        && pages[0].documentVersionId === document.id && pages[0].sourceSha256 === citation.sourceSha256
    }))) {
      reason = "A finding citation cannot be bound to the current source version and page."
    }
    if (!reason && attempt?.kind === "synthesis" && attempt !== synthesisAttempt) reason = "The package synthesis provenance or execution state is not unambiguous."
    const group = attempt?.kind === "synthesis" ? result.synthesis : result.supporting.find((item) => item.attempt === attempt)
    if (reason || !group) result.unassigned.push({ finding, reason: reason || "This finding cannot be assigned to a verified review step." })
    else group.findings.push(finding)
  }
  if (result.unassigned.length || study.synthesis === "complete" && !result.synthesis) {
    result.provenanceNotice = "Some recorded provenance could not be established. Unassigned records remain available below; their order or similar wording is not evidence of package synthesis."
  }
  return result
}

function counts(identities: string[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const id of identities) result.set(id, (result.get(id) || 0) + 1)
  return result
}
