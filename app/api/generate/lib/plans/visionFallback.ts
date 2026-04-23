import OpenAI from "openai"

import type {
  PlanEvidenceRef,
  PlanPageImage,
  PlanRoomFinding,
  PlanScheduleItem,
  PlanSheetAnalysis,
  PlanSheetDiscipline,
  PlanSheetIndexEntry,
  PlanTradeFindingCategory,
  PlanTradeFinding,
} from "./types"

const PLAN_VISION_MODEL = "gpt-4o" as const
const MIN_CLEAR_SHEET_CONFIDENCE = 75

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

type VisionSeed = {
  page: PlanPageImage
  sheet: PlanSheetIndexEntry | null
  scopeText: string
  trade: string
}

type PlanVisionEnhancement = {
  textSnippets: string[]
  notes: string[]
  rooms: PlanRoomFinding[]
  schedules: PlanScheduleItem[]
  tradeFindings: PlanTradeFinding[]
  confidence: number | null
  sheetTitle: string | null
  discipline: PlanSheetDiscipline | null
}

type VisionTrade = PlanTradeFinding["trade"]
type VisionSchedule = PlanScheduleItem["scheduleType"]
type VisionUnit = PlanTradeFinding["unit"]
type VisionTradeFindingCategory = NonNullable<PlanTradeFinding["category"]>

const BATHROOM_FIXTURE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bvanity\b/i, label: "Vanity" },
  { pattern: /\btub(?:\/shower)?\b|\bshower\b/i, label: "Tub/Shower" },
  { pattern: /\btoilet\b|\bwater closet\b|\bwc\b/i, label: "Toilet" },
  { pattern: /\blav(?:atory)?\b|\bsink\b/i, label: "Lav/Sink" },
]

const DIMENSION_PATTERN = /\b\d{1,3}(?:\s*[xX]\s*\d{1,3}){1,2}\b/

function cleanStrings(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max)
}

function clampConfidence(value: unknown, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(95, Math.round(n)))
}

function safeNumberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isPlanTrade(value: unknown): value is VisionTrade {
  return (
    value === "painting" ||
    value === "drywall" ||
    value === "wallcovering" ||
    value === "flooring" ||
    value === "electrical" ||
    value === "plumbing" ||
    value === "carpentry" ||
    value === "tile" ||
    value === "general renovation"
  )
}

function isScheduleType(value: unknown): value is VisionSchedule {
  return (
    value === "door" ||
    value === "window" ||
    value === "finish" ||
    value === "fixture" ||
    value === "electrical" ||
    value === "cabinet" ||
    value === "unknown"
  )
}

function isUnit(value: unknown): value is VisionUnit {
  return (
    value === "sqft" ||
    value === "linear_ft" ||
    value === "rooms" ||
    value === "doors" ||
    value === "fixtures" ||
    value === "devices" ||
    value === "each" ||
    value === "unknown"
  )
}

function isDiscipline(value: unknown): value is PlanSheetDiscipline {
  return (
    value === "architectural" ||
    value === "electrical" ||
    value === "plumbing" ||
    value === "mechanical" ||
    value === "structural" ||
    value === "interior" ||
    value === "finish" ||
    value === "general" ||
    value === "unknown"
  )
}

function isTradeFindingCategory(value: unknown): value is VisionTradeFindingCategory {
  return (
    value === "wall_area" ||
    value === "ceiling_area" ||
    value === "repair_area" ||
    value === "assembly_area" ||
    value === "finish_texture_area" ||
    value === "partition_lf" ||
    value === "corridor_area" ||
    value === "selected_elevation_area" ||
    value === "door_openings" ||
    value === "trim_lf"
  )
}

