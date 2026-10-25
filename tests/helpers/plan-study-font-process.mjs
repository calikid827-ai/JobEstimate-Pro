import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import https from "node:https"
import { createRequire, syncBuiltinESMExports } from "node:module"
import path from "node:path"

// Run only in a fresh process. No dependency, package resource or shared cache is modified.
const [mode, outputDirectory] = process.argv.slice(2)
assert.ok(["authored", "standard-variants", "empty-pages", "missing-resource", "empty-resource"].includes(mode))
assert.equal(process.env.DISABLE_SYSTEM_FONTS_LOAD, "1")
await fs.mkdir(outputDirectory, { recursive: true })
let externalAttempts = 0
const denyNetwork = () => { externalAttempts++; throw new Error("EXTERNAL_NETWORK_BLOCKED") }
globalThis.fetch = denyNetwork
http.request = http.get = https.request = https.get = denyNetwork
const warnings = []
console.log = console.warn = (...args) => warnings.push(args.map(String).join(" "))

const resourceReads = []
const originalReadFile = fs.readFile
fs.readFile = async function (resource, ...args) {
  if (String(resource).includes("/pdfjs-dist/standard_fonts/")) {
    const filename = path.basename(String(resource))
    resourceReads.push(filename)
    if (mode === "empty-pages" || mode === "missing-resource" && filename === "LiberationSans-Regular.ttf") {
      const error = new Error("Synthetic missing standard font resource")
      error.code = "ENOENT"
      throw error
    }
    if (mode === "empty-resource" && filename === "LiberationSans-Regular.ttf") return Buffer.alloc(0)
  }
  return originalReadFile.call(this, resource, ...args)
}
syncBuiltinESMExports()

const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas")
const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
const { preparePdfPage } = await import("../../app/lib/plan-study/pdf.ts")
const canvasSource = await fs.readFile(createRequire(import.meta.url).resolve("@napi-rs/canvas"), "utf8")
assert.match(canvasSource, /if \(!process\.env\.DISABLE_SYSTEM_FONTS_LOAD\) \{\s*(?:\/\/[^\n]*\n\s*)*GlobalFonts\.enableSystemFonts\(\)/)
const systemFontLoadingGateVerified = true
assert.equal(GlobalFonts.families.length, 0, "native fonts must actually be unavailable")
const probe = createCanvas(300, 70), probeContext = probe.getContext("2d")
probeContext.fillStyle = "white"; probeContext.fillRect(0, 0, 300, 70)
probeContext.fillStyle = "black"; probeContext.font = "20px sans-serif"; probeContext.fillText("F101 FINISH SCHEDULE", 10, 35)
function nonwhite(data) {
  let count = 0
  for (let index = 0; index < data.length; index += 4) if (data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245) count++
  return count
}
const nativeProbeInk = nonwhite(probeContext.getImageData(0, 0, 300, 70).data)
// Some native backends paint fallback/tofu pixels even without registered fonts.
// This probe is observational; the environment gate and font inventory establish isolation.
async function rendered(bytes, pageNumber, name, regions) {
  const result = await preparePdfPage(bytes, pageNumber)
  const png = Buffer.from(result.png), image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext("2d")
  context.drawImage(image, 0, 0)
  const regionInk = Object.fromEntries(Object.entries(regions).map(([key, [x, y, width, height]]) => [key, nonwhite(context.getImageData(x, y, width, height).data)]))
  const pngPath = path.join(outputDirectory, name + ".png")
  await fs.writeFile(pngPath, png)
  return { name, pngPath, width: image.width, height: image.height, sha256: createHash("sha256").update(png).digest("hex"), extracted: result.blocks.map(block => block.text).join(" "), extraction: result.extraction, render: result.render, regionInk }
}
const pages = []
let preparationError = null
if (["authored", "missing-resource", "empty-resource"].includes(mode)) {
  const bytes = new Uint8Array(await fs.readFile(new URL("../fixtures/plan-study/01-authored-synthetic-plans.pdf", import.meta.url)))
  if (mode === "authored") {
    for (const number of [1, 2]) pages.push(await rendered(bytes, number, `authored-page-${number}`, {
      heading: [40, 90, 850, 45],
      roomNotes: [40, 145, 850, 190],
      boundaryNote: number === 1 ? [40, 350, 850, 45] : [40, 270, 850, 45],
    }))
  } else {
    try { await preparePdfPage(bytes, 1) } catch (error) { preparationError = error.message }
  }
} else if (mode === "standard-variants") {
  const pdf = await PDFDocument.create()
  const variants = [
    StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique,
    StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic,
    StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique,
    StandardFonts.Symbol, StandardFonts.ZapfDingbats,
  ]
  for (const name of variants) {
    const font = await pdf.embedFont(name), page = pdf.addPage([400, 180])
    const text = name === StandardFonts.Symbol ? "αβγδε" : name === StandardFonts.ZapfDingbats ? "✁✂✃✄" : "F101 Room 101 PT-1 paint"
    page.drawText(text, { x: 20, y: 110, size: 20, font, color: rgb(0, 0, 0) })
  }
  const bytes = new Uint8Array(await pdf.save())
  for (let index = 0; index < variants.length; index++) pages.push(await rendered(bytes, index + 1, variants[index], { glyphs: [20, 65, 570, 45] }))
} else {
  const blank = await PDFDocument.create(); blank.addPage([100, 100])
  pages.push(await rendered(new Uint8Array(await blank.save()), 1, "blank", { page: [0, 0, 150, 150] }))
  const raster = createCanvas(40, 40), context = raster.getContext("2d")
  context.fillStyle = "white"; context.fillRect(0, 0, 40, 40)
  context.fillStyle = "#cc0000"; context.fillRect(8, 8, 24, 24)
  const imagePdf = await PDFDocument.create(), image = await imagePdf.embedPng(raster.toBuffer("image/png"))
  imagePdf.addPage([100, 100]).drawImage(image, { x: 0, y: 0, width: 100, height: 100 })
  pages.push(await rendered(new Uint8Array(await imagePdf.save()), 1, "raster-only", { page: [0, 0, 150, 150] }))
}
assert.equal(externalAttempts, 0)
const report = { mode, systemFontLoadingGateVerified, nativeFontFamilies: GlobalFonts.families.length, nativeProbeInk, externalAttempts, resourceReads, preparationError, warnings, pages }
await fs.writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2) + "\n")
process.stdout.write(JSON.stringify(report))
