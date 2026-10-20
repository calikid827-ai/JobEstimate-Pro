export type DocumentPurpose = "Estimate" | "Change Order"

export const DOCUMENT_PURPOSE_CONFLICT_MESSAGE =
  "The generated description conflicts with the selected Estimate purpose by describing an additional change to an existing contract. Review the scope and generate again, or select Change Order for intentional additional contract work."

// Validate assertions about this document's contractual effect, rather than
// deleting sentences. References to contracts, exclusions, and added physical
// work are valid scope details and do not establish additive document intent.
export function validateGeneratedDocumentPurpose(
  text: string,
  purpose: DocumentPurpose | undefined
):
  | { ok: true }
  | { ok: false; code: "DOCUMENT_PURPOSE_CONFLICT"; message: string } {
  if (purpose !== "Estimate") return { ok: true }

  // An AI opening label is not intent. The caller may synchronize that label
  // to the explicit purpose, but must validate the remainder before using it.
  const body = text.replace(
    /^\s*This\s+(?:Change\s+Order\s*(?:\/|or)\s*Estimate|Estimate\s*(?:\/|or)\s*Change\s+Order|Change\s+Order|Estimate)\b/i,
    "This document"
  )
  const contract = String.raw`(?:(?:the|any|an?)\s+)?(?:original|existing|current|previous)\s+(?:contract|contractual\s+scope|agreement)`
  const subject = String.raw`\b(?:this|the|proposed|requested)\s+(?:document|work|scope|change|estimate|proposal)\b`
  const additive = new RegExp(
    `${subject}\\s+(?:(?:is|are|will\\s+be|constitutes?|represents?)\\s+(?:(?:intended|proposed)\\s+to\\s+be\\s+)?(?:an?\\s+)?(?:additional|additive|extra|supplemental)(?:\\s+or\\s+corrective)?(?:\\s+(?:work|charge|cost))?\\s+(?:to|beyond|outside|under)|(?:adds?|will\\s+add)\\s+to)\\s+${contract}\\b`,
    "i"
  )
  const modification = new RegExp(
    `${subject}\\s+(?:(?:modifies|amends|revises)|will\\s+(?:modify|amend|revise))\\s+${contract}\\b`,
    "i"
  )
  const priorExclusion = new RegExp(
    `${subject}\\s+(?:is|was|are|were)\\s+(?:not\\s+(?:previously\\s+)?included\\s+(?:in|under)|outside)\\s+${contract}\\b`,
    "i"
  )

  if (additive.test(body) || modification.test(body) || priorExclusion.test(body)) {
    return {
      ok: false,
      code: "DOCUMENT_PURPOSE_CONFLICT",
      message: DOCUMENT_PURPOSE_CONFLICT_MESSAGE,
    }
  }
  return { ok: true }
}
