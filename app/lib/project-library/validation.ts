import { PROJECT_LIMITS, ProjectLibraryError, type RegisterFile } from "./types"

const extensions: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", txt: "text/plain", csv: "text/csv", zip: "application/zip", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dwg: "application/acad", dxf: "application/dxf" }
export function safeRelativePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1000 || /[\x00-\x1f\x7f\\]/.test(value) || value.startsWith("/") || /^[a-z]:/i.test(value)) throw new ProjectLibraryError(400, "PROJECT_PATH_INVALID", "Use a relative folder path without control characters or backslashes.")
  if (value.split("/").some(part => !part || part === "." || part === "..")) throw new ProjectLibraryError(400, "PROJECT_PATH_INVALID", "Archive and folder paths cannot contain empty or parent path segments.")
  return value
}
export function mimeForName(name: string): string | null { return extensions[name.split(".").pop()?.toLowerCase() || ""] ?? null }
export function validateRegistration(input: unknown): RegisterFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProjectLibraryError(400, "PROJECT_FILE_INVALID", "File metadata is required.")
  const value = input as Record<string, unknown>, relativePath = safeRelativePath(value.relativePath)
  if (typeof value.name !== "string" || value.name !== relativePath.split("/").pop() || value.name.length > 255 || !mimeForName(value.name)) throw new ProjectLibraryError(415, "PROJECT_FILE_UNSUPPORTED", "Supported originals: PDF, JPEG, PNG, GIF, WebP, TXT, CSV, ZIP, DOCX, XLSX, DWG and DXF. Other files are not uploaded.")
  if (!Number.isSafeInteger(value.size) || Number(value.size) < 1 || Number(value.size) > PROJECT_LIMITS.maxFileBytes || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.selectionId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.selectionId)) throw new ProjectLibraryError(400, "PROJECT_FILE_INVALID", "File size, content identity or selection identity is invalid.")
  return { name: value.name, relativePath, mimeType: mimeForName(value.name)!, size: Number(value.size), sha256: value.sha256, selectionId: value.selectionId }
}
export function projectId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new ProjectLibraryError(404, "PROJECT_NOT_FOUND", "The selected project is unavailable.")
  return value
}
export function assertOriginalType(bytes: Uint8Array, mime: string) {
  const ascii = new TextDecoder().decode(bytes.subarray(0, 16))
  const valid = mime === "application/pdf" ? ascii.startsWith("%PDF-")
    : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/png" ? bytes.subarray(0, 8).join() === "137,80,78,71,13,10,26,10"
        : mime === "image/gif" ? /^GIF8[79]a/.test(ascii)
          : mime === "image/webp" ? ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
            : mime === "application/zip" || mime.includes("openxmlformats") ? bytes[0] === 80 && bytes[1] === 75
              : mime.startsWith("text/") ? !bytes.includes(0) : true
  if (!valid) throw new ProjectLibraryError(415, "PROJECT_CONTENT_TYPE_MISMATCH", "The retained bytes do not match the selected file type. The original record is retained for retry.")
}
