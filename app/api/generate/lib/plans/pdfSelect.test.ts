import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { deriveSelectedPdfUpload } from "./pdfSelect"
import type { PlanUpload } from "./types"
import { countPdfPagesFromBytes } from "../../../../lib/plan-upload"

const require = createRequire(import.meta.url)
const PDFDocument = require("pdfkit")

async function makePdfBuffer(pages: string[]): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, margin: 36 })
  const chunks: Buffer[] = []

  doc.on("data", (chunk: Buffer) => chunks.push(chunk))

  for (const text of pages) {
    doc.addPage({ size: [612, 792], margin: 36 })
    doc.fontSize(18).text(text, 48, 48, { width: 500 })
  }

  doc.end()

  return await new Promise<Buffer>((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)))
    doc.once("error", reject)
  })
}

test("selected pages export into a smaller derived pdf artifact with original page numbering preserved", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "scopeguard-pdf-select-test-"))

  try {
    const originalPdfPath = path.join(tempRoot, "original.pdf")
    const derivedPdfPath = path.join(tempRoot, "selected.pdf")
    const originalBuffer = await makePdfBuffer([
      "Cover sheet general notes code summary",
      "A1.1 Floor plan guest room cluster north wing",
      "A8.1 Finish Plan guest room repaint walls ceilings doors trim",
      "A8.2 Finish Schedule guest room matrix paint wallcovering flooring",
      "A9.1 Interior Elevations guest bath shower wall tile backsplash vanity wall",
      "A9.2 Interior Elevations corridor wall finish transitions",
      "RCP reflected ceiling plan lighting fixtures guest room",
      "E1.0 Electrical Schedule receptacles switches fixtures",
      "P2.0 Fixture Schedule toilets lavatories shower valves accessories",
      "Demo plan selective demolition flooring wall base casework",
    ])

    await writeFile(originalPdfPath, originalBuffer)

    const upload: PlanUpload = {
      uploadId: "plan_upload_1",
      name: "hotel-set.pdf",
      note: "Hotel set",
      mimeType: "application/pdf",
      transport: "multipart-temp",
      tempFilePath: originalPdfPath,
      bytes: originalBuffer.byteLength,
      selectedSourcePages: [2, 4],
    }

    const derived = await deriveSelectedPdfUpload({
      upload,
      outputPdfPath: derivedPdfPath,
    })

    assert(derived)
    assert.deepEqual(derived.sourcePageNumberMap, [2, 4])
    assert(derived.outputBytes > 0)
    assert.equal(countPdfPagesFromBytes(new Uint8Array(originalBuffer)), 10)
    assert.equal(
      countPdfPagesFromBytes(new Uint8Array(await readFile(derived.outputPdfPath))),
      2
    )
    assert.equal((await readFile(derived.outputPdfPath)).byteLength, derived.outputBytes)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
