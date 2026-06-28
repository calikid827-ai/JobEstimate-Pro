export type FieldHandoffSection = {
  title: string
  items: string[]
}

export type FieldHandoff = {
  isReady: boolean
  summary: string
  sections: FieldHandoffSection[]
  text: string
}

type JobDetailsInput = {
  clientName?: string
  jobName?: string
  jobAddress?: string
  changeOrderNo?: string
  date?: string
}

type ScheduleInput = {
  crewDays?: number | null
  visits?: number | null
  calendarDays?: { min?: number | null; max?: number | null } | null
  workDaysPerWeek?: number | null
  startDate?: string | null
  rationale?: string[] | null
}

type CrewDailyPlanInput = {
  label?: string
  crewSize?: number | null
  tasks?: string[] | null
  reminders?: string[] | null
  risks?: string[] | null
}

type CrewPlanningInput = {
  recommendedCrewSize?: number | null
  durationRange?: string | null
  dailyPlan?: CrewDailyPlanInput[] | null
  sequence?: string[] | null
  risks?: string[] | null
  planningNotes?: string[] | null
}

type MaterialsListInput = {
  items?: Array<{
    label?: string
    quantity?: string
    category?: string
  }> | null
  confirmItems?: string[] | null
  notes?: string[] | null
} | null

type EstimateSectionInput = {
  label?: string
  section?: string
  notes?: string[] | null
} | null

type ScopeXRayInput = {
  detectedScope?: {
    splitScopes?: Array<{
      trade?: string
      scope?: string
    }> | null
  } | null
  riskFlags?: string[] | null
  needsConfirmation?: string[] | null
} | null

type EstimateDefenseInput = {
  includedScopeHighlights?: string[] | null
  exclusionNotes?: string[] | null
  allowanceNotes?: string[] | null
} | null

type DepositInput = {
  enabled: boolean
  type: "percent" | "fixed"
  value: number
  depositDue: number
  remainingBalance: number
}

