import type { PDFFont, PDFPage } from "pdf-lib"
import { parseCustomerProposal } from "./customer-proposal"
import type { CustomerProposal, CustomerScopeRow } from "./customer-proposal-types"

const unitLabels: Record<CustomerScopeRow["unit"], string> = { sqft: "sq ft", linear_ft: "linear ft", doors: "doors", lump_sum: "lump sum" }
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const quantity = (item: CustomerScopeRow) => `${String(item.quantity)} ${unitLabels[item.unit]}`
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

function customerModel(value: CustomerProposal): CustomerProposal {
  const parsed = parseCustomerProposal(value)
  if (!parsed) throw new Error("The customer proposal contains unsupported or incomplete document fields. Reopen a saved proposal snapshot.")
  return parsed
}

function summary(customer: CustomerProposal): Array<{ label: string; value: string; total?: boolean }> {
  const { pricing } = customer
  return [
    { label: "Selling price before tax", value: money(pricing.subtotal) },
    { label: `Tax (${String(pricing.taxRate)}%)`, value: money(pricing.taxAmount) },
    ...(pricing.roundingAdjustment ? [{ label: "Rounding adjustment", value: money(pricing.roundingAdjustment) }] : []),
    { label: "Total price", value: money(pricing.total), total: true },
    { label: "Requested deposit", value: money(pricing.depositDue) },
    { label: "Remaining after deposit", value: money(pricing.remaining) },
  ]
}

