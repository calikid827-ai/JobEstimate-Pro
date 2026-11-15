import { createCanvas, loadImage } from "@napi-rs/canvas"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { PROJECT_LIMITS, type ProjectPage } from "./types"

/** Originals stay retained. Text extraction is preparation, never substantive review. */
export async function prepareProjectPdfPage(bytes: Uint8Array, pageNumber: number): Promise<{ pageCount: number; page: ProjectPage }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  // Match the retained Plan Study renderer's runtime resolution: bundlers must
  // not substitute a module ID for PDF.js's installed font-resource directory.
  const { createRequire } = process.getBuiltinModule("node:module")
  const fonts = join(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs")), "../../standard_fonts")
  class LocalFontData {
    async fetch({ kind, filename }: { kind: string; filename: string }) {
      if (kind !== "standardFontDataUrl" || !/^(Foxit[A-Za-z]+\.pfb|LiberationSans-[A-Za-z]+\.ttf)$/.test(filename)) throw new Error("PDF resource is unsupported; no external resource was loaded.")
      return new Uint8Array(await readFile(join(fonts, filename)))
    }
  }
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), enableXfa: false, useWasm: false, useSystemFonts: false, useWorkerFetch: false, disableFontFace: true, disableAutoFetch: true, disableStream: true, disableRange: true, stopAtErrors: true, verbosity: 0, standardFontDataUrl: `${fonts}/`, BinaryDataFactory: LocalFontData })
  try {
    const document = await loading.promise
    if (!document.numPages || document.numPages > PROJECT_LIMITS.maxPagesPerPdf || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) throw new Error("PDF page count exceeds the 1,000-page/file preparation limit or the requested page is invalid.")
    const content = await (await document.getPage(pageNumber)).getTextContent()
    let text = ""
    for (const item of content.items) {
      if (!("str" in item)) continue
      text += item.str + (item.hasEOL ? "\n" : " ")
      if (text.length > PROJECT_LIMITS.maxPageText) throw new Error("Page text exceeds 80,000 characters; no text was silently truncated.")
    }
    text = text.trim()
    return { pageCount: document.numPages, page: { pageNumber, text, extraction: text ? "complete" : "empty", review: "pending", ...(!text ? { issue: "No embedded text. Visual/OCR review is not implemented by this preparation step." } : {}) } }
  } finally { await loading.destroy() }
}

function imageSize(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mime === "image/png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (mime === "image/jpeg") {
    let offset = 2
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) throw new Error("JPEG header is malformed.")
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218) break
      if (marker === 1 || marker >= 208 && marker <= 215) continue
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) throw new Error("JPEG header is incomplete.")
      if ([192, 193, 194].includes(marker) && size >= 8) return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) }
      offset += size
    }
  }
  throw new Error("Processing copies currently support JPEG and PNG. The original remains available; this image has not been reviewed.")
}
export async function prepareProjectImage(bytes: Uint8Array, mime: string) {
  const dimensions = imageSize(bytes, mime)
  if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width * dimensions.height > PROJECT_LIMITS.maxImagePixels) throw new Error("Image exceeds the 60-megapixel processing limit. Original retained; image review pending.")
  const original = await loadImage(bytes)
  if (original.width !== dimensions.width || original.height !== dimensions.height) throw new Error("Decoded image dimensions do not match its header.")
  const scale = Math.min(1, 1600 / Math.max(original.width, original.height))
  const width = Math.max(1, Math.round(original.width * scale)), height = Math.max(1, Math.round(original.height * scale))
  const canvas = createCanvas(width, height)
  canvas.getContext("2d").drawImage(original, 0, 0, width, height)
  return { ...dimensions, processingWidth: width, processingHeight: height, bytes: new Uint8Array(canvas.toBuffer("image/jpeg", 85)) }
}
