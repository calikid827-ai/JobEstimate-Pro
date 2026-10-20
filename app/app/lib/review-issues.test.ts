import test from "node:test"
import assert from "node:assert/strict"
import { consolidateReviewIssues, getReviewIssueKey, reviewIssueCause } from "./review-issues"

test("known detector paraphrases become one action with unique supporting evidence", () => {
  const issues = consolidateReviewIssues([
    {
      message: "Masking/protection for adjacent finishes or occupied areas is not clearly stated.",
      source: "PriceGuard",
      details: ["Masking/protection for adjacent finishes or occupied areas is not clearly stated.", "Occupied bedrooms have exposed flooring."],
    },
    {
      message: "Protection for adjacent finishes, dust, or occupied areas is not clearly stated.",
      source: "Estimator intelligence",
      details: ["Protection for adjacent finishes, dust, or occupied areas is not clearly stated.", "Occupied bedrooms have exposed flooring."],
    },
  ])
  assert.equal(issues.length, 1)
  assert.deepEqual(issues[0].sources, ["PriceGuard", "Estimator intelligence"])
  assert.deepEqual(issues[0].details, ["Occupied bedrooms have exposed flooring."])
})

test("similar independent issues and affected scopes remain separate actions", () => {
  const issues = consolidateReviewIssues([
    { message: "Confirm protection for the marble stairs.", cause: "protection", affectedScope: "stairs" },
    { message: "Confirm protection for the bedroom floors.", cause: "protection", affectedScope: "bedrooms" },
    { message: "Confirm water damage repairs in room 101." },
    { message: "Confirm water damage repairs in room 102." },
    { message: "Confirm whether paint and materials are contractor-supplied or owner-supplied." },
  ])
  assert.equal(issues.length, 5)
  const remaining = consolidateReviewIssues(issues.filter((issue) => issue.affectedScope !== "stairs"))
  assert.equal(remaining.length, 4)
  assert.ok(remaining.some((issue) => issue.affectedScope === "bedrooms"))
  assert.ok(remaining.some((issue) => issue.cause === "material_responsibility"))
})

test("unknown messages require matching text and preserve substantive details", () => {
  const issues = consolidateReviewIssues([
    { message: "Verify moisture before painting.", details: ["Moisture reading was 24%."] },
    { message: "Verify moisture before painting.", details: ["Meter may require calibration."] },
    { message: "Verify lead before painting." },
  ])
  assert.equal(issues.length, 2)
  assert.deepEqual(issues[0].details, ["Moisture reading was 24%.", "Meter may require calibration."])
  assert.notEqual(getReviewIssueKey(issues[0]), getReviewIssueKey(issues[1]))
})

test("structural conflict identity preserves different corrective actions and distinct supporting explanations", () => {
  const base = { cause: "customer_scope_overpromise", affectedScope: "room 101 wiring" }
  const issues = consolidateReviewIssues([
    { ...base, message: "Electrical work is by others.", correctiveAction: "reconcile_customer_scope", details: ["Owner's electrician handles room 101."] },
    { ...base, message: "The proposal promises unsupported wiring work.", correctiveAction: "reconcile_customer_scope", details: ["Generated scope: Install wiring in room 101."] },
    { ...base, message: "Confirm temporary electrical access before work.", correctiveAction: "confirm_access_responsibility" },
  ])
  assert.equal(issues.length, 2)
  assert.deepEqual(issues[0].details, [
    "Owner's electrician handles room 101.",
    "The proposal promises unsupported wiring work.",
    "Generated scope: Install wiring in room 101.",
  ])
  assert.notEqual(issues[0].key, issues[1].key)
})

test("preferred target comparisons stay distinguishable from the healthy-margin threshold", () => {
  assert.equal(reviewIssueCause("Margin below 25%"), "preferred_margin_target")
  assert.equal(reviewIssueCause("Current price is below the 25% target price of $1,333."), "preferred_margin_target")
  assert.equal(reviewIssueCause("Current price is below the 30% target price of $1,429."), "preferred_margin_target")
  assert.equal(reviewIssueCause("Margin is below the 15% healthy threshold."), undefined)
  assert.equal(reviewIssueCause("Labor appears low compared with total."), undefined)
})

test("known prep, surface, schedule and minimum-margin paraphrases each count one action", () => {
  const issues = consolidateReviewIssues([
    { message: "Prep or demolition expectations are not clearly stated." },
    { message: "Confirm prep, patching, protection, and primer expectations." },
    { message: "Painting scope should confirm included surfaces before sending." },
    { message: "Confirm painted surfaces such as walls, ceilings, trim, doors, cabinets, or exterior areas." },
    { message: "Schedule assumptions are missing or thin. Add expected duration and timing assumptions." },
    { message: "Confirm the job duration and scheduling assumptions before promising a completion date." },
    { message: "Markup is below a conservative launch-safe threshold. Check overhead and profit before sending." },
    { message: "Current price is below the minimum safe price of $7,765." },
    { message: "Verify overhead and contingency for uncertain access." },
  ])
  assert.equal(issues.length, 5)
  assert.deepEqual(issues.map((issue) => issue.cause), ["prep", "included_surfaces", "schedule", "margin_floor", undefined])
})
