import assert from "node:assert/strict"
import test from "node:test"
import { loadImage } from "@napi-rs/canvas"

import {
  escapeHtmlAttribute,
  isSafeLogoDataUrl,
  isSafePngSignatureDataUrl,
  LOGO_MAX_DECODED_BYTES,
  safePdfImgTag,
  SIGNATURE_MAX_DECODED_BYTES,
  SIGNATURE_MAX_DIMENSION_PX,
  SIGNATURE_MAX_ENCODED_CHARS,
  SIGNATURE_MIN_DECODED_BYTES,
} from "./safe-image-data-url"
import {
  TINY_GIF_BASE64,
  TINY_GIF_DATA_URL,
  TINY_JPEG_BASE64,
  TINY_JPEG_DATA_URL,
  TINY_PNG_BASE64,
  TINY_PNG_DATA_URL,
  TINY_WEBP_BASE64,
  TINY_WEBP_DATA_URL,
} from "../../tests/fixtures/images/tiny-images"

// Synthetic PNG-shaped bytes (signature + IHDR header + zero filler). Not a decodable
// image; used only for size and dimension bounds.
function syntheticPngDataUrl(args: { totalBytes: number; width?: number; height?: number; chunkType?: string }) {
  const bytes = Buffer.alloc(args.totalBytes)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write(args.chunkType ?? "IHDR", 12, "latin1")
  bytes.writeUInt32BE(args.width ?? 1, 16)
  bytes.writeUInt32BE(args.height ?? 1, 20)
  return `data:image/png;base64,${bytes.toString("base64")}`
}

function syntheticJpegDataUrl(totalBytes: number) {
  const bytes = Buffer.alloc(totalBytes)
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(bytes, 0)
  return `data:image/jpeg;base64,${bytes.toString("base64")}`
}

function replaceCharAt(value: string, index: number, char: string) {
  return value.slice(0, index) + char + value.slice(index + 1)
}

