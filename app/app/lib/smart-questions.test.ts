import test from "node:test"
import assert from "node:assert/strict"

import {
  buildConfirmedClarification,
  buildSmartQuestions,
  type SmartQuestion,
} from "./smart-questions"

function questionByCategory(questions: SmartQuestion[], category: string) {
  return questions.find((question) => question.category === category)
}

test("buildSmartQuestions caps and dedupes high-value questions", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint walls in rooms 101-104. Flooring by others.",
    scopeQualityWarnings: [
      "Material responsibility or allowance language is not clear.",
      "Material responsibility or allowance language is not clear.",
      "Confirm exact measured quantities before final approval.",
    ],
    priceGuardReview: {
      missedScopeWarnings: [
        "Prep or demolition expectations are not clearly stated.",
        "Cleanup, debris removal, or disposal is not clearly addressed.",
      ],
      suggestedExclusions: ["Excludes flooring by others."],
    },
    customerOutputReadinessItems: [
      {
        label: "Assumptions / exclusions",
        message: "Confirm these customer-facing boundaries are reflected.",
        details: ["Excludes flooring by others."],
      },
    ],
    materialsConfirmItems: ["Confirm paint material allowance."],
    limit: 3,
  })

  assert.equal(questions.length, 3)
  assert.equal(new Set(questions.map((question) => question.dedupeKey)).size, questions.length)
  assert.ok(questionByCategory(questions, "materials_responsibility"))
  assert.ok(questionByCategory(questions, "scope_boundary"))
  assert.equal(questions.every((question) => question.canAffectPricingIfConfirmed === false), true)
})

test("typed quantity and material responsibility prevent duplicate default questions", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "flooring",
    scopeText: "Install 650 sqft LVP flooring. Owner supplied flooring materials.",
    scopeQualityWarnings: [],
    priceGuardReview: null,
    limit: 3,
  })

  assert.equal(questionByCategory(questions, "quantity"), undefined)
  assert.equal(questionByCategory(questions, "materials_responsibility"), undefined)
})

test("plan and photo signals remain review-oriented questions", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint guest rooms per selected sheets.",
    photoScopeAssist: {
      missingScopeFlags: ["Photos suggest ceiling work may exist but scope does not mention it."],
      suggestedAdditions: [],
    },
    planEvidenceStrength: {
      level: "review_only",
      label: "Review-only plan evidence",
      summary: "Selected sheets need confirmation.",
      confirmationNeeded: true,
      hardQuantityCount: 0,
    },
    limit: 3,
  })

  const reviewQuestions = questions.filter((question) => question.category === "photo_plan_review")
  assert.ok(reviewQuestions.length >= 1)
  assert.equal(reviewQuestions.every((question) => question.canAffectPricingIfConfirmed === false), true)
})

test("confirmed numeric quantity is structured but not pricing-eligible in V1", () => {
  const [question] = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint walls.",
    scopeQualityWarnings: ["Confirm exact measured quantities before final approval."],
    limit: 1,
  })

  const answer = buildConfirmedClarification({
    question,
    answer: { type: "number_unit", value: 1200, unit: "sqft" },
    answeredAt: 1,
  })

  assert.equal(answer.authority, "user_confirmed_quantity")
  assert.equal(answer.pricingEligibleNow, false)
})

test("boundary and ambiguous answers never become pricing-eligible", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint walls. Drywall by others.",
    priceGuardReview: {
      suggestedExclusions: ["Excludes drywall by others."],
    },
    limit: 3,
  })
  const question = questionByCategory(questions, "scope_boundary")
  assert.ok(question)

  const boundaryAnswer = buildConfirmedClarification({
    question,
    answer: { type: "yes_no", value: true },
    answeredAt: 1,
  })

  assert.equal(boundaryAnswer.authority, "scope_boundary_confirmation")
  assert.equal(boundaryAnswer.pricingEligibleNow, false)

  const ambiguousAnswer = buildConfirmedClarification({
    question: { ...question, category: "demo_prep" },
    answer: { type: "short_text", value: "as needed" },
    answeredAt: 2,
  })

  assert.equal(ambiguousAnswer.authority, "needs_followup")
  assert.equal(ambiguousAnswer.pricingEligibleNow, false)
})
