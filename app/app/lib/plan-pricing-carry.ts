import type { EstimateStructuredSection } from "./types"

export type PlanPricingCarryEvidence = {
  uploadId: string
  uploadName: string
  sourcePageNumber: number
  pageNumber: number
  sheetNumber: string | null
  sheetTitle: string | null
  excerpt: string
  confidence: number
}

export type PlanPricingCarryInput = {
  tradeScopeReadback: Array<{
    trade: string
    role: "likely primary" | "supporting" | "review only"
    supportLevel: "direct" | "reinforced" | "review"
    phaseTypes: string[]
    areaGroups: string[]
    narration: string
    quantityNarration: string[]
    supportNarration: string[]
    confirmationNotes: string[]
    evidence: PlanPricingCarryEvidence[]
  }>
  groupedScopeReadback: Array<{
    groupKey: string
    title: string
    role: "primary" | "supporting" | "review only"
    supportLevel: "direct" | "reinforced" | "review"
    scopeCharacter: string[]
    trades: string[]
    areaGroups: string[]
    narration: string
    directSupport: string[]
    reinforcedSupport: string[]
    confirmationNotes: string[]
    evidence: PlanPricingCarryEvidence[]
  }>
  scopeGapReadback: Array<{
    gapKey: string
    title: string
    status: "likely_ready" | "needs_confirmation" | "missing_or_incomplete" | "risky_assumption"
    scopeGroupKey: string | null
    trades: string[]
    areaGroups: string[]
    narration: string
    confirmationPrompt: string
    evidence: PlanPricingCarryEvidence[]
  }>
}

export type PlanPricingCarryItem = {
  key: string
  status: "directly_carried" | "reinforced_or_embedded" | "not_carried_yet" | "confirmation_needed"
  title: string
  trade: string | null
  scopeGroupKey: string | null
  areaGroups: string[]
  narration: string
  amount: number | null
  quantity: number | null
  unit: string | null
  evidence: PlanPricingCarryEvidence[]
}

const uniqStrings = (items: string[], max = 8): string[] => {
  const out: string[] = []
  for (const item of items.map((value) => String(value || "").trim()).filter(Boolean)) {
    if (!out.some((existing) => existing.toLowerCase() === item.toLowerCase())) out.push(item)
    if (out.length >= max) break
  }
  return out
}

const uniqEvidence = (items: PlanPricingCarryEvidence[], max = 6): PlanPricingCarryEvidence[] => {
  const out: PlanPricingCarryEvidence[] = []
  for (const item of items) {
    const key = `${item.uploadId}:${item.sourcePageNumber}:${item.pageNumber}:${item.sheetNumber || ""}:${item.excerpt || ""}`
    if (!out.some((existing) => `${existing.uploadId}:${existing.sourcePageNumber}:${existing.pageNumber}:${existing.sheetNumber || ""}:${existing.excerpt || ""}` === key)) {
      out.push(item)
    }
    if (out.length >= max) break
  }
  return out
}

const normalize = (value: string): string => String(value || "").toLowerCase().trim()

const sectionLooksLikeGroup = (
  section: EstimateStructuredSection,
  group: PlanPricingCarryInput["groupedScopeReadback"][number]
): boolean => {
  const text = normalize(`${section.trade} ${section.section} ${section.label} ${section.notes.join(" ")} ${section.provenance?.summary || ""} ${section.provenance?.roomGroupBasis || ""}`)
  if (group.trades.some((trade) => normalize(trade) === normalize(section.trade))) return true
  if (group.groupKey === "guest_room_finish" && /guest|room|finish|paint|wallcover|floor/.test(text)) return true
  if (group.groupKey === "wet_area" && /wet|bath|tile|fixture|plumb|shower/.test(text)) return true
  if (group.groupKey === "corridor_common" && /corridor|common|public|lobby/.test(text)) return true
  if (group.groupKey === "ceiling_fixture" && /ceiling|fixture|device|electrical|light/.test(text)) return true
  if (group.groupKey === "demo_removal" && /demo|removal|remove|tear/.test(text)) return true
  return false
}

const supportTextForSection = (section: EstimateStructuredSection): "directly_carried" | "reinforced_or_embedded" =>
  section.estimatorTreatment === "embedded_burden" ||
  section.pricingBasis === "burden" ||
  section.provenance?.quantitySupport === "scaled_prototype" ||
  section.provenance?.quantitySupport === "support_only"
    ? "reinforced_or_embedded"
    : "directly_carried"

