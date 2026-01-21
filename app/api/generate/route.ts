import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const { scopeChange } = await req.json();

  const systemPrompt = `
You are a construction estimator.

Based on the scope description, estimate:
- labor cost
- material cost
- subcontractor cost (if applicable)

Return JSON ONLY in this exact format:

{
  "text": "Professional change order description",
  "labor": number,
  "materials": number,
  "subs": number
}

Guidelines:
- Interior painting: $2–$4 per sq ft labor
- Flooring: $5–$12 per sq ft
- Electrical: $85–$125/hr
- Plumbing: $90–$150/hr
- If no subs needed, subs = 0
- Round to nearest whole dollar
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: scopeChange },
    ],
    temperature: 0.2,
  });

  const raw = completion.choices[0].message.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({
      text: "Error generating estimate.",
      labor: 0,
      materials: 0,
      subs: 0,
    });
  }

  return NextResponse.json({
    text: parsed.text,
    labor: parsed.labor || 0,
    materials: parsed.materials || 0,
    subs: parsed.subs || 0,
  });
}