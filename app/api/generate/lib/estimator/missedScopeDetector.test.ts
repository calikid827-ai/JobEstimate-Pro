import test from "node:test"
import assert from "node:assert/strict"

import { detectMissedScope } from "./missedScopeDetector"

function detect(scopeText: string) {
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
