import type {
  SmartQuestion,
  SmartQuestionDecisionKind,
  SmartQuestionDecisionMetadata,
  SmartQuestionDecisionSubject,
  SmartQuestionQuantityBasis,
  SmartQuestionQuantityUnit,
} from "./smart-questions"

export type ScopeDecisionChoice =
  | "include"
  | "exclude"
  | "by_others"
  | "site_confirmation"
  | "contractor_supplied"
  | "owner_supplied"
  | "confirm_later"
  | "confirm_quantity"

export type ScopeDecisionQuantityUnit = SmartQuestionQuantityUnit

export type ScopeDecisionChoiceOption = {
  value: ScopeDecisionChoice
  label: string
}

export type ScopeDecisionSelection = {
  choice: ScopeDecisionChoice | ""
  quantity?: number | null
  unit?: ScopeDecisionQuantityUnit
}

export type ActionableScopeDecision = {
  id: string
  questionId: string
  trade: string
  category: SmartQuestion["category"]
  kind: SmartQuestionDecisionKind
  subjectKey: SmartQuestionDecisionSubject
  subjectLabel: string
  prompt: string
  helpText: string
  priority: SmartQuestion["priority"]
  choices: ScopeDecisionChoiceOption[]
  quantityUnit: ScopeDecisionQuantityUnit | null
  quantityBasis: SmartQuestionQuantityBasis | null
  quantityBasisLabel: string | null
}

export type ScopeDecisionWordingOwnership = {
  sentence: string
  insertionStart: number
  insertionEnd: number
  scopeTextAfterApply: string
}

export type ApplyScopeDecisionWordingResult = {
  scopeText: string
  changed: boolean
  status: "applied" | "replaced" | "duplicate" | "ownership_lost"
  ownership: ScopeDecisionWordingOwnership | null
}

const ELIGIBLE_CATEGORIES = new Set<SmartQuestion["category"]>([
  "quantity",
  "included_surfaces",
  "materials_responsibility",
  "scope_boundary",
])

const PRIORITY_RANK: Record<SmartQuestion["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const KIND_RANK: Record<SmartQuestionDecisionKind, number> = {
  scope_boundary: 0,
  quantity: 1,
  material_responsibility: 2,
  access_responsibility: 3,
}

const SUBJECT_RANK: Record<SmartQuestionDecisionSubject, number> = {
  ceilings: 0,
  trim_and_baseboards: 1,
  doors_and_frames: 2,
  closets: 3,
  repairs: 4,
  quantity: 5,
  materials: 6,
  furniture_moving: 7,
  protection: 8,
  access: 9,
  occupied_areas: 10,
}

const SCOPE_BOUNDARY_CHOICES: ScopeDecisionChoiceOption[] = [
  { value: "include", label: "Include" },
  { value: "exclude", label: "Exclude" },
  { value: "by_others", label: "By others" },
  { value: "site_confirmation", label: "Needs site confirmation" },
]

const MATERIAL_CHOICES: ScopeDecisionChoiceOption[] = [
  { value: "contractor_supplied", label: "Contractor supplied" },
  { value: "owner_supplied", label: "Owner supplied" },
  { value: "confirm_later", label: "Confirm later" },
]

const QUANTITY_CHOICES: ScopeDecisionChoiceOption[] = [
  { value: "confirm_quantity", label: "Confirm quantity" },
  { value: "site_confirmation", label: "Needs site confirmation" },
]

const SAFE_SCOPE_BOUNDARIES: Partial<
  Record<SmartQuestionDecisionSubject, string>
> = {
  ceilings: "Ceiling preparation and painting",
  trim_and_baseboards: "Trim, baseboard, and casing preparation and painting",
  doors_and_frames: "Door and frame preparation and painting",
  closets: "Closet interior painting",
}

const QUANTITY_BASIS: Record<
  SmartQuestionQuantityBasis,
  {
    decisionLabel: string
    measurementLabel: string
    unit: SmartQuestionQuantityUnit
  }
> = {
  wall_area: {
    decisionLabel: "Wall area",
    measurementLabel: "wall area",
    unit: "sqft",
  },
  floor_area: {
    decisionLabel: "Floor area",
    measurementLabel: "floor area",
    unit: "sqft",
  },
  ceiling_area: {
    decisionLabel: "Ceiling area",
    measurementLabel: "ceiling area",
    unit: "sqft",
  },
  linear_scope: {
    decisionLabel: "Linear scope",
    measurementLabel: "linear scope",
    unit: "linear_ft",
  },
  door_count: {
    decisionLabel: "Door count",
    measurementLabel: "doors",
    unit: "each",
  },
  fixture_count: {
    decisionLabel: "Fixture count",
    measurementLabel: "fixtures",
    unit: "each",
  },
  room_count: {
    decisionLabel: "Room count",
    measurementLabel: "rooms",
    unit: "rooms",
  },
  unit_count: {
    decisionLabel: "Unit count",
    measurementLabel: "units",
    unit: "each",
  },
}

