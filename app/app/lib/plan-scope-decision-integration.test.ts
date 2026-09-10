import test from "node:test"
import assert from "node:assert/strict"

import {
  classifyPlanCeilingScopeBoundary,
  type PlanCeilingScopeBoundaryStatus,
} from "./plan-scope-decision-integration"

function assertClassifications(
  expected: PlanCeilingScopeBoundaryStatus,
  scopeTexts: readonly (string | null | undefined)[]
) {
  for (const scopeText of scopeTexts) {
    assert.equal(
      classifyPlanCeilingScopeBoundary(scopeText),
      expected,
      `Expected ${JSON.stringify(scopeText)} to be ${expected}`
    )
  }
}

test("classifies explicit ceiling-paint inclusion wording", () => {
  assertClassifications("included", [
    "paint walls and ceilings",
    "paint ceilings",
    "Paint Ceilings",
    "ceiling painting included",
    "ceiling preparation and painting included",
    "includes ceiling preparation and painting",
    "Includes ceiling preparation and painting.",
    "ceilings to be painted",
    "paint the ceilings",
    "painting walls and ceilings",
  ])
})

test("classifies explicit ceiling-paint exclusion wording", () => {
  assertClassifications("excluded", [
    "walls only",
    "paint walls only",
    "painting walls only",
    "exclude ceilings",
    "ceilings excluded",
    "ceiling painting excluded",
    "exclude ceiling painting",
    "do not paint ceilings",
    "do not paint the ceilings",
    "no ceiling painting",
    "no paint on ceilings",
    "Excludes ceiling preparation and painting.",
    "ceilings are not to be painted",
    "ceiling painting not included",
    "ceiling painting is not included",
  ])
})

test("classifies explicit ceiling-paint responsibility assigned to others", () => {
  assertClassifications("by_others", [
    "ceilings by others",
    "ceiling painting by others",
    "ceiling painting by owner",
    "ceiling paint by owner",
    "owner to paint ceilings",
    "owner will paint ceilings",
    "customer to paint ceilings",
    "GC painting ceilings",
    "GC will paint ceilings",
    "general contractor will paint ceilings",
    "ceilings will be painted by others",
    "ceilings painted by another trade",
    "Ceiling work will be completed by others and is excluded from this proposal.",
    "paint walls. Ceilings by others.",
  ])
})

test("leaves generic painting and missing scope unclear", () => {
  assertClassifications("unclear", [
    "paint guestrooms",
    "repaint rooms",
    "interior painting",
    "paint bedrooms",
    "paint hotel rooms",
    "painting throughout",
    "interior repaint",
    "",
    "   \t\n  ",
    null,
    undefined,
  ])
})

test("keeps ceiling repair, protection, and unrelated wall painting unclear", () => {
  assertClassifications("unclear", [
    "repair ceiling drywall, paint walls",
    "patch ceiling drywall and paint walls",
    "repair ceiling drywall in bathroom; paint walls in bedroom",
    "protect ceilings",
    "protect ceilings during painting",
    "replace ceiling tile",
    "repair ceiling cracks",
    "repair walls only",
    "paint ceiling grid",
    "exclude ceiling repair",
    "owner will paint ceiling grid",
  ])
})

test("does not treat other ceiling activities assigned to others as painting responsibility", () => {
  assertClassifications("unclear", [
    "ceiling grid by others, paint walls",
    "ceiling grid installation by others",
    "ceiling tile replacement by others",
    "ceiling drywall repair by others",
    "ceiling protection by others",
    "repair ceilings by others",
    "protect ceilings by others",
    "install ceilings by others",
  ])
})

test("keeps material, color, and existing-condition ceiling-paint wording unclear", () => {
  assertClassifications("unclear", [
    "ceiling paint color to match existing",
    "ceiling paint color TBD",
    "protect ceiling paint",
    "inspect ceiling paint",
    "existing ceiling paint to remain",
  ])
})

