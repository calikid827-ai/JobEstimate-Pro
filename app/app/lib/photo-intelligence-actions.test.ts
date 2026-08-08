import test from "node:test"
import assert from "node:assert/strict"

import {
  buildActionableScopeDecisions,
  buildScopeDecisionWording,
} from "./actionable-scope-decisions"
import {
  buildPhotoEvidenceFingerprint,
  buildPhotoIntelligenceActions,
  classifyPhotoEvidenceFreshness,
  NO_PHOTO_EVIDENCE_FINGERPRINT,
  PHOTO_CEILING_SCOPE_FLAG,
  PHOTO_TRIM_SCOPE_FLAG,
  type SelectedPhotoEvidence,
} from "./photo-intelligence-actions"

type PhotoOverrides = Partial<Omit<SelectedPhotoEvidence, "reference">> & {
  reference?: Partial<SelectedPhotoEvidence["reference"]>
}

function makePhoto(overrides: PhotoOverrides = {}): SelectedPhotoEvidence {
  return {
    id: overrides.id ?? "photo-1",
    name: overrides.name ?? "kitchen.jpg",
    dataUrl: overrides.dataUrl ?? "data:image/jpeg;base64,AAAA",
    roomTag: overrides.roomTag ?? "Kitchen",
    shotType: overrides.shotType ?? "overview",
    note: overrides.note ?? "North wall",
    reference: {
      kind: overrides.reference?.kind ?? "custom",
      label: overrides.reference?.label ?? "Painter tape",
      realWidthIn: overrides.reference?.realWidthIn ?? 1.88,
    },
  }
}

function buildCurrentActions(args: {
  flags?: string[]
  suggestions?: string[]
  trade?: string
}) {
  const fingerprint = buildPhotoEvidenceFingerprint([makePhoto()])
  return buildPhotoIntelligenceActions({
    trade: args.trade ?? "painting",
    photoScopeAssist: {
      missingScopeFlags: args.flags ?? [],
      suggestedAdditions: args.suggestions ?? [],
    },
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
  })
}

test("fingerprints identical ordered selected evidence deterministically without mutation", () => {
  const evidence = [makePhoto(), makePhoto({ id: "photo-2", name: "hall.jpg" })]
  const before = JSON.parse(JSON.stringify(evidence))

  const first = buildPhotoEvidenceFingerprint(evidence)
  const second = buildPhotoEvidenceFingerprint(evidence)

  assert.equal(first, second)
  assert.match(first, /^photo-evidence:v1:2:\d+:[0-9a-f]{16}$/)
  assert.deepEqual(evidence, before)
})

test("photo additions and removals change the selected-evidence fingerprint", () => {
  const first = makePhoto()
  const second = makePhoto({ id: "photo-2", name: "hall.jpg" })
  const onePhoto = buildPhotoEvidenceFingerprint([first])
  const twoPhotos = buildPhotoEvidenceFingerprint([first, second])

  assert.notEqual(twoPhotos, onePhoto)
  assert.notEqual(
    buildPhotoEvidenceFingerprint([second]),
    twoPhotos
  )
})

test("photo replacement IDs and data payload identity change the fingerprint", () => {
  const baseline = buildPhotoEvidenceFingerprint([makePhoto()])

  assert.notEqual(
    buildPhotoEvidenceFingerprint([makePhoto({ id: "replacement-photo" })]),
    baseline
  )
  assert.notEqual(
    buildPhotoEvidenceFingerprint([
      makePhoto({ dataUrl: "data:image/jpeg;base64,BBBB" }),
    ]),
    baseline
  )
})

test("filename and contractor photo metadata changes make evidence stale", () => {
  const baseline = buildPhotoEvidenceFingerprint([makePhoto()])
  const variants: Array<[string, SelectedPhotoEvidence]> = [
    ["name", makePhoto({ name: "renamed.jpg" })],
    ["room tag", makePhoto({ roomTag: "Hall" })],
    ["shot type", makePhoto({ shotType: "ceiling" })],
    ["note", makePhoto({ note: "South wall" })],
    ["reference kind", makePhoto({ reference: { kind: "none" } })],
    ["reference label", makePhoto({ reference: { label: "Yardstick" } })],
    ["reference width", makePhoto({ reference: { realWidthIn: 36 } })],
  ]

  for (const [label, variant] of variants) {
    assert.notEqual(
      buildPhotoEvidenceFingerprint([variant]),
      baseline,
      label
    )
  }
})

