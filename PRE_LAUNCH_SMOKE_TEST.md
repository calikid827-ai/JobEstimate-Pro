# Pre-Launch Smoke Test

Use this checklist to verify the current PWA/web app workflow end to end before launching publicly. This is a manual smoke test, not a replacement for automated tests, the production Supabase verification checklist, or the focused subscription verification checklist.

Current scope:

- In scope: current web/PWA app, free generation, subscription checkout foundation smoke, entitlement refresh behavior, plan upload/selected-page generation, estimate and invoice PDFs, server-backed approval links, cross-device approval, approval sync, approval-created invoice import, production log safety, and Supabase checkpoints.
- Out of scope: final subscription payment/webhook entitlement verification, billing portal, invoice payments, full auth/workspaces, server-backed jobs/estimates/invoices, App Store/native iOS work.
- Important: The subscription billing foundation is implemented. `/api/checkout` uses `STRIPE_PRO_MONTHLY_PRICE_ID` with `mode: "subscription"`, `/api/webhook` handles the required subscription lifecycle events, `/api/entitlement` returns subscription-aware fields, `/app` shows plan/status/period information, and `/success` and `/cancel` use subscription-oriented copy.
- Important: Final subscription payment, webhook delivery, and entitlement activation verification is still pending until `SUBSCRIPTION_TEST_CHECKLIST.md` is completed. The prior completed app-side smoke test included the older pre-subscription Stripe checkout flow; this checklist now reflects the current subscription foundation without claiming final subscription verification has passed.

## Test Setup

Use a clean browser profile or private window for the contractor app, plus a second browser/profile/device for customer approval.

For JobEstimate Pro regression QA and generation testing, use the dedicated QA email `test12345@gmail.com`. Do not default to random/fresh QA emails for normal app workflow testing. The smoke-test owner email below is for intentional production/staging smoke records and SQL verification examples.

Recommended test identifiers:

- Owner email: `smoke+owner@example.com`
- Client name: `Smoke Test Client`
- Job name: `Smoke Test Plan Job`
- Job address: `123 Smoke Test Ave`
- Scope: small, realistic contractor scope such as `Paint two bedrooms, patch minor drywall, and replace base trim.`
- Plan file: a small multi-page PDF or image set you can safely upload in production.

Before starting, record:

- Production URL:
- Supabase project:
- Stripe mode: test or live:
- Stripe recurring monthly price ID:
- Final subscription verification status: pending/pass/fail:
- Browser/device 1:
- Browser/device 2:

## 1. Environment Variables

Check production hosting environment variables before opening the app.

Required:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

Optional:

- `ALLOWED_ORIGIN_HOSTS`

Expected result:

- `NEXT_PUBLIC_SITE_URL` is the production origin with no path suffix.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and is not exposed to client bundles or browser devtools.
- Stripe webhook endpoint points to `POST /api/webhook`.
- `STRIPE_PRO_MONTHLY_PRICE_ID` matches the current recurring monthly Pro price.
- Stripe webhook endpoint is configured for the subscription events listed in `SUBSCRIPTION_TEST_CHECKLIST.md`.
- `ALLOWED_ORIGIN_HOSTS`, if set, allows the production app origin.

If this fails:

- Fix hosting variables before testing workflows.
- Redeploy/restart the app after variable changes.
- Do not continue if `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, or OpenAI key are missing.

## 2. Production Console And Log Safety

Open production `/app` with browser devtools.

Steps:

1. Confirm the browser console is free of startup errors.
2. Enter the smoke-test owner email.
3. Click `Refresh access`.
4. Watch browser console and server logs during the rest of this smoke test.

Expected result:

- Browser console should not print customer scope text, plan file contents, full pricing payloads, OpenAI prompts, photo payloads, approval tokens, owner sync tokens, signatures, or raw Supabase errors.
- Server logs may show high-level errors if something fails, but should not expose detailed customer scope, plan, or pricing data in normal production flow.

If this fails:

- Capture the route/component and exact log line.
- Treat exposed customer data, approval tokens, owner sync tokens, signatures, plan contents, or pricing internals as launch-blocking.
- Do not change app logic during this smoke-test planning pass; create a follow-up fix task.

## 3. Account And Access Panel Refresh

Steps:

1. Open `/app`.
2. Enter the owner email.
3. Blur the email field or click `Refresh access`.
4. Review the `Account & Access` panel.

Expected result:

- Email displays normalized lowercase.
- Access status shows `Free` for a non-paid smoke-test email.
- Free usage and free limit display when Supabase responds.
- Remaining free generations equals `free_limit - usage_count`.
- No checkout or entitlement errors appear.

If this fails:

- Check `POST /api/entitlement` response in Network.
- Verify `entitlements.email` lookup works in Supabase.
- Confirm `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are production values.

## 4. Free Generation

Steps:

1. Keep the owner email entered.
2. Fill company profile and job details enough for a customer-ready document.
3. Select a trade and document type.
4. Enter a small realistic scope.
5. Click `Generate`.

Expected result:

- Status changes to generating and then returns a generated estimate/change order.
- Pricing, schedule, scope text, and customer-facing summary render.
- The estimate is saved in `Saved Estimates`.
- Account panel usage increments or reflects updated free usage after refresh.

If this fails:

- Check `POST /api/generate` status and response message.
- If free limit is reached during normal JobEstimate Pro QA, use `test12345@gmail.com` and verify its test entitlement state. For production smoke testing, clear/update the intentional production test entitlement row rather than switching to random emails.
- Verify `consume_free_generation(p_email, p_free_limit, p_idempotency_key)` exists and returns `ok`, `usage_count`, and `free_limit`.
- Verify `OPENAI_API_KEY` is valid if generation fails after entitlement succeeds.

## 5. Plan Upload And Selected-Page Generation

Steps:

1. Start a new estimate or continue with the generated test estimate.
2. Upload a small multi-page PDF plan under the Plan Upload section.
3. Wait for PDF page indexing.
4. Select only one or two pages.
5. Confirm the UI shows selected page count and plan processing status.
6. Click `Generate`.

Expected result:

- PDF pages are indexed and selectable.
- Generate stages only the selected plan set when possible.
- Status messaging identifies selected-page processing or explicit original-PDF fallback.
- Generated output includes plan-aware readback.
- Plan evidence strength appears as `Strong`, `Useful`, or `Review-only`.
- Estimate PDF later includes customer-safe Estimator Plan Review and compact plan evidence summary.

If this fails:

- Try a smaller PDF or fewer selected pages.
- Confirm `POST /api/plan-upload` and `PUT /api/plan-upload` complete without 4xx/5xx errors.
- If selected-page derivation falls back to original PDF, verify the UI states that explicitly and generation still completes.
- Treat silent use of unselected pages as launch-blocking.

## 6. Estimate PDF Download

Steps:

1. After generation, click `Download Estimate PDF`.
2. Allow pop-ups/print windows if prompted.
3. Save or preview the browser-generated PDF.

Expected result:

- Print window opens and contains JobEstimate Pro branding.
- Customer/job metadata, scope, schedule, rows/sections, pricing summary, tax/deposit if enabled, and approval section are readable.
- If plans were uploaded, the PDF includes customer-safe plan review and compact plan evidence summary.
- No diagnostic-only raw payloads are visible to the customer.

If this fails:

- Allow pop-ups and retry.
- Test a second browser.
- Record layout defects, missing plan review, or customer-unsafe diagnostic output as follow-up launch blockers.

## 7. Invoice Creation And Invoice PDF Download

Steps:

1. In `Saved Estimates` or `Jobs Dashboard`, use the invoice action available for the latest estimate, such as `Create Deposit Invoice`, `Create Balance Invoice`, or `Create Final Invoice`.
2. Confirm the status reports an invoice number.
3. Open the invoice list or use `Download Latest Invoice PDF`.
4. Click `Download Invoice PDF`.

Expected result:

- One invoice is created for the estimate unless a duplicate already exists.
- Invoice appears in the invoice list with invoice number, client/job context, total due, and status controls.
- Invoice PDF opens in a print window and is customer-readable.
- Deposit/balance behavior follows the estimate deposit settings.

If this fails:

- If the app says an invoice already exists, verify the existing invoice is correct and use the existing invoice PDF.
- If balance invoice creation fails, confirm the estimate has a deposit and remaining balance.
- If PDF is blocked, allow pop-ups and retry.

## 8. Stripe Subscription Checkout Foundation Smoke

This verifies that the deployed app starts the current subscription Checkout path. It does not replace final subscription payment/webhook entitlement verification in `SUBSCRIPTION_TEST_CHECKLIST.md`.

Steps:

1. Use a test-mode production/staging environment if available.
2. Enter the owner email on `/app`.
3. Exhaust the free limit or use a test state where `Upgrade for Pro Access` is visible.
4. Click `Upgrade for Pro Access`.
5. Confirm Stripe Checkout opens for the same email.
6. Inspect the Checkout session in Stripe Dashboard or Network logs.
7. Use Stripe's cancel/back path to return to `/cancel`, unless this run is intentionally continuing into `SUBSCRIPTION_TEST_CHECKLIST.md`.

Expected result:

- `POST /api/checkout` creates a Checkout session.
- Checkout uses the configured `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Checkout mode is `subscription`.
- Checkout metadata/email matches the app email.
- Cancel redirect reaches `/cancel` and uses subscription-oriented copy.
- No one-time, lifetime, or unlimited-access language appears.

If this fails:

- Check `STRIPE_SECRET_KEY`, `STRIPE_PRO_MONTHLY_PRICE_ID`, and `NEXT_PUBLIC_SITE_URL`.
- Verify the Stripe webhook endpoint and `STRIPE_WEBHOOK_SECRET`.
- In Stripe Dashboard, inspect the Checkout session and webhook delivery.
- Do not change billing behavior during this smoke-test pass; use `SUBSCRIPTION_TEST_CHECKLIST.md` for final subscription verification.

## 9. Success Entitlement Refresh

Steps:

1. Only run this section after intentionally completing subscription Checkout in test mode.
2. On `/success`, wait for the entitlement confirmation or syncing message.
3. Click `Return to JobEstimate Pro`.
4. In `/app`, click `Refresh access`.

Expected result:

- `/success` posts the saved `jobestimatepro_email` to `/api/entitlement`.
- If webhook processing has completed, `/success` and `/app` show Pro subscription access with subscription-aware plan/status/period information.
- If webhook processing is still pending, `/success` uses subscription syncing guidance and `/app` can refresh entitlement again.
- This section can confirm success-page refresh behavior, but final pass/fail for subscription payment, webhook delivery, and entitlement activation belongs in `SUBSCRIPTION_TEST_CHECKLIST.md`.

If this fails:

- Wait a few seconds and click `Refresh access` again.
- Confirm the webhook inserted/updated `entitlements` for the lowercase email with subscription-aware fields.
- Verify webhook dedupe did not fail for `stripe_webhook_events`.
- Confirm Checkout email matches the app email.
- Complete `SUBSCRIPTION_TEST_CHECKLIST.md` before treating paid subscription launch as verified.

## 10. Approval Link Creation

Steps:

1. Return to `/app` with the owner email entered.
2. Use an estimate that has been generated and saved.
3. In `Saved Estimates` or `Jobs Dashboard`, click `Copy Approval Link`.
4. Paste the clipboard value somewhere temporary.

Expected result:

- Status says `Shareable approval link copied to clipboard.`
- Link starts with the production origin and `/approve/`.
- `jobestimatepro_owner_sync_token` is present in contractor browser localStorage.
- Supabase has a proposal row, approval link row, and owner sync token row.
- Raw approval token and raw owner sync token are not stored in Supabase, only hashes.

If this fails:

- If status says local approval link was copied, check owner email and Supabase approval tables.
- Verify `POST /api/approvals` can write `estimate_proposals`, `approval_links`, and `approval_owner_sync_tokens`.
- Do not use local-only approval links for cross-device launch validation.

## 11. Approval From Another Browser Or Device

Steps:

1. Open the copied `/approve/{token}` link in a different browser/profile/device.
2. Confirm the customer-facing proposal loads without localStorage from the contractor browser.
3. Review client/job, scope, pricing, and approval area.
4. Enter approver name.
5. Draw or provide a signature.
6. Confirm approval and submit.

Expected result:

- Public approval page loads from server-backed snapshot.
- It does not expose raw estimator diagnostics, raw plan intelligence, embedded internal payloads beyond customer-safe estimate content, approval token hash, or owner sync token.
- Submission succeeds and displays approved status.
- Re-submitting the same approved link is idempotent and does not create duplicate invoices.

If this fails:

- Check `GET /api/approvals/[token]` and `POST /api/approvals/[token]/approve`.
- Verify `approval_links.token_hash` lookup, active status, and expiration rules.
- Verify `proposal_approvals` and `approval_invoices` constraints.

## 12. Approval Sync Back To App

Steps:

1. Return to the original contractor browser on `/app`.
2. Keep the same owner email entered.
3. In `Saved Estimates`, click `Sync approvals`.
4. Load the approved estimate if needed.

Expected result:

- Status reports synced approval updates and invoice import, or says approvals are already up to date after a second sync.
- Saved estimate shows `APPROVED`.
- Approval metadata includes approver name, approved time, and signature.
- Estimate PDF can show approved signature when downloading from the loaded approved estimate.

If this fails:

- Confirm `jobestimatepro_owner_sync_token` exists in original browser localStorage.
- Confirm `GET /api/approvals/status?email=...&ownerSyncToken=...` returns the approved proposal.
- If token is missing, create/copy a shareable approval link again before syncing.
- Treat email-only approval sync as invalid; owner sync token is required.

## 13. Approval-Created Invoice Import

Steps:

1. After approval sync, inspect invoices in `/app`.
2. Find the approval-created draft invoice.
3. Click `Download Invoice PDF`.
4. Click `Sync approvals` a second time.

Expected result:

- Exactly one approval-created draft invoice imports for the approved estimate.
- Invoice is not duplicated after repeated sync.
- Invoice PDF downloads/prints successfully.
- Local invoice list preserves existing invoices and adds only the missing approval-created invoice.

If this fails:

- Verify `approval_invoices` has one row for the proposal.
- Check uniqueness/duplicate protection on approval invoice proposal linkage.
- Confirm imported invoice snapshot has `id` and `fromEstimateId`.
- If duplicates appear locally, capture local invoice IDs and Supabase rows for a follow-up fix.

## 14. Supabase Table Verification Checkpoints

Run these checks in Supabase after completing the workflow. Adapt column names only if production schema intentionally differs from `SUPABASE_PRODUCTION_CHECKLIST.md`.

Entitlements:

```sql
select email, active, usage_count, stripe_customer_id
from entitlements
where email = 'smoke+owner@example.com';
```

Expected result:

- Row exists after generation or checkout.
- `usage_count` reflects free generation use.
- If subscription Checkout was completed and verified through `SUBSCRIPTION_TEST_CHECKLIST.md`, subscription fields reflect the Stripe subscription and `active` follows the entitlement policy documented there.
- If final subscription verification has not been completed, do not claim paid entitlement activation has passed from this smoke test alone.
- Webhook upserts do not reset `usage_count`.

Free-generation RPC:

```sql
select consume_free_generation(
  'smoke+rpc@example.com',
  3,
  'manual-smoke-idempotency-key'
);
```

Expected result:

- Response includes `ok`, `usage_count`, and `free_limit`.
- Repeating the same idempotency key does not double-count usage.

Stripe webhook dedupe:

```sql
select event_id, type, created_at
from stripe_webhook_events
order by created_at desc
limit 10;
```

Expected result:

- Recent subscription events exist after final subscription verification, including `checkout.session.completed` and the relevant subscription/invoice events from `SUBSCRIPTION_TEST_CHECKLIST.md`.
- Duplicate webhook retries are safe because `event_id` is unique.

Approval proposal:

```sql
select id, owner_email, local_estimate_id, status, client_name, job_name, created_at, updated_at
from estimate_proposals
where owner_email = 'smoke+owner@example.com'
order by created_at desc;
```

Expected result:

- One current proposal exists for the smoke estimate.
- Status changes from `pending` to `approved` after customer approval.
- Duplicate proposals do not accumulate for repeated copy-link actions on the same local estimate.

Approval link:

```sql
select id, proposal_id, token_hash, status, expires_at, created_at, last_viewed_at
from approval_links
where proposal_id in (
  select id from estimate_proposals where owner_email = 'smoke+owner@example.com'
)
order by created_at desc;
```

Expected result:

- `token_hash` is populated.
- Raw public approval token is not stored.
- `last_viewed_at` updates after public link load.

Owner sync token:

```sql
select owner_email, token_hash, created_at, updated_at
from approval_owner_sync_tokens
where owner_email = 'smoke+owner@example.com';
```

Expected result:

- Row exists with hashed token only.
- Raw owner sync token is not stored.

Proposal approval:

```sql
select proposal_id, approved_by, approved_at, signature_data_url
from proposal_approvals
where proposal_id in (
  select id from estimate_proposals where owner_email = 'smoke+owner@example.com'
);
```

Expected result:

- One approval row exists for the proposal.
- `approved_by`, `approved_at`, and signature data are present.
- Repeated approval submission does not create duplicate approval rows.

Approval invoice:

```sql
select proposal_id, local_invoice_id, status, invoice_snapshot
from approval_invoices
where proposal_id in (
  select id from estimate_proposals where owner_email = 'smoke+owner@example.com'
);
```

Expected result:

- One draft approval invoice row exists.
- `invoice_snapshot` has an invoice `id` and `fromEstimateId`.
- Repeated approval/sync does not create duplicates.

Required constraints/indexes to confirm:

- `entitlements.email` unique or primary key.
- `stripe_webhook_events.event_id` unique or primary key.
- `approval_links.token_hash` unique.
- `approval_owner_sync_tokens.owner_email` unique.
- `proposal_approvals.proposal_id` unique or otherwise duplicate-protected.
- `approval_invoices.proposal_id` unique or otherwise duplicate-protected.
- Useful indexes exist for owner/proposal lookups listed in `SUPABASE_PRODUCTION_CHECKLIST.md`.

If any checkpoint fails:

- Treat missing required tables/RPCs/constraints as launch-blocking.
- Fix schema through a reviewed migration or dashboard change, then rerun the full affected workflow.
- If data shape differs intentionally, update `SUPABASE_PRODUCTION_CHECKLIST.md` in a separate documentation pass.

## 15. Pass/Fail Summary

Record final result:

- Environment variables:
- Console/log safety:
- Account/access refresh:
- Free generation:
- Plan selected-page generation:
- Estimate PDF:
- Invoice creation/PDF:
- Stripe subscription checkout foundation:
- Success entitlement refresh, if subscription checkout was intentionally completed:
- Final subscription payment/webhook verification using `SUBSCRIPTION_TEST_CHECKLIST.md`:
- Approval link creation:
- Cross-browser approval:
- Approval sync:
- Approval-created invoice import:
- Supabase checkpoints:

Launch readiness rule:

- Passing this smoke test means the current PWA/web app workflow works for the tested happy path.
- Public paid launch also requires passing `SUBSCRIPTION_TEST_CHECKLIST.md`; final subscription payment, webhook delivery, and entitlement activation verification is still pending until that focused checklist is completed.
- Any customer-data log exposure, broken production generation, failed final subscription entitlement verification, failed cross-device approval, duplicate approval-created invoices, or missing required Supabase constraints should block public launch.
