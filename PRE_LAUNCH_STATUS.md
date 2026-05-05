# JobEstimate Pro Pre-Launch Status

This document captures the current pre-launch state of JobEstimate Pro as of the latest approval, Plan Intelligence, PDF, logging, and documentation passes.

## Current App Status

- DONE: JobEstimate Pro is a broad local-first contractor estimating app with estimate/change-order generation, editable pricing, plan/photo intelligence, PDFs, approvals, invoices, jobs, and local history.
- DONE: Core generation still runs through `POST /api/generate` with OpenAI output, deterministic pricing engines, estimator orchestration, PriceGuard protections, and entitlement/free-limit checks.
- DONE: Pricing authority, pricing protections, pricing owner logic, and totals are established and should not be rebuilt casually.
- PARTIAL: Launch-channel strategy is PWA/web app first. Apple App Store/native iOS distribution is undecided and deferred until after real user, pricing, support, and cost-model validation.
- PARTIAL: The contractor workspace is still mostly localStorage-backed. Estimates, jobs, invoices, budgets, actuals, company settings, and email live primarily in browser storage.
- PARTIAL: Server persistence exists for approval snapshots, approval status, approval signatures, owner sync tokens, and approval-created invoice snapshots only.
- PARTIAL: The app is feature-rich but still dense. Some advanced analysis surfaces are estimator/debug-oriented rather than fully customer-facing.

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
- DONE: Plan selected-page upload, staging, and fallback messaging.
- DONE: Browser-derived selected-page PDF rasterization renders derived pages `1..N` while preserving original source page provenance.
- DONE: Plan evidence strength readback with `Strong`, `Useful`, and `Review-only`.
- DONE: Estimate PDF includes customer-safe Estimator Plan Review and compact plan evidence summary.
- DONE: Production debug/customer-detail logging is gated in the generate path and client app debug paths inspected in the latest pass.
- DONE: Product README, feature inventory, roadmap, subscription architecture, and server-backed approval plan documents exist.

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
- DONE: Browser-derived selected-page PDFs now render derived pages `1..N` for image/vision fallback while preserving original source page numbers in provenance.
- DONE: Plan Intelligence includes PDF splitting, page rendering, sheet indexing, sheet classification heuristics, per-sheet analysis, vision fallback, cross-sheet merge, and typed readbacks.
- DONE: Plan readbacks include sheet narration, room/area quantity readback, trade-by-trade readback, grouped scope readback, scope-gap prompts, estimator packages, section skeleton handoff, trade assemblies, pricing-carry readback, and final estimator story surfaces.
- DONE: Evidence strength reports `Strong`, `Useful`, or `Review-only`, including selected/indexed/skipped pages, text extraction status, rendered image status, hard quantity status, and confirmation-needed status.
- PARTIAL: Hard quantity extraction is still heuristic, not a full measured takeoff.
- PARTIAL: Schedule table, finish schedule, room matrix, repeated-room count, SF/LF, fixture/device count extraction can still be improved.
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
- DONE: Stripe webhook currently activates email-based entitlement on `checkout.session.completed`.
- DONE: Success page entitlement refresh posts the saved `jobestimatepro_email` to `/api/entitlement`.
- DONE: Free generation limit is currently 3 through Supabase/RPC-backed usage flow.
- PARTIAL: Billing is still email-based and does not use full accounts/auth.
- PARTIAL: Checkout is still one-time payment mode using `STRIPE_PRICE_ID` and `mode: "payment"`.
- PARTIAL: Product docs recommend moving to subscription before public launch.
- PARTIAL: Subscription planning is web/PWA-first through Stripe Checkout and web entitlement flows. Do not design around Apple in-app purchases or App Store subscription requirements yet.
- NOT STARTED: Subscription checkout mode.
- NOT STARTED: Subscription lifecycle webhook handling.
- NOT STARTED: Subscription-aware entitlement schema/status.
- NOT STARTED: Billing portal/account management.
- DEFERRED: Business tier, invoice payments, and client portal billing can wait.

## Production Safety Status

- DONE: Detailed generate-route server logs are gated behind development-only checks where inspected.
- DONE: Electrical engine detailed parsing log is development-gated.
- DONE: Client-side debug logs for photo payloads, plan export failures, pricing source, generate failures, and checkout failures are gated behind development-only checks.
- DONE: Public approval GET payload is minimized and customer-safe.
- DONE: Approval status sync requires owner email plus owner sync token instead of email-only.
- PARTIAL: Full repo-wide log audit is not guaranteed complete outside the recently inspected routes and app page.
- PARTIAL: Lint may still report pre-existing project-wide issues such as `any`, unused helpers, and hook warnings.
- PARTIAL: Supabase production schema and indexes must still be verified against `SUPABASE_PRODUCTION_CHECKLIST.md` before launch.
- PARTIAL: No full authentication/workspace isolation yet.

## Remaining Must-Fix Before Launch

