import type {
  PlanEstimatorPackage,
  PlanEstimatorPackageSupportType,
  PlanEvidenceRef,
  PlanIntelligence,
} from "../plans/types"

export type EstimatorBucketDraft = {
  bucketName: string
  bucketRole: "primary package" | "secondary package" | "support package" | "allowance/review package"
  likelyTradeCoverage: string[]
  likelyScopeBasis: string[]
  allowanceReviewStatus: "structure_ready" | "support_only" | "allowance_review"
}

export type EstimatorSectionSkeleton = {
  packageKey: string
  bucketName: string
  sectionTitle: string
  trade:
    | "painting"
    | "drywall"
    | "wallcovering"
    | "flooring"
    | "electrical"
    | "plumbing"
    | "tile"
    | "general renovation"
  supportType: PlanEstimatorPackageSupportType
  scopeBreadth: "broad" | "narrow"
  sectionReadiness: "section_anchor" | "scalable_hint" | "support_only" | "review_only"
  quantityAnchor: string | null
  scopeBullets: string[]
  cautionNotes: string[]
  evidence: PlanEvidenceRef[]
}

export type EstimateSkeletonHandoff = {
  estimatorBucketGuidance: string[]
  estimatorBucketDrafts: EstimatorBucketDraft[]
  estimatorSectionSkeletons: EstimatorSectionSkeleton[]
  bucketScopeDrafts: string[]
  bucketAllowanceFlags: string[]
  bucketHandoffNotes: string[]
  estimateStructureHandoffSummary: string
}

function uniqStrings(values: Array<string | null | undefined>, max = 8): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, max)
}

function hasText(items: string[] | undefined, pattern: RegExp): boolean {
  return Array.isArray(items) && items.some((item) => pattern.test(String(item || "")))
}

function buildBucketDraft(args: {
  bucketName: string
  bucketRole: EstimatorBucketDraft["bucketRole"]
  likelyTradeCoverage: string[]
  likelyScopeBasis: string[]
  allowanceReviewStatus: EstimatorBucketDraft["allowanceReviewStatus"]
}): EstimatorBucketDraft {
  return {
    bucketName: args.bucketName,
    bucketRole: args.bucketRole,
    likelyTradeCoverage: uniqStrings(args.likelyTradeCoverage, 6),
    likelyScopeBasis: uniqStrings(args.likelyScopeBasis, 6),
    allowanceReviewStatus: args.allowanceReviewStatus,
  }
}

function getBucketNameForPackage(pkg: PlanEstimatorPackage): string {
  if (pkg.key === "guest-room-finish-package") return "Guest Room Package"
  if (pkg.key === "wet-area-package") return "Guest Bathroom Package"
  if (pkg.key === "corridor-package") return "Corridor Package"
  if (pkg.key === "ceiling-light-fixture-package") return "Ceiling / Fixture Package"
  if (pkg.key === "demo-removal-package") return "Demo / Removal Package"
  return pkg.title
}

function getSectionReadiness(
  supportType: PlanEstimatorPackageSupportType
): EstimatorSectionSkeleton["sectionReadiness"] {
  if (supportType === "quantity_backed") return "section_anchor"
  if (supportType === "scaled_prototype") return "scalable_hint"
  if (supportType === "schedule_backed") return "review_only"
  if (supportType === "elevation_only") return "review_only"
  if (supportType === "demo_only") return "support_only"
  return "support_only"
}

