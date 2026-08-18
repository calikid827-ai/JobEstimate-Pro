import test from "node:test"
import assert from "node:assert/strict"

import {
  buildPlanEvidenceFingerprint,
  NO_PLAN_EVIDENCE_FINGERPRINT,
  type PlanEvidenceFingerprint,
} from "./plan-intelligence-evidence"
import {
  normalizePlanScopeBoundarySemanticCandidates,
  transitionGeneratedPlanScopeCandidateContext,
  type GeneratedPlanScopeCandidateContext,
} from "./plan-scope-candidate-integration"

type RawRecord = Record<string, unknown>

function makeScheduleSource(overrides: RawRecord = {}) {
  return {
    uploadId: "plan-a",
    uploadName: "finish-plans.pdf",
    pageNumber: 2,
    sourcePageNumber: 3,
    sheetNumber: "A-601",
    sheetTitle: "Room Finish Schedule",
    sourceMatrixIndex: 0,
    sourceTableIndex: 1,
    rowIndex: 2,
    sourceColumnIndex: 4,
    sourceColumnLabel: "Ceiling Finish",
    surface: "ceiling",
    roomName: "Conference Room",
    roomNumber: "101",
    rawFinishValue: "Paint",
    rawRowText: "101 | Conference Room | CPT-1 | RB-1 | Paint",
    confidence: 96,
    warnings: [],
    ...overrides,
  }
}

function makeLegendSource(overrides: RawRecord = {}) {
  return {
    uploadId: "plan-a",
    uploadName: "finish-plans.pdf",
    pageNumber: 8,
    sourcePageNumber: 20,
    sheetNumber: "A-900",
    sheetTitle: "Finish Legend",
    sourceTableIndex: 3,
    rowIndex: 2,
    rawCode: "P-1",
    rawDefinition: "Paint",
    rawRowText: "P-1 | Paint",
    confidence: 94,
    warnings: [],
    ...overrides,
  }
}

function makeCandidate(overrides: RawRecord = {}) {
  return {
    id: "plan-scope:ceiling-paint:record-1",
    semanticRecordId: "plan-finish:record-1",
    trade: "painting",
    subjectKey: "ceilings",
    surface: "ceiling",
    rawFinishValue: "Paint",
    resolvedFinishCategory: "paint_coating",
    resolutionMethod: "explicit_schedule_value",
    semanticStatus: "resolved",
    scheduleSource: makeScheduleSource(),
    legendSources: [],
    confidence: 96,
    warnings: [],
    blockers: [],
    eligibleForFutureScopeReview: true,
    pricingAuthoritative: false,
    pricingEligibleNow: false,
    quantityAuthoritative: false,
    mutatesTypedScope: false,
    generatesEstimate: false,
    persistsState: false,
    ...overrides,
  }
}

