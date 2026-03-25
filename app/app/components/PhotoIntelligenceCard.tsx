// app/components/PhotoIntelligenceCard.tsx
"use client"

type PhotoAnalysis = {
  summary?: string
  observations?: string[]
  suggestedScopeNotes?: string[]
  detectedRoomTypes?: string[]
  detectedTrades?: string[]
  detectedMaterials?: string[]
  detectedConditions?: string[]
  detectedFixtures?: string[]
  detectedAccessIssues?: string[]
  detectedDemoNeeds?: string[]
  quantitySignals?: {
    doors?: number | null
    windows?: number | null
    vanities?: number | null
    toilets?: number | null
    sinks?: number | null
    outlets?: number | null
    switches?: number | null
    recessedLights?: number | null
    ceilingHeightCategory?: "standard" | "tall" | "vaulted" | null
    estimatedWallSqftMin?: number | null
    estimatedWallSqftMax?: number | null
    estimatedCeilingSqftMin?: number | null
    estimatedCeilingSqftMax?: number | null
    estimatedFloorSqftMin?: number | null
    estimatedFloorSqftMax?: number | null
  }
  scopeCompletenessFlags?: string[]
  confidence?: "low" | "medium" | "high"
} | null

type PhotoScopeAssist = {
  missingScopeFlags: string[]
  suggestedAdditions: string[]
} | null

function hasItems(arr?: string[] | null) {
  return Array.isArray(arr) && arr.length > 0
}

function InfoChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: "#f3f4f6",
        color: "#374151",
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid #e5e7eb",
      }}
    >
      {label}
    </span>
  )
}