export type BuildFieldHandoffInput = {
  resultText?: string | null
  scopeText?: string | null
  jobDetails?: JobDetailsInput | null
  trade?: string | null
  documentType?: string | null
  state?: string | null
  schedule?: ScheduleInput | null
  crewPlanning?: CrewPlanningInput | null
  materialsList?: MaterialsListInput
  estimateSections?: EstimateSectionInput[] | null
  scopeXRay?: ScopeXRayInput
  estimateDefenseMode?: EstimateDefenseInput
  deposit?: DepositInput | null
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function titleCase(value: string) {
  return cleanText(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function addUnique(target: string[], value: unknown, max = 6) {
  if (target.length >= max) return

  const text = cleanText(value)
  if (!text) return

  const key = text.toLowerCase()
  if (target.some((item) => item.toLowerCase() === key)) return

  target.push(text)
}

function firstSentences(value: string, maxSentences = 2) {
  const text = cleanText(value)
  if (!text) return ""

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(cleanText)
    .filter(Boolean)

  const summary = (sentences.length > 0 ? sentences : [text])
    .slice(0, maxSentences)
    .join(" ")

  return summary.length > 320 ? `${summary.slice(0, 317).trim()}...` : summary
}

function money(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "$0"
  return `$${Math.round(n).toLocaleString()}`
}

function formatDate(value: unknown) {
  const text = cleanText(value)
  if (!text) return ""

  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) return text

  return new Date(ms).toLocaleDateString()
}

function buildJobItems(input: BuildFieldHandoffInput) {
  const items: string[] = []
  const job = input.jobDetails ?? {}

  addUnique(items, job.clientName ? `Client: ${job.clientName}` : "")
  addUnique(items, job.jobName ? `Job: ${job.jobName}` : "")
  addUnique(items, job.jobAddress ? `Address: ${job.jobAddress}` : "")
  addUnique(items, input.trade ? `Trade: ${titleCase(String(input.trade))}` : "")
  addUnique(items, input.documentType ? `Document: ${input.documentType}` : "")
  addUnique(items, input.state ? `State: ${String(input.state).toUpperCase()}` : "")
  addUnique(items, job.changeOrderNo ? `Change order: ${job.changeOrderNo}` : "")
  addUnique(items, job.date ? `Date: ${formatDate(job.date)}` : "")

  return items
}

function buildIncludedItems(input: BuildFieldHandoffInput) {
  const items: string[] = []

  for (const split of input.scopeXRay?.detectedScope?.splitScopes || []) {
    const trade = titleCase(split.trade || "")
    const scope = cleanText(split.scope)
    addUnique(items, trade && scope ? `${trade}: ${scope}` : scope, 5)
  }

  for (const section of input.estimateSections || []) {
    addUnique(items, section?.label || section?.section, 5)
  }

  if (items.length === 0) {
    for (const highlight of input.estimateDefenseMode?.includedScopeHighlights || []) {
      addUnique(items, highlight, 5)
    }
  }

  if (items.length === 0) {
    addUnique(items, firstSentences(input.resultText || input.scopeText || "", 2), 1)
  }

  return items
}

function buildBoundaryItems(input: BuildFieldHandoffInput) {
  const items: string[] = []

  for (const note of input.estimateDefenseMode?.exclusionNotes || []) {
    addUnique(items, note, 5)
  }

  for (const confirmation of input.scopeXRay?.needsConfirmation || []) {
    addUnique(items, `Confirm: ${confirmation}`, 5)
  }

  return items
}

function buildScheduleItems(input: BuildFieldHandoffInput) {
  const items: string[] = []
  const schedule = input.schedule
  const crew = input.crewPlanning

  if (schedule?.startDate) {
    addUnique(items, `Start: ${formatDate(schedule.startDate)}`)
  }

  if (schedule?.calendarDays?.min || schedule?.calendarDays?.max) {
    const min = Number(schedule.calendarDays.min || 0)
    const max = Number(schedule.calendarDays.max || min)
    addUnique(items, `Duration: ${min}-${max} calendar days`)
  } else if (schedule?.crewDays) {
    addUnique(items, `Duration: ${schedule.crewDays} crew-day${schedule.crewDays === 1 ? "" : "s"}`)
  } else if (crew?.durationRange) {
    addUnique(items, `Duration: ${crew.durationRange}`)
  }

  if (schedule?.visits) {
    addUnique(items, `Visits: ${schedule.visits}`)
  }

  if (crew?.recommendedCrewSize) {
    addUnique(items, `Recommended crew: ${crew.recommendedCrewSize}`)
  }

  for (const step of crew?.sequence || []) {
    addUnique(items, step, 5)
  }

  for (const day of crew?.dailyPlan || []) {
    const label = cleanText(day.label)
    const tasks = (day.tasks || []).map(cleanText).filter(Boolean).slice(0, 2).join("; ")
    addUnique(items, label && tasks ? `${label}: ${tasks}` : tasks, 5)
  }

  for (const reason of schedule?.rationale || []) {
    addUnique(items, reason, 5)
  }

  return items
}

function buildMaterialItems(input: BuildFieldHandoffInput) {
  const items: string[] = []

  for (const item of input.materialsList?.items || []) {
    const label = cleanText(item.label)
    const quantity = cleanText(item.quantity)
    addUnique(items, quantity ? `${label}: ${quantity}` : label, 6)
  }

  for (const note of input.materialsList?.confirmItems || []) {
    addUnique(items, `Confirm: ${note}`, 6)
  }

  for (const note of input.materialsList?.notes || []) {
    addUnique(items, note, 6)
  }

  for (const note of input.estimateDefenseMode?.allowanceNotes || []) {
    addUnique(items, note, 6)
  }

  return items
}

function buildWatchOutItems(input: BuildFieldHandoffInput) {
  const items: string[] = []

  for (const note of input.crewPlanning?.planningNotes || []) {
    addUnique(items, note, 5)
  }

  for (const risk of input.crewPlanning?.risks || []) {
    addUnique(items, risk, 5)
  }

  for (const risk of input.scopeXRay?.riskFlags || []) {
    addUnique(items, risk, 5)
  }

  return items
}

function buildPaymentItems(deposit: DepositInput | null | undefined) {
  const items: string[] = []
  if (!deposit?.enabled) return items

  const type =
    deposit.type === "fixed"
      ? `${money(deposit.value)} fixed deposit`
      : `${deposit.value}% deposit`

  addUnique(
    items,
    `${type}. Due now: ${money(deposit.depositDue)}. Remaining balance: ${money(deposit.remainingBalance)}.`
  )

  return items
}

function buildHandoffText(summary: string, sections: FieldHandoffSection[]) {
  const lines = ["Field Handoff"]

  if (summary) {
    lines.push("", "Scope Summary", summary)
  }

  for (const section of sections) {
    if (section.items.length === 0) continue
    lines.push("", section.title)
    for (const item of section.items) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join("\n").trim()
}

export function buildFieldHandoff(input: BuildFieldHandoffInput): FieldHandoff {
  const sourceText = cleanText(input.resultText || input.scopeText)
  const summary = firstSentences(sourceText, 2)

  if (!sourceText) {
    return {
      isReady: false,
      summary: "",
      sections: [],
      text: "",
    }
  }

  const sections: FieldHandoffSection[] = [
    { title: "Job Basics", items: buildJobItems(input) },
    { title: "Included Work", items: buildIncludedItems(input) },
    { title: "Exclusions / Boundaries", items: buildBoundaryItems(input) },
    { title: "Schedule / Crew", items: buildScheduleItems(input) },
    { title: "Materials / Reminders", items: buildMaterialItems(input) },
    { title: "Watch-outs / Coordination", items: buildWatchOutItems(input) },
    { title: "Payment Note", items: buildPaymentItems(input.deposit) },
  ].filter((section) => section.items.length > 0)

  return {
    isReady: true,
    summary,
    sections,
    text: buildHandoffText(summary, sections),
  }
}
