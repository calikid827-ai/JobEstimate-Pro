import { sanitizePlanUploads } from "./ingest"
import { splitPlanUploadsToPages } from "./pdfSplit"
import { buildSheetIndex } from "./sheetIndex"
import { analyzePlanSheet } from "./analyzeSheet"
import { mergePlanAnalyses } from "./crossSheetMerge"
import type { PlanEvidenceStrength, PlanIntelligence, PlanPageImage, PlanSheetAnalysis } from "./types"
import {
  analyzePlanSheetVision,
  mergePlanVisionEnhancement,
  shouldRunPlanVisionFallback,
} from "./visionFallback"

const MAX_PLAN_VISION_PAGES = 3

function countHardQuantityFindings(analyses: PlanSheetAnalysis[]): number {
  return analyses.reduce((sum, analysis) => {
    const tradeQuantities = (analysis.tradeFindings || []).filter(
      (finding) => typeof finding.quantity === "number" && finding.quantity > 0
    ).length
    const roomQuantities = (analysis.rooms || []).filter(
      (room) => typeof room.areaSqft === "number" && room.areaSqft > 0
    ).length

    return sum + tradeQuantities + roomQuantities
  }, 0)
}

function buildEvidenceStrength(args: {
  indexedPages: PlanPageImage[]
  selectedPages: PlanPageImage[]
  analyses: PlanSheetAnalysis[]
  selectedPagesCount: number
  skippedPagesCount: number
  planReadback: PlanIntelligence["planReadback"]
}): PlanEvidenceStrength {
  const textPagesCount = args.selectedPages.filter((page) =>
    typeof page.extractedText === "string" && page.extractedText.trim().length > 0
  ).length
  const renderedPagesCount = args.selectedPages.filter((page) => page.renderedImageAvailable).length
  const hardQuantityCount = countHardQuantityFindings(args.analyses)
  const confirmationNeeded =
    (args.planReadback?.needsConfirmation?.length ?? 0) > 0 ||
    (args.planReadback?.scopeGapReadback || []).some((gap) => gap.status !== "likely_ready")

  const level: PlanEvidenceStrength["level"] =
    hardQuantityCount > 0 && (textPagesCount > 0 || renderedPagesCount > 0)
      ? "strong"
      : textPagesCount > 0 || renderedPagesCount > 0
        ? "useful"
        : "review_only"
  const label: PlanEvidenceStrength["label"] =
    level === "strong" ? "Strong" : level === "useful" ? "Useful" : "Review-only"
  const details = [
    `${args.selectedPagesCount} selected sheet/page${args.selectedPagesCount === 1 ? "" : "s"} reviewed.`,
    textPagesCount > 0
      ? `${textPagesCount} page${textPagesCount === 1 ? "" : "s"} had extractable text.`
      : "No extractable text was confirmed from selected pages.",
    renderedPagesCount > 0
      ? `${renderedPagesCount} page${renderedPagesCount === 1 ? "" : "s"} rendered as image support for plan review.`
      : "Rendered image support was not confirmed for selected pages.",
    hardQuantityCount > 0
      ? `Hard quantities found in ${hardQuantityCount} plan item${hardQuantityCount === 1 ? "" : "s"}.`
      : "Measured quantities still need confirmation.",
    confirmationNeeded
      ? "Estimator confirmation is still needed before high-confidence pricing."
      : "No major confirmation gap was flagged in the current plan readback.",
  ]

  return {
    level,
    label,
    selectedPagesCount: args.selectedPagesCount,
    indexedPagesCount: args.indexedPages.length,
    skippedPagesCount: args.skippedPagesCount,
    textPagesCount,
    renderedPagesCount,
    hardQuantityCount,
    confirmationNeeded,
    summary:
      hardQuantityCount > 0
        ? "Hard quantities found from selected plan evidence."
        : confirmationNeeded
          ? "Plan readback is available, but measured quantities still need confirmation."
          : "Plan evidence is review-only and should be confirmed before pricing confidence is raised.",
    details,
  }
}

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
  const selectedPagesCount = selectedPages.length
  const skippedPagesCount = Math.max(0, indexedPages.length - selectedPagesCount)

  return {
    ok: true,
    uploadsCount: uploads.length,
    pagesCount: selectedPagesCount,
    indexedPagesCount: indexedPages.length,
    selectedPagesCount,
    skippedPagesCount,
    evidenceStrength: buildEvidenceStrength({
      indexedPages,
      selectedPages,
      analyses,
      selectedPagesCount,
      skippedPagesCount,
      planReadback: merged.planReadback,
    }),
    ...merged,
  }
}
