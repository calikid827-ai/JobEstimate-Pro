import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native canvas bindings and PDF.js's relative Node worker in their installed packages.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/plan-studies/*/prepare": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
