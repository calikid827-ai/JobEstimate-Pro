export type EstimatorIntelligenceFindingCategory =
  | "plan_overview"
  | "plan_evidence"
  | "plan_quantity_candidate"
  | "photo_condition"
  | "photo_quantity_signal"
  | "missed_scope"
  | "pricing_risk"
  | "assembly_candidate"
  | "scope_confirmation"
  | "exclusion_or_boundary"
  | "diagnostic_note"

export type EstimatorIntelligenceFindingSourceKind =
  | "plan_readback"
  | "plan_evidence"
  | "plan_quantity_candidate"
  | "photo_analysis"
  | "photo_scope_assist"
  | "missed_scope_detector"
  | "profit_leak_detector"
  | "priceguard_review"
  | "evidence_authority"
  | "assembly_candidate"
  | "diagnostic"

export type EstimatorIntelligenceFindingAuthority =
  | "review_only"
  | "diagnostic_only"
  | "excluded_or_boundary_context"
  | "future_candidate"

export type EstimatorIntelligenceFindingSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"

export type EstimatorIntelligenceFindingEvidence = {
  sourceKind: EstimatorIntelligenceFindingSourceKind
  label?: string
  excerpt?: string
  sheetNumber?: string | null
  pageNumber?: number | null
  photoName?: string | null
  confidence?: number | null
}

export type EstimatorIntelligenceFinding = {
  id: string
  category: EstimatorIntelligenceFindingCategory
  sourceKind: EstimatorIntelligenceFindingSourceKind
  title: string
  summary: string
  severity: EstimatorIntelligenceFindingSeverity
  authority: EstimatorIntelligenceFindingAuthority
  confidence: number | null
  evidence: EstimatorIntelligenceFindingEvidence[]
  suggestedAction?: string
  pricingEligibleNow: false
  pricingAuthoritative: false
  customerVisible: false
  requiresEstimatorConfirmation: true
  dataNoPrint: true
}

export type EstimatorIntelligenceFindingsSummary = {
  total: number
  byCategory: Partial<Record<EstimatorIntelligenceFindingCategory, number>>
  bySeverity: Partial<Record<EstimatorIntelligenceFindingSeverity, number>>
  byAuthority: Partial<Record<EstimatorIntelligenceFindingAuthority, number>>
  requiresEstimatorConfirmationCount: number
  pricingEligibleNowCount: 0
  pricingAuthoritativeCount: 0
  customerVisibleCount: 0
  dataNoPrintCount: number
}

export type EstimatorIntelligenceFindingsResult = {
  findings: EstimatorIntelligenceFinding[]
  summary: EstimatorIntelligenceFindingsSummary
}

export type BuildEstimatorIntelligenceFindingsInput = {
  planIntelligence?: unknown
  planReadback?: unknown
  photoAnalysis?: unknown
  photoScopeAssist?: unknown
  missedScopeDetector?: unknown
  missedScopeItems?: unknown
  profitLeakDetector?: unknown
  priceGuardReview?: unknown
  evidenceAuthorityReadback?: unknown
  assemblyCandidates?: unknown
  tradeAssembledPricingInputs?: unknown
}

type FindingDraft = {
  category: EstimatorIntelligenceFindingCategory
  sourceKind: EstimatorIntelligenceFindingSourceKind
  title: string
  summary: string
  severity?: EstimatorIntelligenceFindingSeverity
  authority?: EstimatorIntelligenceFindingAuthority
  confidence?: number | null
  evidence?: EstimatorIntelligenceFindingEvidence[]
  suggestedAction?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function normalizeKey(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function stringList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    const text = cleanText(item)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= max) break
  }

  return out
}

