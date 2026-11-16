import { createHash } from "node:crypto"
import type { AnalysisResult, AnalysisSource } from "./types"

/** JSONB may reorder keys; the same retained contents keep the same identity. */
export function canonicalAnalysis(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalAnalysis).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalAnalysis(child)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
export function projectAnalysisResultIdentity(record: { id: string; fingerprint: string; sourceVersions: AnalysisSource[] }, result: AnalysisResult) {
  return createHash("sha256").update(canonicalAnalysis({ fingerprint: record.fingerprint, attemptId: record.id, sources: record.sourceVersions, result })).digest("hex")
}
