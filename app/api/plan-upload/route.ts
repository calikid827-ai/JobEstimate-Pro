import { NextRequest, NextResponse } from "next/server"

import { assertSameOrigin, jsonError } from "../generate/lib/guards"
import { countPdfPagesFromBytes, MAX_JOB_PLANS } from "../../lib/plan-upload"
import { stagePlanUpload, validateCombinedPlanBytes } from "../generate/lib/plans/staging"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    if (!assertSameOrigin(req)) {
      return jsonError(403, "BAD_ORIGIN", "Invalid request origin.")
    }

    const form = await req.formData()
    const files = Array.from(form.values()).filter((value): value is File => value instanceof File)

    if (!files.length) {
      return jsonError(400, "NO_PLAN_FILES", "No plan files were uploaded.")
    }

    if (files.length > MAX_JOB_PLANS) {
      return jsonError(400, "TOO_MANY_PLAN_FILES", `You can upload up to ${MAX_JOB_PLANS} plan files.`)
    }

    let totalBytes = 0
    const staged = []

    for (const file of files) {
      const bytes = file.size || 0
      totalBytes += bytes
      validateCombinedPlanBytes(totalBytes)

      const sourcePageCount =
        file.type === "application/pdf"
          ? countPdfPagesFromBytes(new Uint8Array(await file.arrayBuffer()))
          : 1

      const manifest = await stagePlanUpload({
        file,
        sourcePageCount,
      })

      staged.push({
        stagedUploadId: manifest.stagedUploadId,
        name: manifest.name,
        mimeType: manifest.mimeType,
        bytes: manifest.bytes,
        sourcePageCount: manifest.sourcePageCount,
      })
    }

    return NextResponse.json({
      ok: true,
      staged,
    })
  } catch (error: unknown) {
    const typedError = error as { status?: number; code?: string; message?: string }
    if (typedError?.status) {
      return jsonError(
        typedError.status,
        typedError.code || "PLAN_UPLOAD_ERROR",
        typedError.message || "Plan upload failed."
      )
    }

    console.error("Plan upload staging failed:", error)
    return NextResponse.json({ ok: false, code: "PLAN_UPLOAD_ERROR", message: "Plan upload failed." }, { status: 500 })
  }
}
