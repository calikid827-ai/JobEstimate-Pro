import test from "node:test"
import assert from "node:assert/strict"

import { buildEstimatorScopeFacts, hasMaterialResponsibilityForTrade, isResolvedMaterialSupplyPrompt } from "./estimator-scope-facts"

test("only resolved supplier-only prompts are omitted from current actions", () => {
  const args = { scopeText: "Paint bedroom walls. Contractor will supply paint. Owner will supply fixtures.", selectedTrade: "general_renovation" }
  for (const message of [
    "Confirm who supplies the main materials and fixtures.",
    "Who will supply paint and standard painting materials?",
    "Who is responsible for supplying paint and materials?",
    "Confirm material supply responsibility.",
  ]) assert.equal(isResolvedMaterialSupplyPrompt(message, args), true, message)
  for (const message of [
    "Confirm who supplies the main materials and fixtures and confirm product selection.",
    "Confirm who supplies paint and delivery timing.",
    "Confirm who supplies paint. Confirm quantities before ordering.",
    "Confirm paint finish selection and material delivery timing.",
    "Confirm who supplies the specialty equipment.",
    "Confirm who supplies the scope.",
  ]) assert.equal(isResolvedMaterialSupplyPrompt(message, args), false, message)
  assert.equal(isResolvedMaterialSupplyPrompt("Confirm who supplies paint.", { ...args, scopeText: "Paint walls. Owner will supply fixtures." }), false)
  assert.equal(isResolvedMaterialSupplyPrompt("Confirm who supplies paint.", { ...args, scopeText: `${args.scopeText} Owner will supply paint.` }), false)
  assert.equal(isResolvedMaterialSupplyPrompt("Confirm who supplies fixtures.", { ...args, scopeText: "Paint walls. Contractor will supply paint." }), false)
})

test("explicit supply verbs retain supplier boundary facts", () => {
  for (const verb of ["will supply", "supplies", "will provide", "provides", "to provide"]) {
    for (const supplier of ["Contractor", "Owner", "Customer"]) {
      const facts = buildEstimatorScopeFacts(`Paint bedroom walls. ${supplier} ${verb} paint.`)
      assert.ok(facts.materialResponsibilities.some((responsibility) => responsibility === `${supplier.toLowerCase()}_supplied`))
      assert.equal(hasMaterialResponsibilityForTrade(facts, "painting"), true)
    }
  }
})

test("material answers apply to their subjects and preserve mixed responsibilities", () => {
  const facts = buildEstimatorScopeFacts("Paint bedroom walls and install light fixtures. Contractor will supply paint while owner will supply fixtures.")
  assert.equal(hasMaterialResponsibilityForTrade(facts, "painting"), true)
  assert.equal(hasMaterialResponsibilityForTrade(facts, "electrical"), true)
  assert.equal(hasMaterialResponsibilityForTrade(facts, "general_renovation"), true)
  const partial = buildEstimatorScopeFacts("Paint bedroom walls and install light fixtures. Owner will supply fixtures.")
  assert.equal(hasMaterialResponsibilityForTrade(partial, "painting"), false)
  assert.equal(hasMaterialResponsibilityForTrade(partial, "general_renovation"), false)
})

test("descriptive material scope resolves without promoting boundary or supplier clauses to work", () => {
  for (const scope of [
    "Add painting one extra bedroom, including walls and ceiling.",
    "Painting bedroom walls.",
  ]) {
    const facts = buildEstimatorScopeFacts(`${scope} Contractor will supply paint and standard painting materials.`)
    assert.deepEqual(facts.includedTrades, [])
    assert.equal(hasMaterialResponsibilityForTrade(facts, "general_renovation"), true)
  }
  for (const scope of [
    "", "Painting by others.", "Painting protection only.", "Coordinate painting only.",
    "Owner will supply fixtures.",
  ]) {
    const facts = buildEstimatorScopeFacts(`${scope} Contractor will supply paint and standard painting materials.`)
    assert.equal(hasMaterialResponsibilityForTrade(facts, "general_renovation"), false, scope)
  }
})

