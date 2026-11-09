import assert from "node:assert/strict"
import test from "node:test"
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib"
import type { CustomerProposal } from "./customer-proposal-types"
import { renderCustomerProposalHtml, renderCustomerProposalPdf } from "./customer-proposal-render"

/** Authored synthetic customer-only data; prices are independent fixed expectations. */
function syntheticProposal(): CustomerProposal {
  return {
    schemaVersion: 1,
    company: { name: "Synthetic Contractor Company", address: "Synthetic contractor address", phone: "555-0100", email: "synthetic@example.test", license: "SYNTHETIC-LICENSE" },
    customer: { name: "Synthetic Customer" }, project: { name: "Synthetic Painting Project", address: "Synthetic project address" },
    date: "2026-11-09", reference: "SYNTHETIC-PROPOSAL-001",
    scope: [{ trade: "painting", location: "Room 101", description: "Prepare and paint confirmed upper walls.", quantity: 100, unit: "sqft" }],
    exclusions: [{ location: "Room 101", description: "Lower walls are excluded from this quoted scope." }],
    clarifications: "Only the listed work is quoted.", allowances: "", schedule: "", terms: "Synthetic contractor-entered terms.",
    pricing: { subtotal: 2100, taxRate: 8, taxAmount: 168, roundingAdjustment: 0, total: 2268, depositDue: 567, remaining: 1701 },
  }
}

