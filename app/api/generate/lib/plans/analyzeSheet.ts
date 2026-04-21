import type {
  PlanPageImage,
  PlanSheetAnalysis,
  PlanSheetIndexEntry,
} from "./types"

export async function analyzePlanSheet(args: {
  page: PlanPageImage
  sheet: PlanSheetIndexEntry | null
  scopeText: string
  trade: string
}): Promise<PlanSheetAnalysis> {
  return {
    pageNumber: args.page.pageNumber,
    sheetNumber: args.sheet?.sheetNumber ?? null,
    sheetTitle: args.sheet?.sheetTitle ?? null,
    discipline: args.sheet?.discipline ?? "unknown",
    textSnippets: [],
    notes: [],
    rooms: [],
    schedules: [],
    tradeFindings: [],
    scaleText: null,
    revision: args.sheet?.revision ?? null,
    confidence: 0,
  }
}