import test from "node:test"
import assert from "node:assert/strict"

import type { EstimateStructuredSection } from "./types"
import { buildPlanPricingCarryReadback, type PlanPricingCarryInput } from "./plan-pricing-carry"

const evidence = {
  uploadId: "u1",
  uploadName: "plans.pdf",
  sourcePageNumber: 4,
  pageNumber: 2,
  sheetNumber: "A2.1",
  sheetTitle: "Finish Plan",
  excerpt: "Guest room finish support",
  confidence: 0.9,
}

const baseReadback = (): PlanPricingCarryInput => ({
  tradeScopeReadback: [
    {
      trade: "painting",
      role: "likely primary",
      supportLevel: "direct",
      phaseTypes: ["finish_refresh", "guest_room"],
      areaGroups: ["guest rooms"],
      narration: "Painting appears supported around guest rooms.",
      quantityNarration: ["1,800 sqft directly supported."],
      supportNarration: [],
      confirmationNotes: [],
      evidence: [evidence],
    },
    {
      trade: "wallcovering",
      role: "supporting",
      supportLevel: "review",
      phaseTypes: ["finish_refresh"],
      areaGroups: ["guest rooms"],
      narration: "Wallcovering appears as feature-wall support.",
      quantityNarration: [],
      supportNarration: ["Feature wall support is visible."],
      confirmationNotes: ["Confirm whether this is full-room or feature-wall only."],
      evidence: [{ ...evidence, sheetNumber: "A8.2", sourcePageNumber: 8 }],
    },
  ],
  groupedScopeReadback: [
    {
      groupKey: "guest_room_finish",
      title: "Guest Room Finish Scope",
      role: "primary",
      supportLevel: "direct",
      scopeCharacter: ["finish_refresh", "guest_room"],
      trades: ["painting", "wallcovering"],
      areaGroups: ["guest rooms"],
      narration: "Guest room finish work appears grouped.",
      directSupport: ["Painting direct support is present."],
      reinforcedSupport: ["Wallcovering remains feature-wall context."],
      confirmationNotes: ["Confirm wallcovering breadth."],
      evidence: [evidence],
    },
  ],
  scopeGapReadback: [
    {
      gapKey: "wallcovering-partial-authority",
      title: "Wallcovering may be partial",
      status: "risky_assumption",
      scopeGroupKey: "guest_room_finish",
      trades: ["wallcovering"],
      areaGroups: ["guest rooms"],
      narration: "Wallcovering support appears specific.",
      confirmationPrompt: "Confirm feature-wall versus full-room coverage.",
      evidence: [{ ...evidence, sheetNumber: "A8.2", sourcePageNumber: 8 }],
    },
  ],
})

const section = (overrides: Partial<EstimateStructuredSection>): EstimateStructuredSection => ({
  trade: "painting",
  section: "Guest room walls",
  label: "Guest room walls",
  pricingBasis: "direct",
  estimatorTreatment: "section_row",
  amount: 4200,
  labor: 3000,
  materials: 900,
  subs: 300,
  unit: "sqft",
  quantity: 1800,
  notes: [],
  provenance: {
    quantitySupport: "measured",
    sourceBasis: ["trade_finding"],
    summary: "Measured painting support from finish plan.",
    roomGroupBasis: "guest rooms",
  },
  ...overrides,
})

test("pricing carry readback distinguishes carried trade rows from visible uncarried trade support", () => {
  const readback = buildPlanPricingCarryReadback({
    planReadback: baseReadback(),
    estimateSections: [section({})],
  })

  assert(readback.some((item) => item.status === "directly_carried" && item.trade === "painting" && /priced section row/i.test(item.narration)))
  assert(readback.some((item) => item.status === "confirmation_needed" && item.trade === "wallcovering" && /not being treated as full priced scope/i.test(item.narration)))
  assert(readback.some((item) => item.title === "Wallcovering may be partial" && /Confirm feature-wall/i.test(item.narration)))
  assert(readback.some((item) => item.evidence.some((ref) => ref.sourcePageNumber === 8)))
})

