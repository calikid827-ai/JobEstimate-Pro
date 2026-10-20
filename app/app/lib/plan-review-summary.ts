import type { PlanEvidenceFreshness } from "./plan-intelligence-evidence"

export type PlanReviewSource = {
  uploadId?: string
  uploadName?: string
  pageNumber?: number
  sourcePageNumber?: number
  sheetNumber?: string | null
  sheetTitle?: string | null
  rowIndex?: number
  sourceTableIndex?: number
  sourceMatrixIndex?: number
}

type ReadbackItem = { narration: string; evidence: readonly PlanReviewSource[] }
type ConfirmationItem = { text: string; evidence: readonly PlanReviewSource[] }
type QuantityCandidate = {
  candidateKey: string
  category: string
  quantity: number | null
  unit: string
  quantityStatus: string
  trade?: string
  sourceType?: string
  sourceRefs: readonly PlanReviewSource[]
}

type PlanSummaryInput = {
  summary?: string | null
  detectedTrades?: readonly string[]
  detectedRooms?: readonly string[]
  planReadback?: {
    headline: string
    groupedScopeReadback?: readonly ReadbackItem[]
    tradeScopeReadback?: readonly ReadbackItem[]
    directlySupported?: readonly ConfirmationItem[]
    needsConfirmation?: readonly ConfirmationItem[]
  }
  pageReadStatuses?: readonly (PlanReviewSource & {
    selected: boolean
    textStatus: string
    imageStatus: string
    classificationStatus: string
    failureReasons: readonly string[]
    warnings: readonly string[]
  })[]
  extractedTables?: readonly (PlanReviewSource & { tableType: string; rows: readonly unknown[] })[]
  tradeQuantityCandidates?: readonly QuantityCandidate[]
  evidenceStrength?: { skippedPagesCount: number; level: string }
}

export type PlanReviewSummaryItem = { text: string; sources: PlanReviewSource[] }

function sourceKey(ref: PlanReviewSource): string {
  return JSON.stringify([
    ref.uploadId || "",
    ref.uploadName || "",
    ref.sourcePageNumber ?? null,
    ref.pageNumber ?? null,
    ref.sheetNumber || "",
    ref.sheetTitle || "",
    ref.sourceTableIndex ?? null,
    ref.sourceMatrixIndex ?? null,
    ref.rowIndex ?? null,
  ])
}

function hasSourceLocation(ref: PlanReviewSource): boolean {
  return (
    (typeof ref.sourcePageNumber === "number" && ref.sourcePageNumber > 0) ||
    (typeof ref.pageNumber === "number" && ref.pageNumber > 0) ||
    Boolean(ref.sheetNumber?.trim() || ref.sheetTitle?.trim())
  )
}

function uniqueSources(refs: readonly PlanReviewSource[], preserveUnlocatedProvenance = false): PlanReviewSource[] {
  return Array.from(new Map(refs.filter((ref) => hasSourceLocation(ref) || (
    preserveUnlocatedProvenance && (
      Boolean(ref.uploadId?.trim() || ref.uploadName?.trim()) ||
      [ref.sourceTableIndex, ref.sourceMatrixIndex, ref.rowIndex].some((value) =>
        typeof value === "number" && Number.isInteger(value) && value >= 0
      )
    )
  )).map((ref) => [sourceKey(ref), { ...ref }])).values())
}

function distinctItems(items: PlanReviewSummaryItem[]): PlanReviewSummaryItem[] {
  const result = new Map<string, PlanReviewSummaryItem>()
  for (const item of items) {
    const text = item.text.replace(/\s+/g, " ").trim()
    if (!text) continue
    const sources = uniqueSources(item.sources)
    // Identical wording on different sheets may describe separate affected scope.
    const key = JSON.stringify([text.toLowerCase(), sources.map(sourceKey).sort()])
    if (!result.has(key)) result.set(key, { text, sources })
  }
  return [...result.values()]
}

function quantitySubject(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "")
}

function sameSource(left: PlanReviewSource, right: PlanReviewSource): boolean {
  // A page/sheet label alone cannot establish that two references belong to
  // the same uploaded plan, table, or row. Keep uncertain actions separate.
  const sameUpload = left.uploadId && right.uploadId
    ? left.uploadId === right.uploadId
    : !left.uploadId && !right.uploadId && left.uploadName && left.uploadName === right.uploadName
  return Boolean(sameUpload && sourceKey(left) === sourceKey(right))
}

function sameSources(left: PlanReviewSource[], right: PlanReviewSource[]): boolean {
  return left.length > 0 && left.length === right.length &&
    left.every((source) => right.some((other) => sameSource(source, other)))
}

