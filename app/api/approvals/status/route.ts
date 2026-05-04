import { NextResponse } from "next/server.js"
import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

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

function hashOwnerSyncToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
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

type ApprovalInvoiceRow = {
  proposal_id: string
  local_invoice_id: string | null
  invoice_snapshot: any
  status: string | null
}

export async function handleApprovalStatusGet(
  req: Request,
  client: typeof supabase = supabase
) {
  try {
    const emailRaw = new URL(req.url).searchParams.get("email")
    const ownerSyncTokenRaw = new URL(req.url).searchParams.get("ownerSyncToken")

    if (!emailRaw || !ownerSyncTokenRaw) {
      return NextResponse.json({ error: "Email and owner sync token are required." }, { status: 400 })
    }

    const ownerEmail = normalizeEmail(emailRaw)
    const ownerSyncToken = ownerSyncTokenRaw.trim()

    if (!ownerEmail || !ownerSyncToken) {
      return NextResponse.json({ error: "Email and owner sync token are required." }, { status: 400 })
    }

    const { data: syncToken, error: syncTokenError } = await client
      .from("approval_owner_sync_tokens")
      .select("id")
      .eq("owner_email", ownerEmail)
      .eq("token_hash", hashOwnerSyncToken(ownerSyncToken))
      .maybeSingle()

    if (syncTokenError || !syncToken?.id) {
      return NextResponse.json({ error: "Approval sync token is invalid." }, { status: 403 })
    }

    const { data: proposals, error: proposalsError } = await client
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
    const invoicesByProposal = new Map<string, ApprovalInvoiceRow>()

    if (proposalIds.length > 0) {
      const { data: approvals, error: approvalsError } = await client
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

      const { data: approvalInvoices, error: invoicesError } = await client
        .from("approval_invoices")
        .select("proposal_id, local_invoice_id, invoice_snapshot, status")
        .in("proposal_id", proposalIds)

      if (invoicesError) {
        console.error("Approval status invoice lookup failed:", invoicesError)
        return NextResponse.json({ error: "Approval statuses could not be loaded." }, { status: 500 })
      }

      for (const invoice of (Array.isArray(approvalInvoices) ? approvalInvoices : []) as ApprovalInvoiceRow[]) {
        if (!invoicesByProposal.has(invoice.proposal_id)) {
          invoicesByProposal.set(invoice.proposal_id, invoice)
        }
      }
    }

    return NextResponse.json({
      approvals: proposalRows
        .filter((proposal) => proposal.local_estimate_id)
        .map((proposal) => {
          const approval = approvalsByProposal.get(proposal.id)
          const approvalInvoice = invoicesByProposal.get(proposal.id)

          return {
            local_estimate_id: proposal.local_estimate_id,
            status: proposal.status === "approved" ? "approved" : "pending",
            approved_by: approval?.approved_by ?? null,
            approved_at: approval?.approved_at ?? null,
            signature_data_url: approval?.signature_data_url ?? null,
            approval_invoice: approvalInvoice?.invoice_snapshot
              ? {
                  local_invoice_id: approvalInvoice.local_invoice_id,
                  status: approvalInvoice.status || "draft",
                  invoice_snapshot: approvalInvoice.invoice_snapshot,
                }
              : null,
          }
        }),
    })
  } catch (err) {
    console.error("Approval status route failed:", err)
    return NextResponse.json({ error: "Approval statuses could not be loaded." }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return handleApprovalStatusGet(req)
}
