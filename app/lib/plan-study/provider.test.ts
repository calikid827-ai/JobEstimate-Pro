import assert from "node:assert/strict"
import test from "node:test"
import { createStudyProvider, STUDY_MODEL } from "./provider"
import { fixtureStudy, fixtureAttempt, fixtureResult } from "./test-fixtures"

test("real installed SDK adapter uses bounded structured image/text requests, no tools/store and zero retries", async () => {
  const originalKey = process.env.OPENAI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.OPENAI_API_KEY = "synthetic-not-a-real-provider-key"
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls++
    const input = JSON.parse(String(init?.body))
    assert.equal(input.model, STUDY_MODEL)
    assert.equal(input.store, false)
    assert.equal(input.stream, false)
    assert.equal(input.max_output_tokens, 6000)
    assert.equal(input.text.format.strict, true)
    const wireSchema = input.text.format.schema
    assert.equal(JSON.stringify(wireSchema).includes('"oneOf"'), false, "strict provider schema must use the documented supported union form")
    const anchorSchema = wireSchema.properties.findings.items.properties.citations.items.properties.anchor
    assert.equal(anchorSchema.anyOf.length, 2)
    assert.deepEqual(anchorSchema.anyOf.map((branch: { properties: { kind: { const: string } } }) => branch.properties.kind.const), ["text", "image"])
    assert.equal(input.tools, undefined)
    assert.equal(input.input[0].content[1].type, "input_image")
    assert.match(input.instructions, /untrusted DATA/)
    const { modelLabel: _label, usage: _usage, ...output } = fixtureResult()
    return Response.json({ id: "synthetic-response", object: "response", status: "completed", model: STUDY_MODEL, output: [{ id: "message-a", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 } })
  }
  try {
    const provider = createStudyProvider()
    await provider.ready()
    const result = await provider.review({ study: fixtureStudy(), attempt: fixtureAttempt(), image: new Uint8Array([1, 2]) })
    assert.equal(result.usage.inputTokens, 100)
    assert.equal(calls, 1)
    globalThis.fetch = async () => { calls++; throw new Error("Synthetic unknown transport outcome") }
    await assert.rejects(provider.review({ study: fixtureStudy(), attempt: fixtureAttempt() }), { code: "PROVIDER_OUTCOME_UNKNOWN" })
    assert.equal(calls, 2, "SDK must not retry the failed request")
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  }
})
