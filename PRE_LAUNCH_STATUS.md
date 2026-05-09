# JobEstimate Pro Pre-Launch Status

This document captures the current pre-launch state of JobEstimate Pro as of the latest approval, Plan Intelligence, PDF, PriceGuard Review, workflow-clarity, logging, and documentation passes.

## Current App Status

- DONE: JobEstimate Pro is a broad local-first contractor estimating app with estimate/change-order generation, editable pricing, plan/photo intelligence, PDFs, approvals, invoices, jobs, and local history.
- DONE: Core generation still runs through `POST /api/generate` with OpenAI output, deterministic pricing engines, estimator orchestration, PriceGuard protections, and entitlement/free-limit checks.
- DONE: Pricing authority, pricing protections, pricing owner logic, and totals are established and should not be rebuilt casually.
- DONE: First-version deterministic PriceGuard Review / Estimate Intelligence panel is implemented in `/app` using UI-side helper logic. It reviews existing estimate state for score/level, missed-scope warnings, labor/material confidence notes, scope clarity warnings, suggested exclusions, customer-ready price defense notes, contractor-only risk notes, and a pre-generation fallback state.
- PARTIAL: Launch-channel strategy is PWA/web app first. Apple App Store/native iOS distribution is undecided and deferred until after real user, pricing, support, and cost-model validation.
- PARTIAL: The contractor workspace is still mostly localStorage-backed. Estimates, jobs, invoices, budgets, actuals, company settings, and email live primarily in browser storage.
- PARTIAL: Server persistence exists for approval snapshots, approval status, approval signatures, owner sync tokens, and approval-created invoice snapshots only.
- DONE: The estimate result now opens with a cleaner customer-facing summary while preserving estimator diagnostics in clearly separated advanced sections.

## Launch Channel Strategy

- CURRENT PATH: Launch as a PWA/web app first.
- DEFERRED: Apple App Store launch, native iOS app work, and iOS wrapper work should wait until after product validation.
- DO NOT BUILD YET: Native iOS/App Store features, App Store packaging, Apple in-app purchase flows, app review workarounds, or platform-specific wrapper behavior.
- FOCUS FIRST: Finish web/PWA core workflows, subscription readiness for the web app, mobile web usability, production Supabase/Stripe readiness, approval/invoice/PDF stability, and production safety.
- REVISIT LATER: Consider App Store distribution only after real user validation, pricing validation, support burden validation, OpenAI/plan-rendering/storage cost validation, and a clearer mobile acquisition strategy.

## Completed Major Upgrades