test("embedded burden rows stay separate from direct pricing carry", () => {
  const readback = buildPlanPricingCarryReadback({
    planReadback: baseReadback(),
    estimateSections: [
      section({
        trade: "painting",
        section: "Corridor access burden",
        label: "Corridor access burden",
        pricingBasis: "burden",
        estimatorTreatment: "embedded_burden",
        amount: 650,
        quantity: undefined,
        unit: undefined,
        provenance: {
          quantitySupport: "support_only",
          sourceBasis: ["trade_finding"],
          summary: "Embedded corridor/common-area support.",
          roomGroupBasis: "corridors",
        },
      }),
    ],
  })

  assert(readback.some((item) => item.status === "reinforced_or_embedded" && /embedded pricing support/i.test(item.narration)))
  assert(!readback.some((item) => item.status === "directly_carried"))
})

test("wet-area schedule and elevation support can leave one trade not carried without broadening authority", () => {
  const wetReadback: PlanPricingCarryInput = {
    tradeScopeReadback: [
      {
        trade: "tile",
        role: "likely primary",
        supportLevel: "direct",
        phaseTypes: ["wet_area"],
        areaGroups: ["bathrooms / wet areas"],
        narration: "Tile support is limited to shown wet walls.",
        quantityNarration: ["96 sqft elevation quantity."],
        supportNarration: [],
        confirmationNotes: ["Elevation-only evidence stays narrow."],
        evidence: [evidence],
      },
      {
        trade: "plumbing",
        role: "supporting",
        supportLevel: "reinforced",
        phaseTypes: ["wet_area"],
        areaGroups: ["bathrooms / wet areas"],
        narration: "Plumbing schedule reinforces fixture context.",
        quantityNarration: ["6 fixtures scheduled."],
        supportNarration: ["Schedule support is context."],
        confirmationNotes: ["Confirm install extent."],
        evidence: [evidence],
      },
    ],
    groupedScopeReadback: [
      {
        groupKey: "wet_area",
        title: "Wet-Area / Bathroom Scope",
        role: "primary",
        supportLevel: "direct",
        scopeCharacter: ["wet_area"],
        trades: ["tile", "plumbing"],
        areaGroups: ["bathrooms / wet areas"],
        narration: "Wet-area group is narrow.",
        directSupport: ["Tile elevation quantity is direct."],
        reinforcedSupport: ["Plumbing schedule reinforces context."],
        confirmationNotes: ["Do not price outside shown surfaces."],
        evidence: [evidence],
      },
    ],
    scopeGapReadback: [],
  }

  const readback = buildPlanPricingCarryReadback({
    planReadback: wetReadback,
    estimateSections: [section({ trade: "tile", section: "Shower walls", label: "Shower walls", quantity: 96 })],
  })

  assert(readback.some((item) => item.trade === "tile" && item.status === "directly_carried"))
  assert(readback.some((item) => item.trade === "plumbing" && item.status === "confirmation_needed" && /reinforced\/review-only/i.test(item.narration)))
})

test("demo and install pricing carry stay separated by section row", () => {
  const demoReadback = baseReadback()
  demoReadback.tradeScopeReadback = [
    {
      trade: "flooring",
      role: "likely primary",
      supportLevel: "direct",
      phaseTypes: ["demo_removal"],
      areaGroups: ["demo / removal zones"],
      narration: "Flooring demolition is visible.",
      quantityNarration: ["640 sqft removal area."],
      supportNarration: [],
      confirmationNotes: ["Removal does not create install authority."],
      evidence: [evidence],
    },
  ]
  demoReadback.groupedScopeReadback = [
    {
      groupKey: "demo_removal",
      title: "Demo / Removal Scope",
      role: "primary",
      supportLevel: "direct",
      scopeCharacter: ["demo_removal"],
      trades: ["flooring"],
      areaGroups: ["demo / removal zones"],
      narration: "Removal scope is separate.",
      directSupport: ["640 sqft removal area."],
      reinforcedSupport: [],
      confirmationNotes: ["Keep install separate."],
      evidence: [evidence],
    },
  ]
  demoReadback.scopeGapReadback = []

  const readback = buildPlanPricingCarryReadback({
    planReadback: demoReadback,
    estimateSections: [
      section({
        trade: "flooring",
        section: "Flooring removal",
        label: "Flooring removal",
        quantity: 640,
        provenance: {
          quantitySupport: "measured",
          sourceBasis: ["trade_finding"],
          summary: "Removal-only measured support.",
          supportCategory: "demolition_area",
        },
      }),
    ],
  })

  assert(readback.some((item) => item.status === "directly_carried" && /Flooring removal/i.test(item.title)))
  assert(!readback.some((item) => /install pricing/i.test(item.narration)))
})