test("does not turn ceiling-repair exclusions into ceiling-paint exclusions", () => {
  assertClassifications("unclear", [
    "do not repair ceiling",
    "ceiling repair not included",
  ])
})

test("handles narrow does-not-include ceiling-paint wording without broadening", () => {
  assertClassifications("excluded", [
    "does not include ceiling painting",
    "does not include ceiling preparation and painting",
    "scope does not include ceiling painting",
  ])
  assertClassifications("unclear", [
    "does not include ceiling repair",
    "does not include ceiling grid replacement",
    "does not include ceiling tile work",
  ])
  assertClassifications("conflicted", [
    "paint ceilings; does not include ceiling painting",
    "does not include ceiling painting; paint ceilings",
    "Includes ceiling preparation and painting. Scope does not include ceiling painting.",
  ])
})

test("handles verb-first by-others attribution without masking separate inclusion", () => {
  assertClassifications("by_others", [
    "paint ceilings by others",
    "painting ceilings by others",
    "paint the ceilings by others",
    "paint ceilings by owner",
    "paint ceilings by customer",
    "painting ceilings by another trade",
  ])
  assertClassifications("conflicted", [
    "paint ceilings; painting ceilings by others",
    "painting ceilings by others; paint ceilings",
    "Includes ceiling preparation and painting. Paint ceilings by others.",
  ])
})

test("masks the complete walls-and-ceilings instruction with fixed-role attribution", () => {
  const instructions = [
    "paint walls and ceilings",
    "painting walls and ceilings",
    "paint the walls and the ceilings",
  ]
  const actors = ["others", "owner", "customer", "another trade"]

  for (const instruction of instructions) {
    for (const actor of actors) {
      const attributedInstruction = `${instruction} by ${actor}`
      assertClassifications("by_others", [attributedInstruction])
      assertClassifications("conflicted", [
        `paint ceilings; ${attributedInstruction}`,
        `${attributedInstruction}; paint ceilings`,
        `Includes ceiling preparation and painting. ${attributedInstruction}.`,
      ])
    }
  }

  assertClassifications("conflicted", [
    "Includes ceiling preparation and painting. Paint walls and ceilings by others.",
  ])
})

test("preserves conflicts across existing inclusion phrases and punctuation in both orders", () => {
  const inclusionPhrases = [
    "paint ceilings",
    "painting ceilings",
    "paint the ceilings",
    "paint walls and ceilings",
    "painting walls and ceilings",
    "Includes ceiling preparation and painting",
    "ceiling preparation and painting included",
    "ceiling painting included",
    "ceilings to be painted",
  ]
  const separators = [" - ", " – ", " — ", ", ", ": ", "; ", ". "]

  for (const inclusionPhrase of inclusionPhrases) {
    for (const separator of separators) {
      assertClassifications("conflicted", [
        `${inclusionPhrase}${separator}ceilings by others`,
        `ceilings by others${separator}${inclusionPhrase}`,
      ])
    }
  }
})

test("preserves parenthetical contradictions without breaking an inline article", () => {
  assertClassifications("conflicted", [
    "paint ceilings (ceilings by others)",
    "paint walls and ceilings (ceilings by others)",
    "Includes ceiling preparation and painting (ceilings by others)",
  ])
  assertClassifications("included", ["Paint (the) ceilings"])
})

test("keeps repair ownership separate from explicit ceiling-paint responsibility", () => {
  assertClassifications("included", [
    "repair ceilings by others — paint ceilings",
    "paint ceilings — repair ceilings by others",
  ])
  assertClassifications("unclear", ["ceiling grid by others"])
})

test("preserves bare ceilings-by-others boundaries across punctuation", () => {
  assertClassifications("conflicted", [
    "paint ceilings — ceilings by others",
    "ceilings by others — paint ceilings",
    "paint ceilings – ceilings by others",
    "ceilings by others – paint ceilings",
    "paint ceilings - ceilings by others",
    "ceilings by others - paint ceilings",
    "paint ceilings, ceilings by others",
    "ceilings by others, paint ceilings",
    "paint ceilings: ceilings by others",
    "ceilings by others: paint ceilings",
    "paint ceilings; ceilings by others",
    "ceilings by others; paint ceilings",
    "paint ceilings. Ceilings by others.",
    "Ceilings by others. Paint ceilings.",
    "ceilings by others, but paint ceilings",
    "paint ceilings, but ceilings by others",
    "paint ceilings (ceilings by others)",
  ])
})

