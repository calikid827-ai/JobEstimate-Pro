import type { PlanPageImage, PlanUpload } from "./types"
import { readPlanUploadDataUrl } from "./dataUrl"
import { rasterizePdfToPages } from "./pdfRasterize"
import { MAX_PLAN_SOURCE_PAGES } from "../../../../lib/plan-upload"

export async function splitPlanUploadsToPages(
  uploads: PlanUpload[]
): Promise<PlanPageImage[]> {
  const pages: PlanPageImage[] = []
  let nextPageNumber = 1
  let indexedPages = 0

  for (const upload of uploads) {
    if (indexedPages >= MAX_PLAN_SOURCE_PAGES) break

    if (upload.mimeType === "application/pdf") {
      const pdfPages = await rasterizePdfToPages(upload)
      const selectedSourcePages =
        upload.selectedSourcePages === null ? null : new Set(upload.selectedSourcePages)

      for (const page of pdfPages) {
        if (indexedPages >= MAX_PLAN_SOURCE_PAGES) break
        const mappedSourcePageNumber =
          Array.isArray(upload.sourcePageNumberMap) &&
          upload.sourcePageNumberMap[page.sourcePageNumber - 1]
            ? upload.sourcePageNumberMap[page.sourcePageNumber - 1]
            : page.sourcePageNumber

        pages.push({
          uploadId: upload.uploadId,
          uploadName: upload.name,
          uploadNote: upload.note,
          sourceMimeType: upload.mimeType,
          sourceKind: "pdf",
          sourcePageNumber: mappedSourcePageNumber,
          pageNumber: nextPageNumber,
          imageDataUrl: page.imageDataUrl,
          width: page.width,
          height: page.height,
          selectedForAnalysis:
            selectedSourcePages === null ||
            selectedSourcePages.has(mappedSourcePageNumber),
          renderedFromPdf: page.renderedFromPdf,
          renderedImageAvailable: page.renderedImageAvailable,
          extractedText: page.extractedText,
        })
        nextPageNumber += 1
        indexedPages += 1
      }

      continue
    }

    if (!upload.mimeType.startsWith("image/") || indexedPages >= MAX_PLAN_SOURCE_PAGES) continue

    const selectedSourcePages =
      upload.selectedSourcePages === null ? null : new Set(upload.selectedSourcePages)

    const imageDataUrl = await readPlanUploadDataUrl(upload)

    pages.push({
      uploadId: upload.uploadId,
      uploadName: upload.name,
      uploadNote: upload.note,
      sourceMimeType: upload.mimeType,
      sourceKind: "image",
      sourcePageNumber: 1,
      pageNumber: nextPageNumber,
      imageDataUrl,
      width: null,
      height: null,
      selectedForAnalysis:
        selectedSourcePages === null || selectedSourcePages.has(1),
      renderedFromPdf: false,
      renderedImageAvailable: true,
      extractedText: null,
    })
    nextPageNumber += 1
    indexedPages += 1
  }

  return pages
} 
