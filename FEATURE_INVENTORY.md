# JobEstimate Pro Feature Inventory

## App Overview

JobEstimate Pro is a Next.js app for creating contractor estimates, change orders, invoices, approvals, and plan-aware pricing readbacks.

The app has:

- A marketing landing page at `/`.
- A main estimating app at `/app`.
- Server APIs for document generation, entitlement checks, Stripe checkout/webhooks, staged plan uploads, and server-backed approval snapshots.
- Local browser persistence for estimates, jobs, invoices, budgets, actuals, company settings, and email, with server-backed approval snapshot/status/invoice sync.
- A large estimator backend with AI generation, deterministic pricing engines, PriceGuard protections, photo intelligence, and plan intelligence.

The product is already broad. The highest-risk areas are not missing core features, but production readiness, persistence, duplicated local logic, and final-output polish.

## Existing Features

- Landing page with app CTA and product positioning.
- Main estimate/change-order builder.
- Email capture for entitlement/free-limit tracking.
- Business settings:
  - Company name
  - Address
  - Phone
  - Email
  - Logo
  - Contractor license
  - Default payment terms
- Job details:
  - Client name
  - Job/project name
  - Job address
  - Change order number
  - Document date
- Document generation:
  - Estimate
  - Change Order
  - Change Order / Estimate
- Trade selection:
  - Auto-detect
  - Painting
  - Drywall
  - Flooring
  - Electrical
  - Plumbing
  - Bathroom tile/general renovation path
  - Carpentry/general renovation path
- Scope entry with smart generation.
- Paint scope controls for walls, walls plus ceilings, and full interior.
- Photo upload and photo metadata:
  - Up to configured photo limit
  - Compression before request
  - Room tag
  - Shot type
  - Notes
  - Measurement reference
- Plan upload:
  - PDF/image support
  - Local PDF page indexing
  - Page selection/deselection
  - Selected-page upload staging
  - Upload-mode visibility
- Optional measurement rows with calculated sqft.
- Editable pricing:
  - Labor
  - Materials
  - Other/mobilization
  - Markup
  - Total
- Tax controls.
- Deposit controls.
- Schedule display and schedule editing.
- Saved estimate history.
- Jobs dashboard.
- Job actuals tracking.
- Contract summary by job.
- Invoice creation and invoice list.
- Invoice status changes.
- Customer approval page with signature capture.
- Server-backed shareable approval links:
  - Frozen approval snapshot creation
  - Cross-device approval page read
  - Server approval submission/signature saving
  - Approval status sync back to the app using owner email plus owner sync token
  - Approval-created draft invoice snapshot sync
  - Hashed public approval tokens and hashed owner sync tokens
  - Minimized customer-safe public approval payloads
  - Duplicate-protected proposal, approval, and approval-created invoice flows
- Estimate PDF generation.
- Invoice PDF generation.
- Advanced analysis panels:
  - Photo intelligence
  - Plan intelligence
  - Estimator section handoff
  - Estimate structure consumption
  - Trade pricing prep
  - Scope review
  - Profit protection
  - Estimate defense mode

## Partially Built Features

- Full jobs, estimates, invoices, budgets, and actuals are still mostly localStorage-backed.
- Server-backed approval links are implemented, but they rely on Supabase approval snapshot tables rather than full server-backed job/estimate/invoice persistence.
- Approval sync is hardened with an owner sync token, but it is not full authentication and does not replace user accounts/workspaces.
- Same-device local approval invoice creation still exists as a fallback path.
- Stripe success entitlement refresh has been fixed to POST the saved email, but there is still no full account/billing page.
- Plan intelligence readback is rich in the app UI, but not fully represented in generated PDFs.
- AI-generated scope prose can still be generic even when typed plan readback is stronger.
- Jobs, estimates, invoices, budgets, and actuals remain local-first outside the server-backed approval snapshot workflow.
- Some advanced analysis panels are more diagnostic than customer-facing.
- README still contains default Next.js content and does not document product setup.
- PDF generation works through browser print windows, not server-side document generation.

## Backend/API Routes

