# JobEstimate Pro Product Audit Backlog

This is the master improvement tracker for product intelligence, estimator accuracy, trust, and launch readiness. Use it to improve JobEstimate Pro one focused task at a time without turning audit findings into broad rewrites.

Principles:

- Keep pricing authority, estimate generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, and Generate payload shape stable unless a task explicitly requires a later scoped change.
- Treat Plan Intelligence and Photo Intelligence as review support unless a future task proves reliable measured quantities with source provenance and regression coverage.
- Favor small UI/review-language safety passes before broad architecture changes.
- Preserve AI-generated intelligent step-by-step customer-facing scope descriptions as a core product strength. Materials, sequencing, and task-description detail should not be automatically flattened, shortened, removed, or rewritten by safety guards.
- Customer-facing scope guard work should detect and review unsupported expansion. It should stay warning-only / review-only unless a separate scoped task explicitly changes customer text.

## Current Priority Order

1. Next active smart-estimator audit: cross-trade backend scope-boundary regression review for by-others, owner-supplied, protection, coordination, and existing-condition language.
2. Continue real-PDF QA matrix coverage for plan evidence and customer-output safety.
3. Keep PriceGuard trade-specific missed-scope checks, Schedule Sequencing Review Guard, and warning-only AI scope protection under regression watch during real-world estimate QA.
4. Keep deeper Plan Intelligence story wording polish as future/post-launch unless real-PDF QA shows a launch-blocking trust issue.
5. Final pre-launch gate: complete Production Live Mode subscription payment/webhook entitlement verification before accepting public paid users.

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
- Recommended fix approach: Completed a first UI-side, review-only normalization pass for pre-generate scope-quality warnings and customer-scope electrical false-positive cleanup. Keep deeper backend/pricing scope interpretation changes out of scope until more real-world QA examples exist.
- Exact files/components involved: `app/app/lib/typed-scope-normalization.ts`, `app/app/lib/scope-quality-check.ts`, `app/app/lib/scope-quality-check.test.ts`, `app/app/lib/customer-scope-drift.ts`, `app/app/lib/customer-scope-drift.test.ts`
- What not to touch: Pricing authority, plan-derived pricing eligibility, saved data shapes, Generate payload shape, API routes, backend pricing logic, Customer Output Readiness behavior, or `result.text`.
- Tests or manual QA needed: Focused scope-quality and customer-scope drift tests; manual QA for excluded/by-others, protection-only, coordination-only, existing-condition, material/permit boundary, and true electrical work cases.
- Status: Done

Done note:

- Added a UI-side typed-scope normalization helper that splits typed scope into clauses and classifies included work, excluded/by-others work, protection-only language, coordination-only language, existing conditions, material responsibility, permit responsibility, and quantity/location signals.
- Scope-quality checks now use included-work clauses for trade work detection while boundary clauses still count for material responsibility, permit responsibility, exclusions, access/patching exclusions, and quantity/location support.
- Covered cases include `electrical by others`, `plumbing excluded`, `wall repair excluded`, `protect flooring`, `work around existing baseboards`, `owner supplies fixtures`, `GC to handle permits`, `demo by others`, `rooms 2032-2036`, `remove and reinstall toilet/faucet`, and narrow `touch-up only` scopes with clear area/surface.
- Customer-scope electrical false-positive cleanup now suppresses unsupported electrical warnings when generated Customer-Facing Scope only mentions coordination with the electrical trade, preventing/no interference, adjacent electrical components, or existing wiring/components to avoid or protect.
- True unsupported electrical warnings remain for electrical rough-in, install/run wiring, install/replace outlets/switches/receptacles/lights/light fixtures, add circuits, and panel/breaker work.
- Validation passed: `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts` with 24/24 passing, `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` with 39/39 passing, `npx tsc --noEmit`, and `git diff --check`.
- Manual QA passed for flooring protection, electrical coordination/interference language, existing electrical wiring avoidance, true electrical rough-in, true new outlet/switch/wiring, existing baseboard work-around language, remove/reinstall toilet/faucet, Customer Output Readiness placement, Pricing/PDF and schedule visibility, and detailed unchanged Customer-Facing Scope.
- This was UI-side/review-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, or Customer Output Readiness behavior.

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
- Tests or manual QA needed: PriceGuard helper tests for electrical, plumbing, flooring, drywall, painting, bathroom/tile; customer-scope false-positive cleanup tests; manual QA.
- Status: Done

