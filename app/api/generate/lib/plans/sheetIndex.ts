import type { PlanPageImage, PlanSheetIndexEntry } from "./types"
import { buildSheetIndexEntryFromPage } from "./sheetHeuristics"

export async function buildSheetIndex(
  pages: PlanPageImage[]
): Promise<PlanSheetIndexEntry[]> {
  return pages.map((page) => {
    const inferred = buildSheetIndexEntryFromPage(page)

    return {
      uploadId: page.uploadId,
      uploadName: page.uploadName,
      sourcePageNumber: page.sourcePageNumber,
      pageNumber: page.pageNumber,
      sheetNumber: inferred.sheetNumber,
      sheetTitle: inferred.sheetTitle,
      discipline: inferred.discipline,
      confidence: inferred.confidence,
      revision: inferred.revision,
    }
  })
}
