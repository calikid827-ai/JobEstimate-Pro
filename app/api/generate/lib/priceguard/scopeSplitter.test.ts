import test from "node:test"
import assert from "node:assert/strict"

import { getIncludedScopeText, isMultiTradeScope, splitScopeByTrade } from "./scopeSplitter"

const tradesFor = (scope: string) => splitScopeByTrade(scope).map((chunk) => chunk.trade)
const includedFor = (scope: string) => getIncludedScopeText(scope)
const splitTextFor = (scope: string) => splitScopeByTrade(scope).map((chunk) => chunk.scope).join(" ")

function assertNoTrades(scope: string, trades: RegExp) {
  assert.doesNotMatch(includedFor(scope), trades)
  assert.doesNotMatch(splitTextFor(scope), trades)
}

test("painting scope with adjacent exclusions stays painting-only", () => {
  const scope =
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."

  const splitScopes = splitScopeByTrade(scope)

  assert.deepEqual(splitScopes.map((chunk) => chunk.trade), ["painting"])
  assert.match(splitScopes[0]?.scope ?? "", /Paint walls only/i)
  assert.match(splitScopes[0]?.scope ?? "", /Two coats/i)
  assert.match(splitScopes[0]?.scope ?? "", /contractor-supplied paint/i)
  assert.equal(isMultiTradeScope(scope), false)

  assertNoTrades(scope, /\bfloor(?:ing)?\b/i)
  assertNoTrades(scope, /\bdrywall|skim|texture|electrical|plumbing|carpentry\b/i)
})

test("plumbing scope ignores adjacent by-others and protection clauses", () => {
  const scope =
    "Replace toilet and faucet. Electrical by others. Flooring protection only. Wall patching by others. Owner-supplied fixtures."

  assert.deepEqual(tradesFor(scope), ["plumbing"])
  assert.equal(isMultiTradeScope(scope), false)
  assert.match(includedFor(scope), /Replace toilet and faucet/i)
  assertNoTrades(scope, /\belectrical|flooring|wall patching|owner-supplied|fixtures\b/i)
})

test("electrical rough-in ignores drywall paint and owner-supplied boundaries", () => {
  const scope =
    "Electrical rough-in for vanity light. Drywall and paint by others. Owner-supplied fixture."

  assert.deepEqual(tradesFor(scope), ["electrical"])
  assert.equal(isMultiTradeScope(scope), false)
  assertNoTrades(scope, /\bdrywall|paint|owner-supplied|fixture\b/i)
})

test("flooring scope ignores existing baseboards painting by others and owner material boundary", () => {
  const scope =
    "Install LVP flooring with transitions. Existing baseboards to remain. Painting by others. Owner-supplied LVP."

  assert.deepEqual(tradesFor(scope), ["flooring"])
  assert.equal(isMultiTradeScope(scope), false)
  assertNoTrades(scope, /\bbaseboards|painting|owner-supplied\b/i)
})

test("owner-supplied material does not hide included installation work", () => {
  assert.deepEqual(
    tradesFor("Install owner-supplied LVP flooring with transitions."),
    ["flooring"]
  )
})

test("drywall patch scope ignores painting texture exclusion and adjacent trades by others", () => {
  const scope =
    "Drywall patch at access holes. Painting by others. Texture match excluded. Electrical and plumbing by others."

  assert.deepEqual(tradesFor(scope), ["drywall"])
  assert.equal(isMultiTradeScope(scope), false)
  assertNoTrades(scope, /\bpainting|texture match|electrical|plumbing\b/i)
})

test("bathroom tile scope ignores plumbing glass and owner-supplied fixture boundaries", () => {
  const scope =
    "Waterproof shower walls and install tile. Plumbing by others. Glass by others. Owner-supplied tile and fixtures."

  assert.deepEqual(tradesFor(scope), ["tile"])
  assert.equal(isMultiTradeScope(scope), false)
  assertNoTrades(scope, /\bplumbing|glass|owner-supplied|fixtures\b/i)
})

test("wallcovering scope keeps prep and primer while ignoring by-others trades", () => {
  const scope =
    "Install wallcovering with wall prep and primer included. Painting, electrical, and furniture moving by others."

  assert.deepEqual(tradesFor(scope), ["wallcovering"])
  assert.equal(isMultiTradeScope(scope), false)
  assert.match(includedFor(scope), /wall prep/i)
  assert.match(includedFor(scope), /primer included/i)
  assertNoTrades(scope, /\bpainting|electrical|furniture moving\b/i)
})

test("carpentry scope ignores painting by others and flooring protection only", () => {
  const scope =
    "Replace baseboards in hallway. Painting by others. Flooring protection only."

  assert.deepEqual(tradesFor(scope), ["carpentry"])
  assert.equal(isMultiTradeScope(scope), false)
  assertNoTrades(scope, /\bpainting|flooring protection|flooring only\b/i)
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

test("true mixed plumbing and electrical scope still detects multiple trades", () => {
  const scope = "Replace toilet and install new GFCI outlet."

  assert.deepEqual(tradesFor(scope), ["plumbing", "electrical"])
  assert.equal(isMultiTradeScope(scope), true)
})

test("true mixed drywall and painting scope still detects multiple trades", () => {
  const scope = "Drywall patch included, prime and paint walls."

  assert.deepEqual(tradesFor(scope), ["drywall", "painting"])
  assert.equal(isMultiTradeScope(scope), true)
})

test("true drywall scope still detects drywall and texture work", () => {
  const scope = "Drywall repair, skim coat, and texture match included."

  assert.deepEqual(tradesFor(scope), ["drywall"])
})

test("true electrical rough-in scope still detects electrical", () => {
  assert.deepEqual(tradesFor("Electrical rough-in for vanity light."), ["electrical"])
})

test("true plumbing rough-in and fixture replacement still detect plumbing", () => {
  assert.deepEqual(tradesFor("Plumbing rough-in for shower valve."), ["plumbing"])
  assert.deepEqual(tradesFor("Replace toilet and faucet."), ["plumbing"])
})

test("true carpentry baseboard replacement still detects carpentry", () => {
  assert.deepEqual(tradesFor("Replace baseboards in hallway."), ["carpentry"])
})

test("true tile and wallcovering scopes still detect included work", () => {
  assert.deepEqual(tradesFor("Install tile, waterproofing, and grout."), ["tile"])
  assert.deepEqual(
    tradesFor("Install wallcovering with wall prep and primer included."),
    ["wallcovering"]
  )
})