Done note:

- PriceGuard Review now receives selected-trade context and adds review-only, trade-specific missed-scope guidance for painting, drywall, flooring, electrical, plumbing, bathroom/tile, wallcovering, carpentry, and general renovation.
- Warnings cover estimator review issues such as fixture supply, access, patching, permits/inspections, substrate prep, transitions, disposal, finish selections, waterproofing, texture match, protection, exclusions, and sequencing.
- A focused false-positive cleanup in the warning-only customer scope drift guard prevents adjacent trade context such as flooring protection, electrical interference avoidance, trade coordination, and working around door jambs/baseboards/transitions from triggering unsupported-trade warnings unless actual work is promised.
- True unsupported warnings remain for electrical rough-in, flooring install/repair, baseboard replacement, and carpentry expansion.
- Validation passed: `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts`, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts`, `npx tsc --noEmit`, and `git diff --check`.
- Manual QA passed for plumbing flooring-protection wording, plumbing electrical-interference wording, flooring door-jamb/closet/transition/baseboard-finish coordination, true electrical rough-in, true flooring install/repair, true baseboard/carpentry work, Customer Output Readiness placement, Pricing/PDF visibility, schedule visibility, and detailed unchanged Customer-Facing Scope.
- This was review-only/warning-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

#### Item: PriceGuard review false-positive watchlist

- Problem: More review signals can reduce trust if they over-warn after the generated estimate already addresses the issue.
- Why it matters: PriceGuard should feel like a senior estimator, not a generic checklist.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Maintain focused tests for warning resolution against typed scope plus generated result text.
- Exact files/components likely involved: `app/app/lib/priceguard-review.ts`, helper tests.
- What not to touch: Pricing math and generation behavior.
- Tests or manual QA needed: Regression tests for resolved warnings and no-paint-bias cases.
- Status: Done for current pass; keep under regression watch during real-world QA.

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

Done note:

- Real-world QA Customer Scope Drift cleanup is complete. The guard now catches true unsupported electrical expansion even when noisy `scopeXRay` split scopes exist.
- Fixed the real-app Case 1B issue where split entries such as `electrical` or `electrical coordination only` were treated as support and hid unsupported electrical drift.
- Unsupported electrical expansion remains visible when Customer-Facing Scope promises actual electrical work such as electrical rough-in, device adjustments, electrical fixture relocation, conduit penetration patching, disconnection/reinstallation of devices and wiring, or electrical scope/work that includes wiring, devices, conduit, fixtures, outlets, switches, circuits, panels, or breakers.
- Electrical unsupported drift remains visible when drywall drift is also present, while electrical coordination-only and avoid-interference language remains quiet.
- Case 7A Customer Scope Drift now passes with Trade Type = Painting: walls-only painting with ceiling/trim painting excluded is not treated as whole-painting exclusion, no unsupported drywall/painting warning appeared, and Customer-Facing Scope stayed painting-focused with exclusions preserved.
- Case 1B Plan Review Summary is acceptable for this pass with selected pages processed 8, selected pages read 1, pages with useful evidence 1, and review-only plan evidence language explaining that some selected pages may not render, extract, classify, or produce compact evidence.
- Validation passed: `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` with 57/57 passing, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` with 34/34 passing, `npx tsc --noEmit`, and `git diff --check`.
- Manual QA passed for Case 1B unsupported electrical visibility, Customer Output Readiness electrical support details, Case 7A painting drift suppression, detailed unchanged Customer-Facing Scope, and preserved exclusions.
- This was warning-only/review-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, layouts, or Customer Output Readiness behavior.

