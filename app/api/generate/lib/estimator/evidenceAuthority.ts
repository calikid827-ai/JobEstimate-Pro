import type { EstimatorScopeFacts } from "../../../../app/lib/estimator-scope-facts"
import type {
  EstimateBasis,
  PhotoAnalysis,
  PricingUnit,
  QuantitySource,
} from "./types"
import type {
  PlanEvidenceRef,
  PlanIntelligence,
  PlanTradeQuantityCandidate,
  PlanTradeQuantityCandidateGate,
} from "../plans/types"

export type EvidenceAuthorityLabel =
  | "pricing_authoritative"
  | "deterministic_pricing_basis"
  | "user_confirmed_quantity"
  | "parsed_typed_quantity"
  | "diagnostic_only"
  | "review_only"
  | "prompt_context_only"
  | "future_measured_takeoff_candidate"
  | "excluded_or_boundary_context"

export type EvidenceSourceKind =
  | "typed_included_scope"
  | "typed_boundary_scope"
  | "user_quantity"
  | "parsed_typed_quantity"
  | "deterministic_estimate_basis"
  | "photo_observation"
  | "photo_quantity_signal"
  | "photo_reference_scaled_quantity"
  | "plan_sheet_evidence"
  | "plan_table_or_finish_schedule"
  | "plan_repeated_room_package"
  | "plan_quantity_candidate"
  | "future_measured_plan_quantity"

export type EvidenceAuthorityQuantity = {
  key: string
  label: string
  value: number
  unit: PricingUnit | "unknown"
  source: QuantitySource | "plan_measured"
  pricingAuthoritative?: boolean
  confidence?: number | null
  notes?: string[]
}

export type EvidenceAuthorityItem = {
  id: string
  label: string
  source: EvidenceSourceKind
  authority: EvidenceAuthorityLabel
  pricingAuthoritative: boolean
  pricingEligibleNow: boolean
  summary: string
  quantity?: number
  unit?: PricingUnit | "unknown"
  confidence?: number | null
  evidenceRefs?: PlanEvidenceRef[]
  warnings?: string[]
  notes?: string[]
}

export type EvidenceAuthorityReadback = {
  items: EvidenceAuthorityItem[]
  summary: {
    pricingAuthoritativeCount: number
    reviewOnlyCount: number
    diagnosticOnlyCount: number
    boundaryContextCount: number
    futureMeasuredTakeoffCandidateCount: number
  }
}

