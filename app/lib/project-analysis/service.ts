import { createHash } from "node:crypto"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { preparePdfPage } from "../plan-study/pdf"
import { ProviderOutcomeError } from "../plan-study/runner"
import { getProjectFile, getProjectPage, withProjectDecoder } from "../project-library/service"
import { prepareProjectImage } from "../project-library/preparation"
import { ProjectLibraryError, type ProjectLibraryStore } from "../project-library/types"
import { ANALYSIS_LIMITS, ProjectAnalysisError, type AnalysisPacket, type AnalysisPacketSource, type AnalysisRequest, type AnalysisResult, type AnalysisSource, type AnalysisSourceRef } from "./types"
import { analysisContext, PROJECT_ANALYSIS_INSTRUCTION_VERSION, PROJECT_ANALYSIS_MODEL, type ProjectAnalysisProvider } from "./provider"
import { analysisRequestSchema, sourceKey, validateAnalysisResult } from "./validation"
import { publicAnalysis, type AnalysisStore } from "./store"
import { canonicalAnalysis, projectAnalysisResultIdentity } from "./identity"

const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")
const identityMatches = (file: { id: string; sourceVersion: number; sha256: string; active: boolean; status: string }, source: AnalysisSourceRef) => file.id === source.fileId && file.sourceVersion === source.sourceVersion && file.sha256 === source.sourceSha256 && file.active && file.status === "uploaded"
const sourceMetadata = ({ image, text, ...source }: AnalysisPacketSource): AnalysisSource => { void image; void text; return source }
export async function buildAnalysisPacket(library: ProjectLibraryStore, ownerId: string, projectId: string, raw: AnalysisRequest, options: { renderImages?: boolean } = {}): Promise<AnalysisPacket> {
  const parsed = analysisRequestSchema.safeParse(raw)
  if (!parsed.success) throw new ProjectAnalysisError(400, "ANALYSIS_INPUT_INVALID", "Choose one to four target pages/photos and up to eight context pages with exact source identities.")
  const selected = [...parsed.data.targets.map(ref => ({ ...ref, role: "target" as const })), ...parsed.data.context.map(ref => ({ ...ref, role: "context" as const }))]
  selected.sort((a, b) => (a.role === b.role ? 0 : a.role === "target" ? -1 : 1) || a.fileId.localeCompare(b.fileId) || a.pageNumber - b.pageNumber)
  if (new Set(selected.map(sourceKey)).size !== selected.length) throw new ProjectAnalysisError(400, "ANALYSIS_INPUT_INVALID", "Select each exact source page once as target or context.")
  const sources: AnalysisPacketSource[] = []; let imageCount = 0, imageBytes = 0
  const preparationStarted = performance.now()
  for (const ref of selected) {
    const file = await getProjectFile(library, ownerId, projectId, ref.fileId)
    if (file.ownerId !== ownerId || file.projectId !== projectId || !identityMatches(file, ref)) throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "A selected source version changed or is not uploaded. Refresh the project files before analysis.")
    if (file.mimeType.startsWith("image/") && ref.pageNumber !== 1 || file.pageCount !== null && ref.pageNumber > file.pageCount) throw new ProjectAnalysisError(404, "ANALYSIS_SOURCE_UNAVAILABLE", "A selected physical page does not exist in this source version.")
    const source: AnalysisPacketSource = { fileId: file.id, sourceVersion: file.sourceVersion, sourceSha256: file.sha256, pageNumber: ref.pageNumber, role: ref.role, name: file.name, relativePath: file.relativePath, mimeType: file.mimeType, text: "", textSha256: hash(""), textCharacters: 0, imageSha256: null, textStatus: file.mimeType.startsWith("image/") ? "empty" : "unavailable", imageStatus: "not_provided", issues: [] }
    if (file.mimeType === "application/pdf" || file.mimeType.startsWith("text/")) {
      try {
        const page = await getProjectPage(library, ownerId, projectId, file.id, ref.pageNumber)
        source.textStatus = page.extraction
        if (page.extraction === "complete") { source.text = page.text; source.textCharacters = page.text.length; source.textSha256 = hash(page.text) }
        if (page.extraction === "failed") source.issues.push("Prepared text failed; retry this page in Project Files.")
      } catch { source.issues.push("Prepared text is unavailable; prepare/retry this page in Project Files.") }
    }
    const visual = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/")
    if (visual && options.renderImages !== false && imageCount < ANALYSIS_LIMITS.images) {
      try {
        const original = await library.download(ownerId, file)
        if (original.byteLength !== file.size || hash(original) !== file.sha256) throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "The retained original failed its source integrity check. No provider attempt was made.")
        let jpeg: Uint8Array, width: number, height: number
        if (file.mimeType === "application/pdf") {
          const rendered = await preparePdfPage(original, ref.pageNumber)
          const bitmap = await loadImage(rendered.png), scale = Math.min(1, ANALYSIS_LIMITS.imageSide / Math.max(bitmap.width, bitmap.height))
          width = Math.max(1, Math.round(bitmap.width * scale)); height = Math.max(1, Math.round(bitmap.height * scale))
          const canvas = createCanvas(width, height); canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height)
          jpeg = new Uint8Array(canvas.toBuffer("image/jpeg", 85))
        } else {
          const prepared = await prepareProjectImage(original, file.mimeType)
          jpeg = prepared.bytes; width = prepared.processingWidth; height = prepared.processingHeight
          source.textStatus = "empty"
        }
        if (imageBytes + jpeg.byteLength > ANALYSIS_LIMITS.imageBytes) throw new Error("IMAGE_PACKET_LIMIT")
        source.image = { mime: "image/jpeg", bytes: jpeg, width, height }; source.imageSha256 = hash(jpeg); source.imageStatus = "provided"
        imageCount++; imageBytes += jpeg.byteLength
      } catch (error) {
        if (error instanceof ProjectAnalysisError) throw error
        source.imageStatus = "unsupported"
        source.issues.push(file.mimeType === "application/pdf" ? "Plan-page image is unavailable within the retained renderer's supported limits (including its 3 MiB PDF bound). Available text remains usable; visual review is incomplete." : "This retained image could not be safely prepared for this reader. Its original remains available; visual review is incomplete.")
      }
    } else if (visual && options.renderImages !== false) source.issues.push("The four-image batch limit was reached. This source was supplied as text only, if available; its image was not reviewed.")
    if (!visual && !file.mimeType.startsWith("text/")) { source.imageStatus = "unsupported"; source.issues.push("This source format is not supported by the package reader. Its original is retained.") }
    if (options.renderImages !== false && source.textStatus !== "complete" && !source.image) source.issues.push("No readable text or image from this selected page was supplied to the reader.")
    if (options.renderImages !== false && performance.now() - preparationStarted > 45000) throw new ProjectAnalysisError(503, "ANALYSIS_PREPARATION_LIMIT", "This visual batch exceeded its preparation time budget. Use fewer pages; no provider attempt was made.")
    sources.push(source)
  }
  if (options.renderImages !== false && !sources.some(source => source.role === "target" && (source.textStatus === "complete" || source.image))) throw new ProjectAnalysisError(422, "ANALYSIS_PREPARATION_REQUIRED", "None of the selected target pages/photos has readable prepared text or a supported image. Prepare/retry the files; no provider attempt was made.")
  // Original identities + prepared text and a fixed rendering recipe identify the
  // work before decoding images, so identical clicks reuse the durable record.
  const fingerprint = hash(JSON.stringify({ version: PROJECT_ANALYSIS_INSTRUCTION_VERSION, renderer: "retained-plan-v1-project-jpeg-1600-v1", model: PROJECT_ANALYSIS_MODEL, sources: sources.map(({ fileId, sourceVersion, sourceSha256, pageNumber, role, mimeType, textStatus, textSha256, textCharacters }) => ({ fileId, sourceVersion, sourceSha256, pageNumber, role, mimeType, textStatus, textSha256, textCharacters })) }))
  const packet = { ownerId, projectId, fingerprint, sources }
  analysisContext(packet)
  await verifyAnalysisSources(library, ownerId, projectId, sources)
  return packet
}
export async function verifyAnalysisSources(library: ProjectLibraryStore, ownerId: string, projectId: string, sources: AnalysisSource[]) {
  for (const source of sources) {
    const file = await getProjectFile(library, ownerId, projectId, source.fileId)
    if (file.ownerId !== ownerId || file.projectId !== projectId || !identityMatches(file, source)) throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "An analysis source was replaced or became unavailable. Earlier findings remain historical and cannot authorize this version.")
    if (file.mimeType === "application/pdf" || file.mimeType.startsWith("text/")) {
      let page
      try { page = await getProjectPage(library, ownerId, projectId, source.fileId, source.pageNumber) }
      catch (error) {
        if (source.textStatus === "unavailable" && error instanceof ProjectLibraryError && error.code === "PROJECT_PAGE_UNAVAILABLE") continue
        throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "Prepared source content could not be verified. Reopen the current source before using its analysis.")
      }
      const text = page.extraction === "complete" ? page.text : ""
      if (page.extraction !== source.textStatus || hash(text) !== source.textSha256) throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "Prepared source text or its extraction status changed. Reopen and analyze the current source version.")
    }
  }
}
/** Only this runner invokes the provider, after an atomic durable allowance claim. */
export async function runProjectAnalysis(deps: { library: ProjectLibraryStore; analyses: AnalysisStore; provider: ProjectAnalysisProvider }, ownerId: string, projectId: string, request: AnalysisRequest) {
  await deps.library.ready(); await deps.analyses.ready()
  const planned = await buildAnalysisPacket(deps.library, ownerId, projectId, request, { renderImages: false })
  const prior = await deps.analyses.latest(ownerId, projectId, planned.fingerprint)
  if (prior && (prior.status !== "failed" || !request.retryFailed)) {
    await verifyAnalysisSources(deps.library, ownerId, projectId, prior.sourceVersions)
    return prior
  }
  await deps.provider.ready()
  // Share the retained library's decoder queue and owner lease. Release both
  // before reserving provider usage; an identical cached result never decodes.
  const packet = await withProjectDecoder(deps.library, ownerId, projectId, request.targets[0].fileId, () => buildAnalysisPacket(deps.library, ownerId, projectId, request))
  if (packet.fingerprint !== planned.fingerprint) throw new ProjectAnalysisError(409, "ANALYSIS_SOURCE_CHANGED", "The selected source content changed while preparing the batch. Refresh before continuing.")
  const claimed = await deps.analyses.claim(ownerId, projectId, { fingerprint: packet.fingerprint, sourceVersions: packet.sources.map(sourceMetadata), reservation: { inputTokens: ANALYSIS_LIMITS.reservationInputTokens, outputTokens: ANALYSIS_LIMITS.outputTokens }, modelLabel: `${PROJECT_ANALYSIS_MODEL} · proposed model interpretation; contractor review required`, retryFailed: Boolean(request.retryFailed) })
  if (!claimed.acquired) return publicAnalysis(claimed.attempt)
  if (claimed.attempt.ownerId !== ownerId || claimed.attempt.projectId !== projectId || claimed.attempt.status !== "running" || claimed.attempt.fingerprint !== packet.fingerprint || canonicalAnalysis(claimed.attempt.sourceVersions) !== canonicalAnalysis(packet.sources.map(sourceMetadata))) throw new ProjectAnalysisError(503, "ANALYSIS_CLAIM_INVALID", "The durable review claim did not match the prepared source packet. No provider request was made; reopen its recorded state.")
  let invoked = false, usage: { inputTokens: number; outputTokens: number } | undefined, result: AnalysisResult
  try {
    await verifyAnalysisSources(deps.library, ownerId, projectId, claimed.attempt.sourceVersions)
    invoked = true
    const reviewed = await deps.provider.review(packet); usage = reviewed.usage
    result = validateAnalysisResult(reviewed.result, packet, claimed.attempt.id)
    await verifyAnalysisSources(deps.library, ownerId, projectId, packet.sources)
  } catch (error) {
    const measured = usage ?? (!invoked ? { inputTokens: 0, outputTokens: 0 } : error instanceof ProviderOutcomeError ? error.usage : undefined)
    const known = measured && Number.isSafeInteger(measured.inputTokens) && measured.inputTokens >= 0 && Number.isSafeInteger(measured.outputTokens) && measured.outputTokens >= 0
    return deps.analyses.complete(ownerId, projectId, claimed.attempt, { status: known ? "failed" : "unknown", ...(known ? { usage: measured } : {}), errorCode: error instanceof ProjectAnalysisError ? error.code : error instanceof ProviderOutcomeError ? error.code : "PROVIDER_OUTCOME_UNKNOWN" })
  }
  const resultIdentity = projectAnalysisResultIdentity(claimed.attempt, result)
  // Completion persistence is outside the catch: never repeat an ambiguous write.
  return deps.analyses.complete(ownerId, projectId, claimed.attempt, { status: "complete", result, resultIdentity, usage })
}