#### Item: Backend split-scope / scope-to-price diagnostic noise audit

- Problem: Case 7A painting QA still shows backend diagnostic noise where excluded/protection words are pulled into adjacent trade split scopes and pricing-prep signals.
- Why it matters: Even when Customer Scope Drift is now correct, noisy diagnostics such as General Renovation primary trade, `flooring_only_v1` anchor, adjacent split scopes, and flooring materials for a painting-style scope can reduce estimator trust.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed the smallest backend scope-boundary safety fix. Backend split-scope, mixed-renovation, and anchor eligibility now use included-work scope filtering so excluded/protection/coordination-only/existing-condition clauses do not create false trade signals.
- Exact files/components involved: `app/api/generate/lib/priceguard/scopeSplitter.ts`, `app/api/generate/lib/priceguard/scopeSplitter.test.ts`, `app/api/generate/route.ts`
- What not to touch: Pricing math, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, saved data, payload shape, API routes, layouts, or Customer Output Readiness behavior.
- Tests or manual QA needed: Targeted backend scope splitter tests, existing estimator tests, TypeScript, diff check, and manual retest for Case 7A plus a true painting + LVP mixed-scope control.
- Status: Done

Done note:

- Added backend included-work scope filtering in `scopeSplitter.ts`.
- `splitScopeByTrade()` now uses included-work scope text so excluded/by-others/protection/coordination-only/existing-condition clauses do not create false split-scope trades.
- `isMixedRenovation()` now checks included work only.
- PriceGuard anchor eligibility now receives included-work scope text, preventing false `flooring_only_v1` anchor matches from protection/exclusion wording.
- Case 7A with Trade Type = Painting now passes: primary trade stays painting, Pricing Method source stays AI, no `flooring_only_v1` anchor appears, split scopes only show painting, Materials List shows painting-style consumables/protection only, and Customer Scope Drift remains quiet.
- True mixed control still passes: `Paint walls in living room and install LVP flooring with transitions` remains General Renovation, splits into painting and flooring, uses `flooring_only_v1`, and shows flooring materials as intended.
- Validation passed: `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSplitter.test.ts` with 6/6 passing, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` with 34/34 passing, `npx tsc --noEmit`, and `git diff --check`.
- This did not change pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.

#### Item: Cross-trade backend scope-boundary regression review

- Problem: The Case 7A fix was intentionally narrow. Other trades may still have edge cases where by-others, owner-supplied, protection, coordination, or existing-condition language creates backend diagnostic or pricing-signal noise.
- Why it matters: The app should read messy contractor scope like a senior estimator and avoid treating exclusions or boundaries as included work.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Audit first with real-world examples across electrical, plumbing, flooring, drywall, carpentry, wallcovering, and bathroom/tile. Only implement additional tiny scope-boundary fixes if repeated false backend signals are confirmed.
- Exact files/components likely involved: `app/api/generate/lib/priceguard/scopeSplitter.ts`, `app/api/generate/route.ts`, backend estimator tests.
- What not to touch: Pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, payloads, API contracts, Customer Scope Drift, Customer Output Readiness layout, or measured plan pricing eligibility.
- Tests or manual QA needed: Targeted backend controls for true included work vs excluded/by-others/protection/coordination-only language by trade.
- Status: Next active smart-estimator audit

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
- Status: Done

Done note:

- Plan Review Summary raw-text cleanup is complete as a UI-only pass in `app/app/page.tsx`.
- Marina Dunes retest passed: the main Plan Review Summary no longer showed the long all-caps `WORLDMARK / SHEET INDEX / PROJECT SCOPE / PROJECT INFO` extracted text, fallback headline copy appeared correctly, Pages Needing Review and evidence counts remained visible, review-only/not-pricing-input language remained visible, and deeper Plan-to-price details / Estimator Diagnostics stayed available.
- `npx tsc --noEmit` and `git diff --check` passed.
- Broader/deeper Plan Intelligence story wording polish can remain future/post-launch unless later real-PDF QA finds a launch-blocking trust issue.

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

- Problem: Schedule output and generated scope can miss estimator review risks around dry-time, cure-time, rough-in inspections, access, patching, owner materials, and phase order.
- Why it matters: Contractors need sequencing awareness that protects schedule assumptions without changing price or customer-facing scope text.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed a UI-side, warning-only Schedule Sequencing Review Guard integrated through existing PriceGuardReview fields.
- Exact files/components involved: `app/app/lib/schedule-sequencing-review.ts`, `app/app/lib/schedule-sequencing-review.test.ts`, `app/app/lib/priceguard-review.ts`, `app/app/lib/priceguard-review.test.ts`, `app/app/page.tsx`
- What not to touch: Pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, or Customer Output Readiness behavior.
- Tests or manual QA needed: Focused schedule sequencing tests, existing PriceGuard/scope-quality tests, TypeScript check, diff check, and manual QA for dry-time, cure-time, rough-in, owner-material, and quiet simple-scope cases.
- Status: Done

Done note:

- Added a UI-side deterministic Schedule Sequencing Review Guard that receives selected trade, typed scope, generated result text, schedule, scope signals, and estimate sections where available.
- Sequencing notes surface only through existing PriceGuardReview fields: `contractorRiskNotes`, `scopeClarityWarnings`, `suggestedExclusions`, and `missedScopeWarnings` only when truly missing scope.
- Warning-only behavior covers patch/texture/paint dry-time and return visits; shower/tile waterproofing, grout cure, and fixture/accessory return coordination; electrical/plumbing rough-in access, inspection/code, and patch/close-up responsibility; flooring demo/subfloor/install/transitions/base/protection timing; wallcovering removal/prep/primer/layout/pattern/install timing; general renovation demo -> rough-in -> inspection -> close-up -> finishes; and owner-supplied fixture/material lead-time and return-trip risk.
- The guard suppresses notes when scope, generated result text, or schedule already addresses the sequencing issue.
- Validation passed: `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` with 9/9 passing, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` with 34/34 passing, `npx tsc --noEmit`, and `git diff --check`.
- Manual QA passed for patch-and-paint one-visit dry-time/return-visit guidance, quiet simple walls-only painting, shower waterproofing/tile cure and fixture-return sequencing guidance, owner-supplied plumbing fixture lead-time/return-trip guidance only, electrical rough-in access/inspection/patching guidance, and detailed unchanged Customer-Facing Scope.
- This was UI-side/warning-only estimator guidance and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, or Customer Output Readiness behavior.

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
- Status: Done

