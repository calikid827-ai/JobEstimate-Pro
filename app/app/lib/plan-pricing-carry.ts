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

export type PlanEstimatorStoryInput = PlanPricingCarryInput & {
  headline?: string
  estimatorFlowReadback?: Array<{
    stepKey: string
    title: string
    narration: string
    supportLevel: "direct" | "reinforced" | "review"
    evidence: PlanPricingCarryEvidence[]
  }>
  areaQuantityReadback?: Array<{
    areaGroup: string
    supportLevel: "direct" | "reinforced" | "review"
    narration: string
    quantityNarration: string[]
    scopeNotes: string[]
    evidence: PlanPricingCarryEvidence[]
  }>
}

export type PlanEstimatorStorySection = {
  key: string
  title: string
  supportLabel: "direct" | "reinforced" | "review" | "mixed"
  summary: string
  bullets: string[]
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

const sentence = (value: string): string => {
  const text = String(value || "").trim()
  if (!text) return ""
  return /[.!?]$/.test(text) ? text : `${text}.`
}

const supportRank: Record<"direct" | "reinforced" | "review", number> = {
  direct: 0,
  reinforced: 1,
  review: 2,
}

const mixedSupport = (levels: Array<"direct" | "reinforced" | "review">): PlanEstimatorStorySection["supportLabel"] => {
  const unique = Array.from(new Set(levels))
  if (unique.length === 1) return unique[0]
  return "mixed"
}

const strongestSupport = (levels: Array<"direct" | "reinforced" | "review">): PlanEstimatorStorySection["supportLabel"] => {
  const filtered = levels.filter(Boolean)
  if (filtered.length === 0) return "review"
  return filtered.sort((a, b) => supportRank[a] - supportRank[b])[0]
}

const flowStep = (
  planReadback: PlanEstimatorStoryInput,
  key: string
): NonNullable<PlanEstimatorStoryInput["estimatorFlowReadback"]>[number] | undefined =>
  (planReadback.estimatorFlowReadback || []).find((step) => step.stepKey === key)

const addStorySection = (
  sections: PlanEstimatorStorySection[],
  section: PlanEstimatorStorySection
) => {
  const bullets = uniqStrings(section.bullets.map(sentence).filter(Boolean), 5)
  const summary = sentence(section.summary)
  if (!summary && bullets.length === 0) return
  sections.push({
    ...section,
    summary,
    bullets,
    evidence: uniqEvidence(section.evidence),
  })
}

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

export function buildPlanEstimatorStorySections(args: {
  planReadback: PlanEstimatorStoryInput | null | undefined
  pricingCarryReadback: PlanPricingCarryItem[]
}): PlanEstimatorStorySection[] {
  const planReadback = args.planReadback
  if (!planReadback) return []

  const sections: PlanEstimatorStorySection[] = []
  const selectedSheets = flowStep(planReadback, "selected_sheets")
  const affectedSpaces = flowStep(planReadback, "affected_spaces")
  const tradePaths = flowStep(planReadback, "trade_paths")
  const scopeGroups = flowStep(planReadback, "scope_groups")
  const supportedQuantities = flowStep(planReadback, "supported_quantities")
  const pricingCarry = flowStep(planReadback, "pricing_carry")
  const confirmations = flowStep(planReadback, "confirmations")

  addStorySection(sections, {
    key: "selected_sheets",
    title: "What the selected sheets appear to show",
    supportLabel: selectedSheets?.supportLevel || "review",
    summary: selectedSheets?.narration || planReadback.headline || "",
    bullets: [
      ...(planReadback.groupedScopeReadback || []).slice(0, 2).map((group) => group.narration),
    ],
    evidence: selectedSheets?.evidence || [],
  })

  addStorySection(sections, {
    key: "affected_spaces",
    title: "Where the work appears to apply",
    supportLabel: mixedSupport((planReadback.areaQuantityReadback || []).map((area) => area.supportLevel)),
    summary: affectedSpaces?.narration || "",
    bullets: (planReadback.areaQuantityReadback || []).slice(0, 4).map((area) => {
      const quantities = area.quantityNarration.length ? ` ${area.quantityNarration.slice(0, 2).join(" ")}` : ""
      const notes = area.scopeNotes.length ? ` ${area.scopeNotes[0]}` : ""
      return `${area.areaGroup}: ${area.narration}${quantities}${notes}`
    }),
    evidence: uniqEvidence([
      ...(affectedSpaces?.evidence || []),
      ...(planReadback.areaQuantityReadback || []).flatMap((area) => area.evidence),
    ]),
  })

  addStorySection(sections, {
    key: "trade_paths",
    title: "Trades and scope paths",
    supportLabel: mixedSupport((planReadback.tradeScopeReadback || []).map((trade) => trade.supportLevel)),
    summary: tradePaths?.narration || "",
    bullets: (planReadback.tradeScopeReadback || []).slice(0, 5).map((trade) => {
      const areas = trade.areaGroups.length ? ` Areas: ${trade.areaGroups.slice(0, 3).join(", ")}.` : ""
      const quantities = trade.quantityNarration.length ? ` ${trade.quantityNarration.slice(0, 2).join(" ")}` : ""
      const confirmationsText = trade.confirmationNotes.length ? ` Confirmation: ${trade.confirmationNotes[0]}` : ""
      return `${trade.trade} (${trade.role}, ${trade.supportLevel} support): ${trade.narration}${areas}${quantities}${confirmationsText}`
    }),
    evidence: uniqEvidence([
      ...(tradePaths?.evidence || []),
      ...(planReadback.tradeScopeReadback || []).flatMap((trade) => trade.evidence),
    ]),
  })

  addStorySection(sections, {
    key: "scope_groups",
    title: "How the work organizes before pricing",
    supportLabel: mixedSupport((planReadback.groupedScopeReadback || []).map((group) => group.supportLevel)),
    summary: scopeGroups?.narration || "",
    bullets: (planReadback.groupedScopeReadback || []).slice(0, 5).map((group) => {
      const trades = group.trades.length ? ` Trades: ${group.trades.slice(0, 4).join(", ")}.` : ""
      const direct = group.directSupport.length ? ` Direct: ${group.directSupport[0]}` : ""
      const reinforced = group.reinforcedSupport.length ? ` Reinforced: ${group.reinforcedSupport[0]}` : ""
      const confirm = group.confirmationNotes.length ? ` Confirm: ${group.confirmationNotes[0]}` : ""
      return `${group.title} (${group.role}, ${group.supportLevel} support): ${group.narration}${trades}${direct}${reinforced}${confirm}`
    }),
    evidence: uniqEvidence([
      ...(scopeGroups?.evidence || []),
      ...(planReadback.groupedScopeReadback || []).flatMap((group) => group.evidence),
    ]),
  })

  const quantityBullets = uniqStrings([
    ...(planReadback.areaQuantityReadback || []).flatMap((area) =>
      area.quantityNarration.map((item) => `${area.areaGroup}: ${item}`)
    ),
    ...(planReadback.tradeScopeReadback || []).flatMap((trade) =>
      trade.quantityNarration.map((item) => `${trade.trade}: ${item}`)
    ),
    ...(planReadback.groupedScopeReadback || []).flatMap((group) =>
      group.directSupport.map((item) => `${group.title}: ${item}`)
    ),
  ], 5)

  addStorySection(sections, {
    key: "supported_quantities",
    title: "Quantities and supports the sheets can carry",
    supportLabel: supportedQuantities?.supportLevel || strongestSupport((planReadback.areaQuantityReadback || []).map((area) => area.supportLevel)),
    summary: supportedQuantities?.narration || "Direct quantities stay limited to the supports shown in the selected sheets.",
    bullets: quantityBullets.length
      ? quantityBullets
      : ["No broader measured total is being inferred from schedule-only, elevation-only, or prototype support."],
    evidence: supportedQuantities?.evidence || [],
  })

  const carryItems = args.pricingCarryReadback || []
  const directlyCarried = carryItems.filter((item) => item.status === "directly_carried")
  const reinforced = carryItems.filter((item) => item.status === "reinforced_or_embedded")
  const notCarried = carryItems.filter((item) => item.status === "not_carried_yet")
  const confirmationNeeded = carryItems.filter((item) => item.status === "confirmation_needed")
  addStorySection(sections, {
    key: "pricing_carry",
    title: "What pricing is currently carrying",
    supportLabel: directlyCarried.length > 0 && (notCarried.length > 0 || confirmationNeeded.length > 0) ? "mixed" : pricingCarry?.supportLevel || "review",
    summary:
      pricingCarry?.narration ||
      `${directlyCarried.length} directly carried item(s), ${reinforced.length} reinforced or embedded item(s), ${notCarried.length} not-carried-yet item(s), and ${confirmationNeeded.length} confirmation item(s).`,
    bullets: [
      ...directlyCarried.slice(0, 3).map((item) => `${item.title}: ${item.narration}`),
      ...reinforced.slice(0, 2).map((item) => `${item.title}: ${item.narration}`),
      ...notCarried.slice(0, 2).map((item) => `${item.title}: ${item.narration}`),
      ...confirmationNeeded.slice(0, 2).map((item) => `${item.title}: ${item.narration}`),
    ],
    evidence: uniqEvidence(carryItems.flatMap((item) => item.evidence)),
  })

  addStorySection(sections, {
    key: "confirmations",
    title: "What still needs estimator confirmation",
    supportLabel: "review",
    summary: confirmations?.narration || "",
    bullets: [
      ...(planReadback.scopeGapReadback || [])
        .filter((gap) => gap.status !== "likely_ready")
        .slice(0, 5)
        .map((gap) => `${gap.title}: ${gap.narration} Confirm: ${gap.confirmationPrompt}`),
      ...confirmationNeeded.slice(0, 3).map((item) => `${item.title}: ${item.narration}`),
    ],
    evidence: uniqEvidence([
      ...(confirmations?.evidence || []),
      ...(planReadback.scopeGapReadback || []).flatMap((gap) => gap.evidence),
      ...confirmationNeeded.flatMap((item) => item.evidence),
    ]),
  })

  return sections.slice(0, 7)
}
