import test from "node:test"
import assert from "node:assert/strict"

import { buildCustomerScopeTradeDriftWarning } from "./customer-scope-drift"
import type { EstimateStructuredSection, ScopeXRay, UiTrade } from "./types"

const baseScopeXRay = (splitScopes: Array<{ trade: string; scope: string }> = []): ScopeXRay =>
  ({
    detectedScope: {
      primaryTrade: "",
      splitScopes,
      paintScope: null,
      state: "",
    },
    quantities: [],
    pricingMethod: {
      pricingSource: "ai",
      detSource: null,
      anchorId: null,
      verified: false,
      stateAdjusted: false,
    },
    scheduleLogic: {},
  } as unknown as ScopeXRay)

const section = (trade: string): EstimateStructuredSection => ({
  trade,
  section: `${trade} section`,
  label: `${trade} section`,
  pricingBasis: "direct",
  estimatorTreatment: "section_row",
  amount: 1000,
  labor: 700,
  materials: 300,
  subs: 0,
  notes: [],
})

const planReadback = (trade: string, supportLevel: "direct" | "reinforced" | "review" = "direct") => ({
  detectedTrades: [],
  planReadback: {
    tradeScopeReadback: [
      {
        trade,
        supportLevel,
      },
    ],
  },
})

function warning({
  selectedTrade = "general_renovation",
  writtenScope = "General renovation in one bathroom.",
  resultText,
  estimateSections = null,
  scopeXRay = baseScopeXRay(),
  planIntelligence = null,
}: {
  selectedTrade?: UiTrade
  writtenScope?: string
  resultText: string
  estimateSections?: EstimateStructuredSection[] | null
  scopeXRay?: ScopeXRay
  planIntelligence?: any
}) {
  return buildCustomerScopeTradeDriftWarning({
    selectedTrade,
    writtenScope,
    resultText,
    estimateSections,
    scopeXRay,
    planIntelligence,
  })
}

test("preserves electrical unsupported drift warning behavior", () => {
  const message = warning({
    resultText: "Customer-facing scope includes electrical rough-in and electrical trade coordination.",
  })

  assert.match(message || "", /electrical/)
  assert.match(message || "", /not strongly supported/)
})

test("does not warn when selected trade supports electrical", () => {
  assert.equal(
    warning({
      selectedTrade: "electrical",
      resultText: "Customer-facing scope includes electrical rough-in.",
    }),
    null
  )
})

test("warns for unsupported plumbing drift", () => {
  assert.match(
    warning({
      resultText: "Customer-facing scope includes plumbing rough-in and drain work.",
    }) || "",
    /plumbing/
  )
})

test("warns for unsupported drywall drift", () => {
  assert.match(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint 3 bedrooms.",
      resultText: "Customer-facing scope includes drywall texture match and finish level work.",
    }) || "",
    /drywall/
  )
})

test("warns for unsupported flooring drift", () => {
  assert.match(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and faucet.",
      resultText: "Customer-facing scope includes LVP flooring installation.",
    }) || "",
    /flooring/
  )
})

test("warns for unsupported painting drift", () => {
  assert.match(
    warning({
      selectedTrade: "flooring",
      writtenScope: "Install 650 sq ft LVP.",
      resultText: "Customer-facing scope includes painting walls and trim.",
    }) || "",
    /painting/
  )
})

test("warns for unsupported bathroom tile drift", () => {
  assert.match(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace vanity faucet.",
      resultText: "Customer-facing scope includes shower tile, grout, and waterproofing.",
    }) || "",
    /bathroom\/tile/
  )
})

test("warns for unsupported demolition drift", () => {
  assert.match(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint one bedroom.",
      resultText: "Customer-facing scope includes demolition and tear-out of existing finishes.",
    }) || "",
    /demolition/
  )
})

test("warns for unsupported carpentry drift", () => {
  assert.match(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint the office walls.",
      resultText: "Customer-facing scope includes framing, blocking, and carpentry work.",
    }) || "",
    /carpentry/
  )
})

test("warns for unsupported wallcovering drift", () => {
  assert.match(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint the hallway walls.",
      resultText: "Customer-facing scope includes vinyl wallcovering and pattern repeat layout.",
    }) || "",
    /wallcovering/
  )
})

test("suppresses warning when written scope strongly supports the trade", () => {
  assert.equal(
    warning({
      writtenScope: "Replace 1 toilet, 1 faucet, and reconnect sink drain.",
      resultText: "Customer-facing scope includes plumbing fixture replacement.",
    }),
    null
  )
})

test("suppresses warning when priced section trade supports the trade", () => {
  assert.equal(
    warning({
      resultText: "Customer-facing scope includes drywall texture match.",
      estimateSections: [section("drywall")],
    }),
    null
  )
})

test("suppresses warning when scopeXRay split scope strongly supports the trade", () => {
  assert.equal(
    warning({
      resultText: "Customer-facing scope includes LVP flooring installation.",
      scopeXRay: baseScopeXRay([{ trade: "flooring", scope: "Install 650 sq ft LVP flooring with transitions." }]),
    }),
    null
  )
})

test("suppresses warning when direct plan readback supports the trade", () => {
  assert.equal(
    warning({
      resultText: "Customer-facing scope includes vinyl wallcovering.",
      planIntelligence: planReadback("wallcovering", "direct"),
    }),
    null
  )
})

test("suppresses warning when reinforced plan readback supports the trade", () => {
  assert.equal(
    warning({
      resultText: "Customer-facing scope includes painting walls and ceilings.",
      planIntelligence: planReadback("painting", "reinforced"),
    }),
    null
  )
})

test("does not suppress warning from detectedTrades alone", () => {
  assert.match(
    warning({
      resultText: "Customer-facing scope includes electrical rough-in.",
      planIntelligence: {
        detectedTrades: ["electrical"],
        planReadback: {
          tradeScopeReadback: [],
        },
      },
    }) || "",
    /electrical/
  )
})

test("does not warn when trade language is clearly excluded or by others", () => {
  assert.equal(
    warning({
      resultText: "Electrical excluded. Plumbing by others. Drywall repair not included. Paint excluded.",
    }),
    null
  )
})

test("does not warn on normal removal language inside supported flooring scope", () => {
  assert.equal(
    warning({
      selectedTrade: "flooring",
      writtenScope: "Install 650 sq ft LVP flooring.",
      resultText: "Remove existing flooring and install 650 sq ft LVP.",
    }),
    null
  )
})

test("does not warn on bathroom or fixture by itself", () => {
  assert.equal(
    warning({
      resultText: "Customer-facing scope covers bathroom fixture coordination.",
    }),
    null
  )
})

test("combines multiple unsupported trades into one compact warning", () => {
  const message = warning({
    selectedTrade: "painting",
    writtenScope: "Paint one bedroom.",
    resultText: "Customer-facing scope includes electrical rough-in, plumbing drains, and LVP flooring.",
  })

  assert.match(message || "", /electrical and plumbing and 1 other trade/)
})
