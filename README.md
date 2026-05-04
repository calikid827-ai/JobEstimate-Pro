# JobEstimate Pro

JobEstimate Pro is a Next.js estimating app for contractors. It creates estimates, change orders, invoices, approval pages, and plan-aware estimator readbacks from user-entered scope, photos, measurements, and uploaded plans.

The app currently includes:

- Main estimating workspace at `/app`
- Customer approval page at `/approve/[id]`
- Server-backed approval links with frozen proposal snapshots, server approval submission, status sync, and approval-created invoice sync
- Stripe checkout success and cancel pages
- AI-backed document generation through `/api/generate`
- Deterministic PriceGuard pricing protections
- Plan upload, selected-page staging, PDF splitting/rendering, and plan intelligence
- Photo intelligence and scope review helpers
- Browser-generated estimate and invoice PDFs
- Local browser persistence for estimates, jobs, invoices, budgets, actuals, company settings, and email, with server-backed approval snapshot/status/invoice sync

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

If `.env.example` does not exist, create `.env.local` manually using the variables below.

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Common checks:

```bash
npx tsc --noEmit
npm run lint
```

Estimator-focused tests:

```bash
npm run test:estimator
```

## Environment Variables

Required for generation and entitlement checks:

```bash
OPENAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Required for Stripe checkout and webhook handling:

```bash
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
```

Optional origin allowlist for production generate requests:

```bash
ALLOWED_ORIGIN_HOSTS=
```

Notes:

- `NEXT_PUBLIC_SITE_URL` is used by checkout redirects and same-origin request protection.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Do not expose it in client code.
- Detailed server logs are development-only in the generate path; production logs should not include customer scope, plan, or pricing details.

## API Routes

- `POST /api/generate`
  - Validates requests, checks same-origin, rate-limits usage, consumes free generation entitlement, runs plan/photo intelligence, calls OpenAI, applies estimator orchestration, and returns pricing/readback outputs.

- `POST /api/plan-upload`
  - Starts and completes staged plan uploads, supports selected-page upload metadata, and returns structured staging errors.

- `PUT /api/plan-upload`
  - Uploads chunks for staged plan uploads.

- `POST /api/checkout`
  - Creates a Stripe Checkout session for the configured `STRIPE_PRICE_ID`.

- `POST /api/webhook`
  - Verifies Stripe webhook signatures and activates entitlements after checkout completion.

- `POST /api/entitlement`
  - Checks entitlement status by email and returns free-limit usage information.

- `POST /api/approvals`
  - Saves a frozen customer-safe approval snapshot and returns a shareable `/approve/{token}` link plus an owner sync token for contractor-side status sync.
  - Stores only token hashes server-side.

- `GET /api/approvals/[token]`
  - Loads a server-backed approval snapshot for the public approval page.
  - Returns only the minimized customer-safe payload needed by the approval page.

- `POST /api/approvals/[token]/approve`
  - Saves customer approval/signature, marks the proposal approved, and creates one draft approval invoice snapshot when missing.
  - Handles already-approved submissions and duplicate approval-created invoice creation safely.

- `GET /api/approvals/status?email=...&ownerSyncToken=...`
  - Syncs approval status and approval-created invoice snapshots back into the app for the current owner email.
  - Requires the server-issued owner sync token; Supabase stores only its hash.

## Stripe Webhook Notes

For local webhook testing, forward Stripe events to:

```text
http://localhost:3000/api/webhook
```

The webhook route expects:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The checkout route expects:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `NEXT_PUBLIC_SITE_URL`

The success page refreshes entitlement by posting the saved email from `jobestimatepro_email` to `/api/entitlement`.

## Supabase Entitlement / Free Limit

The app uses Supabase for entitlement and usage checks.

Current server-side expectations include:

- A free generation consume RPC used by `/api/generate`
- Entitlement lookup used by `/api/entitlement`
- Stripe webhook event dedupe/entitlement activation used by `/api/webhook`
- Optional generation result caching keyed by email and request id

The generate route blocks free users when the Supabase RPC reports the free limit is reached.

## Supabase Approval Links

Server-backed approval links require Supabase tables for approval snapshots and sync:

- `estimate_proposals`
- `approval_links`
- `approval_owner_sync_tokens`
- `proposal_approvals`
- `approval_invoices`

The approval flow stores frozen customer-safe proposal snapshots and hashed approval tokens. Public approval pages read snapshots by token and receive only a minimized customer-safe payload. Customer signatures are saved server-side, and the contractor app can manually sync approved status and approval-created draft invoices back into localStorage using the owner email plus owner sync token.

The owner sync token is stored client-side in `jobestimatepro_owner_sync_token`. Supabase stores only the hashed token. Proposal reuse, approval rows, and approval-created invoices are duplicate-protected/idempotent where implemented.

This is not full authentication and does not replace user accounts/workspaces. The main contractor workspace remains localStorage-first outside the approval snapshot workflow, and full server-backed jobs/estimates/invoices are not implemented yet.

## Plan Upload And Rendering Notes

Plan upload support includes:

- PDF, PNG, JPG, JPEG, and WEBP intake
- Local PDF page indexing for page selection
- Selected-page staging and chunked upload
- Browser-side selected-page PDF export when possible
- Server-side selected-page extraction fallback
- PDF splitting and page rendering for plan intelligence
- Browser-derived selected-page PDFs render their reduced pages as `1..N` for image/vision fallback, while original source page numbers are preserved in plan provenance.
- Sheet classification, cross-sheet merge, plan readback, quantity support, grouped scope readback, scope gaps, and pricing-carry readback
- Plan evidence-strength readback with `Strong`, `Useful`, and `Review-only` labels.
  - Summarizes selected, indexed, and skipped pages.
  - Reports whether text was extracted and whether page images rendered.
  - Reports whether hard quantity support was found.
  - Reports whether estimator confirmation is still needed.

Important operational notes:

- Large PDFs should be narrowed with page selection before generation.
- If selected-page export fails in the browser, the app can fall back to original PDF staging with explicit messaging.
- Plan intelligence can degrade when a PDF cannot be rendered or indexed cleanly.
- Evidence-strength readback is readiness messaging, not a full measured takeoff. Hard quantity extraction is still heuristic.
- Estimate PDFs include a customer-safe estimator plan review when plans are present, even if hard measured quantities are not confirmed.

## LocalStorage Keys

Most app data is currently browser-local.

Important keys:

- `jobestimatepro_email`
- `jobestimatepro_company`
- `jobestimatepro_job`
- `jobestimatepro_invoices`
- `jobestimatepro_history_v1`
- `jobestimatepro_budgets_v1`
- `jobestimatepro_actuals_v1`
- `jobestimatepro_crews_v1`
- `jobestimatepro_jobs_v1`

Legacy keys may be migrated in the app from older `scopeguard_*` names.

## Current Limitations

- Saved estimates, jobs, invoices, budgets, and actuals are still mostly localStorage-backed.
- Approval links are server-backed through Supabase approval snapshot tables, but full server-backed jobs/estimates/invoices are not implemented yet.
- Estimate and invoice PDFs are generated with browser print windows, not server-side PDF rendering.
- Plan intelligence is strong but can still degrade on difficult PDFs or incomplete selected sheets.
- Some advanced analysis panels are diagnostic and not fully customer-facing.
- Lint may still report existing project-wide cleanup issues.
- There is no full account or billing management page yet.

## Development Guidance

- Do not change pricing authority, pricing protections, owner logic, or totals casually.
- Keep Stripe checkout/webhook changes isolated from estimator work.
- Keep entitlement changes isolated from generation and pricing logic.
- Prefer extending existing plan intelligence/readback structures over adding parallel engines.
- Use `npx tsc --noEmit` after production-readiness changes.

## Deployment Checklist

Before deploying:

1. Set all required environment variables in the hosting provider.
2. Configure Stripe Checkout price and webhook endpoint.
3. Confirm Supabase RPCs/tables needed by entitlement and webhook flows exist.
4. Set `NEXT_PUBLIC_SITE_URL` to the production URL.
5. Run:

```bash
npx tsc --noEmit
npm run lint
```

6. Test:
   - Free generation
   - Stripe checkout
   - Success entitlement refresh
   - Plan upload/page selection
   - Estimate PDF
   - Invoice creation
   - Server-backed approval link creation/read/submit/sync