function inferTradeFindingCategory(args: {
  trade: VisionTrade
  label: string
  unit: VisionUnit
  notes: string[]
}): PlanTradeFindingCategory | undefined {
  const blob = [args.label, ...(args.notes || [])].join(" ").toLowerCase()

  if (args.unit === "linear_ft" && /\bpartition|gyp|gypsum|wall type\b/.test(blob)) {
    return "partition_lf"
  }
  if (args.unit === "linear_ft" && /\btrim|base|baseboard|casing|frame\b/.test(blob)) {
    return "trim_lf"
  }
  if ((args.unit === "doors" || args.unit === "each") && /\bdoor|frame|casing\b/.test(blob)) {
    return "door_openings"
  }
  if (args.unit === "sqft" && /\bfeature wall|accent wall|selected elevation|elevation\b/.test(blob)) {
    return "selected_elevation_area"
  }
  if (args.unit === "sqft" && /\bcorridor|hallway|lobby|common area\b/.test(blob)) {
    return "corridor_area"
  }
  if (args.unit === "sqft" && /\bpatch|repair|hole|crack\b/.test(blob)) {
    return "repair_area"
  }
  if (args.unit === "sqft" && /\bfinish|texture|level\s*[45]|skim\b/.test(blob)) {
    return "finish_texture_area"
  }
  if (args.unit === "sqft" && /\bceiling|rcp|soffit\b/.test(blob)) {
    return "ceiling_area"
  }
  if (
    args.trade === "drywall" &&
    args.unit === "sqft" &&
    /\bdrywall|sheetrock|partition|wallboard|board area\b/.test(blob)
  ) {
    return "assembly_area"
  }
  if (args.unit === "sqft" && /\bwall|paint|wallcover(?:ing)?|wallpaper\b/.test(blob)) {
    return "wall_area"
  }

  return undefined
}

function buildEvidence(args: VisionSeed, excerpt: string, confidence: number): PlanEvidenceRef {
  return {
    uploadId: args.page.uploadId,
    uploadName: args.page.uploadName,
    sourcePageNumber: args.page.sourcePageNumber,
    pageNumber: args.page.pageNumber,
    sheetNumber: args.sheet?.sheetNumber ?? null,
    sheetTitle: args.sheet?.sheetTitle ?? null,
    excerpt,
    confidence,
  }
}

function sanitizeSheetTitle(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/[ \t]+/g, " ")
  if (!trimmed) return null
  return trimmed.slice(0, 160)
}

function sanitizeRooms(args: VisionSeed, value: unknown): PlanRoomFinding[] {
  if (!Array.isArray(value)) return []

  const out: PlanRoomFinding[] = []

  for (const item of value) {
    const record = item && typeof item === "object" ? item : null
    const roomName =
      typeof record?.roomName === "string" ? record.roomName.trim().slice(0, 80) : ""
    if (!roomName) continue

    const confidence = clampConfidence(record?.confidence, 55)
    const excerpt =
      typeof record?.excerpt === "string" && record.excerpt.trim()
        ? record.excerpt.trim().slice(0, 180)
        : roomName

    out.push({
      roomName,
      floorLabel:
        typeof record?.floorLabel === "string" && record.floorLabel.trim()
          ? record.floorLabel.trim().slice(0, 80)
          : null,
      dimensionsText: null,
      areaSqft: null,
      confidence,
      evidence: [buildEvidence(args, excerpt, confidence)],
    })
  }

  return out
}

function sanitizeSchedules(args: VisionSeed, value: unknown): PlanScheduleItem[] {
  if (!Array.isArray(value)) return []

  const out: PlanScheduleItem[] = []

  for (const item of value) {
    const record = item && typeof item === "object" ? item : null
    if (!isScheduleType(record?.scheduleType)) continue

    const label =
      typeof record?.label === "string" ? record.label.trim().slice(0, 120) : ""
    if (!label) continue

    const quantity =
      typeof record?.quantity === "number" && Number.isFinite(record.quantity)
        ? Math.round(record.quantity)
        : null

    const confidence = clampConfidence(record?.confidence, 55)
    const excerpt =
      typeof record?.excerpt === "string" && record.excerpt.trim()
        ? record.excerpt.trim().slice(0, 180)
        : label

    out.push({
      scheduleType: record.scheduleType,
      label,
      quantity: quantity && quantity > 0 ? quantity : null,
      notes: cleanStrings(record?.notes, 4),
      confidence,
      evidence: [buildEvidence(args, excerpt, confidence)],
    })
  }

  return out
}

