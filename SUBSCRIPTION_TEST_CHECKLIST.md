# Subscription Billing Test Checklist

Use this checklist after deploying the subscription checkout and entitlement code. This is a focused Stripe test-mode checklist for subscription checkout, webhook lifecycle handling, Supabase entitlement rows, and the `/app` Account & Access display.

Scope:

- In scope: Stripe test-mode subscription checkout, subscription lifecycle webhooks, entitlement API responses, Account & Access display, success/cancel copy, webhook dedupe, and legacy entitlement compatibility.
- Out of scope: estimator pricing, estimate generation quality, approvals, invoices, PDFs, Plan Intelligence, billing portal, full auth/workspaces, one-time payment launch strategy, and App Store/native billing.
- Important: One-time checkout fallback remains documented for legacy/backward compatibility only. Do not use or recommend one-time payment for public launch unless the billing model is intentionally changed back.

## Completed QA Log

### Preview/Test Mode Subscription QA — PASS

Status: PASS for Preview/Test Mode subscription QA.

Setup and observations:

- An initial checkout attempt from the deployed/live environment opened Stripe Checkout successfully, but the page was in live mode.
- Stripe test card `4242 4242 4242 4242` failed there with: “Your card was declined. Your request was in live mode, but used a known test card.”
- That live-mode test-card failure was expected and confirmed the deployed production checkout was using live Stripe values.
- A safe Vercel Preview/Test Mode setup was created for subscription QA.
- A Stripe test-mode recurring monthly price was created for `$29/month`.
- Vercel Preview env vars were configured with test-mode Stripe checkout values:
  - `STRIPE_SECRET_KEY` using a test-mode key.
  - `STRIPE_PRO_MONTHLY_PRICE_ID` using the test recurring monthly price id.
  - `STRIPE_WEBHOOK_SECRET` using the test webhook signing secret.
  - `ALLOWED_ORIGIN_HOSTS` including the Preview host.
  - Existing Supabase/OpenAI env vars remained available as needed.
- Preview deployment initially failed because `STRIPE_WEBHOOK_SECRET` was missing.
- After adding Preview `STRIPE_WEBHOOK_SECRET` and redeploying, the Preview deployment succeeded.
- Checkout initially logged `NEXT_PUBLIC_SITE_URL` missing.
- After env correction and redeploy, Preview checkout opened successfully in Stripe test/sandbox mode.
- Stripe Checkout displayed JobEstimate Pro / Unlimited Change Orders / Estimates at `$29.00` per month.
- Test email used: `test-subscription-002@gmail.com`.
- Test card `4242 4242 4242 4242` succeeded in Stripe sandbox.
- Success page appeared with `Payment Successful`.
- Stripe test events appeared, including `checkout.session.completed`, `customer.subscription.created`, invoice paid/succeeded events, `payment_intent.succeeded`, and `charge.succeeded`.
- Webhook delivery initially returned `401`/`400` due to protected Preview URL / old endpoint attempts.
- After fixing Preview access/origin setup and resending, `checkout.session.completed` delivered successfully with `200 OK` and response body `{ "received": true }`.
- Returning to the Preview app and refreshing access showed:
  - `Access status: Pro subscription active`
  - `Plan: Pro (active)`
  - `Pro subscription is active.`

Confirmed Preview/Test Mode loop:

Preview app checkout -> Stripe test subscription -> webhook resend `200 OK` -> app entitlement refresh -> Pro access active.

Production Live Mode verification remains pending. This Preview/Test Mode pass does not mean production live billing is fully verified. Do not mark public paid launch billing complete until a real/live payment or approved live-mode verification is completed intentionally.

## Test Setup

Use a deployed preview/staging environment connected to Stripe test mode and the intended Supabase project.

Record before testing:

- App URL:
- Stripe mode: test
- Stripe product:
- Stripe recurring monthly price ID:
- Stripe webhook endpoint:
- Supabase project:
- Test email:
- Browser/profile:

Required environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Expected result:

- `POST /api/checkout` uses `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Checkout mode is `subscription`.
- Stripe webhook endpoint points to `POST /api/webhook`.
- Webhook events enabled include:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

If this fails:

- Fix Stripe/Vercel/Supabase configuration and redeploy before testing.
- Do not continue with a stale deployment that still uses one-time payment mode.

## Expected Entitlement Columns

The `entitlements` table should include at least:

- `email`
- `active`
- `plan`
- `subscription_status`
- `stripe_customer_id`
- `stripe_subscription_id`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `canceled_at`
- `trial_end`
- `usage_count`
- `free_limit`
- `updated_at`

Verify with:

```sql
select
  email,
  active,
  plan,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  canceled_at,
  trial_end,
  usage_count,
  free_limit,
  updated_at
from public.entitlements
where email = 'replace-with-test-email@example.com';
```

Pass criteria:

- Exactly one entitlement row exists for the normalized lowercase test email.
- `usage_count` is not reset by checkout or webhook events.
- `stripe_customer_id` and `stripe_subscription_id` are populated for subscription rows.
- `updated_at` changes when subscription lifecycle events update the row.

Fail criteria:

- Duplicate entitlement rows exist for the same email.
- `usage_count` is reset unexpectedly.
- Subscription events write missing customer/subscription IDs.
- The app grants Pro access for statuses that should not be entitled.

## 1. Start Subscription Checkout From `/app`

Steps:

1. Open `/app` in a clean browser profile.
2. Enter the test email.
3. Click `Refresh access`.
4. Trigger the upgrade button by using a free email state where `Upgrade for Pro Access` is visible.
5. Click `Upgrade for Pro Access`.
6. Inspect the `POST /api/checkout` request and Stripe Checkout page.

Expected result:

- `/api/checkout` returns a Stripe Checkout URL.
- Checkout opens in Stripe test mode.
- Checkout is a subscription session, not one-time payment.
- Checkout uses the same normalized email entered in `/app`.
- Checkout metadata includes `email`, `plan: pro`, and `source: checkout`.

If this fails:

- Check `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_SECRET_KEY`, and `NEXT_PUBLIC_SITE_URL`.
- Confirm the deployed code has `mode: "subscription"`.
- Confirm the app email was saved before checkout.

## 2. Cancel Page Copy

Steps:

1. Start subscription checkout from `/app`.
2. Click Stripe's back/cancel path to return to `/cancel`.

Expected result:

- `/cancel` shows `Checkout Canceled`.
- Copy says no charges were made.
- Copy says the user can continue with 3 free generations and subscribe to Pro when ready.
- No one-time or lifetime access language appears.

If this fails:

- Verify `cancel_url` points to `${NEXT_PUBLIC_SITE_URL}/cancel`.
- Confirm the deployed `/cancel` page is current.

## 3. Successful Checkout And `checkout.session.completed`

Steps:

1. Start checkout again from `/app`.
2. Complete Stripe Checkout with a successful test card.
3. Confirm redirect to `/success`.
4. In Stripe Dashboard, confirm `checkout.session.completed` was delivered.
5. In Supabase, inspect the entitlement row.

Expected Supabase row after webhook processing:

| Column | Expected value |
| --- | --- |
| `email` | normalized test email |
| `plan` | `pro` |
| `subscription_status` | usually `active`, or `trialing` if a trial is configured |
| `active` | `true` for `active` or `trialing` |
| `stripe_customer_id` | Stripe customer ID |
| `stripe_subscription_id` | Stripe subscription ID |
| `current_period_start` | non-null timestamp |
| `current_period_end` | non-null future timestamp |
| `cancel_at_period_end` | `false` |
| `canceled_at` | `null` |
| `trial_end` | null unless trial configured |
| `usage_count` | unchanged from before checkout |

If this fails:

- Inspect Stripe webhook delivery response.
- Confirm `STRIPE_WEBHOOK_SECRET` matches the endpoint.
- Confirm `stripe_webhook_events` accepted the event ID.
- Confirm the subscription ID exists on the Checkout session.

## 4. `customer.subscription.created` / `updated`

Steps:

1. Open the Stripe test subscription created by checkout.
2. Confirm `customer.subscription.created` was delivered.
3. Make a harmless subscription update in Stripe test mode, such as metadata or cancel-at-period-end toggle, then save.
4. Confirm `customer.subscription.updated` was delivered.
5. Inspect the entitlement row.

Expected result:

- `plan = 'pro'`.
- `subscription_status` matches Stripe subscription `status`.
- `stripe_subscription_id` matches the Stripe subscription.
- `current_period_start` and `current_period_end` match Stripe period timestamps.
- `cancel_at_period_end` mirrors Stripe.
- `active` follows entitlement policy:
  - `active`: `true`
  - `trialing`: `true`
  - `past_due`: `true` only while `current_period_end` is in the future
  - `canceled`: `true` only while `current_period_end` is in the future
  - `unpaid`: `false`
  - `incomplete`: `false`
  - `incomplete_expired`: `false`

If this fails:

- Compare Stripe subscription JSON against the Supabase row.
- Check webhook logs for DB write errors.
- Verify the entitlement row is upserted by `email`, not by subscription ID alone.

## 5. `invoice.paid`

Steps:

1. In Stripe test mode, trigger or wait for a paid invoice on the test subscription.
2. Confirm `invoice.paid` was delivered to `/api/webhook`.
3. Inspect the entitlement row.

Expected Supabase row:

| Column | Expected value |
| --- | --- |
| `plan` | `pro` |
| `subscription_status` | refreshed from the Stripe subscription, usually `active` |
| `active` | `true` when subscription is `active` or `trialing` |
| `stripe_customer_id` | unchanged |
| `stripe_subscription_id` | unchanged |
| `current_period_start` | refreshed from subscription |
| `current_period_end` | refreshed from subscription |
| `usage_count` | unchanged |

If this fails:

- Confirm the invoice has a subscription ID.
- Confirm webhook code retrieved the subscription from Stripe after the invoice event.
- Check Supabase service-role permissions.

## 6. `invoice.payment_failed`

Steps:

1. Use Stripe test tools to simulate a failed recurring invoice payment for the subscription.
2. Confirm `invoice.payment_failed` was delivered.
3. Inspect the Stripe subscription status and Supabase entitlement row.
4. Refresh `/app` Account & Access.

Expected Supabase row:

| Stripe status | Expected `subscription_status` | Expected `active` | Expected access |
| --- | --- | --- | --- |
| `past_due` with future `current_period_end` | `past_due` | `true` | temporary Pro access |
| `unpaid` | `unpaid` | `false` | no Pro access |
| `incomplete` | `incomplete` | `false` | no Pro access |

Expected `/api/entitlement` response:

- `past_due` with future period returns `entitled: true` and a payment-past-due temporary-access message.
- `unpaid` or `incomplete` returns `entitled: false` and a restore/complete checkout message.

If this fails:

- Confirm Stripe actually changed the subscription status.
- Compare `/api/entitlement` response to the Supabase row.
- Check whether `current_period_end` is missing or already in the past.

## 7. `cancel_at_period_end`

Steps:

1. In Stripe test mode, set the subscription to cancel at period end.
2. Confirm `customer.subscription.updated` was delivered.
3. Inspect Supabase.
4. Refresh `/app` Account & Access.

Expected Supabase row:

| Column | Expected value |
| --- | --- |
| `plan` | `pro` |
| `subscription_status` | usually `active` until period end |
| `active` | `true` while status remains `active` |
| `current_period_end` | future timestamp |
| `cancel_at_period_end` | `true` |
| `canceled_at` | may remain null until cancellation is finalized |

Expected UI/API:

- `/api/entitlement` returns `entitled: true`.
- Response includes `cancel_at_period_end: true`.
- Account & Access shows Pro access until the current period end.

If this fails:

- Verify the subscription update event delivered after the Stripe change.
- Confirm the deployed Account & Access panel reads `cancel_at_period_end` and `current_period_end`.

## 8. `customer.subscription.deleted`

Steps:

1. In Stripe test mode, cancel the subscription immediately or advance test clocks until the subscription is deleted/canceled.
2. Confirm `customer.subscription.deleted` was delivered.
3. Inspect Supabase.
4. Refresh `/app` Account & Access.

Expected Supabase row:

| Condition | Expected `subscription_status` | Expected `active` | Expected access |
| --- | --- | --- | --- |
| Stripe status `canceled` with future `current_period_end` | `canceled` | `true` | Pro access until period end |
| Stripe status `canceled` with past/missing `current_period_end` | `canceled` | `false` | free access only |

Expected UI/API:

- If period end is future, `/api/entitlement` returns `entitled: true` and a canceled-access-until message.
- If period end is past or missing, `/api/entitlement` returns `entitled: false`.
- Account & Access shows `Canceled - access until ...` only when still entitled.

If this fails:

- Compare Stripe subscription object timestamps to Supabase.
- Confirm webhook delivery response is 200.
- Confirm no stale duplicate entitlement row is being read.

## 9. Duplicate Webhook Retry / Dedupe

Steps:

1. Pick a delivered Stripe test webhook event, preferably `checkout.session.completed` or `customer.subscription.updated`.
2. Use Stripe Dashboard to resend the same event.
3. Inspect webhook response and Supabase `stripe_webhook_events`.
4. Inspect the entitlement row before and after resend.

Expected result:

- First delivery inserts `event_id` into `stripe_webhook_events`.
- Duplicate delivery returns success without reprocessing the entitlement update.
- Entitlement row remains stable.
- `usage_count` remains unchanged.

If this fails:

- Verify `stripe_webhook_events.event_id` has a unique constraint or primary key.
- Treat duplicate event processing that mutates entitlement incorrectly as launch-blocking.

## 10. `/api/entitlement` Response

Use the browser Network tab or a local API client against the deployed app.

Request:

```json
{
  "email": "replace-with-test-email@example.com"
}
```

Expected response fields:

- `entitled`
- `plan`
- `subscription_status`
- `current_period_end`
- `cancel_at_period_end`
- `message`
- `usage_count`
- `free_limit`

Expected response behavior:

| Supabase row | Expected response |
| --- | --- |
| `plan='pro'`, `subscription_status='active'` | `entitled: true`, active subscription message |
| `plan='pro'`, `subscription_status='trialing'` | `entitled: true`, trial message |
| `plan='pro'`, `subscription_status='past_due'`, future `current_period_end` | `entitled: true`, temporary access message |
| `plan='pro'`, `subscription_status='past_due'`, past `current_period_end` | `entitled: false`, update billing message |
| `plan='pro'`, `subscription_status='unpaid'` | `entitled: false`, unpaid message |
| `plan='pro'`, `subscription_status='canceled'`, future `current_period_end` | `entitled: true`, access-until message |
| `plan='pro'`, `subscription_status='canceled'`, past `current_period_end` | `entitled: false`, canceled/free message |
| `plan='legacy_beta'`, `subscription_status='legacy_active'` | `entitled: true`, legacy beta message |
| `plan='manual_comp'`, `subscription_status='legacy_active'` | `entitled: true`, manual access message |
| no row or `plan='free'` | `entitled: false`, free access message |

If this fails:

- Check the selected columns in `/api/entitlement`.
- Confirm Supabase timestamps are valid ISO/timestamptz values.
- Confirm the entitlement row for the exact normalized email is the row being read.

## 11. Account & Access Panel Display

Steps:

1. Open `/app`.
2. Enter the test email.
3. Click `Refresh access`.
4. Compare Account & Access display to `/api/entitlement` response.

Expected UI:

- Email displays normalized lowercase.
- Active subscription shows `Pro subscription active`.
- Trialing subscription shows `Pro trial active`.
- Past-due temporary access shows `Payment past due - temporary Pro access`.
- Unpaid shows `Payment unpaid`.
- Incomplete shows `Checkout incomplete`.
- Incomplete expired shows `Checkout expired`.
- Canceled with remaining access shows `Canceled - access until ...`.
- Legacy beta shows `Legacy beta Pro access`.
- Manual comp shows `Manual Pro access`.
- Plan line shows `Pro`, `Legacy beta`, `Manual comp`, or `Free`.
- Current period end appears when `current_period_end` is present.
- Free usage and remaining free generations still display when returned by entitlement API.

If this fails:

- Compare UI state to the Network response from `/api/entitlement`.
- Refresh access manually.
- Confirm no stale local browser profile is masking the current email.

## 12. Success Page Copy

Steps:

1. Complete subscription checkout successfully.
2. Land on `/success`.
3. Wait for entitlement refresh.

Expected result:

- Page says `Payment Successful`.
- Copy thanks the user for subscribing to JobEstimate Pro.
- Loading copy says subscription access is being checked.
- Success state says Pro subscription/access is active.
- No lifetime or one-time unlimited copy appears.

If this fails:

- Confirm `/success` reads `jobestimatepro_email` from localStorage.
- Confirm the browser used for checkout is the same browser/profile that started checkout from `/app`.
- If webhook is delayed, use `/app` Refresh access after a few seconds.

## 13. Legacy `legacy_beta` / `manual_comp` Compatibility

Steps:

1. In Supabase test/staging, create or identify a legacy beta row:

```sql
update public.entitlements
set
  active = true,
  plan = 'legacy_beta',
  subscription_status = 'legacy_active',
  stripe_subscription_id = null,
  updated_at = now()
