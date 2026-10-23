import assert from "node:assert/strict"
import test from "node:test"
import { detectTradeStack } from "./tradeStack"
import { inferPhaseVisitsFromSignals, appendTradeCoordinationSentence } from "./routePromptAdjacentDiagnostics"
import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"

const painting = "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats."
const stack = (scopeText: string, primaryTrade = "general renovation") => detectTradeStack({ scopeText, primaryTrade })

test("General Renovation infers painting; supplier responsibility does not change included trades", () => {
  for (const suffix of [
    "",
    " Contractor will supply the main materials and fixtures listed in this scope.",
    " Owner will supply the main materials and fixtures listed in this scope.",
    " Contractor-supplied materials and fixtures.",
    " Owner-provided fixtures and paint.",
  ]) {
    const result = stack(painting + suffix)
    assert.deepEqual(result.trades, ["painting"], suffix)
    assert.equal(result.isMultiTrade, false)
    assert.ok(result.activities.includes("surface preparation"))
  }
})

test("generic materials/fixtures responsibility cannot establish installation work", () => {
  for (const scope of [
    "Contractor will supply materials and fixtures.",
    "Owner will provide plumbing fixtures and electrical devices.",
    "Contractor-supplied sink, faucet, light fixtures and switches.",
    "Contractor will supply an electrical disconnect.",
    "Contractor will supply a sink disconnect.",
    "Contractor will supply electrical rough-in materials.",
    "Contractor will supply plumbing rough-in materials.",
    "Owner-supplied wall-mount light fixtures.",
    "Contractor will supply plumbing fixtures but not install them.",
    "Contractor will supply paint and texture.",
    "Contractor will supply paint and finish.",
  ]) assert.deepEqual(stack(scope).trades, [], scope)
})

test("actual plumbing including water-supply lines and actual electrical work remain included", () => {
  assert.deepEqual(stack("Replace water-supply lines and install a faucet.").trades, ["plumbing"])
  assert.deepEqual(stack("Install owner-supplied faucets.").trades, ["plumbing"])
  assert.deepEqual(stack("Connect water-supply lines to the faucet.").trades, ["plumbing"])
  assert.deepEqual(stack("Reconnect the sink drain.").trades, ["plumbing"])
  assert.deepEqual(stack("Install 4 outlets and run a new electrical circuit.").trades, ["electrical"])
  assert.deepEqual(stack("Install owner-supplied light fixtures.").trades, ["electrical"])
  assert.deepEqual(stack("Plumbing rough-in for new supply lines.").trades, ["plumbing"])
  assert.deepEqual(stack("Install 3 owner-supplied fixtures.", "electrical").trades, ["electrical"])
  assert.deepEqual(stack("Install 3 owner-supplied fixtures.", "plumbing").trades, ["plumbing"])
  for (const scope of ["Replace shower valve.", "Install a new shower drain.", "Install a tub faucet."]) {
    assert.deepEqual(stack(scope).trades, ["plumbing"], scope)
  }
  assert.deepEqual(stack("Electrical wiring and outlets.").trades, ["electrical"])
  assert.deepEqual(stack("Supply and install an electrical disconnect.").trades, ["electrical"])
  assert.deepEqual(stack("Disconnect the electrical service.").trades, ["electrical"])
  assert.deepEqual(stack("Reconnect existing sink faucet.").trades, ["plumbing"])
  assert.deepEqual(stack("Connect existing water-supply lines to the sink.").trades, ["plumbing"])
  assert.deepEqual(stack("Contractor will supply and install wall-mount light fixtures.").trades, ["electrical"])
  assert.deepEqual(stack("Install light fixtures.", "plumbing").trades, ["electrical"])
  assert.deepEqual(stack("Install plumbing fixtures.", "electrical").trades, ["plumbing"])
})

test("excluded, by-others, protected and coordination-only work do not become included trades", () => {
  for (const boundary of [
    "Plumbing and electrical work by others.",
    "Exclude plumbing and electrical work.",
    "No plumbing or electrical work.",
    "Do not reconnect plumbing or rewire electrical outlets.",
    "Coordinate with the plumbing and electrical trades.",
    "Protect existing plumbing fixtures and electrical outlets.",
  ]) assert.deepEqual(stack(`${painting} ${boundary}`).trades, ["painting"], boundary)
  assert.deepEqual(stack("Electrical work by others.", "electrical").trades, [])
  assert.deepEqual(stack("Owner will supply fixtures.", "electrical").trades, [])
  assert.deepEqual(stack("Drywall repairs excluded. Paint walls.").trades, ["painting"])
  assert.deepEqual(stack("Paint walls excluding trim. Install electrical outlets.").trades, ["electrical"])
  assert.deepEqual(stack("Exclude drywall, painting walls, and electrical wiring.").trades, [])
})

test("patch-and-paint keeps drying/preparation signals without an invented outside trade", () => {
  for (const scopeText of [painting, "Patch drywall holes, sand repairs, and paint walls."]) {
    const result = stack(scopeText)
    assert.deepEqual(result.trades, ["painting"])
    const phases = inferPhaseVisitsFromSignals({ scopeText, cp: null })
    assert.equal(phases.visits, 2)
    assert.ok(phases.phases.includes("patch/texture dry time before paint"))
    assert.equal(appendTradeCoordinationSentence("This Estimate covers painting.", result, buildEstimatorScopeFacts(scopeText)), "This Estimate covers painting.")
  }
  assert.deepEqual(stack("Paint walls. Repair drywall seams.").trades, ["painting"])
  assert.deepEqual(stack("Painting walls and ceilings.").trades, ["painting"])
  assert.deepEqual(stack("Paint floors.").trades, ["painting"])
})

test("substantive drywall work and genuinely mixed work retain trade recognition", () => {
  assert.deepEqual(stack("Install drywall sheets and paint walls.").trades, ["painting", "drywall"])
  const mixed = stack("Install water-supply lines. Install 4 electrical outlets. Paint walls.")
  assert.deepEqual(mixed.trades, ["painting", "plumbing", "electrical"])
  assert.equal(mixed.isMultiTrade, true)
  assert.deepEqual(stack("Install new wallcovering.").trades, ["wallcovering"])
  assert.deepEqual(stack("Install shower wall tile.").trades, ["tile"])
  assert.deepEqual(stack("Install hardwood flooring.").trades, ["flooring"])
  assert.deepEqual(stack("Refinish hardwood flooring.").trades, ["flooring"])
  assert.deepEqual(stack("Paint walls. Reconnect existing kitchen sink.").trades, ["painting", "plumbing"])
})