export type BuildEvidenceAuthorityReadbackArgs = {
  scopeFacts?: EstimatorScopeFacts | null
  userQuantities?: EvidenceAuthorityQuantity[]
  parsedQuantities?: EvidenceAuthorityQuantity[]
  estimateBasis?: EstimateBasis | null
  photoAnalysis?: PhotoAnalysis | null
  planIntelligence?: PlanIntelligence | null
  futureMeasuredPlanQuantities?: EvidenceAuthorityQuantity[]
  pricingAuthoritativePhotoQuantityKeys?: string[]
}

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function isKnownNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function summarizeText(value: string, maxLength = 220): string {
  const clean = cleanText(value)
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).trim()}...`
}

function addItem(items: EvidenceAuthorityItem[], item: EvidenceAuthorityItem): void {
  items.push(item)
}

function authorityForQuantity(
  quantity: EvidenceAuthorityQuantity,
  fallbackAuthority: EvidenceAuthorityLabel
): EvidenceAuthorityLabel {
  if (quantity.pricingAuthoritative) return "pricing_authoritative"
  if (quantity.source === "user") return "user_confirmed_quantity"
  if (quantity.source === "parsed") return "parsed_typed_quantity"
  return fallbackAuthority
}

function isPricingAuthority(authority: EvidenceAuthorityLabel): boolean {
  return (
    authority === "pricing_authoritative" ||
    authority === "deterministic_pricing_basis" ||
    authority === "user_confirmed_quantity" ||
    authority === "parsed_typed_quantity"
  )
}

function addQuantityItems(args: {
  items: EvidenceAuthorityItem[]
  quantities: EvidenceAuthorityQuantity[] | undefined
  source: EvidenceSourceKind
  fallbackAuthority: EvidenceAuthorityLabel
  idPrefix: string
}): void {
  for (const quantity of args.quantities || []) {
    if (!isKnownNumber(quantity.value)) continue
    const authority = authorityForQuantity(quantity, args.fallbackAuthority)
    const pricingAuthoritative = isPricingAuthority(authority)
    addItem(args.items, {
      id: `${args.idPrefix}:${quantity.key}`,
      label: quantity.label,
      source: args.source,
      authority,
      pricingAuthoritative,
      pricingEligibleNow: pricingAuthoritative,
      summary: `${quantity.label}: ${quantity.value} ${quantity.unit}`,
      quantity: quantity.value,
      unit: quantity.unit,
      confidence: quantity.confidence ?? null,
      notes: quantity.notes,
    })
  }
}

function addEstimateBasisItems(items: EvidenceAuthorityItem[], estimateBasis: EstimateBasis | null | undefined): void {
  if (!estimateBasis) return

  const quantityEntries = Object.entries(estimateBasis.quantities || {})
    .filter(([, value]) => isKnownNumber(value))

  if (quantityEntries.length === 0 && !isKnownNumber(estimateBasis.crewDays)) {
    addItem(items, {
      id: "deterministic-estimate-basis",
      label: "Deterministic estimate basis",
      source: "deterministic_estimate_basis",
      authority: "deterministic_pricing_basis",
      pricingAuthoritative: true,
      pricingEligibleNow: true,
      summary: "A deterministic estimate basis was produced without explicit unit quantities.",
      notes: estimateBasis.assumptions,
    })
    return
  }

  for (const [unit, value] of quantityEntries) {
    addItem(items, {
      id: `deterministic-estimate-basis:${unit}`,
      label: `Deterministic ${unit} basis`,
      source: "deterministic_estimate_basis",
      authority: "deterministic_pricing_basis",
      pricingAuthoritative: true,
      pricingEligibleNow: true,
      summary: `Deterministic pricing basis used ${value} ${unit}.`,
      quantity: value,
      unit: unit as PricingUnit,
      notes: estimateBasis.assumptions,
    })
  }

  if (isKnownNumber(estimateBasis.crewDays)) {
    addItem(items, {
      id: "deterministic-estimate-basis:crew-days",
      label: "Deterministic crew days",
      source: "deterministic_estimate_basis",
      authority: "deterministic_pricing_basis",
      pricingAuthoritative: true,
      pricingEligibleNow: true,
      summary: `Deterministic pricing basis used ${estimateBasis.crewDays} crew days.`,
      quantity: estimateBasis.crewDays,
      unit: "days",
      notes: estimateBasis.assumptions,
    })
  }
}

function addScopeItems(items: EvidenceAuthorityItem[], scopeFacts: EstimatorScopeFacts | null | undefined): void {
  if (!scopeFacts) return

  if (cleanText(scopeFacts.includedWorkText)) {
    addItem(items, {
      id: "typed-scope:included",
      label: "Typed included scope",
      source: "typed_included_scope",
      authority: "pricing_authoritative",
      pricingAuthoritative: true,
      pricingEligibleNow: true,
      summary: summarizeText(scopeFacts.includedWorkText),
      notes: scopeFacts.includedTrades.map((trade) => `Included trade: ${trade}`),
    })
  }

  if (cleanText(scopeFacts.boundaryText)) {
    addItem(items, {
      id: "typed-scope:boundary",
      label: "Typed excluded or boundary scope",
      source: "typed_boundary_scope",
      authority: "excluded_or_boundary_context",
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      summary: summarizeText(scopeFacts.boundaryText),
      notes: [
        ...scopeFacts.excludedTrades.map((trade) => `Excluded/by-others trade: ${trade}`),
        ...scopeFacts.protectionTrades.map((trade) => `Protection-only trade: ${trade}`),
        ...scopeFacts.coordinationTrades.map((trade) => `Coordination-only trade: ${trade}`),
        ...scopeFacts.existingConditionTrades.map((trade) => `Existing/to-remain trade: ${trade}`),
      ],
    })
  }
}

function photoQuantityAuthority(args: {
  key: string
  source: "reference_scaled" | "visual_guess" | "count_based" | null | undefined
  pricingAuthoritativePhotoQuantityKeys: string[]
}): EvidenceAuthorityLabel {
  if (args.pricingAuthoritativePhotoQuantityKeys.includes(args.key)) return "pricing_authoritative"
  return "review_only"
}

function addPhotoItems(args: {
  items: EvidenceAuthorityItem[]
  photoAnalysis: PhotoAnalysis | null | undefined
  pricingAuthoritativePhotoQuantityKeys: string[]
}): void {
  const { photoAnalysis } = args
  if (!photoAnalysis) return

  const observations = [
    ...(photoAnalysis.observations || []),
    ...(photoAnalysis.detectedConditions || []).map((condition) => `Condition: ${condition}`),
    ...(photoAnalysis.detectedMaterials || []).map((material) => `Material: ${material}`),
    ...(photoAnalysis.detectedFixtures || []).map((fixture) => `Fixture: ${fixture}`),
    ...(photoAnalysis.detectedAccessIssues || []).map((issue) => `Access: ${issue}`),
    ...(photoAnalysis.detectedDemoNeeds || []).map((need) => `Demo/prep: ${need}`),
  ].map(cleanText).filter(Boolean)

  if (observations.length > 0 || cleanText(photoAnalysis.summary)) {
    addItem(args.items, {
      id: "photo:observations",
      label: "Photo observations",
      source: "photo_observation",
      authority: "review_only",
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      summary: summarizeText(cleanText(photoAnalysis.summary) || observations.slice(0, 3).join("; ")),
      confidence: photoAnalysis.jobSummary?.confidenceScore ?? null,
      notes: observations,
    })
  }

  const merged = photoAnalysis.jobSummary?.mergedQuantities
  const quantitySources = photoAnalysis.jobSummary?.quantitySources
  const quantityValues: Array<{
    key: keyof NonNullable<typeof merged>
    unit: PricingUnit
    source?: "reference_scaled" | "visual_guess" | "count_based" | null
  }> = [
    { key: "doors", unit: "doors" },
    { key: "windows", unit: "lump_sum" },
    { key: "vanities", unit: "fixtures" },
    { key: "toilets", unit: "fixtures" },
    { key: "sinks", unit: "fixtures" },
    { key: "outlets", unit: "devices" },
    { key: "switches", unit: "devices" },
    { key: "recessedLights", unit: "devices" },
    { key: "cabinets", unit: "lump_sum" },
    { key: "appliances", unit: "lump_sum" },
    { key: "wallSqft", unit: "sqft", source: quantitySources?.wallSqft },
    { key: "ceilingSqft", unit: "sqft", source: quantitySources?.ceilingSqft },
    { key: "floorSqft", unit: "sqft", source: quantitySources?.floorSqft },
    { key: "trimLf", unit: "linear_ft", source: quantitySources?.trimLf },
  ]

  for (const quantity of quantityValues) {
    const value = merged?.[quantity.key]
    if (!isKnownNumber(value)) continue
    const source = quantity.source || null
    const authority = photoQuantityAuthority({
      key: quantity.key,
      source,
      pricingAuthoritativePhotoQuantityKeys: args.pricingAuthoritativePhotoQuantityKeys,
    })
    const pricingAuthoritative = isPricingAuthority(authority)
    addItem(args.items, {
      id: `photo:quantity:${quantity.key}`,
      label: `Photo ${quantity.key}`,
      source: source === "reference_scaled" ? "photo_reference_scaled_quantity" : "photo_quantity_signal",
      authority,
      pricingAuthoritative,
      pricingEligibleNow: pricingAuthoritative,
      summary: `Photo analysis reported ${value} ${quantity.unit} for ${quantity.key}.`,
      quantity: value,
      unit: quantity.unit,
      confidence: photoAnalysis.jobSummary?.confidenceScore ?? null,
      notes: source ? [`Photo quantity source: ${source}`] : undefined,
    })
  }
}

function findGate(
  candidate: PlanTradeQuantityCandidate,
  gates: PlanTradeQuantityCandidateGate[] | undefined
): PlanTradeQuantityCandidateGate | null {
  return gates?.find((gate) => gate.candidateKey === candidate.candidateKey) || null
}

function authorityForPlanCandidate(
  candidate: PlanTradeQuantityCandidate,
  gate: PlanTradeQuantityCandidateGate | null
): EvidenceAuthorityLabel {
  if (gate?.gateStatus === "future_candidate") return "future_measured_takeoff_candidate"
  if (gate?.gateStatus === "blocked" || candidate.quantityStatus === "unsupported") return "diagnostic_only"
  return "review_only"
}

function addPlanItems(items: EvidenceAuthorityItem[], planIntelligence: PlanIntelligence | null | undefined): void {
  if (!planIntelligence) return

  if (planIntelligence.sheetIndex.length > 0 || planIntelligence.evidence.summaryRefs.length > 0) {
    addItem(items, {
      id: "plan:sheet-evidence",
      label: "Plan sheet evidence",
      source: "plan_sheet_evidence",
      authority: "review_only",
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      summary: `${planIntelligence.sheetIndex.length} indexed plan sheet(s) available for estimator review.`,
      confidence: planIntelligence.confidenceScore,
      evidenceRefs: planIntelligence.evidence.summaryRefs,
    })
  }

  const tablesCount = planIntelligence.extractedTables?.length || 0
  const finishMatrixCount = planIntelligence.roomFinishMatrices?.length || 0
  if (tablesCount > 0 || finishMatrixCount > 0) {
    addItem(items, {
      id: "plan:tables-finish-schedules",
      label: "Plan tables and finish schedules",
      source: "plan_table_or_finish_schedule",
      authority: "review_only",
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      summary: `${tablesCount} extracted table(s) and ${finishMatrixCount} room finish matrix item(s) available for review.`,
      confidence: planIntelligence.confidenceScore,
    })
  }

  const packageCount = planIntelligence.repeatedRoomPackages?.length || 0
  if (packageCount > 0) {
    addItem(items, {
      id: "plan:repeated-room-packages",
      label: "Repeated room packages",
      source: "plan_repeated_room_package",
      authority: "review_only",
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      summary: `${packageCount} repeated room package candidate(s) available for review.`,
      confidence: planIntelligence.confidenceScore,
    })
  }

  for (const candidate of planIntelligence.tradeQuantityCandidates || []) {
    const gate = findGate(candidate, planIntelligence.tradeQuantityCandidateGates)
    const authority = authorityForPlanCandidate(candidate, gate)
    addItem(items, {
      id: `plan:quantity-candidate:${candidate.candidateKey}`,
      label: candidate.category,
      source: "plan_quantity_candidate",
      authority,
      pricingAuthoritative: false,
      pricingEligibleNow: false,
      summary: `${candidate.category}: ${candidate.quantity ?? "unknown"} ${candidate.unit}.`,
      quantity: candidate.quantity ?? undefined,
      unit: candidate.unit === "lf" ? "linear_ft" : candidate.unit === "sf" ? "sqft" : "unknown",
      confidence: candidate.confidence,
      warnings: [...candidate.warnings, ...(gate?.warnings || []), ...(gate?.blockers || [])],
      evidenceRefs: [],
      notes: candidate.assumptions,
    })
  }
}

function buildSummary(items: EvidenceAuthorityItem[]): EvidenceAuthorityReadback["summary"] {
  return {
    pricingAuthoritativeCount: items.filter((item) => item.pricingAuthoritative).length,
    reviewOnlyCount: items.filter((item) => item.authority === "review_only").length,
    diagnosticOnlyCount: items.filter((item) => item.authority === "diagnostic_only").length,
    boundaryContextCount: items.filter((item) => item.authority === "excluded_or_boundary_context").length,
    futureMeasuredTakeoffCandidateCount: items.filter(
      (item) => item.authority === "future_measured_takeoff_candidate"
    ).length,
  }
}

export function buildEvidenceAuthorityReadback(
  args: BuildEvidenceAuthorityReadbackArgs
): EvidenceAuthorityReadback {
  const items: EvidenceAuthorityItem[] = []

  addScopeItems(items, args.scopeFacts)
  addQuantityItems({
    items,
    quantities: args.userQuantities,
    source: "user_quantity",
    fallbackAuthority: "user_confirmed_quantity",
    idPrefix: "quantity:user",
  })
  addQuantityItems({
    items,
    quantities: args.parsedQuantities,
    source: "parsed_typed_quantity",
    fallbackAuthority: "parsed_typed_quantity",
    idPrefix: "quantity:parsed",
  })
  addEstimateBasisItems(items, args.estimateBasis)
  addPhotoItems({
    items,
    photoAnalysis: args.photoAnalysis,
    pricingAuthoritativePhotoQuantityKeys: args.pricingAuthoritativePhotoQuantityKeys || [],
  })
  addPlanItems(items, args.planIntelligence)
  addQuantityItems({
    items,
    quantities: args.futureMeasuredPlanQuantities,
    source: "future_measured_plan_quantity",
    fallbackAuthority: "future_measured_takeoff_candidate",
    idPrefix: "quantity:future-plan-measured",
  })

  return {
    items,
    summary: buildSummary(items),
  }
}
