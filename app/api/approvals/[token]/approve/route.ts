import { createHash } from "crypto"
import { NextResponse } from "next/server.js"
import { createClient } from "@supabase/supabase-js"
import { buildInvoiceFromEstimate } from "../../../../app/lib/invoices"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

type ProposalRow = {
  id: string
  status: string | null
  owner_email: string
  local_estimate_id: string | null
  local_job_id: string | null
  estimate_snapshot: any
}

type ApprovalRow = {
  id: string
  approved_by: string | null
  approved_at: string | null
  signature_data_url: string | null
}

function hashApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function isExpired(expiresAt: unknown) {
  if (!expiresAt || typeof expiresAt !== "string") return false
  const expiresMs = Date.parse(expiresAt)
  return Number.isFinite(expiresMs) && expiresMs <= Date.now()
}

async function getExistingApprovalInvoice(client: typeof supabase, proposalId: string) {
  const { data, error } = await client
    .from("approval_invoices")
    .select("invoice_snapshot")
    .eq("proposal_id", proposalId)
    .maybeSingle()

  if (error) return null
  return data?.invoice_snapshot ?? null
}

function isUniqueViolation(error: unknown) {
  const msg = String((error as any)?.message || "")
  const code = String((error as any)?.code || "")
  return code === "23505" || /duplicate key|unique/i.test(msg)
}

async function getExistingApproval(client: typeof supabase, proposalId: string) {
  const { data, error } = await client
    .from("proposal_approvals")
    .select("id, approved_by, approved_at, signature_data_url")
    .eq("proposal_id", proposalId)
    .maybeSingle()

  if (error || !data?.id) return null
  return data as ApprovalRow
}

async function createApprovalInvoiceIfMissing(args: {
  client: typeof supabase
  proposal: ProposalRow
  approvalId: string | null
}) {
  const existing = await getExistingApprovalInvoice(args.client, args.proposal.id)
  if (existing) {
    return { created: false, invoice: existing }
  }

  const built = buildInvoiceFromEstimate({
    estimate: args.proposal.estimate_snapshot,
    dueTerms: "Due upon approval",
    notePaymentTerms: "Due upon approval",
  })

  if (!built.ok) {
    return { created: false, invoice: null }
  }

  const { error } = await args.client
    .from("approval_invoices")
    .insert({
      proposal_id: args.proposal.id,
      approval_id: args.approvalId,
      owner_email: args.proposal.owner_email,
      local_estimate_id: args.proposal.local_estimate_id,
      local_job_id: args.proposal.local_job_id,
      local_invoice_id: built.invoice.id,
      invoice_snapshot: built.invoice,
      status: "draft",
    })

  if (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await getExistingApprovalInvoice(args.client, args.proposal.id)
      return { created: false, invoice: duplicate }
    }
    throw error
  }

  return { created: true, invoice: built.invoice }
}

export async function handleApprovalSubmitPost(
  req: Request,
  { params }: { params: Promise<{ token?: string }> },
  client: typeof supabase = supabase
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

    const { data: link, error: linkError } = await client
      .from("approval_links")
      .select("proposal_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (linkError || !link || link.status !== "active" || isExpired(link.expires_at)) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    const { data: proposal, error: proposalError } = await client
      .from("estimate_proposals")
      .select("id, status, owner_email, local_estimate_id, local_job_id, estimate_snapshot")
      .eq("id", link.proposal_id)
      .maybeSingle()

    if (proposalError || !proposal?.id) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    const proposalRow = proposal as ProposalRow

    if (proposalRow.status === "approved") {
      const existingInvoice = await getExistingApprovalInvoice(client, proposalRow.id)
      const existingApproval = await getExistingApproval(client, proposalRow.id)
      return NextResponse.json({
        status: "approved",
        alreadyApproved: true,
        approvedBy: existingApproval?.approved_by ?? null,
        approvedAt: existingApproval?.approved_at ?? null,
        invoiceCreated: false,
        invoice: existingInvoice,
      })
    }

    let approval: ApprovalRow | null = null
    const { data: insertedApproval, error: approvalError } = await client
      .from("proposal_approvals")
      .insert({
        proposal_id: proposalRow.id,
        approved_by: approvedBy,
        approved_at: approvedAt,
        signature_data_url: signatureDataUrl,
      })
      .select("id, approved_by, approved_at, signature_data_url")
      .single()

    if (approvalError || !insertedApproval?.id) {
      if (isUniqueViolation(approvalError)) {
        approval = await getExistingApproval(client, proposalRow.id)
      }

      if (!approval) {
        return NextResponse.json({ error: "Approval could not be saved." }, { status: 500 })
      }
    } else {
      approval = insertedApproval as ApprovalRow
    }

    const { error: updateError } = await client
      .from("estimate_proposals")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalRow.id)

    if (updateError) {
      return NextResponse.json({ error: "Approval status could not be updated." }, { status: 500 })
    }

    const invoiceResult = await createApprovalInvoiceIfMissing({
      client,
      proposal: proposalRow,
      approvalId: approval.id,
    })

    return NextResponse.json({
      status: "approved",
      approvedBy: approval.approved_by ?? approvedBy,
      approvedAt: approval.approved_at ?? approvedAt,
      invoiceCreated: invoiceResult.created,
      invoice: invoiceResult.invoice,
    })
  } catch {
    return NextResponse.json({ error: "Approval could not be saved." }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ token?: string }> }
) {
  return handleApprovalSubmitPost(req, context)
}