function sanitizeTrades(args: VisionSeed, value: unknown): PlanTradeFinding[] {
  if (!Array.isArray(value)) return []

  const out: PlanTradeFinding[] = []

  for (const item of value) {
    const record = item && typeof item === "object" ? item : null
    if (!isPlanTrade(record?.trade)) continue
    if (!isUnit(record?.unit)) continue

    const label =
      typeof record?.label === "string" ? record.label.trim().slice(0, 120) : ""
    if (!label) continue

    const quantity =
      typeof record?.quantity === "number" && Number.isFinite(record.quantity)
        ? Math.round(record.quantity)
        : null

    const confidence = clampConfidence(record?.confidence, 55)
    const excerpt =
      typeof record?.excerpt === "string" && record.excerpt.trim()
        ? record.excerpt.trim().slice(0, 180)
        : label
    const notes = cleanStrings(record?.notes, 4)

    out.push({
      trade: record.trade,
      label,
      quantity: quantity && quantity > 0 ? quantity : null,
      unit: record.unit,
      category: isTradeFindingCategory(record?.category)
        ? record.category
        : inferTradeFindingCategory({
            trade: record.trade,
            label,
            unit: record.unit,
            notes,
          }),
      notes,
      confidence,
      evidence: [buildEvidence(args, excerpt, confidence)],
    })
  }

  return out
}

function normalizeBathroomDetail(detail: string): string {
  return detail
    .replace(/[ \t]+/g, " ")
    .replace(/\bwater closet\b/gi, "WC")
    .replace(/\blavatory\b/gi, "lav")
    .replace(/\bsink\b/gi, "lav/sink")
    .replace(/\btoilet\b/gi, "toilet")
    .replace(/\bvanity\b/gi, "vanity")
    .replace(/\btub\s*\/\s*shower\b/gi, "tub/shower")
    .replace(/\bshower\b/gi, "shower")
    .replace(/\btub\b/gi, "tub")
    .trim()
}

function extractBathroomFixtureDetail(text: string, label: string): string | null {
  const normalized = text.replace(/[ \t]+/g, " ").trim()
  if (!normalized) return null

  const dimension = normalized.match(DIMENSION_PATTERN)?.[0]?.replace(/\s+/g, "")

  if (/vanity/i.test(label) && /\bvanity\b/i.test(normalized)) {
    return normalizeBathroomDetail(dimension ? `${dimension} vanity` : "vanity")
  }
  if (/Tub\/Shower/i.test(label) && /\btub\b|\bshower\b/i.test(normalized)) {
    if (/\btub\b/i.test(normalized) && /\bshower\b/i.test(normalized)) {
      return normalizeBathroomDetail("tub/shower")
    }
    if (/\bshower\b/i.test(normalized)) return normalizeBathroomDetail("shower")
    if (/\btub\b/i.test(normalized)) return normalizeBathroomDetail("tub")
  }
  if (/Toilet/i.test(label) && (/\btoilet\b/i.test(normalized) || /\bwater closet\b/i.test(normalized) || /\bwc\b/i.test(normalized))) {
    if (/\bwater closet\b/i.test(normalized) || /\bwc\b/i.test(normalized)) {
      return normalizeBathroomDetail("WC")
    }
    return normalizeBathroomDetail("toilet")
  }
  if (/Lav\/Sink/i.test(label) && (/\blav(?:atory)?\b/i.test(normalized) || /\bsink\b/i.test(normalized))) {
    if (/\blav(?:atory)?\b/i.test(normalized) && /\bsink\b/i.test(normalized)) {
      return normalizeBathroomDetail("lav/sink")
    }
    if (/\blav(?:atory)?\b/i.test(normalized)) return normalizeBathroomDetail("lav")
    return normalizeBathroomDetail("lav/sink")
  }

  return null
}

