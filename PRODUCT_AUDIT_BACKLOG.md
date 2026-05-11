# JobEstimate Pro Product Audit Backlog

This is the master improvement tracker for product intelligence, estimator accuracy, trust, and launch readiness. Use it to improve JobEstimate Pro one focused task at a time without turning audit findings into broad rewrites.

Principles:

- Keep pricing authority, estimate generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, and Generate payload shape stable unless a task explicitly requires a later scoped change.
- Treat Plan Intelligence and Photo Intelligence as review support unless a future task proves reliable measured quantities with source provenance and regression coverage.
- Favor small UI/review-language safety passes before broad architecture changes.

## Current Priority Order

1. Reduce Plan Review Summary raw extracted text noise.
2. Simplify result-page hierarchy so pricing, review-before-sending, and send actions dominate.
3. Finish final subscription payment/webhook entitlement verification before public paid launch.
4. Add deterministic customer-facing scope guard / customer scope cleanup after launch-readiness UI warnings stay stable.
5. Continue real-PDF QA matrix coverage for plan evidence and customer-output safety.

## Pre-Launch Must-Fix / Should-Fix Items

### 1. Core Estimate Accuracy

#### Item: Trade-aware scope-quality review

- Problem: Scope-quality warnings were painting-biased and created irrelevant review notes for non-paint trades.
- Why it matters: Contractors need missing-info warnings that match the selected trade before trusting the estimate.
- Risk level: Low
- Priority: P0
- Recommended fix approach: Use selected trade plus conservative scope inference to produce review-only missing-info warnings by trade while preserving the existing `{ score, warnings }` shape.
- Exact files/components likely involved: `app/app/lib/scope-quality-check.ts`, `app/app/page.tsx`, `app/app/lib/priceguard-review.ts`, `app/app/lib/scope-quality-check.test.ts`
- What not to touch: Pricing math, generation behavior, API routes, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape.
- Tests or manual QA needed: Focused scope-quality tests for strong/weak painting, electrical, plumbing, flooring, drywall, bathroom/tile, general renovation, and wallcovering scopes; TypeScript check.
- Status: Done

#### Item: Add focused QA coverage for trade-aware warnings and PriceGuard propagation

- Problem: Trade-aware scope warnings affect pre-generate review, PriceGuard Review, and Customer Output Readiness; regressions could make warnings noisy or irrelevant.
- Why it matters: This is now a shared review signal, so it needs direct test coverage.
- Risk level: Low
- Priority: P0
- Recommended fix approach: Keep focused helper tests and add narrowly scoped PriceGuard propagation checks where warnings should be resolved by generated/review text.
- Exact files/components likely involved: `app/app/lib/scope-quality-check.test.ts`, `app/app/lib/priceguard-review.ts`
- What not to touch: Pricing, generation, PDFs, approvals, invoices, billing, Plan Intelligence logic.
- Tests or manual QA needed: Helper tests; one or two PriceGuard review tests; manual generate smoke for common trades.
- Status: Done

### 2. Typed Scope Intelligence

#### Item: Broaden unsupported trade drift detection beyond electrical

- Problem: Customer-Facing Scope can mention a trade that is not strongly supported by typed scope, selected trade, priced sections, scope detection, or plan readback.
- Why it matters: Unsupported customer-visible scope language can create trust and liability issues even when pricing is protected.
- Risk level: Medium
- Priority: P0
- Recommended fix approach: Extend the existing estimator-only unsupported drift warning pattern to plumbing, electrical, flooring, drywall, painting, bathroom/tile, demolition, carpentry, and wallcovering with conservative support checks.
- Exact files/components likely involved: `app/app/page.tsx`, `app/app/lib/customer-scope-drift.ts`, `app/app/lib/customer-scope-drift.test.ts`
- What not to touch: Result text, Generate payload, pricing, generation behavior, PDFs, approval output.
- Tests or manual QA needed: Focused helper tests passed 20/20; manual QA retest documented in `REAL_PDF_QA_CHECKLIST.md`; UI check confirmed warnings remain estimator-only.
- Status: Done

Done note:

- Commit `619cbf1` expanded unsupported customer scope drift detection beyond electrical.
- The detector warns on unsupported Customer-Facing Scope trade drift without changing `result.text`, blocking Generate, changing pricing, changing generation behavior, altering PDFs/approvals, or changing saved data/payload shapes.

#### Item: Typed scope normalization audit

