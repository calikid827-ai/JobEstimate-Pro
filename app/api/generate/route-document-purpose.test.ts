import assert from "node:assert/strict"
import test from "node:test"
import * as moduleApi from "node:module"
import OpenAI from "openai"

// Node needs the file suffix for this Next package subpath. Production keeps
// its usual Next import; the test still loads and calls the real POST handler.
const registerHooks = (moduleApi as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown
  }) => { deregister: () => void }
}).registerHooks

test("real generation handler honors validated explicit purpose through prompts, repair, finalization, and polish", async (t) => {
  const hook = registerHooks({
    resolve(specifier, context, next) {
      return next(specifier === "next/server" ? "next/server.js" : specifier, context)
    },
  })
  const oldEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  }
  process.env.OPENAI_API_KEY = "synthetic-local-no-external-api"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic-supabase.invalid"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-no-external-api"
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"

  const originalFetch = globalThis.fetch
  const originalCreate = OpenAI.Chat.Completions.prototype.create
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error
  let prompts: { model: string; prompt: string }[] = []
  let description = "This Change Order covers proposed painting. Prepare and paint bedroom walls. Electrical work is not included. Refer to the existing contract for site-access rules."
  let polishConflict = false
  let forceRepair = false
  let cachedPayload: Record<string, unknown> | null = null
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (cachedPayload && url.startsWith("https://synthetic-supabase.invalid/rest/v1/generation_results?")) {
      return new Response(JSON.stringify({ response: cachedPayload }), {
        headers: { "content-type": "application/json" },
      })
    }
    throw new Error("External network disabled in synthetic handler test")
  }
  OpenAI.Chat.Completions.prototype.create = (async (input: any) => {
    const prompt = String(input.messages?.[0]?.content || "")
    prompts.push({ model: input.model, prompt })
    const isPolish = input.model === "gpt-4o"
    const content = isPolish
      ? polishConflict
        ? "This Estimate covers painting. The work is additional to the original contract."
        : String(prompt.split("SCOPE:\n")[1]?.split("\n\nReturn ONLY")[0] || description).trim()
      : JSON.stringify({
          documentType: "Change Order",
          trade: "painting",
          description,
          pricing: { labor: 800, materials: 200, subs: 200, markup: 20, total: 1440 },
          estimateBasis: {
            units: ["rooms"],
            quantities: { rooms: forceRepair ? 999 : 1 },
            laborRate: 80,
            hoursPerUnit: 10,
            crewDays: 1,
            mobilization: 200,
            assumptions: [],
          },
        })
    return { choices: [{ message: { content } }] }
  }) as typeof originalCreate
  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}

  try {
    const { POST } = await import("./route")
    const invoke = async (documentPurpose?: unknown) => {
      prompts = []
      return POST(new Request("http://localhost:3000/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          email: "test12345@gmail.com",
          scopeChange: "Revision: Paint one bedroom wall. Electrical work is not included. Owner will supply paint.",
          trade: "painting",
          ...(documentPurpose === undefined ? {} : { documentPurpose }),
          ...(cachedPayload ? { requestId: "synthetic-cached-result" } : {}),
        }),
      }) as Parameters<typeof POST>[0])
    }

    await t.test("Estimate overrides wording and AI label while preserving legitimate references", async () => {
      const response = await invoke("Estimate")
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.documentType, "Estimate")
      assert.match(payload.text, /^This Estimate\b/i)
      assert.match(payload.text, /Electrical work is not included\./)
      assert.match(payload.text, /Refer to the existing contract for site-access rules\./)
      assert.match(prompts[0].prompt, /Contractor-selected document purpose is exactly "Estimate"/)
      assert.doesNotMatch(prompts[0].prompt, /Likely a Change Order/)
      const polish = prompts.find((item) => item.model === "gpt-4o")
      assert.ok(polish)
      assert.match(polish.prompt, /contractor explicitly selected Estimate/)
    })

    await t.test("reviewed contradictory AI body is rejected before polish or success", async () => {
      description = "This Change Order covers painting. The work is additional to the original contract and was not previously included."
      const response = await invoke("Estimate")
      const payload = await response.json()
      assert.equal(response.status, 422)
      assert.equal(payload.ok, false)
      assert.equal(payload.code, "DOCUMENT_PURPOSE_CONFLICT")
      assert.equal(prompts.some((item) => item.model === "gpt-4o"), false)
    })

    await t.test("polish cannot introduce contradictory contract effect", async () => {
      description = "This Estimate covers proposed painting. Electrical work is not included."
      polishConflict = true
      const response = await invoke("Estimate")
      const payload = await response.json()
      assert.equal(response.status, 422)
      assert.equal(payload.code, "DOCUMENT_PURPOSE_CONFLICT")
      polishConflict = false
    })

    await t.test("intentional change order retains contractual effect", async () => {
      description = "This Change Order covers painting. The work is additional to the original contract."
      const response = await invoke("Change Order")
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.documentType, "Change Order")
      assert.match(payload.text, /additional to the original contract/)
      assert.match(prompts[0].prompt, /Contractor-selected document purpose is exactly "Change Order"/)
    })

    await t.test("callers omitting optional purpose preserve the existing inferred path", async () => {
      const response = await invoke()
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.documentType, "Change Order")
      assert.match(prompts[0].prompt, /Likely a Change Order/)
    })

    await t.test("invalid optional purpose is rejected before AI", async () => {
      const response = await invoke("Change Order / Estimate")
      assert.equal(response.status, 400)
      assert.equal((await response.json()).code, "BAD_INPUT")
      assert.equal(prompts.length, 0)
    })

    await t.test("cached text is validated and a different cached operation cannot be relabeled", async () => {
      cachedPayload = {
        documentType: "Estimate",
        text: "This Estimate covers painting. The work is additional to the original contract.",
      }
      let response = await invoke("Estimate")
      assert.equal(response.status, 422)
      assert.equal((await response.json()).code, "DOCUMENT_PURPOSE_CONFLICT")
      assert.equal(prompts.length, 0)

      cachedPayload = { documentType: "Change Order", text: "This Change Order covers painting." }
      response = await invoke("Estimate")
      assert.equal(response.status, 409)
      assert.equal((await response.json()).code, "DOCUMENT_PURPOSE_CONFLICT")
      assert.equal(prompts.length, 0)

      cachedPayload = {
        documentType: "Estimate",
        text: "This Estimate covers proposed painting. Electrical work is not included.",
      }
      response = await invoke("Estimate")
      const payload = await response.json()
      assert.equal(response.status, 200)
      assert.equal(payload.text, cachedPayload.text)
      assert.equal("description" in payload, false)
      assert.equal(prompts.length, 0)
      cachedPayload = null
    })

    await t.test("math repair retains explicit estimate rules", async () => {
      description = "This Change Order covers proposed painting. Electrical work is not included."
      forceRepair = true
      const response = await invoke("Estimate")
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.documentType, "Estimate")
      const repair = prompts.find((item) => item.prompt.includes("REPAIR REQUIRED:"))
      assert.ok(repair, "fixture must exercise actual repair call")
      assert.match(repair.prompt, /Contractor-selected document purpose is exactly "Estimate"/)
      forceRepair = false
    })
  } finally {
    hook.deregister()
    globalThis.fetch = originalFetch
    OpenAI.Chat.Completions.prototype.create = originalCreate
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
