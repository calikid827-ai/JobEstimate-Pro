import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// -----------------------------
// ENV VALIDATION (HARD FAIL)
// -----------------------------
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing")
if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET missing")
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

// Stripe
const stripe = new Stripe(STRIPE_SECRET_KEY)

// Supabase (SERVICE ROLE — backend only)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function POST(req: Request) {
  console.log("🔥 WEBHOOK HIT")

  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    console.error("❌ Missing Stripe signature")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  const body = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      STRIPE_WEBHOOK_SECRET
    )
    console.log("✅ Event verified")
    console.log("📦 Event type:", event.type)
  } catch (err: any) {
    console.error("❌ Signature verification failed:", err.message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    console.log("🎉 Checkout session completed")

    const session = event.data.object as Stripe.Checkout.Session
    const email = session.customer_details?.email ?? null
    const customerId = session.customer as string | null

    console.log("📧 Email:", email)
    console.log("👤 Customer ID:", customerId)

    if (!email) {
      console.error("❌ No email found in session")
    } else {
      const { data, error } = await supabase
        .from("entitlements")
        .upsert({
          email,
          stripe_customer_id: customerId,
          active: true,
        })
        .select()

      console.log("🟢 Supabase data:", data)
      console.log("🔴 Supabase error:", error)
    }
  }

  return NextResponse.json({ received: true })
}