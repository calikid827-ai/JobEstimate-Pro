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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token?: string }> }
) {
  try {
    const { token: rawToken } = await params
    const token = typeof rawToken === "string" ? rawToken.trim() : ""

    if (!token) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    const approvedBy =
      typeof body?.approvedBy === "string" ? body.approvedBy.trim() : ""
    const signatureDataUrl =
      typeof body?.signatureDataUrl === "string" ? body.signatureDataUrl.trim() : ""
    const approvedAt =
      typeof body?.approvedAt === "string" && Number.isFinite(Date.parse(body.approvedAt))
        ? body.approvedAt
        : new Date().toISOString()

    if (!approvedBy || !signatureDataUrl) {
      return NextResponse.json({ error: "Approver name and signature are required." }, { status: 400 })
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
      .select("id, status")
      .eq("id", link.proposal_id)
      .maybeSingle()

    if (proposalError || !proposal?.id) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    if (proposal.status === "approved") {
      return NextResponse.json({
        status: "approved",
        alreadyApproved: true,
      })
    }

    const { error: approvalError } = await supabase
      .from("proposal_approvals")
      .insert({
        proposal_id: proposal.id,
        approved_by: approvedBy,
        approved_at: approvedAt,
        signature_data_url: signatureDataUrl,
      })

    if (approvalError) {
      return NextResponse.json({ error: "Approval could not be saved." }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from("estimate_proposals")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.id)

    if (updateError) {
      return NextResponse.json({ error: "Approval status could not be updated." }, { status: 500 })
    }

    return NextResponse.json({
      status: "approved",
      approvedBy,
      approvedAt,
    })
  } catch {
    return NextResponse.json({ error: "Approval could not be saved." }, { status: 500 })
  }
}
