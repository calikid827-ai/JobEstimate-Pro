export type PaintScope = "walls" | "walls_ceilings" | "full"

export type EffectivePaintScope = PaintScope | "doors_only"

export type DocumentType =
  | "Change Order"
  | "Estimate"
  | "Change Order / Estimate"

export type MeasureRow = {
  label: string
  lengthFt: number
  heightFt: number
  qty: number
}

export type SavedDoc = {
  id: string
  createdAt: number
  result: string
  pricing: {
    labor: number
    materials: number
    subs: number
    markup: number
    total: number
  }
  trade?: string
  state?: string
  jobDetails?: {
    clientName: string
    jobName: string
    changeOrderNo: string
    jobAddress: string
    date: string
  }
  companyProfile?: {
    name: string
    address: string
    phone: string
    email: string
  }
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue"

export type EstimateStructuredSection = {
  trade: string
  section: string
  label: string
  pricingBasis: "direct" | "burden"
  estimatorTreatment: "section_row" | "embedded_burden"
  amount: number
  labor: number
  materials: number
  subs: number
  unit?: "sqft" | "linear_ft" | "rooms" | "doors" | "fixtures" | "devices" | "days" | "lump_sum"
  quantity?: number
  notes: string[]
  provenance?: EstimateSectionProvenance
}

export type EstimateSectionProvenance = {
  quantitySupport: "measured" | "scaled_prototype" | "support_only"
  sourceBasis: Array<"trade_finding" | "takeoff" | "schedule" | "repeated_space_rollup">
  summary?: string
  supportCategory?: string
  roomGroupBasis?: string
  coverageKind?: "full_area" | "corridor_area" | "selected_elevation"
  quantityDetail?: string
  blockedReason?: string
  diagnosticDetails?: string[]
}

export type EstimateRow = {
  trade: string
  section: string
  label: string
  amount: number
  labor: number
  materials: number
  subs: number
  unit?: "sqft" | "linear_ft" | "rooms" | "doors" | "fixtures" | "devices" | "days" | "lump_sum"
  quantity?: number
  notes: string[]
  provenance?: EstimateSectionProvenance
  pricingBasis: "direct"
  estimatorTreatment: "section_row"
  rowSource: "estimate_sections"
}

export type EstimateEmbeddedBurden = {
  trade: string
  section: string
  label: string
  amount: number
  labor: number
  materials: number
  subs: number
  unit?: "sqft" | "linear_ft" | "rooms" | "doors" | "fixtures" | "devices" | "days" | "lump_sum"
  quantity?: number
  notes: string[]
  provenance?: EstimateSectionProvenance
  pricingBasis: "burden"
  estimatorTreatment: "embedded_burden"
  rowSource: "estimate_sections"
}

export type Invoice = {
  id: string
  createdAt: number
  jobId?: string
  fromEstimateId: string
  invoiceNo: string
  issueDate: string
  dueDate: string
  billToName: string
  jobName: string
  jobAddress: string
  lineItems: { label: string; amount: number }[]
  subtotal: number
  total: number
  notes: string
  status: InvoiceStatus
  paidAt?: number
  estimateRows?: EstimateRow[] | null
  estimateEmbeddedBurdens?: EstimateEmbeddedBurden[] | null
  estimateSections?: EstimateStructuredSection[] | null
  deposit?: {
    enabled: boolean
    type: "percent" | "fixed"
    value: number
    depositDue: number
    remainingBalance: number
    estimateTotal: number
  }
}

export type JobBudget = {
  jobId: string
  updatedAt: number
  lastEstimateId: string
  estimateTotal: number
  labor: number
  materials: number
  subs: number
  markupPct: number
  taxEnabled: boolean
  taxRate: number
  taxAmount: number
  deposit?: {
    enabled: boolean
    type: "percent" | "fixed"
    value: number
    depositDue: number
    remainingBalance: number
  }
}

export type JobActuals = {
  jobId: string
  updatedAt: number
  labor: number
  materials: number
  subs: number
  notes?: string
}

export type Job = {
  id: string
  createdAt: number
  clientName: string
  jobName: string
  jobAddress: string
  changeOrderNo?: string
  originalEstimateId?: string
}

export type PricingSource = "ai" | "deterministic" | "merged"

export type PriceGuardStatus =
  | "verified"
  | "deterministic"
  | "adjusted"
  | "review"
  | "ai"

export type PriceGuardReport = {
  status: PriceGuardStatus
  confidence: number
  pricingSource: PricingSource
  appliedRules: string[]
  assumptions: string[]
  warnings: string[]
  details: {
    stateAdjusted: boolean
    stateAbbrev?: string
    rooms?: number | null
    doors?: number | null
    paintScope?: string | null
    anchorId?: string | null
    detSource?: string | null
  }
}

export type Schedule = {
  crewDays: number | null
  visits: number | null
  calendarDays: { min: number; max: number } | null
  workDaysPerWeek: number | null
  rationale: string[]
  startDate?: string | null
}

export type UiTrade =
  | ""
  | "painting"
  | "drywall"
  | "flooring"
  | "electrical"
  | "plumbing"
  | "bathroom_tile"
  | "carpentry"
  | "general_renovation"

  export type ScopeSignals = {
  needsReturnVisit?: boolean
  reason?: string
} | null

export type PhotoAnalysis = {
  summary?: string
  observations?: string[]
  suggestedScopeNotes?: string[]
  detectedRoomTypes?: string[]
  detectedTrades?: string[]
  detectedMaterials?: string[]
  detectedConditions?: string[]
  detectedFixtures?: string[]
  detectedAccessIssues?: string[]
  detectedDemoNeeds?: string[]
  quantitySignals?: {
    doors?: number | null
    windows?: number | null
    vanities?: number | null
    toilets?: number | null
    sinks?: number | null
    outlets?: number | null
    switches?: number | null
    recessedLights?: number | null
    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null
    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
  }
  scopeCompletenessFlags?: string[]
  confidence?: "low" | "medium" | "high"
} | null

export type PhotoScopeAssist = {
  missingScopeFlags: string[]
  suggestedAdditions: string[]
} | null

export type PlanIntelligenceSummary = {
  summary?: string | null
  estimatorPackages?: Array<{
    key: string
    title: string
    primaryTrade: string
    roomGroup: string | null
    supportType:
      | "quantity_backed"
      | "schedule_backed"
      | "elevation_only"
      | "demo_only"
      | "scaled_prototype"
      | "support_only"
    scopeBreadth: "broad" | "narrow"
    confidenceLabel: "strong" | "moderate" | "limited"
    quantitySummary: string | null
    scheduleSummary: string | null
    executionNotes: string[]
    cautionNotes: string[]
    evidence: Array<{
      uploadId: string
      uploadName: string
      sourcePageNumber: number
      pageNumber: number
      sheetNumber: string | null
      sheetTitle: string | null
      excerpt: string
      confidence: number
    }>
  }>
  detectedRooms: string[]
  detectedTrades: string[]
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
  repeatedSpaceSignals?: string[]
  likelyRoomTypes?: string[]
  scalableScopeSignals?: string[]
  tradePackageSignals?: string[]
  bidAssistNotes?: string[]
  scopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
} | null

export type EstimateSkeletonHandoff = {
  estimatorBucketGuidance: string[]
  estimatorBucketDrafts: {
    bucketName: string
    bucketRole:
      | "primary package"
      | "secondary package"
      | "support package"
      | "allowance/review package"
    likelyTradeCoverage: string[]
    likelyScopeBasis: string[]
    allowanceReviewStatus:
      | "structure_ready"
      | "support_only"
      | "allowance_review"
  }[]
  estimatorSectionSkeletons: {
    packageKey: string
    bucketName: string
    sectionTitle: string
    trade:
      | "painting"
      | "drywall"
      | "wallcovering"
      | "flooring"
      | "electrical"
      | "plumbing"
      | "tile"
      | "general renovation"
    supportType:
      | "quantity_backed"
      | "schedule_backed"
      | "elevation_only"
      | "demo_only"
      | "scaled_prototype"
      | "support_only"
    scopeBreadth: "broad" | "narrow"
    sectionReadiness: "section_anchor" | "scalable_hint" | "support_only" | "review_only"
    quantityAnchor: string | null
    scopeBullets: string[]
    cautionNotes: string[]
    evidence: Array<{
      uploadId: string
      uploadName: string
      sourcePageNumber: number
      pageNumber: number
      sheetNumber: string | null
      sheetTitle: string | null
      excerpt: string
      confidence: number
    }>
  }[]
  bucketScopeDrafts: string[]
  bucketAllowanceFlags: string[]
  bucketHandoffNotes: string[]
  estimateStructureHandoffSummary: string
} | null

export type EstimateStructureConsumption = {
  structuredEstimateBuckets: {
    bucketName: string
    bucketRole:
      | "primary package"
      | "secondary package"
      | "support package"
      | "allowance/review package"
    likelyTradeCoverage: string[]
    likelyScopeBasis: string[]
    allowanceReviewStatus:
      | "structure_ready"
      | "support_only"
      | "allowance_review"
    safeForPrimaryStructure: boolean
  }[]
  structuredEstimateSections: {
    sectionTitle: string
    trade:
      | "painting"
      | "drywall"
      | "wallcovering"
      | "flooring"
      | "electrical"
      | "plumbing"
      | "tile"
      | "general renovation"
    bucketName: string
    supportType:
      | "quantity_backed"
      | "schedule_backed"
      | "elevation_only"
      | "demo_only"
      | "scaled_prototype"
      | "support_only"
    scopeBreadth: "broad" | "narrow"
    sectionReadiness: "section_anchor" | "scalable_hint" | "support_only" | "review_only"
    quantityAnchor: string | null
    quantityNormalization: "measured" | "scaled_prototype" | "review_only" | "support_only"
    scopeBullets: string[]
    cautionNotes: string[]
    tradeMeasurementDrafts: string[]
    normalizedEstimatorInputCandidates: string[]
    estimatorInputGuardrails: string[]
    safeForSectionBuild: boolean
    evidence: Array<{
      uploadId: string
      uploadName: string
      sourcePageNumber: number
      pageNumber: number
      sheetNumber: string | null
      sheetTitle: string | null
      excerpt: string
      confidence: number
    }>
  }[]
  structuredTradeInputAssemblies: {
    trade:
      | "painting"
      | "drywall"
      | "wallcovering"
      | "flooring"
      | "electrical"
      | "plumbing"
      | "tile"
      | "general renovation"
    primaryCandidate: {
      sectionTitle: string
      trade:
        | "painting"
        | "drywall"
        | "wallcovering"
        | "flooring"
        | "electrical"
        | "plumbing"
        | "tile"
        | "general renovation"
      candidateRole: "primary" | "secondary" | "review_only"
      quantityNormalization: "measured" | "scaled_prototype" | "review_only" | "support_only"
      supportType:
        | "quantity_backed"
        | "schedule_backed"
        | "elevation_only"
        | "demo_only"
        | "scaled_prototype"
        | "support_only"
      scopeBreadth: "broad" | "narrow"
      quantityAnchor: string | null
      candidateSummary: string
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    } | null
    secondaryCandidates: Array<{
      sectionTitle: string
      trade:
        | "painting"
        | "drywall"
        | "wallcovering"
        | "flooring"
        | "electrical"
        | "plumbing"
        | "tile"
        | "general renovation"
      candidateRole: "primary" | "secondary" | "review_only"
      quantityNormalization: "measured" | "scaled_prototype" | "review_only" | "support_only"
      supportType:
        | "quantity_backed"
        | "schedule_backed"
        | "elevation_only"
        | "demo_only"
        | "scaled_prototype"
        | "support_only"
      scopeBreadth: "broad" | "narrow"
      quantityAnchor: string | null
      candidateSummary: string
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    reviewCandidates: Array<{
      sectionTitle: string
      trade:
        | "painting"
        | "drywall"
        | "wallcovering"
        | "flooring"
        | "electrical"
        | "plumbing"
        | "tile"
        | "general renovation"
      candidateRole: "primary" | "secondary" | "review_only"
      quantityNormalization: "measured" | "scaled_prototype" | "review_only" | "support_only"
      supportType:
        | "quantity_backed"
        | "schedule_backed"
        | "elevation_only"
        | "demo_only"
        | "scaled_prototype"
        | "support_only"
      scopeBreadth: "broad" | "narrow"
      quantityAnchor: string | null
      candidateSummary: string
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    assemblyNotes: string[]
  }[]
  estimateGroupingSignals: string[]
  estimateReviewBuckets: string[]
  estimateStructureNotes: string[]
} | null

export type MaterialsListCategory =
  | "material"
  | "consumable"
  | "hardware"
  | "protection"

export type MaterialsListItem = {
  label: string
  quantity: string
  category: MaterialsListCategory
  confidence?: "low" | "medium" | "high"
}

export type MaterialsList = {
  items: MaterialsListItem[]
  confirmItems: string[]
  notes: string[]
} | null

export type ScopeXRay = {
  detectedScope: {
    primaryTrade: string
    splitScopes: {
      trade: string
      scope: string
    }[]
    paintScope: string | null
    state: string
  }
  quantities: {
    label: string
    value: string
    source: "user" | "parsed" | "photo" | "estimated"
  }[]
  pricingMethod: {
    pricingSource: "ai" | "deterministic" | "merged"
    detSource: string | null
    anchorId: string | null
    verified: boolean
    stateAdjusted: boolean
  }
  scheduleLogic: {
    crewDays: number | null
    visits: number | null
    reasons: string[]
  }
  riskFlags: string[]
  needsConfirmation: string[]
} | null

export type TierAInsightItem = {
  label: string
  reason: string
  evidence: string[]
  confidence: number
  severity?: "high" | "medium"
}

export type MissedScopeDetector = {
  likelyMissingScope: TierAInsightItem[]
  recommendedConfirmations: TierAInsightItem[]
} | null

export type ProfitLeakDetector = {
  likelyProfitLeaks: TierAInsightItem[]
  pricingReviewPrompts: TierAInsightItem[]
} | null

export type EstimateDefenseMode = {
  whyThisPriceHolds: string[]
  includedScopeHighlights: string[]
  exclusionNotes: string[]
  allowanceNotes: string[]
  homeownerFriendlyJustification: string[]
  estimatorDefenseNotes: string[]
  optionalValueEngineeringIdeas: string[]
} | null

export type TradePricingPrepAnalysis = {
  trade: "painting" | "drywall" | "wallcovering"
  supportLevel: "strong" | "moderate" | "weak"
  tradeEstimateGroupingNotes: string[]
  tradePricingPrepSummary: string[]
  tradeReviewActions: string[]
  tradeAnalysisSignals: string[]
} | null

export type EstimateHistoryItem = {
  id: string
  createdAt: number
  jobId?: string
  documentType: DocumentType
  jobDetails: {
    clientName: string
    jobName: string
    changeOrderNo: string
    jobAddress: string
    date: string
  }
  trade: UiTrade
  state: string
  scopeChange: string
  result: string
  explanation?: {
    priceReasons?: string[]
    scheduleReasons?: string[]
    photoReasons?: string[]
    protectionReasons?: string[]
  } | null
  pricing: {
    labor: number
    materials: number
    subs: number
    markup: number
    total: number
  }
  schedule?: Schedule | null
  scopeSignals?: ScopeSignals
  photoAnalysis?: PhotoAnalysis
  photoScopeAssist?: PhotoScopeAssist
  planIntelligence?: PlanIntelligenceSummary
  estimateSkeletonHandoff?: EstimateSkeletonHandoff
  estimateStructureConsumption?: EstimateStructureConsumption
  materialsList?: MaterialsList
  areaScopeBreakdown?: AreaScopeBreakdown
  profitProtection?: ProfitProtection
  scopeXRay?: ScopeXRay
  missedScopeDetector?: MissedScopeDetector
  profitLeakDetector?: ProfitLeakDetector
  estimateDefenseMode?: EstimateDefenseMode
  tradePricingPrepAnalysis?: TradePricingPrepAnalysis
  estimateRows?: EstimateRow[] | null
  estimateEmbeddedBurdens?: EstimateEmbeddedBurden[] | null
  estimateSections?: EstimateStructuredSection[] | null
  changeOrderDetection?: ChangeOrderDetection | null
  pricingSource?: PricingSource
  priceGuardVerified?: boolean
  tax?: {
    enabled: boolean
    rate: number
  }
  deposit?: {
    enabled: boolean
    type: "percent" | "fixed"
    value: number
  }
  approval?: {
    status: "pending" | "approved"
    approvedBy?: string
    approvedAt?: number
    signatureDataUrl?: string
  }
}

export type WeekLoad = {
  weekStartISO: string
  demandCrewDays: number
  jobs: {
    jobId: string
    jobName: string
    crewDays: number
  }[]
}

export type ExplainChangesReport = {
  summary: string[]
  scopeChanges: string[]
  pricingChanges: string[]
  scheduleChanges: string[]
  adminChanges: string[]
}

export type AreaScopeBreakdown = {
  detectedArea: {
    floorSqft: number | null
    wallSqft: number | null
    paintSqft: number | null
    trimLf: number | null
  }
  allowances: {
    prepDemo: string[]
    protectionSetup: string[]
    materialsDrivers: string[]
    scheduleDrivers: string[]
  }
  missingConfirmations: string[]
} | null

export type ProfitProtection = {
  estimatedCost: number
  contractValue: number
  grossProfit: number
  grossMarginPct: number
  minimumSafePrice: number | null
  targetPrice25: number | null
  targetPrice30: number | null
  status: "danger" | "warning" | "healthy"
  warnings: string[]
  reasons: string[]
} | null

export type ChangeOrderDetection = {
  isChangeOrder: boolean
  mode: "add" | "deduct" | "mixed" | "unknown"
  confidence: "low" | "medium" | "high"
  reasons: string[]
  scheduleImpact: {
    likelyChanged: boolean
    addedDays: number | null
    notes: string[]
  }
}
