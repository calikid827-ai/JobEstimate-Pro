function isFutureIsoAt(value: unknown, nowMs: number) {
  if (typeof value !== "string") return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && ms > nowMs
}

function isLegacyPro(plan: string, subscriptionStatus: string) {
  return (
    subscriptionStatus === "legacy_active" &&
    (plan === "legacy_beta" || plan === "manual_comp")
  )
}

export function resolveEntitlement(data: any, nowMs = Date.now()) {
  const plan = typeof data?.plan === "string" ? data.plan : "free"
  const subscriptionStatus =
    typeof data?.subscription_status === "string" ? data.subscription_status : "free"
  const currentPeriodEnd =
    typeof data?.current_period_end === "string" ? data.current_period_end : null
  const cancelAtPeriodEnd = data?.cancel_at_period_end === true

  let entitled = false
  let message = "Free generation access is active for this email."

  if (subscriptionStatus === "active") {
    entitled = true
    message = cancelAtPeriodEnd && currentPeriodEnd
      ? `Pro subscription is active until ${new Date(currentPeriodEnd).toLocaleDateString()}.`
      : "Pro subscription is active."
  } else if (subscriptionStatus === "trialing") {
    entitled = true
    message = "Pro trial access is active."
  } else if (subscriptionStatus === "past_due") {
    entitled = isFutureIsoAt(currentPeriodEnd, nowMs)
    message = entitled
      ? "Payment is past due. Pro access remains temporarily active through the current billing period."
      : "Payment is past due. Update billing to restore Pro access."
  } else if (subscriptionStatus === "canceled") {
    entitled = isFutureIsoAt(currentPeriodEnd, nowMs)
    message = entitled
      ? `Subscription is canceled. Pro access remains active until ${new Date(currentPeriodEnd!).toLocaleDateString()}.`
      : "Subscription is canceled. Free generation access is active for this email."
  } else if (subscriptionStatus === "unpaid") {
    message = "Subscription payment is unpaid. Update billing to restore Pro access."
  } else if (subscriptionStatus === "incomplete") {
    message = "Subscription checkout is incomplete. Complete checkout to activate Pro access."
  } else if (subscriptionStatus === "incomplete_expired") {
    message = "Subscription checkout expired. Start checkout again to activate Pro access."
  } else if (isLegacyPro(plan, subscriptionStatus)) {
    entitled = true
    message = plan === "manual_comp"
      ? "Manual Pro access is active for this email."
      : "Legacy beta Pro access is active for this email."
  } else if (data?.active === true && plan === "pro") {
    // Conservative compatibility for rows written before subscription status backfill completed.
    entitled = true
    message = "Pro access is active for this email."
  }

  return {
    entitled,
    plan,
    subscription_status: subscriptionStatus,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    message,
  }
}
