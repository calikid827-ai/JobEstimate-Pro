import test from "node:test"
import assert from "node:assert/strict"

import {
  buildEstimatorIntelligenceFindings,
  type EstimatorIntelligenceFinding,
} from "./estimator-intelligence-findings"

const planEvidence = {
  uploadId: "plan-1",
  uploadName: "Hotel Plans.pdf",
  sourcePageNumber: 7,
  pageNumber: 2,
  sheetNumber: "A7.1",
  sheetTitle: "Finish Schedule",
  excerpt: "Guest room wall finish PT-1",
  confidence: 82,
}

function assertReviewOnlyDefaults(findings: EstimatorIntelligenceFinding[]) {
  assert.equal(findings.every((finding) => finding.pricingEligibleNow === false), true)
  assert.equal(findings.every((finding) => finding.pricingAuthoritative === false), true)
  assert.equal(findings.every((finding) => finding.customerVisible === false), true)
  assert.equal(findings.every((finding) => finding.requiresEstimatorConfirmation === true), true)
  assert.equal(findings.every((finding) => finding.dataNoPrint === true), true)
}

test("empty input returns no findings and zero counts", () => {
  const result = buildEstimatorIntelligenceFindings()

  assert.deepEqual(result.findings, [])
  assert.equal(result.summary.total, 0)
  assert.equal(result.summary.requiresEstimatorConfirmationCount, 0)
  assert.equal(result.summary.pricingEligibleNowCount, 0)
  assert.equal(result.summary.pricingAuthoritativeCount, 0)
  assert.equal(result.summary.customerVisibleCount, 0)
  assert.equal(result.summary.dataNoPrintCount, 0)
})

test("plan readback text becomes review-only findings", () => {
  const result = buildEstimatorIntelligenceFindings({
    planIntelligence: {
      planReadback: {
        headline: "Selected sheets appear to show guest room finish work.",
        needsConfirmation: [
          {
            text: "Confirm whether corridor painting is included.",
            supportLevel: "review",
            evidence: [planEvidence],
          },
        ],
      },
    },
  })

  assert.ok(result.findings.some((finding) => finding.category === "plan_overview"))
  assert.ok(result.findings.some((finding) => finding.category === "scope_confirmation"))
  assert.equal(result.findings.every((finding) => finding.authority === "review_only"), true)
  assertReviewOnlyDefaults(result.findings)
})

test("plan quantity candidates become findings with pricingEligibleNow false", () => {
  const result = buildEstimatorIntelligenceFindings({
    planIntelligence: {
      tradeQuantityCandidates: [
        {
          candidateKey: "finish-room-count",
          trade: "painting",
          category: "painting finish rows",
          quantity: 42,
          unit: "rooms",
          quantityStatus: "needs_measurement",
          confidence: 77,
          sourceRefs: [planEvidence],
          assumptions: ["Room rows are diagnostic only."],
          warnings: ["Candidate only - not measured takeoff support."],
          eligibleForPricing: false,
        },
      ],
      tradeQuantityCandidateGates: [
        {
          candidateKey: "finish-room-count",
          gateStatus: "review_only",
          pricingEligibleNow: false,
        },
      ],
    },
  })

  const finding = result.findings.find((item) => item.category === "plan_quantity_candidate")
  assert.ok(finding)
  assert.equal(finding.pricingEligibleNow, false)
  assert.equal(finding.pricingAuthoritative, false)
  assert.equal(finding.authority, "review_only")
})

test("plan evidence refs survive in finding evidence", () => {
  const result = buildEstimatorIntelligenceFindings({
    planIntelligence: {
      planReadback: {
        directlySupported: [
          {
            text: "Finish schedule supports guest room paint review.",
            supportLevel: "direct",
            evidence: [planEvidence],
          },
        ],
      },
    },
  })

  const finding = result.findings.find((item) => item.category === "plan_evidence")
  assert.ok(finding)
  assert.equal(finding.evidence[0]?.sheetNumber, "A7.1")
  assert.equal(finding.evidence[0]?.pageNumber, 7)
  assert.equal(finding.evidence[0]?.excerpt, "Guest room wall finish PT-1")
})

test("photo conditions become review-only findings with photo evidence", () => {
  const result = buildEstimatorIntelligenceFindings({
    photoAnalysis: {
      detectedConditions: ["Water staining at ceiling"],
      perPhoto: [
        {
          photoName: "bath-ceiling.jpg",
          roomTag: "Bathroom",
          reasoning: ["Visible staining near fan."],
          confidence: "high",
        },
      ],
    },
  })

  const finding = result.findings.find((item) => item.category === "photo_condition")
  assert.ok(finding)
  assert.equal(finding.authority, "review_only")
  assert.equal(finding.evidence[0]?.photoName, "bath-ceiling.jpg")
  assertReviewOnlyDefaults(result.findings)
})

test("photo quantity signals become review-only findings and are not pricing-authoritative", () => {
  const result = buildEstimatorIntelligenceFindings({
    photoAnalysis: {
      quantitySignals: {
        doors: 3,
        estimatedWallSqftMin: 420,
        estimatedWallSqftMax: 520,
      },
      jobSummary: {
        confidenceScore: 68,
      },
    },
  })

  const quantityFindings = result.findings.filter((item) => item.category === "photo_quantity_signal")
  assert.equal(quantityFindings.length, 3)
  assert.equal(quantityFindings.every((item) => item.authority === "review_only"), true)
  assert.equal(quantityFindings.every((item) => item.pricingAuthoritative === false), true)
  assert.equal(quantityFindings.every((item) => item.pricingEligibleNow === false), true)
})

