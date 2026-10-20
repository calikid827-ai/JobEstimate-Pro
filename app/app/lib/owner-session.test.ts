import assert from "node:assert/strict"
import test from "node:test"
import { createOwnerBoundFetch, OwnerSessionController, StaleOwnerSessionError, type OwnerAuthPort } from "./owner-session"

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const session = (token: string | null) => token ? { access_token: token } : null
function fixture(initialToken: string | null = null, handle?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  let token = initialToken
  let callback: (event: string, value: ReturnType<typeof session>) => void = () => {}
  const calls: { url: string; init?: RequestInit }[] = []
  const auth: OwnerAuthPort = {
    async getSession() { return { data: { session: session(token) }, error: null } },
    async signInWithOtp() { return { error: null } },
    async verifyOtp({ email }) { token = email.startsWith("b@") ? "b" : "a"; callback("SIGNED_IN", session(token)); return { data: { session: session(token) }, error: null } },
    async signOut() { token = null; callback("SIGNED_OUT", null); return { error: null } },
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { callback = () => {} } } } } },
  }
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    if (handle) return handle(input, init)
    const bearer = new Headers(init?.headers).get("Authorization")
    if (String(input) === "/api/auth/session") {
      if (bearer === "Bearer a" || bearer === "Bearer a-refreshed") return Response.json({ owner: { id: "owner-a", email: "a@example.test" } })
      if (bearer === "Bearer b") return Response.json({ owner: { id: "owner-b", email: "b@example.test" } })
      return Response.json({ error: "invalid session" }, { status: 401 })
    }
    return Response.json({ private: bearer })
  }
  const controller = new OwnerSessionController(auth, fetcher, "https://app.example.test")
  return { controller, auth, calls, emit(event: string, nextToken: string | null) { token = nextToken; callback(event, session(token)) } }
}

test("missing sessions stay signed out, and invalid, expired or forged tokens never establish an owner", async () => {
  const absent = fixture()
  await absent.controller.start()
  assert.equal(absent.controller.getState().owner, null)
  assert.equal(absent.calls.length, 0)
  await assert.rejects(absent.controller.ownerFetch("/api/approvals"), /Sign in/)
  for (const token of ["invalid", "expired", "forged-owner-a"]) {
    const app = fixture(token)
    await app.controller.start()
    assert.equal(app.controller.getState().owner, null)
    assert.equal(app.controller.getState().phase, "signed_out")
    assert.equal(app.calls.length, 1)
  }
})

test("OTP sign-in authorizes only the owner returned by the real session endpoint contract", async () => {
  const app = fixture()
  let sentEmail = ""
  let verifyType = ""
  app.auth.signInWithOtp = async request => { sentEmail = request.email; assert.deepEqual(request.options, { shouldCreateUser: true }); return { error: null } }
  const originalVerify = app.auth.verifyOtp
  app.auth.verifyOtp = async request => { verifyType = request.type; return originalVerify(request) }
  await app.controller.start()
  await app.controller.signIn(" A@EXAMPLE.TEST ")
  assert.equal(sentEmail, "a@example.test")
  assert.equal(app.controller.getState().phase, "code_sent")
  assert.equal(app.controller.getState().owner, null)
  await app.controller.verify("123456")
  assert.equal(verifyType, "email")
  assert.deepEqual(app.controller.getState().owner, { id: "owner-a", email: "a@example.test" })
  assert.equal(app.calls.filter(call => call.url === "/api/auth/session").length, 1)
})

test("protected requests override supplied credentials, prevent external URLs and use private no-store responses", async () => {
  const app = fixture("a")
  await app.controller.start()
  const response = await app.controller.ownerFetch("/api/entitlement", { method: "POST", headers: { Authorization: "Bearer attacker" }, cache: "force-cache" })
  assert.deepEqual(await response.json(), { private: "Bearer a" })
  const call = app.calls.at(-1)!
  assert.equal(new Headers(call.init?.headers).get("Authorization"), "Bearer a")
  assert.equal(call.init?.cache, "no-store")
  assert.equal(call.init?.credentials, "omit")
  assert.equal(call.init?.redirect, "error")
  await assert.rejects(app.controller.ownerFetch("https://other.example.test/api/private"), /stay on this app/)
})

test("logout clears access immediately and aborts an outstanding owner's request", async () => {
  const pending = deferred<Response>()
  let requestSignal: AbortSignal | null | undefined
  const app = fixture("a", async (input, init) => {
    if (String(input) === "/api/auth/session") return Response.json({ owner: { id: "owner-a", email: "a@example.test" } })
    requestSignal = init?.signal
    return pending.promise
  })
  await app.controller.start()
  const request = app.controller.ownerFetch("/api/approvals/status")
  await tick()
  await app.controller.signOut()
  assert.equal(app.controller.isCurrentOwner("owner-a"), false)
  assert.equal(requestSignal?.aborted, true)
  pending.resolve(Response.json({ secret: "old owner" }))
  await assert.rejects(request, StaleOwnerSessionError)
})