/** Customer-only fragment. Every value is allowlisted and escaped before HTML. */
export function renderCustomerProposalHtml(value: CustomerProposal): string {
  const customer = customerModel(value)
  const section = (title: string, content: string) => content.trim() ? `<section class="jep-customer-section"><h3>${title}</h3><p>${escape(content)}</p></section>` : ""
  const contact = [customer.company.address, customer.company.phone, customer.company.email, customer.company.license ? `License: ${customer.company.license}` : ""].filter(Boolean)
  return `<article class="jep-customer-proposal" aria-label="Customer proposal">
<style>
.jep-customer-proposal{box-sizing:border-box;max-width:900px;margin:0 auto;background:#fff;color:#172b45;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;border:1px solid #d8e2ee}
.jep-customer-proposal *{box-sizing:border-box}.jep-customer-proposal .jep-customer-banner{padding:22px 28px;background:#102a48;color:#fff}.jep-customer-proposal .jep-customer-banner h2{margin:0;font-size:27px;letter-spacing:2px;color:#fff}.jep-customer-proposal .jep-customer-banner p{margin:4px 0 0;color:#d8e9ff}
.jep-customer-proposal .jep-customer-body{padding:26px 28px}.jep-customer-proposal h3{color:#102a48;font-size:17px;margin:0 0 10px}.jep-customer-proposal p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.jep-customer-proposal .jep-customer-company{font-size:23px;font-weight:700;margin:0 0 8px;overflow-wrap:anywhere}
.jep-customer-proposal .jep-customer-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px 20px;padding:16px;background:#f0f6fd;margin:20px 0}.jep-customer-proposal .jep-customer-info dt{font-size:12px;font-weight:bold;color:#315a86}.jep-customer-proposal .jep-customer-info dd{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.jep-customer-proposal table{width:100%;border-collapse:collapse;table-layout:fixed;margin:10px 0 20px}.jep-customer-proposal th{background:#153c65;color:#fff;text-align:left;padding:10px 8px;font-weight:700}.jep-customer-proposal td{padding:10px 8px;border-bottom:1px solid #d8e2ee;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.jep-customer-proposal tbody tr:nth-child(even){background:#f5f8fc}.jep-customer-proposal .jep-customer-scope th:nth-child(1){width:15%}.jep-customer-proposal .jep-customer-scope th:nth-child(2){width:18%}.jep-customer-proposal .jep-customer-scope th:nth-child(3){width:49%}.jep-customer-proposal .jep-customer-scope th:nth-child(4){width:18%}
.jep-customer-proposal .jep-customer-section{margin:22px 0}.jep-customer-proposal .jep-customer-exclusions{padding-left:20px}.jep-customer-proposal .jep-customer-exclusions li{margin-bottom:9px;white-space:pre-wrap;overflow-wrap:anywhere}
.jep-customer-proposal .jep-customer-summary{margin:24px 0 0 auto;width:100%;max-width:390px;border:1px solid #c8d7e8}.jep-customer-proposal .jep-customer-summary div{display:flex;justify-content:space-between;gap:14px;padding:10px 12px;border-bottom:1px solid #e0e8f1}.jep-customer-proposal .jep-customer-summary dt{margin:0}.jep-customer-proposal .jep-customer-summary dd{margin:0;font-weight:700;white-space:nowrap}.jep-customer-proposal .jep-customer-summary .jep-customer-total{background:#102a48;color:#fff;font-size:20px}.jep-customer-proposal .jep-customer-deposit-note{font-size:12px;color:#455b73;margin-top:12px}
@media print{.jep-customer-proposal{border:0;max-width:none}.jep-customer-proposal thead{display:table-header-group}.jep-customer-proposal tr{break-inside:avoid}.jep-customer-proposal h3{break-after:avoid}.jep-customer-proposal .jep-customer-summary{break-inside:avoid}}
</style>
<header class="jep-customer-banner"><h2>PROPOSAL</h2><p>Scope of work and price</p></header>
<div class="jep-customer-body"><div class="jep-customer-company">${escape(customer.company.name)}</div>${contact.map((line) => `<p>${escape(line)}</p>`).join("")}
<dl class="jep-customer-info">${[["Customer", customer.customer.name], ["Project", customer.project.name], ["Project address", customer.project.address], ["Proposal date", customer.date], ["Reference", customer.reference]].filter(([, text]) => text.trim()).map(([label, text]) => `<div><dt>${label}</dt><dd>${escape(text)}</dd></div>`).join("")}</dl>
<section class="jep-customer-section"><h3>Included scope</h3><table class="jep-customer-scope"><thead><tr><th scope="col">Trade</th><th scope="col">Location</th><th scope="col">Work included</th><th scope="col">Quantity</th></tr></thead><tbody>${customer.scope.map((item) => `<tr><td>${escape(item.trade)}</td><td>${escape(item.location)}</td><td>${escape(item.description)}</td><td>${escape(quantity(item))}</td></tr>`).join("")}</tbody></table></section>
${customer.exclusions.length ? `<section class="jep-customer-section"><h3>Exclusions</h3><ul class="jep-customer-exclusions">${customer.exclusions.map((item) => `<li>${item.location ? `<strong>${escape(item.location)}:</strong> ` : ""}${escape(item.description)}</li>`).join("")}</ul></section>` : ""}
${section("Clarifications", customer.clarifications)}${section("Allowances", customer.allowances)}${section("Schedule", customer.schedule)}${section("Terms", customer.terms)}
<dl class="jep-customer-summary">${summary(customer).map((row) => `<div${row.total ? ' class="jep-customer-total"' : ""}><dt>${row.label}</dt><dd>${row.value}</dd></div>`).join("")}</dl>
<p class="jep-customer-deposit-note">The requested deposit is included in the total. It is not a record of payment.</p></div></article>`
}

