import assert from "node:assert/strict"
import test from "node:test"

import { resolveEntitlement } from "./access"

const nowMs = Date.parse("2026-05-05T12:00:00.000Z")
const future = "2026-06-05T12:00:00.000Z"
const past = "2026-04-05T12:00:00.000Z"

test("subscription entitlement rules allow active and trialing Pro access", async () => {
  assert.equal(
    resolveEntitlement({ plan: "pro", subscription_status: "active" }, nowMs).entitled,
    true
  )
  assert.equal(
    resolveEntitlement({ plan: "pro", subscription_status: "trialing" }, nowMs).entitled,
    true
  )
})

test("past_due and canceled access only last through current_period_end", async () => {
  assert.equal(
    resolveEntitlement(
      { plan: "pro", subscription_status: "past_due", current_period_end: future },
      nowMs
    ).entitled,
    true
  )
  assert.equal(
    resolveEntitlement(
      { plan: "pro", subscription_status: "past_due", current_period_end: past },
      nowMs
    ).entitled,
    false
  )
  assert.equal(
    resolveEntitlement(
      { plan: "pro", subscription_status: "canceled", current_period_end: future },
      nowMs
    ).entitled,
    true
  )
  assert.equal(
    resolveEntitlement(
      { plan: "pro", subscription_status: "canceled", current_period_end: past },
      nowMs
    ).entitled,
    false
  )
})

test("unpaid and incomplete subscription states do not grant Pro access", async () => {
  for (const subscription_status of ["unpaid", "incomplete", "incomplete_expired"]) {
    assert.equal(
      resolveEntitlement({ plan: "pro", subscription_status }, nowMs).entitled,
      false
    )
  }
})

test("legacy beta and manual comp rows remain entitled without resetting usage", async () => {
  assert.equal(
    resolveEntitlement(
      { plan: "legacy_beta", subscription_status: "legacy_active" },
      nowMs
    ).entitled,
    true
  )
  assert.equal(
    resolveEntitlement(
      { plan: "manual_comp", subscription_status: "legacy_active" },
      nowMs
    ).entitled,
    true
  )
})
