import assert from "node:assert/strict"
import test from "node:test"
import { assertOwnerEmail, requireOwner, withOwnerResponse, type OwnerAuthAdapter } from "./owner-auth"

const user = { id: "owner-a", email: "Owner-A@Example.test", email_confirmed_at: "2026-10-20", role: "authenticated", is_anonymous: false }
const adapter = (value: unknown = user, error: unknown = null): OwnerAuthAdapter => ({
  getUser: async () => ({ data: { user: value as typeof user }, error }),
})
function request(headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://jobestimatepro.test/api/owner", { method, headers })
}

test("owner boundary requires a bearer token before contacting authentication", async () => {
  for (const authorization of ["", "Basic owner", "Bearer", "Bearer one,two", "Bearer one two"]) {
    let reads = 0
    await assert.rejects(requireOwner(request({ authorization }), { getUser: async () => { reads++; throw new Error("unexpected") } }), /Sign in/)
    assert.equal(reads, 0)
  }
})

test("invalid, expired, forged, unconfirmed and anonymous users fail closed", async () => {
  for (const value of [null, { ...user, email_confirmed_at: null }, { ...user, is_anonymous: true }, { ...user, id: "" }, { ...user, email: "" }, { ...user, role: "anon" }]) {
    await assert.rejects(requireOwner(request({ authorization: "Bearer synthetic" }), adapter(value)), /session could not be verified/)
  }
  await assert.rejects(requireOwner(request({ authorization: "Bearer expired" }), adapter(null, { message: "expired" })), /session could not be verified/)
  await assert.rejects(requireOwner(request({ authorization: "Bearer forged" }), { getUser: async () => { throw new Error("invalid signature") } }), /session could not be verified/)
})

test("only authentication's confirmed identity establishes owner; supplied email is a constraint", async () => {
  const owner = await requireOwner(request({ authorization: "Bearer synthetic" }), adapter({ ...user, user_metadata: { email: "victim@example.test" } }))
  assert.deepEqual(owner, { id: "owner-a", email: "owner-a@example.test" })
  assert.doesNotThrow(() => assertOwnerEmail(owner, undefined))
  assert.doesNotThrow(() => assertOwnerEmail(owner, " OWNER-A@example.test "))
  assert.throws(() => assertOwnerEmail(owner, "victim@example.test"), /does not belong/)
  assert.throws(() => assertOwnerEmail(owner, 5), /does not belong/)
})

test("cross-site mutations and unrelated origins are rejected before authentication", async () => {
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { origin: "https://unrelated.test" }, { origin: "null" }] as Record<string, string>[]) {
    await assert.rejects(requireOwner(request({ authorization: "Bearer synthetic", ...headers }), adapter()), /Invalid request origin/)
  }
  assert.equal((await requireOwner(request({ authorization: "Bearer synthetic", origin: "https://jobestimatepro.test" }), adapter())).id, "owner-a")
})

test("successful and rejected private responses prohibit storage and vary by authorization", async () => {
  const success = await withOwnerResponse(async () => Response.json({ okay: true }))
  const denied = await withOwnerResponse(async () => { await requireOwner(request(), adapter()); return Response.json({}) })
  assert.equal(denied.status, 401)
  for (const response of [success, denied]) {
    assert.match(response.headers.get("cache-control") || "", /private, no-store/)
    assert.match(response.headers.get("vary") || "", /Authorization/)
  }
})
