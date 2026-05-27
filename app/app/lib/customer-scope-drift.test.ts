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

test("warns when excluded electrical expands into device and wiring removal or replacement", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope: "Bathroom refresh. Electrical coordination only. Electrical by others.",
    resultText:
      "Customer-facing scope includes removal and replacement of electrical devices and wiring affected by the work.",
  })

  assert.match(review.summary || "", /electrical system work/i)
  assert.match(review.warnings.map((item) => item.label).join(" | "), /Excluded scope conflict/)
})

test("warns when excluded electrical expands into device reinstallation and wiring adjustments", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope: "Bathroom refresh. Electrical coordination only. Electrical by others.",
    resultText:
      "Customer-facing scope includes removal and reinstallation of electrical devices and wiring adjustments to accommodate the new layout.",
  })

  assert.match(review.summary || "", /electrical system work/i)
  assert.match(review.warnings.map((item) => item.label).join(" | "), /Excluded scope conflict/)
})

test("warns when electrical coordination-only scope expands into electrical tasks and rough-in", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "Plan review only. Electrical coordination only. Electrical by others. GC to provide remaining trade work.",
    resultText:
      "Customer-facing scope says electrical tasks include the removal and reinstallation of devices and wiring. Following demolition and electrical rough-in, wiring will align with the new layout.",
  })

  assert.match(review.summary || "", /electrical/)
  assert.match(review.summary || "", /not strongly supported|electrical system work/)
})

test("warns when plan-review-only scope expands into disconnecting and reinstalling electrical devices", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "Review selected pages only. Electrical coordination only. Electrical by others. GC-provided items are not included.",
    resultText:
      "The electrical scope includes disconnecting and reinstalling devices and wiring as necessitated by the new layout, followed by electrical rough-in coordinated with drywall repairs.",
  })

  assert.match(review.summary || "", /electrical/)
  assert.match(review.summary || "", /not strongly supported|electrical system work/)
})

test("warns when plan-review-only scope expands into electrical disconnection and reinstallation", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Plan evidence review only. Owner and GC-provided items. Estimator to confirm final quantities and inclusions.",
    resultText:
      "The electrical scope includes the disconnection and reinstallation of devices and wiring necessary for the renovation, followed by electrical rough-in.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("keeps electrical unsupported warning visible when drywall drift is also present", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Drywall by others. Plan evidence review only.",
    resultText:
      "Customer-facing scope includes drywall patching, skim coat, and texture match. The electrical scope includes the disconnection and reinstallation of devices and wiring necessary for the renovation, followed by electrical rough-in.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("warns when plan-review-only scope expands into electrical fixture relocation and device adjustment", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Plan evidence review only. Owner and GC-provided items excluded. Estimator to confirm final quantities and inclusions.",
    resultText:
      "Customer-facing scope includes electrical coordination, relocation of fixtures, adjustment of devices to align with new layouts, verification of existing wiring, patching of penetrations, and sequencing demolition, electrical, drywall, and finishes.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("warns when electrical coordination expands into fixture relocation device adjustment and conduit patching", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Plan evidence review only. Owner and GC-provided items. Estimator to confirm quantities and inclusions.",
    resultText:
      "Electrical work includes coordination for the relocation of fixtures, adjustment of devices, and patching of conduit penetrations. The work sequence is followed by electrical rough-in.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("keeps electrical unsupported warning visible for fixture relocation when drywall drift is also present", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Plan evidence review only. Owner and GC-provided items. Drywall by others.",
    resultText:
      "Customer-facing scope includes drywall patching and refinishing. Electrical work includes coordination for the relocation of fixtures, adjustment of devices, and patching of conduit penetrations, followed by electrical rough-in.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("keeps electrical unsupported warning visible when noisy scope x-ray split mentions electrical only", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Plan evidence review only. Owner and GC-provided items. Estimator to confirm quantities and inclusions.",
    scopeXRay: baseScopeXRay([
      { trade: "electrical", scope: "electrical" },
      { trade: "drywall", scope: "drywall repairs" },
    ]),
    resultText:
      "Customer-facing scope includes drywall patching and refinishing. Electrical rough-in and device adjustments are executed in coordination with drywall repairs.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("keeps electrical unsupported warning visible when noisy scope x-ray split mentions coordination only", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope:
      "ADA unit renovation per selected plan pages. Electrical coordination only. Plan evidence review only. Owner and GC-provided items.",
    scopeXRay: baseScopeXRay([{ trade: "electrical", scope: "electrical coordination only" }]),
    resultText:
      "Electrical rough-in and device adjustments are executed in coordination with drywall repairs.",
  })

  const visibleText = [review.summary, ...review.warnings.map((item) => `${item.label}: ${item.message}`)].join(" ")
  assert.match(visibleText, /electrical/i)
  assert.match(visibleText, /not strongly supported|electrical system work/i)
})

