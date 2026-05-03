"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  FREE_LIMIT,
  EMAIL_KEY,
  COMPANY_KEY,
  JOB_KEY,
  INVOICE_KEY,
  HISTORY_KEY,
  BUDGET_KEY,
  ACTUALS_KEY,
  CREW_KEY,
  JOBS_KEY,
  PAINT_SCOPE_OPTIONS,
} from "./lib/constants"

import type {
  PaintScope,
  EffectivePaintScope,
  DocumentType,
  MeasureRow,
  EstimateEmbeddedBurden,
  EstimateRow,
  EstimateStructuredSection,
  Invoice,
  JobBudget,
  JobActuals,
  Job,
  PricingSource,
  PriceGuardReport,
  Schedule,
  UiTrade,
  EstimateHistoryItem,
  WeekLoad,
  ScopeSignals,
  PhotoAnalysis,
  PhotoScopeAssist,
  MaterialsList,
  AreaScopeBreakdown,
  ProfitProtection,
  ScopeXRay,
  MissedScopeDetector,
  ProfitLeakDetector,
  EstimateDefenseMode,
  EstimateSkeletonHandoff,
  EstimateStructureConsumption,
  TradePricingPrepAnalysis,
  TierAInsightItem,
  ChangeOrderDetection,
} from "./lib/types"

import {
  normalizeTrade,
  money,
  normalizeInvoiceStatus,
  computeLiveInvoiceStatus,
  computeDepositFromEstimateTotal,
  computeTaxAmountFromEstimate,
  estimateTotalWithTax,
  estimateSubtotalBeforeTax,
  startOfWeek,
  addDays,
  isoDay,
  completionEndFromSchedule,
  daysBetween,
  formatDelta,
  formatSignedNumber,
  buildActualsPatch,
  explainEstimateChanges,
  estimateDirectCost,
  computeProfitProtectionFromTotals,
  nextChangeOrderNumber,
  buildProfitProtectionFromPricing,
  buildEstimateBreakdown,
  buildAssumptionsList,
  buildEstimateConfidence,
  normalizeProfitProtection,
} from "./lib/estimate-utils"
import {
  getEstimateSectionTreatmentLabel,
  resolveCanonicalEstimateOutput,
} from "./lib/estimate-sections"
import {
  buildPlanEstimatorStorySections,
  buildPlanPricingCarryReadback,
} from "./lib/plan-pricing-carry"
import { buildInvoiceFromEstimate } from "./lib/invoices"

import { getPricingMemory } from "./lib/ai-pricing-memory"
import { compareEstimateToHistory } from "./lib/price-guard"
import { checkScopeQuality } from "./lib/scope-quality-check"
import SavedEstimatesSection from "./components/SavedEstimatesSection"
import JobsDashboardSection from "./components/JobsDashboardSection"
import EstimateBuilderSection from "./components/EstimateBuilderSection"
import InvoicesSection from "./components/InvoicesSection"
import PricingSummarySection from "./components/PricingSummarySection"
import PhotoIntelligenceCard from "./components/PhotoIntelligenceCard"
import { detectChangeOrder } from "./lib/change-order-detector"
import {
  getGenerateExceptionMessage,
  readGenerateResponseErrorMessage,
} from "../lib/generate-response"
import {
  ALLOWED_PLAN_MIME_TYPES,
  buildSelectedPageUploadDebugSummary,
  buildSelectedPageUploadFallbackMessage,
  buildLocalPlanPageSelection,
  exportSelectedPdfInBrowser,
  estimateSelectedPdfBytes,
  getErrorMessage,
  getLocalPlanSourcePageCount,
  getPlanUploadPreflightIssue,
  getPlanSelectionIntakeIssue,
  getPlanSourceKind,
  isSelectedPageExportCapacityError,
  MAX_JOB_PLANS,
  MAX_PLAN_SOURCE_PAGES,
  MAX_TOTAL_PLAN_FILE_BYTES,
  PLAN_SELECTION_INDEXING_STATUS,
  PLAN_UPLOAD_CHUNK_BYTES,
  PlanSelectedPageUploadMode,
  readPlanUploadStageErrorMessage,
} from "../lib/plan-upload"

type ShotType =
  | "overview"
  | "corner"
  | "wall"
  | "ceiling"
  | "floor"
  | "fixture"
  | "damage"
  | "measurement"

type PhotoReferenceKind = "none" | "custom"

type JobPhoto = {
  id: string
  name: string
  dataUrl: string
  roomTag: string
  shotType: ShotType
  note: string
  reference: {
    kind: PhotoReferenceKind
    label: string
    realWidthIn: number | null
  }
}

type JobPlan = {
  id: string
  name: string
  file: File
  stagedUploadId?: string | null
  note: string
  mimeType: string
  sourceKind: "image" | "pdf"
  bytes: number
  originalBytes: number
  sourcePageCount: number
  stagedSourcePageCount?: number | null
  selectedPageUploadMode?: PlanSelectedPageUploadMode
  selectedPageUploadNote?: string | null
  pages: Array<{
    sourcePageNumber: number
    label: string
    selected: boolean
  }>
}

