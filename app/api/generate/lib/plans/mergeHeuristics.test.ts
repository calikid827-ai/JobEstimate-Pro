import assert from "node:assert/strict"
import test from "node:test"

import { buildMergedPlanIntelligence } from "./mergeHeuristics"
import type {
  PlanEvidenceRef,
  PlanRoomFinding,
  PlanScheduleItem,
  PlanSheetAnalysis,
  PlanSheetDiscipline,
  PlanSheetIndexEntry,
  PlanTradeFinding,
} from "./types"

function makeEvidence(args: {
  uploadId?: string
  uploadName?: string
  sourcePageNumber: number
  pageNumber: number
  sheetNumber?: string | null
  sheetTitle?: string | null
  excerpt: string
  confidence?: number
}): PlanEvidenceRef {
  return {
    uploadId: args.uploadId ?? "upload-1",
    uploadName: args.uploadName ?? "plan-set.pdf",
    sourcePageNumber: args.sourcePageNumber,
    pageNumber: args.pageNumber,
    sheetNumber: args.sheetNumber ?? null,
    sheetTitle: args.sheetTitle ?? null,
    excerpt: args.excerpt,
    confidence: args.confidence ?? 75,
  }
}

function makeSheet(args: {
  pageNumber: number
  sheetNumber: string
  sheetTitle: string
  discipline: PlanSheetDiscipline
  uploadId?: string
  uploadName?: string
  sourcePageNumber?: number
  confidence?: number
}): PlanSheetIndexEntry {
  return {
    uploadId: args.uploadId ?? "upload-1",
    uploadName: args.uploadName ?? "plan-set.pdf",
    sourcePageNumber: args.sourcePageNumber ?? args.pageNumber,
    pageNumber: args.pageNumber,
    pageLabel: `${args.sheetNumber} - ${args.sheetTitle}`,
    sheetNumber: args.sheetNumber,
    sheetTitle: args.sheetTitle,
    discipline: args.discipline,
    confidence: args.confidence ?? 80,
    revision: null,
    selectedForAnalysis: true,
    renderedFromPdf: true,
    renderedImageAvailable: true,
  }
}

function makeAnalysis(args: {
  pageNumber: number
  sheetNumber: string
  sheetTitle: string
  discipline: PlanSheetDiscipline
  textSnippets?: string[]
  notes?: string[]
  rooms?: PlanRoomFinding[]
  schedules?: PlanScheduleItem[]
  tradeFindings?: PlanTradeFinding[]
  uploadId?: string
  uploadName?: string
  sourcePageNumber?: number
  confidence?: number
}): PlanSheetAnalysis {
  return {
    uploadId: args.uploadId ?? "upload-1",
    uploadName: args.uploadName ?? "plan-set.pdf",
    sourcePageNumber: args.sourcePageNumber ?? args.pageNumber,
    pageNumber: args.pageNumber,
    sheetNumber: args.sheetNumber,
    sheetTitle: args.sheetTitle,
    discipline: args.discipline,
    textSnippets: args.textSnippets ?? [],
    notes: args.notes ?? [],
    rooms: args.rooms ?? [],
    schedules: args.schedules ?? [],
    tradeFindings: args.tradeFindings ?? [],
    scaleText: null,
    revision: null,
    confidence: args.confidence ?? 78,
  }
}

