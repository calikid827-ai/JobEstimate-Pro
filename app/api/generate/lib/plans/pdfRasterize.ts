import type { PlanPageImage, PlanUpload } from "./types"
import { decodeDataUrlToBuffer } from "./dataUrl"
import { clampPlanSourcePageCount, countPdfPagesFromBytes } from "../../../../lib/plan-upload"

export type RasterizedPdfPage = Pick<
  PlanPageImage,
  "sourcePageNumber" | "imageDataUrl" | "width" | "height"
>

export async function rasterizePdfToPages(
  upload: PlanUpload
): Promise<RasterizedPdfPage[]> {
  const bytes = decodeDataUrlToBuffer(upload.dataUrl)
  const countedPages = countPdfPagesFromBytes(bytes)
  const totalPages = clampPlanSourcePageCount(countedPages)
  const pages: RasterizedPdfPage[] = []

  for (let sourcePageNumber = 1; sourcePageNumber <= totalPages; sourcePageNumber += 1) {
    pages.push({
      sourcePageNumber,
      imageDataUrl: "",
      width: null,
      height: null,
    })
  }

  return pages
}
