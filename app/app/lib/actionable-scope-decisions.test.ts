import test from "node:test"
import assert from "node:assert/strict"

import {
  applyScopeDecisionWording,
  buildActionableScopeDecisions,
  buildScopeDecisionWording,
  isScopeDecisionWordingOwned,
  type ActionableScopeDecision,
} from "./actionable-scope-decisions"
import type {
  SmartQuestion,
  SmartQuestionDecisionMetadata,
} from "./smart-questions"

function makeQuestion(args: {
  id: string
  category?: SmartQuestion["category"]
  priority?: SmartQuestion["priority"]
  trade?: string
  decision?: SmartQuestionDecisionMetadata
  prompt?: string
  helpText?: string
}): SmartQuestion {
  return {
    id: args.id,
    trade: args.trade || "painting",
    category: args.category || "included_surfaces",
    prompt: args.prompt || "Review this scope item.",
    helpText: args.helpText,
    source: "priceguard_review",
    answerType: "single_choice",
    priority: args.priority || "high",
    canAffectPricingIfConfirmed: false,
    dedupeKey: args.id,
    decision: args.decision,
  }
}

function buildDecision(
  decision: SmartQuestionDecisionMetadata,
  overrides: Partial<Parameters<typeof makeQuestion>[0]> = {}
): ActionableScopeDecision {
  const [result] = buildActionableScopeDecisions([
    makeQuestion({
      id: overrides.id || `question:${decision.subjectKey}`,
      category: overrides.category,
      priority: overrides.priority,
      trade: overrides.trade,
      decision,
    }),
  ])
  assert.ok(result)
  return result
}

function ceilingDecision() {
  return buildDecision({
    kind: "scope_boundary",
    subjectKey: "ceilings",
    subjectLabel: "Untrusted caller label is ignored",
  })
}

test("buildActionableScopeDecisions uses deterministic priority and caps output at three", () => {
  const decisions = buildActionableScopeDecisions([
    makeQuestion({
      id: "b-materials",
      category: "materials_responsibility",
      decision: {
        kind: "material_responsibility",
        subjectKey: "materials",
        subjectLabel: "Painting materials",
      },
    }),
    makeQuestion({
      id: "a-quantity",
      category: "quantity",
      decision: {
        kind: "quantity",
        subjectKey: "quantity",
        subjectLabel: "Wall area",
        quantityBasis: "wall_area",
        quantityUnit: "sqft",
      },
    }),
    makeQuestion({
      id: "c-ceilings",
      decision: {
        kind: "scope_boundary",
        subjectKey: "ceilings",
        subjectLabel: "Ceilings",
      },
    }),
    makeQuestion({
      id: "d-doors",
      decision: {
        kind: "scope_boundary",
        subjectKey: "doors_and_frames",
        subjectLabel: "Doors",
      },
    }),
  ])

  assert.deepEqual(
    decisions.map((decision) => decision.subjectKey),
    ["ceilings", "doors_and_frames", "quantity"]
  )
})

test("buildActionableScopeDecisions dedupes by trade and subject with stable tie-breaking", () => {
  const metadata: SmartQuestionDecisionMetadata = {
    kind: "scope_boundary",
    subjectKey: "ceilings",
    subjectLabel: "Ceilings",
  }
  const decisions = buildActionableScopeDecisions([
    makeQuestion({ id: "z-question", decision: metadata }),
    makeQuestion({ id: "a-question", decision: metadata }),
  ])

  assert.equal(decisions.length, 1)
  assert.equal(decisions[0].questionId, "a-question")
})

test("buildActionableScopeDecisions excludes unstructured and deferred subjects", () => {
  const decisions = buildActionableScopeDecisions([
    makeQuestion({ id: "unstructured" }),
    makeQuestion({
      id: "repairs",
      category: "demo_prep",
      decision: {
        kind: "scope_boundary",
        subjectKey: "repairs",
        subjectLabel: "Repairs beyond minor nail-hole patching",
      },
    }),
    makeQuestion({
      id: "access",
      category: "access_condition",
      decision: {
        kind: "access_responsibility",
        subjectKey: "access",
        subjectLabel: "Access equipment",
      },
    }),
    makeQuestion({
      id: "protection",
      category: "access_condition",
      decision: {
        kind: "access_responsibility",
        subjectKey: "protection",
        subjectLabel: "Protection",
      },
    }),
  ])

  assert.deepEqual(decisions, [])
})

test("explicit structured scope subjects use canonical deterministic wording", () => {
  const decision = ceilingDecision()

  assert.equal(decision.subjectLabel, "Ceiling preparation and painting")
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "include" }),
    "Includes ceiling preparation and painting."
  )
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "exclude" }),
    "Excludes ceiling preparation and painting."
  )
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "by_others" }),
    "Ceiling work will be completed by others and is excluded from this proposal."
  )
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "site_confirmation" }),
    "Ceiling conditions and scope require field confirmation before work begins; changes may require a revised estimate."
  )
})