function recordList(value: unknown, max = 40): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).slice(0, max)
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampConfidence(value: unknown): number | null {
  const n = numberOrNull(value)
  if (n == null) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function evidenceFromRefs(
  refs: unknown,
  sourceKind: EstimatorIntelligenceFindingSourceKind
): EstimatorIntelligenceFindingEvidence[] {
  return recordList(refs, 8)
    .map((ref) => {
      const labelParts = [
        cleanText(ref.sheetNumber),
        cleanText(ref.sheetTitle),
        cleanText(ref.uploadName),
      ].filter(Boolean)

      const evidence: EstimatorIntelligenceFindingEvidence = {
        sourceKind,
        label: labelParts.join(" - ") || undefined,
        excerpt: cleanText(ref.excerpt) || undefined,
        sheetNumber: cleanText(ref.sheetNumber) || null,
        pageNumber: numberOrNull(ref.sourcePageNumber) ?? numberOrNull(ref.pageNumber),
        photoName: cleanText(ref.photoName) || cleanText(ref.name) || null,
        confidence: clampConfidence(ref.confidence),
      }

      return evidence
    })
    .filter(
      (item) =>
        Boolean(item.label) ||
        Boolean(item.excerpt) ||
        Boolean(item.sheetNumber) ||
        item.pageNumber != null ||
        Boolean(item.photoName)
    )
}

function simpleEvidence(args: {
  sourceKind: EstimatorIntelligenceFindingSourceKind
  label?: unknown
  excerpt?: unknown
  photoName?: unknown
  confidence?: unknown
}): EstimatorIntelligenceFindingEvidence[] {
  const evidence: EstimatorIntelligenceFindingEvidence = {
    sourceKind: args.sourceKind,
    label: cleanText(args.label) || undefined,
    excerpt: cleanText(args.excerpt) || undefined,
    photoName: cleanText(args.photoName) || null,
    confidence: clampConfidence(args.confidence),
  }

  return evidence.label || evidence.excerpt || evidence.photoName ? [evidence] : []
}

function makeFinding(draft: FindingDraft, index: number): EstimatorIntelligenceFinding | null {
  const title = cleanText(draft.title)
  const summary = cleanText(draft.summary)
  if (!title || !summary) return null

  const idParts = [
    draft.sourceKind,
    draft.category,
    title,
    summary,
    (draft.evidence || []).map((item) =>
      [
        item.sourceKind,
        item.label || "",
        item.excerpt || "",
        item.sheetNumber || "",
        item.pageNumber ?? "",
        item.photoName || "",
      ].join(":")
    ).join("|"),
  ]
  const normalized = normalizeKey(idParts.join("|"))
  const id = normalized ? `estimator-intelligence:${normalized}` : `estimator-intelligence:${index}`

  return {
    id,
    category: draft.category,
    sourceKind: draft.sourceKind,
    title,
    summary,
    severity: draft.severity || "medium",
    authority: draft.authority || "review_only",
    confidence: draft.confidence ?? null,
    evidence: draft.evidence || [],
    suggestedAction: cleanText(draft.suggestedAction) || undefined,
    pricingEligibleNow: false,
    pricingAuthoritative: false,
    customerVisible: false,
    requiresEstimatorConfirmation: true,
    dataNoPrint: true,
  }
}

function addFinding(drafts: FindingDraft[], draft: FindingDraft): void {
  drafts.push(draft)
}

function addPlanReadbackFindings(
  drafts: FindingDraft[],
  planIntelligence: Record<string, unknown> | null,
  explicitReadback: unknown
): void {
  const readback = isRecord(explicitReadback)
    ? explicitReadback
    : isRecord(planIntelligence?.planReadback)
      ? planIntelligence.planReadback
      : null

  if (!readback) return

  const headline = cleanText(readback.headline)
  if (headline) {
    addFinding(drafts, {
      category: "plan_overview",
      sourceKind: "plan_readback",
      title: "Plan readback available",
      summary: headline,
      severity: "info",
      authority: "review_only",
      evidence: evidenceFromRefs(readback.evidence, "plan_readback"),
      suggestedAction: "Review selected plan evidence before relying on it for scope or quantity decisions.",
    })
  }

  for (const item of recordList(readback.directlySupported, 8)) {
    const text = cleanText(item.text)
    if (!text) continue
    addFinding(drafts, {
      category: "plan_evidence",
      sourceKind: "plan_readback",
      title: "Direct plan support",
      summary: text,
      severity: "info",
      authority: "review_only",
      evidence: evidenceFromRefs(item.evidence, "plan_readback"),
    })
  }

  for (const item of recordList(readback.needsConfirmation, 8)) {
    const text = cleanText(item.text)
    if (!text) continue
    addFinding(drafts, {
      category: "scope_confirmation",
      sourceKind: "plan_readback",
      title: "Plan item needs confirmation",
      summary: text,
      severity: "medium",
      authority: "review_only",
      evidence: evidenceFromRefs(item.evidence, "plan_readback"),
      suggestedAction: "Confirm this item against the estimator-controlled typed scope.",
    })
  }

  for (const gap of recordList(readback.scopeGapReadback, 12)) {
    const title = cleanText(gap.title) || "Plan scope gap"
    const summary = cleanText(gap.narration) || cleanText(gap.confirmationPrompt)
    if (!summary) continue
    addFinding(drafts, {
      category: "scope_confirmation",
      sourceKind: "plan_readback",
      title,
      summary,
      severity: gap.status === "risky_assumption" ? "high" : "medium",
      authority: "review_only",
      evidence: evidenceFromRefs(gap.evidence, "plan_readback"),
      suggestedAction: cleanText(gap.confirmationPrompt) || "Confirm before treating this as included scope.",
    })
  }

  for (const area of recordList(readback.areaQuantityReadback, 12)) {
    const areaGroup = cleanText(area.areaGroup)
    const narration = cleanText(area.narration)
    const quantities = stringList(area.quantityNarration, 4)
    if (!areaGroup && !narration && quantities.length === 0) continue
    addFinding(drafts, {
      category: quantities.length ? "plan_quantity_candidate" : "plan_evidence",
      sourceKind: "plan_readback",
      title: areaGroup ? `Plan area: ${areaGroup}` : "Plan area quantity readback",
      summary: [narration, ...quantities].filter(Boolean).join(" "),
      severity: "medium",
      authority: "review_only",
      evidence: evidenceFromRefs(area.evidence, "plan_readback"),
      suggestedAction: "Keep plan area quantities review-only until estimator confirmation.",
    })
  }
}

function addPlanEvidenceStrengthFindings(
  drafts: FindingDraft[],
  planIntelligence: Record<string, unknown> | null
): void {
  const strength = isRecord(planIntelligence?.evidenceStrength) ? planIntelligence.evidenceStrength : null
  if (!strength) return

  const label = cleanText(strength.label) || "Plan evidence"
  const summary = cleanText(strength.summary)
  if (!summary) return

  addFinding(drafts, {
    category: "plan_evidence",
    sourceKind: "plan_evidence",
    title: label,
    summary,
    severity: strength.level === "strong" ? "info" : "medium",
    authority: "review_only",
    suggestedAction: "Use this as plan-readback quality context only.",
  })
}

function addPlanQuantityCandidateFindings(
  drafts: FindingDraft[],
  planIntelligence: Record<string, unknown> | null
): void {
  const candidates = recordList(planIntelligence?.tradeQuantityCandidates, 30)
  const gates = recordList(planIntelligence?.tradeQuantityCandidateGates, 30)

  for (const candidate of candidates) {
    const category = cleanText(candidate.category) || "Plan quantity candidate"
    const quantity = candidate.quantity == null ? "unknown" : cleanText(candidate.quantity)
    const unit = cleanText(candidate.unit) || "unknown"
    const gate = gates.find((item) => cleanText(item.candidateKey) === cleanText(candidate.candidateKey))
    const gateStatus = cleanText(gate?.gateStatus)
    const authority: EstimatorIntelligenceFindingAuthority =
      gateStatus === "future_candidate" ? "future_candidate" :
      gateStatus === "blocked" || cleanText(candidate.quantityStatus) === "unsupported" ? "diagnostic_only" :
      "review_only"

    addFinding(drafts, {
      category: "plan_quantity_candidate",
      sourceKind: "plan_quantity_candidate",
      title: category,
      summary: `${category}: ${quantity} ${unit}.`,
      severity: authority === "diagnostic_only" ? "low" : "medium",
      authority,
      confidence: clampConfidence(candidate.confidence),
      evidence: evidenceFromRefs(candidate.sourceRefs, "plan_quantity_candidate"),
      suggestedAction: "Do not use this candidate for pricing unless estimator confirmation is added in a future workflow.",
    })
  }
}

function addPhotoFindings(
  drafts: FindingDraft[],
  photoAnalysis: unknown,
  photoScopeAssist: unknown
): void {
  const photo = isRecord(photoAnalysis) ? photoAnalysis : null
  const assist = isRecord(photoScopeAssist) ? photoScopeAssist : null
  if (!photo && !assist) return

  const photoRefs = recordList(photo?.perPhoto, 20).map((item) => ({
    sourceKind: "photo_analysis" as const,
    label: cleanText(item.roomTag) || cleanText(item.shotType) || undefined,
    excerpt: cleanText(item.reasoning) || cleanText(item.detectedConditions),
    photoName: cleanText(item.photoName) || null,
    confidence: clampConfidence(item.confidence),
  }))

  for (const condition of stringList(photo?.detectedConditions, 12)) {
    addFinding(drafts, {
      category: "photo_condition",
      sourceKind: "photo_analysis",
      title: "Photo-visible condition",
      summary: condition,
      severity: "medium",
      authority: "review_only",
      confidence: clampConfidence(photo?.jobSummary && isRecord(photo.jobSummary) ? photo.jobSummary.confidenceScore : null),
      evidence: photoRefs.length ? photoRefs : simpleEvidence({ sourceKind: "photo_analysis", excerpt: condition }),
      suggestedAction: "Confirm whether this visible condition belongs in the estimator-controlled scope.",
    })
  }

  for (const flag of stringList(photo?.scopeCompletenessFlags, 12)) {
    addFinding(drafts, {
      category: "scope_confirmation",
      sourceKind: "photo_analysis",
      title: "Photo scope confirmation",
      summary: flag,
      severity: "medium",
      authority: "review_only",
      evidence: simpleEvidence({ sourceKind: "photo_analysis", excerpt: flag }),
      suggestedAction: "Review against typed scope before adding or excluding work.",
    })
  }

  for (const flag of stringList(assist?.missingScopeFlags, 12)) {
    addFinding(drafts, {
      category: "missed_scope",
      sourceKind: "photo_scope_assist",
      title: "Photo-suggested missing scope",
      summary: flag,
      severity: "medium",
      authority: "review_only",
      evidence: simpleEvidence({ sourceKind: "photo_scope_assist", excerpt: flag }),
      suggestedAction: "Confirm with the estimator before treating this as included scope.",
    })
  }

  const quantitySignals = isRecord(photo?.quantitySignals) ? photo.quantitySignals : null
  if (quantitySignals) {
    const quantityLabels: Array<[string, string]> = [
      ["doors", "doors"],
      ["windows", "windows"],
      ["vanities", "vanities"],
      ["toilets", "toilets"],
      ["sinks", "sinks"],
      ["outlets", "outlets"],
      ["switches", "switches"],
      ["recessedLights", "recessed lights"],
      ["estimatedWallSqftMin", "estimated wall sqft minimum"],
      ["estimatedWallSqftMax", "estimated wall sqft maximum"],
      ["estimatedCeilingSqftMin", "estimated ceiling sqft minimum"],
      ["estimatedCeilingSqftMax", "estimated ceiling sqft maximum"],
      ["estimatedFloorSqftMin", "estimated floor sqft minimum"],
      ["estimatedFloorSqftMax", "estimated floor sqft maximum"],
    ]

    for (const [key, label] of quantityLabels) {
      const value = numberOrNull(quantitySignals[key])
      if (value == null || value <= 0) continue
      addFinding(drafts, {
        category: "photo_quantity_signal",
        sourceKind: "photo_analysis",
        title: "Photo quantity signal",
        summary: `Photo analysis reported ${value} ${label}.`,
        severity: "medium",
        authority: "review_only",
        confidence: clampConfidence(photo?.jobSummary && isRecord(photo.jobSummary) ? photo.jobSummary.confidenceScore : null),
        evidence: photoRefs.length ? photoRefs : simpleEvidence({ sourceKind: "photo_analysis", excerpt: `${value} ${label}` }),
        suggestedAction: "Use as a review signal only; do not price from photo quantity signals without estimator confirmation.",
      })
    }
  }
}

function itemSummary(item: Record<string, unknown>): string {
  return cleanText(item.reason) || cleanText(item.message) || cleanText(item.summary) || cleanText(item.label)
}

function addTierItems(args: {
  drafts: FindingDraft[]
  value: unknown
  sourceKind: EstimatorIntelligenceFindingSourceKind
  category: EstimatorIntelligenceFindingCategory
  title: string
  severity?: EstimatorIntelligenceFindingSeverity
}): void {
  for (const item of recordList(args.value, 20)) {
    const label = cleanText(item.label) || args.title
    const summary = itemSummary(item)
    if (!summary) continue
    addFinding(args.drafts, {
      category: args.category,
      sourceKind: args.sourceKind,
      title: label,
      summary,
      severity: args.severity || "medium",
      authority: "review_only",
      confidence: clampConfidence(item.confidence),
      evidence: stringList(item.evidence, 6).map((excerpt) => ({
        sourceKind: args.sourceKind,
        excerpt,
      })),
      suggestedAction: "Estimator review required before changing scope, price, or customer output.",
    })
  }
}

function addMissedScopeAndRiskFindings(
  drafts: FindingDraft[],
  input: BuildEstimatorIntelligenceFindingsInput
): void {
  const missed = isRecord(input.missedScopeDetector) ? input.missedScopeDetector : null
  addTierItems({
    drafts,
    value: missed?.likelyMissingScope ?? input.missedScopeItems,
    sourceKind: "missed_scope_detector",
    category: "missed_scope",
    title: "Likely missing scope",
    severity: "high",
  })
  addTierItems({
    drafts,
    value: missed?.recommendedConfirmations,
    sourceKind: "missed_scope_detector",
    category: "scope_confirmation",
    title: "Recommended confirmation",
    severity: "medium",
  })

  const profit = isRecord(input.profitLeakDetector) ? input.profitLeakDetector : null
  addTierItems({
    drafts,
    value: profit?.likelyProfitLeaks,
    sourceKind: "profit_leak_detector",
    category: "pricing_risk",
    title: "Profit leak risk",
    severity: "high",
  })
  addTierItems({
    drafts,
    value: profit?.pricingReviewPrompts,
    sourceKind: "profit_leak_detector",
    category: "pricing_risk",
    title: "Pricing review prompt",
    severity: "medium",
  })

  const review = isRecord(input.priceGuardReview) ? input.priceGuardReview : null
  const reviewBuckets: Array<[unknown, EstimatorIntelligenceFindingCategory, string, EstimatorIntelligenceFindingSeverity]> = [
    [review?.missedScopeWarnings, "missed_scope", "PriceGuard missed-scope warning", "medium"],
    [review?.laborMaterialConfidenceNotes, "pricing_risk", "PriceGuard pricing risk", "medium"],
    [review?.scopeClarityWarnings, "scope_confirmation", "PriceGuard scope confirmation", "medium"],
    [review?.suggestedExclusions, "exclusion_or_boundary", "PriceGuard suggested exclusion", "medium"],
    [review?.contractorRiskNotes, "pricing_risk", "PriceGuard contractor risk", "high"],
  ]

  for (const [values, category, title, severity] of reviewBuckets) {
    for (const item of stringList(values, 10)) {
      addFinding(drafts, {
        category,
        sourceKind: "priceguard_review",
        title,
        summary: item,
        severity,
        authority: category === "exclusion_or_boundary" ? "excluded_or_boundary_context" : "review_only",
        evidence: simpleEvidence({ sourceKind: "priceguard_review", excerpt: item }),
        suggestedAction: "Review before changing proposal text or pricing.",
      })
    }
  }
}

function addEvidenceAuthorityFindings(drafts: FindingDraft[], value: unknown): void {
  const readback = isRecord(value) ? value : null
  for (const item of recordList(readback?.items, 30)) {
    const authorityText = cleanText(item.authority)
    const authority: EstimatorIntelligenceFindingAuthority =
      authorityText === "excluded_or_boundary_context" ? "excluded_or_boundary_context" :
      authorityText === "future_measured_takeoff_candidate" ? "future_candidate" :
      authorityText === "diagnostic_only" ? "diagnostic_only" :
      "review_only"
    const label = cleanText(item.label) || "Evidence authority item"
    const summary = cleanText(item.summary)
    if (!summary) continue
    addFinding(drafts, {
      category: authority === "excluded_or_boundary_context" ? "exclusion_or_boundary" : "diagnostic_note",
      sourceKind: "evidence_authority",
      title: label,
      summary,
      severity: authority === "excluded_or_boundary_context" ? "medium" : "info",
      authority,
      confidence: clampConfidence(item.confidence),
      evidence: evidenceFromRefs(item.evidenceRefs, "evidence_authority"),
      suggestedAction: "Keep authority classification internal unless a future confirmation workflow promotes it.",
    })
  }
}

function addAssemblyFindings(drafts: FindingDraft[], input: BuildEstimatorIntelligenceFindingsInput): void {
  const candidates = recordList(input.assemblyCandidates, 20)

  for (const candidate of candidates) {
    const title = cleanText(candidate.title) || cleanText(candidate.sectionTitle) || "Assembly candidate"
    const summary =
      cleanText(candidate.summary) ||
      cleanText(candidate.candidateSummary) ||
      cleanText(candidate.narration) ||
      title
    addFinding(drafts, {
      category: "assembly_candidate",
      sourceKind: "assembly_candidate",
      title,
      summary,
      severity: "medium",
      authority: "future_candidate",
      confidence: clampConfidence(candidate.confidence),
      evidence: evidenceFromRefs(candidate.evidence, "assembly_candidate"),
      suggestedAction: "Keep as a future assembly candidate only; do not affect pricing in this phase.",
    })
  }

  const assembled = isRecord(input.tradeAssembledPricingInputs) ? input.tradeAssembledPricingInputs : null
  for (const item of stringList(assembled?.tradeAssembledPrimaryCandidates, 8)) {
    addFinding(drafts, {
      category: "assembly_candidate",
      sourceKind: "assembly_candidate",
      title: "Trade assembly candidate",
      summary: item,
      severity: "medium",
      authority: "future_candidate",
      suggestedAction: "Review-only assembly organization; no pricing authority.",
    })
  }
  for (const item of stringList(assembled?.tradeAssembledReviewCandidates, 8)) {
    addFinding(drafts, {
      category: "assembly_candidate",
      sourceKind: "assembly_candidate",
      title: "Review-only assembly candidate",
      summary: item,
      severity: "medium",
      authority: "future_candidate",
      suggestedAction: "Review-only assembly organization; no pricing authority.",
    })
  }
}

function dedupeFindings(findings: EstimatorIntelligenceFinding[]): EstimatorIntelligenceFinding[] {
  const seen = new Set<string>()
  const out: EstimatorIntelligenceFinding[] = []

  for (const finding of findings) {
    const key = normalizeKey([
      finding.category,
      finding.sourceKind,
      finding.title,
      finding.summary,
      finding.authority,
    ].join("|"))
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(finding)
  }

  return out
}

function buildSummary(findings: EstimatorIntelligenceFinding[]): EstimatorIntelligenceFindingsSummary {
  const byCategory: EstimatorIntelligenceFindingsSummary["byCategory"] = {}
  const bySeverity: EstimatorIntelligenceFindingsSummary["bySeverity"] = {}
  const byAuthority: EstimatorIntelligenceFindingsSummary["byAuthority"] = {}

  for (const finding of findings) {
    byCategory[finding.category] = (byCategory[finding.category] || 0) + 1
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1
    byAuthority[finding.authority] = (byAuthority[finding.authority] || 0) + 1
  }

  return {
    total: findings.length,
    byCategory,
    bySeverity,
    byAuthority,
    requiresEstimatorConfirmationCount: findings.filter((finding) => finding.requiresEstimatorConfirmation).length,
    pricingEligibleNowCount: 0,
    pricingAuthoritativeCount: 0,
    customerVisibleCount: 0,
    dataNoPrintCount: findings.filter((finding) => finding.dataNoPrint).length,
  }
}

export function buildEstimatorIntelligenceFindings(
  input: BuildEstimatorIntelligenceFindingsInput = {}
): EstimatorIntelligenceFindingsResult {
  const safeInput = isRecord(input) ? input : {}
  const drafts: FindingDraft[] = []
  const planIntelligence = isRecord(safeInput.planIntelligence) ? safeInput.planIntelligence : null

  addPlanReadbackFindings(drafts, planIntelligence, safeInput.planReadback)
  addPlanEvidenceStrengthFindings(drafts, planIntelligence)
  addPlanQuantityCandidateFindings(drafts, planIntelligence)
  addPhotoFindings(drafts, safeInput.photoAnalysis, safeInput.photoScopeAssist)
  addMissedScopeAndRiskFindings(drafts, safeInput)
  addEvidenceAuthorityFindings(drafts, safeInput.evidenceAuthorityReadback)
  addAssemblyFindings(drafts, safeInput)

  const findings = dedupeFindings(
    drafts
      .map((draft, index) => makeFinding(draft, index))
      .filter((finding): finding is EstimatorIntelligenceFinding => finding !== null)
  )

  return {
    findings,
    summary: buildSummary(findings),
  }
}
