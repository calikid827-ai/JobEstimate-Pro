import assert from "node:assert/strict"
import test from "node:test"
import { buildStudyBriefing } from "./briefing"
import { fixtureAttempt, fixtureResult, fixtureStudy } from "./test-fixtures"
import type { Study } from "./types"

// Authored synthetic reconstructions of presentation cases, not captured model
// wording or proof of semantic accuracy from the completed hosted evaluation.
function reviewedStudy(): Study {
  const study = fixtureStudy()
  const page = { ...fixtureAttempt(), id: "page-pass", status: "complete" as const }
  const synthesis = { ...fixtureAttempt(), id: "package-pass", kind: "synthesis" as const, pageId: undefined, status: "complete" as const }
  study.attempts = [page, synthesis]
  study.documents[0].pages[0].analysis = "complete"
  study.synthesis = "complete"
  study.synthesisReviewStatus = "limited"
  study.synthesisLimitations = ["Synthetic limitation: synthesis received page findings and text, not direct images.", "Referenced A602 is absent."]
  study.findings = [
    { ...fixtureResult().findings[0], id: "page-pass:0", kind: "question", title: "Confirm lower-wall extent", detail: "Synthetic page record: confirm the extent." },
    { ...fixtureResult().findings[0], id: "package-pass:0", kind: "question", title: "Confirm lower-wall extent", detail: "Synthetic package record: confirm the extent across the package." },
  ]
  study.decisions = [{ id: "decision-a", findingId: "page-pass:0", findingTitle: "Confirm lower-wall extent", answer: "Contractor answer for the page finding only", documentVersionIds: ["source-a"], sourceRevision: 1, status: "active", createdAt: "2026-10-24" }]
  return study
}

test("recorded attempt identities separate primary synthesis from supporting page findings without changing retained evidence", () => {
  const study = reviewedStudy()
  // Deliberately put synthesis first: last-N/array-position inference would fail.
  study.findings.reverse()
  study.attempts.reverse()
  const before = structuredClone(study)
  const briefing = buildStudyBriefing(study)
  assert.equal(briefing.synthesis?.attempt.id, "package-pass")
  assert.deepEqual(briefing.synthesis?.findings.map((finding) => finding.id), ["package-pass:0"])
  assert.deepEqual(briefing.supporting.map((group) => group.findings.map((finding) => finding.id)), [["page-pass:0"]])
  assert.equal(briefing.synthesis?.findings[0], study.findings[0], "presentation retains the original finding and its citations")
  assert.equal(briefing.supporting[0].findings[0], study.findings[1])
  assert.deepEqual(briefing.unassigned, [])
  assert.deepEqual(study, before)
})

test("similar questions retain separate answer and evidence identities after reopening", () => {
  const reopened = JSON.parse(JSON.stringify(reviewedStudy())) as Study
  const briefing = buildStudyBriefing(reopened)
  const pageFinding = briefing.supporting[0].findings[0]
  const packageFinding = briefing.synthesis!.findings[0]
  assert.equal(pageFinding.title, packageFinding.title, "similar wording is intentionally not merged")
  assert.equal(reopened.decisions.find((decision) => decision.findingId === pageFinding.id)?.answer, "Contractor answer for the page finding only")
  assert.equal(reopened.decisions.find((decision) => decision.findingId === packageFinding.id), undefined)
  assert.deepEqual(pageFinding.citations, reopened.findings[0].citations)
  assert.deepEqual(packageFinding.citations, reopened.findings[1].citations)
  assert.equal(reopened.synthesisReviewStatus, "limited")
  assert.equal(reopened.synthesisLimitations?.length, 2)
})