test("does not promote unrelated ceiling activities at punctuation boundaries", () => {
  assertClassifications("unclear", [
    "repair ceilings by others — paint walls",
    "protect ceilings by others, paint walls",
    "install ceilings by others: paint walls",
    "ceiling grid by others — paint walls",
  ])
})

test("classifies inclusion combined with exclusion or by-others wording as conflicted", () => {
  assertClassifications("conflicted", [
    "paint ceilings, but ceilings excluded",
    "ceilings excluded, but paint ceilings",
    "paint ceilings; do not paint ceilings",
    "Includes ceiling preparation and painting. Ceilings are excluded.",
    "paint ceilings, but ceiling painting is by others",
    "ceiling painting is by others, but paint ceilings",
    "paint ceilings, but ceilings by others",
    "ceilings by others, but paint ceilings",
    "paint ceilings; ceilings by others",
    "Includes ceiling preparation and painting. Ceiling work will be completed by others.",
    "Ceiling work will be completed by others. Includes ceiling preparation and painting.",
  ])
})

test("treats compatible exclusion plus by-others wording as by others", () => {
  assertClassifications("by_others", [
    "ceilings excluded and by others",
    "ceilings excluded and will be completed by others",
    "ceiling painting excluded; owner will paint ceilings",
    "Ceiling work will be completed by others and is excluded from this proposal.",
  ])
})

test("matches existing canonical ceiling Scope Decision wording", () => {
  assert.equal(
    classifyPlanCeilingScopeBoundary(
      "Includes ceiling preparation and painting."
    ),
    "included"
  )
  assert.equal(
    classifyPlanCeilingScopeBoundary(
      "Excludes ceiling preparation and painting."
    ),
    "excluded"
  )
  assert.equal(
    classifyPlanCeilingScopeBoundary(
      "Ceiling work will be completed by others and is excluded from this proposal."
    ),
    "by_others"
  )
  assert.equal(
    classifyPlanCeilingScopeBoundary(
      "Ceiling conditions and scope require field confirmation before work begins; changes may require a revised estimate."
    ),
    "unclear"
  )
})

test("normalizes capitalization, repeated whitespace, smart quotes, and harmless punctuation", () => {
  assertClassifications("included", [
    "  PAINT,    THE CEILINGS!!!  ",
    "Includes: ceiling   preparation and painting.",
    "Painting walls & ceilings",
    "“Paint (the) ceilings”",
  ])
  assert.equal(
    classifyPlanCeilingScopeBoundary("CEILING—PAINTING IS NOT INCLUDED."),
    "excluded"
  )
  assert.equal(
    classifyPlanCeilingScopeBoundary("OWNER WILL PAINT—CEILINGS."),
    "by_others"
  )
})

test("is deterministic, does not mutate input, and is total for nullish input", () => {
  const original = "  Paint ceilings; ceilings excluded.  "
  const unchangedCopy = original
  const firstResult = classifyPlanCeilingScopeBoundary(original)

  for (let index = 0; index < 20; index += 1) {
    assert.equal(classifyPlanCeilingScopeBoundary(original), firstResult)
  }

  assert.equal(firstResult, "conflicted")
  assert.equal(original, unchangedCopy)
  assert.doesNotThrow(() => classifyPlanCeilingScopeBoundary(null))
  assert.doesNotThrow(() => classifyPlanCeilingScopeBoundary(undefined))
  assert.equal(classifyPlanCeilingScopeBoundary(null), "unclear")
  assert.equal(classifyPlanCeilingScopeBoundary(undefined), "unclear")
})
