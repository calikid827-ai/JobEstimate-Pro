import { z } from "zod"
import { GenerateSchema } from "../guards"
import type { PlanIntelligence } from "../plans/types"
import type { MissedScopeDetector } from "./missedScopeDetector"
import type { ProfitLeakDetector } from "./profitLeakDetector"

export type GenerateInput = z.infer<typeof GenerateSchema>

export type MeasurementInput = NonNullable<GenerateInput["measurements"]>
export type MeasurementRow = MeasurementInput["rows"][number]
export type UploadedPhotoInput = NonNullable<NonNullable<GenerateInput["photos"]>[number]>
export type UploadedPlanInput = NonNullable<NonNullable<GenerateInput["plans"]>[number]>

export type PaintScope = "walls" | "walls_ceilings" | "full"
export type EffectivePaintScope = PaintScope | "doors_only"

export type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

export type PricingUnit =
  | "sqft"
  | "linear_ft"
  | "rooms"
  | "doors"
  | "fixtures"
  | "devices"
  | "days"
  | "lump_sum"

export type EstimateBasis = {
  units: PricingUnit[]
  quantities: Partial<Record<PricingUnit, number>>
  laborRate: number
  hoursPerUnit?: number
  crewDays?: number
  mobilization: number
  assumptions: string[]
}

export type ScheduleBlock = {
  startDate: string
  crewDays: number | null
  visits: number | null
  calendarDays: { min: number; max: number } | null
  workDaysPerWeek: 5 | 6 | 7
  rationale: string[]
}

export type SplitScopeItem = {
  trade: string
  scope: string
  signals?: string[]
}

export type QuantitySource =
  | "user"
  | "parsed"
  | "photo"
  | "photo_reference"
  | "estimated"

export type ScopeSignals = {
  needsReturnVisit?: boolean
  reason?: string
} | null

export type MultiTradeDetTradeResult = {
  trade: string
  scope: string
  pricing: Pricing
  laborRate: number
  crewDays: number
  source: string
  notes: string[]
}

export type MultiTradeDeterministicResult = {
  okForDeterministic: boolean
  okForVerified: boolean
  pricing: Pricing | null
  estimateBasis: EstimateBasis | null
  perTrade: MultiTradeDetTradeResult[]
  notes: string[]
}

export type MaterialsList = {
  items: Array<{
    label: string
    quantity: string
    category: "material" | "consumable" | "hardware" | "protection"
    confidence?: "low" | "medium" | "high"
  }>
  confirmItems: string[]
  notes: string[]
} | null

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
}

export type ScopeXRay = {
  detectedScope: {
    primaryTrade: string
    splitScopes: Array<{
      trade: string
      scope: string
    }>
    paintScope: string | null
    state: string
  }
  quantities: Array<{
    label: string
    value: string
    source: QuantitySource
  }>
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
}

export type PriceGuardStatus =
  | "verified"
  | "deterministic"
  | "adjusted"
  | "review"
  | "ai"

export type PriceGuardReport = {
  status: PriceGuardStatus
  confidence: number
  pricingSource: "ai" | "deterministic" | "merged"
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
    priceGuardAnchorStrict?: boolean
  }
}

export type PhotoInput = UploadedPhotoInput

export type PhotoFinding = {
  photoName: string
  roomTag: string
  shotType:
    | "overview"
    | "corner"
    | "wall"
    | "ceiling"
    | "floor"
    | "fixture"
    | "damage"
    | "measurement"
  areaType:
    | "exterior_front"
    | "exterior_rear"
    | "exterior_side"
    | "interior_room"
    | "bathroom"
    | "kitchen"
    | "hallway"
    | "ceiling"
    | "floor"
    | "detail"
    | "unknown"
  detectedRoomType: string | null
  detectedTrade: string | null
  detectedMaterials: string[]
  detectedConditions: string[]
  detectedFixtures: string[]
  detectedAccessIssues: string[]
  detectedDemoNeeds: string[]
  complexityFlags: string[]
  quantitySignals: {
    doors?: number | null
    windows?: number | null
    vanities?: number | null
    toilets?: number | null
    sinks?: number | null
    outlets?: number | null
    switches?: number | null
    recessedLights?: number | null
    cabinets?: number | null
    appliances?: number | null
    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null
    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
    estimatedTrimLfMin?: number | null
    estimatedTrimLfMax?: number | null
    estimateMethod?: "reference_scaled" | "visual_guess" | "count_based" | null
  }
  scaleSignals: {
    referenceProvided: boolean
    referenceVisible: boolean | null
    referenceSamePlane: boolean | null
    referenceUsable: boolean | null
    scaleConfidence: "low" | "medium" | "high" | null
    referenceLabel: string | null
    referenceRealWidthIn: number | null
  }
  exteriorSignals?: {
    isExterior?: boolean | null
    stories?: 1 | 2 | 3 | null
    substrate?: "stucco" | "siding" | "mixed" | "unknown" | null
    access?: "low" | "medium" | "high" | null
    trimComplexity?: "low" | "medium" | "high" | null
    prepLevel?: "light" | "medium" | "heavy" | null
    garageDoors?: number | null
    entryDoors?: number | null
    windows?: number | null
    bodyWallSqftMin?: number | null
    bodyWallSqftMax?: number | null
  }
  scopeCompletenessFlags: string[]
  reasoning: string[]
  confidence: "low" | "medium" | "high"
}