function collectBathroomFixtureDetails(texts: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const text of texts) {
    for (const candidate of BATHROOM_FIXTURE_PATTERNS) {
      if (!candidate.pattern.test(text)) continue
      const detail = extractBathroomFixtureDetail(text, candidate.label)
      if (!detail) continue
      const key = detail.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(detail)
    }
  }

  return out.slice(0, 6)
}

function buildBathroomSignalSnippet(snippets: string[]): string | null {
  for (const snippet of snippets) {
    for (const candidate of BATHROOM_FIXTURE_PATTERNS) {
      if (candidate.pattern.test(snippet)) return snippet
    }
  }

  return null
}

function buildBathroomSignalAugmentations(args: {
  seed: VisionSeed
  textSnippets: string[]
  notes: string[]
  schedules: PlanScheduleItem[]
  tradeFindings: PlanTradeFinding[]
}) {
  const candidateTexts = [
    ...args.textSnippets,
    ...args.notes,
    ...args.schedules.map((item) => item.label),
    ...args.schedules.flatMap((item) => item.notes || []),
    ...args.schedules.flatMap((item) => item.evidence.map((ref) => ref.excerpt)),
    ...args.tradeFindings.map((item) => item.label),
    ...args.tradeFindings.flatMap((item) => item.notes || []),
    ...args.tradeFindings.flatMap((item) => item.evidence.map((ref) => ref.excerpt)),
  ]

  const signalDetails = collectBathroomFixtureDetails(candidateTexts)
  const signals = Array.from(
    new Set(
      signalDetails.flatMap((detail) =>
        BATHROOM_FIXTURE_PATTERNS
          .filter((candidate) => candidate.pattern.test(detail))
          .map((candidate) => candidate.label)
      )
    )
  )

  if (signals.length === 0) {
    return {
      textSnippets: args.textSnippets,
      notes: args.notes,
      schedules: args.schedules,
      tradeFindings: args.tradeFindings,
    }
  }

  const signalSnippet =
    buildBathroomSignalSnippet(signalDetails) ??
    buildBathroomSignalSnippet(args.textSnippets) ??
    `Bathroom fixture/layout visible: ${signalDetails.join(", ")}`

  const textSnippets = Array.from(
    new Set([...signalDetails, ...args.textSnippets].map((item) => item.trim()).filter(Boolean))
  ).slice(0, 8)

  const notes = [...args.notes]
  if (
    !notes.some(
      (note) =>
        /\bbathroom fixture\b|\bfixture layout\b|\bvanity\b|\btub\b|\bshower\b|\btoilet\b|\blav\b|\bsink\b/i.test(
          note
        )
    )
  ) {
    notes.push(`Visible bathroom fixture/layout labels: ${signalDetails.join(", ")}.`)
  }

  const schedules = [...args.schedules]
  if (!schedules.some((item) => item.scheduleType === "fixture")) {
    schedules.push({
      scheduleType: "fixture",
      label: `Bathroom fixture layout: ${signalDetails.join(", ")}`,
      quantity: null,
      notes: ["Visible bathroom fixture/layout references detected on screenshot."],
      confidence: 60,
      evidence: [buildEvidence(args.seed, signalSnippet, 60)],
    })
  }

  const tradeFindings = [...args.tradeFindings]
  const hasSpecificPlumbing = tradeFindings.some(
    (item) =>
      item.trade === "plumbing" &&
      /\bvanity\b|\btoilet\b|\bwc\b|\bshower\b|\btub\b|\blav\b|\bsink\b/i.test(item.label)
  )
  if (!hasSpecificPlumbing) {
    tradeFindings.push({
      trade: "plumbing",
      label: `Bathroom fixture layout referenced: ${signalDetails.join(", ")}`,
      quantity: null,
      unit: "fixtures",
      notes: [`Visible bathroom fixture/layout labels: ${signalDetails.join(", ")}.`],
      confidence: 60,
      evidence: [buildEvidence(args.seed, signalSnippet, 60)],
    })
  }

  return {
    textSnippets,
    notes,
    schedules,
    tradeFindings,
  }
}

