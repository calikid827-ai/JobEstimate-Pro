import type { PlanIntelligence, PlanSheetAnalysis, PlanSheetIndexEntry } from "./types"

export function mergePlanAnalyses(args: {
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  scopeText: string
  trade: string
}): Omit<PlanIntelligence, "ok" | "uploadsCount" | "pagesCount"> {
  return {
    sheetIndex: args.sheetIndex,
    analyses: args.analyses,
    takeoff: {
      floorSqft: null,
      wallSqft: null,
      ceilingSqft: null,
      trimLf: null,
      doorCount: null,
      windowCount: null,
      deviceCount: null,
      fixtureCount: null,
      roomCount: null,
      sourceNotes: [],
    },
    scopeAssist: {
      missingScopeFlags: [],
      suggestedAdditions: [],
      conflicts: [],
    },
    evidence: {
      summaryRefs: [],
      quantityRefs: [],
      riskRefs: [],
    },
    detectedTrades: [],
    detectedRooms: [],
    summary: "",
    confidenceScore: 0,
  }
}