- Problem: Some scope understanding is keyword-based and can confuse generic terms such as fixture, finish, trim, or renovation.
- Why it matters: Better typed-scope interpretation is the path toward a more estimator-like product.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Audit typed scope detectors and document false positives/false negatives before changing logic.
- Exact files/components likely involved: `app/api/generate/lib/priceguard/scopeSplitter.ts`, `app/api/generate/route.ts`, `app/app/lib/scope-quality-check.ts`
- What not to touch: Pricing authority, plan-derived pricing eligibility, saved data shapes.
- Tests or manual QA needed: Fixture ambiguity cases; general renovation cases; trade split smoke tests.
- Status: Not started

### 3. Trade-Aware Missing-Info Review

#### Item: Keep missing-info warnings concise in the pre-generate box

- Problem: Trade-aware warnings can become more relevant but also longer.
- Why it matters: Contractors should see the most important confirmation items without feeling blocked.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Limit visible pre-generate warnings or group them only if QA shows the box feels noisy.
- Exact files/components likely involved: `app/app/components/MeasurementsSection.tsx`, `app/app/lib/scope-quality-check.ts`
- What not to touch: Generate behavior, pricing, result text, PDFs, approvals.
- Tests or manual QA needed: Mobile and desktop scope-entry QA for each major trade.
- Status: Not started

### 4. Pricing / PriceGuard Safety

#### Item: PriceGuard trade-specific missed-scope checks

- Problem: PriceGuard has broad missing-scope checks but not enough trade-specific contractor risk checks.
- Why it matters: Underbidding risk is often trade-specific: fixture supply, patching, disposal, permit, access, substrate, transitions, or finish selections.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Add review-only, trade-aware notes from existing app state; avoid pricing changes.
- Exact files/components likely involved: `app/app/lib/priceguard-review.ts`, `app/app/components/PriceGuardReviewPanel.tsx`
- What not to touch: Pricing math, estimate generation, PDFs, approvals, saved data.
- Tests or manual QA needed: PriceGuard helper tests for electrical, plumbing, flooring, drywall, painting, bathroom/tile.
- Status: Not started

#### Item: PriceGuard review false-positive watchlist

- Problem: More review signals can reduce trust if they over-warn after the generated estimate already addresses the issue.
- Why it matters: PriceGuard should feel like a senior estimator, not a generic checklist.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Maintain focused tests for warning resolution against typed scope plus generated result text.
- Exact files/components likely involved: `app/app/lib/priceguard-review.ts`, helper tests.
- What not to touch: Pricing math and generation behavior.
- Tests or manual QA needed: Regression tests for resolved warnings and no-paint-bias cases.
- Status: In progress

### 5. Customer-Facing Output Safety

#### Item: Unsupported electrical scope drift warning

- Problem: Marina Dunes QA found unsupported electrical wording such as electrical coordination, electrical trade, and electrical rough-in in Customer-Facing Scope.
- Why it matters: Customer-visible unsupported trade language is a trust and scope-risk issue.
- Risk level: Medium
- Priority: P0
- Recommended fix approach: Show compact estimator-only warning when electrical appears in Customer-Facing Scope without strong support.
- Exact files/components likely involved: `app/app/page.tsx`
- What not to touch: Result text, pricing, generation, PDFs, approvals, saved data.
- Tests or manual QA needed: Marina Dunes retest; desktop and mobile visual QA.
- Status: Done

#### Item: Customer Output Readiness panel

- Problem: Estimator-only risks were scattered across PriceGuard, Plan Review, and customer-facing scope warnings.
- Why it matters: Contractors need one compact checkpoint before downloading or sending customer output.
- Risk level: Low
- Priority: P0
- Recommended fix approach: Summarize existing app-state risks near customer-output actions without blocking generate or changing output.
- Exact files/components likely involved: `app/app/page.tsx`
- What not to touch: PDFs, approvals, pricing, generation, saved data, Generate payload.
- Tests or manual QA needed: Desktop/mobile retest with unsupported trade wording and weak plan evidence.
- Status: Done

#### Item: Improve assumptions/exclusions visibility before PDF and approval

- Problem: Important assumptions and exclusions can be present in diagnostics but not prominent enough before customer output.
- Why it matters: Assumptions and exclusions protect the contractor and reduce customer confusion.
- Risk level: Medium
- Priority: P0
- Recommended fix approach: UI-only estimator checkpoint that highlights assumptions/exclusions already available in PriceGuard before PDF/approval actions, with compact deduped details in Customer Output Readiness.
- Exact files/components likely involved: `app/app/page.tsx`
- What not to touch: PDF content, approval content, pricing, generation behavior, saved data shapes.
- Tests or manual QA needed: Manual proposal-send flow with thin assumptions and exclusions; supported painting scope; unsupported General Renovation drift case; TypeScript check.
- Status: Done

