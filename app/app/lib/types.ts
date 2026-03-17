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
  pricing: {
    labor: number
    materials: number
    subs: number
    markup: number
    total: number
  }
  schedule?: Schedule | null
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