import test from "node:test"
import assert from "node:assert/strict"

import {
  buildConfirmedClarification,
  buildSmartQuestions,
  classifySmartQuestionAuthority,
  type SmartQuestion,
} from "./smart-questions"
import { buildProposalReadiness } from "./proposal-readiness"

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

test("generic included-surface prose does not manufacture scope-decision metadata", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Repaint two bedrooms.",
    scopeQualityWarnings: ["Confirm exact measured quantities before final approval."],
    priceGuardReview: {
      scopeClarityWarnings: [
        "Painting scope should confirm included surfaces before sending.",
        "Confirm paint/material supply and finish selection responsibility.",
      ],
      missedScopeWarnings: [
        "Masking/protection for adjacent finishes or occupied areas is not clearly stated.",
      ],
    },
    limit: 8,
  })

  assert.equal(questionByCategory(questions, "quantity")?.decision, undefined)
  assert.equal(
    questionByCategory(questions, "materials_responsibility")?.decision?.kind,
    "material_responsibility"
  )
  assert.equal(
    questions.some((question) => question.decision?.subjectKey === "ceilings"),
    false
  )
  assert.equal(
    questions.some((question) => question.decision?.subjectKey === "protection"),
    false
  )
})

test("an actual unresolved boundary warning remains high-priority review work", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText:
      "Paint 1,200 sqft of bedroom walls. Contractor will supply paint.",
    priceGuardReview: {
      scopeClarityWarnings: [
        "Exclusions and by-others responsibilities are not clearly stated.",
      ],
    },
    limit: 8,
  })
  const boundary = questionByCategory(questions, "scope_boundary")

  assert.ok(boundary)
  assert.equal(boundary?.priority, "high")
  assert.equal(boundary?.decision, undefined)
})

test("resolved boundary statements do not create high-priority boundary review", () => {
  const resolvedStatements = [
    "Ceilings are excluded.",
    "Doors are by others.",
    "No allowances are included.",
    "Existing trim is to remain.",
    "Owner will supply finish paint.",
    "Electrical work is not included.",
    "Furniture moving is excluded from this proposal.",
    "Work not specifically described is excluded.",
  ]

  for (const statement of resolvedStatements) {
    const questions = buildSmartQuestions({
      selectedTrade: "painting",
      scopeText:
        "Paint 1,200 sqft of bedroom walls. Contractor will supply paint. Excludes ceilings and trim.",
      priceGuardReview: {
        suggestedExclusions: [statement],
      },
      customerOutputReadinessItems: [
        {
          label: "Assumptions / exclusions",
          message:
            "Confirm these customer-facing boundaries are reflected in the scope or proposal notes before sending.",
          details: [statement],
        },
      ],
      limit: 8,
    })

    assert.equal(
      questionByCategory(questions, "scope_boundary"),
      undefined,
      statement
    )
  }
})

test("ordinary descriptive uses of thin do not create boundary review", () => {
  const descriptiveStatements = [
    "Included cabinet doors have a thin profile.",
    "Included trim has a thin decorative profile.",
  ]

  for (const statement of descriptiveStatements) {
    const questions = buildSmartQuestions({
      selectedTrade: "painting",
      scopeText:
        "Paint 1,200 sqft of bedroom walls. Contractor will supply paint.",
      priceGuardReview: {
        scopeClarityWarnings: [statement],
      },
      limit: 8,
    })

    assert.equal(
      questionByCategory(questions, "scope_boundary"),
      undefined,
      statement
    )
  }
})

test("explicit unresolved boundary messages create one review-only high-priority question", () => {
  const unresolvedMessages = [
    "Exclusions and by-others responsibilities are not clearly stated.",
    "Confirm which work is excluded or completed by others.",
    "Scope boundaries need clarification before sending.",
    "Included and excluded surfaces are not clearly defined.",
    "Allowance responsibility must be confirmed.",
    "Existing-to-remain conditions need clarification.",
    "The proposal does not clearly identify owner-supplied work.",
    "Add clear exclusions for work outside the contractor's scope.",
  ]

  for (const message of unresolvedMessages) {
    const questions = buildSmartQuestions({
      selectedTrade: "painting",
      scopeText:
        "Paint 1,200 sqft of bedroom walls. Contractor will supply paint.",
      priceGuardReview: {
        scopeClarityWarnings: [message],
      },
      limit: 8,
    })
    const boundaries = questions.filter(
      (question) => question.category === "scope_boundary"
    )

    assert.equal(boundaries.length, 1, message)
    assert.equal(boundaries[0].priority, "high", message)
    assert.equal(boundaries[0].decision, undefined, message)
  }
})