export type PhotoJobSummary = {
  probableArea:
    | "exterior_house"
    | "interior_room"
    | "bathroom"
    | "kitchen"
    | "mixed"
    | "unknown"
  detectedTrades: string[]
  detectedRoomTypes: string[]
  detectedMaterials: string[]
  detectedConditions: string[]
  detectedFixtures: string[]
  detectedAccessIssues: string[]
  detectedDemoNeeds: string[]
  complexityFlags: string[]
  mergedQuantities: {
    doors: number | null
    windows: number | null
    vanities: number | null
    toilets: number | null
    sinks: number | null
    outlets: number | null
    switches: number | null
    recessedLights: number | null
    cabinets: number | null
    appliances: number | null
    wallSqft: number | null
    ceilingSqft: number | null
    floorSqft: number | null
    trimLf: number | null
  }
  quantitySources: {
    wallSqft: "reference_scaled" | "visual_guess" | "count_based" | null
    ceilingSqft: "reference_scaled" | "visual_guess" | "count_based" | null
    floorSqft: "reference_scaled" | "visual_guess" | "count_based" | null
    trimLf: "reference_scaled" | "visual_guess" | "count_based" | null
  }
  exteriorSummary: {
    isExterior: boolean
    stories: 1 | 2 | 3 | null
    substrate: "stucco" | "siding" | "mixed" | "unknown" | null
    access: "low" | "medium" | "high" | null
    trimComplexity: "low" | "medium" | "high" | null
    prepLevel: "light" | "medium" | "heavy" | null
    garageDoors: number | null
    entryDoors: number | null
    windows: number | null
    bodyWallSqft: number | null
  }
  pricingDrivers: string[]
  missingViews: string[]
  confidenceScore: number
}

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
    cabinets?: number | null
    appliances?: number | null
    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null
    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
    estimatedTrimLfMin?: number | null
    estimatedTrimLfMax?: number | null
  }
  exteriorSignals?: {
    isExterior?: boolean | null
    stories?: 1 | 2 | 3 | null
    substrate?: "stucco" | "siding" | "mixed" | "unknown" | null
    access?: "low" | "medium" | "high" | null
    trimComplexity?: "low" | "medium" | "high" | null
    prepLevel?: "light" | "medium" | "heavy" | null
    garageDoors?: number | null
    entryDoors?: number | null
    windows?: number | null
    bodyWallSqftMin?: number | null
    bodyWallSqftMax?: number | null
  }
  tradeSignals?: {
    flooringType?: string[]
    electricalScope?: string[]
    plumbingScope?: string[]
    drywallScope?: string[]
    carpentryScope?: string[]
    remodelScope?: string[]
  }
  scopeCompletenessFlags?: string[]
  confidence?: "low" | "medium" | "high"
  perPhoto?: PhotoFinding[]
  jobSummary?: PhotoJobSummary | null
}

export type PhotoPricingImpact = {
  laborDelta: number
  materialsDelta: number
  subsDelta: number
  extraCrewDays: number
  confidenceBoost: number
  reasons: string[]
}

export type EstimateExplanation = {
  priceReasons: string[]
  scheduleReasons: string[]
  photoReasons: string[]
  protectionReasons: string[]
}

export type PhotoPacketScore = {
  score: number
  strengths: string[]
  missingShots: string[]
}

export type EstimateMode = "photo_only" | "photo_assisted" | "measurement_required"
export type PricingPolicy = "allow" | "allow_with_warning" | "block"

export type MissingInputKey =
  | "measurements"
  | "floor_sqft"
  | "wall_sqft"
  | "paint_sqft"
  | "room_count"
  | "door_count"
  | "fixture_count"
  | "device_count"
  | "linear_ft"
  | "one_wall_length"

export type PhotoEstimateDecision = {
  estimateMode: EstimateMode
  pricingPolicy: PricingPolicy
  pricingAllowed: boolean
  confidence: number
  confidenceBand: "low" | "medium" | "high"
  missingInputs: MissingInputKey[]
  reasons: string[]
  blockers: string[]
}

export type JobComplexityClass = "simple" | "medium" | "complex" | "remodel"

export type ComplexityProfile = {
  class: JobComplexityClass
  requireDaysBasis: boolean
  permitLikely: boolean
  multiPhase: boolean
  multiTrade: boolean
  hasDemo: boolean
  notes: string[]
  minCrewDays: number
  maxCrewDays: number
  minMobilization: number
  minSubs: number
  crewSizeMin: number
  crewSizeMax: number
  hoursPerDayEffective: number
  minPhaseVisits: number
}

