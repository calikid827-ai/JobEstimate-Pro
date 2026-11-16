import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native canvas bindings and PDF.js's relative Node worker in their installed packages.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/projects/*/analysis": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/*",
    ],
    "/api/projects/*/files": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/*",
    ],
    "/api/plan-studies/*/prepare": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/*",
    ],
  },
};

export default nextConfig;