where email = 'replace-with-legacy-email@example.com';
```

2. Repeat with a known manual comp row using `plan = 'manual_comp'`.
3. Call `/api/entitlement` for each email.
4. Refresh `/app` Account & Access for each email.

Expected result:

- `legacy_beta` + `legacy_active` returns `entitled: true`.
- `manual_comp` + `legacy_active` returns `entitled: true`.
- Account & Access displays the correct legacy/manual label.
- `usage_count` is preserved.
- These rows do not require a Stripe subscription ID.

If this fails:

- Confirm `subscription_status = 'legacy_active'`.
- Confirm `plan` is exactly `legacy_beta` or `manual_comp`.
- Confirm the entitlement row is unique by email.

## 14. One-Time Payment Fallback / Legacy Behavior

The webhook still has a fallback path for a `checkout.session.completed` event without a subscription ID. This exists for backward compatibility with pre-launch one-time/manual checkout events only.

Expected legacy fallback row if such an old event is processed:

| Column | Expected value |
| --- | --- |
| `plan` | `legacy_beta` |
| `subscription_status` | `legacy_active` |
| `active` | `true` |
| `stripe_customer_id` | customer ID if present |
| `stripe_subscription_id` | `null` |
| `current_period_start` | `null` |
| `current_period_end` | `null` |
| `cancel_at_period_end` | `false` |
| `usage_count` | unchanged |

Pass criteria:

- Legacy fallback does not reset free usage.
- Legacy fallback does not interfere with current subscription rows.
- Public launch checkout remains subscription mode.

Fail criteria:

- Public `/api/checkout` creates one-time payment sessions.
- One-time payment is presented as the launch billing path.
- Legacy fallback overwrites a valid subscription row incorrectly.

## Final Pass Criteria

Subscription billing passes this checklist when:

- `/api/checkout` creates Stripe test-mode subscription sessions using `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Successful checkout creates or updates one normalized entitlement row.
- Required webhook events deliver successfully and update entitlement fields correctly.
- Duplicate webhook retries are safely deduped.
- `/api/entitlement` returns the expected subscription-aware fields and access decisions.
- `/app` Account & Access displays the correct plan, status, free usage, and period end.
- `/success` and `/cancel` use subscription-safe copy.
- Legacy beta and manual comp rows still grant access without requiring subscription IDs.
- No event resets `usage_count`.

Do not proceed to public paid launch until all launch-intended statuses pass in Stripe test mode and the production webhook endpoint has been verified with the final Stripe mode and environment.