- DONE: Server-backed approval snapshots.
- DONE: Cross-device approval page reads.
- DONE: Server-backed approval submission and signature saving.
- DONE: Approval status sync back to `/app`.
- DONE: Approval-created draft invoice snapshot creation and sync.
- DONE: Approval security hardening with long random approval tokens, hashed approval tokens, owner sync tokens, and hashed owner sync tokens.
- DONE: Public approval GET response is minimized and customer-safe.
- DONE: Approval proposal reuse and duplicate prevention.
- DONE: Idempotent approval submission behavior.
- DONE: Duplicate approval invoice prevention.
- DONE: Approval workflow regression tests.
- DONE: Account/access status panel in `/app` shows saved email, access state, free usage, remaining free generations, and manual entitlement refresh.
- DONE: Shared invoice helper, `buildInvoiceFromEstimate()`, is used by `/app`, same-device approval fallback, and server approval invoice creation.
- DONE: Focused invoice helper regression tests cover full, deposit, balance, tax, missing-deposit guard, and invoice snapshot preservation behavior.
- DONE: `SUPABASE_PRODUCTION_CHECKLIST.md` documents production Supabase setup requirements, verification queries, constraints, and smoke tests.
- DONE: Mobile core workflow polish pass applied style-only responsive improvements in `app/app/page.tsx`, `PlanUploadsSection`, `SavedEstimatesSection`, `JobsDashboardSection`, `InvoicesSection`, and `PricingSummarySection`.
- DONE: Estimate/invoice PDF visual hierarchy polish improved estimate document header hierarchy, customer/job metadata panels, stronger section labels, pricing card, invoice total-due block, invoice bill-to/date panels, invoice summary card, and page-break avoidance.
- DONE: Advanced analysis customer-facing mode now opens estimate results with a clean document summary card, Customer-Facing Scope, Estimate Review Notes, Estimator Diagnostics, collapsed Line Item Detail, and nested plan-to-price diagnostics.
- DONE: First-version deterministic PriceGuard Review / Estimate Intelligence panel is implemented through `app/app/lib/priceguard-review.ts`, `app/app/components/PriceGuardReviewPanel.tsx`, and `/app` result workflow integration. It is UI-side only and does not change pricing math, estimate generation, Plan Intelligence, PDFs, approvals, invoices, billing, API routes, localStorage keys, or saved estimate data shapes.
- DONE: PriceGuard Review QA false-positive reduction pass is complete. The deterministic helper now filters scope-quality warnings against the combined original scope and generated customer-facing estimate text, reducing over-warning when the generated estimate already includes prep, materials, cleanup, protection, exclusions, approval, or work process language.
- DONE: Saved Estimates and Invoices now show launch-safe empty states and workflow guidance instead of disappearing when the active filter has no records. The guidance preserves existing actions when records exist and adds selected-job context when applicable.
- DONE: Plan selected-page upload, staging, and fallback messaging.
- DONE: UI-only large-plan selected-page range controls.
- DONE: Browser-derived selected-page PDF rasterization renders derived pages `1..N` while preserving original source page provenance.
- DONE: Plan evidence strength readback with `Strong`, `Useful`, and `Review-only`.
- DONE: Estimate PDF includes customer-safe Estimator Plan Review and compact plan evidence summary.
- DONE: Production debug/customer-detail logging is gated in the generate path and client app debug paths inspected in the latest pass.
- DONE: Product README, feature inventory, roadmap, subscription architecture, and server-backed approval plan documents exist.
- DONE: `PRE_LAUNCH_SMOKE_TEST.md` exists and documents the current PWA/web production-readiness smoke test path.
- DONE: Full production-readiness smoke test passed for the current PWA/web launch path, including free generation, account/access refresh, plan upload/selected-page generation, estimate PDF, invoice creation/PDF, Stripe checkout/success entitlement refresh, approval link creation, cross-browser/device approval, approval sync, and approval-created invoice import.
- DONE: Manual production Supabase verification queries passed for the launch-critical entitlement, free-generation, Stripe webhook dedupe, approval, owner sync token, and approval-created invoice paths.

## Approval Workflow Status

- DONE: `POST /api/approvals` creates or reuses a frozen approval proposal snapshot and returns a shareable `/approve/{token}` URL.
- DONE: Approval links use long random public tokens and store only token hashes server-side.
- DONE: Owner sync tokens are returned to the app, stored locally under `jobestimatepro_owner_sync_token`, and stored server-side only as hashes.
- DONE: `GET /api/approvals/[token]` reads server-backed approval snapshots and returns only the minimized customer-safe payload needed by the public approval page.
- DONE: `/approve/[id]` preserves localStorage fallback for same-device/local-only approvals.
- DONE: `POST /api/approvals/[token]/approve` saves approval name, timestamp, signature, proposal status, and a draft approval invoice snapshot.
- DONE: Already-approved submissions return approved status idempotently.
- DONE: Duplicate proposal, approval row, and approval invoice flows are protected by code and expected DB uniqueness constraints.
- DONE: `GET /api/approvals/status?email=...&ownerSyncToken=...` syncs owner-scoped approval status and approval-created invoices back to `/app`.
- DONE: Approval regression tests cover proposal reuse, minimized public GET payload, idempotent already-approved submission, duplicate approval invoice handling, and missing owner sync token rejection.
- PARTIAL: This is not full authentication. Owner email plus owner sync token is a hardening step, not user accounts or workspaces.
- PARTIAL: Full server-backed jobs, estimates, and invoices are not implemented.
- DEFERRED: Approval link expiration/revocation UI, audit trail expansion, and signature storage outside JSON/data URLs can wait.

