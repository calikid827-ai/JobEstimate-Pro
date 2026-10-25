import assert from "node:assert/strict"
import test from "node:test"
import { validateReview } from "./validation"
import { reviewContext } from "./runner"

import { fixtureStudy, fixtureAttempt, fixtureResult } from "./test-fixtures"

test("citations bind exact immutable version, hash, physical page and quote", () => {
  const valid = validateReview(fixtureStudy(), fixtureAttempt(), fixtureResult())
  assert.equal(valid.findings[0].id, "attempt-a:0")
  for (const change of ["documentVersionId", "pageId", "sourceSha256"] as const) {
    const result = fixtureResult()
    result.findings[0].citations[0][change] = change === "sourceSha256" ? "b".repeat(64) : "other"
    assert.throws(() => validateReview(fixtureStudy(), fixtureAttempt(), result), { code: "INVALID_CITATION" })
  }
  const falseQuote = fixtureResult()
  falseQuote.findings[0].citations[0].anchor = { kind: "text", blockId: "block-a", quote: "three coats" }
  assert.throws(() => validateReview(fixtureStudy(), fixtureAttempt(), falseQuote), { code: "INVALID_CITATION" })
})
test("image regions require a retained render and bounds inside the page", () => {
  const result = fixtureResult()
  result.findings[0].citations[0].anchor = { kind: "image", bounds: { x: .1, y: .1, width: .8, height: .5 } }
  assert.equal(validateReview(fixtureStudy(), fixtureAttempt(), result).findings.length, 1)
  result.findings[0].citations[0].anchor.bounds.width = 1
  assert.throws(() => validateReview(fixtureStudy(), fixtureAttempt(), result), { code: "INVALID_CITATION" })
})
test("unprepared, retired and changed sources cannot publish citations", () => {
  const study = fixtureStudy()
  study.documents[0].pages[0].rendering = "pending"
  assert.throws(() => validateReview(study, fixtureAttempt(), fixtureResult()), { code: "INVALID_CITATION" })
  study.documents[0].pages[0].rendering = "complete"
  study.documents[0].active = false
  assert.throws(() => validateReview(study, fixtureAttempt(), fixtureResult()), { code: "INVALID_CITATION" })
  study.sourceRevision++
  assert.throws(() => validateReview(study, fixtureAttempt(), fixtureResult()), { code: "SOURCE_CHANGED" })
})
test("citations cannot introduce URLs, arbitrary fields or unknown usage", () => {
  const result = fixtureResult()
  Object.assign(result.findings[0].citations[0], { url: "https://outside.invalid/page" })
  assert.throws(() => validateReview(fixtureStudy(), fixtureAttempt(), result), { code: "INVALID_REVIEW" })
  const unknown = fixtureResult()
  unknown.usage.inputTokens = Number.NaN
  assert.throws(() => validateReview(fixtureStudy(), fixtureAttempt(), unknown), { code: "INVALID_USAGE" })
})
test("complete context is retained or explicitly rejected, never silently truncated", () => {
  const study = fixtureStudy()
  assert.match(reviewContext(study, fixtureAttempt()), /PT-1/)
  study.documents[0].pages[0].blocks[0].text = "x".repeat(120001)
  assert.throws(() => reviewContext(study, fixtureAttempt()), { code: "CONTEXT_LIMIT" })
})