- `POST /api/generate`
  - Main generation endpoint.
  - Validates request body.
  - Enforces same-origin guard.
  - Applies rate limiting.
  - Consumes free generation entitlement through Supabase RPC.
  - Runs plan intelligence.
  - Runs photo intelligence.
  - Calls OpenAI for document generation.
  - Runs deterministic pricing and estimator orchestration.
  - Applies pricing owner/protection logic.
  - Returns pricing, schedule, readbacks, section rows, diagnostics, and guard outputs.

- `POST /api/plan-upload`
  - Begins staged plan upload sessions.
  - Completes staged uploads.
  - Supports legacy multipart upload.
  - Finalizes selected-page staged uploads.
  - Returns structured staging errors.

- `PUT /api/plan-upload`
  - Uploads chunks into an active staged plan upload session.

- `POST /api/checkout`
  - Creates a Stripe checkout session.
  - Uses customer email from the request.
  - Requires Stripe price and site URL environment variables.

- `POST /api/webhook`
  - Validates Stripe webhook signatures.
  - Dedupes events through Supabase.
  - Activates entitlement on `checkout.session.completed`.

- `POST /api/entitlement`
  - Looks up entitlement status by email.
  - Returns active entitlement state, usage count, and free limit.

- `POST /api/approvals`
  - Saves a frozen customer-safe approval proposal snapshot.
  - Creates a long public approval token.
  - Stores only the token hash server-side.
  - Generates an owner sync token, stores only its hash server-side, and returns the raw token to `/app`.
  - Reuses/updates existing proposal records for the same owner email and local estimate when possible.
  - Returns a shareable `/approve/{token}` URL.

- `GET /api/approvals/[token]`
  - Reads a server-backed approval snapshot by token.
  - Returns a minimized customer-safe proposal snapshot and approval status.
  - Does not expose estimate rows, embedded burdens, estimate sections, raw plan intelligence, or invoice-supporting internals.
  - Preserves localStorage fallback in the approval page when no server token is found.

- `POST /api/approvals/[token]/approve`
  - Saves server-backed approval name/signature/timestamp.
  - Updates the server proposal status to approved.
  - Handles already-approved submissions idempotently.
  - Creates one draft approval invoice snapshot from the frozen proposal when missing and prevents duplicates by proposal.

- `GET /api/approvals/status?email=...&ownerSyncToken=...`
  - Requires owner email plus the server-issued owner sync token.
  - Validates against the hashed owner sync token stored in Supabase.
  - Returns owner-scoped approval status and approval-created invoice snapshots for app sync.

## Pricing & Guard Logic

Implemented pricing and guard modules include:

- Painting deterministic engine.
- Drywall deterministic engine.
- Flooring/tile deterministic engine.
- Wallcovering deterministic engine.
- Electrical deterministic engine.
- Plumbing deterministic engine.
- Trade minimum charges.
- Scope splitting by trade.
- Multi-trade detection.
- State labor multiplier.
- Estimate basis normalization.
- Pricing owner decision logic.
- Final pricing protections.
- Permit and mobilization buffers.
- Cross-trade mobilization handling.
- PriceGuard status/confidence.
- PriceGuard applied rules, assumptions, and warnings.
- Plan-aware live trade pricing influence.
- Section rows and embedded burdens.
- Estimate rows normalized from structured sections.
- Missed scope detection.
- Profit leak detection.
- Estimate defense mode.
- Materials list generation.
- Area scope breakdown.
- Profit protection summary.
- Scope X-ray/review insights.

Pricing authority, protections, owner resolution, and totals are already heavily implemented and tested. These should not be rebuilt casually.

## UI Screens/Components

Main screens:

- `/`
  - Marketing homepage.

- `/app`
  - Primary estimating application.

- `/approve/[id]`
  - Client approval/signature page.
  - Reads server-backed approval snapshots by token when available.
  - Falls back to localStorage estimate lookup for same-device approvals.

- `/success`
  - Stripe checkout success page and entitlement refresh.

- `/cancel`
  - Stripe checkout cancellation page.

Main components:

- `EstimateBuilderSection`
  - Main input form for document type, trade, state, scope, photos, plans, measurements, and generate button.