## Plan Intelligence Status

- DONE: Plan upload supports PDF/images, local PDF page count detection, page selection/deselection, selected-page upload staging, and chunked upload.
- DONE: Browser-side selected-page PDF export is used when possible.
- DONE: Server-side selected-page extraction fallback and original-PDF fallback are present.
- DONE: Large-plan selected-page range controls are complete as a UI/helper-only pass. PDF uploads now have From / To / Select range controls while preserving existing Clear and Select all controls, selected-page staging, and current analysis behavior.
- DONE: The range-control pass improves large PDF usability without changing upload/staging architecture, Generate payloads, pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Range-control verification passed focused `plan-upload.test.ts`, `npx tsc --noEmit`, and `git diff --check`.
- DONE: Browser-derived selected-page PDFs now render derived pages `1..N` for image/vision fallback while preserving original source page numbers in provenance.
- DONE: Plan Intelligence includes PDF splitting, page rendering, sheet indexing, sheet classification heuristics, per-sheet analysis, vision fallback, cross-sheet merge, and typed readbacks.
- DONE: Plan readbacks include sheet narration, room/area quantity readback, trade-by-trade readback, grouped scope readback, scope-gap prompts, estimator packages, section skeleton handoff, trade assemblies, pricing-carry readback, and final estimator story surfaces.
- DONE: Evidence strength reports `Strong`, `Useful`, or `Review-only`, including selected/indexed/skipped pages, text extraction status, rendered image status, hard quantity status, and confirmation-needed status.
- DONE: Plan Intelligence Phase 1 per-page read status is complete as estimator-only diagnostic data. It reports selected/skipped, indexed/read, text extracted/empty, image rendered/failed/not rendered, sheet classification classified/weak/unknown, placeholder PDF rasterization, and original-PDF fallback limitations.
- DONE: The per-page read status pass is diagnostic only. It does not affect pricing, estimate generation behavior, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Phase 1 verification passed targeted plan orchestrator tests and `npx tsc --noEmit`. `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 2 sheet classification diagnostics are complete as estimator-only, diagnostic-only data. Structured deterministic classifications now cover floor plans, finish schedules, fixture schedules, door schedules, window schedules, reflected ceiling plans/RCPs, elevations, demo plans, legends, and unknown sheets.
- DONE: The Phase 2 classification pass preserves existing sheet index fields and legacy discipline behavior for downstream analysis/pricing paths. It does not affect pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Phase 2 verification passed fast sheet-heuristics tests, targeted plan orchestrator tests, and `npx tsc --noEmit`. `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 3 table/schedule extraction diagnostics are complete as estimator-only, diagnostic-only data. The deterministic pass extracts conservative table/schedule diagnostics from selected/read plan pages for finish schedules, fixture schedules, door schedules, window schedules, legends, and unknown/generic schedules.
- DONE: The Phase 3 table extraction pass preserves raw row text, detected columns/rows where clear, confidence, and warnings for unclear/unknown tables. It does not affect pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Phase 3 verification passed focused table extraction tests, targeted plan orchestrator tests, and `npx tsc --noEmit`. `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 4 room/finish matrix diagnostics are complete as estimator-only, diagnostic-only data. The deterministic pass builds from extracted finish schedule tables only and detects conservative room finish rows with room name/number, room type, wall/base/ceiling/floor finishes, notes, raw row text, confidence, and warnings.
- DONE: The Phase 4 room/finish matrix pass does not affect pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Phase 4 verification passed fast plan tests, targeted orchestrator tests, and `npx tsc --noEmit`. `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 5 repeated room package diagnostics are complete as estimator-only, diagnostic-only data. The deterministic pass builds from `roomFinishMatrices` only and detects repeated guest rooms, bathrooms, corridors/units/rooms by room family plus finish signature.
- DONE: The Phase 5 pass also detects repeated finish combinations across generic room rows, preserves source matrix/table/page/sheet row provenance, confidence, and warnings, and treats repeat counts as diagnostic only rather than measured quantity support.
- DONE: The Phase 5 repeated room package pass does not affect pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Phase 5 verification passed focused repeated-room package tests, targeted orchestrator tests, and `npx tsc --noEmit`. `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 6 trade-specific quantity candidate diagnostics are complete as estimator-only, diagnostic-only data. The deterministic pass builds from `roomFinishMatrices`, `extractedTables`, and `repeatedRoomPackages`.
- DONE: Phase 6 candidate categories include painting finish rows/painted room finish candidates, wallcovering finish rows/wall finish candidates, flooring finish rows/floor finish candidates, baseboard/base finish candidates, ceiling finish candidates, door schedule count candidates, window schedule count candidates, fixture schedule count candidates, and repeated room package count candidates.
- DONE: Every Phase 6 candidate has `eligibleForPricing: false`, preserves source provenance, confidence, assumptions, and warnings, and is review-only rather than measured takeoff support.
- DONE: The Phase 6 trade quantity candidate pass does not affect pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: Phase 6 verification passed targeted plan tests 28/28 and `npx tsc --noEmit`. `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 7 confidence/provenance gate diagnostics are complete as estimator-only, diagnostic-only data. The deterministic pass reviews `tradeQuantityCandidates` only.
- DONE: Every Phase 7 gate keeps `pricingEligibleNow: false`; `future_candidate` is only a diagnostic future-readiness label, not current pricing eligibility.
- DONE: Schedule count candidates can be marked `future_candidate` only with clear count/source evidence. Finish-row and repeated-room candidates remain `review_only` or `blocked`; weak, no-source, unclear, or unsupported candidates are blocked or review-only.
- DONE: The Phase 7 confidence/provenance gate pass does not affect pricing, estimate generation behavior, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes.
- DONE: `liveTradePricingInfluence.ts` was not modified, and tests confirmed live trade pricing influence behavior is unchanged. Phase 7 verification passed targeted plan tests 34/34 and `npx tsc --noEmit`; `npm run lint` still fails due to known broad lint debt.
- PARTIAL: Hard quantity extraction is still heuristic, not a full measured takeoff.
- PARTIAL: Actual pricing handoff activation, SF/LF, fixture/device count extraction, and measured schedule quantities can still be improved.
- PARTIAL: Difficult PDFs or incomplete selected sheets can degrade to indexed/text/filename-level support.
- DEFERRED: Major measured-takeoff upgrades should wait until the current launch-critical stability and billing work is settled.

