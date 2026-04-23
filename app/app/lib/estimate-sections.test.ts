import test from "node:test"
import assert from "node:assert/strict"

import {
  getEstimateSectionTreatmentLabel,
  normalizeEstimateEmbeddedBurdens,
  normalizeEstimateRows,
  normalizeEstimateSections,
  resolveCanonicalEstimateOutput,
} from "./estimate-sections"

test("normalizeEstimateSections keeps structured and burden rows usable for app outputs", () => {
  const normalized = normalizeEstimateSections([
    {
      trade: "painting",
      section: "Walls",
      label: "Walls",
      pricingBasis: "direct",
      estimatorTreatment: "section_row",
      amount: 4200,
      labor: 3000,
      materials: 900,
      subs: 300,
      unit: "sqft",
      quantity: 2800,
      notes: ["Repeated guest room basis"],
    },
    {
      trade: "painting",
      section: "Corridor repaint",
      label: "Corridor repaint",
      pricingBasis: "burden",
      estimatorTreatment: "embedded_burden",
      amount: 650,
      labor: 500,
      materials: 150,
      subs: 0,
      notes: ["Included in occupied access burden"],
    },
    {
      trade: "",
      section: "",
      label: "",
    },
  ])

  assert.ok(normalized)
  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].quantity, 2800)
  assert.equal(normalized[0].unit, "sqft")
  assert.equal(normalized[1].pricingBasis, "burden")
  assert.equal(normalized[1].estimatorTreatment, "embedded_burden")
})

test("getEstimateSectionTreatmentLabel preserves burden labeling", () => {
  const normalized = normalizeEstimateSections([
    {
      trade: "wallcovering",
      section: "Removal / prep",
      label: "Removal / prep",
      pricingBasis: "direct",
      estimatorTreatment: "section_row",
      amount: 1800,
      labor: 1200,
      materials: 200,
      subs: 400,
      notes: [],
    },
    {
      trade: "wallcovering",
      section: "Corridor burden",
      label: "Corridor burden",
      pricingBasis: "burden",
      estimatorTreatment: "embedded_burden",
      amount: 275,
      labor: 275,
      materials: 0,
      subs: 0,
      notes: [],
    },
  ])

  assert.ok(normalized)
  assert.equal(getEstimateSectionTreatmentLabel(normalized[0]), "Structured section")
  assert.equal(getEstimateSectionTreatmentLabel(normalized[1]), "Embedded burden")
})

test("normalizeEstimateRows keeps only safe direct section rows", () => {
  const rows = normalizeEstimateRows([
    {
      trade: "painting",
      section: "Walls",
      label: "Walls",
      pricingBasis: "direct",
      estimatorTreatment: "section_row",
      amount: 2100,
      labor: 1500,
      materials: 450,
      subs: 150,
      notes: [],
    },
    {
      trade: "painting",
      section: "Prep / protection",
      label: "Prep / protection",
      pricingBasis: "burden",
      estimatorTreatment: "embedded_burden",
      amount: 200,
      labor: 200,
      materials: 0,
      subs: 0,
      notes: [],
    },
  ])

  assert.ok(rows)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].section, "Walls")
  assert.equal(rows[0].pricingBasis, "direct")
})

test("normalizeEstimateEmbeddedBurdens keeps burden rows separate", () => {
  const burdens = normalizeEstimateEmbeddedBurdens([
    {
      trade: "drywall",
      section: "Partition-related scope",
      label: "Partition-related scope",
      pricingBasis: "burden",
      estimatorTreatment: "embedded_burden",
      amount: 325,
      labor: 325,
      materials: 0,
      subs: 0,
      notes: ["Fragmentation burden only"],
    },
  ])

  assert.ok(burdens)
  assert.equal(burdens.length, 1)
  assert.equal(burdens[0].pricingBasis, "burden")
  assert.equal(burdens[0].estimatorTreatment, "embedded_burden")
})

test("downstream row consumption uses explicit estimateRows when present", () => {
  const payload = {
    pricing: {
      total: 5400,
    },
    estimateRows: [
      {
        trade: "painting",
        section: "Walls",
        label: "Walls",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 4200,
        labor: 3000,
        materials: 900,
        subs: 300,
        unit: "sqft",
        quantity: 2800,
        notes: ["Direct structured row from winning basis."],
        rowSource: "estimate_sections",
      },
    ],
    estimateSections: [
      {
        trade: "painting",
        section: "Stale fallback row",
        label: "Stale fallback row",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 999999,
        labor: 999999,
        materials: 0,
        subs: 0,
        notes: ["Should not be used when estimateRows exists."],
      },
      {
        trade: "painting",
        section: "Prep / protection",
        label: "Prep / protection",
        pricingBasis: "burden",
        estimatorTreatment: "embedded_burden",
        amount: 1200,
        labor: 1200,
        materials: 0,
        subs: 0,
        notes: ["Burden remains outside direct rows."],
      },
    ],
  }

  const { estimateRows: rows } = resolveCanonicalEstimateOutput(payload)

  assert.ok(rows)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].section, "Walls")
  assert.equal(rows[0].amount, 4200)
  assert.equal(
    rows.reduce((sum, row) => sum + row.amount, 0),
    4200
  )
  assert.equal(payload.pricing.total, 5400)
})

