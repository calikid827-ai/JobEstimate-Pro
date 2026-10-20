import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { resolveEntitlement } from "./access"
import { requireOwner, assertOwnerEmail, ownerAuthFailure, withOwnerResponse, type OwnerAuthAdapter } from "../../lib/owner-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const FREE_LIMIT = 3

async function entitlementPost(req: Request, client: typeof supabase, auth?: OwnerAuthAdapter) {
  try {
    const owner = await requireOwner(req, auth)
    const body = await req.json().catch(() => null)
    assertOwnerEmail(owner, body?.email)
    const email = owner.email

    const { data, error } = await client
      .from("entitlements")
      .select("active, usage_count, plan, subscription_status, current_period_end, cancel_at_period_end, free_limit")
      .eq("email", email)
      .maybeSingle()

    if (error) {
      console.error("Entitlement lookup error:", error)
      return NextResponse.json({ entitled: false, usage_count: 0, free_limit: FREE_LIMIT })
    }

    const resolved = resolveEntitlement(data)
    const freeLimit =
      typeof data?.free_limit === "number" ? data.free_limit : FREE_LIMIT

    return NextResponse.json({
      ...resolved,
      usage_count: typeof data?.usage_count === "number" ? data.usage_count : 0,
      free_limit: freeLimit,
    })
  } catch (err) {
    const authFailure = ownerAuthFailure(err)
    if (authFailure) return authFailure
    console.error("Entitlement route failed:", err)
    return NextResponse.json({ entitled: false, usage_count: 0, free_limit: FREE_LIMIT })
  }
}

export async function handleEntitlementPost(req: Request, client: typeof supabase = supabase, auth?: OwnerAuthAdapter) {
  return withOwnerResponse(() => entitlementPost(req, client, auth))
}

export async function POST(req: Request) {
  return handleEntitlementPost(req)
}
