import type { PlanUpload } from "./types"
import { estimateBase64DecodedBytes, getDataUrlMime } from "./dataUrl"

export function sanitizePlanUploads(input: unknown): PlanUpload[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(0, 10)
    .map((raw, index): PlanUpload => {
      const record = raw && typeof raw === "object" ? raw : null
      const dataUrl = typeof record?.dataUrl === "string" ? record.dataUrl.trim() : ""
      const mimeTypeRaw =
        typeof record?.mimeType === "string"
          ? record.mimeType.trim().toLowerCase()
          : ""
      const mimeType = mimeTypeRaw || getDataUrlMime(dataUrl) || ""

      return {
        uploadId: `plan_upload_${index + 1}`,
        name: typeof record?.name === "string" ? record.name.slice(0, 160) : "plan",
        note: typeof record?.note === "string" ? record.note.trim().slice(0, 240) : "",
        mimeType,
        dataUrl,
        bytes: estimateBase64DecodedBytes(dataUrl),
      }
    })
    .filter(
      (x) =>
        x.dataUrl.startsWith("data:") &&
        (x.mimeType === "application/pdf" || x.mimeType.startsWith("image/"))
    )
}