- PARTIAL: Keep launch readiness scoped to the PWA/web app path unless the launch-channel decision changes.
- PARTIAL: Decide and implement the final billing model before accepting public paid users.
- PARTIAL: If launching with subscriptions, migrate Stripe checkout to recurring subscription mode and update entitlement/webhook handling.
- PARTIAL: Verify production Supabase schema, RPCs, and uniqueness constraints for entitlement, webhook dedupe, approval snapshots, owner sync tokens, approvals, and approval invoices.
- PARTIAL: Run a full production-readiness smoke test:
  - Free generation.
  - Stripe checkout.
  - Success entitlement refresh.
  - Plan upload and selected-page generation.
  - Estimate PDF with compact plan evidence summary.
  - Copy approval link.
  - Approve from another browser/device.
  - Sync approval status.
  - Confirm one approval-created invoice imports.
- DONE: `SUPABASE_PRODUCTION_CHECKLIST.md` exists and lists required production tables, RPCs, indexes, constraints, RLS/service-role assumptions, manual queries, and smoke tests.
- PARTIAL: Reconcile stale roadmap/inventory items that still describe completed work as open.

## Should-Improve Before Launch

- DONE: Account/entitlement status surface in `/app` shows active email, free usage, access state, and refresh action.
- DONE: Focused invoice helper tests cover deposit/full/balance invoice behavior and approval-created invoice consistency.
- DONE: Production Supabase schema checklist is documented in `SUPABASE_PRODUCTION_CHECKLIST.md`.
- DONE: Mobile core workflow polish improved small-screen layout, wrapping, spacing, and tap targets for estimate form, plan upload/page selection, pricing summary, saved estimates, approval sync, jobs, and invoices.
- DONE: Estimate/invoice PDF visual hierarchy polish improved customer-facing readability while preserving existing print-window content and workflow behavior.
- PARTIAL: Simplify or separate advanced analysis into customer-facing and estimator/debug views.
- PARTIAL: Centralize localStorage access with a small persistence helper.
- DONE: Roadmap/feature inventory stale statements about completed README, branding, logging, invoice helper, approval tests, and PDF plan readback work have been reconciled.
- PARTIAL: Run `npm run lint` and decide which lint failures are launch-blocking versus post-launch cleanup.

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

1. PARTIAL: Advanced analysis customer-facing mode.
   - Keep diagnostics, but make the default result less experimental and easier to scan.

2. PARTIAL: Full production-readiness smoke test.
   - Exercise free generation, checkout, success refresh, plan upload, estimate PDF, approval link, cross-device approval, approval sync, and one approval-created invoice import.

3. PARTIAL: Run production Supabase verification using `SUPABASE_PRODUCTION_CHECKLIST.md`.
   - Confirm production tables, RPCs, unique constraints, indexes, RLS/service-role behavior, and approval invoice duplicate protection.

4. PARTIAL: Subscription billing implementation pass after final pricing decision.
   - Switch checkout to subscription mode, add subscription fields, handle lifecycle webhooks, and update entitlement responses.

5. PARTIAL: Subscription/free-limit regression tests after billing model decision.
   - Cover free users, active Pro, canceled/past-due policy, webhook idempotency, and success-page refresh.

6. PARTIAL: Centralize localStorage access with a small persistence helper.
   - Keep it thin and compatible with existing localStorage keys.

7. PARTIAL: Run `npm run lint` and triage launch-blocking issues.
   - Separate real launch blockers from broader post-launch cleanup.

8. DEFERRED: Start server-backed jobs/estimates design only after billing and launch-critical local-first workflows are stable.

9. DEFERRED: App Store/iOS wrapper planning only after web/PWA validation.

10. DEFERRED: Server-side PDF generation unless browser print-window output becomes a launch blocker.

## Features We Should Not Rebuild

- DONE: Main estimate generation endpoint.
- DONE: Pricing authority and owner-resolution logic.
- DONE: PriceGuard protections and final pricing safeguards.
- DONE: Deterministic trade pricing engines.
- DONE: Editable pricing, tax, deposit, and total display.
- DONE: Free-limit entitlement basics.
- DONE: Stripe checkout/webhook foundation.
- DONE: Plan upload, page selection, selected-page staging, and selected-page PDF transport.
- DONE: Plan Intelligence typed readbacks.
- DONE: Plan evidence strength readback.
- DONE: PDF Estimator Plan Review and compact plan evidence summary.
- DONE: Photo upload and photo intelligence foundation.
- DONE: Saved estimates and jobs dashboard foundation.
- DONE: Invoice creation and invoice PDF foundation.
- DONE: Shared invoice creation helper.
- DONE: Customer approval/signature page.
- DONE: Server-backed approval snapshot/read/submit/status/invoice-sync workflow.
- DONE: Approval security hardening.
- DONE: Approval regression tests.
- DONE: Estimator section skeleton, structured estimate rows, embedded burdens, trade assemblies, and pricing-carry readback.

Extend and harden these existing systems. Do not replace them with new parallel engines or duplicate workflows unless the current live seam is proven unable to support the launch requirement.
