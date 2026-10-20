import { createClient } from "@supabase/supabase-js"

export type VerifiedOwner = { id: string; email: string }
export type OwnerAuthAdapter = {
  getUser: (token: string) => Promise<{
    data: { user: null | {
      id?: string; email?: string; email_confirmed_at?: string | null
      is_anonymous?: boolean; role?: string
    } }
    error: unknown
  }>
}

export class OwnerAuthError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let authClient: ReturnType<typeof createClient> | undefined
function authAdapter(): OwnerAuthAdapter {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new OwnerAuthError(503, "AUTH_UNAVAILABLE", "Account verification is not configured.")
  authClient ||= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { getUser: (token) => authClient!.auth.getUser(token) }
}

function assertRequestOrigin(req: Request) {
  // Bearer credentials are never read from cookies. Reject cross-site browser
  // mutations as well; non-browser callers still need a verified bearer token.
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new OwnerAuthError(403, "BAD_ORIGIN", "Invalid request origin.")
  }
  const origin = req.headers.get("origin")
  if (!origin) return
  const allowed = new Set([new URL(req.url).origin])
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try { allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin) } catch { /* fail closed */ }
  }
  let parsed: URL
  try { parsed = new URL(origin) } catch { throw new OwnerAuthError(403, "BAD_ORIGIN", "Invalid request origin.") }
  if (origin !== parsed.origin || !allowed.has(parsed.origin)) {
    throw new OwnerAuthError(403, "BAD_ORIGIN", "Invalid request origin.")
  }
}

export async function requireOwner(req: Request, adapter?: OwnerAuthAdapter): Promise<VerifiedOwner> {
  assertRequestOrigin(req)
  const authorization = req.headers.get("authorization") || ""
  const token = /^Bearer ([^\s,]+)$/i.exec(authorization)?.[1]
  if (!token) throw new OwnerAuthError(401, "AUTH_REQUIRED", "Sign in to continue.")
  let response: Awaited<ReturnType<OwnerAuthAdapter["getUser"]>>
  try { response = await (adapter || authAdapter()).getUser(token) } catch (error) {
    if (error instanceof OwnerAuthError) throw error
    throw new OwnerAuthError(401, "AUTH_INVALID", "Your session could not be verified. Sign in again.")
  }
  const user = response.data?.user
  if (response.error || !user?.id || !user.email || !user.email_confirmed_at || user.is_anonymous || user.role !== "authenticated") {
    throw new OwnerAuthError(401, "AUTH_INVALID", "Your session could not be verified. Sign in again.")
  }
  return { id: user.id, email: user.email.trim().toLowerCase() }
}

export function assertOwnerEmail(owner: VerifiedOwner, supplied: unknown) {
  if (supplied === undefined || supplied === null) return
  if (typeof supplied !== "string" || supplied.trim().toLowerCase() !== owner.email) {
    throw new OwnerAuthError(403, "OWNER_MISMATCH", "This request does not belong to the signed-in account.")
  }
}

export function privateOwnerResponse(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0")
  response.headers.set("Pragma", "no-cache")
  const vary = new Set((response.headers.get("Vary") || "").split(",").map((part) => part.trim()).filter(Boolean))
  vary.add("Authorization")
  response.headers.set("Vary", Array.from(vary).join(", "))
  return response
}

export function ownerAuthFailure(error: unknown): Response | null {
  if (!(error instanceof OwnerAuthError)) return null
  return privateOwnerResponse(Response.json({ ok: false, code: error.code, error: error.message, message: error.message }, { status: error.status }))
}

export async function withOwnerResponse(run: () => Promise<Response>): Promise<Response> {
  try { return privateOwnerResponse(await run()) } catch (error) {
    const failure = ownerAuthFailure(error)
    if (failure) return failure
    throw error
  }
}
