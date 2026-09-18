import test from "node:test"
import assert from "node:assert/strict"

import { getIncludedScopeText, isMultiTradeScope, splitScopeByTrade, splitScopeByTradeForPricing } from "./scopeSplitter"
import { computePaintingDeterministic } from "./paintingEngine"
import { computeDrywallDeterministic } from "./drywallEngine"
import { decidePricingOwner } from "../estimator/pricingOwner"
import type { PricingOwnerContext } from "../estimator/types"

const tradesFor = (scope: string) => splitScopeByTrade(scope).map((chunk) => chunk.trade)
const includedFor = (scope: string) => getIncludedScopeText(scope)
const splitTextFor = (scope: string) => splitScopeByTrade(scope).map((chunk) => chunk.scope).join(" ")

test("coordinated paint and patch retain the shared wall boundary and bedroom location", () => {
  for (const [scope, count, order] of [
    ["Paint and patch walls only in 5 bedrooms.", "5 bedrooms", ["painting", "drywall"]],
    ["Patch and paint walls only in 5 bedrooms.", "5 bedrooms", ["drywall", "painting"]],
    ["Paint and patch walls only in 1 bedroom.", "1 bedroom", ["painting", "drywall"]],
    ["PAINT  and   PATCH walls only in 3 bedrooms.", "3 bedrooms", ["painting", "drywall"]],
  ] as const) {
    const before = scope
    const splits = splitScopeByTrade(scope)
    assert.deepEqual(splits.map((part) => part.trade), order)
    assert.equal(splits.find((part) => part.trade === "painting")?.scope.toLowerCase(), `paint walls only in ${count}`)
    assert.equal(splits.find((part) => part.trade === "drywall")?.scope.toLowerCase(), `patch walls only in ${count}`)
    assert.equal(scope, before)
    for (const part of splits) assert.deepEqual(Object.keys(part).sort(), ["scope", "signals", "trade"])
  }
})

test("existing painting engine distinguishes bare Paint from a descriptive singular-bedroom input", () => {
  const input = { stateMultiplier: 1.2, measurements: null, paintScope: "walls" as const }
  // Characterizes the hazard of a naive description-only fix, not a baseline
  // live estimate: the current engine already prices the restored wording.
  const bare = computePaintingDeterministic({ ...input, scopeText: "Paint" })
  const restored = computePaintingDeterministic({ ...input, scopeText: "Paint walls only in 1 bedroom" })
  assert.equal(bare.pricing, null)
  assert.equal(bare.okForDeterministic, false)
  assert.equal(restored.okForDeterministic, true)
  assert.equal(restored.signals.rooms, 1)
  assert.ok(restored.pricing && restored.pricing.labor > 0)
  const patch = computeDrywallDeterministic({ scopeText: "Patch 2 holes", stateMultiplier: 1.2, measurements: null })
  assert.equal(patch.okForDeterministic, true)
  assert.equal(patch.signals.patchCount, 2)
  assert.ok(patch.pricing && patch.pricing.labor > 0)
})

const paintingInput = { stateMultiplier: 1.2, measurements: null, paintScope: "walls" as const }

test("production pricing selection keeps newly shared bedroom context descriptive only", () => {
  for (const location of ["5 bedrooms", "1 bedroom", "3 bedrooms", "5 rooms"]) {
    const raw = `Paint and patch walls only in ${location}.`
    const descriptions = splitScopeByTrade(raw)
    const pricingScopes = splitScopeByTradeForPricing(raw)
    assert.equal(descriptions[0].scope, `Paint walls only in ${location}`)
    assert.equal(pricingScopes[0].scope, "Paint")
    assert.equal(pricingScopes[1].scope, `patch walls only in ${location}`)
    const painting = computePaintingDeterministic({ ...paintingInput, scopeText: pricingScopes[0].scope })
    const drywall = computeDrywallDeterministic({ ...paintingInput, scopeText: pricingScopes[1].scope })
    assert.equal(painting.pricing, null)
    assert.equal(painting.signals.rooms, null)
    assert.equal(painting.signals.sqft, null)
    assert.equal(drywall.pricing, null)
    assert.equal(drywall.signals.patchCount, null)
    assert.equal(drywall.signals.sqft, null)
    assert.equal(raw, `Paint and patch walls only in ${location}.`)
  }
})

