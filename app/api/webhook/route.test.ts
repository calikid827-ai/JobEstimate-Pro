import assert from "node:assert/strict"
import test from "node:test"
import Stripe from "stripe"

process.env.STRIPE_SECRET_KEY ||= "sk_test_webhook_route_test"
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_webhook_route_test"
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

const originalVercelEnv = process.env.VERCEL_ENV
const webhookTestStripe = new Stripe(process.env.STRIPE_SECRET_KEY)

test.afterEach(() => {
  if (originalVercelEnv === undefined) {
    delete process.env.VERCEL_ENV
  } else {
    process.env.VERCEL_ENV = originalVercelEnv
  }
})

type QueryCall = {
  table: string
  action: string
  payload?: unknown
  options?: unknown
  filters: Array<{ method: string; key: string; value: unknown }>
  terminal: string
}

class SupabaseQueryMock {
  private action = "select"
  private payload: unknown
  private options: unknown
  private filters: Array<{ method: string; key: string; value: unknown }> = []
  private table: string
  private calls: QueryCall[]
  private resolveCall: (call: QueryCall) => unknown

  constructor(
    table: string,
    calls: QueryCall[],
    resolveCall: (call: QueryCall) => unknown
  ) {
    this.table = table
    this.calls = calls
    this.resolveCall = resolveCall
  }

  select() {
    this.action = "select"
    return this
  }

  insert(payload: unknown) {
    this.action = "insert"
    this.payload = payload
    return this
  }

  upsert(payload: unknown, options?: unknown) {
    this.action = "upsert"
    this.payload = payload
    this.options = options
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ method: "eq", key, value })
    return this
  }

  maybeSingle() {
    return Promise.resolve(this.finish("maybeSingle"))
  }

  then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
    Promise.resolve(this.finish("await")).then(resolve, reject)
  }

  private finish(terminal: string) {
    const call = {
      table: this.table,
      action: this.action,
      payload: this.payload,
      options: this.options,
      filters: this.filters,
      terminal,
    }
    this.calls.push(call)
    return this.resolveCall(call)
  }
}

function makeSupabaseMock(resolveCall: (call: QueryCall) => unknown) {
  const calls: QueryCall[] = []
  return {
    calls,
    client: {
      from(table: string) {
        return new SupabaseQueryMock(table, calls, resolveCall)
      },
    },
  }
}

function makeCheckoutCompletedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout_completed",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        customer: "cus_123",
        customer_email: "Client@Example.com",
        customer_details: { email: "Client@Example.com" },
        metadata: { email: "Client@Example.com" },
        subscription: "sub_123",
        ...overrides,
      },
    },
  } as any
}

function makeSubscriptionEvent(args: {
  id: string
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted"
  subscriptionOverrides?: Record<string, unknown>
}) {
  return {
    id: args.id,
    type: args.type,
    data: {
      object: {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        metadata: { email: "Client@Example.com" },
        items: { data: [] },
        cancel_at_period_end: false,
        canceled_at: null,
        trial_end: null,
        ...args.subscriptionOverrides,
      },
    },
  } as any
}

function makeDeps(supabaseClient: any, subscriptionOverrides: Record<string, unknown> = {}) {
  return {
    supabase: supabaseClient,
    stripe: {
      customers: {
        retrieve: async () => ({ id: "cus_123", email: "client@example.com" }),
      },
      subscriptions: {
        retrieve: async () => ({
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: { email: "Client@Example.com" },
          current_period_start: 1_700_000_000,
          current_period_end: 1_800_000_000,
          cancel_at_period_end: false,
          canceled_at: null,
          trial_end: null,
          ...subscriptionOverrides,
        }),
      },
    },
  } as any
}

