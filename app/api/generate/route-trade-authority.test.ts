import assert from "node:assert/strict"
import test from "node:test"
import * as moduleApi from "node:module"
import OpenAI from "openai"

const registerHooks = (moduleApi as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown
  }) => { deregister: () => void }
}).registerHooks

const paintingScope = "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats."
const suppliedScope = `${paintingScope} Contractor will supply the main materials and fixtures listed in this scope.`

test("real generation route keeps included trade authority through generation and description polish", async (t) => {
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
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
  process.env.OPENAI_API_KEY = "synthetic-local-no-external-api"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic-trade-authority.invalid"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-no-external-api"
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public-key"

  const originalFetch = globalThis.fetch
  const originalCreate = OpenAI.Chat.Completions.prototype.create
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error
  let prompts: { model: string; prompt: string }[] = []
  let aiDescription = ""
  let scope = ""
  let authCalls = 0
  let quotaCalls = 0
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "https://synthetic-trade-authority.invalid/auth/v1/user") {
      authCalls++
      return Response.json({
        id: "synthetic-owner", email: "owner@synthetic.invalid", email_confirmed_at: "2026-01-01",
        role: "authenticated", is_anonymous: false,
      })
    }
    if (url === "https://synthetic-trade-authority.invalid/rest/v1/rpc/consume_free_generation") {
      quotaCalls++
      return Response.json([{ ok: true, usage_count: 1, free_limit: 3 }])
    }
    throw new Error("External network disabled in synthetic trade-authority test")
  }
  OpenAI.Chat.Completions.prototype.create = (async (input: any) => {
    const prompt = String(input.messages?.[0]?.content || "")
    prompts.push({ model: input.model, prompt })
    if (input.model === "gpt-4o") {
      // Pass the production finalizer's supported draft through. This verifies
      // its actual wiring and prompt authority, not a provider's compliance.
      const marker = prompt.includes("GENERATED DRAFT TO EDIT (not scope authority):\n")
        ? "GENERATED DRAFT TO EDIT (not scope authority):\n"
        : "SCOPE:\n"
      const start = prompt.lastIndexOf(marker)
      assert.notEqual(start, -1, "the real polish prompt must include its draft")
      const draft = prompt.slice(start + marker.length).split("\n\nReturn ONLY")[0].trim()
      return { choices: [{ message: { content: draft } }] }
    }
    // Identical synthetic AI amounts for every fixture. Production pricing
    // normalization/protections still run; no historical total is a target.
    return { choices: [{ message: { content: JSON.stringify({
      documentType: "Estimate", trade: "general renovation", description: aiDescription,
      pricing: { labor: 2400, materials: 600, subs: 125, markup: 20, total: 3750 },
      estimateBasis: {
        units: ["rooms"], quantities: { rooms: /10 bedrooms/.test(scope) ? 10 : 1 },
        laborRate: 40, hoursPerUnit: /10 bedrooms/.test(scope) ? 6 : 60,
        crewDays: 2, mobilization: 125, assumptions: ["Synthetic pricing allowance; no verified wall-area measurement."],
      },
    }) } }] }
  }) as typeof originalCreate
  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}

  try {
    const { POST } = await import("./route")
    const invoke = async (writtenScope: string, description?: string) => {
      prompts = []
      scope = writtenScope
      aiDescription = description ?? "This Estimate covers painting the bedroom walls and ceilings, patching holes and imperfections, preparation, two coats, drying between coats, and cleanup."
      const response = await POST(new Request("http://localhost:3000/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", authorization: "Bearer synthetic-owner-session" },
        body: JSON.stringify({
          email: "owner@synthetic.invalid", scopeChange: writtenScope,
          trade: "General Renovation", state: "California", documentPurpose: "Estimate",
        }),
      }) as Parameters<typeof POST>[0])
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.documentType, "Estimate")
      const generation = prompts.find((entry) => entry.model !== "gpt-4o")
      const polish = prompts.find((entry) => entry.model === "gpt-4o")
      assert.ok(generation, "the real initial generation path must run")
      assert.ok(polish, "the real finalization/polish path must run")
      assert.ok(generation.prompt.includes(writtenScope), "initial generation receives the full authoritative scope")
      assert.ok(polish.prompt.includes(writtenScope), "polishing receives the full authoritative scope, not only an AI draft")
      const line = generation.prompt.match(/^- (?:Included work trades|Trade Stack \(coordination\)): ([^\n]*)$/m)
      assert.ok(line, "generation must expose included work trades")
      const trades = line[1] === "N/A" ? [] : line[1].split(", ")
      return { payload, trades, generation: generation.prompt, polish: polish.prompt }
    }
    const noOutsideCoordination = (text: string) => {
      assert.doesNotMatch(text, /coordination with[^.\n]*(?:plumbing|electrical|drywall)[^.\n]*trades/i)
    }

    await t.test("exact initial and supplier-decision revisions infer painting without invented trades or deterministic price changes", async () => {
      const initial = await invoke(paintingScope)
      const revision = await invoke(suppliedScope)
      assert.deepEqual(initial.trades, ["painting"])
      assert.deepEqual(revision.trades, ["painting"])
      assert.deepEqual(revision.payload.pricing, initial.payload.pricing,
        "supplier wording alone must not change deterministic postprocessing of identical mocked AI inputs")
      noOutsideCoordination(initial.payload.text)
      noOutsideCoordination(revision.payload.text)
      assert.match(revision.polish, /procurement responsibility only/i)
      assert.match(revision.polish, /omit unsupported work or trade-coordination commitments/i)
      assert.equal(revision.payload.schedule.visits, 2, "patch/paint drying sequencing remains")
      assert.match(revision.payload.text, /drying between coats/i)
      assert.equal(revision.payload.scopeXRay.quantities.some((quantity: { label: string }) =>
        /measured area|wall area/i.test(quantity.label)), false,
      "room dimensions without height or measured inputs must not establish verified wall area")
    })

    await t.test("contractor and owner material-supply variants do not establish installation trades", async () => {
      for (const responsibility of [
        "Contractor-supplied materials and fixtures.",
        "Owner will supply the main materials and fixtures listed in this scope.",
        "Owner-supplied materials and fixtures.",
      ]) {
        const result = await invoke(`${paintingScope} ${responsibility}`)
        assert.deepEqual(result.trades, ["painting"], responsibility)
        noOutsideCoordination(result.payload.text)
        assert.ok(result.polish.includes(responsibility))
      }
    })

    await t.test("generic supply responsibility without installation establishes no work trade", async () => {
      for (const responsibility of [
        "Contractor will supply the main materials and fixtures listed in this scope.",
        "Owner will supply materials and fixtures. No installation work is included.",
      ]) {
        const result = await invoke(responsibility,
          "This Estimate records material procurement responsibility only. Installation work is not included.")
        assert.deepEqual(result.trades, [])
        noOutsideCoordination(result.payload.text)
      }
    })

    await t.test("genuine water-supply line and electrical installation remain included trades", async () => {
      const plumbing = await invoke("Connect existing water-supply lines and reconnect the kitchen sink faucet.",
        "This Estimate covers connection of existing water-supply lines and reconnection of the kitchen sink faucet, testing, and cleanup.")
      assert.deepEqual(plumbing.trades, ["plumbing"])
      const electrical = await invoke("Install two electrical outlets and run new wiring to the outlets.",
        "This Estimate covers installation of two electrical outlets and new wiring to those outlets, testing, and cleanup.")
      assert.deepEqual(electrical.trades, ["electrical"])
    })

    await t.test("excluded and by-others trades remain boundaries in generation and polishing", async () => {
      for (const boundary of [
        "Plumbing and electrical work are excluded.",
        "Plumbing by others. Electrical by others.",
      ]) {
        const result = await invoke(`${paintingScope} ${boundary}`,
          `This Estimate covers painting bedroom walls and ceilings, patching holes, preparation and cleanup. ${boundary}`)
        assert.deepEqual(result.trades, ["painting"])
        assert.ok(result.payload.text.includes(boundary), "customer-facing boundaries survive finalization and polish")
        assert.ok(result.polish.includes(boundary), "polisher receives the contractor's actual boundaries")
        noOutsideCoordination(result.payload.text)
      }
    })

    await t.test("patch-and-paint preparation retains drying without assigning an outside drywall trade", async () => {
      const result = await invoke("Patch drywall access holes, prime repairs, and paint bedroom walls with two coats.")
      assert.deepEqual(result.trades, ["painting"])
      assert.equal(result.payload.schedule.visits, 2)
      assert.match(result.polish, /surface preparation, and drying/i)
      noOutsideCoordination(result.payload.text)
    })

    assert.ok(authCalls > 0)
    assert.equal(quotaCalls, authCalls, "every real-handler invocation uses only the synthetic owner and quota transports")
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
