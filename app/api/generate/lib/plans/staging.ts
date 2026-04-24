import crypto from "crypto"
import { appendFile, copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createWriteStream } from "node:fs"

import {
  ALLOWED_PLAN_MIME_TYPES,
  MAX_PLAN_FILE_BYTES,
  PLAN_UPLOAD_CHUNK_BYTES,
  MAX_TOTAL_PLAN_FILE_BYTES,
  PLAN_UPLOAD_STREAM_CHUNK_BYTES,
  buildSelectedPageUploadModeNote,
  countPdfPagesFromBytes,
  validateCombinedPlanBytes,
  validateSelectedPageExtractionCount,
} from "../../../../lib/plan-upload"
import type { PlanSelectedPageUploadMode, StagedPlanUploadSummary } from "../../../../lib/plan-upload"
import { deriveSelectedPdfUpload } from "./pdfSelect"
import type { PlanUpload } from "./types"

type StagedPlanUploadManifest = {
  stagedUploadId: string
  name: string
  mimeType: string
  bytes: number
  storedAt: string
  sourcePageCount: number | null
  originalBytes?: number | null
  originalSourcePageCount?: number | null
  sourcePageNumberMap?: number[] | null
  selectedPageUploadMode?: PlanSelectedPageUploadMode
  selectedPageUploadNote?: string | null
}

type StagedPlanUpload = StagedPlanUploadManifest & {
  tempRoot: string
  filePath: string
}

const STAGING_ROOT = path.join(tmpdir(), "scopeguard-plan-staging")
const STAGING_SESSION_ROOT = path.join(tmpdir(), "scopeguard-plan-upload-session")
const MANIFEST_FILE = "manifest.json"
const SOURCE_FILE = "source.bin"
const SESSION_FILE = "session.json"
const SESSION_SOURCE_FILE = "source.part"
const PDF_PAGE_SCAN_TAIL = 128

type PlanUploadStageSessionManifest = {
  uploadSessionId: string
  uploadId: string
  name: string
  mimeType: string
  expectedBytes: number
  originalBytes: number | null
  bytesReceived: number
  sourcePageCount: number | null
  originalSourcePageCount: number | null
  sourcePageNumberMap: number[] | null
  selectedSourcePages: number[] | null
  selectedPageUploadMode: "original" | "browser-derived-selected-pages" | "server-derived-selected-pages" | "original-fallback"
  storedAt: string
}

function sanitizeName(name: string): string {
  return String(name || "plan").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160)
}

function getStagedUploadRoot(stagedUploadId: string): string {
  return path.join(STAGING_ROOT, stagedUploadId)
}

function getStagingSessionRoot(uploadSessionId: string): string {
  return path.join(STAGING_SESSION_ROOT, uploadSessionId)
}

async function readStageSession(
  uploadSessionId: string
): Promise<(PlanUploadStageSessionManifest & { tempRoot: string; filePath: string }) | null> {
  const prefix = `${getStagingSessionRoot(uploadSessionId)}-`
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
  const manifestPath = path.join(tempRoot, SESSION_FILE)
  const filePath = path.join(tempRoot, SESSION_SOURCE_FILE)

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PlanUploadStageSessionManifest
    return {
      ...manifest,
      tempRoot,
      filePath,
    }
  } catch {
    return null
  }
}