test("finish plan plus finish schedule reinforce finish scope without inflating unrelated trades", () => {
  const sheetIndex = [
    makeSheet({
      pageNumber: 1,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
    }),
    makeSheet({
      pageNumber: 2,
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
    }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
      rooms: [
        {
          roomName: "Guest Room",
          confidence: 80,
          evidence: [
            makeEvidence({
              sourcePageNumber: 1,
              pageNumber: 1,
              sheetNumber: "A8.1",
              sheetTitle: "Finish Plan",
              excerpt: "Guest Room finish plan",
            }),
          ],
        },
      ],
      tradeFindings: [
        {
          trade: "painting",
          label: "Guest room paint wall area",
          quantity: 1800,
          unit: "sqft",
          category: "wall_area",
          notes: ["Measured from finish plan."],
          confidence: 84,
          evidence: [
            makeEvidence({
              sourcePageNumber: 1,
              pageNumber: 1,
              sheetNumber: "A8.1",
              sheetTitle: "Finish Plan",
              excerpt: "Wall finish notes for guest rooms",
            }),
          ],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
      schedules: [
        {
          scheduleType: "finish",
          label: "Finish schedule",
          quantity: null,
          notes: ["Paint and wallcovering finish matrix."],
          confidence: 82,
          evidence: [
            makeEvidence({
              sourcePageNumber: 2,
              pageNumber: 2,
              sheetNumber: "A8.2",
              sheetTitle: "Finish Schedule",
              excerpt: "Finish schedule matrix",
            }),
          ],
        },
      ],
      tradeFindings: [
        {
          trade: "painting",
          label: "Finish-related work referenced",
          quantity: null,
          unit: "unknown",
          notes: ["Finish schedule references guest room repaint scope."],
          confidence: 76,
          evidence: [
            makeEvidence({
              sourcePageNumber: 2,
              pageNumber: 2,
              sheetNumber: "A8.2",
              sheetTitle: "Finish Schedule",
              excerpt: "Guest room finish legend",
            }),
          ],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Repaint guest rooms.",
    trade: "painting",
  })

  assert(result.crossSheetLinkSignals?.some((item) => /finish schedules and finish\/elevation sheets/i.test(item)))
  assert(result.scheduleReconciliationSignals?.some((item) => /Finish schedules now reconcile against finish-plan evidence/i.test(item)))
  assert(result.detectedTrades.includes("painting"))
  assert(!result.detectedTrades.includes("electrical"))
  assert(!result.detectedTrades.includes("plumbing"))
  assert.match(result.planReadback?.headline || "", /finish plan/i)
  assert(result.planReadback?.sheetNarration.some((item) => /Finish Plan/i.test(item.narration)))
  assert(result.planReadback?.directlySupported.some((item) => /painting: Guest room paint wall area/i.test(item.text)))
  assert(result.planReadback?.reinforcedByCrossSheet.some((item) => /schedule-backed support/i.test(item.text)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /1,800 sqft/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /schedule support reinforces/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "painting" && item.role === "likely primary" && /guest rooms/i.test(item.areaGroups.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "painting" && /1,800 sqft/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "guest_room_finish" && item.role === "primary" && item.trades.includes("painting")))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "guest_room_finish" && /1,800 sqft/i.test(item.directSupport.join(" "))))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.status === "needs_confirmation" && /schedule/i.test(`${item.narration} ${item.confirmationPrompt}`)))
  assert.deepEqual(
    result.planReadback?.estimatorFlowReadback.map((item) => item.stepKey),
    [
      "selected_sheets",
      "affected_spaces",
      "trade_paths",
      "scope_groups",
      "supported_quantities",
      "pricing_carry",
      "confirmations",
    ]
  )
  assert(result.planReadback?.estimatorFlowReadback.some((item) => item.stepKey === "pricing_carry" && /Final pricing remains controlled by existing pricing owner logic and protections/i.test(item.narration)))
  assert(!result.planReadback?.tradeNarration.some((item) => item.trade === "electrical" || item.trade === "plumbing"))
})

test("fixture schedules plus bath elevations reinforce wet-area context conservatively", () => {
  const sheetIndex = [
    makeSheet({
      pageNumber: 1,
      sheetNumber: "P2.0",
      sheetTitle: "Fixture Schedule",
      discipline: "plumbing",
    }),
    makeSheet({
      pageNumber: 2,
      sheetNumber: "A9.1",
      sheetTitle: "Interior Elevations",
      discipline: "interior",
    }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "P2.0",
      sheetTitle: "Fixture Schedule",
      discipline: "plumbing",
      schedules: [
        {
          scheduleType: "fixture",
          label: "Fixture schedule",
          quantity: 6,
          notes: ["Bathroom fixture schedule."],
          confidence: 85,
          evidence: [
            makeEvidence({
              sourcePageNumber: 1,
              pageNumber: 1,
              sheetNumber: "P2.0",
              sheetTitle: "Fixture Schedule",
              excerpt: "Toilet lavatory shower valve schedule",
            }),
          ],
        },
      ],
      tradeFindings: [
        {
          trade: "plumbing",
          label: "Bathroom fixture schedule count",
          quantity: 6,
          unit: "fixtures",
          category: "plumbing_fixture_count",
          notes: ["Schedule-backed fixture count."],
          confidence: 88,
          evidence: [
            makeEvidence({
              sourcePageNumber: 1,
              pageNumber: 1,
              sheetNumber: "P2.0",
              sheetTitle: "Fixture Schedule",
              excerpt: "6 plumbing fixtures",
            }),
          ],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A9.1",
      sheetTitle: "Interior Elevations",
      discipline: "interior",
      rooms: [
        {
          roomName: "Bathroom",
          confidence: 80,
          evidence: [
            makeEvidence({
              sourcePageNumber: 2,
              pageNumber: 2,
              sheetNumber: "A9.1",
              sheetTitle: "Interior Elevations",
              excerpt: "Bathroom interior elevation",
            }),
          ],
        },
      ],
      tradeFindings: [
        {
          trade: "tile",
          label: "Bathroom shower tile elevation",
          quantity: 120,
          unit: "sqft",
          category: "selected_elevation_area",
          notes: ["Vertical tile from bath elevation only."],
          confidence: 83,
          evidence: [
            makeEvidence({
              sourcePageNumber: 2,
              pageNumber: 2,
              sheetNumber: "A9.1",
              sheetTitle: "Interior Elevations",
              excerpt: "Shower wall tile elevation",
            }),
          ],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Refresh guest bath fixtures and shower tile.",
    trade: "general renovation",
  })

  assert(result.crossSheetLinkSignals?.some((item) => /fixture schedules and bathroom\/elevation sheets reinforce wet-area fixture context conservatively/i.test(item)))
  assert(result.crossSheetLinkSignals?.some((item) => /bath elevations and fixture schedules reinforce tile and wet-area context/i.test(item)))
  assert(result.scheduleReconciliationSignals?.some((item) => /Fixture schedules now reconcile against related plumbing\/electrical sheet context/i.test(item)))
  assert(!result.crossSheetConflictSignals?.length)
  assert(result.detectedTrades.includes("plumbing"))
  assert(result.detectedTrades.includes("tile"))
  assert(!result.detectedTrades.includes("painting"))
  assert(result.planReadback?.packageReadback.some((item) => /Elevation-only evidence is narrow/i.test(item.narration)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "bathrooms / wet areas" && /6 fixtures/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "bathrooms / wet areas" && /Elevation-only support stays limited/i.test(item.scopeNotes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "plumbing" && /6 fixtures/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "tile" && /Elevation-only evidence stays narrow/i.test(item.confirmationNotes.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "wet_area" && item.trades.includes("plumbing") && item.trades.includes("tile")))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "wet_area" && /Elevation-only evidence stays narrow|Elevation-only support stays limited/i.test(item.confirmationNotes.join(" "))))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.scopeGroupKey === "wet_area" && item.status === "risky_assumption" && /full-room|shown surfaces|outside the shown surfaces/i.test(`${item.narration} ${item.confirmationPrompt}`)))
  assert(!result.planReadback?.packageReadback.some((item) => /full-room authority/i.test(item.narration)))
})

test("demolition and finish sheets reinforce removal context without manufacturing install authority", () => {
  const sheetIndex = [
    makeSheet({
      pageNumber: 1,
      sheetNumber: "A1.1",
      sheetTitle: "Demo Plan",
      discipline: "architectural",
    }),
    makeSheet({
      pageNumber: 2,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
    }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A1.1",
      sheetTitle: "Demo Plan",
      discipline: "architectural",
      textSnippets: ["Selective demolition plan"],
      tradeFindings: [],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
      tradeFindings: [
        {
          trade: "flooring",
          label: "Finish-related work referenced",
          quantity: null,
          unit: "unknown",
          notes: ["Floor finish replacement scope referenced."],
          confidence: 72,
          evidence: [
            makeEvidence({
              sourcePageNumber: 2,
              pageNumber: 2,
              sheetNumber: "A8.1",
              sheetTitle: "Finish Plan",
              excerpt: "Replace resilient flooring finish",
            }),
          ],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Remove and replace corridor finishes.",
    trade: "flooring",
  })

  assert(result.crossSheetLinkSignals?.some((item) => /demolition sheets and finish\/install sheets reinforce removal context/i.test(item)))
  assert(result.crossSheetConflictSignals?.some((item) => /removal remains non-binding where measured demo support is thin/i.test(item)))
  assert(!result.notes?.some((item) => /install authority/i.test(item)))
  assert(result.planReadback?.packageReadback.some((item) => /Demo\/removal support stays separate from install authority/i.test(item.narration)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "demo / removal zones" && /removal-only/i.test(item.scopeNotes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "flooring" && /finish_refresh/i.test(item.phaseTypes.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "demo_removal" && /removal|demo/i.test(item.confirmationNotes.join(" "))))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.scopeGroupKey === "demo_removal" && item.status === "risky_assumption" && /install/i.test(item.confirmationPrompt)))
  assert(result.planReadback?.needsConfirmation.some((item) => /Removal\/demo support does not create install authority/i.test(item.text)))
})

test("repeated room support across multiple selected sheets strengthens prototype synthesis", () => {
  const sheetIndex = [
    makeSheet({
      pageNumber: 1,
      sheetNumber: "A5.1",
      sheetTitle: "Typical Guest Room Plan",
      discipline: "architectural",
    }),
    makeSheet({
      pageNumber: 2,
      sheetNumber: "A6.1",
      sheetTitle: "Reflected Ceiling Plan",
      discipline: "finish",
    }),
    makeSheet({
      pageNumber: 3,
      sheetNumber: "A9.1",
      sheetTitle: "Interior Elevations",
      discipline: "interior",
    }),
  ]

  const guestRoomEvidence = makeEvidence({
    sourcePageNumber: 1,
    pageNumber: 1,
    sheetNumber: "A5.1",
    sheetTitle: "Typical Guest Room Plan",
    excerpt: "Typical guest room plan",
  })

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A5.1",
      sheetTitle: "Typical Guest Room Plan",
      discipline: "architectural",
      textSnippets: ["Typical guest room plan"],
      rooms: [
        {
          roomName: "Guest Room",
          confidence: 88,
          evidence: [guestRoomEvidence],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A6.1",
      sheetTitle: "Reflected Ceiling Plan",
      discipline: "finish",
      textSnippets: ["Reflected ceiling plan typical guest room"],
      rooms: [
        {
          roomName: "Guest Room",
          confidence: 82,
          evidence: [
            makeEvidence({
              sourcePageNumber: 2,
              pageNumber: 2,
              sheetNumber: "A6.1",
              sheetTitle: "Reflected Ceiling Plan",
              excerpt: "Typical guest room reflected ceiling plan",
            }),
          ],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 3,
      sheetNumber: "A9.1",
      sheetTitle: "Interior Elevations",
      discipline: "interior",
      textSnippets: ["Guest room interior elevations"],
      rooms: [
        {
          roomName: "Guest Room",
          confidence: 81,
          evidence: [
            makeEvidence({
              sourcePageNumber: 3,
              pageNumber: 3,
              sheetNumber: "A9.1",
              sheetTitle: "Interior Elevations",
              excerpt: "Guest room interior elevations",
            }),
          ],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Repaint typical guest rooms.",
    trade: "painting",
  })

  assert(result.crossSheetLinkSignals?.some((item) => /room, ceiling, and elevation sheets reinforce repeated room-type behavior/i.test(item)))
  assert(result.prototypeSignals?.some((item) => /Prototype or typical room behavior is likely present/i.test(item)))
  assert(result.repeatedSpaceSignals?.length)
  assert(result.likelyRoomTypes?.includes("guest room"))
  assert(result.planReadback?.reinforcedByCrossSheet.some((item) => /Prototype or typical room behavior/i.test(item.text)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /scale-oriented support/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /Confirm actual repeat counts/i.test(item.scopeNotes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.every((item) => !/measured totals/i.test(item.supportNarration.join(" ")) || /not measured totals/i.test(item.supportNarration.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "guest_room_finish" && /scale-oriented grouping/i.test(item.reinforcedSupport.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "guest_room_finish" && /Confirm repeat counts/i.test(item.confirmationNotes.join(" "))))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.gapKey === "confirm-repeat-counts" && /Confirm actual repeat counts/i.test(item.confirmationPrompt)))
  assert(result.planReadback?.estimatorFlowReadback.some((item) => item.stepKey === "confirmations" && /confirmation item/i.test(item.narration)))
  assert(result.planReadback?.packageReadback.every((item) => !/measured totals/i.test(item.narration) || /not measured totals/i.test(item.narration)))
})

test("page and source provenance remains intact after cross-sheet synthesis", () => {
  const sheetIndex = [
    makeSheet({
      pageNumber: 4,
      sourcePageNumber: 7,
      uploadId: "upload-a",
      uploadName: "finish-set.pdf",
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
    }),
    makeSheet({
      pageNumber: 5,
      sourcePageNumber: 8,
      uploadId: "upload-a",
      uploadName: "finish-set.pdf",
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
    }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 4,
      sourcePageNumber: 7,
      uploadId: "upload-a",
      uploadName: "finish-set.pdf",
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
      tradeFindings: [
        {
          trade: "painting",
          label: "Finish-related work referenced",
          quantity: null,
          unit: "unknown",
          notes: ["Guest room wall finish."],
          confidence: 78,
          evidence: [
            makeEvidence({
              uploadId: "upload-a",
              uploadName: "finish-set.pdf",
              sourcePageNumber: 7,
              pageNumber: 4,
              sheetNumber: "A8.1",
              sheetTitle: "Finish Plan",
              excerpt: "Wall finish keynote",
            }),
          ],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 5,
      sourcePageNumber: 8,
      uploadId: "upload-a",
      uploadName: "finish-set.pdf",
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
      schedules: [
        {
          scheduleType: "finish",
          label: "Finish schedule",
          quantity: null,
          notes: [],
          confidence: 79,
          evidence: [
            makeEvidence({
              uploadId: "upload-a",
              uploadName: "finish-set.pdf",
              sourcePageNumber: 8,
              pageNumber: 5,
              sheetNumber: "A8.2",
              sheetTitle: "Finish Schedule",
              excerpt: "Finish matrix",
            }),
          ],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Guest room refresh.",
    trade: "painting",
  })

  assert(result.evidence.summaryRefs.some((ref) => ref.uploadId === "upload-a" && ref.sourcePageNumber === 7 && ref.pageNumber === 4))
  assert(result.evidence.summaryRefs.some((ref) => ref.uploadId === "upload-a" && ref.sourcePageNumber === 8 && ref.pageNumber === 5))
  assert(result.crossSheetLinkSignals?.some((item) => /Selected finish schedules and finish\/elevation sheets reinforce finish scope/i.test(item)))
  assert(result.planReadback?.sheetNarration.some((item) => item.sourcePageNumber === 7 && item.pageNumber === 4))
  assert(result.planReadback?.reinforcedByCrossSheet.some((item) => item.evidence.some((ref) => ref.sourcePageNumber === 8 && ref.pageNumber === 5)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.evidence.some((ref) => ref.sourcePageNumber === 8 && ref.pageNumber === 5)))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.evidence.some((ref) => ref.sourcePageNumber === 8 && ref.pageNumber === 5)))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.evidence.some((ref) => ref.sourcePageNumber === 8 && ref.pageNumber === 5)))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.evidence.some((ref) => ref.sourcePageNumber === 8 && ref.pageNumber === 5)))
})

test("finish plan, finish schedule, and elevations synthesize into a quantity-backed finish package without inflating unrelated trades", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "A8.1", sheetTitle: "Finish Plan", discipline: "finish" }),
    makeSheet({ pageNumber: 2, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", discipline: "finish" }),
    makeSheet({ pageNumber: 3, sheetNumber: "A9.1", sheetTitle: "Interior Elevations", discipline: "interior" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
      rooms: [{ roomName: "Guest Room", confidence: 80, evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A8.1", sheetTitle: "Finish Plan", excerpt: "Guest room finish plan" })] }],
      tradeFindings: [
        {
          trade: "painting",
          label: "Guest room wall finish takeoff",
          quantity: 1400,
          unit: "sqft",
          category: "wall_area",
          notes: ["Measured guest room wall area."],
          confidence: 88,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A8.1", sheetTitle: "Finish Plan", excerpt: "Measured guest room wall finish area" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
      schedules: [
        {
          scheduleType: "finish",
          label: "Finish schedule",
          quantity: null,
          notes: ["Guest room finish matrix."],
          confidence: 82,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", excerpt: "Guest room finish matrix" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 3,
      sheetNumber: "A9.1",
      sheetTitle: "Interior Elevations",
      discipline: "interior",
      tradeFindings: [
        {
          trade: "wallcovering",
          label: "Accent wall elevation area",
          quantity: 120,
          unit: "sqft",
          category: "selected_elevation_area",
          notes: ["Selected elevation only."],
          confidence: 76,
          evidence: [makeEvidence({ sourcePageNumber: 3, pageNumber: 3, sheetNumber: "A9.1", sheetTitle: "Interior Elevations", excerpt: "Accent wall elevation" })],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Refresh guest room finishes.",
    trade: "painting",
  })

  const pkg = result.estimatorPackages?.find((item) => item.key === "guest-room-finish-package")
  assert(pkg)
  assert.equal(pkg?.supportType, "quantity_backed")
  assert.equal(pkg?.scopeBreadth, "broad")
  assert.match(String(pkg?.quantitySummary || ""), /wall area/i)
  assert(pkg?.evidence.some((ref) => ref.sourcePageNumber === 1))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /1,400 sqft/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "bathrooms / wet areas" && /Elevation-only support stays limited/i.test(item.scopeNotes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "painting" && /finish_refresh/i.test(item.phaseTypes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "wallcovering" && /Elevation-only evidence stays narrow|narrow elevation-only scope/i.test(item.confirmationNotes.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "guest_room_finish" && item.trades.includes("painting") && item.trades.includes("wallcovering")))
  assert(!result.planReadback?.groupedScopeReadback.some((item) => item.trades.includes("electrical")))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.scopeGroupKey === "guest_room_finish" && /wallcovering|full-room/i.test(`${item.title} ${item.narration} ${item.confirmationPrompt}`)))
  assert(!result.detectedTrades.includes("electrical"))
})

test("repeated room support produces a prototype-backed guest room package when direct quantities are not yet measured", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "A5.1", sheetTitle: "Typical Guest Room Plan", discipline: "architectural" }),
    makeSheet({ pageNumber: 2, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", discipline: "finish" }),
    makeSheet({ pageNumber: 3, sheetNumber: "A6.1", sheetTitle: "Reflected Ceiling Plan", discipline: "finish" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A5.1",
      sheetTitle: "Typical Guest Room Plan",
      discipline: "architectural",
      textSnippets: ["Typical guest room plan"],
      rooms: [{ roomName: "Guest Room", confidence: 84, evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A5.1", sheetTitle: "Typical Guest Room Plan", excerpt: "Typical guest room plan" })] }],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
      schedules: [
        {
          scheduleType: "finish",
          label: "Finish schedule",
          quantity: null,
          notes: ["Guest room repaint matrix."],
          confidence: 80,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", excerpt: "Guest room repaint matrix" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 3,
      sheetNumber: "A6.1",
      sheetTitle: "Reflected Ceiling Plan",
      discipline: "finish",
      textSnippets: ["Typical guest room reflected ceiling plan"],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Repaint typical guest rooms.",
    trade: "painting",
  })

  const pkg = result.estimatorPackages?.find((item) => item.key === "guest-room-finish-package")
  assert(pkg)
  assert.equal(pkg?.supportType, "scaled_prototype")
  assert.equal(pkg?.roomGroup, "guest room")
  assert(pkg?.executionNotes.some((item) => /prototype\/repeated-room support/i.test(item)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /not measured totals/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "painting" && /scale-oriented/i.test(item.supportNarration.join(" "))))
})

test("wallcovering trade readback stays distinct from generic paint and finish narration", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", discipline: "finish" }),
    makeSheet({ pageNumber: 2, sheetNumber: "A9.2", sheetTitle: "Feature Wall Elevations", discipline: "interior" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A8.2",
      sheetTitle: "Finish Schedule",
      discipline: "finish",
      schedules: [
        {
          scheduleType: "finish",
          label: "Finish schedule",
          quantity: null,
          notes: ["Wallcovering finish matrix."],
          confidence: 80,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", excerpt: "Wallcovering finish schedule" })],
        },
      ],
      tradeFindings: [
        {
          trade: "wallcovering",
          label: "Wallcovering finish referenced",
          quantity: null,
          unit: "unknown",
          notes: ["Wallcovering finish schedule reference."],
          confidence: 76,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A8.2", sheetTitle: "Finish Schedule", excerpt: "WC-1 finish reference" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A9.2",
      sheetTitle: "Feature Wall Elevations",
      discipline: "interior",
      tradeFindings: [
        {
          trade: "wallcovering",
          label: "Feature wall wallcovering elevation",
          quantity: 210,
          unit: "sqft",
          category: "selected_elevation_area",
          notes: ["Feature wall elevation only."],
          confidence: 82,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A9.2", sheetTitle: "Feature Wall Elevations", excerpt: "Feature wall WC-1 elevation area" })],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Install feature wallcovering.",
    trade: "wallcovering",
  })

  const wallcovering = result.planReadback?.tradeScopeReadback.find((item) => item.trade === "wallcovering")
  assert(wallcovering)
  assert.equal(wallcovering.role, "likely primary")
  assert(/210 sqft/i.test(wallcovering.quantityNarration.join(" ")))
  assert(/narrow|Elevation-only/i.test(wallcovering.confirmationNotes.join(" ")))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.gapKey === "wallcovering-partial-authority" && /feature-wall|full room|full-room/i.test(item.confirmationPrompt)))
  assert(!result.planReadback?.tradeScopeReadback.some((item) => item.trade === "painting"))
})

test("wet-area package stays narrow when elevations and bath schedules support only vertical or bath-specific scope", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "P2.0", sheetTitle: "Fixture Schedule", discipline: "plumbing" }),
    makeSheet({ pageNumber: 2, sheetNumber: "A9.1", sheetTitle: "Bath Elevations", discipline: "interior" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "P2.0",
      sheetTitle: "Fixture Schedule",
      discipline: "plumbing",
      schedules: [
        {
          scheduleType: "fixture",
          label: "Fixture schedule",
          quantity: null,
          notes: ["Bath fixture schedule."],
          confidence: 78,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "P2.0", sheetTitle: "Fixture Schedule", excerpt: "Bath fixture schedule" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A9.1",
      sheetTitle: "Bath Elevations",
      discipline: "interior",
      rooms: [{ roomName: "Bathroom", confidence: 81, evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A9.1", sheetTitle: "Bath Elevations", excerpt: "Bath elevation" })] }],
      tradeFindings: [
        {
          trade: "tile",
          label: "Shower tile elevation",
          quantity: 96,
          unit: "sqft",
          category: "selected_elevation_area",
          notes: ["Vertical tile from bath elevation only."],
          confidence: 84,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A9.1", sheetTitle: "Bath Elevations", excerpt: "Shower tile elevation only" })],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Guest bath tile refresh.",
    trade: "tile",
  })

  const pkg = result.estimatorPackages?.find((item) => item.key === "wet-area-package")
  assert(pkg)
  assert.equal(pkg?.supportType, "elevation_only")
  assert.equal(pkg?.scopeBreadth, "narrow")
  assert(pkg?.cautionNotes.some((item) => /stay narrower than full-room/i.test(item)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "bathrooms / wet areas" && /96 sqft/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "bathrooms / wet areas" && /shown wall\/wet-area surfaces/i.test(item.scopeNotes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "tile" && /wet_area/.test(item.phaseTypes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "tile" && /full-room authority/i.test(item.confirmationNotes.join(" "))))
})

test("demo package stays separate from install-oriented finish packages", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "A1.1", sheetTitle: "Demo Plan", discipline: "architectural" }),
    makeSheet({ pageNumber: 2, sheetNumber: "A8.1", sheetTitle: "Finish Plan", discipline: "finish" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A1.1",
      sheetTitle: "Demo Plan",
      discipline: "architectural",
      tradeFindings: [
        {
          trade: "flooring",
          label: "Selective floor demolition area",
          quantity: 640,
          unit: "sqft",
          category: "demolition_area",
          notes: ["Removal only."],
          confidence: 82,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A1.1", sheetTitle: "Demo Plan", excerpt: "Selective floor demolition area" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
      tradeFindings: [
        {
          trade: "flooring",
          label: "Guest room flooring area",
          quantity: 1200,
          unit: "sqft",
          category: "floor_area",
          notes: ["Install-side floor area."],
          confidence: 85,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A8.1", sheetTitle: "Finish Plan", excerpt: "Guest room floor finish area" })],
        },
      ],
      rooms: [{ roomName: "Guest Room", confidence: 80, evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A8.1", sheetTitle: "Finish Plan", excerpt: "Guest room finish area" })] }],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Remove and replace guest room flooring.",
    trade: "flooring",
  })

  const demoPkg = result.estimatorPackages?.find((item) => item.key === "demo-removal-package")
  const finishPkg = result.estimatorPackages?.find((item) => item.key === "guest-room-finish-package")
  assert(demoPkg)
  assert.equal(demoPkg?.supportType, "demo_only")
  assert(demoPkg?.cautionNotes.some((item) => /does not create install authority/i.test(item)))
  assert(finishPkg)
  assert.equal(finishPkg?.supportType, "quantity_backed")
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "demo / removal zones" && /640 sqft/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "demo / removal zones" && /does not create install quantity authority/i.test(item.scopeNotes.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "guest rooms" && /1,200 sqft/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "flooring" && /demo_removal/.test(item.phaseTypes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "flooring" && /separate from install authority/i.test(item.confirmationNotes.join(" "))))
  const demoGroup = result.planReadback?.groupedScopeReadback.find((item) => item.groupKey === "demo_removal")
  const finishGroup = result.planReadback?.groupedScopeReadback.find((item) => item.groupKey === "guest_room_finish")
  assert(demoGroup)
  assert(finishGroup)
  assert(/640 sqft/i.test(demoGroup.directSupport.join(" ")))
  assert(/removal-only|install authority/i.test(demoGroup.confirmationNotes.join(" ")))
  assert(/1,200 sqft/i.test(finishGroup.directSupport.join(" ")))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.scopeGroupKey === "demo_removal" && /Do not convert demolition\/removal scope into install pricing/i.test(item.confirmationPrompt)))
})

test("corridor and common-area support stays separate from guest room interior quantity readback", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "A8.1", sheetTitle: "Finish Plan", discipline: "finish" }),
    makeSheet({ pageNumber: 2, sheetNumber: "A8.3", sheetTitle: "Corridor Finish Plan", discipline: "finish" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A8.1",
      sheetTitle: "Finish Plan",
      discipline: "finish",
      rooms: [{ roomName: "Guest Room", confidence: 82, evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A8.1", sheetTitle: "Finish Plan", excerpt: "Guest room finish plan" })] }],
      tradeFindings: [
        {
          trade: "painting",
          label: "Guest room wall finish takeoff",
          quantity: 900,
          unit: "sqft",
          category: "wall_area",
          notes: ["Guest room interior walls."],
          confidence: 84,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A8.1", sheetTitle: "Finish Plan", excerpt: "Guest room wall finish area" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "A8.3",
      sheetTitle: "Corridor Finish Plan",
      discipline: "finish",
      rooms: [{ roomName: "Corridor", confidence: 86, evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A8.3", sheetTitle: "Corridor Finish Plan", excerpt: "Corridor finish plan" })] }],
      tradeFindings: [
        {
          trade: "painting",
          label: "Corridor wall finish takeoff",
          quantity: 700,
          unit: "sqft",
          category: "corridor_area",
          notes: ["Corridor walls only."],
          confidence: 84,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "A8.3", sheetTitle: "Corridor Finish Plan", excerpt: "Corridor wall finish area" })],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Paint guest rooms and corridors.",
    trade: "painting",
  })

  const guestRoom = result.planReadback?.areaQuantityReadback.find((item) => item.areaGroup === "guest rooms")
  const corridor = result.planReadback?.areaQuantityReadback.find((item) => item.areaGroup === "corridors")
  assert(guestRoom)
  assert(corridor)
  assert(/900 sqft/i.test(guestRoom.quantityNarration.join(" ")))
  assert(!/700 sqft/i.test(guestRoom.quantityNarration.join(" ")))
  assert(/700 sqft/i.test(corridor.quantityNarration.join(" ")))
  const painting = result.planReadback?.tradeScopeReadback.find((item) => item.trade === "painting")
  assert(painting)
  assert(/guest rooms/i.test(painting.areaGroups.join(" ")))
  assert(/corridors/i.test(painting.areaGroups.join(" ")))
  assert(/900 sqft/i.test(painting.quantityNarration.join(" ")))
  assert(/700 sqft/i.test(painting.quantityNarration.join(" ")))
  const groupedGuest = result.planReadback?.groupedScopeReadback.find((item) => item.groupKey === "guest_room_finish")
  const groupedCorridor = result.planReadback?.groupedScopeReadback.find((item) => item.groupKey === "corridor_common")
  assert(groupedGuest)
  assert(groupedCorridor)
  assert(/900 sqft/i.test(groupedGuest.directSupport.join(" ")))
  assert(!/700 sqft/i.test(groupedGuest.directSupport.join(" ")))
  assert(/700 sqft/i.test(groupedCorridor.directSupport.join(" ")))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.gapKey === "corridor-separate-from-rooms" && /does not imply guest-room-wide authority/i.test(item.narration)))
})

test("electrical reflected ceiling and schedule support synthesize into a ceiling-light-fixture package without crossing trades", () => {
  const sheetIndex = [
    makeSheet({ pageNumber: 1, sheetNumber: "A6.1", sheetTitle: "Reflected Ceiling Plan", discipline: "finish" }),
    makeSheet({ pageNumber: 2, sheetNumber: "E1.0", sheetTitle: "Electrical Schedule", discipline: "electrical" }),
  ]

  const analyses = [
    makeAnalysis({
      pageNumber: 1,
      sheetNumber: "A6.1",
      sheetTitle: "Reflected Ceiling Plan",
      discipline: "finish",
      textSnippets: ["Reflected ceiling plan guest room lights"],
      tradeFindings: [
        {
          trade: "painting",
          label: "Ceiling area noted",
          quantity: 500,
          unit: "sqft",
          category: "ceiling_area",
          notes: ["Ceiling repaint scope."],
          confidence: 70,
          evidence: [makeEvidence({ sourcePageNumber: 1, pageNumber: 1, sheetNumber: "A6.1", sheetTitle: "Reflected Ceiling Plan", excerpt: "Ceiling area noted" })],
        },
      ],
    }),
    makeAnalysis({
      pageNumber: 2,
      sheetNumber: "E1.0",
      sheetTitle: "Electrical Schedule",
      discipline: "electrical",
      schedules: [
        {
          scheduleType: "electrical",
          label: "Electrical schedule",
          quantity: 18,
          notes: ["Lighting devices and fixtures."],
          confidence: 84,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "E1.0", sheetTitle: "Electrical Schedule", excerpt: "18 light fixtures and devices" })],
        },
      ],
      tradeFindings: [
        {
          trade: "electrical",
          label: "Lighting fixture count",
          quantity: 18,
          unit: "devices",
          category: "electrical_fixture_count",
          notes: ["Schedule-backed fixture count."],
          confidence: 86,
          evidence: [makeEvidence({ sourcePageNumber: 2, pageNumber: 2, sheetNumber: "E1.0", sheetTitle: "Electrical Schedule", excerpt: "18 light fixtures" })],
        },
      ],
    }),
  ]

  const result = buildMergedPlanIntelligence({
    sheetIndex,
    analyses,
    scopeText: "Update ceiling lights.",
    trade: "electrical",
  })

  const pkg = result.estimatorPackages?.find((item) => item.key === "ceiling-light-fixture-package")
  assert(pkg)
  assert.equal(pkg?.primaryTrade, "electrical")
  assert.equal(pkg?.scopeBreadth, "narrow")
  assert(pkg?.cautionNotes.some((item) => /not inflate unrelated finish or drywall authority/i.test(item)))
  assert(!result.detectedTrades.includes("plumbing"))
  assert(result.planReadback?.tradeNarration.some((item) => item.trade === "electrical" && /likely primary/i.test(item.confidence)))
  assert(result.planReadback?.packageReadback.some((item) => /Ceiling \/ light \/ fixture package/i.test(item.narration)))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "ceiling / fixture zones" && /18 devices/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.areaQuantityReadback.some((item) => item.areaGroup === "ceiling / fixture zones" && /18.*scheduled item/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "electrical" && /ceiling_fixture/.test(item.phaseTypes.join(" "))))
  assert(result.planReadback?.tradeScopeReadback.some((item) => item.trade === "electrical" && /18 devices/i.test(item.quantityNarration.join(" "))))
  assert(result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "ceiling_fixture" && item.trades.includes("electrical") && /18 devices/i.test(item.directSupport.join(" "))))
  assert(!result.planReadback?.groupedScopeReadback.some((item) => item.groupKey === "ceiling_fixture" && item.trades.includes("plumbing")))
  assert(result.planReadback?.scopeGapReadback.some((item) => item.gapKey === "electrical-install-extent" && /branch|trim|fixture/i.test(item.confirmationPrompt)))
  assert(!result.planReadback?.tradeScopeReadback.some((item) => item.trade === "plumbing"))
  assert(!result.planReadback?.tradeNarration.some((item) => item.trade === "plumbing"))
})