function makeLegendCandidate(overrides: RawRecord = {}) {
  return makeCandidate({
    rawFinishValue: "P-1",
    resolutionMethod: "legend_code",
    scheduleSource: makeScheduleSource({ rawFinishValue: "P-1" }),
    legendSources: [makeLegendSource()],
    ...overrides,
  })
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function makePlanFingerprint(): PlanEvidenceFingerprint {
  const fingerprint = buildPlanEvidenceFingerprint([
    {
      planId: "plan-a",
      name: "finish-plans.pdf",
      mimeType: "application/pdf",
      sourceKind: "pdf",
      fileSize: 42_000,
      fileLastModified: 1_800_000_000_000,
      sourcePageCount: 20,
      note: "Review finish schedules",
      selectedSourcePages: [3, 20],
    },
  ])
  assert.ok(fingerprint)
  return fingerprint
}

test("accepts a direct ceiling-paint candidate and preserves its identity and provenance", () => {
  const rawCandidate = makeCandidate()
  const result = normalizePlanScopeBoundarySemanticCandidates([rawCandidate])

  assert.equal(result.length, 1)
  assert.equal(result[0].id, rawCandidate.id)
  assert.equal(result[0].semanticRecordId, rawCandidate.semanticRecordId)
  assert.equal(result[0].rawFinishValue, "Paint")
  assert.equal(result[0].resolutionMethod, "explicit_schedule_value")
  assert.deepEqual(result[0].scheduleSource, rawCandidate.scheduleSource)
  assert.deepEqual(result[0].legendSources, [])
  assert.notStrictEqual(result[0], rawCandidate)
  assert.notStrictEqual(result[0].scheduleSource, rawCandidate.scheduleSource)
  assert.notStrictEqual(result[0].legendSources, rawCandidate.legendSources)
  assert.notStrictEqual(result[0].warnings, rawCandidate.warnings)
  assert.notStrictEqual(result[0].blockers, rawCandidate.blockers)
})

test("accepts a same-upload legend candidate and freshly preserves every legend source", () => {
  const rawLegendSources = [
    makeLegendSource(),
    makeLegendSource({
      pageNumber: 9,
      sourcePageNumber: 21,
      sourceTableIndex: 4,
      rowIndex: 5,
    }),
  ]
  const rawCandidate = makeLegendCandidate({
    legendSources: rawLegendSources,
  })
  const result = normalizePlanScopeBoundarySemanticCandidates([rawCandidate])

  assert.equal(result.length, 1)
  assert.equal(result[0].resolutionMethod, "legend_code")
  assert.deepEqual(result[0].scheduleSource, rawCandidate.scheduleSource)
  assert.deepEqual(result[0].legendSources, rawLegendSources)
  assert.notStrictEqual(result[0].legendSources, rawLegendSources)
  assert.notStrictEqual(
    result[0].legendSources[0],
    rawLegendSources[0]
  )
  assert.notStrictEqual(
    result[0].legendSources[0].warnings,
    rawLegendSources[0].warnings
  )
})

test("normalizes missing and non-array candidate fields to an empty set", () => {
  for (const value of [undefined, null, "candidate", {}, 42]) {
    assert.deepEqual(normalizePlanScopeBoundarySemanticCandidates(value), [])
  }
})

test("rejects invalid candidate identity and semantic literals independently", () => {
  const cases: Array<[string, RawRecord]> = [
    ["blank id", { id: "  " }],
    ["blank semantic record id", { semanticRecordId: "" }],
    ["blank raw value", { rawFinishValue: "" }],
    ["wrong trade", { trade: "flooring" }],
    ["wrong subject", { subjectKey: "walls" }],
    ["wrong surface", { surface: "wall" }],
    ["wrong category", { resolvedFinishCategory: "wallcovering" }],
    ["wrong status", { semanticStatus: "blocked" }],
    ["unsupported method", { resolutionMethod: "inferred" }],
  ]

  for (const [label, overrides] of cases) {
    assert.deepEqual(
      normalizePlanScopeBoundarySemanticCandidates([
        makeCandidate(overrides),
      ]),
      [],
      label
    )
  }
})

test("requires every candidate authority invariant to retain its exact safe value", () => {
  const cases: Array<[string, RawRecord]> = [
    ["future review", { eligibleForFutureScopeReview: false }],
    ["pricing authority", { pricingAuthoritative: true }],
    ["pricing eligibility", { pricingEligibleNow: true }],
    ["quantity authority", { quantityAuthoritative: true }],
    ["scope mutation", { mutatesTypedScope: true }],
    ["estimate generation", { generatesEstimate: true }],
    ["persistence", { persistsState: true }],
  ]

  for (const [label, overrides] of cases) {
    assert.deepEqual(
      normalizePlanScopeBoundarySemanticCandidates([
        makeCandidate(overrides),
      ]),
      [],
      label
    )
  }
})

test("rejects candidate, schedule, and legend warnings or blockers", () => {
  const cases: Array<[string, ReturnType<typeof makeCandidate>]> = [
    ["candidate warning", makeCandidate({ warnings: ["Review"] })],
    ["candidate blocker", makeCandidate({ blockers: ["Blocked"] })],
    [
      "schedule warning",
      makeCandidate({
        scheduleSource: makeScheduleSource({ warnings: ["OCR warning"] }),
      }),
    ],
    [
      "legend warning",
      makeLegendCandidate({
        legendSources: [makeLegendSource({ warnings: ["OCR warning"] })],
      }),
    ],
  ]

  for (const [label, candidate] of cases) {
    assert.deepEqual(
      normalizePlanScopeBoundarySemanticCandidates([candidate]),
      [],
      label
    )
  }
})

test("rejects non-finite and out-of-range candidate confidence", () => {
  for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY, -1, 101]) {
    assert.deepEqual(
      normalizePlanScopeBoundarySemanticCandidates([
        makeCandidate({ confidence }),
      ]),
      [],
      String(confidence)
    )
  }
})

