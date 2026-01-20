import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ status: "Webhook endpoint live" })
}

export async function POST(req: Request) {
  return NextResponse.json({ received: true })
}