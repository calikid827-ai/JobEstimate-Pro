export const SUPPORTED_STRIPE_WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
])

export function isSupportedStripeWebhookEvent(type: string) {
  return SUPPORTED_STRIPE_WEBHOOK_EVENTS.has(type)
}
