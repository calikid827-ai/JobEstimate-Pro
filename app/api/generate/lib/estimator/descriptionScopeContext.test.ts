import assert from "node:assert/strict"
import test from "node:test"

import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import {
  buildDescriptionPolishPrompt,
  type DescriptionPolishInput,
} from "./descriptionScopeContext"
import { finalizeDescription, type DescriptionFinalizeHelpers } from "./finalize"
import {
  appendExecutionPlanSentence,
  appendPermitCoordinationSentence,
  appendTradeCoordinationSentence,
  syncDescriptionLeadToDocumentType,
} from "./routePromptAdjacentDiagnostics"

const painting = "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats."
const contractorSupply = "Contractor will supply the main materials and fixtures listed in this scope."

function promptArgs(scopeText: string): DescriptionPolishInput {
  return {
    description: "This Estimate includes painting and coordination with plumbing and drywall trades.",
    documentType: "Estimate",
    documentPurpose: "Estimate",
    trade: "general_renovation",
    scopeText,
    scopeFacts: buildEstimatorScopeFacts(scopeText),
  }
}

function readFacts(prompt: string) {
  const json = prompt.split("EXISTING SCOPE FACTS:\n")[1].split("\n\nGENERATED DRAFT TO EDIT")[0]
  return JSON.parse(json) as {
    includedWork: string
    includedTrades: string[]
    boundaries: string
    excludedTrades: string[]
    explicitCoordinationClauses: string[]
    materialResponsibilityClauses: string[]
    patchTextureIncluded: boolean
  }
}

test("initial and supplier-revised painting scope ground polishing in written facts, not draft coordination", () => {
  for (const scopeText of [painting, `${painting} ${contractorSupply}`]) {
    const prompt = buildDescriptionPolishPrompt(promptArgs(scopeText))
    const facts = readFacts(prompt)
    assert.ok(facts.includedTrades.includes("painting"))
    assert.ok(!facts.includedTrades.includes("plumbing"))
    assert.ok(!facts.includedTrades.includes("electrical"))
    assert.equal(facts.patchTextureIncluded, true)
    assert.deepEqual(facts.explicitCoordinationClauses, [])
    assert.ok(prompt.includes(`AUTHORITATIVE WRITTEN SCOPE:\n${scopeText}`))
    assert.match(prompt, /omit unsupported work or trade-coordination commitments/)
    assert.match(prompt, /drying between coats are sequencing of included work/)
    assert.match(prompt, /does not establish plumbing, electrical work, fixture installation/)
    assert.match(prompt, /explicitly selected Estimate/)
  }
})

test("supplier variants preserve procurement responsibility without granting installation or coordination", () => {
  for (const supply of [
    contractorSupply,
    "Contractor-supplied paint and materials.",
    "Owner will supply the main materials and fixtures listed in this scope.",
    "Owner-supplied paint and fixtures.",
  ]) {
    const prompt = buildDescriptionPolishPrompt(promptArgs(`${painting} ${supply}`))
    const facts = readFacts(prompt)
    assert.equal(facts.materialResponsibilityClauses.length, 1)
    assert.match(facts.materialResponsibilityClauses[0], /suppl/)
    assert.deepEqual(facts.explicitCoordinationClauses, [])
    assert.ok(!facts.includedTrades.includes("plumbing"))
    assert.ok(!facts.includedTrades.includes("electrical"))
    assert.match(prompt, /preserve exclusions, by-others boundaries, material responsibilities, and uncertainty/i)
  }
})

test("polish context retains genuine water-supply/electrical work, by-others boundaries, and explicit coordination", () => {
  const scopeText = "Replace water-supply lines and install electrical outlets. Painting by others. Coordinate plumbing shutdown with the owner. Owner-supplied fixtures."
  const prompt = buildDescriptionPolishPrompt(promptArgs(scopeText))
  const facts = readFacts(prompt)
  assert.ok(facts.includedTrades.includes("plumbing"))
  assert.ok(facts.includedTrades.includes("electrical"))
  assert.ok(!facts.includedTrades.includes("painting"))
  assert.match(facts.boundaries, /painting by others/)
  assert.ok(facts.explicitCoordinationClauses.some((clause) => clause.includes("coordinate plumbing shutdown")))
  assert.match(prompt, /Preserve genuine included plumbing\/electrical work and explicit coordination boundaries/)
})

test("real finalizer passes authoritative raw facts through to a mocked description-polishing transport", async () => {
  const scopeText = `${painting} ${contractorSupply} Plumbing and electrical work by others.`
  const scopeFacts = buildEstimatorScopeFacts(scopeText)
  let polishCalls = 0
  const helpers: DescriptionFinalizeHelpers = {
    syncDescriptionLeadToDocumentType,
    appendExecutionPlanSentence,
    appendTradeCoordinationSentence,
    appendPermitCoordinationSentence,
    polishDescriptionWith4o: async (input) => {
      polishCalls += 1
      assert.strictEqual(input.scopeFacts, scopeFacts)
      assert.equal(input.scopeText, `${scopeText}\nGenerated planning annotation: coordinate all trades.`)
      const prompt = buildDescriptionPolishPrompt({ ...input, documentPurpose: "Estimate" })
      const authoritative = prompt.split("AUTHORITATIVE WRITTEN SCOPE:\n")[1].split("\n\nEXISTING SCOPE FACTS:")[0]
      assert.equal(authoritative, scopeText)
      assert.ok(!authoritative.includes("Generated planning annotation"))
      const facts = readFacts(prompt)
      assert.match(facts.boundaries, /plumbing and electrical work by others/)
      assert.equal(facts.patchTextureIncluded, true)
      assert.deepEqual(facts.explicitCoordinationClauses, [])
      return "This Estimate covers bedroom walls and ceilings, hole patching and surface preparation, drying, and two paint coats. Contractor will supply the main materials and fixtures listed in this scope. Plumbing and electrical work by others."
    },
  }
  const result = await finalizeDescription({
    draft: {
      documentType: "Estimate",
      trade: "general_renovation",
      description: "This Estimate includes painting and coordination with plumbing and drywall trades.",
      pricing: { labor: 0, materials: 0, subs: 0, markup: 25, total: 0 },
    },
    trade: "general_renovation",
    scopeText: `${scopeText}\nGenerated planning annotation: coordinate all trades.`,
    scopeFacts,
    complexity: null,
    tradeStack: null,
    basis: null,
    workDaysPerWeek: 5,
    helpers,
  })
  assert.equal(polishCalls, 1)
  assert.match(result, /hole patching and surface preparation, drying, and two paint coats/)
  assert.match(result, /Plumbing and electrical work by others/)
  assert.match(result, /Contractor will supply the main materials and fixtures/)
  assert.doesNotMatch(result, /coordination with plumbing and drywall trades/)
})

test("polish prompt derives existing facts when not supplied and preserves intentional Change Order purpose", () => {
  const prompt = buildDescriptionPolishPrompt({
    ...promptArgs("Install a replacement sink. Electrical work excluded."),
    scopeFacts: null,
    documentType: "Change Order",
    documentPurpose: "Change Order",
  })
  const facts = readFacts(prompt)
  assert.ok(facts.includedTrades.includes("plumbing"))
  assert.match(facts.boundaries, /electrical work excluded/)
  assert.match(prompt, /"This Change Order"/)
  assert.match(prompt, /explicitly selected Change Order/)
  assert.doesNotMatch(prompt, /explicitly selected Estimate/)
})
