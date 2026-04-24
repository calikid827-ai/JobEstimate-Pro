import { NextRequest, NextResponse } from "next/server"

import { assertSameOrigin } from "../generate/lib/guards"
import {
  buildPlanUploadBeginResponse,
  buildPlanUploadStageErrorResponse,
  buildPlanUploadStageSuccessResponse,
  MAX_JOB_PLANS,
  normalizePlanUploadStageError,
  validateCombinedPlanBytes,
} from "../../lib/plan-upload"
import {
  appendStagedPlanUploadChunk,
  beginStagedPlanUploadSession,
  completeStagedPlanUploadSession,
  finalizeSelectedPageStagedUpload,
  stagePlanUpload,
} from "../generate/lib/plans/staging"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handleLegacyMultipartUpload(req: NextRequest) {
  const form = await req.formData()
  const files = Array.from(form.values()).filter((value): value is File => value instanceof File)

  if (!files.length) {
    return NextResponse.json(
      buildPlanUploadStageErrorResponse("NO_PLAN_FILES", "No plan files were uploaded."),
      { status: 400 }
    )
  }

  if (files.length > MAX_JOB_PLANS) {
    return NextResponse.json(
      buildPlanUploadStageErrorResponse(
        "TOO_MANY_PLAN_FILES",
        `You can upload up to ${MAX_JOB_PLANS} plan files.`
      ),
      { status: 400 }
    )
  }

  let totalBytes = 0
  const staged = []

  for (const file of files) {
    const bytes = file.size || 0
    totalBytes += bytes
    validateCombinedPlanBytes(totalBytes)

    const manifest = await stagePlanUpload({
      file,
      sourcePageCount: file.type === "application/pdf" ? null : 1,
    })

    staged.push({
      stagedUploadId: manifest.stagedUploadId,
      name: manifest.name,
      mimeType: manifest.mimeType,
      bytes: manifest.bytes,
      originalBytes: manifest.originalBytes ?? null,
      sourcePageCount: manifest.sourcePageCount,
      originalSourcePageCount: manifest.originalSourcePageCount ?? null,
      sourcePageNumberMap: manifest.sourcePageNumberMap ?? null,
      selectedPageUploadMode: manifest.selectedPageUploadMode ?? "original",
      selectedPageUploadNote: manifest.selectedPageUploadNote ?? null,
    })
  }

  return NextResponse.json(buildPlanUploadStageSuccessResponse(staged))
}

