import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

export async function POST(req: Request) {
  try {
    const { scopeChange, trade, state } = await req.json()

    if (!scopeChange) {
      return NextResponse.json(
        { error: "Missing scope change" },
        { status: 400 }
      )
    }

    const prompt = `
You are an expert U.S. construction estimator.

Job Location:
State: ${state || "national average"}

Trade Type: ${trade || "general renovation"}

Apply realistic labor rates by state:

Labor rate guidance:
- California / New York / Washington: very high labor costs
- Texas / Arizona / Florida: moderate labor costs
- Midwest / Southeast: lower labor costs

Pricing guidance by trade:
- Painting: labor-heavy, low materials
- Flooring: materials + install labor
- Electrical: high hourly labor, licensed work
- Plumbing: skilled labor + fixtures
- Tile: labor-intensive with waste factor
- General renovation: balanced estimate

Scope of Change:
${scopeChange}

Return ONLY valid JSON:

{
  "description": "Professional written change order text",
  "pricing": {
    "labor": number,
    "materials": number,
    "subcontractors": number,
    "markupPercent": number,
    "total": number
  }
}

Rules:
- All pricing must reflect the job state
- Numbers must be realistic USD estimates
- Do not include currency symbols
- Do not include any text outside JSON
`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    })

    const raw = completion.choices[0].message.content || ""

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error("AI returned invalid JSON:", raw)
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw },
        { status: 500 }
      )
    }

    return NextResponse.json({
      text: parsed.description,
      pricing: {
        labor: parsed.pricing.labor,
        materials: parsed.pricing.materials,
        subs: parsed.pricing.subcontractors,
        markup: parsed.pricing.markupPercent,
        total: parsed.pricing.total,
      },
    })
  } catch (err) {
    console.error("AI generate error:", err)
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    )
  }
}