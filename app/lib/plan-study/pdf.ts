import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { inflateSync } from "node:zlib"
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib"
import { createCanvas } from "@napi-rs/canvas"
import type { TextBlock } from "./types"

const MAX_RENDER_PIXELS = 4_000_000
const MAX_RENDER_SIDE = 4096
const MAX_PAGE_TEXT = 40_000
const MAX_CONTENT_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 40 * 1024 * 1024
const MAX_PACKAGE_IMAGE_BYTES = 64 * 1024 * 1024
// The complete standard-14 resource set in pinned PDF.js 6.4.299.
const STANDARD_FONT_FILES = new Set([
  "FoxitDingbats.pfb", "FoxitFixed.pfb", "FoxitFixedBold.pfb", "FoxitFixedBoldItalic.pfb", "FoxitFixedItalic.pfb",
  "FoxitSerif.pfb", "FoxitSerifBold.pfb", "FoxitSerifBoldItalic.pfb", "FoxitSerifItalic.pfb", "FoxitSymbol.pfb",
  "LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Italic.ttf", "LiberationSans-BoldItalic.ttf",
])

function number(dict: PDFDict, key: string, fallback?: number): number {
  const value = dict.context.lookup(dict.get(PDFName.of(key)))
  if (value === undefined && fallback !== undefined) return fallback
  if (!(value instanceof PDFNumber) || !Number.isSafeInteger(value.asNumber())) throw new Error("PDF_IMAGE_PARAMETERS_UNSUPPORTED")
  return value.asNumber()
}
function filter(stream: PDFRawStream): string | undefined {
  const value = stream.dict.context.lookup(stream.dict.get(PDFName.of("Filter")))
  if (value === undefined) return undefined
  const single = value instanceof PDFArray && value.size() === 1 ? value.lookup(0) : value
  if (!(single instanceof PDFName)) throw new Error("PDF_STREAM_FILTER_UNSUPPORTED")
  return single.asString()
}
function boundedFlate(bytes: Uint8Array, limit: number): Uint8Array {
  if (limit <= 0) throw new Error("PDF_DECODED_BYTES_LIMIT")
  try { return inflateSync(bytes, { maxOutputLength: limit }) } catch { throw new Error("PDF_DECODED_BYTES_LIMIT_OR_INVALID_STREAM") }
}
/** Read the encoded JPEG's dimensions before its decoder can allocate pixels. */
function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("PDF_JPEG_UNSUPPORTED")
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("PDF_JPEG_UNSUPPORTED")
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
    const size = bytes[offset] * 256 + bytes[offset + 1]
    if (size < 2 || offset + size > bytes.length) throw new Error("PDF_JPEG_UNSUPPORTED")
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 8 || bytes[offset + 2] !== 8) throw new Error("PDF_JPEG_UNSUPPORTED")
      return { height: bytes[offset + 3] * 256 + bytes[offset + 4], width: bytes[offset + 5] * 256 + bytes[offset + 6], components: bytes[offset + 7] }
    }
    offset += size
  }
  throw new Error("PDF_JPEG_UNSUPPORTED")
}
function validateImage(stream: PDFRawStream): number {
  const dict = stream.dict, width = number(dict, "Width"), height = number(dict, "Height")
  if (width <= 0 || height <= 0 || width * height > MAX_RENDER_PIXELS) throw new Error("PDF_IMAGE_LIMIT")
  const mask = dict.context.lookup(dict.get(PDFName.of("ImageMask"))) === PDFBool.True
  const color = dict.context.lookup(dict.get(PDFName.of("ColorSpace")))
  const components = mask ? 1 : color === PDFName.of("DeviceGray") ? 1 : color === PDFName.of("DeviceRGB") ? 3 : color === PDFName.of("DeviceCMYK") ? 4 : 0
  if (!components) throw new Error("PDF_IMAGE_COLORSPACE_UNSUPPORTED")
  const bits = mask ? number(dict, "BitsPerComponent", 1) : number(dict, "BitsPerComponent")
  if (![1, 2, 4, 8, 16].includes(bits) || mask && bits !== 1) throw new Error("PDF_IMAGE_PARAMETERS_UNSUPPORTED")
  const encoding = filter(stream)
  if (encoding === "/DCTDecode") {
    const actual = jpegDimensions(stream.getContents())
    if (bits !== 8 || actual.width !== width || actual.height !== height || actual.components !== components || actual.width * actual.height > MAX_RENDER_PIXELS) throw new Error("PDF_IMAGE_DIMENSIONS_MISMATCH")
    return width * height * components
  }
  if (encoding !== undefined && encoding !== "/FlateDecode") throw new Error("PDF_IMAGE_CODEC_UNSUPPORTED")
  const params = dict.context.lookup(dict.get(PDFName.of("DecodeParms")))
  let predictor = 1
  if (params !== undefined) {
    if (!(params instanceof PDFDict)) throw new Error("PDF_IMAGE_PARAMETERS_UNSUPPORTED")
    predictor = number(params, "Predictor", 1)
    if (![1, 2, 10, 11, 12, 13, 14, 15].includes(predictor) || predictor !== 1 && (number(params, "Columns", 1) !== width || number(params, "Colors", 1) !== components || number(params, "BitsPerComponent", 8) !== bits)) throw new Error("PDF_IMAGE_PARAMETERS_UNSUPPORTED")
  }
  const expected = (Math.ceil(width * components * bits / 8) + (predictor >= 10 ? 1 : 0)) * height
  const limit = Math.min(MAX_IMAGE_BYTES, expected)
  const decoded = encoding === "/FlateDecode" ? boundedFlate(stream.getContents(), limit) : stream.getContents()
  if (decoded.length > limit || decoded.length !== expected) throw new Error("PDF_DECODED_IMAGE_LIMIT_OR_INCOMPLETE")
  return decoded.length
}
/** Content lexer: inline images are unsupported, but BI inside data is not an operator. */
function rejectInlineImages(bytes: Uint8Array) {
  const white = (c: number) => [0, 9, 10, 12, 13, 32].includes(c)
  const delimiter = (c: number) => white(c) || [40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(c)
  let i = 0
  while (i < bytes.length) {
    const c = bytes[i]
    if (white(c)) { i++; continue }
    if (c === 37) { while (i < bytes.length && ![10, 13].includes(bytes[i])) i++; continue }
    if (c === 40) {
      let depth = 1; i++
      while (i < bytes.length && depth) { if (bytes[i] === 92) { i += 2; continue }; if (bytes[i] === 40) depth++; else if (bytes[i] === 41) depth--; i++ }
      if (depth) throw new Error("PDF_CONTENT_UNSUPPORTED")
      continue
    }
    if (c === 60 && bytes[i + 1] !== 60) {
      i++; while (i < bytes.length && bytes[i] !== 62) i++
      if (i === bytes.length) throw new Error("PDF_CONTENT_UNSUPPORTED")
      i++; continue
    }
    if (c === 47) { i++; while (i < bytes.length && !delimiter(bytes[i])) i++; continue }
    if (delimiter(c)) { i++; continue }
    const start = i
    while (i < bytes.length && !delimiter(bytes[i])) i++
    if (i - start === 2 && bytes[start] === 66 && bytes[start + 1] === 73) throw new Error("PDF_INLINE_IMAGES_UNSUPPORTED")
  }
}
function validateContent(document: PDFDocument) {
  const form = document.context.lookup(document.catalog.get(PDFName.of("AcroForm")))
  if (form instanceof PDFDict && form.has(PDFName.of("XFA"))) throw new Error("PDF_XFA_UNSUPPORTED")
  for (const page of document.getPages()) {
    const annotations = document.context.lookup(page.node.get(PDFName.of("Annots")))
    if (annotations !== undefined && (!(annotations instanceof PDFArray) || annotations.size() > 0)) throw new Error("PDF_ANNOTATIONS_UNSUPPORTED")
  }
  const groups: PDFRawStream[][] = []
  const collect = (value: unknown, group: PDFRawStream[]) => {
    const resolved = document.context.lookup(value as never)
    if (resolved instanceof PDFArray) { for (const item of resolved.asArray()) collect(item, group); return }
    if (!(resolved instanceof PDFRawStream)) throw new Error("PDF_CONTENT_UNSUPPORTED")
    group.push(resolved)
  }
  const add = (value: unknown) => { const group: PDFRawStream[] = []; collect(value, group); groups.push(group) }
  for (const page of document.getPages()) { const contents = page.node.Contents(); if (contents) add(contents) }
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream && document.context.lookup(object.dict.get(PDFName.of("Subtype"))) === PDFName.of("Form")) add(object)
    if (object instanceof PDFDict && document.context.lookup(object.get(PDFName.of("Subtype"))) === PDFName.of("Type3")) {
      const chars = document.context.lookup(object.get(PDFName.of("CharProcs")))
      if (!(chars instanceof PDFDict)) throw new Error("PDF_CONTENT_UNSUPPORTED")
      for (const [, value] of chars.entries()) add(value)
    }
  }
  let remaining = MAX_CONTENT_BYTES
  const cache = new Map<PDFRawStream, Uint8Array>()
  for (const group of groups) {
    const parts: Uint8Array[] = []; let length = 0
    for (const stream of group) {
      let decoded = cache.get(stream)
      if (!decoded) {
        const encoding = filter(stream)
        if (encoding !== undefined && encoding !== "/FlateDecode" || stream.dict.has(PDFName.of("DecodeParms"))) throw new Error("PDF_CONTENT_FILTER_UNSUPPORTED")
        decoded = encoding ? boundedFlate(stream.getContents(), remaining) : stream.getContents()
        cache.set(stream, decoded)
      }
      remaining -= decoded.length
      if (remaining < 0) throw new Error("PDF_DECODED_CONTENT_LIMIT")
      parts.push(decoded); length += decoded.length
    }
    // PDF page content arrays are one logical stream; a token may cross boundaries.
    const joined = new Uint8Array(length); let offset = 0
    for (const part of parts) { joined.set(part, offset); offset += part.length }
    rejectInlineImages(joined)
  }
}