test("warns when electrical coordination-only scope expands into device relocation", () => {
  const review = guard({
    selectedTrade: "general_renovation",
    writtenScope: "Electrical by others. Coordination only.",
    resultText:
      "Customer-facing scope includes electrical device relocation, wiring adjustments, and device adjustment to align with the new layout.",
  })

  assert.match(review.summary || "", /electrical/i)
  assert.match(review.summary || "", /not strongly supported|electrical system work/i)
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

test("does not warn when simple painting output mentions adjacent trades only as sequencing context", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope:
        "Paint walls only in living room and hallway. Excludes drywall repair, carpentry, flooring, trim, and baseboards.",
      resultText:
        "Customer-facing scope includes wall painting, protection, cleanup, and coordination of drywall/carpentry finishes and flooring before trim/baseboard sequencing by others.",
    }),
    null
  )
})

test("does not warn when simple painting output mentions excluded adjacent trades as coordination and sequencing context", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope:
        "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
      resultText:
        "Customer-facing scope includes wall painting, masking, floor protection, cleanup, and customer approval. Coordinate with existing drywall and carpentry trades, confirm flooring before trim/baseboard sequencing, and coordinate across drywall/carpentry activities without adding those trades to the scope.",
    }),
    null
  )
})

test("does not warn when simple painting output explicitly excludes drywall and adjacent trades", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope:
        "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
      resultText:
        "Customer-facing scope includes wall painting with surface preparation limited to cleaning and light dust removal, explicitly excluding drywall repair or texture matching. This scope does not cover drywall patching, skim coating, trim painting, ceiling painting, electrical, plumbing, flooring, or carpentry tasks. Coordinate access with existing trades and finishes, sequence work to prevent interference with ongoing activities, and account for patch/texture drying time only as a schedule consideration.",
    }),
    null
  )
})

test("does not warn when painting output mentions carpentry only as coordination or exclusion context", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope:
        "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
      resultText:
        "Customer-facing scope includes wall painting, masking, protection, cleanup, and customer approval. Coordination with ongoing drywall and carpentry activities is required to prevent interference. This scope does not include painting of ceilings, trim, doors, or any carpentry elements.",
    }),
    null
  )
})

test("does not warn when painting output mentions ongoing carpentry work only as coordination context", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope:
        "Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.",
      resultText:
        "Customer-facing scope includes wall painting, masking, protection, cleanup, and customer approval. Coordination with ongoing drywall and carpentry work is required to minimize interference and maintain proper sequencing. This scope excludes drywall repairs, texture modifications, carpentry, electrical work, plumbing, flooring, trim, and ceiling paint.",
    }),
    null
  )
})

test("does not treat ceiling or trim paint exclusions as whole-painting exclusion", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope:
        "Paint walls only in living room and hallway. Two coats, contractor-supplied paint. Excludes trim painting and ceiling paint.",
      resultText:
        "Customer-facing scope includes wall painting with two coats and explicitly excludes trim painting and ceiling painting.",
    }),
    null
  )
})