## Invoice Workflow Status

- DONE: App supports invoice creation, deposit invoices, balance invoices, invoice list, status updates, invoice deletion/clear actions, and browser-generated invoice PDFs.
- DONE: `buildInvoiceFromEstimate()` centralizes invoice construction for app-created invoices and approval-created invoice snapshots.
- DONE: `buildInvoiceFromEstimate()` has focused regression tests for full invoices, percent/fixed deposit invoices, balance invoices, missing-deposit guard behavior, sales tax calculation, and estimate row/section/burden snapshot preservation.
- DONE: Server-backed approvals create one draft invoice snapshot after approval and sync it back to local invoices.
- DONE: Approval-created invoice sync avoids overwriting existing local invoices and avoids duplicate imports by invoice ID or source estimate ID.
- PARTIAL: Full invoice management is still localStorage-backed outside approval-created invoice snapshots.
- PARTIAL: Invoice payments through Stripe are not implemented.
- PARTIAL: Server-backed invoice list, invoice detail route, invoice persistence, and cross-device invoice management are not implemented.
- DEFERRED: Automatic balance invoice generation after deposit payment can wait.

## PDF Output Status

- DONE: Estimate PDFs are generated through browser print-window HTML.
- DONE: Invoice PDFs are generated through browser print-window HTML.
- DONE: Estimate PDFs include company branding, client/job metadata, scope/description, schedule, estimate rows, embedded burden reference, pricing summary, tax, deposit, approval sections, and approved signature display when available.
- DONE: Estimate PDFs include a customer-safe Estimator Plan Review when uploaded plans are present.
- DONE: Estimate PDFs now have improved document header hierarchy, metadata panels, stronger section labels, pricing card, and page-break avoidance.
- DONE: Invoice PDFs now have an improved total-due block, bill-to/date panels, invoice summary card, stronger section labels, and page-break avoidance.
- DONE: Estimate PDFs now include compact plan evidence summary:
  - Plan evidence strength.
  - Selected pages reviewed.
  - Text extraction status.
  - Rendered image status.
  - Hard quantity status.
  - Confirmation-needed status.
