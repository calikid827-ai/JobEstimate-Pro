import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// Env validation
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(req: Request) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json(
      { entitled: false },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("entitlements")
    .select("active")
    .eq("email", email)
    .single()

  if (error || !data) {
    return NextResponse.json({ entitled: false })
  }

  return NextResponse.json({ entitled: data.active === true })
}