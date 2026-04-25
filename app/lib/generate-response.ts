export async function readGenerateResponseErrorMessage(response: Response): Promise<string> {
  const cloned = response.clone()
  const contentType = String(cloned.headers.get("content-type") || "").toLowerCase()

  if (contentType.includes("application/json")) {
    const payload = await cloned.json().catch(() => null)
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim()
    }
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error.trim()
    }
  }

  const text = await response.clone().text().catch(() => "")
  const normalizedText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (normalizedText) return normalizedText

  return "Error generating document."
}

export function getGenerateExceptionMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  const message = String(error || "").trim()
  return message || "Error generating document."
}
