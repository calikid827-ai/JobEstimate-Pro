# JobEstimate Pro Subscription Architecture

This document explains the JobEstimate Pro migration from the pre-launch one-time Stripe payment model to the current monthly subscription foundation.

JobEstimate Pro is pre-launch and has no paying users, so there is no customer migration burden yet. The old `$29` one-time unlimited-access setup should be treated as temporary/pre-launch legacy only.

## Pricing Direction

Proposed pre-launch model:

- Free: 3 free generations.
- Pro: $29/month.
- Avoid lifetime unlimited access.
- Avoid marketing Pro as truly unlimited until OpenAI, plan rendering, upload/storage, support, and abuse costs are proven.
- Use fair-use language instead of unlimited language.
- Future Business tier can be added after launch.

Exact plan names, limits, fair-use thresholds, and pricing can still change before launch.

## Current Billing Flow

Current checkout flow:

1. User enters an email in the app.
2. The app saves the email in localStorage key `jobestimatepro_email`.
3. The app calls `POST /api/checkout`.
4. `app/api/checkout/route.ts` creates a Stripe Checkout session with:
   - `mode: "subscription"`
   - `STRIPE_PRO_MONTHLY_PRICE_ID`
   - `customer_email`
   - checkout and subscription metadata for `email`, `plan: pro`, and `source: checkout`
   - `success_url: /success`
   - `cancel_url: /cancel`
5. Stripe redirects back to `/success`.
6. `app/success/page.tsx` reads `jobestimatepro_email` and calls `POST /api/entitlement`.
7. `app/api/entitlement/route.ts` returns subscription-aware entitlement fields and messages.

Current webhook flow:

1. Stripe sends events to `POST /api/webhook`.
2. `app/api/webhook/route.ts` verifies the Stripe signature.
3. The route writes event IDs to `stripe_webhook_events` for dedupe.
4. It handles `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
5. It upserts subscription-aware entitlement fields including plan, subscription status, customer/subscription IDs, period timestamps, cancellation flags, and `active`.
6. It does not overwrite `usage_count`.

Current entitlement behavior:

- `/api/generate` consumes free generations through Supabase RPC.
- `/api/entitlement` returns:
  - `entitled`
  - `plan`
  - `subscription_status`
  - `current_period_end`
  - `cancel_at_period_end`
  - `message`
  - `usage_count`
  - `free_limit`
- Free limit is currently 3.

## Subscription Flow

1. User enters an email in the app.
2. The app saves the email in `jobestimatepro_email`.
3. The app calls `POST /api/checkout`.
4. Checkout creates a Stripe subscription session:
   - `mode: "subscription"`
   - monthly recurring Pro price
   - `customer_email`
   - success/cancel URLs
5. Stripe redirects to `/success`.
6. `/success` calls `POST /api/entitlement`.
7. The entitlement API returns subscription-aware status.
8. The app shows Pro access only when subscription state is active or otherwise allowed by the chosen grace/trial policy.

Current entitlement behavior:

- Free users keep 3 free generations.
- Pro users get fair-use access while subscription is active.
- Trialing subscriptions get Pro access.
- Past-due subscriptions get temporary Pro access through `current_period_end`.
- Unpaid, incomplete, and incomplete-expired subscriptions do not get Pro access.
- Canceled subscriptions get Pro access only while `current_period_end` is still in the future.
- `legacy_beta` and `manual_comp` rows with `subscription_status = 'legacy_active'` continue to get Pro access.

## Required Stripe Changes

Required Stripe configuration:

- Create or update the JobEstimate Pro product.
- DONE: A recurring monthly price for Pro has been created.
- DONE: Vercel now has `STRIPE_PRO_MONTHLY_PRICE_ID` set.
- DONE: The app was redeployed after adding `STRIPE_PRO_MONTHLY_PRICE_ID`.
- DONE: Replaced the current checkout code path with the recurring price ID.
- DONE: Stripe webhook endpoint is configured for the 6 required subscription events.
- Decide whether to add a Stripe Billing Portal later.

Important current-state note:

- Current app code uses subscription Checkout with `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Subscription checkout, subscription lifecycle webhooks, subscription-aware entitlement responses, Account & Access display, and success/cancel copy are implemented.
- Final subscription payment/webhook entitlement verification is still pending because payment has not been completed yet.

Implemented checkout behavior:

```ts
mode: "subscription"
```

- Keep `customer_email` unless a full account/auth system is added.
- Include metadata if useful:
  - email
  - plan: `pro`
  - source: `checkout`
- Consider `allow_promotion_codes` only if launch promotions are planned.

## Required Supabase Entitlement Changes

Supabase entitlement subscription columns have been added. The current entitlement shape includes:

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
- `fair_use_period_start`
- `fair_use_generation_count`
- `updated_at`

Suggested status values:

- `free`
- `active`
- `trialing`
- `past_due`
- `canceled`
- `unpaid`
- `incomplete`
- `incomplete_expired`

Final fair-use thresholds may still evolve, but subscription status/period fields are now part of the implemented billing foundation.

## Webhook Events To Support

Implemented subscription events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Useful later events:

- `customer.subscription.trial_will_end`
- `invoice.payment_action_required`
- `customer.updated`

Webhook behavior:

