import { buildEstimatorScopeFacts, type EstimatorScopeTrade } from "./estimator-scope-facts"

export type SmartQuestionCategory =
  | "quantity"
  | "included_surfaces"
  | "materials_responsibility"
  | "scope_boundary"
  | "access_condition"
  | "demo_prep"
  | "schedule"
  | "permit_inspection"
  | "photo_plan_review"

export type SmartQuestionSource =
  | "trade_default"
  | "scope_quality"
  | "priceguard_review"
  | "customer_output_readiness"
  | "materials_confirm_items"
  | "area_scope_breakdown"
  | "scope_xray"
  | "photo_scope_assist"
  | "plan_intelligence"

export type SmartQuestionAnswerType = "yes_no" | "number_unit" | "single_choice" | "short_text"

export type SmartQuestion = {
  id: string
  trade: string
  category: SmartQuestionCategory
  prompt: string
  helpText?: string
  source: SmartQuestionSource
  answerType: SmartQuestionAnswerType
  options?: string[]
  priority: "high" | "medium" | "low"
  canAffectPricingIfConfirmed: boolean
  dedupeKey: string
}

export type ConfirmedClarificationAuthority =
  | "user_confirmed_quantity"
  | "scope_boundary_confirmation"
  | "materials_confirmation"
  | "schedule_confirmation"
  | "review_only"
  | "needs_followup"

export type ConfirmedClarificationAnswer =
  | { type: "yes_no"; value: boolean }
  | { type: "number_unit"; value: number; unit: "sqft" | "linear_ft" | "each" | "rooms" | "days" }
  | { type: "single_choice"; value: string }
  | { type: "short_text"; value: string }

export type ConfirmedClarification = {
  id: string
  questionId: string
  answeredAt: number
  trade: string
  category: SmartQuestionCategory
  answer: ConfirmedClarificationAnswer
  authority: ConfirmedClarificationAuthority
  pricingEligibleNow: false
  sourceQuestion: string
  notes: string[]
}

export type SmartQuestionAuthorityGateStatus =
  | "eligible_pricing_candidate"
  | "review_only"
  | "rejected_boundary_conflict"
  | "needs_followup"
  | "stale_scope"

export type SmartQuestionAuthorityGateResult = {
  status: SmartQuestionAuthorityGateStatus
  pricingAuthoritative: false
  pricingEligibleNow: false
  reasons: string[]
}

export type ClassifySmartQuestionAuthorityArgs = {
  clarification: ConfirmedClarification
  question: SmartQuestion
  currentScopeText: string
  scopeSnapshotText?: string | null
}

type ReadinessItem = {
  label: string
  message: string
  details?: string[]
}

type PriceGuardReviewLike = {
  missedScopeWarnings?: string[]
  laborMaterialConfidenceNotes?: string[]
  scopeClarityWarnings?: string[]
  suggestedExclusions?: string[]
  contractorRiskNotes?: string[]
}

type PlanEvidenceStrengthLike = {
  level?: string
  label?: string
  summary?: string | null
  confirmationNeeded?: boolean
  hardQuantityCount?: number
}

