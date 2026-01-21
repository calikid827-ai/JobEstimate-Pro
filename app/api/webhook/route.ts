import { NextResponse } from "next/server"
import Stripe from "stripe"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 }
    )
  }

  const body = await req.text()

  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secretKey || !webhookSecret) {
    console.error("Stripe env vars missing")
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    )
  }

  const stripe = new Stripe(secretKey)

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      webhookSecret
    )
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err.message)
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    )
  }

  // ✅ Handle events
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    console.log("✅ Payment successful:", session.id)

    // 🔒 FUTURE (recommended):
    // - Mark user as paid in DB
    // - Attach Stripe customer ID
    // - Persist entitlement instead of localStorage
  }

  return NextResponse.json({ received: true })
}