/** SYNTHETIC PROVIDER CONTRACT, not captured or real-model interpretation.
 * Reads the actual SDK packet's retained text and image metadata, then emits
 * structured source facts. It never supplies finished estimate rows or prices.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import OpenAI from "openai"
import { createProjectAnalysisProvider } from "../../../app/lib/project-analysis/provider.ts"

const emptyInputs = () => Object.fromEntries(["lengthFt", "widthFt", "wallHeightFt", "openingsSqft", "netAreaSqft", "count", "substrate", "condition", "coats", "finish", "extent"].map(key => [key, null]))
const fact = (value, citationIds, origin = "explicit_text") => ({ value, citationIds, origin })

export function syntheticInterpretation(sources) {
  const citations = [], findings = [], takeoffInputs = []
  function text(source, pattern, id) {
    const quote = source?.text.match(pattern)?.[0]
    if (!quote) return null
    citations.push({ id, fileId: source.fileId, sourceVersion: source.sourceVersion, sourceSha256: source.sourceSha256, pageNumber: source.pageNumber, anchor: { kind: "text", quote } })
    return id
  }
  function image(source, id, visibleText = null, bounds = { x: .14, y: .18, width: .72, height: .55 }) {
    if (!source?.imageProvided) return null
    citations.push({ id, fileId: source.fileId, sourceVersion: source.sourceVersion, sourceSha256: source.sourceSha256, pageNumber: source.pageNumber, anchor: { kind: "image", bounds, visibleText } })
    return id
  }
  const plan = sources.find(source => source.name === "Cedar plan.pdf")
  const specification = sources.find(source => source.name === "Painting specification.pdf" && source.relativePath.startsWith("AI Review/"))
  const addendum = sources.find(source => source.name === "Addendum 03.pdf")
  const length = text(plan, /Cedar office inside length is [0-9.]+ ft\./, "cedar-length")
  const width = text(plan, /Cedar office inside width is [0-9.]+ ft\./, "cedar-width")
  const height = text(plan, /Cedar office wall height is [0-9.]+ ft\./, "cedar-height")
  const extent = text(plan, /Finish extent is full height for Cedar office walls\./, "cedar-extent")
  const scope = text(specification, /Cedar office walls and ceilings receive paint on drywall\./, "cedar-scope")
  const conditions = text(specification, /Cedar office work condition is repaint, with [1-6] coats\./, "cedar-conditions")
  const openings = text(addendum, /Cedar office net openings deduction is [0-9.]+ sqft\./, "cedar-openings")
  const numeric = id => Number(citations.find(citation => citation.id === id).anchor.quote.match(/[0-9]+(?:\.[0-9]+)?/)?.[0])
  if (length && width && height && extent && scope && conditions && openings) {
    findings.push({ id: "cedar-requirement", kind: "requirement", title: "Cedar painting connected across plan, specification and addendum", detail: "The dimensional plan, painting specification and openings addendum apply to the same explicitly named work. These are proposed inputs for contractor review.", citationIds: [length, width, height, extent, scope, conditions, openings], relatedFindingIds: [], affectedWorkIds: ["cedar-walls", "cedar-ceilings"], limitations: [] })
    for (const surface of ["walls", "ceilings"]) {
      const inputs = { ...emptyInputs(), lengthFt: fact(numeric(length), [length]), widthFt: fact(numeric(width), [width]), substrate: fact("drywall", [scope]), condition: fact("repaint", [conditions]), coats: fact(numeric(conditions), [conditions]), finish: fact("paint", [scope]), extent: fact("full height", [extent]) }
      if (surface === "walls") { inputs.wallHeightFt = fact(numeric(height), [height]); inputs.openingsSqft = fact(numeric(openings), [openings]) }
      takeoffInputs.push({ id: "cedar-" + surface, findingIds: ["cedar-requirement"], location: fact("Cedar office", [length]), surface: fact(surface, [scope]), inputs, limitations: [] })
    }
  } else if (plan) {
    const cite = length ?? text(plan, /[^\n]+Cedar office[^\n]+/, "cedar-missing")
    if (cite) findings.push({ id: "cedar-question", kind: "question", title: "Cedar work needs its related sources", detail: "Supply the painting specification and openings addendum before calculating this work. Missing references do not establish their contents.", citationIds: [cite], relatedFindingIds: [], affectedWorkIds: [], limitations: ["The supplied packet does not establish all required painting inputs."] })
  }
  const elm = sources.find(source => source.name === "Elm image-only plan.pdf")
  if (elm?.imageProvided) {
    const location = image(elm, "elm-location", "Elm office", { x: .15, y: .23, width: .6, height: .06 })
    const walls = image(elm, "elm-walls-area", "Net wall area 180 sqft", { x: .15, y: .30, width: .7, height: .07 })
    const ceiling = image(elm, "elm-ceiling-area", "Ceiling area 90 sqft", { x: .15, y: .37, width: .7, height: .07 })
    const full = image(elm, "elm-extent", "Full-height paint extent", { x: .15, y: .45, width: .7, height: .07 })
    const workScope = text(specification, /Elm office walls and ceilings receive paint on drywall\./, "elm-scope")
    const workCondition = text(specification, /Elm office work condition is repaint, with [1-6] coats\./, "elm-conditions")
    if (workScope && workCondition) {
      findings.push({ id: "elm-requirement", kind: "requirement", title: "Printed Elm areas with applicable painting conditions", detail: "The synthetic image-only plan has printed net areas; this contract fixture transcribes annotations, not drawing geometry or a calibrated measurement.", citationIds: [location, walls, ceiling, full, workScope, workCondition], relatedFindingIds: [], affectedWorkIds: ["elm-walls", "elm-ceilings"], limitations: [] })
      for (const surface of ["walls", "ceilings"]) takeoffInputs.push({ id: "elm-" + surface, findingIds: ["elm-requirement"], location: fact("Elm office", [location], "printed_visual"), surface: fact(surface, [workScope]), inputs: { ...emptyInputs(), netAreaSqft: fact(surface === "walls" ? 180 : 90, [surface === "walls" ? walls : ceiling], "printed_visual"), substrate: fact("drywall", [workScope]), condition: fact("repaint", [workCondition]), coats: fact(numeric(workCondition), [workCondition]), finish: fact("paint", [workScope]), extent: fact("full height", [full], "printed_visual") }, limitations: [] })
    }
  }
  const unknown = sources.find(source => source.name === "Unknown extent.pdf")
  if (unknown) {
    const general = text(unknown, /Birch office general wall assignment is PT-1 paint\./, "birch-general")
    const specific = text(unknown, /Birch office PT-1 applies above the chair rail\./, "birch-specific")
    if (general && specific) findings.push({ id: "birch-question", kind: "question", title: "Confirm Birch lower-wall finish and rail extent", detail: "The general and above-rail instructions can both be satisfied. The lower-wall finish and rail extent remain unanswered; the supplied text does not establish a conflict.", citationIds: [general, specific], relatedFindingIds: [], affectedWorkIds: [], limitations: ["Dimensions and lower-wall scope are not established."] })
  }
  const photo = sources.find(source => source.name === "Unlocated paint condition.jpg")
  if (photo?.imageProvided) {
    const cite = image(photo, "visible-condition")
    findings.push({ id: "photo-condition", kind: "observation", title: "Visible coating condition needs a location and repair measurement", detail: "Patchy coating is visible in the authored condition sample. The photo does not establish a room identity, dimensions or repair area; confirm these before adding repair work.", citationIds: [cite], relatedFindingIds: [], affectedWorkIds: [], limitations: ["No measured repair quantity or verified work location."] })
  }
  const limited = findings.some(finding => finding.kind === "question" || finding.id === "photo-condition") || sources.some(source => source.issues.length)
  return { citations, findings, takeoffInputs, reviewStatus: limited ? "limited" : "reviewed", limitations: limited ? ["This synthetic contract response contains unanswered scope or limited source coverage. It does not establish a complete package review."] : [] }
}

export function createSyntheticSdkReader() {
  const audit = { synthetic: true, actualSdkSerialization: true, calls: [], nextOutcome: "valid" }
  const fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "127.0.0.1")
    const body = JSON.parse(init.body)
    const packet = JSON.parse(body.input[0].content[0].text)
    const images = body.input[0].content.filter(part => part.type === "input_image")
    const result = syntheticInterpretation(packet.sources)
    audit.calls.push({ model: body.model, maxOutputTokens: body.max_output_tokens, store: body.store, stream: body.stream, sourceCount: packet.sources.length, targetCount: packet.sources.filter(source => source.role === "target").length, images: images.map(image => ({ mime: image.image_url.split(";")[0].slice(5), bytes: Buffer.from(image.image_url.split(",")[1], "base64").length, sha256: createHash("sha256").update(Buffer.from(image.image_url.split(",")[1], "base64")).digest("hex") })), sources: packet.sources.map(({ text, ...source }) => ({ ...source, actualTextHash: createHash("sha256").update(text).digest("hex") })), result, instructions: body.instructions })
    const outcome = audit.nextOutcome; audit.nextOutcome = "valid"
    if (outcome === "unknown") throw new Error("Synthetic transport outcome unknown; no network request was made.")
    if (outcome === "invalid") result.citations[0].anchor = { kind: "text", quote: "SYNTHETIC INVALID QUOTE NOT IN THE SOURCE" }
    return new Response(JSON.stringify({ id: "resp_synthetic", object: "response", created_at: 1794816000, status: outcome === "incomplete" ? "incomplete" : "completed", model: body.model, output: [{ id: "msg_synthetic", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(result), annotations: [] }] }], usage: { input_tokens: 4800, output_tokens: 900, total_tokens: 5700 } }), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  const provider = createProjectAnalysisProvider({ clientFactory: () => new OpenAI({ apiKey: "synthetic-not-a-secret", baseURL: "http://127.0.0.1:1/v1", maxRetries: 0, timeout: 60000, fetch }) })
  return { provider, audit }
}