export type BuildSmartQuestionsArgs = {
  selectedTrade?: string | null
  scopeText: string
  scopeQualityWarnings?: string[]
  priceGuardReview?: PriceGuardReviewLike | null
  customerOutputReadinessItems?: ReadinessItem[]
  materialsConfirmItems?: string[]
  areaMissingConfirmations?: string[]
  scopeXRayNeedsConfirmation?: string[]
  photoScopeAssist?: {
    missingScopeFlags?: string[]
    suggestedAdditions?: string[]
  } | null
  planEvidenceStrength?: PlanEvidenceStrengthLike | null
  limit?: number
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase()
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function sameNormalizedText(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalize(a) === normalize(b)
}

function gateResult(
  status: SmartQuestionAuthorityGateStatus,
  reasons: string[]
): SmartQuestionAuthorityGateResult {
  return {
    status,
    pricingAuthoritative: false,
    pricingEligibleNow: false,
    reasons,
  }
}

function toEstimatorScopeTrade(trade: string): EstimatorScopeTrade | null {
  switch (trade) {
    case "painting":
    case "drywall":
    case "flooring":
    case "electrical":
    case "plumbing":
    case "bathroom_tile":
    case "wallcovering":
    case "carpentry":
    case "demolition":
    case "glass":
    case "furniture_moving":
      return trade
    default:
      return null
  }
}

function tradeLabel(trade: string): string {
  return trade
    ? trade.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Scope"
}

function normalizeTrade(trade: string | null | undefined, scopeText: string): string {
  const selected = normalize(trade)
  if (selected) return selected
  const text = normalize(scopeText)
  if (/\bpaint|primer|coats?\b/.test(text)) return "painting"
  if (/\bdrywall|sheetrock|texture|patch\b/.test(text)) return "drywall"
  if (/\bfloor|lvp|laminate|carpet|hardwood\b/.test(text)) return "flooring"
  if (/\belectrical|outlet|switch|wiring|fixture|lighting\b/.test(text)) return "electrical"
  if (/\bplumbing|toilet|faucet|sink|drain|valve\b/.test(text)) return "plumbing"
  if (/\btile|shower|waterproof|grout\b/.test(text)) return "bathroom_tile"
  if (/\bwallpaper|wallcovering|wall covering\b/.test(text)) return "wallcovering"
  if (/\bbaseboard|trim|door|carpentry|cabinet\b/.test(text)) return "carpentry"
  return "general_renovation"
}

function questionId(question: Pick<SmartQuestion, "trade" | "dedupeKey">): string {
  return `smart-question:${question.trade}:${question.dedupeKey}`
}

function buildQuestion(
  question: Omit<SmartQuestion, "id">,
): SmartQuestion {
  return {
    ...question,
    id: questionId(question),
  }
}

function collectReviewText(args: BuildSmartQuestionsArgs): string[] {
  return [
    ...(args.scopeQualityWarnings || []),
    ...(args.priceGuardReview?.missedScopeWarnings || []),
    ...(args.priceGuardReview?.laborMaterialConfidenceNotes || []),
    ...(args.priceGuardReview?.scopeClarityWarnings || []),
    ...(args.priceGuardReview?.suggestedExclusions || []),
    ...(args.priceGuardReview?.contractorRiskNotes || []),
    ...(args.customerOutputReadinessItems || []).flatMap((item) => [
      item.label,
      item.message,
      ...(item.details || []),
    ]),
    ...(args.materialsConfirmItems || []),
    ...(args.areaMissingConfirmations || []),
    ...(args.scopeXRayNeedsConfirmation || []),
    ...(args.photoScopeAssist?.missingScopeFlags || []),
    ...(args.photoScopeAssist?.suggestedAdditions || []),
    args.planEvidenceStrength?.summary || "",
    args.planEvidenceStrength?.label || "",
  ].map(clean).filter(Boolean)
}

function addQuestion(
  questions: SmartQuestion[],
  seen: Set<string>,
  question: Omit<SmartQuestion, "id">,
): void {
  const key = question.dedupeKey
  if (seen.has(key)) return
  seen.add(key)
  questions.push(buildQuestion(question))
}

export function buildSmartQuestions(args: BuildSmartQuestionsArgs): SmartQuestion[] {
  const trade = normalizeTrade(args.selectedTrade, args.scopeText)
  const label = tradeLabel(trade)
  const facts = buildEstimatorScopeFacts(args.scopeText)
  const reviewText = collectReviewText(args)
  const reviewBlob = normalize(reviewText.join(" "))
  const questions: SmartQuestion[] = []
  const seen = new Set<string>()

  const hasQuantitySignal = facts.hasQuantityLocationSignal
  const hasMaterialResponsibility = facts.hasMaterialResponsibility
  const hasBoundary = facts.hasExclusionOrByOthersBoundary
  const hasScheduleSignal = /\b(day|days|week|weeks|return|visit|phase|schedule|duration|cure|dry|inspection)\b/.test(
    normalize(args.scopeText)
  )

  if (
    !hasQuantitySignal &&
    (hasAny(reviewBlob, [/\bquantity|quantities|measured|square footage|sqft|linear footage|lf|rooms?|doors?|fixtures?|devices?\b/]) ||
      ["painting", "flooring", "drywall", "wallcovering", "carpentry", "electrical", "plumbing"].includes(trade))
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "quantity",
      prompt: `What is the confirmed ${label.toLowerCase()} quantity for this scope?`,
      helpText: "Use the best confirmed count or measurement you trust. This stays on this screen for estimator review only.",
      source: hasAny(reviewBlob, [/\bquantity|quantities|measured|square footage|sqft|linear footage|lf\b/])
        ? "scope_xray"
        : "trade_default",
      answerType: "number_unit",
      priority: "high",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "quantity",
    })
  }

  if (
    !hasMaterialResponsibility &&
    (hasAny(reviewBlob, [/\bmaterial|materials|fixture|fixtures|allowance|selection|supplied|supply|owner\b/]) ||
      ["electrical", "plumbing", "bathroom_tile", "flooring", "wallcovering"].includes(trade))
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "materials_responsibility",
      prompt: "Who is responsible for supplying the main materials or fixtures?",
      helpText: "This confirms responsibility for review only; the price is unchanged.",
      source: hasAny(reviewBlob, [/\bconfirm.*material|material.*confirm|fixture|allowance|selection\b/])
        ? "materials_confirm_items"
        : "trade_default",
      answerType: "single_choice",
      options: ["Contractor supplied", "Owner supplied", "Allowance only", "Needs follow-up"],
      priority: "high",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "materials_responsibility",
    })
  }

  if (
    hasBoundary ||
    hasAny(reviewBlob, [/\bexclusion|excluded|by others|boundary|not included|owner supplied|existing.*remain\b/])
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "scope_boundary",
      prompt: "Are the exclusions, by-others items, and existing-to-remain boundaries still correct as written?",
      helpText: "Answering this does not add excluded work back into the estimate.",
      source: "customer_output_readiness",
      answerType: "yes_no",
      priority: "high",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "scope_boundary",
    })
  }

  if (
    hasAny(reviewBlob, [/\bprep|preparation|demo|demolition|remove|removal|substrate|patch|repair|hidden damage|condition\b/])
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "demo_prep",
      prompt: "Is demo, prep, repair, or substrate correction included beyond the written scope?",
      helpText: "Condition and prep answers stay estimator-review notes unless the written scope is updated.",
      source: "priceguard_review",
      answerType: "yes_no",
      priority: "medium",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "demo_prep",
    })
  }

  if (
    !hasScheduleSignal &&
    hasAny(reviewBlob, [/\bschedule|duration|return trip|return visit|phase|cure|dry time|inspection|access\b/])
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "schedule",
      prompt: "Are return trips, cure/dry time, inspections, or phased access required?",
      source: "priceguard_review",
      answerType: "yes_no",
      priority: "medium",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "schedule",
    })
  }

  if (hasAny(reviewBlob, [/\bpermit|inspection|code\b/])) {
    addQuestion(questions, seen, {
      trade,
      category: "permit_inspection",
      prompt: "Who is responsible for permits, inspections, or code-related coordination?",
      source: "priceguard_review",
      answerType: "single_choice",
      options: ["Contractor handles", "Owner/GC handles", "Not required", "Needs follow-up"],
      priority: "medium",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "permit_inspection",
    })
  }

  if (
    args.planEvidenceStrength &&
    (args.planEvidenceStrength.confirmationNeeded ||
      args.planEvidenceStrength.level === "review_only" ||
      Number(args.planEvidenceStrength.hardQuantityCount || 0) === 0)
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "photo_plan_review",
      prompt: "Have the plan-supported quantities and scope limits been confirmed by the estimator?",
      helpText: "Plan signals stay estimator-review notes here.",
      source: "plan_intelligence",
      answerType: "yes_no",
      priority: "medium",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "plan_review",
    })
  }

  if (
    (args.photoScopeAssist?.missingScopeFlags || []).length > 0 ||
    (args.photoScopeAssist?.suggestedAdditions || []).length > 0
  ) {
    addQuestion(questions, seen, {
      trade,
      category: "photo_plan_review",
      prompt: "Do the photo-suggested scope notes need to be added to the written scope?",
      helpText: "Photo observations stay review-only unless the written scope is updated.",
      source: "photo_scope_assist",
      answerType: "yes_no",
      priority: "medium",
      canAffectPricingIfConfirmed: false,
      dedupeKey: "photo_review",
    })
  }

  const priorityRank = { high: 0, medium: 1, low: 2 }
  return questions
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, Math.max(0, args.limit ?? 3))
}

