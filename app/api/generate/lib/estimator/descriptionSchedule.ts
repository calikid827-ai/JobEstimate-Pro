import type { ScheduleBlock } from "./types"

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

const NUMBER = "(?:one|single|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\.\\d+)?)"
const SINGLE = "(?:(?:a\\s+)?single|one|1|a)"
const UNIT = "(?:site\\s+)?visit|mobilization"
const SINGLE_UNIT = `${SINGLE}\\s+(?:${UNIT})`
const READBACK_VALUE = "approximately \\d+(?:\\.\\d+)?(?:–\\d+(?:\\.\\d+)?)? (?:site visits?|crew-days?|calendar days?)"
const READBACK = new RegExp(`\\bEstimated schedule: ${READBACK_VALUE}(?:; ${READBACK_VALUE})*\\. Timing remains estimated and subject to confirmation\\.`, "g")
const COUNT: Record<string, number> = {
  one: 1, single: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

function count(raw: string): number {
  return COUNT[raw.toLowerCase()] ?? Number(raw)
}

/** Describe only finalized known estimates; startDate is not confirmation. */
export function buildScheduleReadback(schedule: ScheduleBlock): string {
  const parts: string[] = []
  const visits = positive(schedule.visits)
  const crewDays = positive(schedule.crewDays)
  const min = positive(schedule.calendarDays?.min)
  const max = positive(schedule.calendarDays?.max)
  if (visits != null) parts.push(`approximately ${visits} site visit${visits === 1 ? "" : "s"}`)
  if (crewDays != null) parts.push(`approximately ${crewDays} crew-day${crewDays === 1 ? "" : "s"}`)
  if (min != null && max != null && max >= min) {
    parts.push(`approximately ${min === max ? min : `${min}–${max}`} calendar day${max === 1 ? "" : "s"}`)
  }
  return parts.length
    ? `Estimated schedule: ${parts.join("; ")}. Timing remains estimated and subject to confirmation.`
    : ""
}

type WrittenConstraint = { text: string; value: number; kind: "visits" | "crewDays" | "calendarDays"; maximum: boolean; minimum: boolean }

function isPhaseOrDeniedConstraint(scopeText: string, index: number, matched: string): boolean {
  const before = scopeText.slice(0, index)
  const after = scopeText.slice(index)
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf(";"), before.lastIndexOf("\n")) + 1
  const end = after.search(/[.;\n]/)
  const clause = scopeText.slice(start, end < 0 ? undefined : index + end)
  const prefix = before.slice(-30)
  if (/\b(?:not|never|cannot|can['’]t|don['’]t|won['’]t)\s*(?:be\s*)?$/i.test(prefix) ||
      /\b(?:not|never|cannot|can['’]t|don['’]t|won['’]t)\b(?!\s+(?:more\s+than|less\s+than|fewer\s+than|exceed)\b)/i.test(matched)) return true
  return /^\s*(?:(?:finish|complete)\s+)?(?:patching|prep(?:aration)?|priming|first\s+coat)\b/i.test(clause) &&
    /\b(?:before\s+(?:painting|paint)|followed\s+by|return(?:s|ing)?|next\s+visit)\b/i.test(clause)
}

function writtenConstraints(scopeText: string): WrittenConstraint[] {
  const constraints: WrittenConstraint[] = []
  // Deliberately limited to explicit written completion/limit/schedule clauses.
  // A single mobilization fee is procurement/pricing language, not a visit limit.
  const pattern = new RegExp(
    `\\b(?:must|shall|required?|requires?|complete(?:d)?|finish(?:ed)?|only|within|maximum|max|minimum|min|at\\s+most|at\\s+least|no\\s+(?:more|less|fewer)\\s+than|schedule(?:d)?)\\b[^.!?;\\n]{0,100}?\\b(${NUMBER})\\s+(site\\s+visits?|visits?|crew[-\\s]*days?|calendar\\s+days?|days?)\\b`, "gi"
  )
  for (const match of scopeText.matchAll(pattern)) {
    if (isPhaseOrDeniedConstraint(scopeText, match.index!, match[0])) continue
    const unit = match[2].toLowerCase()
    constraints.push({
      text: match[0].trim(), value: count(match[1]),
      kind: /visit/.test(unit) ? "visits" : /crew/.test(unit) ? "crewDays" : "calendarDays",
      maximum: /\b(?:within|maximum|max|only|at\s+most|no\s+more\s+than|not\s+exceed)\b/i.test(match[0]),
      minimum: /\b(?:minimum|min|at\s+least|(?:no|not)\s+(?:less|fewer)\s+than)\b/i.test(match[0]),
    })
  }
  const mobilization = new RegExp(`\\b(?:complete(?:d)?|finish(?:ed)?)\\b[^.!?;\\n]{0,60}?\\b${SINGLE}\\s+mobilization\\b(?!\\s+(?:fee|charge|allowance|cost))`, "gi")
  for (const match of scopeText.matchAll(mobilization)) {
    if (isPhaseOrDeniedConstraint(scopeText, match.index!, match[0])) continue
    constraints.push({ text: match[0].trim(), value: 1, kind: "visits", maximum: /\bwithin\b/i.test(match[0]), minimum: false })
  }
  return constraints
}

/** Written requirements are review boundaries, never silently overridden. */
export function getScheduleReviewWarnings(scopeText: string, schedule: ScheduleBlock): string[] {
  const warnings: string[] = []
  for (const constraint of writtenConstraints(scopeText)) {
    const actual = constraint.kind === "visits" ? positive(schedule.visits)
      : constraint.kind === "crewDays" ? positive(schedule.crewDays)
      : positive(constraint.minimum ? schedule.calendarDays?.min : schedule.calendarDays?.max)
    const label = constraint.kind === "visits" ? "site visits"
      : constraint.kind === "crewDays" ? "crew-days" : "calendar days"
    const detail = actual == null
      ? `the estimated ${label} are unavailable, so this requirement cannot yet be verified`
      : (constraint.maximum ? actual > constraint.value : constraint.minimum ? actual < constraint.value : actual !== constraint.value)
        ? `the finalized estimate allows approximately ${actual} ${label}` : null
    if (detail) warnings.push(`Schedule review required: written requirement “${constraint.text}” needs confirmation because ${detail}.`)
  }
  return [...new Set(warnings)]
}

function isWholeWorkCompletion(clause: string): boolean {
  const wholeWork = /\b(?:(?:all|entire|whole)\s+(?:(?:the|of\s+the)\s+)?(?:work|scope|project|job|painting\s+work)|(?:the|this)\s+(?:painting\s+work|work|scope|project|job))\b|^\s*(?:work|scope|project|job)\b/i.test(clause)
  const completion = /\b(?:complete(?:d|s)?|finish(?:ed)?|perform(?:ed)?|execut(?:e|ed)|carried\s+out|planned|scheduled|anticipated)\b/i.test(clause)
  const deniedCompletion = /\b(?:not|never|cannot|can['’]t|won['’]t)\b.{0,35}\b(?:complete(?:d|s)?|finish(?:ed)?|perform(?:ed)?|execut(?:e|ed)|carried\s+out|planned|scheduled|anticipated)\b/i.test(clause)
  return wholeWork && completion && !deniedCompletion
}

/** Narrow correction of whole-job one-visit promises, not arbitrary prose. */
export function reconcileDescriptionSchedule(args: {
  description: string
  schedule: ScheduleBlock
  scopeText: string
}): string {
  let description = String(args.description || "").trim()
  if (!description) return description
  const visits = positive(args.schedule.visits)
  const warnings = getScheduleReviewWarnings(args.scopeText, args.schedule)
  // Only remove this helper's own readback, so repeated finalization is stable.
  description = description.replace(READBACK, "")
  for (const warning of warnings) description = description.replaceAll(warning, "")
  description = description.trim()
  {
    const temporal = new RegExp(`\\b(?:in|within|during|over|across|for)\\s+(?:(?:only|no\\s+more\\s+than)\\s+)?${SINGLE_UNIT}\\b(?!\\s+(?:fee|charge|allowance|cost))`, "gi")
    description = description.split(/((?<=[.!?;])\s+|\n+)/).map((clause) => {
      // A quoted written requirement is added below as an unresolved boundary.
      // Phase-only language and fee/allowance clauses are left intact.
      if (/^Schedule review required:/i.test(clause) || !isWholeWorkCompletion(clause) || /\b(?:followed\s+by|before\s+(?:painting|paint)|patching\s+only)\b/i.test(clause)) return clause
      if (visits === 1 && /\b(?:estimated|planned|anticipated|tentatively|approximately)\b/i.test(clause)) return clause
      const timing = visits == null ? "subject to confirmation of site-visit timing"
        : visits === 1 ? "within the estimated site visit" : "across the estimated site visits"
      return clause.replace(temporal, timing)
    }).join("")
  }
  const readback = buildScheduleReadback(args.schedule)
  return [description, readback, ...warnings.filter((warning) => !description.includes(warning))].filter(Boolean).join(" ").trim()
}
