export type ScopeQualityResult = {
  score: number
  warnings: string[]
}

function normalize(s: string) {
  return String(s || "").toLowerCase()
}

export function checkScopeQuality(scope: string): ScopeQualityResult {

  const text = normalize(scope)

  const warnings: string[] = []
  let score = 100

  if (text.length < 20) {
    warnings.push("Scope description is very short")
    score -= 20
  }

  if (!text.includes("room") && !text.includes("sq") && !text.includes("square")) {
    warnings.push("Missing job size (rooms or square footage)")
    score -= 20
  }

  if (!text.includes("wall") && !text.includes("ceiling") && !text.includes("trim")) {
    warnings.push("Missing surfaces being worked on")
    score -= 15
  }

  if (!text.includes("prep") && !text.includes("patch") && !text.includes("repair")) {
    warnings.push("Prep level not mentioned")
    score -= 10
  }

  if (!text.includes("coat") && !text.includes("paint")) {
    warnings.push("Work process not clearly described")
    score -= 10
  }

  if (score < 0) score = 0

  return {
    score,
    warnings
  }
}