- Continue deduping all Stripe event IDs.
- Keep webhook handlers idempotent.
- Store `stripe_customer_id` and `stripe_subscription_id`.
- Update subscription status from Stripe as source of truth.
- Update `current_period_end` from subscription data.
- Respect `cancel_at_period_end`.
- Avoid resetting free usage when subscription events arrive.

## Entitlement Logic

`POST /api/entitlement` now returns:

- `entitled`
- `plan`
- `subscription_status`
- `current_period_end`
- `cancel_at_period_end`
- `usage_count`
- `free_limit`
- `message`

`POST /api/generate` continues to use the existing entitlement/free-limit path. The intended authorization shape remains:

1. Normalizing email.
2. Checking active subscription status.
3. If active/trialing, allowing generation subject to fair-use policy.
4. If not active, using free-limit RPC.
5. Returning a clear reason when blocked:
   - free limit reached
   - subscription inactive
   - payment failed
   - fair-use review/limit reached

The existing pricing authority, estimator logic, and generation behavior should not change as part of subscription work.

## Success And Cancel Page Copy

Implemented success copy direction:

- “Your Pro subscription is active.”
- “You now have Pro access with fair-use generation included.”
- “Return to JobEstimate Pro to continue estimating.”

Implemented pending/error copy:

- “Payment succeeded, but subscription access is still syncing.”
- “Return to the app and use the email from checkout.”
- “If access is not active after a minute, retry entitlement refresh.”

Implemented cancel copy direction:

- “Checkout was canceled.”
- “You can continue with 3 free generations.”
- “Upgrade to Pro when you are ready.”

Avoid:

- “Unlimited access”
- “Lifetime access”
- “Unlimited generations”

until the cost model is proven and the fair-use policy is final.

## Fair-Use / Generation-Limit Strategy

The product should avoid hard “unlimited forever” language.

Pre-launch recommendation:

- Free: 3 free generations.
- Pro: generous fair-use access for normal contractor estimating workflows.
- Track Pro usage by billing period.
- Add soft internal thresholds before hard customer-facing limits.
- Keep abuse protection server-side.

Possible fair-use fields:

- `fair_use_period_start`
- `fair_use_generation_count`
- `fair_use_soft_limit`
- `fair_use_hard_limit`
- `last_generation_at`

Possible customer language:

- “Includes generous fair-use access for normal contractor estimating workflows.”
- “High-volume or automated use may require a Business plan.”

Do not expose a precise hard limit unless product strategy requires it.

## Migration Notes

There are no paying users yet, so the cleanest migration is:

1. Decide the final pre-launch pricing model.
2. Create the recurring Stripe price.
3. Update checkout mode and env vars.
4. Update Supabase entitlement schema.
5. Update webhook handling.
6. Update entitlement checks.
7. Update success/cancel copy.
8. Test end-to-end in Stripe test mode.
9. Only then launch publicly.

If any test users bought the one-time plan before launch:

- Treat them manually or seed entitlement records.
- Decide whether to grant temporary Pro access.
- Avoid building a full migration system unless real paid customers exist.

## Step-By-Step Implementation Plan

1. Finalize pricing and copy.
   - Confirm Free and Pro names.
   - Confirm `$29/month`.
   - Confirm fair-use language.
   - Confirm whether there is a trial.

2. Update Stripe configuration.
   - DONE: Create recurring monthly Pro price.
   - DONE: Save the recurring price ID in Vercel as `STRIPE_PRO_MONTHLY_PRICE_ID`.
   - DONE: Redeploy app after adding the env var.
   - DONE: Configure webhook endpoint events.

3. Design and apply Supabase schema migration.
   - DONE: Add subscription fields.
   - DONE: Preserve `usage_count`.
   - DONE: Preserve email-based entitlement lookup for now.

4. Update checkout route.
   - DONE: Switch to `mode: "subscription"`.
   - DONE: Use recurring price ID.
   - DONE: Keep customer email binding.

5. Update webhook route.
   - DONE: Handle subscription lifecycle events.
   - DONE: Store customer and subscription IDs.
   - DONE: Update status/current period fields.
   - DONE: Keep event dedupe.

6. Update entitlement route.
   - DONE: Return subscription-aware status.
   - DONE: Include clear customer-facing messages.

7. Update generate authorization.
   - Existing generate entitlement integration remains in place.
   - Active Pro subscription allows generation through the existing entitlement response path.
   - Free users remain limited to 3 generations.
   - Blocked users get exact recovery messages.

8. Update success/cancel/app copy.
   - DONE: Remove unlimited language.
   - DONE: Add Pro/fair-use language.
   - DONE: Add subscription syncing recovery text.

9. Add tests.
   - DONE: Focused entitlement active/trialing/past_due/canceled/unpaid/incomplete/legacy cases.
   - Pending if needed after verification: checkout/webhook integration tests.
   - Free-limit fallback.
   - Success-page entitlement refresh.

10. Test in Stripe test mode.
    - New subscription.
    - Renewal invoice paid.
    - Payment failed.
    - Cancel at period end.
    - Subscription deleted.

11. Launch checklist.
    - Confirm production env vars.
    - Confirm webhook endpoint.
    - Confirm Supabase schema.
    - Confirm public copy does not promise unlimited/lifetime access.

## Still Not Done

- Final subscription payment/webhook entitlement verification with `SUBSCRIPTION_TEST_CHECKLIST.md`.
- Changing public marketing copy to paid subscription claims.
- Adding a Billing Portal.
- Adding a Business tier.
