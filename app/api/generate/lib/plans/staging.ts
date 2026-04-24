import crypto from "crypto"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createWriteStream } from "node:fs"

import {
  ALLOWED_PLAN_MIME_TYPES,
  MAX_DERIVED_PLAN_FILE_BYTES,
  MAX_PLAN_FILE_BYTES,
  MAX_SELECTED_PAGE_EXPORT_COUNT,
  MAX_TOTAL_PLAN_FILE_BYTES,
  PLAN_UPLOAD_STREAM_CHUNK_BYTES,
} from "../../../../lib/plan-upload"

type StagedPlanUploadManifest = {
  stagedUploadId: string
  name: string
  mimeType: string
  bytes: number
  storedAt: string
  sourcePageCount: number | null
}

type StagedPlanUpload = StagedPlanUploadManifest & {
  tempRoot: string
  filePath: string
}

const STAGING_ROOT = path.join(tmpdir(), "scopeguard-plan-staging")
const MANIFEST_FILE = "manifest.json"
const SOURCE_FILE = "source.bin"

function sanitizeName(name: string): string {
  return String(name || "plan").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160)
}

function getStagedUploadRoot(stagedUploadId: string): string {
  return path.join(STAGING_ROOT, stagedUploadId)
}

async function writeStreamedFile(file: File, outputPath: string): Promise<number> {
  const writer = createWriteStream(outputPath, { flags: "w" })
  const reader = file.stream().getReader()
  let bytes = 0

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue

      const chunk = Buffer.from(value)
      bytes += chunk.byteLength
      if (bytes > MAX_PLAN_FILE_BYTES) {
        throw Object.assign(new Error("PLAN_FILE_TOO_LARGE"), {
          status: 413,
          code: "PLAN_FILE_TOO_LARGE",
          message: `Plan file exceeds ${Math.floor(MAX_PLAN_FILE_BYTES / (1024 * 1024))} MB.`,
        })
      }

      for (let offset = 0; offset < chunk.byteLength; offset += PLAN_UPLOAD_STREAM_CHUNK_BYTES) {
        const slice = chunk.subarray(offset, offset + PLAN_UPLOAD_STREAM_CHUNK_BYTES)
        await new Promise<void>((resolve, reject) => {
          writer.write(slice, (error?: Error | null) => {
            if (error) reject(error)
            else resolve()
          })
        })
      }
    }

    await new Promise<void>((resolve, reject) => {
      writer.end((error?: Error | null) => {
        if (error) reject(error)
        else resolve()
      })
    })

    return bytes
  } catch (error) {
    writer.destroy()
    throw error
  }
}

export async function stagePlanUpload(args: {
  file: File
  sourcePageCount: number | null
}): Promise<StagedPlanUploadManifest> {
  const mimeType = String(args.file.type || "").trim().toLowerCase()
  if (!ALLOWED_PLAN_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error("INVALID_PLAN_MIME"), {
      status: 400,
      code: "INVALID_PLAN_MIME",
      message: `Unsupported plan file type for "${args.file.name || "plan"}".`,
    })
  }

  await mkdir(STAGING_ROOT, { recursive: true })

  const stagedUploadId = `plan_stage_${crypto.randomUUID()}`
  const tempRoot = await mkdtemp(`${getStagedUploadRoot(stagedUploadId)}-`)
  const filePath = path.join(tempRoot, SOURCE_FILE)
  const bytes = await writeStreamedFile(args.file, filePath)

  const manifest: StagedPlanUploadManifest = {
    stagedUploadId,
    name: sanitizeName(args.file.name),
    mimeType,
    bytes,
    storedAt: new Date().toISOString(),
    sourcePageCount:
      typeof args.sourcePageCount === "number" && Number.isFinite(args.sourcePageCount)
        ? args.sourcePageCount
        : null,
  }

  await writeFile(path.join(tempRoot, MANIFEST_FILE), JSON.stringify(manifest), "utf8")
  return manifest
}

export async function readStagedPlanUpload(
  stagedUploadId: string
): Promise<StagedPlanUpload | null> {
  const prefix = `${getStagedUploadRoot(stagedUploadId)}-`
  const parent = path.dirname(prefix)
  const basePrefix = path.basename(prefix)

  let entries: string[] = []
  try {
    entries = await readdir(parent)
  } catch {
    return null
  }

  const matched = entries.find((entry) => entry.startsWith(basePrefix))
  if (!matched) return null

  const tempRoot = path.join(parent, matched)
  const manifestPath = path.join(tempRoot, MANIFEST_FILE)
  const filePath = path.join(tempRoot, SOURCE_FILE)

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as StagedPlanUploadManifest
    await stat(filePath)
    return {
      ...manifest,
      tempRoot,
      filePath,
    }
  } catch {
    return null
  }
}

export async function cleanupStagedPlanUpload(stagedUploadId: string): Promise<void> {
  const prefix = `${getStagedUploadRoot(stagedUploadId)}-`
  const parent = path.dirname(prefix)
  const basePrefix = path.basename(prefix)

  let entries: string[] = []
  try {
    entries = await readdir(parent)
  } catch {
    return
  }

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(basePrefix))
      .map((entry) => rm(path.join(parent, entry), { recursive: true, force: true }))
  )
}

export function validateDerivedPlanBytes(bytes: number) {
  if (bytes > MAX_DERIVED_PLAN_FILE_BYTES) {
    throw Object.assign(new Error("DERIVED_PLAN_TOO_LARGE"), {
      status: 413,
      code: "DERIVED_PLAN_TOO_LARGE",
      message:
        `Selected-page PDF is still too large after extraction. Reduce selected pages further or split the plan set into smaller packages.`,
    })
  }
}

export function validateSelectedPageExtractionCount(selectedPages: number[]) {
  if (selectedPages.length > MAX_SELECTED_PAGE_EXPORT_COUNT) {
    throw Object.assign(new Error("TOO_MANY_SELECTED_PAGES"), {
      status: 413,
      code: "TOO_MANY_SELECTED_PAGES",
      message:
        `Selected-page export is limited to ${MAX_SELECTED_PAGE_EXPORT_COUNT} PDF pages per plan. Reduce selected pages further or split the plan set.`,
    })
  }
}

export function validateCombinedPlanBytes(totalBytes: number) {
  if (totalBytes > MAX_TOTAL_PLAN_FILE_BYTES) {
    throw Object.assign(new Error("PLAN_UPLOAD_TOO_LARGE"), {
      status: 413,
      code: "PLAN_UPLOAD_TOO_LARGE",
      message: `Combined plan upload size exceeds ${Math.floor(MAX_TOTAL_PLAN_FILE_BYTES / (1024 * 1024))} MB.`,
    })
  }
}
