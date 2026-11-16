import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SupabaseProjectAnalysisStore } from "./supabase-store"
import { ANALYSIS_LIMITS, type ProjectAnalysisRecord } from "./types"
import { projectAnalysisResultIdentity } from "./identity"

const owner = "synthetic-owner", project = "synthetic-project", id = "synthetic-attempt"
const hash = createHash("sha256").update("synthetic").digest("hex")
function record(): ProjectAnalysisRecord {
  return { id, ownerId: owner, projectId: project, fingerprint: hash, attemptNumber: 1, sourceVersions: [{ fileId: "source-a", sourceVersion: 1, sourceSha256: hash, pageNumber: 1, role: "target", name: "Synthetic.txt", relativePath: "Plans/Synthetic.txt", mimeType: "text/plain", textSha256: hash, textCharacters: 9, imageSha256: null, textStatus: "complete", imageStatus: "not_provided", issues: [] }], status: "running", createdAt: "2026-11-16T12:00:00Z", leaseExpiresAt: "2026-11-16T12:05:00Z", modelLabel: "Synthetic contract fixture", resultIdentity: null, result: null }
}
type Call = { method: string; args: unknown[] }
function client(responses: Array<{ data: unknown; error: { message: string } | null }>) {
  const calls: Call[] = []
  const query = new Proxy({}, { get(_target, method) {
    if (method === "then") return (resolve: (value: unknown) => unknown) => Promise.resolve(responses.shift() ?? { data: null, error: null }).then(resolve)
    return (...args: unknown[]) => { calls.push({ method: String(method), args }); return query }
  } })
  return { calls, db: { from: (table: string) => { calls.push({ method: "from", args: [table] }); return query }, rpc: async (...args: unknown[]) => { calls.push({ method: "rpc", args }); return responses.shift() ?? { data: null, error: null } } } as unknown as SupabaseClient }
}
test("real durable adapter scopes every paginated history/read query by owner and project", async () => {
  const rows = Array.from({ length: ANALYSIS_LIMITS.recordsPerPage }, (_, n) => ({ record: { ...record(), id: `attempt-${n}` }, sequence_no: 200 - n }))
  const fake = client([{ data: 1, error: null }, { data: rows, error: null }, { data: [{ record: record(), sequence_no: 1 }], error: null }, { data: { record: record() }, error: null }])
  const store = new SupabaseProjectAnalysisStore({ client: fake.db }); await store.ready()
  const first = await store.list(owner, project); assert.equal(first.analyses.length, 20); assert.equal(first.nextCursor, "181")
  const second = await store.list(owner, project, first.nextCursor!); assert.equal(second.nextCursor, null)
  const reopened = await store.get(owner, project, id); assert.equal(reopened.id, id)
  assert.deepEqual(fake.calls.filter(c => c.method === "from").map(c => c.args), [["project_analysis_attempts"], ["project_analysis_attempts"], ["project_analysis_attempts"]])
  assert.equal(fake.calls.filter(c => c.method === "eq" && c.args[0] === "owner_id" && c.args[1] === owner).length, 3)
  assert.equal(fake.calls.filter(c => c.method === "eq" && c.args[0] === "project_id" && c.args[1] === project).length, 3)
  assert.ok(fake.calls.some(c => c.method === "lt" && c.args[0] === "sequence_no" && c.args[1] === 181))
  await assert.rejects(store.list(owner, project, "1;select"), { code: "ANALYSIS_CURSOR_INVALID" })
})
test("claim uses the durable bounded RPC and strips privileged token/reservation from record reads", async () => {
  const reservation = { inputTokens: 200000, outputTokens: 6000 }, current = record()
  const fake = client([{ data: { acquired: true, record: current, claimToken: "synthetic-private-claim", reservation }, error: null }, { data: { record: current }, error: null }])
  const store = new SupabaseProjectAnalysisStore({ client: fake.db })
  const claimed = await store.claim(owner, project, { fingerprint: hash, sourceVersions: current.sourceVersions, reservation, modelLabel: "Synthetic contract fixture", retryFailed: false })
  assert.equal(claimed.acquired, true); assert.equal(claimed.attempt.claimToken, "synthetic-private-claim")
  const spec = fake.calls[0].args[1] as { p_owner: string; p_project: string; p_spec: { reservation: unknown } }
  assert.equal(fake.calls[0].args[0], "project_analysis_claim"); assert.equal(spec.p_owner, owner); assert.equal(spec.p_project, project); assert.deepEqual(spec.p_spec.reservation, reservation)
  const publicRead = await store.get(owner, project, id); assert.equal("claimToken" in publicRead, false); assert.equal("reservation" in publicRead, false)
})
test("foreign/malformed stored bindings and unknown allowance guard errors fail closed", async () => {
  const foreign = client([{ data: { record: { ...record(), ownerId: "another-owner" } }, error: null }])
  await assert.rejects(new SupabaseProjectAnalysisStore({ client: foreign.db }).get(owner, project, id), { code: "ANALYSIS_NOT_CONFIGURED" })
  const held = client([{ data: null, error: { message: "STUDY_RECONCILIATION_REQUIRED" } }])
  await assert.rejects(new SupabaseProjectAnalysisStore({ client: held.db }).claim(owner, project, { fingerprint: hash, sourceVersions: record().sourceVersions, reservation: { inputTokens: 200000, outputTokens: 6000 }, modelLabel: "Synthetic", retryFailed: false }), { code: "ANALYSIS_RECONCILIATION_REQUIRED" })
})
test("record identity survives JSON key order changes and rejects changed result contents", async () => {
  const complete = { ...record(), status: "complete" as const, usage: { inputTokens: 10, outputTokens: 5 }, result: { citations: [], findings: [], takeoffInputs: [], reviewStatus: "reviewed" as const, limitations: [] } }
  complete.resultIdentity = projectAnalysisResultIdentity(complete, complete.result)
  const reordered = Object.fromEntries(Object.entries(complete).reverse())
  const valid = client([{ data: { record: reordered }, error: null }])
  assert.equal((await new SupabaseProjectAnalysisStore({ client: valid.db }).get(owner, project, id)).resultIdentity, complete.resultIdentity)
  const changed = client([{ data: { record: { ...complete, result: { ...complete.result, limitations: ["Changed recorded wording"] } } }, error: null }])
  await assert.rejects(new SupabaseProjectAnalysisStore({ client: changed.db }).get(owner, project, id), { code: "ANALYSIS_NOT_CONFIGURED" })
})
test("review-only SQL uses shared atomic allowance protection in both directions without replenishment", async () => {
  const sql = await readFile(new URL("../../../database/project-analysis-v1.sql", import.meta.url), "utf8")
  assert.match(sql, /REVIEW ONLY/); assert.doesNotMatch(sql, /security\s+definer/i)
  assert.doesNotMatch(sql, /insert\s+into\s+public\.plan_study_allowances/i)
  assert.doesNotMatch(sql, /(?:set|,)\s*max_(?:attempts|input_tokens|output_tokens)\s*=/i)
  assert.match(sql, /before update of reserved_attempts on public\.plan_study_allowances/i)
  assert.match(sql, /old\.reserved_attempts>0/); assert.match(sql, /from public\.plan_study_attempts a where a\.owner_id=new\.owner_id/); assert.match(sql, /from public\.project_analysis_attempts a where a\.owner_id=new\.owner_id/)
  assert.match(sql, /record->>'status' in \('running','unknown'\)/)
  assert.match(sql, /new\.reserved_attempts>old\.reserved_attempts/)
  assert.match(sql, /from public\.project_library_heads where owner_id=p_owner and project_id=p_project for update/)
  assert.match(sql, /from public\.plan_study_allowances where owner_id=p_owner for update/)
  assert.match(sql, /f\.source_version=\(source->>'sourceVersion'\)::integer/)
  assert.match(sql, /if attempt\.record->>'status'<>'running' then return/)
  assert.match(sql, /set record=next_record/)
})