test("delayed JSON and cloned text reads cannot deliver a prior owner's private response", async () => {
  const app = fixture("a")
  await app.controller.start()
  const response = await app.controller.ownerFetch("/api/approvals/status")
  const clone = response.clone()
  await app.controller.signOut()
  await assert.rejects(response.json(), StaleOwnerSessionError)
  await assert.rejects(clone.text(), StaleOwnerSessionError)

  let body!: ReadableStreamDefaultController<Uint8Array>
  const slow = fixture("a", async input => String(input) === "/api/auth/session"
    ? Response.json({ owner: { id: "owner-a", email: "a@example.test" } })
    : new Response(new ReadableStream({ start(controller) { body = controller } })))
  await slow.controller.start()
  const slowResponse = await slow.controller.ownerFetch("/api/approvals/status")
  const parsed = slowResponse.json()
  await slow.controller.signOut()
  body.enqueue(new TextEncoder().encode('{"secret":"old owner"}'))
  body.close()
  await assert.rejects(parsed, StaleOwnerSessionError)
})

test("late server verification and late OTP SIGNED_IN events do not restore a signed-out owner", async () => {
  const check = deferred<Response>()
  const pending = fixture("a", async () => check.promise)
  const initial = pending.controller.start()
  await tick()
  await pending.controller.signOut()
  check.resolve(Response.json({ owner: { id: "owner-a", email: "a@example.test" } }))
  await initial
  assert.equal(pending.controller.getState().owner, null)

  const app = fixture()
  const verified = deferred<Awaited<ReturnType<OwnerAuthPort["verifyOtp"]>>>()
  app.auth.verifyOtp = () => verified.promise
  await app.controller.start()
  await app.controller.signIn("a@example.test")
  const otp = app.controller.verify("123456")
  await app.controller.signOut()
  app.emit("SIGNED_IN", "a")
  verified.resolve({ data: { session: session("a") }, error: null })
  await otp
  await tick()
  assert.equal(app.controller.getState().owner, null)
  assert.equal(app.calls.length, 0)
})

test("switching accounts invalidates old readers and preserves only the server-verified new owner", async () => {
  const app = fixture("a")
  await app.controller.start()
  const old = await app.controller.ownerFetch("/api/approvals/status")
  const firstEpoch = app.controller.getState().epoch
  await app.controller.signIn("b@example.test")
  assert.equal(app.controller.isCurrentOwner("owner-a"), false)
  await app.controller.verify("654321")
  assert.equal(app.controller.getState().owner?.id, "owner-b")
  assert.ok(app.controller.getState().epoch > firstEpoch)
  await assert.rejects(old.json(), StaleOwnerSessionError)
  assert.deepEqual(await (await app.controller.ownerFetch("/api/approvals/status")).json(), { private: "Bearer b" })
})

test("same-owner token refresh keeps workspace identity but revalidates the new token", async () => {
  const app = fixture("a")
  await app.controller.start()
  const epoch = app.controller.getState().epoch
  app.emit("TOKEN_REFRESHED", "a-refreshed")
  await tick()
  assert.equal(app.controller.getState().owner?.id, "owner-a")
  assert.equal(app.controller.getState().epoch, epoch)
  const response = await app.controller.ownerFetch("/api/entitlement")
  assert.deepEqual(await response.json(), { private: "Bearer a-refreshed" })
  assert.equal(app.calls.filter(call => call.url === "/api/auth/session").length, 2)
})

test("a token refresh resolving to another owner invalidates old content and callbacks", async () => {
  const app = fixture("a")
  await app.controller.start()
  const old = await app.controller.ownerFetch("/api/approvals/status")
  const epoch = app.controller.getState().epoch
  app.emit("TOKEN_REFRESHED", "b")
  await tick()
  assert.equal(app.controller.getState().owner?.id, "owner-b")
  assert.ok(app.controller.getState().epoch > epoch)
  await assert.rejects(old.json(), StaleOwnerSessionError)
})

test("expired protected access clears the verified owner and prevents further requests", async () => {
  const app = fixture("a", async input => String(input) === "/api/auth/session"
    ? Response.json({ owner: { id: "owner-a", email: "a@example.test" } })
    : Response.json({ error: "expired" }, { status: 401 }))
  await app.controller.start()
  await assert.rejects(app.controller.ownerFetch("/api/approvals/status"), /Sign in/)
  assert.equal(app.controller.getState().owner, null)
  await assert.rejects(app.controller.ownerFetch("/api/entitlement"), /Sign in/)
})