export function buildConfirmedClarification(args: {
  question: SmartQuestion
  answer: ConfirmedClarificationAnswer
  answeredAt?: number
}): ConfirmedClarification {
  const notes: string[] = ["Smart Questions keeps all answers out of pricing until a later scoped pricing-authority pass."]
  const answeredAt = args.answeredAt ?? Date.now()
  let authority: ConfirmedClarificationAuthority = "review_only"

  if (args.answer.type === "number_unit") {
    authority =
      Number.isFinite(args.answer.value) && args.answer.value > 0
        ? "user_confirmed_quantity"
        : "needs_followup"
  } else if (args.question.category === "scope_boundary") {
    authority = args.answer.type === "yes_no" && args.answer.value ? "scope_boundary_confirmation" : "needs_followup"
  } else if (args.question.category === "materials_responsibility") {
    authority =
      args.answer.type === "single_choice" && !/needs follow/i.test(args.answer.value)
        ? "materials_confirmation"
        : "needs_followup"
  } else if (args.question.category === "schedule") {
    authority = "schedule_confirmation"
  } else if (args.answer.type === "short_text" && /\b(tbd|maybe|unknown|as needed|not sure)\b/i.test(args.answer.value)) {
    authority = "needs_followup"
  }

  return {
    id: `confirmed-clarification:${args.question.id}:${answeredAt}`,
    questionId: args.question.id,
    answeredAt,
    trade: args.question.trade,
    category: args.question.category,
    answer: args.answer,
    authority,
    pricingEligibleNow: false,
    sourceQuestion: args.question.prompt,
    notes,
  }
}