function getGuestRoomSectionSkeletons(pkg: PlanEstimatorPackage): EstimatorSectionSkeleton[] {
  const base = {
    packageKey: pkg.key,
    bucketName: getBucketNameForPackage(pkg),
    supportType: pkg.supportType,
    scopeBreadth: pkg.scopeBreadth,
    sectionReadiness: getSectionReadiness(pkg.supportType),
    quantityAnchor: pkg.quantitySummary,
    evidence: pkg.evidence,
  }

  return [
    {
      ...base,
      sectionTitle: "Painting: Guest room walls / ceilings",
      trade: "painting",
      scopeBullets: uniqStrings(
        [
          pkg.quantitySummary
            ? `Anchor room-interior paint sections from ${pkg.quantitySummary}.`
            : null,
          pkg.supportType === "scaled_prototype"
            ? "Use a typical guest room as the scalable paint section anchor before any repeat scaling."
            : "Keep guest room paint scope grouped by repeatable room package instead of scattering by sheet.",
          ...pkg.executionNotes,
        ],
        5
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          pkg.supportType === "scaled_prototype"
            ? "Prototype support is scalable guidance only and should not be treated as measured wall or ceiling totals."
            : null,
        ],
        5
      ),
    },
    {
      ...base,
      sectionTitle: "Wallcovering: Guest room feature / finish walls",
      trade: "wallcovering",
      scopeBullets: uniqStrings(
        [
          pkg.scheduleSummary
            ? `Use ${pkg.scheduleSummary} to reinforce guest room wallcovering section setup where finish schedules call it out.`
            : "Carry guest room wall finish surfaces as a separate wallcovering section only where wall finish support is explicit.",
          "Keep guest room wallcovering separate from corridor/common-area finish walls.",
        ],
        4
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          "Do not let generic guest-room finish support manufacture full-room wallcovering totals without explicit wallcovering evidence.",
        ],
        4
      ),
    },
    {
      ...base,
      sectionTitle: "Flooring: Guest room finish surfaces",
      trade: "flooring",
      scopeBullets: uniqStrings(
        [
          pkg.quantitySummary
            ? `Carry room finish quantity anchors into flooring section planning only where floor-area support is actually present.`
            : "Keep flooring as a room-package section hint unless direct floor support is stronger.",
          "Separate guest-room finish surfaces from corridor/common-area flooring packages.",
        ],
        4
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          "Do not let guest-room finish support manufacture unrelated corridor or common-area flooring totals.",
        ],
        4
      ),
    },
  ]
}

function getWetAreaSectionSkeletons(pkg: PlanEstimatorPackage): EstimatorSectionSkeleton[] {
  const base = {
    packageKey: pkg.key,
    bucketName: getBucketNameForPackage(pkg),
    supportType: pkg.supportType,
    scopeBreadth: pkg.scopeBreadth,
    sectionReadiness: getSectionReadiness(pkg.supportType),
    quantityAnchor: pkg.quantitySummary,
    evidence: pkg.evidence,
  }

  return [
    {
      ...base,
      sectionTitle: "Tile / finish: Wet-area walls and shower surfaces",
      trade: "tile",
      scopeBullets: uniqStrings(
        [
          pkg.quantitySummary
            ? `Use ${pkg.quantitySummary} as the wet-area finish section anchor where tile/wall finish support is explicit.`
            : null,
          pkg.supportType === "elevation_only"
            ? "Keep wet-area sectioning limited to selected elevations or shower-wall scope."
            : "Organize tile and vertical wet-area finish work as a distinct bath package.",
          ...pkg.executionNotes,
        ],
        5
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          pkg.supportType === "elevation_only"
            ? "Elevation-only support should not expand into full-room, full-floor, or full-bath totals."
            : null,
        ],
        5
      ),
    },
    {
      ...base,
      sectionTitle: "Plumbing: Wet-area fixture trim-out",
      trade: "plumbing",
      scopeBullets: uniqStrings(
        [
          pkg.scheduleSummary
            ? `Use ${pkg.scheduleSummary} to reinforce fixture trim-out section planning.`
            : null,
          "Keep plumbing fixture sectioning aligned to wet-area package boundaries instead of broad finish coverage.",
        ],
        4
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          pkg.supportType === "schedule_backed"
            ? "Schedule-backed fixture support reinforces the section, but does not create unsupported fixture totals."
            : null,
        ],
        4
      ),
    },
  ]
}

function getCorridorSectionSkeletons(pkg: PlanEstimatorPackage): EstimatorSectionSkeleton[] {
  const base = {
    packageKey: pkg.key,
    bucketName: getBucketNameForPackage(pkg),
    supportType: pkg.supportType,
    scopeBreadth: pkg.scopeBreadth,
    sectionReadiness: getSectionReadiness(pkg.supportType),
    quantityAnchor: pkg.quantitySummary,
    evidence: pkg.evidence,
  }

  return [
    {
      ...base,
      sectionTitle: "Painting: Corridor / common-area repaint",
      trade: "painting",
      scopeBullets: uniqStrings(
        [
          pkg.quantitySummary
            ? `Use ${pkg.quantitySummary} as the corridor/common-area paint section anchor.`
            : "Keep corridor repaint as support-only until direct corridor quantity support is stronger.",
          ...pkg.executionNotes,
        ],
        4
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          "Do not blend corridor/common-area scope into repeated guest-room sections.",
        ],
        4
      ),
    },
  ]
}

