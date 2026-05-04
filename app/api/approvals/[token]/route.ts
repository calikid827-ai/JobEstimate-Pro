import { createHash } from "crypto"
import { NextResponse } from "next/server.js"
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

function cleanObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function buildPublicApprovalEstimate(snapshot: unknown, status: string) {
  const source = cleanObject(snapshot)
  const jobDetails = cleanObject(source.jobDetails)
  const pricing = cleanObject(source.pricing)
  const tax = cleanObject(source.tax)
  const deposit = cleanObject(source.deposit)
  const companyProfile = cleanObject(source.companyProfile)

  return {
    id: typeof source.id === "string" ? source.id : "",
    createdAt: typeof source.createdAt === "number" ? source.createdAt : Date.now(),
    jobId: typeof source.jobId === "string" ? source.jobId : undefined,
    documentType: typeof source.documentType === "string" ? source.documentType : "Estimate",
    jobDetails: {
      clientName: typeof jobDetails.clientName === "string" ? jobDetails.clientName : "",
      jobName: typeof jobDetails.jobName === "string" ? jobDetails.jobName : "",
      changeOrderNo: typeof jobDetails.changeOrderNo === "string" ? jobDetails.changeOrderNo : "",
      jobAddress: typeof jobDetails.jobAddress === "string" ? jobDetails.jobAddress : "",
      date: typeof jobDetails.date === "string" ? jobDetails.date : "",
    },
    result: typeof source.result === "string" ? source.result : "",
    pricing: {
      labor: typeof pricing.labor === "number" ? pricing.labor : 0,
      materials: typeof pricing.materials === "number" ? pricing.materials : 0,
      subs: typeof pricing.subs === "number" ? pricing.subs : 0,
      markup: typeof pricing.markup === "number" ? pricing.markup : 0,
      total: typeof pricing.total === "number" ? pricing.total : 0,
    },
    schedule: source.schedule ?? null,
    tax: source.tax
      ? {
          enabled: Boolean(tax.enabled),
          rate: typeof tax.rate === "number" ? tax.rate : 0,
        }
      : null,
    deposit: source.deposit
      ? {
          enabled: Boolean(deposit.enabled),
          type: deposit.type === "fixed" ? "fixed" : "percent",
          value: typeof deposit.value === "number" ? deposit.value : 0,
        }
      : null,
    companyProfile: {
      name: typeof companyProfile.name === "string" ? companyProfile.name : "",
      address: typeof companyProfile.address === "string" ? companyProfile.address : "",
      phone: typeof companyProfile.phone === "string" ? companyProfile.phone : "",
      email: typeof companyProfile.email === "string" ? companyProfile.email : "",
      license: typeof companyProfile.license === "string" ? companyProfile.license : "",
      paymentTerms: typeof companyProfile.paymentTerms === "string" ? companyProfile.paymentTerms : "",
    },
    approval: {
      status: status === "approved" ? "approved" : "pending",
    },
  }
}

export async function handlePublicApprovalGet(
  _req: Request,
  { params }: { params: Promise<{ token?: string }> },
  client: typeof supabase = supabase
) {
  try {
    const { token: rawToken } = await params
    const token = typeof rawToken === "string" ? rawToken.trim() : ""

    if (!token) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
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
      .select("id, status, estimate_snapshot")
      .eq("id", link.proposal_id)
      .maybeSingle()

    if (proposalError || !proposal?.estimate_snapshot) {
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
    }

    await client
      .from("approval_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)

    return NextResponse.json({
      proposalId: proposal.id,
      status: proposal.status || "pending",
      estimate: buildPublicApprovalEstimate(
        proposal.estimate_snapshot,
        proposal.status || "pending"
      ),
    })
  } catch {
    return NextResponse.json({ error: "Approval link not found." }, { status: 404 })
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ token?: string }> }
) {
  return handlePublicApprovalGet(req, context)
}