Done note:

- Customer Output Readiness dedupe/grouping cleanup is complete. It keeps the panel as a compact pre-send checklist, dedupes details across readiness items, caps details at 2 per item, caps the panel at 6 items, keeps unsupported trade wording visible, and makes Assumptions / exclusions a clearer pre-send boundary checkpoint.
- Manual QA was documented in `REAL_PDF_QA_CHECKLIST.md` Test Entry 9. `npx tsc --noEmit` and `git diff --check` passed.
- The cleanup did not change pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

### 6. Plan Intelligence / Plan Review Support

#### Item: Pages Needing Review drilldown

- Problem: Contractors could not quickly tell why selected-page plan evidence was weak or review-only.
- Why it matters: Weak plan evidence must be explainable without implying measured takeoff support.
- Risk level: Low
- Priority: P0
- Recommended fix approach: Add compact selected-page drilldown under Pages read using existing read status data.
- Exact files/components likely involved: `app/app/page.tsx`
- What not to touch: Plan extraction, pricing, upload/staging, PDFs, approvals, saved data.
- Tests or manual QA needed: Marina Dunes desktop and iPhone/mobile retests.
- Status: Done

#### Item: Reduce Plan Review Summary raw extracted text noise

- Problem: Real PDFs can show long raw all-caps or path-like extracted strings in plan summaries.
- Why it matters: Noisy plan text makes the app look less trustworthy even when review-only safeguards are correct.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Suppress or clean raw evidence display in UI while preserving source/provenance diagnostics in deeper details.
- Exact files/components likely involved: `app/app/page.tsx`, `app/app/lib/plan-pricing-carry.ts`
- What not to touch: Plan extraction logic, pricing influence, candidates, gates, PDFs unless separately scoped.
- Tests or manual QA needed: Marina Dunes selected-page QA; mobile visual check.
- Status: Not started

#### Item: Clarify selected pages processed vs useful evidence found

- Problem: QA found selected-page counts can feel inconsistent when selected pages differ from useful/readable evidence pages.
- Why it matters: Contractors need to understand what the app reviewed and what it could not use.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: UI copy/count labeling only; separate selected, read/indexed, and useful-evidence counts.
- Exact files/components likely involved: `app/app/page.tsx`, evidence-strength display helpers.
- What not to touch: Plan Intelligence backend, pricing, upload payloads, saved data.
- Tests or manual QA needed: Marina Dunes 5-page and 8-page tests.
- Status: Not started

### 7. Photo Intelligence

#### Item: Clarify photo support as review signal only

- Problem: Photo quantity hints may help but are not reliable enough for autonomous pricing authority.
- Why it matters: Users should not assume photos measured the job.
- Risk level: Low
- Priority: P2
- Recommended fix approach: Keep wording focused on visual support, condition notes, and estimator confirmation.
- Exact files/components likely involved: `app/app/components/PhotoIntelligenceCard.tsx`, `app/app/page.tsx`
- What not to touch: Photo analysis backend, pricing authority, PDFs unless separately scoped.
- Tests or manual QA needed: Photo-assisted estimate QA with and without measurement reference.
- Status: Not started

### 8. Scheduling

#### Item: Schedule assumptions review language

- Problem: Schedule output is useful but can look more precise than the underlying crew/calendar assumptions support.
- Why it matters: Contractors need a defensible schedule range, not a false commitment.
- Risk level: Low
- Priority: P2
- Recommended fix approach: UI/review copy that labels schedule as estimator-confirmed assumptions unless crew days, visits, and calendar days are strong.
- Exact files/components likely involved: `app/app/page.tsx`, schedule display/edit components.
- What not to touch: Schedule calculation, pricing, PDFs unless separately scoped.
- Tests or manual QA needed: Generate estimates with thin and detailed schedule data.
- Status: Not started

### 9. PDF / Proposal / Approval Readiness

#### Item: Approval-page customer wording audit

- Problem: Approval pages depend on Customer-Facing Scope being safe and accurate.
- Why it matters: Approval creates customer commitment around the displayed scope and price.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Audit approval page copy and keep any changes customer-safe and narrow.
- Exact files/components likely involved: `app/approve/[id]/page.tsx`, `app/api/approvals/**`
- What not to touch: Approval persistence, token behavior, billing, invoices, saved data shapes.
- Tests or manual QA needed: Approval link creation, cross-device approval, approval sync, approval-created invoice import.
- Status: Not started

