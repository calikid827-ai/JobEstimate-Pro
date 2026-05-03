import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

type ProposalRow = {
  id: string
  local_estimate_id: string | null
  status: string | null
}

type ApprovalRow = {
  proposal_id: string
  approved_by: string | null
  approved_at: string | null
  signature_data_url: string | null
}

export async function GET(req: Request) {
  try {
    const emailRaw = new URL(req.url).searchParams.get("email")

    if (!emailRaw) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 })
    }

    const ownerEmail = normalizeEmail(emailRaw)

    if (!ownerEmail) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 })
    }

    const { data: proposals, error: proposalsError } = await supabase
      .from("estimate_proposals")
      .select("id, local_estimate_id, status")
      .eq("owner_email", ownerEmail)

    if (proposalsError) {
      console.error("Approval status proposal lookup failed:", proposalsError)
      return NextResponse.json({ error: "Approval statuses could not be loaded." }, { status: 500 })
    }

    const proposalRows = (Array.isArray(proposals) ? proposals : []) as ProposalRow[]
    const proposalIds = proposalRows.map((proposal) => proposal.id).filter(Boolean)
    const approvalsByProposal = new Map<string, ApprovalRow>()

    if (proposalIds.length > 0) {
      const { data: approvals, error: approvalsError } = await supabase
        .from("proposal_approvals")
        .select("proposal_id, approved_by, approved_at, signature_data_url")
        .in("proposal_id", proposalIds)
        .order("approved_at", { ascending: false })

      if (approvalsError) {
        console.error("Approval status approval lookup failed:", approvalsError)
        return NextResponse.json({ error: "Approval statuses could not be loaded." }, { status: 500 })
      }

      for (const approval of (Array.isArray(approvals) ? approvals : []) as ApprovalRow[]) {
        if (!approvalsByProposal.has(approval.proposal_id)) {
          approvalsByProposal.set(approval.proposal_id, approval)
        }
      }
    }

    return NextResponse.json({
      approvals: proposalRows
        .filter((proposal) => proposal.local_estimate_id)
        .map((proposal) => {
          const approval = approvalsByProposal.get(proposal.id)

          return {
            local_estimate_id: proposal.local_estimate_id,
            status: proposal.status === "approved" ? "approved" : "pending",
            approved_by: approval?.approved_by ?? null,
            approved_at: approval?.approved_at ?? null,
            signature_data_url: approval?.signature_data_url ?? null,
          }
        }),
    })
  } catch (err) {
    console.error("Approval status route failed:", err)
    return NextResponse.json({ error: "Approval statuses could not be loaded." }, { status: 500 })
  }
}
