import { sanitizePlanUploads } from "./ingest"
import { splitPlanUploadsToPages } from "./pdfSplit"
import { buildSheetIndex } from "./sheetIndex"
import { analyzePlanSheet } from "./analyzeSheet"
import { mergePlanAnalyses } from "./crossSheetMerge"
import type {
  PlanEvidenceStrength,
  PlanIntelligence,
  PlanPageImage,
  PlanPageReadStatus,
  PlanSheetAnalysis,
  PlanSheetIndexEntry,
} from "./types"
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function isPlaceholderPdfPage(page: PlanPageImage): boolean {
  return (
    page.sourceKind === "pdf" &&
    page.renderedFromPdf === false &&
    page.renderedImageAvailable !== true &&
    (!page.imageDataUrl || page.imageDataUrl.trim().length === 0)
  )
}

function getPlanPageTextStatus(
  page: PlanPageImage,
  selected: boolean
): PlanPageReadStatus["textStatus"] {
  if (typeof page.extractedText === "string" && page.extractedText.trim().length > 0) {
    return "extracted"
  }

  return selected ? "empty" : "unknown"
}

function getPlanPageImageStatus(
  page: PlanPageImage,
  selected: boolean
): PlanPageReadStatus["imageStatus"] {
  if (page.renderedImageAvailable) return "rendered"
  if (isPlaceholderPdfPage(page)) return "failed"
  return selected ? "not_rendered" : "unknown"
}

function getPlanPageClassificationStatus(
  sheet: PlanSheetIndexEntry | null
): PlanPageReadStatus["classificationStatus"] {
  if (!sheet) return "unknown"

  if (sheet.classification) {
    if (
      sheet.classification.sheetRole !== "unknown" &&
      sheet.classification.discipline !== "unknown" &&
      sheet.classification.confidence >= 60
    ) {
      return "classified"
    }

    if (
      sheet.classification.sheetRole !== "unknown" ||
      sheet.classification.discipline !== "unknown" ||
      sheet.classification.confidence > 0
    ) {
      return "weak"
    }
  }

  const hasSheetIdentity =
    Boolean(sheet.sheetNumber && sheet.sheetNumber.trim()) ||
    Boolean(sheet.sheetTitle && sheet.sheetTitle.trim())
  if (hasSheetIdentity && sheet.discipline !== "unknown" && sheet.confidence >= 60) {
    return "classified"
  }
  if (hasSheetIdentity || sheet.discipline !== "unknown" || sheet.confidence > 0) {
    return "weak"
  }

  return "unknown"
}

function buildPlanPageReadStatuses(args: {
  indexedPages: PlanPageImage[]
  sheetIndex: PlanSheetIndexEntry[]
}): PlanPageReadStatus[] {
  const sheetsByPageNumber = new Map(args.sheetIndex.map((sheet) => [sheet.pageNumber, sheet]))

  return args.indexedPages.map((page) => {
    const sheet = sheetsByPageNumber.get(page.pageNumber) ?? null
    const selected = page.selectedForAnalysis === true
    const textStatus = getPlanPageTextStatus(page, selected)
    const imageStatus = getPlanPageImageStatus(page, selected)
    const classificationStatus = getPlanPageClassificationStatus(sheet)
    const failureReasons: string[] = []
    const warnings: string[] = []

    if (!selected) {
      warnings.push("Page was indexed but skipped because it was not selected for analysis.")
    }

    if (selected && textStatus === "empty") {
      warnings.push("Selected page had no extracted text.")
    }

    if (selected && imageStatus === "not_rendered") {
      warnings.push("Selected page had no rendered image support.")
    }

    if (selected && imageStatus === "failed") {
      failureReasons.push("Selected PDF page did not render as image support.")
    }

    if (isPlaceholderPdfPage(page)) {
      failureReasons.push("PDF rasterization returned a placeholder or blank page.")
    }

    if (classificationStatus === "weak") {
      warnings.push("Sheet classification is weak and needs estimator review.")
    } else if (classificationStatus === "unknown") {
      warnings.push("Sheet classification is unknown and needs estimator review.")
    }

    if (sheet?.classification?.warnings.length) {
      warnings.push(...sheet.classification.warnings)
    }

    if (selected && page.selectedPageUploadMode === "original-fallback") {
      warnings.push(
        "Original PDF fallback was used; selected-page analysis may be limited if rendering or text extraction failed."
      )
    }

    if (page.selectedPageUploadNote) {
      warnings.push(page.selectedPageUploadNote)
    }

    return {
      uploadId: page.uploadId,
      uploadName: page.uploadName,
      pageNumber: page.pageNumber,
      sourcePageNumber: page.sourcePageNumber,
      selected,
      indexed: true,
      textStatus,
      imageStatus,
      classificationStatus,
      sheetNumber: sheet?.sheetNumber ?? null,
      sheetTitle: sheet?.sheetTitle ?? null,
      discipline: sheet?.discipline ?? null,
      failureReasons: uniqueStrings(failureReasons),
      warnings: uniqueStrings(warnings),
    }
  })
}

