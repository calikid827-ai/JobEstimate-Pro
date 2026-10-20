export type ReviewIssueInput = {
  message: string
  title?: string
  details?: string[]
  source?: string
  cause?: string
  affectedScope?: string
  correctiveAction?: string
}

export type ReviewIssue = {
  key: string
  message: string
  title?: string
  details: string[]
  sources: string[]
  cause?: string
  affectedScope?: string
  correctiveAction?: string
}

function clean(value: string | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalize(value: string | undefined): string {
  return clean(value).toLowerCase().replace(/[.!?]+$/g, "")
}

// These are known descriptions of the same existing review actions. Unknown
// prose keeps its full text as its identity; shared vocabulary alone never
// merges issues about different work or different conditions.
const KNOWN_CAUSES: Record<string, string> = {}

function register(cause: string, messages: string[]) {
  for (const message of messages) KNOWN_CAUSES[normalize(message)] = cause
}

register("protection", [
  "Masking/protection for adjacent finishes or occupied areas is not clearly stated.",
  "Protection for adjacent finishes, dust, or occupied areas is not clearly stated.",
  "Protection for adjacent finishes is not clearly stated.",
])
register("material_responsibility", [
  "Confirm whether paint and materials are contractor-supplied or owner-supplied.",
  "Confirm paint/material supply and finish selection responsibility.",
  "Material responsibility or allowance language is not clear.",
  "Confirm material responsibility, finish selections, and allowances for the included work.",
  "Who is responsible for supplying paint and materials?",
  "Who is responsible for supplying the main materials?",
  "Who is responsible for supplying the main materials or fixtures?",
])
register("scope_boundary", [
  "Exclusions or allowance boundaries are thin. Add scope protection before sending.",
  "Exclusions and by-others responsibilities are not clearly stated.",
  "Confirm exclusions, allowances, permits, hidden damage, and work by others.",
  "Clarify exclusions, allowances, permits, hidden damage, and work by others.",
  "Are the exclusions, by-others items, and existing-to-remain boundaries still correct as written?",
])
register("prep", [
  "Prep or demolition expectations are not clearly stated.",
  "Preparation and finish-work limits for the included trades are not clearly stated.",
  "Confirm preparation and finish-work limits for the included trades.",
  "Are preparation and repair limits clear for the written scope?",
  "Are demolition, preparation, and repair limits clear for the written scope?",
  "Confirm prep, patching, protection, and primer expectations.",
])
register("included_surfaces", [
  "Painting scope should confirm included surfaces before sending.",
  "Confirm painted surfaces such as walls, ceilings, trim, doors, cabinets, or exterior areas.",
])
register("margin_floor", [
  "Markup is below a conservative launch-safe threshold. Check overhead and profit before sending.",
])
register("cleanup", ["Cleanup, debris removal, or disposal is not clearly addressed."])
register("quantity", [
  "Confirm painting area, rooms, or square footage.",
  "Confirm exact measured quantities before final approval.",
])
register("schedule", [
  "Multi-trade sequencing or return-trip assumptions should be reviewed before sending.",
  "Are return trips, cure/dry time, inspections, or phased access required?",
  "Are return trips, drying time, or access restrictions required?",
  "Schedule assumptions are missing or thin. Add expected duration and timing assumptions.",
  "Confirm the job duration and scheduling assumptions before promising a completion date.",
])
register("permit_inspection", ["Who is responsible for permits, inspections, or code-related coordination?"])

export function reviewIssueCause(message: string): string | undefined {
  const text = normalize(message)
  if (/^current price is below the minimum safe price of \$[\d,.]+$/.test(text)) return "margin_floor"
  if (/^current price is (?:below|meets or exceeds) the (?:20|25|30)% target price of \$[\d,.]+$/.test(text) ||
      /^margin below (?:20|25|30)%$/.test(text)) return "preferred_margin_target"
  return KNOWN_CAUSES[text]
}

export function getReviewIssueKey(issue: ReviewIssueInput): string {
  const cause = normalize(issue.cause) || reviewIssueCause(issue.message)
  const scope = normalize(issue.affectedScope)
  const action = normalize(issue.correctiveAction)
  return JSON.stringify([cause ? "cause" : "message", cause || normalize(issue.message), scope,
    ...(action ? [action] : []),
  ])
}

export function consolidateReviewIssues(inputs: ReviewIssueInput[]): ReviewIssue[] {
  const issues = new Map<string, ReviewIssue>()
  for (const input of inputs) {
    const message = clean(input.message)
    if (!message) continue
    const key = getReviewIssueKey(input)
    const cause = clean(input.cause) || reviewIssueCause(message)
    const existing = issues.get(key)
    const issue = existing || {
      key,
      message,
      title: clean(input.title) || undefined,
      cause,
      affectedScope: clean(input.affectedScope) || undefined,
      correctiveAction: clean(input.correctiveAction) || undefined,
      details: [],
      sources: [],
    }
    // Structurally matched detections can explain different sides of one
    // conflict. Retain that explanation inside the action, without counting it again.
    if (existing && input.correctiveAction && normalize(message) !== normalize(issue.message) &&
        !issue.details.some((detail) => normalize(detail) === normalize(message))) {
      issue.details.push(message)
    }
    for (const detail of input.details || []) {
      const text = clean(detail)
      // A detector repeating the warning as its own evidence adds no detail.
      if (!text || normalize(text) === normalize(message) || normalize(text) === normalize(issue.message) ||
          (cause && reviewIssueCause(text) === cause) ||
          issue.details.some((item) => normalize(item) === normalize(text))) continue
      issue.details.push(text)
    }
    const source = clean(input.source)
    if (source && !issue.sources.includes(source)) issue.sources.push(source)
    issues.set(key, issue)
  }
  return [...issues.values()]
}
