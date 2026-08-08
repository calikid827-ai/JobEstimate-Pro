import test from "node:test"
import assert from "node:assert/strict"

import {
  buildPlanEvidenceFingerprint,
  classifyPlanEvidenceFreshness,
  NO_PLAN_EVIDENCE_FINGERPRINT,
  requiresPlanEvidenceRegeneration,
  type SelectedPlanEvidence,
} from "./plan-intelligence-evidence"

type PlanOverrides = Partial<
  Omit<SelectedPlanEvidence, "selectedSourcePages">
> & {
  selectedSourcePages?: number[]
}

function makePlan(overrides: PlanOverrides = {}): SelectedPlanEvidence {
  return {
    planId: overrides.planId ?? "plan-1",
    name: overrides.name ?? "finish-set.pdf",
    mimeType: overrides.mimeType ?? "application/pdf",
    sourceKind: overrides.sourceKind ?? "pdf",
    fileSize: overrides.fileSize ?? 12_345,
    fileLastModified: overrides.fileLastModified ?? 1_700_000_000_000,
    sourcePageCount: overrides.sourcePageCount ?? 4,
    note: overrides.note ?? "Review finish schedule",
    selectedSourcePages: overrides.selectedSourcePages ?? [1, 3],
  }
}

test("fingerprints identical ordered logical plan evidence deterministically without mutation", () => {
  const evidence = [makePlan(), makePlan({ planId: "plan-2", name: "rcp.pdf" })]
  const before = JSON.parse(JSON.stringify(evidence))

  const first = buildPlanEvidenceFingerprint(evidence)
  const second = buildPlanEvidenceFingerprint(evidence)

  assert.equal(first, second)
  assert.match(String(first), /^plan-evidence:v1:2:\d+:[0-9a-f]{16}$/)
  assert.deepEqual(evidence, before)
})

test("plan request order is part of logical evidence identity", () => {
  const first = makePlan()
  const second = makePlan({ planId: "plan-2", name: "rcp.pdf" })

  assert.notEqual(
    buildPlanEvidenceFingerprint([first, second]),
    buildPlanEvidenceFingerprint([second, first])
  )
})

test("stable plan and file identity fields each contribute to the fingerprint", () => {
  const baseline = buildPlanEvidenceFingerprint([makePlan()])
  const variants: Array<[string, SelectedPlanEvidence]> = [
    ["plan ID", makePlan({ planId: "replacement-plan" })],
    ["name", makePlan({ name: "renamed.pdf" })],
    ["MIME type", makePlan({ mimeType: "image/png" })],
    ["source kind", makePlan({ sourceKind: "image" })],
    ["file size", makePlan({ fileSize: 54_321 })],
    ["last modified", makePlan({ fileLastModified: 1_800_000_000_000 })],
    ["source page count", makePlan({ sourcePageCount: 5 })],
    ["note", makePlan({ note: "Review reflected ceiling plan" })],
  ]

  for (const [label, variant] of variants) {
    assert.notEqual(buildPlanEvidenceFingerprint([variant]), baseline, label)
  }
})

test("selected page additions, removals, same-count swaps, and order changes are distinct", () => {
  const baseline = buildPlanEvidenceFingerprint([makePlan({ selectedSourcePages: [1, 2] })])
  const variants: Array<[string, number[]]> = [
    ["add", [1, 2, 3]],
    ["remove", [1]],
    ["same-count swap", [1, 3]],
    ["order", [2, 1]],
  ]

  for (const [label, selectedSourcePages] of variants) {
    assert.notEqual(
      buildPlanEvidenceFingerprint([makePlan({ selectedSourcePages })]),
      baseline,
      label
    )
  }
})

test("no plans and an invalid zero-page plan remain distinct", () => {
  assert.equal(
    buildPlanEvidenceFingerprint([]),
    NO_PLAN_EVIDENCE_FINGERPRINT
  )
  assert.equal(
    buildPlanEvidenceFingerprint([
      makePlan({ selectedSourcePages: [] }),
    ]),
    null
  )
})

