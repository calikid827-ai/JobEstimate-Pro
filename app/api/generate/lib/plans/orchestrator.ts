import { sanitizePlanUploads } from "./ingest"
import { splitPlanUploadsToPages } from "./pdfSplit"
import { buildSheetIndex } from "./sheetIndex"
import { analyzePlanSheet } from "./analyzeSheet"
import { mergePlanAnalyses } from "./crossSheetMerge"
import type { PlanIntelligence } from "./types"
import {
  analyzePlanSheetVision,
  mergePlanVisionEnhancement,
  shouldRunPlanVisionFallback,
} from "./visionFallback"

const MAX_PLAN_VISION_PAGES = 3

export async function runPlanIntelligence(args: {
  rawPlans: unknown
  scopeText: string
  trade: string
}): Promise<PlanIntelligence | null> {
  const uploads = sanitizePlanUploads(args.rawPlans)
  if (!uploads.length) return null

  const indexedPages = await splitPlanUploadsToPages(uploads)
  if (!indexedPages.length) return null

  const sheetIndex = await buildSheetIndex(indexedPages)
  const selectedPages = indexedPages.filter((page) => page.selectedForAnalysis)
  const selectedSheetIndex = sheetIndex.filter((sheet) => sheet.selectedForAnalysis)
  if (!selectedPages.length) return null

  const heuristicAnalyses = await Promise.all(
    selectedPages.map((page) =>
      analyzePlanSheet({
        page,
        sheet: selectedSheetIndex.find((x) => x.pageNumber === page.pageNumber) ?? null,
        scopeText: args.scopeText,
        trade: args.trade,
      })
    )
  )

  const weakImagePages = selectedPages
    .map((page, index) => ({
      page,
      index,
      sheet: selectedSheetIndex.find((x) => x.pageNumber === page.pageNumber) ?? null,
      analysis: heuristicAnalyses[index],
    }))
    .filter(
      (entry) =>
        entry.page.imageDataUrl &&
        shouldRunPlanVisionFallback(entry.analysis)
    )
    .slice(0, MAX_PLAN_VISION_PAGES)

  const visionResults = await Promise.all(
    weakImagePages.map(async (entry) => ({
      index: entry.index,
      enhancement: await analyzePlanSheetVision({
        page: entry.page,
        sheet: entry.sheet,
        scopeText: args.scopeText,
        trade: args.trade,
      }),
    }))
  )

  const analyses = [...heuristicAnalyses]
  const nextSheetIndex = [...selectedSheetIndex]

  for (const result of visionResults) {
    if (!result.enhancement) continue

    const merged = mergePlanVisionEnhancement({
      base: analyses[result.index],
      enhancement: result.enhancement,
    })

    analyses[result.index] = merged

    const sheet = nextSheetIndex[result.index]
    if (!sheet) continue

    nextSheetIndex[result.index] = {
      ...sheet,
      sheetTitle: sheet.sheetTitle ?? result.enhancement.sheetTitle ?? null,
      discipline:
        sheet.discipline !== "unknown"
          ? sheet.discipline
          : result.enhancement.discipline ?? "unknown",
      confidence:
        result.enhancement.sheetTitle || result.enhancement.discipline
          ? Math.max(sheet.confidence, merged.confidence)
          : sheet.confidence,
    }
  }

  const merged = mergePlanAnalyses({
    sheetIndex: nextSheetIndex,
    analyses,
    scopeText: args.scopeText,
    trade: args.trade,
  })

  return {
    ok: true,
    uploadsCount: uploads.length,
    pagesCount: selectedPages.length,
    indexedPagesCount: indexedPages.length,
    selectedPagesCount: selectedPages.length,
    skippedPagesCount: Math.max(0, indexedPages.length - selectedPages.length),
    ...merged,
  }
}