type PlanIntelligence = {
  summary?: string | null
  planReadback?: {
    headline: string
    estimatorFlowReadback: Array<{
      stepKey: string
      title: string
      narration: string
      supportLevel: "direct" | "reinforced" | "review"
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    sheetNarration: Array<{
      sheetNumber: string | null
      sheetTitle: string | null
      sourcePageNumber: number
      pageNumber: number
      discipline: string
      narration: string
      detectedTrades: string[]
      detectedRooms: string[]
      supportLevel: "direct" | "reinforced" | "review"
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    tradeNarration: Array<{
      trade: string
      confidence: "likely primary" | "supporting" | "review only"
      narration: string
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
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
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
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
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
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
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    areaNarration: string[]
    areaQuantityReadback: Array<{
      areaGroup: string
      areaType:
        | "guest_room"
        | "bathroom_wet_area"
        | "corridor"
        | "common_area"
        | "ceiling_fixture_zone"
        | "demo_removal_zone"
        | "general_area"
      supportLevel: "direct" | "reinforced" | "review"
      narration: string
      quantityNarration: string[]
      scopeNotes: string[]
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    directlySupported: Array<{
      text: string
      supportLevel: "direct" | "reinforced" | "review"
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    reinforcedByCrossSheet: Array<{
      text: string
      supportLevel: "direct" | "reinforced" | "review"
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    needsConfirmation: Array<{
      text: string
      supportLevel: "direct" | "reinforced" | "review"
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
    packageReadback: Array<{
      key: string
      title: string
      narration: string
      supportLevel: "direct" | "reinforced" | "review"
      evidence: Array<{
        uploadId: string
        uploadName: string
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
        excerpt: string
        confidence: number
      }>
    }>
  }
  estimatorPackages?: Array<{
    key: string
    title: string
    primaryTrade: string
    roomGroup: string | null
    supportType:
      | "quantity_backed"
      | "schedule_backed"
      | "elevation_only"
      | "demo_only"
      | "scaled_prototype"
      | "support_only"
    scopeBreadth: "broad" | "narrow"
    confidenceLabel: "strong" | "moderate" | "limited"
    quantitySummary: string | null
    scheduleSummary: string | null
    executionNotes: string[]
    cautionNotes: string[]
    evidence: Array<{
      uploadId: string
      uploadName: string
      sourcePageNumber: number
      pageNumber: number
      sheetNumber: string | null
      sheetTitle: string | null
      excerpt: string
      confidence: number
    }>
  }>
  detectedRooms: string[]
  detectedTrades: string[]
  sheetRoleSignals?: string[]
  prototypeSignals?: string[]
  repeatScalingSignals?: string[]
  packageGroupingSignals?: string[]
  bidStrategyNotes?: string[]
  highValueSheetSignals?: string[]
  pricingAnchorSignals?: string[]
  bidCoverageGaps?: string[]
  estimatingPrioritySignals?: string[]
  bidExecutionNotes?: string[]
  pricingPackageSignals?: string[]
  prototypePackageSignals?: string[]
  packageScopeCandidates?: string[]
  packageScalingGuidance?: string[]
  packageConfidenceNotes?: string[]
  estimatingFrameworkNotes?: string[]
  estimateStructureSignals?: string[]
  estimatePackageCandidates?: string[]
  packageTradeScopeSignals?: string[]
  packagePricingBasisSignals?: string[]
  packageAllowanceSignals?: string[]
  estimateAssemblyGuidance?: string[]
  estimateScaffoldNotes?: string[]
  repeatedSpaceSignals?: string[]
  likelyRoomTypes?: string[]
  scalableScopeSignals?: string[]
  tradePackageSignals?: string[]
  bidAssistNotes?: string[]
  scopeAssist: {
    missingScopeFlags: string[]
    suggestedAdditions: string[]
  }
} | null

type PlanEstimatorPackageView = NonNullable<PlanIntelligence> extends infer T
  ? T extends { estimatorPackages?: Array<infer P> }
    ? P
    : never
  : never

type PlanReadbackView = NonNullable<PlanIntelligence> extends infer T
  ? T extends { planReadback?: infer R }
    ? NonNullable<R>
    : never
  : never

const normalizePlanStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((x: unknown) => String(x).trim()).filter(Boolean)
    : []

const normalizePlanEvidence = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((ref: unknown) => {
          const evidence = ref && typeof ref === "object" ? (ref as Record<string, unknown>) : null
          if (!evidence || typeof evidence.uploadId !== "string") return null
          return {
            uploadId: evidence.uploadId,
            uploadName: typeof evidence.uploadName === "string" ? evidence.uploadName : "",
            sourcePageNumber: Number(evidence.sourcePageNumber || 0),
            pageNumber: Number(evidence.pageNumber || 0),
            sheetNumber: typeof evidence.sheetNumber === "string" ? evidence.sheetNumber : null,
            sheetTitle: typeof evidence.sheetTitle === "string" ? evidence.sheetTitle : null,
            excerpt: typeof evidence.excerpt === "string" ? evidence.excerpt : "",
            confidence: Number(evidence.confidence || 0),
          }
        })
        .filter((ref): ref is PlanEstimatorPackageView["evidence"][number] => ref !== null)
    : []

const normalizePlanReadbackSupport = (value: unknown): "direct" | "reinforced" | "review" =>
  value === "direct" || value === "reinforced" || value === "review" ? value : "review"

const normalizePlanReadbackItems = (value: unknown): PlanReadbackView["directlySupported"] =>
  Array.isArray(value)
    ? value
        .map((item: unknown) => {
          const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null
          const text = typeof record?.text === "string" ? record.text.trim() : ""
          if (!text) return null
          return {
            text,
            supportLevel: normalizePlanReadbackSupport(record?.supportLevel),
            evidence: normalizePlanEvidence(record?.evidence),
          }
        })
        .filter((item): item is PlanReadbackView["directlySupported"][number] => item !== null)
    : []

const normalizePlanReadback = (value: unknown): PlanReadbackView | undefined => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null
  if (!record) return undefined

  return {
    headline: typeof record.headline === "string" ? record.headline.trim() : "",
    estimatorFlowReadback: Array.isArray(record.estimatorFlowReadback)
      ? record.estimatorFlowReadback
          .map((item: unknown) => {
            const step = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const stepKey = typeof step?.stepKey === "string" ? step.stepKey.trim() : ""
            const title = typeof step?.title === "string" ? step.title.trim() : ""
            const narration = typeof step?.narration === "string" ? step.narration.trim() : ""
            if (!stepKey || !title || !narration) return null
            return {
              stepKey,
              title,
              narration,
              supportLevel: normalizePlanReadbackSupport(step?.supportLevel),
              evidence: normalizePlanEvidence(step?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["estimatorFlowReadback"][number] => item !== null)
      : [],
    sheetNarration: Array.isArray(record.sheetNarration)
      ? record.sheetNarration
          .map((item: unknown) => {
            const sheet = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const narration = typeof sheet?.narration === "string" ? sheet.narration.trim() : ""
            if (!narration) return null
            return {
              sheetNumber: typeof sheet?.sheetNumber === "string" ? sheet.sheetNumber : null,
              sheetTitle: typeof sheet?.sheetTitle === "string" ? sheet.sheetTitle : null,
              sourcePageNumber: Number(sheet?.sourcePageNumber || 0),
              pageNumber: Number(sheet?.pageNumber || 0),
              discipline: typeof sheet?.discipline === "string" ? sheet.discipline : "unknown",
              narration,
              detectedTrades: normalizePlanStrings(sheet?.detectedTrades),
              detectedRooms: normalizePlanStrings(sheet?.detectedRooms),
              supportLevel: normalizePlanReadbackSupport(sheet?.supportLevel),
              evidence: normalizePlanEvidence(sheet?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["sheetNarration"][number] => item !== null)
      : [],
    tradeNarration: Array.isArray(record.tradeNarration)
      ? record.tradeNarration
          .map((item: unknown) => {
            const trade = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const narration = typeof trade?.narration === "string" ? trade.narration.trim() : ""
            const tradeName = typeof trade?.trade === "string" ? trade.trade.trim() : ""
            if (!narration || !tradeName) return null
            return {
              trade: tradeName,
              confidence:
                trade?.confidence === "likely primary" ||
                trade?.confidence === "supporting" ||
                trade?.confidence === "review only"
                  ? trade.confidence
                  : "review only",
              narration,
              evidence: normalizePlanEvidence(trade?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["tradeNarration"][number] => item !== null)
      : [],
    tradeScopeReadback: Array.isArray(record.tradeScopeReadback)
      ? record.tradeScopeReadback
          .map((item: unknown) => {
            const trade = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const tradeName = typeof trade?.trade === "string" ? trade.trade.trim() : ""
            const narration = typeof trade?.narration === "string" ? trade.narration.trim() : ""
            if (!tradeName || !narration) return null
            return {
              trade: tradeName,
              role:
                trade?.role === "likely primary" ||
                trade?.role === "supporting" ||
                trade?.role === "review only"
                  ? trade.role
                  : "review only",
              supportLevel: normalizePlanReadbackSupport(trade?.supportLevel),
              phaseTypes: normalizePlanStrings(trade?.phaseTypes),
              areaGroups: normalizePlanStrings(trade?.areaGroups),
              narration,
              quantityNarration: normalizePlanStrings(trade?.quantityNarration),
              supportNarration: normalizePlanStrings(trade?.supportNarration),
              confirmationNotes: normalizePlanStrings(trade?.confirmationNotes),
              evidence: normalizePlanEvidence(trade?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["tradeScopeReadback"][number] => item !== null)
      : [],
    groupedScopeReadback: Array.isArray(record.groupedScopeReadback)
      ? record.groupedScopeReadback
          .map((item: unknown) => {
            const group = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const groupKey = typeof group?.groupKey === "string" ? group.groupKey.trim() : ""
            const title = typeof group?.title === "string" ? group.title.trim() : ""
            const narration = typeof group?.narration === "string" ? group.narration.trim() : ""
            if (!groupKey || !title || !narration) return null
            return {
              groupKey,
              title,
              role:
                group?.role === "primary" ||
                group?.role === "supporting" ||
                group?.role === "review only"
                  ? group.role
                  : "review only",
              supportLevel: normalizePlanReadbackSupport(group?.supportLevel),
              scopeCharacter: normalizePlanStrings(group?.scopeCharacter),
              trades: normalizePlanStrings(group?.trades),
              areaGroups: normalizePlanStrings(group?.areaGroups),
              narration,
              directSupport: normalizePlanStrings(group?.directSupport),
              reinforcedSupport: normalizePlanStrings(group?.reinforcedSupport),
              confirmationNotes: normalizePlanStrings(group?.confirmationNotes),
              evidence: normalizePlanEvidence(group?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["groupedScopeReadback"][number] => item !== null)
      : [],
    scopeGapReadback: Array.isArray(record.scopeGapReadback)
      ? record.scopeGapReadback
          .map((item: unknown) => {
            const gap = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const gapKey = typeof gap?.gapKey === "string" ? gap.gapKey.trim() : ""
            const title = typeof gap?.title === "string" ? gap.title.trim() : ""
            const narration = typeof gap?.narration === "string" ? gap.narration.trim() : ""
            const confirmationPrompt =
              typeof gap?.confirmationPrompt === "string" ? gap.confirmationPrompt.trim() : ""
            if (!gapKey || !title || !narration || !confirmationPrompt) return null
            const status =
              gap?.status === "likely_ready" ||
              gap?.status === "needs_confirmation" ||
              gap?.status === "missing_or_incomplete" ||
              gap?.status === "risky_assumption"
                ? gap.status
                : "needs_confirmation"
            return {
              gapKey,
              title,
              status,
              scopeGroupKey: typeof gap?.scopeGroupKey === "string" ? gap.scopeGroupKey : null,
              trades: normalizePlanStrings(gap?.trades),
              areaGroups: normalizePlanStrings(gap?.areaGroups),
              narration,
              confirmationPrompt,
              evidence: normalizePlanEvidence(gap?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["scopeGapReadback"][number] => item !== null)
      : [],
    areaNarration: normalizePlanStrings(record.areaNarration),
    areaQuantityReadback: Array.isArray(record.areaQuantityReadback)
      ? record.areaQuantityReadback
          .map((item: unknown) => {
            const area = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const areaGroup = typeof area?.areaGroup === "string" ? area.areaGroup.trim() : ""
            const narration = typeof area?.narration === "string" ? area.narration.trim() : ""
            if (!areaGroup || !narration) return null
            const areaType =
              area?.areaType === "guest_room" ||
              area?.areaType === "bathroom_wet_area" ||
              area?.areaType === "corridor" ||
              area?.areaType === "common_area" ||
              area?.areaType === "ceiling_fixture_zone" ||
              area?.areaType === "demo_removal_zone" ||
              area?.areaType === "general_area"
                ? area.areaType
                : "general_area"
            return {
              areaGroup,
              areaType,
              supportLevel: normalizePlanReadbackSupport(area?.supportLevel),
              narration,
              quantityNarration: normalizePlanStrings(area?.quantityNarration),
              scopeNotes: normalizePlanStrings(area?.scopeNotes),
              evidence: normalizePlanEvidence(area?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["areaQuantityReadback"][number] => item !== null)
      : [],
    directlySupported: normalizePlanReadbackItems(record.directlySupported),
    reinforcedByCrossSheet: normalizePlanReadbackItems(record.reinforcedByCrossSheet),
    needsConfirmation: normalizePlanReadbackItems(record.needsConfirmation),
    packageReadback: Array.isArray(record.packageReadback)
      ? record.packageReadback
          .map((item: unknown) => {
            const pkg = item && typeof item === "object" ? (item as Record<string, unknown>) : null
            const narration = typeof pkg?.narration === "string" ? pkg.narration.trim() : ""
            const key = typeof pkg?.key === "string" ? pkg.key.trim() : ""
            const title = typeof pkg?.title === "string" ? pkg.title.trim() : ""
            if (!narration || !key || !title) return null
            return {
              key,
              title,
              narration,
              supportLevel: normalizePlanReadbackSupport(pkg?.supportLevel),
              evidence: normalizePlanEvidence(pkg?.evidence),
            }
          })
          .filter((item): item is PlanReadbackView["packageReadback"][number] => item !== null)
      : [],
  }
}

const normalizePlanPackages = (value: unknown): PlanEstimatorPackageView[] =>
  Array.isArray(value)
    ? value
        .map((item: unknown): PlanEstimatorPackageView | null => {
          const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null
          if (!record || typeof record.key !== "string" || typeof record.title !== "string") {
            return null
          }

          return {
            key: record.key.trim(),
            title: record.title.trim(),
            primaryTrade:
              typeof record.primaryTrade === "string" && record.primaryTrade.trim()
                ? record.primaryTrade.trim()
                : "general renovation",
            roomGroup:
              typeof record.roomGroup === "string" && record.roomGroup.trim()
                ? record.roomGroup.trim()
                : null,
            supportType:
              record.supportType === "quantity_backed" ||
              record.supportType === "schedule_backed" ||
              record.supportType === "elevation_only" ||
              record.supportType === "demo_only" ||
              record.supportType === "scaled_prototype" ||
              record.supportType === "support_only"
                ? record.supportType
                : "support_only",
            scopeBreadth: record.scopeBreadth === "narrow" ? "narrow" : "broad",
            confidenceLabel:
              record.confidenceLabel === "strong" ||
              record.confidenceLabel === "moderate" ||
              record.confidenceLabel === "limited"
                ? record.confidenceLabel
                : "limited",
            quantitySummary:
              typeof record.quantitySummary === "string" && record.quantitySummary.trim()
                ? record.quantitySummary.trim()
                : null,
            scheduleSummary:
              typeof record.scheduleSummary === "string" && record.scheduleSummary.trim()
                ? record.scheduleSummary.trim()
                : null,
            executionNotes: normalizePlanStrings(record.executionNotes),
            cautionNotes: normalizePlanStrings(record.cautionNotes),
            evidence: Array.isArray(record.evidence)
              ? record.evidence
                  .map((ref: unknown) => {
                    const evidence = ref && typeof ref === "object" ? (ref as Record<string, unknown>) : null
                    if (!evidence || typeof evidence.uploadId !== "string") return null
                    return {
                      uploadId: evidence.uploadId,
                      uploadName: typeof evidence.uploadName === "string" ? evidence.uploadName : "",
                      sourcePageNumber: Number(evidence.sourcePageNumber || 0),
                      pageNumber: Number(evidence.pageNumber || 0),
                      sheetNumber: typeof evidence.sheetNumber === "string" ? evidence.sheetNumber : null,
                      sheetTitle: typeof evidence.sheetTitle === "string" ? evidence.sheetTitle : null,
                      excerpt: typeof evidence.excerpt === "string" ? evidence.excerpt : "",
                      confidence: Number(evidence.confidence || 0),
                    }
                  })
                  .filter((ref): ref is PlanEstimatorPackageView["evidence"][number] => ref !== null)
              : [],
          }
        })
        .filter((pkg): pkg is PlanEstimatorPackageView => pkg !== null)
    : []

type PlanEstimateSkeletonHandoff = EstimateSkeletonHandoff
type PlanEstimateStructureConsumption = EstimateStructureConsumption

const SHOT_TYPE_OPTIONS: Array<{ value: ShotType; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "corner", label: "Corner" },
  { value: "wall", label: "Wall" },
  { value: "ceiling", label: "Ceiling" },
  { value: "floor", label: "Floor" },
  { value: "fixture", label: "Fixture / Detail" },
  { value: "damage", label: "Damage / Problem Area" },
  { value: "measurement", label: "Measurement Reference" },
]

const ROOM_TAG_SUGGESTIONS = [
  "Living room",
  "Kitchen",
  "Bathroom",
  "Primary bathroom",
  "Bedroom",
  "Primary bedroom",
  "Hallway",
  "Laundry",
  "Entry",
  "Closet",
  "Exterior",
] as const

export default function Home() {
const generatingRef = useRef(false)
const entitlementReqId = useRef(0)
const lastSavedEstimateIdRef = useRef<string | null>(null)
const invoicesSectionRef = useRef<HTMLDivElement | null>(null)

const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([])
const [jobPlans, setJobPlans] = useState<JobPlan[]>([])

function scrollToInvoices() {
  // small delay so UI can render filtered invoices after setting activeJobId
  setTimeout(() => {
    invoicesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, 50)
}

const MAX_JOB_PHOTOS = 8
const MAX_PHOTO_DATAURL_LENGTH = 450_000
const MAX_TOTAL_PHOTO_PAYLOAD = 3_200_000

function estimatePhotoPayloadLength(
  photos: { dataUrl: string }[]
): number {
  return photos.reduce((sum, p) => sum + (p.dataUrl?.length || 0), 0)
}

function estimatePlanFileBytes(
  plans: { bytes: number }[]
): number {
  return plans.reduce((sum, p) => sum + (Number(p.bytes) || 0), 0)
}

function countSelectedPlanPages(plan: JobPlan): number {
  return plan.pages.filter((page) => page.selected).length
}

function estimatePlanTransportBytes(plan: JobPlan): number {
  if (plan.sourceKind !== "pdf") return plan.bytes

  const selectedPages = countSelectedPlanPages(plan)
  if (!selectedPages) return 0

  if (selectedPages >= plan.sourcePageCount) return plan.bytes

  return estimateSelectedPdfBytes({
    originalBytes: plan.bytes,
    selectedPages,
    totalPages: plan.sourcePageCount,
  })
}

function getPlanPreflightIssue(plan: JobPlan): string | null {
  return getPlanUploadPreflightIssue({
    name: plan.name,
    sourceKind: plan.sourceKind,
    originalBytes: plan.bytes,
    totalPages: plan.sourcePageCount,
    selectedPages: countSelectedPlanPages(plan),
  })
}

async function readStageResponseMessage(response: Response): Promise<string> {
  return await readPlanUploadStageErrorMessage(response.clone())
}

async function stagePlanForGenerate(
  plan: JobPlan,
  onProgress: (message: string) => void
): Promise<{
  stagedUploadId: string
  bytes: number
  originalBytes: number
  sourcePageCount: number | null
  originalSourcePageCount: number | null
  selectedPageUploadMode?: PlanSelectedPageUploadMode
  selectedPageUploadNote?: string | null
}> {
  const selectedSourcePages = plan.pages
    .filter((page) => page.selected)
    .map((page) => page.sourcePageNumber)

  let uploadFile = plan.file
  let uploadBytes = plan.file.size
  let uploadSourcePageCount = plan.sourcePageCount
  let uploadSourcePageNumberMap: number[] | null = null
  let uploadMode: PlanSelectedPageUploadMode = "original"
  let uploadNote: string | null = null

  if (
    plan.sourceKind === "pdf" &&
    selectedSourcePages.length > 0 &&
    selectedSourcePages.length < plan.sourcePageCount
  ) {
    onProgress(
      `${plan.name}: preparing ${selectedSourcePages.length} selected PDF page(s) for browser-side reduction before upload...`
    )
    try {
      const browserDerived = await exportSelectedPdfInBrowser({
        file: plan.file,
        selectedSourcePages,
      })

      if (browserDerived) {
        uploadFile = browserDerived.file
        uploadBytes = browserDerived.bytes
        uploadSourcePageCount = browserDerived.sourcePageNumberMap.length
        uploadSourcePageNumberMap = browserDerived.sourcePageNumberMap
        uploadMode = "browser-derived-selected-pages"
        uploadNote = `${plan.name}: selected-page PDF was reduced in the browser before upload.`
      } else {
        uploadMode = "original-fallback"
        uploadNote = buildSelectedPageUploadFallbackMessage({
          name: plan.name,
          selectedPages: selectedSourcePages.length,
          totalPages: plan.sourcePageCount,
        })
      }
    } catch (error) {
      console.error("Browser selected-page PDF export failed:", error)
      if (isSelectedPageExportCapacityError(error)) {
        throw new Error(getErrorMessage(error))
      }
      uploadMode = "original-fallback"
      uploadNote = `${plan.name}: browser-side selected-page PDF export failed (${getErrorMessage(error)}), so the original PDF will upload through reliable chunked staging before selected-page extraction.`
    }
  }

  const beginRes = await fetch("/api/plan-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "begin",
      uploadId: plan.id,
      name: plan.name,
      mimeType: plan.mimeType,
      bytes: uploadBytes,
      originalBytes: plan.file.size,
      sourcePageCount: uploadSourcePageCount,
      originalSourcePageCount: plan.sourcePageCount,
      sourcePageNumberMap: uploadSourcePageNumberMap,
      selectedPageUploadMode: uploadMode,
      selectedSourcePages,
    }),
  })

  const beginPayload = await beginRes.json().catch(() => null)
  if (!beginRes.ok || beginPayload?.ok !== true || !beginPayload?.uploadSessionId) {
    throw new Error(
      typeof beginPayload?.message === "string" && beginPayload.message.trim()
        ? beginPayload.message.trim()
        : await readStageResponseMessage(beginRes)
    )
  }

  const uploadSessionId = String(beginPayload.uploadSessionId)
  const chunkBytes =
    Number(beginPayload.chunkBytes) > 0 ? Number(beginPayload.chunkBytes) : PLAN_UPLOAD_CHUNK_BYTES

  if (uploadNote) {
    onProgress(uploadNote)
  }

  let uploadedBytes = 0
  for (let offset = 0; offset < uploadFile.size; offset += chunkBytes) {
    const chunk = uploadFile.slice(offset, offset + chunkBytes)
    const chunkRes = await fetch(
      `/api/plan-upload?uploadSessionId=${encodeURIComponent(uploadSessionId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: chunk,
      }
    )

    if (!chunkRes.ok) {
      throw new Error(await readStageResponseMessage(chunkRes))
    }

    uploadedBytes += chunk.size
    onProgress(
      `Uploading ${plan.name} for staging... ${Math.min(
        100,
        Math.round((uploadedBytes / Math.max(uploadFile.size, 1)) * 100)
      )}%`
    )
  }

  const completeRes = await fetch("/api/plan-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "complete",
      uploadSessionId,
    }),
  })

  const completePayload = await completeRes.json().catch(() => null)
  const staged = Array.isArray(completePayload?.staged) ? completePayload.staged[0] : null
  if (!completeRes.ok || completePayload?.ok !== true || !staged?.stagedUploadId) {
    throw new Error(
      typeof completePayload?.message === "string" && completePayload.message.trim()
        ? completePayload.message.trim()
        : await readStageResponseMessage(completeRes)
    )
  }

  return {
    stagedUploadId: String(staged.stagedUploadId),
    bytes: Number(staged.bytes || plan.file.size),
    originalBytes: Number(staged.originalBytes || plan.file.size),
    sourcePageCount:
      typeof staged.sourcePageCount === "number" ? staged.sourcePageCount : plan.sourcePageCount,
    originalSourcePageCount:
      typeof staged.originalSourcePageCount === "number"
        ? staged.originalSourcePageCount
        : plan.sourcePageCount,
    selectedPageUploadMode:
      staged.selectedPageUploadMode === "browser-derived-selected-pages" ||
      staged.selectedPageUploadMode === "server-derived-selected-pages" ||
      staged.selectedPageUploadMode === "original-fallback"
        ? staged.selectedPageUploadMode
        : uploadMode,
    selectedPageUploadNote:
      typeof staged.selectedPageUploadNote === "string"
        ? staged.selectedPageUploadNote
        : uploadNote,
  }
}

async function compressImageFile(file: File): Promise<string> {
  const imageBitmap = await createImageBitmap(file)

  const maxWidth = 900
  const maxHeight = 900

  const scale = Math.min(
    1,
    maxWidth / imageBitmap.width,
    maxHeight / imageBitmap.height
  )

  const width = Math.max(1, Math.round(imageBitmap.width * scale))
  const height = Math.max(1, Math.round(imageBitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not create canvas context")

  ctx.drawImage(imageBitmap, 0, 0, width, height)

  let dataUrl = canvas.toDataURL("image/jpeg", 0.55)

  if (dataUrl.length > MAX_PHOTO_DATAURL_LENGTH) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.45)
  }

  if (dataUrl.length > MAX_PHOTO_DATAURL_LENGTH) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.35)
  }

  return dataUrl
}

async function handlePhotoUpload(files: FileList | null) {
  if (!files || files.length === 0) return

  const remainingSlots = Math.max(0, MAX_JOB_PHOTOS - jobPhotos.length)
  const picked = Array.from(files).slice(0, remainingSlots)

  try {
    const compressed: JobPhoto[] = await Promise.all(
      picked.map(async (file) => ({
        id: `${Date.now()}_${file.name}_${Math.random().toString(16).slice(2)}`,
        name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
        dataUrl: await compressImageFile(file),
        roomTag: "",
        shotType: "overview",
        note: "",
        reference: {
          kind: "none",
          label: "",
          realWidthIn: null,
        },
      }))
    )

    const sizeFiltered: JobPhoto[] = compressed.filter(
      (photo) => photo.dataUrl.length <= MAX_PHOTO_DATAURL_LENGTH
    )

    const mergedBase: JobPhoto[] = [...jobPhotos]
    const merged: JobPhoto[] = [...mergedBase]
    let skippedForTotalSize = 0

    for (const photo of sizeFiltered) {
      const next = [...merged, photo]
      const totalSize = estimatePhotoPayloadLength(next)

      if (totalSize <= MAX_TOTAL_PHOTO_PAYLOAD) {
        merged.push(photo)
      } else {
        skippedForTotalSize += 1
      }
    }

    if (compressed.length !== sizeFiltered.length) {
      setStatus("One or more photos were still too large after compression and were skipped.")
    } else if (skippedForTotalSize > 0) {
      setStatus("Some photos were skipped to keep upload size within limit.")
    } else {
      setStatus("")
    }

    setJobPhotos(merged.slice(0, MAX_JOB_PHOTOS))
  } catch (err) {
    console.error(err)
    setStatus("Could not load selected photo(s).")
  }
}

function removeJobPhoto(id: string) {
  setJobPhotos((prev) => prev.filter((p) => p.id !== id))
}

function updateJobPhoto(id: string, patch: Partial<JobPhoto>) {
  setJobPhotos((prev) =>
    prev.map((photo) =>
      photo.id === id
        ? {
            ...photo,
            ...patch,
            reference: patch.reference
              ? { ...photo.reference, ...patch.reference }
              : photo.reference,
          }
        : photo
    )
  )
}

function updateJobPhotoReference(
  id: string,
  patch: Partial<JobPhoto["reference"]>
) {
  setJobPhotos((prev) =>
    prev.map((photo) =>
      photo.id === id
        ? {
            ...photo,
            reference: {
              ...photo.reference,
              ...patch,
            },
          }
        : photo
    )
  )
}

async function handlePlanUpload(files: FileList | null) {
  if (!files || files.length === 0) return

  setStatus(PLAN_SELECTION_INDEXING_STATUS)

  if (jobPlans.length >= MAX_JOB_PLANS) {
    setStatus(`Plan upload limit reached. Remove a plan before adding more than ${MAX_JOB_PLANS}.`)
    return
  }

  const remainingSlots = Math.max(0, MAX_JOB_PLANS - jobPlans.length)
  const selected = Array.from(files)
  const validFiles = selected.filter((file) => ALLOWED_PLAN_MIME_TYPES.has(file.type))
  const invalidCount = selected.length - validFiles.length
  const picked = validFiles.slice(0, remainingSlots)
  const skippedForLimit = Math.max(0, validFiles.length - picked.length)

  if (picked.length === 0) {
    if (invalidCount > 0) {
      setStatus("No supported plan files were added. Use PDF, PNG, JPG, JPEG, or WEBP.")
    } else {
      setStatus(`Plan upload limit reached. Remove a plan before adding more than ${MAX_JOB_PLANS}.`)
    }
    return
  }

  try {
    const localPlans: JobPlan[] = await Promise.all(
      picked.map(async (file) => {
        const sourcePageCount = await getLocalPlanSourcePageCount(file)
        const sourceKind = getPlanSourceKind(file)

        return {
          id: `${Date.now()}_${file.name}_${Math.random().toString(16).slice(2)}`,
          name: file.name,
          file,
          stagedUploadId: null,
          mimeType: file.type,
          sourceKind,
          bytes: file.size,
          originalBytes: file.size,
          note: "",
          sourcePageCount,
          stagedSourcePageCount: null,
          selectedPageUploadMode: undefined,
          selectedPageUploadNote: null,
          pages: buildLocalPlanPageSelection({
            sourceKind,
            totalPages: sourcePageCount,
            name: file.name,
            note: "",
          }),
        }
      })
    )

    const mergedBase: JobPlan[] = [...jobPlans]
    const merged: JobPlan[] = [...mergedBase]
    let skippedForPageCount = 0

    for (const plan of localPlans) {
      const currentIndexedPages = merged.reduce((sum, item) => sum + item.pages.length, 0)
      const intakeIssue = getPlanSelectionIntakeIssue({
        currentIndexedPages,
        nextIndexedPages: plan.pages.length,
      })

      if (!intakeIssue) {
        merged.push(plan)
      } else {
        skippedForPageCount += 1
      }
    }

    setJobPlans(merged.slice(0, MAX_JOB_PLANS))

    const addedCount = merged.length - jobPlans.length
    const notices: string[] = []

    if (addedCount > 0) {
      notices.push(`Added ${addedCount} plan file${addedCount === 1 ? "" : "s"}.`)
    }
    if (invalidCount > 0) {
      notices.push(`${invalidCount} unsupported file${invalidCount === 1 ? "" : "s"} skipped.`)
    }
    if (skippedForLimit > 0) {
      notices.push(`${skippedForLimit} file${skippedForLimit === 1 ? "" : "s"} skipped because the ${MAX_JOB_PLANS}-plan limit was reached.`)
    }
    if (skippedForPageCount > 0) {
      notices.push(`Some plan files were skipped because indexed plan pages exceeded the ${MAX_PLAN_SOURCE_PAGES}-page limit.`)
    }
    if (addedCount > 0) {
      notices.push("Plan files stay local until Generate, when the selected pages upload through reliable staging.")
    }

    setStatus(notices.join(" "))
  } catch (err) {
    console.error(err)
    const message =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : "Could not prepare selected plan file(s). Check the PDF and retry."
    setStatus(message)
  }
}

function removeJobPlan(id: string) {
  setJobPlans((prev) => prev.filter((plan) => plan.id !== id))
}

function updateJobPlan(id: string, patch: Partial<JobPlan>) {
  setJobPlans((prev) =>
    prev.map((plan) =>
      plan.id === id
        ? {
            ...plan,
            ...patch,
          }
        : plan
    )
  )
}

  const [measureEnabled, setMeasureEnabled] = useState(false)

  const [measureRows, setMeasureRows] = useState<MeasureRow[]>([
    { label: "Area 1", lengthFt: 0, heightFt: 0, qty: 1 },
  ])

  const rowSqft = (r: MeasureRow) =>
    Math.round((r.lengthFt || 0) * (r.heightFt || 0) * (r.qty || 1) * 10) / 10

  const totalSqft =
    Math.round(measureRows.reduce((sum, r) => sum + rowSqft(r), 0) * 10) / 10

const [actuals, setActuals] = useState<JobActuals[]>([])
const [crewCount, setCrewCount] = useState<number>(1)

  // -------------------------
// Email (required for entitlement)
// -------------------------
const [email, setEmail] = useState("")
const [paid, setPaid] = useState(false)
const [remaining, setRemaining] = useState(FREE_LIMIT)
const [showUpgrade, setShowUpgrade] = useState(false)

// -------------------------
// Saved Estimate History (localStorage)
// -------------------------


const [history, setHistory] = useState<EstimateHistoryItem[]>([])

const [budgets, setBudgets] = useState<JobBudget[]>([])

const [jobDetails, setJobDetails] = useState({
  clientName: "",
  jobName: "",
  changeOrderNo: "",
  jobAddress: "",
  date: "", // optional override; blank = auto-today in PDF
})

useEffect(() => {
  if (typeof window === "undefined") return

  // migrate old key once if it exists
  const old = localStorage.getItem("scopeguard_email")
  if (old) {
    localStorage.setItem(EMAIL_KEY, old)
    localStorage.removeItem("scopeguard_email")
    setEmail(old)
    return
  }

  const saved = localStorage.getItem(EMAIL_KEY)
  if (saved) setEmail(saved)
}, [])

useEffect(() => {
  if (typeof window === "undefined") return

  if (email) {
    localStorage.setItem(EMAIL_KEY, email)
  } else {
    localStorage.removeItem(EMAIL_KEY)
  }
}, [email])

   async function checkEntitlementNow() {
  const reqId = ++entitlementReqId.current

  const e = email.trim().toLowerCase()
  if (!e) return

  try {
    const res = await fetch("/api/entitlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e }),
    })

    // ignore stale responses
    if (reqId !== entitlementReqId.current) return

    if (!res.ok) {
      setPaid(false)
      setRemaining(FREE_LIMIT) // optional fallback
      setShowUpgrade(false) // optional fallback
      return
    }

    const data = await res.json()

    // ignore stale responses (in case JSON parse was slow)
    if (reqId !== entitlementReqId.current) return

    const entitled = data?.entitled === true
    setPaid(entitled)

    const used = typeof data?.usage_count === "number" ? data.usage_count : 0
    const limit =
      typeof data?.free_limit === "number" ? data.free_limit : FREE_LIMIT

    if (!entitled) {
      const remainingNow = Math.max(0, limit - used)
      setRemaining(remainingNow)
      setShowUpgrade(remainingNow <= 0)
    } else {
      setRemaining(FREE_LIMIT) // optional
      setShowUpgrade(false)
    }
  } catch {
    // ignore stale responses
    if (reqId !== entitlementReqId.current) return

    setPaid(false)
    setRemaining(FREE_LIMIT)
    setShowUpgrade(false)
  }
}

useEffect(() => {
  const e = email.trim().toLowerCase()
  if (!e) {
    setPaid(false)
    setRemaining(FREE_LIMIT)
    setShowUpgrade(false)
    return
  }
  checkEntitlementNow()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [email])

// -------------------------
// Jobs Dashboard helpers
// -------------------------
function latestEstimateForJob(jobId: string) {
  const list = history
    .filter((h) => h.jobId === jobId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return list[0] || null
}

function upsertActuals(jobId: string, patch: Partial<JobActuals>) {
  setActuals((prev) => {
    const idx = prev.findIndex((a) => a.jobId === jobId)
    const base = idx === -1 ? null : prev[idx]

    const nextItem = buildActualsPatch(base, {
      ...patch,
      jobId,
    })

    const next =
      idx === -1
        ? [nextItem, ...prev]
        : prev.map((x, i) => (i === idx ? nextItem : x))

    return next
  })
}

function actualsForJob(jobId: string) {
  return actuals.find((a) => a.jobId === jobId) || null
}

function invoiceSummaryForJob(jobId: string) {
  const list = invoices.filter((x) => x.jobId === jobId)
  let paidCount = 0
  let overdueCount = 0
  let openCount = 0
  let outstanding = 0
  let draftCount = 0

for (const inv of list) {
  const st = computeLiveInvoiceStatus(inv)

  if (st === "paid") {
    paidCount += 1
    continue
  }

  if (st === "draft") {
    draftCount += 1
    continue
  }

  if (st === "overdue") overdueCount += 1
  else openCount += 1

  outstanding += Number(inv.total || 0)
}

return {
  total: list.length,
  draftCount,
  paidCount,
  overdueCount,
  openCount,
  outstanding: Math.round(outstanding),
 }
}

function upsertBudgetFromEstimate(est: EstimateHistoryItem) {
  const jobId = est.jobId
  if (!jobId) return

  const labor = Number(est?.pricing?.labor || 0)
  const materials = Number(est?.pricing?.materials || 0)
  const subs = Number(est?.pricing?.subs || 0)
  const markupPct = Number(est?.pricing?.markup || 0)

  const taxEnabledSnap = Boolean(est.tax?.enabled)
  const taxRateSnap = Number(est.tax?.rate || 0)

  const { taxAmt, estimateTotal } = computeTaxAmountFromEstimate(est)

  // deposit snapshot (optional)
  let dep: JobBudget["deposit"] = undefined
  if (est.deposit?.enabled) {
    const depType = est.deposit.type === "fixed" ? "fixed" : "percent"
    const depValue = Number(est.deposit.value || 0)

    let depositDue = 0
    if (depType === "percent") {
      const pct = Math.max(0, Math.min(100, depValue))
      depositDue = Math.round(estimateTotal * (pct / 100))
    } else {
      depositDue = Math.min(estimateTotal, Math.round(Math.max(0, depValue)))
    }

    dep = {
      enabled: true,
      type: depType,
      value: depValue,
      depositDue,
      remainingBalance: Math.max(0, estimateTotal - depositDue),
    }
  }

  const nextBudget: JobBudget = {
    jobId,
    updatedAt: Date.now(),
    lastEstimateId: est.id,
    estimateTotal,
    labor,
    materials,
    subs,
    markupPct,
    taxEnabled: taxEnabledSnap,
    taxRate: taxRateSnap,
    taxAmount: taxAmt,
    deposit: dep,
  }

  setBudgets((prev) => {
    const idx = prev.findIndex((b) => b.jobId === jobId)
    if (idx === -1) return [nextBudget, ...prev]
    const copy = prev.slice()
    copy[idx] = nextBudget
    return copy
  })
}

function findHistoryById(id: string) {
  return history.find((h) => h.id === id) || null
}

function hasAnyInvoiceForEstimate(estimateId: string) {
  return invoices.some((inv) => inv.fromEstimateId === estimateId)
}

function hasBalanceInvoiceForEstimate(estimateId: string) {
  return invoices.some(
    (inv) =>
      inv.fromEstimateId === estimateId &&
      inv.deposit?.enabled &&
      inv.total === inv.deposit.remainingBalance
  )
}

function getJobPipelineStatus(jobId: string) {
  const latest = latestEstimateForJob(jobId)
  const original = lockedOriginalEstimateForJob(jobId)
  const source = latest || original

  if (!source) {
    return {
      key: "no-estimate" as const,
      label: "No Estimate",
      tone: "neutral" as const,
      message: "No estimate found for this job yet.",
      primaryAction: null as
        | null
        | "create_change_order"
        | "copy_approval"
        | "create_deposit_invoice"
        | "await_deposit_payment"
        | "create_balance_invoice"
        | "create_final_invoice"
        | "await_final_payment"
        | "paid_closed",
    }
  }

  const approvalApproved = source.approval?.status === "approved"
  const depositRequired = Boolean(source.deposit?.enabled)

  const jobInvoices = invoices.filter((inv) => inv.jobId === jobId)

  const depositInvoice = jobInvoices.find(
    (inv) =>
      inv.fromEstimateId === source.id &&
      inv.deposit?.enabled &&
      inv.total === inv.deposit.depositDue
  ) || null

  const balanceInvoice = jobInvoices.find(
    (inv) =>
      inv.fromEstimateId === source.id &&
      inv.deposit?.enabled &&
      inv.total === inv.deposit.remainingBalance
  ) || null

  const fullInvoice = jobInvoices.find(
    (inv) =>
      inv.fromEstimateId === source.id &&
      !inv.deposit?.enabled
  ) || null

  const depositPaid =
    depositInvoice ? computeLiveInvoiceStatus(depositInvoice) === "paid" : false

  const balancePaid =
    balanceInvoice ? computeLiveInvoiceStatus(balanceInvoice) === "paid" : false

  const fullInvoicePaid =
    fullInvoice ? computeLiveInvoiceStatus(fullInvoice) === "paid" : false

  if (!approvalApproved) {
    return {
      key: "pending_approval" as const,
      label: "Pending Approval",
      tone: "warning" as const,
      message: "Waiting for customer approval before invoicing.",
      primaryAction: "copy_approval" as const,
    }
  }

  if (depositRequired) {
    if (!depositInvoice) {
      return {
        key: "ready_for_deposit_invoice" as const,
        label: "Ready for Deposit",
        tone: "info" as const,
        message: "Approved and ready for deposit invoice.",
        primaryAction: "create_deposit_invoice" as const,
      }
    }

    if (!depositPaid) {
      return {
        key: "awaiting_deposit_payment" as const,
        label: "Awaiting Deposit Payment",
        tone: "warning" as const,
        message: "Deposit invoice created but not paid yet.",
        primaryAction: "await_deposit_payment" as const,
      }
    }

    if (!balanceInvoice) {
      return {
        key: "ready_for_balance_invoice" as const,
        label: "Ready for Balance Invoice",
        tone: "info" as const,
        message: "Deposit paid. Ready to create balance invoice.",
        primaryAction: "create_balance_invoice" as const,
      }
    }

    if (!balancePaid) {
      return {
        key: "awaiting_final_payment" as const,
        label: "Awaiting Final Payment",
        tone: "warning" as const,
        message: "Balance invoice created but not paid yet.",
        primaryAction: "await_final_payment" as const,
      }
    }

    return {
      key: "paid_closed" as const,
      label: "Paid / Closed",
      tone: "good" as const,
      message: "Deposit and balance have both been paid.",
      primaryAction: "paid_closed" as const,
    }
  }

  if (!fullInvoice) {
    return {
      key: "ready_for_final_invoice" as const,
      label: "Ready for Final Invoice",
      tone: "info" as const,
      message: "Approved and ready for final invoice.",
      primaryAction: "create_final_invoice" as const,
    }
  }

  if (!fullInvoicePaid) {
    return {
      key: "awaiting_final_payment" as const,
      label: "Awaiting Final Payment",
      tone: "warning" as const,
      message: "Final invoice created but not paid yet.",
      primaryAction: "await_final_payment" as const,
    }
  }

  return {
    key: "paid_closed" as const,
    label: "Paid / Closed",
    tone: "good" as const,
    message: "Final invoice has been paid.",
    primaryAction: "paid_closed" as const,
  }
}

  function latestInvoiceForJob(jobId: string) {
  const list = invoices
    .filter((x) => x.jobId === jobId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return list[0] || null
}

function selectJobAndJumpToInvoices(jobId: string) {
  setActiveJobId(jobId)
  setStatus("Job selected.")
  scrollToInvoices()
}

function createInvoiceFromLatestEstimate(jobId: string) {
  const est = latestEstimateForJob(jobId)
  if (!est) {
    setStatus("No estimate found for this job yet.")
    return
  }
  createInvoiceFromEstimate(est)
  selectJobAndJumpToInvoices(jobId)
}

function createBalanceInvoiceFromLatestEstimate(jobId: string) {
  const est = latestEstimateForJob(jobId)
  if (!est) {
    setStatus("No estimate found for this job yet.")
    return
  }
  createBalanceInvoiceFromEstimate(est)
  selectJobAndJumpToInvoices(jobId)
}

function startChangeOrderFromJob(jobId: string) {
  const job = jobs.find((j) => j.id === jobId)
  if (!job) {
    setStatus("Job not found.")
    return
  }

  const original = lockedOriginalEstimateForJob(jobId)
  const latest = latestEstimateForJob(jobId)
  const source = latest || original

  setActiveJobId(jobId)

  setJobDetails({
    clientName: job.clientName || "",
    jobName: job.jobName || "",
    changeOrderNo: nextChangeOrderNumber(job, history, jobId),
    jobAddress: job.jobAddress || "",
    date: "",
  })

  setDocumentType("Change Order")

  if (source) {
    setTrade(source.trade || "")
    setState(source.state || "")
    setScopeChange("")
    setResult(null)
    setEstimateRows(null)
    setEstimateEmbeddedBurdens(null)
    setEstimateSections(null)
    setSchedule(source.schedule ?? null)

    setPricing({
      labor: 0,
      materials: 0,
      subs: 0,
      markup: source.pricing?.markup ?? 20,
      total: 0,
    })

    setTaxEnabled(Boolean(source.tax?.enabled))
    setTaxRate(Number(source.tax?.rate || 0))

    if (source.deposit) {
      setDepositEnabled(Boolean(source.deposit.enabled))
      setDepositType(source.deposit.type === "fixed" ? "fixed" : "percent")
      setDepositValue(Number(source.deposit.value || 0))
    } else {
      setDepositEnabled(false)
      setDepositType("percent")
      setDepositValue(25)
    }
  }

  setScopeSignals(null)
  setPhotoAnalysis(null)
  setPhotoScopeAssist(null)
  setPlanIntelligence(null)
  setEstimateSkeletonHandoff(null)
  setEstimateStructureConsumption(null)
  setMaterialsList(null)
  setAreaScopeBreakdown(null)
  setProfitProtection(null)
  setScopeXRay(null)
  setMissedScopeDetector(null)
  setProfitLeakDetector(null)
  setEstimateDefenseMode(null)
  setTradePricingPrepAnalysis(null)
  setChangeOrderDetection(null)
  setJobPhotos([])

  lastSavedEstimateIdRef.current = null
  setPricingEdited(false)
  setPriceGuard(null)
  setPriceGuardVerified(false)
  setShowPriceGuardDetails(false)

  setStatus("Change order started. Enter the added or revised scope, then generate.")
}

function computeWeeklyCrewLoad() {
  const items = jobs
    .map((j) => {
      const latest = latestEstimateForJob(j.id)
      const s = latest?.schedule
      if (!s?.startDate) return null

      const crewDays = Number(s?.crewDays ?? 0)
      if (!Number.isFinite(crewDays) || crewDays <= 0) return null

      const start = new Date(s.startDate + "T00:00:00")

      return {
        jobId: j.id,
        jobName: j.jobName || "Untitled Job",
        start,
        crewDays,
      }
    })
    .filter(Boolean) as {
    jobId: string
    jobName: string
    start: Date
    crewDays: number
  }[]

  const byWeek = new Map<
    string,
    {
      demandCrewDays: number
      jobs: {
        jobId: string
        jobName: string
        crewDays: number
      }[]
    }
  >()

  for (const it of items) {
    let remaining = it.crewDays
    let wk = startOfWeek(it.start)

    while (remaining > 0) {
      const take = Math.min(6, remaining)
      const key = isoDay(wk)

      const existing = byWeek.get(key) ?? {
        demandCrewDays: 0,
        jobs: [],
      }

      existing.demandCrewDays += take
      existing.jobs.push({
        jobId: it.jobId,
        jobName: it.jobName,
        crewDays: take,
      })

      byWeek.set(key, existing)

      remaining -= take
      wk = addDays(wk, 7)
    }
  }

  const weeks: WeekLoad[] = Array.from(byWeek.entries())
    .map(([weekStartISO, value]) => ({
      weekStartISO,
      demandCrewDays: value.demandCrewDays,
      jobs: value.jobs.sort((a, b) => b.crewDays - a.crewDays),
    }))
    .sort((a, b) => a.weekStartISO.localeCompare(b.weekStartISO))

  return weeks
}

function lockedOriginalEstimateForJob(jobId?: string) {
  if (!jobId) return null

  const job = jobs.find((j) => j.id === jobId)

  const jobHistory = history
    .filter((h) => h.jobId === jobId)
    .sort((a, b) => a.createdAt - b.createdAt)

  if (job?.originalEstimateId) {
    const locked = jobHistory.find((h) => h.id === job.originalEstimateId)
    if (locked) return locked
  }

  // fallback: use earliest estimate for this job
  return jobHistory[0] || null
}

function computeJobContractSummary(jobId?: string) {
  if (!jobId) {
    return {
      originalEstimate: null as EstimateHistoryItem | null,
      originalEstimateTotal: 0, // with tax
      originalEstimateContractValue: 0, // before tax
      changeOrders: [] as EstimateHistoryItem[],
      changeOrdersTotal: 0, // with tax
      changeOrdersContractValue: 0, // before tax
      currentContractValue: 0, // with tax
      currentContractValueBeforeTax: 0, // before tax
    }
  }

  const originalEstimate = lockedOriginalEstimateForJob(jobId)

  if (!originalEstimate) {
    return {
      originalEstimate: null,
      originalEstimateTotal: 0,
      originalEstimateContractValue: 0,
      changeOrders: [],
      changeOrdersTotal: 0,
      changeOrdersContractValue: 0,
      currentContractValue: 0,
      currentContractValueBeforeTax: 0,
    }
  }

  // original estimate
  const originalEstimateTotal = estimateTotalWithTax(originalEstimate)
  const originalEstimateContractValue = estimateSubtotalBeforeTax(originalEstimate)

  // all later change orders / estimates tied to same job
  const changeOrders = history
    .filter((h) => h.jobId === jobId && h.id !== originalEstimate.id)
    .sort((a, b) => a.createdAt - b.createdAt)

  const changeOrdersTotal = changeOrders.reduce(
    (sum, h) => sum + estimateTotalWithTax(h),
    0
  )

  const changeOrdersContractValue = changeOrders.reduce(
    (sum, h) => sum + estimateSubtotalBeforeTax(h),
    0
  )

  const currentContractValue = originalEstimateTotal + changeOrdersTotal
  const currentContractValueBeforeTax =
    originalEstimateContractValue + changeOrdersContractValue

  return {
    originalEstimate,
    originalEstimateTotal,
    originalEstimateContractValue,
    changeOrders,
    changeOrdersTotal,
    changeOrdersContractValue,
    currentContractValue,
    currentContractValueBeforeTax,
  }
}

function computeChangeOrderSummary(current: EstimateHistoryItem | null) {
  if (!current?.jobId) return null

  const contract = computeJobContractSummary(current.jobId)
  const original = contract.originalEstimate
  if (!original) return null

  const isOriginalEstimate = current.id === original.id

  const previousContractValue = isOriginalEstimate
    ? contract.originalEstimateTotal
    : contract.originalEstimateTotal +
      contract.changeOrders
        .filter((h) => h.createdAt < current.createdAt)
        .reduce((sum, h) => sum + estimateTotalWithTax(h), 0)

  const currentEstimateTotal = estimateTotalWithTax(current)
  const newContractValue = isOriginalEstimate
    ? contract.originalEstimateTotal
    : previousContractValue + currentEstimateTotal

  const costDelta = isOriginalEstimate ? 0 : currentEstimateTotal

  const originalCrewDays = Number(original.schedule?.crewDays || 0)
  const currentCrewDays = Number(current.schedule?.crewDays || 0)
  const crewDayDelta = currentCrewDays - originalCrewDays

  const originalEnd = completionEndFromSchedule(original.schedule, original.createdAt)
  const currentEnd = completionEndFromSchedule(current.schedule, current.createdAt)
  const scheduleDeltaDays = daysBetween(originalEnd, currentEnd)

  return {
    original,
    current,
    isOriginalEstimate,
    originalEstimateTotal: contract.originalEstimateTotal,
    previousContractValue,
    currentEstimateTotal,
    newContractValue,
    costDelta,
    originalCrewDays,
    currentCrewDays,
    crewDayDelta,
    originalEnd,
    currentEnd,
    scheduleDeltaDays,
  }
}

  // -------------------------
  // Company profile (persisted)
  // -------------------------
  const [companyProfile, setCompanyProfile] = useState({
  name: "",
  address: "",
  phone: "",
  email: "",
  logo: "",
  license: "",
  paymentTerms: "",
})

  useEffect(() => {
  if (typeof window === "undefined") return

  const old = localStorage.getItem("scopeguard_company")
  if (old) {
    localStorage.setItem(COMPANY_KEY, old)
    localStorage.removeItem("scopeguard_company")
    try {
      setCompanyProfile(JSON.parse(old))
    } catch {}
    return
  }

  const saved = localStorage.getItem(COMPANY_KEY)
  if (saved) {
    try {
      setCompanyProfile(JSON.parse(saved))
    } catch {}
  }
}, [])

  useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(COMPANY_KEY, JSON.stringify(companyProfile))
}, [companyProfile])
  
useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(JOB_KEY)
  if (saved) setJobDetails(JSON.parse(saved))
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(JOB_KEY, JSON.stringify(jobDetails))
}, [jobDetails])

useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(HISTORY_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        const cleaned: EstimateHistoryItem[] =
          parsed.map(normalizeEstimateHistoryItem)

        setHistory(cleaned)
      }
    } catch {
      // ignore bad data
    }
  }

  setHistoryHydrated(true)
}, [])

  // -------------------------
  // App state
  // -------------------------
const [scopeChange, setScopeChange] = useState("")
const [result, setResult] = useState<{
  text: string
  explanation?: {
    priceReasons?: string[]
    scheduleReasons?: string[]
    photoReasons?: string[]
    protectionReasons?: string[]
  } | null
} | null>(null)
const [estimateRows, setEstimateRows] = useState<EstimateRow[] | null>(null)
const [estimateEmbeddedBurdens, setEstimateEmbeddedBurdens] =
  useState<EstimateEmbeddedBurden[] | null>(null)
const [estimateSections, setEstimateSections] =
  useState<EstimateStructuredSection[] | null>(null)
const [schedule, setSchedule] = useState<Schedule | null>(null)
const [scopeSignals, setScopeSignals] = useState<ScopeSignals>(null)

const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysis>(null)
const [photoScopeAssist, setPhotoScopeAssist] = useState<PhotoScopeAssist>(null)
const [planIntelligence, setPlanIntelligence] = useState<PlanIntelligence>(null)
const [estimateSkeletonHandoff, setEstimateSkeletonHandoff] =
  useState<PlanEstimateSkeletonHandoff>(null)
const [estimateStructureConsumption, setEstimateStructureConsumption] =
  useState<PlanEstimateStructureConsumption>(null)
const [materialsList, setMaterialsList] = useState<MaterialsList>(null)
const [scopeXRay, setScopeXRay] = useState<ScopeXRay>(null)
const [missedScopeDetector, setMissedScopeDetector] = useState<MissedScopeDetector>(null)
const [profitLeakDetector, setProfitLeakDetector] = useState<ProfitLeakDetector>(null)
const [estimateDefenseMode, setEstimateDefenseMode] = useState<EstimateDefenseMode>(null)
const [tradePricingPrepAnalysis, setTradePricingPrepAnalysis] =
  useState<TradePricingPrepAnalysis>(null)
const [changeOrderDetection, setChangeOrderDetection] = useState<ChangeOrderDetection | null>(null)
const [areaScopeBreakdown, setAreaScopeBreakdown] = useState<AreaScopeBreakdown>(null)
const [profitProtection, setProfitProtection] = useState<ProfitProtection>(null)
  
const completionWindow = useMemo(() => {
  const start =
    schedule?.startDate
      ? new Date(schedule.startDate + "T00:00:00")
      : null

  if (!start) return null

  const minDays =
    Number(schedule?.calendarDays?.min ?? 0) > 0
      ? Number(schedule?.calendarDays?.min)
      : Number(schedule?.crewDays ?? 0) > 0
      ? Number(schedule?.crewDays)
      : 0

  const maxDays =
    Number(schedule?.calendarDays?.max ?? 0) > 0
      ? Number(schedule?.calendarDays?.max)
      : Number(schedule?.crewDays ?? 0) > 0
      ? Number(schedule?.crewDays)
      : 0

  if (!minDays || !maxDays) return null

  const minEnd = new Date(start)
  minEnd.setDate(start.getDate() + Math.max(minDays - 1, 0))


  const maxEnd = new Date(start)
  maxEnd.setDate(start.getDate() + Math.max(maxDays - 1, 0))

  return {
    min: minEnd,
    max: maxEnd,
  }
}, [
  schedule?.startDate,
  schedule?.calendarDays?.min,
  schedule?.calendarDays?.max,
  schedule?.crewDays,
])
  
  const [documentType, setDocumentType] = useState<DocumentType>("Estimate")
  const [trade, setTrade] = useState<UiTrade>("")
  const [state, setState] = useState("")
  const [paintScope, setPaintScope] = useState<PaintScope>("walls")
  
const text = scopeChange.toLowerCase()

const hasPaintWord = /\b(?:paint|painting|repaint|prime|primer)\b/i.test(text)

const showPaintScope =
  trade === "painting" || (trade === "" && hasPaintWord)

// explicit door count only (matches server)
const doorCount = (() => {
  const m = text.match(/\b(\d{1,4})\s+doors?\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
})()

const roomCount = (() => {
  const m = text.match(/\b(\d{1,4})\s+rooms?\b/i)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
})()

const isMixedPaintScope =
  (trade === "painting" || trade === "") &&
  hasPaintWord &&
  doorCount !== null &&
  roomCount !== null

const roomishRe =
  /\b(rooms?|hallway|living\s*room|family\s*room|bed(room)?|kitchen|bath(room)?|dining|office|closet|stair|entry|walls?|ceilings?)\b/i

const looksLikeDoorsOnly =
  (trade === "painting" || trade === "") &&
  hasPaintWord &&
  doorCount !== null &&
  !roomishRe.test(text)

const effectivePaintScope: EffectivePaintScope =
  looksLikeDoorsOnly ? "doors_only" : paintScope
  
  const [pricing, setPricing] = useState({
    labor: 0,
    materials: 0,
    subs: 0,
    markup: 20,
    total: 0,
  })

  // -------------------------
// Tax (optional)
// -------------------------
const [taxEnabled, setTaxEnabled] = useState(false)
const [taxRate, setTaxRate] = useState<number>(7.75)

// Derived tax amount
const taxAmount = useMemo(() => {
  if (!taxEnabled) return 0

  const base =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  const markedUp = base * (1 + Number(pricing.markup || 0) / 100)
  const total = Math.round(
    markedUp + markedUp * (Number(taxRate || 0) / 100)
  )

  return Math.max(0, total - Math.round(markedUp))
}, [
  taxEnabled,
  taxRate,
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
])

  // -------------------------
// Deposit (optional)
// -------------------------
const [depositEnabled, setDepositEnabled] = useState(false)
const [depositType, setDepositType] = useState<"percent" | "fixed">("percent")
const [depositValue, setDepositValue] = useState<number>(25)

// Derived amounts (based on current total)
const depositDue = useMemo(() => {
  const total = Number(pricing.total || 0)
  if (!depositEnabled || total <= 0) return 0

  if (depositType === "percent") {
    const pct = Math.max(0, Math.min(100, Number(depositValue || 0)))
    return Math.round(total * (pct / 100))
  }

  const fixed = Math.max(0, Number(depositValue || 0))
  return Math.min(total, Math.round(fixed))
}, [depositEnabled, depositType, depositValue, pricing.total])

const remainingBalance = useMemo(() => {
  const total = Number(pricing.total || 0)
  return Math.max(0, total - depositDue)
}, [pricing.total, depositDue])
  
  const [pricingSource, setPricingSource] = useState<PricingSource>("ai")
  const [pricingEdited, setPricingEdited] = useState(false)
  const [showPriceGuardDetails, setShowPriceGuardDetails] = useState(false)
  const [priceGuard, setPriceGuard] = useState<PriceGuardReport | null>(null)
  const [priceGuardVerified, setPriceGuardVerified] = useState(false)

  useEffect(() => {
  function onDocClick(e: MouseEvent) {
    const t = e.target as HTMLElement
    if (t.closest?.("[data-priceguard]")) return
    setShowPriceGuardDetails(false)
  }

  if (showPriceGuardDetails) {
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }
}, [showPriceGuardDetails])
  
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [activeJobId, setActiveJobId] = useState<string>("") // "" = All jobs

  const [jobsHydrated, setJobsHydrated] = useState(false)
  const [historyHydrated, setHistoryHydrated] = useState(false)

  const filteredHistory = useMemo(() => {
  if (!activeJobId) return history
  return history.filter((h) => h.jobId === activeJobId)
}, [history, activeJobId])

const filteredInvoices = useMemo(() => {
  if (!activeJobId) return invoices
  return invoices.filter((inv) => inv.jobId === activeJobId)
}, [invoices, activeJobId])

const currentLoadedEstimate = useMemo<EstimateHistoryItem | null>(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return null

  const base = history.find((h) => h.id === id)
  if (!base) return null

  return {
    ...base,
    jobDetails: { ...jobDetails },
    trade,
    state,
    scopeChange,
    result: result?.text || "",
    pricing: {
      labor: Number(pricing.labor || 0),
      materials: Number(pricing.materials || 0),
      subs: Number(pricing.subs || 0),
      markup: Number(pricing.markup || 0),
      total: Number(pricing.total || 0),
    },
    schedule: schedule ?? null,
    scopeSignals: scopeSignals ?? null,
    photoAnalysis: photoAnalysis ?? null,
    photoScopeAssist: photoScopeAssist ?? null,
    planIntelligence: planIntelligence ?? null,
    estimateSkeletonHandoff: estimateSkeletonHandoff ?? null,
    estimateStructureConsumption: estimateStructureConsumption ?? null,
    materialsList: materialsList ?? null,
    areaScopeBreakdown: areaScopeBreakdown ?? null,
    profitProtection: profitProtection ?? null,
    scopeXRay: scopeXRay ?? null,
    tradePricingPrepAnalysis: tradePricingPrepAnalysis ?? null,
    estimateRows: estimateRows ?? null,
    estimateEmbeddedBurdens: estimateEmbeddedBurdens ?? null,
    estimateSections: estimateSections ?? null,
    changeOrderDetection: changeOrderDetection ?? null,
    tax: {
      enabled: taxEnabled,
      rate: Number(taxRate || 0),
    },
    deposit: depositEnabled
      ? {
          enabled: true,
          type: depositType,
          value: Number(depositValue || 0),
        }
      : undefined,
  }
}, [
  history,
  jobDetails,
  trade,
  state,
  scopeChange,
  result,
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
  pricing.total,
  schedule,
  scopeSignals,
  photoAnalysis,
  photoScopeAssist,
  planIntelligence,
  estimateSkeletonHandoff,
  estimateStructureConsumption,
  materialsList,
  areaScopeBreakdown,
  profitProtection,
  scopeXRay,
  tradePricingPrepAnalysis,
  estimateRows,
  estimateEmbeddedBurdens,
  estimateSections,
  changeOrderDetection,
  taxEnabled,
  taxRate,
  depositEnabled,
  depositType,
  depositValue,
])

const changeOrderSummary = useMemo(() => {
  return computeChangeOrderSummary(currentLoadedEstimate)
}, [currentLoadedEstimate])

const explainChangesReport = useMemo(() => {
  if (!currentLoadedEstimate?.jobId) return null

  const original = lockedOriginalEstimateForJob(currentLoadedEstimate.jobId)
  if (!original) return null

  return explainEstimateChanges(original, currentLoadedEstimate)
}, [currentLoadedEstimate, history, jobs])

const pricingMemory = getPricingMemory(history, trade, scopeChange)
const scopeQuality = checkScopeQuality(scopeChange)

const historicalPriceGuard =
  pricingMemory && pricing.total
    ? compareEstimateToHistory(pricing.total, pricingMemory.avgPrice)
    : null

    const minimumSafePrice = useMemo(() => {
  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return null

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0

  // 15% minimum target margin
  const minMargin = 0.15

  // pre-tax selling price needed to preserve 15% margin
  const safeBeforeTax = cost / (1 - minMargin)

  // final customer price if tax is enabled
  const safeAfterTax = Math.round(safeBeforeTax * (1 + effectiveTaxRate))

  return safeAfterTax
}, [
  pricing.labor,
  pricing.materials,
  pricing.subs,
  taxEnabled,
  taxRate,
])

const minimumSafeStatus = useMemo(() => {
  if (!minimumSafePrice || !pricing.total) return null

  const current = Number(pricing.total || 0)
  const safe = Number(minimumSafePrice || 0)
  if (!safe) return null

  const diffPct = ((current - safe) / safe) * 100

  if (current < safe) {
    return {
      label: "Below minimum safe price",
      tone: "danger",
      color: "#9b1c1c",
      bg: "#fef2f2",
      border: "#fecaca",
      message: `This estimate is ${Math.abs(Math.round(diffPct))}% below your minimum safe price.`,
    }
  }

  if (diffPct <= 0) {
    return {
      label: "At minimum safe price",
      tone: "warning",
      color: "#92400e",
      bg: "#fff7ed",
      border: "#fdba74",
      message: "This estimate is right at your minimum safe price floor.",
    }
  }

  if (diffPct <= 5) {
    return {
      label: "Near minimum safe price",
      tone: "warning",
      color: "#92400e",
      bg: "#fff7ed",
      border: "#fdba74",
      message: "This estimate is close to your minimum safe price floor.",
    }
  }

  return {
    label: "Safely above minimum",
    tone: "good",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#86efac",
    message: "This estimate is safely above your minimum safe price.",
  }
}, [minimumSafePrice, pricing.total])

const estimateBreakdown = useMemo(() => {
  return buildEstimateBreakdown({
    pricing,
    schedule,
    trade,
    state,
    scopeSignals,
    minimumSafeStatus,
  })
}, [pricing, schedule, trade, state, scopeSignals, minimumSafeStatus])

const estimateAssumptions = useMemo(() => {
  return buildAssumptionsList({
    trade,
    state,
    scopeSignals,
  })
}, [trade, state, scopeSignals])

const hasMeasurementReference = useMemo(() => {
  return jobPhotos.some(
    (p) =>
      p.shotType === "measurement" ||
      (p.reference.kind === "custom" && Number(p.reference.realWidthIn || 0) > 0)
  )
}, [jobPhotos])

const estimateConfidence = useMemo(() => {
  return buildEstimateConfidence({
    scopeChange,
    trade,
    state,
    measureEnabled,
    totalSqft,
    jobPhotosCount: jobPhotos.length,
    scopeQualityScore: scopeQuality.score,
    priceGuardVerified,
    photoAnalysis,
    hasMeasurementReference,
  })
}, [
  scopeChange,
  trade,
  state,
  measureEnabled,
  totalSqft,
  jobPhotos.length,
  scopeQuality.score,
  priceGuardVerified,
  photoAnalysis,
  hasMeasurementReference,
])

const planAssistedStatus = useMemo(() => {
  const hasPlanContext = jobPlans.length > 0 || !!planIntelligence
  const readback = planIntelligence?.planReadback ?? null
  const hasUsefulReadback =
    !!readback?.headline ||
    (readback?.estimatorFlowReadback?.length ?? 0) > 0 ||
    (readback?.areaQuantityReadback?.length ?? 0) > 0 ||
    (readback?.tradeScopeReadback?.length ?? 0) > 0 ||
    (readback?.groupedScopeReadback?.length ?? 0) > 0
  const hasHardQuantitySupport =
    readback?.areaQuantityReadback?.some(
      (area) => area.supportLevel === "direct" && area.quantityNarration.length > 0
    ) ||
    readback?.tradeScopeReadback?.some(
      (trade) => trade.supportLevel === "direct" && trade.quantityNarration.length > 0
    ) ||
    readback?.groupedScopeReadback?.some(
      (group) => group.supportLevel === "direct" && group.directSupport.length > 0
    ) ||
    false
  const hasConfirmationGaps =
    readback?.scopeGapReadback?.some((gap) => gap.status !== "likely_ready") ||
    (readback?.needsConfirmation?.length ?? 0) > 0 ||
    false

  if (!hasPlanContext) {
    return {
      label: "No plans provided",
      tone: "neutral" as const,
      message: "This estimate was generated without uploaded plan review.",
      details: ["Use plan upload when you want a plan-assisted review of sheets, affected areas, and quantity support."],
    }
  }

  if (hasHardQuantitySupport) {
    return {
      label: "Strong plan quantity support",
      tone: "good" as const,
      message: "Plans were uploaded and the plan readback includes direct quantity support.",
      details: [
        "Plan-assisted review is available.",
        hasConfirmationGaps
          ? "Some items may still need estimator confirmation before final pricing confidence."
          : "Supported quantities should still be checked against final selections and affected areas.",
      ],
    }
  }

  if (hasUsefulReadback) {
    return {
      label: "Plan readback available",
      tone: "warning" as const,
      message: "Plans were uploaded and useful readback is available, but hard measured quantities were not confirmed.",
      details: [
        "Plan-assisted review is available.",
        "Plans uploaded, but measured quantities still need confirmation.",
      ],
    }
  }

  return {
    label: "Plan-assisted review",
    tone: "warning" as const,
    message: "Plans were uploaded, but hard measured quantities were not detected from the uploaded plans.",
    details: [
      "Hard quantities not detected from uploaded plans.",
      "Final price confidence depends on confirming exact quantities, finish selections, and affected areas.",
    ],
  }
}, [jobPlans.length, planIntelligence])

const smartScopePreview = useMemo(() => {
  const base = (scopeChange || "").trim()
  if (!base) return null

  const additions = photoScopeAssist?.suggestedAdditions ?? []
  const notes = photoAnalysis?.suggestedScopeNotes ?? []

  const merged = [...notes, ...additions]
    .map((x) => x.trim())
    .filter(Boolean)

  const unique = Array.from(new Set(merged))

  if (unique.length === 0) return null

  return {
    original: base,
    suggestions: unique,
    combined: [base, ...unique].join("\n• "),
  }
}, [scopeChange, photoScopeAssist, photoAnalysis])

    const smartSuggestedPrice = useMemo(() => {
  if (!pricingMemory) return null

  const historicalAvg = Math.round(Number(pricingMemory.avgPrice || 0))

  if (!historicalAvg) return null

  if (minimumSafePrice) {
    return Math.max(historicalAvg, minimumSafePrice)
  }

  return historicalAvg
}, [pricingMemory, minimumSafePrice])

const smartSuggestedStatus = useMemo(() => {
  if (!pricingMemory || !smartSuggestedPrice) return null

  const avg = Number(pricingMemory.avgPrice || 0)
  if (!avg) return null

  const diffPct = Math.round(((smartSuggestedPrice - avg) / avg) * 100)

  if (diffPct <= -10) {
    return {
      label: "Below your usual range",
      color: "#9b1c1c",
      bg: "#fef2f2",
      border: "#fecaca",
    }
  }

  if (diffPct >= 10) {
    return {
      label: "Above your usual range",
      color: "#92400e",
      bg: "#fff7ed",
      border: "#fdba74",
    }
  }

  return {
    label: "Within your normal range",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#86efac",
  }
}, [pricingMemory, smartSuggestedPrice])

const smartPricingReasons = useMemo(() => {
  const reasons: string[] = []

  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (cost > 0 && cost < 1000) {
    reasons.push("Small job — higher margin is usually safer")
  }

  if (minimumSafePrice && pricing.total < minimumSafePrice) {
    reasons.push("Current price is below your minimum safe floor")
  }

  if (minimumSafeStatus?.tone === "warning") {
    reasons.push("Current price is very close to your minimum safe floor")
  }

  if (Number(pricing.markup || 0) < 20) {
    reasons.push("Markup is lower than a typical contractor target")
  }

  if (pricingMemory?.jobCount && pricingMemory.jobCount >= 2) {
    reasons.push(
      `Based on ${pricingMemory.jobCount} similar ${pricingMemory.trade} jobs in your history`
    )
  }

  return reasons
}, [
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.total,
  pricing.markup,
  minimumSafePrice,
  minimumSafeStatus,
  pricingMemory,
])

function applySuggestedPrice() {
  const targetPrice = Number(smartSuggestedPrice || 0)
  if (!targetPrice) return

  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0

  const targetBeforeTax = targetPrice / (1 + effectiveTaxRate)
  const idealMarkup = ((targetBeforeTax - cost) / cost) * 100
  const cappedMarkup = Math.min(Math.max(0, idealMarkup), 60)

  setPricing((prev) => ({
    ...prev,
    markup: Math.round(cappedMarkup * 10) / 10,
  }))

  setPricingEdited(true)

  if (idealMarkup > 60) {
    setStatus(
      `Suggested price was $${targetPrice.toLocaleString()}, but required markup was capped at 60%. Review labor, materials, or mobilization.`
    )
  } else {
    setStatus(`Suggested price applied: $${targetPrice.toLocaleString()}`)
  }
}

function applyMinimumSafePrice() {
  if (!minimumSafePrice) return

  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0
  const targetBeforeTax = minimumSafePrice / (1 + effectiveTaxRate)
  const newMarkup = ((targetBeforeTax - cost) / cost) * 100

  setPricing((prev) => ({
    ...prev,
    markup: Math.max(0, Math.round(newMarkup * 10) / 10),
  }))

  setPricingEdited(true)
  setStatus(`Minimum safe price applied: $${minimumSafePrice.toLocaleString()}`)
}

function applyProfitTarget(targetMarginPct: number) {
  const cost =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  if (!cost) return

  const targetMargin = Math.max(0, Math.min(95, Number(targetMarginPct || 0))) / 100

  const effectiveTaxRate = taxEnabled ? Number(taxRate || 0) / 100 : 0

  // target total AFTER tax (what contractor actually collects)
  const targetAfterTax = cost / (1 - targetMargin)

  // convert to pre-tax price
  const targetBeforeTax = targetAfterTax / (1 + effectiveTaxRate)

  const newMarkup = ((targetBeforeTax - cost) / cost) * 100

  setPricing((prev) => ({
    ...prev,
    markup: Math.round(newMarkup * 10) / 10,
  }))

  setPricingEdited(true)
  setStatus(`Profit target applied: ${Math.round(targetMarginPct)}% TRUE margin`)
}

function applySmartScopePreview() {
  if (!smartScopePreview) return
  setScopeChange(
    `${smartScopePreview.original}\n\n• ${smartScopePreview.suggestions.join("\n• ")}`
  )
  setStatus("Smart scope additions applied.")
}

async function regenerateWithSmartScope() {
  if (!smartScopePreview) return

  const mergedScope =
    `${smartScopePreview.original}\n\n• ${smartScopePreview.suggestions.join("\n• ")}`

  await generate(mergedScope)
}

// -------------------------
// Jobs (localStorage)
// -------------------------
useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(JOBS_KEY)

  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) setJobs(parsed)
    } catch {}
  }

  setJobsHydrated(true)
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs))
}, [jobs])

// -------------------------
// Backfill missing jobId AFTER jobs + history load
// -------------------------
useEffect(() => {
  if (!jobsHydrated || !historyHydrated) return
  if (jobs.length === 0) return

  setHistory((prev) => {
    let changed = false

    const next = prev.map((h) => {
      if (h.jobId) return h

      const key = normalizeJobKey(h.jobDetails)
      const found = jobs.find((j) => normalizeJobKey(j) === key)

      if (!found?.id) return h

      changed = true
      return { ...h, jobId: found.id }
    })

    if (changed) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    }

    return next
  })
}, [jobsHydrated, historyHydrated, jobs])

  useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(INVOICE_KEY)
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return

    const cleaned: Invoice[] = parsed.map((x: any) => ({
      ...resolveCanonicalEstimateOutput(x),
      id: String(x?.id ?? crypto.randomUUID()),
      createdAt: Number(x?.createdAt ?? Date.now()),
      jobId: x?.jobId ? String(x.jobId) : undefined,
      fromEstimateId: String(x?.fromEstimateId ?? ""),
      invoiceNo: String(x?.invoiceNo ?? "INV-UNKNOWN"),
      issueDate: String(x?.issueDate ?? ""),
      dueDate: String(x?.dueDate ?? ""),
      billToName: String(x?.billToName ?? ""),
      jobName: String(x?.jobName ?? ""),
      jobAddress: String(x?.jobAddress ?? ""),
      lineItems: Array.isArray(x?.lineItems) ? x.lineItems : [],
      subtotal: Number(x?.subtotal ?? 0),
      total: Number(x?.total ?? 0),
      notes: String(x?.notes ?? ""),
      deposit: x?.deposit ?? undefined,
      status: normalizeInvoiceStatus(x),
      paidAt: typeof x?.paidAt === "number" ? x.paidAt : undefined,
    }))

    setInvoices(cleaned)
    localStorage.setItem(INVOICE_KEY, JSON.stringify(cleaned))
  } catch {
    // ignore bad data
  }
}, [])

useEffect(() => {
  function refreshData() {
    try {
      const histRaw = localStorage.getItem(HISTORY_KEY)
      const invRaw = localStorage.getItem(INVOICE_KEY)

      if (histRaw) {
        const parsedHist = JSON.parse(histRaw)
        if (Array.isArray(parsedHist)) {
          const cleanedHistory: EstimateHistoryItem[] =
  parsedHist.map(normalizeEstimateHistoryItem)

          setHistory(cleanedHistory)
        }
      }

      if (invRaw) {
        const parsedInv = JSON.parse(invRaw)
        if (Array.isArray(parsedInv)) {
          const cleanedInvoices: Invoice[] = parsedInv.map((x: any) => ({
            ...resolveCanonicalEstimateOutput(x),
            id: String(x?.id ?? crypto.randomUUID()),
            createdAt: Number(x?.createdAt ?? Date.now()),
            jobId: x?.jobId ? String(x.jobId) : undefined,
            fromEstimateId: String(x?.fromEstimateId ?? ""),
            invoiceNo: String(x?.invoiceNo ?? "INV-UNKNOWN"),
            issueDate: String(x?.issueDate ?? ""),
            dueDate: String(x?.dueDate ?? ""),
            billToName: String(x?.billToName ?? ""),
            jobName: String(x?.jobName ?? ""),
            jobAddress: String(x?.jobAddress ?? ""),
            lineItems: Array.isArray(x?.lineItems) ? x.lineItems : [],
            subtotal: Number(x?.subtotal ?? 0),
            total: Number(x?.total ?? 0),
            notes: String(x?.notes ?? ""),
            deposit: x?.deposit ?? undefined,
            status: normalizeInvoiceStatus(x),
            paidAt: typeof x?.paidAt === "number" ? x.paidAt : undefined,
          }))

          setInvoices(cleanedInvoices)
        }
      }
    } catch {}
  }

  window.addEventListener("jobestimatepro:update", refreshData)

  return () => {
    window.removeEventListener("jobestimatepro:update", refreshData)
  }
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(INVOICE_KEY, JSON.stringify(invoices))
}, [invoices])


useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(BUDGET_KEY)
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) setBudgets(parsed)
  } catch {}
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets))
}, [budgets])

useEffect(() => {
  if (typeof window === "undefined") return

  const saved = localStorage.getItem(ACTUALS_KEY)
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) setActuals(parsed)
  } catch {}
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(ACTUALS_KEY, JSON.stringify(actuals))
}, [actuals])

useEffect(() => {
  if (typeof window === "undefined") return
  const saved = localStorage.getItem(CREW_KEY)
  if (saved) {
    const n = Number(saved)
    if (Number.isFinite(n) && n > 0) setCrewCount(Math.max(1, Math.round(n)))
  }
}, [])

useEffect(() => {
  if (typeof window === "undefined") return
  localStorage.setItem(CREW_KEY, String(crewCount))
}, [crewCount])
  
  useEffect(() => {
  if (paid) setShowUpgrade(false)
}, [paid])



  // -------------------------
// Auto-calc total
// -------------------------
useEffect(() => {
  const base =
    Number(pricing.labor || 0) +
    Number(pricing.materials || 0) +
    Number(pricing.subs || 0)

  const markedUp = base * (1 + Number(pricing.markup || 0) / 100)
  const tax = taxEnabled ? markedUp * (Number(taxRate || 0) / 100) : 0

  const total = Math.round(markedUp + tax)

  setPricing((p) => ({ ...p, total }))
}, [
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
  taxEnabled,
  taxRate,
])

// -------------------------
// ✅ Keep latest saved estimate in sync with UI (tax/deposit/pricing)
// -------------------------

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return

  const current = findHistoryById(id)
  if (!current) return

  const patched: EstimateHistoryItem = {
    ...current,
    tax: { enabled: taxEnabled, rate: Number(taxRate || 0) },
  }

  updateHistoryItem(id, { tax: patched.tax })
  upsertBudgetFromEstimate(patched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [taxEnabled, taxRate])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return

  const current = findHistoryById(id)
  if (!current) return

  const patched: EstimateHistoryItem = {
    ...current,
    deposit: depositEnabled
      ? { enabled: true, type: depositType, value: Number(depositValue || 0) }
      : undefined,
  }

  updateHistoryItem(id, { deposit: patched.deposit })
  upsertBudgetFromEstimate(patched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [depositEnabled, depositType, depositValue])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return

  const current = findHistoryById(id)
  if (!current) return

  const patched: EstimateHistoryItem = {
    ...current,
    pricing: {
      labor: Number(pricing.labor || 0),
      materials: Number(pricing.materials || 0),
      subs: Number(pricing.subs || 0),
      markup: Number(pricing.markup || 0),
      total: Number(pricing.total || 0),
    },
  }

  updateHistoryItem(id, { pricing: patched.pricing })
  upsertBudgetFromEstimate(patched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pricing.labor, pricing.materials, pricing.subs, pricing.markup, pricing.total])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return
  updateHistoryItem(id, {
    schedule: schedule ?? undefined,
  })
}, [schedule])

useEffect(() => {
  const id = lastSavedEstimateIdRef.current
  if (!id) return
  if (!result) return
  if (!pricingEdited) return

  const nextProfitProtection = buildProfitProtectionFromPricing({
    labor: Number(pricing.labor || 0),
    materials: Number(pricing.materials || 0),
    subs: Number(pricing.subs || 0),
    markup: Number(pricing.markup || 0),
  })

  if (!nextProfitProtection) return

  setProfitProtection(nextProfitProtection)

  updateHistoryItem(id, {
    profitProtection: nextProfitProtection,
  })
}, [
  result,
  pricingEdited,
  pricing.labor,
  pricing.materials,
  pricing.subs,
  pricing.markup,
])

  // -------------------------
// Generate AI document
// -------------------------
async function generate(scopeOverride?: string) {
  if (generatingRef.current) return
  generatingRef.current = true

  if (loading) {
    generatingRef.current = false
    return
  }

  const e = email.trim().toLowerCase()
  if (!e) {
    setStatus("Please enter the email used at checkout.")
    generatingRef.current = false
    return
  }

  const finalScopeChange =
  typeof scopeOverride === "string"
    ? scopeOverride.trim()
    : String(scopeChange || "").trim()

    if (!finalScopeChange) {
    setStatus("Please describe the scope change.")
    generatingRef.current = false
    return
  }

  if (!paid && remaining <= 0) {
    setStatus("Free limit reached. Upgrade to continue generating estimates.")
    setShowUpgrade(true)
    generatingRef.current = false
    return
  }

  setLoading(true)
  setStatus("") // prevents duplicate “Generating…” line
  setResult(null)
  setEstimateRows(null)
  setEstimateEmbeddedBurdens(null)
  setEstimateSections(null)
  setPricingSource("ai")
  setShowPriceGuardDetails(false)
  setPriceGuard(null)
  setPricingEdited(false)
  setPriceGuardVerified(false)
  setSchedule(null)
  setScopeSignals(null)
  setPhotoAnalysis(null)
  setPhotoScopeAssist(null)
  setPlanIntelligence(null)
  setEstimateSkeletonHandoff(null)
  setEstimateStructureConsumption(null)
  setMaterialsList(null)
  setAreaScopeBreakdown(null)
  setProfitProtection(null)
  setScopeXRay(null)
  setMissedScopeDetector(null)
  setProfitLeakDetector(null)
  setEstimateDefenseMode(null)
  setTradePricingPrepAnalysis(null)
  setChangeOrderDetection(null)

    if (scopeOverride) {
    setScopeChange(finalScopeChange)
    setStatus("Regenerating with smart scope suggestions...")
  }

const sendPaintScope =
  trade === "painting" || (trade === "" && hasPaintWord)

const paintScopeToSend = sendPaintScope
  ? (effectivePaintScope === "doors_only" ? "walls" : paintScope)
  : null

const tradeToSend =
  trade === "bathroom_tile" || trade === "general_renovation"
    ? "general renovation"
    : trade

  try {
    const requestId = crypto.randomUUID()

const photosToSend =
  jobPhotos.length > 0
    ? (() => {
        const selected: {
          name: string
          dataUrl: string
          roomTag: string
          shotType:
            | "overview"
            | "corner"
            | "wall"
            | "ceiling"
            | "floor"
            | "fixture"
            | "damage"
            | "measurement"
          note: string
          reference: {
            kind: "none" | "custom"
            label: string
            realWidthIn: number | null
          }
        }[] = []

        let runningTotal = 0

        for (const p of jobPhotos) {
          const size = p.dataUrl?.length || 0

          if (size > MAX_PHOTO_DATAURL_LENGTH) continue
          if (runningTotal + size > MAX_TOTAL_PHOTO_PAYLOAD) continue

          selected.push({
            name: p.name,
            dataUrl: p.dataUrl,
            roomTag: p.roomTag || "",
            shotType: p.shotType || "overview",
            note: p.note || "",
            reference: p.reference ?? {
              kind: "none",
              label: "",
              realWidthIn: null,
            },
          })

          runningTotal += size
        }

        return selected.length > 0 ? selected : null
      })()
    : null

if (jobPhotos.length > 0 && (!photosToSend || photosToSend.length < jobPhotos.length)) {
  setStatus("Some photos were skipped automatically to keep upload size within limits.")
}

const planPreflightIssues = jobPlans
  .map((plan) => getPlanPreflightIssue(plan))
  .filter((issue): issue is string => !!issue)

const estimatedSelectedPlanBytes = jobPlans.reduce(
  (sum, plan) => sum + estimatePlanTransportBytes(plan),
  0
)

if (planPreflightIssues.length > 0) {
  setStatus(planPreflightIssues[0])
  return
}

if (estimatedSelectedPlanBytes > MAX_TOTAL_PLAN_FILE_BYTES) {
  setStatus(
    `Selected plan transport is still above the ${Math.floor(
      MAX_TOTAL_PLAN_FILE_BYTES / (1024 * 1024)
    )} MB limit. Reduce selected pages further or split the PDF into smaller packages.`
  )
  return
}

console.log("photo count:", jobPhotos.length)
console.log(
  "selected photo count:",
  photosToSend?.length ?? 0
)
console.log(
  "selected photo sizes:",
  photosToSend?.map((p) => p.dataUrl.length) ?? []
)
console.log(
  "selected total photo payload:",
  photosToSend?.reduce((sum, p) => sum + p.dataUrl.length, 0) ?? 0
)

const requestPayload = {
  requestId,
  email: e,
  scopeChange: finalScopeChange,
  trade: tradeToSend,
  state,
  paintScope: paintScopeToSend,
  workDaysPerWeek: 5,
  measurements: measureEnabled
    ? { rows: measureRows, totalSqft, units: "ft" }
    : null,
  photos: photosToSend,
  plans: null as null | Array<{
    uploadId: string
    stagedUploadId: string
    name: string
    note: string
    mimeType: string
    bytes: number
    originalBytes: number
    transport: "staged"
    selectedSourcePages: number[]
  }>,
}

let res: Response

if (jobPlans.length > 0) {
  setStatus(`Preparing ${jobPlans.length} selected plan file${jobPlans.length === 1 ? "" : "s"} for reliable upload...`)

  const stagedPlans = []
  const stageNotices: string[] = []
  for (const plan of jobPlans) {
    const staged = await stagePlanForGenerate(plan, (message) => setStatus(message))
    setJobPlans((prev) =>
      prev.map((existing) =>
        existing.id === plan.id
          ? {
              ...existing,
              stagedUploadId: staged.stagedUploadId,
              bytes: staged.bytes,
              originalBytes: staged.originalBytes,
              stagedSourcePageCount:
                typeof staged.sourcePageCount === "number" ? staged.sourcePageCount : null,
              selectedPageUploadMode: staged.selectedPageUploadMode,
              selectedPageUploadNote: staged.selectedPageUploadNote ?? null,
            }
          : existing
      )
    )
    if (staged.selectedPageUploadNote) {
      stageNotices.push(staged.selectedPageUploadNote)
    }

    stageNotices.push(
      buildSelectedPageUploadDebugSummary({
        mode: staged.selectedPageUploadMode,
        originalBytes: staged.originalBytes,
        stagedBytes: staged.bytes,
        analyzedPages: plan.pages.filter((page) => page.selected).length,
        originalSourcePageCount: staged.originalSourcePageCount ?? plan.sourcePageCount,
      })
    )

    stagedPlans.push({
      uploadId: plan.id,
      stagedUploadId: staged.stagedUploadId,
      name: plan.name,
      note: plan.note,
      mimeType: plan.mimeType,
      bytes: staged.bytes,
      originalBytes: staged.originalBytes,
      transport: "staged" as const,
      selectedSourcePages: plan.pages
        .filter((page) => page.selected)
        .map((page) => page.sourcePageNumber),
    })
  }

  if (stageNotices.length > 0) {
    setStatus(stageNotices[stageNotices.length - 1])
  }

  requestPayload.plans = stagedPlans
  setStatus(`Preparing ${jobPlans.length} staged plan file${jobPlans.length === 1 ? "" : "s"} with selected-page transport...`)

  res = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": requestId,
    },
    body: JSON.stringify(requestPayload),
  })
} else {
  res = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": requestId,
    },
    body: JSON.stringify(requestPayload),
  })
}

    if (res.status === 403) {
      setStatus("Free limit reached. Upgrade to continue generating estimates.")
      setShowUpgrade(true)
      setRemaining(0)
      return
    }

    if (res.status === 429) {
      const payload = await res.json().catch(() => null)
      const retry = payload?.retry_after
      setStatus(
        retry
          ? `Too many requests. Try again later. (retry-after: ${retry}s)`
          : "Too many requests. Please try again in a moment."
      )
      return
    }

    if (!res.ok) {
      const msg = await readGenerateResponseErrorMessage(res)
      setStatus(`Server error (${res.status}). ${msg}`)
      return
    }

    const data = await res.json()
    console.log("pricingSource:", data.pricingSource)

    const nextVerified = data?.priceGuardVerified === true
    setPriceGuardVerified(nextVerified)
    setPriceGuard(data?.priceGuard ?? null)

const rawDocumentType = String(data?.documentType ?? "").trim()

const nextDocumentType: DocumentType =
  rawDocumentType === "Change Order" ? "Change Order" : "Estimate"

const rawResultText = String(data.text || data.description || "").trim()
const nextPricing = data.pricing ? data.pricing : pricing
const nextPricingSource =
  (data?.pricingSource as PricingSource) || "ai"

const normalizedSchedule =
  data?.schedule
    ? {
        ...data.schedule,
        startDate:
          data.schedule.startDate ?? new Date().toISOString().slice(0, 10),
        crewDays:
          data.schedule.crewDays == null ? null : Number(data.schedule.crewDays),
        visits:
          data.schedule.visits == null ? null : Number(data.schedule.visits),
        workDaysPerWeek:
          data.schedule.workDaysPerWeek == null
            ? 5
            : Number(data.schedule.workDaysPerWeek),
        calendarDays:
          data.schedule.calendarDays?.min != null &&
          data.schedule.calendarDays?.max != null
            ? {
                min: Number(data.schedule.calendarDays.min),
                max: Number(data.schedule.calendarDays.max),
              }
            : null,
        rationale: Array.isArray(data.schedule.rationale)
          ? data.schedule.rationale
          : [],
      }
    : null

setSchedule(normalizedSchedule)
setScopeSignals(data?.scopeSignals ?? null)
setPhotoAnalysis(data?.photoAnalysis ?? null)
setPhotoScopeAssist(data?.photoScopeAssist ?? null)
setPlanIntelligence(
  data?.planIntelligence
    ? {
        summary:
          typeof data.planIntelligence?.summary === "string"
            ? data.planIntelligence.summary.trim()
            : null,
        estimatorPackages: normalizePlanPackages(data.planIntelligence?.estimatorPackages),
        planReadback: normalizePlanReadback(data.planIntelligence?.planReadback),
        detectedRooms: normalizePlanStrings(data.planIntelligence?.detectedRooms),
        detectedTrades: normalizePlanStrings(data.planIntelligence?.detectedTrades),
        sheetRoleSignals: normalizePlanStrings(data.planIntelligence?.sheetRoleSignals),
        prototypeSignals: normalizePlanStrings(data.planIntelligence?.prototypeSignals),
        repeatScalingSignals: normalizePlanStrings(data.planIntelligence?.repeatScalingSignals),
        packageGroupingSignals: normalizePlanStrings(data.planIntelligence?.packageGroupingSignals),
        bidStrategyNotes: normalizePlanStrings(data.planIntelligence?.bidStrategyNotes),
        highValueSheetSignals: normalizePlanStrings(data.planIntelligence?.highValueSheetSignals),
        pricingAnchorSignals: normalizePlanStrings(data.planIntelligence?.pricingAnchorSignals),
        bidCoverageGaps: normalizePlanStrings(data.planIntelligence?.bidCoverageGaps),
        estimatingPrioritySignals: normalizePlanStrings(
          data.planIntelligence?.estimatingPrioritySignals
        ),
        bidExecutionNotes: normalizePlanStrings(data.planIntelligence?.bidExecutionNotes),
        pricingPackageSignals: normalizePlanStrings(data.planIntelligence?.pricingPackageSignals),
        prototypePackageSignals: normalizePlanStrings(
          data.planIntelligence?.prototypePackageSignals
        ),
        packageScopeCandidates: normalizePlanStrings(data.planIntelligence?.packageScopeCandidates),
        packageScalingGuidance: normalizePlanStrings(data.planIntelligence?.packageScalingGuidance),
        packageConfidenceNotes: normalizePlanStrings(data.planIntelligence?.packageConfidenceNotes),
        estimatingFrameworkNotes: normalizePlanStrings(
          data.planIntelligence?.estimatingFrameworkNotes
        ),
        estimateStructureSignals: normalizePlanStrings(
          data.planIntelligence?.estimateStructureSignals
        ),
        estimatePackageCandidates: normalizePlanStrings(
          data.planIntelligence?.estimatePackageCandidates
        ),
        packageTradeScopeSignals: normalizePlanStrings(
          data.planIntelligence?.packageTradeScopeSignals
        ),
        packagePricingBasisSignals: normalizePlanStrings(
          data.planIntelligence?.packagePricingBasisSignals
        ),
        packageAllowanceSignals: normalizePlanStrings(
          data.planIntelligence?.packageAllowanceSignals
        ),
        estimateAssemblyGuidance: normalizePlanStrings(
          data.planIntelligence?.estimateAssemblyGuidance
        ),
        estimateScaffoldNotes: normalizePlanStrings(
          data.planIntelligence?.estimateScaffoldNotes
        ),
        repeatedSpaceSignals: normalizePlanStrings(
          data.planIntelligence?.repeatedSpaceSignals
        ),
        likelyRoomTypes: normalizePlanStrings(data.planIntelligence?.likelyRoomTypes),
        scalableScopeSignals: normalizePlanStrings(
          data.planIntelligence?.scalableScopeSignals
        ),
        tradePackageSignals: normalizePlanStrings(
          data.planIntelligence?.tradePackageSignals
        ),
        bidAssistNotes: normalizePlanStrings(data.planIntelligence?.bidAssistNotes),
        scopeAssist: {
          missingScopeFlags: normalizePlanStrings(
            data.planIntelligence?.scopeAssist?.missingScopeFlags
          ),
          suggestedAdditions: normalizePlanStrings(
            data.planIntelligence?.scopeAssist?.suggestedAdditions
          ),
        },
      }
    : null
)

const normalizedMaterialsList: MaterialsList =
  data?.materialsList
    ? {
        items: Array.isArray(data.materialsList?.items)
          ? data.materialsList.items
              .map((item: any) => ({
                label: String(item?.label ?? "").trim(),
                quantity: String(item?.quantity ?? "").trim(),
                category:
                  item?.category === "material" ||
                  item?.category === "consumable" ||
                  item?.category === "hardware" ||
                  item?.category === "protection"
                    ? item.category
                    : "material",
                confidence:
                  item?.confidence === "low" ||
                  item?.confidence === "medium" ||
                  item?.confidence === "high"
                    ? item.confidence
                    : undefined,
              }))
              .filter((item: any) => item.label && item.quantity)
          : [],
        confirmItems: Array.isArray(data.materialsList?.confirmItems)
          ? data.materialsList.confirmItems.map((x: any) => String(x))
          : [],
        notes: Array.isArray(data.materialsList?.notes)
          ? data.materialsList.notes.map((x: any) => String(x))
          : [],
      }
    : null

setMaterialsList(normalizedMaterialsList)

const resolvedAreaTrade = normalizeTrade(data?.trade || trade)

const normalizedAreaScopeBreakdown: AreaScopeBreakdown =
  data?.areaScopeBreakdown
    ? (() => {
        const rawDetectedArea = data.areaScopeBreakdown?.detectedArea ?? {}
        const rawAllowances = data.areaScopeBreakdown?.allowances ?? {}

        const isFlooringTrade = resolvedAreaTrade === "flooring"

        const floorSqft =
          rawDetectedArea?.floorSqft == null
            ? null
            : Number(rawDetectedArea.floorSqft)

        const wallSqft =
          isFlooringTrade
            ? null
            : rawDetectedArea?.wallSqft == null
            ? null
            : Number(rawDetectedArea.wallSqft)

        const paintSqft =
          isFlooringTrade
            ? null
            : rawDetectedArea?.paintSqft == null
            ? null
            : Number(rawDetectedArea.paintSqft)

        const trimLf =
          rawDetectedArea?.trimLf == null
            ? null
            : Number(rawDetectedArea.trimLf)

        const materialsDrivers = Array.isArray(rawAllowances?.materialsDrivers)
          ? rawAllowances.materialsDrivers
              .map((x: any) => String(x))
              .filter((x: string) =>
                isFlooringTrade
                  ? !/wall area|paint sq\s*ft|paint area/i.test(x)
                  : true
              )
          : []

        return {
          detectedArea: {
            floorSqft,
            wallSqft,
            paintSqft,
            trimLf,
          },
          allowances: {
            prepDemo: Array.isArray(rawAllowances?.prepDemo)
              ? rawAllowances.prepDemo.map((x: any) => String(x))
              : [],
            protectionSetup: Array.isArray(rawAllowances?.protectionSetup)
              ? rawAllowances.protectionSetup.map((x: any) => String(x))
              : [],
            materialsDrivers,
            scheduleDrivers: Array.isArray(rawAllowances?.scheduleDrivers)
              ? rawAllowances.scheduleDrivers.map((x: any) => String(x))
              : [],
          },
          missingConfirmations: Array.isArray(data.areaScopeBreakdown?.missingConfirmations)
            ? data.areaScopeBreakdown.missingConfirmations.map((x: any) => String(x))
            : [],
        }
      })()
    : null

const normalizedProfitProtection =
  normalizeProfitProtection(data?.profitProtection) ??
  buildProfitProtectionFromPricing({
    labor: Number(nextPricing.labor || 0),
    materials: Number(nextPricing.materials || 0),
    subs: Number(nextPricing.subs || 0),
    markup: Number(nextPricing.markup || 0),
  })

setAreaScopeBreakdown(normalizedAreaScopeBreakdown)
setProfitProtection(normalizedProfitProtection)

const normalizedScopeXRay = data?.scopeXRay
  ? {
      detectedScope: {
        primaryTrade: String(data.scopeXRay?.detectedScope?.primaryTrade ?? ""),
        splitScopes: Array.isArray(data.scopeXRay?.detectedScope?.splitScopes)
          ? data.scopeXRay.detectedScope.splitScopes
          : [],
        paintScope: data.scopeXRay?.detectedScope?.paintScope ?? null,
        state: String(data.scopeXRay?.detectedScope?.state ?? ""),
      },
      quantities: Array.isArray(data.scopeXRay?.quantities)
        ? data.scopeXRay.quantities
        : [],
      pricingMethod: {
        pricingSource:
          data.scopeXRay?.pricingMethod?.pricingSource === "deterministic" ||
          data.scopeXRay?.pricingMethod?.pricingSource === "merged"
            ? data.scopeXRay.pricingMethod.pricingSource
            : "ai",
        detSource: data.scopeXRay?.pricingMethod?.detSource ?? null,
        anchorId: data.scopeXRay?.pricingMethod?.anchorId ?? null,
        verified: data.scopeXRay?.pricingMethod?.verified === true,
        stateAdjusted: data.scopeXRay?.pricingMethod?.stateAdjusted === true,
      },
      scheduleLogic: {
        crewDays:
          data.scopeXRay?.scheduleLogic?.crewDays == null
            ? null
            : Number(data.scopeXRay.scheduleLogic.crewDays),
        visits:
          data.scopeXRay?.scheduleLogic?.visits == null
            ? null
            : Number(data.scopeXRay.scheduleLogic.visits),
        reasons: Array.isArray(data.scopeXRay?.scheduleLogic?.reasons)
          ? data.scopeXRay.scheduleLogic.reasons
          : [],
      },
      riskFlags: Array.isArray(data.scopeXRay?.riskFlags)
        ? data.scopeXRay.riskFlags
        : [],
      needsConfirmation: Array.isArray(data.scopeXRay?.needsConfirmation)
        ? data.scopeXRay.needsConfirmation
        : [],
    }
  : null

const normalizeTierAInsightItems = (items: unknown): TierAInsightItem[] =>
  Array.isArray(items)
    ? items
        .map((item): TierAInsightItem => {
          const evidence =
            item &&
            typeof item === "object" &&
            "evidence" in item &&
            Array.isArray(item.evidence)
              ? item.evidence.map((x: unknown) => String(x).trim()).filter(Boolean)
              : []

          return {
            label:
              item && typeof item === "object" && "label" in item
                ? String(item.label ?? "").trim()
                : "",
            reason:
              item && typeof item === "object" && "reason" in item
                ? String(item.reason ?? "").trim()
                : "",
            evidence,
            confidence:
              item && typeof item === "object" && "confidence" in item
                ? Number(item.confidence ?? 0)
                : 0,
            severity:
              item && typeof item === "object" && "severity" in item && item.severity === "high"
                ? "high"
                : "medium",
          }
        })
        .filter((item) => Boolean(item.label || item.reason))
    : []

const normalizedMissedScopeDetector = data?.missedScopeDetector
  ? {
      likelyMissingScope: normalizeTierAInsightItems(
        data.missedScopeDetector?.likelyMissingScope
      ),
      recommendedConfirmations: normalizeTierAInsightItems(
        data.missedScopeDetector?.recommendedConfirmations
      ),
    }
  : null

const normalizedProfitLeakDetector = data?.profitLeakDetector
  ? {
      likelyProfitLeaks: normalizeTierAInsightItems(
        data.profitLeakDetector?.likelyProfitLeaks
      ),
      pricingReviewPrompts: normalizeTierAInsightItems(
        data.profitLeakDetector?.pricingReviewPrompts
      ),
    }
  : null

const normalizeDefenseList = (items: unknown): string[] =>
  Array.isArray(items)
    ? items.map((x: unknown) => String(x).trim()).filter(Boolean)
    : []

const normalizedEstimateSkeletonHandoff = data?.estimateSkeletonHandoff
  ? {
      estimatorBucketGuidance: normalizeDefenseList(
        data.estimateSkeletonHandoff?.estimatorBucketGuidance
      ),
      estimatorBucketDrafts: Array.isArray(data.estimateSkeletonHandoff?.estimatorBucketDrafts)
        ? data.estimateSkeletonHandoff.estimatorBucketDrafts
            .map((bucket: unknown) => ({
              bucketName:
                bucket && typeof bucket === "object" && "bucketName" in bucket
                  ? String(bucket.bucketName ?? "").trim()
                  : "",
              bucketRole:
                bucket && typeof bucket === "object" && "bucketRole" in bucket
                  ? String(bucket.bucketRole ?? "").trim()
                  : "support package",
              likelyTradeCoverage:
                bucket && typeof bucket === "object" && "likelyTradeCoverage" in bucket
                  ? normalizeDefenseList(bucket.likelyTradeCoverage)
                  : [],
              likelyScopeBasis:
                bucket && typeof bucket === "object" && "likelyScopeBasis" in bucket
                  ? normalizeDefenseList(bucket.likelyScopeBasis)
                  : [],
              allowanceReviewStatus:
                bucket &&
                typeof bucket === "object" &&
                "allowanceReviewStatus" in bucket &&
                (bucket.allowanceReviewStatus === "structure_ready" ||
                  bucket.allowanceReviewStatus === "support_only" ||
                  bucket.allowanceReviewStatus === "allowance_review")
                  ? bucket.allowanceReviewStatus
                  : "support_only",
            }))
            .filter((bucket: { bucketName: string }) => bucket.bucketName)
        : [],
      estimatorSectionSkeletons: Array.isArray(
        data.estimateSkeletonHandoff?.estimatorSectionSkeletons
      )
        ? data.estimateSkeletonHandoff.estimatorSectionSkeletons
            .map((section: unknown) => ({
              packageKey:
                section && typeof section === "object" && "packageKey" in section
                  ? String(section.packageKey ?? "").trim()
                  : "",
              bucketName:
                section && typeof section === "object" && "bucketName" in section
                  ? String(section.bucketName ?? "").trim()
                  : "",
              sectionTitle:
                section && typeof section === "object" && "sectionTitle" in section
                  ? String(section.sectionTitle ?? "").trim()
                  : "",
              trade:
                section && typeof section === "object" && "trade" in section
                  ? String(section.trade ?? "").trim()
                  : "general renovation",
              supportType:
                section && typeof section === "object" && "supportType" in section
                  ? String(section.supportType ?? "").trim()
                  : "support_only",
              scopeBreadth:
                section && typeof section === "object" && "scopeBreadth" in section
                  ? String(section.scopeBreadth ?? "").trim()
                  : "narrow",
              sectionReadiness:
                section && typeof section === "object" && "sectionReadiness" in section
                  ? String(section.sectionReadiness ?? "").trim()
                  : "review_only",
              quantityAnchor:
                section && typeof section === "object" && "quantityAnchor" in section
                  ? section.quantityAnchor == null
                    ? null
                    : String(section.quantityAnchor).trim()
                  : null,
              scopeBullets:
                section && typeof section === "object" && "scopeBullets" in section
                  ? normalizeDefenseList(section.scopeBullets)
                  : [],
              cautionNotes:
                section && typeof section === "object" && "cautionNotes" in section
                  ? normalizeDefenseList(section.cautionNotes)
                  : [],
              evidence:
                section && typeof section === "object" && "evidence" in section && Array.isArray(section.evidence)
                  ? section.evidence
                      .map((ref: unknown) => ({
                        uploadId:
                          ref && typeof ref === "object" && "uploadId" in ref
                            ? String(ref.uploadId ?? "").trim()
                            : "",
                        uploadName:
                          ref && typeof ref === "object" && "uploadName" in ref
                            ? String(ref.uploadName ?? "").trim()
                            : "",
                        sourcePageNumber:
                          ref && typeof ref === "object" && "sourcePageNumber" in ref
                            ? Number(ref.sourcePageNumber ?? 0) || 0
                            : 0,
                        pageNumber:
                          ref && typeof ref === "object" && "pageNumber" in ref
                            ? Number(ref.pageNumber ?? 0) || 0
                            : 0,
                        sheetNumber:
                          ref && typeof ref === "object" && "sheetNumber" in ref
                            ? ref.sheetNumber == null
                              ? null
                              : String(ref.sheetNumber).trim()
                            : null,
                        sheetTitle:
                          ref && typeof ref === "object" && "sheetTitle" in ref
                            ? ref.sheetTitle == null
                              ? null
                              : String(ref.sheetTitle).trim()
                            : null,
                        excerpt:
                          ref && typeof ref === "object" && "excerpt" in ref
                            ? String(ref.excerpt ?? "").trim()
                            : "",
                        confidence:
                          ref && typeof ref === "object" && "confidence" in ref
                            ? Number(ref.confidence ?? 0) || 0
                            : 0,
                      }))
                      .filter((ref: { uploadId: string }) => ref.uploadId)
                  : [],
            }))
            .filter((section: { sectionTitle: string }) => section.sectionTitle)
        : [],
      bucketScopeDrafts: normalizeDefenseList(
        data.estimateSkeletonHandoff?.bucketScopeDrafts
      ),
      bucketAllowanceFlags: normalizeDefenseList(
        data.estimateSkeletonHandoff?.bucketAllowanceFlags
      ),
      bucketHandoffNotes: normalizeDefenseList(
        data.estimateSkeletonHandoff?.bucketHandoffNotes
      ),
      estimateStructureHandoffSummary:
        typeof data.estimateSkeletonHandoff?.estimateStructureHandoffSummary === "string"
          ? data.estimateSkeletonHandoff.estimateStructureHandoffSummary.trim()
          : "",
    }
  : null

const normalizedEstimateStructureConsumption = data?.estimateStructureConsumption
  ? {
      structuredEstimateBuckets: Array.isArray(
        data.estimateStructureConsumption?.structuredEstimateBuckets
      )
        ? data.estimateStructureConsumption.structuredEstimateBuckets
            .map((bucket: unknown) => ({
              bucketName:
                bucket && typeof bucket === "object" && "bucketName" in bucket
                  ? String(bucket.bucketName ?? "").trim()
                  : "",
              bucketRole:
                bucket && typeof bucket === "object" && "bucketRole" in bucket
                  ? String(bucket.bucketRole ?? "").trim()
                  : "support package",
              likelyTradeCoverage:
                bucket && typeof bucket === "object" && "likelyTradeCoverage" in bucket
                  ? normalizeDefenseList(bucket.likelyTradeCoverage)
                  : [],
              likelyScopeBasis:
                bucket && typeof bucket === "object" && "likelyScopeBasis" in bucket
                  ? normalizeDefenseList(bucket.likelyScopeBasis)
                  : [],
              allowanceReviewStatus:
                bucket &&
                typeof bucket === "object" &&
                "allowanceReviewStatus" in bucket &&
                (bucket.allowanceReviewStatus === "structure_ready" ||
                  bucket.allowanceReviewStatus === "support_only" ||
                  bucket.allowanceReviewStatus === "allowance_review")
                  ? bucket.allowanceReviewStatus
                  : "support_only",
              safeForPrimaryStructure:
                bucket &&
                typeof bucket === "object" &&
                "safeForPrimaryStructure" in bucket
                  ? bucket.safeForPrimaryStructure === true
                  : false,
            }))
            .filter((bucket: { bucketName: string }) => bucket.bucketName)
        : [],
      structuredEstimateSections: Array.isArray(
        data.estimateStructureConsumption?.structuredEstimateSections
      )
        ? data.estimateStructureConsumption.structuredEstimateSections
            .map((section: unknown) => ({
              sectionTitle:
                section && typeof section === "object" && "sectionTitle" in section
                  ? String(section.sectionTitle ?? "").trim()
                  : "",
              trade:
                section && typeof section === "object" && "trade" in section
                  ? String(section.trade ?? "").trim()
                  : "general renovation",
              bucketName:
                section && typeof section === "object" && "bucketName" in section
                  ? String(section.bucketName ?? "").trim()
                  : "",
              supportType:
                section && typeof section === "object" && "supportType" in section
                  ? String(section.supportType ?? "").trim()
                  : "support_only",
              scopeBreadth:
                section && typeof section === "object" && "scopeBreadth" in section
                  ? String(section.scopeBreadth ?? "").trim()
                  : "narrow",
              sectionReadiness:
                section && typeof section === "object" && "sectionReadiness" in section
                  ? String(section.sectionReadiness ?? "").trim()
                  : "review_only",
              quantityAnchor:
                section && typeof section === "object" && "quantityAnchor" in section
                  ? section.quantityAnchor == null
                    ? null
                    : String(section.quantityAnchor).trim()
                  : null,
              quantityNormalization:
                section && typeof section === "object" && "quantityNormalization" in section
                  ? String(section.quantityNormalization ?? "").trim()
                  : "review_only",
              scopeBullets:
                section && typeof section === "object" && "scopeBullets" in section
                  ? normalizeDefenseList(section.scopeBullets)
                  : [],
              cautionNotes:
                section && typeof section === "object" && "cautionNotes" in section
                  ? normalizeDefenseList(section.cautionNotes)
                  : [],
              tradeMeasurementDrafts:
                section && typeof section === "object" && "tradeMeasurementDrafts" in section
                  ? normalizeDefenseList(section.tradeMeasurementDrafts)
                  : [],
              normalizedEstimatorInputCandidates:
                section &&
                typeof section === "object" &&
                "normalizedEstimatorInputCandidates" in section
                  ? normalizeDefenseList(section.normalizedEstimatorInputCandidates)
                  : [],
              estimatorInputGuardrails:
                section &&
                typeof section === "object" &&
                "estimatorInputGuardrails" in section
                  ? normalizeDefenseList(section.estimatorInputGuardrails)
                  : [],
              safeForSectionBuild:
                Boolean(
                  section &&
                    typeof section === "object" &&
                    "safeForSectionBuild" in section &&
                    section.safeForSectionBuild
                ),
              evidence:
                section && typeof section === "object" && "evidence" in section && Array.isArray(section.evidence)
                  ? section.evidence
                      .map((ref: unknown) => ({
                        uploadId:
                          ref && typeof ref === "object" && "uploadId" in ref
                            ? String(ref.uploadId ?? "").trim()
                            : "",
                        uploadName:
                          ref && typeof ref === "object" && "uploadName" in ref
                            ? String(ref.uploadName ?? "").trim()
                            : "",
                        sourcePageNumber:
                          ref && typeof ref === "object" && "sourcePageNumber" in ref
                            ? Number(ref.sourcePageNumber ?? 0) || 0
                            : 0,
                        pageNumber:
                          ref && typeof ref === "object" && "pageNumber" in ref
                            ? Number(ref.pageNumber ?? 0) || 0
                            : 0,
                        sheetNumber:
                          ref && typeof ref === "object" && "sheetNumber" in ref
                            ? ref.sheetNumber == null
                              ? null
                              : String(ref.sheetNumber).trim()
                            : null,
                        sheetTitle:
                          ref && typeof ref === "object" && "sheetTitle" in ref
                            ? ref.sheetTitle == null
                              ? null
                              : String(ref.sheetTitle).trim()
                            : null,
                        excerpt:
                          ref && typeof ref === "object" && "excerpt" in ref
                            ? String(ref.excerpt ?? "").trim()
                            : "",
                        confidence:
                          ref && typeof ref === "object" && "confidence" in ref
                            ? Number(ref.confidence ?? 0) || 0
                            : 0,
                      }))
                      .filter((ref: { uploadId: string }) => ref.uploadId)
                  : [],
            }))
            .filter((section: { sectionTitle: string }) => section.sectionTitle)
        : [],
      structuredTradeInputAssemblies: Array.isArray(
        data.estimateStructureConsumption?.structuredTradeInputAssemblies
      )
        ? data.estimateStructureConsumption.structuredTradeInputAssemblies
            .map((assembly: unknown) => {
              const normalizeCandidate = (candidate: unknown) =>
                candidate && typeof candidate === "object"
                  ? {
                      sectionTitle:
                        "sectionTitle" in candidate ? String(candidate.sectionTitle ?? "").trim() : "",
                      trade: "trade" in candidate ? String(candidate.trade ?? "").trim() : "general renovation",
                      candidateRole:
                        "candidateRole" in candidate
                          ? String(candidate.candidateRole ?? "").trim()
                          : "review_only",
                      quantityNormalization:
                        "quantityNormalization" in candidate
                          ? String(candidate.quantityNormalization ?? "").trim()
                          : "review_only",
                      supportType:
                        "supportType" in candidate
                          ? String(candidate.supportType ?? "").trim()
                          : "support_only",
                      scopeBreadth:
                        "scopeBreadth" in candidate
                          ? String(candidate.scopeBreadth ?? "").trim()
                          : "narrow",
                      quantityAnchor:
                        "quantityAnchor" in candidate
                          ? candidate.quantityAnchor == null
                            ? null
                            : String(candidate.quantityAnchor).trim()
                          : null,
                      candidateSummary:
                        "candidateSummary" in candidate
                          ? String(candidate.candidateSummary ?? "").trim()
                          : "",
                      evidence:
                        "evidence" in candidate && Array.isArray(candidate.evidence)
                          ? candidate.evidence
                              .map((ref: unknown) => ({
                                uploadId:
                                  ref && typeof ref === "object" && "uploadId" in ref
                                    ? String(ref.uploadId ?? "").trim()
                                    : "",
                                uploadName:
                                  ref && typeof ref === "object" && "uploadName" in ref
                                    ? String(ref.uploadName ?? "").trim()
                                    : "",
                                sourcePageNumber:
                                  ref && typeof ref === "object" && "sourcePageNumber" in ref
                                    ? Number(ref.sourcePageNumber ?? 0) || 0
                                    : 0,
                                pageNumber:
                                  ref && typeof ref === "object" && "pageNumber" in ref
                                    ? Number(ref.pageNumber ?? 0) || 0
                                    : 0,
                                sheetNumber:
                                  ref && typeof ref === "object" && "sheetNumber" in ref
                                    ? ref.sheetNumber == null
                                      ? null
                                      : String(ref.sheetNumber).trim()
                                    : null,
                                sheetTitle:
                                  ref && typeof ref === "object" && "sheetTitle" in ref
                                    ? ref.sheetTitle == null
                                      ? null
                                      : String(ref.sheetTitle).trim()
                                    : null,
                                excerpt:
                                  ref && typeof ref === "object" && "excerpt" in ref
                                    ? String(ref.excerpt ?? "").trim()
                                    : "",
                                confidence:
                                  ref && typeof ref === "object" && "confidence" in ref
                                    ? Number(ref.confidence ?? 0) || 0
                                    : 0,
                              }))
                              .filter((ref: { uploadId: string }) => ref.uploadId)
                          : [],
                    }
                  : null
              return {
                trade:
                  assembly && typeof assembly === "object" && "trade" in assembly
                    ? String(assembly.trade ?? "").trim()
                    : "general renovation",
                primaryCandidate:
                  assembly && typeof assembly === "object" && "primaryCandidate" in assembly
                    ? normalizeCandidate(assembly.primaryCandidate)
                    : null,
                secondaryCandidates:
                  assembly && typeof assembly === "object" && "secondaryCandidates" in assembly
                    ? normalizeDefenseList(assembly.secondaryCandidates).length >= 0 &&
                      Array.isArray(assembly.secondaryCandidates)
                      ? assembly.secondaryCandidates
                          .map((candidate: unknown) => normalizeCandidate(candidate))
                          .filter(Boolean)
                      : []
                    : [],
                reviewCandidates:
                  assembly && typeof assembly === "object" && "reviewCandidates" in assembly
                    ? Array.isArray(assembly.reviewCandidates)
                      ? assembly.reviewCandidates
                          .map((candidate: unknown) => normalizeCandidate(candidate))
                          .filter(Boolean)
                      : []
                    : [],
                assemblyNotes:
                  assembly && typeof assembly === "object" && "assemblyNotes" in assembly
                    ? normalizeDefenseList(assembly.assemblyNotes)
                    : [],
              }
            })
            .filter((assembly: { trade: string }) => assembly.trade)
        : [],
      estimateGroupingSignals: normalizeDefenseList(
        data.estimateStructureConsumption?.estimateGroupingSignals
      ),
      estimateReviewBuckets: normalizeDefenseList(
        data.estimateStructureConsumption?.estimateReviewBuckets
      ),
      estimateStructureNotes: normalizeDefenseList(
        data.estimateStructureConsumption?.estimateStructureNotes
      ),
    }
  : null

const normalizedEstimateDefenseMode = data?.estimateDefenseMode
  ? {
      whyThisPriceHolds: normalizeDefenseList(data.estimateDefenseMode?.whyThisPriceHolds),
      includedScopeHighlights: normalizeDefenseList(
        data.estimateDefenseMode?.includedScopeHighlights
      ),
      exclusionNotes: normalizeDefenseList(data.estimateDefenseMode?.exclusionNotes),
      allowanceNotes: normalizeDefenseList(data.estimateDefenseMode?.allowanceNotes),
      homeownerFriendlyJustification: normalizeDefenseList(
        data.estimateDefenseMode?.homeownerFriendlyJustification
      ),
      estimatorDefenseNotes: normalizeDefenseList(
        data.estimateDefenseMode?.estimatorDefenseNotes
      ),
      optionalValueEngineeringIdeas: normalizeDefenseList(
        data.estimateDefenseMode?.optionalValueEngineeringIdeas
      ),
    }
  : null

const normalizedTradePricingPrepAnalysis = data?.tradePricingPrepAnalysis
  ? {
      trade:
        data.tradePricingPrepAnalysis?.trade === "painting" ||
        data.tradePricingPrepAnalysis?.trade === "drywall" ||
        data.tradePricingPrepAnalysis?.trade === "wallcovering"
          ? data.tradePricingPrepAnalysis.trade
          : "painting",
      supportLevel:
        data.tradePricingPrepAnalysis?.supportLevel === "strong" ||
        data.tradePricingPrepAnalysis?.supportLevel === "moderate"
          ? data.tradePricingPrepAnalysis.supportLevel
          : "weak",
      tradeEstimateGroupingNotes: normalizeDefenseList(
        data.tradePricingPrepAnalysis?.tradeEstimateGroupingNotes
      ),
      tradePricingPrepSummary: normalizeDefenseList(
        data.tradePricingPrepAnalysis?.tradePricingPrepSummary
      ),
      tradeReviewActions: normalizeDefenseList(
        data.tradePricingPrepAnalysis?.tradeReviewActions
      ),
      tradeAnalysisSignals: normalizeDefenseList(
        data.tradePricingPrepAnalysis?.tradeAnalysisSignals
      ),
    }
  : null

const {
  estimateRows: normalizedEstimateRows,
  estimateEmbeddedBurdens: normalizedEstimateEmbeddedBurdens,
  estimateSections: normalizedEstimateSections,
} = resolveCanonicalEstimateOutput(data)

setScopeXRay(normalizedScopeXRay)
setMissedScopeDetector(normalizedMissedScopeDetector)
setProfitLeakDetector(normalizedProfitLeakDetector)
setEstimateSkeletonHandoff(normalizedEstimateSkeletonHandoff)
setEstimateStructureConsumption(normalizedEstimateStructureConsumption)
setEstimateDefenseMode(normalizedEstimateDefenseMode)
setTradePricingPrepAnalysis(normalizedTradePricingPrepAnalysis)
setEstimateRows(normalizedEstimateRows)
setEstimateEmbeddedBurdens(normalizedEstimateEmbeddedBurdens)
setEstimateSections(normalizedEstimateSections)
setPricing(nextPricing)
setPricingSource(nextPricingSource)

const nextTrade: UiTrade = trade ? trade : normalizeTrade(data?.trade)
if (!trade && nextTrade) setTrade(nextTrade)

const newId = `${Date.now()}_${Math.random().toString(16).slice(2)}`

const jobId = getOrCreateJobIdFromDetails()

const originalEstimate = lockedOriginalEstimateForJob(jobId)

const changeOrderDetection = detectChangeOrder({
  documentType: nextDocumentType,
  scopeChange: finalScopeChange,
  currentSchedule: normalizedSchedule,
  originalEstimate,
  changeOrderNo: jobDetails.changeOrderNo,
})

setChangeOrderDetection(changeOrderDetection)

const finalDocumentType: DocumentType =
  changeOrderDetection.isChangeOrder ? "Change Order" : nextDocumentType

setDocumentType(finalDocumentType)

const cleanedResultText = rawResultText
  .replace(
    /^This\s+Change\s+Order\s*\/\s*Estimate\s+covers/i,
    finalDocumentType === "Change Order"
      ? "This change order covers"
      : "This estimate covers"
  )
  .replace(
    /^This\s+Estimate\s*\/\s*Change\s+Order\s+covers/i,
    finalDocumentType === "Change Order"
      ? "This change order covers"
      : "This estimate covers"
  )
  .replace(
    /^This\s+Change\s+Order\s+or\s+Estimate\s+covers/i,
    finalDocumentType === "Change Order"
      ? "This change order covers"
      : "This estimate covers"
  )
  .replace(
    /This\s+scope\s+is\s+additive\s+to\s+any\s+existing\s+[^.]+\./i,
    finalDocumentType === "Change Order"
      ? "This change is additive to the original contract scope."
      : "This estimate is based on the scope described above."
  )
  .replace(
    /The\s+work\s+is\s+intended\s+to\s+be\s+additive\s+or\s+corrective\s+to\s+existing\s+contract\s+conditions\s+or\s+proposed\s+as\s+new\s+work\s+depending\s+on\s+project\s+status\./i,
    finalDocumentType === "Change Order"
      ? "This change modifies the original contract scope as described above."
      : "This estimate is for the scope described above."
  )

setResult({
  text: cleanedResultText,
  explanation: data?.explanation || null,
})

const normalizedJobDetails = {
  clientName: jobDetails.clientName?.trim() || "Client",
  jobName: jobDetails.jobName?.trim() || "Job",
  changeOrderNo: jobDetails.changeOrderNo?.trim() || "",
  jobAddress: jobDetails.jobAddress?.trim() || "",
  date: jobDetails.date || "",
}

const estItem: EstimateHistoryItem = {
  id: newId,
  createdAt: Date.now(),
  jobDetails: normalizedJobDetails,
  jobId,
  documentType: finalDocumentType,
  trade: nextTrade,
  state: state || "",
  scopeChange: finalScopeChange,
  result: cleanedResultText,
  explanation: data?.explanation || null,
  pricing: {
    labor: Number(nextPricing.labor || 0),
    materials: Number(nextPricing.materials || 0),
    subs: Number(nextPricing.subs || 0),
    markup: Number(nextPricing.markup || 0),
    total: Number(nextPricing.total || 0),
  },
  schedule: normalizedSchedule,

  scopeSignals: data?.scopeSignals ?? null,
  photoAnalysis: data?.photoAnalysis ?? null,
  photoScopeAssist: data?.photoScopeAssist ?? null,
  planIntelligence:
    data?.planIntelligence
      ? {
          summary:
            typeof data.planIntelligence?.summary === "string"
              ? data.planIntelligence.summary.trim()
              : null,
          estimatorPackages: normalizePlanPackages(data.planIntelligence?.estimatorPackages),
          detectedRooms: normalizePlanStrings(data.planIntelligence?.detectedRooms),
          detectedTrades: normalizePlanStrings(data.planIntelligence?.detectedTrades),
          sheetRoleSignals: normalizePlanStrings(data.planIntelligence?.sheetRoleSignals),
          prototypeSignals: normalizePlanStrings(data.planIntelligence?.prototypeSignals),
          repeatScalingSignals: normalizePlanStrings(data.planIntelligence?.repeatScalingSignals),
          packageGroupingSignals: normalizePlanStrings(
            data.planIntelligence?.packageGroupingSignals
          ),
          bidStrategyNotes: normalizePlanStrings(data.planIntelligence?.bidStrategyNotes),
          highValueSheetSignals: normalizePlanStrings(
            data.planIntelligence?.highValueSheetSignals
          ),
          pricingAnchorSignals: normalizePlanStrings(
            data.planIntelligence?.pricingAnchorSignals
          ),
          bidCoverageGaps: normalizePlanStrings(data.planIntelligence?.bidCoverageGaps),
          estimatingPrioritySignals: normalizePlanStrings(
            data.planIntelligence?.estimatingPrioritySignals
          ),
          bidExecutionNotes: normalizePlanStrings(data.planIntelligence?.bidExecutionNotes),
          pricingPackageSignals: normalizePlanStrings(
            data.planIntelligence?.pricingPackageSignals
          ),
          prototypePackageSignals: normalizePlanStrings(
            data.planIntelligence?.prototypePackageSignals
          ),
          packageScopeCandidates: normalizePlanStrings(
            data.planIntelligence?.packageScopeCandidates
          ),
          packageScalingGuidance: normalizePlanStrings(
            data.planIntelligence?.packageScalingGuidance
          ),
          packageConfidenceNotes: normalizePlanStrings(
            data.planIntelligence?.packageConfidenceNotes
          ),
          estimatingFrameworkNotes: normalizePlanStrings(
            data.planIntelligence?.estimatingFrameworkNotes
          ),
          estimateStructureSignals: normalizePlanStrings(
            data.planIntelligence?.estimateStructureSignals
          ),
          estimatePackageCandidates: normalizePlanStrings(
            data.planIntelligence?.estimatePackageCandidates
          ),
          packageTradeScopeSignals: normalizePlanStrings(
            data.planIntelligence?.packageTradeScopeSignals
          ),
          packagePricingBasisSignals: normalizePlanStrings(
            data.planIntelligence?.packagePricingBasisSignals
          ),
          packageAllowanceSignals: normalizePlanStrings(
            data.planIntelligence?.packageAllowanceSignals
          ),
          estimateAssemblyGuidance: normalizePlanStrings(
            data.planIntelligence?.estimateAssemblyGuidance
          ),
          estimateScaffoldNotes: normalizePlanStrings(
            data.planIntelligence?.estimateScaffoldNotes
          ),
          repeatedSpaceSignals: normalizePlanStrings(
            data.planIntelligence?.repeatedSpaceSignals
          ),
          likelyRoomTypes: normalizePlanStrings(data.planIntelligence?.likelyRoomTypes),
          scalableScopeSignals: normalizePlanStrings(
            data.planIntelligence?.scalableScopeSignals
          ),
          tradePackageSignals: normalizePlanStrings(
            data.planIntelligence?.tradePackageSignals
          ),
          bidAssistNotes: normalizePlanStrings(data.planIntelligence?.bidAssistNotes),
          scopeAssist: {
            missingScopeFlags: normalizePlanStrings(
              data.planIntelligence?.scopeAssist?.missingScopeFlags
            ),
            suggestedAdditions: normalizePlanStrings(
              data.planIntelligence?.scopeAssist?.suggestedAdditions
            ),
          },
        }
      : null,
  estimateSkeletonHandoff: normalizedEstimateSkeletonHandoff,
  estimateStructureConsumption: normalizedEstimateStructureConsumption,
  materialsList: normalizedMaterialsList,
  areaScopeBreakdown: normalizedAreaScopeBreakdown,
  profitProtection: normalizedProfitProtection,
  scopeXRay: normalizedScopeXRay,
  missedScopeDetector: normalizedMissedScopeDetector,
  profitLeakDetector: normalizedProfitLeakDetector,
  estimateDefenseMode: normalizedEstimateDefenseMode,
  tradePricingPrepAnalysis: normalizedTradePricingPrepAnalysis,
  estimateRows: normalizedEstimateRows,
  estimateEmbeddedBurdens: normalizedEstimateEmbeddedBurdens,
  estimateSections: normalizedEstimateSections,
  changeOrderDetection,

  pricingSource: nextPricingSource,
  priceGuardVerified: nextVerified,
  tax: {
    enabled: taxEnabled,
    rate: Number(taxRate || 0),
  },
  deposit: depositEnabled
    ? {
        enabled: true,
        type: depositType,
        value: Number(depositValue || 0),
      }
    : undefined,
  approval: {
    status: "pending",
  },
}

saveToHistory(estItem)

// lock original estimate only once for this job
if (jobId) {
  lockOriginalEstimateForJob(jobId, newId)
}

// ✅ Auto-create/update job budget
upsertBudgetFromEstimate(estItem)

// ✅ keep latest id pointer
lastSavedEstimateIdRef.current = newId

await checkEntitlementNow()
setStatus("")
  } catch (err) {
    console.error(err)
    setStatus(getGenerateExceptionMessage(err))
  } finally {
    setLoading(false)
    generatingRef.current = false
  }
}

  // -------------------------
// Stripe upgrade
// -------------------------
async function upgrade() {
  try {
    const e = email.trim().toLowerCase()

    if (!e) {
      setStatus("Please enter the email used at checkout.")
      return
    }

    setStatus("Redirecting to secure checkout…")

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e }), // ✅ SEND EMAIL
    })

    if (!res.ok) {
      throw new Error("Checkout request failed")
    }

    const data = await res.json()

    if (!data?.url) {
      throw new Error("No checkout URL returned")
    }

   // 🔑 Force full-page navigation
window.location.assign(data.url)
} catch (err) {
  console.error(err)
  setStatus("Checkout error.")
}
}

async function copyApprovalLinkForEstimate(est: EstimateHistoryItem) {
  const localUrl = `${window.location.origin}/approve/${est.id}`
  const ownerEmail = email.trim().toLowerCase()

  if (!ownerEmail) {
    await navigator.clipboard.writeText(localUrl)
    setStatus(
      "Local approval link copied. Enter an email to create a shareable approval link that works across devices."
    )
    return
  }

  try {
    setStatus("Creating shareable approval link...")

    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: ownerEmail,
        estimate: est,
        companyProfile,
      }),
    })

    const data = await res.json().catch(() => null)
    const approvalUrl =
      typeof data?.approvalUrl === "string" ? data.approvalUrl : ""

    if (!res.ok || !approvalUrl) {
      throw new Error("Server approval link unavailable")
    }

    await navigator.clipboard.writeText(approvalUrl)
    setStatus("Shareable approval link copied to clipboard.")
  } catch {
    await navigator.clipboard.writeText(localUrl)
    setStatus(
      "Server approval link unavailable. Local approval link copied instead; it only works on this device."
    )
  }
}

// ✅ Save History
function saveToHistory(item: EstimateHistoryItem) {
  setHistory((prev) => {
    const next = [item, ...prev].slice(0, 25)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })
}

// ✅ Update single history item (patch fields)
function updateHistoryItem(id: string, patch: Partial<EstimateHistoryItem>) {
  setHistory((prev) => {
    const next = prev.map((h) => (h.id === id ? { ...h, ...patch } : h))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })
}

function updateInvoice(id: string, patch: Partial<Invoice>) {
  setInvoices((prev) => {
    const next = prev.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv))
    localStorage.setItem(INVOICE_KEY, JSON.stringify(next))
    return next
  })
}

function makeJobId() {
  return crypto.randomUUID()
}

function normalizeEstimateHistoryItem(x: any): EstimateHistoryItem {
  const normalizeInsightItems = (items: unknown): TierAInsightItem[] =>
    Array.isArray(items)
      ? items
          .map((item): TierAInsightItem => {
            const evidence =
              item &&
              typeof item === "object" &&
              "evidence" in item &&
              Array.isArray(item.evidence)
                ? item.evidence
                    .map((entry: unknown) => String(entry).trim())
                    .filter(Boolean)
                : []

            return {
              label:
                item && typeof item === "object" && "label" in item
                  ? String(item.label ?? "").trim()
                  : "",
              reason:
                item && typeof item === "object" && "reason" in item
                  ? String(item.reason ?? "").trim()
                  : "",
              evidence,
              confidence:
                item && typeof item === "object" && "confidence" in item
                  ? Number(item.confidence ?? 0)
                  : 0,
              severity:
                item &&
                typeof item === "object" &&
                "severity" in item &&
                item.severity === "high"
                  ? "high"
                  : "medium",
            }
          })
          .filter((item) => Boolean(item.label || item.reason))
      : []

  const normalizeDefenseLists = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((entry: unknown) => String(entry).trim()).filter(Boolean)
      : []

  return {
    id: String(x?.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`),
    jobId: String(x?.jobId ?? ""),
    createdAt: Number(x?.createdAt ?? Date.now()),
    documentType:
  x?.documentType === "Change Order" ? "Change Order" : "Estimate",
    jobDetails: {
      clientName: String(x?.jobDetails?.clientName ?? ""),
      jobName: String(x?.jobDetails?.jobName ?? ""),
      changeOrderNo: String(x?.jobDetails?.changeOrderNo ?? ""),
      jobAddress: String(x?.jobDetails?.jobAddress ?? ""),
      date: String(x?.jobDetails?.date ?? ""),
    },
    trade: normalizeTrade(x?.trade),
    state: String(x?.state ?? ""),
    scopeChange: String(x?.scopeChange ?? ""),
    result: String(x?.result ?? ""),
    explanation: x?.explanation ?? null,
    pricing: {
      labor: Number(x?.pricing?.labor ?? 0),
      materials: Number(x?.pricing?.materials ?? 0),
      subs: Number(x?.pricing?.subs ?? 0),
      markup: Number(x?.pricing?.markup ?? 0),
      total: Number(x?.pricing?.total ?? 0),
    },
    schedule: x?.schedule ?? undefined,
    scopeSignals: x?.scopeSignals ?? null,
    photoAnalysis: x?.photoAnalysis ?? null,
    photoScopeAssist: x?.photoScopeAssist ?? null,
    planIntelligence: x?.planIntelligence
      ? {
          summary:
            typeof x.planIntelligence?.summary === "string"
              ? x.planIntelligence.summary.trim()
              : null,
          estimatorPackages: normalizePlanPackages(x.planIntelligence?.estimatorPackages),
          detectedRooms: normalizeDefenseLists(x.planIntelligence?.detectedRooms),
          detectedTrades: normalizeDefenseLists(x.planIntelligence?.detectedTrades),
          sheetRoleSignals: normalizeDefenseLists(x.planIntelligence?.sheetRoleSignals),
          prototypeSignals: normalizeDefenseLists(x.planIntelligence?.prototypeSignals),
          repeatScalingSignals: normalizeDefenseLists(
            x.planIntelligence?.repeatScalingSignals
          ),
          packageGroupingSignals: normalizeDefenseLists(
            x.planIntelligence?.packageGroupingSignals
          ),
          bidStrategyNotes: normalizeDefenseLists(x.planIntelligence?.bidStrategyNotes),
          highValueSheetSignals: normalizeDefenseLists(
            x.planIntelligence?.highValueSheetSignals
          ),
          pricingAnchorSignals: normalizeDefenseLists(
            x.planIntelligence?.pricingAnchorSignals
          ),
          bidCoverageGaps: normalizeDefenseLists(x.planIntelligence?.bidCoverageGaps),
          estimatingPrioritySignals: normalizeDefenseLists(
            x.planIntelligence?.estimatingPrioritySignals
          ),
          bidExecutionNotes: normalizeDefenseLists(x.planIntelligence?.bidExecutionNotes),
          pricingPackageSignals: normalizeDefenseLists(
            x.planIntelligence?.pricingPackageSignals
          ),
          prototypePackageSignals: normalizeDefenseLists(
            x.planIntelligence?.prototypePackageSignals
          ),
          packageScopeCandidates: normalizeDefenseLists(
            x.planIntelligence?.packageScopeCandidates
          ),
          packageScalingGuidance: normalizeDefenseLists(
            x.planIntelligence?.packageScalingGuidance
          ),
          packageConfidenceNotes: normalizeDefenseLists(
            x.planIntelligence?.packageConfidenceNotes
          ),
          estimatingFrameworkNotes: normalizeDefenseLists(
            x.planIntelligence?.estimatingFrameworkNotes
          ),
          estimateStructureSignals: normalizeDefenseLists(
            x.planIntelligence?.estimateStructureSignals
          ),
          estimatePackageCandidates: normalizeDefenseLists(
            x.planIntelligence?.estimatePackageCandidates
          ),
          packageTradeScopeSignals: normalizeDefenseLists(
            x.planIntelligence?.packageTradeScopeSignals
          ),
          packagePricingBasisSignals: normalizeDefenseLists(
            x.planIntelligence?.packagePricingBasisSignals
          ),
          packageAllowanceSignals: normalizeDefenseLists(
            x.planIntelligence?.packageAllowanceSignals
          ),
          estimateAssemblyGuidance: normalizeDefenseLists(
            x.planIntelligence?.estimateAssemblyGuidance
          ),
          estimateScaffoldNotes: normalizeDefenseLists(
            x.planIntelligence?.estimateScaffoldNotes
          ),
          repeatedSpaceSignals: normalizeDefenseLists(
            x.planIntelligence?.repeatedSpaceSignals
          ),
          likelyRoomTypes: normalizeDefenseLists(x.planIntelligence?.likelyRoomTypes),
          scalableScopeSignals: normalizeDefenseLists(
            x.planIntelligence?.scalableScopeSignals
          ),
          tradePackageSignals: normalizeDefenseLists(
            x.planIntelligence?.tradePackageSignals
          ),
          bidAssistNotes: normalizeDefenseLists(x.planIntelligence?.bidAssistNotes),
          scopeAssist: {
            missingScopeFlags: normalizeDefenseLists(
              x.planIntelligence?.scopeAssist?.missingScopeFlags
            ),
            suggestedAdditions: normalizeDefenseLists(
              x.planIntelligence?.scopeAssist?.suggestedAdditions
            ),
          },
        }
      : null,
    estimateSkeletonHandoff: x?.estimateSkeletonHandoff
      ? {
          estimatorBucketGuidance: normalizeDefenseLists(
            x.estimateSkeletonHandoff?.estimatorBucketGuidance
          ),
          estimatorBucketDrafts: Array.isArray(x.estimateSkeletonHandoff?.estimatorBucketDrafts)
            ? x.estimateSkeletonHandoff.estimatorBucketDrafts
                .map((bucket: unknown) => ({
                  bucketName:
                    bucket && typeof bucket === "object" && "bucketName" in bucket
                      ? String(bucket.bucketName ?? "").trim()
                      : "",
                  bucketRole:
                    bucket && typeof bucket === "object" && "bucketRole" in bucket
                      ? String(bucket.bucketRole ?? "").trim()
                      : "support package",
                  likelyTradeCoverage:
                    bucket && typeof bucket === "object" && "likelyTradeCoverage" in bucket
                      ? normalizeDefenseLists(bucket.likelyTradeCoverage)
                      : [],
                  likelyScopeBasis:
                    bucket && typeof bucket === "object" && "likelyScopeBasis" in bucket
                      ? normalizeDefenseLists(bucket.likelyScopeBasis)
                      : [],
                  allowanceReviewStatus:
                    bucket &&
                    typeof bucket === "object" &&
                    "allowanceReviewStatus" in bucket &&
                    (bucket.allowanceReviewStatus === "structure_ready" ||
                      bucket.allowanceReviewStatus === "support_only" ||
                      bucket.allowanceReviewStatus === "allowance_review")
                      ? bucket.allowanceReviewStatus
                      : "support_only",
                }))
                .filter((bucket: { bucketName: string }) => bucket.bucketName)
            : [],
          estimatorSectionSkeletons: Array.isArray(
            x.estimateSkeletonHandoff?.estimatorSectionSkeletons
          )
            ? x.estimateSkeletonHandoff.estimatorSectionSkeletons
                .map((section: unknown) => ({
                  packageKey:
                    section && typeof section === "object" && "packageKey" in section
                      ? String(section.packageKey ?? "").trim()
                      : "",
                  bucketName:
                    section && typeof section === "object" && "bucketName" in section
                      ? String(section.bucketName ?? "").trim()
                      : "",
                  sectionTitle:
                    section && typeof section === "object" && "sectionTitle" in section
                      ? String(section.sectionTitle ?? "").trim()
                      : "",
                  trade:
                    section && typeof section === "object" && "trade" in section
                      ? String(section.trade ?? "").trim()
                      : "general renovation",
                  supportType:
                    section && typeof section === "object" && "supportType" in section
                      ? String(section.supportType ?? "").trim()
                      : "support_only",
                  scopeBreadth:
                    section && typeof section === "object" && "scopeBreadth" in section
                      ? String(section.scopeBreadth ?? "").trim()
                      : "narrow",
                  sectionReadiness:
                    section && typeof section === "object" && "sectionReadiness" in section
                      ? String(section.sectionReadiness ?? "").trim()
                      : "review_only",
                  quantityAnchor:
                    section && typeof section === "object" && "quantityAnchor" in section
                      ? section.quantityAnchor == null
                        ? null
                        : String(section.quantityAnchor).trim()
                      : null,
                  scopeBullets:
                    section && typeof section === "object" && "scopeBullets" in section
                      ? normalizeDefenseLists(section.scopeBullets)
                      : [],
                  cautionNotes:
                    section && typeof section === "object" && "cautionNotes" in section
                      ? normalizeDefenseLists(section.cautionNotes)
                      : [],
                  evidence:
                    section &&
                    typeof section === "object" &&
                    "evidence" in section &&
                    Array.isArray(section.evidence)
                      ? section.evidence
                          .map((ref: unknown) => ({
                            uploadId:
                              ref && typeof ref === "object" && "uploadId" in ref
                                ? String(ref.uploadId ?? "").trim()
                                : "",
                            uploadName:
                              ref && typeof ref === "object" && "uploadName" in ref
                                ? String(ref.uploadName ?? "").trim()
                                : "",
                            sourcePageNumber:
                              ref && typeof ref === "object" && "sourcePageNumber" in ref
                                ? Number(ref.sourcePageNumber ?? 0) || 0
                                : 0,
                            pageNumber:
                              ref && typeof ref === "object" && "pageNumber" in ref
                                ? Number(ref.pageNumber ?? 0) || 0
                                : 0,
                            sheetNumber:
                              ref && typeof ref === "object" && "sheetNumber" in ref
                                ? ref.sheetNumber == null
                                  ? null
                                  : String(ref.sheetNumber).trim()
                                : null,
                            sheetTitle:
                              ref && typeof ref === "object" && "sheetTitle" in ref
                                ? ref.sheetTitle == null
                                  ? null
                                  : String(ref.sheetTitle).trim()
                                : null,
                            excerpt:
                              ref && typeof ref === "object" && "excerpt" in ref
                                ? String(ref.excerpt ?? "").trim()
                                : "",
                            confidence:
                              ref && typeof ref === "object" && "confidence" in ref
                                ? Number(ref.confidence ?? 0) || 0
                                : 0,
                          }))
                          .filter((ref: { uploadId: string }) => ref.uploadId)
                      : [],
                }))
                .filter((section: { sectionTitle: string }) => section.sectionTitle)
            : [],
          bucketScopeDrafts: normalizeDefenseLists(
            x.estimateSkeletonHandoff?.bucketScopeDrafts
          ),
          bucketAllowanceFlags: normalizeDefenseLists(
            x.estimateSkeletonHandoff?.bucketAllowanceFlags
          ),
          bucketHandoffNotes: normalizeDefenseLists(
            x.estimateSkeletonHandoff?.bucketHandoffNotes
          ),
          estimateStructureHandoffSummary:
            typeof x.estimateSkeletonHandoff?.estimateStructureHandoffSummary === "string"
              ? x.estimateSkeletonHandoff.estimateStructureHandoffSummary.trim()
              : "",
        }
      : null,
    estimateStructureConsumption: x?.estimateStructureConsumption
      ? {
          structuredEstimateBuckets: Array.isArray(
            x.estimateStructureConsumption?.structuredEstimateBuckets
          )
            ? x.estimateStructureConsumption.structuredEstimateBuckets
                .map((bucket: unknown) => ({
                  bucketName:
                    bucket && typeof bucket === "object" && "bucketName" in bucket
                      ? String(bucket.bucketName ?? "").trim()
                      : "",
                  bucketRole:
                    bucket && typeof bucket === "object" && "bucketRole" in bucket
                      ? String(bucket.bucketRole ?? "").trim()
                      : "support package",
                  likelyTradeCoverage:
                    bucket && typeof bucket === "object" && "likelyTradeCoverage" in bucket
                      ? normalizeDefenseLists(bucket.likelyTradeCoverage)
                      : [],
                  likelyScopeBasis:
                    bucket && typeof bucket === "object" && "likelyScopeBasis" in bucket
                      ? normalizeDefenseLists(bucket.likelyScopeBasis)
                      : [],
                  allowanceReviewStatus:
                    bucket &&
                    typeof bucket === "object" &&
                    "allowanceReviewStatus" in bucket &&
                    (bucket.allowanceReviewStatus === "structure_ready" ||
                      bucket.allowanceReviewStatus === "support_only" ||
                      bucket.allowanceReviewStatus === "allowance_review")
                      ? bucket.allowanceReviewStatus
                      : "support_only",
                  safeForPrimaryStructure:
                    bucket &&
                    typeof bucket === "object" &&
                    "safeForPrimaryStructure" in bucket
                      ? bucket.safeForPrimaryStructure === true
                      : false,
                }))
                .filter((bucket: { bucketName: string }) => bucket.bucketName)
            : [],
          structuredEstimateSections: Array.isArray(
            x.estimateStructureConsumption?.structuredEstimateSections
          )
            ? x.estimateStructureConsumption.structuredEstimateSections
                .map((section: unknown) => ({
                  sectionTitle:
                    section && typeof section === "object" && "sectionTitle" in section
                      ? String(section.sectionTitle ?? "").trim()
                      : "",
                  trade:
                    section && typeof section === "object" && "trade" in section
                      ? String(section.trade ?? "").trim()
                      : "general renovation",
                  bucketName:
                    section && typeof section === "object" && "bucketName" in section
                      ? String(section.bucketName ?? "").trim()
                      : "",
                  supportType:
                    section && typeof section === "object" && "supportType" in section
                      ? String(section.supportType ?? "").trim()
                      : "support_only",
                  scopeBreadth:
                    section && typeof section === "object" && "scopeBreadth" in section
                      ? String(section.scopeBreadth ?? "").trim()
                      : "narrow",
                  sectionReadiness:
                    section && typeof section === "object" && "sectionReadiness" in section
                      ? String(section.sectionReadiness ?? "").trim()
                      : "review_only",
                  quantityAnchor:
                    section && typeof section === "object" && "quantityAnchor" in section
                      ? section.quantityAnchor == null
                        ? null
                        : String(section.quantityAnchor).trim()
                      : null,
                  quantityNormalization:
                    section && typeof section === "object" && "quantityNormalization" in section
                      ? String(section.quantityNormalization ?? "").trim()
                      : "review_only",
                  scopeBullets:
                    section && typeof section === "object" && "scopeBullets" in section
                      ? normalizeDefenseLists(section.scopeBullets)
                      : [],
                  cautionNotes:
                    section && typeof section === "object" && "cautionNotes" in section
                      ? normalizeDefenseLists(section.cautionNotes)
                      : [],
                  tradeMeasurementDrafts:
                    section && typeof section === "object" && "tradeMeasurementDrafts" in section
                      ? normalizeDefenseLists(section.tradeMeasurementDrafts)
                      : [],
                  normalizedEstimatorInputCandidates:
                    section &&
                    typeof section === "object" &&
                    "normalizedEstimatorInputCandidates" in section
                      ? normalizeDefenseLists(section.normalizedEstimatorInputCandidates)
                      : [],
                  estimatorInputGuardrails:
                    section &&
                    typeof section === "object" &&
                    "estimatorInputGuardrails" in section
                      ? normalizeDefenseLists(section.estimatorInputGuardrails)
                      : [],
                  safeForSectionBuild:
                    Boolean(
                      section &&
                        typeof section === "object" &&
                        "safeForSectionBuild" in section &&
                        section.safeForSectionBuild
                    ),
                  evidence:
                    section &&
                    typeof section === "object" &&
                    "evidence" in section &&
                    Array.isArray(section.evidence)
                      ? section.evidence
                          .map((ref: unknown) => ({
                            uploadId:
                              ref && typeof ref === "object" && "uploadId" in ref
                                ? String(ref.uploadId ?? "").trim()
                                : "",
                            uploadName:
                              ref && typeof ref === "object" && "uploadName" in ref
                                ? String(ref.uploadName ?? "").trim()
                                : "",
                            sourcePageNumber:
                              ref && typeof ref === "object" && "sourcePageNumber" in ref
                                ? Number(ref.sourcePageNumber ?? 0) || 0
                                : 0,
                            pageNumber:
                              ref && typeof ref === "object" && "pageNumber" in ref
                                ? Number(ref.pageNumber ?? 0) || 0
                                : 0,
                            sheetNumber:
                              ref && typeof ref === "object" && "sheetNumber" in ref
                                ? ref.sheetNumber == null
                                  ? null
                                  : String(ref.sheetNumber).trim()
                                : null,
                            sheetTitle:
                              ref && typeof ref === "object" && "sheetTitle" in ref
                                ? ref.sheetTitle == null
                                  ? null
                                  : String(ref.sheetTitle).trim()
                                : null,
                            excerpt:
                              ref && typeof ref === "object" && "excerpt" in ref
                                ? String(ref.excerpt ?? "").trim()
                                : "",
                            confidence:
                              ref && typeof ref === "object" && "confidence" in ref
                                ? Number(ref.confidence ?? 0) || 0
                                : 0,
                          }))
                          .filter((ref: { uploadId: string }) => ref.uploadId)
                      : [],
                }))
                .filter((section: { sectionTitle: string }) => section.sectionTitle)
            : [],
          structuredTradeInputAssemblies: Array.isArray(
            x.estimateStructureConsumption?.structuredTradeInputAssemblies
          )
            ? x.estimateStructureConsumption.structuredTradeInputAssemblies
                .map((assembly: unknown) => {
                  const normalizeCandidate = (candidate: unknown) =>
                    candidate && typeof candidate === "object"
                      ? {
                          sectionTitle:
                            "sectionTitle" in candidate
                              ? String(candidate.sectionTitle ?? "").trim()
                              : "",
                          trade:
                            "trade" in candidate
                              ? String(candidate.trade ?? "").trim()
                              : "general renovation",
                          candidateRole:
                            "candidateRole" in candidate
                              ? String(candidate.candidateRole ?? "").trim()
                              : "review_only",
                          quantityNormalization:
                            "quantityNormalization" in candidate
                              ? String(candidate.quantityNormalization ?? "").trim()
                              : "review_only",
                          supportType:
                            "supportType" in candidate
                              ? String(candidate.supportType ?? "").trim()
                              : "support_only",
                          scopeBreadth:
                            "scopeBreadth" in candidate
                              ? String(candidate.scopeBreadth ?? "").trim()
                              : "narrow",
                          quantityAnchor:
                            "quantityAnchor" in candidate
                              ? candidate.quantityAnchor == null
                                ? null
                                : String(candidate.quantityAnchor).trim()
                              : null,
                          candidateSummary:
                            "candidateSummary" in candidate
                              ? String(candidate.candidateSummary ?? "").trim()
                              : "",
                          evidence:
                            "evidence" in candidate && Array.isArray(candidate.evidence)
                              ? candidate.evidence
                                  .map((ref: unknown) => ({
                                    uploadId:
                                      ref && typeof ref === "object" && "uploadId" in ref
                                        ? String(ref.uploadId ?? "").trim()
                                        : "",
                                    uploadName:
                                      ref && typeof ref === "object" && "uploadName" in ref
                                        ? String(ref.uploadName ?? "").trim()
                                        : "",
                                    sourcePageNumber:
                                      ref && typeof ref === "object" && "sourcePageNumber" in ref
                                        ? Number(ref.sourcePageNumber ?? 0) || 0
                                        : 0,
                                    pageNumber:
                                      ref && typeof ref === "object" && "pageNumber" in ref
                                        ? Number(ref.pageNumber ?? 0) || 0
                                        : 0,
                                    sheetNumber:
                                      ref && typeof ref === "object" && "sheetNumber" in ref
                                        ? ref.sheetNumber == null
                                          ? null
                                          : String(ref.sheetNumber).trim()
                                        : null,
                                    sheetTitle:
                                      ref && typeof ref === "object" && "sheetTitle" in ref
                                        ? ref.sheetTitle == null
                                          ? null
                                          : String(ref.sheetTitle).trim()
                                        : null,
                                    excerpt:
                                      ref && typeof ref === "object" && "excerpt" in ref
                                        ? String(ref.excerpt ?? "").trim()
                                        : "",
                                    confidence:
                                      ref && typeof ref === "object" && "confidence" in ref
                                        ? Number(ref.confidence ?? 0) || 0
                                        : 0,
                                  }))
                                  .filter((ref: { uploadId: string }) => ref.uploadId)
                              : [],
                        }
                      : null
                  return {
                    trade:
                      assembly && typeof assembly === "object" && "trade" in assembly
                        ? String(assembly.trade ?? "").trim()
                        : "general renovation",
                    primaryCandidate:
                      assembly && typeof assembly === "object" && "primaryCandidate" in assembly
                        ? normalizeCandidate(assembly.primaryCandidate)
                        : null,
                    secondaryCandidates:
                      assembly &&
                      typeof assembly === "object" &&
                      "secondaryCandidates" in assembly &&
                      Array.isArray(assembly.secondaryCandidates)
                        ? assembly.secondaryCandidates
                            .map((candidate: unknown) => normalizeCandidate(candidate))
                            .filter(Boolean)
                        : [],
                    reviewCandidates:
                      assembly &&
                      typeof assembly === "object" &&
                      "reviewCandidates" in assembly &&
                      Array.isArray(assembly.reviewCandidates)
                        ? assembly.reviewCandidates
                            .map((candidate: unknown) => normalizeCandidate(candidate))
                            .filter(Boolean)
                        : [],
                    assemblyNotes:
                      assembly && typeof assembly === "object" && "assemblyNotes" in assembly
                        ? normalizeDefenseLists(assembly.assemblyNotes)
                        : [],
                  }
                })
                .filter((assembly: { trade: string }) => assembly.trade)
            : [],
          estimateGroupingSignals: normalizeDefenseLists(
            x.estimateStructureConsumption?.estimateGroupingSignals
          ),
          estimateReviewBuckets: normalizeDefenseLists(
            x.estimateStructureConsumption?.estimateReviewBuckets
          ),
          estimateStructureNotes: normalizeDefenseLists(
            x.estimateStructureConsumption?.estimateStructureNotes
          ),
        }
      : null,
    materialsList: x?.materialsList ?? null,
    areaScopeBreakdown: x?.areaScopeBreakdown ?? null,
    profitProtection: normalizeProfitProtection(x?.profitProtection),
    scopeXRay: x?.scopeXRay ?? null,
    missedScopeDetector: x?.missedScopeDetector
      ? {
          likelyMissingScope: normalizeInsightItems(x.missedScopeDetector?.likelyMissingScope),
          recommendedConfirmations: normalizeInsightItems(
            x.missedScopeDetector?.recommendedConfirmations
          ),
        }
      : null,
    profitLeakDetector: x?.profitLeakDetector
      ? {
          likelyProfitLeaks: normalizeInsightItems(x.profitLeakDetector?.likelyProfitLeaks),
          pricingReviewPrompts: normalizeInsightItems(
            x.profitLeakDetector?.pricingReviewPrompts
          ),
        }
      : null,
    ...resolveCanonicalEstimateOutput(x),
    estimateDefenseMode: x?.estimateDefenseMode
      ? {
          whyThisPriceHolds: normalizeDefenseLists(x.estimateDefenseMode?.whyThisPriceHolds),
          includedScopeHighlights: normalizeDefenseLists(
            x.estimateDefenseMode?.includedScopeHighlights
          ),
          exclusionNotes: normalizeDefenseLists(x.estimateDefenseMode?.exclusionNotes),
          allowanceNotes: normalizeDefenseLists(x.estimateDefenseMode?.allowanceNotes),
          homeownerFriendlyJustification: normalizeDefenseLists(
            x.estimateDefenseMode?.homeownerFriendlyJustification
          ),
          estimatorDefenseNotes: normalizeDefenseLists(
            x.estimateDefenseMode?.estimatorDefenseNotes
          ),
          optionalValueEngineeringIdeas: normalizeDefenseLists(
            x.estimateDefenseMode?.optionalValueEngineeringIdeas
          ),
        }
      : null,
    tradePricingPrepAnalysis: x?.tradePricingPrepAnalysis
      ? {
          trade:
            x.tradePricingPrepAnalysis?.trade === "painting" ||
            x.tradePricingPrepAnalysis?.trade === "drywall" ||
            x.tradePricingPrepAnalysis?.trade === "wallcovering"
              ? x.tradePricingPrepAnalysis.trade
              : "painting",
          supportLevel:
            x.tradePricingPrepAnalysis?.supportLevel === "strong" ||
            x.tradePricingPrepAnalysis?.supportLevel === "moderate"
              ? x.tradePricingPrepAnalysis.supportLevel
              : "weak",
          tradeEstimateGroupingNotes: normalizeDefenseLists(
            x.tradePricingPrepAnalysis?.tradeEstimateGroupingNotes
          ),
          tradePricingPrepSummary: normalizeDefenseLists(
            x.tradePricingPrepAnalysis?.tradePricingPrepSummary
          ),
          tradeReviewActions: normalizeDefenseLists(
            x.tradePricingPrepAnalysis?.tradeReviewActions
          ),
          tradeAnalysisSignals: normalizeDefenseLists(
            x.tradePricingPrepAnalysis?.tradeAnalysisSignals
          ),
        }
      : null,
    changeOrderDetection: x?.changeOrderDetection ?? null,
    tax: x?.tax
      ? {
          enabled: Boolean(x.tax.enabled),
          rate: Number(x.tax.rate || 0),
        }
      : undefined,
    deposit: x?.deposit
      ? {
          enabled: Boolean(x.deposit.enabled),
          type: x.deposit.type === "fixed" ? "fixed" : "percent",
          value: Number(x.deposit.value || 0),
        }
      : undefined,
    pricingSource: (x?.pricingSource as PricingSource) ?? "ai",
    priceGuardVerified: Boolean(x?.priceGuardVerified),
    approval: x?.approval
      ? {
          status: x.approval.status === "approved" ? "approved" : "pending",
          approvedBy: x.approval.approvedBy
            ? String(x.approval.approvedBy)
            : undefined,
          approvedAt:
            typeof x.approval.approvedAt === "number"
              ? x.approval.approvedAt
              : undefined,
          signatureDataUrl: x.approval.signatureDataUrl
            ? String(x.approval.signatureDataUrl)
            : undefined,
        }
      : {
          status: "pending",
        },
  }
}

function normalizeJobKey(d: {
  clientName: string
  jobName: string
  jobAddress: string
}) {
  return `${(d.clientName || "").trim().toLowerCase()}|${(d.jobName || "")
    .trim()
    .toLowerCase()}|${(d.jobAddress || "").trim().toLowerCase()}`
}

function lockOriginalEstimateForJob(jobId: string, estimateId: string) {
  setJobs((prev) => {
    const next = prev.map((j) => {
      if (j.id !== jobId) return j
      if (j.originalEstimateId) return j // already locked
      return { ...j, originalEstimateId: estimateId }
    })
    return next
  })
}

function getOrCreateJobIdFromDetails() {
  const clientName = jobDetails.clientName?.trim() || "Client"
  const jobName = jobDetails.jobName?.trim() || "Job"
  const jobAddress = jobDetails.jobAddress?.trim() || ""

  const key = normalizeJobKey({ clientName, jobName, jobAddress })

  const existing = jobs.find(
    (j) => normalizeJobKey(j) === key
  )

  if (existing) return existing.id

    const newJob: Job = {
    id: makeJobId(),
    createdAt: Date.now(),
    clientName,
    jobName,
    jobAddress,
    changeOrderNo: jobDetails.changeOrderNo?.trim() || "",
    originalEstimateId: undefined,
  }

  setJobs((prev) => [newJob, ...prev])
  return newJob.id
}

function updateJob(id: string, patch: Partial<Job>) {
  setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
}

function deleteJob(id: string) {
  // remove job
  setJobs((prev) => prev.filter((j) => j.id !== id))

  // remove all estimates tied to it
  setHistory((prev) => {
    const next = prev.filter((h) => h.jobId !== id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })

  // remove all invoices tied to it
  setInvoices((prev) => {
    const next = prev.filter((inv) => inv.jobId !== id)
    localStorage.setItem(INVOICE_KEY, JSON.stringify(next))
    return next
  })

    // remove actuals tied to it
  setActuals((prev) => {
    const next = prev.filter((a) => a.jobId !== id)
    localStorage.setItem(ACTUALS_KEY, JSON.stringify(next))
    return next
  })

  // reset active selection if needed
  setActiveJobId((cur) => (cur === id ? "" : cur))
}

// ✅ Delete single history item
function deleteHistoryItem(id: string) {
  setHistory((prev) => {
    const next = prev.filter((h) => h.id !== id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  })
}

// ✅ Clear history
function clearHistory() {
  setHistory([])
  localStorage.setItem(HISTORY_KEY, JSON.stringify([]))
}

// ✅ Load history item back into the form
function loadHistoryItem(item: EstimateHistoryItem) {
  setJobDetails(item.jobDetails)
  setDocumentType(item.documentType || "Estimate")
  setTrade(item.trade || "")
  setState(item.state || "")
  setScopeChange(item.scopeChange || "")
  setPricingEdited(false)
  setPriceGuard(null)
  setPriceGuardVerified(Boolean(item.priceGuardVerified))
  setResult({
  text: item.result || "",
  explanation: item.explanation || null,
})
  setEstimateRows(item.estimateRows ?? null)
  setEstimateEmbeddedBurdens(item.estimateEmbeddedBurdens ?? null)
  setEstimateSections(item.estimateSections ?? null)
  setPricing(item.pricing)
  setSchedule(item.schedule ?? null)

  setScopeSignals(item.scopeSignals ?? null)
  setPhotoAnalysis(item.photoAnalysis ?? null)
  setPhotoScopeAssist(item.photoScopeAssist ?? null)
  setPlanIntelligence(item.planIntelligence ?? null)
  setEstimateSkeletonHandoff(item.estimateSkeletonHandoff ?? null)
  setEstimateStructureConsumption(item.estimateStructureConsumption ?? null)
  setMaterialsList(item.materialsList ?? null)
  setAreaScopeBreakdown(item.areaScopeBreakdown ?? null)
  setProfitProtection(item.profitProtection ?? null)
  setScopeXRay(item.scopeXRay ?? null)
  setMissedScopeDetector(item.missedScopeDetector ?? null)
  setProfitLeakDetector(item.profitLeakDetector ?? null)
  setEstimateDefenseMode(item.estimateDefenseMode ?? null)
  setTradePricingPrepAnalysis(item.tradePricingPrepAnalysis ?? null)
  setChangeOrderDetection(item.changeOrderDetection ?? null)
  setJobPhotos([])

    // restore tax settings (if present)
  if (item.tax) {
    setTaxEnabled(Boolean(item.tax.enabled))
    setTaxRate(Number(item.tax.rate || 0))
  } else {
    setTaxEnabled(false)
    setTaxRate(7.75)
  }

    // restore deposit settings (if present)
  if (item.deposit) {
    setDepositEnabled(Boolean(item.deposit.enabled))
    setDepositType(item.deposit.type === "fixed" ? "fixed" : "percent")
    setDepositValue(Number(item.deposit.value || 0))
  } else {
    setDepositEnabled(false)
    setDepositType("percent")
    setDepositValue(25)
  }
  
  const src = (item.pricingSource ?? "ai") as PricingSource
  setPricingSource(src)

  setShowPriceGuardDetails(false)

  lastSavedEstimateIdRef.current = item.id

  setStatus("Loaded saved estimate from history.")
}

    // -------------------------
  // PDF generation (Branded)
  // -------------------------
  function downloadPDF() {
    if (!result) {
      setStatus("Generate a document first, then download the PDF.")
      return
    }

    const brandName = "JobEstimate Pro"
    const companyName = companyProfile.name?.trim() || "Contractor"
    const companyAddress = companyProfile.address?.trim() || ""
    const companyPhone = companyProfile.phone?.trim() || ""
    const companyEmail = companyProfile.email?.trim() || ""
    const companyLicense = companyProfile.license?.trim() || ""
    const paymentTerms = companyProfile.paymentTerms?.trim() || "Due upon approval."
    const companyLogo = companyProfile.logo || ""
    const clientName = jobDetails.clientName?.trim() || ""
    const jobName = jobDetails.jobName?.trim() || ""
    const jobAddress = jobDetails.jobAddress?.trim() || ""
    const changeOrderNo = jobDetails.changeOrderNo?.trim() || ""
    const approval = currentLoadedEstimate?.approval
    const isApproved = approval?.status === "approved"
    const approvedBy = approval?.approvedBy?.trim() || "Client"
    const approvedAtText =
     approval?.approvedAt
    ? new Date(approval.approvedAt).toLocaleString()
    : ""
    const approvedSignature = approval?.signatureDataUrl?.trim() || ""
    const showPriceGuardNote =
    pdfShowPriceGuard && documentType !== "Change Order"

    const pdfDocumentTypeLabel = getChangeOrderDisplayLabel(
  documentType,
  changeOrderDetection
)

   const pdfChangeOrderNote = getChangeOrderClientNote(changeOrderDetection)
   const pdfScheduleImpactNote = getChangeOrderScheduleNote(changeOrderDetection)

    const win = window.open("", "", "width=900,height=1100")
    if (!win) {
      setStatus("Pop-up blocked. Please allow pop-ups to download the PDF.")
      return
    }

    // Basic HTML escaping to prevent broken PDFs if user types special chars
    const esc = (s: any) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

    const safeResult = esc(result?.text || "")
    const {
      estimateRows: resolvedPdfEstimateRows,
      estimateEmbeddedBurdens: resolvedPdfEstimateEmbeddedBurdens,
    } = resolveCanonicalEstimateOutput({
      estimateRows,
      estimateEmbeddedBurdens,
      estimateSections,
    })
    const pdfEstimateRows = resolvedPdfEstimateRows ?? []
    const pdfEstimateEmbeddedBurdens = resolvedPdfEstimateEmbeddedBurdens ?? []
    const pdfHasMultipleSectionTrades =
      new Set(
        [...pdfEstimateRows, ...pdfEstimateEmbeddedBurdens]
          .map((section) => section.trade.trim().toLowerCase())
          .filter(Boolean)
      ).size > 1

    const estimateSectionsHtml =
      pdfEstimateRows.length > 0 || pdfEstimateEmbeddedBurdens.length > 0
        ? `
          <div class="section">
            <div class="muted" style="margin-bottom:6px;">Estimate Rows</div>
            ${
              pdfEstimateRows.length > 0
                ? `<table>
              <tr>
                <th>Row</th>
                <th>Quantity</th>
                <th style="text-align:right;">Amount</th>
              </tr>
              ${pdfEstimateRows
                .map((section) => {
                  const displayLabel =
                    pdfHasMultipleSectionTrades && section.trade
                      ? `${section.trade}: ${section.label}`
                      : section.label
                  const quantityLabel =
                    section.quantity != null && section.unit
                      ? `${section.quantity.toLocaleString()} ${section.unit}`
                      : "—"
                  const notes =
                    section.notes.length > 0
                      ? `<div style="margin-top:4px; font-size:11px; color:#666;">${esc(
                          section.notes.join(" • ")
                        )}</div>`
                      : ""

                  return `
                    <tr>
                      <td>
                        <div style="font-weight:700;">${esc(displayLabel)}</div>
                        ${notes}
                      </td>
                      <td>${esc(quantityLabel)}</td>
                      <td style="text-align:right; font-weight:700;">$${Number(
                        section.amount || 0
                      ).toLocaleString()}</td>
                    </tr>
                  `
                })
                .join("")}
            </table>`
                : ""
            }
            ${
              pdfEstimateEmbeddedBurdens.length > 0
                ? `<div class="muted" style="margin-top:8px; margin-bottom:4px;">Embedded burden reference</div>
            <table>
              <tr>
                <th>Section</th>
                <th>Treatment</th>
                <th style="text-align:right;">Amount</th>
              </tr>
              ${pdfEstimateEmbeddedBurdens
                .map((section) => {
                  const displayLabel =
                    pdfHasMultipleSectionTrades && section.trade
                      ? `${section.trade}: ${section.label}`
                      : section.label
                  const notes =
                    section.notes.length > 0
                      ? `<div style="margin-top:4px; font-size:11px; color:#666;">${esc(
                          section.notes.join(" • ")
                        )}</div>`
                      : ""
                  return `
                    <tr>
                      <td>
                        <div style="font-weight:700;">${esc(displayLabel)}</div>
                        ${notes}
                      </td>
                      <td>${esc(getEstimateSectionTreatmentLabel(section))}</td>
                      <td style="text-align:right; font-weight:700;">$${Number(
                        section.amount || 0
                      ).toLocaleString()}</td>
                    </tr>
                  `
                })
                .join("")}
            </table>`
                : ""
            }
            <div class="muted" style="margin-top:8px; line-height:1.4;">
              Embedded burden rows remain included in the total, but are not standalone priced scope lines.
            </div>
          </div>
        `
        : ""

    const scheduleHtml = (s: Schedule | null) => {
  if (!s) return ""

  const crew = s.crewDays != null ? `${esc(s.crewDays)} crew-days` : "—"
  const visits = s.visits != null ? `${esc(s.visits)}` : "—"
  const workweek = s.workDaysPerWeek != null ? `${esc(s.workDaysPerWeek)}-day workweek` : ""
  const duration = s.calendarDays ? `${esc(s.calendarDays.min)}–${esc(s.calendarDays.max)} calendar days` : "—"

  const notes =
    (s.rationale?.length ?? 0) > 0
      ? `<ul style="margin:6px 0 0; padding-left:18px; line-height:1.45;">
           ${s.rationale.map((r) => `<li>${esc(r)}</li>`).join("")}
         </ul>`
      : ""

  return `
    <div class="section">
      <div class="muted" style="margin-bottom:6px;">Estimated Schedule</div>

      <div style="
        border:1px solid #cfcfcf;
        border-radius:10px;
        padding:12px;
        background:#fff;
      ">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="font-weight:800; font-size:13px;">Duration Expectations</div>
          <div style="font-size:12px; color:#666;">${workweek}</div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
          <tr>
            <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e5e5;">Crew Time</th>
            <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e5e5;">Site Visits</th>
            <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e5e5;">Calendar Duration</th>
          </tr>
          <tr>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0; font-weight:700;">${crew}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0; font-weight:700;">${visits}</td>
            <td style="padding:8px; border-bottom:1px solid #f0f0f0; font-weight:700;">${duration}</td>
          </tr>
        </table>

        ${
          notes
            ? `<div style="margin-top:10px;">
                 <div style="font-size:12px; color:#666; margin-bottom:4px;">Scheduling considerations</div>
                 ${notes}
               </div>`
            : ""
        }
      </div>
     ${
  s.startDate && s.calendarDays
    ? (() => {
        // ✅ timezone-safe parse for YYYY-MM-DD
        const start = new Date(s.startDate + "T00:00:00")

        const minEnd = new Date(start)
        minEnd.setDate(start.getDate() + Math.max(s.calendarDays.min - 1, 0))


        const maxEnd = new Date(start)
        maxEnd.setDate(start.getDate() + Math.max(s.calendarDays.max - 1, 0))

        return `
<div style="margin-top:10px; font-size:13px;">
  <strong>Estimated Start:</strong>
  ${esc(start.toLocaleDateString())}<br/>
  <strong>Estimated Completion:</strong>
  ${esc(minEnd.toLocaleDateString())} –
  ${esc(maxEnd.toLocaleDateString())}
</div>
`
      })()
    : ""
}
    </div>
  `
}

    const pdfPlanReadback = planIntelligence?.planReadback ?? null
    const pdfPricingCarryReadback = buildPlanPricingCarryReadback({
      planReadback: pdfPlanReadback,
      estimateSections,
    })
    const pdfEstimatorStory = buildPlanEstimatorStorySections({
      planReadback: pdfPlanReadback,
      pricingCarryReadback: pdfPricingCarryReadback,
    })
    const pdfScopeGaps =
      pdfPlanReadback?.scopeGapReadback
        .filter((gap) => gap.status !== "likely_ready")
        .slice(0, 4) ?? []
    const pdfHasPlanContext = jobPlans.length > 0 || !!planIntelligence
    const pdfHasEstimatorReviewContent =
      !!pdfPlanReadback &&
      (pdfEstimatorStory.length > 0 ||
        pdfPricingCarryReadback.length > 0 ||
        pdfScopeGaps.length > 0)

    const labelText = (value: string) => value.replace(/_/g, " ")
    const evidenceSourceText = (
      evidence: Array<{
        sourcePageNumber: number
        pageNumber: number
        sheetNumber: string | null
        sheetTitle: string | null
      }>
    ) =>
      evidence.length > 0
        ? Array.from(
            new Set(
              evidence.map((ref) =>
                `${ref.sheetNumber || ref.sheetTitle || `Page ${ref.pageNumber}`} / source page ${ref.sourcePageNumber}`
              )
            )
          )
            .slice(0, 3)
            .join("; ")
        : ""

    const pdfEstimatorStoryHtml =
      pdfHasEstimatorReviewContent
        ? `
          <div class="section">
            <div class="muted" style="margin-bottom:6px;">Estimator Plan Review</div>
            <div style="
              border:1px solid #cfcfcf;
              border-radius:10px;
              padding:12px;
              background:#fff;
            ">
              ${
                pdfPlanReadback.headline
                  ? `<div style="font-weight:800; font-size:13px; line-height:1.45; color:#111;">${esc(
                      pdfPlanReadback.headline
                    )}</div>`
                  : ""
              }

              ${
                pdfEstimatorStory.length > 0
                  ? `<div style="margin-top:10px; display:grid; gap:8px;">
                      ${pdfEstimatorStory
                        .slice(0, 5)
                        .map((section, index) => {
                          const sources = evidenceSourceText(section.evidence)
                          return `
                            <div style="padding:9px; border:1px solid #e5e5e5; border-radius:8px; background:#fafafa; page-break-inside:avoid;">
                              <div style="font-weight:800; font-size:12px; color:#111;">
                                ${index + 1}. ${esc(section.title)}
                                <span style="font-weight:600; color:#555;"> - ${esc(labelText(section.supportLabel))} support</span>
                              </div>
                              <div style="margin-top:4px; font-size:12px; line-height:1.45; color:#222;">${esc(section.summary)}</div>
                              ${
                                section.bullets.length > 0
                                  ? `<ul style="margin:6px 0 0; padding-left:18px; line-height:1.4; font-size:12px;">
                                      ${section.bullets.slice(0, 3).map((item) => `<li>${esc(item)}</li>`).join("")}
                                    </ul>`
                                  : ""
                              }
                              ${
                                sources
                                  ? `<div style="margin-top:5px; font-size:11px; color:#666;">Sources: ${esc(sources)}</div>`
                                  : ""
                              }
                            </div>
                          `
                        })
                        .join("")}
                    </div>`
                  : ""
              }

              ${
                pdfPricingCarryReadback.length > 0
                  ? `<div style="margin-top:12px;">
                      <div style="font-size:12px; font-weight:800; color:#333; margin-bottom:6px;">Pricing Carry</div>
                      <div style="display:grid; gap:7px;">
                        ${pdfPricingCarryReadback
                          .slice(0, 6)
                          .map((item) => {
                            const sources = evidenceSourceText(item.evidence)
                            const quantity =
                              item.quantity != null && item.unit
                                ? `<div style="margin-top:3px; font-size:11px; color:#555;">Carried quantity: ${esc(
                                    Number(item.quantity).toLocaleString()
                                  )} ${esc(labelText(item.unit))}</div>`
                                : ""
                            return `
                              <div style="padding:8px; border:1px solid #e5e5e5; border-radius:8px; background:#fff; page-break-inside:avoid;">
                                <div style="font-weight:800; font-size:12px; color:#111;">
                                  ${esc(item.title)} - ${esc(labelText(item.status))}
                                </div>
                                <div style="margin-top:3px; font-size:12px; line-height:1.4; color:#222;">${esc(item.narration)}</div>
                                ${quantity}
                                ${
                                  sources
                                    ? `<div style="margin-top:4px; font-size:11px; color:#666;">Sources: ${esc(sources)}</div>`
                                    : ""
                                }
                              </div>
                            `
                          })
                          .join("")}
                      </div>
                    </div>`
                  : ""
              }

              ${
                pdfScopeGaps.length > 0
                  ? `<div style="margin-top:12px;">
                      <div style="font-size:12px; font-weight:800; color:#333; margin-bottom:6px;">Confirm Before Final Pricing Confidence</div>
                      <ul style="margin:0; padding-left:18px; line-height:1.45; font-size:12px;">
                        ${pdfScopeGaps
                          .map(
                            (gap) =>
                              `<li><strong>${esc(gap.title)}:</strong> ${esc(gap.narration)} ${esc(gap.confirmationPrompt)}</li>`
                          )
                          .join("")}
                      </ul>
                    </div>`
                  : ""
              }
            </div>
          </div>
        `
        : pdfHasPlanContext
          ? `
            <div class="section">
              <div class="muted" style="margin-bottom:6px;">Estimator Plan Review</div>
              <div style="
                border:1px solid #cfcfcf;
                border-radius:10px;
                padding:12px;
                background:#fff;
              ">
                <div style="font-weight:800; font-size:13px; line-height:1.45; color:#111;">
                  Plans were uploaded for review.
                </div>
                <ul style="margin:8px 0 0; padding-left:18px; line-height:1.45; font-size:12px; color:#222;">
                  <li>No hard measured quantities were confirmed from the uploaded plan set.</li>
                  <li>Final price confidence depends on confirming exact quantities, finish selections, and affected areas.</li>
                  <li>Pricing remains based on the generated scope, estimator inputs, and existing pricing safeguards.</li>
                </ul>
              </div>
            </div>
          `
          : ""

    win.document.write(`
      <html>
        <head>
          <title>${esc(brandName)} — ${esc(pdfDocumentTypeLabel || "Estimate")} — ${esc(jobName || "")}</title>
          <meta charset="utf-8" />
          <style>
            @page { margin: 22mm 18mm; }
            body {
              font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
              color: #111;
            }
            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 18px;
              padding-bottom: 14px;
              border-bottom: 2px solid #111;
            }
            .brand {
              font-size: 14px;
              font-weight: 600;
              color: #444;
              letter-spacing: 0.2px;
            }
            .brandTag {
              margin-top: 4px;
              font-size: 11px;
              color: #666;
            }
            .company {
              text-align: right;
              font-size: 12px;
              line-height: 1.5;
              color: #222;
              max-width: 55%;
              word-wrap: break-word;
            }
            h1 {
              font-size: 18px;
              margin: 18px 0 6px;
            }
            .muted {
              color: #555;
              font-size: 12px;
            }
            .section {
              margin-top: 18px;
            }
            .box {
  margin-top: 10px;
  padding: 14px;
  border: 1px solid #cfcfcf;
  border-radius: 10px;
  background: #fff;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 13px;
}
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 13px;
            }
            td, th {
              padding: 10px;
              border-bottom: 1px solid #e5e5e5;
            }
            th {
              text-align: left;
              font-size: 12px;
              color: #444;
            }
            .totalRow td {
              font-weight: 800;
              border-top: 2px solid #111;
            }
            .badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 999px;
              font-size: 11px;
              background: #f0f0f0;
              color: #333;
              margin-left: 8px;
            }
            .sign {
              margin-top: 34px;
              display: flex;
              justify-content: space-between;
              gap: 24px;
            }
            .sigBlock {
              flex: 1;
            }
            .line {
              border-top: 1px solid #111;
              margin-top: 46px;
              width: 100%;
            }
            .sigLabel {
              margin-top: 8px;
              font-size: 12px;
              color: #333;
            }
              /* -------------------------
   Approvals (compact + 2-up)
   ------------------------- */
.approvalsRow{
  margin-top: 10px;             /* tighter */
  padding-top: 8px;             /* tighter */
  border-top: 1px solid #e5e5e5;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  page-break-inside: avoid;
  break-inside: avoid;
}

.approval{
  flex: 1;
  padding: 10px 12px;           /* tighter */
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.approvalTitle{
  font-size: 12px;
  font-weight: 700;
  color: #111;
  margin: 0 0 8px;              /* tighter */
}

.approvalGrid{
  display: grid;
  grid-template-columns: 1fr 0.7fr;  /* signature + date */
  gap: 14px;
  align-items: end;
}

.approvalField{
  display: flex;
  flex-direction: column;
}

.approvalLine{
  border-top: 1px solid #111;
  margin-top: 18px;             /* tighter */
  width: 100%;
}

.approvalHint{
  margin-top: 6px;              /* was 8 */
  font-size: 11px;
  color: #333;
  white-space: nowrap;
}

.approvalNote{
  margin-top: 6px;              /* tighter */
  font-size: 10px;              /* slightly smaller */
  color: #555;
  line-height: 1.3;
}
            .footer {
  margin-top: 10px;     /* was 26 */
  padding-top: 6px;     /* was 10 */
  border-top: 1px solid #eee;
  font-size: 11px;
  color: #666;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
          
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">${esc(brandName)}</div>
              <div class="brandTag">Professional change orders & estimates — generated instantly.</div>
            </div>
            <div class="company">
  ${
    companyLogo
      ? `<img src="${companyLogo}" style="max-height:42px; margin-bottom:6px;" />`
      : ""
  }

  <div style="font-weight:700; font-size:16px; color:#111;">
    ${esc(companyName)}
  </div>

  ${companyAddress ? `<div>${esc(companyAddress)}</div>` : ""}
  ${companyPhone ? `<div>${esc(companyPhone)}</div>` : ""}
  ${companyLicense ? `<div><strong>License #:</strong> ${esc(companyLicense)}</div>` : ""}
  ${companyEmail ? `<div>${esc(companyEmail)}</div>` : ""}
</div>
          </div>

          <h1>${esc(pdfDocumentTypeLabel || "Estimate")}
            ${
              pdfShowPriceGuard
                ? `<span class="badge">${esc(pdfPriceGuardLabel)}</span>`
                : pdfEdited
                ? `<span class="badge">Edited</span>`
                : ""
             }
          </h1>

<div class="muted" style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
  <div>
    ${clientName ? `<div><strong>Client:</strong> ${esc(clientName)}</div>` : ""}
    ${jobName ? `<div><strong>Job:</strong> ${esc(jobName)}</div>` : ""}
    ${jobAddress ? `<div><strong>Address:</strong> ${esc(jobAddress)}</div>` : ""}
  </div>

  <div style="text-align:right;">
    ${changeOrderNo ? `<div><strong>Change Order #:</strong> ${esc(changeOrderNo)}</div>` : ""}
    <div><strong>Date:</strong> ${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())}</div>
  </div>
</div>

<div class="muted" style="margin-top:6px;">Generated by ${esc(brandName)}</div>

          <div class="section">
  <div class="muted" style="margin-bottom:6px;">Scope / Description</div>
  <div class="box">${safeResult}</div>

  ${
    pdfChangeOrderNote
      ? `
        <div class="muted" style="margin-top:8px; line-height:1.45;">
          <strong>Change Order Classification:</strong> ${esc(pdfChangeOrderNote)}
        </div>
      `
      : ""
  }

  ${
    pdfScheduleImpactNote
      ? `
        <div class="muted" style="margin-top:6px; line-height:1.45;">
          <strong>Schedule Impact:</strong> ${esc(pdfScheduleImpactNote)}
        </div>
      `
      : ""
  }
</div>

          ${scheduleHtml(schedule)}

          ${pdfEstimatorStoryHtml}

          ${estimateSectionsHtml}

          <div class="section">
            <div class="muted" style="margin-bottom:6px;">Pricing Summary</div>
            <table>
              <tr><th>Category</th><th style="text-align:right;">Amount</th></tr>
              <tr><td>Labor</td><td style="text-align:right;">$${Number(pricing.labor || 0).toLocaleString()}</td></tr>
<tr><td>Materials</td><td style="text-align:right;">$${Number(pricing.materials || 0).toLocaleString()}</td></tr>
<tr><td>Other / Mobilization</td><td style="text-align:right;">$${Number(pricing.subs || 0).toLocaleString()}</td></tr>
<tr><td>Markup</td><td style="text-align:right;">${Number(pricing.markup || 0)}%</td></tr>

${
  taxEnabled
    ? `<tr><td>Sales Tax (${Number(taxRate || 0)}%)</td><td style="text-align:right;">$${Number(taxAmount || 0).toLocaleString()}</td></tr>`
    : ""
}

<tr class="totalRow"><td>Total</td><td style="text-align:right;">$${Number(pricing.total || 0).toLocaleString()}</td></tr>
                            ${
                depositEnabled
                  ? `<tr><td>Deposit Due Now</td><td style="text-align:right;">$${Number(depositDue || 0).toLocaleString()}</td></tr>
                     <tr><td>Remaining Balance</td><td style="text-align:right;">$${Number(remainingBalance || 0).toLocaleString()}</td></tr>`
                  : ""
              }
            </table>

            ${pdfEdited ? `
  <div class="muted" style="margin-top:8px; line-height:1.4;">
    <strong>Edited:</strong> Pricing was updated to reflect job-specific details (site conditions, selections, or confirmed measurements).
  </div>
` : ""}

            ${showPriceGuardNote ? `
  <div class="muted" style="margin-top:8px; line-height:1.4;">
    <strong>${esc(pdfPriceGuardLabel)} (Informational):</strong>
    Pricing reflects the scope described above and typical site conditions at time of preparation.
    If site conditions, selections, quantities, or scope change after issuance, the final price will be adjusted accordingly.
  </div>
` : ""}

</div>   
   
<div class="approvalsRow">
  <div class="approval">
    <div class="approvalTitle">Contractor Approval</div>

    <div class="approvalGrid">
      <div class="approvalField">
        <div class="approvalLine"></div>
        <div class="approvalHint">Contractor Signature</div>
      </div>

      <div class="approvalField">
        <div class="approvalLine"></div>
        <div class="approvalHint">
          Date (${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())})
        </div>
      </div>
    </div>
  </div>

  <div class="approval">
  <div class="approvalTitle">Customer Approval</div>

  ${
    isApproved
      ? `
        <div style="font-size:12px; margin-bottom:8px;">
          <strong>Approved by:</strong> ${esc(approvedBy)}
        </div>

        ${
          approvedAtText
            ? `
              <div style="font-size:12px; margin-bottom:8px; color:#444;">
                <strong>Approved on:</strong> ${esc(approvedAtText)}
              </div>
            `
            : ""
        }

        ${
          approvedSignature
            ? `
              <div style="margin:8px 0 10px;">
                <div style="font-size:11px; color:#333; margin-bottom:4px;">
                  Customer Signature
                </div>
                <img
                  src="${approvedSignature}"
                  alt="Customer signature"
                  style="max-width:220px; max-height:90px; border-bottom:1px solid #111; display:block;"
                />
              </div>
            `
            : `
              <div class="approvalGrid">
                <div class="approvalField">
                  <div class="approvalLine"></div>
                  <div class="approvalHint">Customer Signature</div>
                </div>

                <div class="approvalField">
                  <div class="approvalLine"></div>
                  <div class="approvalHint">Date</div>
                </div>
              </div>
            `
        }
      `
      : `
        <div class="approvalGrid">
          <div class="approvalField">
            <div class="approvalLine"></div>
            <div class="approvalHint">Customer Signature</div>
          </div>

          <div class="approvalField">
            <div class="approvalLine"></div>
            <div class="approvalHint">
              Date (${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())})
            </div>
          </div>
        </div>
      `
  }

  <div class="approvalNote">
    By signing above, the customer approves the scope of work and pricing described in this document.
    Payment terms: <strong>${esc(paymentTerms)}</strong>
  </div>
</div>
</div>

          <div class="footer">
            <div>${esc(brandName)}</div>
            <div>${esc(jobDetails.date ? new Date(jobDetails.date).toLocaleDateString() : new Date().toLocaleDateString())}</div>
          </div>
        </body>
      </html>
    `)

        win.document.close()

    setTimeout(() => {
      win.focus()
      win.print()
    }, 500)
  }

  function downloadInvoicePDF(inv: Invoice) {
  const brandName = "JobEstimate Pro"
  const companyName = companyProfile.name?.trim() || "Contractor"
  const companyAddress = companyProfile.address?.trim() || ""
  const companyPhone = companyProfile.phone?.trim() || ""
  const companyEmail = companyProfile.email?.trim() || ""

  const win = window.open("", "", "width=900,height=1100")
  if (!win) {
    setStatus("Pop-up blocked. Please allow pop-ups to download the PDF.")
    return
  }

  const esc = (s: any) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

  const rows = inv.lineItems
    .map(
      (li) => `
        <tr>
          <td>${esc(li.label)}</td>
          <td style="text-align:right;">${money(li.amount)}</td>
        </tr>
      `
    )
    .join("")

  const {
    estimateRows: resolvedInvoiceEstimateRows,
    estimateEmbeddedBurdens: resolvedInvoiceEstimateEmbeddedBurdens,
  } = resolveCanonicalEstimateOutput(inv)
  const invoiceEstimateRows = resolvedInvoiceEstimateRows ?? []
  const invoiceEstimateEmbeddedBurdens = resolvedInvoiceEstimateEmbeddedBurdens ?? []
  const invoiceHasMultipleSectionTrades =
    new Set(
      [...invoiceEstimateRows, ...invoiceEstimateEmbeddedBurdens]
        .map((section) => section.trade.trim().toLowerCase())
        .filter(Boolean)
    ).size > 1
  const estimateSectionsReferenceHtml =
    invoiceEstimateRows.length > 0 || invoiceEstimateEmbeddedBurdens.length > 0
      ? `
        <div style="margin-top:16px;">
          <div class="muted" style="margin-bottom:6px;">Estimate Row Reference</div>
          ${
            invoiceEstimateRows.length > 0
              ? `<table>
            <tr><th>Row</th><th style="text-align:right;">Amount</th></tr>
            ${invoiceEstimateRows
              .map((section) => {
                const label =
                  invoiceHasMultipleSectionTrades && section.trade
                    ? `${section.trade}: ${section.label}`
                    : section.label
                const notes =
                  section.notes.length > 0
                    ? `<div style="margin-top:4px; font-size:11px; color:#666;">${esc(
                        section.notes.join(" • ")
                      )}</div>`
                    : ""

                return `
                  <tr>
                    <td>
                      <div style="font-weight:700;">${esc(label)}</div>
                      ${notes}
                    </td>
                    <td style="text-align:right;">${money(section.amount)}</td>
                  </tr>
                `
              })
              .join("")}
          </table>`
              : ""
          }
          ${
            invoiceEstimateEmbeddedBurdens.length > 0
              ? `<table style="margin-top:10px;">
            <tr><th>Embedded burden</th><th>Treatment</th><th style="text-align:right;">Amount</th></tr>
            ${invoiceEstimateEmbeddedBurdens
              .map((section) => {
                const label =
                  invoiceHasMultipleSectionTrades && section.trade
                    ? `${section.trade}: ${section.label}`
                    : section.label
                const notes =
                  section.notes.length > 0
                    ? `<div style="margin-top:4px; font-size:11px; color:#666;">${esc(
                        section.notes.join(" • ")
                      )}</div>`
                    : ""

                return `
                  <tr>
                    <td>
                      <div style="font-weight:700;">${esc(label)}</div>
                      ${notes}
                    </td>
                    <td>${esc(getEstimateSectionTreatmentLabel(section))}</td>
                    <td style="text-align:right;">${money(section.amount)}</td>
                  </tr>
                `
              })
              .join("")}
          </table>`
              : ""
          }
          <div class="box" style="margin-top:8px;">
            Embedded burden rows remain included in the estimate total and are shown here as reference only.
          </div>
        </div>
      `
      : ""

  win.document.write(`
    <html>
      <head>
        <title>${esc(brandName)} — Invoice ${esc(inv.invoiceNo)}</title>
        <meta charset="utf-8" />
        <style>
          @page { margin: 22mm 18mm; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; }
          .header { display:flex; justify-content:space-between; gap:16px; padding-bottom:12px; border-bottom:2px solid #111; }
          .brand { font-size:14px; font-weight:600; color:#444; letter-spacing:0.2px; }
          .company { text-align:right; font-size:12px; line-height:1.5; color:#222; max-width:55%; word-wrap:break-word; }
          h1 { font-size:18px; margin:16px 0 6px; }
          .muted { color:#555; font-size:12px; }
          table { width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
          td, th { padding:10px; border-bottom:1px solid #e5e5e5; }
          th { text-align:left; font-size:12px; color:#444; }
          .totalRow td { font-weight:800; border-top:2px solid #111; }
          .meta { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:8px; }
          .box { margin-top:10px; padding:12px; border:1px solid #e5e5e5; border-radius:10px; font-size:12px; color:#333; }
          .approvalsRow{ margin-top:14px; padding-top:10px; border-top:1px solid #e5e5e5; display:flex; gap:16px; }
          .approval{ flex:1; padding:10px 12px; border:1px solid #e5e5e5; border-radius:10px; }
          .approvalTitle{ font-size:12px; font-weight:700; margin:0 0 8px; }
          .approvalGrid{ display:grid; grid-template-columns:1fr 0.7fr; gap:14px; align-items:end; }
          .approvalLine{ border-top:1px solid #111; margin-top:22px; width:100%; }
          .approvalHint{ margin-top:6px; font-size:11px; color:#333; white-space:nowrap; }
          .footer { margin-top:22px; padding-top:10px; border-top:1px solid #eee; font-size:11px; color:#666; display:flex; justify-content:space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">${esc(brandName)}</div>
            <div class="muted">Invoice</div>
          </div>
          <div class="company">
            <div style="font-weight:700; font-size:16px; color:#111;">${esc(companyName)}</div>
            ${companyAddress ? `<div>${esc(companyAddress)}</div>` : ""}
            ${companyPhone ? `<div>${esc(companyPhone)}</div>` : ""}
            ${companyEmail ? `<div>${esc(companyEmail)}</div>` : ""}
          </div>
        </div>

        <h1>Invoice <span style="font-weight:700;">${esc(inv.invoiceNo)}</span></h1>

        <div class="meta muted">
          <div>
            <div><strong>Bill To:</strong> ${esc(inv.billToName)}</div>
            <div><strong>Job:</strong> ${esc(inv.jobName)}</div>
            ${inv.jobAddress ? `<div><strong>Address:</strong> ${esc(inv.jobAddress)}</div>` : ""}
          </div>
          <div style="text-align:right;">
            <div><strong>Issue Date:</strong> ${esc(new Date(inv.issueDate).toLocaleDateString())}</div>
            <div><strong>Due Date:</strong> ${esc(new Date(inv.dueDate).toLocaleDateString())}</div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="muted" style="margin-bottom:6px;">Invoice Summary</div>
          <table>
            <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
            ${rows}
            <tr class="totalRow"><td>Total Due</td><td style="text-align:right;">${money(inv.total)}</td></tr>
          </table>
        </div>

        ${estimateSectionsReferenceHtml}

        ${
  inv.deposit?.enabled
    ? `<div class="box">
         <strong>${inv.total === inv.deposit?.depositDue ? "Deposit Invoice:" : "Balance Invoice:"}</strong><br/>
         Estimate Total: ${money(inv.deposit.estimateTotal)}<br/>
         Deposit Due Now: ${money(inv.deposit.depositDue)}<br/>
         Remaining Balance: ${money(inv.deposit.remainingBalance)}
       </div>`
    : ""
}

${inv.notes ? `<div class="box"><strong>Notes:</strong> ${esc(inv.notes)}</div>` : ""}

        <div class="approvalsRow">
          <div class="approval">
            <div class="approvalTitle">Contractor Approval</div>
            <div class="approvalGrid">
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Contractor Signature</div>
              </div>
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Date</div>
              </div>
            </div>
          </div>

          <div class="approval">
            <div class="approvalTitle">Customer Approval</div>
            <div class="approvalGrid">
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Customer Signature</div>
              </div>
              <div>
                <div class="approvalLine"></div>
                <div class="approvalHint">Date</div>
              </div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div>${esc(brandName)}</div>
          <div>${esc(new Date().toLocaleDateString())}</div>
        </div>
      </body>
    </html>
  `)

  win.document.close()
  win.focus()
  win.print()
  win.close()
}

function createInvoiceFromEstimate(est: EstimateHistoryItem) {
  const terms = companyProfile.paymentTerms?.trim() || "Net 7"
  const notePaymentTerms = companyProfile.paymentTerms?.trim() || "Due upon approval."

    if (hasAnyInvoiceForEstimate(est.id)) {
    setStatus("An invoice already exists for this estimate.")
    return
  }

  const built = buildInvoiceFromEstimate({
    estimate: est,
    dueTerms: terms,
    notePaymentTerms,
    fallbackJobDetails: jobDetails,
  })
  if (!built.ok) return

  setInvoices((prev) => [built.invoice, ...prev])
  setStatus(`Invoice created: ${built.invoice.invoiceNo}`)
}

// ✅ Create Balance Invoice (Remaining Balance after Deposit)
function createBalanceInvoiceFromEstimate(est: EstimateHistoryItem) {
  const terms = companyProfile.paymentTerms?.trim() || "Net 7"
  const notePaymentTerms = companyProfile.paymentTerms?.trim() || "Due upon approval."

    if (hasBalanceInvoiceForEstimate(est.id)) {
    setStatus("A balance invoice already exists for this estimate.")
    return
  }

  const built = buildInvoiceFromEstimate({
    estimate: est,
    mode: "balance",
    dueTerms: terms,
    notePaymentTerms,
    fallbackJobDetails: jobDetails,
  })

  if (!built.ok) {
    setStatus(
      built.reason === "missing_deposit"
        ? "No deposit was set on this estimate — use Create Invoice instead."
        : "Remaining balance is $0 — nothing to invoice."
    )
    return
  }

  setInvoices((prev) => [built.invoice, ...prev])
  setStatus(`Balance invoice created: ${built.invoice.invoiceNo}`)
}

const isUserEdited = pricingEdited === true

const displayedConfidence = (() => {
  const base = priceGuard?.confidence ?? null
  if (base == null) return null
  if (!pricingEdited) return base
  return Math.max(0, Math.min(99, base - 20))
})()

const pdfShowPriceGuard =
  !isUserEdited &&
  (priceGuard?.status === "verified" ||
   priceGuard?.status === "adjusted" ||
   priceGuard?.status === "deterministic")
const pdfEdited = isUserEdited

const pdfPriceGuardLabel =
  priceGuard?.status === "verified" ? "PriceGuard™ Verified" :
  priceGuard?.status === "adjusted" ? "PriceGuard™ Adjusted" :
  priceGuard?.status === "deterministic" ? "PriceGuard™ Deterministic" :
  "PriceGuard™"

const displayedDocumentType = getChangeOrderDisplayLabel(
  documentType,
  changeOrderDetection
)

const displayedChangeOrderNote = getChangeOrderClientNote(changeOrderDetection)

const displayedScheduleImpactNote = getChangeOrderScheduleNote(changeOrderDetection)

const hasPhotoStatus =
  jobPhotos.length > 0 ||
  !!photoAnalysis ||
  !!photoScopeAssist

const needsMeasurementStatus =
  (!measureEnabled || totalSqft <= 0) &&
  !hasMeasurementReference &&
  ((estimateConfidence?.score ?? 100) < 85 || jobPhotos.length > 0)

const hasEstimateStatus =
  !!displayedChangeOrderNote ||
  !!displayedScheduleImpactNote ||
  !!changeOrderDetection?.isChangeOrder ||
  !!scopeSignals?.needsReturnVisit ||
  hasPhotoStatus ||
  !!planAssistedStatus ||
  needsMeasurementStatus

const hasReviewInsights =
  !!changeOrderSummary ||
  !!explainChangesReport ||
  estimateBreakdown.length > 0 ||
  estimateAssumptions.length > 0 ||
  !!estimateConfidence

const hasAdvancedAnalysis =
  !!photoAnalysis ||
  !!photoScopeAssist ||
  !!materialsList ||
  !!areaScopeBreakdown ||
  !!profitProtection ||
  !!scopeXRay ||
  !!missedScopeDetector ||
  !!profitLeakDetector ||
  !!estimateDefenseMode ||
  !!tradePricingPrepAnalysis ||
  hasReviewInsights

function PriceGuardBadge() {
  if (!result) return null // only show after generation

  const pgStatus = priceGuard?.status ?? (priceGuardVerified ? "verified" : "ai")

  const label =
  pricingEdited ? "PriceGuard™ Override" :
  pgStatus === "verified" ? "PriceGuard™ Verified" :
  pgStatus === "adjusted" ? "PriceGuard™ Adjusted" :
  pgStatus === "deterministic" ? "PriceGuard™ Deterministic" :
  pgStatus === "review" ? "Review Recommended" :
  "AI Estimate"

const sub =
  pricingEdited ? "Pricing adjusted manually" :
  pgStatus === "verified" ? "Pricing validated by deterministic safeguards" :
  pgStatus === "adjusted" ? "AI pricing lifted to deterministic safety floors" :
  pgStatus === "deterministic" ? "Deterministic pricing engine applied" :
  pgStatus === "review" ? "Some details were inferred — review recommended" :
  "Pricing relied primarily on AI — add quantities for stronger protection"

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      data-priceguard
    >
      <button
        type="button"
        onClick={() => setShowPriceGuardDetails((v) => !v)}
        style={{
          border: "1px solid #e5e7eb",
          background:
  pricingEdited ? "#f3f4f6" :
  pgStatus === "verified" ? "#ecfdf5" :
  pgStatus === "adjusted" ? "#fffbeb" :
  pgStatus === "deterministic" ? "#eef2ff" :
  pgStatus === "review" ? "#fff7ed" :
  "#f3f4f6",
          color: "#111",
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        title={sub}
      >
        
        <span aria-hidden="true">
  {priceGuardVerified ? "✅" : isUserEdited ? "✏️" : pricingSource === "deterministic" ? "🧠" : "ℹ️"}
</span>

        <span style={{ fontWeight: 800 }}>{label}</span>

        {displayedConfidence != null && (
  <span style={{ fontWeight: 700, color: "#444" }}>
    {displayedConfidence}%
  </span>
)}
      </button>

      {showPriceGuardDetails && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            width: 320,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
            zIndex: 999,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13 }}>
   PriceGuard™ Verification
</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
            {sub}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
  {priceGuardVerified ? (
    <>
      <div>• ✔ Scope quantities verified</div>
      <div>• ✔ Trade minimums applied</div>
      <div>• ✔ Common pricing risks screened</div>
    </>
  ) : (
    <>
      <div>• ℹ️ Pricing generated from the scope provided</div>
      <div>• ✔ Standard checks applied</div>
      <div>• ℹ️ Add more detail (or measurements) for stronger verification</div>
    </>
  )}

  {state ? (
    <div>• ✔ Regional labor rates adjusted ({state})</div>
  ) : (
    <div>• ℹ️ Regional labor rates: national baseline</div>
  )}

  {effectivePaintScope === "doors_only" && (
    <div>• ✔ Doors-only scope detected (includes casing/frames)</div>
  )}

  {isMixedPaintScope && (
    <div>• ✔ Mixed scope detected (rooms + doors)</div>
  )}
</div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#333" }}>
            {effectivePaintScope === "doors_only" && (
              <div style={{ marginTop: 6 }}>
                ⚙️ Doors-only detected — pricing locked to door logic.
              </div>
            )}

            {isMixedPaintScope && (
              <div style={{ marginTop: 6 }}>
                ⚙️ Mixed scope detected — rooms and doors priced separately.
              </div>
            )}

            {isUserEdited ? (
  <div style={{ marginTop: 6 }}>
    ✏️ Pricing was manually edited after generation.
  </div>
) : !priceGuardVerified ? (
  <div style={{ marginTop: 6 }}>
    ℹ️ Tip: add quantities, measurements, and the job state for a more
    precise verified price.
  </div>
) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowPriceGuardDetails(false)}
            style={{
              marginTop: 10,
              fontSize: 12,
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}
    </span>
  )
}

function ScheduleBlock({ schedule }: { schedule?: Schedule | null }) {
  if (!schedule) return null

  const { crewDays, visits, calendarDays, workDaysPerWeek, rationale } = schedule

  const hasAny =
    crewDays != null ||
    visits != null ||
    calendarDays != null ||
    workDaysPerWeek != null ||
    (rationale?.length ?? 0) > 0

  if (!hasAny) return null

  const calendarText =
    calendarDays ? `${calendarDays.min}–${calendarDays.max} calendar days` : null

  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Estimated Schedule</div>
        <div style={{ fontSize: 12, color: "#666" }}>
          {workDaysPerWeek ? `${workDaysPerWeek}-day workweek` : ""}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
          marginTop: 10,
        }}
      >
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Crew Time</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {crewDays != null ? `${crewDays} crew-days` : "—"}
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Site Visits</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {visits != null ? visits : "—"}
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Duration</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {calendarText ?? "—"}
          </div>
        </div>
      </div>

      {(rationale?.length ?? 0) > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            Scheduling considerations
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {rationale.map((r, idx) => (
              <li key={idx}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ScheduleEditor({
  schedule,
  setSchedule,
}: {
  schedule: Schedule
  setSchedule: React.Dispatch<React.SetStateAction<Schedule | null>>
}) {
  return (
  <div
    style={{
      marginTop: 12,
    }}
  >

      <label style={{ fontSize: 12 }}>Start Date (Optional)</label>
<input
  type="date"
  value={schedule.startDate ?? ""}
  onChange={(e) =>
    setSchedule((s) =>
      s ? { ...s, startDate: e.target.value } : s
    )
  }
  style={{ width: "100%", padding: 8, marginBottom: 8 }}
/>

      {/* Crew Days */}
      <label style={{ fontSize: 12 }}>Crew Days</label>
      <input
        type="number"
        value={schedule.crewDays ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? { ...s, crewDays: e.target.value === "" ? null : Number(e.target.value) }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Visits */}
      <label style={{ fontSize: 12 }}>Site Visits</label>
      <input
        type="number"
        value={schedule.visits ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? { ...s, visits: e.target.value === "" ? null : Number(e.target.value) }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Work Week */}
      <label style={{ fontSize: 12 }}>Work Days Per Week</label>
      <input
        type="number"
        value={schedule.workDaysPerWeek ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? {
                  ...s,
                  workDaysPerWeek:
                    e.target.value === "" ? null : Number(e.target.value),
                }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Calendar Days */}
      <label style={{ fontSize: 12 }}>Calendar Days (Min)</label>
      <input
        type="number"
        value={schedule.calendarDays?.min ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? {
                  ...s,
                  calendarDays: {
                    ...(s.calendarDays ?? { min: 0, max: 0 }),
                    min: e.target.value === "" ? 0 : Number(e.target.value),
                  },
                }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      <label style={{ fontSize: 12 }}>Calendar Days (Max)</label>
      <input
        type="number"
        value={schedule.calendarDays?.max ?? ""}
        onChange={(e) =>
          setSchedule((s) =>
            s
              ? {
                  ...s,
                  calendarDays: {
                    ...(s.calendarDays ?? { min: 0, max: 0 }),
                    max: e.target.value === "" ? 0 : Number(e.target.value),
                  },
                }
              : s
          )
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />

      {/* Rationale */}
      <label style={{ fontSize: 12 }}>Scheduling Notes</label>
      {schedule.rationale.map((r, i) => (
        <input
          key={i}
          value={r}
          onChange={(e) =>
            setSchedule((s) =>
              s
                ? {
                    ...s,
                    rationale: s.rationale.map((x, idx) =>
                      idx === i ? e.target.value : x
                    ),
                  }
                : s
            )
          }
          style={{ width: "100%", padding: 8, marginBottom: 6 }}
        />
      ))}

      <button
        type="button"
        onClick={() =>
          setSchedule((s) =>
            s ? { ...s, rationale: [...s.rationale, ""] } : s
          )
        }
        style={{ fontSize: 12, marginTop: 6 }}
      >
        + Add Note
      </button>
    </div>
  )
}

function ScopeXRayCard({
  scopeXRay,
}: {
  scopeXRay: ScopeXRay
}) {
  if (!scopeXRay) return null

  const sourceTone =
    scopeXRay.pricingMethod.pricingSource === "deterministic"
      ? { bg: "#ecfdf5", border: "#86efac", color: "#065f46" }
      : scopeXRay.pricingMethod.pricingSource === "merged"
      ? { bg: "#fffbeb", border: "#fcd34d", color: "#92400e" }
      : { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8" }

  return (
    <details
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
      open
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Scope-to-Price X-Ray
      </summary>

      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        See exactly what the app detected, what quantities it used, how pricing was built,
        and what still needs review.
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: `1px solid ${sourceTone.border}`,
          borderRadius: 12,
          background: sourceTone.bg,
        }}
      >
        <div style={{ fontWeight: 800, color: sourceTone.color, fontSize: 14 }}>
          Pricing Method
        </div>

        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
          <div>
            <strong>Source:</strong> {scopeXRay.pricingMethod.pricingSource}
          </div>
          {scopeXRay.pricingMethod.detSource && (
            <div>
              <strong>Engine:</strong> {scopeXRay.pricingMethod.detSource}
            </div>
          )}
          {scopeXRay.pricingMethod.anchorId && (
            <div>
              <strong>Anchor:</strong> {scopeXRay.pricingMethod.anchorId}
            </div>
          )}
          <div>
            <strong>Verified:</strong>{" "}
            {scopeXRay.pricingMethod.verified ? "Yes" : "No"}
          </div>
          <div>
            <strong>State adjusted:</strong>{" "}
            {scopeXRay.pricingMethod.stateAdjusted ? "Yes" : "No"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>Detected Scope</div>

        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
          <div>
            <strong>Primary trade:</strong> {scopeXRay.detectedScope.primaryTrade || "—"}
          </div>
          <div>
            <strong>Paint scope:</strong> {scopeXRay.detectedScope.paintScope || "—"}
          </div>
          <div>
            <strong>State:</strong> {scopeXRay.detectedScope.state || "—"}
          </div>
        </div>

        {scopeXRay.detectedScope.splitScopes.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              Split scopes
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              {scopeXRay.detectedScope.splitScopes.map((item, i) => (
                <li key={`split-${i}`}>
                  <strong>{item.trade}:</strong> {item.scope}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>Quantities Used</div>

        {scopeXRay.quantities.length > 0 ? (
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {scopeXRay.quantities.map((q, i) => (
              <li key={`qty-${i}`}>
                <strong>{q.label}:</strong> {q.value}{" "}
                <span style={{ color: "#666" }}>({q.source})</span>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
            No hard quantities were detected.
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>Schedule Logic</div>

        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
          <div>
            <strong>Crew days:</strong> {scopeXRay.scheduleLogic.crewDays ?? "—"}
          </div>
          <div>
            <strong>Visits:</strong> {scopeXRay.scheduleLogic.visits ?? "—"}
          </div>
        </div>

        {scopeXRay.scheduleLogic.reasons.length > 0 && (
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {scopeXRay.scheduleLogic.reasons.map((r, i) => (
              <li key={`sched-${i}`}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {scopeXRay.riskFlags.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #fdba74",
            borderRadius: 12,
            background: "#fff7ed",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#9a3412" }}>
            Risk Flags
          </div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {scopeXRay.riskFlags.map((r, i) => (
              <li key={`risk-${i}`}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {scopeXRay.needsConfirmation.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #fcd34d",
            borderRadius: 12,
            background: "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#92400e" }}>
            Needs Confirmation
          </div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {scopeXRay.needsConfirmation.map((r, i) => (
              <li key={`confirm-${i}`}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}

function TierAIntelligenceCard({
  missedScopeDetector,
  profitLeakDetector,
  estimateDefenseMode,
}: {
  missedScopeDetector: MissedScopeDetector
  profitLeakDetector: ProfitLeakDetector
  estimateDefenseMode: EstimateDefenseMode
}) {
  const hasMissedScope =
    !!missedScopeDetector &&
    (missedScopeDetector.likelyMissingScope.length > 0 ||
      missedScopeDetector.recommendedConfirmations.length > 0)
  const hasProfitLeaks =
    !!profitLeakDetector &&
    (profitLeakDetector.likelyProfitLeaks.length > 0 ||
      profitLeakDetector.pricingReviewPrompts.length > 0)
  const hasDefenseMode =
    !!estimateDefenseMode &&
    Object.values(estimateDefenseMode).some(
      (items) => Array.isArray(items) && items.length > 0
    )

  if (!hasMissedScope && !hasProfitLeaks && !hasDefenseMode) return null

  const sectionTone = {
    danger: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
    warning: { bg: "#fffbeb", border: "#fcd34d", color: "#92400e" },
    neutral: { bg: "#fafafa", border: "#e5e7eb", color: "#111827" },
    info: { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8" },
  } as const

  const normalizeConcept = (value: string): string =>
    String(value || "")
      .toLowerCase()
      .replace(/\b(likely|possible|recommended|confirm|review|pricing|scope|item|risk)\b/g, " ")
      .replace(/\b(looks|look|may be|might be|do not|does not|clearly|carried|under-covered|under-carried)\b/g, " ")
      .replace(/[^\w]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  const cleanBulletText = (value: string): string =>
    String(value || "")
      .replace(/^(possible omitted scope|profit leak risk|pricing review|confirm scope item):\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\.$/, "")

  const dedupeStrings = (
    items: string[],
    seenConcepts: Set<string>,
    max = 4
  ): string[] => {
    const out: string[] = []

    for (const rawItem of items) {
      const item = cleanBulletText(rawItem)
      if (!item) continue
      const concept = normalizeConcept(item)
      if (!concept) continue

      const isDuplicate =
        seenConcepts.has(concept) ||
        Array.from(seenConcepts).some(
          (existing) =>
            existing === concept ||
            existing.includes(concept) ||
            concept.includes(existing)
        )

      if (isDuplicate) continue

      seenConcepts.add(concept)
      out.push(item)
      if (out.length >= max) break
    }

    return out
  }

  const dedupeInsightItems = (
    items: TierAInsightItem[],
    seenConcepts: Set<string>,
    max = 4
  ): TierAInsightItem[] => {
    const out: TierAInsightItem[] = []

    for (const item of items) {
      const label = cleanBulletText(item.label)
      const reason = cleanBulletText(item.reason)
      const labelConcept = normalizeConcept(label)
      const reasonConcept = normalizeConcept(reason)
      const combinedConcept = normalizeConcept(`${label} ${reason}`)

      const concepts = [combinedConcept, labelConcept, reasonConcept].filter(Boolean)
      const isDuplicate = concepts.some(
        (concept) =>
          seenConcepts.has(concept) ||
          Array.from(seenConcepts).some(
            (existing) =>
              existing === concept ||
              existing.includes(concept) ||
              concept.includes(existing)
          )
      )

      if (isDuplicate) continue

      concepts.forEach((concept) => seenConcepts.add(concept))

      const trimmedReason =
        reasonConcept && reasonConcept === labelConcept ? "" : reason

      out.push({
        ...item,
        label,
        reason: trimmedReason,
      })

      if (out.length >= max) break
    }

    return out
  }

  const sharedSeenConcepts = new Set<string>()
  const likelyMissingScope = dedupeInsightItems(
    missedScopeDetector?.likelyMissingScope || [],
    sharedSeenConcepts,
    4
  )
  const recommendedConfirmations = dedupeInsightItems(
    missedScopeDetector?.recommendedConfirmations || [],
    sharedSeenConcepts,
    3
  )
  const likelyProfitLeaks = dedupeInsightItems(
    profitLeakDetector?.likelyProfitLeaks || [],
    sharedSeenConcepts,
    4
  )
  const pricingReviewPrompts = dedupeInsightItems(
    profitLeakDetector?.pricingReviewPrompts || [],
    sharedSeenConcepts,
    3
  )
  const whyThisPriceHolds = dedupeStrings(
    estimateDefenseMode?.whyThisPriceHolds || [],
    sharedSeenConcepts,
    3
  )
  const includedScopeHighlights = dedupeStrings(
    estimateDefenseMode?.includedScopeHighlights || [],
    sharedSeenConcepts,
    3
  )
  const exclusionNotes = dedupeStrings(
    estimateDefenseMode?.exclusionNotes || [],
    sharedSeenConcepts,
    3
  )
  const allowanceNotes = dedupeStrings(
    estimateDefenseMode?.allowanceNotes || [],
    sharedSeenConcepts,
    3
  )
  const homeownerFriendlyJustification = dedupeStrings(
    estimateDefenseMode?.homeownerFriendlyJustification || [],
    sharedSeenConcepts,
    2
  )
  const estimatorDefenseNotes = dedupeStrings(
    estimateDefenseMode?.estimatorDefenseNotes || [],
    sharedSeenConcepts,
    3
  )
  const optionalValueEngineeringIdeas = dedupeStrings(
    estimateDefenseMode?.optionalValueEngineeringIdeas || [],
    sharedSeenConcepts,
    2
  )

  const showMissedScope =
    likelyMissingScope.length > 0 || recommendedConfirmations.length > 0
  const showProfitLeaks =
    likelyProfitLeaks.length > 0 || pricingReviewPrompts.length > 0
  const showDefenseMode =
    whyThisPriceHolds.length > 0 ||
    includedScopeHighlights.length > 0 ||
    exclusionNotes.length > 0 ||
    allowanceNotes.length > 0 ||
    homeownerFriendlyJustification.length > 0 ||
    estimatorDefenseNotes.length > 0 ||
    optionalValueEngineeringIdeas.length > 0

  if (!showMissedScope && !showProfitLeaks && !showDefenseMode) return null

  const renderInsightList = (
    title: string,
    items: TierAInsightItem[],
    tone: keyof typeof sectionTone
  ) => {
    if (items.length === 0) return null

    const styles = sectionTone[tone]

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: styles.color }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            padding: 12,
            border: `1px solid ${styles.border}`,
            borderRadius: 12,
            background: styles.bg,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
            {items.map((item, index) => (
              <li key={`${title}-${index}`} style={{ marginBottom: index === items.length - 1 ? 0 : 8 }}>
                <div>
                  <strong>{item.label}</strong>
                  {item.confidence > 0 ? (
                    <span style={{ color: "#666" }}> · {item.confidence}% confidence</span>
                  ) : null}
                </div>
                {item.reason && (
                  <div style={{ color: "#4b5563", marginTop: 2 }}>{item.reason}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const renderStringList = (
    title: string,
    items: string[],
    tone: keyof typeof sectionTone = "neutral"
  ) => {
    if (items.length === 0) return null

    const styles = sectionTone[tone]

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: styles.color }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            padding: 12,
            border: `1px solid ${styles.border}`,
            borderRadius: 12,
            background: styles.bg,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
            {items.map((item, index) => (
              <li key={`${title}-${index}`} style={{ marginBottom: index === items.length - 1 ? 0 : 6 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
        Tier A Intelligence
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Backend audit signals for missed scope, margin exposure, and estimate defense.
      </div>

      {showMissedScope && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Missed Scope Detector</div>
          {renderInsightList(
            "Likely Missing Scope",
            likelyMissingScope,
            "danger"
          )}
          {renderInsightList(
            "Recommended Confirmations",
            recommendedConfirmations,
            "warning"
          )}
        </div>
      )}

      {showProfitLeaks && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Profit Leak Detector</div>
          {renderInsightList(
            "Likely Profit Leaks",
            likelyProfitLeaks,
            "danger"
          )}
          {renderInsightList(
            "Pricing Review Prompts",
            pricingReviewPrompts,
            "warning"
          )}
        </div>
      )}

      {showDefenseMode && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Estimate Defense Mode</div>
          {renderStringList(
            "Why This Price Holds",
            whyThisPriceHolds,
            "info"
          )}
          {renderStringList("Included Scope Highlights", includedScopeHighlights)}
          {renderStringList("Exclusion Notes", exclusionNotes, "warning")}
          {renderStringList("Allowance Notes", allowanceNotes, "warning")}
          {renderStringList(
            "Homeowner-Friendly Justification",
            homeownerFriendlyJustification,
            "info"
          )}
          {renderStringList("Estimator Defense Notes", estimatorDefenseNotes)}
          {renderStringList(
            "Optional Value Engineering Ideas",
            optionalValueEngineeringIdeas
          )}
        </div>
      )}
    </div>
  )
}

function MaterialsListCard({
  materialsList,
}: {
  materialsList: MaterialsList
}) {
  if (!materialsList) return null

  const grouped = {
    material: materialsList.items.filter((x) => x.category === "material"),
    consumable: materialsList.items.filter((x) => x.category === "consumable"),
    hardware: materialsList.items.filter((x) => x.category === "hardware"),
    protection: materialsList.items.filter((x) => x.category === "protection"),
  }

  const renderGroup = (
    title: string,
    items: typeof materialsList.items
  ) => {
    if (!items.length) return null

    return (
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#374151",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {items.map((item, i) => (
            <div
              key={`${title}-${item.label}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderTop: i === 0 ? "none" : "1px solid #f3f4f6",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {item.label}
                </div>

                {item.confidence && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    Confidence: {item.confidence}
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1f2937",
                  whiteSpace: "nowrap",
                }}
              >
                {item.quantity}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <details
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
      open
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Materials List
      </summary>

      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Draft shopping / prep list based on the scope, trade, and visible job conditions.
      </div>

      {renderGroup("Materials", grouped.material)}
      {renderGroup("Consumables", grouped.consumable)}
      {renderGroup("Hardware", grouped.hardware)}
      {renderGroup("Protection", grouped.protection)}

      {materialsList.confirmItems.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #fcd34d",
            borderRadius: 12,
            background: "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#92400e" }}>
            Confirm Before Buying
          </div>

          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {materialsList.confirmItems.map((item, i) => (
              <li key={`confirm-item-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {materialsList.notes.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Estimator Notes</div>

          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {materialsList.notes.map((note, i) => (
              <li key={`materials-note-${i}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}

function AreaScopeBreakdownCard({
  areaScopeBreakdown,
}: {
  areaScopeBreakdown: AreaScopeBreakdown
}) {
  if (!areaScopeBreakdown) return null

  const detectedArea = areaScopeBreakdown.detectedArea ?? {
  floorSqft: null,
  wallSqft: null,
  paintSqft: null,
  trimLf: null,
}

const allowances = areaScopeBreakdown.allowances ?? {
  prepDemo: [],
  protectionSetup: [],
  materialsDrivers: [],
  scheduleDrivers: [],
}

const missingConfirmations = areaScopeBreakdown.missingConfirmations ?? []

  return (
    <details
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
      open
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Area Scope Breakdown
      </summary>

      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Detected area quantities, production drivers, and missing confirmations used to shape pricing.
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>Detected Area</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
            marginTop: 10,
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#666" }}>Floor Sq Ft</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {detectedArea.floorSqft ?? "—"}
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#666" }}>Wall Sq Ft</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {detectedArea.wallSqft ?? "—"}
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#666" }}>Paint Sq Ft</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {detectedArea.paintSqft ?? "—"}
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#666" }}>Trim LF</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {detectedArea.trimLf ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {allowances.prepDemo.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Prep / Demo Allowances</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {allowances.prepDemo.map((item, i) => (
              <li key={`prep-demo-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {allowances.protectionSetup.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Protection / Setup Drivers</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {allowances.protectionSetup.map((item, i) => (
              <li key={`protection-setup-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {allowances.materialsDrivers.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Materials Drivers</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {allowances.materialsDrivers.map((item, i) => (
              <li key={`materials-driver-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {allowances.scheduleDrivers.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Schedule Drivers</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {allowances.scheduleDrivers.map((item, i) => (
              <li key={`schedule-driver-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {missingConfirmations.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #fcd34d",
            borderRadius: 12,
            background: "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#92400e" }}>
            Missing Confirmations
          </div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {missingConfirmations.map((item, i) => (
              <li key={`missing-confirm-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}

function ProfitProtectionCard({
  profitProtection,
}: {
  profitProtection: ProfitProtection
}) {
  if (!profitProtection) return null

  const tone =
    profitProtection.status === "danger"
      ? { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" }
      : profitProtection.status === "warning"
      ? { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" }
      : { bg: "#ecfdf5", border: "#86efac", color: "#065f46" }

  return (
    <details
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
      open
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Profit Protection
      </summary>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: `1px solid ${tone.border}`,
          borderRadius: 12,
          background: tone.bg,
          color: tone.color,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 14 }}>
          {profitProtection.status === "danger"
            ? "Margin Risk"
            : profitProtection.status === "warning"
            ? "Tight Margin"
            : "Healthy Margin"}
        </div>

        <div style={{ marginTop: 8, lineHeight: 1.6, fontSize: 13 }}>
          <div><strong>Estimated Cost:</strong> ${profitProtection.estimatedCost.toLocaleString()}</div>
          <div><strong>Contract Value:</strong> ${profitProtection.contractValue.toLocaleString()}</div>
          <div><strong>Gross Profit:</strong> ${profitProtection.grossProfit.toLocaleString()}</div>
          <div><strong>Gross Margin:</strong> {profitProtection.grossMarginPct}%</div>
          {profitProtection.minimumSafePrice != null && (
            <div><strong>Minimum Safe Price:</strong> ${profitProtection.minimumSafePrice.toLocaleString()}</div>
          )}
          {profitProtection.targetPrice25 != null && (
            <div><strong>Target Price @ 25%:</strong> ${profitProtection.targetPrice25.toLocaleString()}</div>
          )}
          {profitProtection.targetPrice30 != null && (
            <div><strong>Target Price @ 30%:</strong> ${profitProtection.targetPrice30.toLocaleString()}</div>
          )}
        </div>
      </div>

      {profitProtection.reasons.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Why this price holds</div>
          <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
            {profitProtection.reasons.map((item, i) => (
              <li key={`pp-reason-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {profitProtection.warnings.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #fcd34d",
            borderRadius: 12,
            background: "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#92400e" }}>
            Margin Warnings
          </div>
          <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
            {profitProtection.warnings.map((item, i) => (
              <li key={`pp-warning-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}

function getChangeOrderDisplayLabel(
  documentType: DocumentType,
  detection: ChangeOrderDetection | null
) {
  const treatAsChangeOrder =
    documentType === "Change Order" || detection?.isChangeOrder === true

  if (!treatAsChangeOrder) return documentType

  switch (detection?.mode) {
    case "add":
      return "Added Work Change Order"
    case "deduct":
      return "Deductive Change Order"
    case "mixed":
      return "Mixed Change Order"
    default:
      return "Change Order"
  }
}

function getChangeOrderClientNote(detection: ChangeOrderDetection | null) {
  if (!detection?.isChangeOrder) return ""

  switch (detection.mode) {
    case "add":
      return "This change order adds work beyond the original contract scope."
    case "deduct":
      return "This change order reflects a deductive change or credit to the original contract scope."
    case "mixed":
      return "This change order includes both added and deductive scope adjustments."
    default:
      return "This document reflects a change to the original contract scope."
  }
}

function getChangeOrderScheduleNote(detection: ChangeOrderDetection | null) {
  if (!detection?.scheduleImpact?.likelyChanged) return ""

  const added = detection.scheduleImpact.addedDays

  if (added == null) {
    return "This change may affect the project schedule."
  }

  if (added > 0) {
    return `This change is expected to add about ${added} crew day${added === 1 ? "" : "s"} to the schedule.`
  }

  if (added < 0) {
    const days = Math.abs(added)
    return `This change is expected to reduce the schedule by about ${days} crew day${days === 1 ? "" : "s"}.`
  }

  return ""
}

function ChangeOrderDetectorCard({
  detection,
}: {
  detection: ChangeOrderDetection | null
}) {
  if (!detection?.isChangeOrder) return null

  const modeLabel =
    detection.mode === "add"
      ? "Added Work"
      : detection.mode === "deduct"
      ? "Deductive / Credit"
      : detection.mode === "mixed"
      ? "Mixed"
      : "Unclear"

  const scheduleNote = getChangeOrderScheduleNote(detection)

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #c7d2fe",
        borderRadius: 12,
        background: "#eef2ff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 14, color: "#1e1b4b" }}>
          Change Order Detector
        </div>

        <div
          style={{
            display: "inline-flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "#fff",
              border: "1px solid #c7d2fe",
              fontSize: 12,
              fontWeight: 800,
              color: "#312e81",
            }}
          >
            {modeLabel}
          </span>

          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "#fff",
              border: "1px solid #c7d2fe",
              fontSize: 12,
              fontWeight: 800,
              color: "#312e81",
            }}
          >
            {detection.confidence.toUpperCase()} confidence
          </span>
        </div>
      </div>

      {detection.reasons.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>
            Why it was classified this way
          </div>
          <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.5 }}>
            {detection.reasons.map((reason, i) => (
              <li key={`co-reason-${i}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {scheduleNote && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            background: "#fff",
            border: "1px solid #c7d2fe",
            color: "#1e3a8a",
            fontSize: 13,
            lineHeight: 1.45,
            fontWeight: 700,
          }}
        >
          {scheduleNote}
        </div>
      )}
    </div>
  )
}

function EstimateStatusCard({
  displayedDocumentType,
  displayedChangeOrderNote,
  displayedScheduleImpactNote,
  changeOrderDetection,
  scopeSignals,
  jobPhotosCount,
  photoAnalysis,
  photoScopeAssist,
  planAssistedStatus,
  measureEnabled,
  totalSqft,
  estimateConfidence,
}: {
  displayedDocumentType: string
  displayedChangeOrderNote: string
  displayedScheduleImpactNote: string
  changeOrderDetection: ChangeOrderDetection | null
  scopeSignals: ScopeSignals
  jobPhotosCount: number
  photoAnalysis: PhotoAnalysis
  photoScopeAssist: PhotoScopeAssist
  planAssistedStatus: {
    label: string
    tone: "neutral" | "warning" | "good"
    message: string
    details: string[]
  } | null
  measureEnabled: boolean
  totalSqft: number
  hasMeasurementReference: boolean
  estimateConfidence: ReturnType<typeof buildEstimateConfidence> | null
}) {
  const hasPhotos = jobPhotosCount > 0
  const hasPhotoAssist = !!photoAnalysis || !!photoScopeAssist
  const isPhotoOnly = hasPhotos && !hasPhotoAssist
  const hasPlanSignal = !!planAssistedStatus

  const measurementsNeeded =
  (!measureEnabled || totalSqft <= 0) &&
  !hasMeasurementReference &&
  ((estimateConfidence?.score ?? 100) < 85 || hasPhotos)

  const hasMeasurementSignal = measureEnabled && totalSqft > 0

  const hasAnything =
    !!displayedChangeOrderNote ||
    !!displayedScheduleImpactNote ||
    !!changeOrderDetection?.isChangeOrder ||
    !!scopeSignals?.needsReturnVisit ||
    isPhotoOnly ||
    hasPhotoAssist ||
    hasPlanSignal ||
    measurementsNeeded ||
    hasMeasurementSignal

  if (!hasAnything) return null

  const modeLabel =
    changeOrderDetection?.mode === "add"
      ? "Added Work"
      : changeOrderDetection?.mode === "deduct"
      ? "Deductive / Credit"
      : changeOrderDetection?.mode === "mixed"
      ? "Mixed"
      : null

  const showInputSignals =
    isPhotoOnly ||
    hasPhotoAssist ||
    hasPlanSignal ||
    measurementsNeeded ||
    hasMeasurementSignal

  const planTone =
    planAssistedStatus?.tone === "good"
      ? {
          background: "#ecfdf5",
          border: "#86efac",
          color: "#065f46",
        }
      : planAssistedStatus?.tone === "warning"
        ? {
            background: "#fff7ed",
            border: "#fdba74",
            color: "#9a3412",
          }
        : {
            background: "#f9fafb",
            border: "#e5e7eb",
            color: "#374151",
          }

  return (
    <div
      style={{
        marginBottom: 14,
        padding: 14,
        border: "1px solid #dbeafe",
        borderRadius: 14,
        background: "#f8fbff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
            Estimate Status
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            What the engine decided about this document and schedule.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "#fff",
              border: "1px solid #dbeafe",
              fontSize: 12,
              fontWeight: 800,
              color: "#1d4ed8",
            }}
          >
            {displayedDocumentType}
          </span>

          {modeLabel && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#fff",
                border: "1px solid #c7d2fe",
                fontSize: 12,
                fontWeight: 800,
                color: "#4338ca",
              }}
            >
              {modeLabel}
            </span>
          )}

          {changeOrderDetection?.confidence && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#fff",
                border: "1px solid #e5e7eb",
                fontSize: 12,
                fontWeight: 800,
                color: "#374151",
              }}
            >
              {changeOrderDetection.confidence.toUpperCase()} confidence
            </span>
          )}

          {scopeSignals?.needsReturnVisit && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#fff7ed",
                border: "1px solid #fdba74",
                fontSize: 12,
                fontWeight: 800,
                color: "#9a3412",
              }}
            >
              Multiple visits likely
            </span>
          )}
        </div>
      </div>

      {showInputSignals && (
  <div
    style={{
      marginTop: 12,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      background: "#fff",
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 800, color: "#4b5563", marginBottom: 8 }}>
      Input Signals
    </div>

    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {isPhotoOnly && (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "#eff6ff",
            border: "1px solid #93c5fd",
            fontSize: 12,
            fontWeight: 800,
            color: "#1d4ed8",
          }}
        >
          Photo-only
        </span>
      )}

      {hasPhotoAssist && (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "#ecfeff",
            border: "1px solid #67e8f9",
            fontSize: 12,
            fontWeight: 800,
            color: "#155e75",
          }}
        >
          Photo-assisted
        </span>
      )}

      {planAssistedStatus && (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: planTone.background,
            border: `1px solid ${planTone.border}`,
            fontSize: 12,
            fontWeight: 800,
            color: planTone.color,
          }}
        >
          {planAssistedStatus.label}
        </span>
      )}

      {measurementsNeeded && (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "#fff7ed",
            border: "1px solid #fdba74",
            fontSize: 12,
            fontWeight: 800,
            color: "#9a3412",
          }}
        >
          Measurements needed
        </span>
      )}

      {hasMeasurementSignal && (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "#ecfdf5",
            border: "1px solid #86efac",
            fontSize: 12,
            fontWeight: 800,
            color: "#065f46",
          }}
        >
          {Math.round(totalSqft)} sq ft added
        </span>
      )}
    </div>
  </div>
)}

      {planAssistedStatus && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: `1px solid ${planTone.border}`,
            borderRadius: 12,
            background: planTone.background,
            fontSize: 13,
            lineHeight: 1.55,
            color: "#111827",
          }}
        >
          <strong>{planAssistedStatus.label}:</strong> {planAssistedStatus.message}
          {planAssistedStatus.details.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {planAssistedStatus.details.map((detail, index) => (
                <li key={`plan-assisted-status-${index}`}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(displayedChangeOrderNote ||
        displayedScheduleImpactNote ||
        scopeSignals?.reason) && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
            fontSize: 13,
            lineHeight: 1.55,
            color: "#111827",
          }}
        >
          {displayedChangeOrderNote && (
            <div>
              <strong>Classification:</strong> {displayedChangeOrderNote}
            </div>
          )}

          {displayedScheduleImpactNote && (
            <div style={{ marginTop: displayedChangeOrderNote ? 8 : 0 }}>
              <strong>Schedule Impact:</strong> {displayedScheduleImpactNote}
            </div>
          )}

          {scopeSignals?.needsReturnVisit && scopeSignals?.reason && (
            <div
              style={{
                marginTop:
                  displayedChangeOrderNote || displayedScheduleImpactNote ? 8 : 0,
              }}
            >
              <strong>Visit Logic:</strong> {scopeSignals.reason}
            </div>
          )}
        </div>
      )}

      {changeOrderDetection?.reasons?.length ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4b5563" }}>
            Engine signals
          </div>

          <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.5 }}>
            {changeOrderDetection.reasons.map((reason, i) => (
              <li key={`estimate-status-reason-${i}`}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function ReviewInsightsCard({
  estimateConfidence,
  changeOrderSummary,
  explainChangesReport,
  estimateBreakdown,
  estimateAssumptions,
}: {
  estimateConfidence: ReturnType<typeof buildEstimateConfidence> | null
  changeOrderSummary: ReturnType<typeof computeChangeOrderSummary> | null
  explainChangesReport: ReturnType<typeof explainEstimateChanges> | null
  estimateBreakdown: string[]
  estimateAssumptions: string[]
}) {
  const hasAnything =
    !!estimateConfidence ||
    !!changeOrderSummary ||
    !!explainChangesReport ||
    estimateBreakdown.length > 0 ||
    estimateAssumptions.length > 0

  if (!hasAnything) return null

  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>Review & Insights</div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Pricing logic, assumptions, confidence, and change impacts.
      </div>

      {estimateConfidence && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: `1px solid ${estimateConfidence.border}`,
            borderRadius: 12,
            background: estimateConfidence.bg,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 14,
                  color: estimateConfidence.color,
                }}
              >
                Confidence / Review Badge
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                How reliable this estimate is based on the details provided.
              </div>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: "#fff",
                border: `1px solid ${estimateConfidence.border}`,
                color: estimateConfidence.color,
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <span>{estimateConfidence.label}</span>
              <span>{estimateConfidence.score}%</span>
            </div>
          </div>

          {estimateConfidence.warnings.length > 0 && (
            <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
              {estimateConfidence.warnings.map((item, i) => (
                <li key={`confidence-warning-${i}`}>{item}</li>
              ))}
            </ul>
          )}

          {estimateConfidence.reasons.length > 0 && (
            <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
              {estimateConfidence.reasons.map((item, i) => (
                <li key={`confidence-reason-${i}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {changeOrderSummary && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            Smart Change Order Summary
          </div>

          <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
            <div>
              Original Estimate:{" "}
              <strong>${changeOrderSummary.originalEstimateTotal.toLocaleString()}</strong>
            </div>

            {!changeOrderSummary.isOriginalEstimate && (
              <div>
                This Change Order:{" "}
                <strong>${changeOrderSummary.currentEstimateTotal.toLocaleString()}</strong>
              </div>
            )}

            <div>
              Previous Contract Value:{" "}
              <strong>${changeOrderSummary.previousContractValue.toLocaleString()}</strong>
            </div>

            <div>
              New Contract Value:{" "}
              <strong>${changeOrderSummary.newContractValue.toLocaleString()}</strong>
            </div>

            <div>
              Cost Change: <strong>{formatDelta(changeOrderSummary.costDelta)}</strong>
            </div>

            <div>
              Crew-Day Change:{" "}
              <strong>{formatSignedNumber(changeOrderSummary.crewDayDelta)}</strong>
            </div>
          </div>
        </div>
      )}

      {explainChangesReport && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Explain Changes</div>

          {explainChangesReport.summary.length > 0 && (
            <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
              {explainChangesReport.summary.map((item, i) => (
                <li key={`summary-${i}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {estimateBreakdown.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Explain My Estimate</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {estimateBreakdown.map((item, i) => (
              <li key={`estimate-breakdown-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {estimateAssumptions.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            Assumptions & Review Notes
          </div>

          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {estimateAssumptions.map((item, i) => (
              <li key={`estimate-assumption-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EstimateSectionsCard({
  estimateRows,
  estimateEmbeddedBurdens,
  estimateSections,
}: {
  estimateRows: EstimateRow[] | null
  estimateEmbeddedBurdens: EstimateEmbeddedBurden[] | null
  estimateSections: EstimateStructuredSection[] | null
}) {
  const {
    estimateRows: resolvedEstimateRows,
    estimateEmbeddedBurdens: resolvedEstimateEmbeddedBurdens,
  } = resolveCanonicalEstimateOutput({
    estimateRows,
    estimateEmbeddedBurdens,
    estimateSections,
  })
  const rows = resolvedEstimateRows ?? []
  const burdens = resolvedEstimateEmbeddedBurdens ?? []
  if (rows.length === 0 && burdens.length === 0) return null

  const hasMultipleTrades =
    new Set(
      [...rows, ...burdens]
        .map((section) => section.trade.trim().toLowerCase())
        .filter(Boolean)
    ).size > 1

  const sectionTotal = rows.reduce(
    (sum, section) => sum + Number(section.amount || 0),
    0
  )

  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>Estimate Rows</div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Direct section rows come from the winning estimate basis. Embedded burden
        items remain included in the total, but are not standalone priced scope lines.
      </div>

      {rows.length > 0 ? (
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ fontSize: 12, color: "#555" }}>
            <th style={{ textAlign: "left", padding: "8px 6px" }}>Row</th>
            <th style={{ textAlign: "left", padding: "8px 6px" }}>Quantity</th>
            <th style={{ textAlign: "right", padding: "8px 6px" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((section, index) => {
            const quantityLabel =
              section.quantity != null && section.unit
                ? `${section.quantity.toLocaleString()} ${section.unit}`
                : "—"

            const label = hasMultipleTrades && section.trade
              ? `${section.trade}: ${section.label}`
              : section.label

            const notes =
              section.notes.length > 0 ? section.notes.join(" • ") : null

            return (
              <tr
                key={`${section.trade}-${section.section}-${index}`}
                style={{
                  borderTop: "1px solid #e5e7eb",
                  background: "#fff",
                }}
              >
                <td style={{ padding: "10px 6px", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700 }}>{label}</div>
                  {notes ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                      {notes}
                    </div>
                  ) : null}
                </td>
                <td style={{ padding: "10px 6px", verticalAlign: "top" }}>
                  {quantityLabel}
                </td>
                <td
                  style={{
                    padding: "10px 6px",
                    textAlign: "right",
                    verticalAlign: "top",
                    fontWeight: 700,
                  }}
                >
                  {money(section.amount)}
                </td>
              </tr>
            )
          })}
          <tr style={{ borderTop: "2px solid #111" }}>
            <td
              colSpan={3}
              style={{ padding: "10px 6px", fontWeight: 800, textAlign: "right" }}
            >
              Structured section total
            </td>
            <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 800 }}>
              {money(sectionTotal)}
            </td>
          </tr>
        </tbody>
      </table>
      ) : null}

      {burdens.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13 }}>Embedded burden reference</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            {burdens.map((section, index) => {
              const label = hasMultipleTrades && section.trade
                ? `${section.trade}: ${section.label}`
                : section.label
              const noteText = section.notes.length > 0 ? ` — ${section.notes.join(" • ")}` : ""

              return (
                <li key={`${section.trade}-${section.section}-burden-${index}`}>
                  <strong>{label}</strong>: {money(section.amount)} ({getEstimateSectionTreatmentLabel(section)})
                  {noteText}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function AdvancedAnalysisSection({
  photoAnalysis,
  photoScopeAssist,
  planIntelligence,
  estimateSkeletonHandoff,
  estimateStructureConsumption,
  materialsList,
  areaScopeBreakdown,
  profitProtection,
  scopeXRay,
  missedScopeDetector,
  profitLeakDetector,
  estimateDefenseMode,
  tradePricingPrepAnalysis,
  estimateConfidence,
  changeOrderSummary,
  explainChangesReport,
  estimateBreakdown,
  estimateAssumptions,
}: {
  photoAnalysis: PhotoAnalysis
  photoScopeAssist: PhotoScopeAssist
  planIntelligence: PlanIntelligence
  estimateSkeletonHandoff: PlanEstimateSkeletonHandoff
  estimateStructureConsumption: PlanEstimateStructureConsumption
  materialsList: MaterialsList
  areaScopeBreakdown: AreaScopeBreakdown
  profitProtection: ProfitProtection
  scopeXRay: ScopeXRay
  missedScopeDetector: MissedScopeDetector
  profitLeakDetector: ProfitLeakDetector
  estimateDefenseMode: EstimateDefenseMode
  tradePricingPrepAnalysis: TradePricingPrepAnalysis
  estimateConfidence: ReturnType<typeof buildEstimateConfidence> | null
  changeOrderSummary: ReturnType<typeof computeChangeOrderSummary> | null
  explainChangesReport: ReturnType<typeof explainEstimateChanges> | null
  estimateBreakdown: string[]
  estimateAssumptions: string[]
}) {
  const hasReviewInsights =
    !!estimateConfidence ||
    !!changeOrderSummary ||
    !!explainChangesReport ||
    estimateBreakdown.length > 0 ||
    estimateAssumptions.length > 0

  const hasAnything =
    !!photoAnalysis ||
    !!photoScopeAssist ||
    !!planIntelligence ||
    !!estimateSkeletonHandoff ||
    !!estimateStructureConsumption ||
    !!materialsList ||
    !!areaScopeBreakdown ||
    !!profitProtection ||
    !!scopeXRay ||
    !!missedScopeDetector ||
    !!profitLeakDetector ||
    !!estimateDefenseMode ||
    !!tradePricingPrepAnalysis ||
    hasReviewInsights

  if (!hasAnything) return null

  return (
    <details
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        background: "#fff",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Advanced Analysis
      </summary>

      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Deep-dive diagnostics, scope logic, material planning, and estimator review tools.
      </div>

      {(photoAnalysis || photoScopeAssist) && (
        <PhotoIntelligenceCard
          photoAnalysis={photoAnalysis}
          photoScopeAssist={photoScopeAssist}
        />
      )}

      {planIntelligence && (
        <PlanIntelligenceCard planIntelligence={planIntelligence} />
      )}

      {estimateSkeletonHandoff && (
        <EstimateSkeletonHandoffCard
          estimateSkeletonHandoff={estimateSkeletonHandoff}
        />
      )}

      {estimateStructureConsumption && (
        <EstimateStructureConsumptionCard
          estimateStructureConsumption={estimateStructureConsumption}
        />
      )}

      {tradePricingPrepAnalysis && (
        <TradePricingPrepAnalysisCard
          tradePricingPrepAnalysis={tradePricingPrepAnalysis}
        />
      )}

      {scopeXRay && <ScopeXRayCard scopeXRay={scopeXRay} />}
      <TierAIntelligenceCard
        missedScopeDetector={missedScopeDetector}
        profitLeakDetector={profitLeakDetector}
        estimateDefenseMode={estimateDefenseMode}
      />
      {materialsList && <MaterialsListCard materialsList={materialsList} />}
      {areaScopeBreakdown && (
        <AreaScopeBreakdownCard areaScopeBreakdown={areaScopeBreakdown} />
      )}
      {profitProtection && (
        <ProfitProtectionCard profitProtection={profitProtection} />
      )}

      <ReviewInsightsCard
        estimateConfidence={estimateConfidence}
        changeOrderSummary={changeOrderSummary}
        explainChangesReport={explainChangesReport}
        estimateBreakdown={estimateBreakdown}
        estimateAssumptions={estimateAssumptions}
      />
    </details>
  )
}

function TradePricingPrepAnalysisCard({
  tradePricingPrepAnalysis,
}: {
  tradePricingPrepAnalysis: TradePricingPrepAnalysis
}) {
  if (!tradePricingPrepAnalysis) return null

  const {
    trade,
    supportLevel,
    tradeEstimateGroupingNotes,
    tradePricingPrepSummary,
    tradeReviewActions,
    tradeAnalysisSignals,
  } = tradePricingPrepAnalysis

  const SectionList = ({
    title,
    items,
    tone = "neutral",
  }: {
    title: string
    items: string[]
    tone?: "neutral" | "warning" | "info"
  }) => {
    if (items.length === 0) return null

    const styles =
      tone === "warning"
        ? { bg: "#fff7ed", border: "#fdba74" }
        : tone === "info"
        ? { bg: "#eff6ff", border: "#93c5fd" }
        : { bg: "#fafafa", border: "#e5e7eb" }

    return (
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#374151",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </div>

        <div
          style={{
            padding: 12,
            border: `1px solid ${styles.border}`,
            borderRadius: 12,
            background: styles.bg,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {items.map((item, index) => (
              <li key={`${title}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
            Trade Pricing Prep
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Backend trade-package guidance for estimate organization and review only.
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: supportLevel === "weak" ? "#fff7ed" : "#eff6ff",
            color: supportLevel === "weak" ? "#9a3412" : "#1d4ed8",
            textTransform: "capitalize",
          }}
        >
          {trade} · {supportLevel}
        </div>
      </div>

      <SectionList
        title="Pricing Prep Summary"
        items={tradePricingPrepSummary}
        tone={supportLevel === "weak" ? "warning" : "info"}
      />
      <SectionList
        title="Estimate Grouping Notes"
        items={tradeEstimateGroupingNotes}
        tone="neutral"
      />
      <SectionList
        title="Review Actions"
        items={tradeReviewActions}
        tone="warning"
      />
      <SectionList
        title="Analysis Signals"
        items={tradeAnalysisSignals}
        tone="info"
      />
    </div>
  )
}

function EstimateSkeletonHandoffCard({
  estimateSkeletonHandoff,
}: {
  estimateSkeletonHandoff: PlanEstimateSkeletonHandoff
}) {
  if (!estimateSkeletonHandoff) return null

  const {
    estimatorBucketGuidance,
    estimatorBucketDrafts,
    estimatorSectionSkeletons,
    bucketScopeDrafts,
    bucketAllowanceFlags,
    bucketHandoffNotes,
    estimateStructureHandoffSummary,
  } = estimateSkeletonHandoff

  const hasAnything =
    estimatorBucketGuidance.length > 0 ||
    estimatorBucketDrafts.length > 0 ||
    estimatorSectionSkeletons.length > 0 ||
    bucketScopeDrafts.length > 0 ||
    bucketAllowanceFlags.length > 0 ||
    bucketHandoffNotes.length > 0 ||
    !!estimateStructureHandoffSummary

  if (!hasAnything) return null

  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
        Estimate Skeleton Handoff
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Plan-derived bucket scaffolding for estimator organization.
      </div>

      {estimateStructureHandoffSummary && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #dbeafe",
            borderRadius: 12,
            background: "#f8fbff",
            lineHeight: 1.55,
            fontSize: 13,
          }}
        >
          {estimateStructureHandoffSummary}
        </div>
      )}

      {estimatorBucketGuidance.length > 0 && (
        <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.6 }}>
          {estimatorBucketGuidance.map((item, index) => (
            <li key={`estimator-bucket-guidance-${index}`}>{item}</li>
          ))}
        </ul>
      )}

      {estimatorBucketDrafts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {estimatorBucketDrafts.map((bucket, index) => (
            <div
              key={`estimator-bucket-draft-${index}`}
              style={{
                marginTop: index === 0 ? 0 : 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                {bucket.bucketName}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {bucket.bucketRole} · {bucket.allowanceReviewStatus.replaceAll("_", " ")}
              </div>
              {bucket.likelyTradeCoverage.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Trade coverage:</strong> {bucket.likelyTradeCoverage.join(", ")}
                </div>
              )}
              {bucket.likelyScopeBasis.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
                  {bucket.likelyScopeBasis.map((item, basisIndex) => (
                    <li key={`bucket-basis-${index}-${basisIndex}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {estimatorSectionSkeletons.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Section Skeletons
          </div>
          {estimatorSectionSkeletons.map((section, index) => (
            <div
              key={`estimator-section-skeleton-${index}`}
              style={{
                marginTop: index === 0 ? 0 : 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background:
                  section.sectionReadiness === "section_anchor" ? "#f8fbff" : "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>{section.sectionTitle}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {section.trade} · {section.sectionReadiness.replaceAll("_", " ")} ·{" "}
                {section.supportType.replaceAll("_", " ")}
              </div>
              {section.quantityAnchor && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Quantity anchor:</strong> {section.quantityAnchor}
                </div>
              )}
              {section.scopeBullets.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
                  {section.scopeBullets.map((item, basisIndex) => (
                    <li key={`section-skeleton-bullet-${index}-${basisIndex}`}>{item}</li>
                  ))}
                </ul>
              )}
              {section.cautionNotes.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8, color: "#92400e" }}>
                  <strong>Cautions:</strong> {section.cautionNotes.join(" ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {bucketScopeDrafts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Scope Drafts
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {bucketScopeDrafts.map((item, index) => (
              <li key={`bucket-scope-draft-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {bucketAllowanceFlags.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Allowance Flags
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {bucketAllowanceFlags.map((item, index) => (
              <li key={`bucket-allowance-flag-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {bucketHandoffNotes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Handoff Notes
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {bucketHandoffNotes.map((item, index) => (
              <li key={`bucket-handoff-note-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EstimateStructureConsumptionCard({
  estimateStructureConsumption,
}: {
  estimateStructureConsumption: PlanEstimateStructureConsumption
}) {
  if (!estimateStructureConsumption) return null

  const {
    structuredEstimateBuckets,
    structuredEstimateSections,
    structuredTradeInputAssemblies,
    estimateGroupingSignals,
    estimateReviewBuckets,
    estimateStructureNotes,
  } = estimateStructureConsumption

  const hasAnything =
    structuredEstimateBuckets.length > 0 ||
    structuredEstimateSections.length > 0 ||
    structuredTradeInputAssemblies.length > 0 ||
    estimateGroupingSignals.length > 0 ||
    estimateReviewBuckets.length > 0 ||
    estimateStructureNotes.length > 0

  if (!hasAnything) return null

  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
        Estimate Structure Consumption
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        How the plan-derived scaffold can be used safely in estimate organization.
      </div>

      {estimateGroupingSignals.length > 0 && (
        <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.6 }}>
          {estimateGroupingSignals.map((item, index) => (
            <li key={`estimate-grouping-signal-${index}`}>{item}</li>
          ))}
        </ul>
      )}

      {structuredEstimateBuckets.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {structuredEstimateBuckets.map((bucket, index) => (
            <div
              key={`structured-estimate-bucket-${index}`}
              style={{
                marginTop: index === 0 ? 0 : 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: bucket.safeForPrimaryStructure ? "#f8fbff" : "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                {bucket.bucketName}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {bucket.bucketRole} · {bucket.safeForPrimaryStructure ? "primary-safe" : "review-oriented"}
              </div>
              {bucket.likelyTradeCoverage.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Trade coverage:</strong> {bucket.likelyTradeCoverage.join(", ")}
                </div>
              )}
              {bucket.likelyScopeBasis.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
                  {bucket.likelyScopeBasis.map((item, basisIndex) => (
                    <li key={`structure-basis-${index}-${basisIndex}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {structuredEstimateSections.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Structured Estimate Sections
          </div>
          {structuredEstimateSections.map((section, index) => (
            <div
              key={`structured-estimate-section-${index}`}
              style={{
                marginTop: index === 0 ? 0 : 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: section.safeForSectionBuild ? "#f8fbff" : "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>{section.sectionTitle}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {section.trade} · {section.safeForSectionBuild ? "section-build safe" : "review oriented"} ·{" "}
                {section.supportType.replaceAll("_", " ")} ·{" "}
                {section.quantityNormalization.replaceAll("_", " ")}
              </div>
              {section.quantityAnchor && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Quantity anchor:</strong> {section.quantityAnchor}
                </div>
              )}
              {section.tradeMeasurementDrafts.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Measurement drafts:</strong> {section.tradeMeasurementDrafts.join(" ")}
                </div>
              )}
              {section.normalizedEstimatorInputCandidates.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Estimator input candidates:</strong>{" "}
                  {section.normalizedEstimatorInputCandidates.join(" ")}
                </div>
              )}
              {section.scopeBullets.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
                  {section.scopeBullets.map((item, basisIndex) => (
                    <li key={`structured-section-bullet-${index}-${basisIndex}`}>{item}</li>
                  ))}
                </ul>
              )}
              {section.cautionNotes.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8, color: "#92400e" }}>
                  <strong>Cautions:</strong> {section.cautionNotes.join(" ")}
                </div>
              )}
              {section.estimatorInputGuardrails.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8, color: "#7c2d12" }}>
                  <strong>Guardrails:</strong> {section.estimatorInputGuardrails.join(" ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {structuredTradeInputAssemblies.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Trade Assemblies
          </div>
          {structuredTradeInputAssemblies.map((assembly, index) => (
            <div
              key={`structured-trade-assembly-${index}`}
              style={{
                marginTop: index === 0 ? 0 : 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>{assembly.trade}</div>
              {assembly.primaryCandidate && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Primary:</strong> {assembly.primaryCandidate.sectionTitle}
                </div>
              )}
              {assembly.secondaryCandidates.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Secondary:</strong>{" "}
                  {assembly.secondaryCandidates.map((candidate) => candidate.sectionTitle).join(", ")}
                </div>
              )}
              {assembly.reviewCandidates.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>Review-only:</strong>{" "}
                  {assembly.reviewCandidates.map((candidate) => candidate.sectionTitle).join(", ")}
                </div>
              )}
              {assembly.assemblyNotes.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.5 }}>
                  {assembly.assemblyNotes.map((item, noteIndex) => (
                    <li key={`trade-assembly-note-${index}-${noteIndex}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {estimateReviewBuckets.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Review Buckets
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {estimateReviewBuckets.map((item, index) => (
              <li key={`estimate-review-bucket-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {estimateStructureNotes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Structure Notes
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {estimateStructureNotes.map((item, index) => (
              <li key={`estimate-structure-note-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PlanIntelligenceCard({
  planIntelligence,
}: {
  planIntelligence: PlanIntelligence
}) {
  if (!planIntelligence) return null

  const detectedRooms = Array.isArray(planIntelligence.detectedRooms)
    ? Array.from(new Set(planIntelligence.detectedRooms.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const detectedTrades = Array.isArray(planIntelligence.detectedTrades)
    ? Array.from(new Set(planIntelligence.detectedTrades.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const sheetRoleSignals = Array.isArray(planIntelligence.sheetRoleSignals)
    ? Array.from(new Set(planIntelligence.sheetRoleSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const prototypeSignals = Array.isArray(planIntelligence.prototypeSignals)
    ? Array.from(new Set(planIntelligence.prototypeSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const repeatScalingSignals = Array.isArray(planIntelligence.repeatScalingSignals)
    ? Array.from(new Set(planIntelligence.repeatScalingSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const packageGroupingSignals = Array.isArray(planIntelligence.packageGroupingSignals)
    ? Array.from(new Set(planIntelligence.packageGroupingSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const bidStrategyNotes = Array.isArray(planIntelligence.bidStrategyNotes)
    ? Array.from(new Set(planIntelligence.bidStrategyNotes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const highValueSheetSignals = Array.isArray(planIntelligence.highValueSheetSignals)
    ? Array.from(new Set(planIntelligence.highValueSheetSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const pricingAnchorSignals = Array.isArray(planIntelligence.pricingAnchorSignals)
    ? Array.from(new Set(planIntelligence.pricingAnchorSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const bidCoverageGaps = Array.isArray(planIntelligence.bidCoverageGaps)
    ? Array.from(new Set(planIntelligence.bidCoverageGaps.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const estimatingPrioritySignals = Array.isArray(planIntelligence.estimatingPrioritySignals)
    ? Array.from(new Set(planIntelligence.estimatingPrioritySignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const bidExecutionNotes = Array.isArray(planIntelligence.bidExecutionNotes)
    ? Array.from(new Set(planIntelligence.bidExecutionNotes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const pricingPackageSignals = Array.isArray(planIntelligence.pricingPackageSignals)
    ? Array.from(new Set(planIntelligence.pricingPackageSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const prototypePackageSignals = Array.isArray(planIntelligence.prototypePackageSignals)
    ? Array.from(new Set(planIntelligence.prototypePackageSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const packageScopeCandidates = Array.isArray(planIntelligence.packageScopeCandidates)
    ? Array.from(new Set(planIntelligence.packageScopeCandidates.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const packageScalingGuidance = Array.isArray(planIntelligence.packageScalingGuidance)
    ? Array.from(new Set(planIntelligence.packageScalingGuidance.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const packageConfidenceNotes = Array.isArray(planIntelligence.packageConfidenceNotes)
    ? Array.from(new Set(planIntelligence.packageConfidenceNotes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const estimatingFrameworkNotes = Array.isArray(planIntelligence.estimatingFrameworkNotes)
    ? Array.from(new Set(planIntelligence.estimatingFrameworkNotes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const estimateStructureSignals = Array.isArray(planIntelligence.estimateStructureSignals)
    ? Array.from(new Set(planIntelligence.estimateStructureSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const estimatePackageCandidates = Array.isArray(planIntelligence.estimatePackageCandidates)
    ? Array.from(new Set(planIntelligence.estimatePackageCandidates.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const packageTradeScopeSignals = Array.isArray(planIntelligence.packageTradeScopeSignals)
    ? Array.from(new Set(planIntelligence.packageTradeScopeSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const packagePricingBasisSignals = Array.isArray(planIntelligence.packagePricingBasisSignals)
    ? Array.from(new Set(planIntelligence.packagePricingBasisSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const packageAllowanceSignals = Array.isArray(planIntelligence.packageAllowanceSignals)
    ? Array.from(new Set(planIntelligence.packageAllowanceSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const estimateAssemblyGuidance = Array.isArray(planIntelligence.estimateAssemblyGuidance)
    ? Array.from(new Set(planIntelligence.estimateAssemblyGuidance.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const estimateScaffoldNotes = Array.isArray(planIntelligence.estimateScaffoldNotes)
    ? Array.from(new Set(planIntelligence.estimateScaffoldNotes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const repeatedSpaceSignals = Array.isArray(planIntelligence.repeatedSpaceSignals)
    ? Array.from(new Set(planIntelligence.repeatedSpaceSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const likelyRoomTypes = Array.isArray(planIntelligence.likelyRoomTypes)
    ? Array.from(new Set(planIntelligence.likelyRoomTypes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 8)
    : []
  const scalableScopeSignals = Array.isArray(planIntelligence.scalableScopeSignals)
    ? Array.from(new Set(planIntelligence.scalableScopeSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const tradePackageSignals = Array.isArray(planIntelligence.tradePackageSignals)
    ? Array.from(new Set(planIntelligence.tradePackageSignals.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const bidAssistNotes = Array.isArray(planIntelligence.bidAssistNotes)
    ? Array.from(new Set(planIntelligence.bidAssistNotes.map((x) => String(x).trim()).filter(Boolean))).slice(0, 6)
    : []
  const missingScopeFlags = Array.isArray(planIntelligence.scopeAssist?.missingScopeFlags)
    ? Array.from(
        new Set(planIntelligence.scopeAssist.missingScopeFlags.map((x) => String(x).trim()).filter(Boolean))
      ).slice(0, 8)
    : []
  const suggestedAdditions = Array.isArray(planIntelligence.scopeAssist?.suggestedAdditions)
    ? Array.from(
        new Set(planIntelligence.scopeAssist.suggestedAdditions.map((x) => String(x).trim()).filter(Boolean))
      ).slice(0, 8)
    : []
  const estimatorPackages = Array.isArray(planIntelligence.estimatorPackages)
    ? planIntelligence.estimatorPackages.slice(0, 6)
    : []
  const planReadback = planIntelligence.planReadback

  const hasAnything =
    !!planIntelligence.summary ||
    !!planReadback?.headline ||
    detectedRooms.length > 0 ||
    detectedTrades.length > 0 ||
    sheetRoleSignals.length > 0 ||
    prototypeSignals.length > 0 ||
    repeatScalingSignals.length > 0 ||
    packageGroupingSignals.length > 0 ||
    bidStrategyNotes.length > 0 ||
    highValueSheetSignals.length > 0 ||
    pricingAnchorSignals.length > 0 ||
    bidCoverageGaps.length > 0 ||
    estimatingPrioritySignals.length > 0 ||
    bidExecutionNotes.length > 0 ||
    pricingPackageSignals.length > 0 ||
    prototypePackageSignals.length > 0 ||
    packageScopeCandidates.length > 0 ||
    packageScalingGuidance.length > 0 ||
    packageConfidenceNotes.length > 0 ||
    estimatingFrameworkNotes.length > 0 ||
    estimateStructureSignals.length > 0 ||
    estimatePackageCandidates.length > 0 ||
    packageTradeScopeSignals.length > 0 ||
    packagePricingBasisSignals.length > 0 ||
    packageAllowanceSignals.length > 0 ||
    estimateAssemblyGuidance.length > 0 ||
    estimateScaffoldNotes.length > 0 ||
    repeatedSpaceSignals.length > 0 ||
    likelyRoomTypes.length > 0 ||
    scalableScopeSignals.length > 0 ||
    tradePackageSignals.length > 0 ||
    bidAssistNotes.length > 0 ||
    estimatorPackages.length > 0 ||
    missingScopeFlags.length > 0 ||
    suggestedAdditions.length > 0

  if (!hasAnything) return null

  const SectionList = ({
    title,
    items,
    tone = "neutral",
  }: {
    title: string
    items: string[]
    tone?: "neutral" | "warning" | "info"
  }) => {
    if (items.length === 0) return null

    const styles =
      tone === "warning"
        ? { bg: "#fff7ed", border: "#fdba74" }
        : tone === "info"
        ? { bg: "#eff6ff", border: "#93c5fd" }
        : { bg: "#fafafa", border: "#e5e7eb" }

    return (
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#374151",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </div>

        <div
          style={{
            padding: 12,
            border: `1px solid ${styles.border}`,
            borderRadius: 12,
            background: styles.bg,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {items.map((item, index) => (
              <li key={`${title}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const PackageCards = ({
    packages,
  }: {
    packages: NonNullable<PlanIntelligence>["estimatorPackages"]
  }) => {
    if (!packages || packages.length === 0) return null

    return (
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#374151",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Estimator-Ready Packages
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {packages.map((pkg) => (
            <div
              key={pkg.key}
              style={{
                padding: 12,
                border: "1px solid #dbeafe",
                borderRadius: 12,
                background: "#f8fbff",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{pkg.title}</div>
              <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                {pkg.supportType.replace(/_/g, " ")} • {pkg.scopeBreadth} scope • {pkg.confidenceLabel} confidence
                {pkg.roomGroup ? ` • ${pkg.roomGroup}` : ""}
              </div>
              {pkg.quantitySummary && (
                <div style={{ fontSize: 12, color: "#1f2937", marginTop: 6 }}>
                  Quantity basis: {pkg.quantitySummary}
                </div>
              )}
              {pkg.scheduleSummary && (
                <div style={{ fontSize: 12, color: "#1f2937", marginTop: 4 }}>
                  Schedule support: {pkg.scheduleSummary}
                </div>
              )}
              {pkg.executionNotes.length > 0 && (
                <div style={{ fontSize: 12, color: "#1f2937", marginTop: 6 }}>
                  Execution: {pkg.executionNotes[0]}
                </div>
              )}
              {pkg.cautionNotes.length > 0 && (
                <div style={{ fontSize: 12, color: "#92400e", marginTop: 4 }}>
                  Caution: {pkg.cautionNotes[0]}
                </div>
              )}
              {pkg.evidence.length > 0 && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Sources: {Array.from(new Set(pkg.evidence.map((ref) => `${ref.sheetNumber || `Page ${ref.pageNumber}`} / source page ${ref.sourcePageNumber}`))).slice(0, 3).join("; ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const sourceText = (evidence: PlanEstimatorPackageView["evidence"]) =>
    evidence.length > 0
      ? Array.from(
          new Set(
            evidence.map((ref) =>
              `${ref.sheetNumber || ref.sheetTitle || `Page ${ref.pageNumber}`} / source page ${ref.sourcePageNumber}`
            )
          )
        )
          .slice(0, 3)
          .join("; ")
      : ""

  const ReadbackList = ({
    title,
    items,
    tone = "neutral",
  }: {
    title: string
    items: Array<{ text: string; evidence: PlanEstimatorPackageView["evidence"] }>
    tone?: "neutral" | "warning" | "info"
  }) => {
    if (items.length === 0) return null
    const styles =
      tone === "warning"
        ? { bg: "#fff7ed", border: "#fdba74" }
        : tone === "info"
        ? { bg: "#eff6ff", border: "#93c5fd" }
        : { bg: "#fafafa", border: "#e5e7eb" }

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {items.slice(0, 6).map((item, index) => (
            <div
              key={`${title}-${index}`}
              style={{
                padding: 10,
                border: `1px solid ${styles.border}`,
                borderRadius: 10,
                background: styles.bg,
                fontSize: 12,
                lineHeight: 1.5,
                color: "#1f2937",
              }}
            >
              <div>{item.text}</div>
              {sourceText(item.evidence) && (
                <div style={{ marginTop: 4, color: "#6b7280" }}>
                  Sources: {sourceText(item.evidence)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const PlanReadbackPanel = ({
    readback,
  }: {
    readback: NonNullable<PlanIntelligence>["planReadback"]
  }) => {
    if (!readback) return null

    return (
      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: "1px solid #bae6fd",
          borderRadius: 12,
          background: "#f0f9ff",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }}>
          Plan Readback
        </div>
        <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.55, marginTop: 6 }}>
          {readback.headline}
        </div>

        {readback.estimatorFlowReadback.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Estimator Review Flow
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {readback.estimatorFlowReadback.slice(0, 7).map((step, index) => (
                <div
                  key={`estimator-flow-${step.stepKey}`}
                  style={{
                    padding: 10,
                    border: "1px solid #dbeafe",
                    borderRadius: 8,
                    background: "#fff",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#1f2937",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827" }}>
                    {index + 1}. {step.title} - {step.supportLevel} support
                  </div>
                  <div style={{ marginTop: 3 }}>{step.narration}</div>
                  {sourceText(step.evidence) && (
                    <div style={{ marginTop: 4, color: "#6b7280" }}>
                      Sources: {sourceText(step.evidence)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {readback.sheetNarration.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Selected Sheet Narration
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {readback.sheetNarration.slice(0, 6).map((sheet, index) => (
                <div
                  key={`sheet-readback-${index}`}
                  style={{
                    padding: 10,
                    border: "1px solid #dbeafe",
                    borderRadius: 10,
                    background: "#fff",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div>{sheet.narration}</div>
                  <div style={{ marginTop: 4, color: "#6b7280" }}>
                    Source page {sheet.sourcePageNumber} • {sheet.supportLevel} support
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ReadbackList
          title="Directly Supported"
          items={readback.directlySupported}
          tone="info"
        />
        <ReadbackList
          title="Reinforced By Cross-Sheet Support"
          items={readback.reinforcedByCrossSheet}
          tone="neutral"
        />
        <ReadbackList
          title="Still Needs Confirmation"
          items={readback.needsConfirmation}
          tone="warning"
        />

        {readback.scopeGapReadback.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Estimator Confirmation / Scope Gaps
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {readback.scopeGapReadback.slice(0, 8).map((gap) => {
                const isRisk = gap.status === "risky_assumption" || gap.status === "missing_or_incomplete"
                return (
                  <div
                    key={`scope-gap-${gap.gapKey}`}
                    style={{
                      padding: 10,
                      border: `1px solid ${isRisk ? "#fdba74" : "#dbeafe"}`,
                      borderRadius: 8,
                      background: isRisk ? "#fff7ed" : "#fff",
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "#1f2937",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#111827" }}>
                      {gap.title} - {gap.status.replace(/_/g, " ")}
                    </div>
                    <div style={{ marginTop: 3 }}>{gap.narration}</div>
                    <div style={{ marginTop: 5, color: isRisk ? "#92400e" : "#1d4ed8" }}>
                      Confirm: {gap.confirmationPrompt}
                    </div>
                    {(gap.trades.length > 0 || gap.areaGroups.length > 0) && (
                      <div style={{ marginTop: 4, color: "#4b5563" }}>
                        {gap.trades.length > 0 ? `Trades: ${gap.trades.slice(0, 4).join(", ")}` : ""}
                        {gap.trades.length > 0 && gap.areaGroups.length > 0 ? " - " : ""}
                        {gap.areaGroups.length > 0 ? `Areas: ${gap.areaGroups.slice(0, 4).join(", ")}` : ""}
                      </div>
                    )}
                    {sourceText(gap.evidence) && (
                      <div style={{ marginTop: 4, color: "#6b7280" }}>
                        Sources: {sourceText(gap.evidence)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {readback.groupedScopeReadback.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Cross-Trade Scope Groups
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {readback.groupedScopeReadback.slice(0, 6).map((group) => (
                <div
                  key={`grouped-scope-${group.groupKey}`}
                  style={{
                    padding: 10,
                    border: "1px solid #dbeafe",
                    borderRadius: 10,
                    background: "#fff",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#1f2937",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827" }}>
                    {group.title} • {group.role} • {group.supportLevel} support
                  </div>
                  <div style={{ marginTop: 3 }}>{group.narration}</div>
                  {group.trades.length > 0 && (
                    <div style={{ marginTop: 4, color: "#4b5563" }}>
                      Trades: {group.trades.slice(0, 5).join(", ")}
                    </div>
                  )}
                  {group.areaGroups.length > 0 && (
                    <div style={{ marginTop: 2, color: "#4b5563" }}>
                      Areas: {group.areaGroups.slice(0, 5).join(", ")}
                    </div>
                  )}
                  {[...group.directSupport.slice(0, 3), ...group.reinforcedSupport.slice(0, 2)].length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {[...group.directSupport.slice(0, 3), ...group.reinforcedSupport.slice(0, 2)].map((item, index) => (
                        <li key={`grouped-scope-line-${group.groupKey}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {group.confirmationNotes.length > 0 && (
                    <div style={{ marginTop: 6, color: "#92400e" }}>
                      {group.confirmationNotes.slice(0, 2).join(" ")}
                    </div>
                  )}
                  {sourceText(group.evidence) && (
                    <div style={{ marginTop: 4, color: "#6b7280" }}>
                      Sources: {sourceText(group.evidence)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {readback.areaQuantityReadback.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Room / Area Quantity Readback
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {readback.areaQuantityReadback.slice(0, 6).map((area) => (
                <div
                  key={`area-quantity-${area.areaType}-${area.areaGroup}`}
                  style={{
                    padding: 10,
                    border: "1px solid #dbeafe",
                    borderRadius: 10,
                    background: "#fff",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#1f2937",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827" }}>{area.areaGroup}</div>
                  <div style={{ marginTop: 3 }}>{area.narration}</div>
                  {area.quantityNarration.length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {area.quantityNarration.slice(0, 4).map((item, index) => (
                        <li key={`area-quantity-line-${area.areaGroup}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {area.scopeNotes.length > 0 && (
                    <div style={{ marginTop: 6, color: "#92400e" }}>
                      {area.scopeNotes.slice(0, 2).join(" ")}
                    </div>
                  )}
                  <div style={{ marginTop: 4, color: "#6b7280" }}>
                    {area.supportLevel} support{sourceText(area.evidence) ? ` • Sources: ${sourceText(area.evidence)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {readback.tradeScopeReadback.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Trade-By-Trade Readback
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {readback.tradeScopeReadback.slice(0, 8).map((trade) => (
                <div
                  key={`trade-scope-${trade.trade}`}
                  style={{
                    padding: 10,
                    border: "1px solid #dbeafe",
                    borderRadius: 10,
                    background: "#fff",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#1f2937",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827" }}>
                    {trade.trade} • {trade.role} • {trade.supportLevel} support
                  </div>
                  <div style={{ marginTop: 3 }}>{trade.narration}</div>
                  {trade.areaGroups.length > 0 && (
                    <div style={{ marginTop: 4, color: "#4b5563" }}>
                      Areas: {trade.areaGroups.slice(0, 4).join(", ")}
                    </div>
                  )}
                  {trade.phaseTypes.length > 0 && (
                    <div style={{ marginTop: 2, color: "#4b5563" }}>
                      Scope type: {trade.phaseTypes.slice(0, 4).map((item) => item.replace(/_/g, " ")).join(", ")}
                    </div>
                  )}
                  {[...trade.quantityNarration.slice(0, 3), ...trade.supportNarration.slice(0, 2)].length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {[...trade.quantityNarration.slice(0, 3), ...trade.supportNarration.slice(0, 2)].map((item, index) => (
                        <li key={`trade-scope-line-${trade.trade}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {trade.confirmationNotes.length > 0 && (
                    <div style={{ marginTop: 6, color: "#92400e" }}>
                      {trade.confirmationNotes.slice(0, 2).join(" ")}
                    </div>
                  )}
                  {sourceText(trade.evidence) && (
                    <div style={{ marginTop: 4, color: "#6b7280" }}>
                      Sources: {sourceText(trade.evidence)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {readback.tradeNarration.length > 0 && (
          <SectionList
            title="Trade Readback"
            items={readback.tradeNarration.map((item) => `${item.trade}: ${item.narration}`)}
            tone="neutral"
          />
        )}

        {readback.areaNarration.length > 0 && (
          <SectionList title="Area Readback" items={readback.areaNarration} tone="info" />
        )}

        {readback.packageReadback.length > 0 && (
          <ReadbackList
            title="Package Readback"
            items={readback.packageReadback.map((pkg) => ({
              text: pkg.narration,
              evidence: pkg.evidence,
            }))}
            tone="neutral"
          />
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
            Plan Intelligence
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Signals extracted from uploaded plan files.
          </div>
        </div>
      </div>

      {planIntelligence.summary && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #dbeafe",
            borderRadius: 12,
            background: "#f8fbff",
            color: "#1f2937",
            lineHeight: 1.55,
            fontSize: 13,
          }}
        >
          {planIntelligence.summary}
        </div>
      )}

      <PlanReadbackPanel readback={planReadback} />
      <PackageCards packages={estimatorPackages} />
      <SectionList title="Sheet Role Signals" items={sheetRoleSignals} tone="neutral" />
      <SectionList title="Prototype Signals" items={prototypeSignals} tone="info" />
      <SectionList title="Repeat Scaling Signals" items={repeatScalingSignals} tone="info" />
      <SectionList title="Package Grouping Signals" items={packageGroupingSignals} tone="neutral" />
      <SectionList title="Bid Strategy Notes" items={bidStrategyNotes} tone="warning" />
      <SectionList title="High-Value Sheet Signals" items={highValueSheetSignals} tone="neutral" />
      <SectionList title="Pricing Anchor Signals" items={pricingAnchorSignals} tone="info" />
      <SectionList title="Bid Coverage Gaps" items={bidCoverageGaps} tone="warning" />
      <SectionList title="Estimating Priority Signals" items={estimatingPrioritySignals} tone="info" />
      <SectionList title="Bid Execution Notes" items={bidExecutionNotes} tone="warning" />
      <SectionList title="Pricing Package Signals" items={pricingPackageSignals} tone="neutral" />
      <SectionList title="Prototype Package Signals" items={prototypePackageSignals} tone="info" />
      <SectionList title="Package Scope Candidates" items={packageScopeCandidates} tone="neutral" />
      <SectionList title="Package Scaling Guidance" items={packageScalingGuidance} tone="warning" />
      <SectionList title="Package Confidence Notes" items={packageConfidenceNotes} tone="info" />
      <SectionList title="Estimating Framework Notes" items={estimatingFrameworkNotes} tone="warning" />
      <SectionList title="Estimate Structure Signals" items={estimateStructureSignals} tone="neutral" />
      <SectionList title="Estimate Package Candidates" items={estimatePackageCandidates} tone="neutral" />
      <SectionList title="Package Trade Scope Signals" items={packageTradeScopeSignals} tone="info" />
      <SectionList title="Package Pricing Basis Signals" items={packagePricingBasisSignals} tone="info" />
      <SectionList title="Package Allowance Signals" items={packageAllowanceSignals} tone="warning" />
      <SectionList title="Estimate Assembly Guidance" items={estimateAssemblyGuidance} tone="warning" />
      <SectionList title="Estimate Scaffold Notes" items={estimateScaffoldNotes} tone="info" />
      <SectionList title="Likely Room Types" items={likelyRoomTypes} tone="info" />
      <SectionList title="Repeated Space Signals" items={repeatedSpaceSignals} tone="info" />
      <SectionList title="Trade Package Signals" items={tradePackageSignals} tone="neutral" />
      <SectionList title="Scalable Scope Signals" items={scalableScopeSignals} tone="neutral" />
      <SectionList title="Bid-Assist Notes" items={bidAssistNotes} tone="warning" />
      <SectionList title="Detected Rooms" items={detectedRooms} tone="info" />
      <SectionList title="Detected Trades" items={detectedTrades} tone="neutral" />
      <SectionList title="Scope Flags" items={missingScopeFlags} tone="warning" />
      <SectionList title="Suggested Additions" items={suggestedAdditions} tone="info" />
    </div>
  )
}

function PlanAwareEstimatorReadbackCard({
  planIntelligence,
  estimateSections,
}: {
  planIntelligence: PlanIntelligence
  estimateSections: EstimateStructuredSection[] | null
}) {
  const readback = planIntelligence?.planReadback
  if (!readback) return null

  const pricingCarryReadback = buildPlanPricingCarryReadback({
    planReadback: readback,
    estimateSections,
  })
  const pricingSections = (estimateSections || [])
    .filter((section) => section.estimatorTreatment === "section_row")
    .slice(0, 6)
  const burdenSections = (estimateSections || [])
    .filter((section) => section.estimatorTreatment === "embedded_burden")
    .slice(0, 3)
  const keyFlow = readback.estimatorFlowReadback.slice(0, 7)
  const estimatorStory = buildPlanEstimatorStorySections({
    planReadback: readback,
    pricingCarryReadback,
  })
  const directCarryCount = pricingCarryReadback.filter((item) => item.status === "directly_carried").length
  const reinforcedCarryCount = pricingCarryReadback.filter((item) => item.status === "reinforced_or_embedded").length
  const notCarriedCount = pricingCarryReadback.filter((item) => item.status === "not_carried_yet").length
  const confirmationCount = pricingCarryReadback.filter((item) => item.status === "confirmation_needed").length

  if (
    estimatorStory.length === 0 &&
    keyFlow.length === 0 &&
    readback.areaQuantityReadback.length === 0 &&
    readback.tradeScopeReadback.length === 0 &&
    pricingCarryReadback.length === 0
  ) {
    return null
  }

  const moneyText = (value: number) =>
    `$${Math.round(Number(value || 0)).toLocaleString()}`
  const sourceText = (evidence: Array<{ sourcePageNumber: number; pageNumber: number; sheetNumber: string | null; sheetTitle: string | null }>) =>
    evidence.length > 0
      ? Array.from(
          new Set(
            evidence.map((ref) =>
              `${ref.sheetNumber || ref.sheetTitle || `Page ${ref.pageNumber}`} / source page ${ref.sourcePageNumber}`
            )
          )
        )
          .slice(0, 3)
          .join("; ")
      : ""
  const statusLabel = (status: string) => status.replace(/_/g, " ")
  const supportLabel = (status: string) => status.replace(/_/g, " ")
  const supportTone = (status: string) =>
    status === "direct"
      ? { border: "#bfdbfe", bg: "#fff", color: "#1d4ed8" }
      : status === "reinforced"
        ? { border: "#dbeafe", bg: "#f8fbff", color: "#1d4ed8" }
        : status === "mixed"
          ? { border: "#bae6fd", bg: "#f0f9ff", color: "#075985" }
          : { border: "#fdba74", bg: "#fff7ed", color: "#92400e" }
  const carryTone = (status: string) =>
    status === "directly_carried"
      ? { border: "#bfdbfe", bg: "#fff", color: "#1d4ed8" }
      : status === "reinforced_or_embedded"
        ? { border: "#dbeafe", bg: "#f8fbff", color: "#1d4ed8" }
        : { border: "#fdba74", bg: "#fff7ed", color: "#92400e" }

  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 14,
        border: "1px solid #bae6fd",
        borderRadius: 8,
        background: "#f0f9ff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15, color: "#0f172a" }}>
        Estimator Plan & Pricing Story
      </div>
      <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.55, marginTop: 6 }}>
        {readback.headline}
      </div>

      {estimatorStory.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 8,
            marginTop: 12,
          }}
        >
          {estimatorStory.map((section, index) => {
            const tone = supportTone(section.supportLabel)
            return (
              <div
                key={`result-story-${section.key}`}
                style={{
                  padding: 10,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 8,
                  background: tone.bg,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#1f2937",
                }}
              >
                <div style={{ fontWeight: 900, color: "#111827" }}>
                  {index + 1}. {section.title}
                  <span style={{ color: tone.color }}> - {supportLabel(section.supportLabel)} support</span>
                </div>
                <div style={{ marginTop: 3 }}>{section.summary}</div>
                {section.bullets.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {section.bullets.slice(0, 5).map((item, bulletIndex) => (
                      <li key={`result-story-${section.key}-bullet-${bulletIndex}`}>{item}</li>
                    ))}
                  </ul>
                )}
                {sourceText(section.evidence) && (
                  <div style={{ marginTop: 5, color: "#6b7280" }}>
                    Sources: {sourceText(section.evidence)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        <div style={{ padding: 10, border: "1px solid #dbeafe", borderRadius: 8, background: "#fff" }}>
          <div style={{ fontSize: 11, color: "#4b5563", fontWeight: 800 }}>Directly Carried</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>{directCarryCount}</div>
        </div>
        <div style={{ padding: 10, border: "1px solid #dbeafe", borderRadius: 8, background: "#fff" }}>
          <div style={{ fontSize: 11, color: "#4b5563", fontWeight: 800 }}>Reinforced / Embedded</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>{reinforcedCarryCount}</div>
        </div>
        <div style={{ padding: 10, border: "1px solid #fdba74", borderRadius: 8, background: "#fff7ed" }}>
          <div style={{ fontSize: 11, color: "#92400e", fontWeight: 800 }}>Not Carried Yet</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#92400e" }}>{notCarriedCount}</div>
        </div>
        <div style={{ padding: 10, border: "1px solid #fdba74", borderRadius: 8, background: "#fff7ed" }}>
          <div style={{ fontSize: 11, color: "#92400e", fontWeight: 800 }}>Needs Confirmation</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#92400e" }}>{confirmationCount}</div>
        </div>
      </div>

      {pricingCarryReadback.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>
            Pricing Carry Readback
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {pricingCarryReadback.slice(0, 10).map((item) => {
              const tone = carryTone(item.status)
              return (
                <div
                  key={`pricing-carry-readback-${item.key}`}
                  style={{
                    padding: 10,
                    border: `1px solid ${tone.border}`,
                    borderRadius: 8,
                    background: tone.bg,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#1f2937",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#111827" }}>
                    {item.title} - {statusLabel(item.status)}
                  </div>
                  <div style={{ marginTop: 3 }}>{item.narration}</div>
                  {(item.areaGroups.length > 0 || item.scopeGroupKey) && (
                    <div style={{ marginTop: 4, color: "#4b5563" }}>
                      {item.scopeGroupKey ? `Scope group: ${item.scopeGroupKey.replace(/_/g, " ")}` : ""}
                      {item.scopeGroupKey && item.areaGroups.length > 0 ? " - " : ""}
                      {item.areaGroups.length > 0 ? `Areas: ${item.areaGroups.slice(0, 4).join(", ")}` : ""}
                    </div>
                  )}
                  {item.quantity != null && item.unit && (
                    <div style={{ marginTop: 2, color: "#4b5563" }}>
                      Carried quantity: {Number(item.quantity).toLocaleString()} {item.unit.replace(/_/g, " ")}
                    </div>
                  )}
                  {sourceText(item.evidence) && (
                    <div style={{ marginTop: 4, color: "#6b7280" }}>
                      Sources: {sourceText(item.evidence)}
                    </div>
                  )}
                  {item.status !== "directly_carried" && (
                    <div style={{ marginTop: 5, color: tone.color }}>
                      This item should not raise pricing confidence until the estimator confirms the missing or narrow support.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pricingSections.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>
            Pricing Currently Carries
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {pricingSections.map((section, index) => (
              <div
                key={`pricing-carry-${section.trade}-${section.section}-${index}`}
                style={{
                  padding: 10,
                  border: "1px solid #dbeafe",
                  borderRadius: 8,
                  background: "#fff",
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#1f2937",
                }}
              >
                <strong>{section.trade}: {section.label}</strong>
                <span style={{ color: "#4b5563" }}> - {moneyText(section.amount)}</span>
                {section.quantity != null && section.unit && (
                  <div style={{ color: "#4b5563", marginTop: 2 }}>
                    Quantity basis: {Number(section.quantity).toLocaleString()} {section.unit.replace(/_/g, " ")}
                  </div>
                )}
                {section.provenance?.summary && (
                  <div style={{ color: "#4b5563", marginTop: 2 }}>
                    Pricing basis: {section.provenance.summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {burdenSections.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
          Embedded burdens remain separated from direct section rows:{" "}
          {burdenSections.map((section) => `${section.trade} ${section.label}`).join("; ")}.
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
        Pricing authority, protections, owner resolution, and totals remain controlled by the existing pricing path. This readback explains what the selected plans appear to support and what still needs estimator confirmation.
      </div>
    </div>
  )
}

  // -------------------------
  // UI
  // -------------------------
  return (
  <main
    style={{
      maxWidth: 640,
      margin: "60px auto",
      padding: 32,
      fontFamily: "system-ui",
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      background: "#fff",
      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    }}
  >
    <style jsx global>{`
      @media print {
        [data-no-print] {
          display: none !important;
        }

        [data-print-result] {
          display: block !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          white-space: normal !important;
        }

        main {
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          background: #fff !important;
        }
      }

      @media (max-width: 640px) {
        [data-print-result] {
          overflow-x: hidden !important;
        }
      }
    `}</style>

    <div data-no-print>
  <h1 style={{ marginBottom: 4 }}>JobEstimate Pro</h1>
<p
  style={{
    marginTop: 0,
    marginBottom: 20,
    fontSize: 15,
    letterSpacing: "0.2px",
    color: "#555",
  }}
>
  Professional change orders & estimates — generated instantly.
</p>

{!paid && (
  <div style={{ marginBottom: 12 }}>
    {remaining > 0 ? (
      <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
        Free uses remaining: <strong>{remaining}</strong> / {FREE_LIMIT}
      </p>
    ) : (
      <p style={{ fontSize: 13, color: "#c53030", margin: 0 }}>
        Free uses are up. Upgrade to continue generating estimates with Pro access.
      </p>
    )}
  </div>
)}

      <input
  type="email"
  placeholder="Enter your email to generate documents"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  onBlur={checkEntitlementNow}
  style={{ width: "100%", padding: 8 }}
/>

<p
  style={{
    fontSize: 12,
    color: "#c53030",
    marginTop: 4,
    marginBottom: 12,
  }}
  title="Email is required to generate documents"
>
  * Required
</p>

{/* -------------------------
    ⚙️ Business Settings (Collapsed)
------------------------- */}
<details
  style={{
    marginTop: 18,
    marginBottom: 8,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  }}
>
  <summary
    style={{
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 14,
    }}
  >
    ⚙️ Business Settings
  </summary>

  <div style={{ marginTop: 10 }}>
    <h3>Company Profile</h3>

    {["name", "address", "phone", "email"].map((f) => (
      <input
        key={f}
        placeholder={f}
        value={(companyProfile as any)[f]}
        onChange={(e) =>
          setCompanyProfile({
            ...companyProfile,
            [f]: e.target.value,
          })
        }
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
    ))}

    <label style={{ fontSize: 13, fontWeight: 600 }}>
      Company Logo (optional)
    </label>

    <input
      type="file"
      accept="image/*"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onloadend = () => {
          setCompanyProfile((prev) => ({
            ...prev,
            logo: reader.result as string,
          }))
        }
        reader.readAsDataURL(file)
      }}
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    {companyProfile.logo && (
      <img
        src={companyProfile.logo}
        alt="Company logo preview"
        style={{
          maxHeight: 60,
          marginBottom: 12,
          objectFit: "contain",
        }}
      />
    )}

    <input
      placeholder="Contractor License # (optional)"
      value={(companyProfile as any).license || ""}
      onChange={(e) =>
        setCompanyProfile({
          ...companyProfile,
          license: e.target.value,
        })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <textarea
      placeholder="Default payment terms (optional) — shown on PDFs & invoices"
      value={companyProfile.paymentTerms}
      onChange={(e) =>
        setCompanyProfile({
          ...companyProfile,
          paymentTerms: e.target.value,
        })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8, height: 70 }}
    />
  </div>
</details>

{/* -------------------------
    🧾 Job Details (Collapsed)
------------------------- */}
<details
  style={{
    marginTop: 18,
    marginBottom: 8,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  }}
>
  <summary
    style={{
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 14,
    }}
  >
    🧾 Job Details
  </summary>

  <div style={{ marginTop: 10 }}>
    <input
      placeholder="Client name"
      value={jobDetails.clientName}
      onChange={(e) =>
        setJobDetails({ ...jobDetails, clientName: e.target.value })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <input
      placeholder="Job / Project name"
      value={jobDetails.jobName}
      onChange={(e) =>
        setJobDetails({ ...jobDetails, jobName: e.target.value })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <input
      placeholder="Job address (optional)"
      value={jobDetails.jobAddress}
      onChange={(e) =>
        setJobDetails({ ...jobDetails, jobAddress: e.target.value })
      }
      style={{ width: "100%", padding: 8, marginBottom: 8 }}
    />

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <input
        placeholder="Change Order # (optional)"
        value={jobDetails.changeOrderNo}
        onChange={(e) =>
          setJobDetails({ ...jobDetails, changeOrderNo: e.target.value })
        }
        style={{ width: "100%", padding: 8 }}
      />
      <input
        type="date"
        value={jobDetails.date}
        onChange={(e) =>
          setJobDetails({ ...jobDetails, date: e.target.value })
        }
        style={{ width: "100%", padding: 8 }}
      />
    </div>

    <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
      Tip: leave the date blank to auto-fill today on the PDF.
    </p>
  </div>
</details>
     
      <EstimateBuilderSection
  trade={trade}
  setTrade={setTrade}
  normalizeTrade={normalizeTrade}
  showPaintScope={showPaintScope}
  effectivePaintScope={effectivePaintScope}
  paintScope={paintScope}
  setPaintScope={setPaintScope}
  PAINT_SCOPE_OPTIONS={PAINT_SCOPE_OPTIONS}
  state={state}
  setState={setState}
  scopeChange={scopeChange}
  setScopeChange={setScopeChange}
  handlePhotoUpload={handlePhotoUpload}
  jobPhotos={jobPhotos}
  removeJobPhoto={removeJobPhoto}
  updateJobPhoto={updateJobPhoto}
  updateJobPhotoReference={updateJobPhotoReference}
  handlePlanUpload={handlePlanUpload}
  jobPlans={jobPlans}
  removeJobPlan={removeJobPlan}
  updateJobPlan={updateJobPlan}
  SHOT_TYPE_OPTIONS={SHOT_TYPE_OPTIONS}
  ROOM_TAG_SUGGESTIONS={ROOM_TAG_SUGGESTIONS}
  maxJobPhotos={MAX_JOB_PHOTOS}
  maxJobPlans={MAX_JOB_PLANS}
  scopeQuality={scopeQuality}
  measureEnabled={measureEnabled}
  setMeasureEnabled={setMeasureEnabled}
  measureRows={measureRows}
  setMeasureRows={setMeasureRows}
  rowSqft={rowSqft}
  totalSqft={totalSqft}
  generate={generate}
  loading={loading}
  status={status}
/>

{loading && (
  <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
    Generating professional document…
  </p>
)}
</div>

{result && (
  <div
    data-print-result
    style={{
      marginTop: 24,
      padding: 16,
      background: "#f5f5f5",
      borderRadius: 8,
      whiteSpace: "pre-wrap",
      lineHeight: 1.6,
      fontSize: 15,
      overflowX: "hidden",
    }}
  >
    <h3 style={{ marginBottom: 8 }}>
      Generated {displayedDocumentType}
    </h3>

    <p
      style={{
        fontSize: 13,
        color: "#666",
        marginBottom: 12,
      }}
    >
      Generated from the scope provided
      {jobPhotos.length > 0 ? " and uploaded photos" : ""}.
    </p>

    {hasEstimateStatus && (
  <EstimateStatusCard
  displayedDocumentType={displayedDocumentType}
  displayedChangeOrderNote={displayedChangeOrderNote}
  displayedScheduleImpactNote={displayedScheduleImpactNote}
  changeOrderDetection={changeOrderDetection}
  scopeSignals={scopeSignals}
  jobPhotosCount={jobPhotos.length}
  photoAnalysis={photoAnalysis}
  photoScopeAssist={photoScopeAssist}
  planAssistedStatus={planAssistedStatus}
  measureEnabled={measureEnabled}
  totalSqft={totalSqft}
  hasMeasurementReference={hasMeasurementReference}
  estimateConfidence={estimateConfidence}
/>
)}

    <PlanAwareEstimatorReadbackCard
      planIntelligence={planIntelligence}
      estimateSections={estimateSections}
    />

    <div
      style={{
        marginBottom: 14,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          fontSize: 14,
          marginBottom: 8,
          color: "#111827",
        }}
      >
        {planIntelligence?.planReadback ? "Generated Scope Description" : "AI Scope Description"}
      </div>

      <div
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
          fontSize: 14,
          color: "#111",
        }}
      >
        {result.text}
      </div>
    </div>

    {smartScopePreview && (
      <div
        style={{
          marginTop: 12,
          marginBottom: 14,
          padding: 14,
          border: "1px solid #c7d2fe",
          borderRadius: 14,
          background: "#eef2ff",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 15, color: "#1e1b4b" }}>
          Smart Scope Assist
        </div>

        <div style={{ fontSize: 13, color: "#4338ca", marginTop: 4 }}>
          Suggested additions based on uploaded photos and missing scope details.
        </div>

        <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.6 }}>
          {smartScopePreview.suggestions.map((item, i) => (
            <li key={`smart-scope-${i}`}>{item}</li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button
            type="button"
            onClick={regenerateWithSmartScope}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: loading ? "#a5b4fc" : "#312e81",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? "Regenerating..." : "Regenerate with Suggestions"}
          </button>

          <button
            type="button"
            onClick={applySmartScopePreview}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #c7d2fe",
              background: "#fff",
              color: "#312e81",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            Apply to Scope Only
          </button>
        </div>
      </div>
    )}

    <PricingSummarySection
      pricing={pricing}
      setPricing={setPricing}
      setPricingEdited={setPricingEdited}
      applyProfitTarget={applyProfitTarget}
      depositEnabled={depositEnabled}
      setDepositEnabled={setDepositEnabled}
      depositType={depositType}
      setDepositType={setDepositType}
      depositValue={depositValue}
      setDepositValue={setDepositValue}
      depositDue={depositDue}
      remainingBalance={remainingBalance}
      taxEnabled={taxEnabled}
      setTaxEnabled={setTaxEnabled}
      taxRate={taxRate}
      setTaxRate={setTaxRate}
      taxAmount={taxAmount}
      minimumSafeStatus={minimumSafeStatus}
      historicalPriceGuard={historicalPriceGuard}
      PriceGuardBadge={PriceGuardBadge}
      pdfShowPriceGuard={pdfShowPriceGuard}
      pdfPriceGuardLabel={pdfPriceGuardLabel}
      isUserEdited={isUserEdited}
      downloadPDF={downloadPDF}
    />

    <EstimateSectionsCard
      estimateRows={estimateRows}
      estimateEmbeddedBurdens={estimateEmbeddedBurdens}
      estimateSections={estimateSections}
    />

    {schedule && (
      <>
        <ScheduleBlock schedule={schedule} />

        {completionWindow && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            Estimated Completion:
            <strong>
              {" "}
              {completionWindow.min.toLocaleDateString()} –{" "}
              {completionWindow.max.toLocaleDateString()}
            </strong>
          </div>
        )}

        <details
          style={{
            marginTop: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            Edit Schedule
          </summary>

          <ScheduleEditor schedule={schedule} setSchedule={setSchedule} />
        </details>
      </>
    )}

    {hasAdvancedAnalysis && (
      <AdvancedAnalysisSection
        photoAnalysis={photoAnalysis}
        photoScopeAssist={photoScopeAssist}
        planIntelligence={planIntelligence}
        estimateSkeletonHandoff={estimateSkeletonHandoff}
        estimateStructureConsumption={estimateStructureConsumption}
        materialsList={materialsList}
        areaScopeBreakdown={areaScopeBreakdown}
        profitProtection={profitProtection}
        scopeXRay={scopeXRay}
        missedScopeDetector={missedScopeDetector}
        profitLeakDetector={profitLeakDetector}
        estimateDefenseMode={estimateDefenseMode}
        tradePricingPrepAnalysis={tradePricingPrepAnalysis}
        estimateConfidence={estimateConfidence}
        changeOrderSummary={changeOrderSummary}
        explainChangesReport={explainChangesReport}
        estimateBreakdown={estimateBreakdown}
        estimateAssumptions={estimateAssumptions}
      />
    )}
  </div>
)}

<div data-no-print>
  <JobsDashboardSection
  jobs={jobs}
  activeJobId={activeJobId}
  setActiveJobId={setActiveJobId}
  setStatus={setStatus}
  getOrCreateJobIdFromDetails={getOrCreateJobIdFromDetails}
  crewCount={crewCount}
  setCrewCount={setCrewCount}
  computeWeeklyCrewLoad={computeWeeklyCrewLoad}
  latestEstimateForJob={latestEstimateForJob}
  lockedOriginalEstimateForJob={lockedOriginalEstimateForJob}
  computeJobContractSummary={computeJobContractSummary}
  computeDepositFromEstimateTotal={computeDepositFromEstimateTotal}
  invoiceSummaryForJob={invoiceSummaryForJob}
  latestInvoiceForJob={latestInvoiceForJob}
  actualsForJob={actualsForJob}
  getJobPipelineStatus={getJobPipelineStatus}
  estimateDirectCost={estimateDirectCost}
  computeProfitProtectionFromTotals={computeProfitProtectionFromTotals}
  money={money}
  upsertActuals={upsertActuals}
  setJobDetails={setJobDetails}
  startChangeOrderFromJob={startChangeOrderFromJob}
  createInvoiceFromEstimate={createInvoiceFromEstimate}
  createBalanceInvoiceFromEstimate={createBalanceInvoiceFromEstimate}
  copyApprovalLinkForEstimate={copyApprovalLinkForEstimate}
  selectJobAndJumpToInvoices={selectJobAndJumpToInvoices}
  downloadInvoicePDF={downloadInvoicePDF}
  updateJob={updateJob}
  deleteJob={deleteJob}
  history={history}
/>

<InvoicesSection
  filteredInvoices={filteredInvoices}
  invoicesSectionRef={invoicesSectionRef}
  setInvoices={setInvoices}
  setStatus={setStatus}
  downloadInvoicePDF={downloadInvoicePDF}
  computeLiveInvoiceStatus={computeLiveInvoiceStatus}
  updateInvoice={updateInvoice}
  INVOICE_KEY={INVOICE_KEY}
/>

<SavedEstimatesSection
  filteredHistory={filteredHistory}
  clearHistory={clearHistory}
  getJobPipelineStatus={getJobPipelineStatus}
  latestInvoiceForJob={latestInvoiceForJob}
  hasAnyInvoiceForEstimate={hasAnyInvoiceForEstimate}
  loadHistoryItem={loadHistoryItem}
  createInvoiceFromEstimate={createInvoiceFromEstimate}
  createBalanceInvoiceFromEstimate={createBalanceInvoiceFromEstimate}
  copyApprovalLinkForEstimate={copyApprovalLinkForEstimate}
  selectJobAndJumpToInvoices={selectJobAndJumpToInvoices}
  downloadInvoicePDF={downloadInvoicePDF}
  deleteHistoryItem={deleteHistoryItem}
  setStatus={setStatus}
/>

  {!paid && (showUpgrade || remaining <= 0) && (
  <button
    type="button"
    onClick={upgrade}
    style={{ width: "100%", marginTop: 12 }}
  >
    Upgrade for Pro Access
  </button>
)}

  <p style={{ marginTop: 40, fontSize: 12, color: "#888", textAlign: "center" }}>
    Secure payments powered by Stripe.
  </p>
</div>
</main>
 )
}