export async function beginStagedPlanUploadSession(args: {
  uploadId: string
  name: string
  mimeType: string
  expectedBytes: number
  originalBytes?: number | null
  sourcePageCount: number | null
  originalSourcePageCount?: number | null
  sourcePageNumberMap?: number[] | null
  selectedPageUploadMode?: PlanSelectedPageUploadMode
  selectedSourcePages: number[] | null
}): Promise<{ uploadSessionId: string; chunkBytes: number }> {
  const mimeType = String(args.mimeType || "").trim().toLowerCase()
  if (!ALLOWED_PLAN_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error("INVALID_PLAN_MIME"), {
      status: 400,
      code: "INVALID_PLAN_MIME",
      message: `Unsupported plan file type for "${args.name || "plan"}".`,
    })
  }

  const expectedBytes = Math.max(0, Math.floor(Number(args.expectedBytes) || 0))
  if (!expectedBytes) {
    throw Object.assign(new Error("EMPTY_PLAN_UPLOAD"), {
      status: 400,
      code: "EMPTY_PLAN_UPLOAD",
      message: `Plan file "${args.name || "plan"}" is empty.`,
    })
  }
  const selectedSourcePages = Array.isArray(args.selectedSourcePages)
    ? Array.from(
        new Set(
          args.selectedSourcePages
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        )
      )
    : null
  const sourcePageNumberMap = Array.isArray(args.sourcePageNumberMap)
    ? args.sourcePageNumberMap
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : null

  if (selectedSourcePages) {
    validateSelectedPageExtractionCount(selectedSourcePages)
  }

  const canUseSelectedSubsetFallback =
    mimeType === "application/pdf" &&
    selectedSourcePages &&
    typeof args.sourcePageCount === "number" &&
    Number.isFinite(args.sourcePageCount) &&
    selectedSourcePages.length > 0 &&
    selectedSourcePages.length < args.sourcePageCount

  if (expectedBytes > MAX_PLAN_FILE_BYTES && !canUseSelectedSubsetFallback) {
    throw Object.assign(new Error("PLAN_FILE_TOO_LARGE"), {
      status: 413,
      code: "PLAN_FILE_TOO_LARGE",
      message: `Plan file exceeds ${Math.floor(MAX_PLAN_FILE_BYTES / (1024 * 1024))} MB.`,
    })
  }

  validateCombinedPlanBytes(expectedBytes)

  await mkdir(STAGING_SESSION_ROOT, { recursive: true })

  const uploadSessionId = `plan_upload_session_${crypto.randomUUID()}`
  const tempRoot = await mkdtemp(`${getStagingSessionRoot(uploadSessionId)}-`)
  const manifest: PlanUploadStageSessionManifest = {
    uploadSessionId,
    uploadId: String(args.uploadId || "").trim().slice(0, 160) || uploadSessionId,
    name: sanitizeName(args.name),
    mimeType,
    expectedBytes,
    originalBytes:
      typeof args.originalBytes === "number" && Number.isFinite(args.originalBytes) && args.originalBytes > 0
        ? Math.floor(args.originalBytes)
        : expectedBytes,
    bytesReceived: 0,
    sourcePageCount:
      typeof args.sourcePageCount === "number" && Number.isFinite(args.sourcePageCount)
        ? args.sourcePageCount
        : null,
    originalSourcePageCount:
      typeof args.originalSourcePageCount === "number" &&
      Number.isFinite(args.originalSourcePageCount) &&
      args.originalSourcePageCount > 0
        ? Math.floor(args.originalSourcePageCount)
        : typeof args.sourcePageCount === "number" && Number.isFinite(args.sourcePageCount)
          ? args.sourcePageCount
          : null,
    sourcePageNumberMap,
    selectedSourcePages,
    selectedPageUploadMode: args.selectedPageUploadMode || "original",
    storedAt: new Date().toISOString(),
  }

  await writeFile(path.join(tempRoot, SESSION_FILE), JSON.stringify(manifest), "utf8")
  await writeFile(path.join(tempRoot, SESSION_SOURCE_FILE), Buffer.alloc(0))

  return {
    uploadSessionId,
    chunkBytes: PLAN_UPLOAD_CHUNK_BYTES,
  }
}

export async function appendStagedPlanUploadChunk(args: {
  uploadSessionId: string
  chunk: Uint8Array
}): Promise<{ bytesReceived: number }> {
  const session = await readStageSession(args.uploadSessionId)
  if (!session) {
    throw Object.assign(new Error("MISSING_PLAN_UPLOAD_SESSION"), {
      status: 400,
      code: "MISSING_PLAN_UPLOAD_SESSION",
      message: "Plan upload session is missing or expired. Re-upload the plan set.",
    })
  }

  const chunk = args.chunk instanceof Uint8Array ? args.chunk : new Uint8Array()
  if (!chunk.byteLength) {
    return { bytesReceived: session.bytesReceived }
  }

  const nextBytes = session.bytesReceived + chunk.byteLength
  if (nextBytes > session.expectedBytes || nextBytes > MAX_TOTAL_PLAN_FILE_BYTES) {
    throw Object.assign(new Error("PLAN_FILE_TOO_LARGE"), {
      status: 413,
      code: "PLAN_FILE_TOO_LARGE",
      message: `Plan file exceeds ${Math.floor(MAX_TOTAL_PLAN_FILE_BYTES / (1024 * 1024))} MB.`,
    })
  }

  await appendFile(session.filePath, Buffer.from(chunk))
  session.bytesReceived = nextBytes
  await writeFile(path.join(session.tempRoot, SESSION_FILE), JSON.stringify({
    uploadSessionId: session.uploadSessionId,
    uploadId: session.uploadId,
    name: session.name,
    mimeType: session.mimeType,
    expectedBytes: session.expectedBytes,
    originalBytes: session.originalBytes,
    bytesReceived: session.bytesReceived,
    sourcePageCount: session.sourcePageCount,
    originalSourcePageCount: session.originalSourcePageCount,
    sourcePageNumberMap: session.sourcePageNumberMap,
    selectedSourcePages: session.selectedSourcePages,
    selectedPageUploadMode: session.selectedPageUploadMode,
    storedAt: session.storedAt,
  }), "utf8")

  return { bytesReceived: session.bytesReceived }
}