export function buildPlanPricingCarryReadback(args: {
  planReadback: PlanPricingCarryInput | null | undefined
  estimateSections: EstimateStructuredSection[] | null | undefined
}): PlanPricingCarryItem[] {
  const planReadback = args.planReadback
  if (!planReadback) return []

  const sections = args.estimateSections || []
  const items: PlanPricingCarryItem[] = []

  for (const section of sections) {
    const status = supportTextForSection(section)
    const matchedTrade = planReadback.tradeScopeReadback.find(
      (trade) => normalize(trade.trade) === normalize(section.trade)
    )
    const matchedGroup = planReadback.groupedScopeReadback.find((group) => sectionLooksLikeGroup(section, group))
    const supportKind =
      status === "directly_carried"
        ? "is carried as a direct priced section row"
        : "is carried as reinforced or embedded pricing support"
    const provenanceText = section.provenance?.summary
      ? ` Pricing basis: ${section.provenance.summary}`
      : ""

    items.push({
      key: `carried-${section.trade}-${section.section}-${section.estimatorTreatment}`,
      status,
      title: `${section.trade}: ${section.label}`,
      trade: section.trade,
      scopeGroupKey: matchedGroup?.groupKey || null,
      areaGroups: uniqStrings([
        ...(matchedTrade?.areaGroups || []),
        ...(matchedGroup?.areaGroups || []),
        section.provenance?.roomGroupBasis || "",
      ]),
      narration: `${section.trade} ${section.label} ${supportKind} for $${Math.round(Number(section.amount || 0)).toLocaleString()}.${provenanceText}`,
      amount: Number(section.amount || 0),
      quantity: section.quantity ?? null,
      unit: section.unit ?? null,
      evidence: uniqEvidence([...(matchedTrade?.evidence || []), ...(matchedGroup?.evidence || [])]),
    })
  }

  for (const trade of planReadback.tradeScopeReadback) {
    const hasDirectRow = sections.some(
      (section) =>
        normalize(section.trade) === normalize(trade.trade) &&
        section.estimatorTreatment === "section_row"
    )
    if (hasDirectRow) continue

    const status =
      trade.supportLevel === "direct" ? "not_carried_yet" : "confirmation_needed"
    const reason =
      trade.supportLevel === "direct"
        ? "Plan support is visible, but no direct pricing section row currently carries this trade."
        : "This trade remains reinforced/review-only and is not being treated as full priced scope yet."

    items.push({
      key: `not-carried-trade-${trade.trade}`,
      status,
      title: `${trade.trade} not directly carried`,
      trade: trade.trade,
      scopeGroupKey: null,
      areaGroups: uniqStrings(trade.areaGroups),
      narration: `${reason} ${trade.confirmationNotes[0] || trade.supportNarration[0] || trade.narration}`,
      amount: null,
      quantity: null,
      unit: null,
      evidence: uniqEvidence(trade.evidence),
    })
  }

  for (const group of planReadback.groupedScopeReadback) {
    const hasDirectGroupRow = sections.some(
      (section) => section.estimatorTreatment === "section_row" && sectionLooksLikeGroup(section, group)
    )
    if (hasDirectGroupRow) continue

    items.push({
      key: `not-carried-group-${group.groupKey}`,
      status: group.supportLevel === "direct" ? "not_carried_yet" : "confirmation_needed",
      title: `${group.title} not directly carried`,
      trade: group.trades[0] || null,
      scopeGroupKey: group.groupKey,
      areaGroups: uniqStrings(group.areaGroups),
      narration:
        group.supportLevel === "direct"
          ? `${group.title} has plan support, but no matching direct pricing row currently carries this scope group.`
          : `${group.title} remains ${group.supportLevel} support and should stay out of direct pricing rows until confirmed.`,
      amount: null,
      quantity: null,
      unit: null,
      evidence: uniqEvidence(group.evidence),
    })
  }

  for (const gap of planReadback.scopeGapReadback) {
    if (gap.status === "likely_ready") continue
    items.push({
      key: `confirmation-${gap.gapKey}`,
      status: "confirmation_needed",
      title: gap.title,
      trade: gap.trades[0] || null,
      scopeGroupKey: gap.scopeGroupKey,
      areaGroups: uniqStrings(gap.areaGroups),
      narration: `${gap.narration} Confirm before letting this change pricing confidence: ${gap.confirmationPrompt}`,
      amount: null,
      quantity: null,
      unit: null,
      evidence: uniqEvidence(gap.evidence),
    })
  }

  const order: Record<PlanPricingCarryItem["status"], number> = {
    directly_carried: 0,
    reinforced_or_embedded: 1,
    not_carried_yet: 2,
    confirmation_needed: 3,
  }

  return items
    .filter((item, index, all) => all.findIndex((other) => other.key === item.key) === index)
    .sort((a, b) => order[a.status] - order[b.status])
    .slice(0, 14)
}
