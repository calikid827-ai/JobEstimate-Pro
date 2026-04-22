export type ParsedDataUrl = {
  mimeType: string | null
  payload: string
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const trimmed = String(dataUrl || "").trim()
  const match = trimmed.match(/^data:([^;]+);base64,/i)
  const idx = trimmed.indexOf(",")

  return {
    mimeType: match?.[1]?.toLowerCase() ?? null,
    payload: idx >= 0 ? trimmed.slice(idx + 1) : "",
  }
}

export function getDataUrlMime(dataUrl: string): string | null {
  return parseDataUrl(dataUrl).mimeType
}

export function getBase64Payload(dataUrl: string): string {
  return parseDataUrl(dataUrl).payload
}

export function estimateBase64DecodedBytes(dataUrl: string): number {
  const payload = getBase64Payload(dataUrl).replace(/\s/g, "")
  if (!payload) return 0

  const padding =
    payload.endsWith("==") ? 2 :
    payload.endsWith("=") ? 1 :
    0

  return Math.floor((payload.length * 3) / 4) - padding
}

export function decodeDataUrlToBuffer(dataUrl: string): Buffer {
  const payload = getBase64Payload(dataUrl).replace(/\s/g, "")
  return Buffer.from(payload, "base64")
}
