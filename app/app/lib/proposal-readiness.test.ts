import test from "node:test"
import assert from "node:assert/strict"

import { buildProposalReadiness } from "./proposal-readiness"

test("buildProposalReadiness blocks sending language until an estimate exists", () => {
  const readiness = buildProposalReadiness({
    hasResult: false,
  })

  assert.equal(readiness.status, "blocked")
  assert.equal(readiness.label, "Finish estimate first")
  assert.equal(readiness.actionTarget, null)
})

test("buildProposalReadiness sends unsupported scope warnings to review", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    hasCustomerScopeDriftWarning: true,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.label, "Review before sending")
  assert.equal(readiness.message, "Scope wording may overpromise unsupported work.")
  assert.equal(readiness.actionLabel, "Review items")
  assert.equal(readiness.actionTarget, "review_before_sending")
})

test("buildProposalReadiness summarizes customer output readiness items", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    customerOutputReadinessItemCount: 2,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.message, "2 pre-send items need review.")
})

test("buildProposalReadiness prioritizes critical customer output readiness items", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    hasCriticalCustomerOutputReadinessItem: true,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.label, "Review before sending")
  assert.equal(readiness.message, "Customer-facing scope has a critical review item.")
  assert.equal(readiness.actionTarget, "review_before_sending")
})

test("buildProposalReadiness uses singular customer output readiness wording", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    customerOutputReadinessItemCount: 1,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.message, "1 pre-send item needs review.")
})

test("buildProposalReadiness treats unanswered high-priority questions as review work", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    unansweredHighPrioritySmartQuestions: 1,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.message, "1 high-priority review item still needs action.")
})

test("buildProposalReadiness keeps selected but unapplied scope decisions in review", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    unresolvedHighPriorityScopeDecisions: 1,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.label, "Review before sending")
  assert.equal(readiness.message, "1 high-priority review item still needs action.")
})

test("buildProposalReadiness keeps non-actionable high-priority questions in review", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    unresolvedHighPriorityReviewQuestions: 2,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.label, "Review before sending")
  assert.equal(readiness.message, "2 high-priority review items still need action.")
})

test("buildProposalReadiness prioritizes stale estimator inputs over clean readiness", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    hasUnregeneratedScopeChanges: true,
    customerOutputReadinessItemCount: 0,
    estimatorReviewStatus: "ready",
    priceGuardLevel: "strong",
    priceGuardScore: 92,
    unresolvedHighPriorityReviewQuestions: 1,
    hasPlanOrPhotoReviewWarning: false,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.label, "Regenerate before sending")
  assert.equal(
    readiness.message,
    "Estimator inputs changed after this proposal was generated."
  )
})

test("buildProposalReadiness prioritizes stale estimator inputs over ordinary review reasons", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    hasUnregeneratedScopeChanges: true,
    hasCustomerScopeDriftWarning: true,
    customerOutputReadinessItemCount: 4,
    priceGuardLevel: "profit_leak",
    unresolvedHighPriorityScopeDecisions: 2,
    unresolvedHighPriorityReviewQuestions: 3,
  })

  assert.equal(readiness.label, "Regenerate before sending")
  assert.equal(
    readiness.message,
    "Estimator inputs changed after this proposal was generated."
  )
})

test("buildProposalReadiness is conservative for weak PriceGuard signals", () => {
  const review = buildProposalReadiness({
    hasResult: true,
    priceGuardLevel: "review",
    priceGuardScore: 80,
  })
  const profitLeak = buildProposalReadiness({
    hasResult: true,
    priceGuardLevel: "profit_leak",
    priceGuardScore: 55,
  })

  assert.equal(review.status, "review")
  assert.equal(review.message, "PriceGuard recommends review before sending.")
  assert.equal(profitLeak.status, "review")
  assert.equal(profitLeak.message, "PriceGuard found possible profit leaks.")
})

test("buildProposalReadiness falls back to estimator review status", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    customerOutputReadinessItemCount: 0,
    estimatorReviewStatus: "needs_review",
    priceGuardLevel: "strong",
    priceGuardScore: 92,
    unansweredHighPrioritySmartQuestions: 0,
    hasPlanOrPhotoReviewWarning: false,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.message, "Estimator review has items to check.")
  assert.equal(readiness.actionTarget, "review_before_sending")
})

test("buildProposalReadiness falls back to plan or photo review warnings", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    customerOutputReadinessItemCount: 0,
    estimatorReviewStatus: "ready",
    priceGuardLevel: "strong",
    priceGuardScore: 92,
    unansweredHighPrioritySmartQuestions: 0,
    hasPlanOrPhotoReviewWarning: true,
  })

  assert.equal(readiness.status, "review")
  assert.equal(readiness.message, "Plan or photo evidence needs confirmation.")
  assert.equal(readiness.actionTarget, "review_before_sending")
})

test("buildProposalReadiness returns ready only when existing review signals are clean", () => {
  const readiness = buildProposalReadiness({
    hasResult: true,
    customerOutputReadinessItemCount: 0,
    estimatorReviewStatus: "ready",
    priceGuardLevel: "strong",
    priceGuardScore: 92,
    unresolvedHighPriorityReviewQuestions: 0,
    hasPlanOrPhotoReviewWarning: false,
    hasUnregeneratedScopeChanges: false,
  })

  assert.equal(readiness.status, "ready")
  assert.equal(readiness.label, "Ready to send")
  assert.equal(readiness.actionTarget, null)
})
