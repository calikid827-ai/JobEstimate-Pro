import { Unzip, UnzipInflate, unzipSync } from "fflate"
import { PROJECT_LIMITS } from "./types"
import { safeRelativePath } from "./validation"

/** Installed fflate parses the archive. Nothing is extracted to filesystem paths. */
export function expandProjectZip(bytes: Uint8Array): Array<{ relativePath: string; bytes: Uint8Array }> {
  if (!bytes.length || bytes.length > PROJECT_LIMITS.maxFileBytes) throw new Error("ZIP exceeds the 100 MiB archive limit.")
  const expected = new Map<string, number>(); let expanded = 0
  // Directory/central metadata pass without allocation of decoded entry contents.
  unzipSync(bytes, { filter: entry => {
    const name = entry.name.endsWith("/") ? entry.name.slice(0, -1) : entry.name
    safeRelativePath(name)
    if (entry.name.endsWith("/")) return false
    if (expected.has(name)) throw new Error("ZIP contains duplicate entry paths; use separate source records.")
    if (![0, 8].includes(entry.compression)) throw new Error("ZIP compression method is unsupported; use stored or DEFLATE entries.")
    if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize > PROJECT_LIMITS.maxFileBytes || entry.originalSize < 0) throw new Error("ZIP entry exceeds the file limit.")
    expanded += entry.originalSize; expected.set(name, entry.originalSize)
    if (expected.size > PROJECT_LIMITS.zipEntries || expanded > PROJECT_LIMITS.zipExpandedBytes || expanded > bytes.length * PROJECT_LIMITS.zipRatio) throw new Error("ZIP expansion exceeds the entry, byte or compression-ratio limit.")
    return false
  } })
  if (!expected.size) throw new Error("ZIP contains no files.")
  const files: Array<{ relativePath: string; bytes: Uint8Array }> = [], seen = new Set<string>(); let actualTotal = 0
  const unzip = new Unzip(file => {
    if (file.name.endsWith("/")) { safeRelativePath(file.name.slice(0, -1)); return }
    const name = safeRelativePath(file.name), size = expected.get(name)
    if (size === undefined || seen.has(name)) throw new Error("ZIP local entries do not match the validated archive directory.")
    seen.add(name); const parts: Uint8Array[] = []; let received = 0
    file.ondata = (error, data, final) => {
      if (error) throw error
      received += data.length; actualTotal += data.length
      if (received > size || received > PROJECT_LIMITS.maxFileBytes || actualTotal > expanded || actualTotal > PROJECT_LIMITS.zipExpandedBytes) { file.terminate(); throw new Error("ZIP decoded content exceeds its validated size.") }
      parts.push(data)
      if (final) {
        if (received !== size) throw new Error("ZIP entry is incomplete.")
        const output = new Uint8Array(received); let offset = 0
        for (const part of parts) { output.set(part, offset); offset += part.length }
        files.push({ relativePath: name, bytes: output })
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  // Small compressed input chunks bound the decoder's temporary expansion.
  for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
  if (files.length !== expected.size || actualTotal !== expanded) throw new Error("ZIP entries were not completely decoded.")
  return files
}