test("reverse order retains the painting context that was already directly present", () => {
  const raw = "Patch and paint walls only in 1 bedroom."
  const descriptions = splitScopeByTrade(raw)
  const pricingScopes = splitScopeByTradeForPricing(raw)
  assert.equal(descriptions[0].scope, "Patch walls only in 1 bedroom")
  assert.equal(descriptions[1].scope, "paint walls only in 1 bedroom")
  assert.equal(pricingScopes[0].scope, "Patch")
  assert.equal(pricingScopes[1].scope, "paint walls only in 1 bedroom")
  const actual = computePaintingDeterministic({ ...paintingInput, scopeText: pricingScopes[1].scope })
  const existingDirect = computePaintingDeterministic({ ...paintingInput, scopeText: "paint walls only in 1 bedroom" })
  assert.equal(actual.okForDeterministic, true)
  assert.deepEqual(actual, existingDirect)
  assert.equal(computeDrywallDeterministic({ ...paintingInput, scopeText: pricingScopes[0].scope }).pricing, null)
})

test("independently quantified drywall cannot make inherited bedroom context authorize painting or combined ownership", () => {
  const raw = "Paint and patch walls only in 1 bedroom. Patch 2 holes."
  const descriptions = splitScopeByTrade(raw)
  const pricingScopes = splitScopeByTradeForPricing(raw)
  const painting = computePaintingDeterministic({ ...paintingInput, scopeText: pricingScopes[0].scope })
  const drywall = computeDrywallDeterministic({ ...paintingInput, scopeText: pricingScopes[1].scope })
  assert.equal(descriptions[0].scope, "Paint walls only in 1 bedroom")
  assert.equal(pricingScopes[0].scope, "Paint")
  assert.equal(painting.okForDeterministic, false)
  assert.equal(painting.pricing, null)
  assert.equal(drywall.okForDeterministic, true)
  assert.equal(drywall.signals.patchCount, 2)
  assert.ok(drywall.pricing && drywall.pricing.labor > 0)
  // Surrounding DTO follows the unchanged route's all-pieces-priced gate.
  // No route execution or copied pricing calculation is claimed by this check.
  const ctx: PricingOwnerContext = {
    trade: "general renovation", effectivePaintScope: "walls", useBigJobPricing: false,
    anchorHit: null, paintingDet: null, drywallDet: null, wallcoveringDet: null,
    flooringDet: null, electricalDet: null, plumbingDet: null, mixedPaintPricing: null,
    doorPricing: null, bigJobPricing: null, photoPaintPricing: null,
    multiTradeDet: {
      okForDeterministic: [painting, drywall].every((result) => result.okForDeterministic && result.pricing),
      okForVerified: false, pricing: drywall.pricing, estimateBasis: null, notes: [],
      perTrade: [{
        trade: "drywall", scope: descriptions[1].scope, pricing: drywall.pricing,
        laborRate: 70, crewDays: 1, source: "drywall_engine_v1", notes: [],
      }],
    },
  }
  const owner = decidePricingOwner(ctx)
  assert.equal(owner.owner, "ai")
  assert.equal(owner.baselinePricing, null)
  assert.deepEqual(ctx.multiTradeDet?.perTrade.map((part) => part.trade), ["drywall"])
})

test("direct room and measured painting support retain established engine results", () => {
  for (const directScope of ["Paint walls only in 1 bedroom", "Paint walls in 5 rooms", "Paint 400 sqft of walls"]) {
    const selected = splitScopeByTradeForPricing(`${directScope} and patch 2 holes.`)[0]
    assert.equal(selected.scope, directScope)
    const actual = computePaintingDeterministic({ ...paintingInput, scopeText: selected.scope })
    const direct = computePaintingDeterministic({ ...paintingInput, scopeText: directScope })
    assert.equal(actual.okForDeterministic, true)
    assert.ok(actual.pricing && actual.pricing.labor > 0 && actual.pricing.materials > 0)
    assert.deepEqual(actual, direct)
  }
  // Existing separately supplied measurements still accompany the same original
  // engine input; the selector neither discards nor invents their attribution.
  const selected = splitScopeByTradeForPricing("Paint and patch walls only in 1 bedroom.")[0]
  const measuredInput = { ...paintingInput, measurements: { totalSqft: 400 } }
  const measured = computePaintingDeterministic({ ...measuredInput, scopeText: selected.scope })
  assert.equal(measured.okForDeterministic, true)
  assert.deepEqual(measured, computePaintingDeterministic({ ...measuredInput, scopeText: "Paint" }))
})

