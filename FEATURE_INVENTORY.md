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

`PRODUCT_AUDIT_BACKLOG.md` is the master improvement tracker for product intelligence, estimator accuracy, trust, and launch-readiness work identified by the full product audit.

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
- AI-generated customer-facing scope descriptions with useful step-by-step task sequencing, materials language, and work-description detail. This detailed estimator prose is a core product strength to preserve; safety guards should review unsupported expansion rather than automatically flattening, shortening, removing, or rewriting `result.text`.
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
  - Range-based PDF page selection with From / To / Select range controls
  - Large-plan selected-page readiness guidance with warnings for all-pages-selected, no-page selections, many selected pages, high selected upload size, and suggested sheet types
  - Selected-page upload staging
  - Original-fallback selected-page scalability: `selectedSourcePages` limits fallback rasterization/indexing/classification to selected original pages while preserving source page provenance
  - Upload-mode visibility
  - Estimator-only per-page read status for selected/read/degraded/weak-classification visibility
  - Estimator-only structured sheet classification diagnostics for floor plan, finish schedule, fixture schedule, door schedule, window schedule, RCP, elevation, demo plan, legend, and unknown sheets
- Plan Review Summary groups estimator diagnostics into Pages read, Extracted plan data, and Review-only quantity signals, with review-only quantity candidates/gates labeled as not measured takeoff support or pricing inputs
- Plan Review Summary now includes a compact Pages Needing Review drilldown to explain weak/review-only plan evidence from selected pages without changing pricing, plan extraction behavior, upload/staging architecture, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- Plan Review Summary suppresses long all-caps sheet/index/OCR strings from the main visible summary and falls back to contractor-friendly confirmation copy while preserving source provenance in Plan-to-price details and Estimator Diagnostics.
- Plan Review Summary includes “Plan-to-price details” for nested plan-to-price support, while the top-level broad diagnostics section remains “Estimator Diagnostics.”
- Plan-aware pre-generate scope warning keeps the original missing-scope warning when no plans are uploaded, and switches to confirmation-focused copy when plans are uploaded
- Optional measurement rows with calculated sqft.
- Editable pricing:
  - Labor
  - Materials
  - Other/mobilization
  - Markup
  - Total
- Deterministic PriceGuard Review / Estimate Intelligence panel:
  - UI-side review from existing estimate state
  - Filters warnings against generated customer-facing estimate text to reduce over-warning when the generated scope already resolves original-scope concerns
  - Score/level
  - Missed-scope warnings
  - Labor/material confidence notes
  - Scope clarity warnings
  - Suggested exclusions
  - Customer-ready price defense notes
  - Contractor-only risk notes
  - Pre-generation fallback state
- Customer Output Readiness provides an estimator-only review checkpoint before PDF/download/customer-output actions, summarizing unsupported trade wording, weak/review-only plan evidence, scope clarity, assumptions/exclusions, estimator risk notes, and send-readiness concerns without changing customer output or pricing.
  - Details are deduped across readiness items, capped at 2 per item, and the panel remains capped at 6 items so it stays a compact pre-send checklist rather than duplicating full PriceGuard Review, Plan Review Summary, or Estimator Diagnostics.
- Generated estimate result hierarchy now prioritizes the primary send workflow: Customer-Facing Scope, Customer Output Readiness, Pricing/PDF, and Schedule. Unsupported trade drift warnings remain visible above Customer-Facing Scope when present. Full PriceGuard Review, Plan Review Summary, and Line Item Detail remain available in collapsed `Estimator review details`, while AdvancedAnalysisSection remains separately collapsed as `Estimator Diagnostics`.
- Tax controls.
- Deposit controls.
- Schedule display and schedule editing.
- Saved estimate history with empty-state workflow guidance and selected-job context when filtered history is empty.
- Jobs dashboard.
- Job actuals tracking.
- Contract summary by job.
- Invoice creation and invoice list with empty-state workflow guidance and selected-job context when filtered invoices are empty.
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
  - PriceGuard Review / Estimate Intelligence
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
- Subscription billing foundation is implemented, including subscription checkout, subscription-aware entitlement response, Account & Access status, success/cancel copy, and focused entitlement tests. Preview/Test Mode subscription checkout/webhook entitlement QA has passed; final Production Live Mode verification remains pending before public paid launch.
- There is still no billing portal or full auth-backed account/workspace system.
- Plan intelligence readback is rich in the app UI and represented in generated estimate PDFs through a customer-safe Estimator Plan Review and compact plan evidence summary.
- AI-generated scope prose can still be generic or occasionally over-expanded even when typed plan readback is stronger. The product direction is to preserve useful AI-generated sequencing/material/task detail while adding warning-only review for unsupported expansion.
- Jobs, estimates, invoices, budgets, and actuals remain local-first outside the server-backed approval snapshot workflow.
- Some advanced analysis panels are more diagnostic than customer-facing.
- README documents the product, local development, environment variables, API routes, Stripe webhook notes, Supabase expectations, approval links, plan upload/rendering notes, localStorage keys, limitations, and development guidance.
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
  - Uses the monthly Pro subscription price through `STRIPE_PRO_MONTHLY_PRICE_ID`.
  - Uses Stripe Checkout subscription mode.
  - Requires Stripe price and site URL environment variables.

