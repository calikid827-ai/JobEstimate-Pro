import test from "node:test"
import assert from "node:assert/strict"

import {
  buildCustomerScopeReviewGuard,
  buildCustomerScopeTradeDriftWarning,
} from "./customer-scope-drift"
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

function guard({
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
  return buildCustomerScopeReviewGuard({
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

test("warns for explicit electrical exclusion conflicts", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope: "Bathroom refresh. Electrical by others.",
    resultText: "Customer-facing scope includes electrical rough-in and new wiring.",
  })

  assert.match(review.summary || "", /exclude electrical work|electrical system work/i)
  assert.match(review.warnings.map((item) => item.label).join(" | "), /Excluded scope conflict/)
})

test("warns for explicit plumbing exclusion conflicts", () => {
  const review = guard({
    selectedTrade: "bathroom_tile",
    writtenScope: "Retile shower walls. Plumbing excluded and plumbing by others.",
    resultText: "Customer-facing scope includes plumbing rough-in, supply lines, and drain work.",
  })

  assert.match(review.summary || "", /plumbing system work/i)
  assert.match(review.warnings.map((item) => item.label).join(" | "), /Excluded scope conflict/)
})

test("warns when excluded wall or floor repair appears in customer scope", () => {
  const review = guard({
    selectedTrade: "plumbing",
    writtenScope: "Replace toilet and faucet. Wall repair excluded. Floor repair by others.",
    resultText: "Customer-facing scope includes drywall repair, floor repair, and carpentry repair.",
  })

  assert.match(review.summary || "", /exclude wall, floor, drywall, flooring, or carpentry repair/i)
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

test("does not warn for painting scope with minor nail-hole patching", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint 3 bedrooms. Walls only. Minor nail-hole patching. Two coats.",
      resultText: "Customer-facing scope includes surface protection, minor nail-hole patching, priming, and two coats of paint.",
    }),
    null
  )
})

test("warns when painting scope expands into drywall skim coat or texture match", () => {
  const review = guard({
    selectedTrade: "painting",
    writtenScope: "Paint 3 bedrooms. Walls only. Minor nail-hole patching. Two coats.",
    resultText: "Customer-facing scope includes drywall repair, skim coat, texture match, and level 4 finish before painting.",
  })

  assert.match(review.summary || "", /drywall|skim coat|texture/i)
  assert.match(review.warnings.map((item) => item.label).join(" | "), /Adjacent drywall expansion/)
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

test("does not warn for flooring scope with base shoe and transitions", () => {
  assert.equal(
    warning({
      selectedTrade: "flooring",
      writtenScope: "Install 650 sq ft LVP. Remove carpet. Include transitions and base shoe. Owner supplies flooring.",
      resultText: "Customer-facing scope includes carpet removal, LVP installation, transitions, base shoe, protection, and cleanup.",
    }),
    null
  )
})

test("warns when flooring scope expands into baseboard replacement or painting", () => {
  const review = guard({
    selectedTrade: "flooring",
    writtenScope: "Install 650 sq ft LVP. Remove carpet. Include transitions and base shoe. Owner supplies flooring.",
    resultText: "Customer-facing scope includes LVP installation, baseboard replacement, carpentry work, and painting trim.",
  })

  assert.match(review.summary || "", /baseboard replacement|painting|carpentry/i)
  assert.match(review.warnings.map((item) => item.label).join(" | "), /Adjacent flooring expansion/)
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

test("warns when bathroom tile scope expands into unsupported electrical or plumbing rough-in", () => {
  const message = warning({
    selectedTrade: "bathroom_tile",
    writtenScope: "Retile shower walls and floor. Waterproofing included. Plumbing and electrical by others.",
    resultText: "Customer-facing scope includes tile waterproofing, electrical rough-in, and plumbing rough-in.",
  })

  assert.match(message || "", /electrical|plumbing/)
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

test("general renovation does not automatically support every trade", () => {
  const message = warning({
    selectedTrade: "general_renovation",
    writtenScope: "Replace toilet, vanity faucet, and shower trim. Owner supplies fixtures.",
    resultText: "Customer-facing scope includes flooring installation, baseboard replacement, and painting walls.",
  })

  assert.match(message || "", /flooring|painting|carpentry/)
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
