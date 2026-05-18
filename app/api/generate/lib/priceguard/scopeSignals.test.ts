import test from "node:test"
import assert from "node:assert/strict"

import { detectScopeSignals } from "./scopeSignals"

test("excluded drywall repair does not trigger return visit signal", () => {
  assert.deepEqual(
    detectScopeSignals(
      "Paint walls only. Excludes drywall repair, skim coat, and texture matching."
    ),
    { needsReturnVisit: false }
  )
})

test("by-others drywall patching does not trigger return visit signal", () => {
  assert.deepEqual(
    detectScopeSignals(
      "Electrical rough-in for vanity lights. Drywall patching and painting by others."
    ),
    { needsReturnVisit: false }
  )
})

test("true patch drywall and paint still triggers return visit signal", () => {
  assert.deepEqual(
    detectScopeSignals("Patch drywall access holes, prime repairs, and paint walls."),
    {
      needsReturnVisit: true,
      reason: "Dry time required before finishing work",
    }
  )
})

test("true skim coat and texture repair still trigger return visit signal", () => {
  assert.deepEqual(
    detectScopeSignals("Skim coat damaged wall and perform texture repair before repainting."),
    {
      needsReturnVisit: true,
      reason: "Dry time required before finishing work",
    }
  )
})