export function classifySmartQuestionAuthority(
  args: ClassifySmartQuestionAuthorityArgs
): SmartQuestionAuthorityGateResult {
  const { clarification, question } = args

  if (
    args.scopeSnapshotText != null &&
    !sameNormalizedText(args.scopeSnapshotText, args.currentScopeText)
  ) {
    return gateResult("stale_scope", [
      "The typed scope changed after this clarification was answered.",
    ])
  }

  if (clarification.answer.type === "short_text") {
    return gateResult("needs_followup", [
      "Short-text clarifications need estimator review before any future pricing authority.",
    ])
  }

  if (clarification.authority === "needs_followup") {
    return gateResult("needs_followup", [
      "This clarification was marked as needing follow-up.",
    ])
  }

  if (question.category !== "quantity" || clarification.answer.type !== "number_unit") {
    return gateResult("review_only", [
      "Only explicit numeric quantity clarifications can become future pricing candidates.",
    ])
  }

  if (!Number.isFinite(clarification.answer.value) || clarification.answer.value <= 0) {
    return gateResult("needs_followup", [
      "Quantity clarifications must use a positive numeric value.",
    ])
  }

  const scopeFacts = buildEstimatorScopeFacts(args.currentScopeText)
  const trade = toEstimatorScopeTrade(question.trade)
  if (!trade) {
    return gateResult("review_only", [
      "This clarification trade is not specific enough for future pricing authority.",
    ])
  }

  const included = scopeFacts.includedTrades.includes(trade)
  const boundaryOnly =
    scopeFacts.excludedTrades.includes(trade) ||
    scopeFacts.protectionTrades.includes(trade) ||
    scopeFacts.coordinationTrades.includes(trade) ||
    scopeFacts.existingConditionTrades.includes(trade)
  const boundaryText = normalize(scopeFacts.boundaryText)
  const ownerOrCustomerSupplied = /\b(owner|customer)\s*-?\s*supplied\b|\bby owner\b|\bowner to provide\b|\bcustomer to provide\b/.test(
    boundaryText
  )

  if (boundaryOnly || ownerOrCustomerSupplied) {
    return gateResult("rejected_boundary_conflict", [
      "The typed scope contains exclusion, by-others, owner-supplied, protection-only, coordination-only, or existing-to-remain boundary context.",
    ])
  }

  if (!included || !scopeFacts.hasIncludedWork) {
    return gateResult("review_only", [
      "The typed scope does not include matching work for this clarification.",
    ])
  }

  return gateResult("eligible_pricing_candidate", [
    "Positive numeric quantity is tied to currently included typed scope.",
  ])
}
