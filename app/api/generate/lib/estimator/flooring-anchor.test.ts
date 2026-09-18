import assert from "node:assert/strict"
import test from "node:test"

import { priceFlooringOnlyAnchor, type FlooringAnchorInput } from "./flooring-anchor"
import { decidePricingOwner } from "./pricingOwner"
import { resolvePricingFromOwner } from "./finalize"
import { splitScopeByTrade } from "../priceguard/scopeSplitter"
import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import type { AIResponse, Pricing, PricingOwnerContext } from "./types"

const representativeScope =
  "Repaint bedroom walls and replace bedroom carpet with LVT. Owner supplies the LVT. Contractor supplies paint. Ceilings, electrical work, and plumbing excluded. Room dimensions have not been measured."

function input(scope: string, overrides: Partial<FlooringAnchorInput> = {}): FlooringAnchorInput {
  return {
    scope,
    // The UI's general_renovation selection is transmitted using this API value.
    trade: "general renovation",
    stateMultiplier: 1.2,
    measurements: null,
    ...overrides,
  }
}

function resolveFromScope(args: FlooringAnchorInput) {
  // Build the real production fallback, not a hand-built anchor or copied calculation.
  const anchorPricing = priceFlooringOnlyAnchor(args)
  const ownerContext: PricingOwnerContext = {
    trade: args.trade,
    effectivePaintScope: null,
    useBigJobPricing: false,
    anchorHit: anchorPricing ? { id: "flooring_only_v1", pricing: anchorPricing } : null,
    multiTradeDet: null,
    paintingDet: null,
    wallcoveringDet: null,
    flooringDet: null,
    electricalDet: null,
    plumbingDet: null,
    drywallDet: null,
    mixedPaintPricing: null,
    doorPricing: null,
    bigJobPricing: null,
    photoPaintPricing: null,
  }
  // Controlled local draft: positive labor/materials include supported contractor work.
  // These amounts are test inputs, not a live AI output or a market-price assertion.
  const draft: AIResponse = {
    documentType: "Estimate",
    trade: args.trade,
    description: args.scope,
    pricing: { labor: 900, materials: 240, subs: 150, markup: 20, total: 1548 },
    estimateBasis: null,
  }
  const owner = decidePricingOwner(ownerContext)
  const resolved = resolvePricingFromOwner({
    ownerDecision: owner,
    aiDraft: draft,
    // The existing finalization seam accepts these local dependencies. All inputs
    // are valid numbers, so coercion/clamping is irrelevant to anchor eligibility.
    helpers: { coercePricing: (value) => value as Pricing, clampPricing: (value) => value },
  })
  return { anchorPricing, owner, resolved, draft }
}

test("exact mixed painting and owner LVT scope retains the non-anchor pricing path", () => {
  const args = input(representativeScope)
  const before = structuredClone(args)
  const { anchorPricing, owner, resolved, draft } = resolveFromScope(args)

  assert.equal(anchorPricing, null)
  assert.equal(owner.owner, "ai")
  assert.equal(owner.baselinePricing, null)
  assert.equal(resolved.pricingSource, "ai")
  assert.deepEqual(resolved.pricing, draft.pricing)
  assert.equal(resolved.priceGuardVerified, false)
  assert.deepEqual(args, before)
  assert.equal(args.measurements, null)
  const splits = splitScopeByTrade(args.scope)
  assert.ok(splits.some((item) => item.trade === "painting"))
  assert.ok(splits.some((item) => item.trade === "flooring"))
  const facts = buildEstimatorScopeFacts(args.scope)
  assert.ok(facts.materialResponsibilities.includes("owner_supplied"))
  assert.ok(facts.materialResponsibilities.includes("contractor_supplied"))
  assert.match(draft.description, /Owner supplies the LVT\. Contractor supplies paint\./)
  assert.match(draft.description, /Ceilings, electrical work, and plumbing excluded\./)
  assert.match(draft.description, /Room dimensions have not been measured\./)
})

test("clear contractor-furnished flooring without area does not get a guessed quantity", () => {
  assert.equal(priceFlooringOnlyAnchor(input("Install contractor-supplied LVP flooring in the bedroom.")), null)
})

