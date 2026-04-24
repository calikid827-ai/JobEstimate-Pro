import type { PlanUpload } from "./types"
import { estimateBase64DecodedBytes, getDataUrlMime } from "./dataUrl"
import { MAX_JOB_PLANS, MAX_PLAN_SOURCE_PAGES } from "../../../../lib/plan-upload"

export function sanitizePlanUploads(input: unknown): PlanUpload[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(0, MAX_JOB_PLANS)
    .map((raw, index): PlanUpload => {
      const record = raw && typeof raw === "object" ? raw : null
      const transport =
        record?.transport === "multipart-temp" || record?.transport === "multipart"
          ? "multipart-temp"
          : "inline"
      const dataUrl = typeof record?.dataUrl === "string" ? record.dataUrl.trim() : ""
      const tempFilePath =
        typeof record?.tempFilePath === "string" && record.tempFilePath.trim()
          ? record.tempFilePath.trim()
          : null
      const stagedUploadId =
        typeof record?.stagedUploadId === "string" && record.stagedUploadId.trim()
          ? record.stagedUploadId.trim()
          : null
      const sourcePageNumberMap = Array.isArray(record?.sourcePageNumberMap)
        ? record.sourcePageNumberMap
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0)
        : null
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
        uploadId:
          typeof record?.uploadId === "string" && record.uploadId.trim()
            ? record.uploadId.trim().slice(0, 160)
            : `plan_upload_${index + 1}`,
        name: typeof record?.name === "string" ? record.name.slice(0, 160) : "plan",
        note: typeof record?.note === "string" ? record.note.trim().slice(0, 240) : "",
        mimeType,
        stagedUploadId,
        transport,
        dataUrl,
        tempFilePath,
        sourcePageNumberMap,
        originalBytes:
          typeof record?.originalBytes === "number" &&
          Number.isFinite(record.originalBytes) &&
          record.originalBytes > 0
            ? Math.floor(record.originalBytes)
            : null,
        bytes:
          typeof record?.bytes === "number" && Number.isFinite(record.bytes) && record.bytes > 0
            ? Math.floor(record.bytes)
            : estimateBase64DecodedBytes(dataUrl),
        selectedSourcePages,
      }
    })
    .filter(
      (x) =>
        ((x.transport === "multipart-temp" && !!x.tempFilePath) ||
          (typeof x.dataUrl === "string" && x.dataUrl.startsWith("data:"))) &&
        (x.mimeType === "application/pdf" || x.mimeType.startsWith("image/"))
    )
}