test("resolved boundary text cannot borrow action language from an unrelated item", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText:
      "Paint 1,200 sqft of bedroom walls. Contractor will supply paint. Excludes ceilings.",
    priceGuardReview: {
      suggestedExclusions: ["Ceilings are excluded."],
      scopeClarityWarnings: ["Schedule needs confirmation."],
    },
    limit: 8,
  })

  assert.equal(questionByCategory(questions, "scope_boundary"), undefined)
})

test("a clean explicit boundary does not create a permanent high-priority blocker", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText:
      "Paint 1,200 sqft of bedroom walls. Contractor will supply paint. Excludes ceilings and trim.",
    priceGuardReview: {
      suggestedExclusions: [
        "Excludes work not specifically described in the written scope.",
      ],
    },
    limit: 8,
  })

  assert.equal(questionByCategory(questions, "scope_boundary"), undefined)
  assert.equal(
    questions.some((question) => question.priority === "high"),
    false
  )
})

test("an unresolved boundary question remains represented in Proposal Readiness", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText:
      "Paint 1,200 sqft of bedroom walls. Contractor will supply paint.",
    scopeQualityWarnings: [
      "Exclusions and by-others responsibilities are not clearly stated.",
    ],
    limit: 8,
  })
  const unresolvedHighPriorityReviewQuestions = questions.filter(
    (question) => question.priority === "high"
  ).length
  const readiness = buildProposalReadiness({
    hasResult: true,
    customerOutputReadinessItemCount: 0,
    estimatorReviewStatus: "ready",
    priceGuardLevel: "strong",
    priceGuardScore: 92,
    unresolvedHighPriorityReviewQuestions,
    hasPlanOrPhotoReviewWarning: false,
  })

  assert.equal(unresolvedHighPriorityReviewQuestions, 1)
  assert.equal(readiness.status, "review")
  assert.equal(
    readiness.message,
    "1 high-priority review item still needs action."
  )
})

test("generic prep prose remains review-only and does not create repairs metadata", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint bedroom walls.",
    scopeQualityWarnings: ["Preparation requirements need clarification."],
    priceGuardReview: {
      missedScopeWarnings: ["Prep and substrate conditions need review."],
    },
    limit: 8,
  })

  assert.ok(questionByCategory(questions, "demo_prep"))
  assert.equal(
    questions.some((question) => question.decision?.subjectKey === "repairs"),
    false
  )
})

test("generic access and protection prose cannot create responsibility metadata", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint bedroom walls.",
    priceGuardReview: {
      scopeClarityWarnings: [
        "Site access needs review.",
        "Protection for adjacent finishes is not clearly stated.",
      ],
    },
    limit: 8,
  })

  assert.equal(
    questions.some((question) => question.decision?.kind === "access_responsibility"),
    false
  )
})

test("low-confidence AI and plan prose cannot create actionable metadata", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint bedroom walls.",
    photoScopeAssist: {
      missingScopeFlags: [
        "Low-confidence photo observation may show ceiling repair, access, and protection.",
      ],
      suggestedAdditions: ["Consider occupied-area protection."],
    },
    planEvidenceStrength: {
      level: "review_only",
      label: "Low-confidence evidence",
      summary: "Ceilings and access may need review.",
      confirmationNeeded: true,
      hardQuantityCount: 0,
    },
    limit: 8,
  })

  assert.equal(
    questions.filter((question) => question.decision != null).length,
    0
  )
  assert.ok(
    questions.some((question) => question.category === "photo_plan_review")
  )
})

test("generic quantity stays structured for review but is not actionable without basis metadata", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint bedroom walls.",
    scopeQualityWarnings: ["Confirm exact measured quantities."],
    limit: 8,
  })
  const quantity = questionByCategory(questions, "quantity")

  assert.ok(quantity)
  assert.equal(quantity?.answerType, "number_unit")
  assert.equal(quantity?.decision, undefined)
})

test("materials responsibility remains the safe structured actionable question", () => {
  const questions = buildSmartQuestions({
    selectedTrade: "painting",
    scopeText: "Paint bedroom walls.",
    materialsConfirmItems: ["Confirm paint material responsibility."],
    limit: 8,
  })
  const materials = questionByCategory(questions, "materials_responsibility")

  assert.equal(materials?.decision?.kind, "material_responsibility")
  assert.equal(materials?.decision?.subjectKey, "materials")
  assert.equal(materials?.decision?.subjectLabel, "Painting materials")
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
  assert.equal(reviewQuestions.every((question) => question.decision == null), true)
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
      scopeClarityWarnings: [
        "Confirm which excluded work will be completed by others.",
      ],
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