test("cancelling a delayed email request cannot restore its code screen or authorize late events", async () => {
  const app = fixture()
  const sent = deferred<{ error: null }>()
  app.auth.signInWithOtp = () => sent.promise
  await app.controller.start()
  const signIn = app.controller.signIn("a@example.test")
  app.controller.cancel()
  app.emit("SIGNED_IN", "a")
  sent.resolve({ error: null })
  await signIn
  await tick()
  assert.equal(app.controller.getState().phase, "signed_out")
  assert.equal(app.controller.getState().owner, null)
})

test("server verification must finish before restored private owner state becomes available", async () => {
  const payload = deferred<unknown>()
  const response = Response.json({})
  response.json = () => payload.promise
  const app = fixture("a", async () => response)
  const restoring = app.controller.start()
  await tick()
  assert.equal(app.controller.getState().owner, null)
  await app.controller.signOut()
  payload.resolve({ owner: { id: "owner-a", email: "a@example.test" } })
  await restoring
  assert.equal(app.controller.getState().owner, null)
})

test("failed remote sign-out still clears the configured local auth session and blocks late refresh", async () => {
  const app = fixture("a")
  let cleared = false
  app.auth.signOut = async () => ({ error: { message: "offline" } })
  app.auth.clearLocalSession = () => { cleared = true }
  await app.controller.start()
  await app.controller.signOut()
  assert.equal(cleared, true)
  assert.equal(app.controller.getState().owner, null)
  assert.equal(app.controller.getState().phase, "signed_out")
  app.emit("TOKEN_REFRESHED", "a-refreshed")
  await tick()
  assert.equal(app.controller.getState().owner, null)
  await assert.rejects(app.controller.ownerFetch("/api/approvals/status"), /Sign in/)
})

test("default transport keeps the browser-compatible global fetch receiver", async () => {
  const originalFetch = globalThis.fetch
  const app = fixture("a")
  try {
    globalThis.fetch = async function () {
      assert.equal(this, globalThis)
      return Response.json({ owner: { id: "owner-a", email: "a@example.test" } })
    }
    const controller = new OwnerSessionController(app.auth)
    await controller.start()
    assert.equal(controller.getState().owner?.id, "owner-a")
    controller.stop()
  } finally { globalThis.fetch = originalFetch }
})

test("a workspace-bound fetch cannot send an old payload after switching to another owner", async () => {
  const app = fixture("a")
  await app.controller.start()
  const oldEpoch = app.controller.getState().epoch
  const oldFetch = createOwnerBoundFetch(app.controller, "owner-a", oldEpoch)
  const preprocessing = deferred<string>()
  const delayedRequest = preprocessing.promise.then(payload => oldFetch("/api/generate", { method: "POST", body: payload }))
  await app.controller.signOut()
  await app.controller.signIn("b@example.test")
  await app.controller.verify("654321")
  const requestCount = app.calls.length
  preprocessing.resolve("private owner A scope")
  await assert.rejects(delayedRequest, StaleOwnerSessionError)
  assert.equal(app.calls.length, requestCount)
  assert.equal(app.controller.isCurrentOwner("owner-a", oldEpoch), false)
  const currentFetch = createOwnerBoundFetch(app.controller, "owner-b", app.controller.getState().epoch)
  assert.deepEqual(await (await currentFetch("/api/entitlement")).json(), { private: "Bearer b" })
})

test("same-owner logout and sign-in invalidates earlier workspace callbacks", async () => {
  const app = fixture("a")
  await app.controller.start()
  const oldEpoch = app.controller.getState().epoch
  const oldFetch = createOwnerBoundFetch(app.controller, "owner-a", oldEpoch)
  await app.controller.signOut()
  await app.controller.signIn("a@example.test")
  await app.controller.verify("123456")
  assert.equal(app.controller.isCurrentOwner("owner-a"), true)
  assert.equal(app.controller.isCurrentOwner("owner-a", oldEpoch), false)
  const requestCount = app.calls.length
  await assert.rejects(oldFetch("/api/approvals", { method: "POST", body: "old snapshot" }), StaleOwnerSessionError)
  assert.equal(app.calls.length, requestCount)
  const currentFetch = createOwnerBoundFetch(app.controller, "owner-a", app.controller.getState().epoch)
  assert.deepEqual(await (await currentFetch("/api/entitlement")).json(), { private: "Bearer a" })
})

test("same-owner token refresh retains existing workspace-bound requests", async () => {
  const app = fixture("a")
  await app.controller.start()
  const epoch = app.controller.getState().epoch
  const boundFetch = createOwnerBoundFetch(app.controller, "owner-a", epoch)
  app.emit("TOKEN_REFRESHED", "a-refreshed")
  await tick()
  assert.equal(app.controller.isCurrentOwner("owner-a", epoch), true)
  assert.deepEqual(await (await boundFetch("/api/entitlement")).json(), { private: "Bearer a-refreshed" })
})
