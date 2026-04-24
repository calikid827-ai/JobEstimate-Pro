import type { PlanPageImage, PlanSheetDiscipline, PlanSheetIndexEntry } from "./types"

type SheetHeuristicResult = Pick<
  PlanSheetIndexEntry,
  "sheetNumber" | "sheetTitle" | "discipline" | "revision" | "confidence"
>

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
  }
}