test("room counts do not authorize floor square footage", () => {
  assert.equal(priceFlooringOnlyAnchor(input("Install contractor-supplied LVP flooring in 5 bedrooms.")), null)
})

test("measured replacement does not use removed carpet as the installed product", () => {
  assert.equal(priceFlooringOnlyAnchor(input(
    "Replace bedroom carpet with contractor-supplied LVT.",
    { measurements: { totalSqft: 240 } }
  )), null)
})

test("two supported product classes do not resolve replacement by keyword precedence", () => {
  assert.equal(priceFlooringOnlyAnchor(input(
    "Remove existing carpet and install contractor-supplied LVP flooring.",
    { measurements: { totalSqft: 240 } }
  )), null)
})

test("removed carpet cannot authorize an unspecified installation product or pricing floor", () => {
  const args = input("Remove 240 sqft of carpet for installation of new contractor-supplied flooring.")
  const before = structuredClone(args)
  const { anchorPricing, owner, resolved, draft } = resolveFromScope(args)

  assert.equal(anchorPricing, null)
  assert.equal(owner.owner, "ai")
  assert.equal(owner.baselinePricing, null)
  assert.equal(resolved.pricingSource, "ai")
  assert.equal(resolved.detSource, null)
  assert.deepEqual(resolved.pricing, draft.pricing)
  assert.ok(resolved.pricing.labor > 0)
  assert.ok(resolved.pricing.materials > 0)
  assert.deepEqual(args, before)
  assert.equal(args.measurements, null)
  assert.equal(draft.description, args.scope)
})

test("structured area cannot authorize the removed product as the installed product", () => {
  const { anchorPricing, owner, resolved, draft } = resolveFromScope(input(
    "Remove existing carpet for installation of new contractor-supplied flooring.",
    { measurements: { totalSqft: 240 } }
  ))

  assert.equal(anchorPricing, null)
  assert.equal(owner.baselinePricing, null)
  assert.deepEqual(resolved.pricing, draft.pricing)
})

test("reversed operation order does not make removed carpet an installation product", () => {
  for (const scope of [
    "Installation of new contractor-supplied flooring after removal of 240 sqft of carpet.",
    // Keep an explicit work verb so existing included-scope filtering cannot be
    // the sole reason this reversed-operation control declines.
    "Installation of new contractor-supplied flooring after we remove 240 sqft of carpet.",
  ]) {
    const { anchorPricing, owner, resolved, draft } = resolveFromScope(input(scope))
    assert.equal(anchorPricing, null, scope)
    assert.equal(owner.baselinePricing, null, scope)
    assert.deepEqual(resolved.pricing, draft.pricing, scope)
  }
})

test("measured owner-furnished flooring declines the purchase allowance without erasing other costs", () => {
  const { anchorPricing, owner, resolved, draft } = resolveFromScope(input(
    "Install LVP flooring. Owner-supplied LVP. Include contractor-supplied adhesive, protection, and installation.",
    { measurements: { totalSqft: 240 } }
  ))
  assert.equal(anchorPricing, null)
  assert.equal(owner.owner, "ai")
  assert.deepEqual(resolved.pricing, draft.pricing)
  assert.ok(resolved.pricing.materials > 0)
  assert.ok(resolved.pricing.labor > 0)
})

test("valid measured contractor-furnished LVP preserves existing arithmetic and merged protection", () => {
  const { anchorPricing, owner, resolved } = resolveFromScope(input(
    "Install contractor-supplied LVP flooring.",
    { measurements: { totalSqft: 240 } }
  ))
  assert.deepEqual(anchorPricing, { labor: 2040, materials: 1216, subs: 595, markup: 25, total: 4814 })
  assert.equal(owner.owner, "merged")
  assert.equal(resolved.pricingSource, "merged")
  assert.equal(resolved.detSource, "anchor:flooring_only_v1")
  assert.deepEqual(resolved.pricing, anchorPricing)
})

test("typed measured flooring area preserves the same contractor-furnished pricing", () => {
  assert.deepEqual(priceFlooringOnlyAnchor(input("Install 240 sqft of contractor-supplied LVP flooring.")),
    { labor: 2040, materials: 1216, subs: 595, markup: 25, total: 4814 })
})