test("true whole-painting exclusion still warns when customer scope promises painting", () => {
  const review = guard({
    selectedTrade: "flooring",
    writtenScope: "Install LVP flooring. Painting excluded and painting by others.",
    resultText: "Customer-facing scope includes LVP flooring and painting walls after flooring installation.",
  })

  assert.match(review.summary || "", /painting/)
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

test("does not warn when plumbing scope mentions flooring protection only", () => {
  assert.equal(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and vanity faucet. Wall repair excluded.",
      resultText:
        "Customer-facing scope includes plumbing fixture replacement, protection for existing flooring, safeguard adjacent finishes, cleanup, and customer approval.",
    }),
    null
  )
})

test("does not warn when painting scope says flooring will be protected with drop cloths", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint 3 bedrooms. Walls only. Minor patching. Two coats.",
      resultText:
        "Customer-facing scope includes painting bedroom walls. Furniture and flooring will be protected with drop cloths before painting.",
    }),
    null
  )
})

test("does not warn when painting scope says protect floors with drop cloths", () => {
  assert.equal(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint 3 bedrooms. Walls only. Minor patching. Two coats.",
      resultText:
        "Customer-facing scope includes painting bedroom walls, covering adjacent finishes, and protect floors with drop cloths.",
    }),
    null
  )
})

test("does not warn when plumbing scope mentions no electrical interference only", () => {
  assert.equal(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and vanity faucet. Electrical by others.",
      resultText:
        "Customer-facing scope includes plumbing fixture replacement with no interference with electrical fixtures or cabinetry.",
    }),
    null
  )
})

test("does not warn when plumbing scope coordinates with electrical trade to prevent interference", () => {
  assert.equal(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and vanity faucet. Electrical by others.",
      resultText:
        "Customer-facing scope includes plumbing fixture replacement. Coordination with the electrical trade is planned to prevent interference with adjacent electrical components or wiring during plumbing work.",
    }),
    null
  )
})

test("does not warn when drywall scope mentions plumbing and electrical as independent trades", () => {
  assert.equal(
    warning({
      selectedTrade: "drywall",
      writtenScope:
        "Repair 6 drywall access patches in corridor walls. Painting by others. Electrical and plumbing by others.",
      resultText:
        "Customer-facing scope includes drywall patch repairs and cleanup. Electrical and plumbing trades will conduct their tasks independently, with coordination to allow other trades to proceed.",
    }),
    null
  )
})

test("does not warn when drywall scope says electrical and plumbing trades work independently", () => {
  assert.equal(
    warning({
      selectedTrade: "drywall",
      writtenScope:
        "Repair 6 drywall access patches in corridor walls. Painting by others. Electrical and plumbing by others.",
      resultText:
        "Customer-facing scope includes drywall patch repairs, dust protection, and cleanup. Electrical and plumbing trades will conduct their work independently. Work is sequenced to minimize disruption and allow other trades to proceed independently.",
    }),
    null
  )
})

test("true plumbing rough-in still warns from drywall scope", () => {
  assert.match(
    warning({
      selectedTrade: "drywall",
      writtenScope: "Repair 6 drywall access patches in corridor walls. Plumbing by others.",
      resultText:
        "Customer-facing scope includes drywall patch repairs and plumbing rough-in with supply and drain work.",
    }) || "",
    /plumbing/
  )
})

test("does not warn when plumbing scope avoids existing electrical wiring", () => {
  assert.equal(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and vanity faucet. Electrical by others.",
      resultText:
        "Customer-facing scope includes plumbing fixture replacement with no interference with existing electrical wiring.",
    }),
    null
  )
})

