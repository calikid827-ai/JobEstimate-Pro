# JobEstimate Pro Pre-Launch Status

This document captures the current pre-launch state of JobEstimate Pro as of the latest approval, Plan Intelligence, PDF, logging, and documentation passes.

## Current App Status

- DONE: JobEstimate Pro is a broad local-first contractor estimating app with estimate/change-order generation, editable pricing, plan/photo intelligence, PDFs, approvals, invoices, jobs, and local history.
- DONE: Core generation still runs through `POST /api/generate` with OpenAI output, deterministic pricing engines, estimator orchestration, PriceGuard protections, and entitlement/free-limit checks.
- DONE: Pricing authority, pricing protections, pricing owner logic, and totals are established and should not be rebuilt casually.
- PARTIAL: The contractor workspace is still mostly localStorage-backed. Estimates, jobs, invoices, budgets, actuals, company settings, and email live primarily in browser storage.
- PARTIAL: Server persistence exists for approval snapshots, approval status, approval signatures, owner sync tokens, and approval-created invoice snapshots only.
- PARTIAL: The app is feature-rich but still dense. Some advanced analysis surfaces are estimator/debug-oriented rather than fully customer-facing.

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
- DONE: Shared invoice helper, `buildInvoiceFromEstimate()`, is used by `/app`, same-device approval fallback, and server approval invoice creation.
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
- DONE: Estimate PDFs now include compact plan evidence summary:
  - Plan evidence strength.
  - Selected pages reviewed.
  - Text extraction status.
  - Rendered image status.
  - Hard quantity status.
  - Confirmation-needed status.
- PARTIAL: Browser print-window PDFs are brittle compared with server-side PDF generation.
- PARTIAL: PDF visual hierarchy can still be improved for dense estimates and plan-assisted results.
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
- PARTIAL: Supabase production schema and indexes must match the approval implementation before launch.
- PARTIAL: No full authentication/workspace isolation yet.

## Remaining Must-Fix Before Launch

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
- PARTIAL: Add/update docs for exact production Supabase SQL/schema if not already tracked elsewhere.
- PARTIAL: Reconcile stale roadmap/inventory items that still describe completed work as open.

## Should-Improve Before Launch

- PARTIAL: Add an account/entitlement status surface in `/app` showing active email, free usage, access state, and refresh action.
- PARTIAL: Add focused invoice helper tests for deposit/full/balance invoice behavior and approval-created invoice consistency.
- PARTIAL: Improve mobile usability for core workflows: estimate form, plan upload/page selection, pricing summary, saved estimates, approval sync, and invoices.
- PARTIAL: Polish PDF visual hierarchy for customer-facing readability.
- PARTIAL: Simplify or separate advanced analysis into customer-facing and estimator/debug views.
- PARTIAL: Centralize localStorage access with a small persistence helper.
- PARTIAL: Update roadmap/feature inventory to remove stale statements about completed README, branding, logging, invoice helper, approval tests, and PDF plan readback work.
- PARTIAL: Run `npm run lint` and decide which lint failures are launch-blocking versus post-launch cleanup.

## Can-Wait Until After Launch

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

1. DONE/PARTIAL: Reconcile stale docs in `FEATURE_INVENTORY.md` and `ROADMAP.md` with current state.
   - Update items that still say README is default, ScopeGuard copy remains, debug logs remain, invoice helper is duplicated, approval tests are missing, or PDFs lack plan readback.

2. PARTIAL: Add account/entitlement status surface in `/app`.
   - Show current email, free usage, entitlement/access state, and refresh action without changing billing logic.

3. PARTIAL: Add focused invoice helper tests.
   - Cover full invoice, deposit invoice, balance invoice, tax handling, zero/missing deposit guard, and approval-created invoice consistency.

4. PARTIAL: Production Supabase schema checklist.
   - Create or update a docs file listing required tables, RPCs, indexes, and constraints for entitlement, webhook dedupe, approvals, and approval invoices.

5. PARTIAL: Mobile core workflow polish pass.
   - Fix layout/overflow/usability for estimate input, plan upload, pricing summary, saved estimates, approvals sync, and invoices.

6. PARTIAL: Estimate/invoice PDF visual hierarchy polish.
   - Keep browser print-window output, but improve spacing, section ordering, and readability.

7. PARTIAL: Advanced analysis customer-facing mode.
   - Keep diagnostics, but make the default result less experimental and easier to scan.

8. PARTIAL: Subscription billing implementation pass after final pricing decision.
   - Switch checkout to subscription mode, add subscription fields, handle lifecycle webhooks, and update entitlement responses.

9. PARTIAL: Subscription/free-limit regression tests.
   - Cover free users, active Pro, canceled/past-due policy, webhook idempotency, and success-page refresh.

10. DEFERRED: Start server-backed jobs/estimates design only after billing and launch-critical local-first workflows are stable.

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
