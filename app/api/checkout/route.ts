import Stripe from "stripe"
import { NextResponse } from "next/server"
import { requireOwner, assertOwnerEmail, ownerAuthFailure, withOwnerResponse, type OwnerAuthAdapter } from "../../lib/owner-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function checkoutPost(req: Request, auth?: OwnerAuthAdapter) {
  try {
    const owner = await requireOwner(req, auth)
    const body = await req.json()
    assertOwnerEmail(owner, body?.email)
    const email = owner.email

    const secretKey = process.env.STRIPE_SECRET_KEY
    const priceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!secretKey) throw new Error("STRIPE_SECRET_KEY missing")
    if (!priceId) throw new Error("STRIPE_PRO_MONTHLY_PRICE_ID missing")
    if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL missing")

    const stripe = new Stripe(secretKey)

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email, // ✅ critical: locks checkout to the same email you use for entitlements
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        email,
        plan: "pro",
        source: "checkout",
      },
      subscription_data: {
        metadata: {
          email,
          plan: "pro",
          source: "checkout",
        },
      },
      success_url: `${siteUrl}/success`,
      cancel_url: `${siteUrl}/cancel`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const authFailure = ownerAuthFailure(err)
    if (authFailure) return authFailure
    console.error("Stripe checkout error:", err)
    return NextResponse.json(
      { error: "Stripe checkout failed" },
      { status: 500 }
    )
  }
}

export async function handleCheckoutPost(req: Request, auth?: OwnerAuthAdapter) {
  return withOwnerResponse(() => checkoutPost(req, auth))
}

export async function POST(req: Request) {
  return handleCheckoutPost(req)
}
