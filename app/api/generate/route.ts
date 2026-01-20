import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  const { scopeChange, markup } = await req.json()

  const prompt = `
You are a professional residential construction project manager.

Write a clear, client-facing CHANGE ORDER based on the information below.

Rules:
- Use professional but simple language
- Be clear and neutral (not salesy)
- Do NOT include emojis
- Do NOT mention AI
- Do NOT include disclaimers
- Assume this will be attached to a contract

Structure the response EXACTLY like this:

CHANGE ORDER SUMMARY
Brief 2–3 sentence explanation of why this change is required.

SCOPE OF CHANGE
- Bullet list of the specific work being added, removed, or modified.

COST BREAKDOWN
- Labor:
- Materials:
- Subcontractors (if applicable):
- Subtotal:
- Markup (${markup}%):
- Total Change Order Amount:

SCHEDULE IMPACT
One sentence explaining any impact to the project timeline, or state "No change to project schedule."

APPROVAL
By approving this change order, the client authorizes the contractor to proceed with the work described above and agrees to the revised cost and schedule.

Project Change Description:
${scopeChange}
`

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  })

  return NextResponse.json({
    text: completion.choices[0].message.content,
  })
}