### 10. Workflow Speed And Mobile Usability

#### Item: Simplify result-page hierarchy

- Problem: The result page contains many panels and can feel like diagnostics are competing with the main send workflow.
- Why it matters: Contractors need a fast path: price, review before sending, edit, send.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: UI-only hierarchy pass that keeps content but makes pricing, Customer Output Readiness, and send actions visually dominant.
- Exact files/components likely involved: `app/app/page.tsx`, `PricingSummarySection`, result display components.
- What not to touch: PDFs, approvals, pricing, generation, saved data.
- Tests or manual QA needed: Desktop and iPhone result-page QA; ensure no overlap or hidden send actions.
- Status: Not started

### 11. Billing / Entitlement / Launch Readiness

#### Item: Final subscription payment/webhook entitlement verification

- Problem: Subscription billing foundation exists, but final payment, webhook delivery, and entitlement activation verification remain pending.
- Why it matters: Public paid launch depends on reliable subscription access.
- Risk level: Launch-blocking
- Priority: P0
- Recommended fix approach: Run `SUBSCRIPTION_TEST_CHECKLIST.md` against test/live setup and document outcome.
- Exact files/components likely involved: `app/api/checkout/route.ts`, `app/api/webhook/route.ts`, `app/api/entitlement/route.ts`, Stripe dashboard, Supabase entitlement tables.
- What not to touch: Pricing model, app feature logic, Plan Intelligence, PDFs, approvals unless verification finds a real bug.
- Tests or manual QA needed: Stripe checkout, webhook receipt, entitlement refresh, cancellation/payment-failed paths.
- Status: Not started

## Post-Launch Improvements

### 1. Core Estimate Accuracy

#### Item: Calibrate deterministic engines with real job examples

- Problem: Deterministic pricing engines are strongest with explicit quantities but still need field calibration.
- Why it matters: Better calibration makes the app feel more like a senior estimator over time.
- Risk level: Medium
- Priority: P2
- Recommended fix approach: Collect anonymized job examples and adjust engine assumptions in small tested batches.
- Exact files/components likely involved: `app/api/generate/lib/priceguard/*Engine.ts`, estimator tests.
- What not to touch: Broad pricing architecture or plan-derived pricing eligibility.
- Tests or manual QA needed: Engine-specific regression tests and before/after pricing review.
- Status: Not started

### 5. Customer-Facing Output Safety

#### Item: Deterministic customer-facing scope guard

- Problem: AI-polished Customer-Facing Scope can still drift from supported scope.
- Why it matters: Customer output should not overpromise unsupported work.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Add deterministic post-generation review or warning before send; do not rewrite customer text until separately scoped.
- Exact files/components likely involved: `app/app/page.tsx`, possible new client helper.
- What not to touch: Generation prompt, pricing, PDFs/approvals unless task explicitly includes output changes.
- Tests or manual QA needed: Unsupported trade language regression cases.
- Status: Not started

### 6. Plan Intelligence / Plan Review Support

#### Item: Real-PDF QA matrix

- Problem: Plan Intelligence behavior varies by PDF quality, page selection, and sheet type.
- Why it matters: Real plan QA catches trust issues that synthetic tests miss.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Maintain a small real-PDF QA matrix covering selected-page behavior, evidence clarity, mobile readability, and review-only language.
- Exact files/components likely involved: `REAL_PDF_QA_CHECKLIST.md`, plan UI surfaces.
- What not to touch: Plan extraction or pricing unless a scoped bug is confirmed.
- Tests or manual QA needed: Marina Dunes plus 2-3 additional contractor PDFs.
- Status: In progress

### 9. PDF / Proposal / Approval Readiness

#### Item: Proposal assumptions/exclusions polish

- Problem: Browser-generated PDFs are usable but assumptions and exclusions may need stronger customer-facing hierarchy.
- Why it matters: The proposal is the customer's main artifact.
- Risk level: Medium
- Priority: P2
- Recommended fix approach: After UI readiness is stable, add customer-safe assumptions/exclusions polish to PDF output.
- Exact files/components likely involved: `app/app/page.tsx`
- What not to touch: Pricing, generation, approval persistence, invoice logic.
- Tests or manual QA needed: Browser PDF visual QA on desktop/mobile print flows.
- Status: Not started

## Future Advanced Estimator Features

### Plan Intelligence / Plan Review Support

#### Item: Automatic measured plan takeoff