function getCeilingFixtureSectionSkeletons(pkg: PlanEstimatorPackage): EstimatorSectionSkeleton[] {
  return [
    {
      packageKey: pkg.key,
      bucketName: getBucketNameForPackage(pkg),
      sectionTitle: "Electrical: Ceiling / light / fixture coordination",
      trade: "electrical",
      supportType: pkg.supportType,
      scopeBreadth: pkg.scopeBreadth,
      sectionReadiness: getSectionReadiness(pkg.supportType),
      quantityAnchor: pkg.quantitySummary,
      scopeBullets: uniqStrings(
        [
          pkg.quantitySummary
            ? `Use ${pkg.quantitySummary} to anchor ceiling-light-fixture coordination sections where counts are explicit.`
            : null,
          pkg.scheduleSummary
            ? `Carry ${pkg.scheduleSummary} as fixture/schedule reinforcement for ceiling-adjacent work.`
            : null,
          ...pkg.executionNotes,
        ],
        5
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          "Keep ceiling-light-fixture support trade-specific and avoid broadening it into unrelated finish or drywall sections.",
        ],
        4
      ),
      evidence: pkg.evidence,
    },
  ]
}

function getDemoSectionSkeletons(pkg: PlanEstimatorPackage): EstimatorSectionSkeleton[] {
  return [
    {
      packageKey: pkg.key,
      bucketName: getBucketNameForPackage(pkg),
      sectionTitle: "Demo / removal: Selective demolition",
      trade: "general renovation",
      supportType: pkg.supportType,
      scopeBreadth: pkg.scopeBreadth,
      sectionReadiness: "support_only",
      quantityAnchor: pkg.quantitySummary,
      scopeBullets: uniqStrings(
        [
          pkg.quantitySummary
            ? `Use ${pkg.quantitySummary} only for removal/demo section planning.`
            : "Keep demolition as a separate removal-oriented section skeleton.",
          ...pkg.executionNotes,
        ],
        4
      ),
      cautionNotes: uniqStrings(
        [
          ...pkg.cautionNotes,
          "Demo/removal sections should remain separate from install sections and should not create install authority.",
        ],
        4
      ),
      evidence: pkg.evidence,
    },
  ]
}

function buildEstimatorSectionSkeletons(
  packages: PlanEstimatorPackage[]
): EstimatorSectionSkeleton[] {
  return packages
    .flatMap((pkg) => {
      if (pkg.key === "guest-room-finish-package") return getGuestRoomSectionSkeletons(pkg)
      if (pkg.key === "wet-area-package") return getWetAreaSectionSkeletons(pkg)
      if (pkg.key === "corridor-package") return getCorridorSectionSkeletons(pkg)
      if (pkg.key === "ceiling-light-fixture-package") return getCeilingFixtureSectionSkeletons(pkg)
      if (pkg.key === "demo-removal-package") return getDemoSectionSkeletons(pkg)
      return []
    })
    .slice(0, 12)
}

