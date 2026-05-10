# JobEstimate Pro Roadmap

This roadmap is based on `FEATURE_INVENTORY.md`. It prioritizes pre-launch production readiness first, then feature completion, stability, polish, server-backed workflows, and premium future capabilities.

Risk levels:

- Low: localized change with little pricing or persistence impact.
- Medium: touches shared UI, PDF, persistence, or workflow logic.
- High: changes backend data model, production persistence, auth, or billing behavior.

Difficulty levels:

- Small: hours to one day.
- Medium: one to several days.
- Large: multi-day or multi-phase work.

## Pre-Launch Strategy Notes

- JobEstimate Pro has no current paying users, so the billing model can still change safely before public launch.
- Current launch-channel strategy is PWA/web app first. Apple App Store distribution is undecided and deferred until after product validation.
- Do not build native iOS/App Store features, iOS wrapper behavior, Apple in-app purchase flows, or App Store packaging yet.
- Focus first on finishing web/PWA core workflows, subscription readiness, mobile web usability, production Supabase/Stripe readiness, and production safety.
- Revisit App Store distribution only after real user validation, pricing validation, support burden validation, OpenAI/plan-rendering/storage cost validation, and a clearer mobile acquisition strategy.
- The current Stripe checkout code now uses monthly subscription Checkout with `STRIPE_PRO_MONTHLY_PRICE_ID` and `mode: "subscription"`. Treat any old one-time $29 unlimited-access offer as temporary/pre-launch legacy only.
- Current billing launch blocker: final Stripe subscription payment/webhook entitlement verification is still pending.
- Avoid promising unlimited generations forever until OpenAI, plan-rendering, storage, support, and abuse costs are proven.
- Finish the existing core workflows before adding broad new features: estimate generation, plan intelligence readback, approvals, invoices, PDFs, account/entitlement status, and billing model clarity.
- Keep any further billing changes narrow until final subscription verification is complete. Pricing, free limit, trial/grace behavior, cancellation behavior, and fair-use thresholds can still be adjusted before public launch.

## Proposed Pre-Launch Pricing Model

- Free: 3 free generations.
- Pro: $29/month.
- Avoid lifetime unlimited access.
- Avoid marketing the Pro plan as truly unlimited until OpenAI, plan rendering, upload/storage, support, and abuse costs are proven.
- Use fair-use language instead of unlimited language, such as “includes generous fair-use access for normal contractor estimating workflows.”
- Future Business tier can be added later after launch for teams, higher usage, server-backed storage, client portal, invoice payments, or priority support.
- Exact generation limits, fair-use thresholds, plan names, and launch pricing can still change before public launch.
- Billing implementation now follows this direction through the web/PWA Stripe Checkout path. Final payment/webhook verification is still required before public paid launch.

## Current Next Active Tasks

1. Real-PDF QA, mobile usability, and estimator UI clarity for Plan Intelligence diagnostics using `REAL_PDF_QA_CHECKLIST.md`.
2. Focused non-billing QA for Saved Estimates and Invoices empty states, selected-job context, mobile layout, and existing actions.
3. Job dashboard and customer-facing estimate confidence copy polish only where current workflows are confusing.
4. Narrow targeted lint cleanup batches only where they reduce real launch risk.
5. Final subscription test-mode/live verification using `SUBSCRIPTION_TEST_CHECKLIST.md` remains pending before accepting public paid users.

Completed pre-launch task kept visible:

- DONE: Mobile core workflow polish for estimate input, plan upload/page selection, pricing summary, saved estimates, approval sync, jobs, and invoices.
- DONE: Estimate/invoice PDF visual hierarchy polish for browser-generated estimate and invoice PDFs.
- DONE: Advanced analysis customer-facing mode separates the clean estimate result summary from estimator diagnostics.
- DONE: First-version deterministic PriceGuard Review / Estimate Intelligence panel is implemented in `/app`. It computes UI-side review notes from existing estimate state, including score/level, missed-scope warnings, labor/material confidence notes, scope clarity warnings, suggested exclusions, customer-ready price defense notes, contractor-only risk notes, and a pre-generation fallback state. It does not change pricing math, generation, PDFs, approvals, invoices, billing, API routes, or saved data shapes.
- DONE: PriceGuard Review QA false-positive reduction pass is complete. The helper now filters scope-quality warnings against generated customer-facing estimate text and better recognizes trim/baseboard work, linear-foot quantities, prep/workflow language, and site-visit-only schedule confidence.
- DONE: Saved Estimates and Invoices empty states/workflow guidance now keep those sections visible when filtered lists are empty and explain where records come from, including selected-job context when applicable.
- DONE: `PRE_LAUNCH_SMOKE_TEST.md` documents the manual PWA/web production-readiness smoke test checklist.
- DONE: Full app-side PWA/web smoke test passed for free generation, account/access refresh, plan upload/selected-page generation, estimate PDF, invoice creation/PDF, the earlier checkout/success entitlement refresh path, approval link creation, cross-browser/device approval, approval sync, and approval-created invoice import. Current subscription billing still requires final payment, webhook delivery, and entitlement activation verification through `SUBSCRIPTION_TEST_CHECKLIST.md` before public paid launch.
- DONE: Production Supabase verification using `SUPABASE_PRODUCTION_CHECKLIST.md` passed for the current launch-critical schema, RPC, constraint, and duplicate-protection paths.
- DONE: Stripe recurring monthly Pro price has been created, Vercel has `STRIPE_PRO_MONTHLY_PRICE_ID` set, and the app was redeployed after the env var was added.
- DONE/PARTIAL: Subscription billing implementation foundation is in place: checkout mode switch, monthly price env var, Supabase columns, 6-event webhook handling, subscription-aware entitlement response, Account & Access status copy, success/cancel copy, and focused entitlement tests are done; final payment/webhook entitlement verification remains pending.
- DONE/PARTIAL: Thin localStorage persistence helper is in place. `app/app/lib/local-persistence.ts` centralizes typed key groups, safe get/set/remove helpers, JSON read/write helpers, and legacy `scopeguard` email/company migration support; broader server-backed persistence remains future work.
- DONE/PARTIAL: Safe lint triage pass completed. `npm run lint` moved from 218 problems to 215 after small safe fixes, but still fails due to broad existing lint debt. `npx tsc --noEmit` passes.
- DONE: Plan Intelligence Phase 1 observability/read status is complete. Per-page read statuses are estimator-only diagnostics, targeted plan tests passed, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 2 sheet classification diagnostics are complete. Structured estimator-only deterministic roles now cover floor plan, finish schedule, fixture schedule, door schedule, window schedule, RCP, elevation, demo plan, legend, and unknown sheets. Targeted plan tests and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 3 table/schedule extraction diagnostics are complete. Deterministic estimator-only extraction now covers finish schedules, fixture schedules, door schedules, window schedules, legends, and unknown/generic schedules from selected/read pages. Focused table tests, targeted plan tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 4 room/finish matrix diagnostics are complete. Deterministic estimator-only extraction builds from extracted finish schedule tables only and captures room name/number, room type, wall/base/ceiling/floor finishes, notes, raw row text, confidence, and warnings. Fast plan tests, targeted orchestrator tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 5 repeated room package diagnostics are complete. Deterministic estimator-only extraction builds from `roomFinishMatrices` only, detects repeated room families plus finish signatures and repeated finish combinations across generic room rows, preserves source provenance, confidence, and warnings, and keeps repeat counts diagnostic-only. Focused tests, targeted orchestrator tests, and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 6 trade-specific quantity candidate diagnostics are complete. Deterministic estimator-only candidates build from `roomFinishMatrices`, `extractedTables`, and `repeatedRoomPackages`; preserve source provenance, confidence, assumptions, and warnings; and keep every candidate `eligibleForPricing: false`. Targeted plan tests passed 28/28 and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Intelligence Phase 7 confidence/provenance gate diagnostics are complete. Deterministic estimator-only gates review `tradeQuantityCandidates` only, keep every gate `pricingEligibleNow: false`, classify candidates as `blocked`, `review_only`, or `future_candidate`, and preserve required evidence, present evidence, blockers, warnings, and source provenance. Targeted plan tests passed 34/34 and `npx tsc --noEmit` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Large-plan selected-page selection UX is complete as a UI/helper-only pass. PDF uploads now support From / To / Select range controls, retain Clear and Select all, show selected-page count and estimated selected upload size more clearly, and warn when a large PDF has all pages selected. Focused `plan-upload.test.ts`, `npx tsc --noEmit`, and `git diff --check` passed.
- DONE: Large-plan selected-page readiness guidance is complete as a UI/helper-only pass. PDF uploads now summarize selected page count, total page count, selection ratio, estimated selected upload size, all-pages-selected large PDFs, no-page selections, many selected pages, high selected upload size, and whether the selected set may be too broad for reliable/cost-controlled analysis. Focused `plan-upload.test.ts`, `npx tsc --noEmit`, and `git diff --check` passed.
- DONE: Original-fallback selected-page scalability improvement is complete. Original/fallback PDFs with `selectedSourcePages` now limit fallback rasterization, text extraction, indexing, and sheet classification to selected original pages while preserving source page provenance. Browser/server-derived selected PDFs with `sourcePageNumberMap` still behave as derived pages `1..N` mapped back to original pages. Generate now safely continues with original fallback if the second selected-page derivation attempt fails. Targeted plan tests passed 24/24, `npx tsc --noEmit` passed, and `git diff --check` passed; `npm run lint` still fails due to known broad lint debt.
- DONE: Plan Review Summary clarity and plan-aware pre-generate scope warning are complete as a UI-only pass. Plan diagnostics are grouped into Pages read, Extracted plan data, and Review-only quantity signals; quantity candidates/gates are clearly not measured takeoff support or pricing inputs; and the scope warning softens to “Scope details still need confirmation” when plans are uploaded. `npx tsc --noEmit`, `git diff --check`, and manual visual QA passed.

