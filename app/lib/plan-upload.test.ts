import assert from "node:assert/strict"
import test from "node:test"

import {
  estimateSelectedPdfBytes,
  getPlanUploadPreflightIssue,
  MAX_DERIVED_PLAN_FILE_BYTES,
  MAX_PLAN_FILE_BYTES,
  MAX_SELECTED_PAGE_EXPORT_COUNT,
} from "./plan-upload"

test("selected-page export estimates smaller transport bytes than the original pdf", () => {
  const estimated = estimateSelectedPdfBytes({
    originalBytes: 24 * 1024 * 1024,
    selectedPages: 8,
    totalPages: 40,
  })

  assert(estimated > 0)
  assert(estimated < 24 * 1024 * 1024)
})

test("preflight blocks when no plan pages are selected", () => {
  const issue = getPlanUploadPreflightIssue({
    name: "hotel-set.pdf",
    sourceKind: "pdf",
    originalBytes: 12 * 1024 * 1024,
    totalPages: 30,
    selectedPages: 0,
  })

  assert.match(String(issue || ""), /No pages selected/i)
})

test("preflight gives clear recovery guidance when selected-page export is still too large", () => {
  const issue = getPlanUploadPreflightIssue({
    name: "large-hotel-set.pdf",
    sourceKind: "pdf",
    originalBytes: Math.max(MAX_PLAN_FILE_BYTES - 1, MAX_DERIVED_PLAN_FILE_BYTES + 1),
    totalPages: MAX_SELECTED_PAGE_EXPORT_COUNT,
    selectedPages: MAX_SELECTED_PAGE_EXPORT_COUNT,
  })

  assert.match(String(issue || ""), /still too large after selected-page reduction/i)
  assert.match(String(issue || ""), /Reduce selected pages further or split the PDF/i)
})
