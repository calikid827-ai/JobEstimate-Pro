import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib"
import { createCanvas } from "@napi-rs/canvas"
import { createAuthoredPackage, createReplacementAddendum } from "../../../tests/fixtures/plan-study/authored-package"
import { inspectPdf, preparePdfPage } from "./pdf"

test("server inventory hashes retained bytes and counts every physical page of the authored multi-file package", async () => {
  const files = await createAuthoredPackage()
  let total = 0
  for (const file of files) {
    const result = await inspectPdf(file.bytes)
    assert.equal(result.sha256, createHash("sha256").update(file.bytes).digest("hex"))
    assert.equal(result.sha256.length, 64)
    total += result.pageCount
  }
  assert.equal(total, 6)
  const replacement = await createReplacementAddendum()
  assert.notEqual((await inspectPdf(files[2].bytes)).sha256, (await inspectPdf(replacement.bytes)).sha256)
})

test("pinned PDF.js actually extracts cited text and renders every physical authored page", async () => {
  const files = await createAuthoredPackage()
  const extracted: string[] = []
  for (const file of files) {
    const { pageCount } = await inspectPdf(file.bytes)
    for (let number = 1; number <= pageCount; number++) {
      const result = await preparePdfPage(file.bytes, number)
      assert.equal(result.render, "complete")
      assert.ok(result.width > 0 && result.height > 0)
      assert.ok(result.width * result.height <= 4_010_000)
      assert.deepEqual(Array.from(result.png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
      for (const block of result.blocks) {
        assert.ok(block.id.startsWith(`p${number}-b`))
        assert.ok(block.bounds.x >= 0 && block.bounds.y >= 0)
        assert.ok(block.bounds.x + block.bounds.width <= 1.00001)
        assert.ok(block.bounds.y + block.bounds.height <= 1.00001)
      }
      extracted.push(result.blocks.map((b) => b.text).join(" "))
      if (file.name.includes("unreadable")) {
        assert.equal(result.extraction, "empty")
        assert.equal(result.blocks.length, 0)
        assert.equal("analysis" in result, false, "rendering must not claim substantive analysis")
      }
    }
  }
  assert.match(extracted[0], /F101.*Room 102: walls PT-1/)
  assert.match(extracted[1], /A602 is not included/)
  assert.match(extracted[2], /Patch small holes/)
  assert.match(extracted[3], /Verify substrate moisture/)
  assert.match(extracted[4], /WC-2 textile wallcovering in lieu of PT-1/)
})

test("invalid documents and nonexistent physical page references fail without invented inventory", async () => {
  await assert.rejects(inspectPdf(new Uint8Array()), /PDF_SIZE_UNSUPPORTED/)
  await assert.rejects(inspectPdf(new Uint8Array([1, 2, 3])))
  const [file] = await createAuthoredPackage()
  await assert.rejects(preparePdfPage(file.bytes, 0), /PDF_PAGE_INVALID/)
  await assert.rejects(preparePdfPage(file.bytes, 3), /PDF_PAGE_INVALID/)
})

test("the browser worker bytes match the exact pinned PDF.js installation", async () => {
  const worker = await readFile(new URL("../../../public/plan-study/pdf.worker-6.4.299.min.mjs", import.meta.url))
  const installed = await readFile(new URL("../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url))
  assert.deepEqual(worker, installed)
  const packageJson = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"))
  assert.equal(packageJson.dependencies["pdfjs-dist"], "6.4.299")
})

test("oversized raster content fails preparation instead of silently dropping image coverage", async () => {
  const canvas = createCanvas(2050, 2050)
  canvas.getContext("2d").fillRect(0, 0, 2050, 2050)
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(canvas.toBuffer("image/png"))
  pdf.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 })
  await assert.rejects(preparePdfPage(new Uint8Array(await pdf.save()), 1))
})

async function contentPdf(contents: string[], form = false, type3 = false) {
  const pdf = await PDFDocument.create(), page = pdf.addPage([200, 200])
  const streams = contents.map((content) => pdf.context.register(pdf.context.stream(content)))
  if (form) {
    const stream = pdf.context.stream(contents.join(""), { Type: "XObject", Subtype: "Form", BBox: [0, 0, 200, 200] })
    const ref = pdf.context.register(stream)
    page.node.set(PDFName.of("Resources"), pdf.context.obj({ XObject: { InlineForm: ref } }))
    page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream("/InlineForm Do")))
  } else if (type3) {
    pdf.context.register(pdf.context.obj({ Type: "Font", Subtype: "Type3", CharProcs: { A: streams[0] } }))
    page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream("q Q")))
  } else page.node.set(PDFName.of("Contents"), pdf.context.obj(streams))
  return new Uint8Array(await pdf.save({ useObjectStreams: false }))
}

