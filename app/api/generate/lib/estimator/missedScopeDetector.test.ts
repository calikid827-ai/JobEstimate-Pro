import test from "node:test"
import assert from "node:assert/strict"

import { detectMissedScope } from "./missedScopeDetector"

function detect(
  scopeText: string,
  overrides: Partial<Parameters<typeof detectMissedScope>[0]> = {}
) {
  return detectMissedScope({
    trade: "painting",
    scopeText,
    planIntelligence: null,
    photoScopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
    },
    complexityProfile: null,
    tradeStack: null,
    ...overrides,
  })
}

function labels(result: ReturnType<typeof detect>) {
  return [
    ...(result?.likelyMissingScope || []),
    ...(result?.recommendedConfirmations || []),
  ].map((item) => item.label)
}

test("excluded drywall repair texture wording does not create patch-and-paint primer confirmation", () => {
  const result = detect(
    "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry."
  )

  assert.deepEqual(labels(result), [])
})

test("true patch-and-paint still creates primer confirmation", () => {
  const result = detect("Patch drywall access holes and paint walls.")

  assert.match(labels(result).join(" "), /Primer \/ sealer after patching/)
})

test("bathroom tile by-others and tile trim boundary language does not create false confirmations", () => {
  const result = detect(
    "Waterproof shower walls and install tile, grout, and trim. Plumbing by others. Glass by others. Owner-supplied tile and fixtures.",
    { trade: "bathroom_tile" }
  )

  assert.deepEqual(labels(result), [])
})

test("wallcovering-only general renovation does not trigger remodel or patch diagnostics", () => {
  const result = detect(
    "Install wallcovering with wall prep and primer included. Painting, electrical, and furniture moving by others. Owner-supplied wallcovering.",
    { trade: "general_renovation" }
  )

  assert.deepEqual(labels(result), [])
})

test("baseboard replacement boundary language does not create flooring or painting missed-scope diagnostics", () => {
  const result = detect(
    "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain. Include caulk/fill prep for painter, cleanup, and customer approval.",
    { trade: "carpentry" }
  )

  assert.deepEqual(labels(result), [])
})

test("owner-supplied faucet does not count as included plumbing reconnect work", () => {
  const result = detect("Install new vanity. Owner-supplied faucet.", { trade: "plumbing" })

  assert.match(labels(result).join(" "), /Plumbing disconnect \/ reconnect/)
})

test("plumbing by others does not satisfy included plumbing reconnect checks", () => {
  const result = detect("Install new vanity. Plumbing by others.", { trade: "carpentry" })

  assert.match(labels(result).join(" "), /Plumbing disconnect \/ reconnect/)
})

test("true mixed renovation diagnostics remain when plan evidence implies omitted waterproofing", () => {
  const result = detect(
    "Bathroom remodel with shower work. Demo, electrical rough-in, plumbing rough-in, drywall, flooring, baseboards, and painting.",
    {
      trade: "general_renovation",
      planIntelligence: {
        detectedRooms: ["Bathroom"],
        notes: ["Shower wet area shown in plans"],
        summary: "Bathroom plan includes shower wet area.",
        scopeAssist: {
          missingScopeFlags: [],
          suggestedAdditions: [],
        },
        analyses: [],
      } as any,
      complexityProfile: {
        class: "remodel",
        hasDemo: true,
      } as any,
      tradeStack: {
        isMultiTrade: true,
      } as any,
    }
  )

  assert.match(labels(result).join(" "), /Waterproofing/)
})

test("true bathroom remodel diagnostics remain for plan drain evidence", () => {
  const result = detect(
    "Bathroom remodel. Waterproof shower walls, install tile, plumbing rough-in, flooring, baseboards, and painting.",
    {
      trade: "bathroom_tile",
      planIntelligence: {
        detectedRooms: ["Bathroom"],
        notes: ["Shower drain shown in plans"],
        summary: "Bathroom shower drain and wet area shown.",
        scopeAssist: {
          missingScopeFlags: [],
          suggestedAdditions: [],
        },
        analyses: [],
      } as any,
      complexityProfile: {
        class: "remodel",
      } as any,
    }
  )

  assert.match(labels(result).join(" "), /Shower pan \/ drain work/)
})