function buildPrompt(args: VisionSeed): string {
  return `
You are reviewing ONE screenshot-based construction plan page for estimator support.

Return ONLY valid JSON with this exact shape:
{
  "sheetTitle": null,
  "sheetTitleConfidence": null,
  "discipline": null,
  "disciplineConfidence": null,
  "textSnippets": ["..."],
  "notes": ["..."],
  "rooms": [
    {
      "roomName": "Bathroom",
      "floorLabel": null,
      "confidence": 0,
      "excerpt": "BATH"
    }
  ],
  "schedules": [
    {
      "scheduleType": "door | window | finish | fixture | electrical | cabinet | unknown",
      "label": "Door schedule",
      "quantity": null,
      "confidence": 0,
      "excerpt": "DOOR SCHEDULE",
      "notes": ["..."]
    }
  ],
  "tradeFindings": [
    {
      "trade": "painting | drywall | wallcovering | flooring | electrical | plumbing | carpentry | tile | general renovation",
      "label": "Tile finish plan referenced",
      "quantity": null,
      "unit": "sqft | linear_ft | rooms | doors | fixtures | devices | each | unknown",
      "category": "wall_area | ceiling_area | repair_area | assembly_area | finish_texture_area | partition_lf | corridor_area | selected_elevation_area | door_openings | trim_lf | null",
      "confidence": 0,
      "excerpt": "FINISH PLAN",
      "notes": ["..."]
    }
  ],
  "confidence": 0
}

Rules:
- Analyze only what is visibly present on this one screenshot page.
- Be conservative. Prefer empty arrays and null over guessing.
- Do not invent quantities. Use null unless a count is explicit and legible on the page itself.
- Focus on visible room tags, schedule headings, finish notes, trade signals, and sheet metadata.
- For bathroom screenshots, prioritize visible fixture/layout signals such as vanity, tub, shower, toilet, water closet, lavatory, sink, or bathroom fixture layout callouts.
- If bathroom fixture/layout scope is visible, include the actual visible labels or dimensions in text snippets when legible, such as "60x22 vanity", "toilet", "WC", "shower", "tub", or "lav".
- Prefer specific fixture/layout labels over generic summaries like "bathroom fixtures".
- If bathroom fixture/layout scope is visible, prefer adding a conservative fixture schedule entry and a plumbing trade finding rather than a generic-only trade summary.
- When possible, write plumbing trade findings using the visible fixture/layout labels, for example "Bathroom fixture layout referenced: 60x22 vanity, WC, shower".
- Use tile trade findings only when shower tile, tub surround tile, finish tile, or tile notes are visibly present.
- Keep text snippets short and high-signal.
- Notes should mention uncertainty or limitations when relevant.
- Only set sheetTitle if it is clearly visible on the screenshot.
- Only set discipline if it is clearly implied by visible sheet labels or content.
- Confidence is 0-95.
- No markdown.
- No extra text.

Global scope:
${args.scopeText}

Primary trade:
${args.trade}

Upload metadata:
- file name: ${args.page.uploadName || "plan"}
- upload note: ${args.page.uploadNote || "not provided"}
- source page: ${args.page.sourcePageNumber}
  `.trim()
}

export function shouldRunPlanVisionFallback(analysis: PlanSheetAnalysis): boolean {
  const noSignals =
    analysis.rooms.length === 0 &&
    analysis.schedules.length === 0 &&
    analysis.tradeFindings.length === 0

  return noSignals || analysis.confidence < 45
}