test("comma-formatted typed floor area remains a supported measurement", () => {
  assert.deepEqual(priceFlooringOnlyAnchor(input("Install 1,200 sqft of contractor-supplied LVP flooring.")),
    { labor: 6936, materials: 5440, subs: 1143, markup: 25, total: 16899 })
})

test("existing measured flooring material rates remain unchanged", () => {
  const controls: Array<[string, Pricing]> = [
    ["laminate flooring", { labor: 2040, materials: 1072, subs: 587, markup: 25, total: 4624 }],
    ["carpet", { labor: 2285, materials: 1264, subs: 613, markup: 25, total: 5203 }],
    ["hardwood flooring", { labor: 3019, materials: 2104, subs: 707, markup: 25, total: 7288 }],
    ["tile floor", { labor: 3754, materials: 1720, subs: 728, markup: 25, total: 7753 }],
  ]
  for (const [product, expected] of controls) {
    assert.deepEqual(priceFlooringOnlyAnchor(input(`Install contractor-supplied ${product}.`, {
      measurements: { totalSqft: 240 },
    })), expected, product)
  }
})

test("same-product removal and installation retains supported demo costs", () => {
  assert.deepEqual(priceFlooringOnlyAnchor(input("Remove existing LVP flooring and install contractor-supplied LVP flooring.", {
    measurements: { totalSqft: 240 },
  })), { labor: 2774, materials: 1216, subs: 939, markup: 25, total: 6161 })
})

test("a photo hint and invalid measurement totals cannot replace floor measurements", () => {
  const scope = "Install contractor-supplied LVP flooring."
  const photoHint = { ...input(scope), photoFloorSqft: 240 }
  assert.equal(priceFlooringOnlyAnchor(photoHint), null)
  for (const totalSqft of [0, -1, NaN, Infinity]) {
    assert.equal(priceFlooringOnlyAnchor(input(scope, { measurements: { totalSqft } })), null)
  }
})

test("owner-furnished and customer-supplied finish flooring stay outside the purchase allowance", () => {
  for (const responsibility of ["Owner furnishes LVP", "Customer supplies LVP", "Owner-furnished LVP"]) {
    assert.equal(priceFlooringOnlyAnchor(input(`Install LVP flooring. ${responsibility}.`, {
      measurements: { totalSqft: 240 },
    })), null)
  }
})

test("painting area cannot authorize a flooring allowance", () => {
  assert.equal(priceFlooringOnlyAnchor(input("Repaint 240 sqft of bedroom walls and install contractor-supplied LVP flooring.")), null)
  assert.equal(priceFlooringOnlyAnchor(input(
    "Repaint bedroom walls and install contractor-supplied LVP flooring.",
    { measurements: { totalSqft: 240, rows: [{ label: "Bedroom walls", lengthFt: 30, heightFt: 8, qty: 1 }] } }
  )), null)
})

test("wall-labeled measurement rows cannot support even a flooring-only fallback", () => {
  assert.equal(priceFlooringOnlyAnchor(input(
    "Install contractor-supplied LVP flooring.",
    { measurements: { totalSqft: 240, rows: [{ label: "Walls", lengthFt: 30, heightFt: 8, qty: 1 }] } }
  )), null)
})

test("ambiguous replacement or unrecognized installed product declines the anchor", () => {
  for (const scope of [
    "Replace bedroom carpet. Contractor supplies materials.",
    "Remove existing carpet and install new flooring. Contractor supplies materials.",
    "Install contractor-supplied LVT flooring.",
    "Install contractor-supplied porcelain flooring.",
  ]) {
    assert.equal(priceFlooringOnlyAnchor(input(scope, { measurements: { totalSqft: 240 } })), null, scope)
  }
})

test("dedicated flooring trade retains its existing engine ownership", () => {
  assert.equal(priceFlooringOnlyAnchor(input("Install 240 sqft contractor-supplied LVP flooring.", { trade: "flooring" })), null)
})

test("explicitly excluded flooring cannot become an anchor", () => {
  assert.equal(priceFlooringOnlyAnchor(input("Repaint 240 sqft of walls. Install LVP flooring by others.")), null)
})
