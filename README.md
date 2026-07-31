# JobEstimate Pro

JobEstimate Pro is a Next.js estimating app for contractors. It creates estimates, change orders, invoices, approval pages, and plan-aware estimator readbacks from user-entered scope, photos, measurements, and uploaded plans.

The app currently includes:

- Main estimating workspace at `/app`
- Customer approval page at `/approve/[id]`
- Server-backed approval links with frozen proposal snapshots, server approval submission, status sync, and approval-created invoice sync
- Stripe checkout success and cancel pages
- AI-backed document generation through `/api/generate`
- Deterministic PriceGuard pricing protections
- Deterministic UI-side PriceGuard Review with estimate score/level, missed-scope warnings, labor/material confidence notes, suggested exclusions, customer-ready price defense notes, and contractor-only risk notes
- Plan upload, selected-page staging, PDF splitting/rendering, and plan intelligence
- Photo intelligence and scope review helpers
- Browser-generated estimate and invoice PDFs
- Local browser persistence for estimates, jobs, invoices, budgets, actuals, company settings, and email, with server-backed approval snapshot/status/invoice sync
- Generated Result Command Center with five primary sections: Proposal, Price & Profit, Schedule & Crew, Review Before Sending, and Job Workflow
- Saved Job Templates V1 for client-only reusable estimate starts in `jobestimatepro_templates_v1`
- Rate Card V1 for client-only local contractor pricing defaults in `jobestimatepro_rate_card_v1`
- Proposal delivery actions inside the Proposal section: Download Estimate PDF and Copy proposal text
- Compact Send Readiness inside Proposal for one contractor-facing status, one short reason, and an optional scroll-only Review items action
- Actionable Scope Decisions V1 inside Review Before Sending for explicit preview-and-apply scope wording without automatic regeneration
- Active Job Summary inside the existing Job Workflow section for current job status, key workflow facts, and one practical next action
- Field Handoff V1 inside Job Workflow for crew-ready handoff notes from the current estimate

Recent workflow upgrades move the app away from diagnostic clutter and toward contractor value: a cleaner generated result page, faster repeat estimating, local pricing defaults, faster proposal delivery, crew-ready field handoff, a clearer active-job workflow summary / next action, a simple Send Readiness decision at proposal delivery, and explicit contractor-approved scope decisions before regeneration.

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

Targeted test examples:

```bash
npx tsc --noEmit
node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/lib/plan-upload.test.ts
node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/plans/orchestrator.test.ts app/api/generate/lib/plans/pdfSplit.test.ts app/api/generate/lib/plans/pdfSelect.test.ts
node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/entitlement/entitlement.test.ts app/api/approvals/approvalWorkflow.test.ts app/app/lib/invoices.test.ts
```

QA/testing note:

