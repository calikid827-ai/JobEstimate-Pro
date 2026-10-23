import {
  buildEstimatorScopeFacts,
  type EstimatorScopeFacts,
} from "../../../../app/lib/estimator-scope-facts"
import type { DocumentPurpose } from "../../../../lib/document-purpose"

export type DescriptionPolishInput = {
  description: string
  documentType: string
  trade: string
  documentPurpose?: DocumentPurpose
  scopeText: string
  scopeFacts?: EstimatorScopeFacts | null
}

export function buildAuthoritativeScopeContext(
  args: Pick<DescriptionPolishInput, "scopeText" | "scopeFacts">
): string {
  const facts = args.scopeFacts ?? buildEstimatorScopeFacts(args.scopeText)
  const authoritativeScope = facts.rawText.trim() || args.scopeText.trim()

  return `AUTHORITATIVE WRITTEN SCOPE:
${authoritativeScope}

EXISTING SCOPE FACTS:
${JSON.stringify({
  includedWork: facts.includedWorkText,
  includedTrades: facts.includedTrades,
  boundaries: facts.boundaryText,
  excludedTrades: facts.excludedTrades,
  clauses: facts.clauses,
  explicitCoordinationClauses: facts.clauses.filter((clause) => clause.coordinationOnly).map((clause) => clause.text),
  materialResponsibilityClauses: facts.clauses.filter((clause) => clause.ownerSupplied || clause.customerSupplied || clause.contractorSupplied).map((clause) => clause.text),
  patchTextureIncluded: facts.patchTextureIncluded,
}, null, 2)}`
}

// The generated paragraph is a draft to edit, not authority for new work.
// Reuse the same written-scope facts that constrained initial generation.
export function buildDescriptionPolishPrompt(args: DescriptionPolishInput): string {
  return `
You are a licensed U.S. construction project manager rewriting scope language for a formal contract document.

TASK:
Rewrite the draft description to improve clarity, sequencing language, and contractual tone while respecting the authoritative written scope and its boundaries below.

REQUIREMENTS:
- The authoritative written scope controls. The generated draft and selected trade category cannot establish additional work or responsibility.
- Do NOT add work. Preserve the meaning and level of detail of supported work, but omit unsupported work or trade-coordination commitments from the draft.
- Preserve exclusions, by-others boundaries, material responsibilities, and uncertainty; do not convert them to included installation or coordination work.
- A generic materials/fixtures supply statement assigns procurement responsibility only. It does not establish plumbing, electrical work, fixture installation, or coordination with those trades.
- Included trade labels summarize scope clauses; they do not independently authorize separate subcontractors or coordination obligations.
- Painting patching, surface preparation, and drying between coats are sequencing of included work. Do not turn those steps into coordination with outside drywall or other trades.
- Preserve genuine included plumbing/electrical work and explicit coordination boundaries when supported by the written scope. Do not assume excluded/by-others work includes contractor coordination.
- Do NOT mention pricing or costs.
- Do NOT introduce guarantees or warranties.
- Avoid vague phrases such as "as needed".
- Avoid banned phrases: ensure, industry standards, quality standards, compliance, durability, aesthetic appeal.
- Keep professional contract-ready tone.
- Preserve supported sequencing language (demo, prep, drying, explicitly supported coordination, etc).
- Preserve the original level of supported detail and approximate length (do not shorten supported content).
- Preserve paragraph breaks and any lists/newlines.
- Only improve clarity/contract tone; do not compress supported work.
- Do NOT remove supported sequencing steps or merge multiple steps into one sentence.
- Opening sentence must still begin with:
  "This ${args.documentType}"
${args.documentPurpose === "Estimate"
  ? "- The contractor explicitly selected Estimate. Do not assert that this work changes an existing contract or is an additional charge to an original contract. Preserve legitimate scope exclusions and references."
  : args.documentPurpose === "Change Order"
    ? "- The contractor explicitly selected Change Order. Retain that document purpose."
    : ""}

SELECTED TRADE CATEGORY (not independent evidence of work):
${args.trade}

${buildAuthoritativeScopeContext(args)}

GENERATED DRAFT TO EDIT (not scope authority):
${args.description.trim()}

Return ONLY the rewritten paragraph.
`
}