test("inline images remain explicitly unsupported, including malformed, oversized and Form content", async () => {
  for (const dimensions of ["/W 1 /H 1", "/W 0 /H 1", "/W 1 /H 0", "/W -1 /H 1", "/W 2050 /H 2050"]) {
    const content = `q BI ${dimensions} /BPC 8 /CS /G ID X EI Q`
    const bytes = await contentPdf([content])
    assert.equal((await inspectPdf(bytes)).pageCount, 1, "physical indexing is distinct from supported preparation")
    await assert.rejects(preparePdfPage(bytes, 1), /PDF_INLINE_IMAGES_UNSUPPORTED/)
    await assert.rejects(preparePdfPage(await contentPdf([content], true), 1), /PDF_INLINE_IMAGES_UNSUPPORTED/)
    await assert.rejects(preparePdfPage(await contentPdf([content], false, true), 1), /PDF_INLINE_IMAGES_UNSUPPORTED/)
  }
  await assert.rejects(preparePdfPage(await contentPdf(["q B", "I /W 1 /H 1 /BPC 8 /CS /G ID X EI Q"]), 1), /PDF_INLINE_IMAGES_UNSUPPORTED/)
})

test("the inline-image lexer accepts BI inside comments, names, escaped strings and hexadecimal strings", async () => {
  const data = "% BI /W 0 /H 0\n/BI BMC EMC\n/Span << /Label (BI \\(nested\\) (BI)) /Other <4249> >> BDC EMC\nq Q"
  const prepared = await preparePdfPage(await contentPdf([data]), 1)
  assert.equal(prepared.render, "complete")
})

test("JPEG encoded dimensions cannot bypass the decoded pixel limit through smaller PDF dictionary dimensions", async () => {
  const valid = await PDFDocument.create(), thumbnail = createCanvas(32, 32)
  const supported = await valid.embedJpg(thumbnail.toBuffer("image/jpeg"))
  valid.addPage([200, 200]).drawImage(supported, { x: 0, y: 0, width: 32, height: 32 })
  assert.equal((await preparePdfPage(new Uint8Array(await valid.save()), 1)).render, "complete")
  const canvas = createCanvas(2050, 2050)
  canvas.getContext("2d").fillRect(0, 0, 2050, 2050)
  const pdf = await PDFDocument.create(), image = await pdf.embedJpg(canvas.toBuffer("image/jpeg"))
  pdf.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 200, height: 200 })
  await pdf.flush()
  const stream = pdf.context.lookup(image.ref)
  assert.ok(stream instanceof PDFRawStream)
  stream.dict.set(PDFName.of("Width"), PDFNumber.of(100)); stream.dict.set(PDFName.of("Height"), PDFNumber.of(100))
  await assert.rejects(inspectPdf(new Uint8Array(await pdf.save())), /PDF_IMAGE_DIMENSIONS_MISMATCH/)
})

test("Flate image and drawing content expansion stop at explicit bounds", async () => {
  const imagePdf = await PDFDocument.create()
  imagePdf.addPage([200, 200])
  imagePdf.context.register(imagePdf.context.flateStream(new Uint8Array(8192), { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }))
  await assert.rejects(inspectPdf(new Uint8Array(await imagePdf.save())), /PDF_DECODED_BYTES_LIMIT/)
  const incomplete = await PDFDocument.create()
  incomplete.addPage([200, 200])
  incomplete.context.register(incomplete.context.stream(new Uint8Array([0]), { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }))
  await assert.rejects(inspectPdf(new Uint8Array(await incomplete.save())), /PDF_DECODED_IMAGE_LIMIT_OR_INCOMPLETE/)
  const content = await PDFDocument.create(), page = content.addPage([200, 200])
  page.node.set(PDFName.of("Contents"), content.context.register(content.context.flateStream(new Uint8Array(8 * 1024 * 1024 + 1).fill(32))))
  const bytes = new Uint8Array(await content.save())
  assert.equal((await inspectPdf(bytes)).pageCount, 1)
  await assert.rejects(preparePdfPage(bytes, 1), /PDF_DECODED_BYTES_LIMIT/)
})

test("unsupported image codecs and extreme page aspect ratios cannot evade preparation limits", async () => {
  const unsupported = await PDFDocument.create()
  unsupported.addPage([200, 200])
  unsupported.context.register(unsupported.context.stream(new Uint8Array([1]), { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "JPXDecode" }))
  await assert.rejects(inspectPdf(new Uint8Array(await unsupported.save())), /PDF_IMAGE_CODEC_UNSUPPORTED/)
  const extreme = await PDFDocument.create()
  extreme.addPage([1, 1_000_000_000])
  const prepared = await preparePdfPage(new Uint8Array(await extreme.save()), 1)
  assert.ok(prepared.width <= 4096 && prepared.height <= 4096)
  assert.ok(prepared.width * prepared.height <= 4_000_000)
})

