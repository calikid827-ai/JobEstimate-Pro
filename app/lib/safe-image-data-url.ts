// Strict, bounded checks for image data URLs that end up inside generated PDF HTML.
// Shared by the approve API route and the browser PDF builder, so it uses only
// APIs available in both (atob, no Buffer).

// Proposed limits (HANDOFF.md T1, decisions 1-2). Kept as named constants so a
// settled decision changes only these values and their fixtures.
export const SIGNATURE_MAX_ENCODED_CHARS = 400_000
export const SIGNATURE_MIN_DECODED_BYTES = 67
export const SIGNATURE_MAX_DECODED_BYTES = 300_000
export const SIGNATURE_MAX_DIMENSION_PX = 4_000
export const LOGO_ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const
export const LOGO_MAX_ENCODED_CHARS = 4_000_000
export const LOGO_MAX_DECODED_BYTES = 3_000_000

type LogoMimeType = (typeof LOGO_ALLOWED_MIME_TYPES)[number]

// 32 base64 characters decode to the 24 header bytes the checks below need.
const HEADER_BASE64_CHARS = 32

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_IHDR = [0x49, 0x48, 0x44, 0x52]

export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function isBase64Char(code: number) {
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 43 || // +
    code === 47 // /
  )
}

// Exact lowercase prefix, no parameters, no surrounding whitespace, canonical
// base64 alphabet, length checked before any scan. Returns the payload and its
// decoded byte length without decoding it.
function parseStrictBase64DataUrl(value: string, mime: string, maxEncodedChars: number) {
  const prefix = `data:${mime};base64,`
  if (value.length > prefix.length + maxEncodedChars) return null
  if (!value.startsWith(prefix)) return null

  const payload = value.slice(prefix.length)
  if (payload.length === 0 || payload.length % 4 !== 0) return null

  let padding = 0
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i)
    if (code === 61) {
      // "=" is only valid in the last two positions.
      if (i < payload.length - 2) return null
      padding++
      continue
    }
    if (padding > 0 || !isBase64Char(code)) return null
  }

  return { payload, decodedBytes: (payload.length / 4) * 3 - padding }
}

function decodeHeaderBytes(payload: string): Uint8Array | null {
  let binary: string
  try {
    binary = atob(payload.slice(0, HEADER_BASE64_CHARS))
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function matchesBytes(bytes: Uint8Array, expected: number[], offset: number) {
  if (bytes.length < offset + expected.length) return false
  return expected.every((byte, index) => bytes[offset + index] === byte)
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 2 ** 24 + bytes[offset + 1] * 2 ** 16 + bytes[offset + 2] * 2 ** 8 + bytes[offset + 3]
}

export function isSafePngSignatureDataUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  const parsed = parseStrictBase64DataUrl(value, "image/png", SIGNATURE_MAX_ENCODED_CHARS)
  if (!parsed) return false
  if (parsed.decodedBytes < SIGNATURE_MIN_DECODED_BYTES || parsed.decodedBytes > SIGNATURE_MAX_DECODED_BYTES) {
    return false
  }

  const header = decodeHeaderBytes(parsed.payload)
  if (!header || !matchesBytes(header, PNG_SIGNATURE, 0) || !matchesBytes(header, PNG_IHDR, 12)) return false

  const width = readUint32BE(header, 16)
  const height = readUint32BE(header, 20)
  return (
    width >= 1 &&
    height >= 1 &&
    width <= SIGNATURE_MAX_DIMENSION_PX &&
    height <= SIGNATURE_MAX_DIMENSION_PX
  )
}

const LOGO_MAGIC_BYTES: Record<LogoMimeType, (header: Uint8Array) => boolean> = {
  "image/png": (header) => matchesBytes(header, PNG_SIGNATURE, 0),
  "image/jpeg": (header) => matchesBytes(header, [0xff, 0xd8, 0xff], 0),
  "image/gif": (header) => matchesBytes(header, [0x47, 0x49, 0x46, 0x38], 0),
  "image/webp": (header) =>
    matchesBytes(header, [0x52, 0x49, 0x46, 0x46], 0) && matchesBytes(header, [0x57, 0x45, 0x42, 0x50], 8),
}

export function isSafeLogoDataUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  const mime = LOGO_ALLOWED_MIME_TYPES.find((type) => value.startsWith(`data:${type};base64,`))
  if (!mime) return false

  const parsed = parseStrictBase64DataUrl(value, mime, LOGO_MAX_ENCODED_CHARS)
  if (!parsed || parsed.decodedBytes > LOGO_MAX_DECODED_BYTES) return false

  const header = decodeHeaderBytes(parsed.payload)
  return !!header && LOGO_MAGIC_BYTES[mime](header)
}

// Returns "" unless src passes the check for its kind; every attribute value is escaped.
export function safePdfImgTag(
  src: unknown,
  kind: "signature" | "logo",
  attrs: { alt?: string; style?: string } = {}
): string {
  const valid = kind === "signature" ? isSafePngSignatureDataUrl(src) : isSafeLogoDataUrl(src)
  if (!valid || typeof src !== "string") return ""

  const parts = [`src="${escapeHtmlAttribute(src)}"`]
  if (attrs.alt !== undefined) parts.push(`alt="${escapeHtmlAttribute(attrs.alt)}"`)
  if (attrs.style !== undefined) parts.push(`style="${escapeHtmlAttribute(attrs.style)}"`)
  return `<img ${parts.join(" ")} />`
}