test("supplier words, negation, uncertainty and conflicting responsibility cannot answer supply", () => {
  for (const answer of [
    "Contractor.", "Owner.", "Contractor will supply labor.", "Contractor will not supply paint.",
    "Contractor may supply paint.", "Contractor will supply paint if selected.",
    "Contractor will supply paint?", "Contractor will supply paint. Owner will supply paint.",
    "Contractor will supply paint. Contractor will not supply paint.",
    "Contractor will supply paint. Paint is not supplied by contractor.",
    "No contractor-supplied paint.", "Contractor will supply paint. No contractor-supplied paint.",
    "Contractor will supply paint unless the owner supplies it.",
  ]) {
    const facts = buildEstimatorScopeFacts(`Paint bedroom walls. ${answer}`)
    assert.equal(hasMaterialResponsibilityForTrade(facts, "painting"), false, answer)
  }
  assert.equal(hasMaterialResponsibilityForTrade(buildEstimatorScopeFacts("Paint bedroom walls. Contractor will not supply paint. Owner will supply paint."), "painting"), true)
  assert.equal(hasMaterialResponsibilityForTrade(buildEstimatorScopeFacts("Paint bedroom walls. Paint will be supplied by owner."), "painting"), true)
})

test("subject-level denials do not establish a supplier, including passive and material-list forms", () => {
  for (const answer of [
    "Contractor will supply no paint.", "No paint will be supplied by contractor.",
    "Contractor provides none of the paint.", "None of the paint is provided by contractor.",
    "Contractor will supply not any paint.", "Contractor will supply zero paint.",
    "Contractor will supply neither paint nor primer.", "Neither paint nor primer is supplied by contractor.",
    "Contractor will supply primer and no paint.", "Contractor will supply no paint but primer.",
  ]) {
    const scopeText = `Paint bedroom walls. ${answer}`
    const facts = buildEstimatorScopeFacts(scopeText)
    assert.equal(hasMaterialResponsibilityForTrade(facts, "painting"), false, answer)
    assert.equal(isResolvedMaterialSupplyPrompt("Confirm who supplies paint.", { scopeText, selectedTrade: "painting" }), false, answer)
    assert.equal(hasMaterialResponsibilityForTrade(buildEstimatorScopeFacts(`${scopeText} Owner will supply paint.`), "painting"), true, `${answer} with an affirmative alternate supplier`)
  }
  const mixedScope = "Paint bedroom walls. Contractor will supply no paint but primer. Owner will supply paint."
  for (const material of ["paint", "primer"]) {
    assert.equal(isResolvedMaterialSupplyPrompt(`Confirm who supplies ${material}.`, { scopeText: mixedScope, selectedTrade: "painting" }), true)
  }
  assert.equal(hasMaterialResponsibilityForTrade(buildEstimatorScopeFacts("Paint walls. Contractor will supply paint. Contractor will supply no paint."), "painting"), false)
})

test("specific supplier prompts retain their material rather than borrowing another material in the trade", () => {
  const check = (scopeAnswer: string, material: string) => isResolvedMaterialSupplyPrompt(`Confirm who supplies ${material}.`, {
    scopeText: `Paint bedroom walls. ${scopeAnswer}`, selectedTrade: "painting",
  })
  assert.equal(check("Owner will supply primer.", "paint"), false)
  assert.equal(check("Owner will supply primer.", "primer"), true)
  assert.equal(check("Contractor will supply paint.", "primer"), false)
  assert.equal(check("Owner will supply primer.", "paint and primer"), false)
  assert.equal(check("Contractor will supply paint. Owner will supply primer.", "paint and primer"), true)
  assert.equal(check("Contractor will supply paint. Owner will supply primer. Contractor will supply primer.", "paint"), true)
  assert.equal(check("Contractor will supply paint. Owner will supply primer. Contractor will supply primer.", "primer"), false)
  assert.equal(hasMaterialResponsibilityForTrade(buildEstimatorScopeFacts("Paint bedroom walls. Contractor supplies paint. Owner supplies primer. Contractor supplies primer."), "painting"), false)
  assert.equal(check("", "paint"), false)
  for (const material of ["paint", "primer", "paint and primer"]) {
    assert.equal(check("Contractor will supply all materials listed in this scope.", material), true, material)
  }
  assert.equal(check("Contractor will supply all materials except paint.", "paint"), false)
  assert.equal(check("Contractor will supply all materials except paint.", "primer"), true)
  assert.equal(check("Contractor will supply all materials except paint. Owner will supply paint.", "paint and primer"), true)
  assert.equal(check("Contractor will supply paint but not primer.", "paint"), true)
  assert.equal(check("Contractor will supply paint but not primer.", "primer"), false)
  assert.equal(check("Contractor will supply paint, not primer.", "primer"), false)
  assert.equal(check("Contractor will supply paint (not primer).", "primer"), false)
  assert.equal(check("Contractor will supply all materials, except paint.", "paint"), false)
  assert.equal(check("Contractor will supply all materials, except paint, owner will supply paint.", "paint and primer"), true)
  assert.equal(check("Contractor will supply paint, owner will supply primer.", "paint and primer"), true)
  assert.equal(check("Contractor will supply all materials excluding paint and primer.", "paint and primer"), false)
  assert.equal(check("Contractor will supply paint. Owner will supply paint.", "paint"), false)
})