- Use `test12345@gmail.com` for JobEstimate Pro generation/regression QA. Do not default to random or fresh QA emails for normal app workflow testing.

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
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
```

Legacy/pre-launch one-time checkout fallback only:

```bash
STRIPE_PRICE_ID=
```

Optional origin allowlist for production generate requests:

```bash
ALLOWED_ORIGIN_HOSTS=
```

Notes:

- `NEXT_PUBLIC_SITE_URL` is used by checkout redirects and same-origin request protection.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Do not expose it in client code.
- Current checkout uses the recurring monthly `STRIPE_PRO_MONTHLY_PRICE_ID` with `mode: "subscription"`.
- A Stripe recurring monthly Pro price has been created, Vercel has `STRIPE_PRO_MONTHLY_PRICE_ID` set, the app was redeployed after adding the env var, and final subscription payment/webhook entitlement verification is still pending.
- Detailed server logs are development-only in the generate path; production logs should not include customer scope, plan, or pricing details.

## API Routes

- `POST /api/generate`
  - Validates requests, checks same-origin, rate-limits usage, consumes free generation entitlement, runs plan/photo intelligence, calls OpenAI, applies estimator orchestration, and returns pricing/readback outputs.

- `POST /api/plan-upload`
  - Starts and completes staged plan uploads, supports selected-page upload metadata, and returns structured staging errors.

- `PUT /api/plan-upload`
  - Uploads chunks for staged plan uploads.

- `POST /api/checkout`
  - Creates a Stripe subscription Checkout session for the configured `STRIPE_PRO_MONTHLY_PRICE_ID`.

- `POST /api/webhook`
  - Verifies Stripe webhook signatures, dedupes Stripe events, and updates subscription-aware entitlements for checkout, subscription lifecycle, and invoice events.

- `POST /api/entitlement`
  - Checks entitlement status by email and returns subscription-aware access fields plus free-limit usage information.

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
- `STRIPE_PRO_MONTHLY_PRICE_ID`
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
- Range-based PDF page selection with From / To / Select range controls
- Large-plan selected-page readiness guidance for all-pages-selected, no-page selections, many selected pages, high selected upload size, and suggested sheet types
- Selected-page staging and chunked upload
- Browser-side selected-page PDF export when possible
- Server-side selected-page extraction fallback
- Original-PDF fallback limits rendering/indexing to selected source pages when `selectedSourcePages` are available, preserving original source page provenance
- PDF splitting and page rendering for plan intelligence
- Browser-derived selected-page PDFs render their reduced pages as `1..N` for image/vision fallback, while original source page numbers are preserved in plan provenance.
- Sheet classification, cross-sheet merge, plan readback, quantity support, grouped scope readback, scope gaps, and pricing-carry readback
- Estimator-only per-page read status diagnostics for selected/read/degraded pages and weak/unknown sheet classification
- Estimator-only structured sheet classification diagnostics for floor plan, finish schedule, fixture schedule, door schedule, window schedule, RCP, elevation, demo plan, legend, and unknown sheets
- Estimator-only table/schedule extraction diagnostics for finish schedules, fixture schedules, door schedules, window schedules, legends, and unknown/generic schedules, preserving raw row text, confidence, and warnings
- Estimator-only room/finish matrix diagnostics from extracted finish schedules, preserving room name/number, room type, wall/base/ceiling/floor finishes, notes, raw row text, confidence, and warnings
- Estimator-only repeated room package diagnostics from room/finish matrices, preserving repeated room families, finish signatures, source provenance, confidence, and warnings
- Estimator-only trade quantity candidate diagnostics from existing plan diagnostics, preserving source provenance, confidence, assumptions, and warnings; candidates are not pricing-eligible and are not measured takeoff support
- Estimator-only trade quantity candidate gate diagnostics that classify candidates as `blocked`, `review_only`, or `future_candidate` while keeping `pricingEligibleNow` false
- Plan evidence-strength readback with `Strong`, `Useful`, and `Review-only` labels.
  - Summarizes selected, indexed, and skipped pages.
  - Reports whether text was extracted and whether page images rendered.
  - Reports whether hard quantity support was found.
  - Reports whether estimator confirmation is still needed.

Important operational notes:

- Large PDFs should be narrowed with page selection before generation.
- Use range selection to quickly narrow large PDFs to the sheets that should be reviewed.
- The upload UI shows readiness guidance for large plan selections and recommends starting with floor plans, finish schedules, elevations, door/window schedules, fixture schedules, and trade-relevant RCP/demo sheets.
- If selected-page export fails in the browser, the app can fall back to original PDF staging with explicit messaging.
- If a later selected-page derivation attempt fails, Generate continues with the original staged PDF and selected source pages instead of failing the whole request.
- Plan intelligence can degrade when a PDF cannot be rendered or indexed cleanly.
- Evidence-strength, table/schedule extraction, room/finish matrix, repeated room package, trade quantity candidate, and candidate gate readbacks are readiness diagnostics, not a full measured takeoff. Hard quantity extraction is still heuristic.
- Estimate PDFs include a customer-safe estimator plan review when plans are present, even if hard measured quantities are not confirmed.
- Estimate PDFs also include a compact plan evidence summary showing evidence strength, selected pages reviewed, text extraction status, rendered image status, hard quantity status, and confirmation-needed status. This is plan evidence/readiness messaging, not a full measured takeoff.

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
- `jobestimatepro_templates_v1`
- `jobestimatepro_rate_card_v1`
- `jobestimatepro_owner_sync_token`

Legacy keys may be migrated in the app from older `scopeguard_*` names.

The app includes a thin local persistence helper at `app/app/lib/local-persistence.ts` for typed key groups, safe get/set/remove access, JSON read/write wrappers, and legacy email/company migration. It preserves the existing keys and data shapes; full server-backed persistence is not implemented yet.

`jobestimatepro_templates_v1` stores client-only Saved Job Templates with safe setup fields only: id, name, timestamps, trade, document type, state, typed scope, paint scope, and optional notes. Applying a template prefills estimator input fields only and does not auto-generate.

`jobestimatepro_rate_card_v1` stores client-only Rate Card defaults: markup, tax enabled/rate, deposit enabled/type/value, updatedAt, and reference-only trade/labor/material/minimum charge notes. Applying the Rate Card updates only existing editable client-side controls and is not backend pricing authority.

Field Handoff V1 does not add a localStorage key. It is derived from the current estimate state only and does not add server persistence.

Active Job Summary does not add a localStorage key, server persistence, saved estimate/job/invoice data shape, pricing authority, PDF content, or `/api/generate` behavior. It derives contractor-facing workflow information from existing state only: active job, current loaded estimate only when it matches the summarized job, job details, workflow/pipeline status, contract value, approval status, invoice summary, actuals/profit, crew load, and Field Handoff readiness when available.

Send Readiness does not add a localStorage key, server persistence, or saved readiness field. Its pure helper supports `Ready to send`, `Review before sending`, and the safe `Finish estimate first` fallback. The Generated Result Command Center renders only after generation, so that fallback does not create a pre-result Proposal surface. Readiness is derived from existing unsupported-scope drift, Customer Output Readiness items, Estimator Review Summary status, PriceGuard level/score, all unresolved high-priority Smart Questions, and plan/photo review warnings. While typed scope differs from the scope used for the displayed result, `Regenerate before sending` takes priority. These signals remain non-pricing-authoritative and do not change pricing, `result.text`, PDF content, proposal delivery availability, or `/api/generate`.

Actionable Scope Decisions V1 replaces the former Quick Clarifications interaction in the existing Review Before Sending section. It renders zero to three decisions from safely structured Smart Question metadata, currently supporting structured material responsibility at runtime. Trusted quantity or explicit scope-boundary decisions require allowlisted subject metadata and, for quantity, a matching fixed measurement basis/unit. Generic warning, diagnostic, plan, photo, Scope X-Ray, PriceGuard, or AI prose cannot manufacture deterministic wording; ambiguous subjects are deferred.

Selecting a decision previews an exact deterministic sentence without changing typed scope. `Apply to typed scope` changes only the existing estimator input and marks the displayed result stale; it does not call Generate or update pricing, labor, proposal text, PDF/copy output, workflow readbacks, or saved data. Generated-result surfaces continue using the exact generated-scope snapshot until successful manual regeneration. Transient choices and sentence-ownership records use local React state only, add no localStorage key or saved field, and never become pricing authority.

Feature-applied wording is replaced only when the current scope exactly matches the expected post-Apply snapshot and the sentence remains at its recorded range. Any manual textarea edit fails closed with ownership-loss feedback rather than rewriting or appending contractor text. Exact normalized line/sentence matches prevent duplicates without treating partial phrases inside longer contractor prose as duplicates.

## Recent Contractor Workflow QA

Full no-code end-to-end regression QA passed after `37c8a14 Add proposal readiness badge` using `test12345@gmail.com`. Focused validation and browser sanity QA also passed after `0afc82e Fix proposal readiness severity`. Post-push regression QA passed after `7c5ac91 Add actionable scope decisions` using the same QA email.

Verified:

- Five Generated Result Command Center sections render: Proposal, Price & Profit, Schedule & Crew, Review Before Sending, and Job Workflow.
- Advanced Diagnostics is collapsed by default, with EstimateStatusCard inside that drawer.
- Scope Decisions replaces Quick Clarifications in Review Before Sending, renders zero to three safely structured decisions, and does not create another panel or Command Center section.
- The committed browser regression rendered one structured material-responsibility decision and no inferred ceiling, repair, access, protection, or occupied-area decision.
- Selection previews wording without changing scope or calling Generate. Apply changes only typed scope, keeps generated proposal/workflow readbacks frozen, and changes Send Readiness to `Regenerate before sending`.
- Immediate replacement of unchanged feature-owned wording works. After a manual textarea edit, replacement fails closed with ownership-loss feedback and leaves contractor text unchanged.
- Successful manual regeneration rebuilds generated-result readbacks, clears stale readiness and transient decision state, and reevaluates Send Readiness normally.
- Proposal includes a compact `data-no-print` Send Readiness badge directly above or near Download Estimate PDF and Copy proposal text. It summarizes existing review intelligence instead of duplicating Customer Output Readiness, PriceGuard Review, Smart Questions, or Advanced Diagnostics details, and it does not create a sixth Command Center section.
- Review items scrolls only to the existing Review Before Sending section, does not open Advanced Diagnostics, does not call Generate, and does not mutate pricing, `result.text`, history, jobs, invoices, Rate Card, Saved Job Templates, Field Handoff, or Active Job Summary. PDF download and proposal copy remain available and unchanged.
- `0afc82e` keeps Unsupported trade wording critical and preserves the higher-priority `Scope wording may overpromise unsupported work.` reason. The broader Customer-ready review row still keeps proposals in review through normal readiness-item or PriceGuard signals but no longer produces the inaccurate `Customer-facing scope has a critical review item.` message. Ready thresholds, PriceGuard thresholds/classification, helper priority, readiness-item generation, Estimator Review Summary, Smart Questions, and plan/photo behavior were unchanged.
- Proposal actions work: Download Estimate PDF uses existing PDF behavior, and Copy proposal text copies only customer-facing proposal text.
- Rate Card save, refresh persistence, and apply update only editable pricing controls.
- Job Templates save, refresh persistence, and apply correctly prefill the visible typed scope textarea plus trade/state/paint scope without calling Generate.
- Active Job Summary appears near the top of Job Workflow and keeps Jobs, Job Templates, Invoices, Saved Estimates, and Field Handoff available below it.
- Active Job Summary shows job/client/status/contract/approval/invoice/actuals/profit/crew/next-action information where available, using existing state only.
- Active Job Summary next actions reuse existing workflow actions or scroll to existing workflow surfaces, such as Create/select job, Copy approval link, Create deposit/final/balance invoice, Open invoices, Open actuals, and Open Field Handoff.
- Summary-only scroll/open actions do not call Generate and do not mutate pricing, `result.text`, history, jobs, or invoices.
- Field Handoff readiness and current estimate data are scoped to the summarized job, so the summary does not offer Field Handoff or borrow contract/approval data for the wrong selected job.
- Field Handoff appears inside Job Workflow, not as a sixth Command Center section. It turns the current estimate into crew-ready notes for job basics, scope summary, included work, exclusions/boundaries, schedule/crew guidance, materials/reminders, watch-outs/coordination, and deposit/payment note when available.
- Field Handoff omits empty fields instead of inventing facts, excludes diagnostics/internal review and PriceGuard content from helper output, is not a diagnostic/reporting panel, and is not pricing-authoritative.
- Copy field handoff copies only Field Handoff content and does not call Generate, mutate pricing, mutate `result.text`, or mutate history/jobs/invoices localStorage.
- Print mode hides `data-no-print` workflow controls, including Send Readiness, Scope Decisions, Proposal delivery actions, Rate Card, Job Templates, Field Handoff action controls, and Advanced Diagnostics.
- Copy/PDF actions do not mutate history/jobs/invoices localStorage.
- Proposal Readiness validation passed with `npx tsc --noEmit`, `git diff --check`, and 10/10 focused helper tests. A deliberately explicit painting browser fixture remained `Review before sending` because upstream review signals remained; browser QA did not observe `Ready to send`. Focused helper coverage confirms the clean Ready state, and a complete code-level painting case produced strong PriceGuard with no warning/risk rows, so Ready is not documented as impossible.
- Focused QA after `0afc82e` showed `Review before sending` with `4 pre-send items need review.`, no inaccurate critical wording, scroll-only Review items behavior, no extra Generate call or checked state/localStorage mutation, working PDF/copy actions, and no console/page errors. That fixture contained neither Customer-ready review nor unsupported scope drift; those branches were confirmed through code inspection and existing helper behavior.
- Actionable Scope Decisions validation passed with `npx tsc --noEmit` and 54/54 focused tests. The post-push browser regression returned 200 for both intentional Generate requests, preserved exactly five Command Center sections, passed stale/readback/ownership/PDF-copy/print/mobile checks, reported no console or page errors, stopped all test processes, and left the working tree clean.
- Dev server was stopped after QA, no blockers or regressions were found, and the working tree stayed clean.
- No browser console/page errors were observed.

## Current Limitations

- Saved estimates, jobs, invoices, budgets, and actuals are still mostly localStorage-backed.
- Approval links are server-backed through Supabase approval snapshot tables, but full server-backed jobs/estimates/invoices are not implemented yet.
- Estimate and invoice PDFs are generated with browser print windows, not server-side PDF rendering.
- Plan intelligence is strong but can still degrade on difficult PDFs or incomplete selected sheets.
- Some advanced analysis panels are diagnostic and not fully customer-facing.
- `npm run lint` still reports existing project-wide cleanup issues, mostly broad `any` typing, hook dependency warnings, image optimization warnings, unused symbols, and large component prop typing. `npx tsc --noEmit` currently passes.
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