/** Local PDF bytes from the same safe model used by the on-screen preview. */
export async function renderCustomerProposalPdf(value: CustomerProposal): Promise<Uint8Array> {
  const customer = customerModel(value)
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
  const doc = await PDFDocument.create({ updateMetadata: false })
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const characters = new Set(regular.getCharacterSet())
  const fields: Array<[string, string]> = [
    ...Object.entries(customer.company).map(([key, text]): [string, string] => [`company ${key}`, text]),
    ["customer name", customer.customer.name], ["project name", customer.project.name], ["project address", customer.project.address], ["proposal date", customer.date], ["reference", customer.reference],
    ...customer.scope.flatMap((row, index): Array<[string, string]> => [[`scope row ${index + 1} trade`, row.trade], [`scope row ${index + 1} location`, row.location], [`scope row ${index + 1} description`, row.description]]),
    ...customer.exclusions.flatMap((row, index): Array<[string, string]> => [[`exclusion ${index + 1} location`, row.location], [`exclusion ${index + 1} description`, row.description]]),
    ["clarifications", customer.clarifications], ["allowances", customer.allowances], ["schedule", customer.schedule], ["terms", customer.terms],
  ]
  for (const [field, text] of fields) {
    const unsupported = Array.from(text).find((char) => !["\n", "\r", "\t"].includes(char) && !characters.has(char.codePointAt(0)!))
    if (unsupported) throw new Error(`PDF export cannot display U+${unsupported.codePointAt(0)!.toString(16).toUpperCase()} in ${field} with its installed font. A Unicode-capable font is needed for this text. The saved proposal has not changed.`)
  }
  doc.setTitle("Proposal")
  doc.setAuthor(customer.company.name)
  doc.setSubject("")
  doc.setKeywords([])
  doc.setCreator("Proposal")
  doc.setProducer("Proposal")
  const proposalDate = new Date(`${customer.date}T12:00:00.000Z`)
  doc.setCreationDate(proposalDate)
  doc.setModificationDate(proposalDate)

  const width = 612, height = 792, margin = 42, contentWidth = width - margin * 2, bottom = 68
  const navy = rgb(.063, .165, .282), blue = rgb(.082, .235, .396), ink = rgb(.09, .16, .24), muted = rgb(.28, .36, .45), pale = rgb(.945, .969, .992), lineColor = rgb(.82, .87, .92), white = rgb(1, 1, 1)
  let page!: PDFPage
  let y = 0
  function newPage() {
    if (doc.getPageCount() >= 500) throw new Error("This proposal exceeds 500 PDF pages. Reduce the selected document scope before exporting; no partial PDF was exported.")
    page = doc.addPage([width, height])
    page.drawRectangle({ x: 0, y: height - 74, width, height: 74, color: navy })
    page.drawText("PROPOSAL", { x: margin, y: height - 37, size: 22, font: bold, color: white })
    page.drawText(doc.getPageCount() === 1 ? "Scope of work and price" : "Continued", { x: margin, y: height - 56, size: 10, font: regular, color: rgb(.83, .9, 1) })
    y = height - 98
  }
  const ensure = (space: number) => { if (y - space < bottom) newPage() }
  function wrap(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
      if (!paragraph.trim()) { lines.push(""); continue }
      let current = ""
      for (const word of paragraph.split(/\s+/)) {
        if (font.widthOfTextAtSize(current ? `${current} ${word}` : word, size) <= maxWidth) { current = current ? `${current} ${word}` : word; continue }
        if (current) { lines.push(current); current = "" }
        for (const character of Array.from(word)) {
          if (font.widthOfTextAtSize(current + character, size) > maxWidth && current) { lines.push(current); current = "" }
          current += character
        }
      }
      if (current) lines.push(current)
    }
    return lines
  }
  function paragraph(text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; after?: number } = {}) {
    const size = options.size ?? 10, font = options.font ?? regular, leading = size * 1.45
    for (const textLine of wrap(text, contentWidth, font, size)) {
      ensure(leading)
      page.drawText(textLine, { x: margin, y: y - size, size, font, color: options.color ?? ink })
      y -= leading
    }
    y -= options.after ?? 7
  }
  function heading(title: string) {
    ensure(42)
    y -= 6
    page.drawText(title, { x: margin, y: y - 12, size: 12, font: bold, color: navy })
    y -= 20
  }
  newPage()
  paragraph(customer.company.name, { size: 18, font: bold, color: navy, after: 6 })
  for (const text of [customer.company.address, customer.company.phone, customer.company.email, customer.company.license ? `License: ${customer.company.license}` : ""].filter(Boolean)) paragraph(text, { size: 9, color: muted, after: 2 })
  y -= 12
  for (const [label, text] of [["Customer", customer.customer.name], ["Project", customer.project.name], ["Project address", customer.project.address], ["Proposal date", customer.date], ["Reference", customer.reference]]) if (text.trim()) paragraph(`${label}: ${text}`, { size: 10, after: 4 })

  const columnWidths = [72, 90, 274, 92], padding = 8, rowSize = 9.5, rowLeading = 13
  function scopeHeader(title: string) {
    heading(title)
    page.drawRectangle({ x: margin, y: y - 27, width: contentWidth, height: 27, color: blue })
    let x = margin
    for (const [index, text] of ["Trade", "Location", "Work included", "Quantity"].entries()) {
      page.drawText(text, { x: x + padding, y: y - 17, size: 9, font: bold, color: white })
      x += columnWidths[index]
    }
    y -= 27
  }
  ensure(90)
  scopeHeader("Included scope")
  for (const [rowIndex, item] of customer.scope.entries()) {
    const columns = [item.trade, item.location, item.description, quantity(item)].map((text, index) => wrap(text, columnWidths[index] - padding * 2, regular, rowSize))
    const length = Math.max(...columns.map((column) => column.length))
    const fullHeight = length * rowLeading + padding * 2
    // Keep ordinary rows together. Only oversized rows split across pages.
    if (fullHeight <= height - 98 - bottom - 53 && y - fullHeight < bottom) { newPage(); scopeHeader("Included scope - continued") }
    let offset = 0
    while (offset < length) {
      let count = Math.min(length - offset, Math.floor((y - bottom - padding * 2) / rowLeading))
      if (count < 1) { newPage(); scopeHeader(offset ? `Included scope - row ${rowIndex + 1} continued` : "Included scope - continued"); count = Math.min(length - offset, Math.floor((y - bottom - padding * 2) / rowLeading)) }
      const rowHeight = count * rowLeading + padding * 2
      page.drawRectangle({ x: margin, y: y - rowHeight, width: contentWidth, height: rowHeight, color: rowIndex % 2 ? pale : white })
      let x = margin
      for (const [index, column] of columns.entries()) {
        for (const [lineIndex, text] of column.slice(offset, offset + count).entries()) page.drawText(text, { x: x + padding, y: y - padding - rowSize - lineIndex * rowLeading, size: rowSize, font: regular, color: ink })
        x += columnWidths[index]
      }
      page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: width - margin, y: y - rowHeight }, thickness: .6, color: lineColor })
      y -= rowHeight; offset += count
    }
  }
  if (customer.exclusions.length) {
    heading("Exclusions")
    for (const item of customer.exclusions) paragraph(`${item.location ? `${item.location}: ` : ""}${item.description}`, { after: 9 })
  }
  for (const [title, text] of [["Clarifications", customer.clarifications], ["Allowances", customer.allowances], ["Schedule", customer.schedule], ["Terms", customer.terms]]) if (text.trim()) { heading(title); paragraph(text, { after: 8 }) }

  const rows = summary(customer), summaryWidth = 348, summaryX = width - margin - summaryWidth
  const depositNote = "The requested deposit is included in the total. It is not a record of payment."
  ensure(rows.reduce((space, row) => space + (row.total ? 32 : 22), 0) + 28 + wrap(depositNote, contentWidth, regular, 9).length * 13.05)
  y -= 14
  for (const row of rows) {
    const rowHeight = row.total ? 32 : 22
    page.drawRectangle({ x: summaryX, y: y - rowHeight, width: summaryWidth, height: rowHeight, color: row.total ? navy : pale })
    const size = row.total ? 14 : 10
    page.drawText(row.label, { x: summaryX + 12, y: y - rowHeight / 2 - size / 3, size, font: row.total ? bold : regular, color: row.total ? white : ink })
    page.drawText(row.value, { x: width - margin - 12 - bold.widthOfTextAtSize(row.value, size), y: y - rowHeight / 2 - size / 3, size, font: bold, color: row.total ? white : ink })
    y -= rowHeight
  }
  y -= 12
  paragraph(depositNote, { size: 9, color: muted, after: 0 })
  const pages = doc.getPages()
  for (const [index, current] of pages.entries()) {
    current.drawLine({ start: { x: margin, y: 48 }, end: { x: width - margin, y: 48 }, thickness: .6, color: lineColor })
    current.drawText("Proposal", { x: margin, y: 32, size: 8, font: regular, color: muted })
    const label = `Page ${index + 1} of ${pages.length}`
    current.drawText(label, { x: width - margin - regular.widthOfTextAtSize(label, 8), y: 32, size: 8, font: regular, color: muted })
  }
  return doc.save({ useObjectStreams: false })
}