export function buildPlanReviewSummary(args: {
  planIntelligence: PlanSummaryInput | null
  hasCurrentPlans: boolean
  freshness: PlanEvidenceFreshness
  requiresRegeneration: boolean
}) {
  const { planIntelligence: plan, hasCurrentPlans, freshness, requiresRegeneration } = args
  const readback = plan?.planReadback
  const findings = distinctItems([
    ...(readback?.groupedScopeReadback || []),
    ...(readback?.tradeScopeReadback || []),
  ].map((item) => ({ text: item.narration, sources: [...item.evidence] })))
  const directFindings = distinctItems((readback?.directlySupported || []).map((item) => ({
    text: item.text, sources: [...item.evidence],
  })))
  const returnedConfirmations = distinctItems((readback?.needsConfirmation || []).map((item) => ({
    text: item.text, sources: [...item.evidence],
  })))
  const candidateIdentities = new Set<string>()
  const candidateKeys = new Set<string>()
  const candidates = (plan?.tradeQuantityCandidates || []).flatMap((item, index) => {
    const sources = uniqueSources(item.sourceRefs, true)
    // A stable producer key plus its complete available source provenance can
    // prove a duplicate. Equal values and sheet labels alone cannot.
    const identity = item.candidateKey.trim() && item.sourceRefs.length > 0 && item.sourceRefs.every(hasSourceLocation) ? JSON.stringify([
      item.candidateKey, item.trade || "", item.sourceType || "",
      quantitySubject(item.category), item.quantity, item.unit, item.quantityStatus,
      sources.map(sourceKey).sort(),
    ]) : null
    if (identity && candidateIdentities.has(identity)) return []
    if (identity) candidateIdentities.add(identity)
    let key = item.candidateKey || `quantity-candidate-${index}`
    // Retained entries can have missing/colliding producer keys. Their React
    // identity must still remain separate without inventing source authority.
    while (candidateKeys.has(key)) key += `-${index}`
    candidateKeys.add(key)
    return [{
      key,
      category: item.category,
      quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null,
      unit: item.unit,
      needsMeasurement: item.quantityStatus === "needs_measurement" || item.quantityStatus === "unsupported",
      sources,
    }]
  })
  const confirmations = returnedConfirmations.filter((item) => {
    // Only the same literal quantity subject and affected source sheets can share
    // one verification action. Additional conditions and unknown prose stay separate.
    const subject = quantitySubject(item.text).replace(/^(?:please )?(?:confirm|verify|check|measure) (?:the )?/, "")
    return !candidates.some((candidate) => sameSources(item.sources, candidate.sources) &&
      subject === quantitySubject(candidate.category))
  })
  const headline = (readback?.headline || plan?.summary || "").trim()
  const trades = [...new Set(plan?.detectedTrades || [])]
  const rooms = [...new Set(plan?.detectedRooms || [])]
  const hasReturnedInformation = Boolean(
    headline || findings.length || directFindings.length || confirmations.length || candidates.length ||
    trades.length || rooms.length || plan?.pageReadStatuses?.length || plan?.extractedTables?.length ||
    plan?.evidenceStrength
  )
  if (!hasCurrentPlans && !hasReturnedInformation && !requiresRegeneration) return null

  const refreshNeeded = requiresRegeneration || freshness === "stale" || freshness === "unverified"
  const status = refreshNeeded
    ? freshness === "stale"
      ? "Plans or sheet selection changed. Generate again to refresh the plan review. Earlier findings are out of date."
      : hasCurrentPlans
        ? "This estimate's plan selection could not be verified. Generate again to refresh the plan review."
        : "Earlier plan findings could not be verified. Add the matching plan files and Generate again to refresh the plan review."
    : null
  const needsProcessingReview = Boolean(
    (plan?.evidenceStrength?.level === "review_only" && candidates.length === 0 && confirmations.length === 0) ||
    plan?.pageReadStatuses?.some((item) => item.selected && (
      item.failureReasons.length > 0 ||
      (item.textStatus !== "extracted" && item.imageStatus !== "rendered") ||
      item.classificationStatus !== "classified"
    ))
  )

  // Freshness gates every piece of returned content, including quantity clues and references.
  // Current file selection is never evidence of successful processing or sheet coverage.
  return {
    status,
    unresolvedActionCount: refreshNeeded ? 1 : confirmations.length + candidates.length + (needsProcessingReview ? 1 : 0),
    headline: refreshNeeded ? "" : headline,
    findings: refreshNeeded ? [] : findings.length ? findings : directFindings,
    confirmations: refreshNeeded ? [] : confirmations,
    candidates: refreshNeeded ? [] : candidates,
    trades: refreshNeeded ? [] : trades,
    rooms: refreshNeeded ? [] : rooms,
    tables: refreshNeeded ? [] : (plan?.extractedTables || []).map((table) => ({
      text: `${table.tableType === "unknown" ? "Plan table" : table.tableType.replace(/_/g, " ")}: ${table.rows.length} returned row${table.rows.length === 1 ? "" : "s"}`,
      sources: uniqueSources([table]),
    })),
    needsProcessingReview: !refreshNeeded && needsProcessingReview,
  }
}
