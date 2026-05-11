import test from "node:test"
import assert from "node:assert/strict"

import { buildPriceGuardReview } from "./priceguard-review"
import { checkScopeQuality } from "./scope-quality-check"

function warningsFor(scope: string, trade?: string) {
  return checkScopeQuality(scope, trade).warnings.join(" | ").toLowerCase()
}

test("strong painting scope avoids irrelevant missing-info warnings", () => {
  const result = checkScopeQuality(
    "Paint walls and ceilings in 3 bedrooms, patch nail holes, apply two coats, contractor supplied paint.",
    "painting"
  )

  assert.ok(result.score >= 85)
  assert.equal(result.warnings.length, 0)
})

test("weak painting scope asks for painting-specific details", () => {
  const warnings = warningsFor("Touch up paint as needed.", "painting")

  assert.match(warnings, /vague wording/)
  assert.match(warnings, /painting area/)
  assert.match(warnings, /painted surfaces/)
  assert.match(warnings, /prep/)
})

test("strong electrical scope avoids painting-specific warnings", () => {
  const result = checkScopeQuality(
    "Replace 8 outlets, 3 switches, and install 4 recessed lights. Include permit; patching excluded. Owner supplied fixtures and devices.",
    "electrical"
  )
  const warnings = result.warnings.join(" | ").toLowerCase()

  assert.ok(result.score >= 85)
  assert.doesNotMatch(warnings, /paint/)
  assert.doesNotMatch(warnings, /ceiling.*trim/)
})

test("weak electrical scope asks for true electrical support", () => {
  const warnings = warningsFor("Electrical coordination for renovation.", "electrical")

  assert.match(warnings, /device, fixture, circuit, panel, or rough-in counts/)
  assert.match(warnings, /devices, fixtures, wiring, circuits, panel work, or rough-in/)
  assert.match(warnings, /access conditions/)
  assert.doesNotMatch(warnings, /painted surfaces/)
})

test("strong plumbing scope avoids painting-specific warnings", () => {
  const result = checkScopeQuality(
    "Replace 1 toilet, 1 vanity faucet, and 1 shower valve trim. Owner supplied fixtures; wall repair excluded.",
    "plumbing"
  )
  const warnings = result.warnings.join(" | ").toLowerCase()

  assert.ok(result.score >= 85)
  assert.doesNotMatch(warnings, /paint/)
  assert.doesNotMatch(warnings, /ceiling.*trim/)
})

test("weak plumbing scope asks for plumbing-specific details", () => {
  const warnings = warningsFor("Plumbing updates in bathroom.", "plumbing")

  assert.match(warnings, /fixture count/)
  assert.match(warnings, /supply lines, drains, valves, or rough-in/)
  assert.match(warnings, /access conditions/)
  assert.doesNotMatch(warnings, /painted surfaces/)
})

test("strong flooring scope avoids painting-specific warnings", () => {
  const result = checkScopeQuality(
    "Install 650 sq ft LVP, remove carpet, include underlayment, transitions, and base shoe. Owner supplied flooring.",
    "flooring"
  )
  const warnings = result.warnings.join(" | ").toLowerCase()

  assert.ok(result.score >= 85)
  assert.doesNotMatch(warnings, /paint/)
  assert.doesNotMatch(warnings, /ceiling/)
})

test("weak drywall scope asks for drywall production details", () => {
  const warnings = warningsFor("Repair drywall.", "drywall")

  assert.match(warnings, /patch count/)
  assert.match(warnings, /wall, ceiling/)
  assert.match(warnings, /finish level/)
  assert.doesNotMatch(warnings, /painted surfaces/)
})

test("weak bathroom tile scope asks for tile, fixture, and exclusion boundaries", () => {
  const warnings = warningsFor("Bathroom remodel.", "bathroom_tile")

  assert.match(warnings, /bathroom or tile area/)
  assert.match(warnings, /demolition/)
  assert.match(warnings, /waterproofing/)
  assert.match(warnings, /fixture responsibility/)
  assert.match(warnings, /exclusions/)
})

test("weak general renovation scope asks for rooms, trades, finishes, and exclusions", () => {
  const warnings = warningsFor("ADA unit renovation per plans.", "general_renovation")

  assert.match(warnings, /affected rooms/)
  assert.match(warnings, /which trades/)
  assert.match(warnings, /finish selections/)
  assert.match(warnings, /exclusions/)
})

test("weak wallcovering scope asks for wallcovering-specific details", () => {
  const warnings = warningsFor("Install wallpaper.", "wallcovering")

  assert.match(warnings, /wallcovering wall area/)
  assert.match(warnings, /material type/)
  assert.match(warnings, /removal/)
  assert.match(warnings, /pattern\/repeat/)
  assert.doesNotMatch(warnings, /painted surfaces/)
})

test("PriceGuard can resolve trade-aware scope-quality warnings from generated review text", () => {
  const scopeQuality = checkScopeQuality("Install flooring.", "flooring")
  const review = buildPriceGuardReview({
    hasResult: true,
    scopeText: "Install flooring.",
    resultText:
      "Install 650 sq ft LVP flooring. Includes removal, subfloor prep review, transitions, owner supplied materials, cleanup, protection, exclusions, and customer approval.",
    pricing: {
      labor: 1200,
      materials: 700,
      subs: 0,
      markup: 20,
      total: 2300,
    },
    scopeQuality,
  })

  const scopeWarnings = (review?.scopeClarityWarnings || []).join(" | ")

  assert.doesNotMatch(scopeWarnings, /Confirm flooring square footage/)
  assert.doesNotMatch(scopeWarnings, /Confirm flooring product type/)
  assert.doesNotMatch(scopeWarnings, /Confirm removal/)
})
