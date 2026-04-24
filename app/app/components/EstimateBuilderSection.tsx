"use client"

import type React from "react"
import MeasurementsSection from "./MeasurementsSection"
import JobPhotosSection from "./JobPhotosSection"
import PlanUploadsSection from "./PlanUploadsSection"

type ShotType =
  | "overview"
  | "corner"
  | "wall"
  | "ceiling"
  | "floor"
  | "fixture"
  | "damage"
  | "measurement"

type JobPhoto = {
  id: string
  name: string
  dataUrl: string
  roomTag: string
  shotType: ShotType
  note: string
  reference: {
    kind: "none" | "custom"
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
  selectedPageUploadMode?:
    | "original"
    | "browser-derived-selected-pages"
    | "server-derived-selected-pages"
    | "original-fallback"
  selectedPageUploadNote?: string | null
  pages: Array<{
    sourcePageNumber: number
    label: string
    selected: boolean
  }>
}

type Props = {
  trade: any
  setTrade: (value: any) => void
  normalizeTrade: (value: string) => any
  showPaintScope: boolean
  effectivePaintScope: any
  paintScope: any
  setPaintScope: (value: any) => void
  PAINT_SCOPE_OPTIONS: readonly { value: string; label: string }[]
  state: string
  setState: (value: string) => void
  scopeChange: string
  setScopeChange: (value: string) => void

  handlePhotoUpload: (files: FileList | null) => void
  jobPhotos: JobPhoto[]
  removeJobPhoto: (id: string) => void
  updateJobPhoto: (id: string, patch: Partial<JobPhoto>) => void
  updateJobPhotoReference: (
    id: string,
    patch: Partial<JobPhoto["reference"]>
  ) => void
  handlePlanUpload: (files: FileList | null) => void
  jobPlans: JobPlan[]
  removeJobPlan: (id: string) => void
  updateJobPlan: (id: string, patch: Partial<JobPlan>) => void
  SHOT_TYPE_OPTIONS: Array<{ value: ShotType; label: string }>
  ROOM_TAG_SUGGESTIONS: readonly string[]
  maxJobPhotos: number
  maxJobPlans: number

  scopeQuality: any
  measureEnabled: boolean
  setMeasureEnabled: (value: boolean) => void
  measureRows: any[]
  setMeasureRows: React.Dispatch<React.SetStateAction<any[]>>
  rowSqft: (r: any) => number
  totalSqft: number
  generate: () => void
  loading: boolean
  status: string
}

export default function EstimateBuilderSection({
  trade,
  setTrade,
  normalizeTrade,
  showPaintScope,
  effectivePaintScope,
  paintScope,
  setPaintScope,
  PAINT_SCOPE_OPTIONS,
  state,
  setState,
  scopeChange,
  setScopeChange,

  handlePhotoUpload,
  jobPhotos,
  removeJobPhoto,
  updateJobPhoto,
  updateJobPhotoReference,
  handlePlanUpload,
  jobPlans,
  removeJobPlan,
  updateJobPlan,
  SHOT_TYPE_OPTIONS,
  ROOM_TAG_SUGGESTIONS,

  scopeQuality,
  measureEnabled,
  setMeasureEnabled,
  measureRows,
  setMeasureRows,
  rowSqft,
  totalSqft,
  generate,
  loading,
  status,
  maxJobPhotos,
  maxJobPlans,
}: Props) {
  return (
    <>
      <p style={{ marginTop: 12, fontWeight: 600 }}>Trade Type</p>
      <select
        value={trade}
        onChange={(e) => setTrade(normalizeTrade(e.target.value))}
        style={{ width: "100%", padding: 10, marginTop: 6 }}
      >
        <option value="">Auto-detect</option>
        <option value="painting">Painting</option>
        <option value="drywall">Drywall</option>
        <option value="flooring">Flooring</option>
        <option value="electrical">Electrical</option>
        <option value="plumbing">Plumbing</option>
        <option value="bathroom_tile">Bathroom / Tile</option>
        <option value="carpentry">Carpentry</option>
        <option value="general_renovation">General Renovation</option>
      </select>

      {showPaintScope && (
        <div style={{ marginTop: 12 }}>
          <p style={{ marginTop: 0, fontWeight: 600 }}>
            {effectivePaintScope === "doors_only"
              ? "Paint Scope: Doors only (auto-detected)"
              : "Paint Scope"}
          </p>

          <select
            value={effectivePaintScope === "doors_only" ? "walls" : paintScope}
            disabled={effectivePaintScope === "doors_only"}
            onChange={(e) => setPaintScope(e.target.value as any)}
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              opacity: effectivePaintScope === "doors_only" ? 0.6 : 1,
              cursor:
                effectivePaintScope === "doors_only"
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {PAINT_SCOPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {effectivePaintScope === "doors_only" ? (
            <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Scope was automatically detected as doors-only based on your
              description.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              This controls whether ceilings / trim / doors are included.
            </p>
          )}
        </div>
      )}

      <p style={{ marginTop: 12, fontWeight: 600 }}>Job State</p>
      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          marginTop: 6,
          borderRadius: 6,
          border: "1px solid #ccc",
        }}
      >
        <option value="">Select state</option>
        <option value="AL">Alabama</option>
        <option value="AK">Alaska</option>
        <option value="AZ">Arizona</option>
        <option value="AR">Arkansas</option>
        <option value="CA">California</option>
        <option value="CO">Colorado</option>
        <option value="CT">Connecticut</option>
        <option value="DE">Delaware</option>
        <option value="FL">Florida</option>
        <option value="GA">Georgia</option>
        <option value="HI">Hawaii</option>
        <option value="ID">Idaho</option>
        <option value="IL">Illinois</option>
        <option value="IN">Indiana</option>
        <option value="IA">Iowa</option>
        <option value="KS">Kansas</option>
        <option value="KY">Kentucky</option>
        <option value="LA">Louisiana</option>
        <option value="ME">Maine</option>
        <option value="MD">Maryland</option>
        <option value="MA">Massachusetts</option>
        <option value="MI">Michigan</option>
        <option value="MN">Minnesota</option>
        <option value="MS">Mississippi</option>
        <option value="MO">Missouri</option>
        <option value="MT">Montana</option>
        <option value="NE">Nebraska</option>
        <option value="NV">Nevada</option>
        <option value="NH">New Hampshire</option>
        <option value="NJ">New Jersey</option>
        <option value="NM">New Mexico</option>
        <option value="NY">New York</option>
        <option value="NC">North Carolina</option>
        <option value="ND">North Dakota</option>
        <option value="OH">Ohio</option>
        <option value="OK">Oklahoma</option>
        <option value="OR">Oregon</option>
        <option value="PA">Pennsylvania</option>
        <option value="RI">Rhode Island</option>
        <option value="SC">South Carolina</option>
        <option value="SD">South Dakota</option>
        <option value="TN">Tennessee</option>
        <option value="TX">Texas</option>
        <option value="UT">Utah</option>
        <option value="VT">Vermont</option>
        <option value="VA">Virginia</option>
        <option value="WA">Washington</option>
        <option value="WV">West Virginia</option>
        <option value="WI">Wisconsin</option>
        <option value="WY">Wyoming</option>
        <option value="DC">District of Columbia</option>
      </select>

      <textarea
        placeholder="Describe the scope change…"
        value={scopeChange}
        onChange={(e) => setScopeChange(e.target.value)}
        style={{ width: "100%", height: 120, marginTop: 12 }}
      />

      <JobPhotosSection
  jobPhotos={jobPhotos}
  handlePhotoUpload={handlePhotoUpload}
  removeJobPhoto={removeJobPhoto}
  updateJobPhoto={updateJobPhoto}
  updateJobPhotoReference={updateJobPhotoReference}
  SHOT_TYPE_OPTIONS={SHOT_TYPE_OPTIONS}
  ROOM_TAG_SUGGESTIONS={ROOM_TAG_SUGGESTIONS}
  maxJobPhotos={maxJobPhotos}
/>

      <PlanUploadsSection
        jobPlans={jobPlans}
        handlePlanUpload={handlePlanUpload}
        removeJobPlan={removeJobPlan}
        updateJobPlan={updateJobPlan}
        maxJobPlans={maxJobPlans}
      />

      <MeasurementsSection
        scopeQuality={scopeQuality}
        measureEnabled={measureEnabled}
        setMeasureEnabled={setMeasureEnabled}
        measureRows={measureRows}
        setMeasureRows={setMeasureRows}
        rowSqft={rowSqft}
        totalSqft={totalSqft}
      />

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        style={{
          width: "100%",
          padding: 12,
          marginTop: 12,
          fontSize: 16,
          background: loading ? "#555" : "#000",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Generating…" : "Generate"}
      </button>

      {status && (
        <p style={{ marginTop: 10, fontSize: 13, color: "#c53030" }}>
          {status}
        </p>
      )}
    </>
  )
}
