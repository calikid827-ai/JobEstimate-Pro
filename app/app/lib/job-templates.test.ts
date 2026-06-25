import test from "node:test"
import assert from "node:assert/strict"

import {
  createJobTemplate,
  deleteJobTemplate,
  getJobTemplateApplyPayload,
  JOB_TEMPLATES_KEY,
  normalizeJobTemplates,
  upsertJobTemplate,
} from "./job-templates"

test("createJobTemplate stores only safe reusable setup fields", () => {
  const template = createJobTemplate(
    {
      id: "template_1",
      name: " Interior repaint ",
      createdAt: 10,
      updatedAt: 20,
      trade: "painting",
      documentType: "Estimate",
      state: "ca",
      scopeChange: " Paint 3 bedrooms, walls and ceilings. ",
      paintScope: "walls_ceilings",
      notes: " Repeat apartment turn scope. ",
    },
    99
  )

  assert.deepEqual(template, {
    id: "template_1",
    name: "Interior repaint",
    createdAt: 10,
    updatedAt: 20,
    trade: "painting",
    documentType: "Estimate",
    state: "CA",
    scopeChange: "Paint 3 bedrooms, walls and ceilings.",
    paintScope: "walls_ceilings",
    notes: "Repeat apartment turn scope.",
  })
})

test("createJobTemplate rejects empty scope starts", () => {
  const template = createJobTemplate({
    name: "Empty",
    trade: "painting",
    documentType: "Estimate",
    state: "CA",
    scopeChange: "   ",
    paintScope: "walls",
  })

  assert.equal(template, null)
})

test("normalizeJobTemplates strips generated output and invalid stored fields", () => {
  const normalized = normalizeJobTemplates([
    {
      id: "template_1",
      name: "LVP install",
      createdAt: 1,
      updatedAt: 2,
      trade: "flooring",
      documentType: "Estimate",
      state: "TX",
      scopeChange: "Install 600 sqft LVP flooring.",
      paintScope: "full",
      notes: "Builder supplied flooring.",
      result: "Generated customer proposal should not persist here.",
      pricing: { total: 12000 },
      photos: ["data:image/png;base64,abc"],
      approvalLink: "https://example.com/approve",
    },
    {
      id: "bad_blank_scope",
      name: "Bad",
      trade: "painting",
      documentType: "Estimate",
      state: "CA",
      scopeChange: "",
    },
  ])

  assert.equal(normalized.length, 1)
  assert.deepEqual(Object.keys(normalized[0]).sort(), [
    "createdAt",
    "documentType",
    "id",
    "name",
    "notes",
    "paintScope",
    "scopeChange",
    "state",
    "trade",
    "updatedAt",
  ])
  assert.equal((normalized[0] as Record<string, unknown>).result, undefined)
  assert.equal((normalized[0] as Record<string, unknown>).pricing, undefined)
  assert.equal(normalized[0].paintScope, "full")
})

test("upsertJobTemplate preserves original createdAt and sorts latest first", () => {
  const first = createJobTemplate(
    {
      id: "template_1",
      name: "Original name",
      createdAt: 10,
      updatedAt: 20,
      trade: "painting",
      documentType: "Estimate",
      state: "CA",
      scopeChange: "Paint bedrooms.",
      paintScope: "walls",
    },
    20
  )
  const second = createJobTemplate(
    {
      id: "template_2",
      name: "Bathroom tile",
      createdAt: 30,
      updatedAt: 30,
      trade: "bathroom_tile",
      documentType: "Estimate",
      state: "CA",
      scopeChange: "Retile shower surround.",
      paintScope: null,
    },
    30
  )
  const updated = createJobTemplate(
    {
      id: "template_1",
      name: "Updated name",
      createdAt: 99,
      updatedAt: 40,
      trade: "painting",
      documentType: "Estimate",
      state: "CA",
      scopeChange: "Paint bedrooms and hallway.",
      paintScope: "walls",
    },
    40
  )

  assert.ok(first)
  assert.ok(second)
  assert.ok(updated)

  const templates = upsertJobTemplate(upsertJobTemplate([first], second), updated)

  assert.deepEqual(
    templates.map((template) => template.id),
    ["template_1", "template_2"]
  )
  assert.equal(templates[0].createdAt, 10)
  assert.equal(templates[0].updatedAt, 40)
  assert.equal(templates[0].name, "Updated name")
})

test("deleteJobTemplate removes a template by id", () => {
  const templates = normalizeJobTemplates([
    {
      id: "template_1",
      name: "Drywall patch",
      createdAt: 1,
      updatedAt: 1,
      trade: "drywall",
      documentType: "Estimate",
      state: "WA",
      scopeChange: "Patch and texture drywall.",
      paintScope: null,
    },
  ])

  assert.deepEqual(deleteJobTemplate(templates, "template_1"), [])
})

test("getJobTemplateApplyPayload returns only estimator input fields", () => {
  const [template] = normalizeJobTemplates([
    {
      id: "template_1",
      name: "Fixture replacement",
      createdAt: 1,
      updatedAt: 1,
      trade: "electrical",
      documentType: "Estimate",
      state: "OR",
      scopeChange: "Replace 5 light fixtures.",
      paintScope: null,
      pricing: { total: 1000 },
      result: "Do not apply generated output.",
    },
  ])

  assert.deepEqual(getJobTemplateApplyPayload(template), {
    documentType: "Estimate",
    trade: "electrical",
    state: "OR",
    scopeChange: "Replace 5 light fixtures.",
    paintScope: null,
  })
})

test("JOB_TEMPLATES_KEY uses the V1 localStorage namespace", () => {
  assert.equal(JOB_TEMPLATES_KEY, "jobestimatepro_templates_v1")
})
