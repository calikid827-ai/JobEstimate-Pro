"use client"

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

type Props = {
  jobPhotos: JobPhoto[]
  handlePhotoUpload: (files: FileList | null) => void
  removeJobPhoto: (id: string) => void
  updateJobPhoto: (id: string, patch: Partial<JobPhoto>) => void
  updateJobPhotoReference: (
    id: string,
    patch: Partial<JobPhoto["reference"]>
  ) => void
  SHOT_TYPE_OPTIONS: Array<{ value: ShotType; label: string }>
  ROOM_TAG_SUGGESTIONS: readonly string[]
}

export default function JobPhotosSection({
  jobPhotos,
  handlePhotoUpload,
  removeJobPhoto,
  updateJobPhoto,
  updateJobPhotoReference,
  SHOT_TYPE_OPTIONS,
  ROOM_TAG_SUGGESTIONS,
}: Props) {
  const shotCounts = {
    overview: jobPhotos.filter((p) => p.shotType === "overview").length,
    corner: jobPhotos.filter((p) => p.shotType === "corner").length,
    ceiling: jobPhotos.filter((p) => p.shotType === "ceiling").length,
    floor: jobPhotos.filter((p) => p.shotType === "floor").length,
    damage: jobPhotos.filter((p) => p.shotType === "damage").length,
    measurement: jobPhotos.filter((p) => p.shotType === "measurement").length,
  }

  const checklist = [
    {
      key: "overview",
      label: "Overview",
      done: shotCounts.overview >= 1,
    },
    {
      key: "corners",
      label: "2 opposite corners",
      done: shotCounts.corner >= 2,
    },
    {
      key: "ceiling",
      label: "Ceiling",
      done: shotCounts.ceiling >= 1,
    },
    {
      key: "floor",
      label: "Floor",
      done: shotCounts.floor >= 1,
    },
    {
      key: "damage",
      label: "Damage / detail",
      done: shotCounts.damage >= 1,
    },
    {
      key: "measurement",
      label: "1 measurement shot",
      done: shotCounts.measurement >= 1,
    },
  ]

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 14 }}>
        Job Photos (optional)
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#666",
          marginTop: 4,
          marginBottom: 10,
          lineHeight: 1.4,
        }}
      >
        Upload up to 5 photos to help detect materials, conditions, access
        issues, and scope details.
      </div>

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handlePhotoUpload(e.target.files)}
        style={{ marginBottom: jobPhotos.length > 0 ? 12 : 0 }}
      />

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          Capture Checklist
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {checklist.map((item) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: item.done ? "#ecfdf5" : "#fff",
                color: item.done ? "#065f46" : "#374151",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">{item.done ? "✅" : "⬜"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: "#666", marginTop: 10, lineHeight: 1.45 }}>
          Tip: add one measurement shot and enter a real object width below
          like “vanity = 36 in” or “door = 30 in” so future photo scaling can
          work better.
        </div>
      </div>

      {jobPhotos.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 12,
          }}
        >
          {jobPhotos.map((photo, index) => (
            <div
              key={photo.id}
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "84px 1fr auto",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <img
                  src={photo.dataUrl}
                  alt={photo.name}
                  style={{
                    width: 84,
                    height: 84,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                  }}
                />

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#111",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={photo.name}
                  >
                    {index + 1}. {photo.name}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    Add room tag, shot type, note, and optional size reference.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeJobPhoto(photo.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Remove
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    Room tag
                  </label>

                  <input
                    list={`room-tags-${photo.id}`}
                    value={photo.roomTag}
                    onChange={(e) =>
                      updateJobPhoto(photo.id, { roomTag: e.target.value })
                    }
                    placeholder="Kitchen, bath 1, hallway..."
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                    }}
                  />

                  <datalist id={`room-tags-${photo.id}`}>
                    {ROOM_TAG_SUGGESTIONS.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    Shot type
                  </label>

                  <select
                    value={photo.shotType}
                    onChange={(e) =>
                      updateJobPhoto(photo.id, {
                        shotType: e.target.value as ShotType,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                    }}
                  >
                    {SHOT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Note
                </label>

                <textarea
                  value={photo.note}
                  onChange={(e) =>
                    updateJobPhoto(photo.id, { note: e.target.value })
                  }
                  placeholder="Cracked wall, peeling paint, tight vanity area, water damage, etc."
                  style={{
                    width: "100%",
                    minHeight: 74,
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    resize: "vertical",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px dashed #d1d5db",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  Measurement Assist Reference (optional)
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 140px",
                    gap: 10,
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      Reference mode
                    </label>

                    <select
                      value={photo.reference.kind}
                      onChange={(e) => {
                        const nextKind =
                          e.target.value === "custom" ? "custom" : "none"

                        updateJobPhotoReference(photo.id, {
                          kind: nextKind,
                          label: nextKind === "none" ? "" : photo.reference.label,
                          realWidthIn:
                            nextKind === "none"
                              ? null
                              : photo.reference.realWidthIn,
                        })
                      }}
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                      }}
                    >
                      <option value="none">None</option>
                      <option value="custom">Custom width</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      Object label
                    </label>

                    <input
                      value={photo.reference.label}
                      disabled={photo.reference.kind !== "custom"}
                      onChange={(e) =>
                        updateJobPhotoReference(photo.id, {
                          label: e.target.value,
                        })
                      }
                      placeholder="Vanity, door, tile, outlet box..."
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background:
                          photo.reference.kind === "custom" ? "#fff" : "#f3f4f6",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      Real width (in)
                    </label>

                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={photo.reference.realWidthIn ?? ""}
                      disabled={photo.reference.kind !== "custom"}
                      onChange={(e) =>
                        updateJobPhotoReference(photo.id, {
                          realWidthIn:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      placeholder="36"
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background:
                          photo.reference.kind === "custom" ? "#fff" : "#f3f4f6",
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                  Example: set label to “vanity” and width to “36” if the vanity
                  in the photo is 36 inches wide.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}