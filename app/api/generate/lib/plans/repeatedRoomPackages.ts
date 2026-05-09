import type {
  PlanRepeatedRoomPackage,
  PlanRepeatedRoomPackageSourceRow,
  PlanRoomFinishMatrix,
  PlanRoomFinishMatrixRow,
} from "./types"

type Candidate = {
  matrix: PlanRoomFinishMatrix
  matrixIndex: number
  row: PlanRoomFinishMatrixRow
  roomFamily: string | null
  finishSignature: string
  finishCompleteness: number
}

const REPEATABLE_ROOM_TYPES = new Set([
  "bathroom",
  "bedroom",
  "corridor",
  "office",
  "support",
])
const GROUP_KEY_SEPARATOR = "|||"

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\d{1,5}[a-z]?\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeFinish(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueStrings(values: Array<string | null | undefined>, max = 50): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, max)
}

function inferRoomFamily(row: PlanRoomFinishMatrixRow): string | null {
  const roomType = normalizeText(row.roomType)
  const roomName = normalizeText(row.roomName)

  if (roomName && /\bguest room\b|\bguest\b|\bbed(?:room)?\b/.test(roomName)) return "guest room"
  if (roomName && /\bbath(?:room)?\b|\btoilet\b|\bwc\b/.test(roomName)) return "bathroom"
  if (roomName && /\bcorridor\b|\bhall(?:way)?\b/.test(roomName)) return "corridor"
  if (roomName && /\bunit\b/.test(roomName)) return "unit"
  if (roomName && /\boffice\b/.test(roomName)) return "office"
  if (roomType) return roomType

  return roomName || null
}

function buildFinishSignature(row: PlanRoomFinishMatrixRow): {
  signature: string
  completeness: number
} {
  const entries = [
    ["wall", normalizeFinish(row.finishes.wallFinish)],
    ["base", normalizeFinish(row.finishes.baseFinish)],
    ["ceiling", normalizeFinish(row.finishes.ceilingFinish)],
    ["floor", normalizeFinish(row.finishes.floorFinish)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  return {
    signature: entries.map(([key, value]) => `${key}:${value}`).join("|"),
    completeness: entries.length,
  }
}

function packageSourceRow(candidate: Candidate): PlanRepeatedRoomPackageSourceRow {
  return {
    sourceMatrixIndex: candidate.matrixIndex,
    sourceTableIndex: candidate.matrix.sourceTableIndex,
    rowIndex: candidate.row.rowIndex,
    roomName: candidate.row.roomName,
    roomNumber: candidate.row.roomNumber,
    rawRowText: candidate.row.rawRowText,
    pageNumber: candidate.matrix.pageNumber,
    sourcePageNumber: candidate.matrix.sourcePageNumber,
    sheetNumber: candidate.matrix.sheetNumber,
    sheetTitle: candidate.matrix.sheetTitle,
    confidence: candidate.row.confidence,
  }
}

function isRepeatableByNameOrType(candidate: Candidate): boolean {
  if (!candidate.roomFamily) return false
  if (candidate.row.roomType && REPEATABLE_ROOM_TYPES.has(candidate.row.roomType)) return true
  return /\bguest room\b|\bbathroom\b|\bcorridor\b|\bunit\b|\boffice\b/.test(candidate.roomFamily)
}

function packageConfidence(candidates: Candidate[], warnings: string[]): number {
  const average = candidates.reduce((sum, candidate) => sum + candidate.row.confidence, 0) / candidates.length
  const signatureBoost = candidates.every((candidate) => candidate.finishCompleteness >= 2) ? 10 : -10
  return Math.max(25, Math.min(90, Math.round(average + signatureBoost - warnings.length * 5)))
}

export function detectRepeatedRoomPackagesFromMatrices(
  matrices: PlanRoomFinishMatrix[]
): PlanRepeatedRoomPackage[] {
  const candidates: Candidate[] = []

  matrices.forEach((matrix, matrixIndex) => {
    matrix.rows.forEach((row) => {
      const finish = buildFinishSignature(row)
      candidates.push({
        matrix,
        matrixIndex,
        row,
        roomFamily: inferRoomFamily(row),
        finishSignature: finish.signature,
        finishCompleteness: finish.completeness,
      })
    })
  })

  const groups = new Map<string, Candidate[]>()

  for (const candidate of candidates) {
    if (isRepeatableByNameOrType(candidate)) {
      const signatureKey =
        candidate.finishSignature && candidate.finishCompleteness >= 2
          ? candidate.finishSignature
          : "finish-signature-incomplete"
      const key = `${candidate.roomFamily}${GROUP_KEY_SEPARATOR}${signatureKey}`
      groups.set(key, [...(groups.get(key) || []), candidate])
      continue
    }

    if (!candidate.finishSignature || candidate.finishCompleteness < 3) continue

    const key = `finish combination${GROUP_KEY_SEPARATOR}${candidate.finishSignature}`
    groups.set(key, [...(groups.get(key) || []), candidate])
  }

  return Array.from(groups.entries())
    .map(([key, group]): PlanRepeatedRoomPackage | null => {
      if (group.length < 2) return null

      const [roomFamily, finishSignature] = key.split(GROUP_KEY_SEPARATOR, 2)
      const warnings = [
        "Repeated room package is diagnostic only; do not use repeat count as measured quantity support.",
        ...(roomFamily === "finish combination"
          ? ["Repeat inferred from matching finish signature across room rows; room type/name pattern was not strong."]
          : []),
        ...(finishSignature === "finish-signature-incomplete"
          ? ["Repeat inferred from room name/type because the finish signature was incomplete."]
          : []),
      ]

      const sourceRows = group.map(packageSourceRow)
      const roomType =
        roomFamily === "finish combination"
          ? null
          : group.find((candidate) => candidate.row.roomType)?.row.roomType ?? roomFamily

      return {
        packageKey: `${roomFamily || "room"}-${finishSignature || "finish"}`.replace(/[^a-z0-9.-]+/gi, "-"),
        roomType,
        roomNames: uniqueStrings(group.map((candidate) => candidate.row.roomName)),
        roomNumbers: uniqueStrings(group.map((candidate) => candidate.row.roomNumber)),
        repeatCount: group.length,
        finishSignature,
        sourceRows,
        confidence: packageConfidence(group, warnings),
        extractionMethod: "deterministic",
        warnings,
      }
    })
    .filter((pkg): pkg is PlanRepeatedRoomPackage => pkg !== null)
    .sort((a, b) => b.repeatCount - a.repeatCount || b.confidence - a.confidence)
}