/** Physical inventory is derived from retained bytes, never browser page metadata. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number; sha256: string }> {
  if (!bytes.byteLength || bytes.byteLength > 3 * 1024 * 1024) throw new Error("PDF_SIZE_UNSUPPORTED")
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const pageCount = document.getPageCount()
  if (!pageCount) throw new Error("PDF_NO_PAGES")
  // Reject retained packages that exceed the renderer's explicit raster limit.
  // PDF.js may otherwise omit oversized image XObjects while resolving render.
  let imageBytes = 0
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || document.context.lookup(object.dict.get(PDFName.of("Subtype"))) !== PDFName.of("Image")) continue
    imageBytes += validateImage(object)
    if (imageBytes > MAX_PACKAGE_IMAGE_BYTES) throw new Error("PDF_PACKAGE_IMAGE_LIMIT")
  }
  return { pageCount, sha256: createHash("sha256").update(bytes).digest("hex") }
}

/** Canonical extraction/rendering are preparation only; neither is substantive analysis. */
export async function preparePdfPage(bytes: Uint8Array, pageNumber: number) {
  const { pageCount } = await inspectPdf(bytes)
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) throw new Error("PDF_PAGE_INVALID")
  // Inspect executable drawing content before PDF.js can omit unsupported inline images.
  validateContent(await PDFDocument.load(bytes, { updateMetadata: false }))
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  let fontDirectory: string
  try {
    // Resolve at runtime: Turbopack turns a statically imported require.resolve into a module ID.
    const { createRequire } = process.getBuiltinModule("node:module")
    const pdfModulePath = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs")
    fontDirectory = join(dirname(pdfModulePath), "..", "..", "standard_fonts")
  } catch {
    throw new Error("PDF_STANDARD_FONT_DATA_UNAVAILABLE")
  }
  let fontResourceFailed = false
  class BundledFontDataFactory {
    async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
      // CMap/Wasm resources remain unconfigured; no remote resource fetch is introduced.
      if (kind !== "standardFontDataUrl") throw new Error("PDF_BINARY_RESOURCE_UNAVAILABLE")
      try {
        if (!STANDARD_FONT_FILES.has(filename)) throw new Error("UNEXPECTED_FONT_RESOURCE")
        const data = await readFile(join(fontDirectory, filename))
        if (!data.byteLength) throw new Error("EMPTY_FONT_RESOURCE")
        return new Uint8Array(data)
      } catch {
        fontResourceFailed = true
        throw new Error("PDF_STANDARD_FONT_DATA_UNAVAILABLE")
      }
    }
  }
  const assertFontResources = () => {
    // PDF.js catches font fetch failures and can still resolve a textless render.
    if (fontResourceFailed) throw new Error("PDF_STANDARD_FONT_DATA_UNAVAILABLE")
  }
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: false,
    useWasm: false,
    useSystemFonts: false,
    standardFontDataUrl: `${fontDirectory}/`,
    BinaryDataFactory: BundledFontDataFactory,
    useWorkerFetch: false,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    stopAtErrors: true,
    maxImageSize: MAX_RENDER_PIXELS,
    verbosity: 0,
  })
  try {
    const document = await loading.promise
    if (document.numPages !== pageCount) throw new Error("PDF_PAGE_COUNT_MISMATCH")
    const page = await document.getPage(pageNumber)
    // Surface rejected content operations before rendering; a partially painted
    // canvas is not sufficient evidence that this page was prepared completely.
    await page.getOperatorList({ intent: "display", annotationMode: pdfjs.AnnotationMode.DISABLE })
    assertFontResources()
    const natural = page.getViewport({ scale: 1 })
    if (!Number.isFinite(natural.width * natural.height) || natural.width <= 0 || natural.height <= 0) throw new Error("PDF_PAGE_SIZE_INVALID")
    const scale = Math.min(1.5, MAX_RENDER_SIDE / natural.width, MAX_RENDER_SIDE / natural.height, Math.sqrt((MAX_RENDER_PIXELS - 2 * MAX_RENDER_SIDE - 1) / (natural.width * natural.height)))
    const viewport = page.getViewport({ scale })
    const content = await page.getTextContent({ disableNormalization: false })
    assertFontResources()
    const blocks: TextBlock[] = []
    let characters = 0
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue
      characters += item.str.length
      if (characters > MAX_PAGE_TEXT) throw new Error("PDF_PAGE_TEXT_LIMIT")
      const transform = pdfjs.Util.transform(viewport.transform, item.transform)
      const height = Math.max(1, Math.hypot(transform[2], transform[3]))
      const x = Math.max(0, Math.min(1, transform[4] / viewport.width))
      const y = Math.max(0, Math.min(1, (transform[5] - height) / viewport.height))
      blocks.push({
        id: `p${pageNumber}-b${blocks.length + 1}`,
        text: item.str,
        bounds: {
          x, y,
          width: Math.max(0, Math.min(1 - x, Math.abs(item.width * scale) / viewport.width)),
          height: Math.max(0, Math.min(1 - y, height / viewport.height)),
        },
      })
    }
    const width = Math.ceil(viewport.width)
    const height = Math.ceil(viewport.height)
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > MAX_RENDER_SIDE || height > MAX_RENDER_SIDE || width * height > MAX_RENDER_PIXELS) throw new Error("PDF_PAGE_RASTER_LIMIT")
    const canvas = createCanvas(width, height)
    const context = canvas.getContext("2d")
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      annotationMode: pdfjs.AnnotationMode.DISABLE,
      background: "rgb(255,255,255)",
    }).promise
    assertFontResources()
    return {
      blocks,
      png: new Uint8Array(canvas.toBuffer("image/png")),
      width,
      height,
      extraction: blocks.length ? "complete" as const : "empty" as const,
      render: "complete" as const,
    }
  } finally {
    await loading.destroy()
  }
}