- PARTIAL: Browser print-window PDFs are brittle compared with server-side PDF generation.
- DONE: Estimate/invoice PDF visual hierarchy polish is complete for the current browser print-window launch pass.
- DEFERRED: Server-side PDF generation can wait until after launch unless browser PDF output becomes a blocker.

## Stripe/Billing Status

- DONE: Stripe checkout route exists.
- DONE: Stripe webhook route verifies signatures and dedupes webhook events.
- DONE: Stripe recurring monthly Pro price has been created as a subscription billing prerequisite.
- DONE: Vercel has `STRIPE_PRO_MONTHLY_PRICE_ID` set and the app was redeployed after adding the env var.
- DONE: Supabase subscription entitlement columns have been added.
- DONE: Stripe webhook endpoint is configured for all 6 required subscription events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
- DONE: Subscription checkout foundation is implemented: `/api/checkout` uses `STRIPE_PRO_MONTHLY_PRICE_ID` and `mode: "subscription"`.
- DONE: Stripe webhook handles subscription lifecycle events, keeps event dedupe, writes subscription status/period fields, and does not reset `usage_count`.
- DONE: `/api/entitlement` returns subscription-aware fields and messages.
- DONE: `/app` Account & Access shows plan, subscription status, and current period information.
- DONE: `/success` and `/cancel` use subscription-oriented copy.
- DONE: Focused entitlement tests cover active, trialing, past-due, canceled, unpaid/incomplete, and legacy access rules.
- DONE: Success page entitlement refresh posts the saved `jobestimatepro_email` to `/api/entitlement`.
- DONE: Free generation limit is currently 3 through Supabase/RPC-backed usage flow.
- PARTIAL: Billing is still email-based and does not use full accounts/auth.
- PARTIAL/PENDING: Final subscription payment, webhook delivery, and entitlement activation verification is still pending because a payment has not been completed yet.
- PARTIAL: Subscription planning is web/PWA-first through Stripe Checkout and web entitlement flows. Do not design around Apple in-app purchases or App Store subscription requirements yet.
- NOT STARTED: Billing portal/account management.
- DEFERRED: Business tier, invoice payments, and client portal billing can wait.

## Production Safety Status

- DONE: Detailed generate-route server logs are gated behind development-only checks where inspected.
- DONE: Electrical engine detailed parsing log is development-gated.
- DONE: Client-side debug logs for photo payloads, plan export failures, pricing source, generate failures, and checkout failures are gated behind development-only checks.
- DONE: Public approval GET payload is minimized and customer-safe.
- DONE: Approval status sync requires owner email plus owner sync token instead of email-only.
- PARTIAL: Full repo-wide log audit is not guaranteed complete outside the recently inspected routes and app page.
- DONE/PARTIAL: Safe lint triage pass completed. `npx tsc --noEmit` passes, including after the deterministic PriceGuard Review panel integration. `npm run lint` still fails due to deferred broad existing lint debt, including widespread `no-explicit-any` cleanup, hook dependency rewrites, image optimization warnings, unused symbols, and large component prop typing.
- DONE: Supabase production schema and indexes have been manually verified against `SUPABASE_PRODUCTION_CHECKLIST.md` for the current launch-critical paths.
- PARTIAL: No full authentication/workspace isolation yet.

## Remaining Must-Fix Before Launch

