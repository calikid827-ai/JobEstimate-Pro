import test from "node:test"
import assert from "node:assert/strict"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SupabaseStudyStore, STUDY_BUCKET } from "./supabase-store"
import type { Artifact, Study, StudyAttempt } from "./types"

const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222"
const studyId = "33333333-3333-4333-8333-333333333333", version = "44444444-4444-4444-8444-444444444444", artifactId = "55555555-5555-4555-8555-555555555555"
function snapshot(): Study { return { id: studyId, ownerId: owner, title: "Synthetic adapter test", revision: 2, sourceRevision: 1, documents: [{ id: version, name: "Synthetic.pdf", sha256: "synthetic-hash", pageCount: 1, bytes: 4, originalArtifactId: artifactId, active: true, pages: [] }], findings: [], decisions: [], attempts: [], synthesis: "pending", createdAt: "2026-01-01", updatedAt: "2026-01-01" } }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...(Array.isArray(value) ? { "Content-Range": value.length ? `0-${value.length - 1}/${value.length}` : "*/0" } : {}) } }) }
function adapter(transport: typeof fetch) {
  const client = createClient("https://synthetic.invalid", "synthetic-server-key-not-a-credential", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport } })
  const store = new SupabaseStudyStore()
  // Explicit injection into the actual adapter in this test; no production selector.
  ;(store as unknown as { client: SupabaseClient }).client = client
  return store
}
function row(s = snapshot()) { return { id: s.id, owner_id: s.ownerId, revision: s.revision, source_revision: s.sourceRevision, snapshot: s } }

test("production store refuses missing schema/private-bucket readiness instead of falling back", async () => {
  let calls = 0
  const store = adapter(async (input) => { const u = new URL(String(input)); assert.equal(u.pathname, "/rest/v1/rpc/plan_study_ready"); calls++; return response(0) })
  await assert.rejects(store.list(owner), (e: unknown) => (e as { code: string }).code === "STUDY_NOT_CONFIGURED")
  assert.equal(calls, 1)
})
test("production PostgREST owner constraints deny cross-owner metadata before private download", async () => {
  let downloads = 0
  const store = adapter(async (input) => {
    const u = new URL(String(input))
    if (u.pathname.endsWith("/plan_study_ready")) return response(1)
    if (u.pathname.endsWith("/plan_studies")) { assert.equal(u.searchParams.get("owner_id"), `eq.${other}`); assert.equal(u.searchParams.get("id"), `eq.${studyId}`); return response([]) }
    if (u.pathname.startsWith("/storage/")) downloads++
    throw new Error("UNEXPECTED_SYNTHETIC_TRANSPORT")
  })
  await assert.rejects(store.getArtifact(other, studyId, artifactId), (e: unknown) => (e as { code: string }).code === "STUDY_NOT_FOUND")
  assert.equal(downloads, 0)
})
test("production artifact reads use retained membership and server-selected private keys", async () => {
  const meta: Artifact = { id: artifactId, ownerId: owner, studyId, documentVersionId: version, kind: "original", storageKey: `${owner}/${studyId}/${version}/${artifactId}`, mime: "application/pdf", sha256: "synthetic-hash" }
  const paths: string[] = []
  const store = adapter(async (input) => {
    const u = new URL(String(input)); paths.push(u.pathname)
    if (u.pathname.endsWith("/plan_study_ready")) return response(1)
    if (u.pathname.endsWith("/plan_studies")) { assert.equal(u.searchParams.get("owner_id"), `eq.${owner}`); return response([row()]) }
    if (u.pathname.endsWith("/plan_study_attempts")) { assert.equal(u.searchParams.get("owner_id"), `eq.${owner}`); assert.equal(u.searchParams.get("study_id"), `eq.${studyId}`); return response([]) }
    if (u.pathname.endsWith("/plan_study_artifacts")) { assert.equal(u.searchParams.get("owner_id"), `eq.${owner}`); assert.equal(u.searchParams.get("study_id"), `eq.${studyId}`); assert.equal(u.searchParams.get("id"), `eq.${artifactId}`); return response([{ record: meta }]) }
    if (u.pathname === `/storage/v1/object/${STUDY_BUCKET}/${meta.storageKey}`) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "application/pdf" } })
    throw new Error("UNEXPECTED_SYNTHETIC_TRANSPORT")
  })
  assert.deepEqual([...(await store.getArtifact(owner, studyId, artifactId)).bytes], [1, 2, 3, 4])
  assert.equal(paths.filter((p) => p.startsWith("/storage/")).length, 1)
  meta.documentVersionId = "66666666-6666-4666-8666-666666666666"
  await assert.rejects(store.getArtifact(owner, studyId, artifactId), (e: unknown) => (e as { code: string }).code === "STUDY_EVIDENCE_UNAVAILABLE")
  assert.equal(paths.filter((p) => p.startsWith("/storage/")).length, 1)
})
test("production claim/completion call atomic RPCs with exact owner, study, revision and claim identities", async () => {
  const s = snapshot(), attempt: StudyAttempt = { id: "66666666-6666-4666-8666-666666666666", ownerId: owner, studyId, sourceRevision: 1, sourceVersions: [{ documentVersionId: version, sha256: "synthetic-hash" }], kind: "page", pageId: "page", idempotencyKey: "synthetic-idempotency", status: "running", claimToken: "77777777-7777-4777-8777-777777777777", reservation: { inputTokens: 200000, outputTokens: 6000 }, createdAt: "2026-01-01", leaseExpiresAt: "2099-01-01" }
  const mutations: string[] = []
  const store = adapter(async (input, init) => {
    const u = new URL(String(input))
    if (u.pathname.endsWith("/plan_study_ready")) return response(1)
    if (u.pathname.endsWith("/plan_studies")) return response([row(s)])
    if (u.pathname.endsWith("/plan_study_attempts")) return response([{ record: attempt }])
    if (u.pathname.endsWith("/plan_study_claim")) {
      mutations.push("claim"); const body = JSON.parse(String(init?.body)); assert.deepEqual(body, { p_owner: owner, p_study: studyId, p_expected_revision: 2, p_spec: { idempotencyKey: attempt.idempotencyKey, kind: "page", pageId: "page", reservation: attempt.reservation } }); return response({ attempt, acquired: true, study: { ...s, attempts: [attempt] } })
    }
    if (u.pathname.endsWith("/plan_study_complete")) {
      mutations.push("complete"); const body = JSON.parse(String(init?.body)); assert.equal(body.p_owner, owner); assert.equal(body.p_study, studyId); assert.equal(body.p_attempt, attempt.id); assert.equal(body.p_claim, attempt.claimToken); assert.equal(body.p_source_revision, 1); assert.equal(body.p_completion.status, "unknown"); return response(null)
    }
    throw new Error("UNEXPECTED_SYNTHETIC_TRANSPORT")
  })
  assert.equal((await store.claimAttempt(owner, studyId, 2, { idempotencyKey: attempt.idempotencyKey, kind: "page", pageId: "page", reservation: attempt.reservation })).acquired, true)
  await store.completeAttempt(owner, studyId, attempt, { status: "unknown", errorCode: "PROVIDER_OUTCOME_UNKNOWN" })
  assert.deepEqual(mutations, ["claim", "complete"])
})

