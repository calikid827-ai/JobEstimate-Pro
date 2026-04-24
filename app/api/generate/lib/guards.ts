import { z } from "zod"
import { MAX_JOB_PLANS, MAX_PLAN_SOURCE_PAGES } from "../../../lib/plan-upload"

const PhotoInputSchema = z.object({
  name: z.string().max(120),

  dataUrl: z
    .string()
    .max(8_000_000)
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Invalid image data URL"),

  roomTag: z.string().trim().max(40).optional().default(""),

  shotType: z
    .enum([
      "overview",
      "corner",
      "wall",
      "ceiling",
      "floor",
      "fixture",
      "damage",
      "measurement",
    ])
    .optional()
    .default("overview"),

  note: z.string().trim().max(240).optional().default(""),

  reference: z
    .object({
      kind: z.enum(["none", "custom"]).optional().default("none"),
      label: z.string().trim().max(40).optional().default(""),
      realWidthIn: z.number().min(0).max(200).nullable().optional().default(null),
    })
    .optional()
    .default({
      kind: "none",
      label: "",
      realWidthIn: null,
    }),
})

const PlanInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dataUrl: z
    .string()
    .regex(
      /^data:(application\/pdf|image\/(png|jpeg|jpg|webp));base64,/,
      "Invalid plan data URL"
    ),
  note: z.string().trim().max(240).optional().default(""),
  selectedSourcePages: z
    .array(z.number().int().min(1).max(MAX_PLAN_SOURCE_PAGES))
    .max(MAX_PLAN_SOURCE_PAGES)
    .optional()
    .default([]),
})

const TradeSchema = z
  .string()
  .trim()
  .transform((v) => v.toLowerCase())
  .refine(
    (v) =>
      [
        "",
        "auto-detect",
        "auto detect",
        "painting",
        "drywall",
        "flooring",
        "electrical",
        "plumbing",
        "carpentry",
        "general renovation",
        "general_renovation",
        "bathroom_tile",
      ].includes(v),
    "Invalid trade"
  )
  .transform((v) => {
    if (v === "auto detect") return "auto-detect"
    if (v === "general_renovation" || v === "bathroom_tile") return "general renovation"
    return v
  })

export const GenerateSchema = z.object({
  email: z.string().email().max(254),

  requestId: z.string().max(200).optional(),

  scopeChange: z.string().min(10).max(4000),

  trade: TradeSchema.optional().default(""),

  state: z.string().trim().max(40).optional().default(""),

  paintScope: z
    .enum(["walls", "walls_ceilings", "full"])
    .nullable()
    .optional()
    .default(null),

  measurements: z
    .object({
      units: z.literal("ft"),
      totalSqft: z.number().min(0).max(25000),
      rows: z
        .array(
          z.object({
            label: z.string().max(60),
            lengthFt: z.number().min(0).max(1000),
            heightFt: z.number().min(0).max(30),
            qty: z.number().int().min(1).max(500),
          })
        )
        .max(50),
    })
    .nullable()
    .optional()
    .default(null),

  photos: z
    .array(PhotoInputSchema)
    .max(8)
    .nullable()
    .optional()
    .default(null),

  workDaysPerWeek: z.union([z.literal(5), z.literal(6), z.literal(7)]).optional().default(5),

  plans: z
    .array(PlanInputSchema)
    .max(MAX_JOB_PLANS)
    .nullable()
    .optional()
    .default(null),
})

export function cleanScopeText(s: string) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// Host-based Origin allowlist
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin")

  // In production, require Origin (blocks curl/other clients unless you want to allow them)
  if (!origin) return process.env.NODE_ENV !== "production"

  let o: URL
  try {
    o = new URL(origin)
  } catch {
    return false
  }

  // Primary allowed host comes from env (NEXT_PUBLIC_SITE_URL)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ""
  let expectedHost = ""
  try {
    expectedHost = siteUrl ? new URL(siteUrl).host : ""
  } catch {
    expectedHost = ""
  }

  // Optional additional allowed hosts (comma-separated)
  const extraHosts = (process.env.ALLOWED_ORIGIN_HOSTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const allowed = new Set<string>()
  if (expectedHost) allowed.add(expectedHost)
  for (const h of extraHosts) allowed.add(h)

  // ✅ Dev convenience: allow common localhost variants automatically
  // (does NOT apply to production)
  if (process.env.NODE_ENV !== "production") {
    allowed.add("localhost:3000")
    allowed.add("127.0.0.1:3000")
  }

  // Fail closed in production if you didn’t configure anything
  if (allowed.size === 0) return process.env.NODE_ENV !== "production"

  return allowed.has(o.host)
}

// ✅ STREAM-SAFE BODY PARSER
export async function readJsonWithLimit<T>(req: Request, maxBytes: number): Promise<T> {
  const len = req.headers.get("content-length")
  if (len) {
    const n = Number(len)
    if (Number.isFinite(n) && n > maxBytes) {
      throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 })
    }
  }

  if (!req.body) {
    return (await req.json()) as T
  }

  const reader = req.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue

    size += value.byteLength
    if (size > maxBytes) {
      throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 })
    }
    chunks.push(value)
  }

  const text = new TextDecoder().decode(concatUint8(chunks))

  try {
    return JSON.parse(text) as T
  } catch {
    throw Object.assign(new Error("BAD_JSON"), { status: 400 })
  }
}

function concatUint8(chunks: Uint8Array[]) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