test("does not warn for painting masking context around outlets and switches", () => {
  const contextOnlyPhrases = [
    "Customer-facing scope includes painting walls with masking tape applied to trim, outlets, and switches.",
    "Customer-facing scope includes painting walls and mask outlets and switches before painting.",
    "Customer-facing scope includes painting walls and protect outlets and switches.",
    "Customer-facing scope includes painting walls and cover outlets and switches.",
    "Customer-facing scope includes painting walls, remove and reinstall outlet covers for painting only.",
    "Customer-facing scope includes painting walls, remove/reinstall outlet covers for painting only.",
    "Customer-facing scope includes painting walls, remove and reinstall switch covers for painting only.",
    "Customer-facing scope includes painting walls, remove and reinstall cover plates for painting only.",
    "Customer-facing scope includes painting walls. Outlet covers removed and reinstalled for painting only.",
    "Customer-facing scope includes painting walls. Cover plates removed/reinstalled for painting only.",
    "Customer-facing scope includes painting walls. Switch covers removed/reinstalled for painting only.",
    "Customer-facing scope includes painting walls. Electrical fixtures to remain.",
    "Customer-facing scope includes painting walls. Electrical devices will be masked and protected.",
    "Customer-facing scope includes painting walls. Electrical devices masked and protected for painting.",
    "Customer-facing scope includes painting walls. Electrical components protected for painting.",
    "Customer-facing scope includes painting walls. Coordination with the electrical trade is confined to the removal and reinstallation of outlet covers only.",
    "Customer-facing scope includes painting walls. Electrical coordination limited to outlet cover removal and reinstallation only.",
    "Customer-facing scope includes painting walls. All electrical outlet covers will be removed and reinstalled for painting only.",
    "Customer-facing scope includes painting walls. Electrical outlet covers removed/reinstalled for painting only.",
    "Customer-facing scope includes painting walls. Coordination with the electrical trade is required to manage outlet covers without causing damage to wiring or devices.",
    "Customer-facing scope includes painting walls. Electrical trade coordination to manage outlet covers only.",
    "Customer-facing scope includes painting walls. All electrical outlet covers will be removed and replaced for painting only.",
    "Customer-facing scope includes painting walls. Removal and replacement of outlet covers for painting only.",
    "Customer-facing scope includes painting walls. Coordination with the electrical trade is required to facilitate the removal and replacement of outlet covers without causing damage or interfering with existing wiring.",
    "Customer-facing scope includes painting walls. Necessary to remove and reinstall outlet covers without causing damage or disrupting wiring.",
    "Customer-facing scope includes painting walls. Outlet cover removal/replacement without causing damage to wiring.",
    "Customer-facing scope includes painting walls. Outlet covers removed/reinstalled without interfering with existing wiring.",
    "Customer-facing scope includes painting walls. No electrical work beyond outlet cover removal/replacement for painting only.",
    "Customer-facing scope includes painting walls. Electrical devices to prevent overspray or damage.",
    "Customer-facing scope includes painting walls. Electrical devices protected to prevent overspray or damage.",
    "Customer-facing scope includes painting walls. Electrical devices masked/protected to prevent paint overspray.",
    "Customer-facing scope includes painting walls. Coordination with the electrical trade is necessary to facilitate the removal and reinstallation of outlet covers without causing damage or interfering with existing wiring.",
    "Customer-facing scope includes painting walls. Coordination with electrical trade necessary to facilitate outlet cover removal/reinstallation.",
    "Customer-facing scope includes painting walls. Electrical trade coordination necessary to facilitate outlet cover handling.",
    "Customer-facing scope includes painting walls. Removal and reinstallation of outlet covers without causing damage or interfering with existing wiring.",
    "Customer-facing scope includes painting walls. Outlet cover handling without causing damage or interfering with existing wiring.",
    "Customer-facing scope includes painting walls. Outlet covers handled without damaging or disrupting wiring.",
    "Customer-facing scope includes painting walls. Outlet covers removed/reinstalled without disturbing wiring or devices.",
    "Customer-facing scope includes painting walls. Remove/reinstall outlet covers without electrical work.",
    "Customer-facing scope includes painting walls. Remove/reinstall outlet covers without rewiring or device replacement.",
    "Customer-facing scope includes painting walls. No damage to wiring or devices.",
    "Customer-facing scope includes painting walls. Wiring or devices to remain untouched.",
    "Customer-facing scope includes painting walls. Devices and wiring remain existing/to remain.",
    "Customer-facing scope includes painting walls. No rewiring or device replacement involved.",
    "Customer-facing scope includes painting walls. No electrical rewiring.",
    "Customer-facing scope includes painting walls. No device replacement.",
    "Customer-facing scope includes painting walls. No electrical work beyond outlet cover removal/reinstallation for painting only.",
    "Paint 3 bedrooms. Walls only. Remove and reinstall outlet covers for painting only. Two coats.",
  ]

  for (const resultText of contextOnlyPhrases) {
    assert.equal(
      warning({
        selectedTrade: "painting",
        writtenScope: "Paint 3 bedrooms. Walls only. Two coats. Return next day for second coat if needed.",
        resultText,
      }),
      null,
      resultText
    )
  }
})