function makeWebhookEvent(args: { id: string; type: string; livemode: boolean }) {
  return {
    id: args.id,
    object: "event",
    type: args.type,
    livemode: args.livemode,
    data: {
      object: args.type === "checkout.session.completed"
        ? {
            id: "cs_mode_guard",
            customer: "cus_mode_guard",
            customer_email: "client@example.com",
            subscription: "sub_mode_guard",
          }
        : { id: "pi_mode_guard" },
    },
  }
}

function makeSignedWebhookRequest(event: ReturnType<typeof makeWebhookEvent>) {
  const payload = JSON.stringify(event)
  const signature = webhookTestStripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  })

  return new Request("https://jobestimatepro.test/api/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  })
}

async function makeNoProcessingRoute() {
  const { createWebhookPostHandler } = await import("./route")
  const { client, calls } = makeSupabaseMock(() => ({
    data: null,
    error: { message: "Unexpected Supabase call" },
  }))
  let customerLookups = 0
  let subscriptionLookups = 0

  const post = createWebhookPostHandler({
    supabase: client as any,
    stripe: {
      webhooks: webhookTestStripe.webhooks,
      customers: {
        retrieve: async () => {
          customerLookups += 1
          throw new Error("Unexpected Stripe customer lookup")
        },
      },
      subscriptions: {
        retrieve: async () => {
          subscriptionLookups += 1
          throw new Error("Unexpected Stripe subscription lookup")
        },
      },
    } as any,
  })

  return {
    post,
    calls,
    get customerLookups() {
      return customerLookups
    },
    get subscriptionLookups() {
      return subscriptionLookups
    },
  }
}

function assertNoProcessingWork(work: Awaited<ReturnType<typeof makeNoProcessingRoute>>) {
  assert.equal(work.calls.length, 0)
  assert.equal(work.customerLookups, 0)
  assert.equal(work.subscriptionLookups, 0)
}

function makeSuccessfulWebhookSupabaseMock() {
  return makeSupabaseMock((call) => {
    if (call.table === "stripe_webhook_events" && call.action === "select") {
      return { data: null, error: null }
    }
    if (call.table === "entitlements" && call.action === "upsert") {
      return { error: null }
    }
    if (call.table === "stripe_webhook_events" && call.action === "insert") {
      return { error: null }
    }
    throw new Error(`Unexpected Supabase call: ${call.table}.${call.action}`)
  })
}

test("checkout.session.completed activates entitlement before recording the event as processed", async () => {
  const { handleSupportedStripeWebhookEvent } = await import("./route")
  const { client, calls } = makeSupabaseMock((call) => {
    if (call.table === "stripe_webhook_events" && call.action === "select") {
      return { data: null, error: null }
    }
    if (call.table === "entitlements" && call.action === "upsert") {
      return { error: null }
    }
    if (call.table === "stripe_webhook_events" && call.action === "insert") {
      return { error: null }
    }
    throw new Error(`Unexpected Supabase call: ${call.table}.${call.action}`)
  })

  const response = await handleSupportedStripeWebhookEvent(
    makeCheckoutCompletedEvent(),
    makeDeps(client)
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true })
  assert.deepEqual(
    calls.map((call) => `${call.table}.${call.action}`),
    [
      "stripe_webhook_events.select",
      "entitlements.upsert",
      "stripe_webhook_events.insert",
    ]
  )

  const entitlement = calls.find((call) => call.table === "entitlements")?.payload as any
  assert.equal(entitlement.email, "client@example.com")
  assert.equal(entitlement.plan, "pro")
  assert.equal(entitlement.subscription_status, "active")
  assert.equal(entitlement.stripe_subscription_id, "sub_123")
  assert.equal(entitlement.active, true)
})

test("duplicate already-processed events return safely without re-applying entitlement", async () => {
  const { handleSupportedStripeWebhookEvent } = await import("./route")
  const { client, calls } = makeSupabaseMock((call) => {
    if (call.table === "stripe_webhook_events" && call.action === "select") {
      return { data: { event_id: "evt_checkout_completed" }, error: null }
    }
    throw new Error(`Duplicate should not call ${call.table}.${call.action}`)
  })

  const response = await handleSupportedStripeWebhookEvent(
    makeCheckoutCompletedEvent(),
    makeDeps(client)
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true })
  assert.deepEqual(
    calls.map((call) => `${call.table}.${call.action}`),
    ["stripe_webhook_events.select"]
  )
})