export function buildEstimateSkeletonHandoff(
  planIntelligence: PlanIntelligence | null
): EstimateSkeletonHandoff | null {
  if (!planIntelligence?.ok) return null

  const packageCandidates = uniqStrings(
    planIntelligence.estimatePackageCandidates ||
      planIntelligence.packageScopeCandidates ||
      [],
    8
  )
  const pricingPackageSignals = planIntelligence.pricingPackageSignals || []
  const prototypePackageSignals = planIntelligence.prototypePackageSignals || []
  const tradePackageSignals = planIntelligence.tradePackageSignals || []
  const pricingBasisSignals = planIntelligence.packagePricingBasisSignals || []
  const allowanceSignals = planIntelligence.packageAllowanceSignals || []
  const structureSignals = planIntelligence.estimateStructureSignals || []
  const assemblyGuidance = planIntelligence.estimateAssemblyGuidance || []
  const scaffoldNotes = planIntelligence.estimateScaffoldNotes || []
  const coverageGaps = planIntelligence.bidCoverageGaps || []
  const estimatorPackages = planIntelligence.estimatorPackages || []
  const estimatorSectionSkeletons = buildEstimatorSectionSkeletons(estimatorPackages)

  const drafts: EstimatorBucketDraft[] = []

  const hasGuestRoom =
    hasText(packageCandidates, /\bguest room package\b/i) ||
    hasText(pricingPackageSignals, /\bguest room package\b/i)
  const hasGuestBathroom =
    hasText(packageCandidates, /\bguest bathroom package\b/i) ||
    hasText(pricingPackageSignals, /\bguest bathroom package\b/i)
  const hasCorridor =
    hasText(packageCandidates, /\bcorridor package\b/i) ||
    hasText(pricingPackageSignals, /\bcorridor package\b/i)
  const hasCommonArea =
    hasText(packageCandidates, /\bcommon-area package\b/i) ||
    hasText(pricingPackageSignals, /\bcommon-area package\b/i)
  const hasFinish =
    hasText(packageCandidates, /\bfinish package\b/i) ||
    hasText(pricingPackageSignals, /\bfinish package\b/i)
  const hasWetArea =
    hasText(packageCandidates, /\bwet-area package\b/i) ||
    hasText(pricingPackageSignals, /\bwet-area package\b/i)

  if (hasGuestRoom) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Guest Room Package",
        bucketRole: hasText(prototypePackageSignals, /\bguest room\b/i)
          ? "primary package"
          : "secondary package",
        likelyTradeCoverage: ["painting", "flooring", "carpentry"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Prototype room or repeat-room signals",
          ...pricingBasisSignals.filter((item) => /\bguest room\b|\bprototype\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bprototype\b|\brepeat count\b/i)
          ? "allowance_review"
          : "structure_ready",
      })
    )
  }

  if (hasGuestBathroom) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Guest Bathroom Package",
        bucketRole: hasText(prototypePackageSignals, /\bbathroom\b/i)
          ? "primary package"
          : "secondary package",
        likelyTradeCoverage: ["plumbing", "tile", "painting"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Bathroom layout, fixture, and wet-area signals",
          ...pricingBasisSignals.filter((item) => /\bbathroom\b|\bwet-area\b|\bfixture\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bfixture-schedule\b|\bwet-area\b/i)
          ? "allowance_review"
          : "structure_ready",
      })
    )
  }

  if (hasCorridor) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Corridor Package",
        bucketRole: "secondary package",
        likelyTradeCoverage: ["painting", "flooring", "electrical support"].filter((trade) =>
          trade === "electrical support"
            ? hasText(planIntelligence.sheetRoleSignals || [], /\belectrical plan\b/i)
            : hasText(tradePackageSignals, new RegExp(`\\b${trade.split(" ")[0]}\\b`, "i")) ||
              (planIntelligence.detectedTrades || []).includes(trade.split(" ")[0])
        ),
        likelyScopeBasis: [
          "Corridor sheet and corridor refresh signals",
          ...pricingBasisSignals.filter((item) => /\bcorridor\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bcorridor\b/i)
          ? "allowance_review"
          : "support_only",
      })
    )
  }

  if (hasCommonArea) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Common-Area Package",
        bucketRole: "allowance/review package",
        likelyTradeCoverage: uniqStrings(
          (planIntelligence.detectedTrades || []).slice(0, 3),
          3
        ),
        likelyScopeBasis: [
          "Common-area or public-area sheet cues",
          ...allowanceSignals.filter((item) => /\bcommon-area\b|\ballowance\b/i.test(item)),
        ],
        allowanceReviewStatus: "allowance_review",
      })
    )
  }

  if (hasFinish) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Finish Support Package",
        bucketRole: "support package",
        likelyTradeCoverage: ["painting", "flooring"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Finish schedule and repeated finish cues",
          ...pricingBasisSignals.filter((item) => /\bfinish\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(allowanceSignals, /\bfinish\b|\ballowance\b/i)
          ? "allowance_review"
          : "support_only",
      })
    )
  }

  if (hasWetArea && !hasGuestBathroom) {
    drafts.push(
      buildBucketDraft({
        bucketName: "Wet-Area Support Package",
        bucketRole: "support package",
        likelyTradeCoverage: ["plumbing", "tile"].filter((trade) =>
          hasText(tradePackageSignals, new RegExp(`\\b${trade}\\b`, "i")) ||
          (planIntelligence.detectedTrades || []).includes(trade)
        ),
        likelyScopeBasis: [
          "Wet-area and bathroom-detail cues",
          ...pricingBasisSignals.filter((item) => /\bwet-area\b|\bbathroom\b/i.test(item)),
        ],
        allowanceReviewStatus: hasText(coverageGaps, /\bwet-area\b/i)
          ? "allowance_review"
          : "support_only",
      })
    )
  }

  for (const pkg of estimatorPackages) {
    const bucketName = getBucketNameForPackage(pkg)
    if (drafts.some((draft) => draft.bucketName === bucketName)) continue

    drafts.push(
      buildBucketDraft({
        bucketName,
        bucketRole:
          pkg.supportType === "quantity_backed" || pkg.supportType === "scaled_prototype"
            ? "primary package"
            : pkg.supportType === "support_only" || pkg.supportType === "demo_only"
              ? "support package"
              : "secondary package",
        likelyTradeCoverage: [pkg.primaryTrade],
        likelyScopeBasis: uniqStrings(
          [
            pkg.quantitySummary ? `Package quantity basis: ${pkg.quantitySummary}` : null,
            pkg.scheduleSummary ? `Package schedule basis: ${pkg.scheduleSummary}` : null,
            ...pkg.executionNotes,
          ],
          6
        ),
        allowanceReviewStatus:
          pkg.supportType === "quantity_backed"
            ? "structure_ready"
            : pkg.supportType === "scaled_prototype"
              ? "structure_ready"
              : pkg.supportType === "support_only" || pkg.supportType === "demo_only"
                ? "support_only"
                : "allowance_review",
      })
    )
  }

  const estimatorBucketDrafts = drafts.slice(0, 8)

  if (estimatorBucketDrafts.length === 0 && estimatorSectionSkeletons.length === 0) {
    return null
  }

  const estimatorBucketGuidance = uniqStrings(
    [
      ...structureSignals,
      ...assemblyGuidance,
      ...estimatorSectionSkeletons.map((section) => {
        if (section.sectionReadiness === "section_anchor") {
          return `Use ${section.sectionTitle} as a quantity-backed section anchor.`
        }
        if (section.sectionReadiness === "scalable_hint") {
          return `Use ${section.sectionTitle} as a prototype/scaling-oriented section hint only.`
        }
        return `Keep ${section.sectionTitle} narrow and review-oriented until support improves.`
      }),
      "Use plan-derived package buckets as estimate structure guidance only; do not treat them as counted quantities.",
    ],
    8
  )

  const bucketScopeDrafts = uniqStrings(
    [
      ...estimatorBucketDrafts.map((bucket) => {
        return `${bucket.bucketName}: ${bucket.likelyScopeBasis.join("; ")}.`
      }),
      ...estimatorSectionSkeletons.map((section) => {
        const bullets = section.scopeBullets.slice(0, 2).join("; ")
        return `${section.sectionTitle}: ${bullets}.`
      }),
    ],
    12
  )

  const bucketAllowanceFlags = estimatorBucketDrafts
    .filter((bucket) => bucket.allowanceReviewStatus !== "structure_ready")
    .map(
      (bucket) =>
        `${bucket.bucketName}: ${bucket.allowanceReviewStatus === "allowance_review" ? "allowance/review" : "support-only"}`
    )

  const bucketHandoffNotes = uniqStrings(
    [
      ...scaffoldNotes,
      ...coverageGaps,
      ...estimatorSectionSkeletons.flatMap((section) => section.cautionNotes || []),
      "Draft buckets are estimate-structure guidance, not priced or counted sections.",
    ],
    10
  )

  const primaryBuckets = estimatorBucketDrafts
    .filter((bucket) => bucket.bucketRole === "primary package")
    .map((bucket) => bucket.bucketName)
  const supportBuckets = estimatorBucketDrafts
    .filter((bucket) =>
      bucket.bucketRole === "support package" ||
      bucket.bucketRole === "allowance/review package"
    )
    .map((bucket) => bucket.bucketName)

  const estimateStructureHandoffSummary = [
    primaryBuckets.length > 0
      ? `Primary structure candidates: ${primaryBuckets.join(", ")}.`
      : null,
    supportBuckets.length > 0
      ? `Support/review buckets: ${supportBuckets.join(", ")}.`
      : null,
    "Use as a first-pass estimator scaffold only; counts and pricing remain unresolved.",
    estimatorSectionSkeletons.length > 0
      ? `Section-ready handoff includes ${estimatorSectionSkeletons.length} plan-derived section skeletons.`
      : null,
  ]
    .filter(Boolean)
    .join(" ")

  return {
    estimatorBucketGuidance,
    estimatorBucketDrafts,
    estimatorSectionSkeletons,
    bucketScopeDrafts,
    bucketAllowanceFlags,
    bucketHandoffNotes,
    estimateStructureHandoffSummary,
  }
}
