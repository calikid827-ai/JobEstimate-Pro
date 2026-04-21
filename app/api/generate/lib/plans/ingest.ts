import type { PlanUpload } from "./types"

export function sanitizePlanUploads(input: unknown): PlanUpload[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(0, 10)
    .map((raw: any) => ({
      name: typeof raw?.name === "string" ? raw.name.slice(0, 160) : "plan",
      mimeType: typeof raw?.mimeType === "string" ? raw.mimeType : "",
      dataUrl: typeof raw?.dataUrl === "string" ? raw.dataUrl : "",
    }))
    .filter((x) => x.dataUrl.startsWith("data:"))
}