export async function analyzePlanSheetVision(
  args: VisionSeed
): Promise<PlanVisionEnhancement | null> {
  if (!openai) return null

  try {
    const resp = await openai.chat.completions.create({
      model: PLAN_VISION_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt(args),
            },
            {
              type: "image_url",
              image_url: {
                url: args.page.imageDataUrl,
              },
            },
          ],
        },
      ],
    })

    const raw = resp.choices[0]?.message?.content?.trim()
    const parsed = raw ? JSON.parse(raw) : {}

    const sheetTitleConfidence = clampConfidence(parsed?.sheetTitleConfidence, 0)
    const disciplineConfidence = clampConfidence(parsed?.disciplineConfidence, 0)
    const textSnippets = cleanStrings(parsed?.textSnippets, 8)
    const notes = cleanStrings(parsed?.notes, 8)
    const schedules = sanitizeSchedules(args, parsed?.schedules)
    const tradeFindings = sanitizeTrades(args, parsed?.tradeFindings)
    const bathroomSignalAugmentations = buildBathroomSignalAugmentations({
      seed: args,
      textSnippets,
      notes,
      schedules,
      tradeFindings,
    })

    return {
      textSnippets: bathroomSignalAugmentations.textSnippets,
      notes: bathroomSignalAugmentations.notes,
      rooms: sanitizeRooms(args, parsed?.rooms),
      schedules: bathroomSignalAugmentations.schedules,
      tradeFindings: bathroomSignalAugmentations.tradeFindings,
      confidence: safeNumberOrNull(parsed?.confidence),
      sheetTitle:
        sheetTitleConfidence >= MIN_CLEAR_SHEET_CONFIDENCE
          ? sanitizeSheetTitle(parsed?.sheetTitle)
          : null,
      discipline:
        disciplineConfidence >= MIN_CLEAR_SHEET_CONFIDENCE && isDiscipline(parsed?.discipline)
          ? parsed.discipline
          : null,
    }
  } catch {
    return null
  }
}

function uniqBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []

  for (const item of items) {
    const k = key(item)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }

  return out
}

export function mergePlanVisionEnhancement(args: {
  base: PlanSheetAnalysis
  enhancement: PlanVisionEnhancement
}): PlanSheetAnalysis {
  const nextTextSnippets = uniqBy(
    [...args.base.textSnippets, ...args.enhancement.textSnippets].slice(0, 8),
    (item) => item.trim().toLowerCase()
  )

  const visionNotes = args.enhancement.notes.length
    ? ["Vision fallback reviewed screenshot content.", ...args.enhancement.notes]
    : ["Vision fallback reviewed screenshot content."]

  const nextNotes = uniqBy(
    [...args.base.notes, ...visionNotes].slice(0, 12),
    (item) => item.trim().toLowerCase()
  )

  const nextRooms = uniqBy(
    [...args.base.rooms, ...args.enhancement.rooms],
    (item) => item.roomName.trim().toLowerCase()
  )

  const nextSchedules = uniqBy(
    [...args.base.schedules, ...args.enhancement.schedules],
    (item) => `${item.scheduleType}:${item.label.trim().toLowerCase()}`
  )

  const nextTradeFindings = uniqBy(
    [...args.base.tradeFindings, ...args.enhancement.tradeFindings],
    (item) =>
      `${item.trade}:${item.category || "uncategorized"}:${item.label.trim().toLowerCase()}`
  )

  const enhancementConfidence = clampConfidence(args.enhancement.confidence, args.base.confidence)
  const shouldRaiseConfidence =
    args.enhancement.rooms.length > 0 ||
    args.enhancement.schedules.length > 0 ||
    args.enhancement.tradeFindings.length > 0

  return {
    ...args.base,
    sheetTitle: args.base.sheetTitle ?? args.enhancement.sheetTitle ?? null,
    discipline:
      args.base.discipline !== "unknown"
        ? args.base.discipline
        : args.enhancement.discipline ?? "unknown",
    textSnippets: nextTextSnippets,
    notes: nextNotes,
    rooms: nextRooms,
    schedules: nextSchedules,
    tradeFindings: nextTradeFindings,
    confidence: shouldRaiseConfidence
      ? Math.max(args.base.confidence, enhancementConfidence)
      : args.base.confidence,
  }
}
