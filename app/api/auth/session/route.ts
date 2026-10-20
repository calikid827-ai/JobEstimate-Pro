import { requireOwner, withOwnerResponse } from "../../../lib/owner-auth"

export const dynamic = "force-dynamic"
export async function GET(req: Request) {
  return withOwnerResponse(async () => Response.json({ owner: await requireOwner(req) }))
}
