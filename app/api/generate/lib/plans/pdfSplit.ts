import type { PlanPageImage, PlanUpload } from "./types"
import { rasterizePdfToPages } from "./pdfRasterize"

export async function splitPlanUploadsToPages(
  uploads: PlanUpload[]
): Promise<PlanPageImage[]> {
  const pages: PlanPageImage[] = []
  let nextPageNumber = 1

  for (const upload of uploads) {
    if (upload.mimeType === "application/pdf") {
      const pdfPages = await rasterizePdfToPages(upload)

      for (const page of pdfPages) {
        pages.push({
          uploadId: upload.uploadId,
          uploadName: upload.name,
          uploadNote: upload.note,
          sourceMimeType: upload.mimeType,
          sourceKind: "pdf",
          sourcePageNumber: page.sourcePageNumber,
          pageNumber: nextPageNumber,
          imageDataUrl: page.imageDataUrl,
          width: page.width,
          height: page.height,
        })
        nextPageNumber += 1
      }

      continue
    }

    if (!upload.mimeType.startsWith("image/")) continue

    pages.push({
      uploadId: upload.uploadId,
      uploadName: upload.name,
      uploadNote: upload.note,
      sourceMimeType: upload.mimeType,
      sourceKind: "image",
      sourcePageNumber: 1,
      pageNumber: nextPageNumber,
      imageDataUrl: upload.dataUrl,
      width: null,
      height: null,
    })
    nextPageNumber += 1
  }

  return pages
} 