async function pdfContent(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const pages = document.getPages().map((page) => {
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => document.context.lookup(ref)) : contents ? [contents] : []
    const operators = streams.map((stream) => stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1") : "").join("\n")
    const text = [...operators.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join("\n")
    return { operators, text }
  })
  return { document, pages, text: pages.map((page) => page.text).join("\n") }
}

test("customer HTML uses only explicit safe fields and independent recorded selling totals", () => {
  const html = renderCustomerProposalHtml(syntheticProposal())
  for (const text of ["Synthetic Contractor Company", "Synthetic Customer", "Synthetic Painting Project", "Room 101", "100 sq ft", "$2,100.00", "$168.00", "$2,268.00", "$567.00", "$1,701.00", "Requested deposit", "included in the total", "not a record of payment"]) assert.ok(html.includes(text), text)
  // Keep the entire fragment under the identifier/marker check, including any
  // hidden elements or attributes. CSS's ordinary margin property is not a
  // customer profit-margin disclosure, so inspect content separately for labels.
  for (const forbidden of ["sourceSha256", "ownerId", "estimateRevisionId", "quantityConfirmation", "costApproval", "INTERNAL_COST_SOURCE", "INTERNAL_STUDY_ANSWER", "INTERNAL_PROVIDER_DIAGNOSTIC"]) assert.equal(html.includes(forbidden), false, forbidden)
  const customerContent = html.replace(/<style>[\s\S]*?<\/style>/g, "")
  for (const forbidden of ["labor", "materials", "subcontractor", "markup", "margin"]) assert.equal(customerContent.includes(forbidden), false, forbidden)
  assert.equal(html.includes("Per-item price"), false)
  assert.equal(html.includes("<h3>Schedule</h3>"), false)
  assert.equal(html.includes("<h3>Allowances</h3>"), false)
  assert.ok(html.includes("<h3>Terms</h3>"))
})

test("HTML escapes every customer text surface and does not create external assets or executable markup", () => {
  const customer = syntheticProposal()
  const dangerous = '<img src="https://external.invalid/pixel" onerror="alert(1)"> & customer'
  customer.company.name = dangerous
  customer.company.address = dangerous
  customer.customer.name = dangerous
  customer.project.name = dangerous
  customer.project.address = dangerous
  customer.reference = dangerous
  customer.scope[0].trade = dangerous
  customer.scope[0].location = dangerous
  customer.scope[0].description = dangerous
  customer.exclusions[0].description = dangerous
  customer.clarifications = dangerous
  customer.allowances = dangerous
  customer.schedule = dangerous
  customer.terms = dangerous
  const html = renderCustomerProposalHtml(customer)
  assert.ok(html.includes("&lt;img src=&quot;https://external.invalid/pixel&quot; onerror=&quot;alert(1)&quot;&gt; &amp; customer"))
  assert.equal(/<(?:img|script|iframe|object)\b/i.test(html), false)
  assert.equal(/<[^>]*\s(?:src|href|onerror)=/i.test(html), false)
})

test("both renderers reject extra internal fields rather than hiding or serializing them", async () => {
  for (const customer of [
    { ...syntheticProposal(), internalEstimate: { costs: "INTERNAL_COST_SOURCE" } },
    { ...syntheticProposal(), pricing: { ...syntheticProposal().pricing, markupPct: 20 } },
    { ...syntheticProposal(), scope: [{ ...syntheticProposal().scope[0], source: "INTERNAL_STUDY_ANSWER" }] },
  ]) {
    assert.throws(() => renderCustomerProposalHtml(customer as CustomerProposal), /unsupported|incomplete/)
    await assert.rejects(renderCustomerProposalPdf(customer as CustomerProposal), /unsupported|incomplete/)
  }
})

test("short PDF contains customer scope and independently specified totals without internal metadata or attachments", async () => {
  const result = await pdfContent(await renderCustomerProposalPdf(syntheticProposal()))
  assert.equal(result.document.getPageCount(), 1)
  for (const text of ["Synthetic Contractor Company", "Synthetic Customer", "Synthetic Painting Project", "100 sq ft", "$2,100.00", "$168.00", "$2,268.00", "$567.00", "$1,701.00", "Requested deposit", "Page 1 of 1"]) assert.ok(result.text.includes(text), text)
  for (const forbidden of ["markup", "margin", "INTERNAL_COST_SOURCE", "INTERNAL_STUDY_ANSWER", "INTERNAL_PROVIDER_DIAGNOSTIC", "ownerId", "estimateRevisionId", "sourceSha256"]) assert.equal(result.text.includes(forbidden), false, forbidden)
  assert.equal(result.document.getTitle(), "Proposal")
  assert.equal(result.document.getAuthor(), "Synthetic Contractor Company")
  assert.equal(result.document.getCreator(), "Proposal")
  assert.equal(result.document.getProducer(), "Proposal")
  assert.equal(result.document.getSubject(), "")
  assert.equal(result.document.catalog.has(PDFName.of("AcroForm")), false)
  assert.equal(result.document.catalog.has(PDFName.of("Metadata")), false)
  assert.equal(result.document.catalog.has(PDFName.of("Names")), false)
})

test("oversized scope rows, unbroken words and long exclusions continue without dropping the final contents or total", async () => {
  const customer = syntheticProposal()
  customer.scope[0].description = Array.from({ length: 110 }, (_, index) => `Synthetic scope segment ${index + 1}: prepare and paint only the reviewed work.`).join(" ") + " END-OF-LONG-SCOPE"
  customer.scope.push({ trade: "painting", location: "Room 102", description: "UNBROKEN".repeat(35) + " END-OF-SECOND-SCOPE", quantity: 1, unit: "lump_sum" })
  customer.exclusions = [{ location: "Excluded area", description: Array.from({ length: 100 }, (_, index) => `Synthetic exclusion segment ${index + 1}: this separate work is excluded.`).join(" ") + " END-OF-LONG-EXCLUSIONS" }]
  const result = await pdfContent(await renderCustomerProposalPdf(customer))
  assert.ok(result.document.getPageCount() > 3)
  for (const marker of ["END-OF-LONG-SCOPE", "END-OF-SECOND-SCOPE", "END-OF-LONG-EXCLUSIONS", "$2,268.00"]) assert.ok(result.text.includes(marker), marker)
  assert.ok(result.pages.some((page) => page.text.includes("Included scope - row 1 continued")))
  assert.ok(result.pages.filter((page) => page.text.includes("Included scope")).every((page) => ["Trade", "Location", "Work included", "Quantity"].every((heading) => page.text.includes(heading))))
  result.pages.forEach((page, index) => assert.ok(page.text.includes(`Page ${index + 1} of ${result.pages.length}`)))
})

test("unsupported PDF characters fail visibly without silently changing the saved model", async () => {
  const customer = syntheticProposal()
  customer.scope[0].description = "Synthetic scope with unsupported character 漆"
  const before = structuredClone(customer)
  assert.ok(renderCustomerProposalHtml(customer).includes("漆"))
  await assert.rejects(renderCustomerProposalPdf(customer), /PDF export cannot display U\+6F06 in scope row 1 description/)
  assert.deepEqual(customer, before)
})

test("intentional zero amounts and recorded whole-dollar adjustments remain explicit", async () => {
  const customer = syntheticProposal()
  customer.pricing = { subtotal: 47.03, taxRate: 8, taxAmount: 3.76, roundingAdjustment: .21, total: 51, depositDue: 0, remaining: 51 }
  const html = renderCustomerProposalHtml(customer)
  assert.ok(html.includes("Rounding adjustment"))
  assert.ok(html.includes("$0.21"))
  assert.ok(html.includes("$0.00"))
  const pdf = await pdfContent(await renderCustomerProposalPdf(customer))
  for (const amount of ["$47.03", "$3.76", "$0.21", "$51.00", "$0.00"]) assert.ok(pdf.text.includes(amount), amount)
})