- `POST /api/webhook`
  - Validates Stripe webhook signatures.
  - Dedupes events through Supabase.
  - Handles subscription lifecycle events for checkout completion, subscription created/updated/deleted, invoice paid, and invoice payment failed.
  - Writes subscription status/period fields without resetting usage count.

- `POST /api/entitlement`
  - Looks up entitlement status by email.
  - Returns active entitlement state, usage count, free limit, subscription-aware plan/status fields, and current-period information when available.

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
- PriceGuard Review warning filtering against generated customer-facing estimate text to reduce false positives for resolved prep, material, cleanup, protection, exclusion, approval, and work-process concerns.
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
- UI-side deterministic PriceGuard Review / Estimate Intelligence panel with generated-text warning filtering.

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
  - Invoice list, statuses, PDF download, delete/clear actions, and empty-state workflow guidance.

- `SavedEstimatesSection`
  - Estimate history, load/delete, invoice workflow actions, and empty-state workflow guidance.

- `PhotoIntelligenceCard`
  - Photo analysis and scope-assist readback.

Large in-page cards in `app/app/page.tsx`:

- Estimate status card.
- Customer-Facing Scope.
- Customer Output Readiness.
- Pricing summary / PDF actions.
- Schedule block/editor.
- Estimator review details, containing PriceGuard Review, Plan Review Summary, and line-item detail.
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

A thin local persistence helper now centralizes typed JobEstimate Pro key groups, safe string get/set/remove helpers, JSON read/write helpers, and legacy email/company migration support for safe page-level storage paths.

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
- Customer-safe Estimator Plan Review when uploaded plans are present.
- Compact plan evidence summary:
  - Plan evidence strength.
  - Selected pages reviewed.
  - Text extraction status.
  - Rendered image status.
  - Hard quantity status.
  - Confirmation-needed status.
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
- Range-based PDF page selection with deterministic validation and From / To / Select range controls.
- Selected-page count and estimated selected upload size visibility.
- Large-PDF warning when all pages are selected.
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
- Evidence-strength readback with Strong, Useful, and Review-only labels.
  - Includes selected/indexed/skipped page counts.
  - Includes text extraction status.
  - Includes rendered image availability.
  - Includes hard quantity support status.
  - Includes confirmation-needed status.
- Estimator packages.
- Estimator section skeleton handoff.
- Estimate structure consumption.
- Structured trade assemblies.
- Pricing-carry readback.
- Final estimator plan and pricing story in app UI.
- Page/source provenance through readback.
- Per-page Plan Intelligence read status diagnostics:
  - Selected/skipped and indexed/read visibility.
  - Text extracted/empty status.
  - Image rendered/failed/not-rendered status.
  - Sheet classification classified/weak/unknown visibility.
  - Placeholder PDF rasterization and original-PDF fallback limitation warnings.
  - Estimator Plan Review Summary counts for selected pages read, pages needing review, and weak/unknown sheet classification.
  - Compact Pages Needing Review drilldown for selected pages with failed rendering, missing text/image support, warnings, failure reasons, or weak/unknown classification.
- Structured estimator-only sheet classification diagnostics:
  - Deterministic roles for floor plan, finish schedule, fixture schedule, door schedule, window schedule, RCP, elevation, demo plan, legend, and unknown sheets.
  - Optional classification object on sheet index entries while preserving existing sheet number, sheet title, discipline, and confidence fields.
  - Diagnostic-only behavior that does not drive pricing or quantity decisions.
