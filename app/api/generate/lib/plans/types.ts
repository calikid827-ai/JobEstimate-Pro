export type PlanUpload = {
  uploadId: string
  name: string
  note: string
  mimeType: string
  dataUrl: string
  bytes: number | null
}

export type PlanPageImage = {
  uploadId: string
  uploadName: string
  uploadNote: string
  sourceMimeType: string
  sourceKind: "image" | "pdf"
  sourcePageNumber: number
  pageNumber: number
  imageDataUrl: string
  width: number | null
  height: number | null
}

export type PlanSheetDiscipline =
  | "architectural"
  | "electrical"
  | "plumbing"
  | "mechanical"
  | "structural"
  | "interior"
  | "finish"
  | "general"
  | "unknown"

export type PlanSheetIndexEntry = {
  uploadId: string
  uploadName: string
  sourcePageNumber: number
  pageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  discipline: PlanSheetDiscipline
  confidence: number
  revision: string | null
}

export type PlanEvidenceRef = {
  uploadId: string
  uploadName: string
  sourcePageNumber: number
  pageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  excerpt: string
  confidence: number
}

export type PlanRoomFinding = {
  roomName: string
  floorLabel?: string | null
  dimensionsText?: string | null
  areaSqft?: number | null
  confidence: number
  evidence: PlanEvidenceRef[]
}

export type PlanScheduleItem = {
  scheduleType:
    | "door"
    | "window"
    | "finish"
    | "fixture"
    | "electrical"
    | "cabinet"
    | "unknown"
  label: string
  quantity: number | null
  notes: string[]
  confidence: number
  evidence: PlanEvidenceRef[]
}

export type PlanTradeFinding = {
  trade:
    | "painting"
    | "drywall"
    | "flooring"
    | "electrical"
    | "plumbing"
    | "carpentry"
    | "tile"
    | "general renovation"
  label: string
  quantity: number | null
  unit:
    | "sqft"
    | "linear_ft"
    | "rooms"
    | "doors"
    | "fixtures"
    | "devices"
    | "each"
    | "unknown"
  notes: string[]
  confidence: number
  evidence: PlanEvidenceRef[]
}

export type PlanSheetAnalysis = {
  uploadId: string
  uploadName: string
  sourcePageNumber: number
  pageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  discipline: PlanSheetDiscipline
  textSnippets: string[]
  notes: string[]
  rooms: PlanRoomFinding[]
  schedules: PlanScheduleItem[]
  tradeFindings: PlanTradeFinding[]
  scaleText: string | null
  revision: string | null
  confidence: number
}

export type PlanTakeoff = {
  floorSqft: number | null
  wallSqft: number | null
  ceilingSqft: number | null
  trimLf: number | null
  doorCount: number | null
  windowCount: number | null
  deviceCount: number | null
  fixtureCount: number | null
  roomCount: number | null
  sourceNotes: string[]
}

export type PlanScopeAssist = {
  missingScopeFlags: string[]
  suggestedAdditions: string[]
  conflicts: string[]
}

export type PlanEvidenceBundle = {
  summaryRefs: PlanEvidenceRef[]
  quantityRefs: PlanEvidenceRef[]
  riskRefs: PlanEvidenceRef[]
}

export type PlanIntelligence = {
  ok: boolean
  uploadsCount: number
  pagesCount: number
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  takeoff: PlanTakeoff
  scopeAssist: PlanScopeAssist
  evidence: PlanEvidenceBundle
  detectedTrades: string[]
  detectedRooms: string[]
  detectedSheets?: string[]
  notes?: string[]
  summary: string
  confidenceScore: number
}