test("downstream burden consumption uses explicit estimateEmbeddedBurdens when present", () => {
  const payload = {
    estimateEmbeddedBurdens: [
      {
        trade: "wallcovering",
        section: "Corridor burden",
        label: "Corridor burden",
        pricingBasis: "burden",
        estimatorTreatment: "embedded_burden",
        amount: 275,
        labor: 275,
        materials: 0,
        subs: 0,
        notes: ["Reference only."],
        rowSource: "estimate_sections",
      },
    ],
    estimateSections: [
      {
        trade: "wallcovering",
        section: "Install",
        label: "Install",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 1800,
        labor: 1200,
        materials: 200,
        subs: 400,
        notes: ["Should not become an embedded burden fallback."],
      },
    ],
  }

  const { estimateEmbeddedBurdens: burdens } = resolveCanonicalEstimateOutput(payload)

  assert.ok(burdens)
  assert.equal(burdens.length, 1)
  assert.equal(burdens[0].section, "Corridor burden")
  assert.equal(burdens[0].amount, 275)
})

test("canonical consumption does not fall back when explicit row fields are present but null", () => {
  const resolved = resolveCanonicalEstimateOutput({
    estimateRows: null,
    estimateEmbeddedBurdens: null,
    estimateSections: [
      {
        trade: "painting",
        section: "Walls",
        label: "Walls",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 4200,
        labor: 3000,
        materials: 900,
        subs: 300,
        notes: ["Legacy section only."],
      },
      {
        trade: "painting",
        section: "Prep / protection",
        label: "Prep / protection",
        pricingBasis: "burden",
        estimatorTreatment: "embedded_burden",
        amount: 600,
        labor: 600,
        materials: 0,
        subs: 0,
        notes: ["Legacy burden only."],
      },
    ],
  })

  assert.equal(resolved.estimateRows, null)
  assert.equal(resolved.estimateEmbeddedBurdens, null)
  assert.ok(resolved.estimateSections)
  assert.equal(resolved.estimateSections.length, 2)
})

test("canonical consumption falls back to estimateSections only when explicit row fields are absent", () => {
  const resolved = resolveCanonicalEstimateOutput({
    estimateSections: [
      {
        trade: "painting",
        section: "Walls",
        label: "Walls",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 3200,
        labor: 2400,
        materials: 600,
        subs: 200,
        notes: [],
      },
      {
        trade: "painting",
        section: "Corridor repaint",
        label: "Corridor repaint",
        pricingBasis: "burden",
        estimatorTreatment: "embedded_burden",
        amount: 400,
        labor: 400,
        materials: 0,
        subs: 0,
        notes: ["Reference only."],
      },
    ],
  })

  assert.ok(resolved.estimateRows)
  assert.equal(resolved.estimateRows.length, 1)
  assert.equal(resolved.estimateRows[0].section, "Walls")
  assert.ok(resolved.estimateEmbeddedBurdens)
  assert.equal(resolved.estimateEmbeddedBurdens.length, 1)
  assert.equal(resolved.estimateEmbeddedBurdens[0].section, "Corridor repaint")
})

test("canonical consumption keeps mixed payloads deduplicated and trade-labeled", () => {
  const payload = {
    pricing: {
      total: 9800,
    },
    estimateRows: [
      {
        trade: "painting",
        section: "Walls",
        label: "Walls",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 4200,
        labor: 3000,
        materials: 900,
        subs: 300,
        notes: [],
        rowSource: "estimate_sections",
      },
      {
        trade: "wallcovering",
        section: "Install",
        label: "Install",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 3100,
        labor: 1800,
        materials: 700,
        subs: 600,
        notes: ["Trade label must survive."],
        rowSource: "estimate_sections",
      },
    ],
    estimateEmbeddedBurdens: [
      {
        trade: "painting",
        section: "Prep / protection",
        label: "Prep / protection",
        pricingBasis: "burden",
        estimatorTreatment: "embedded_burden",
        amount: 700,
        labor: 700,
        materials: 0,
        subs: 0,
        notes: ["Reference only."],
        rowSource: "estimate_sections",
      },
    ],
    estimateSections: [
      {
        trade: "painting",
        section: "Stale legacy section",
        label: "Stale legacy section",
        pricingBasis: "direct",
        estimatorTreatment: "section_row",
        amount: 999999,
        labor: 999999,
        materials: 0,
        subs: 0,
        notes: ["Must not duplicate."],
      },
    ],
  }
  const resolved = resolveCanonicalEstimateOutput(payload)

  assert.ok(resolved.estimateRows)
  assert.equal(resolved.estimateRows.length, 2)
  assert.deepEqual(
    resolved.estimateRows.map((row) => row.trade),
    ["painting", "wallcovering"]
  )
  assert.ok(resolved.estimateEmbeddedBurdens)
  assert.equal(resolved.estimateEmbeddedBurdens.length, 1)
  assert.equal(
    resolved.estimateRows.reduce((sum, row) => sum + row.amount, 0),
    7300
  )
  assert.equal(payload.pricing.total, 9800)
})