test("entitlement activation failure does not permanently block a later Stripe retry", async () => {
  const { handleSupportedStripeWebhookEvent } = await import("./route")
  const first = makeSupabaseMock((call) => {
    if (call.table === "stripe_webhook_events" && call.action === "select") {
      return { data: null, error: null }
    }
    if (call.table === "entitlements" && call.action === "upsert") {
      return { error: { message: "temporary entitlement write failure" } }
    }
    throw new Error(`Failed activation should not call ${call.table}.${call.action}`)
  })

  const failed = await handleSupportedStripeWebhookEvent(
    makeCheckoutCompletedEvent(),
    makeDeps(first.client)
  )

  assert.equal(failed.status, 500)
  assert.deepEqual(await failed.json(), { error: "DB write failed" })
  assert.equal(
    first.calls.some((call) => call.table === "stripe_webhook_events" && call.action === "insert"),
    false
  )

  const retry = makeSupabaseMock((call) => {
    if (call.table === "stripe_webhook_events" && call.action === "select") {
      return { data: null, error: null }
    }
    if (call.table === "entitlements" && call.action === "upsert") {
      return { error: null }
    }
    if (call.table === "stripe_webhook_events" && call.action === "insert") {
      return { error: null }
    }
    throw new Error(`Unexpected retry call: ${call.table}.${call.action}`)
  })

  const retried = await handleSupportedStripeWebhookEvent(
    makeCheckoutCompletedEvent(),
    makeDeps(retry.client)
  )

  assert.equal(retried.status, 200)
  assert.deepEqual(await retried.json(), { received: true })
  assert.equal(
    retry.calls.some((call) => call.table === "stripe_webhook_events" && call.action === "insert"),
    true
  )
})

test("subscription item periods populate entitlement period fields", async () => {
  const { handleSupportedStripeWebhookEvent } = await import("./route")
  const { client, calls } = makeSuccessfulWebhookSupabaseMock()

  const response = await handleSupportedStripeWebhookEvent(
    makeSubscriptionEvent({
      id: "evt_subscription_item_periods",
      type: "customer.subscription.updated",
      subscriptionOverrides: {
        items: {
          data: [
            { current_period_start: 1_710_000_000, current_period_end: 1_790_000_000 },
            { current_period_start: 1_700_000_000, current_period_end: 1_800_000_000 },
          ],
        },
      },
    }),
    makeDeps(client)
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true })
  const entitlement = calls.find((call) => call.table === "entitlements")?.payload as any
  assert.equal(entitlement.current_period_start, new Date(1_700_000_000 * 1000).toISOString())
  assert.equal(entitlement.current_period_end, new Date(1_800_000_000 * 1000).toISOString())
})

test("top-level subscription periods remain preferred over item periods", async () => {
  const { handleSupportedStripeWebhookEvent } = await import("./route")
  const { client, calls } = makeSuccessfulWebhookSupabaseMock()

  const response = await handleSupportedStripeWebhookEvent(
    makeSubscriptionEvent({
      id: "evt_subscription_top_level_periods",
      type: "customer.subscription.created",
      subscriptionOverrides: {
        current_period_start: 1_720_000_000,
        current_period_end: 1_780_000_000,
        items: {
          data: [
            { current_period_start: 1_700_000_000, current_period_end: 1_800_000_000 },
          ],
        },
      },
    }),
    makeDeps(client)
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true })
  const entitlement = calls.find((call) => call.table === "entitlements")?.payload as any
  assert.equal(entitlement.current_period_start, new Date(1_720_000_000 * 1000).toISOString())
  assert.equal(entitlement.current_period_end, new Date(1_780_000_000 * 1000).toISOString())
})

