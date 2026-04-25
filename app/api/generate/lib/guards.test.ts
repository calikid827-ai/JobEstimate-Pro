import assert from "node:assert/strict"
import test from "node:test"

import {
  GenerateSchema,
  normalizeGenerateServerError,
  validateSelectedPlanStageMetadata,
} from "./guards"
import {
  MAX_PLAN_FILE_BYTES,
  MAX_TOTAL_PLAN_FILE_BYTES,
} from "../../../lib/plan-upload"

const baseGeneratePayload = {
  email: "customer@example.com",
  requestId: "req_1",
  scopeChange: "Paint selected guest room walls and ceilings from the uploaded plan set.",
  trade: "painting",
  state: "",
  paintScope: "walls",
  measurements: null,
  photos: null,
  workDaysPerWeek: 5,
}

test("successful selected-page staged upload payload can continue into generate schema", () => {
  const parsed = GenerateSchema.safeParse({
    ...baseGeneratePayload,
    plans: [
      {
        uploadId: "plan_upload_1",
        stagedUploadId: "plan_stage_1",
        name: "large-hotel-set.pdf",
        transport: "staged",
        mimeType: "application/pdf",
        bytes: MAX_PLAN_FILE_BYTES + 1024,
        note: "",
        selectedSourcePages: [2, 4],
      },
    ],
  })

  assert.equal(parsed.success, true)
})

test("selected-page staged upload still respects combined generate byte limit", () => {
  const parsed = GenerateSchema.safeParse({
    ...baseGeneratePayload,
    plans: [
      {
        uploadId: "plan_upload_1",
        stagedUploadId: "plan_stage_1",
        name: "too-large.pdf",
        transport: "staged",
        mimeType: "application/pdf",
        bytes: MAX_TOTAL_PLAN_FILE_BYTES + 1,
        note: "",
        selectedSourcePages: [1],
      },
    ],
  })

  assert.equal(parsed.success, false)
})

test("selected-page metadata mismatch returns a specific generate-stage error", () => {
  assert.throws(
    () =>
      validateSelectedPlanStageMetadata({
        planName: "hotel-set.pdf",
        selectedSourcePages: [2, 4],
        sourcePageCount: 8,
        sourcePageNumberMap: [2, 5],
      }),
    /Selected-page metadata mismatch for "hotel-set\.pdf"/
  )
})

test("generate server error normalization preserves typed recovery messages", () => {
  const normalized = normalizeGenerateServerError({
    status: 400,
    code: "PLAN_SELECTION_METADATA_MISMATCH",
    message: "Selected-page metadata mismatch for \"hotel-set.pdf\". Re-upload the plan set and retry Generate.",
  })

  assert.deepEqual(normalized, {
    status: 400,
    code: "PLAN_SELECTION_METADATA_MISMATCH",
    message: "Selected-page metadata mismatch for \"hotel-set.pdf\". Re-upload the plan set and retry Generate.",
  })
})