for (const execution of ["pending", "failed", "unknown"] as const) {
  test(`${execution} package execution never promotes page findings into a synthesized briefing`, () => {
    const study = reviewedStudy()
    study.synthesis = execution
    study.attempts[1].status = execution === "pending" ? "running" : execution
    const briefing = buildStudyBriefing(study)
    assert.equal(briefing.synthesis, null)
    assert.deepEqual(briefing.supporting[0].findings.map((finding) => finding.id), ["page-pass:0"])
    assert.equal(briefing.unassigned[0].finding.id, "package-pass:0", "even an inconsistent retained result remains available as unassigned")
    assert.equal(study.synthesis, execution)
  })
}

test("a completed empty synthesis has a distinct briefing without claiming it covers every supporting observation", () => {
  const study = reviewedStudy()
  study.findings = [study.findings[0]]
  const briefing = buildStudyBriefing(study)
  assert.ok(briefing.synthesis)
  assert.equal(briefing.synthesis?.attempt.id, "package-pass")
  assert.deepEqual(briefing.synthesis.findings, [])
  assert.equal(briefing.supporting[0].findings.length, 1)
  assert.equal(study.synthesisReviewStatus, "limited")
})

test("legacy IDs and missing attempt provenance remain accessible without position or title guesses", () => {
  const study = reviewedStudy()
  study.findings[1].id = "legacy-synthesis"
  study.attempts = []
  const briefing = buildStudyBriefing(study)
  assert.equal(briefing.synthesis, null)
  assert.equal(briefing.supporting.length, 0)
  assert.deepEqual(briefing.unassigned.map((record) => record.finding), study.findings)
  assert.match(briefing.provenanceNotice!, /could not be established/)
})

test("duplicate finding and attempt identities are not silently deduplicated or assigned", () => {
  const study = reviewedStudy()
  study.findings.push({ ...study.findings[1], detail: "A materially different retained detail with the same ambiguous ID." })
  study.attempts.push(structuredClone(study.attempts[0]))
  const briefing = buildStudyBriefing(study)
  assert.equal(briefing.unassigned.length, 3)
  assert.equal(briefing.supporting.length, 0)
  assert.equal(briefing.synthesis?.findings.length, 0)
  assert.deepEqual(briefing.unassigned.map((record) => record.finding), study.findings)
})

test("competing current synthesis records do not choose a winner even if only one has a complete valid result", () => {
  for (const corrupt of ["failed", "wrong-source", "missing-revision"] as const) {
    const study = reviewedStudy()
    const competitor = { ...study.attempts[1], id: "competing-package" }
    if (corrupt === "failed") competitor.status = "failed"
    if (corrupt === "wrong-source") competitor.sourceVersions = [{ documentVersionId: "not-current", sha256: "b".repeat(64) }]
    if (corrupt === "missing-revision") delete (competitor as Partial<typeof competitor>).sourceRevision
    study.attempts.push(competitor)
    const briefing = buildStudyBriefing(study)
    assert.equal(briefing.synthesis, null, corrupt)
    assert.equal(briefing.unassigned[0].finding.id, "package-pass:0", corrupt)
    assert.equal(briefing.supporting[0].findings.length, 1)
  }
})

test("owner, study, source revision, immutable source versions and page targets must match before assignment", () => {
  const changes: Array<(study: Study) => void> = [
    (study) => { study.attempts[0].ownerId = "another-owner" },
    (study) => { study.attempts[0].studyId = "another-study" },
    (study) => { study.attempts[0].sourceRevision++ },
    (study) => { study.attempts[0].sourceVersions[0].sha256 = "b".repeat(64) },
    (study) => { study.attempts[0].sourceVersions.push(structuredClone(study.attempts[0].sourceVersions[0])) },
    (study) => { study.attempts[0].pageId = "another-page" },
    (study) => { study.attempts[0].status = "unknown" },
  ]
  for (const change of changes) {
    const study = reviewedStudy()
    change(study)
    const briefing = buildStudyBriefing(study)
    assert.equal(briefing.supporting.length, 0)
    assert.equal(briefing.unassigned[0].finding.id, "page-pass:0")
    assert.equal(briefing.synthesis?.findings[0].id, "package-pass:0")
  }
})

