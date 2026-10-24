import assert from "node:assert/strict"
import test from "node:test"
import * as moduleApi from "node:module"
import OpenAI from "openai"

const registerHooks = (moduleApi as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown
  }) => { deregister: () => void }
}).registerHooks

const painting = "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats."
const supportedDescription = "This Estimate covers painting the bedroom walls and ceilings, patching holes and imperfections, preparation, two coats, drying between coats, and cleanup."
const syntheticPricing = { labor: 3200, materials: 1920, subs: 175, markup: 25, total: 6619 }
type PolishMode = "pass" | "conflict" | "throw" | "short" | "bad_lead"

test("real generation route aligns final proposal wording with its finalized schedule", async (t) => {
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
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic-schedule-authority.invalid"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-no-external-api"
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public-key"

  const originalFetch = globalThis.fetch
  const originalCreate = OpenAI.Chat.Completions.prototype.create
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error
  let prompts: { model: string; prompt: string }[] = []
  let description = supportedDescription
  let polishMode: PolishMode = "pass"
  let authCalls = 0
  let quotaCalls = 0
  let unexpectedNetworkCalls = 0
  let requests = 0
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "https://synthetic-schedule-authority.invalid/auth/v1/user") {
      authCalls++
      return Response.json({
        id: "synthetic-schedule-owner", email: "owner@synthetic.invalid",
        email_confirmed_at: "2026-01-01", role: "authenticated", is_anonymous: false,
      })
    }
    if (url === "https://synthetic-schedule-authority.invalid/rest/v1/rpc/consume_free_generation") {
      quotaCalls++
      return Response.json([{ ok: true, usage_count: 1, free_limit: 3 }])
    }
    unexpectedNetworkCalls++
    throw new Error("External transport blocked in synthetic schedule-authority test")
  }
  OpenAI.Chat.Completions.prototype.create = (async (input: any) => {
    const prompt = String(input.messages?.[0]?.content || "")
    prompts.push({ model: input.model, prompt })
    if (input.model === "gpt-4o") {
      if (polishMode === "throw") throw new Error("Synthetic polish transport failure")
      if (polishMode === "short") return { choices: [{ message: { content: "Too short" } }] }
      if (polishMode === "bad_lead") return { choices: [{ message: { content: "Painting will be completed in a single visit with preparation, two coats and cleanup." } }] }
      if (polishMode === "conflict") return { choices: [{ message: { content: `${supportedDescription} Work will be completed in a single visit.` } }] }
      const marker = "GENERATED DRAFT TO EDIT (not scope authority):\n"
      assert.ok(prompt.includes(marker), "actual production polish prompt contains its draft")
      const draft = prompt.slice(prompt.lastIndexOf(marker) + marker.length).split("\n\nReturn ONLY")[0].trim()
      return { choices: [{ message: { content: draft } }] }
    }
    // Identical synthetic pricing for every request. No historical amount is a
    // required production price, and no company rates or measurements are added.
    return { choices: [{ message: { content: JSON.stringify({
      documentType: "Estimate", trade: "general renovation", description,
      pricing: { ...syntheticPricing },
      estimateBasis: {
        units: ["rooms"], quantities: { rooms: 10 }, laborRate: 80,
        hoursPerUnit: 4, mobilization: 175,
        assumptions: ["Synthetic room allowance; crew-days and wall area are not established."],
      },
    }) } }] }
  }) as typeof originalCreate
  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}

  try {
    const { POST } = await import("./route")
    const invoke = async (args: { scope?: string; draft?: string; polish?: PolishMode } = {}) => {
      prompts = []
      description = args.draft ?? supportedDescription
      polishMode = args.polish ?? "pass"
      const scope = args.scope ?? painting
      requests++
      const response = await POST(new Request("http://localhost:3000/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json", origin: "http://localhost:3000",
          authorization: "Bearer synthetic-owner-session",
        },
        body: JSON.stringify({
          email: "owner@synthetic.invalid", scopeChange: scope, trade: "General Renovation",
          state: "California", documentPurpose: "Estimate",
        }),
      }) as Parameters<typeof POST>[0])
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.documentType, "Estimate")
      const generation = prompts.find((entry) => entry.model !== "gpt-4o")
      const polish = prompts.find((entry) => entry.model === "gpt-4o")
      assert.ok(generation, "the actual generation path runs with synthetic transport")
      assert.ok(polish, "the actual finalization and polishing path runs")
      assert.ok(generation.prompt.includes(scope))
      assert.ok(polish.prompt.includes(scope), "written scope authority remains available to polishing")
      assert.match(polish.prompt, /FINALIZED ESTIMATED SCHEDULE \(not a confirmed commitment\):/)
      assert.match(polish.prompt, new RegExp(`"visits":\\s*${payload.schedule.visits}`))
      return { payload, polish: polish.prompt }
    }
    const assertTwoVisitEstimate = (payload: any) => {
      assert.equal(payload.schedule.visits, 2)
      assert.equal(payload.schedule.crewDays, null)
      assert.equal(payload.schedule.calendarDays, null)
      assert.match(payload.text, /(?:estimated|approximately)[^.!?\n]{0,70}\b2\b[^.!?\n]{0,30}(?:site\s+)?visits?/i)
      assert.doesNotMatch(payload.text, /\b(?:all\s+work|work)\s+(?:(?:will|shall|must)\s+be\s+)?completed\s+in\s+(?:a\s+)?(?:single|one|1)\s+(?:site\s+)?(?:visit|mobilization)\b/i)
      assert.doesNotMatch(payload.text, /\b\d+(?:\.\d+)?\s+(?:crew[-\s]*days?|calendar\s+days?|workers?)\b/i)
      assert.equal(payload.text.includes(payload.schedule.startDate), false,
        "the builder's default date must not become a confirmed proposal start date")
    }

    let baselinePricing: unknown
    await t.test("exact painting fixture describes two estimated visits without inventing unavailable duration", async () => {
      const { payload, polish } = await invoke()
      assertTwoVisitEstimate(payload)
      assert.match(polish, /"crewDays":\s*null/)
      assert.match(polish, /"calendarDays":\s*null/)
      baselinePricing = payload.pricing
    })

    await t.test("contradictory incoming draft does not survive in the final returned proposal", async () => {
      const { payload } = await invoke({ draft: `${supportedDescription} All work will be completed in a single visit.` })
      assertTwoVisitEstimate(payload)
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("contradictory polishing output does not survive in the final returned proposal", async () => {
      const { payload } = await invoke({ polish: "conflict" })
      assertTwoVisitEstimate(payload)
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("polish failure falls back without restoring a contradictory draft commitment", async () => {
      const { payload } = await invoke({
        draft: `${supportedDescription} All work will be completed in a single visit.`, polish: "throw",
      })
      assertTwoVisitEstimate(payload)
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("short and unusable polish outputs cannot restore a contradictory draft commitment", async () => {
      for (const polish of ["short", "bad_lead"] as const) {
        const { payload } = await invoke({
          draft: `${supportedDescription} All work will be completed in a single visit.`, polish,
        })
        assertTwoVisitEstimate(payload)
        assert.deepEqual(payload.pricing, baselinePricing)
      }
    })

    await t.test("genuine one-visit estimate retains its single estimated visit", async () => {
      const { payload } = await invoke({
        scope: "Paint 10 bedroom walls with two coats.",
        draft: "This Estimate covers painting bedroom walls with two coats and cleanup. Work is planned for one site visit.",
      })
      assert.equal(payload.schedule.visits, 1)
      assert.match(payload.text, /(?:one|1)\s+(?:site\s+)?visit/i)
      assert.doesNotMatch(payload.text, /approximately\s+2\s+(?:site\s+)?visits/i)
    })

    await t.test("one mobilization fee can cover multiple visits without changing pricing", async () => {
      const { payload } = await invoke({
        draft: `${supportedDescription} All work cannot be completed in one visit. A single mobilization fee of $175 covers the planned site visits.`,
      })
      assertTwoVisitEstimate(payload)
      assert.ok(payload.text.includes("All work cannot be completed in one visit."),
        "a correct negated completion statement remains intact")
      assert.match(payload.text, /single mobilization fee of \$175/i)
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("a single-mobilization completion promise is corrected without removing included work", async () => {
      const { payload } = await invoke({
        draft: `${supportedDescription} All work will be completed in a single mobilization.`,
      })
      assertTwoVisitEstimate(payload)
      assert.match(payload.text, /patching holes and imperfections/)
      assert.match(payload.text, /drying between coats/)
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("explicit written one-visit requirement remains a review conflict rather than a silent replacement", async () => {
      const written = `${painting} All work must be completed in one visit.`
      const { payload } = await invoke({ scope: written })
      assert.equal(payload.schedule.visits, 2)
      const warnings = payload.scopeXRay.needsConfirmation as string[]
      assert.ok(warnings.some((warning) => /schedule|visits?/i.test(warning) && /review|confirm|conflict/i.test(warning)))
      assert.match(payload.text, /review|confirm|requirement/i)
      assert.match(payload.text, /(?:one|1)\s+(?:site\s+)?visit/i,
        "the written requirement is retained with its unresolved status")
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    assert.equal(requests, 10)
    assert.equal(authCalls, requests)
    assert.equal(quotaCalls, requests)
    assert.equal(unexpectedNetworkCalls, 0)
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
