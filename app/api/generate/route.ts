import { NextResponse } from "next/server"
import OpenAI from "openai"

export const dynamic = "force-dynamic"

// -----------------------------
// ENV VALIDATION (HARD FAIL)
// -----------------------------
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing")
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// -----------------------------
// TYPES (UI-ALIGNED)
// -----------------------------
type Pricing = {
  labor: number
  materials: number
  subs: number
  markup: number
  total: number
}

type AIResponse = {
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
    markup: Math.min(40, Math.max(10, pricing.markup)),
    total: Math.min(MAX_TOTAL, Math.max(0, pricing.total)),
  }
}

// -----------------------------
// API HANDLER
// -----------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json()

    const scopeChange = body.scopeChange
    const trade =
      typeof body.trade === "string" && body.trade.trim()
        ? body.trade
        : "general renovation"
    const state =
      typeof body.state === "string" && body.state.trim()
        ? body.state
        : "United States"

    if (!scopeChange || typeof scopeChange !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid scopeChange" },
        { status: 400 }
      )
    }

    // -----------------------------
    // AI PROMPT (STRICT JSON ONLY)
    // -----------------------------
    const prompt = `
You are an expert U.S. construction estimator and licensed project manager.

Your task:
- Write a professional construction change order
- Generate realistic cost estimates the contractor can edit

INPUTS:
- Trade Type: ${trade}
- Job State: ${state}

SCOPE OF CHANGE:
${scopeChange}

ESTIMATION RULES:
- Use realistic 2024–2025 U.S. contractor pricing
- Adjust labor rates based on the job state
- Assume mid-market residential work
- Do NOT list detailed line items — totals only
- Round all dollar values to whole numbers
- Suggest reasonable contractor markup (15–25%)

TRADE PRICING GUIDANCE:
- Painting → labor-heavy, low materials
- Flooring → materials + installation labor
- Electrical → high labor rate, code compliance
- Plumbing → skilled labor + fixtures
- Tile / bathroom → labor-intensive, material waste
- Carpentry → balanced labor + materials
- General renovation → balanced estimate

STATE LABOR ADJUSTMENT:
- High-cost states (CA, NY, WA, MA): higher labor
- Mid-cost states (TX, FL, CO, AZ): average labor
- Lower-cost states: slightly reduced labor

OUTPUT FORMAT:
RETURN ONLY VALID JSON — NO MARKDOWN, NO EXPLANATIONS

{
  "trade": "<confirmed or detected trade>",
  "description": "<professional contract-style change order>",
  "pricing": {
    "labor": <number>,
    "materials": <number>,
    "subs": <number>,
    "markup": <percentage>,
    "total": <number>
  }
}
`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = completion.choices[0]?.message?.content

    if (!raw) {
      throw new Error("Empty AI response")
    }

    // -----------------------------
    // PARSE & VALIDATE JSON
    // -----------------------------
    let parsed: AIResponse

    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error("AI returned invalid JSON:", raw)
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw },
        { status: 500 }
      )
    }

    if (
      typeof parsed.description !== "string" ||
      !isValidPricing(parsed.pricing)
    ) {
      console.error("AI schema validation failed:", parsed)
      return NextResponse.json(
        { error: "AI response schema invalid", parsed },
        { status: 500 }
      )
    }

    // -----------------------------
    // SAFETY CLAMPS
    // -----------------------------
    const safePricing = clampPricing(parsed.pricing)

    // -----------------------------
    // FINAL RESPONSE (UI-READY)
    // -----------------------------
    return NextResponse.json({
      trade: parsed.trade || trade,
      text: parsed.description,
      pricing: safePricing,
    })
  } catch (error) {
    console.error("AI generation failed:", error)
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    )
  }
}