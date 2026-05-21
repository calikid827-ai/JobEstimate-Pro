import assert from "node:assert/strict"
import test from "node:test"

import { buildEstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import { buildTradeQuantityCandidateGates } from "../plans/tradeQuantityCandidateGates"
import { buildEvidenceAuthorityReadback } from "./evidenceAuthority"
import type { EstimateBasis, PhotoAnalysis } from "./types"
import type { PlanIntelligence, PlanTradeQuantityCandidate } from "../plans/types"

function makeBasis(): EstimateBasis {
  return {
    units: ["sqft"],
    quantities: {
      sqft: 420,
    },
    laborRate: 85,
    hoursPerUnit: 0.08,
    crewDays: 2,
    mobilization: 150,
    assumptions: ["Deterministic painting basis."],
  }
}

function makePhotoAnalysis(): PhotoAnalysis {
  return {
    summary: "Photos show painted drywall walls with minor prep.",
    observations: ["Visible wall patching and furniture protection needs."],
    detectedConditions: ["minor wall damage"],
    jobSummary: {
      probableArea: "interior_room",
      detectedTrades: ["painting"],
      detectedRoomTypes: ["bedroom"],
      detectedMaterials: ["drywall"],
      detectedConditions: ["minor wall damage"],
      detectedFixtures: [],
      detectedAccessIssues: [],
      detectedDemoNeeds: [],
      complexityFlags: [],
      mergedQuantities: {
        doors: 2,
        windows: null,
        vanities: null,
        toilets: null,
        sinks: null,
        outlets: null,
        switches: null,
        recessedLights: null,
        cabinets: null,
        appliances: null,
        wallSqft: 380,
        ceilingSqft: null,
        floorSqft: null,
        trimLf: null,
      },
      quantitySources: {
        wallSqft: "reference_scaled",
        ceilingSqft: null,
        floorSqft: null,
        trimLf: null,
      },
      exteriorSummary: {
        isExterior: false,
        stories: null,
        substrate: null,
        access: null,
        trimComplexity: null,
        prepLevel: null,
        garageDoors: null,
        entryDoors: null,
        windows: null,
        bodyWallSqft: null,
      },
      pricingDrivers: [],
      missingViews: [],
      confidenceScore: 76,
    },
  }
}

function makeCandidate(
  overrides: Partial<PlanTradeQuantityCandidate> = {}
): PlanTradeQuantityCandidate {
  return {
    candidateKey: "door-schedule-count",
    trade: "carpentry",
    category: "door schedule count candidates",
    quantity: 12,
    unit: "doors",
    quantityStatus: "count_only",
    confidence: 82,
    sourceType: "schedule_table",
    sourceRefs: [
      {
        pageNumber: 2,
        sourcePageNumber: 5,
        sheetNumber: "A6.1",
        sheetTitle: "Door Schedule",
        rowIndex: 1,
        sourceTableIndex: 0,
      },
    ],
    assumptions: ["Explicit quantity/count column summed to 12."],
    warnings: ["Candidate only - not measured takeoff support."],
    eligibleForPricing: false,
    ...overrides,
  }
}

function makePlanIntelligence(
  candidates: PlanTradeQuantityCandidate[] = [makeCandidate()]
): PlanIntelligence {
  return {
    ok: true,
    uploadsCount: 1,
    pagesCount: 2,
    indexedPagesCount: 2,
    selectedPagesCount: 2,
    skippedPagesCount: 0,
    sheetIndex: [
      {
        uploadId: "upload-1",
        uploadName: "plans.pdf",
        pageNumber: 1,
        sourcePageNumber: 1,
        pageLabel: "1",
        sheetNumber: "A1.1",
        sheetTitle: "Floor Plan",
        discipline: "architectural",
        confidence: 80,
        revision: null,
        selectedForAnalysis: true,
        renderedFromPdf: true,
        renderedImageAvailable: true,
        classification: {
          sheetRole: "floor_plan",
          discipline: "architectural",
          confidence: 80,
          method: "deterministic",
          signals: ["Floor plan"],
          warnings: [],
        },
      },
    ],
    analyses: [],
    takeoff: {
      floorSqft: null,
      wallSqft: null,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
    scopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
      conflicts: [],
    },
    evidence: {
      summaryRefs: [
        {
          uploadId: "upload-1",
          uploadName: "plans.pdf",
          sourcePageNumber: 1,
          pageNumber: 1,
          sheetNumber: "A1.1",
          sheetTitle: "Floor Plan",
          excerpt: "Guestroom floor plan",
          confidence: 80,
        },
      ],
      quantityRefs: [],
      riskRefs: [],
    },
    detectedTrades: ["painting"],
    detectedRooms: ["guest room"],
    extractedTables: [],
    roomFinishMatrices: [],
    repeatedRoomPackages: [],
    tradeQuantityCandidates: candidates,
    tradeQuantityCandidateGates: buildTradeQuantityCandidateGates(candidates),
    summary: "Plan readback summary.",
    confidenceScore: 78,
  }
}

test("classifies typed included scope as authoritative and boundary text as excluded context", () => {
  const scopeFacts = buildEstimatorScopeFacts(
    "Paint 2 bedrooms and 4 doors. Excludes drywall repair, flooring by others, owner-supplied paint, and protect existing cabinets only."
  )
  const readback = buildEvidenceAuthorityReadback({ scopeFacts })

  const included = readback.items.find((item) => item.id === "typed-scope:included")
  const boundary = readback.items.find((item) => item.id === "typed-scope:boundary")

  assert.equal(included?.authority, "pricing_authoritative")
  assert.equal(included?.pricingAuthoritative, true)
  assert.equal(boundary?.authority, "excluded_or_boundary_context")
  assert.equal(boundary?.pricingAuthoritative, false)
  assert.equal(boundary?.pricingEligibleNow, false)
  assert.match(boundary?.summary || "", /Excludes drywall repair/i)
})

test("classifies user, parsed, and deterministic quantities as pricing basis without changing formulas", () => {
  const readback = buildEvidenceAuthorityReadback({
    userQuantities: [
      {
        key: "rooms",
        label: "User confirmed rooms",
        value: 2,
        unit: "rooms",
        source: "user",
      },
    ],
    parsedQuantities: [
      {
        key: "doors",
        label: "Parsed door count",
        value: 4,
        unit: "doors",
        source: "parsed",
      },
    ],
    estimateBasis: makeBasis(),
  })

  assert.equal(readback.items.find((item) => item.id === "quantity:user:rooms")?.authority, "user_confirmed_quantity")
  assert.equal(readback.items.find((item) => item.id === "quantity:parsed:doors")?.authority, "parsed_typed_quantity")
  assert.equal(
    readback.items.find((item) => item.id === "deterministic-estimate-basis:sqft")?.authority,
    "deterministic_pricing_basis"
  )
  assert(readback.items.filter((item) => item.pricingAuthoritative).length >= 3)
})

test("keeps photo observations and reference-scaled photo quantities review-only by default", () => {
  const readback = buildEvidenceAuthorityReadback({
    photoAnalysis: makePhotoAnalysis(),
  })

  const observations = readback.items.find((item) => item.id === "photo:observations")
  const wallSqft = readback.items.find((item) => item.id === "photo:quantity:wallSqft")

  assert.equal(observations?.authority, "review_only")
  assert.equal(observations?.pricingAuthoritative, false)
  assert.equal(wallSqft?.source, "photo_reference_scaled_quantity")
  assert.equal(wallSqft?.authority, "review_only")
  assert.equal(wallSqft?.pricingAuthoritative, false)
})

test("allows only explicitly guarded photo quantities to be marked pricing authoritative", () => {
  const readback = buildEvidenceAuthorityReadback({
    photoAnalysis: makePhotoAnalysis(),
    pricingAuthoritativePhotoQuantityKeys: ["wallSqft"],
  })

  const observations = readback.items.find((item) => item.id === "photo:observations")
  const doors = readback.items.find((item) => item.id === "photo:quantity:doors")
  const wallSqft = readback.items.find((item) => item.id === "photo:quantity:wallSqft")

  assert.equal(observations?.pricingAuthoritative, false)
  assert.equal(doors?.pricingAuthoritative, false)
  assert.equal(wallSqft?.authority, "pricing_authoritative")
  assert.equal(wallSqft?.pricingAuthoritative, true)
})

test("keeps plan quantity candidates non-pricing-authoritative even when future eligible", () => {
  const readback = buildEvidenceAuthorityReadback({
    planIntelligence: makePlanIntelligence(),
  })

  const candidate = readback.items.find((item) => item.id === "plan:quantity-candidate:door-schedule-count")

  assert.equal(candidate?.authority, "future_measured_takeoff_candidate")
  assert.equal(candidate?.pricingAuthoritative, false)
  assert.equal(candidate?.pricingEligibleNow, false)
  assert.equal(readback.summary.futureMeasuredTakeoffCandidateCount, 1)
})

test("classifies weak plan quantity candidates as diagnostic-only and never pricing eligible", () => {
  const weakCandidate = makeCandidate({
    candidateKey: "weak-count",
    confidence: 35,
    sourceRefs: [],
    quantityStatus: "unsupported",
    warnings: ["Candidate warnings include unclear source rows."],
  })
  const readback = buildEvidenceAuthorityReadback({
    planIntelligence: makePlanIntelligence([weakCandidate]),
  })

  const candidate = readback.items.find((item) => item.id === "plan:quantity-candidate:weak-count")

  assert.equal(candidate?.authority, "diagnostic_only")
  assert.equal(candidate?.pricingAuthoritative, false)
  assert.equal(candidate?.pricingEligibleNow, false)
})