export type TradeStack = {
  primaryTrade: string
  trades: string[]
  activities: string[]
  signals: string[]
  isMultiTrade: boolean
}

export type QuantityInputs = {
  userMeasuredSqft: number | null
  parsedSqft: number | null
  photoWallSqft: number | null
  photoCeilingSqft: number | null
  photoFloorSqft: number | null
  photoWallSqftSource?: "reference_scaled" | "visual_guess" | "count_based" | null
  photoCeilingSqftSource?: "reference_scaled" | "visual_guess" | "count_based" | null
  photoFloorSqftSource?: "reference_scaled" | "visual_guess" | "count_based" | null
  photoTrimLfSource?: "reference_scaled" | "visual_guess" | "count_based" | null
  effectiveFloorSqft: number | null
  effectiveWallSqft: number | null
  effectivePaintSqft: number | null
}

export type AIResponse = {
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  trade: string
  description: string
  pricing: Pricing
  estimateBasis?: EstimateBasis | null
}

export type DeterministicPricingCandidate = {
  pricing: Pricing | null
  okForVerified?: boolean
  verifiedSource: string
  source: string
  estimateBasis?: EstimateBasis | null
}

export type AnchorHit = {
  id: string
  pricing: Pricing
} | null

export type PricingOwner =
  | "multi_trade_combiner"
  | "deterministic_anchor"
  | "painting_rooms_plus_doors"
  | "painting_doors_only"
  | "painting_big_job"
  | "painting_engine"
  | "flooring_engine"
  | "electrical_engine"
  | "plumbing_engine"
  | "drywall_engine"
  | "merged"
  | "ai"

export type PricingOwnerDecision = {
  owner: PricingOwner
  detSource: string | null
  anchorId: string | null
  verified: boolean
  baselinePricing: Pricing | null
  estimateBasis: EstimateBasis | null
}

export type PricingOwnerContext = {
  trade: string
  effectivePaintScope: EffectivePaintScope | null
  useBigJobPricing: boolean

  anchorHit: AnchorHit

  multiTradeDet: MultiTradeDeterministicResult | null

  paintingDet: DeterministicPricingCandidate | null
  flooringDet: DeterministicPricingCandidate | null
  electricalDet: DeterministicPricingCandidate | null
  plumbingDet: DeterministicPricingCandidate | null
  drywallDet: DeterministicPricingCandidate | null

  mixedPaintPricing: Pricing | null
  doorPricing: Pricing | null
  bigJobPricing: Pricing | null
  photoPaintPricing: Pricing | null
}

export type EstimatorContext = PricingOwnerContext & {
  input: GenerateInput
  normalizedEmail: string
  requestId: string

  scopeChange: string
  enrichedScopeText: string
  tradeLabel: string

  rawState: string
  stateAbbrev: string
  stateMultiplier: number
  usedNationalBaseline: boolean

  measurements: MeasurementInput | null
  photos: PhotoInput[] | null

  paintScope: PaintScope | null
  workDaysPerWeek: 5 | 6 | 7

  rooms: number | null
  doors: number | null

  splitScopes: SplitScopeItem[]
  tradeStack: TradeStack
  complexityProfile: ComplexityProfile
  scopeSignals: ScopeSignals

  quantityInputs: QuantityInputs

  photoPacketScore: PhotoPacketScore
  photoAnalysis: PhotoAnalysis | null
  photoImpact: PhotoPricingImpact
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  photoEstimateDecision: PhotoEstimateDecision

  planIntelligence: PlanIntelligence | null

  materialsList: MaterialsList
  areaScopeBreakdown: AreaScopeBreakdown
}

export type EstimatorPayload = {
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  trade: string
  text: string
  pricing: Pricing
  schedule: ScheduleBlock
  scopeXRay: ScopeXRay
  explanation: EstimateExplanation
  scopeSignals: ScopeSignals
  photoAnalysis: PhotoAnalysis | null
  photoImpact: PhotoPricingImpact
  photoScopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
  photoPacketScore: PhotoPacketScore
  photoEstimateDecision: PhotoEstimateDecision

  planIntelligence: PlanIntelligence | null
  missedScopeDetector?: MissedScopeDetector | null
  profitLeakDetector?: ProfitLeakDetector | null

  materialsList: MaterialsList
  areaScopeBreakdown: AreaScopeBreakdown
  splitScopes: SplitScopeItem[]
  multiTrade: {
    okForDeterministic: boolean
    okForVerified: boolean
    perTrade: MultiTradeDetTradeResult[]
    notes: string[]
  } | null
  estimateBasis?: EstimateBasis | null
  pricingSource: "ai" | "deterministic" | "merged"
  detSource: string | null
  priceGuardAnchor: string | null
  priceGuardVerified: boolean
  priceGuardProtected: boolean
  priceGuard: PriceGuardReport
  flooring?: Record<string, unknown> | null
  electrical?: Record<string, unknown> | null
  plumbing?: Record<string, unknown> | null
  drywall?: Record<string, unknown> | null
}
