import { escapeHtmlAttribute, isSafePngSignatureDataUrl, safePdfImgTag } from "../../lib/safe-image-data-url"

// Proposed wording (HANDOFF.md T1, decision 3).
export const SIGNATURE_UNREADABLE_TEXT = "Signature on file could not be displayed"

export type StoredSignatureState =
  | { kind: "valid"; src: string }
  | { kind: "unreadable" }
  | { kind: "absent" }

// Validates the value exactly as stored (no trimming), so an unreadable signature
// is never mistaken for a missing one.
export function classifyStoredSignature(value: unknown): StoredSignatureState {
  if (value === undefined || value === null) return { kind: "absent" }
  if (typeof value !== "string") return { kind: "unreadable" }
  if (value.trim() === "") return { kind: "absent" }
  return isSafePngSignatureDataUrl(value) ? { kind: "valid", src: value } : { kind: "unreadable" }
}

const SIGNATURE_LABEL_HTML = `
                <div style="font-size:11px; color:#333; margin-bottom:4px;">
                  Customer Signature
                </div>`

// The signature fragment inside the approved branch of the PDF's Customer Approval
// block. Only the valid state ever puts the stored value into HTML.
export function renderCustomerSignatureBlockHtml(state: StoredSignatureState): string {
  if (state.kind === "valid") {
    return `
              <div style="margin:8px 0 10px;">${SIGNATURE_LABEL_HTML}
                ${safePdfImgTag(state.src, "signature", {
                  alt: "Customer signature",
                  style: "max-width:220px; max-height:90px; border-bottom:1px solid #111; display:block;",
                })}
              </div>
            `
  }

  if (state.kind === "unreadable") {
    return `
              <div style="margin:8px 0 10px;">${SIGNATURE_LABEL_HTML}
                <div style="font-size:12px; color:#444;">${escapeHtmlAttribute(SIGNATURE_UNREADABLE_TEXT)}</div>
              </div>
            `
  }

  return `
              <div class="approvalGrid">
                <div class="approvalField">
                  <div class="approvalLine"></div>
                  <div class="approvalHint">Customer Signature</div>
                </div>

                <div class="approvalField">
                  <div class="approvalLine"></div>
                  <div class="approvalHint">Date</div>
                </div>
              </div>
            `
}

// Approval sync rule, unchanged: a server string wins verbatim, otherwise keep the local value.
export function pickSyncedSignatureDataUrl(
  serverValue: unknown,
  localValue: string | undefined
): string | undefined {
  return typeof serverValue === "string" ? serverValue : localValue
}
