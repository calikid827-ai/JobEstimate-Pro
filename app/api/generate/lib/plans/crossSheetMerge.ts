import type { PlanIntelligence, PlanSheetAnalysis, PlanSheetIndexEntry } from "./types"
import { buildMergedPlanIntelligence } from "./mergeHeuristics"

export function mergePlanAnalyses(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  scopeText: string
  trade: string
}): Omit<PlanIntelligence, "ok" | "uploadsCount" | "pagesCount"> {
  return buildMergedPlanIntelligence(args)
}
