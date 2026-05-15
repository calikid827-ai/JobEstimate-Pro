import assert from "node:assert/strict"
import test from "node:test"
import { isSupportedStripeWebhookEvent } from "./webhook-events"

test("recognizes Stripe events that update subscription entitlements", () => {
  for (const type of [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]) {
    assert.equal(isSupportedStripeWebhookEvent(type), true)
  }
})

test("ignores unsupported Stripe webhook events without processing", () => {
  for (const type of [
    "payment_intent.succeeded",
    "charge.succeeded",
    "invoice.created",
    "customer.created",
  ]) {
    assert.equal(isSupportedStripeWebhookEvent(type), false)
  }
})
