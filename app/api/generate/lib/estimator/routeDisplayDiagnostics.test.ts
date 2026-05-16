import test from "node:test"
import assert from "node:assert/strict"

import {
  buildRouteDisplayScopeFacts,
  filterMaterialConfirmItems,
  flooringTransitionTrimConfirmation,
  shouldAddAreaDemoDriver,
  shouldAddAreaSurfacePrepDriver,
  shouldAddAreaTrimMaterialDriver,
  shouldAddCombinedMaterialsNote,
  shouldConfirmInteriorTrimFootage,
  shouldConfirmPatchTextureExtent,
} from "./routeDisplayDiagnostics"

function facts(scope: string) {
  return buildRouteDisplayScopeFacts(scope)
}

test("painting exclusions do not create patch texture trim or demo diagnostics", () => {
  const scopeFacts = facts(
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."
  )

  assert.equal(shouldConfirmPatchTextureExtent(scopeFacts), false)
  assert.equal(
    shouldConfirmInteriorTrimFootage({
      facts: scopeFacts,
      splitScopes: [{ trade: "painting", scope: "Paint walls only in living room and hallway" }],
      isExteriorPainting: false,
    }),
    false
  )
  assert.equal(shouldAddAreaDemoDriver(scopeFacts), false)
  assert.equal(shouldAddAreaSurfacePrepDriver(scopeFacts), false)
  assert.equal(
    shouldAddAreaTrimMaterialDriver({ facts: scopeFacts, isExteriorPainting: false }),
    false
  )
})

test("true patch-and-paint still creates patch texture confirmation", () => {
  const scopeFacts = facts("Patch drywall access holes, prime repairs, and paint walls.")

  assert.equal(shouldConfirmPatchTextureExtent(scopeFacts), true)
  assert.equal(shouldAddAreaSurfacePrepDriver(scopeFacts), true)
})

test("bathroom tile trim does not create baseboard trim footage confirmation", () => {
  const scopeFacts = facts(
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures. Include demo, cement board/backer, membrane, cleanup, protection, and customer approval."
  )

  assert.equal(scopeFacts.tileTrimContext, true)
  assert.equal(
    shouldConfirmInteriorTrimFootage({
      facts: scopeFacts,
      splitScopes: [
        { trade: "tile", scope: "Waterproof shower walls, install tile, grout, and trim" },
      ],
      isExteriorPainting: false,
    }),
    false
  )
  assert.equal(
    shouldAddAreaTrimMaterialDriver({ facts: scopeFacts, isExteriorPainting: false }),
    false
  )
})

test("wallcovering-only general renovation does not create bathroom demo or rough-in route noise", () => {
  const scopeFacts = facts(
    "Install wallcovering in lobby walls with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering. Include layout, pattern match, adhesive, cleanup, protection, and customer approval."
  )

  assert.equal(scopeFacts.wallcoveringPrepContext, true)
  assert.equal(shouldAddAreaDemoDriver(scopeFacts), false)
  assert.equal(shouldConfirmPatchTextureExtent(scopeFacts), false)
  assert.deepEqual(scopeFacts.includedTrades, ["wallcovering"])
})

test("baseboard replacement removal does not create unrelated demo driver", () => {
  const scopeFacts = facts(
    "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain. Include caulk/fill prep for painter, cleanup, and customer approval."
  )

  assert.equal(scopeFacts.baseboardReplacementRemovalContext, true)
  assert.equal(shouldAddAreaDemoDriver(scopeFacts), false)
  assert.equal(
    shouldConfirmInteriorTrimFootage({
      facts: scopeFacts,
      splitScopes: [{ trade: "carpentry", scope: "Replace 120 LF of baseboards in hallway" }],
      isExteriorPainting: false,
    }),
    false
  )
})

