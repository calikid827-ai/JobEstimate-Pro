import assert from "node:assert/strict"
import test from "node:test"

import {
  getGenerateExceptionMessage,
  readGenerateResponseErrorMessage,
} from "./generate-response"

test("generate-stage server error surfaces exact message to UI", async () => {
  const response = new Response(
    JSON.stringify({
      ok: false,
      code: "PLAN_SELECTION_METADATA_MISMATCH",
      message: "Selected-page metadata mismatch for \"hotel-set.pdf\". Re-upload the plan set and retry Generate.",
    }),
    {
      status: 400,
      headers: { "content-type": "application/json" },
    }
  )

  assert.equal(
    await readGenerateResponseErrorMessage(response),
    "Selected-page metadata mismatch for \"hotel-set.pdf\". Re-upload the plan set and retry Generate."
  )
})

test("generic generate fallback message is used only when no better server message exists", async () => {
  const response = new Response("", { status: 500 })

  assert.equal(await readGenerateResponseErrorMessage(response), "Error generating document.")
})

test("generate exception helper preserves thrown runtime details", () => {
  assert.equal(
    getGenerateExceptionMessage(new Error("Plan intelligence failed while reading staged upload.")),
    "Plan intelligence failed while reading staged upload."
  )
})
