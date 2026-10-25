import assert from "node:assert/strict"
import test from "node:test"
import * as moduleApi from "node:module"
import OpenAI from "openai"
import { buildCustomerScopeReviewGuard } from "../../app/lib/customer-scope-drift"
import { consolidateReviewIssues, type ReviewIssueInput } from "../../app/lib/review-issues"

const registerHooks = (moduleApi as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown
  }) => { deregister: () => void }
}).registerHooks

const painting = "Paint 10 bedrooms that are 10x12. Walls and Ceilings. Patch any holes and imperfections. Two coats."
const supplierPainting = `${painting} Contractor will supply the main materials and fixtures listed in this scope.`
// Only these phrases were captured in the deployed report. The complete
// descriptions below are reconstructed synthetic fixtures, not recovered output.
const capturedCoordinationPhrase = "Coordination with other trades is limited to the scope described"
const syntheticCoordinationSentence = `${capturedCoordinationPhrase} and does not extend to additional drywall or finishing trades beyond the specified patching.`
const syntheticPatchDescription = "This Estimate covers painting 10 bedroom walls and ceilings. The work includes patching holes and imperfections using appropriate drywall compounds, followed by sanding and two coats with drying between coats."
const supportedDescription = "This Estimate covers painting the bedroom walls and ceilings, patching holes and imperfections, preparation, two coats, drying between coats, and cleanup."
const syntheticPricing = { labor: 3200, materials: 1920, subs: 175, markup: 25, total: 6619 }
type PolishMode = "pass" | "conflict" | "throw" | "short" | "bad_lead" | "synthetic_output"

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
  let syntheticPolishOutput = ""
  let syntheticOwner = { id: "synthetic-schedule-owner", email: "owner@synthetic.invalid", ip: "203.0.113.10" }
  let authCalls = 0
  let quotaCalls = 0
  let unexpectedNetworkCalls = 0
  let requests = 0
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "https://synthetic-schedule-authority.invalid/auth/v1/user") {
      authCalls++
      return Response.json({
        id: syntheticOwner.id, email: syntheticOwner.email,
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
      if (polishMode === "synthetic_output") return { choices: [{ message: { content: syntheticPolishOutput } }] }
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
    const invoke = async (args: { scope?: string; draft?: string; polish?: PolishMode; polished?: string } = {}) => {
      prompts = []
      description = args.draft ?? supportedDescription
      polishMode = args.polished === undefined ? args.polish ?? "pass" : "synthetic_output"
      syntheticPolishOutput = args.polished ?? ""
      const scope = args.scope ?? painting
      requests++
      const response = await POST(new Request("http://localhost:3000/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json", origin: "http://localhost:3000",
          authorization: "Bearer synthetic-owner-session",
          "x-forwarded-for": syntheticOwner.ip,
        },
        body: JSON.stringify({
          email: syntheticOwner.email, scopeChange: scope, trade: "General Renovation",
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
    // A separate isolated synthetic owner/IP keeps both real rate-limit guards
    // active while exercising this additional bounded fixture group.
    syntheticOwner = { id: "synthetic-scope-wording-owner", email: "wording@synthetic.invalid", ip: "203.0.113.11" }
    const reviewFinalProposal = (payload: any, scope: string) => {
      const review = buildCustomerScopeReviewGuard({
        selectedTrade: "general_renovation", writtenScope: scope, resultText: payload.text,
        estimateSections: payload.estimateSections ?? null,
        scopeXRay: payload.scopeXRay, planIntelligence: payload.planIntelligence,
      })
      const inputs: ReviewIssueInput[] = review.warnings.flatMap((warning): ReviewIssueInput[] =>
        warning.reviewActions?.length
          ? warning.reviewActions.map((action) => ({ ...action, title: warning.label, source: "Customer scope" }))
          : [{ message: warning.message, title: warning.label, details: warning.details, source: "Customer scope" }]
      )
      const confirmations: string[] = [
        ...(payload.scopeXRay?.needsConfirmation || []),
        ...(payload.areaScopeBreakdown?.missingConfirmations || []),
      ]
      return {
        review,
        issues: consolidateReviewIssues([...inputs, ...confirmations.map((message) => ({ message, source: "Estimator review" }))]),
      }
    }
    const assertKnownScopeWording = (payload: any) => {
      assertTwoVisitEstimate(payload)
      assert.deepEqual(payload.pricing, baselinePricing)
      assert.ok(!payload.text.includes(capturedCoordinationPhrase), "the captured residual does not survive the real finalizer")
      assert.match(payload.text, /patching holes and imperfections|patching, sanding/i)
      assert.match(payload.text, /drying between coats/i)
    }

    await t.test("synthetic draft residual and included patch compounds are reconciled for initial and supplier scopes", async () => {
      for (const scope of [painting, supplierPainting]) {
        const { payload, polish } = await invoke({
          scope, draft: `${syntheticPatchDescription} ${syntheticCoordinationSentence}`,
        })
        assertKnownScopeWording(payload)
        assert.ok(!polish.includes(syntheticCoordinationSentence), "unsupported draft boilerplate is removed before polishing")
        assert.match(payload.text, /drywall compounds/)
        const { review, issues } = reviewFinalProposal(payload, scope)
        assert.deepEqual(review.warnings, [], "included patch material is not a substantive new drywall commitment")
        assert.ok(issues.some((issue) => /measured square footage/i.test(issue.message)), "quantity verification remains an independent action")
        assert.ok(issues.some((issue) => /patch.*extent/i.test(issue.message)), "patch extent remains an independent action")
      }
    })

    await t.test("synthetic polish residual is removed after polishing while schedule and pricing remain final", async () => {
      const { payload } = await invoke({ scope: supplierPainting, polished: `${syntheticPatchDescription} ${syntheticCoordinationSentence}` })
      assertKnownScopeWording(payload)
      assert.match(payload.text, /drywall compounds/)
      assert.deepEqual(reviewFinalProposal(payload, supplierPainting).review.warnings, [])
    })

    await t.test("synthetic polish failure and unusable outputs fall back without restoring coordination boilerplate", async () => {
      for (const polish of ["throw", "short", "bad_lead"] as const) {
        const { payload } = await invoke({ scope: supplierPainting, draft: `${syntheticPatchDescription} ${syntheticCoordinationSentence}`, polish })
        assertKnownScopeWording(payload)
        assert.deepEqual(reviewFinalProposal(payload, supplierPainting).review.warnings, [])
      }
    })

    await t.test("synthetic explicit GC access and assigned coordination survive even when installation is by others", async () => {
      const requirement = "Coordinate site access with the GC and electrician. Electrical installation is by others."
      const { payload } = await invoke({ scope: `${painting} ${requirement}`, polished: `${syntheticPatchDescription} ${requirement}` })
      assertTwoVisitEstimate(payload)
      assert.ok(payload.text.includes(requirement))
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("synthetic negative coordination boundary survives without authorizing positive boilerplate", async () => {
      const boundary = "No coordination with other trades is included."
      const { payload } = await invoke({ scope: `${painting} ${boundary}`, draft: `${syntheticPatchDescription} ${boundary} ${syntheticCoordinationSentence}` })
      assertKnownScopeWording(payload)
      assert.ok(payload.text.includes(boundary))
    })

    await t.test("synthetic mixed preparation and unsupported coordination sentence retains supported work", async () => {
      const { payload } = await invoke({
        draft: "This Estimate covers patching, sanding and drying between coats, with coordination with other trades limited to the scope described. Two coats are applied to bedroom walls and ceilings.",
      })
      assertTwoVisitEstimate(payload)
      assert.match(payload.text, /patching, sanding and drying between coats/)
      assert.match(payload.text, /Two coats are applied to bedroom walls and ceilings/)
      assert.doesNotMatch(payload.text, /coordination with other trades/i)
      assert.deepEqual(payload.pricing, baselinePricing)
    })

    await t.test("synthetic included patch material does not hide substantive drywall installation in the same final clause", async () => {
      const { payload } = await invoke({ draft: `${syntheticPatchDescription} Patch the holes with drywall compounds and install replacement drywall sheets across the bedroom walls.` })
      assertTwoVisitEstimate(payload)
      assert.deepEqual(payload.pricing, baselinePricing)
      const { review, issues } = reviewFinalProposal(payload, painting)
      assert.ok(review.warnings.some((warning) => /drywall/i.test(warning.message)))
      assert.ok(issues.some((issue) => issue.details.some((detail) => /replacement drywall sheets/i.test(detail))), "substantive installation evidence remains actionable")
      assert.ok(issues.some((issue) => /measured square footage/i.test(issue.message)), "independent quantity action remains")
    })

    assert.equal(requests, 20)
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
