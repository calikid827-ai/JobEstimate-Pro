import type {
  PlanEvidenceRef,
  PlanPageImage,
  PlanRoomFinding,
  PlanScheduleItem,
  PlanSheetAnalysis,
  PlanSheetIndexEntry,
  PlanTradeFinding,
} from "./types"

type AnalysisSeed = {
  page: PlanPageImage
  sheet: PlanSheetIndexEntry | null
  scopeText: string
  trade: string
}

type SignalText = {
  text: string
  source: "title" | "note" | "name" | "scope"
}

const ROOM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bprimary bathroom\b/i, label: "Primary Bathroom" },
  { pattern: /\bprimary bedroom\b/i, label: "Primary Bedroom" },
  { pattern: /\bliving room\b/i, label: "Living Room" },
  { pattern: /\bfamily room\b/i, label: "Family Room" },
  { pattern: /\bdining room\b/i, label: "Dining Room" },
  { pattern: /\blaundry\b/i, label: "Laundry" },
  { pattern: /\bhallway\b/i, label: "Hallway" },
  { pattern: /\bkitchen\b/i, label: "Kitchen" },
  { pattern: /\bbath(room)?\b/i, label: "Bathroom" },
  { pattern: /\bbed(room)?\b/i, label: "Bedroom" },
  { pattern: /\boffice\b/i, label: "Office" },
  { pattern: /\bcloset\b/i, label: "Closet" },
  { pattern: /\bentry\b/i, label: "Entry" },
  { pattern: /\blobby\b/i, label: "Lobby" },
  { pattern: /\bgarage\b/i, label: "Garage" },
]

const FLOOR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfirst floor\b|\blevel 1\b/i, label: "First Floor" },
  { pattern: /\bsecond floor\b|\blevel 2\b/i, label: "Second Floor" },
  { pattern: /\bthird floor\b|\blevel 3\b/i, label: "Third Floor" },
  { pattern: /\blower level\b|\bbasement\b/i, label: "Lower Level" },
]

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

function collapseText(value: string): string {
  return value.replace(/[ \t]+/g, " ").trim()
}

function buildSignalTexts(args: AnalysisSeed): SignalText[] {
  const signals: SignalText[] = []
  const title = collapseText(args.sheet?.sheetTitle ?? "")
  const note = collapseText(args.page.uploadNote ?? "")
  const name = collapseText(args.page.uploadName.replace(/\.[^.]+$/, ""))
  const scope = collapseText(args.scopeText)

  if (title) signals.push({ text: title, source: "title" })
  if (note) signals.push({ text: note, source: "note" })
  if (name) signals.push({ text: name, source: "name" })
  if (scope) signals.push({ text: scope, source: "scope" })

  return signals
}

