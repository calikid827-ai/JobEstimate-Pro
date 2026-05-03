import type { PlanPageImage, PlanUpload } from "./types"
import { readPlanUploadBuffer } from "./dataUrl"
import { clampPlanSourcePageCount, countPdfPagesFromBytes } from "../../../../lib/plan-upload"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

export type RasterizedPdfPage = Pick<
  PlanPageImage,
  "sourcePageNumber" | "imageDataUrl" | "width" | "height" | "renderedFromPdf" | "renderedImageAvailable" | "extractedText"
>

type SwiftRenderPageRecord = {
  sourcePageNumber: number
  width: number | null
  height: number | null
  text?: string | null
  imageFile?: string | null
}

type SwiftRenderResult = {
  pageCount: number
  pages: SwiftRenderPageRecord[]
}

const execFileAsync = promisify(execFile)
const SWIFT_RENDER_SCRIPT = path.resolve(process.cwd(), "scripts/render_pdf_pages.swift")

function toDataUrlFromPng(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`
}

function getRenderPageSelection(upload: PlanUpload): number[] | null {
  if (!Array.isArray(upload.selectedSourcePages)) return null

  if (Array.isArray(upload.sourcePageNumberMap) && upload.sourcePageNumberMap.length > 0) {
    return upload.sourcePageNumberMap.map((_, index) => index + 1)
  }

  return upload.selectedSourcePages
}

export async function rasterizePdfToPages(
  upload: PlanUpload
): Promise<RasterizedPdfPage[]> {
  const bytes = await readPlanUploadBuffer(upload)
  const countedPages = countPdfPagesFromBytes(bytes)
  const totalPages = clampPlanSourcePageCount(countedPages)
  const pages: RasterizedPdfPage[] = []

  for (let sourcePageNumber = 1; sourcePageNumber <= totalPages; sourcePageNumber += 1) {
    pages.push({
      sourcePageNumber,
      imageDataUrl: "",
      width: null,
      height: null,
      renderedFromPdf: false,
      renderedImageAvailable: false,
      extractedText: null,
    })
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "scopeguard-plan-render-"))
  const pdfPath = path.join(tempRoot, "upload.pdf")
  const outputDir = path.join(tempRoot, "pages")
  const renderPageSelection = getRenderPageSelection(upload)
  const selectedPagesCsv = Array.isArray(renderPageSelection)
    ? renderPageSelection.join(",")
    : ""

  try {
    await writeFile(pdfPath, bytes)

    const { stdout } = await execFileAsync(
      "/usr/bin/swift",
      [
        "-module-cache-path",
        path.join(tempRoot, "module-cache"),
        "-sdk-module-cache-path",
        path.join(tempRoot, "module-cache"),
        "-clang-scanner-module-cache-path",
        path.join(tempRoot, "module-cache"),
        SWIFT_RENDER_SCRIPT,
        pdfPath,
        outputDir,
        selectedPagesCsv,
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 12_000_000,
      }
    )

    const parsed = JSON.parse(String(stdout || "")) as SwiftRenderResult
    if (!Array.isArray(parsed?.pages) || parsed.pages.length === 0) {
      return pages
    }

    return await Promise.all(
      parsed.pages.slice(0, totalPages).map(async (page) => {
        const imageDataUrl =
          page.imageFile
            ? toDataUrlFromPng(await readFile(path.join(outputDir, page.imageFile)))
            : ""

        return {
          sourcePageNumber: page.sourcePageNumber,
          imageDataUrl,
          width: Number.isFinite(page.width) ? Number(page.width) : null,
          height: Number.isFinite(page.height) ? Number(page.height) : null,
          renderedFromPdf: true,
          renderedImageAvailable: imageDataUrl.length > 0,
          extractedText: typeof page.text === "string" && page.text.trim() ? page.text.trim() : null,
        }
      })
    )
  } catch {
    return pages
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
