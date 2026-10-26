import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyStoredSignature,
  pickSyncedSignatureDataUrl,
  renderCustomerSignatureBlockHtml,
  SIGNATURE_UNREADABLE_TEXT,
} from "./approval-signature"
import {
  TINY_JPEG_DATA_URL,
  TINY_PNG_BASE64,
  TINY_PNG_DATA_URL,
} from "../../../tests/fixtures/images/tiny-images"

const normalize = (html: string) => html.replace(/\s+/g, " ").trim()

// Markup copied from the approved branch of downloadPDF() before this change.
const PREVIOUS_VALID_MARKUP = (src: string) => `
  <div style="margin:8px 0 10px;">
    <div style="font-size:11px; color:#333; margin-bottom:4px;">
      Customer Signature
    </div>
    <img
      src="${src}"
      alt="Customer signature"
      style="max-width:220px; max-height:90px; border-bottom:1px solid #111; display:block;"
    />
  </div>
`

const PREVIOUS_ABSENT_MARKUP = `
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

const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64")}`

test("valid: the real PNG renders as one escaped image with the existing markup", () => {
  const state = classifyStoredSignature(TINY_PNG_DATA_URL)
  assert.deepEqual(state, { kind: "valid", src: TINY_PNG_DATA_URL })

  const html = renderCustomerSignatureBlockHtml(state)
  assert.equal(html.split("<img").length - 1, 1)
  assert.ok(html.includes(`src="${TINY_PNG_DATA_URL}"`))
  assert.ok(html.includes("Customer Signature"))
  assert.equal(html.includes(SIGNATURE_UNREADABLE_TEXT), false)
  assert.equal(normalize(html), normalize(PREVIOUS_VALID_MARKUP(TINY_PNG_DATA_URL)))
})

test("invalid but present: every value renders the notice and never the stored value", () => {
  const unreadable: Array<[string, unknown]> = [
    ["attribute breakout", 'x" onerror="alert(1)'],
    ["javascript url", "javascript:alert(1)"],
    ["png with breakout suffix", `${TINY_PNG_DATA_URL}" onerror="alert(1)`],
    ["real jpeg", TINY_JPEG_DATA_URL],
    ["png with leading space", ` ${TINY_PNG_DATA_URL}`],
    ["png with trailing newline", `${TINY_PNG_DATA_URL}\n`],
    ["svg", svgDataUrl],
    ["object", {}],
    ["number", 123],
    ["stringified object", "[object Object]"],
  ]

  for (const [name, value] of unreadable) {
    const state = classifyStoredSignature(value)
    assert.deepEqual(state, { kind: "unreadable" }, name)

    const html = renderCustomerSignatureBlockHtml(state)
    assert.ok(html.includes(SIGNATURE_UNREADABLE_TEXT), `${name}: notice`)
    assert.ok(html.includes("Customer Signature"), `${name}: label`)
    assert.equal(html.includes("<img"), false, `${name}: no image`)
    assert.equal(html.includes("onerror"), false, `${name}: no handler`)
    assert.equal(html.includes("javascript:"), false, `${name}: no javascript url`)
    assert.equal(html.includes(TINY_PNG_BASE64), false, `${name}: no stored payload`)
    if (typeof value === "string") assert.equal(html.includes(value.trim()), false, `${name}: no stored value`)
  }
})

test("absent: missing or blank values keep the existing blank signature lines", () => {
  for (const value of [undefined, null, "", "   ", "\n\t"]) {
    const state = classifyStoredSignature(value)
    assert.deepEqual(state, { kind: "absent" }, JSON.stringify(value))

    const html = renderCustomerSignatureBlockHtml(state)
    assert.equal(normalize(html), normalize(PREVIOUS_ABSENT_MARKUP))
    assert.equal(html.includes(SIGNATURE_UNREADABLE_TEXT), false)
  }
})

test("pickSyncedSignatureDataUrl keeps today's rule: a server string wins verbatim, otherwise local", () => {
  const malicious = 'x" onerror="alert(1)'
  assert.equal(pickSyncedSignatureDataUrl(TINY_PNG_DATA_URL, undefined), TINY_PNG_DATA_URL)
  assert.equal(pickSyncedSignatureDataUrl(malicious, TINY_PNG_DATA_URL), malicious)
  assert.equal(pickSyncedSignatureDataUrl("", TINY_PNG_DATA_URL), "")
  assert.equal(pickSyncedSignatureDataUrl(null, TINY_PNG_DATA_URL), TINY_PNG_DATA_URL)
  assert.equal(pickSyncedSignatureDataUrl(undefined, TINY_PNG_DATA_URL), TINY_PNG_DATA_URL)
  assert.equal(pickSyncedSignatureDataUrl(42, undefined), undefined)
})

test("post-sync: the synced value survives a localStorage-style round trip with its state intact", () => {
  const malicious = 'x" onerror="alert(1)'
  const cases: Array<{ server: unknown; local: string | undefined; expected: "valid" | "unreadable" | "absent" }> = [
    { server: malicious, local: TINY_PNG_DATA_URL, expected: "unreadable" },
    { server: TINY_PNG_DATA_URL, local: undefined, expected: "valid" },
    { server: TINY_PNG_DATA_URL, local: malicious, expected: "valid" },
    { server: null, local: TINY_PNG_DATA_URL, expected: "valid" },
    { server: null, local: undefined, expected: "absent" },
    { server: "", local: TINY_PNG_DATA_URL, expected: "absent" },
  ]

  for (const { server, local, expected } of cases) {
    const synced = pickSyncedSignatureDataUrl(server, local)
    const persisted = JSON.parse(JSON.stringify({ signatureDataUrl: synced })).signatureDataUrl
    const state = classifyStoredSignature(persisted)
    assert.equal(state.kind, expected, `${String(server)} / ${String(local)}`)
    if (expected !== "valid") {
      assert.equal(renderCustomerSignatureBlockHtml(state).includes("<img"), false)
    }
  }
})