- PARTIAL: Keep launch readiness scoped to the PWA/web app path unless the launch-channel decision changes.
- PARTIAL: Verify the final subscription billing path before accepting public paid users.
- DONE: Subscription checkout, webhook lifecycle handling, entitlement response, Account & Access status display, success/cancel copy, and focused entitlement tests are implemented.
- DONE: Stripe recurring monthly price setup, `STRIPE_PRO_MONTHLY_PRICE_ID` Vercel env var setup, post-env-var redeploy, and 6-event webhook configuration are complete.
- DONE: Production Supabase schema, RPCs, and uniqueness constraints were manually verified for entitlement, webhook dedupe, approval snapshots, owner sync tokens, approvals, and approval invoices.
- PENDING: Complete final subscription payment/webhook entitlement verification using `SUBSCRIPTION_TEST_CHECKLIST.md`.
- DONE: Full production-readiness smoke test passed:
  - Free generation.
  - Account/access refresh.
  - Stripe checkout.
  - Success entitlement refresh.
  - Plan upload and selected-page generation.
  - Estimate PDF with compact plan evidence summary.
  - Invoice creation and invoice PDF download.
  - Copy approval link.
  - Approve from another browser/device.
  - Sync approval status.
  - Confirm one approval-created invoice imports.
  - Supabase verification queries.
- DONE: `SUPABASE_PRODUCTION_CHECKLIST.md` exists and lists required production tables, RPCs, indexes, constraints, RLS/service-role assumptions, manual queries, and smoke tests.
- DONE: `PRE_LAUNCH_SMOKE_TEST.md` exists and lists the manual smoke-test steps, expected results, failure handling, log-safety checks, and Supabase checkpoints.
- DONE/PARTIAL: Roadmap and feature inventory have been refreshed after the latest PriceGuard Review and workflow-clarity audit. Remaining stale documentation risk is narrow: `PRE_LAUNCH_SMOKE_TEST.md` still contains older one-time checkout language and should be reconciled with the subscription foundation in a docs-only follow-up.

## Should-Improve Before Launch

