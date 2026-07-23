export type ProposalReadinessStatus = "ready" | "review" | "blocked"
export type ProposalReadinessTone = "good" | "warning" | "neutral"
export type ProposalReadinessActionTarget = "review_before_sending" | null

export type ProposalReadinessInput = {
  hasResult: boolean
  hasCustomerScopeDriftWarning?: boolean
  customerOutputReadinessItemCount?: number
  hasCriticalCustomerOutputReadinessItem?: boolean
  estimatorReviewStatus?: "ready" | "needs_review" | null
  priceGuardLevel?: "strong" | "review" | "profit_leak" | null
  priceGuardScore?: number | null
  unansweredHighPrioritySmartQuestions?: number
  hasPlanOrPhotoReviewWarning?: boolean
}

export type ProposalReadinessView = {
  status: ProposalReadinessStatus
  label: string
  message: string
  tone: ProposalReadinessTone
  actionLabel: string | null
  actionTarget: ProposalReadinessActionTarget
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

export function buildProposalReadiness(
  input: ProposalReadinessInput
): ProposalReadinessView {
  if (!input.hasResult) {
    return {
      status: "blocked",
      label: "Finish estimate first",
      message: "Generate an estimate before sending or copying the proposal.",
      tone: "neutral",
      actionLabel: null,
      actionTarget: null,
    }
  }

  const reviewReasons: string[] = []
  const readinessCount = Math.max(0, Number(input.customerOutputReadinessItemCount || 0))
  const highPriorityQuestions = Math.max(
    0,
    Number(input.unansweredHighPrioritySmartQuestions || 0)
  )

  if (input.hasCustomerScopeDriftWarning) {
    reviewReasons.push("Scope wording may overpromise unsupported work.")
  } else if (input.hasCriticalCustomerOutputReadinessItem) {
    reviewReasons.push("Customer-facing scope has a critical review item.")
  } else if (readinessCount > 0) {
    reviewReasons.push(
      `${plural(readinessCount, "pre-send item")} ${readinessCount === 1 ? "needs" : "need"} review.`
    )
  }

  if (highPriorityQuestions > 0) {
    reviewReasons.push(`${plural(highPriorityQuestions, "high-priority clarification")} still needs an answer.`)
  }

  if (input.priceGuardLevel === "profit_leak") {
    reviewReasons.push("PriceGuard found possible profit leaks.")
  } else if (
    input.priceGuardLevel === "review" ||
    (input.priceGuardScore != null && input.priceGuardScore < 82)
  ) {
    reviewReasons.push("PriceGuard recommends review before sending.")
  }

  if (input.estimatorReviewStatus === "needs_review" && reviewReasons.length === 0) {
    reviewReasons.push("Estimator review has items to check.")
  }

  if (input.hasPlanOrPhotoReviewWarning && reviewReasons.length === 0) {
    reviewReasons.push("Plan or photo evidence needs confirmation.")
  }

  if (reviewReasons.length > 0) {
    return {
      status: "review",
      label: "Review before sending",
      message: reviewReasons[0],
      tone: "warning",
      actionLabel: "Review items",
      actionTarget: "review_before_sending",
    }
  }

  return {
    status: "ready",
    label: "Ready to send",
    message: "No major pre-send blockers are surfaced. Review once, then send.",
    tone: "good",
    actionLabel: null,
    actionTarget: null,
  }
}
