import type {
  PlanPageImage,
  PlanSheetAnalysis,
  PlanSheetIndexEntry,
} from "./types"
import { buildPlanSheetAnalysis } from "./analysisHeuristics"

export async function analyzePlanSheet(args: {
  page: PlanPageImage
  sheet: PlanSheetIndexEntry | null
  scopeText: string
  trade: string
}): Promise<PlanSheetAnalysis> {
  const analysis = buildPlanSheetAnalysis(args)

  return {
    uploadId: args.page.uploadId,
    uploadName: args.page.uploadName,
    sourcePageNumber: args.page.sourcePageNumber,
    pageNumber: args.page.pageNumber,
    sheetNumber: args.sheet?.sheetNumber ?? null,
    sheetTitle: args.sheet?.sheetTitle ?? null,
    discipline: args.sheet?.discipline ?? "unknown",
    textSnippets: analysis.textSnippets,
    notes: analysis.notes,
    rooms: analysis.rooms,
    schedules: analysis.schedules,
    tradeFindings: analysis.tradeFindings,
    scaleText: analysis.scaleText,
    revision: args.sheet?.revision ?? null,
    confidence: analysis.confidence,
  }
}