## 1. Critical Fixes

### 1.1 Remove or Gate Production Debug Logging

- Status: Completed for the recently inspected generate path and client app debug paths. Remaining risk is a full repo-wide audit, not the known launch-critical logs.
- Why it matters: Production logs should not expose customer scope, plan, or pricing details.
- Files likely affected:
  - `app/api/generate/route.ts`
  - `app/api/generate/lib/priceguard/electricalEngine.ts`
  - Any small logging helper if introduced.
- Risk level: Low
- Difficulty: Small
- Suggested order: 1

### 1.2 Clean Up Stripe Success/Cancel Branding

- Status: Completed for the known success/cancel payment pages.
- Why it matters: Payment surfaces should consistently use JobEstimate Pro copy.
- Files likely affected:
  - `app/success/page.tsx`
  - `app/cancel/page.tsx`
- Risk level: Low
- Difficulty: Small
- Suggested order: 2

### 1.3 Add Estimator Story to Estimate PDF Output

- Status: Completed for customer-safe plan review and compact evidence/readiness summary. Remaining PDF work is visual hierarchy polish, not missing plan readback.
- Why it matters: The PDF is the customer-facing artifact and should make plan-assisted estimates easy to understand.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/lib/plan-pricing-carry.ts`
  - Possible small PDF formatting helper if extracted.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 3

### 1.4 Extract Shared Invoice Creation Logic

- Status: Completed through `buildInvoiceFromEstimate()`, shared by `/app`, same-device approval fallback, and server approval invoice creation.
- Why it matters: Deposit, tax, balance, and approval-created invoice behavior should remain consistent as invoice workflows grow.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/approve/[id]/page.tsx`
  - `app/app/lib/invoices.ts`
  - `app/app/lib/types.ts`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 4

### 1.5 Document Required Environment and Setup

- Status: Completed in `README.md` for current product setup, API routes, environment variables, Stripe, Supabase, approval links, localStorage, and plan upload/rendering notes.
- Why it matters: Production work needs clear OpenAI, Stripe, Supabase, webhook, and plan-rendering setup notes.
- Files likely affected:
  - `README.md`
  - Possibly `.env.example` if added.
- Risk level: Low
- Difficulty: Small
- Suggested order: 5

### 1.6 Prepare Subscription Billing Model

- Status: Done/Partial. Subscription billing implementation foundation is complete; final payment/webhook entitlement verification is pending.
- Why it matters: The product has not launched with paying users yet, so the billing model moved from one-time unlimited access to a recurring subscription foundation without customer migration risk. The implemented foundation still needs final payment/webhook entitlement verification before public launch.
- Files likely affected:
  - `app/api/checkout/route.ts`
  - `app/api/webhook/route.ts`
  - `app/api/entitlement/route.ts`
  - `app/success/page.tsx`
  - `app/cancel/page.tsx`
  - Supabase entitlement records/schema
  - Stripe product/price configuration
- Notes:
  - Stripe recurring monthly Pro price has been created.
  - Vercel now has `STRIPE_PRO_MONTHLY_PRICE_ID` set, and the app was redeployed after adding the env var.
  - Supabase subscription entitlement columns have been added.
  - Stripe webhook endpoint is configured for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
  - `/api/checkout` now uses `STRIPE_PRO_MONTHLY_PRICE_ID` with `mode: "subscription"`.
  - `/api/webhook` handles subscription lifecycle events, preserves dedupe, and does not reset `usage_count`.
  - `/api/entitlement` returns subscription-aware fields and messages.
  - `/app` Account & Access shows plan/status/period information.
  - `/success` and `/cancel` use subscription-oriented copy.
  - Focused entitlement tests cover subscription access rules and legacy compatibility.
  - Final live/test subscription payment and webhook entitlement verification is still pending because payment has not been completed yet.
  - Keep this pass focused on web/PWA Stripe Checkout and web entitlement flows. Do not add Apple in-app purchase or App Store subscription requirements yet.
- Risk level: High
- Difficulty: Medium
- Suggested order: 6

### 1.7 Production Supabase Schema Checklist