test("fails closed on malformed schedule provenance", () => {
  const cases: Array<[string, RawRecord]> = [
    ["blank upload id", { uploadId: "" }],
    ["blank upload name", { uploadName: " " }],
    ["invalid page", { pageNumber: 0 }],
    ["invalid source page", { sourcePageNumber: -1 }],
    ["negative matrix index", { sourceMatrixIndex: -1 }],
    ["negative table index", { sourceTableIndex: -1 }],
    ["invalid row", { rowIndex: 0 }],
    ["invalid column", { sourceColumnIndex: -1 }],
    ["blank column label", { sourceColumnLabel: "" }],
    ["wrong surface", { surface: "wall" }],
    ["blank raw value", { rawFinishValue: "" }],
    ["blank raw row", { rawRowText: "" }],
    ["invalid confidence", { confidence: 101 }],
    ["invalid sheet", { sheetNumber: 42 }],
    ["invalid room", { roomName: false }],
  ]

  for (const [label, overrides] of cases) {
    assert.deepEqual(
      normalizePlanScopeBoundarySemanticCandidates([
        makeCandidate({ scheduleSource: makeScheduleSource(overrides) }),
      ]),
      [],
      label
    )
  }

  assert.deepEqual(
    normalizePlanScopeBoundarySemanticCandidates([
      makeCandidate({
        scheduleSource: makeScheduleSource({ rawFinishValue: "P-1" }),
      }),
    ]),
    [],
    "candidate and schedule raw values must match"
  )
})

test("fails closed on malformed or cross-upload legend provenance", () => {
  const cases: Array<[string, RawRecord]> = [
    ["different upload", { uploadId: "plan-b" }],
    ["blank upload name", { uploadName: "" }],
    ["invalid page", { pageNumber: 0 }],
    ["invalid source page", { sourcePageNumber: 0 }],
    ["negative table index", { sourceTableIndex: -1 }],
    ["invalid row", { rowIndex: 0 }],
    ["blank code", { rawCode: "" }],
    ["blank definition", { rawDefinition: " " }],
    ["blank raw row", { rawRowText: "" }],
    ["invalid confidence", { confidence: Number.NEGATIVE_INFINITY }],
    ["invalid sheet", { sheetTitle: 10 }],
  ]

  for (const [label, overrides] of cases) {
    assert.deepEqual(
      normalizePlanScopeBoundarySemanticCandidates([
        makeLegendCandidate({
          legendSources: [makeLegendSource(overrides)],
        }),
      ]),
      [],
      label
    )
  }
})

test("enforces direct-versus-legend provenance rules", () => {
  assert.deepEqual(
    normalizePlanScopeBoundarySemanticCandidates([
      makeCandidate({ legendSources: [makeLegendSource()] }),
    ]),
    []
  )
  assert.deepEqual(
    normalizePlanScopeBoundarySemanticCandidates([
      makeLegendCandidate({ legendSources: [] }),
    ]),
    []
  )
  assert.deepEqual(
    normalizePlanScopeBoundarySemanticCandidates([
      makeLegendCandidate({ legendSources: [makeLegendSource(), null] }),
    ]),
    []
  )
})

