import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function hashApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function isExpired(expiresAt: unknown) {
  if (!expiresAt || typeof expiresAt !== "string") return false
  const expiresMs = Date.parse(expiresAt)
  return Number.isFinite(expiresMs) && expiresMs <= Date.now()
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token?: string }> }
) {
  try {
    const { token: rawToken } = await params
    const token = typeof rawToken === "string" ? rawToken.trim() : ""

    if (!token) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    const tokenHash = hashApprovalToken(token)

    const { data: link, error: linkError } = await supabase
      .from("approval_links")
      .select("proposal_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (linkError || !link || link.status !== "active" || isExpired(link.expires_at)) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    const { data: proposal, error: proposalError } = await supabase
      .from("estimate_proposals")
      .select("id, status, estimate_snapshot")
      .eq("id", link.proposal_id)
      .maybeSingle()

    if (proposalError || !proposal?.estimate_snapshot) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    await supabase
      .from("approval_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)

    return NextResponse.json({
      proposalId: proposal.id,
      status: proposal.status || "pending",
      estimate: proposal.estimate_snapshot,
    })
  } catch {
    return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
  }
}
