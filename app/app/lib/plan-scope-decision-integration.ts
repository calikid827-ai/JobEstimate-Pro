export type PlanCeilingScopeBoundaryStatus =
  | "included"
  | "excluded"
  | "by_others"
  | "unclear"
  | "conflicted"

function normalizeScopeText(
  scopeText: string | null | undefined
): string {
  if (typeof scopeText !== "string") return ""

  return scopeText
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    // Protect a complete responsibility clause before erasing weak punctuation.
    .replace(
      /(^|[-|.;!?–—,:()]|\bbut\s+)\s*(ceilings?\s+by\s+others)\b(?=\s*(?:$|[-|.;!?–—,:()]|\bbut\b))/g,
      "$1 | $2 | "
    )
    .replace(/&/g, " and ")
    .replace(/[.;!?]+/g, " | ")
    .replace(/[-–—,:()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function classifyPlanCeilingScopeBoundary(
  scopeText: string | null | undefined
): PlanCeilingScopeBoundaryStatus {
  const normalizedText = normalizeScopeText(scopeText)
  if (!normalizedText) return "unclear"

  const exclusionPatterns = [
    /\bceiling\s+work\s+will\s+be\s+completed\s+by\s+others\s+and\s+is\s+excluded\s+from\s+this\s+proposal\b/,
    /\bdoes\s+not\s+include\s+(?:the\s+)?ceilings?\s+(?:preparation\s+and\s+)?painting\b/,
    /\bexclude(?:s|d)?\s+(?:the\s+)?ceilings?\s+(?:preparation\s+and\s+)?painting\b/,
    /\bceilings?\s+(?:preparation\s+and\s+)?painting\s+(?:is\s+)?excluded\b/,
    /\bceilings?\s+(?:preparation\s+and\s+)?painting\s+(?:is\s+)?not\s+included\b/,
    /\bdo\s+not\s+paint\s+(?:the\s+)?(?:walls\s+and\s+(?:the\s+)?)?ceilings\b/,
    /\bno\s+ceiling\s+painting\b/,
    /\bno\s+paint\s+on\s+(?:the\s+)?ceilings\b/,
    /\bceilings\s+(?:are\s+)?not\s+to\s+be\s+painted\b/,
    /\bexclude(?:s|d)?\s+(?:the\s+)?ceilings\b/,
    /\bceilings?\s+(?:is\s+|are\s+)?excluded\b/,
    /\bpaint(?:ing)?\s+(?:the\s+)?walls\s+only\b/,
    /(?:^|\|)\s*(?:the\s+)?walls\s+only\s*(?=\||$)/,
  ] as const

  const byOthersPatterns = [
    /\bceiling\s+work\s+will\s+be\s+completed\s+by\s+others\b/,
    /\bceilings?\s+excluded\s+and\s+(?:will\s+be\s+completed\s+)?by\s+others\b/,
    /\bceilings?\s+(?:preparation\s+and\s+)?paint(?:ing)?\s+(?:is\s+)?by\s+(?:others|(?:the\s+)?owner)\b/,
    /\bpaint(?:ing)?\s+(?:the\s+)?(?:walls\s+and\s+(?:the\s+)?)?ceilings\s+by\s+(?:others|(?:the\s+)?owner|customer|another\s+trade)\b/,
    /\b(?:owner|customer|gc|general\s+contractor)\s+(?:(?:will|to)\s+paint|painting)\s+(?:the\s+)?(?:walls\s+and\s+(?:the\s+)?)?ceilings\b/,
    /\bceilings?\s+(?:(?:(?:will|are\s+to)\s+be|to\s+be)\s+)?painted\s+by\s+(?:others|(?:the\s+)?owner|customer|another\s+trade)\b/,
    /(?:^|\||\bbut\s+)\s*ceilings?\s+by\s+others\b(?=\s*(?:\||$|\bbut\b))/,
  ] as const

  const inclusionPatterns = [
    /\bincludes?\s+(?:the\s+)?ceilings?\s+(?:preparation\s+and\s+)?painting\b/,
    /\bceilings?\s+(?:preparation\s+and\s+)?painting\s+(?:is\s+)?included\b/,
    /\bpaint(?:ing)?\s+(?:the\s+)?walls\s+and\s+(?:the\s+)?ceilings\b/,
    /\bpaint(?:ing)?\s+(?:the\s+)?ceilings\b/,
    /\bceilings\s+(?:are\s+)?to\s+be\s+painted\b/,
  ] as const

  const hasExclusion = exclusionPatterns.some((pattern) =>
    pattern.test(normalizedText)
  )
  const hasByOthers = byOthersPatterns.some((pattern) =>
    pattern.test(normalizedText)
  )
  const positiveText = [...exclusionPatterns, ...byOthersPatterns].reduce(
    (remainingText, pattern) =>
      // A removed responsibility span must not join the surrounding phrases.
      remainingText.replace(new RegExp(pattern.source, "g"), " | "),
    normalizedText
  )
  const hasInclusion = inclusionPatterns.some((pattern) =>
    pattern.test(positiveText)
  )

  if (hasInclusion && (hasExclusion || hasByOthers)) return "conflicted"
  if (hasByOthers) return "by_others"
  if (hasExclusion) return "excluded"
  if (hasInclusion) return "included"
  return "unclear"
}
