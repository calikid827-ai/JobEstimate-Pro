import test from "node:test"
import assert from "node:assert/strict"

import { getIncludedScopeText, isMultiTradeScope, splitScopeByTrade } from "./scopeSplitter"

const tradesFor = (scope: string) => splitScopeByTrade(scope).map((chunk) => chunk.trade)

test("painting scope with adjacent exclusions stays painting-only", () => {
  const scope =
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."

  const splitScopes = splitScopeByTrade(scope)

  assert.deepEqual(splitScopes, [
    {
      trade: "painting",
      scope: "Paint walls only in living room and hallway. Two coats, contractor-supplied paint",
      signals: ["painting keywords"],
    },
  ])
  assert.equal(isMultiTradeScope(scope), false)

  const includedScope = getIncludedScopeText(scope)
  assert.doesNotMatch(includedScope, /\bfloor(?:ing)?\b/i)
  assert.doesNotMatch(includedScope, /\bdrywall|skim|texture|electrical|plumbing|carpentry\b/i)
})

test("true flooring scope still detects flooring", () => {
  const scope = "Install LVP with transitions."

  assert.deepEqual(tradesFor(scope), ["flooring"])
})

test("true mixed painting and flooring scope still detects multiple trades", () => {
  const scope = "Paint walls and install LVP flooring with transitions."

  assert.deepEqual(tradesFor(scope), ["painting", "flooring"])
  assert.equal(isMultiTradeScope(scope), true)
})

test("true drywall scope still detects drywall and texture work", () => {
  const scope = "Drywall repair, skim coat, and texture match included."

  assert.deepEqual(tradesFor(scope), ["drywall"])
})

test("true electrical rough-in scope still detects electrical", () => {
  assert.deepEqual(tradesFor("Electrical rough-in for vanity light."), ["electrical"])
})

test("true carpentry baseboard replacement still detects carpentry", () => {
  assert.deepEqual(tradesFor("Replace baseboards in hallway."), ["carpentry"])
})
