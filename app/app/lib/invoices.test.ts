import test from "node:test"
import assert from "node:assert/strict"

import { buildInvoiceFromEstimate } from "./invoices"
import type {
  EstimateEmbeddedBurden,
  EstimateRow,
  EstimateStructuredSection,
} from "./types"

const issueDate = new Date("2026-05-01T12:00:00Z")

function buildInvoice(overrides: Record<string, unknown> = {}, mode?: "auto" | "balance") {
  return buildInvoiceFromEstimate({
    estimate: {
      id: "estimate_1",
      jobId: "job_1",
      jobDetails: {
        clientName: "Jane Client",
        jobName: "Lobby Refresh",
        jobAddress: "123 Main St",
      },
      pricing: {
        labor: 1000,
        materials: 500,
        subs: 250,
        markup: 0,
      },
      ...overrides,
    },
    mode,
    invoiceNo: "INV-TEST",
    issueDate,
    dueTerms: "Net 10",
    notePaymentTerms: "Net 10",
  })
}

test("buildInvoiceFromEstimate creates a full invoice without deposit", () => {
  const built = buildInvoice()

  assert.equal(built.ok, true)
  assert.equal(built.invoice.invoiceNo, "INV-TEST")
  assert.equal(built.invoice.issueDate, "2026-05-01")
  assert.equal(built.invoice.dueDate, "2026-05-11")
  assert.equal(built.invoice.billToName, "Jane Client")
  assert.equal(built.invoice.jobName, "Lobby Refresh")
  assert.equal(built.invoice.jobAddress, "123 Main St")
  assert.equal(built.invoice.subtotal, 1750)
  assert.equal(built.invoice.total, 1750)
  assert.equal(built.invoice.deposit, undefined)
  assert.deepEqual(built.invoice.lineItems, [
    { label: "Labor", amount: 1000 },
    { label: "Materials", amount: 500 },
    { label: "Other / Mobilization", amount: 250 },
  ])
})

test("buildInvoiceFromEstimate creates a percent deposit invoice", () => {
  const built = buildInvoice({
    deposit: {
      enabled: true,
      type: "percent",
      value: 40,
    },
  })

  assert.equal(built.ok, true)
  assert.equal(built.invoice.subtotal, 700)
  assert.equal(built.invoice.total, 700)
  assert.deepEqual(built.invoice.lineItems, [
    { label: "Deposit (40% of total)", amount: 700 },
  ])
  assert.deepEqual(built.invoice.deposit, {
    enabled: true,
    type: "percent",
    value: 40,
    depositDue: 700,
    remainingBalance: 1050,
    estimateTotal: 1750,
  })
})

test("buildInvoiceFromEstimate creates a fixed deposit invoice", () => {
  const built = buildInvoice({
    deposit: {
      enabled: true,
      type: "fixed",
      value: 600,
    },
  })

  assert.equal(built.ok, true)
  assert.equal(built.invoice.subtotal, 600)
  assert.equal(built.invoice.total, 600)
  assert.deepEqual(built.invoice.lineItems, [
    { label: "Deposit (fixed amount)", amount: 600 },
  ])
  assert.deepEqual(built.invoice.deposit, {
    enabled: true,
    type: "fixed",
    value: 600,
    depositDue: 600,
    remainingBalance: 1150,
    estimateTotal: 1750,
  })
})

test("buildInvoiceFromEstimate creates a balance invoice when deposit is enabled", () => {
  const built = buildInvoice(
    {
      deposit: {
        enabled: true,
        type: "percent",
        value: 25,
      },
    },
    "balance"
  )

  assert.equal(built.ok, true)
  assert.equal(built.invoice.subtotal, 1312)
  assert.equal(built.invoice.total, 1312)
  assert.deepEqual(built.invoice.lineItems, [
    { label: "Remaining Balance", amount: 1312 },
  ])
  assert.deepEqual(built.invoice.deposit, {
    enabled: true,
    type: "percent",
    value: 25,
    depositDue: 438,
    remainingBalance: 1312,
    estimateTotal: 1750,
  })
  assert.match(built.invoice.notes, /Balance invoice/)
})

test("buildInvoiceFromEstimate returns a missing deposit guard for balance mode without deposit", () => {
  const built = buildInvoice({}, "balance")

  assert.deepEqual(built, { ok: false, reason: "missing_deposit" })
})

test("buildInvoiceFromEstimate includes sales tax in totals and line items", () => {
  const built = buildInvoice({
    pricing: {
      labor: 1000,
      materials: 500,
      subs: 100,
      markup: 10,
    },
    tax: {
      enabled: true,
      rate: 8.25,
    },
  })

  assert.equal(built.ok, true)
  assert.equal(built.invoice.subtotal, 1760)
  assert.equal(built.invoice.total, 1905)
  assert.deepEqual(built.invoice.lineItems, [
    { label: "Labor", amount: 1000 },
    { label: "Materials", amount: 500 },
    { label: "Other / Mobilization", amount: 100 },
    { label: "Sales Tax (8.25%)", amount: 145 },
  ])
})

test("buildInvoiceFromEstimate preserves estimate row, section, and burden snapshots", () => {
  const estimateRows: EstimateRow[] = [
    {
      trade: "painting",
      section: "Walls",
      label: "Paint lobby walls",
      amount: 1200,
      labor: 900,
      materials: 300,
      subs: 0,
      unit: "sqft",
      quantity: 800,
      notes: ["Direct section row."],
      pricingBasis: "direct",
      estimatorTreatment: "section_row",
      rowSource: "estimate_sections",
    },
  ]
  const estimateEmbeddedBurdens: EstimateEmbeddedBurden[] = [
    {
      trade: "painting",
      section: "Protection",
      label: "Occupied protection burden",
      amount: 150,
      labor: 150,
      materials: 0,
      subs: 0,
      notes: ["Embedded in total."],
      pricingBasis: "burden",
      estimatorTreatment: "embedded_burden",
      rowSource: "estimate_sections",
    },
  ]
  const estimateSections: EstimateStructuredSection[] = [
    {
      trade: "painting",
      section: "Walls",
      label: "Paint lobby walls",
      pricingBasis: "direct",
      estimatorTreatment: "section_row",
      amount: 1200,
      labor: 900,
      materials: 300,
      subs: 0,
      unit: "sqft",
      quantity: 800,
      notes: ["Canonical structured section."],
    },
    {
      trade: "painting",
      section: "Protection",
      label: "Occupied protection burden",
      pricingBasis: "burden",
      estimatorTreatment: "embedded_burden",
      amount: 150,
      labor: 150,
      materials: 0,
      subs: 0,
      notes: ["Canonical embedded burden."],
    },
  ]

  const built = buildInvoiceFromEstimate({
    estimate: {
      id: "approval_estimate_1",
      pricing: {
        labor: 1000,
        materials: 500,
        subs: 0,
        markup: 0,
      },
      estimateRows,
      estimateEmbeddedBurdens,
      estimateSections,
    },
    invoiceNo: "INV-APPROVAL",
    issueDate,
    dueTerms: "Due upon approval",
    notePaymentTerms: "Due upon approval",
  })

  assert.equal(built.ok, true)
  assert.equal(built.invoice.fromEstimateId, "approval_estimate_1")
  assert.deepEqual(built.invoice.estimateRows, estimateRows)
  assert.deepEqual(built.invoice.estimateEmbeddedBurdens, estimateEmbeddedBurdens)
  assert.deepEqual(built.invoice.estimateSections, estimateSections)
})
