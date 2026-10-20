import assert from "node:assert/strict"
import test from "node:test"

import { validateGeneratedDocumentPurpose } from "./document-purpose"

test("ordinary purpose rejects the reviewed additional-contract assertion without rewriting it", () => {
  const description = "This Change Order covers painting. The work is additional to the original contract and was not previously included."
  const checked = validateGeneratedDocumentPurpose(description, "Estimate")
  assert.equal(checked.ok, false)
  if (!checked.ok) assert.equal(checked.code, "DOCUMENT_PURPOSE_CONFLICT")
  assert.equal(description, "This Change Order covers painting. The work is additional to the original contract and was not previously included.")
})

test("ordinary purpose rejects contractual-effect assertions instead of replacing canned sentences", () => {
  for (const description of [
    "This scope is additive to any existing contract scope.",
    "The work is intended to be additive or corrective to existing contract conditions.",
    "This estimate modifies the original contract.",
    "The proposed work is not previously included in the existing contract.",
    "The work was not previously included in the original contract.",
  ]) {
    assert.equal(validateGeneratedDocumentPurpose(description, "Estimate").ok, false, description)
  }
})

test("opening AI labels do not establish purpose and legitimate exclusions and references remain intact", () => {
  for (const description of [
    "This Change Order covers proposed painting. Electrical work is not included. Refer to the existing contract for site-access rules.",
    "This Estimate covers revision of the proposed paint color. Additional surface preparation is included. Ceiling painting is not included.",
    "This estimate does not modify the original contract. The work is not additional to the original contract.",
    "This estimate excludes work that was not included in the original contract.",
  ]) {
    assert.equal(validateGeneratedDocumentPurpose(description, "Estimate").ok, true, description)
  }
})

test("intentional change orders and callers omitting optional purpose retain legacy behavior", () => {
  const description = "This Change Order covers painting. The work is additional to the original contract."
  assert.equal(validateGeneratedDocumentPurpose(description, "Change Order").ok, true)
  assert.equal(validateGeneratedDocumentPurpose(description, undefined).ok, true)
})
