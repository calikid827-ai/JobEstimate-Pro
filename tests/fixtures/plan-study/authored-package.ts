import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createCanvas } from "@napi-rs/canvas"

/** Authored synthetic documents. Expected findings are authored fixtures, not a human-reviewed accuracy benchmark; no model was called. */
export const authoredExpectations = [
  "F101 specifies PT-1 paint in Rooms 101 and 102 and WC-1 wallcovering in Room 103.",
  "A201 references missing detail A602; do not invent that detail or claim it was reviewed.",
  "09 91 23 requires patching, sanding, spot priming and two finish coats.",
  "09 72 00 requires substrate moisture verification and a layout submittal before wallcovering.",
  "ADD-1 conflicts with F101 for Room 102: WC-2 wallcovering versus PT-1 paint. Request clarification.",
  "The unreadable scan has no usable text; rendered does not mean substantively reviewed.",
] as const

async function textPdf(pages: string[][]) {
  const pdf = await PDFDocument.create()
  pdf.setTitle("AUTHORED SYNTHETIC PLAN STUDY QA — not construction documents")
  pdf.setCreator("JobEstimate Pro offline fixture")
  pdf.setProducer("pdf-lib synthetic fixture")
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"))
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const lines of pages) {
    const page = pdf.addPage([612, 792])
    page.drawText("AUTHORED SYNTHETIC QA — NOT FOR CONSTRUCTION", { x: 30, y: 755, size: 12, font, color: rgb(0.6, 0, 0) })
    lines.forEach((text, index) => page.drawText(text, { x: 30, y: 710 - index * 28, size: index === 0 ? 17 : 11, font }))
    page.drawRectangle({ x: 30, y: 90, width: 552, height: 260, borderWidth: 1, borderColor: rgb(0.5, 0.5, 0.5) })
    page.drawText("Synthetic diagram boundary; not measured geometry or takeoff.", { x: 40, y: 110, size: 10, font })
  }
  return new Uint8Array(await pdf.save({ useObjectStreams: false }))
}

export async function createAuthoredPackage(): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const plans = await textPdf([
    ["F101 — FINISH SCHEDULE", "Room 101: walls PT-1 paint. Ceiling PT-2 paint.", "Room 102: walls PT-1 paint. Ceiling PT-2 paint.", "Room 103: walls WC-1 wallcovering. Ceiling PT-2 paint.", "PT-1: low-VOC eggshell, two finish coats. See specification 09 91 23.", "WC-1: Type II vinyl. See specification 09 72 00.", "Flooring and electrical work are by others."],
    ["A201 — INTERIOR ELEVATION", "Rooms 101 and 102: prep existing walls and apply PT-1 above chair rail.", "Room 103: WC-1, align pattern at entry wall.", "Head termination detail: see A602. A602 is not included in this package.", "Coordinate access with GC; no plumbing or electrical installation in this scope."],
  ])
  const specifications = await textPdf([
    ["09 91 23 — PAINTING", "Patch small holes, sand imperfections and spot prime repairs.", "Apply two finish coats of specified paint.", "Protect adjacent work. Maintain drying time recommended by manufacturer.", "Owner shall approve colors before procurement.", "Do not assume field quantities or wall heights from this specification."],
    ["09 72 00 — WALLCOVERING", "Verify substrate moisture against manufacturer limits before installation.", "Submit layout and seam pattern for review before installing WC-1.", "Use manufacturer-approved adhesive; retain lot and pattern records.", "Substrate replacement is excluded pending separate written authorization."],
  ])
  const addendum = await textPdf([["ADD-1 — ROOM 102 FINISH REVISION", "Room 102 walls: WC-2 textile wallcovering in lieu of PT-1 paint.", "Finish schedule F101 remains issued with PT-1 in Room 102.", "Clarification required: confirm controlling finish before procurement.", "No quantities, dimensions or approved prices are provided."]])
  const unreadablePdf = await PDFDocument.create()
  unreadablePdf.setCreationDate(new Date("2026-01-01T00:00:00Z"))
  unreadablePdf.setModificationDate(new Date("2026-01-01T00:00:00Z"))
  const scan = createCanvas(612, 792)
  const ctx = scan.getContext("2d")
  ctx.fillStyle = "#d7d7d7"; ctx.fillRect(0, 0, 612, 792)
  // Deliberately obscured raster marks, not a hidden extractable text layer.
  for (let row = 0; row < 29; row++) {
    ctx.fillStyle = row % 2 ? "#a0a0a0" : "#aaaaaa"
    ctx.fillRect(35, 30 + row * 25, 410 + (row % 5) * 20, 11)
    ctx.fillStyle = "#c1c1c1"; ctx.fillRect(25 + row % 3 * 50, 25 + row * 25, 200, 19)
  }
  const image = await unreadablePdf.embedPng(scan.toBuffer("image/png"))
  unreadablePdf.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 })
  return [
    { name: "01-authored-synthetic-plans.pdf", bytes: plans },
    { name: "02-authored-synthetic-specifications.pdf", bytes: specifications },
    { name: "03-authored-synthetic-addendum.pdf", bytes: addendum },
    { name: "04-authored-synthetic-unreadable-scan.pdf", bytes: new Uint8Array(await unreadablePdf.save({ useObjectStreams: false })) },
  ]
}

export async function createReplacementAddendum() {
  return {
    name: "03-authored-synthetic-addendum-replacement.pdf",
    bytes: await textPdf([["ADD-1 REV B — ROOM 102 CLARIFICATION", "Room 102 walls: PT-1 paint as scheduled in F101.", "The prior WC-2 wallcovering direction is withdrawn.", "Reconfirm any decision based on ADD-1 before relying on it."]]),
  }
}