export async function cleanupStagedPlanUploadSession(uploadSessionId: string): Promise<void> {
  const prefix = `${getStagingSessionRoot(uploadSessionId)}-`
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

async function writeStreamedFile(args: {
  file: File
  outputPath: string
  countPdfPages?: boolean
}): Promise<{ bytes: number; sourcePageCount: number | null }> {
  const { file, outputPath, countPdfPages = false } = args
  const writer = createWriteStream(outputPath, { flags: "w" })
  const reader = file.stream().getReader()
  let bytes = 0
  let pendingPdfText = ""
  let sourcePageCount = 0

  const pushPdfText = (text: string, flush = false) => {
    if (!countPdfPages) return

    const scan = pendingPdfText + text
    const stableLength = flush ? scan.length : Math.max(0, scan.length - PDF_PAGE_SCAN_TAIL)
    if (stableLength <= 0) {
      pendingPdfText = scan
      return
    }

    const stableText = scan.slice(0, stableLength)
    sourcePageCount += countPdfPagesFromBytes(Buffer.from(stableText, "latin1"))
    pendingPdfText = scan.slice(stableLength)
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue

      const chunk = Buffer.from(value)
      bytes += chunk.byteLength
      pushPdfText(chunk.toString("latin1"))
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

    pushPdfText("", true)

    return {
      bytes,
      sourcePageCount: countPdfPages ? sourcePageCount : null,
    }
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
  const streamed = await writeStreamedFile({
    file: args.file,
    outputPath: filePath,
    countPdfPages: mimeType === "application/pdf",
  })

  const manifest: StagedPlanUploadManifest = {
    stagedUploadId,
    name: sanitizeName(args.file.name),
    mimeType,
    bytes: streamed.bytes,
    storedAt: new Date().toISOString(),
    sourcePageCount:
      typeof args.sourcePageCount === "number" && Number.isFinite(args.sourcePageCount)
        ? args.sourcePageCount
        : streamed.sourcePageCount,
  }

  await writeFile(path.join(tempRoot, MANIFEST_FILE), JSON.stringify(manifest), "utf8")
  return manifest
}

export async function completeStagedPlanUploadSession(
  uploadSessionId: string
): Promise<
  StagedPlanUploadManifest & {
    filePath: string
    selectedSourcePages: number[] | null
  }
> {
  const session = await readStageSession(uploadSessionId)
  if (!session) {
    throw Object.assign(new Error("MISSING_PLAN_UPLOAD_SESSION"), {
      status: 400,
      code: "MISSING_PLAN_UPLOAD_SESSION",
      message: "Plan upload session is missing or expired. Re-upload the plan set.",
    })
  }

  if (session.bytesReceived !== session.expectedBytes) {
    throw Object.assign(new Error("INCOMPLETE_PLAN_UPLOAD"), {
      status: 400,
      code: "INCOMPLETE_PLAN_UPLOAD",
      message: `Plan upload for "${session.name}" was interrupted before all bytes were received. Retry the upload.`,
    })
  }

  await mkdir(STAGING_ROOT, { recursive: true })

  const stagedUploadId = `plan_stage_${crypto.randomUUID()}`
  const tempRoot = await mkdtemp(`${getStagedUploadRoot(stagedUploadId)}-`)
  const filePath = path.join(tempRoot, SOURCE_FILE)
  await rename(session.filePath, filePath)

  const manifest: StagedPlanUploadManifest = {
    stagedUploadId,
    name: sanitizeName(session.name),
    mimeType: session.mimeType,
    bytes: session.expectedBytes,
    originalBytes: session.originalBytes ?? session.expectedBytes,
    storedAt: new Date().toISOString(),
    sourcePageCount:
      typeof session.sourcePageCount === "number" && Number.isFinite(session.sourcePageCount)
        ? session.sourcePageCount
        : session.mimeType === "application/pdf"
          ? countPdfPagesFromBytes(new Uint8Array(await readFile(filePath)))
          : 1,
    originalSourcePageCount:
      typeof session.originalSourcePageCount === "number" && Number.isFinite(session.originalSourcePageCount)
        ? session.originalSourcePageCount
        : null,
    sourcePageNumberMap: session.sourcePageNumberMap,
    selectedPageUploadMode: session.selectedPageUploadMode || "original",
    selectedPageUploadNote: buildSelectedPageUploadModeNote({
      name: session.name,
      mode: session.selectedPageUploadMode || "original",
      originalBytes: session.originalBytes ?? session.expectedBytes,
      stagedBytes: session.expectedBytes,
    }),
  }

  await writeFile(path.join(tempRoot, MANIFEST_FILE), JSON.stringify(manifest), "utf8")
  await cleanupStagedPlanUploadSession(uploadSessionId)

  return {
    ...manifest,
    filePath,
    selectedSourcePages: session.selectedSourcePages,
  }
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

export async function updateStagedPlanUpload(args: {
  stagedUploadId: string
  filePath?: string | null
  bytes?: number | null
  sourcePageCount?: number | null
  sourcePageNumberMap?: number[] | null
  originalBytes?: number | null
  originalSourcePageCount?: number | null
  selectedPageUploadMode?: PlanSelectedPageUploadMode
  selectedPageUploadNote?: string | null
}): Promise<StagedPlanUpload | null> {
  const staged = await readStagedPlanUpload(args.stagedUploadId)
  if (!staged) return null

  if (args.filePath) {
    await copyFile(args.filePath, staged.filePath)
  }

  const manifest: StagedPlanUploadManifest = {
    stagedUploadId: staged.stagedUploadId,
    name: staged.name,
    mimeType: staged.mimeType,
    bytes:
      typeof args.bytes === "number" && Number.isFinite(args.bytes) && args.bytes > 0
        ? args.bytes
        : staged.bytes,
    storedAt: staged.storedAt,
    sourcePageCount:
      typeof args.sourcePageCount === "number" && Number.isFinite(args.sourcePageCount)
        ? args.sourcePageCount
        : staged.sourcePageCount,
    originalBytes:
      typeof args.originalBytes === "number" && Number.isFinite(args.originalBytes) && args.originalBytes > 0
        ? args.originalBytes
        : staged.originalBytes ?? null,
    originalSourcePageCount:
      typeof args.originalSourcePageCount === "number" &&
      Number.isFinite(args.originalSourcePageCount) &&
      args.originalSourcePageCount > 0
        ? args.originalSourcePageCount
        : staged.originalSourcePageCount ?? null,
    sourcePageNumberMap: Array.isArray(args.sourcePageNumberMap)
      ? args.sourcePageNumberMap
      : staged.sourcePageNumberMap ?? null,
    selectedPageUploadMode: args.selectedPageUploadMode || staged.selectedPageUploadMode || "original",
    selectedPageUploadNote:
      typeof args.selectedPageUploadNote === "string"
        ? args.selectedPageUploadNote
        : staged.selectedPageUploadNote ?? null,
  }

  await writeFile(path.join(staged.tempRoot, MANIFEST_FILE), JSON.stringify(manifest), "utf8")
  return await readStagedPlanUpload(args.stagedUploadId)
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

export async function finalizeSelectedPageStagedUpload(args: {
  stagedUploadId: string
  selectedSourcePages: number[] | null
}): Promise<StagedPlanUploadSummary | null> {
  const staged = await readStagedPlanUpload(args.stagedUploadId)
  if (!staged) return null

  const selectedSourcePages = Array.isArray(args.selectedSourcePages)
    ? Array.from(
        new Set(
          args.selectedSourcePages
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        )
      )
    : []

  if (
    staged.mimeType === "application/pdf" &&
    staged.selectedPageUploadMode !== "browser-derived-selected-pages" &&
    typeof staged.sourcePageCount === "number" &&
    selectedSourcePages.length > 0 &&
    selectedSourcePages.length < staged.sourcePageCount
  ) {
    const derivedRoot = await mkdtemp(path.join(tmpdir(), "scopeguard-derived-plan-upload-"))
    try {
      let derived: Awaited<ReturnType<typeof deriveSelectedPdfUpload>> | null = null
      try {
        derived = await deriveSelectedPdfUpload({
          upload: {
            uploadId: staged.stagedUploadId,
            name: staged.name,
            note: "",
            mimeType: staged.mimeType,
            transport: "multipart-temp",
            tempFilePath: staged.filePath,
            bytes: staged.bytes,
            selectedSourcePages,
          } as PlanUpload,
          outputPdfPath: path.join(derivedRoot, "selected-pages.pdf"),
        })
      } catch {
        derived = null
      }

      if (derived) {
        const updated = await updateStagedPlanUpload({
          stagedUploadId: staged.stagedUploadId,
          filePath: derived.outputPdfPath,
          bytes: derived.outputBytes,
          sourcePageCount: derived.sourcePageNumberMap.length,
          sourcePageNumberMap: derived.sourcePageNumberMap,
          originalBytes: staged.originalBytes ?? staged.bytes,
          originalSourcePageCount: staged.originalSourcePageCount ?? staged.sourcePageCount,
          selectedPageUploadMode: "server-derived-selected-pages",
          selectedPageUploadNote: buildSelectedPageUploadModeNote({
            name: staged.name,
            mode: "server-derived-selected-pages",
            originalBytes: staged.originalBytes ?? staged.bytes,
            stagedBytes: derived.outputBytes,
          }),
        })

        if (updated) {
          return {
            stagedUploadId: updated.stagedUploadId,
            name: updated.name,
            mimeType: updated.mimeType,
            bytes: updated.bytes,
            originalBytes: updated.originalBytes ?? null,
            sourcePageCount: updated.sourcePageCount,
            originalSourcePageCount: updated.originalSourcePageCount ?? null,
            sourcePageNumberMap: updated.sourcePageNumberMap ?? null,
            selectedPageUploadMode: updated.selectedPageUploadMode ?? "server-derived-selected-pages",
            selectedPageUploadNote: updated.selectedPageUploadNote ?? null,
          }
        }
      }

      const fallback = await updateStagedPlanUpload({
        stagedUploadId: staged.stagedUploadId,
        originalBytes: staged.originalBytes ?? staged.bytes,
        originalSourcePageCount: staged.originalSourcePageCount ?? staged.sourcePageCount,
        selectedPageUploadMode: "original-fallback",
        selectedPageUploadNote: buildSelectedPageUploadModeNote({
          name: staged.name,
          mode: "original-fallback",
          originalBytes: staged.originalBytes ?? staged.bytes,
          stagedBytes: staged.bytes,
        }),
      })

      if (fallback) {
        return {
          stagedUploadId: fallback.stagedUploadId,
          name: fallback.name,
          mimeType: fallback.mimeType,
          bytes: fallback.bytes,
          originalBytes: fallback.originalBytes ?? null,
          sourcePageCount: fallback.sourcePageCount,
          originalSourcePageCount: fallback.originalSourcePageCount ?? null,
          sourcePageNumberMap: fallback.sourcePageNumberMap ?? null,
          selectedPageUploadMode: fallback.selectedPageUploadMode ?? "original-fallback",
          selectedPageUploadNote: fallback.selectedPageUploadNote ?? null,
        }
      }
    } finally {
      await rm(derivedRoot, { recursive: true, force: true })
    }
  }

  const unchanged = await updateStagedPlanUpload({
    stagedUploadId: staged.stagedUploadId,
    originalBytes: staged.originalBytes ?? staged.bytes,
    originalSourcePageCount: staged.originalSourcePageCount ?? staged.sourcePageCount,
    selectedPageUploadMode: staged.selectedPageUploadMode ?? "original",
    selectedPageUploadNote: staged.selectedPageUploadNote ?? null,
  })

  if (!unchanged) return null

  return {
    stagedUploadId: unchanged.stagedUploadId,
    name: unchanged.name,
    mimeType: unchanged.mimeType,
    bytes: unchanged.bytes,
    originalBytes: unchanged.originalBytes ?? null,
    sourcePageCount: unchanged.sourcePageCount,
    originalSourcePageCount: unchanged.originalSourcePageCount ?? null,
    sourcePageNumberMap: unchanged.sourcePageNumberMap ?? null,
    selectedPageUploadMode: unchanged.selectedPageUploadMode ?? "original",
    selectedPageUploadNote: unchanged.selectedPageUploadNote ?? null,
  }
}
