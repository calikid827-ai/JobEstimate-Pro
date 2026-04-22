import type { PlanPageImage, PlanUpload } from "./types"

export type RasterizedPdfPage = Pick<
  PlanPageImage,
  "sourcePageNumber" | "imageDataUrl" | "width" | "height"
>

export async function rasterizePdfToPages(
  upload: PlanUpload
): Promise<RasterizedPdfPage[]> {
  void upload

  // Final-shape boundary for PDF-to-image conversion.
  // A PDF rasterizer can be introduced here later without changing pdfSplit.ts
  // or downstream consumers of PlanPageImage.
  return []
}
