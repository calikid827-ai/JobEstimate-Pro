import test from "node:test"
import assert from "node:assert/strict"

import { buildEstimatorScopeFacts } from "./estimator-scope-facts"

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