Done note:

- The generated result page now follows a primary estimator workflow: Customer-Facing Scope, Customer Output Readiness, Pricing/PDF, and Schedule before deeper estimator detail.
- Unsupported trade drift warnings remain visible above Customer-Facing Scope when present.
- Customer Output Readiness remains visible before Pricing when review items exist.
- PricingSummarySection remains prominent with editable pricing and Download Estimate PDF.
- ScheduleBlock, Estimated Completion, and ScheduleEditor are closer to Pricing/PDF.
- Full PriceGuard Review, Plan Review Summary, and Line Item Detail remain available inside a collapsed `Estimator review details` section.
- AdvancedAnalysisSection remains separately collapsed as `Estimator Diagnostics`.
- Jobs, Invoices, and Saved Estimates placement was unchanged.
- Validation passed: `npx tsc --noEmit` and `git diff --check`.
- Manual QA passed for a simple painting estimate and a Marina Dunes plan-assisted estimate.
- This was UI-only and did not change pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

### 11. Billing / Entitlement / Launch Readiness

#### Item: Final subscription payment/webhook entitlement verification

- Problem: Subscription billing foundation exists, but final payment, webhook delivery, and entitlement activation verification remain pending.
- Why it matters: Public paid launch depends on reliable subscription access.
- Risk level: Launch-blocking
- Priority: P0
- Recommended fix approach: Keep this as the final pre-launch gate, not the next active app-improvement task. Run `SUBSCRIPTION_TEST_CHECKLIST.md` against the final live setup and document the outcome before accepting real paid users. Preview/Test Mode verification has passed, so billing does not need to block continued product polish.
- Exact files/components likely involved: `app/api/checkout/route.ts`, `app/api/webhook/route.ts`, `app/api/entitlement/route.ts`, Stripe dashboard, Supabase entitlement tables.
- What not to touch: Pricing model, app feature logic, Plan Intelligence, PDFs, approvals unless verification finds a real bug.
- Tests or manual QA needed: Stripe checkout, webhook receipt, entitlement refresh, cancellation/payment-failed paths.
- Status: In progress