const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
).toString("base64")}`

const realFixtures = [
  { mime: "image/png", base64: TINY_PNG_BASE64, dataUrl: TINY_PNG_DATA_URL, magic: "89504e470d0a1a0a" },
  { mime: "image/jpeg", base64: TINY_JPEG_BASE64, dataUrl: TINY_JPEG_DATA_URL, magic: "ffd8ff" },
  { mime: "image/gif", base64: TINY_GIF_BASE64, dataUrl: TINY_GIF_DATA_URL, magic: "47494638" },
  { mime: "image/webp", base64: TINY_WEBP_BASE64, dataUrl: TINY_WEBP_DATA_URL, magic: "52494646" },
]

test("fixture integrity: each real tiny image decodes as 1x1 and matches its declared type", async () => {
  for (const fixture of realFixtures) {
    const bytes = Buffer.from(fixture.base64, "base64")
    assert.equal(bytes.toString("base64"), fixture.base64, `${fixture.mime} fixture is canonical base64`)
    assert.ok(bytes.subarray(0, fixture.magic.length / 2).toString("hex") === fixture.magic, `${fixture.mime} magic bytes`)
    if (fixture.mime === "image/webp") assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP")
    assert.ok(fixture.dataUrl.startsWith(`data:${fixture.mime};base64,`))
    const image = await loadImage(bytes)
    assert.equal(image.width, 1, `${fixture.mime} width`)
    assert.equal(image.height, 1, `${fixture.mime} height`)
  }
})

test("signature: the real tiny PNG is accepted", () => {
  assert.equal(isSafePngSignatureDataUrl(TINY_PNG_DATA_URL), true)
})

test("signature: synthetic PNG at the decoded-size cap and at the dimension cap is accepted", () => {
  assert.equal(isSafePngSignatureDataUrl(syntheticPngDataUrl({ totalBytes: SIGNATURE_MAX_DECODED_BYTES })), true)
  assert.equal(
    isSafePngSignatureDataUrl(
      syntheticPngDataUrl({ totalBytes: 100, width: SIGNATURE_MAX_DIMENSION_PX, height: SIGNATURE_MAX_DIMENSION_PX })
    ),
    true
  )
})

// At the proposed values the encoded cap is exactly 4/3 of the decoded cap, so one byte
// over is caught by whichever size check runs first.
test("signature: synthetic PNG one byte over the size cap or under the minimum is rejected", () => {
  assert.equal(isSafePngSignatureDataUrl(syntheticPngDataUrl({ totalBytes: SIGNATURE_MAX_DECODED_BYTES + 1 })), false)
  assert.equal(isSafePngSignatureDataUrl(syntheticPngDataUrl({ totalBytes: SIGNATURE_MIN_DECODED_BYTES - 1 })), false)
})

test("signature: synthetic payload over the encoded cap is rejected without decoding", () => {
  const originalAtob = globalThis.atob
  let decodeCalls = 0
  globalThis.atob = (data: string) => {
    decodeCalls++
    return originalAtob(data)
  }
  try {
    const oversized = `data:image/png;base64,${TINY_PNG_BASE64.slice(0, 4).repeat(SIGNATURE_MAX_ENCODED_CHARS / 4 + 1)}`
    assert.equal(isSafePngSignatureDataUrl(oversized), false)
    assert.equal(decodeCalls, 0)
  } finally {
    globalThis.atob = originalAtob
  }
})

test("signature: malformed, malicious, and wrong-type values are rejected", () => {
  const payload = TINY_PNG_BASE64
  const rejected: Array<[string, unknown]> = [
    ["empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["number", 123],
    ["object", {}],
    ["array", [TINY_PNG_DATA_URL]],
    ["javascript url", "javascript:alert(1)"],
    ["empty payload", "data:image/png;base64,"],
    ["attribute breakout", 'x" onerror="alert(1)'],
    ["valid png with breakout suffix", `${TINY_PNG_DATA_URL}" onerror="alert(1)`],
    ["real jpeg", TINY_JPEG_DATA_URL],
    ["svg", svgDataUrl],
    ["uppercase prefix", `DATA:IMAGE/PNG;BASE64,${payload}`],
    ["extra parameter", `data:image/png;charset=utf-8;base64,${payload}`],
    ["leading space", ` ${TINY_PNG_DATA_URL}`],
    ["trailing space", `${TINY_PNG_DATA_URL} `],
    ["trailing newline", `${TINY_PNG_DATA_URL}\n`],
    ["embedded newline", `data:image/png;base64,${payload.slice(0, 40)}\n${payload.slice(40)}`],
    ["url-safe dash", `data:image/png;base64,${replaceCharAt(payload, 10, "-")}`],
    ["url-safe underscore", `data:image/png;base64,${replaceCharAt(payload, 10, "_")}`],
    ["illegal character", `data:image/png;base64,${replaceCharAt(payload, 10, "!")}`],
    ["percent encoding", `data:image/png;base64,${replaceCharAt(payload, 10, "%")}`],
    ["bad length abc", "data:image/png;base64,abc"],
    ["bad length new", "data:image/png;base64,new"],
    ["padding in the middle", `data:image/png;base64,${replaceCharAt(payload, 8, "=")}`],
    ["jpeg bytes behind png prefix", `data:image/png;base64,${TINY_JPEG_BASE64}`],
    ["png signature without IHDR", syntheticPngDataUrl({ totalBytes: 100, chunkType: "IDAT" })],
    ["width 0", syntheticPngDataUrl({ totalBytes: 100, width: 0 })],
    ["height 0", syntheticPngDataUrl({ totalBytes: 100, height: 0 })],
    ["width over cap", syntheticPngDataUrl({ totalBytes: 100, width: SIGNATURE_MAX_DIMENSION_PX + 1 })],
    ["height over cap", syntheticPngDataUrl({ totalBytes: 100, height: SIGNATURE_MAX_DIMENSION_PX + 1 })],
  ]
  for (const [name, value] of rejected) {
    assert.equal(isSafePngSignatureDataUrl(value), false, name)
  }
})

test("logo: real tiny PNG, JPEG, GIF, and WebP images are accepted", () => {
  for (const fixture of realFixtures) {
    assert.equal(isSafeLogoDataUrl(fixture.dataUrl), true, fixture.mime)
  }
})

test("logo: unsupported, mismatched, oversized, and injected values are rejected", () => {
  const rejected: Array<[string, unknown]> = [
    ["svg", svgDataUrl],
    ["avif prefix", `data:image/avif;base64,${TINY_PNG_BASE64}`],
    ["non-canonical jpg mime", `data:image/jpg;base64,${TINY_JPEG_BASE64}`],
    ["png prefix with jpeg bytes", `data:image/png;base64,${TINY_JPEG_BASE64}`],
    ["jpeg prefix with png bytes", `data:image/jpeg;base64,${TINY_PNG_BASE64}`],
    ["gif prefix with webp bytes", `data:image/gif;base64,${TINY_WEBP_BASE64}`],
    ["synthetic jpeg one byte over the size cap", syntheticJpegDataUrl(LOGO_MAX_DECODED_BYTES + 1)],
    ["quote injection", `${TINY_PNG_DATA_URL}" onload="alert(1)`],
    ["leading space", ` ${TINY_PNG_DATA_URL}`],
    ["https url", "https://example.test/logo.png"],
    ["javascript url", "javascript:alert(1)"],
    ["blob url", "blob:https://example.test/1"],
    ["octet-stream", `data:application/octet-stream;base64,${TINY_PNG_BASE64}`],
    ["empty", ""],
    ["non-string", 42],
  ]
  for (const [name, value] of rejected) {
    assert.equal(isSafeLogoDataUrl(value), false, name)
  }
})

test("logo: synthetic jpeg at the size cap is accepted", () => {
  assert.equal(isSafeLogoDataUrl(syntheticJpegDataUrl(LOGO_MAX_DECODED_BYTES)), true)
})

test("escapeHtmlAttribute escapes the same five characters as the PDF esc() helper", () => {
  assert.equal(escapeHtmlAttribute(`&<>"'`), "&amp;&lt;&gt;&quot;&#039;")
})

test("safePdfImgTag returns nothing for invalid sources", () => {
  assert.equal(safePdfImgTag('x" onerror="alert(1)', "logo"), "")
  assert.equal(safePdfImgTag(undefined, "logo"), "")
  assert.equal(safePdfImgTag(TINY_JPEG_DATA_URL, "signature"), "")
  assert.equal(safePdfImgTag(`${TINY_PNG_DATA_URL}" onerror="alert(1)`, "signature"), "")
})

test("safePdfImgTag escapes attribute values and keeps a valid src exactly once", () => {
  const tag = safePdfImgTag(TINY_PNG_DATA_URL, "logo", {
    alt: 'Logo "A" <b> & co',
    style: 'max-height:42px;" onload="alert(1)',
  })
  assert.equal(
    tag,
    `<img src="${TINY_PNG_DATA_URL}" alt="Logo &quot;A&quot; &lt;b&gt; &amp; co" style="max-height:42px;&quot; onload=&quot;alert(1)" />`
  )
  assert.equal(tag.split(TINY_PNG_DATA_URL).length - 1, 1)
})
