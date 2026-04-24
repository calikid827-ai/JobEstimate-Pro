import { execFile } from "node:child_process"
import { stat } from "node:fs/promises"
import { promisify } from "node:util"
import path from "node:path"

import type { PlanUpload } from "./types"
import { validateDerivedPlanBytes, validateSelectedPageExtractionCount } from "../../../../lib/plan-upload"

const execFileAsync = promisify(execFile)
const SWIFT_EXPORT_SCRIPT = path.resolve(process.cwd(), "scripts/export_pdf_pages.swift")

type SelectedPdfExportResult = {
  outputPdfPath: string
  outputBytes: number
  sourcePageNumberMap: number[]
}

type SwiftSelectedPdfResult = {
  outputPdfPath?: string
  outputBytes?: number
  sourcePageNumberMap?: number[]
}

export async function deriveSelectedPdfUpload(args: {
  upload: PlanUpload
  outputPdfPath: string
}): Promise<SelectedPdfExportResult | null> {
  if (!args.upload.tempFilePath || args.upload.mimeType !== "application/pdf") return null
  const selectedPages = Array.isArray(args.upload.selectedSourcePages)
    ? [...args.upload.selectedSourcePages].filter((value) => Number.isInteger(value) && value > 0)
    : []

  if (!selectedPages.length) return null

  validateSelectedPageExtractionCount(selectedPages)

  const { stdout } = await execFileAsync(
    "/usr/bin/swift",
    [
      "-module-cache-path",
      path.join(path.dirname(args.outputPdfPath), "module-cache"),
      "-sdk-module-cache-path",
      path.join(path.dirname(args.outputPdfPath), "module-cache"),
      "-clang-scanner-module-cache-path",
      path.join(path.dirname(args.outputPdfPath), "module-cache"),
      SWIFT_EXPORT_SCRIPT,
      args.upload.tempFilePath,
      args.outputPdfPath,
      selectedPages.join(","),
    ],
    {
      cwd: process.cwd(),
      maxBuffer: 8_000_000,
    }
  )

  const parsed = JSON.parse(String(stdout || "")) as SwiftSelectedPdfResult
  const outputPdfPath = typeof parsed.outputPdfPath === "string" ? parsed.outputPdfPath : ""
  const outputBytes = Number(parsed.outputBytes || 0)
  const sourcePageNumberMap = Array.isArray(parsed.sourcePageNumberMap)
    ? parsed.sourcePageNumberMap
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : []

  if (!outputPdfPath || !outputBytes || !sourcePageNumberMap.length) {
    return null
  }

  await stat(outputPdfPath)
  validateDerivedPlanBytes(outputBytes)

  return {
    outputPdfPath,
    outputBytes,
    sourcePageNumberMap,
  }
}
