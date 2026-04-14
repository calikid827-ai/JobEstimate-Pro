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
  materialsList?: MaterialsList
  areaScopeBreakdown?: AreaScopeBreakdown
  profitProtection?: ProfitProtection
  scopeXRay?: ScopeXRay
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