import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { isSupportedStripeWebhookEvent } from "./webhook-events"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing")
if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET missing")
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

type EntitlementPatch = {
  email: string
  plan: string
  subscription_status: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  canceled_at?: string | null
  trial_end?: string | null
  active: boolean
  updated_at: string
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function unixToIso(value: unknown) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null
}

function isFutureIso(value: string | null | undefined) {
  if (!value) return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && ms > Date.now()
}

function statusAllowsAccess(status: string, currentPeriodEnd?: string | null) {
  if (status === "active" || status === "trialing") return true
  if (status === "past_due" || status === "canceled") return isFutureIso(currentPeriodEnd)
  return false
}

function getCustomerId(value: unknown) {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && typeof (value as any).id === "string") {
    return (value as any).id as string
  }
  return null
}

function getSubscriptionId(value: unknown) {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && typeof (value as any).id === "string") {
    return (value as any).id as string
  }
  return null
}

async function getCustomerEmail(customerId: string | null) {
  if (!customerId) return ""
  const customer = await stripe.customers.retrieve(customerId)
  if (!customer || (customer as any).deleted === true) return ""
  return normalizeEmail(typeof (customer as any).email === "string" ? (customer as any).email : "")
}

async function upsertEntitlement(patch: EntitlementPatch) {
  const { error } = await supabase
    .from("entitlements")
    .upsert(patch, { onConflict: "email" })

  return error
}

function buildSubscriptionPatch(args: {
  email: string
  customerId: string | null
  subscriptionId: string | null
  status: string
  currentPeriodStart?: unknown
  currentPeriodEnd?: unknown
  cancelAtPeriodEnd?: unknown
  canceledAt?: unknown
  trialEnd?: unknown
}): EntitlementPatch {
  const currentPeriodStart = unixToIso(args.currentPeriodStart)
  const currentPeriodEnd = unixToIso(args.currentPeriodEnd)
  const canceledAt = unixToIso(args.canceledAt)
  const trialEnd = unixToIso(args.trialEnd)
  const subscriptionStatus = args.status || "incomplete"

  return {
    email: normalizeEmail(args.email),
    plan: "pro",
    subscription_status: subscriptionStatus,
    stripe_customer_id: args.customerId,
    stripe_subscription_id: args.subscriptionId,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: Boolean(args.cancelAtPeriodEnd),
    canceled_at: canceledAt,
    trial_end: trialEnd,
    active: statusAllowsAccess(subscriptionStatus, currentPeriodEnd),
    updated_at: new Date().toISOString(),
  }
}

async function upsertSubscription(subscription: Stripe.Subscription, fallbackEmail = "") {
  const customerId = getCustomerId(subscription.customer)
  const metadataEmail = normalizeEmail(
    typeof subscription.metadata?.email === "string" ? subscription.metadata.email : fallbackEmail
  )
  const email = metadataEmail || (await getCustomerEmail(customerId))

  if (!email) return null

  return upsertEntitlement(
    buildSubscriptionPatch({
      email,
      customerId,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: (subscription as any).current_period_start,
      currentPeriodEnd: (subscription as any).current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at,
      trialEnd: subscription.trial_end,
    })
  )
}

async function upsertSubscriptionById(subscriptionId: string, fallbackEmail = "") {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  return upsertSubscription(subscription, fallbackEmail)
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 })

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (!isSupportedStripeWebhookEvent(event.type)) {
    return NextResponse.json({ received: true, ignored: true })
  }

  // -----------------------------
  // Idempotency / dedupe (Stripe may retry same event)
  // -----------------------------
  const { error: dedupeErr } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, type: event.type })

  // If event_id already exists, we've processed it — exit successfully
  if (dedupeErr) {
    const msg = (dedupeErr as any)?.message || ""
    const code = (dedupeErr as any)?.code || ""

    // Postgres unique violation (duplicate primary key)
    // Supabase often uses code "23505" for unique violation
    if (code === "23505" || /duplicate key|unique/i.test(msg)) {
      return NextResponse.json({ received: true })
    }

    // Otherwise, fail so Stripe retries (safe)
    return NextResponse.json({ error: "Webhook dedupe write failed" }, { status: 500 })
  }

  let dbError: unknown = null

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const rawEmail = session.customer_details?.email ?? session.customer_email ?? session.metadata?.email
    const email = rawEmail ? normalizeEmail(rawEmail) : ""
    const subscriptionId = getSubscriptionId(session.subscription)
    const customerId = getCustomerId(session.customer)

    if (subscriptionId) {
      dbError = await upsertSubscriptionById(subscriptionId, email)
    } else if (email) {
      // Backward-compatible one-time/manual checkout handling. Do not reset usage_count.
      dbError = await upsertEntitlement({
        email,
        plan: "legacy_beta",
        subscription_status: "legacy_active",
        stripe_customer_id: customerId,
        stripe_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        canceled_at: null,
        trial_end: null,
        active: true,
        updated_at: new Date().toISOString(),
      })
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    dbError = await upsertSubscription(event.data.object as Stripe.Subscription)
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = getSubscriptionId((invoice as any).subscription)
    const email =
      normalizeEmail(typeof invoice.customer_email === "string" ? invoice.customer_email : "") ||
      normalizeEmail(typeof (invoice as any).customer_details?.email === "string" ? (invoice as any).customer_details.email : "")

    if (subscriptionId) {
      dbError = await upsertSubscriptionById(subscriptionId, email)
    }
  }

  if (dbError) {
    return NextResponse.json({ error: "DB write failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