- Status: Done. `SUPABASE_PRODUCTION_CHECKLIST.md` exists, and production Supabase verification has been completed for the current launch-critical paths.
- Why it matters: Production Supabase schema, RPCs, indexes, and uniqueness constraints must match the launch-critical entitlement, webhook dedupe, approval snapshot, owner sync token, approval, and approval-created invoice workflows.
- Files likely affected:
  - `SUPABASE_PRODUCTION_CHECKLIST.md`
  - No app logic unless a later verification pass finds a real schema/code mismatch.
- Scope:
  - Entitlement/free-limit tables and RPCs.
  - Stripe webhook event dedupe table/constraint.
  - Approval proposal/link/token/sync tables.
  - Proposal approval and approval invoice tables.
  - Required uniqueness constraints for duplicate-protected flows.
- Verification completed: Manual production checks passed for entitlement/free-limit tables and RPCs, Stripe webhook dedupe, approval proposal/link/token/sync tables, proposal approvals, approval invoices, and required duplicate-protection paths.
- Risk level: Low
- Difficulty: Small
- Suggested order: Completed

### 1.7a Pre-Launch Smoke Test Checklist

- Status: Done. `PRE_LAUNCH_SMOKE_TEST.md` exists, and the full app-side production-readiness smoke test has passed.
- Why it matters: The PWA/web launch path has a practical manual checklist covering environment variables, free generation, account/access refresh, selected-page plan generation, estimate/invoice PDFs, Stripe Checkout, success entitlement refresh, server-backed approvals, approval-created invoice import, production log safety, and Supabase checkpoints.
- Verification completed: The tested app-side flow passed free generation, account/access refresh, plan upload/selected-page generation, estimate PDF, invoice creation/PDF, the earlier checkout/success entitlement refresh path, approval link creation, cross-browser/device approval, approval sync, and approval-created invoice import. Current subscription billing still requires final payment, webhook delivery, and entitlement activation verification through `SUBSCRIPTION_TEST_CHECKLIST.md`.
- Risk level: Low
- Difficulty: Small
- Suggested order: Completed

### 1.8 PWA/Web Launch Channel Focus

- Status: Current pre-launch path.
- Why it matters: The product still needs web/PWA workflow completion, subscription readiness, mobile web usability, and production safety before adding native distribution complexity.
- Direction:
  - Treat PWA/web app launch as the primary pre-launch path.
  - Defer Apple App Store, native iOS, and iOS wrapper work until after validation.
  - Do not build App Store packaging, Apple in-app purchases, native iOS-only features, or wrapper-specific behavior yet.
  - Revisit App Store distribution after real user validation, pricing validation, support/cost model validation, and clearer mobile acquisition needs.
- Files likely affected:
  - Documentation only until the launch-channel decision changes.
- Risk level: Low
- Difficulty: Small
- Suggested order: 8

### 1.9 Pre-Launch Feature Completion Pass

