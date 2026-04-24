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

function sumMatches(text: string, re: RegExp): number {
  let total = 0
  for (const match of text.matchAll(re)) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n > 0) total += n
  }
  return total
}

function parseElectricalBreakdown(text: string) {
  const lower = text.toLowerCase()
  const outlets = sumMatches(lower, /(\d{1,4})\s+(?:new\s+)?(?:outlet|receptacle|plug)s?\b/g)
  const switches = sumMatches(lower, /(\d{1,4})\s+(?:new\s+)?switch(?:es)?\b/g)
  const fixtures = sumMatches(
    lower,
    /(\d{1,4})\s+(?:new\s+)?(?:light\s*fixture|fixture|sconce|ceiling\s*fan|fan)s?\b/g
  )
  const total = outlets + switches + fixtures
  return total > 0 ? { outlets, switches, fixtures, total } : null
}

function parsePlumbingFixtureBreakdown(text: string) {
  const lower = text.toLowerCase()
  const toilets = sumMatches(lower, /(\d{1,4})\s+(?:new\s+)?(?:toilet|commode)s?\b/g)
  const faucets = sumMatches(lower, /(\d{1,4})\s+(?:new\s+)?faucets?\b/g)
  const sinks = sumMatches(lower, /(\d{1,4})\s+(?:new\s+)?sinks?\b/g)
  const vanities = sumMatches(lower, /(\d{1,4})\s+(?:new\s+)?(?:vanity|vanities)\b/g)
  const showerValves = sumMatches(
    lower,
    /(\d{1,4})\s+(?:new\s+)?(?:shower\s*valve|mixing\s*valve|diverter|trim\s*kit|cartridge)s?\b/g
  )
  const total = toilets + faucets + sinks + vanities + showerValves
  return total > 0 ? { toilets, faucets, sinks, vanities, showerValves, total } : null
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
        category: qty ? "door_openings" : undefined,
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

    if (/\b(tile|flooring|lvp|vinyl plank|laminate|hardwood|carpet|backsplash|shower wall|wall tile|tub surround)\b/.test(lower)) {
      tradeFindings.push({
        trade: /\b(tile|backsplash|shower wall|wall tile|tub surround)\b/.test(lower)
          ? "tile"
          : "flooring",
        label: /\bbacksplash\b/.test(lower)
          ? "Backsplash tile referenced"
          : /\bshower wall|tub surround\b/.test(lower)
            ? "Shower / wet-area tile referenced"
            : /\bwall tile\b/.test(lower)
              ? "Wall tile referenced"
              : "Flooring / tile referenced",
        quantity: null,
        unit: "unknown",
        category:
          /\bbacksplash\b/.test(lower)
            ? "backsplash_area"
            : /\bshower wall|tub surround|wet area\b/.test(lower)
              ? "shower_tile_area"
              : /\bwall tile\b/.test(lower)
                ? "wall_tile_area"
                : /\bfloor|flooring|lvp|vinyl plank|laminate|hardwood|carpet|tile floor\b/.test(lower)
                  ? "floor_area"
                  : undefined,
        notes: [
          /\bremove|removal|demo|tear out|pull up\b/.test(lower)
            ? "Removal/demo wording is present but quantity is not yet extracted."
            : "Flooring/tile sheet content detected.",
        ],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
    }

    if (/\bfixture schedule\b|\bfixture plan\b/.test(lower)) {
      const qty = parseCount(signal.text, "fixtures?")
      const plumbingBreakdown = parsePlumbingFixtureBreakdown(signal.text)
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
        label: discipline === "plumbing" ? "Plumbing fixture schedule count" : "Electrical fixture schedule count",
        quantity: qty ?? plumbingBreakdown?.total ?? null,
        unit: qty || plumbingBreakdown?.total ? "fixtures" : "unknown",
        category: discipline === "plumbing" ? "plumbing_fixture_count" : "electrical_fixture_count",
        notes: ["Fixture-related sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      if (discipline === "plumbing" && plumbingBreakdown) {
        const fixtureBreakdown = [
          { label: "Toilet fixture count", quantity: plumbingBreakdown.toilets },
          { label: "Faucet fixture count", quantity: plumbingBreakdown.faucets },
          { label: "Sink fixture count", quantity: plumbingBreakdown.sinks },
          { label: "Vanity fixture count", quantity: plumbingBreakdown.vanities },
          { label: "Shower valve fixture count", quantity: plumbingBreakdown.showerValves },
        ].filter((item) => item.quantity > 0)
        for (const item of fixtureBreakdown) {
          tradeFindings.push({
            trade: "plumbing",
            label: item.label,
            quantity: item.quantity,
            unit: "fixtures",
            category: "plumbing_fixture_count",
            notes: ["Fixture schedule breakdown detected from plan text."],
            confidence,
            evidence: [buildEvidence(args, signal.text, confidence)],
          })
        }
      }
    }

    if (/\belectrical schedule\b|\bpower plan\b|\blighting plan\b/.test(lower)) {
      const devices = parseCount(signal.text, "devices?")
      const electricalBreakdown = parseElectricalBreakdown(signal.text)
      scheduleItems.push({
        scheduleType: "electrical",
        label: "Electrical schedule",
        quantity: devices ?? electricalBreakdown?.total ?? null,
        notes:
          devices || electricalBreakdown?.total
            ? []
            : ["Electrical references detected; device quantities not yet extracted."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      tradeFindings.push({
        trade: "electrical",
        label: "Electrical schedule device count",
        quantity: devices ?? electricalBreakdown?.total ?? null,
        unit: devices || electricalBreakdown?.total ? "devices" : "unknown",
        category: "device_count",
        notes: ["Electrical sheet content detected."],
        confidence,
        evidence: [buildEvidence(args, signal.text, confidence)],
      })
      if (electricalBreakdown?.outlets) {
        tradeFindings.push({
          trade: "electrical",
          label: "Receptacle device count",
          quantity: electricalBreakdown.outlets,
          unit: "devices",
          category: "receptacle_count",
          notes: ["Electrical schedule/device count detected from plan text."],
          confidence,
          evidence: [buildEvidence(args, signal.text, confidence)],
        })
      }
      if (electricalBreakdown?.switches) {
        tradeFindings.push({
          trade: "electrical",
          label: "Switch device count",
          quantity: electricalBreakdown.switches,
          unit: "devices",
          category: "switch_count",
          notes: ["Electrical schedule/device count detected from plan text."],
          confidence,
          evidence: [buildEvidence(args, signal.text, confidence)],
        })
      }
      if (electricalBreakdown?.fixtures) {
        tradeFindings.push({
          trade: "electrical",
          label: "Electrical fixture count",
          quantity: electricalBreakdown.fixtures,
          unit: "fixtures",
          category: "electrical_fixture_count",
          notes: ["Lighting/fixture count detected from plan text."],
          confidence,
          evidence: [buildEvidence(args, signal.text, confidence)],
        })
      }
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
    (item) => `${item.trade}:${item.category || "uncategorized"}:${item.label.toLowerCase()}`
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
