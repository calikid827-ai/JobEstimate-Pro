import { buildEstimatorScopeFacts } from "./estimator-scope-facts"

export type TypedScopeClause = {
  text: string
  includedWork: boolean
  excludedByOthers: boolean
  protectionOnly: boolean
  coordinationOnly: boolean
  existingCondition: boolean
  materialResponsibility: boolean
  permitResponsibility: boolean
  quantityLocationSignal: boolean
}

export type TypedScopeNormalization = {
  normalizedText: string
  includedWorkText: string
  boundaryText: string
  clauses: TypedScopeClause[]
  hasIncludedWork: boolean
  hasExclusionOrByOthersBoundary: boolean
  hasMaterialResponsibility: boolean
  hasPermitResponsibility: boolean
  hasQuantityLocationSignal: boolean
}

export function normalizeTypedScope(scope: string): TypedScopeNormalization {
  const facts = buildEstimatorScopeFacts(scope)

  return {
    normalizedText: facts.normalizedText,
    includedWorkText: facts.includedWorkText,
    boundaryText: facts.boundaryText,
    clauses: facts.clauses.map((clause) => ({
      text: clause.text,
      includedWork: clause.includedWork,
      excludedByOthers: clause.excludedByOthers,
      protectionOnly: clause.protectionOnly,
      coordinationOnly: clause.coordinationOnly,
      existingCondition: clause.existingCondition,
      materialResponsibility:
        clause.ownerSupplied ||
        clause.customerSupplied ||
        clause.contractorSupplied ||
        /\b(allowance|material selection|finish selection|materials? included|include materials?)\b/.test(clause.text),
      permitResponsibility: clause.permitInspection,
      quantityLocationSignal: clause.quantityLocation,
    })),
    hasIncludedWork: facts.hasIncludedWork,
    hasExclusionOrByOthersBoundary: facts.hasExclusionOrByOthersBoundary,
    hasMaterialResponsibility: facts.hasMaterialResponsibility,
    hasPermitResponsibility: facts.hasPermitResponsibility,
    hasQuantityLocationSignal: facts.hasQuantityLocationSignal,
  }
}