- Status note: Mobile core workflow polish is done. Style-only responsive improvements were applied to `app/app/page.tsx`, `PlanUploadsSection`, `SavedEstimatesSection`, `JobsDashboardSection`, `InvoicesSection`, and `PricingSummarySection`.
- Status note: First-version deterministic PriceGuard Review / Estimate Intelligence launch polish is done through `app/app/lib/priceguard-review.ts`, `app/app/components/PriceGuardReviewPanel.tsx`, and `/app` result workflow integration.
- Status note: Saved Estimates and Invoices empty states/workflow guidance are done for the current launch pass. Empty filtered lists no longer disappear; they explain the workflow and include active-job context where available.
- Why it matters: The app is already broad. Before public launch, the safest product strategy is to finish and polish the major workflows that already exist instead of adding unrelated new features.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/*`
  - `app/app/lib/*`
  - `app/approve/[id]/page.tsx`
  - `app/success/page.tsx`
  - `app/cancel/page.tsx`
  - `README.md`
  - `app/api/checkout/route.ts`
  - `app/api/webhook/route.ts`
  - `app/api/entitlement/route.ts`
- Priority scope:
  - Plan intelligence polish
  - Approval workflow
  - Invoice workflow
  - Deterministic PriceGuard Review / Estimate Intelligence panel is complete for the first launch-safe version, including the focused false-positive reduction QA pass. Future deeper PriceGuard improvements remain future work.
  - Saved estimate and invoice workflow clarity is complete for the current empty-state pass; future changes should be copy/style QA only unless a real runtime bug is found.
  - PDF polish
  - Account/entitlement status surface is complete; keep it stable.
  - Web/PWA subscription billing model
  - Mobile web usability is complete for the current launch polish pass; keep it stable unless new issues appear in testing.
  - README/setup
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 9

## 2. Stability Upgrades

### 2.1 Centralize LocalStorage Access

- Status: Done/Partial. Done for the thin helper and safe page-level usage migration; partial only for broader future persistence/server-backed work.
- Why it matters: LocalStorage reads/writes are scattered through pages and components. A thin persistence helper would reduce data-shape drift before server persistence is added.
- Files likely affected:
  - `app/app/page.tsx` (safe page-level usage migration completed)
  - `app/app/components/InvoicesSection.tsx`
  - `app/approve/[id]/page.tsx`
  - `app/app/lib/local-persistence.ts` (created)
  - `app/app/lib/constants.ts`
- Completed scope:
  - Typed key groups for existing JobEstimate Pro localStorage keys.
  - Safe get/set/remove helpers.
  - JSON read/write helpers with fallback behavior.
  - Legacy `scopeguard_email` and `scopeguard_company` migration helper.
  - Existing localStorage keys and data shapes preserved.
- Remaining broader work:
  - Full server-backed saved estimates, jobs, invoices, budgets, actuals, and account/workspace persistence remain deferred.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 10

### 2.2 Reduce `app/app/page.tsx` Responsibility

- Why it matters: The main app file mixes UI rendering, API orchestration, local persistence, PDF generation, invoice creation, and job logic. This makes every change riskier.
- Files likely affected:
  - `app/app/page.tsx`
  - Existing components under `app/app/components/`
  - New helpers under `app/app/lib/`
- Risk level: Medium
- Difficulty: Large
- Suggested order: 11

### 2.3 Fix Repo-Wide Lint Hotspots Incrementally

- Status: Partial. Safe triage completed; broad cleanup remains deferred unless a specific runtime or launch-safety risk is found.
- Why it matters: Lint currently fails mostly from `any`, unused variables, and hook warnings. This makes CI less useful and hides real issues.
- Current triage result:
  - `npm run lint` was run and still fails due to deferred broad existing lint debt.
  - Lint count moved from 218 problems to 215 problems after small safe fixes.
  - `npx tsc --noEmit` passes.
  - Deferred categories include broad `no-explicit-any` cleanup, hook dependency rewrites, image optimization warnings, unused symbols, and large component prop typing.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/*.tsx`
  - `app/api/generate/route.ts`
  - `app/api/webhook/route.ts`
  - `app/approve/[id]/page.tsx`
- Completed safe fixes:
  - Removed unused `Metadata` import from `app/layout.tsx`.
  - Replaced duplicated invoice hydration `any` callbacks in `app/app/page.tsx` with `normalizeStoredInvoice(x: unknown)`.
- Guidance:
  - Keep future lint work narrow and risk-based.
  - Do not perform broad `any` rewrites, hook dependency rewrites, image conversions, unused-symbol cleanup, or component prop typing sweeps in launch-critical passes unless they are tied to a verified runtime issue.
- Risk level: Medium
- Difficulty: Large
- Suggested order: 12

### 2.4 Add Focused Tests for Invoice and Approval Helpers

- Status: Done for approval workflow regression tests and focused invoice helper tests.
- Why it matters: Deposit, tax, balance invoice, and approval-auto-invoice logic are important money workflows. They need tests before server persistence is introduced.
- Files likely affected:
  - `app/api/approvals/approvalWorkflow.test.ts`
  - `app/app/lib/invoices.test.ts`
  - `app/app/lib/types.ts`
- Risk level: Low
- Difficulty: Medium
- Suggested order: Completed

### 2.5 Add Safer Error Boundaries Around Plan/PDF Operations

- Status note: Browser-derived selected-page PDFs now render their reduced pages as `1..N` for image/vision fallback while preserving original source page provenance. Remaining work here is recovery polish for genuinely failed indexing/rendering cases.
- Status note: Plan Intelligence now reports evidence strength as Strong, Useful, or Review-only, including selected/indexed/skipped pages, text extraction, rendered image availability, hard quantity support, and confirmation-needed status. Estimate PDFs also include a compact customer-safe version of this plan evidence/readiness summary.
- Status note: Plan Intelligence Phase 1 observability/read status is complete. Per-page read statuses are estimator-only diagnostics for selected/skipped, indexed/read, text extracted/empty, image rendered/failed/not rendered, classification classified/weak/unknown, placeholder PDF rasterization, and original-PDF fallback limitations.
- Status note: Plan Intelligence Phase 2 sheet classification diagnostics are complete. Structured estimator-only deterministic roles now cover floor plan, finish schedule, fixture schedule, door schedule, window schedule, RCP, elevation, demo plan, legend, and unknown sheets without changing pricing or handoff behavior.
- Status note: Plan Intelligence Phase 3 table/schedule extraction diagnostics are complete. Deterministic estimator-only extraction covers finish schedules, fixture schedules, door schedules, window schedules, legends, and unknown/generic schedules from selected/read pages, preserving raw row text, confidence, and warnings without changing pricing or handoff behavior.
- Status note: Plan Intelligence Phase 4 room/finish matrix diagnostics are complete. Deterministic estimator-only extraction builds from extracted finish schedule tables only and captures room name/number, room type, wall/base/ceiling/floor finishes, notes, raw row text, confidence, and warnings without changing pricing or handoff behavior.
- Status note: Plan Intelligence Phase 5 repeated room package diagnostics are complete. Deterministic estimator-only extraction builds from `roomFinishMatrices` only, detects repeated guest rooms, bathrooms, corridors/units/rooms by room family plus finish signature, detects repeated finish combinations across generic room rows, and preserves source matrix/table/page/sheet row provenance, confidence, and warnings without changing pricing or handoff behavior.
- Status note: Plan Intelligence Phase 6 trade-specific quantity candidate diagnostics are complete. Deterministic review-only candidates now cover painting/wallcovering/flooring/base/ceiling finish rows, door/window/fixture schedule counts, and repeated room package counts from existing diagnostics, preserve provenance/confidence/assumptions/warnings, and remain ineligible for pricing.
- Status note: Plan Intelligence Phase 7 confidence/provenance gate diagnostics are complete. Deterministic estimator-only gates review `tradeQuantityCandidates` only, keep every gate `pricingEligibleNow: false`, classify candidates as blocked/review-only/future-candidate, and preserve required evidence, present evidence, blockers, warnings, and source provenance.
- Status note: Large-plan selected-page selection UX is complete as a UI/helper-only pass. PDF uploads now support From / To / Select range controls while preserving existing selected-page staging, Generate payloads, and analysis behavior.
- Status note: Large-plan selected-page readiness guidance is complete as a UI/helper-only pass. Original-fallback selected-page scalability is also complete: fallback PDFs with `selectedSourcePages` now avoid processing unselected pages while preserving source page provenance.
- Status note: Plan Review Summary clarity and plan-aware pre-generate scope warning are complete as a UI-only pass. The next safest large-plan work is audit-first whole-app production readiness, real-PDF QA, mobile usability, and estimator UI clarity. Deeper upload/staging architecture changes should remain future work unless QA proves the current architecture cannot support launch.
- Future Plan Intelligence work should keep actual pricing handoff activation deferred until manual QA and stronger confidence/provenance gates are proven; direct pricing influence from plan-derived candidates remains future work.
- Why it matters: Plan upload and PDF rendering are complex and can fail due browser, platform, or PDF issues. User-facing recovery should stay explicit.
- Files likely affected:
  - `app/lib/plan-upload.ts`
  - `app/app/components/PlanUploadsSection.tsx`
  - `app/api/plan-upload/route.ts`
  - `app/api/generate/lib/plans/*`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 14

## 3. Product Polish

### 3.1 Customer-Facing Estimate Result Mode

- Status: Done for the current launch polish pass.
- Why it matters: Advanced diagnostics are useful, but users need a clean estimator-facing summary and a separate advanced/debug area.
- Completed scope: Estimate results now open with a clean document summary card, Customer-Facing Scope, Estimate Review Notes, Estimator Diagnostics, collapsed Line Item Detail, and nested plan-to-price diagnostics.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/PricingSummarySection.tsx`
  - `app/app/lib/plan-pricing-carry.ts`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: Completed

### 3.2 Simplify Advanced Analysis Panels

- Status: Done for the current launch polish pass.
- Why it matters: The app has many analysis cards. Grouping them into clearer sections would make the product feel less experimental.
- Completed scope: Advanced analysis data is preserved but grouped behind clearer estimator diagnostics, collapsed line-item detail, and nested plan-to-price diagnostics.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/PhotoIntelligenceCard.tsx`
  - Possible new `AdvancedAnalysisSection` component file.
- Risk level: Low
- Difficulty: Medium
- Suggested order: Completed

### 3.3 Improve PDF Visual Hierarchy

- Status: Done for the current browser print-window launch pass.
- Why it matters: PDFs are the final customer artifact. The estimate should clearly show scope, estimator story, pricing, schedule, approvals, and payment terms.
- Files likely affected:
  - `app/app/page.tsx`
  - Future PDF helper files if extracted after launch.
- Completed scope:
  - Estimate PDFs now have improved document header hierarchy, customer/job metadata panels, stronger section labels, pricing card, and page-break avoidance.
  - Invoice PDFs now have an improved total-due block, bill-to/date panels, invoice summary card, stronger section labels, and page-break avoidance.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: Completed

### 3.4 Add Account/Entitlement Status Surface

- Status: Done. `/app` now shows saved email, Free/Pro/Unknown access state, usage count/free limit, remaining free generations, no-email guidance, and manual entitlement refresh via the existing `/api/entitlement` endpoint.
- Why it matters: Users need to know which email is active, whether they are upgraded, and what to do if payment is not reflected yet.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/success/page.tsx`
  - `app/api/entitlement/route.ts`
- Risk level: Low
- Difficulty: Small
- Suggested order: Completed

### 3.5 Product Copy Consistency Pass

- Status: Known payment page copy is subscription-oriented and current. Legacy `scopeguard_*` localStorage migration keys remain intentionally. `PRE_LAUNCH_SMOKE_TEST.md` now reflects the subscription checkout foundation and separates foundation smoke coverage from pending final subscription verification.
- Why it matters: Product-facing copy should consistently use JobEstimate Pro. Migration internals can keep legacy names when needed for data continuity.
- Files likely affected:
  - `app/page.tsx`
  - `app/app/page.tsx`
  - `app/success/page.tsx`
  - `app/cancel/page.tsx`
  - `README.md`
- Risk level: Low
- Difficulty: Small
- Suggested order: 18

### 3.6 Saved Estimate and Invoice Workflow Guidance

- Status: Done for the current launch polish pass.
- Why it matters: Users should understand where saved estimates and invoices come from, especially when an active job filter has no records yet.
- Completed scope:
  - Saved Estimates no longer disappears when the filtered history is empty.
  - Invoices no longer disappears when the filtered invoice list is empty.
  - Empty states explain that saved estimates appear after generation and invoices are created from Saved Estimates or Jobs.
  - Selected-job context is shown when applicable.
  - Existing buttons/actions remain intact when records exist.
- Files affected:
  - `app/app/components/SavedEstimatesSection.tsx`
  - `app/app/components/InvoicesSection.tsx`
  - `app/app/page.tsx`
- Risk level: Low
- Difficulty: Small
- Suggested order: Completed

### 3.7 PriceGuard Review / Estimate Intelligence QA

- Status: Done for the current focused QA polish pass.
- Why it matters: PriceGuard Review is now a core product positioning surface. It should stay deterministic, contractor-friendly, mobile-safe, and clearly separated from customer-facing PDF output unless intentionally changed later.
- Current first-version scope:
  - UI-side deterministic helper in `app/app/lib/priceguard-review.ts`.
  - Panel component in `app/app/components/PriceGuardReviewPanel.tsx`.
  - `/app` result workflow integration with pre-generation fallback state.
  - Scope-quality warnings are filtered against generated customer-facing estimate text to reduce over-warning when the generated scope already covers prep, materials, cleanup, protection, exclusions, approval, or work process language.
  - The helper recognizes baseboard/trim/molding scope, linear-foot quantity language, prep/preparation, caulk/fill/prime, install/measure/cut/finish workflow language, and site-visit-only schedule confidence.
  - No pricing math, generation, Plan Intelligence, PDF, approval, invoice, billing, API route, localStorage key, or saved data-shape changes.
- Future deeper work:
  - Stronger missed-scope heuristics.
  - More trade-specific risk notes.
  - Better confidence wording.
  - Customer-ready bid-defense export only if later product scope explicitly calls for it.
- Risk level: Low
- Difficulty: Small
- Suggested order: Completed

## 4. Server-Backed Features

### 4.1 Server-Backed Saved Estimates

- Why it matters: LocalStorage history is not reliable across devices and cannot support teams or full account recovery. Server-backed approval snapshots now cover shareable approvals, but full estimate persistence is still local-first.
- Files likely affected:
  - New API routes for estimates.
  - Supabase schema/migrations.
  - `app/app/page.tsx`
  - Persistence helpers.
  - `app/app/lib/types.ts`
- Risk level: High
- Difficulty: Large
- Suggested order: 19

### 4.2 Server-Backed Jobs

- Why it matters: Jobs are the organizing unit for estimates, invoices, budgets, actuals, and approvals. Server-backed jobs unlock real workflows.
- Files likely affected:
  - New API routes for jobs.
  - Supabase schema/migrations.
  - `app/app/components/JobsDashboardSection.tsx`
  - `app/app/page.tsx`
- Risk level: High
- Difficulty: Large
- Suggested order: 20

### 4.3 Shareable Approval Links

- Status: Implemented through Phase 4B.
- Why it matters: Approval links now use server-backed frozen proposal snapshots, long random public tokens with server-side token hashes, minimized customer-safe public reads, server approval submission/signature saving, owner-email plus owner-sync-token approval status sync, and approval-created draft invoice sync. Proposal, approval row, and approval-created invoice flows are duplicate-protected/idempotent. Further work should focus on tests, monitoring, and better UI/status polish rather than rebuilding the core shareable-link workflow.
- Security notes:
  - The owner sync token is stored client-side as `jobestimatepro_owner_sync_token`.
  - Supabase stores only the owner sync token hash.
  - This is not full authentication; user accounts/workspaces are still a future server-backed feature.
- Files likely affected:
  - `app/approve/[id]/page.tsx`
  - `app/api/approvals/*`
  - `app/app/page.tsx`
  - `app/app/components/SavedEstimatesSection.tsx`
  - Supabase schema/migrations.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 21

### 4.4 Server-Backed Invoices

- Why it matters: Approval-created draft invoice snapshots can now sync from Supabase, but full invoice management is still localStorage-backed. Invoices should eventually survive browser storage loss, be visible across devices, and support future payment collection.
- Files likely affected:
  - New invoice API routes.
  - `app/app/components/InvoicesSection.tsx`
  - `app/app/components/JobsDashboardSection.tsx`
  - `app/approve/[id]/page.tsx`
  - Supabase schema/migrations.
- Risk level: High
- Difficulty: Large
- Suggested order: 22

### 4.5 Server-Backed Business Profile

- Why it matters: Company settings should follow the user across sessions and devices.
- Files likely affected:
  - New profile API route.
  - `app/app/page.tsx`
  - Supabase schema/migrations.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 23

## 5. Premium Future Features

### 5.1 Billing Portal and Account Management

- Why it matters: Paid users need a way to manage billing, receipts, and subscription/account status after the pre-launch billing model is decided.
- Files likely affected:
  - `app/api/checkout/route.ts`
  - New billing portal API route.
  - `app/app/page.tsx`
  - Stripe/Supabase entitlement records.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 24

### 5.2 Server-Side PDF Generation

- Why it matters: Browser print-window PDFs are brittle. Server PDFs would support stable formatting, email attachments, and stored documents.
- Files likely affected:
  - New PDF API route.
  - Existing PDF HTML generation in `app/app/page.tsx`
  - Invoice/estimate PDF helpers.
  - Potential use of `pdfkit` or another renderer.
- Risk level: High
- Difficulty: Large
- Suggested order: 25

### 5.3 Better Plan Quantity Extraction

- Why it matters: Plan intelligence has strong structure and now reports evidence/readiness strength, but hard quantity extraction remains heuristic and is still the main blocker to estimator-grade confidence from complex plan sets.
- Files likely affected:
  - `app/api/generate/lib/plans/analysisHeuristics.ts`
  - `app/api/generate/lib/plans/visionFallback.ts`
  - `app/api/generate/lib/plans/mergeHeuristics.ts`
  - Tests under `app/api/generate/lib/plans/`
- Risk level: Medium
- Difficulty: Large
- Suggested order: 26

### 5.4 Client Portal

- Why it matters: A client portal could centralize approvals, invoices, payment status, and documents.
- Files likely affected:
  - New client-facing routes.
  - Server-backed estimates/invoices/approvals.
  - Auth/session layer.
- Risk level: High
- Difficulty: Large
- Suggested order: 27

### 5.5 Team/Multi-User Workspaces

- Why it matters: Contractors may need estimators, admins, and crews to access the same jobs and documents.
- Files likely affected:
  - Auth/session system.
  - Supabase schema for users/workspaces/roles.
  - All server-backed data routes.
  - App navigation and permissions.
- Risk level: High
- Difficulty: Large
- Suggested order: 28

### 5.6 Payments on Invoices

- Why it matters: Once invoices are server-backed, collecting deposits/final balances through Stripe would close the estimate-to-payment loop.
- Files likely affected:
  - Stripe checkout/payment routes.
  - Invoice routes.
  - Webhook handling.
  - Invoice UI.
  - Approval workflow.
- Risk level: High
- Difficulty: Large
- Suggested order: 29

### 5.7 Apple App Store / Native iOS Wrapper

- Status: Deferred until after launch validation.
- Why it matters: Native distribution adds App Store review, Apple platform policy, possible in-app purchase considerations, wrapper maintenance, and mobile-specific QA before the web product has validated retention, pricing, support load, and cost structure.
- Direction:
  - Do not build this before the PWA/web launch path is validated.
  - Revisit only after real users validate the product workflow, launch pricing, support burden, OpenAI/plan-rendering/storage costs, and the need for App Store acquisition.
  - Keep subscription planning web-first unless the launch-channel decision changes.
- Files likely affected later:
  - Native wrapper project if one is created.
  - App Store metadata/screenshots/review materials.
  - Billing/subscription architecture if Apple in-app purchase requirements become relevant.
- Risk level: High
- Difficulty: Large
- Suggested order: 30
