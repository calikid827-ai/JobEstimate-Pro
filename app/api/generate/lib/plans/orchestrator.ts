import { sanitizePlanUploads } from "./ingest"
import { splitPlanUploadsToPages } from "./pdfSplit"
import { buildSheetIndex } from "./sheetIndex"
import { analyzePlanSheet } from "./analyzeSheet"
import { mergePlanAnalyses } from "./crossSheetMerge"
import type { PlanIntelligence } from "./types"

export async function runPlanIntelligence(args: {
  rawPlans: unknown
  scopeText: string
  trade: string
}): Promise<PlanIntelligence | null> {
  const uploads = sanitizePlanUploads(args.rawPlans)
  if (!uploads.length) return null

  const pages = await splitPlanUploadsToPages(uploads)
  if (!pages.length) return null

  const sheetIndex = await buildSheetIndex(pages)

  const analyses = await Promise.all(
    pages.map((page) =>
      analyzePlanSheet({
        page,
        sheet: sheetIndex.find((x) => x.pageNumber === page.pageNumber) ?? null,
        scopeText: args.scopeText,
        trade: args.trade,
      })
    )
  )

  const merged = mergePlanAnalyses({
    sheetIndex,
    analyses,
    scopeText: args.scopeText,
    trade: args.trade,
  })

  return {
    ok: true,
    uploadsCount: uploads.length,
    pagesCount: pages.length,
    ...merged,
  }
}