test("all retained door and closet choices produce matching boundary wording", () => {
  const doors = buildDecision({
    kind: "scope_boundary",
    subjectKey: "doors_and_frames",
    subjectLabel: "Doors",
  })
  const closets = buildDecision({
    kind: "scope_boundary",
    subjectKey: "closets",
    subjectLabel: "Closets",
  })

  assert.equal(
    buildScopeDecisionWording(doors, { choice: "include" }),
    "Includes preparation and painting of the confirmed doors and frames."
  )
  assert.equal(
    buildScopeDecisionWording(doors, { choice: "exclude" }),
    "Excludes door and frame preparation and painting."
  )
  assert.match(
    buildScopeDecisionWording(doors, { choice: "by_others" }) || "",
    /will be completed by others/
  )
  assert.equal(
    buildScopeDecisionWording(closets, { choice: "include" }),
    "Includes painting closet interiors."
  )
  assert.equal(
    buildScopeDecisionWording(closets, { choice: "exclude" }),
    "Closet interiors are excluded from this scope."
  )
  assert.match(
    buildScopeDecisionWording(closets, { choice: "site_confirmation" }) || "",
    /requires field confirmation/
  )
})

test("material responsibility wording states responsibility without pricing claims", () => {
  const decision = buildDecision(
    {
      kind: "material_responsibility",
      subjectKey: "materials",
      subjectLabel: "Painting materials",
    },
    { category: "materials_responsibility" }
  )

  assert.equal(
    buildScopeDecisionWording(decision, { choice: "contractor_supplied" }),
    "Contractor will supply paint and standard painting materials."
  )
  const ownerSupplied = buildScopeDecisionWording(decision, {
    choice: "owner_supplied",
  })
  assert.equal(
    ownerSupplied,
    "Owner will supply paint and standard painting materials. Material quantities, delivery timing, and product suitability must be confirmed before work begins."
  )
  assert.doesNotMatch(ownerSupplied || "", /pricing|allowance/i)
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "confirm_later" }),
    "Material responsibility for paint and standard painting materials must be confirmed before materials are ordered."
  )
})

test("trusted quantity metadata identifies the basis and fixed unit", () => {
  const decision = buildDecision(
    {
      kind: "quantity",
      subjectKey: "quantity",
      subjectLabel: "AI confidence 0.31 internal quantity guess",
      quantityBasis: "wall_area",
      quantityUnit: "sqft",
    },
    { category: "quantity" }
  )

  assert.equal(decision.subjectLabel, "Wall area")
  assert.equal(
    decision.prompt,
    "What confirmed quantity should be used for wall area?"
  )
  assert.equal(decision.quantityUnit, "sqft")
  assert.equal(
    buildScopeDecisionWording(decision, {
      choice: "confirm_quantity",
      quantity: 1200,
      unit: "sqft",
    }),
    "Scope is based on approximately 1,200 sq ft of wall area, subject to field verification."
  )
  assert.equal(
    buildScopeDecisionWording(decision, { choice: "site_confirmation" }),
    "Wall area requires field confirmation before work begins; changes may require a revised estimate."
  )
})

test("trusted count metadata uses canonical labels and measurement wording", () => {
  const decision = buildDecision(
    {
      kind: "quantity",
      subjectKey: "quantity",
      subjectLabel: "Internal fixture guess",
      quantityBasis: "door_count",
      quantityUnit: "each",
    },
    { category: "quantity" }
  )

  assert.equal(decision.subjectLabel, "Door count")
  assert.equal(
    decision.prompt,
    "What confirmed quantity should be used for door count?"
  )
  assert.equal(
    buildScopeDecisionWording(decision, {
      choice: "confirm_quantity",
      quantity: 12,
      unit: "each",
    }),
    "Scope is based on approximately 12 doors, subject to field verification."
  )
})

test("generic or mismatched quantity metadata cannot guess a unit from trade", () => {
  const decisions = buildActionableScopeDecisions([
    makeQuestion({
      id: "generic-painting-quantity",
      category: "quantity",
      trade: "painting",
      decision: {
        kind: "quantity",
        subjectKey: "quantity",
        subjectLabel: "Painting quantity",
      },
    }),
    makeQuestion({
      id: "mismatched-wall-unit",
      category: "quantity",
      trade: "painting",
      decision: {
        kind: "quantity",
        subjectKey: "quantity",
        subjectLabel: "Wall area",
        quantityBasis: "wall_area",
        quantityUnit: "each",
      },
    }),
  ])

  assert.deepEqual(decisions, [])
})

