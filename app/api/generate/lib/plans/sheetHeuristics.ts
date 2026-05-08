import type {
  PlanPageImage,
  PlanSheetClassification,
  PlanSheetDiscipline,
  PlanSheetIndexEntry,
  PlanSheetRole,
} from "./types"

type SheetHeuristicResult = Pick<
  PlanSheetIndexEntry,
  "sheetNumber" | "sheetTitle" | "discipline" | "revision" | "confidence"
> & {
  classification: PlanSheetClassification
}

type SheetRoleCandidate = {
  sheetRole: PlanSheetRole
  discipline: PlanSheetDiscipline
  confidence: number
  signals: string[]
}

function stripExtension(name: string): string {
  return String(name || "").replace(/\.[^.]+$/, "")
}

function collapseText(value: string): string {
  return value
    .replace(/[_]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function summarizePageText(text: string | null | undefined): string {
  if (!text) return ""

  return collapseText(
    text
      .split("\n")
      .slice(0, 8)
      .join(" ")
      .slice(0, 600)
  )
}

function normalizeSheetNumber(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[._\s]+/g, "-")
    .replace(/-+/g, "-")
}

function extractRevision(text: string): string | null {
  const revMatch = text.match(/\bREV(?:ISION)?[\s._-]*([A-Z0-9]{1,4})\b/i)
  if (revMatch?.[1]) return revMatch[1].toUpperCase()

  const shortMatch = text.match(/\bR[\s._-]*([0-9]{1,3})\b/i)
  if (shortMatch?.[1]) return shortMatch[1].toUpperCase()

  return null
}

function extractSheetNumber(text: string): string | null {
  const patterns = [
    /\b([A-Z]{1,4}[._-]?\d{1,4}(?:[._-]\d{1,3})?[A-Z]?)\b/i,
    /\b([A-Z]{1,4}\d{1,4}(?:\.\d{1,3})?[A-Z]?)\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return normalizeSheetNumber(match[1])
  }

  return null
}

function inferDiscipline(args: {
  sheetNumber: string | null
  title: string | null
  uploadName: string
  uploadNote: string
}): PlanSheetDiscipline {
  const prefix = args.sheetNumber?.match(/^[A-Z]+/)?.[0] ?? ""
  const text = `${args.title || ""} ${args.uploadName} ${args.uploadNote}`.toLowerCase()

  if (/\bplumbing fixture schedule\b|\bplumbing fixtures?\b|\btoilet\b|\blav(?:atory)?\b|\bsanitary\b|\bdomestic water\b/.test(text)) {
    return "plumbing"
  }
  if (/\belectrical fixture schedule\b|\bpower plan\b|\blighting plan\b|\bpanel\b|\bcircuit\b/.test(text)) {
    return "electrical"
  }
  if (/\belectrical|power|lighting|panel|circuit\b/.test(text)) return "electrical"
  if (/\bplumbing|sanitary|waste|water\b/.test(text)) return "plumbing"
  if (/\bhvac|mechanical|duct|air handling\b/.test(text)) return "mechanical"
  if (/\binterior elevations?\b|\bwall elevations?\b|\bmillwork\b|\bcasework\b|\bfinish schedule\b|\bfinish plan\b/.test(text)) {
    return /\bfinish schedule\b|\bfinish plan\b|\breflected ceiling\b/.test(text)
      ? "finish"
      : "interior"
  }
  if (/\bstructural|framing|foundation|beam|column\b/.test(text)) return "structural"

  if (prefix.startsWith("A")) return "architectural"
  if (prefix.startsWith("E")) return "electrical"
  if (prefix.startsWith("P")) return "plumbing"
  if (prefix.startsWith("M")) return "mechanical"
  if (prefix.startsWith("S")) return "structural"
  if (prefix.startsWith("I")) return "interior"
  if (prefix.startsWith("F")) return "finish"
  if (prefix.startsWith("G")) return "general"

  if (/\binterior|elevation|millwork|casework|finish plan\b/.test(text)) return "interior"
  if (/\bfinish|paint|floor finish|reflected ceiling\b/.test(text)) return "finish"
  if (/\barchitectural|floor plan|site plan|roof plan|demo plan\b/.test(text)) {
    return "architectural"
  }
  if (/\bgeneral|cover sheet|index\b/.test(text)) return "general"

  return "unknown"
}

function inferSheetTitle(args: {
  baseName: string
  pageText: string
  sheetNumber: string | null
  revision: string | null
}): string | null {
  let working = args.pageText || args.baseName

  if (args.sheetNumber) {
    const compactSheetNumber = args.sheetNumber.replace(/-/g, "")
    working = working.replace(new RegExp(compactSheetNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
    working = working.replace(
      new RegExp(args.sheetNumber.replace(/-/g, "[._\\s-]*"), "i"),
      " "
    )
  }

  if (args.revision) {
    working = working.replace(new RegExp(`\\bREV(?:ISION)?[\\s._-]*${args.revision}\\b`, "i"), " ")
    working = working.replace(new RegExp(`\\bR[\\s._-]*${args.revision}\\b`, "i"), " ")
  }

  const cleaned = collapseText(working)
  if (!cleaned) return null

  return cleaned
    .split(" ")
    .map((word) => {
      if (/^[A-Z0-9]+$/.test(word)) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function addSignal(
  signals: string[],
  text: string,
  pattern: RegExp,
  label: string
): number {
  if (!pattern.test(text)) return 0
  signals.push(label)
  return 1
}

function buildRoleCandidate(args: {
  sheetRole: PlanSheetRole
  discipline: PlanSheetDiscipline
  text: string
  checks: Array<{ pattern: RegExp; label: string; weight: number }>
}): SheetRoleCandidate | null {
  const signals: string[] = []
  let score = 0

  for (const check of args.checks) {
    score += addSignal(signals, args.text, check.pattern, check.label) * check.weight
  }

  if (score <= 0) return null

  return {
    sheetRole: args.sheetRole,
    discipline: args.discipline,
    confidence: Math.max(35, Math.min(95, 30 + score)),
    signals,
  }
}

function classifySheetRole(args: {
  parseText: string
  legacyDiscipline: PlanSheetDiscipline
}): PlanSheetClassification {
  const text = args.parseText.toLowerCase()
  const candidates = [
    buildRoleCandidate({
      sheetRole: "finish_schedule",
      discipline: "finish",
      text,
      checks: [
        { pattern: /\bfinish schedule\b/, label: "finish schedule label", weight: 45 },
        { pattern: /\bfinish matrix\b|\broom finish(?:es)?\b/, label: "finish matrix language", weight: 35 },
        { pattern: /\bpaint\b|\bwallcovering\b|\bfloor(?:ing)? finish\b|\bbase\b/, label: "finish material terms", weight: 12 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "fixture_schedule",
      discipline:
        /\belectrical fixture schedule\b|\blight(?:ing)? fixture\b|\bluminaire\b/.test(text)
          ? "electrical"
          : "plumbing",
      text,
      checks: [
        { pattern: /\bfixture schedule\b/, label: "fixture schedule label", weight: 45 },
        { pattern: /\btoilet\b|\blav(?:atory)?\b|\bsink\b|\bshower valve\b|\burinal\b/, label: "plumbing fixture terms", weight: 20 },
        { pattern: /\blight(?:ing)? fixture\b|\bluminaire\b|\brecessed\b/, label: "lighting fixture terms", weight: 18 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "door_schedule",
      discipline: "architectural",
      text,
      checks: [
        { pattern: /\bdoor schedule\b/, label: "door schedule label", weight: 50 },
        { pattern: /\bdoor type\b|\bhardware set\b|\bframe\b/, label: "door schedule terms", weight: 16 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "window_schedule",
      discipline: "architectural",
      text,
      checks: [
        { pattern: /\bwindow schedule\b/, label: "window schedule label", weight: 50 },
        { pattern: /\bglazing\b|\bwindow type\b|\bframe\b/, label: "window schedule terms", weight: 16 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "reflected_ceiling_plan",
      discipline: "finish",
      text,
      checks: [
        { pattern: /\breflected ceiling plan\b|\brcp\b/, label: "RCP label", weight: 50 },
        { pattern: /\bceiling plan\b|\bceiling grid\b|\bceiling cloud\b/, label: "ceiling plan terms", weight: 25 },
        { pattern: /\blight(?:ing)? fixtures?\b|\bdiffuser\b|\bsprinkler\b/, label: "ceiling coordination terms", weight: 10 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "demo_plan",
      discipline: "architectural",
      text,
      checks: [
        { pattern: /\bdemolition plan\b|\bdemo plan\b/, label: "demolition plan label", weight: 50 },
        { pattern: /\bdemolition\b|\bremove\b|\bexisting to remain\b/, label: "demolition terms", weight: 18 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "elevation",
      discipline: /\bexterior elevation\b/.test(text) ? "architectural" : "interior",
      text,
      checks: [
        { pattern: /\binterior elevations?\b|\bexterior elevations?\b|\bwall elevations?\b/, label: "elevation label", weight: 48 },
        { pattern: /\belevation\b/, label: "elevation term", weight: 24 },
        { pattern: /\bmillwork\b|\bcasework\b|\bvanity\b|\bfeature wall\b/, label: "elevation detail terms", weight: 12 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "legend",
      discipline: "general",
      text,
      checks: [
        { pattern: /\blegend\b|\bsymbol(?:s)? legend\b/, label: "legend label", weight: 50 },
        { pattern: /\babbreviations?\b|\bgeneral notes\b|\bkeynotes?\b|\bsheet index\b/, label: "legend or notes terms", weight: 18 },
      ],
    }),
    buildRoleCandidate({
      sheetRole: "floor_plan",
      discipline: "architectural",
      text,
      checks: [
        { pattern: /\bfloor plan\b|\boverall plan\b|\btypical (?:guest )?room plan\b/, label: "floor plan label", weight: 45 },
        { pattern: /\blife safety plan\b|\bcode plan\b|\bfurniture plan\b/, label: "plan-view label", weight: 24 },
        { pattern: /\broom\b|\bpartition\b|\bwall layout\b|\bdoor swing\b/, label: "plan-view terms", weight: 8 },
      ],
    }),
  ].filter((candidate): candidate is SheetRoleCandidate => candidate !== null)

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0]

  if (!best || best.confidence < 55) {
    return {
      sheetRole: "unknown",
      discipline: args.legacyDiscipline,
      confidence: best?.confidence ?? 15,
      method: "deterministic",
      signals: best?.signals ?? [],
      warnings: ["No strong deterministic sheet role signal was found."],
    }
  }

  const warnings: string[] = []
  if (candidates.length > 1 && candidates[1] && best.confidence - candidates[1].confidence < 10) {
    warnings.push(`Competing sheet role signal also matched ${candidates[1].sheetRole}.`)
  }

  return {
    sheetRole: best.sheetRole,
    discipline: best.discipline,
    confidence: best.confidence,
    method: "deterministic",
    signals: Array.from(new Set(best.signals)),
    warnings,
  }
}

export function buildSheetIndexEntryFromPage(
  page: PlanPageImage
): SheetHeuristicResult {
  const baseName = collapseText(stripExtension(page.uploadName))
  const pageText = summarizePageText(page.extractedText)
  const parseText = collapseText(`${baseName} ${page.uploadNote || ""} ${pageText}`)

  const sheetNumber = extractSheetNumber(parseText)
  const revision = extractRevision(parseText)
  const sheetTitle = inferSheetTitle({
    baseName,
    pageText,
    sheetNumber,
    revision,
  })
  const discipline = inferDiscipline({
    sheetNumber,
    title: sheetTitle,
    uploadName: `${page.uploadName} ${pageText}`,
    uploadNote: page.uploadNote,
  })
  const classification = classifySheetRole({
    parseText,
    legacyDiscipline: discipline,
  })

  let confidence = 20
  if (sheetNumber) confidence += 40
  if (sheetTitle) confidence += 20
  if (discipline !== "unknown") confidence += 20
  if (revision) confidence += 10

  return {
    sheetNumber,
    sheetTitle,
    discipline,
    revision,
    confidence: Math.max(5, Math.min(95, confidence)),
    classification,
  }
}
