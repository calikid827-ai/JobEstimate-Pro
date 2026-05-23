import test from "node:test"
import assert from "node:assert/strict"

import {
  buildConfirmedClarification,
  buildSmartQuestions,
  classifySmartQuestionAuthority,
  type SmartQuestion,
} from "./smart-questions"

function questionByCategory(questions: SmartQuestion[], category: string) {
  return questions.find((question) => question.category === category)
}

function makeQuestion(overrides: Partial<SmartQuestion> = {}): SmartQuestion {
  return {
    id: "smart-question:painting:quantity",
    trade: "painting",
    category: "quantity",
    prompt: "What is the confirmed painting quantity?",
    source: "trade_default",
    answerType: "number_unit",
    priority: "high",
    canAffectPricingIfConfirmed: false,
    dedupeKey: "quantity",
    ...overrides,
  }
}

function answerQuestion(
  question: SmartQuestion,
  answer: Parameters<typeof buildConfirmedClarification>[0]["answer"]
) {
  return buildConfirmedClarification({
    question,
    answer,
    answeredAt: 1,
  })
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

test("authority gate allows positive numeric quantity for current included scope as future candidate only", () => {
  const question = makeQuestion()
  const clarification = answerQuestion(question, { type: "number_unit", value: 1200, unit: "sqft" })
  const gate = classifySmartQuestionAuthority({
    question,
    clarification,
    currentScopeText: "Paint office walls.",
    scopeSnapshotText: "Paint office walls.",
  })

  assert.equal(gate.status, "eligible_pricing_candidate")
  assert.equal(gate.pricingAuthoritative, false)
  assert.equal(gate.pricingEligibleNow, false)
  assert.equal(clarification.pricingEligibleNow, false)
})

test("authority gate rejects numeric quantity when the related trade is boundary-only", () => {
  const question = makeQuestion({
    id: "smart-question:drywall:quantity",
    trade: "drywall",
    prompt: "What is the confirmed drywall quantity?",
  })
  const clarification = answerQuestion(question, { type: "number_unit", value: 300, unit: "sqft" })
  const gate = classifySmartQuestionAuthority({
    question,
    clarification,
    currentScopeText: "Paint office walls. Drywall by others.",
    scopeSnapshotText: "Paint office walls. Drywall by others.",
  })

  assert.equal(gate.status, "rejected_boundary_conflict")
  assert.equal(gate.pricingAuthoritative, false)
  assert.equal(gate.pricingEligibleNow, false)
})

test("authority gate keeps boundary and material confirmations review-only", () => {
  const boundaryQuestion = makeQuestion({
    category: "scope_boundary",
    answerType: "yes_no",
    prompt: "Are exclusions still correct?",
    source: "customer_output_readiness",
    dedupeKey: "scope_boundary",
  })
  const materialQuestion = makeQuestion({
    category: "materials_responsibility",
    answerType: "single_choice",
    prompt: "Who supplies materials?",
    source: "materials_confirm_items",
    dedupeKey: "materials_responsibility",
  })

  const boundaryGate = classifySmartQuestionAuthority({
    question: boundaryQuestion,
    clarification: answerQuestion(boundaryQuestion, { type: "yes_no", value: true }),
    currentScopeText: "Paint office walls. Flooring by others.",
    scopeSnapshotText: "Paint office walls. Flooring by others.",
  })
  const materialGate = classifySmartQuestionAuthority({
    question: materialQuestion,
    clarification: answerQuestion(materialQuestion, {
      type: "single_choice",
      value: "Contractor supplied",
    }),
    currentScopeText: "Install flooring.",
    scopeSnapshotText: "Install flooring.",
  })

  assert.equal(boundaryGate.status, "review_only")
  assert.equal(materialGate.status, "review_only")
  assert.equal(boundaryGate.pricingEligibleNow, false)
  assert.equal(materialGate.pricingEligibleNow, false)
})

test("authority gate keeps schedule demo prep permit and photo plan answers review-only", () => {
  const categories: Array<SmartQuestion["category"]> = [
    "schedule",
    "demo_prep",
    "permit_inspection",
    "photo_plan_review",
  ]

  for (const category of categories) {
    const question = makeQuestion({
      category,
      answerType: "yes_no",
      prompt: `Confirm ${category}`,
      dedupeKey: category,
      source: category === "photo_plan_review" ? "plan_intelligence" : "priceguard_review",
    })
    const gate = classifySmartQuestionAuthority({
      question,
      clarification: answerQuestion(question, { type: "yes_no", value: true }),
      currentScopeText: "Paint office walls.",
      scopeSnapshotText: "Paint office walls.",
    })

    assert.equal(gate.status, "review_only")
    assert.equal(gate.pricingEligibleNow, false)
  }
})

test("authority gate marks ambiguous short text as needs followup", () => {
  const question = makeQuestion({
    category: "demo_prep",
    answerType: "short_text",
    prompt: "What prep is included?",
    dedupeKey: "demo_prep",
  })
  const clarification = answerQuestion(question, { type: "short_text", value: "as needed" })
  const gate = classifySmartQuestionAuthority({
    question,
    clarification,
    currentScopeText: "Paint office walls.",
    scopeSnapshotText: "Paint office walls.",
  })

  assert.equal(gate.status, "needs_followup")
  assert.equal(gate.pricingEligibleNow, false)
  assert.equal(clarification.pricingEligibleNow, false)
})

test("authority gate rejects stale scope snapshots before considering pricing candidacy", () => {
  const question = makeQuestion()
  const clarification = answerQuestion(question, { type: "number_unit", value: 1200, unit: "sqft" })
  const gate = classifySmartQuestionAuthority({
    question,
    clarification,
    currentScopeText: "Paint office walls. Drywall by others.",
    scopeSnapshotText: "Paint office walls.",
  })

  assert.equal(gate.status, "stale_scope")
  assert.equal(gate.pricingAuthoritative, false)
  assert.equal(gate.pricingEligibleNow, false)
  assert.equal(clarification.pricingEligibleNow, false)
})
