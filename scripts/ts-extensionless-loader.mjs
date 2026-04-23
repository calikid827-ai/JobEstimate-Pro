import path from "node:path"

const CANDIDATE_SUFFIXES = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  "/index.ts",
  "/index.tsx",
  "/index.mts",
  "/index.js",
  "/index.mjs",
]

function isRelativeOrAbsolute(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  )
}

function hasExplicitExtension(specifier) {
  return path.extname(specifier) !== ""
}

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (error) {
    if (
      error?.code !== "ERR_MODULE_NOT_FOUND" ||
      !isRelativeOrAbsolute(specifier) ||
      hasExplicitExtension(specifier)
    ) {
      throw error
    }

    for (const suffix of CANDIDATE_SUFFIXES) {
      try {
        return await defaultResolve(
          `${specifier}${suffix}`,
          context,
          defaultResolve
        )
      } catch (candidateError) {
        if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") {
          throw candidateError
        }
      }
    }

    throw error
  }
}