function titleCaseTrade(trade: string) {
  return trade
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function safeDecisionMetadata(
  question: SmartQuestion,
  metadata: SmartQuestionDecisionMetadata
): {
  subjectLabel: string
  choices: ScopeDecisionChoiceOption[]
  quantityUnit: ScopeDecisionQuantityUnit | null
  quantityBasis: SmartQuestionQuantityBasis | null
  quantityBasisLabel: string | null
} | null {
  if (
    metadata.kind === "material_responsibility" &&
    metadata.subjectKey === "materials" &&
    question.category === "materials_responsibility"
  ) {
    return {
      subjectLabel: `${titleCaseTrade(question.trade)} materials`,
      choices: MATERIAL_CHOICES,
      quantityUnit: null,
      quantityBasis: null,
      quantityBasisLabel: null,
    }
  }

  if (
    metadata.kind === "scope_boundary" &&
    (question.category === "included_surfaces" ||
      question.category === "scope_boundary")
  ) {
    const subjectLabel = SAFE_SCOPE_BOUNDARIES[metadata.subjectKey]
    if (!subjectLabel) return null
    return {
      subjectLabel,
      choices: SCOPE_BOUNDARY_CHOICES,
      quantityUnit: null,
      quantityBasis: null,
      quantityBasisLabel: null,
    }
  }

  if (
    metadata.kind === "quantity" &&
    metadata.subjectKey === "quantity" &&
    question.category === "quantity" &&
    metadata.quantityBasis &&
    metadata.quantityUnit
  ) {
    const basis = QUANTITY_BASIS[metadata.quantityBasis]
    if (!basis || basis.unit !== metadata.quantityUnit) return null
    return {
      subjectLabel: basis.decisionLabel,
      choices: QUANTITY_CHOICES,
      quantityUnit: basis.unit,
      quantityBasis: metadata.quantityBasis,
      quantityBasisLabel: basis.measurementLabel,
    }
  }

  return null
}

function decisionPrompt(
  kind: SmartQuestionDecisionKind,
  subjectLabel: string
): string {
  if (kind === "material_responsibility") {
    return "Who will supply the main materials or fixtures?"
  }
  if (kind === "quantity") {
    return `What confirmed quantity should be used for ${subjectLabel.toLowerCase()}?`
  }
  return `How should ${subjectLabel.toLowerCase()} be handled?`
}

function decisionHelpText(kind: SmartQuestionDecisionKind): string {
  if (kind === "quantity") {
    return "Enter only a quantity you trust, or require field confirmation."
  }
  return "Choose a boundary, review the exact sentence, then apply it to the typed scope."
}

function compareDecisions(a: ActionableScopeDecision, b: ActionableScopeDecision) {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    SUBJECT_RANK[a.subjectKey] - SUBJECT_RANK[b.subjectKey] ||
    a.id.localeCompare(b.id)
  )
}

export function prioritizeActionableScopeDecisions(
  decisions: ActionableScopeDecision[],
  limit = 3
): ActionableScopeDecision[] {
  const deduped = new Map<string, ActionableScopeDecision>()

  for (const decision of [...decisions].sort(compareDecisions)) {
    const key = `${decision.trade}:${decision.subjectKey}`
    if (!deduped.has(key)) deduped.set(key, decision)
  }

  return [...deduped.values()]
    .sort(compareDecisions)
    .slice(0, Math.max(0, limit))
}

export function buildActionableScopeDecisions(
  questions: SmartQuestion[],
  limit = 3
): ActionableScopeDecision[] {
  const decisions = questions.flatMap<ActionableScopeDecision>((question) => {
    const metadata = question.decision
    if (!metadata || !ELIGIBLE_CATEGORIES.has(question.category)) return []

    const safeMetadata = safeDecisionMetadata(question, metadata)
    if (!safeMetadata) return []

    return [
      {
        id: `scope-decision:${question.id}`,
        questionId: question.id,
        trade: question.trade,
        category: question.category,
        kind: metadata.kind,
        subjectKey: metadata.subjectKey,
        subjectLabel: safeMetadata.subjectLabel,
        prompt: decisionPrompt(metadata.kind, safeMetadata.subjectLabel),
        helpText: decisionHelpText(metadata.kind),
        priority: question.priority,
        choices: safeMetadata.choices,
        quantityUnit: safeMetadata.quantityUnit,
        quantityBasis: safeMetadata.quantityBasis,
        quantityBasisLabel: safeMetadata.quantityBasisLabel,
      },
    ]
  })

  return prioritizeActionableScopeDecisions(decisions, limit)
}

function sentenceCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function materialSubject(trade: string) {
  switch (trade) {
    case "painting":
      return "paint and standard painting materials"
    case "drywall":
      return "drywall and finishing materials"
    case "flooring":
      return "finish flooring materials"
    case "electrical":
      return "electrical fixtures and finish devices"
    case "plumbing":
      return "plumbing fixtures and finish materials"
    case "bathroom_tile":
      return "tile and finish materials"
    case "wallcovering":
      return "wallcovering materials"
    case "carpentry":
      return "finish carpentry materials"
    default:
      return "the main materials and fixtures listed in this scope"
  }
}

function scopeBoundaryWording(
  subjectKey: SmartQuestionDecisionSubject,
  subjectLabel: string,
  choice: ScopeDecisionChoice
): string | null {
  if (subjectKey === "ceilings") {
    if (choice === "include") return "Includes ceiling preparation and painting."
    if (choice === "exclude") return "Excludes ceiling preparation and painting."
    if (choice === "by_others") {
      return "Ceiling work will be completed by others and is excluded from this proposal."
    }
    if (choice === "site_confirmation") {
      return "Ceiling conditions and scope require field confirmation before work begins; changes may require a revised estimate."
    }
  }

  if (subjectKey === "trim_and_baseboards") {
    if (choice === "include") {
      return "Includes preparation and painting of the confirmed trim, baseboards, and casings."
    }
    if (choice === "exclude") {
      return "Excludes trim, baseboard, and casing preparation and painting."
    }
    if (choice === "by_others") {
      return "Trim, baseboard, and casing work will be completed by others and is excluded from this proposal."
    }
    if (choice === "site_confirmation") {
      return "Trim, baseboard, and casing conditions and scope require field confirmation before work begins; changes may require a revised estimate."
    }
  }

  if (subjectKey === "doors_and_frames") {
    if (choice === "include") {
      return "Includes preparation and painting of the confirmed doors and frames."
    }
    if (choice === "exclude") {
      return "Excludes door and frame preparation and painting."
    }
  }

  if (subjectKey === "closets") {
    if (choice === "include") return "Includes painting closet interiors."
    if (choice === "exclude") return "Closet interiors are excluded from this scope."
  }

  if (choice === "by_others") {
    return `${sentenceCase(subjectLabel)} will be completed by others and is excluded from this proposal.`
  }
  if (choice === "site_confirmation") {
    return `${sentenceCase(subjectLabel)} requires field confirmation before work begins; changes may require a revised estimate.`
  }

  return null
}

function formatQuantityUnit(unit: ScopeDecisionQuantityUnit) {
  if (unit === "sqft") return "sq ft"
  if (unit === "linear_ft") return "linear ft"
  return unit
}

function formatQuantityMeasure(
  quantityLabel: string,
  unit: ScopeDecisionQuantityUnit,
  basis: SmartQuestionQuantityBasis,
  basisLabel: string
) {
  if (
    basis === "door_count" ||
    basis === "fixture_count" ||
    basis === "room_count" ||
    basis === "unit_count"
  ) {
    return `${quantityLabel} ${basisLabel}`
  }
  return `${quantityLabel} ${formatQuantityUnit(unit)} of ${basisLabel}`
}

