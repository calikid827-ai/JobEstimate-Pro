export type PlanUpload = {
  uploadId: string
  name: string
  note: string
  mimeType: string
  stagedUploadId?: string | null
  originalBytes?: number | null
  transport?: "inline" | "multipart-temp"
  dataUrl?: string | null
  tempFilePath?: string | null
  sourcePageNumberMap?: number[] | null
  bytes: number | null
  selectedSourcePages: number[] | null
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
  selectedForAnalysis: boolean
  renderedFromPdf?: boolean
  renderedImageAvailable?: boolean
  extractedText?: string | null
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
  pageLabel: string
  sheetNumber: string | null
  sheetTitle: string | null
  discipline: PlanSheetDiscipline
  confidence: number
  revision: string | null
  selectedForAnalysis: boolean
  renderedFromPdf?: boolean
  renderedImageAvailable?: boolean
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

export type PlanTradeFindingCategory =
  | "device_count"
  | "switch_count"
  | "receptacle_count"
  | "electrical_fixture_count"
  | "plumbing_fixture_count"
  | "floor_area"
  | "wall_tile_area"
  | "shower_tile_area"
  | "backsplash_area"
  | "base_lf"
  | "demolition_area"
  | "underlayment_prep_area"
  | "wall_area"
  | "ceiling_area"
  | "repair_area"
  | "assembly_area"
  | "finish_texture_area"
  | "partition_lf"
  | "corridor_area"
  | "selected_elevation_area"
  | "door_openings"
  | "trim_lf"

export type PlanTradeFinding = {
  trade:
    | "painting"
    | "drywall"
    | "wallcovering"
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
  category?: PlanTradeFindingCategory
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
  indexedPagesCount?: number
  selectedPagesCount?: number
  skippedPagesCount?: number
  sheetIndex: PlanSheetIndexEntry[]
  analyses: PlanSheetAnalysis[]
  takeoff: PlanTakeoff
  scopeAssist: PlanScopeAssist
  evidence: PlanEvidenceBundle
  detectedTrades: string[]
  detectedRooms: string[]
  sheetRoleSignals?: string[]
  prototypeSignals?: string[]
  repeatScalingSignals?: string[]
  packageGroupingSignals?: string[]
  bidStrategyNotes?: string[]
  highValueSheetSignals?: string[]
  pricingAnchorSignals?: string[]
  bidCoverageGaps?: string[]
  estimatingPrioritySignals?: string[]
  bidExecutionNotes?: string[]
  pricingPackageSignals?: string[]
  prototypePackageSignals?: string[]
  packageScopeCandidates?: string[]
  packageScalingGuidance?: string[]
  packageConfidenceNotes?: string[]
  estimatingFrameworkNotes?: string[]
  estimateStructureSignals?: string[]
  estimatePackageCandidates?: string[]
  packageTradeScopeSignals?: string[]
  packagePricingBasisSignals?: string[]
  packageAllowanceSignals?: string[]
  estimateAssemblyGuidance?: string[]
  estimateScaffoldNotes?: string[]
  crossSheetLinkSignals?: string[]
  scheduleReconciliationSignals?: string[]
  crossSheetConflictSignals?: string[]
  planSetSynthesisNotes?: string[]
  repeatedSpaceSignals?: string[]
  likelyRoomTypes?: string[]
  scalableScopeSignals?: string[]
  tradePackageSignals?: string[]
  bidAssistNotes?: string[]
  detectedSheets?: string[]
  notes?: string[]
  summary: string
  confidenceScore: number
}