test("true mixed renovation still produces mixed diagnostic support", () => {
  const scopeFacts = facts(
    "Demo bathroom finishes, rough-in electrical and plumbing, install shower tile, flooring, baseboards, and paint walls."
  )

  assert.equal(scopeFacts.trueMixedTrades, true)
  assert.equal(shouldAddAreaDemoDriver(scopeFacts), true)
  assert.equal(
    shouldConfirmInteriorTrimFootage({
      facts: scopeFacts,
      splitScopes: [{ trade: "carpentry", scope: "install baseboards" }],
      isExteriorPainting: false,
    }),
    true
  )
})

test("materials confirmations suppress patch primer notes when patch texture is excluded", () => {
  const scopeFacts = facts(
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."
  )

  assert.deepEqual(
    filterMaterialConfirmItems(["Primer / sealer after patching"], scopeFacts),
    []
  )
})

test("materials confirmations preserve true patch-and-paint primer confirmation", () => {
  const scopeFacts = facts("Patch drywall access holes, prime repairs, and paint walls.")

  assert.deepEqual(
    filterMaterialConfirmItems(["Primer / sealer after patching"], scopeFacts),
    ["Primer / sealer after patching"]
  )
})

test("materials confirmations suppress plumbing fixture prompts for by-others owner-supplied bathroom tile scope", () => {
  const scopeFacts = facts(
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures."
  )

  assert.deepEqual(
    filterMaterialConfirmItems(
      [
        "Confirm valve / drain / plumbing relocation scope.",
        "Confirm fixture finish level before buying.",
      ],
      scopeFacts
    ),
    []
  )
})

test("materials confirmations suppress flooring prompts for protection-only flooring context", () => {
  const scopeFacts = facts(
    "Paint walls in bedroom. Flooring protection only. Existing flooring to remain."
  )

  assert.deepEqual(
    filterMaterialConfirmItems(["Confirm flooring material selection."], scopeFacts),
    []
  )
})

test("flooring transition confirmation drops trim footage when baseboards are existing to remain", () => {
  const scopeFacts = facts(
    "Remove existing carpet and install owner-supplied LVP with underlayment and transitions. Existing baseboards to remain."
  )

  assert.equal(flooringTransitionTrimConfirmation(scopeFacts), "Confirm exact transition count.")
})

test("owner-supplied fixtures remain boundary context unless install work is included", () => {
  const ownerSuppliedOnly = facts("Owner-supplied light fixtures.")
  const includedInstall = facts("Install 4 light fixtures. Owner-supplied fixtures.")

  assert.deepEqual(
    filterMaterialConfirmItems(["Confirm fixture finish level before buying."], ownerSuppliedOnly),
    []
  )
  assert.deepEqual(
    filterMaterialConfirmItems(["Confirm fixture finish level before buying."], includedInstall),
    ["Confirm fixture finish level before buying."]
  )
})

test("materials mixed note follows true mixed facts instead of noisy split scopes", () => {
  const boundaryOnly = facts("Paint walls. Flooring protection only.")
  const trueMixed = facts("Paint walls and install LVP flooring with transitions.")

  assert.equal(
    shouldAddCombinedMaterialsNote({
      facts: boundaryOnly,
      splitScopes: [
        { trade: "painting", scope: "Paint walls" },
        { trade: "flooring", scope: "Flooring protection only" },
      ],
    }),
    false
  )
  assert.equal(
    shouldAddCombinedMaterialsNote({
      facts: trueMixed,
      splitScopes: [
        { trade: "painting", scope: "Paint walls" },
        { trade: "flooring", scope: "install LVP flooring with transitions" },
      ],
    }),
    true
  )
})

test("materials confirmations preserve true plumbing and electrical fixture install prompts", () => {
  const plumbing = facts("Install 2 faucets and reconnect drains.")
  const electrical = facts("Electrical rough-in for 4 vanity lights and 2 GFCI outlets.")

  assert.deepEqual(
    filterMaterialConfirmItems(["Confirm valve / drain / plumbing relocation scope."], plumbing),
    ["Confirm valve / drain / plumbing relocation scope."]
  )
  assert.deepEqual(
    filterMaterialConfirmItems(["Confirm fixture finish level before buying."], electrical),
    ["Confirm fixture finish level before buying."]
  )
})
