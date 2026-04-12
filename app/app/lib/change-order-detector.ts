// app/lib/change-order-detector.ts
import type { EstimateHistoryItem, Schedule, ChangeOrderDetection } from "./types"

export function detectChangeOrder(params: {
  documentType: string
  scopeChange: string
  currentSchedule: Schedule | null
  originalEstimate: EstimateHistoryItem | null
  changeOrderNo?: string
}): ChangeOrderDetection {
  const {
    documentType,
    scopeChange,
    currentSchedule,
    originalEstimate,
    changeOrderNo,
  } = params

  const text = (scopeChange || "").toLowerCase()
  const reasons: string[] = []
  const scheduleNotes: string[] = []

  let isChangeOrder = false
  let mode: "add" | "deduct" | "mixed" | "unknown" = "unknown"
  let confidence: "low" | "medium" | "high" = "low"

  if (documentType === "Change Order") {
    isChangeOrder = true
    reasons.push("Document type is Change Order")
  }

  if (changeOrderNo?.trim()) {
    isChangeOrder = true
    reasons.push("Change order number is present")
  }

  const addLike = /\b(add|added|additional|extra|extend|new work|upgrade)\b/i.test(text)
  const deductLike = /\b(remove|credit|deduct|deduction|omit|delete|subtract)\b/i.test(text)

  if (addLike) {
    mode = "add"
    reasons.push("Scope language suggests added work")
  }

  if (deductLike) {
    mode = mode === "add" ? "mixed" : "deduct"
    reasons.push("Scope language suggests deductive work")
  }

  if (originalEstimate) {
    isChangeOrder = true
    reasons.push("Original estimate exists for this job")
  }

  const currentCrewDays = Number(currentSchedule?.crewDays || 0)

  let likelyChanged = false
  let addedDays: number | null = null

  if (isChangeOrder) {
    if (mode === "add" && currentCrewDays > 0) {
      likelyChanged = true
      addedDays = currentCrewDays
      scheduleNotes.push(`Added scope is estimated at ${currentCrewDays} crew day${currentCrewDays === 1 ? "" : "s"}`)
    } else if (mode === "deduct") {
      likelyChanged = true
      addedDays = null
      scheduleNotes.push("Deductive change may reduce the project schedule, but impact should be confirmed against the active job schedule.")
    } else if (mode === "mixed") {
      likelyChanged = true
      addedDays = null
      scheduleNotes.push("Mixed added and deductive scope may affect the project schedule; confirm impact against the active job schedule.")
    } else if (currentCrewDays > 0) {
      likelyChanged = true
      addedDays = currentCrewDays
      scheduleNotes.push(`Change scope is estimated at ${currentCrewDays} crew day${currentCrewDays === 1 ? "" : "s"}`)
    }
  }

  if (isChangeOrder && reasons.length >= 3) confidence = "high"
  else if (isChangeOrder && reasons.length >= 2) confidence = "medium"

  return {
    isChangeOrder,
    mode,
    confidence,
    reasons,
    scheduleImpact: {
      likelyChanged,
      addedDays,
      notes: scheduleNotes,
    },
  }
}