function SectionList({
  title,
  items,
  tone = "neutral",
}: {
  title: string
  items?: string[]
  tone?: "neutral" | "warning" | "info"
}) {
  if (!items || items.length === 0) return null

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
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
          {items.map((item, i) => (
            <li key={`${title}-${i}`}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function getConfidenceStyle(conf?: "low" | "medium" | "high") {
  if (conf === "high") {
    return {
      label: "High",
      bg: "#ecfdf5",
      border: "#86efac",
      color: "#166534",
    }
  }

  if (conf === "medium") {
    return {
      label: "Medium",
      bg: "#eff6ff",
      border: "#93c5fd",
      color: "#1d4ed8",
    }
  }

  if (conf === "low") {
    return {
      label: "Low",
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    }
  }

  return null
}

export default function PhotoIntelligenceCard({
  photoAnalysis,
  photoScopeAssist,
}: {
  photoAnalysis: PhotoAnalysis
  photoScopeAssist: PhotoScopeAssist
}) {
  if (!photoAnalysis && !photoScopeAssist) return null

  const confidenceTone = getConfidenceStyle(photoAnalysis?.confidence)

  const materials = photoAnalysis?.detectedMaterials ?? []
  const fixtures = photoAnalysis?.detectedFixtures ?? []
  const conditions = photoAnalysis?.detectedConditions ?? []
  const accessIssues = photoAnalysis?.detectedAccessIssues ?? []
  const demoNeeds = photoAnalysis?.detectedDemoNeeds ?? []
  const missingScopeFlags = photoScopeAssist?.missingScopeFlags ?? []
  const suggestedAdditions = photoScopeAssist?.suggestedAdditions ?? []

  const q = photoAnalysis?.quantitySignals
  const quantityChips: string[] = []

  if (q?.doors) quantityChips.push(`${q.doors} door${q.doors === 1 ? "" : "s"}`)
  if (q?.windows) quantityChips.push(`${q.windows} window${q.windows === 1 ? "" : "s"}`)
  if (q?.vanities) quantityChips.push(`${q.vanities} ${q.vanities === 1 ? "vanity" : "vanities"}`)
  if (q?.toilets) quantityChips.push(`${q.toilets} toilet${q.toilets === 1 ? "" : "s"}`)
  if (q?.sinks) quantityChips.push(`${q.sinks} sink${q.sinks === 1 ? "" : "s"}`)
  if (q?.outlets) quantityChips.push(`${q.outlets} outlet${q.outlets === 1 ? "" : "s"}`)
  if (q?.switches) quantityChips.push(`${q.switches} switch${q.switches === 1 ? "" : "es"}`)
  if (q?.recessedLights) quantityChips.push(`${q.recessedLights} recessed light${q.recessedLights === 1 ? "" : "s"}`)
  if (q?.ceilingHeightCategory) quantityChips.push(`${q.ceilingHeightCategory} ceilings`)

  const wallRange =
    q?.estimatedWallSqftMin != null && q?.estimatedWallSqftMax != null
      ? `${q.estimatedWallSqftMin}–${q.estimatedWallSqftMax} wall sqft`
      : null

  const ceilingRange =
    q?.estimatedCeilingSqftMin != null && q?.estimatedCeilingSqftMax != null
      ? `${q.estimatedCeilingSqftMin}–${q.estimatedCeilingSqftMax} ceiling sqft`
      : null

  const floorRange =
    q?.estimatedFloorSqftMin != null && q?.estimatedFloorSqftMax != null
      ? `${q.estimatedFloorSqftMin}–${q.estimatedFloorSqftMax} floor sqft`
      : null

  const hasContent =
    !!photoAnalysis?.summary ||
    hasItems(photoAnalysis?.observations) ||
    hasItems(photoAnalysis?.suggestedScopeNotes) ||
    hasItems(photoAnalysis?.detectedRoomTypes) ||
    hasItems(materials) ||
    hasItems(fixtures) ||
    hasItems(conditions) ||
    hasItems(accessIssues) ||
    hasItems(demoNeeds) ||
    hasItems(missingScopeFlags) ||
    hasItems(suggestedAdditions) ||
    quantityChips.length > 0 ||
    !!wallRange ||
    !!ceilingRange ||
    !!floorRange ||
    !!confidenceTone

  if (!hasContent) return null

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 14,
        padding: 14,
        border: "1px solid #dbeafe",
        borderRadius: 14,
        background: "#ffffff",
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
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
            Photo Intelligence
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Visible jobsite details pulled from uploaded photos
          </div>
        </div>

        {confidenceTone && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid ${confidenceTone.border}`,
              background: confidenceTone.bg,
              color: confidenceTone.color,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Confidence: {confidenceTone.label}
          </div>
        )}
      </div>

      {photoAnalysis?.summary && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            fontSize: 14,
            lineHeight: 1.55,
            color: "#1f2937",
          }}
        >
          {photoAnalysis.summary}
        </div>
      )}

      <SectionList title="Observations" items={photoAnalysis?.observations} />
      <SectionList
        title="Suggested scope notes"
        items={photoAnalysis?.suggestedScopeNotes}
        tone="info"
      />

      {quantityChips.length > 0 || wallRange || ceilingRange || floorRange ? (
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
            Detected quantities
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quantityChips.map((item, i) => (
              <InfoChip key={`qty-${i}`} label={item} />
            ))}
            {wallRange ? <InfoChip label={wallRange} /> : null}
            {ceilingRange ? <InfoChip label={ceilingRange} /> : null}
            {floorRange ? <InfoChip label={floorRange} /> : null}
          </div>
        </div>
      ) : null}

      {(photoAnalysis?.detectedRoomTypes?.length ?? 0) > 0 && (
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
            Detected room types
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {photoAnalysis!.detectedRoomTypes!.map((item, i) => (
              <InfoChip key={`room-${i}`} label={item} />
            ))}
          </div>
        </div>
      )}

      {materials.length > 0 && (
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
            Detected materials
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {materials.map((item, i) => (
              <InfoChip key={`material-${i}`} label={item} />
            ))}
          </div>
        </div>
      )}

      {fixtures.length > 0 && (
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
            Detected fixtures
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fixtures.map((item, i) => (
              <InfoChip key={`fixture-${i}`} label={item} />
            ))}
          </div>
        </div>
      )}

      <SectionList title="Scope flags" items={missingScopeFlags} tone="warning" />
      <SectionList title="Suggested additions" items={suggestedAdditions} tone="info" />
      <SectionList title="Detected conditions" items={conditions} />
      <SectionList title="Access issues" items={accessIssues} />
      <SectionList title="Demo needs" items={demoNeeds} />
    </div>
  )
}