test("true electrical work still warns from painting scope", () => {
  const trueElectricalPhrases = [
    "Customer-facing scope includes painting walls and replace outlets.",
    "Customer-facing scope includes painting walls and install outlets.",
    "Customer-facing scope includes painting walls and move switches.",
    "Customer-facing scope includes painting walls and repair wiring.",
    "Customer-facing scope includes painting walls and electrical rough-in.",
    "Customer-facing scope includes painting walls and run new wire.",
    "Customer-facing scope includes painting walls and add circuit.",
    "Customer-facing scope includes painting walls and panel work.",
    "Customer-facing scope includes painting walls and install light fixtures.",
    "Customer-facing scope includes painting walls and replace switches.",
    "Customer-facing scope includes painting walls and install switches.",
    "Customer-facing scope includes painting walls and device replacement is included.",
    "Customer-facing scope includes painting walls and wiring repair is included.",
  ]

  for (const resultText of trueElectricalPhrases) {
    assert.match(
      warning({
        selectedTrade: "painting",
        writtenScope: "Paint 3 bedrooms. Walls only. Two coats. Return next day for second coat if needed.",
        resultText,
      }) || "",
      /electrical/,
      resultText
    )
  }
})

test("does not warn when electrical scope references drywall and paint as subsequent work by others", () => {
  assert.equal(
    warning({
      selectedTrade: "electrical",
      writtenScope:
        "Electrical rough-in for vanity light. Drywall repair and paint by others after inspection.",
      resultText:
        "Customer-facing scope includes electrical rough-in. Fixture installation will occur after drywall and paint by others.",
    }),
    null
  )
})

test("does not warn when electrical scope mentions framing and finish trades only as sequencing context", () => {
  assert.equal(
    warning({
      selectedTrade: "electrical",
      writtenScope:
        "Electrical rough-in for 4 vanity lights and 2 GFCI outlets. Drywall patching and painting by others. Owner-supplied light fixtures.",
      resultText:
        "Customer-facing scope includes electrical rough-in, device installation, permit coordination, and cleanup. The sequencing of this work is coordinated to follow any rough-in or framing work and will precede finish trades.",
    }),
    null
  )
})

test("true carpentry work in electrical output still warns", () => {
  assert.match(
    warning({
      selectedTrade: "electrical",
      writtenScope: "Electrical rough-in for vanity lights.",
      resultText:
        "Customer-facing scope includes electrical rough-in plus framing repair, blocking installation, and trim replacement.",
    }) || "",
    /carpentry/
  )
})

test("does not warn when flooring scope mentions finish coordination only", () => {
  assert.equal(
    warning({
      selectedTrade: "flooring",
      writtenScope: "Install 650 sq ft LVP. Include transitions and base shoe. Owner supplies flooring.",
      resultText:
        "Customer-facing scope includes LVP installation while working around door jambs, closets, transitions, and existing baseboard finishes.",
    }),
    null
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

test("true electrical rough-in still warns when unsupported", () => {
  assert.match(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and faucet.",
      resultText: "Customer-facing scope includes electrical rough-in for vanity lighting.",
    }) || "",
    /electrical/
  )
})

test("true electrical rough-in for vanity light still warns when unsupported", () => {
  assert.match(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and faucet.",
      resultText: "Customer-facing scope includes electrical rough-in for vanity light.",
    }) || "",
    /electrical/
  )
})

