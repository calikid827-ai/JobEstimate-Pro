"use client"

type JobPhoto = {
  id: string
  name: string
  dataUrl: string
}

type Props = {
  jobPhotos: JobPhoto[]
  handlePhotoUpload: (files: FileList | null) => void
  removeJobPhoto: (id: string) => void
}

export default function JobPhotosSection({
  jobPhotos,
  handlePhotoUpload,
  removeJobPhoto,
}: Props) {
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

      {jobPhotos.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 10,
            marginTop: 12,
          }}
        >
          {jobPhotos.map((photo) => (
            <div
              key={photo.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#fafafa",
              }}
            >
              <img
                src={photo.dataUrl}
                alt={photo.name}
                style={{
                  width: 56,
                  height: 56,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#111",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={photo.name}
                >
                  {photo.name}
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
          ))}
        </div>
      )}
    </div>
  )
}