test("duplicate detection accepts exact normalized lines and sentences", () => {
  const lineScope = "Paint bedroom walls.\nIncludes ceiling preparation and painting."
  const lineResult = applyScopeDecisionWording({
    scopeText: lineScope,
    wording: "Includes   ceiling preparation and painting.",
  })
  const sentenceScope = "Paint walls. Includes ceiling preparation and painting."
  const sentenceResult = applyScopeDecisionWording({
    scopeText: sentenceScope,
    wording: "Includes ceiling preparation and painting.",
  })

  assert.equal(lineResult.status, "duplicate")
  assert.equal(lineResult.ownership, null)
  assert.equal(sentenceResult.status, "duplicate")
  assert.equal(sentenceResult.ownership, null)
})

test("embedded partial wording is not treated as an exact duplicate", () => {
  const scope =
    "Owner notes that the proposal includes ceiling preparation and painting only if separately approved."
  const result = applyScopeDecisionWording({
    scopeText: scope,
    wording: "Includes ceiling preparation and painting.",
  })

  assert.equal(result.status, "applied")
  assert.equal(result.changed, true)
  assert.ok(result.ownership)
  assert.equal(
    result.scopeText,
    `${scope}\nIncludes ceiling preparation and painting.`
  )
})

test("existing identical contractor wording is never claimed or replaced", () => {
  const scope = "Paint walls.\nIncludes ceiling preparation and painting."
  const duplicate = applyScopeDecisionWording({
    scopeText: scope,
    wording: "Includes ceiling preparation and painting.",
  })

  assert.equal(duplicate.changed, false)
  assert.equal(duplicate.ownership, null)

  const laterChoice = applyScopeDecisionWording({
    scopeText: duplicate.scopeText,
    wording: "Excludes ceiling preparation and painting.",
    previousOwnership: duplicate.ownership,
  })
  assert.equal(laterChoice.status, "applied")
  assert.equal(
    laterChoice.scopeText,
    `${scope}\nExcludes ceiling preparation and painting.`
  )
})

test("unchanged feature-owned wording can be replaced at its recorded range", () => {
  const first = applyScopeDecisionWording({
    scopeText: "Paint walls.",
    wording: "Includes ceiling preparation and painting.",
  })
  assert.ok(first.ownership)

  const replacement = applyScopeDecisionWording({
    scopeText: first.scopeText,
    wording: "Excludes ceiling preparation and painting.",
    previousOwnership: first.ownership,
  })

  assert.equal(replacement.status, "replaced")
  assert.equal(
    replacement.scopeText,
    "Paint walls.\nExcludes ceiling preparation and painting."
  )
  assert.ok(replacement.ownership)
  assert.equal(
    isScopeDecisionWordingOwned(replacement.scopeText, replacement.ownership!),
    true
  )
})

test("any manual scope change causes ownership loss without changing scope", () => {
  const first = applyScopeDecisionWording({
    scopeText: "Paint walls.",
    wording: "Includes ceiling preparation and painting.",
  })
  assert.ok(first.ownership)

  const manuallyChangedScopes = [
    `Contractor note.\n${first.scopeText}`,
    `${first.scopeText}\nContractor note.`,
    "Paint walls.",
    "Paint walls.\nIncludes ceiling preparation and painting after color approval.",
    "Includes ceiling preparation and painting.\nPaint walls.",
    "Paint walls. Contractor note.\nIncludes ceiling preparation and painting.",
  ]

  for (const scopeText of manuallyChangedScopes) {
    const replacement = applyScopeDecisionWording({
      scopeText,
      wording: "Excludes ceiling preparation and painting.",
      previousOwnership: first.ownership,
    })

    assert.equal(replacement.status, "ownership_lost")
    assert.equal(replacement.changed, false)
    assert.equal(replacement.scopeText, scopeText)
    assert.equal(replacement.ownership, first.ownership)
  }
})

test("deleted wording recreated elsewhere is never reclaimed or replaced", () => {
  const first = applyScopeDecisionWording({
    scopeText: "Paint walls.",
    wording: "Includes ceiling preparation and painting.",
  })
  assert.ok(first.ownership)

  const contractorScope =
    "Paint walls. Contractor added this note.\nIncludes ceiling preparation and painting."
  const replacement = applyScopeDecisionWording({
    scopeText: contractorScope,
    wording: "Excludes ceiling preparation and painting.",
    previousOwnership: first.ownership,
  })

  assert.equal(replacement.status, "ownership_lost")
  assert.equal(replacement.changed, false)
  assert.equal(replacement.scopeText, contractorScope)
  assert.equal(replacement.ownership, first.ownership)
})

test("raw diagnostic prose cannot enter deterministic wording", () => {
  const rawText = "AI confidence 0.42 says margin risk and plan evidence are weak."
  const decision = buildDecision(
    {
      kind: "material_responsibility",
      subjectKey: "materials",
      subjectLabel: rawText,
    },
    {
      category: "materials_responsibility",
      prompt: rawText,
      helpText: rawText,
    }
  )
  const wording = buildScopeDecisionWording(decision, {
    choice: "contractor_supplied",
  })

  assert.equal(wording?.includes(rawText), false)
  assert.equal(
    wording,
    "Contractor will supply paint and standard painting materials."
  )
})