- `JobPhotosSection`
  - Photo upload, preview, metadata, shot type, notes, and measurement reference.

- `PlanUploadsSection`
  - Plan upload, page-selection UI, selected page count, upload path/mode, plan notes.

- `MeasurementsSection`
  - Optional measurement rows and sqft calculation.

- `PricingSummarySection`
  - Editable pricing, profit/margin display, tax, deposit, PDF download.

- `JobsDashboardSection`
  - Job list, active job, contract values, actuals, invoice pipeline actions, approval links.

- `InvoicesSection`
  - Invoice list, statuses, PDF download, delete/clear actions.

- `SavedEstimatesSection`
  - Estimate history, load/delete, invoice workflow actions.

- `PhotoIntelligenceCard`
  - Photo analysis and scope-assist readback.

Large in-page cards in `app/app/page.tsx`:

- Estimate status card.
- Schedule block/editor.
- Review insights card.
- Materials list card.
- Area scope breakdown card.
- Profit protection card.
- Scope X-ray card.
- Tier A intelligence card.
- Estimate sections card.
- Advanced analysis section.
- Plan intelligence card.
- Estimator plan and pricing story card.

## LocalStorage/Data Persistence

The app currently persists most product data in browser localStorage:

- `jobestimatepro_email`
- `jobestimatepro_company`
- `jobestimatepro_job`
- `jobestimatepro_invoices`
- `jobestimatepro_history_v1`
- `jobestimatepro_budgets_v1`
- `jobestimatepro_actuals_v1`
- `jobestimatepro_crews_v1`
- `jobestimatepro_jobs_v1`

There is also migration support from older `scopeguard_*` keys for email/company data.

Current persistence is useful for a single user on one device, but it limits:

- Cross-device access.
- Team workflows.
- Recovery after browser storage loss.
- Server-side invoice/payment workflows.

Server-backed approvals are an exception to the local-first model. Approval links created through the current workflow save frozen proposal snapshots, approval rows, and approval-created draft invoice snapshots in Supabase, then sync approved status and invoice snapshots back into localStorage.

Approval status sync stores the owner sync token in localStorage key `jobestimatepro_owner_sync_token`. Supabase stores only the token hash. This hardens the previous email-only sync model, but it is not full authentication.

## PDF/Invoice Features

Estimate PDF:

- Browser print-window HTML PDF.
- Company branding and logo.
- Contractor license.
- Client/job metadata.
- Change-order classification.
- Scope/description.
- Schedule.
- Estimate rows.
- Embedded burden reference.
- Pricing summary.
- Tax.
- Deposit due and remaining balance.
- PriceGuard/edited badge.
- Contractor and customer approval sections.
- Approved customer signature display when available.

Invoice PDF:

- Browser print-window HTML PDF.
- Company/client/job metadata.
- Invoice number.
- Issue/due date.
- Line items.
- Total due.
- Deposit/balance context.
- Estimate row reference.
- Embedded burden reference.
- Approval signature lines.

Invoice workflow:

- Create full invoice.
- Create deposit invoice.
- Create balance invoice.
- Invoice status tracking:
  - Draft
  - Sent
  - Paid
  - Overdue
- Invoice PDF download.
- Invoice deletion/clear actions.

## Plan Intelligence Status

Implemented:

- Client-side plan intake.
- Allowed MIME validation.
- Local PDF source page count detection.
- Page-selection list creation.
- Page deselection before generate.
- Selected-page export in browser.
- Selected-page size estimation.
- Chunked staged upload path.
- Server-side selected-page derivation fallback.
- Original-PDF fallback messaging.
- Staged upload manifest handling.
- PDF splitting by page.
- PDF rendering via Swift script.
- Browser-derived selected-page PDFs render derived pages `1..N` for image/vision fallback while preserving original source page numbers through provenance mapping.
- Sheet index creation.
- Sheet discipline/title/number heuristics.
- Per-sheet analysis.
- Vision fallback for weak image pages.
- Cross-sheet merge.
- Plan takeoff structure.
- Sheet narration.
- Room/area quantity readback.
- Trade-by-trade readback.
- Grouped scope/bid-division readback.
- Scope-gap and confirmation prompts.
- Estimator packages.
- Estimator section skeleton handoff.
- Estimate structure consumption.
- Structured trade assemblies.
- Pricing-carry readback.
- Final estimator plan and pricing story in app UI.
- Page/source provenance through readback.