test("request order is part of the evidence fingerprint", () => {
  const first = makePhoto()
  const second = makePhoto({ id: "photo-2", name: "hall.jpg" })

  assert.notEqual(
    buildPhotoEvidenceFingerprint([first, second]),
    buildPhotoEvidenceFingerprint([second, first])
  )
})

test("no-photo evidence has a deterministic sentinel and distinct freshness", () => {
  assert.equal(
    buildPhotoEvidenceFingerprint([]),
    NO_PHOTO_EVIDENCE_FINGERPRINT
  )
  assert.equal(
    classifyPhotoEvidenceFreshness({
      generatedEvidenceFingerprint: NO_PHOTO_EVIDENCE_FINGERPRINT,
      currentEvidenceFingerprint: NO_PHOTO_EVIDENCE_FINGERPRINT,
    }),
    "no_photos"
  )
})

test("freshness is current only for equal verified fingerprints", () => {
  const generated = buildPhotoEvidenceFingerprint([makePhoto()])
  const changed = buildPhotoEvidenceFingerprint([
    makePhoto({ note: "Updated note" }),
  ])

  assert.equal(
    classifyPhotoEvidenceFreshness({
      generatedEvidenceFingerprint: generated,
      currentEvidenceFingerprint: generated,
    }),
    "current"
  )
  assert.equal(
    classifyPhotoEvidenceFreshness({
      generatedEvidenceFingerprint: generated,
      currentEvidenceFingerprint: changed,
    }),
    "stale"
  )
  assert.equal(
    classifyPhotoEvidenceFreshness({
      generatedEvidenceFingerprint: null,
      currentEvidenceFingerprint: generated,
    }),
    "unverified"
  )
  assert.equal(
    classifyPhotoEvidenceFreshness({
      generatedEvidenceFingerprint: "unknown-provenance",
      currentEvidenceFingerprint: "unknown-provenance",
    }),
    "unverified"
  )
})

test("current painting ceiling flags become one photo-provenanced Scope Decision input", () => {
  const result = buildCurrentActions({ flags: [PHOTO_CEILING_SCOPE_FLAG] })
  const evidenceFingerprint = buildPhotoEvidenceFingerprint([makePhoto()])

  assert.equal(result.freshness, "current")
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].source, "photo_intelligence")
  assert.equal(result.candidates[0].finding, "ceiling_boundary")
  assert.equal(
    result.candidates[0].evidenceFingerprint,
    evidenceFingerprint
  )
  assert.equal(result.candidates[0].question.source, "photo_scope_assist")
  assert.equal(result.candidates[0].question.decision?.subjectKey, "ceilings")
  assert.equal(result.candidates[0].pricingAuthoritative, false)
  assert.equal(result.candidates[0].pricingEligibleNow, false)

  const [decision] = buildActionableScopeDecisions(
    result.candidates.map((candidate) => candidate.question)
  )
  assert.ok(decision)
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "include" }),
    "Includes ceiling preparation and painting."
  )
})

test("current painting trim flags use the narrow trim/baseboard/casing subject", () => {
  const result = buildCurrentActions({ flags: [PHOTO_TRIM_SCOPE_FLAG] })

  assert.equal(result.candidates.length, 1)
  assert.equal(
    result.candidates[0].finding,
    "trim_baseboard_casing_boundary"
  )
  assert.equal(
    result.candidates[0].question.decision?.subjectKey,
    "trim_and_baseboards"
  )
  assert.doesNotMatch(
    result.candidates[0].question.prompt,
    /door|frame|cabinet|millwork/i
  )
})

test("photo actions are painting-only", () => {
  for (const trade of ["drywall", "carpentry", "general_renovation", "Painting"]) {
    const result = buildCurrentActions({
      trade,
      flags: [PHOTO_CEILING_SCOPE_FLAG, PHOTO_TRIM_SCOPE_FLAG],
    })
    assert.deepEqual(result.candidates, [], trade)
  }
})

test("stale, unverified, and no-photo evidence fail closed", () => {
  const generated = buildPhotoEvidenceFingerprint([makePhoto()])
  const changed = buildPhotoEvidenceFingerprint([
    makePhoto({ id: "new-photo" }),
  ])
  const assist = {
    missingScopeFlags: [PHOTO_CEILING_SCOPE_FLAG],
    suggestedAdditions: [],
  }

  const results = [
    buildPhotoIntelligenceActions({
      trade: "painting",
      photoScopeAssist: assist,
      generatedEvidenceFingerprint: generated,
      currentEvidenceFingerprint: changed,
    }),
    buildPhotoIntelligenceActions({
      trade: "painting",
      photoScopeAssist: assist,
      generatedEvidenceFingerprint: null,
      currentEvidenceFingerprint: generated,
    }),
    buildPhotoIntelligenceActions({
      trade: "painting",
      photoScopeAssist: assist,
      generatedEvidenceFingerprint: NO_PHOTO_EVIDENCE_FINGERPRINT,
      currentEvidenceFingerprint: NO_PHOTO_EVIDENCE_FINGERPRINT,
    }),
  ]

  assert.deepEqual(
    results.map((result) => result.freshness),
    ["stale", "unverified", "no_photos"]
  )
  assert.equal(results.every((result) => result.candidates.length === 0), true)
})