test("transport-only fields cannot affect logical plan evidence identity", () => {
  const first = {
    ...makePlan(),
    bytes: 5_000,
    stagedUploadId: "stage-1",
    stagedSourcePageCount: 2,
    selectedPageUploadMode: "browser-derived-selected-pages",
    selectedPageUploadNote: "Browser-derived selected pages.",
  }
  const second = {
    ...makePlan(),
    bytes: 9_000,
    stagedUploadId: "stage-2",
    stagedSourcePageCount: 4,
    selectedPageUploadMode: "original-fallback",
    selectedPageUploadNote: "Original PDF fallback.",
  }

  assert.equal(
    buildPlanEvidenceFingerprint([first]),
    buildPlanEvidenceFingerprint([second])
  )
})

test("freshness distinguishes current, no-plan, and stale verified evidence", () => {
  const generated = buildPlanEvidenceFingerprint([makePlan()])
  const changed = buildPlanEvidenceFingerprint([
    makePlan({ selectedSourcePages: [1, 2] }),
  ])

  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: generated,
      currentEvidenceFingerprint: generated,
    }),
    "current"
  )
  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT,
      currentEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT,
    }),
    "no_plans"
  )
  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: generated,
      currentEvidenceFingerprint: changed,
    }),
    "stale"
  )
  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: generated,
      currentEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT,
    }),
    "stale"
  )
  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: NO_PLAN_EVIDENCE_FINGERPRINT,
      currentEvidenceFingerprint: generated,
    }),
    "stale"
  )
})

test("missing, invalid, or unsupported provenance is unverified", () => {
  const fingerprint = buildPlanEvidenceFingerprint([makePlan()])

  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: null,
      currentEvidenceFingerprint: fingerprint,
    }),
    "unverified"
  )
  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: fingerprint,
      currentEvidenceFingerprint: null,
    }),
    "unverified"
  )
  assert.equal(
    classifyPlanEvidenceFreshness({
      generatedEvidenceFingerprint: "plan-evidence:v0:legacy",
      currentEvidenceFingerprint: "plan-evidence:v0:legacy",
    }),
    "unverified"
  )
})

test("regeneration classification follows displayed result and current plan inputs", () => {
  const cases = [
    {
      label: "no displayed result",
      hasDisplayedResult: false,
      freshness: "stale" as const,
      hasCurrentPlanInputs: true,
      expected: false,
    },
    {
      label: "current",
      hasDisplayedResult: true,
      freshness: "current" as const,
      hasCurrentPlanInputs: true,
      expected: false,
    },
    {
      label: "no plans",
      hasDisplayedResult: true,
      freshness: "no_plans" as const,
      hasCurrentPlanInputs: false,
      expected: false,
    },
    {
      label: "stale",
      hasDisplayedResult: true,
      freshness: "stale" as const,
      hasCurrentPlanInputs: false,
      expected: true,
    },
    {
      label: "unverified with current plans",
      hasDisplayedResult: true,
      freshness: "unverified" as const,
      hasCurrentPlanInputs: true,
      expected: true,
    },
    {
      label: "unverified without current plans",
      hasDisplayedResult: true,
      freshness: "unverified" as const,
      hasCurrentPlanInputs: false,
      expected: false,
    },
  ]

  for (const item of cases) {
    assert.equal(
      requiresPlanEvidenceRegeneration(item),
      item.expected,
      item.label
    )
  }
})

test("a zero-selected-page current plan fails closed into regeneration", () => {
  const current = buildPlanEvidenceFingerprint([
    makePlan({ selectedSourcePages: [] }),
  ])
  const freshness = classifyPlanEvidenceFreshness({
    generatedEvidenceFingerprint: buildPlanEvidenceFingerprint([makePlan()]),
    currentEvidenceFingerprint: current,
  })

  assert.equal(current, null)
  assert.equal(freshness, "unverified")
  assert.equal(
    requiresPlanEvidenceRegeneration({
      hasDisplayedResult: true,
      freshness,
      hasCurrentPlanInputs: true,
    }),
    true
  )
})