- DONE: Account/entitlement status surface in `/app` shows active email, free usage, access state, and refresh action.
- DONE: Focused invoice helper tests cover deposit/full/balance invoice behavior and approval-created invoice consistency.
- DONE: Production Supabase schema checklist is documented in `SUPABASE_PRODUCTION_CHECKLIST.md`.
- DONE: Mobile core workflow polish improved small-screen layout, wrapping, spacing, and tap targets for estimate form, plan upload/page selection, pricing summary, saved estimates, approval sync, jobs, and invoices.
- DONE: Estimate/invoice PDF visual hierarchy polish improved customer-facing readability while preserving existing print-window content and workflow behavior.
- DONE: Advanced analysis customer-facing mode separates the clean estimate result summary from estimator diagnostics while preserving existing advanced panels and data.
- DONE: First-version deterministic PriceGuard Review / Estimate Intelligence panel is complete for launch polish. It gives contractors a UI-side review of profit leaks, missed scope, labor/material confidence, scope clarity, exclusions, customer-ready price defense notes, and contractor-only risk notes without changing pricing, generation, PDFs, approvals, invoices, billing, or saved data shapes. `npx tsc --noEmit` passed; `npm run lint` still fails from known broad lint debt.
- DONE: PriceGuard Review QA polish reduced false positives for generated estimates that already resolve original-scope concerns. It now recognizes generated scope language for baseboard/trim/molding work, linear-foot quantities, prep/preparation, caulk/fill/prime, install/measure/cut/finish workflow, and site-visit-only schedule confidence. `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Saved Estimates and Invoices empty states/workflow guidance are complete for the current launch pass. Empty filtered lists now explain where saved estimates and invoices come from, include selected-job context where available, and preserve existing buttons/actions when data exists.
- DONE: Centralize localStorage access with a thin persistence helper for the current small pass. `app/app/lib/local-persistence.ts` now provides typed key groups, safe get/set/remove helpers, JSON read/write helpers, and legacy `scopeguard_email` / `scopeguard_company` migration support. Existing localStorage keys and data shapes were preserved.
- DONE: Roadmap/feature inventory stale statements about completed README, branding, logging, invoice helper, approval tests, and PDF plan readback work have been reconciled.
- DONE: Plan Intelligence Phase 1 estimator-only per-page read status is complete. It adds selected/read/degraded/weak-classification visibility without changing pricing, generation, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. Targeted plan tests and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 2 estimator-only sheet classification diagnostics are complete. Structured deterministic roles now classify floor plan, finish schedule, fixture schedule, door schedule, window schedule, RCP, elevation, demo plan, legend, and unknown sheets without changing pricing, generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. Fast sheet-heuristics tests, targeted plan tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 3 estimator-only table/schedule extraction diagnostics are complete. Deterministic selected/read page diagnostics now cover finish schedules, fixture schedules, door schedules, window schedules, legends, and unknown/generic schedules while preserving raw row text, confidence, and warnings. The pass does not change pricing, generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. Focused table tests, targeted plan tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 4 estimator-only room/finish matrix diagnostics are complete. Deterministic diagnostics now build from extracted finish schedule tables only and preserve room name/number, room type, wall/base/ceiling/floor finishes, notes, raw row text, confidence, and warnings. The pass does not change pricing, generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. Fast plan tests, targeted orchestrator tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 5 estimator-only repeated room package diagnostics are complete. Deterministic diagnostics now build from `roomFinishMatrices` only, detect repeated guest rooms, bathrooms, corridors/units/rooms by room family plus finish signature, detect repeated finish combinations across generic room rows, and preserve source matrix/table/page/sheet row provenance, confidence, and warnings. Repeat counts are diagnostic only, not measured quantity support. The pass does not change pricing, generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. Focused repeated-room package tests, targeted orchestrator tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 6 estimator-only trade-specific quantity candidate diagnostics are complete. Deterministic review-only candidates now build from `roomFinishMatrices`, `extractedTables`, and `repeatedRoomPackages`; cover painting/wallcovering/flooring/base/ceiling finish rows, door/window/fixture schedule counts, and repeated room package counts; preserve source provenance, confidence, assumptions, and warnings; and keep every candidate `eligibleForPricing: false`. The pass does not change pricing, generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. Targeted plan tests passed 28/28 and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 7 estimator-only confidence/provenance gate diagnostics are complete. Deterministic gates review `tradeQuantityCandidates` only, keep every gate `pricingEligibleNow: false`, use `future_candidate` only as a diagnostic future-readiness label, and keep finish-row/repeated-room/weak/no-source/unclear/unsupported candidates blocked or review-only. The pass does not change pricing, generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, or saved data shapes. `liveTradePricingInfluence.ts` was not modified, tests confirmed its behavior is unchanged, targeted plan tests passed 34/34, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE/PARTIAL: Safe lint triage pass completed. Small safe fixes removed an unused `Metadata` import and centralized duplicated invoice hydration typing with `normalizeStoredInvoice(x: unknown)`. `npm run lint` still fails because broad existing lint debt is deferred; `npx tsc --noEmit` passes.

## Can-Wait Until After Launch

- DEFERRED: Apple App Store launch, native iOS app, and iOS wrapper.
- DEFERRED: Full server-backed jobs.
- DEFERRED: Full server-backed saved estimates.
- DEFERRED: Full server-backed invoices.
- DEFERRED: Full authentication, accounts, and workspaces.
- DEFERRED: Billing portal.
- DEFERRED: Client portal.
- DEFERRED: Team/multi-user roles.
- DEFERRED: Stripe invoice/deposit/balance payment collection.
- DEFERRED: Server-side PDF generation.
- DEFERRED: Major measured-takeoff engine upgrades.
- DEFERRED: Business tier.
- DEFERRED: Large `app/app/page.tsx` refactor, provided launch-critical seams remain stable.

## Recommended Next 10 Codex Tasks In Safest Order

1. PARTIAL: Docs-only reconciliation of `PRE_LAUNCH_SMOKE_TEST.md` subscription wording.
   - The checklist still includes older one-time checkout/`STRIPE_PRICE_ID` language from the pre-subscription smoke test.
   - Update it to reflect the implemented subscription foundation and final pending subscription verification without changing billing code.

2. DONE: Focused non-billing QA polish for the deterministic PriceGuard Review panel.
   - False-positive reduction for generated scope language is complete.
   - `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.

3. PARTIAL: Focused non-billing QA pass for Saved Estimates and Invoices workflow clarity.
   - Verify empty states, selected-job filtering context, mobile layout, and existing invoice/saved-estimate actions when records exist.
   - Keep fixes copy/style-only unless a real runtime bug is found.

