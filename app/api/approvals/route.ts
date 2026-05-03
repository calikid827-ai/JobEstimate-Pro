import { createHash, randomBytes } from "crypto"
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

function makeApprovalToken() {
  return randomBytes(32).toString("base64url")
}

function hashApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback
}

function cleanNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function cleanObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function buildCustomerSafeSnapshot(estimate: unknown, companyProfile: unknown) {
  const source = cleanObject(estimate)
  const jobDetails = cleanObject(source.jobDetails)
  const pricing = cleanObject(source.pricing)
  const tax = cleanObject(source.tax)
  const deposit = cleanObject(source.deposit)
  const company = cleanObject(companyProfile)

  const id = cleanString(source.id)
  const documentType = cleanString(source.documentType)
  const result = cleanString(source.result)
  const clientName = cleanString(jobDetails.clientName)
  const jobName = cleanString(jobDetails.jobName)

  if (!id || !documentType || !result || !clientName || !jobName) {
    return null
  }

  return {
    id,
    createdAt: cleanNumber(source.createdAt, Date.now()),
    jobId: cleanString(source.jobId) || null,
    documentType,
    jobDetails: {
      clientName,
      jobName,
      changeOrderNo: cleanString(jobDetails.changeOrderNo),
      jobAddress: cleanString(jobDetails.jobAddress),
      date: cleanString(jobDetails.date),
    },
    trade: cleanString(source.trade),
    state: cleanString(source.state),
    scopeChange: cleanString(source.scopeChange),
    result,
    pricing: {
      labor: cleanNumber(pricing.labor),
      materials: cleanNumber(pricing.materials),
      subs: cleanNumber(pricing.subs),
      markup: cleanNumber(pricing.markup),
      total: cleanNumber(pricing.total),
    },
    schedule: source.schedule ?? null,
    tax: source.tax
      ? {
          enabled: Boolean(tax.enabled),
          rate: cleanNumber(tax.rate),
        }
      : null,
    deposit: source.deposit
      ? {
          enabled: Boolean(deposit.enabled),
          type: cleanString(deposit.type) === "fixed" ? "fixed" : "percent",
          value: cleanNumber(deposit.value),
        }
      : null,
    estimateRows: Array.isArray(source.estimateRows) ? source.estimateRows : null,
    estimateEmbeddedBurdens: Array.isArray(source.estimateEmbeddedBurdens)
      ? source.estimateEmbeddedBurdens
      : null,
    estimateSections: Array.isArray(source.estimateSections) ? source.estimateSections : null,
    companyProfile: {
      name: cleanString(company.name),
      address: cleanString(company.address),
      phone: cleanString(company.phone),
      email: cleanString(company.email),
      license: cleanString(company.license),
      paymentTerms: cleanString(company.paymentTerms),
    },
    approval: {
      status: "pending",
    },
  }
}

function getSiteUrl(req: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")
  const origin = req.headers.get("origin")
  if (origin) return origin.replace(/\/$/, "")
  return new URL(req.url).origin.replace(/\/$/, "")
}

function isUniqueViolation(error: unknown) {
  const msg = String((error as any)?.message || "")
  const code = String((error as any)?.code || "")
  return code === "23505" || /duplicate key|unique/i.test(msg)
}

async function findReusableProposal(args: {
  ownerEmail: string
  localEstimateId: string
}) {
  const { data, error } = await supabase
    .from("estimate_proposals")
    .select("id")
    .eq("owner_email", args.ownerEmail)
    .eq("local_estimate_id", args.localEstimateId)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data?.id ? { id: data.id as string } : null
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const emailRaw = body?.email

    if (!emailRaw || typeof emailRaw !== "string") {
      return NextResponse.json({ error: "Owner email is required." }, { status: 400 })
    }

    const ownerEmail = normalizeEmail(emailRaw)
    const snapshot = buildCustomerSafeSnapshot(body?.estimate, body?.companyProfile)

    if (!ownerEmail || !snapshot) {
      return NextResponse.json({ error: "A valid estimate snapshot is required." }, { status: 400 })
    }

    let proposal = await findReusableProposal({
      ownerEmail,
      localEstimateId: snapshot.id,
    })

    if (!proposal) {
      const { data: insertedProposal, error: proposalError } = await supabase
        .from("estimate_proposals")
        .insert({
          owner_email: ownerEmail,
          local_estimate_id: snapshot.id,
          local_job_id: snapshot.jobId,
          document_type: snapshot.documentType,
          client_name: snapshot.jobDetails.clientName,
          job_name: snapshot.jobDetails.jobName,
          job_address: snapshot.jobDetails.jobAddress,
          status: "pending",
          estimate_snapshot: snapshot,
        })
        .select("id")
        .single()

      if (proposalError || !insertedProposal?.id) {
        if (isUniqueViolation(proposalError)) {
          proposal = await findReusableProposal({
            ownerEmail,
            localEstimateId: snapshot.id,
          })
        }

        if (!proposal) {
          console.error("Approval proposal snapshot write failed:", proposalError)
          return NextResponse.json({ error: "Approval snapshot could not be saved." }, { status: 500 })
        }
      } else {
        proposal = { id: insertedProposal.id }
      }
    }

    const token = makeApprovalToken()
    const tokenHash = hashApprovalToken(token)

    const { error: linkError } = await supabase
      .from("approval_links")
      .insert({
        proposal_id: proposal.id,
        token_hash: tokenHash,
        status: "active",
      })

    if (linkError) {
      console.error("Approval link write failed:", linkError)
      return NextResponse.json({ error: "Approval link could not be created." }, { status: 500 })
    }

    return NextResponse.json({
      approvalUrl: `${getSiteUrl(req)}/approve/${token}`,
      proposalId: proposal.id,
    })
  } catch (err) {
    console.error("Approval snapshot route failed:", err)
    return NextResponse.json({ error: "Approval link could not be created." }, { status: 500 })
  }
}
