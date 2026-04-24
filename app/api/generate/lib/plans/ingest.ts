import type { PlanUpload } from "./types"
import { estimateBase64DecodedBytes, getDataUrlMime } from "./dataUrl"
import { MAX_JOB_PLANS, MAX_PLAN_SOURCE_PAGES } from "../../../../lib/plan-upload"

export function sanitizePlanUploads(input: unknown): PlanUpload[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(0, MAX_JOB_PLANS)
    .map((raw, index): PlanUpload => {
      const record = raw && typeof raw === "object" ? raw : null
      const dataUrl = typeof record?.dataUrl === "string" ? record.dataUrl.trim() : ""
      const mimeTypeRaw =
        typeof record?.mimeType === "string"
          ? record.mimeType.trim().toLowerCase()
          : ""
      const mimeType = mimeTypeRaw || getDataUrlMime(dataUrl) || ""
      const selectedSourcePages: number[] | null = Array.isArray(record?.selectedSourcePages)
        ? Array.from(
            new Set(
              record.selectedSourcePages
                .map((value: unknown) => Number(value))
                .filter((value: number) => Number.isInteger(value) && value > 0)
                .slice(0, MAX_PLAN_SOURCE_PAGES)
            )
          )
        : null

      return {
        uploadId: `plan_upload_${index + 1}`,
        name: typeof record?.name === "string" ? record.name.slice(0, 160) : "plan",
        note: typeof record?.note === "string" ? record.note.trim().slice(0, 240) : "",
        mimeType,
        dataUrl,
        bytes: estimateBase64DecodedBytes(dataUrl),
        selectedSourcePages,
      }
    })
    .filter(
      (x) =>
        x.dataUrl.startsWith("data:") &&
        (x.mimeType === "application/pdf" || x.mimeType.startsWith("image/"))
    )
}
