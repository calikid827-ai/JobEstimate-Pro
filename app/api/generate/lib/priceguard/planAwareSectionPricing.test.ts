import assert from "node:assert/strict"
import test from "node:test"

import { computePaintingDeterministic } from "./paintingEngine"
import { computeDrywallDeterministic } from "./drywallEngine"
import { computeWallcoveringDeterministic } from "./wallcoveringEngine"

function assertSectionPricingAligned(result: {
  pricing: { total: number } | null
  sectionBuckets?: Array<{ section: string; total: number }>
  estimateBasis?: {
    sectionPricing?: Array<{ section: string; total: number; pricingBasis: "direct" | "burden" }>
  } | null
}) {
  assert.ok(result.pricing)
  assert.ok(result.sectionBuckets)
  assert.ok(result.estimateBasis?.sectionPricing)

  const bucketTotal = (result.sectionBuckets || []).reduce((sum, bucket) => sum + bucket.total, 0)
  const basisTotal = (result.estimateBasis?.sectionPricing || []).reduce(
    (sum, section) => sum + section.total,
    0
  )

  assert.equal(bucketTotal, result.pricing?.total || 0)
  assert.equal(basisTotal, result.pricing?.total || 0)
  assert.deepEqual(
    (result.estimateBasis?.sectionPricing || []).map((section) => section.section),
    (result.sectionBuckets || []).map((bucket) => bucket.section)
  )
}