test("explicit room counts retain quantity/location support when dimensions appear before the room label", () => {
  for (const dimensions of ["10’x12’", "10'x12'", "10x12", "10′×12′"]) {
    const facts = buildEstimatorScopeFacts(`Paint 15 ${dimensions} bedrooms. Walls and ceilings. Two coats.`)
    assert.equal(facts.hasQuantityLocationSignal, true)
    assert.deepEqual(facts.includedTrades, ["painting"])
    assert.equal("measuredQuantities" in facts, false)
  }
  assert.equal(buildEstimatorScopeFacts("Paint bedrooms. Walls and ceilings.").hasQuantityLocationSignal, false)
})

function hasAll<T>(actual: T[], expected: T[]) {
  for (const item of expected) assert.ok(actual.includes(item), `expected ${String(item)} in ${actual.join(", ")}`)
}

test("Case 1 painting exclusions classify adjacent trades as boundary only", () => {
  const facts = buildEstimatorScopeFacts(
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."
  )

  assert.deepEqual(facts.includedTrades, ["painting"])
  hasAll(facts.excludedTrades, ["drywall", "carpentry", "painting", "electrical", "plumbing", "flooring"])
  assert.ok(facts.protectionTrades.includes("flooring"))
  assert.ok(facts.materialResponsibilities.includes("contractor_supplied"))
  assert.equal(facts.patchTextureIncluded, false)
  assert.equal(facts.patchTextureExcluded, true)
  assert.equal(facts.trueMixedTrades, false)
})

test("flooring protection from overspray and paint drips stays boundary only", () => {
  const facts = buildEstimatorScopeFacts(
    "Paint 3 bedrooms. Walls only. Protect floors from overspray and paint drips. Two coats."
  )

  assert.deepEqual(facts.includedTrades, ["painting"])
  assert.ok(facts.protectionTrades.includes("flooring"))
  assert.equal(facts.trueMixedTrades, false)
})

test("drywall substrate wording stays painting only", () => {
  const facts = buildEstimatorScopeFacts(
    "Paint 3 bedrooms. Walls only. Paint over standard drywall surfaces. Two coats."
  )

  assert.deepEqual(facts.includedTrades, ["painting"])
  assert.equal(facts.trueMixedTrades, false)
})

test("drywall existing-condition wording stays context only", () => {
  const contexts = [
    "Paint 3 bedrooms and install flooring. This scope assumes standard drywall walls and typical bedroom layouts, without extensive demolition or repair work.",
    "Paint 3 bedrooms and install flooring. This scope assumes standard drywall walls and ceilings, typical room dimensions, and no concealed damage requiring corrective work.",
  ]

  for (const scope of contexts) {
    const facts = buildEstimatorScopeFacts(scope)

    hasAll(facts.includedTrades, ["painting", "flooring"])
    assert.equal(facts.includedTrades.includes("drywall"), false, scope)
    assert.equal(facts.trueMixedTrades, true, scope)
  }
})

test("true patch and paint includes drywall and painting", () => {
  const facts = buildEstimatorScopeFacts("Patch drywall access holes, prime repairs, and paint walls.")

  hasAll(facts.includedTrades, ["drywall", "painting"])
  assert.equal(facts.patchTextureIncluded, true)
  assert.equal(facts.trueMixedTrades, true)
})

test("Case 4 electrical keeps vanity lights electrical and boundaries separate", () => {
  const facts = buildEstimatorScopeFacts(
    "Electrical rough-in for 4 vanity lights and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied light fixtures. Include permit/inspection coordination, access through open walls, cleanup, and customer approval."
  )

  assert.deepEqual(facts.includedTrades, ["electrical"])
  hasAll(facts.excludedTrades, ["drywall", "painting"])
  assert.ok(facts.materialResponsibilities.includes("owner_supplied"))
  assert.equal(facts.hasPermitResponsibility, true)
  assert.equal(facts.includedTrades.includes("plumbing"), false)
})