Done/PASS note:

- Preview/Test Mode subscription QA passed in a Vercel Preview deployment using Stripe test mode.
- Test-mode checkout opened for JobEstimate Pro at `$29/month`, test card `4242 4242 4242 4242` succeeded, success page appeared, Stripe test events were created, `checkout.session.completed` webhook resend returned `200 OK` with `{ "received": true }`, and `/app` Account & Access showed `Pro subscription active` / `Plan: Pro (active)` for `test-subscription-002@gmail.com`.
- The initial live/deployed checkout test-card failure was expected because production checkout used live Stripe values.

Remaining/PENDING note:

- Final Production Live Mode verification remains open as the last billing launch item. Do not claim public paid launch billing is fully verified until a real/live payment or approved live-mode verification is completed intentionally.

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

#### Item: Warning-only AI Scope Protection / Unsupported Scope Review Guard

- Problem: AI-polished Customer-Facing Scope can still drift from supported scope.
- Why it matters: Customer output should not overpromise unsupported work.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Add warning-only AI Scope Protection / Unsupported Scope Review Guard before send. Detect unsupported trade/scope expansion while preserving the AI-generated detailed step-by-step scope, materials, sequencing, and task-description value. Do not rewrite, flatten, shorten, remove, or mutate `result.text` unless a later task explicitly scopes customer-text cleanup.
- Exact files/components likely involved: `app/app/page.tsx`, `app/app/lib/customer-scope-drift.ts`, `app/app/lib/customer-scope-drift.test.ts`
- What not to touch: Generation prompt, pricing, PDFs/approvals unless task explicitly includes output changes.
- Tests or manual QA needed: Unsupported trade language regression cases.
- Status: Done

Done note:

- Commit `e2f1ef1` added the warning-only AI Scope Protection / Unsupported Scope Review Guard.
- The guard extends `app/app/lib/customer-scope-drift.ts` with structured estimator-facing review warnings via `buildCustomerScopeReviewGuard` while preserving `buildCustomerScopeTradeDriftWarning`.
- It detects explicit electrical/plumbing exclusion conflicts, repair exclusions, painting-to-drywall expansion, flooring-to-baseboard/painting/carpentry expansion, bathroom/tile rough-in expansion, and General Renovation over-support cases without mutating `result.text`.
- Customer-Facing Scope still shows one compact estimator-facing warning above the AI-generated scope when needed, and Customer Output Readiness receives capped supporting details.
- Validation passed: focused customer-scope drift tests passed 29/29, `npx tsc --noEmit` passed, and `git diff --check` passed. Manual QA covered painting minor patching, painting drywall/texture exclusion, flooring base shoe/transitions, and General Renovation excluded-scope expansion.
- The guard did not change pricing, generation behavior, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

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