test("painting ceilings support changes live numeric pricing from walls-only to walls-plus-ceilings", () => {
  const base = computePaintingDeterministic({
    scopeText: "Repaint occupied guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
  })

  const withCeilings = computePaintingDeterministic({
    scopeText: "Repaint occupied guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
    planSectionInputs: {
      includeCeilings: true,
    },
  })

  assert.ok(base.pricing)
  assert.ok(withCeilings.pricing)
  assert.equal(base.jobType, "walls_only")
  assert.equal(withCeilings.jobType, "walls_ceilings")
  assert.ok(withCeilings.sectionBuckets?.some((bucket) => bucket.section === "Walls"))
  assert.ok(withCeilings.sectionBuckets?.some((bucket) => bucket.section === "Ceilings"))
  assertSectionPricingAligned(withCeilings)
  assert.ok((withCeilings.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("painting supported door sections trigger separate live numeric door pricing", () => {
  const base = computePaintingDeterministic({
    scopeText: "Repaint occupied guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
  })

  const withDoors = computePaintingDeterministic({
    scopeText: "Repaint occupied guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
    planSectionInputs: {
      supportedDoorCount: 12,
      supportedRoomCount: 10,
    },
  })

  assert.ok(base.pricing)
  assert.ok(withDoors.pricing)
  assert.equal(withDoors.jobType, "mixed_scope")
  assert.ok(withDoors.sectionBuckets?.some((bucket) => bucket.section === "Doors / frames"))
  assert.equal(
    withDoors.estimateBasis?.sectionPricing?.find((section) => section.section === "Doors / frames")
      ?.unit,
    "doors"
  )
  assert.ok((withDoors.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("painting prep/protection and corridor routing affect live numeric productivity conservatively", () => {
  const base = computePaintingDeterministic({
    scopeText: "Light prep same color repaint in vacant units.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
  })

  const corridor = computePaintingDeterministic({
    scopeText: "Light prep same color repaint in vacant units.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
    planSectionInputs: {
      hasCorridorSection: true,
      hasPrepProtectionSection: true,
    },
  })

  assert.ok(base.pricing)
  assert.ok(corridor.pricing)
  assert.ok(corridor.sectionBuckets?.some((bucket) => bucket.section === "Corridor repaint"))
  assert.ok(corridor.sectionBuckets?.some((bucket) => bucket.section === "Prep / protection"))
  assert.equal(
    corridor.estimateBasis?.sectionPricing?.find((section) => section.section === "Corridor repaint")
      ?.pricingBasis,
    "burden"
  )
  assert.ok((corridor.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("painting trim LF affects live numeric pricing when exact trim support exists", () => {
  const base = computePaintingDeterministic({
    scopeText: "Repaint occupied guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
  })

  const withTrim = computePaintingDeterministic({
    scopeText: "Repaint occupied guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1000 },
    paintScope: "walls",
    planSectionInputs: {
      supportedTrimLf: 420,
    },
  })

  assert.ok(base.pricing)
  assert.ok(withTrim.pricing)
  assert.ok(withTrim.sectionBuckets?.some((bucket) => bucket.section === "Trim / casing"))
  assert.equal(
    withTrim.estimateBasis?.sectionPricing?.find((section) => section.section === "Trim / casing")
      ?.unit,
    "linear_ft"
  )
  assert.ok((withTrim.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("drywall supported ceiling section changes live numeric install pricing", () => {
  const base = computeDrywallDeterministic({
    scopeText: "Drywall install and finish at guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      forceInstallFinish: true,
      includeCeilings: false,
    },
  })

  const withCeilings = computeDrywallDeterministic({
    scopeText: "Drywall install and finish at guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      forceInstallFinish: true,
      includeCeilings: true,
    },
  })

  assert.ok(base.pricing)
  assert.ok(withCeilings.pricing)
  assert.equal(base.jobType, "install_finish")
  assert.equal(withCeilings.jobType, "install_finish")
  assert.ok(withCeilings.sectionBuckets?.some((bucket) => bucket.section === "Install / hang"))
  assert.ok(withCeilings.sectionBuckets?.some((bucket) => bucket.section === "Ceiling drywall"))
  assertSectionPricingAligned(withCeilings)
  assert.ok((withCeilings.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("drywall plan-aware section routing can keep patch-repair separate from install-finish", () => {
  const patchRepair = computeDrywallDeterministic({
    scopeText: "Guest room drywall work.",
    stateMultiplier: 1,
    measurements: { totalSqft: 400 },
    planSectionInputs: {
      supportedSqft: 400,
      forcePatchRepair: true,
    },
  })

  const installFinish = computeDrywallDeterministic({
    scopeText: "Guest room drywall work.",
    stateMultiplier: 1,
    measurements: { totalSqft: 400 },
    planSectionInputs: {
      supportedSqft: 400,
      forceInstallFinish: true,
    },
  })

  assert.ok(patchRepair.pricing)
  assert.ok(installFinish.pricing)
  assert.equal(patchRepair.jobType, "patch_repair")
  assert.equal(installFinish.jobType, "install_finish")
  assert.ok(patchRepair.sectionBuckets?.some((bucket) => bucket.section === "Patch / repair"))
  assert.ok(installFinish.sectionBuckets?.some((bucket) => bucket.section === "Install / hang"))
  assert.equal(
    patchRepair.estimateBasis?.sectionPricing?.find((section) => section.section === "Patch / repair")
      ?.pricingBasis,
    "direct"
  )
  assert.notEqual(patchRepair.pricing?.total, installFinish.pricing?.total)
})

test("drywall finish-texture section affects live numeric install pricing", () => {
  const base = computeDrywallDeterministic({
    scopeText: "Drywall install and finish at guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      forceInstallFinish: true,
      includeCeilings: false,
    },
  })

  const textured = computeDrywallDeterministic({
    scopeText: "Drywall install and finish at guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      forceInstallFinish: true,
      includeCeilings: false,
      hasFinishTextureSection: true,
    },
  })

  assert.ok(base.pricing)
  assert.ok(textured.pricing)
  assert.ok(textured.sectionBuckets?.some((bucket) => bucket.section === "Finish / texture"))
  assertSectionPricingAligned(textured)
  assert.ok((textured.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("drywall partition LF affects live numeric install pricing conservatively", () => {
  const base = computeDrywallDeterministic({
    scopeText: "Drywall install and finish at guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      forceInstallFinish: true,
      includeCeilings: false,
    },
  })

  const withPartitions = computeDrywallDeterministic({
    scopeText: "Drywall install and finish at guest rooms.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      supportedPartitionLf: 280,
      forceInstallFinish: true,
      includeCeilings: false,
    },
  })

  assert.ok(base.pricing)
  assert.ok(withPartitions.pricing)
  assert.ok(withPartitions.sectionBuckets?.some((bucket) => bucket.section === "Partition-related scope"))
  assert.equal(
    withPartitions.estimateBasis?.sectionPricing?.find(
      (section) => section.section === "Partition-related scope"
    )?.pricingBasis,
    "burden"
  )
  assert.equal(
    withPartitions.estimateBasis?.sectionPricing?.find(
      (section) => section.section === "Partition-related scope"
    )?.unit,
    "linear_ft"
  )
  assert.ok((withPartitions.pricing?.total || 0) > (base.pricing?.total || 0))
})

test("wallcovering exact area plus explicit vinyl install path affects live numeric pricing", () => {
  const install = computeWallcoveringDeterministic({
    scopeText: "Install new vinyl wallcovering at guest room corridors.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1400 },
    planSectionInputs: {
      supportedSqft: 1400,
      hasInstallSection: true,
      hasCorridorSection: true,
      materialType: "vinyl",
    },
  })

  assert.equal(install.okForDeterministic, true)
  assert.equal(install.jobType, "install")
  assert.equal(install.signals.materialType, "vinyl")
  assert.ok(install.sectionBuckets?.some((bucket) => bucket.section === "Install"))
  assert.ok(install.sectionBuckets?.some((bucket) => bucket.section === "Corridor burden"))
  assertSectionPricingAligned(install)
  assert.ok((install.pricing?.total || 0) > 0)
})

test("wallcovering removal and install route increases live totals over install-only", () => {
  const installOnly = computeWallcoveringDeterministic({
    scopeText: "Install new vinyl wallcovering at corridors.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      hasInstallSection: true,
      hasCorridorSection: true,
      materialType: "vinyl",
    },
  })

  const removeAndInstall = computeWallcoveringDeterministic({
    scopeText: "Remove existing wallcovering and install new vinyl wallcovering at corridors.",
    stateMultiplier: 1,
    measurements: { totalSqft: 1200 },
    planSectionInputs: {
      supportedSqft: 1200,
      hasRemovalPrepSection: true,
      hasInstallSection: true,
      hasCorridorSection: true,
      materialType: "vinyl",
    },
  })

  assert.ok(installOnly.pricing)
  assert.ok(removeAndInstall.pricing)
  assert.equal(removeAndInstall.jobType, "remove_and_install")
  assert.ok(removeAndInstall.sectionBuckets?.some((bucket) => bucket.section === "Removal / prep"))
  assert.ok(removeAndInstall.sectionBuckets?.some((bucket) => bucket.section === "Install"))
  assertSectionPricingAligned(removeAndInstall)
  assert.ok((removeAndInstall.pricing?.total || 0) > (installOnly.pricing?.total || 0))
})

test("wallcovering exact area without material type stays non-deterministic for install pricing", () => {
  const result = computeWallcoveringDeterministic({
    scopeText: "Install new wallcovering at feature wall.",
    stateMultiplier: 1,
    measurements: { totalSqft: 180 },
    planSectionInputs: {
      supportedSqft: 180,
      hasInstallSection: true,
      hasFeatureSection: true,
      materialType: "unknown",
    },
  })

  assert.equal(result.okForDeterministic, false)
  assert.equal(result.pricing, null)
})

test("wallcovering removal-prep only can price live totals from exact supported area", () => {
  const result = computeWallcoveringDeterministic({
    scopeText: "Remove existing wallcovering and prep substrate at lobby feature wall.",
    stateMultiplier: 1,
    measurements: { totalSqft: 220 },
    planSectionInputs: {
      supportedSqft: 220,
      hasRemovalPrepSection: true,
      hasFeatureSection: true,
    },
  })

  assert.equal(result.okForDeterministic, true)
  assert.equal(result.jobType, "removal_prep")
  assert.ok(result.sectionBuckets?.some((bucket) => bucket.section === "Removal / prep"))
  assert.equal(
    result.estimateBasis?.sectionPricing?.find((section) => section.section === "Removal / prep")
      ?.unit,
    "sqft"
  )
  assert.ok((result.pricing?.total || 0) > 0)
})