test("canceled subscription remains active through a future item period end", async () => {
  const { handleSupportedStripeWebhookEvent } = await import("./route")
  const { client, calls } = makeSuccessfulWebhookSupabaseMock()

  const response = await handleSupportedStripeWebhookEvent(
    makeSubscriptionEvent({
      id: "evt_canceled_subscription_item_period",
      type: "customer.subscription.deleted",
      subscriptionOverrides: {
        status: "canceled",
        items: {
          data: [
            { current_period_start: 1_700_000_000, current_period_end: 4_102_444_800 },
          ],
        },
      },
    }),
    makeDeps(client)
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true })
  const entitlement = calls.find((call) => call.table === "entitlements")?.payload as any
  assert.equal(entitlement.subscription_status, "canceled")
  assert.equal(entitlement.current_period_end, new Date(4_102_444_800 * 1000).toISOString())
  assert.equal(entitlement.active, true)
})

test("POST still rejects invalid Stripe signatures before webhook processing", async () => {
  const { POST } = await import("./route")

  const response = await POST(
    new Request("https://jobestimatepro.test/api/webhook", {
      method: "POST",
      headers: { "stripe-signature": "invalid-signature" },
      body: JSON.stringify({ id: "evt_bad", type: "checkout.session.completed" }),
    })
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "Invalid signature" })
})

for (const { vercelEnv, livemode } of [
  { vercelEnv: "production", livemode: true },
  { vercelEnv: "preview", livemode: false },
  { vercelEnv: "development", livemode: false },
] as const) {
  test(`${vercelEnv} accepts Stripe ${livemode ? "Live" : "Test"}-mode events`, async () => {
    const work = await makeNoProcessingRoute()
    process.env.VERCEL_ENV = vercelEnv

    const response = await work.post(makeSignedWebhookRequest(makeWebhookEvent({
      id: `evt_${vercelEnv}_matching_mode`,
      type: "payment_intent.succeeded",
      livemode,
    })))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { received: true, ignored: true })
    assertNoProcessingWork(work)
  })
}

test("missing VERCEL_ENV fails closed before webhook processing", async () => {
  const work = await makeNoProcessingRoute()
  delete process.env.VERCEL_ENV

  const response = await work.post(makeSignedWebhookRequest(makeWebhookEvent({
    id: "evt_missing_vercel_env",
    type: "checkout.session.completed",
    livemode: false,
  })))

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Invalid VERCEL_ENV" })
  assertNoProcessingWork(work)
})

test("unexpected VERCEL_ENV fails closed before webhook processing", async () => {
  const work = await makeNoProcessingRoute()
  process.env.VERCEL_ENV = "staging"

  const response = await work.post(makeSignedWebhookRequest(makeWebhookEvent({
    id: "evt_unexpected_vercel_env",
    type: "checkout.session.completed",
    livemode: false,
  })))

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Invalid VERCEL_ENV" })
  assertNoProcessingWork(work)
})

test("signed Stripe Test event is ignored in production without processing", async () => {
  const work = await makeNoProcessingRoute()
  process.env.VERCEL_ENV = "production"

  const response = await work.post(makeSignedWebhookRequest(makeWebhookEvent({
    id: "evt_test_mode_in_production",
    type: "checkout.session.completed",
    livemode: false,
  })))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    ignored: true,
    reason: "stripe_mode_mismatch",
  })
  assertNoProcessingWork(work)
})

test("signed Stripe Live event is ignored in preview without processing", async () => {
  const work = await makeNoProcessingRoute()
  process.env.VERCEL_ENV = "preview"

  const response = await work.post(makeSignedWebhookRequest(makeWebhookEvent({
    id: "evt_live_mode_in_preview",
    type: "checkout.session.completed",
    livemode: true,
  })))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    ignored: true,
    reason: "stripe_mode_mismatch",
  })
  assertNoProcessingWork(work)
})