- Table/schedule extraction diagnostics:
  - Deterministic estimator-only extraction from selected/read plan pages.
  - Supported table types include finish schedules, fixture schedules, door schedules, window schedules, legends, and unknown/generic schedules.
  - Preserves raw row text, detected columns/rows where clear, confidence, and warnings for unclear tables.
  - Estimator-facing Plan Review Summary counts for tables detected, schedule rows found, and low-confidence tables needing review.
  - Diagnostic-only behavior that does not drive pricing or quantity decisions.
- Room/finish matrix diagnostics:
  - Deterministic estimator-only extraction from extracted finish schedule tables only.
  - Captures room name/number, room type, wall/base/ceiling/floor finishes, notes, raw row text, confidence, and warnings.
  - Estimator-facing Plan Review Summary counts for room finish rows found and low-confidence finish rows needing review.
  - Diagnostic-only behavior that does not drive pricing or quantity decisions.
- Repeated room package diagnostics:
  - Deterministic estimator-only extraction from room/finish matrix diagnostics only.
  - Detects repeated guest rooms, bathrooms, corridors/units/rooms by room family plus finish signature, plus repeated finish combinations across generic room rows.
  - Preserves source matrix/table/page/sheet row provenance, confidence, and warnings.
  - Estimator-facing Plan Review Summary counts for repeated room packages found, rooms represented in packages, and low-confidence packages needing review.
  - Diagnostic-only behavior; repeat counts are not measured quantity support and do not drive pricing or quantity decisions.
- Trade-specific quantity candidate diagnostics:
  - Deterministic estimator-only candidate generation from `roomFinishMatrices`, `extractedTables`, and `repeatedRoomPackages`.
  - Supported candidate types include painting finish rows, painted room finish candidates, wallcovering finish rows, wall finish candidates, flooring finish rows, floor finish candidates, baseboard/base finish candidates, ceiling finish candidates, door schedule count candidates, window schedule count candidates, fixture schedule count candidates, and repeated room package count candidates.
  - Preserves source provenance, confidence, assumptions, and warnings.
  - Estimator-facing Plan Review Summary counts for trade quantity candidates found, candidates needing measurement, and pricing-eligible candidates.
  - Diagnostic-only behavior; candidates are not pricing-eligible and are not measured takeoff support.
- Trade quantity candidate gate diagnostics:
  - Deterministic estimator-only review of `tradeQuantityCandidates` only.
  - Classifies each candidate as `blocked`, `review_only`, or `future_candidate`.
  - Keeps `pricingEligibleNow` false for every gate; `future_candidate` is diagnostic future-readiness only.
  - Preserves required evidence, present evidence, blockers, warnings, and source provenance.
  - Estimator-facing Plan Review Summary counts for candidate gates reviewed, future candidates after review, blocked/review-only candidates, and pricing-eligible now.
  - Diagnostic-only behavior that does not drive pricing or quantity decisions.

Known weaknesses:

- Hard quantity extraction is still mostly heuristic.
- Evidence-strength readback is readiness/customer-facing evidence messaging, not true full takeoff measurement.
- Schedule, finish table, room/finish matrix, repeated room package, trade quantity candidate, and candidate gate diagnostics are diagnostic-only and still conservative.
- Actual pricing handoff activation, SF/LF, and measured fixture/device counts remain limited.
- PDF render failure can degrade analysis to indexed/text/filename-level support.
- Estimate PDFs include a compact customer-safe plan evidence/readiness summary, but this is not a full measured takeoff.
- AI-generated prose may still be less specific than typed readback.

## Stripe/Payment Status

Implemented:

- Stripe subscription checkout session creation.
- Monthly Pro price environment wiring through `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Stripe webhook verification.
- Webhook event dedupe.
- Supabase entitlement activation and subscription status/period updates.
- Subscription-aware entitlement lookup by email.
- Free limit of 3 generations.
- Usage consumption through Supabase RPC.
- Success page entitlement refresh using saved email.
- Checkout cancellation page.
- Account & Access panel in `/app` with email, plan, subscription status, current-period information, free usage, and manual entitlement refresh.
- Focused entitlement tests for active, trialing, past-due, canceled, unpaid/incomplete, and legacy access rules.
- Preview/Test Mode subscription checkout/webhook entitlement flow passed in Vercel Preview with Stripe sandbox checkout, webhook resend `200 OK`, and `/app` Pro access active.

Known gaps:

- No billing portal.
- No full auth-backed account/workspace system.
- No subscription management portal UI.
- Entitlement is email-based, not user-auth based.
- No robust webhook-delay recovery UI beyond entitlement refresh.
- Success/cancel pages use current JobEstimate Pro payment flow copy.
- Final Production Live Mode subscription payment/webhook entitlement verification is still pending before public paid launch.

## Technical Debt / Broken Areas

- `app/app/page.tsx` is very large and mixes UI, business logic, PDF generation, persistence, and API orchestration.
- Many components and routes use `any`, causing repo-wide lint failures. A safe lint triage pass reduced the count from 218 to 215 and confirmed `npx tsc --noEmit` passes, but broad lint cleanup remains deferred.
- Full server-backed jobs/estimates/invoices are not implemented yet; only the approval snapshot/status/invoice sync workflow is server-backed.
- Shared invoice creation logic is centralized through `buildInvoiceFromEstimate()` and used by `/app`, same-device approval fallback, and server approval invoice creation.
- PDF HTML generation is large, duplicated, and brittle because output still depends on browser print windows.
- LocalStorage writes are partially centralized through `app/app/lib/local-persistence.ts` for safe page-level paths; some component and fallback-route persistence remains localStorage-first.
- Advanced analysis UI is powerful but dense.
- Plan intelligence is represented in PDFs through customer-safe plan review and compact evidence/readiness summary. Estimate/invoice PDF visual hierarchy polish is complete for the current browser print-window launch pass; server-side PDFs remain future work unless browser output becomes a blocker.
- Recently inspected generate-route and app debug/customer-detail logs are development-gated; a full repo-wide log audit is not guaranteed complete.
- Several helper functions are unused or partially wired.
- README describes the actual app, environment variables, Supabase requirements, Stripe setup, approval links, and plan upload/rendering behavior.
- Legacy `scopeguard_*` localStorage migration support remains intentionally, but current product-facing copy should use JobEstimate Pro.

## Recommended Next Features

- Warning-only AI Scope Protection / Unsupported Scope Review Guard for customer-facing scope drift. Preserve useful AI-generated detailed scope descriptions and detect unsupported expansion without rewriting `result.text`.
- Final Production Live Mode subscription payment, webhook delivery, and entitlement activation verification using `SUBSCRIPTION_TEST_CHECKLIST.md` as the final pre-launch gate before public paid launch.
- Further PriceGuard Review copy/heuristic polish only if QA finds new false positives; the current generated-text warning filtering pass is complete.
- Focused non-billing QA for Saved Estimates and Invoices empty states, selected-job context, mobile layout, and existing actions.
- Plan upload guidance and fallback-message QA for selected pages, weak evidence, and degraded PDF/rendering cases.
- Small customer-facing estimate confidence and contractor workflow copy polish where manual QA finds confusion.
- Narrow targeted lint cleanup only where it reduces a concrete launch/runtime risk.
- Better plan quantity extraction for schedules, finish tables, room counts, SF/LF, and fixture/device counts after current launch-critical QA.
- Broader server-backed persistence layer for saved estimates, jobs, invoices, budgets, and actuals after launch-critical local-first workflows and billing verification are stable.

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
- Saved estimate empty states/workflow guidance.
- Jobs dashboard foundation.
- Invoice creation and invoice status management.
- Invoice empty states/workflow guidance.
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

1. Add warning-only AI Scope Protection / Unsupported Scope Review Guard after the current readiness warnings remain stable.
2. Complete final Production Live Mode payment, webhook delivery, and entitlement activation verification using `SUBSCRIPTION_TEST_CHECKLIST.md` as the final pre-launch gate before public paid launch.
3. Run real-PDF QA, mobile usability checks, and estimator UI clarity review for Plan Intelligence diagnostics.
4. Run focused QA for Saved Estimates and Invoices empty states, selected-job filtering context, mobile layout, and existing actions.
5. Keep further PriceGuard Review improvements narrow and deterministic if new QA finds over-warning or unclear copy.