test("a separate explicitly measured painting operation is not removed with inherited context", () => {
  const raw = "Paint and patch walls only in 1 bedroom. Paint 400 sqft of hallway walls."
  const pricing = splitScopeByTradeForPricing(raw).find((part) => part.trade === "painting")!
  assert.equal(pricing.scope, "Paint, Paint 400 sqft of hallway walls")
  const result = computePaintingDeterministic({ ...paintingInput, scopeText: pricing.scope })
  assert.equal(result.okForDeterministic, true)
  assert.equal(result.signals.sqft, 400)
  assert.equal(result.signals.rooms, null)
})

test("separate objects and locations never inherit one another", () => {
  for (const [raw, expected] of [
    ["Paint walls in 5 bedrooms and patch the bathroom ceiling.", ["Paint walls in 5 bedrooms", "patch the bathroom ceiling"]],
    ["Patch bedroom walls; paint hallway walls.", ["Patch bedroom walls", "paint hallway walls"]],
    ["Paint. Patch walls only in 5 bedrooms.", ["Paint", "Patch walls only in 5 bedrooms"]],
    ["Paint; patch walls only in 5 bedrooms.", ["Paint", "patch walls only in 5 bedrooms"]],
  ] as const) {
    assert.deepEqual(splitScopeByTrade(raw).map((part) => part.scope), expected)
    assert.deepEqual(splitScopeByTradeForPricing(raw), splitScopeByTrade(raw))
  }
})

test("shared context preserves exclusions and by-others boundaries without copying furnishing clauses", () => {
  const byOthers = "Paint walls only in 5 bedrooms. Patching by others."
  assert.deepEqual(tradesFor(byOthers), ["painting"])
  const raw = "Paint and patch walls only in 5 bedrooms. Ceilings excluded. Owner supplies paint."
  const split = splitScopeByTrade(raw)
  assert.equal(split[0].scope, "Paint walls only in 5 bedrooms, Owner supplies paint")
  assert.equal(split[1].scope, "patch walls only in 5 bedrooms")
  assert.doesNotMatch(splitTextFor(raw), /ceiling/i)
  for (const boundary of ["Paint and patch walls in 5 bedrooms by others.", "Scope does not include paint and patch walls in 5 bedrooms."]) {
    assert.deepEqual(splitScopeByTrade(boundary), [])
    assert.deepEqual(splitScopeByTradeForPricing(boundary), [])
  }
})

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

test("flooring carpet removal stays flooring context when LVP install is included", () => {
  const scope =
    "Remove existing carpet and install owner-supplied LVP in bedrooms 201 and 202 with underlayment and transitions. Existing baseboards to remain. Painting by others. Include floor protection, cleanup, and customer approval."

  const splitScopes = splitScopeByTrade(scope)

  assert.deepEqual(splitScopes.map((chunk) => chunk.trade), ["flooring"])
  assert.match(splitScopes[0]?.scope ?? "", /Remove existing carpet/i)
  assert.match(splitScopes[0]?.scope ?? "", /install owner-supplied LVP/i)
  assert.equal(isMultiTradeScope(scope), false)
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

test("bathroom tile trim stays tile context instead of carpentry", () => {
  const scope =
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures."

  const splitScopes = splitScopeByTrade(scope)

  assert.deepEqual(splitScopes.map((chunk) => chunk.trade), ["tile"])
  assert.match(splitScopes[0]?.scope ?? "", /trim/i)
  assert.equal(isMultiTradeScope(scope), false)
})

test("bathroom tile demo backer and membrane stay tile context", () => {
  const scope =
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include demo, cement board/backer, membrane, cleanup, protection, and customer approval."

  const splitScopes = splitScopeByTrade(scope)

  assert.deepEqual(splitScopes.map((chunk) => chunk.trade), ["tile"])
  assert.match(splitScopes[0]?.scope ?? "", /demo/i)
  assert.match(splitScopes[0]?.scope ?? "", /cement board\/backer/i)
  assert.match(splitScopes[0]?.scope ?? "", /membrane/i)
  assert.equal(isMultiTradeScope(scope), false)
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