test("finding identity must use the canonical validated suffix, never a loose prefix", () => {
  for (const id of ["package-pass:00", "package-pass:-1", "package-pass:80", "package-pass:1.5", "package-pass:0:0", "package-pass:0-extra"]) {
    const study = reviewedStudy()
    study.findings[1].id = id
    assert.equal(buildStudyBriefing(study).unassigned[0].finding.id, id)
  }
})

test("legacy missing or malformed source-version metadata falls back without guessing", () => {
  const missing = reviewedStudy()
  delete (missing.attempts[1] as Partial<typeof missing.attempts[number]>).sourceVersions
  assert.equal(buildStudyBriefing(missing).synthesis, null)
  const malformed = reviewedStudy()
  malformed.attempts[1].sourceVersions = [null as never]
  const briefing = buildStudyBriefing(malformed)
  assert.equal(briefing.synthesis, null)
  assert.equal(briefing.unassigned[0].finding.id, "package-pass:0")
})

test("citation identities cannot cross document-version, page or hash boundaries", () => {
  for (const field of ["documentVersionId", "pageId", "sourceSha256"] as const) {
    const study = reviewedStudy()
    study.findings[1].citations[0][field] = field === "sourceSha256" ? "b".repeat(64) : "other"
    const briefing = buildStudyBriefing(study)
    assert.equal(briefing.synthesis?.findings.length, 0)
    assert.equal(briefing.unassigned[0].finding, study.findings[1])
    assert.match(briefing.unassigned[0].reason, /citation/)
  }
})

test("duplicate retained page identities leave synthesis findings unassigned rather than choosing an ambiguous page", () => {
  const study = reviewedStudy()
  study.documents[0].pages.push({ ...structuredClone(study.documents[0].pages[0]), pageNumber: 2 })
  study.documents[0].pageCount = 2
  const retained = [...study.findings]
  const briefing = buildStudyBriefing(study)
  assert.equal(briefing.synthesis?.findings.length, 0)
  assert.equal(briefing.supporting.length, 0)
  assert.deepEqual(briefing.unassigned.map((record) => record.finding), retained)
  assert.equal(briefing.unassigned[1].finding, study.findings[1])
  assert.match(briefing.unassigned[1].reason, /citation/)
  assert.equal(study.findings.length, 2, "ambiguous identity never deletes a retained finding")
})

test("source replacement cannot promote old synthesis and keeps answer reconfirmation separate", () => {
  const study = reviewedStudy()
  study.sourceRevision++
  study.synthesis = "pending"
  delete study.synthesisReviewStatus
  study.synthesisLimitations = []
  study.documents[0].active = false
  study.documents.push({ ...structuredClone(study.documents[0]), id: "source-replacement", active: true, sha256: "b".repeat(64), replacesDocumentId: "source-a", pages: [{ ...structuredClone(study.documents[0].pages[0]), id: "page-replacement", documentVersionId: "source-replacement", sourceSha256: "b".repeat(64), analysis: "pending" }] })
  study.decisions[0].status = "needs_reconfirmation"
  // Stale legacy findings, if encountered, are retained as fallback rather than
  // presented as belonging to the replacement source. Normal replacement clears
  // current findings; test that state as well without mutating service behavior.
  let briefing = buildStudyBriefing(study)
  assert.equal(briefing.synthesis, null)
  assert.equal(briefing.supporting.length, 0)
  assert.equal(briefing.unassigned.length, 2)
  assert.equal(study.decisions[0].status, "needs_reconfirmation")
  assert.deepEqual(study.decisions[0].documentVersionIds, ["source-a"])
  study.findings = []
  briefing = buildStudyBriefing(JSON.parse(JSON.stringify(study)) as Study)
  assert.equal(briefing.synthesis, null)
  assert.deepEqual(briefing.unassigned, [])
  assert.equal(study.decisions.length, 1)
})