export function buildScopeDecisionWording(
  decision: ActionableScopeDecision,
  selection: ScopeDecisionSelection
): string | null {
  if (!selection.choice) return null
  if (!decision.choices.some((choice) => choice.value === selection.choice)) return null

  if (decision.kind === "scope_boundary") {
    return scopeBoundaryWording(
      decision.subjectKey,
      decision.subjectLabel,
      selection.choice
    )
  }

  if (decision.kind === "material_responsibility") {
    const subject = materialSubject(decision.trade)
    if (selection.choice === "contractor_supplied") {
      return `Contractor will supply ${subject}.`
    }
    if (selection.choice === "owner_supplied") {
      return `Owner will supply ${subject}. Material quantities, delivery timing, and product suitability must be confirmed before work begins.`
    }
    if (selection.choice === "confirm_later") {
      return `Material responsibility for ${subject} must be confirmed before materials are ordered.`
    }
    return null
  }

  if (
    decision.kind === "quantity" &&
    decision.quantityUnit &&
    decision.quantityBasis &&
    decision.quantityBasisLabel
  ) {
    if (selection.choice === "site_confirmation") {
      return `${sentenceCase(decision.quantityBasisLabel)} requires field confirmation before work begins; changes may require a revised estimate.`
    }
    if (
      selection.choice !== "confirm_quantity" ||
      (selection.unit && selection.unit !== decision.quantityUnit)
    ) {
      return null
    }

    const quantity = Number(selection.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return null

    const quantityLabel = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(quantity)
    const measure = formatQuantityMeasure(
      quantityLabel,
      decision.quantityUnit,
      decision.quantityBasis,
      decision.quantityBasisLabel
    )
    return `Scope is based on approximately ${measure}, subject to field verification.`
  }

  return null
}

export function normalizeScopeWhitespace(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalizeEquivalentWording(value: string) {
  return normalizeScopeWhitespace(value).toLowerCase()
}

function containsEquivalentWording(scopeText: string, wording: string): boolean {
  const normalizedWording = normalizeEquivalentWording(wording)
  if (!normalizedWording) return false

  const normalizedLines = String(scopeText || "")
    .split(/\r?\n/)
    .map(normalizeEquivalentWording)
    .filter(Boolean)
  if (normalizedLines.includes(normalizedWording)) return true

  const normalizedSentences = String(scopeText || "")
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(normalizeEquivalentWording)
    .filter(Boolean)

  return Boolean(normalizedSentences?.includes(normalizedWording))
}

function buildOwnership(
  scopeText: string,
  sentence: string,
  insertionStart: number
): ScopeDecisionWordingOwnership {
  return {
    sentence,
    insertionStart,
    insertionEnd: insertionStart + sentence.length,
    scopeTextAfterApply: scopeText,
  }
}

function ownedWordingRange(
  scopeText: string,
  ownership: ScopeDecisionWordingOwnership
): { start: number; end: number } | null {
  if (scopeText !== ownership.scopeTextAfterApply) return null
  if (
    scopeText.slice(ownership.insertionStart, ownership.insertionEnd) !==
    ownership.sentence
  ) {
    return null
  }
  return { start: ownership.insertionStart, end: ownership.insertionEnd }
}

export function isScopeDecisionWordingOwned(
  scopeText: string,
  ownership: ScopeDecisionWordingOwnership
) {
  return ownedWordingRange(scopeText, ownership) != null
}

export function applyScopeDecisionWording(args: {
  scopeText: string
  wording: string
  previousOwnership?: ScopeDecisionWordingOwnership | null
}): ApplyScopeDecisionWordingResult {
  const wording = String(args.wording || "").trim()
  if (!wording) {
    return {
      scopeText: args.scopeText,
      changed: false,
      status: "duplicate",
      ownership: null,
    }
  }

  if (args.previousOwnership) {
    const ownedRange = ownedWordingRange(args.scopeText, args.previousOwnership)
    if (!ownedRange) {
      return {
        scopeText: args.scopeText,
        changed: false,
        status: "ownership_lost",
        ownership: args.previousOwnership,
      }
    }

    if (
      normalizeEquivalentWording(args.previousOwnership.sentence) ===
      normalizeEquivalentWording(wording)
    ) {
      return {
        scopeText: args.scopeText,
        changed: false,
        status: "duplicate",
        ownership: args.previousOwnership,
      }
    }

    const scopeWithoutPrevious =
      args.scopeText.slice(0, ownedRange.start) +
      args.scopeText.slice(ownedRange.end)
    if (containsEquivalentWording(scopeWithoutPrevious, wording)) {
      return {
        scopeText: scopeWithoutPrevious,
        changed: true,
        status: "replaced",
        ownership: null,
      }
    }

    const scopeText =
      args.scopeText.slice(0, ownedRange.start) +
      wording +
      args.scopeText.slice(ownedRange.end)
    return {
      scopeText,
      changed: true,
      status: "replaced",
      ownership: buildOwnership(scopeText, wording, ownedRange.start),
    }
  }

  if (containsEquivalentWording(args.scopeText, wording)) {
    return {
      scopeText: args.scopeText,
      changed: false,
      status: "duplicate",
      ownership: null,
    }
  }

  const separator =
    !args.scopeText || args.scopeText.endsWith("\n") ? "" : "\n"
  const insertionStart = args.scopeText.length + separator.length
  const scopeText = `${args.scopeText}${separator}${wording}`
  return {
    scopeText,
    changed: true,
    status: "applied",
    ownership: buildOwnership(scopeText, wording, insertionStart),
  }
}