- Problem: Current plan candidates are review-only and not measured takeoff support.
- Why it matters: Automatic takeoff would be valuable but dangerous without reliable measurement/provenance.
- Risk level: High
- Priority: Future
- Recommended fix approach: Defer until page-level geometry, measurement calibration, confidence thresholds, manual confirmation, and real-PDF regression coverage exist.
- Exact files/components likely involved: `app/api/generate/lib/plans/**`, plan UI, estimator pricing handoff.
- What not to touch: Current pricing eligibility or review-only candidate gates.
- Tests or manual QA needed: Large real-PDF benchmark set with expected quantities.
- Status: Deferred

#### Item: Plan-derived pricing eligibility

- Problem: Plan-derived candidates are intentionally not pricing inputs today.
- Why it matters: Pricing from weak plan evidence could underbid or overpromise.
- Risk level: High
- Priority: Future
- Recommended fix approach: Keep all plan candidates `eligibleForPricing: false` until measured takeoff reliability is proven.
- Exact files/components likely involved: `app/api/generate/lib/plans/**`, `app/api/generate/lib/estimator/**`
- What not to touch: Current `pricingEligibleNow: false` safety gate.
- Tests or manual QA needed: Provenance, measurement, confidence, and estimator confirmation test suite.
- Status: Deferred

### Photo Intelligence

#### Item: Photo-based pricing authority

- Problem: Photos can provide condition and visual signals but not reliable measured quantities.
- Why it matters: Pricing authority from photos would create estimate accuracy risk.
- Risk level: High
- Priority: Future
- Recommended fix approach: Defer until photo measurement references, calibration, uncertainty ranges, and manual confirmation are robust.
- Exact files/components likely involved: Photo analysis backend, app photo UI, pricing handoff.
- What not to touch: Current deterministic pricing authority.
- Tests or manual QA needed: Photo benchmark set with measured ground truth.
- Status: Deferred

### Scheduling

#### Item: Full crew scheduling/calendar

- Problem: Current schedule is proposal-level, not a capacity-aware crew calendar.
- Why it matters: Full scheduling is a separate product surface with dependencies, availability, inspections, and procurement.
- Risk level: High
- Priority: Future
- Recommended fix approach: Defer until estimate/proposal workflow is validated with users.
- Exact files/components likely involved: Future calendar, jobs, crew, schedule modules.
- What not to touch: Current schedule display unless scoped.
- Tests or manual QA needed: Crew availability and dependency workflow tests.
- Status: Deferred

### PDF / Proposal / Approval Readiness

#### Item: Server-side PDF rebuild

- Problem: Browser print-window PDFs are brittle compared with server-side document generation.
- Why it matters: Server PDFs may be needed later for consistency and branding.
- Risk level: Medium
- Priority: Future
- Recommended fix approach: Defer until browser PDF output becomes a real blocker.
- Exact files/components likely involved: Future PDF service route, proposal rendering templates.
- What not to touch: Current browser PDF flow before launch.
- Tests or manual QA needed: PDF visual regression checks.
- Status: Deferred

#### Item: Full customer portal

- Problem: Approval links are useful but not a full customer portal.
- Why it matters: Portal scope expands support, auth, messaging, and payment expectations.
- Risk level: High
- Priority: Future
- Recommended fix approach: Defer until approval workflow usage validates demand.
- Exact files/components likely involved: Future customer account routes, approvals, invoices, payments.
- What not to touch: Current approval link flow.
- Tests or manual QA needed: Auth, permissions, proposal access, invoice/payment workflows.
- Status: Deferred

### Workflow Speed And Mobile Usability

#### Item: Native iOS/App Store work

- Problem: Native distribution adds App Store, wrapper, and payment complexity.
- Why it matters: It can distract from validating the web/PWA product.
- Risk level: High
- Priority: Future
- Recommended fix approach: Defer until real user validation and mobile acquisition strategy are clearer.
- Exact files/components likely involved: Future native wrapper, app store setup, mobile-specific behavior.
- What not to touch: Current PWA/web launch path.
- Tests or manual QA needed: Native device QA if ever started.
- Status: Deferred

### Billing / Entitlement / Launch Readiness

#### Item: Multi-user workspace/auth

- Problem: Current workspace is local-first with server-backed approvals only.
- Why it matters: Teams need server-backed accounts, permissions, and cross-device data.
- Risk level: High
- Priority: Future
- Recommended fix approach: Defer until single-user workflow and billing are validated.
- Exact files/components likely involved: Future auth, database schema, jobs/estimates/invoices persistence.
- What not to touch: Current localStorage keys and approval sync before a full migration plan.
- Tests or manual QA needed: Auth, permissions, migration, server persistence tests.
- Status: Deferred