4. PARTIAL: Plan upload guidance and fallback-message QA.
   - Phase 1 per-page read status, Phase 2 sheet classification diagnostics, Phase 3 table/schedule extraction diagnostics, Phase 4 room/finish matrix diagnostics, Phase 5 repeated room package diagnostics, Phase 6 trade-specific quantity candidate diagnostics, and Phase 7 confidence/provenance gate diagnostics are complete.
   - UI-only large-plan selected-page range controls are complete. This added deterministic range helpers and PDF From / To / Select range controls without changing upload/staging architecture or analysis behavior.
   - The next safest large-plan task is selected-page guidance/readiness copy polish or an original-fallback/rasterization efficiency audit.
   - Actual pricing handoff activation remains future work only after manual QA and stronger confidence/provenance gates are proven; do not allow plan-derived candidates to affect pricing yet.

5. PARTIAL: Tighten contractor-facing launch copy around PriceGuard Review / Estimate Intelligence only where it clarifies existing behavior.
   - Keep copy consistent with deterministic review scope.
   - Do not imply new pricing math, new AI calls, guaranteed coverage, or customer-visible PDF changes.

6. PARTIAL: Job dashboard and customer-facing estimate confidence copy polish.
   - Improve guidance only where current workflows are confusing during manual QA.
   - Avoid data model, pricing, persistence, approval, invoice, PDF, or generation changes.

7. PARTIAL: Narrow targeted lint cleanup batches only where they reduce real launch risk.
   - Broad repo-wide lint cleanup remains deferred. Do not start sweeping `any` rewrites, hook dependency rewrites, image optimization conversions, unused-symbol cleanup, or large component prop typing unless a specific runtime risk is identified.

8. PARTIAL: Resolve any remaining non-billing launch blockers found during focused verification.
   - Keep fixes narrowly scoped to verified runtime, production-safety, or launch-readiness failures.

9. PENDING: Final subscription test-mode/live verification using `SUBSCRIPTION_TEST_CHECKLIST.md`.
   - Complete a real subscription checkout/payment in the intended Stripe mode, confirm all required webhook deliveries, and verify the Supabase entitlement row plus `/success`, `/api/entitlement`, and `/app` Account & Access behavior.

10. PARTIAL: Subscription/free-limit regression tests after final billing verification.
   - Extend coverage if the manual subscription verification finds gaps beyond the focused entitlement access-rule tests.
   - Cover free users, active Pro, canceled/past-due policy, webhook idempotency, and success-page refresh as needed.

## Features We Should Not Rebuild

- DONE: Main estimate generation endpoint.
- DONE: Pricing authority and owner-resolution logic.
- DONE: PriceGuard protections and final pricing safeguards.
- DONE: First-version deterministic UI-side PriceGuard Review / Estimate Intelligence panel.
- DONE: Deterministic trade pricing engines.
- DONE: Editable pricing, tax, deposit, and total display.
- DONE: Free-limit entitlement basics.
- DONE: Stripe checkout/webhook foundation.
- DONE: Plan upload, page selection, selected-page staging, and selected-page PDF transport.
- DONE: Plan Intelligence typed readbacks.
- DONE: Plan evidence strength readback.
- DONE: PDF Estimator Plan Review and compact plan evidence summary.
- DONE: Photo upload and photo intelligence foundation.
- DONE: Saved estimates, saved-estimate empty states, and jobs dashboard foundation.
- DONE: Invoice creation, invoice empty states, and invoice PDF foundation.
- DONE: Shared invoice creation helper.
- DONE: Customer approval/signature page.
- DONE: Server-backed approval snapshot/read/submit/status/invoice-sync workflow.
- DONE: Approval security hardening.
- DONE: Approval regression tests.
- DONE: Estimator section skeleton, structured estimate rows, embedded burdens, trade assemblies, and pricing-carry readback.

Extend and harden these existing systems. Do not replace them with new parallel engines or duplicate workflows unless the current live seam is proven unable to support the launch requirement.