test("annotation appearances and XFA content remain explicitly unsupported rather than silently omitted", async () => {
  const marked = await PDFDocument.create(), page = marked.addPage([200, 200])
  const appearance = marked.context.register(marked.context.stream("1 0 0 rg 0 0 100 100 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 100], Resources: {} }))
  const annotation = marked.context.register(marked.context.obj({ Type: "Annot", Subtype: "Stamp", Rect: [0, 0, 100, 100], AP: { N: appearance } }))
  page.node.set(PDFName.of("Annots"), marked.context.obj([annotation]))
  const annotated = new Uint8Array(await marked.save())
  assert.equal((await inspectPdf(annotated)).pageCount, 1)
  await assert.rejects(preparePdfPage(annotated, 1), /PDF_ANNOTATIONS_UNSUPPORTED/)
  const xfa = await PDFDocument.create()
  xfa.addPage([200, 200])
  const xml = xfa.context.register(xfa.context.stream("<synthetic>unreviewed</synthetic>"))
  xfa.catalog.set(PDFName.of("AcroForm"), xfa.context.register(xfa.context.obj({ XFA: xml })))
  const bytes = new Uint8Array(await xfa.save())
  assert.equal((await inspectPdf(bytes)).pageCount, 1)
  await assert.rejects(preparePdfPage(bytes, 1), /PDF_XFA_UNSUPPORTED/)
})

type FontProcessReport = {
  systemFontLoadingGateVerified: boolean; nativeFontFamilies: number; nativeProbeInk: number; externalAttempts: number
  resourceReads: string[]; preparationError: string | null
  pages: { name: string; sha256: string; extraction: string; render: string; extracted: string; regionInk: Record<string, number> }[]
}
async function fontlessProcess(mode: string): Promise<FontProcessReport> {
  const directory = await mkdtemp(path.join(tmpdir(), "plan-study-font-regression-"))
  try {
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--loader", fileURLToPath(new URL("../../../scripts/ts-extensionless-loader.mjs", import.meta.url)),
      fileURLToPath(new URL("../../../tests/helpers/plan-study-font-process.mjs", import.meta.url)), mode, directory,
    ], { cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: "test", DISABLE_SYSTEM_FONTS_LOAD: "1" }, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as FontProcessReport
    assert.equal(report.systemFontLoadingGateVerified, true)
    assert.equal(report.nativeFontFamilies, 0)
    assert.equal(report.externalAttempts, 0)
    return report
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test("fresh fontless production preparation paints both authored headings, notes and boundaries", async () => {
  const report = await fontlessProcess("authored")
  assert.equal(report.pages.length, 2)
  assert.match(report.pages[0].extracted, /F101.*Flooring and electrical work are by others/)
  assert.match(report.pages[1].extracted, /A201.*Coordinate access with GC/)
  for (const page of report.pages) {
    assert.equal(page.extraction, "complete")
    assert.equal(page.render, "complete")
    assert.ok(page.regionInk.heading > 300, "heading glyphs must be painted above the diagram")
    assert.ok(page.regionInk.roomNotes > 1000, "room/finish notes must be painted above the diagram")
    assert.ok(page.regionInk.boundaryNote > 100, "by-others/GC boundary note must remain visible")
    assert.notEqual(page.sha256, "d10075ed1c254bac6be356c0dd0fde66f1fb47e6782d54e1eee2e244d5cc5d2d", "the reproduced textless image must not recur")
  }
  assert.notEqual(report.pages[0].sha256, report.pages[1].sha256)
})

test("bundled fonts paint standard Helvetica, Times, Courier, Symbol and Dingbats variants without native fonts", async () => {
  const report = await fontlessProcess("standard-variants")
  assert.equal(report.pages.length, 14)
  for (const page of report.pages) assert.ok(page.regionInk.glyphs > 100, `${page.name} must paint glyphs`)
  assert.ok(new Set(report.resourceReads).size >= 14, "the full standard font families must use bundled resources")
})

for (const mode of ["missing-resource", "empty-resource"]) {
  test(`${mode} fails explicitly rather than publishing a successful textless render`, async () => {
    const report = await fontlessProcess(mode)
    assert.ok(report.resourceReads.includes("LiberationSans-Regular.ttf"))
    assert.equal(report.preparationError, "PDF_STANDARD_FONT_DATA_UNAVAILABLE")
    assert.deepEqual(report.pages, [])
  })
}

test("legitimate blank and raster-only pages still prepare without requesting unavailable font resources", async () => {
  const report = await fontlessProcess("empty-pages")
  assert.equal(report.pages.length, 2)
  assert.deepEqual(report.resourceReads, [])
  for (const page of report.pages) { assert.equal(page.extraction, "empty"); assert.equal(page.render, "complete") }
  assert.equal(report.pages[0].regionInk.page, 0)
  assert.ok(report.pages[1].regionInk.page > 100)
})
