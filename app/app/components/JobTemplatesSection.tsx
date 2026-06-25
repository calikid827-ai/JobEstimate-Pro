"use client"

import type { JobTemplate } from "../lib/job-templates"

type Props = {
  templates: JobTemplate[]
  templateName: string
  setTemplateName: (value: string) => void
  templateNotes: string
  setTemplateNotes: (value: string) => void
  currentScopeReady: boolean
  onSaveCurrentSetup: () => void
  onUseTemplate: (template: JobTemplate) => void
  onDeleteTemplate: (templateId: string) => void
}

function tradeLabel(trade: JobTemplate["trade"]) {
  switch (trade) {
    case "painting":
      return "Painting"
    case "drywall":
      return "Drywall"
    case "flooring":
      return "Flooring"
    case "electrical":
      return "Electrical"
    case "plumbing":
      return "Plumbing"
    case "bathroom_tile":
      return "Bathroom / Tile"
    case "carpentry":
      return "Carpentry"
    case "general_renovation":
      return "General Renovation"
    default:
      return "Auto-detect"
  }
}

function paintScopeLabel(paintScope: JobTemplate["paintScope"]) {
  switch (paintScope) {
    case "walls":
      return "Walls only"
    case "walls_ceilings":
      return "Walls + ceilings"
    case "full":
      return "Full interior"
    default:
      return null
  }
}

function scopePreview(scopeChange: string) {
  const normalized = scopeChange.replace(/\s+/g, " ").trim()
  return normalized.length > 150 ? `${normalized.slice(0, 147)}...` : normalized
}

export default function JobTemplatesSection({
  templates,
  templateName,
  setTemplateName,
  templateNotes,
  setTemplateNotes,
  currentScopeReady,
  onSaveCurrentSetup,
  onUseTemplate,
  onDeleteTemplate,
}: Props) {
  const hasTemplates = templates.length > 0

  return (
    <div
      data-no-print
      style={{
        marginTop: 18,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div data-mobile-stack style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Job Templates</h3>
          <div style={{ marginTop: 3, fontSize: 12, color: "#666" }}>
            Reusable starts for repeat scopes
          </div>
        </div>

        {hasTemplates && (
          <span
            style={{
              alignSelf: "flex-start",
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 11,
              fontWeight: 800,
              color: "#374151",
            }}
          >
            {templates.length} saved
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <input
          aria-label="Template name"
          placeholder="Template name"
          value={templateName}
          onChange={(event) => setTemplateName(event.target.value)}
          style={{ width: "100%", padding: 8 }}
        />

        <textarea
          aria-label="Template notes"
          placeholder="Light notes (optional)"
          value={templateNotes}
          onChange={(event) => setTemplateNotes(event.target.value)}
          style={{ width: "100%", minHeight: 60, padding: 8, resize: "vertical" }}
        />

        <button
          type="button"
          onClick={onSaveCurrentSetup}
          disabled={!currentScopeReady}
          style={{
            justifySelf: "start",
            opacity: currentScopeReady ? 1 : 0.6,
            cursor: currentScopeReady ? "pointer" : "not-allowed",
          }}
        >
          Save current setup as template
        </button>
      </div>

      {!hasTemplates && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#333" }}>
            No job templates yet
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666", lineHeight: 1.45 }}>
            Save common scopes here so repeat estimates start faster.
          </div>
        </div>
      )}

      {hasTemplates && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {templates.map((template) => {
            const paintScope = paintScopeLabel(template.paintScope)

            return (
              <div
                key={template.id}
                style={{
                  padding: 10,
                  border: "1px solid #eee",
                  borderRadius: 10,
                  background: "#fafafa",
                }}
              >
                <div data-mobile-stack style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div data-mobile-content style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{template.name}</div>

                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {tradeLabel(template.trade)} / {template.documentType}
                      {template.state ? ` / ${template.state}` : ""}
                      {paintScope ? ` / ${paintScope}` : ""}
                    </div>

                    <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>
                      {scopePreview(template.scopeChange)}
                    </div>

                    {template.notes && (
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {template.notes}
                      </div>
                    )}
                  </div>

                  <div data-mobile-actions style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button type="button" onClick={() => onUseTemplate(template)}>
                      Use template
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTemplate(template.id)}
                      style={{ fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
