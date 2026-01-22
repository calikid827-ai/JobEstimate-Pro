import { NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// -----------------------------
// ENV VALIDATION
// -----------------------------
if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY missing")

if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL missing")

if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")

// -----------------------------
// CLIENTS
// -----------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// -----------------------------
// TYPES
// -----------------------------
type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

type AIResponse = {
  documentType: "Change Order" | "Estimate" | "Change Order / Estimate"
  trade: string
  description: string
  pricing: Pricing
}

// -----------------------------
// HELPERS
// -----------------------------
function isValidPricing(p: any): p is Pricing {
  return (
    typeof p?.labor === "number" &&
    typeof p?.materials === "number" &&
    typeof p?.subs === "number" &&
    typeof p?.markup === "number" &&
    typeof p?.total === "number"
  )
}

function clampPricing(pricing: Pricing): Pricing {
  const MAX_TOTAL = 250_000

  return {
    labor: Math.max(0, pricing.labor),
    materials: Math.max(0, pricing.materials),
    subs: Math.max(0, pricing.subs),
    markup: Math.min(25, Math.max(15, pricing.markup)),
    total: Math.min(MAX_TOTAL, Math.max(0, pricing.total)),
  }
}

// 🔍 Trade auto-detection
function autoDetectTrade(scope: string): string {
  const s = scope.toLowerCase()

  if (/(paint|painting|prime|primer|drywall patch|patch drywall)/.test(s))
    return "painting"
  if (/(floor|flooring|tile|grout)/.test(s)) return "flooring"
  if (/(electrical|outlet|switch|panel|lighting)/.test(s))
    return "electrical"
  if (/(plumb|toilet|sink|faucet|shower|water line)/.test(s))
    return "plumbing"
  if (/(carpentry|trim|baseboard|framing|cabinet)/.test(s))
    return "carpentry"

  return "general renovation"
}

// 🧠 Estimate vs Change Order intent hint (soft guidance)
function detectIntent(scope: string): string {
  const s = scope.toLowerCase()

  if (
    /(change order|additional work|not included|modify|revision|per original contract)/.test(
      s
    )
  ) {
    return "Likely a Change Order"
  }

  if (
    /(estimate|proposal|pricing for|quote|new work|anticipated work)/.test(s)
  ) {
    return "Likely an Estimate"
  }

  return "Unclear — could be either"
}

// -----------------------------
// API HANDLER
// -----------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json()

    const email = body.email
    const scopeChange = body.scopeChange
    const uiTrade = typeof body.trade === "string" ? body.trade.trim() : ""
    const rawState = typeof body.state === "string" ? body.state.trim() : ""

    // -----------------------------
    // BASIC VALIDATION
    // -----------------------------
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 401 })
    }

    if (!scopeChange || typeof scopeChange !== "string") {
      return NextResponse.json(
        { error: "Invalid scopeChange" },
        { status: 400 }
      )
    }

    // -----------------------------
    // ENTITLEMENT CHECK
    // Paid users identified here
    // Free users enforced client-side
    // -----------------------------
    const { data: entitlement } = await supabase
      .from("entitlements")
      .select("active")
      .eq("email", email)
      .single()

    const isPaid = entitlement?.active === true

    // Intentionally allow both paid and free users here
    // Client handles free limits

    // -----------------------------
    // STATE NORMALIZATION
    // -----------------------------
    const jobState = rawState || "United States"

    // -----------------------------
    // TRADE + INTENT
    // -----------------------------
    const trade = uiTrade || autoDetectTrade(scopeChange)
    const intentHint = detectIntent(scopeChange)

    // -----------------------------
    // AI PROMPT (PRODUCTION-LOCKED)
    // -----------------------------
    const prompt = `
You are an expert U.S. construction estimator and licensed project manager.

Your task is to generate a professional construction document that may be either:
- A Change Order (modifying an existing contract), OR
- An Estimate (proposed or anticipated work)

PRE-ANALYSIS:
${intentHint}

INPUTS:
- Trade Type: ${trade}
- Job State: ${jobState}

SCOPE OF WORK:
${scopeChange}

DOCUMENT RULES (CRITICAL):
- If modifying existing contract work → "Change Order"
- If proposing new work → "Estimate"
- If unclear → "Change Order / Estimate"
- Opening sentence MUST clearly state document type
- Use professional, contract-ready language
- Describe labor activities, materials, preparation, and intent
- Write 3–5 clear, detailed sentences
- No disclaimers or markdown

PRICING RULES:
- Use realistic 2024–2025 U.S. contractor pricing
- Adjust labor rates based on job state
- Mid-market residential work
- Totals only (no line items)
- Round to whole dollars

TRADE PRICING GUIDANCE:
- Painting → labor-heavy, low materials
- Flooring → materials + install labor
- Electrical → high labor rate
- Plumbing → skilled labor + fixtures
- Tile → labor-intensive
- Carpentry → balanced
- General renovation → balanced

MARKUP RULE:
- Suggest markup between 15–25%

OUTPUT FORMAT:
Return ONLY valid JSON.

{
  "documentType": "Change Order | Estimate | Change Order / Estimate",
  "trade": "<confirmed trade>",
  "description": "<professional description beginning with document type>",
  "pricing": {
    "labor": <number>,
    "materials": <number>,
    "subs": <number>,
    "markup": <number>,
    "total": <number>
  }
}
`

    // -----------------------------
    // OPENAI CALL
    // -----------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) throw new Error("Empty AI response")

    const parsed: AIResponse = JSON.parse(raw)

    if (
      typeof parsed.description !== "string" ||
      !isValidPricing(parsed.pricing)
    ) {
      return NextResponse.json(
        { error: "AI response invalid", parsed },
        { status: 500 }
      )
    }

    const safePricing = clampPricing(parsed.pricing)

    return NextResponse.json({
      documentType: parsed.documentType,
      trade: parsed.trade || trade,
      text: parsed.description,
      pricing: safePricing,
    })
  } catch (err) {
    console.error("Generate failed:", err)
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    )
  }
}