test("drops malformed siblings while preserving valid server order and IDs", () => {
  const first = makeCandidate({ id: "candidate-a", semanticRecordId: "record-a" })
  const invalid = makeCandidate({ id: "candidate-b", trade: "drywall" })
  const third = makeLegendCandidate({
    id: "candidate-c",
    semanticRecordId: "record-c",
  })

  const result = normalizePlanScopeBoundarySemanticCandidates([
    first,
    invalid,
    third,
  ])

  assert.deepEqual(
    result.map((candidate) => [candidate.id, candidate.semanticRecordId]),
    [
      ["candidate-a", "record-a"],
      ["candidate-c", "record-c"],
    ]
  )
})

test("normalization is deterministic and does not mutate raw candidates", () => {
  const raw = [makeCandidate(), makeLegendCandidate({ id: "candidate-2" })]
  const before = clone(raw)

  const first = normalizePlanScopeBoundarySemanticCandidates(raw)
  const second = normalizePlanScopeBoundarySemanticCandidates(raw)

  assert.deepEqual(first, second)
  assert.deepEqual(raw, before)
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first[0], second[0])
  assert.notStrictEqual(first[0].scheduleSource, second[0].scheduleSource)
})

test("successful plan Generate binds normalized candidates to V1A fingerprint and trade", () => {
  const fingerprint = makePlanFingerprint()
  const context = transitionGeneratedPlanScopeCandidateContext(null, {
    type: "successful_generate",
    evidenceFingerprint: fingerprint,
    generatedTrade: "painting",
    rawCandidates: [makeCandidate()],
  })

  assert.ok(context)
  assert.equal(context.evidenceFingerprint, fingerprint)
  assert.equal(context.generatedTrade, "painting")
  assert.equal(context.candidates.length, 1)
  assert.equal(context.candidates[0].id, "plan-scope:ceiling-paint:record-1")
})

test("successful current-plan Generate retains empty context for missing or malformed candidates", () => {
  const fingerprint = makePlanFingerprint()

  for (const rawCandidates of [undefined, null, "malformed", {}]) {
    const context = transitionGeneratedPlanScopeCandidateContext(null, {
      type: "successful_generate",
      evidenceFingerprint: fingerprint,
      generatedTrade: "painting",
      rawCandidates,
    })

    assert.ok(context)
    assert.deepEqual(context.candidates, [])
  }
})

test("no-plan and unverified fingerprints cannot create generated candidate context", () => {
  for (const evidenceFingerprint of [
    NO_PLAN_EVIDENCE_FINGERPRINT,
    null,
    "plan-evidence:v0:legacy",
  ]) {
    assert.equal(
      transitionGeneratedPlanScopeCandidateContext(null, {
        type: "successful_generate",
        evidenceFingerprint,
        generatedTrade: "painting",
        rawCandidates: [makeCandidate()],
      }),
      null
    )
  }
})

test("accepted Generate, history load, and source-backed Change Order reset context", () => {
  const fingerprint = makePlanFingerprint()
  const current = transitionGeneratedPlanScopeCandidateContext(null, {
    type: "successful_generate",
    evidenceFingerprint: fingerprint,
    generatedTrade: "painting",
    rawCandidates: [makeCandidate()],
  })
  assert.ok(current)

  for (const type of [
    "accepted_generate_reset",
    "history_load",
    "source_change_order_reset",
  ] as const) {
    assert.equal(
      transitionGeneratedPlanScopeCandidateContext(current, { type }),
      null,
      type
    )
  }
})

test("successful generated-context transitions are deterministic and immutable", () => {
  const fingerprint = makePlanFingerprint()
  const rawCandidates = [makeCandidate(), makeLegendCandidate({ id: "second" })]
  const before = clone(rawCandidates)
  const event = {
    type: "successful_generate" as const,
    evidenceFingerprint: fingerprint,
    generatedTrade: "painting" as const,
    rawCandidates,
  }

  const first = transitionGeneratedPlanScopeCandidateContext(null, event)
  const second = transitionGeneratedPlanScopeCandidateContext(null, event)

  assert.deepEqual(first, second)
  assert.deepEqual(rawCandidates, before)
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first?.candidates, second?.candidates)
})