Known weaknesses:

- Hard quantity extraction is still mostly heuristic.
- Schedule table extraction is limited.
- Finish schedule parsing is limited.
- Room matrix/repeated-room count extraction is limited.
- PDF render failure can degrade analysis to indexed/text/filename-level support.
- Rich plan story is not yet fully included in PDFs.
- AI-generated prose may still be less specific than typed readback.

## Stripe/Payment Status

Implemented:

- Stripe checkout session creation.
- Stripe webhook verification.
- Webhook event dedupe.
- Supabase entitlement activation.
- Entitlement lookup by email.
- Free limit of 3 generations.
- Usage consumption through Supabase RPC.
- Success page entitlement refresh using saved email.
- Checkout cancellation page.

Known gaps:

- No billing portal.
- No account page.
- No subscription management UI.
- Entitlement is email-based, not user-auth based.
- No robust webhook-delay recovery UI beyond entitlement refresh.
- Success/cancel pages still use some old ScopeGuard copy.

## Technical Debt / Broken Areas

- `app/app/page.tsx` is very large and mixes UI, business logic, PDF generation, persistence, and API orchestration.
- Many components and routes use `any`, causing repo-wide lint failures.
- Full server-backed jobs/estimates/invoices are not implemented yet; only the approval snapshot/status/invoice sync workflow is server-backed.
- Invoice creation logic is duplicated between `/app` and `/approve/[id]`.
- PDF HTML generation is large, duplicated, and brittle.
- LocalStorage writes are scattered across app and components.
- Advanced analysis UI is powerful but dense.
- Plan intelligence is present in UI but not fully represented in PDFs.
- Debug `console.log` statements remain in production route code.
- Several helper functions are unused or partially wired.
- README does not describe the actual app, environment variables, Supabase requirements, Stripe setup, or plan-rendering scripts.
- Some branding still says ScopeGuard while the app is called JobEstimate Pro.

## Recommended Next Features

- Server-backed saved estimates, jobs, and full invoice management.
- Hardening/polish for the implemented shareable approval links.
- Estimate PDFs that include estimator story, plan readback, pricing carry, and confirmation gaps.
- Stripe/account status page with entitlement refresh and billing guidance.
- Better plan quantity extraction for schedules, finish tables, room counts, SF/LF, fixture/device counts.
- Shared invoice creation helper used by app and approval page.
- Centralized persistence layer for localStorage now and server persistence later.
- Production logging cleanup.
- Actual product README/setup guide.
- UI simplification for advanced analysis into customer-facing and estimator-facing modes.

## Features We Should Not Rebuild

These already exist and should be extended or hardened rather than rebuilt:

- Main estimate generation endpoint.
- Free-limit and entitlement usage flow.
- Stripe checkout and webhook basics.
- Editable pricing summary.
- Tax and deposit calculation.
- Estimate PDF generation.
- Invoice PDF generation.
- Saved estimate history.
- Jobs dashboard foundation.
- Invoice creation and invoice status management.
- Customer approval/signature page.
- Server-backed approval snapshot and approval-status sync flow.
- Photo upload and photo intelligence.
- Plan upload, page selection, staging, selected-page transport.
- Plan intelligence readbacks.
- Pricing-carry readback.
- Deterministic pricing engines.
- PriceGuard protections.
- Pricing owner logic.
- Structured estimate rows and embedded burdens.
- Estimator section skeleton/handoff pipeline.

## Top 5 Safest Next Upgrades

1. Add the estimator plan/pricing story to estimate PDF output.
2. Extract invoice creation into one shared helper used by `/app` and `/approve/[id]`.
3. Remove or gate production debug logging in `/api/generate`.
4. Clean up Stripe success/cancel copy to consistently say JobEstimate Pro.
5. Create a real README with environment variables, Supabase schema expectations, Stripe setup, and plan-rendering script notes.