test("missed scope items become review-only findings requiring estimator confirmation", () => {
  const result = buildEstimatorIntelligenceFindings({
    missedScopeDetector: {
      likelyMissingScope: [
        {
          label: "Waterproofing",
          reason: "Shower tile scope appears to omit waterproofing.",
          evidence: ["Scope mentions shower tile."],
          confidence: 88,
        },
      ],
    },
  })

  const finding = result.findings.find((item) => item.category === "missed_scope")
  assert.ok(finding)
  assert.equal(finding.title, "Waterproofing")
  assert.equal(finding.authority, "review_only")
  assert.equal(finding.requiresEstimatorConfirmation, true)
})

test("assembly candidate-style input becomes future_candidate and does not affect pricing", () => {
  const result = buildEstimatorIntelligenceFindings({
    assemblyCandidates: [
      {
        title: "Guestroom repaint package",
        summary: "Prep, patch, masking, primer, finish coats, cleanup.",
        evidence: [planEvidence],
      },
    ],
  })

  const finding = result.findings.find((item) => item.category === "assembly_candidate")
  assert.ok(finding)
  assert.equal(finding.authority, "future_candidate")
  assert.equal(finding.pricingEligibleNow, false)
  assert.equal(finding.pricingAuthoritative, false)
})

test("dedupe prevents repeated identical findings", () => {
  const result = buildEstimatorIntelligenceFindings({
    priceGuardReview: {
      missedScopeWarnings: [
        "Protection for adjacent finishes is not clearly stated.",
        "Protection for adjacent finishes is not clearly stated.",
      ],
    },
  })

  assert.equal(result.findings.length, 1)
  assert.equal(result.summary.total, 1)
})

test("all inferred findings default to customerVisible false and dataNoPrint true", () => {
  const result = buildEstimatorIntelligenceFindings({
    planIntelligence: {
      evidenceStrength: {
        label: "Useful",
        summary: "Plan readback is available but measured quantities still need confirmation.",
      },
      tradeQuantityCandidates: [
        {
          candidateKey: "doors",
          category: "door schedule count candidates",
          quantity: 12,
          unit: "doors",
          quantityStatus: "count_only",
        },
      ],
    },
    photoScopeAssist: {
      missingScopeFlags: ["Photos suggest trim painting may be missing."],
    },
    profitLeakDetector: {
      likelyProfitLeaks: [
        {
          label: "Low labor",
          reason: "Labor appears light for multi-phase work.",
        },
      ],
    },
  })

  assert.ok(result.findings.length > 0)
  assertReviewOnlyDefaults(result.findings)
})

test("mapper does not mutate input objects", () => {
  const input = {
    planIntelligence: {
      planReadback: {
        headline: "Selected sheets show finish scope.",
        directlySupported: [
          {
            text: "Paint support visible.",
            evidence: [planEvidence],
          },
        ],
      },
    },
    photoAnalysis: {
      detectedConditions: ["Damaged drywall"],
    },
  }
  const before = JSON.stringify(input)

  buildEstimatorIntelligenceFindings(input)

  assert.equal(JSON.stringify(input), before)
})

test("partial, missing, or malformed input does not throw", () => {
  assert.doesNotThrow(() =>
    buildEstimatorIntelligenceFindings({
      planIntelligence: {
        planReadback: {
          headline: null,
          scopeGapReadback: [null, "bad", { title: "Gap without narration" }],
        },
        tradeQuantityCandidates: [null, "bad", { category: "" }],
      },
      photoAnalysis: {
        detectedConditions: "not-an-array",
        quantitySignals: {
          doors: "not-a-number",
        },
      },
      missedScopeDetector: "bad",
      priceGuardReview: {
        missedScopeWarnings: "bad",
      },
    })
  )
})

test("null top-level input does not throw and returns zero findings", () => {
  const result = buildEstimatorIntelligenceFindings(null as any)

  assert.deepEqual(result.findings, [])
  assert.equal(result.summary.total, 0)
  assert.equal(result.summary.pricingEligibleNowCount, 0)
  assert.equal(result.summary.pricingAuthoritativeCount, 0)
})

test("string top-level input does not throw and returns zero findings", () => {
  const result = buildEstimatorIntelligenceFindings("bad" as any)

  assert.deepEqual(result.findings, [])
  assert.equal(result.summary.total, 0)
  assert.equal(result.summary.customerVisibleCount, 0)
  assert.equal(result.summary.dataNoPrintCount, 0)
})

test("no generated finding has pricingEligibleNow true", () => {
  const result = buildEstimatorIntelligenceFindings({
    evidenceAuthorityReadback: {
      items: [
        {
          label: "Photo wall quantity",
          summary: "Photo analysis reported 500 sqft.",
          authority: "pricing_authoritative",
          pricingEligibleNow: true,
        },
      ],
    },
    planIntelligence: {
      tradeQuantityCandidates: [
        {
          candidateKey: "rooms",
          category: "repeated room package count candidates",
          quantity: 20,
          unit: "rooms",
        },
      ],
    },
  })

  assert.equal(result.findings.every((finding) => finding.pricingEligibleNow === false), true)
  assert.equal(result.summary.pricingEligibleNowCount, 0)
})

test("no generated finding has pricingAuthoritative true", () => {
  const result = buildEstimatorIntelligenceFindings({
    evidenceAuthorityReadback: {
      items: [
        {
          label: "Typed scope",
          summary: "Typed included scope exists.",
          authority: "pricing_authoritative",
          pricingAuthoritative: true,
        },
      ],
    },
    photoAnalysis: {
      quantitySignals: {
        doors: 2,
      },
    },
  })

  assert.equal(result.findings.every((finding) => finding.pricingAuthoritative === false), true)
  assert.equal(result.summary.pricingAuthoritativeCount, 0)
})