function summarizePageReadStatuses(statuses: PlanPageReadStatus[]) {
  const selected = statuses.filter((status) => status.selected)
  const selectedReadCount = selected.filter(
    (status) => status.textStatus === "extracted" || status.imageStatus === "rendered"
  ).length
  const pagesNeedingReviewCount = selected.filter(
    (status) =>
      status.failureReasons.length > 0 ||
      status.warnings.length > 0 ||
      (status.textStatus !== "extracted" && status.imageStatus !== "rendered") ||
      status.classificationStatus !== "classified"
  ).length
  const weakClassificationCount = selected.filter(
    (status) => status.classificationStatus !== "classified"
  ).length

  return {
    selectedCount: selected.length,
    selectedReadCount,
    pagesNeedingReviewCount,
    weakClassificationCount,
  }
}

function buildEvidenceStrength(args: {
  indexedPages: PlanPageImage[]
  selectedPages: PlanPageImage[]
  analyses: PlanSheetAnalysis[]
  selectedPagesCount: number
  skippedPagesCount: number
  planReadback: PlanIntelligence["planReadback"]
  pageReadStatuses?: PlanPageReadStatus[]
}): PlanEvidenceStrength {
  const textPagesCount = args.selectedPages.filter((page) =>
    typeof page.extractedText === "string" && page.extractedText.trim().length > 0
  ).length
  const renderedPagesCount = args.selectedPages.filter((page) => page.renderedImageAvailable).length
  const hardQuantityCount = countHardQuantityFindings(args.analyses)
  const confirmationNeeded =
    (args.planReadback?.needsConfirmation?.length ?? 0) > 0 ||
    (args.planReadback?.scopeGapReadback || []).some((gap) => gap.status !== "likely_ready")
  const readStatusSummary = summarizePageReadStatuses(args.pageReadStatuses || [])

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
    `${readStatusSummary.selectedReadCount}/${readStatusSummary.selectedCount || args.selectedPagesCount} selected page${(readStatusSummary.selectedCount || args.selectedPagesCount) === 1 ? "" : "s"} had text or rendered image support.`,
    `${readStatusSummary.pagesNeedingReviewCount} selected page${readStatusSummary.pagesNeedingReviewCount === 1 ? "" : "s"} need read-status review.`,
    `${readStatusSummary.weakClassificationCount} selected page${readStatusSummary.weakClassificationCount === 1 ? "" : "s"} had weak or unknown sheet classification.`,
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
  const finalSelectedSheetsByPageNumber = new Map(
    nextSheetIndex.map((sheet) => [sheet.pageNumber, sheet])
  )
  const finalSheetIndex = sheetIndex.map(
    (sheet) => finalSelectedSheetsByPageNumber.get(sheet.pageNumber) ?? sheet
  )
  const pageReadStatuses = buildPlanPageReadStatuses({
    indexedPages,
    sheetIndex: finalSheetIndex,
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
    pageReadStatuses,
    evidenceStrength: buildEvidenceStrength({
      indexedPages,
      selectedPages,
      analyses,
      selectedPagesCount,
      skippedPagesCount,
      planReadback: merged.planReadback,
      pageReadStatuses,
    }),
    ...merged,
  }
}