test("unknown and near-match flags cannot enter the exact allowlist", () => {
  const result = buildCurrentActions({
    flags: [
      "Unknown photo flag",
      `${PHOTO_CEILING_SCOPE_FLAG} Estimated 500 sqft.`,
      PHOTO_TRIM_SCOPE_FLAG.toLowerCase(),
    ],
  })

  assert.deepEqual(result.candidates, [])
})

test("absent or empty photo assist data creates no action candidates", () => {
  const fingerprint = buildPhotoEvidenceFingerprint([makePhoto()])
  const withoutAssist = buildPhotoIntelligenceActions({
    trade: "painting",
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
  })
  const withEmptyAssist = buildCurrentActions({})

  assert.deepEqual(withoutAssist.candidates, [])
  assert.deepEqual(withEmptyAssist.candidates, [])
})

test("suggested additions and raw suggested scope notes are never action authority", () => {
  const fingerprint = buildPhotoEvidenceFingerprint([makePhoto()])
  const rawOnlyAssist = {
    missingScopeFlags: [],
    suggestedAdditions: [PHOTO_CEILING_SCOPE_FLAG, PHOTO_TRIM_SCOPE_FLAG],
    suggestedScopeNotes: [PHOTO_CEILING_SCOPE_FLAG],
  }
  const result = buildPhotoIntelligenceActions({
    trade: "painting",
    photoScopeAssist: rawOnlyAssist,
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
  })

  assert.deepEqual(result.candidates, [])
})

test("condition, quantity, measurement, material, and generic findings remain non-actionable", () => {
  const rejectedFlags = [
    "Photos show access/protection conditions not clearly addressed in scope.",
    "Photos suggest demo/removal work may be needed.",
    "Visible damage may require repair and substrate preparation.",
    "Occupied area access and protection need coordination.",
    "Owner-supplied materials and fixtures need confirmation.",
    "Trade coordination and equipment access need review.",
    "Exterior prep may include scraping, sanding, caulking, and repairs.",
    "Photo count suggests 12 doors.",
    "Estimated wall area is 1,200 square feet.",
    "Reference-scaled measurement range is 900-1,100 sqft.",
    "Missing room views reduce confidence.",
    "Plan and photo evidence jointly suggest another scope item.",
    "Model reasoning confidence is medium.",
    "Pricing driver: difficult access and equipment.",
    "Generic model observation.",
  ]
  const result = buildCurrentActions({ flags: rejectedFlags })

  assert.deepEqual(result.candidates, [])
})

test("allowlisted candidates are deterministic, deduped, immutable-input models with fixed authority", () => {
  const flags = [
    PHOTO_TRIM_SCOPE_FLAG,
    PHOTO_CEILING_SCOPE_FLAG,
    PHOTO_TRIM_SCOPE_FLAG,
  ]
  const assist = { missingScopeFlags: flags, suggestedAdditions: ["Raw prose"] }
  const before = JSON.parse(JSON.stringify(assist))
  const fingerprint = buildPhotoEvidenceFingerprint([makePhoto()])
  const first = buildPhotoIntelligenceActions({
    trade: "painting",
    photoScopeAssist: assist,
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
  })
  const second = buildPhotoIntelligenceActions({
    trade: "painting",
    photoScopeAssist: assist,
    generatedEvidenceFingerprint: fingerprint,
    currentEvidenceFingerprint: fingerprint,
  })

  assert.deepEqual(first, second)
  assert.notEqual(first.candidates, second.candidates)
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.finding),
    ["ceiling_boundary", "trim_baseboard_casing_boundary"]
  )
  assert.deepEqual(assist, before)
  assert.deepEqual(
    {
      pricingAuthoritative: first.pricingAuthoritative,
      pricingEligibleNow: first.pricingEligibleNow,
      mutatesTypedScope: first.mutatesTypedScope,
      generatesEstimate: first.generatesEstimate,
      persistsState: first.persistsState,
    },
    {
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      mutatesTypedScope: false,
      generatesEstimate: false,
      persistsState: false,
    }
  )
})
