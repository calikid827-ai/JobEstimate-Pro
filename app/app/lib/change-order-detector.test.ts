import test from "node:test"
import assert from "node:assert/strict"
import { detectChangeOrder } from "./change-order-detector"
import type { EstimateHistoryItem, Schedule } from "./types"

const schedule: Schedule = { crewDays: 2, visits: 1, workDaysPerWeek: 5, calendarDays: { min: 2, max: 3 }, rationale: [] }
const original: EstimateHistoryItem = {
  id: "original", createdAt: 1, jobId: "job_1", documentType: "Estimate",
  jobDetails: { clientName: "Synthetic Client", jobName: "Painting", jobAddress: "", changeOrderNo: "", date: "" },
  trade: "painting", state: "CA", scopeChange: "Paint bedroom walls.", result: "This estimate covers painting.",
  pricing: { labor: 4000, materials: 849, subs: 0, markup: 20, total: 5819 },
}

test("prior estimate and clarified or additive wording cannot establish change-order intent", () => {
  for (const scopeChange of [
    "Paint bedroom walls. Contractor will supply the main materials and fixtures listed in this scope.",
    "Add two coats of paint and remove outlet covers before painting.",
  ]) {
    const result = detectChangeOrder({ documentType: "Estimate", scopeChange, currentSchedule: schedule, originalEstimate: original })
    assert.equal(result.isChangeOrder, false)
    assert.equal(result.confidence, "low")
    assert.deepEqual(result.scheduleImpact, { likelyChanged: false, addedDays: null, notes: [] })
    assert.equal(result.reasons.includes("Original estimate exists for this job"), false)
  }
})

test("explicit change-order workflow retains added-work classification and schedule impact", () => {
  const result = detectChangeOrder({ documentType: "Change Order", scopeChange: "Add painting in the extra bedroom.", currentSchedule: schedule, originalEstimate: original })
  assert.equal(result.isChangeOrder, true)
  assert.equal(result.mode, "add")
  assert.equal(result.confidence, "high")
  assert.equal(result.scheduleImpact.addedDays, 2)
  assert.equal(result.reasons.includes("Original estimate exists for this job"), true)
})

test("user-entered CO number remains an explicit change-order signal", () => {
  const result = detectChangeOrder({ documentType: "Estimate", changeOrderNo: "CO-2", scopeChange: "Additional ceiling painting.", currentSchedule: schedule, originalEstimate: original })
  assert.equal(result.isChangeOrder, true)
  assert.equal(result.mode, "add")
  assert.equal(result.scheduleImpact.addedDays, 2)
})

test("explicit deductive and mixed change orders retain existing classification", () => {
  for (const [scopeChange, mode] of [["Remove the bedroom painting and credit the owner.", "deduct"], ["Add ceiling painting and remove door painting.", "mixed"]] as const) {
    const result = detectChangeOrder({ documentType: "Change Order", scopeChange, currentSchedule: schedule, originalEstimate: original })
    assert.equal(result.isChangeOrder, true)
    assert.equal(result.mode, mode)
    assert.equal(result.scheduleImpact.likelyChanged, true)
    assert.equal(result.scheduleImpact.addedDays, null)
  }
})