function buildEvidence(
  args: AnalysisSeed,
  excerpt: string,
  confidence: number
): PlanEvidenceRef {
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

function confidenceFromSource(source: SignalText["source"], base = 40): number {
  if (source === "title") return Math.min(95, base + 30)
  if (source === "note") return Math.min(95, base + 20)
  if (source === "name") return Math.min(95, base + 15)
  return Math.min(95, base)
}

function parseCount(text: string, label: string): number | null {
  const patterns = [
    new RegExp(`\\b(\\d{1,4})\\s+${label}\\b`, "i"),
    new RegExp(`\\b${label}\\s*[:=-]?\\s*(\\d{1,4})\\b`, "i"),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  return null
}

function inferFloorLabel(texts: SignalText[]): string | null {
  for (const signal of texts) {
    for (const floor of FLOOR_PATTERNS) {
      if (floor.pattern.test(signal.text)) return floor.label
    }
  }

  return null
}

export function buildPlanSheetAnalysis(args: AnalysisSeed): Omit<
  PlanSheetAnalysis,
  "uploadId" | "uploadName" | "sourcePageNumber" | "pageNumber" | "sheetNumber" | "sheetTitle" | "discipline" | "revision"
> {
  const signals = buildSignalTexts(args)
  const title = args.sheet?.sheetTitle ?? ""
  const discipline = args.sheet?.discipline ?? "unknown"
  const floorLabel = inferFloorLabel(signals)

  const textSnippets = uniqBy(
    signals
      .map((signal) => `${signal.source.toUpperCase()}: ${signal.text}`)
      .filter((text) => text.length > 0)
      .slice(0, 6),
    (text) => text
  )

  const notes: string[] = []
  if (args.sheet?.sheetNumber) {
    notes.push(`Indexed as ${args.sheet.sheetNumber}${title ? ` - ${title}` : ""}.`)
  }
  if (discipline !== "unknown") {
    notes.push(`Discipline inferred as ${discipline}.`)
  }
  if (args.page.sourceKind === "pdf") {
    notes.push("Page was normalized from a PDF upload.")
  }

  const roomFindings: PlanRoomFinding[] = []
  if (["architectural", "interior", "finish", "general"].includes(discipline)) {
    for (const signal of signals) {
      for (const room of ROOM_PATTERNS) {
        if (!room.pattern.test(signal.text)) continue

        const confidence = confidenceFromSource(signal.source, 35)
        roomFindings.push({
          roomName: room.label,
          floorLabel,
          dimensionsText: null,
          areaSqft: null,
          confidence,
          evidence: [buildEvidence(args, signal.text, confidence)],
        })
      }
    }
  }

  const scheduleItems: PlanScheduleItem[] = []
  const tradeFindings: PlanTradeFinding[] = []

  for (const signal of signals) {
    const lower = signal.text.toLowerCase()
    const confidence = confidenceFromSource(signal.source, 40)

    if (/\bdoor schedule\b|\bdoor plan\b/.test(lower)) {
      const qty = parseCount(signal.text, "doors?")
      scheduleItems.push({
        scheduleType: "door",
        label: "Door schedule",
        quantity: qty,
        notes: qty ? [] : ["Door references detected; quantity not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: "carpentry",
        label: "Doors referenced",
        quantity: qty,
        unit: qty ? "doors" : "unknown",
        notes: ["Door-related sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }

    if (/\bwindow schedule\b|\bwindow plan\b/.test(lower)) {
      const qty = parseCount(signal.text, "windows?")
      scheduleItems.push({
        scheduleType: "window",
        label: "Window schedule",
        quantity: qty,
        notes: qty ? [] : ["Window references detected; quantity not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: "carpentry",
        label: "Windows referenced",
        quantity: qty,
        unit: qty ? "each" : "unknown",
        notes: ["Window-related sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }

    if (/\bfinish schedule\b|\bfinish plan\b/.test(lower)) {
      scheduleItems.push({
        scheduleType: "finish",
        label: "Finish schedule",
        quantity: null,
        notes: ["Finish schedule detected; itemized quantities not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: "painting",
        label: "Finish-related work referenced",
        quantity: null,
        unit: "unknown",
        notes: ["Finish sheet content may inform paint and finish scope."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }

    if (/\bfixture schedule\b|\bfixture plan\b/.test(lower)) {
      const qty = parseCount(signal.text, "fixtures?")
      scheduleItems.push({
        scheduleType: "fixture",
        label: "Fixture schedule",
        quantity: qty,
        notes: qty ? [] : ["Fixture references detected; quantity not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: discipline === "plumbing" ? "plumbing" : "electrical",
        label: "Fixtures referenced",
        quantity: qty,
        unit: qty ? "fixtures" : "unknown",
        notes: ["Fixture-related sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }

    if (/\belectrical schedule\b|\bpower plan\b|\blighting plan\b/.test(lower)) {
      const devices = parseCount(signal.text, "devices?")
      scheduleItems.push({
        scheduleType: "electrical",
        label: "Electrical schedule",
        quantity: devices,
        notes: devices ? [] : ["Electrical references detected; device quantities not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: "electrical",
        label: "Electrical scope referenced",
        quantity: devices,
        unit: devices ? "devices" : "unknown",
        notes: ["Electrical sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }

    if (/\bcabinet schedule\b|\bcasework\b/.test(lower)) {
      scheduleItems.push({
        scheduleType: "cabinet",
        label: "Cabinet schedule",
        quantity: null,
        notes: ["Cabinet/casework references detected; quantities not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: "carpentry",
        label: "Cabinet or casework referenced",
        quantity: null,
        unit: "unknown",
        notes: ["Millwork/casework sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }
  }

  if (discipline === "electrical" && !tradeFindings.some((x) => x.trade === "electrical")) {
    const evidenceText = args.sheet?.sheetTitle || args.page.uploadName
    tradeFindings.push({
      trade: "electrical",
      label: "Electrical sheet",
      quantity: null,
      unit: "unknown",
      notes: ["Sheet discipline suggests electrical scope."],
      confidence: 55,
      evidence: [buildEvidence(args, evidenceText, 55)],
    })
  }

  if (discipline === "plumbing" && !tradeFindings.some((x) => x.trade === "plumbing")) {
    const evidenceText = args.sheet?.sheetTitle || args.page.uploadName
    tradeFindings.push({
      trade: "plumbing",
      label: "Plumbing sheet",
      quantity: null,
      unit: "unknown",
      notes: ["Sheet discipline suggests plumbing scope."],
      confidence: 55,
      evidence: [buildEvidence(args, evidenceText, 55)],
    })
  }

  if (discipline === "finish" && !tradeFindings.some((x) => x.trade === "painting")) {
    const evidenceText = args.sheet?.sheetTitle || args.page.uploadName
    tradeFindings.push({
      trade: "painting",
      label: "Finish sheet",
      quantity: null,
      unit: "unknown",
      notes: ["Finish-related sheet may inform painting and finish scope."],
      confidence: 50,
      evidence: [buildEvidence(args, evidenceText, 50)],
    })
  }

  const uniqueRooms = uniqBy(roomFindings, (room) => room.roomName.toLowerCase())
  const uniqueSchedules = uniqBy(
    scheduleItems,
    (item) => `${item.scheduleType}:${item.label.toLowerCase()}`
  )
  const uniqueTrades = uniqBy(
    tradeFindings,
    (item) => `${item.trade}:${item.label.toLowerCase()}`
  )

  const scaleTextSignal =
    signals.find((signal) => /\bscale\b/i.test(signal.text))?.text ?? null

  const confidenceParts = [
    args.sheet?.confidence ?? 0,
    uniqueRooms.length > 0 ? 60 : 0,
    uniqueSchedules.length > 0 ? 65 : 0,
    uniqueTrades.length > 0 ? 55 : 0,
    textSnippets.length > 0 ? 45 : 0,
  ].filter((value) => value > 0)

  const confidence = confidenceParts.length
    ? Math.max(10, Math.min(95, Math.round(confidenceParts.reduce((sum, n) => sum + n, 0) / confidenceParts.length)))
    : 10

  return {
    textSnippets,
    notes,
    rooms: uniqueRooms,
    schedules: uniqueSchedules,
    tradeFindings: uniqueTrades,
    scaleText: scaleTextSignal,
    confidence,
  }
}