test("Case 6 bathroom tile keeps shower tile trim in tile context", () => {
  const facts = buildEstimatorScopeFacts(
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include demo, cement board/backer, membrane, cleanup, protection, and customer approval."
  )

  assert.deepEqual(facts.includedTrades, ["bathroom_tile"])
  assert.ok(facts.excludedTrades.includes("plumbing"))
  assert.ok(facts.excludedTrades.includes("glass"))
  assert.ok(facts.materialResponsibilities.includes("owner_supplied"))
  assert.equal(facts.tileTrimContext, true)
  assert.equal(facts.includedTrades.includes("flooring"), false)
})

test("Case 7 wallcovering keeps prep primer in wallcovering context", () => {
  const facts = buildEstimatorScopeFacts(
    "Install wallcovering in lobby walls with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering. Include layout, pattern match, adhesive, cleanup, protection, and customer approval."
  )

  assert.deepEqual(facts.includedTrades, ["wallcovering"])
  hasAll(facts.excludedTrades, ["painting", "electrical", "furniture_moving"])
  assert.ok(facts.materialResponsibilities.includes("owner_supplied"))
  assert.equal(facts.wallcoveringPrepContext, true)
  assert.equal(facts.includedTrades.includes("bathroom_tile"), false)
})

test("Case 8 carpentry keeps flooring protection and existing flooring as boundary context", () => {
  const facts = buildEstimatorScopeFacts(
    "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain. Include caulk/fill prep for painter, cleanup, and customer approval."
  )

  assert.deepEqual(facts.includedTrades, ["carpentry"])
  assert.ok(facts.excludedTrades.includes("painting"))
  assert.ok(facts.protectionTrades.includes("flooring"))
  assert.ok(facts.existingConditionTrades.includes("flooring"))
  assert.equal(facts.baseboardReplacementRemovalContext, true)
  assert.equal(facts.trueMixedTrades, false)
})

test("true mixed painting and LVP remains mixed", () => {
  const facts = buildEstimatorScopeFacts("Paint walls in living room and install LVP flooring with transitions.")

  hasAll(facts.includedTrades, ["painting", "flooring"])
  assert.equal(facts.trueMixedTrades, true)
})

test("outlet cover painting prep does not become electrical mixed scope", () => {
  const facts = buildEstimatorScopeFacts(
    "Paint 3 bedrooms. Walls only. Remove and reinstall outlet covers for painting only. Two coats."
  )

  assert.deepEqual(facts.includedTrades, ["painting"])
  assert.equal(facts.includedTrades.includes("electrical"), false)
  assert.equal(facts.trueMixedTrades, false)
})

test("true painting and outlet replacement remains mixed", () => {
  const facts = buildEstimatorScopeFacts("Paint 3 bedrooms and replace outlets.")

  hasAll(facts.includedTrades, ["painting", "electrical"])
  assert.equal(facts.trueMixedTrades, true)
})

test("boundary clauses cover by others excluded owner contractor protection coordination and existing", () => {
  const facts = buildEstimatorScopeFacts(
    "Electrical by others. Drywall repair excluded. Owner-supplied fixtures. Contractor-supplied paint. Protect flooring only. Coordinate with electrical trade only. Existing baseboards to remain."
  )

  hasAll(facts.excludedTrades, ["electrical", "drywall"])
  assert.ok(facts.materialResponsibilities.includes("owner_supplied"))
  assert.ok(facts.materialResponsibilities.includes("contractor_supplied"))
  assert.ok(facts.protectionTrades.includes("flooring"))
  assert.ok(facts.coordinationTrades.includes("electrical"))
  assert.ok(facts.existingConditionTrades.includes("carpentry"))
  assert.equal(facts.hasIncludedWork, false)
})

test("baseboard removal and demolition context is supported carpentry replacement context", () => {
  const facts = buildEstimatorScopeFacts(
    "Replace baseboards in hallway. Careful removal and disposal of existing baseboards before installation."
  )

  assert.ok(facts.includedTrades.includes("carpentry"))
  assert.equal(facts.baseboardReplacementRemovalContext, true)
})