test("recorded attempts paginate completely even when the REST row cap is smaller than the requested range", async () => {
  const total = 451
  let pages = 0
  const store = adapter(async (input) => {
    const u = new URL(String(input))
    if (u.pathname.endsWith("/plan_study_ready")) return response(1)
    if (u.pathname.endsWith("/plan_studies")) return response([row()])
    if (u.pathname.endsWith("/plan_study_attempts")) {
      const offset = Number(u.searchParams.get("offset") || 0)
      const count = Math.min(50, total - offset)
      pages++
      return new Response(JSON.stringify(Array.from({ length: count }, (_, i) => ({ record: { id: `synthetic-attempt-${offset + i}` } }))), { headers: { "Content-Type": "application/json", "Content-Range": `${offset}-${offset + count - 1}/${total}` } })
    }
    throw new Error("UNEXPECTED_SYNTHETIC_TRANSPORT")
  })
  const saved = await store.get(owner, studyId)
  assert.equal(saved.attempts.length, total)
  assert.equal(new Set(saved.attempts.map((a) => a.id)).size, total)
  assert.equal(pages, 10)
})

test("reopening refuses a snapshot whose revision changes while its attempt pages are being read", async () => {
  const store = adapter(async (input) => {
    const u = new URL(String(input))
    if (u.pathname.endsWith("/plan_study_ready")) return response(1)
    if (u.pathname.endsWith("/plan_studies")) return response([row({ ...snapshot(), revision: u.searchParams.get("select") === "revision" ? 3 : 2 })])
    if (u.pathname.endsWith("/plan_study_attempts")) return response([])
    throw new Error("UNEXPECTED_SYNTHETIC_TRANSPORT")
  })
  await assert.rejects(store.get(owner, studyId), (error: unknown) => (error as { code: string }).code === "STUDY_CHANGED")
})