export async function POST(req: NextRequest) {
  try {
    if (!assertSameOrigin(req)) {
      return NextResponse.json(
        buildPlanUploadStageErrorResponse("BAD_ORIGIN", "Invalid request origin."),
        { status: 403 }
      )
    }

    const contentType = String(req.headers.get("content-type") || "").toLowerCase()
    if (!contentType.includes("application/json")) {
      return await handleLegacyMultipartUpload(req)
    }

    const body = (await req.json().catch(() => null)) as
      | {
          action?: string
          uploadId?: string
          uploadSessionId?: string
          name?: string
          mimeType?: string
          bytes?: number
          originalBytes?: number
          sourcePageCount?: number | null
          originalSourcePageCount?: number | null
          sourcePageNumberMap?: number[] | null
          selectedPageUploadMode?: "original" | "browser-derived-selected-pages" | "server-derived-selected-pages" | "original-fallback"
          selectedSourcePages?: number[] | null
        }
      | null

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        buildPlanUploadStageErrorResponse(
          "INVALID_PLAN_UPLOAD_BODY",
          "Plan upload could not be parsed. Retry the upload, or split the PDF into smaller packages."
        ),
        { status: 400 }
      )
    }

    if (body.action === "begin") {
      const begun = await beginStagedPlanUploadSession({
        uploadId: typeof body.uploadId === "string" ? body.uploadId : "",
        name: typeof body.name === "string" ? body.name : "plan",
        mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
        expectedBytes: Number(body.bytes || 0),
        originalBytes: Number(body.originalBytes || 0),
        sourcePageCount:
          typeof body.sourcePageCount === "number" && Number.isFinite(body.sourcePageCount)
            ? body.sourcePageCount
            : null,
        originalSourcePageCount:
          typeof body.originalSourcePageCount === "number" &&
          Number.isFinite(body.originalSourcePageCount)
            ? body.originalSourcePageCount
            : null,
        sourcePageNumberMap: Array.isArray(body.sourcePageNumberMap)
          ? body.sourcePageNumberMap
          : null,
        selectedPageUploadMode:
          body.selectedPageUploadMode === "browser-derived-selected-pages" ||
          body.selectedPageUploadMode === "server-derived-selected-pages" ||
          body.selectedPageUploadMode === "original-fallback"
            ? body.selectedPageUploadMode
            : "original",
        selectedSourcePages: Array.isArray(body.selectedSourcePages)
          ? body.selectedSourcePages
          : null,
      })

      return NextResponse.json(buildPlanUploadBeginResponse(begun.uploadSessionId))
    }

    if (body.action === "complete") {
      const uploadSessionId =
        typeof body.uploadSessionId === "string" && body.uploadSessionId.trim()
          ? body.uploadSessionId.trim()
          : ""
      if (!uploadSessionId) {
        return NextResponse.json(
          buildPlanUploadStageErrorResponse(
            "MISSING_PLAN_UPLOAD_SESSION",
            "Plan upload session is missing or expired. Re-upload the plan set."
          ),
          { status: 400 }
        )
      }

      const completed = await completeStagedPlanUploadSession(uploadSessionId)
      const finalized = await finalizeSelectedPageStagedUpload({
        stagedUploadId: completed.stagedUploadId,
        selectedSourcePages: completed.selectedSourcePages,
      })

      const staged = finalized
        ? [finalized]
        : [
            {
              stagedUploadId: completed.stagedUploadId,
              name: completed.name,
              mimeType: completed.mimeType,
              bytes: completed.bytes,
              originalBytes: completed.originalBytes ?? null,
              sourcePageCount: completed.sourcePageCount,
              originalSourcePageCount: completed.originalSourcePageCount ?? null,
              sourcePageNumberMap: completed.sourcePageNumberMap ?? null,
              selectedPageUploadMode: completed.selectedPageUploadMode ?? "original",
              selectedPageUploadNote: completed.selectedPageUploadNote ?? null,
            },
          ]

      return NextResponse.json(buildPlanUploadStageSuccessResponse(staged))
    }

    return NextResponse.json(
      buildPlanUploadStageErrorResponse(
        "INVALID_PLAN_UPLOAD_ACTION",
        "Unsupported plan upload action."
      ),
      { status: 400 }
    )
  } catch (error: unknown) {
    const normalized = normalizePlanUploadStageError(error)
    console.error("Plan upload staging failed:", error)
    return NextResponse.json(normalized.body, { status: normalized.status })
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!assertSameOrigin(req)) {
      return NextResponse.json(
        buildPlanUploadStageErrorResponse("BAD_ORIGIN", "Invalid request origin."),
        { status: 403 }
      )
    }

    const uploadSessionId = req.nextUrl.searchParams.get("uploadSessionId")?.trim() || ""
    if (!uploadSessionId) {
      return NextResponse.json(
        buildPlanUploadStageErrorResponse(
          "MISSING_PLAN_UPLOAD_SESSION",
          "Plan upload session is missing or expired. Re-upload the plan set."
        ),
        { status: 400 }
      )
    }

    const bytes = new Uint8Array(await req.arrayBuffer())
    await appendStagedPlanUploadChunk({
      uploadSessionId,
      chunk: bytes,
    })

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const normalized = normalizePlanUploadStageError(error)
    console.error("Plan upload chunk failed:", error)
    return NextResponse.json(normalized.body, { status: normalized.status })
  }
}