test("true outlet switch and wiring installation still warns when unsupported", () => {
  assert.match(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and faucet.",
      resultText: "Customer-facing scope includes install new outlet, switch, and wiring.",
    }) || "",
    /electrical/
  )
})

test("true flooring repair still warns when unsupported", () => {
  assert.match(
    warning({
      selectedTrade: "plumbing",
      writtenScope: "Replace toilet and faucet.",
      resultText: "Customer-facing scope includes flooring repair at the vanity area.",
    }) || "",
    /flooring/
  )
})

test("true flooring installation still warns when unsupported after protection cleanup", () => {
  assert.match(
    warning({
      selectedTrade: "painting",
      writtenScope: "Paint 3 bedrooms. Walls only. Minor patching. Two coats.",
      resultText: "Customer-facing scope includes install flooring in the bedrooms after painting.",
    }) || "",
    /flooring/
  )
})

test("true baseboard replacement still warns when unsupported", () => {
  const review = guard({
    selectedTrade: "flooring",
    writtenScope: "Install 650 sq ft LVP. Include transitions only. Owner supplies flooring.",
    resultText: "Customer-facing scope includes LVP installation and baseboard replacement.",
  })

  assert.match(review.summary || "", /baseboard replacement|carpentry/i)
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

test("does not warn when demolition is limited beyond drywall patch repairs", () => {
  assert.equal(
    warning({
      selectedTrade: "drywall",
      writtenScope:
        "Repair 6 drywall access patches in corridor walls. Level 4 finish only. Texture match excluded. Painting by others. Electrical and plumbing by others.",
      resultText:
        "Customer-facing scope includes drywall access patch repairs, level 4 finish, dust protection, cleanup, and customer approval without demolition beyond patch repairs.",
    }),
    null
  )
})

test("true demolition beyond supported drywall patch repairs still warns", () => {
  assert.match(
    warning({
      selectedTrade: "drywall",
      writtenScope: "Repair 6 drywall access patches in corridor walls.",
      resultText:
        "Customer-facing scope includes demolition and tear-out of existing wall finishes before drywall patch repairs.",
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

test("does not warn on baseboard removal and disposal inside supported carpentry scope", () => {
  assert.equal(
    warning({
      selectedTrade: "carpentry",
      writtenScope:
        "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain.",
      resultText:
        "Customer-facing scope includes careful removal and disposal of existing baseboards prior to installation of new baseboards, cleanup, and customer approval.",
    }),
    null
  )
})

test("does not warn on baseboard demolition wording inside supported carpentry replacement", () => {
  assert.equal(
    warning({
      selectedTrade: "carpentry",
      writtenScope:
        "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain.",
      resultText:
        "Customer-facing scope includes flooring protection prior to demolition and careful removal and disposal of existing baseboards before installing new baseboards.",
    }),
    null
  )
})

test("does not warn when demolition is directly tied to existing baseboards", () => {
  assert.equal(
    warning({
      selectedTrade: "carpentry",
      writtenScope:
        "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain.",
      resultText:
        "Customer-facing scope includes removal of existing baseboards followed by the demolition of existing baseboards and installation of new baseboards.",
    }),
    null
  )
})

test("does not warn when prior-to-demolition phrase is separate from supported baseboard removal", () => {
  assert.equal(
    warning({
      selectedTrade: "carpentry",
      writtenScope:
        "Replace 120 LF of baseboards in hallway. Painting by others. Flooring protection only. Existing flooring to remain.",
      resultText:
        "Customer-facing scope includes careful removal and disposal of existing baseboards before installing new baseboards. Prior to demolition, flooring protection will be applied.",
    }),
    null
  )
})

test("true demolition outside supported carpentry scope still warns", () => {
  assert.match(
    warning({
      selectedTrade: "carpentry",
      writtenScope: "Replace 120 LF of baseboards in hallway. Painting by others.",
      resultText:
        "Customer-facing scope includes demolition of adjacent walls and tear-out of non-baseboard finishes before baseboard replacement.",
    }) || "",
    /demolition/
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
