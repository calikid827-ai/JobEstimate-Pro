import assert from "node:assert/strict"
import test from "node:test"
import * as moduleApi from "node:module"

const registerHooks = (moduleApi as unknown as { registerHooks: (hooks: {
  resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown
}) => { deregister: () => void } }).registerHooks

type Call = { table: string; action: string; payload: any; filters: Record<string, unknown> }
function database(resolve: (call: Call) => unknown) {
  const calls: Call[] = []
  return {
    calls,
    from(table: string) {
      const call: Call = { table, action: "select", payload: null, filters: {} }
      const query = {
        select() { return query },
        insert(payload: unknown) { call.action = "insert"; call.payload = payload; return query },
        eq(key: string, value: unknown) { call.filters[key] = value; return query },
        in(key: string, value: unknown) { call.filters[key] = value; return query },
        order() { return query }, limit() { return query },
        maybeSingle() { calls.push(call); return Promise.resolve(resolve(call)) },
        single() { calls.push(call); return Promise.resolve(resolve(call)) },
        then(onfulfilled: (value: unknown) => void, onrejected: (error: unknown) => void) {
          calls.push(call); return Promise.resolve(resolve(call)).then(onfulfilled, onrejected)
        },
      }
      return query
    },
  }
}

test("actual protected handlers verify bearer identity before private records, quota and privileged writes", async (t) => {
  const hook = registerHooks({ resolve(specifier, context, next) { return next(specifier === "next/server" ? "next/server.js" : specifier, context) } })
  const savedEnv = { ...process.env }
  const originalFetch = globalThis.fetch
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://owner-auth-synthetic.invalid"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public-key"
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-key"
  process.env.OPENAI_API_KEY = "synthetic-ai-disabled"
  process.env.NEXT_PUBLIC_SITE_URL = "https://jobestimatepro.test"
  const outbound: string[] = []
  let authReads = 0
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init)
    outbound.push(req.url)
    if (req.url.endsWith("/auth/v1/user")) {
      authReads++
      const token = req.headers.get("authorization")
      if (token === "Bearer owner-a" || token === "Bearer owner-b" || token === "Bearer dev-owner") {
        const owner = token === "Bearer owner-a" ? "a" : "b"
        return Response.json({ id: `verified-owner-${owner}`, email: token === "Bearer dev-owner" ? "test12345@gmail.com" : `owner-${owner}@example.test`, role: "authenticated", email_confirmed_at: "2026-10-20", is_anonymous: false })
      }
      return Response.json({ message: "Invalid or expired JWT", code: "bad_jwt" }, { status: 401 })
    }
    if (req.url.endsWith("/rest/v1/rpc/consume_free_generation")) {
      assert.equal(JSON.parse(await req.text()).p_email, "test12345@gmail.com")
      return Response.json([{ ok: false, reason: "free_limit_reached", usage_count: 3, free_limit: 3 }])
    }
    throw new Error(`External service disabled: ${req.url}`)
  }
  const estimate = { id: "same-local-id", documentType: "Estimate", result: "This Estimate covers painting.", jobDetails: { clientName: "Synthetic Client", jobName: "Synthetic Job" }, pricing: { labor: 100, materials: 0, subs: 0, markup: 20, total: 120 } }
  function req(path: string, token = "owner-a", body?: unknown) {
    return new Request(`https://jobestimatepro.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), origin: "https://jobestimatepro.test", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  try {
    const { handleApprovalSnapshotPost } = await import("./approvals/route")
    const { handleApprovalStatusGet } = await import("./approvals/status/route")
    const { handleEntitlementPost } = await import("./entitlement/route")
    const { handleCheckoutPost } = await import("./checkout/route")
    const { POST: generate } = await import("./generate/route")
    const untouched = database(() => { throw new Error("Rejected request touched persistence") })

    await t.test("missing, invalid, expired and forged authentication cannot share, sync or query access", async () => {
      for (const token of ["", "invalid", "expired", "forged"]) {
        for (const response of [
          await handleApprovalSnapshotPost(req("/api/approvals", token, { email: "owner-b@example.test", estimate }), untouched as any),
          await handleApprovalStatusGet(req("/api/approvals/status?email=owner-b@example.test&ownerSyncToken=stolen", token), untouched as any),
          await handleEntitlementPost(req("/api/entitlement", token, { email: "owner-b@example.test" }), untouched as any),
          await handleCheckoutPost(req("/api/checkout", token, { email: "owner-b@example.test" })),
          await generate(req("/api/generate", token, { email: "owner-b@example.test", scopeChange: "Paint wall." }) as Parameters<typeof generate>[0]),
        ]) {
          assert.equal(response.status, 401)
          assert.match(response.headers.get("cache-control") || "", /private, no-store/)
        }
      }
      assert.equal(untouched.calls.length, 0)
    })

    await t.test("a valid owner cannot select another owner through request email", async () => {
      const responses = [
        await handleApprovalSnapshotPost(req("/api/approvals", "owner-a", { email: "owner-b@example.test", estimate }), untouched as any),
        await handleApprovalStatusGet(req("/api/approvals/status?email=owner-b@example.test&ownerSyncToken=stolen"), untouched as any),
        await handleEntitlementPost(req("/api/entitlement", "owner-a", { email: "owner-b@example.test" }), untouched as any),
        await handleCheckoutPost(req("/api/checkout", "owner-a", { email: "owner-b@example.test" })),
        await generate(req("/api/generate", "owner-a", { email: "owner-b@example.test", scopeChange: "Paint wall." }) as Parameters<typeof generate>[0]),
      ]
      assert.ok(responses.every((response) => response.status === 403))
      assert.equal(untouched.calls.length, 0)
    })

    await t.test("same local IDs stay in the verified owner's namespace and sharing does not rotate credentials", async () => {
      const db = database((call) => {
        if (call.table === "estimate_proposals" && call.action === "select") {
          assert.equal(call.filters.owner_email, "owner-a@example.test")
          assert.equal(call.filters.local_estimate_id, "same-local-id")
          return { data: null, error: null }
        }
        if (call.table === "estimate_proposals" && call.action === "insert") {
          assert.equal(call.payload.owner_email, "owner-a@example.test")
          return { data: { id: "proposal-owned-by-a" }, error: null }
        }
        assert.equal(call.table, "approval_links")
        assert.equal(call.payload.proposal_id, "proposal-owned-by-a")
        return { error: null }
      })
      for (let count = 0; count < 2; count++) {
        const response = await handleApprovalSnapshotPost(req("/api/approvals", "owner-a", { estimate, proposalId: "proposal-owned-by-b" }), db as any)
        assert.equal(response.status, 200)
        const payload = await response.json()
        assert.equal(payload.proposalId, "proposal-owned-by-a")
        assert.equal("ownerSyncToken" in payload, false)
      }
      assert.equal(db.calls.some((call) => call.table === "approval_owner_sync_tokens"), false)
    })

    await t.test("status related-record queries are limited to proposals selected by the verified owner", async () => {
      const db = database((call) => {
        if (call.table === "estimate_proposals") {
          assert.equal(call.filters.owner_email, "owner-a@example.test")
          return { data: [{ id: "proposal-a", local_estimate_id: "estimate-a", status: "approved" }], error: null }
        }
        assert.deepEqual(call.filters.proposal_id, ["proposal-a"])
        return { data: call.table === "proposal_approvals" ? [{ proposal_id: "proposal-a", approved_by: "Synthetic Client", signature_data_url: "synthetic-signature" }] : [], error: null }
      })
      const response = await handleApprovalStatusGet(req("/api/approvals/status?proposalId=proposal-b&ownerSyncToken=obsolete"), db as any)
      assert.equal(response.status, 200)
      const payload = await response.json()
      assert.equal(payload.approvals.length, 1)
      assert.equal(payload.approvals[0].local_estimate_id, "estimate-a")
    })

    await t.test("existing free and paid entitlement rows use only verified email", async () => {
      for (const plan of ["free", "pro"]) {
        const db = database((call) => {
          assert.equal(call.filters.email, "owner-a@example.test")
          return { data: { plan, subscription_status: plan === "pro" ? "active" : null, usage_count: 2, free_limit: 3 }, error: null }
        })
        const response = await handleEntitlementPost(req("/api/entitlement", "owner-a", {}), db as any)
        const payload = await response.json()
        assert.equal(response.status, 200)
        assert.equal(payload.entitled, plan === "pro")
        assert.equal(payload.usage_count, 2)
      }
    })

    await t.test("the former development email consumes real quota and is rejected at the free limit", async () => {
      const response = await generate(req("/api/generate", "dev-owner", { email: "test12345@gmail.com", scopeChange: "Paint a bedroom wall.", trade: "painting" }) as Parameters<typeof generate>[0])
      assert.equal(response.status, 403)
      assert.equal((await response.json()).code, "FREE_LIMIT")
      assert.ok(outbound.some((url) => url.endsWith("/rest/v1/rpc/consume_free_generation")))
    })

    await t.test("client-supplied internal filesystem plan references are rejected before quota or processing", async () => {
      const before = outbound.length
      const response = await generate(req("/api/generate", "owner-a", { scopeChange: "Paint walls.", plans: [{ transport: "multipart-temp", tempFilePath: "/synthetic/other-owner/source.bin" }] }) as Parameters<typeof generate>[0])
      assert.equal(response.status, 400)
      assert.equal((await response.json()).code, "INVALID_PLAN_REFERENCE")
      assert.equal(outbound.length, before + 1, "only authentication may run")
    })
    assert.ok(authReads > 0, "real SDK getUser network boundary was exercised")
  } finally {
    globalThis.fetch = originalFetch
    hook.deregister()
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
    Object.assign(process.env, savedEnv)
  }
})
