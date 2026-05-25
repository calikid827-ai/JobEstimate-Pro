# JobEstimate Pro Roadmap

This roadmap is based on `FEATURE_INVENTORY.md`. It prioritizes pre-launch production readiness first, then feature completion, stability, polish, server-backed workflows, and premium future capabilities. `PRODUCT_AUDIT_BACKLOG.md` is the master tracker for product intelligence, estimator accuracy, trust, and launch-readiness improvements from the full product audit.

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
- Billing status: Preview/Test Mode subscription QA has passed. Final Production Live Mode Stripe subscription payment/webhook entitlement verification remains the final pre-launch gate before accepting public paid users, not the next active app-improvement task.
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
- Billing implementation now follows this direction through the web/PWA Stripe Checkout path. Preview/Test Mode payment/webhook/entitlement verification has passed; final Production Live Mode verification is still required as the final public paid launch gate.

## Current Next Active Tasks

1. NEXT: Use `PRODUCT_AUDIT_BACKLOG.md` as the master improvement tracker and work the next launch-safe product intelligence task one focused pass at a time.
2. Next active smart-upgrade direction: browser/mobile visual QA for Crew Planning and the reduced/compact Estimator Review flow, Crew Planning V1 polish audit after real-device QA, Crew Planning V2 daily work-plan audit only, Crew Planning hotel/multi-unit production board audit only, Smart Questions V2B client-only authority-status readback, Smart Questions V2B server/API authority audit only, company intelligence / saved-estimate learning audit, camera measuring prototype audit, voice-to-scope draft audit, or plan-to-scope reconciliation audit. Typed scope remains the required scope-control anchor. Avoid actual pricing-authoritative or labor-total changes unless explicitly scoped, and keep Evidence Authority internal/debug-only until normal API, saved estimate, UI, and PDF/customer-output exposure are separately scoped.
3. Keep final Production Live Mode subscription verification using `SUBSCRIPTION_TEST_CHECKLIST.md` pending as the final pre-launch gate before accepting public paid users.
4. Keep real-PDF QA matrix coverage for plan evidence and customer-output safety under regression watch.
5. Keep PriceGuard trade-specific missed-scope guidance, Schedule Sequencing Review Guard, and warning-only AI scope protection under regression watch while preserving detailed AI-generated step-by-step customer scope prose as a core product strength.

Completed pre-launch task kept visible:

- DONE: Mobile core workflow polish for estimate input, plan upload/page selection, pricing summary, saved estimates, approval sync, jobs, and invoices.
- DONE: Estimate/invoice PDF visual hierarchy polish for browser-generated estimate and invoice PDFs.
- DONE: Advanced analysis customer-facing mode separates the clean estimate result summary from estimator diagnostics.
- DONE: First-version deterministic PriceGuard Review / Estimate Intelligence panel is implemented in `/app`. It computes UI-side review notes from existing estimate state, including score/level, missed-scope warnings, labor/material confidence notes, scope clarity warnings, suggested exclusions, customer-ready price defense notes, contractor-only risk notes, and a pre-generation fallback state. It does not change pricing math, generation, PDFs, approvals, invoices, billing, API routes, or saved data shapes.
- DONE: PriceGuard Review QA false-positive reduction pass is complete. The helper now filters scope-quality warnings against generated customer-facing estimate text and better recognizes trim/baseboard work, linear-foot quantities, prep/workflow language, and site-visit-only schedule confidence.
- DONE: UI-only Estimator Review noise reduction is complete. Estimator Review Summary is now the primary review hub, Customer Output Readiness sits below the summary and Quick Clarifications as compact/collapsed details that auto-open for critical unsupported trade/scope drift, PriceGuard Review and Estimator Diagnostics remain available but collapsed, and nested diagnostics such as Scope-to-Price X-Ray, Materials List, Area Scope Breakdown, and Profit Protection are collapsed by default. This reduced duplicate review messaging without changing backend/API/saved/PDF/pricing/prompt/result/materials/deterministic/billing behavior; Smart Questions remain local-only and non-pricing-authoritative, and Evidence Authority remains internal/debug-only.
- DONE: UI-only Estimator Review Summary compactness is complete. The primary review hub now hides empty Photo / Plan Notes and Excluded / By Others cards, turns Advanced Details into a footer line, caps visible bullets to 2 per section, dedupes exact summary text across cards, reduces repeated measurement/surface and boundary/exclusion confirmation bullets, and shows only the strongest margin/risk item in Profit / Margin Checks. Detailed warnings remain available below in Customer Output Readiness, PriceGuard Review, Estimator Diagnostics, Scope-to-Price X-Ray, Materials List, Area Scope Breakdown, and Profit Protection. No backend/API/saved/PDF/pricing/prompt/result/materials/deterministic/billing behavior changed; Smart Questions remain local-only and non-pricing-authoritative, and Evidence Authority remains internal/debug-only.
- DONE: Crew Planning V1 client-only implementation is complete in commit `Add client crew planning panel`. `buildCrewPlanningReadback()` and focused tests were added, and the estimator-only `data-no-print` Crew Planning panel appears after Estimated Schedule / schedule editor and before `EstimatorReviewSummaryPanel`. It uses existing client-side data only, is collapsed for simple one-visit scopes, and auto-opens only for real scheduling risks such as return trips, dry/cure/coat sequencing, access/staging or occupied-space constraints, multi-visit schedules, and hotel/multi-unit rolling production. The readback includes `recommendedCrewSize`, `crewDayBasis`, `durationRange`, Small crew / Standard crew / Push schedule options, `sequence`, `bottlenecks`, `risks`, `basis`, `estimatorOnly: true`, `affectsPricing: false`, and `hasSchedulingRisks`; simple scopes like “Paint 3 bedrooms” get contractor-friendly prep/paint/cleanup planning, while hotel/multi-unit language gets rolling-production, room-release, staging, prep/finish/punch, and planning-only repeated-room notes. Crew Planning is not sent to `/api/generate`, not saved to history/localStorage, and not included in PDFs/customer output. No backend/API/saved/PDF/pricing/`pricingSource`/pricing-owner/labor-total/prompt/`result.text`/materials/deterministic/billing behavior changed; Smart Questions remain local-only and non-pricing-authoritative, and Evidence Authority remains internal/debug-only.
- DONE: Focused UI/client safety polish is complete in commit `Polish crew planning and flooring protection review`. Customer Scope Drift now treats protection-only flooring language such as flooring being protected, protected with drop cloths, protect floors with drop cloths, covered floors, and drop cloths over flooring as protection context instead of unsupported flooring scope, so Customer Output Readiness no longer auto-opens from that wording. True unsupported flooring work still warns for install, replace, repair, remove, level, underlayment, and flooring demolition. Crew Planning now infers painting when selected trade is General Renovation but typed scope is painting-heavy, and missing crew-day/duration labels use clearer copy such as “Not estimated yet,” “2 visits shown; work days need confirmation,” and “Work days need confirmation.” This was UI/client-only; Crew Planning remains estimator-only, not pricing-authoritative, not sent to `/api/generate`, not saved, not included in PDFs/customer output, and `affectsPricing: false`. No backend/API/saved/PDF/pricing/prompt/`result.text`/materials/deterministic/billing behavior changed; Smart Questions remain local-only and non-pricing-authoritative, and Evidence Authority remains internal/debug-only.
- DONE: PriceGuard trade-specific missed-scope review pass is complete. PriceGuard Review now uses selected-trade context to add warning-only estimator guidance for painting, drywall, flooring, electrical, plumbing, bathroom/tile, wallcovering, carpentry, and general renovation risks such as fixture supply, access, patching, permits/inspections, substrate prep, transitions, disposal, finish selections, waterproofing, texture match, protection, exclusions, and sequencing. A small customer-scope drift false-positive cleanup suppresses adjacent-trade context such as flooring protection, electrical interference avoidance, coordination, and working around door jambs/baseboards/transitions while preserving true warnings for electrical rough-in, flooring install/repair, baseboard replacement, and carpentry expansion. Validation and manual QA passed. This was review-only/warning-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.
- DONE: Typed scope normalization and customer-scope electrical false-positive cleanup are complete. The UI-side normalization helper classifies typed scope clauses as included work, excluded/by-others, protection-only, coordination-only, existing condition, material responsibility, permit responsibility, and quantity/location signals for pre-generate scope-quality warnings. Customer Scope Drift now suppresses electrical coordination/protection-only language while preserving true unsupported electrical warnings. Validation passed with scope-quality tests 24/24, customer-scope drift tests 39/39, `npx tsc --noEmit`, and `git diff --check`; manual QA passed. This was UI-side/review-only and preserved detailed AI-generated Customer-Facing Scope prose in `result.text`.
- DONE: Schedule Sequencing Review Guard is complete. The UI-side, warning-only guard integrates through existing PriceGuardReview fields and uses selected trade, typed scope, generated result text, schedule, scope signals, and estimate sections where available. It reviews patch/texture/paint dry-time and return visits, shower/tile waterproofing and grout cure, electrical/plumbing rough-in access/inspection/patching, flooring demo/subfloor/install/transitions/base/protection timing, wallcovering removal/prep/primer/layout/pattern/install timing, general renovation phase order, and owner-supplied material lead-time/return-trip risk. Validation passed with schedule sequencing tests 9/9, existing estimator tests 34/34, `npx tsc --noEmit`, and `git diff --check`; manual QA passed. This preserved detailed AI-generated Customer-Facing Scope prose in `result.text` and did not change pricing, generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, or Customer Output Readiness behavior.
- DONE: Real-world QA Customer Scope Drift cleanup is complete. Noisy `scopeXRay` split-scope entries such as `electrical` or `electrical coordination only` no longer suppress true unsupported electrical drift. Case 1B now shows unsupported electrical expansion when Customer-Facing Scope promises electrical rough-in, device adjustments, fixture relocation, conduit penetration patching, or device/wiring work, including when drywall drift is also present. Case 7A with Trade Type = Painting passes without unsupported drywall/painting false positives. Validation passed with customer-scope drift tests 57/57, existing estimator tests 34/34, `npx tsc --noEmit`, and `git diff --check`; manual QA passed. This was warning-only/review-only and preserved detailed AI-generated Customer-Facing Scope prose in `result.text`.
- DONE: Backend scope-boundary safety fix is complete. Backend included-work scope filtering now prevents excluded/by-others/protection/coordination-only/existing-condition clauses from creating false split-scope trades, mixed-renovation promotion, false `flooring_only_v1` anchor eligibility, or flooring materials for the Case 7A painting scope. Case 7A now stays painting with painting-style materials only, while the true mixed painting + LVP control still splits into painting/flooring and uses `flooring_only_v1` as intended. Validation passed with backend scope splitter tests 6/6, existing estimator tests 34/34, `npx tsc --noEmit`, and `git diff --check`; manual QA passed. This preserved detailed Customer-Facing Scope / `result.text` and did not change pricing formulas or generation behavior.
- DONE: Cross-trade backend scope-boundary regression fix is complete. `getIncludedScopeText()` now filters boundary clauses at the sentence/segment level so by-others, excluded, protection-only, coordination-only, existing-condition, and owner-supplied language does not leave orphan trade nouns as included scope. Tile and wallcovering splitter recognition were added so true tile/waterproofing and wallcovering prep/primer scopes stay trade-aware. Validation passed with backend scope splitter tests 18/18, existing estimator tests 34/34, `npx tsc --noEmit`, and `git diff --check`; manual retest passed across plumbing, electrical, flooring, drywall, bathroom/tile, wallcovering, carpentry, and true mixed painting + LVP. This preserved detailed Customer-Facing Scope / `result.text` and did not change pricing formulas, generation behavior, or broad backend pricing semantics.
- DONE: Scope-to-Price Consistency Review Guard false-positive cleanup is complete. The UI-side warning-only guard now treats painting prep consumables such as caulk, spackle, filler, and masking tape as painting prep rather than unsupported drywall materials; avoids treating generic flooring adhesive / misc install supplies as wallcovering materials; and keeps wallcovering wall prep and primer in wallcovering context rather than separate painting work. True unsupported drywall and wallcovering material warnings are preserved. Validation passed with consistency guard tests 12/12, existing estimator tests 35/35, `npx tsc --noEmit`, and `git diff --check`; manual QA passed for the first three retest PDFs. This preserved detailed Customer-Facing Scope / `result.text` and did not change pricing, generation behavior, PDFs, billing, layouts, API contracts, or backend pricing semantics.
- DONE: Case 1 Painting real-world QA false-positive cleanup is complete. Walls-only painting with drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry excluded now stays painting-only across Customer Scope Drift, Scope-to-Price diagnostics, schedule/phase logic, and Estimate Defense. Coordination with ongoing drywall/carpentry work is treated as coordination-only context, excluded adjacent trade terms no longer create false multi-trade coordination or flooring/trim/baseboard sequencing, and excluded drywall/texture wording no longer creates `Primer / sealer after patching`. Manual retest passed for Case 1 Painting, and the true patch-and-paint control still shows drywall patching, primer, patch/texture dry-time, drywall dry/return, and drywall/painting split scopes. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing formulas, backend pricing semantics, PDFs, billing, layouts, API contracts, or measured plan pricing eligibility.
- DONE: Remaining real-world QA false-positive cleanup across Cases 4, 6, 7, and 8 is complete. Electrical vanity-light/rough-in scopes stay electrical-only; bathroom/tile demo/backer/membrane/tile-trim scope stays tile/bathroom without false plumbing, flooring, or General Renovation diagnostics; General Renovation wallcovering-only scope now receives wallcovering guidance instead of bathroom/tile or broad renovation sequencing noise; and carpentry baseboard removal/demolition wording is treated as normal baseboard replacement prep. True mixed scopes and true unsupported warnings remain preserved. Validation and manual retest passed. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing formulas, backend pricing semantics, PDFs, billing, layouts, API contracts, or measured plan pricing eligibility.
- DONE: Phase 1 EstimatorScopeFacts is complete in commit `b8d780f`. The shared deterministic text-only helper centralizes included work, excluded/by-others, protection-only, coordination-only, existing/to-remain, material responsibility, patch/texture, tile trim, wallcovering prep, baseboard replacement/removal, and true mixed-trade facts. `typed-scope-normalization.ts` consumes it internally while preserving public behavior. Validation passed with EstimatorScopeFacts tests 9/9, Scope-to-Price Consistency tests 18/18, Customer Scope Drift tests 71/71, Schedule Sequencing tests 11/11, existing estimator tests 38/38, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, layouts, API contracts, backend route diagnostics, Customer Scope Drift, Schedule Sequencing, `scopeSplitter`, or materials generation.
- DONE: Phase 2 EstimatorScopeFacts migration for Scope-to-Price Consistency Review is complete. The warning-only consistency guard now consumes `buildEstimatorScopeFacts()` for included work, boundary context, material responsibility, wallcovering prep/primer context, tile trim context, and true mixed-trade facts while preserving public review fields and existing behavior. Validation passed with EstimatorScopeFacts tests 9/9, Scope-to-Price Consistency tests 18/18, Customer Scope Drift tests 71/71, Schedule Sequencing tests 11/11, existing estimator tests 38/38, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, webhook code, layouts, API contracts, Customer Scope Drift, Schedule Sequencing, `scopeSplitter`, or materials generation.
- DONE: Phase 3 EstimatorScopeFacts migration for Customer Scope Drift is complete. `customer-scope-drift.ts` now consumes `buildEstimatorScopeFacts()` for written-scope support and boundary-context trade checks while preserving exported function names, return shapes, warning-only behavior, and customer text. Specialized generated-text true-work detection remains in place for electrical, plumbing, carpentry, demolition, drywall/patching, flooring, bathroom/tile, and wallcovering. Validation passed with EstimatorScopeFacts tests 9/9, Customer Scope Drift tests 71/71, Scope-to-Price Consistency tests 18/18, Schedule Sequencing tests 11/11, existing estimator tests 38/38, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, webhook code, layouts, API contracts, Schedule Sequencing, Scope-to-Price behavior, `scopeSplitter`, or materials generation.
- DONE: Phase 4 EstimatorScopeFacts migration for Schedule Sequencing Review is complete. `schedule-sequencing-review.ts` now consumes `buildEstimatorScopeFacts()` for sequencing-related included-work and boundary-context decisions, including included trades, patch/texture context, wet-area tile sequencing, rough-in sequencing, wallcovering sequencing, owner/customer material timing, and true mixed General Renovation sequencing where safe. Public review fields, warning-only behavior, and customer text were preserved. Validation passed with EstimatorScopeFacts tests 9/9, Schedule Sequencing tests 14/14, Customer Scope Drift tests 71/71, Scope-to-Price Consistency tests 18/18, existing estimator tests 38/38, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, webhook code, layouts, API contracts, Customer Scope Drift, Scope-to-Price behavior, `scopeSplitter`, or materials generation.
- DONE: Phase 5 EstimatorScopeFacts migration/audit for PriceGuard Review as the UI-side aggregator is complete. `priceguard-review.ts` now consumes `buildEstimatorScopeFacts()` where safe for wallcovering-only General Renovation resolution, material responsibility/boundary checks, exclusion boundary checks, permit boundary checks, and patch/texture confirm-item suppression while preserving the `PriceGuardReview` return shape, warning-only fields, child guard behavior, customer text, and layout/caps. Validation passed with EstimatorScopeFacts tests 9/9, PriceGuard Review tests 17/17, Scope-to-Price Consistency tests 18/18, Customer Scope Drift tests 71/71, Schedule Sequencing tests 14/14, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, webhook code, layouts, API contracts, backend route diagnostics, `scopeSplitter`, or materials generation.
- DONE: Phase 6 EstimatorScopeFacts migration for backend Estimate Defense diagnostics is complete. `estimateDefenseMode.ts` now consumes `buildEstimatorScopeFacts()` for display-only included-work and boundary-context diagnostics, including included trades, bathroom/wet-area context, true mixed trades, and boundary-safe waterproofing/exclusion checks. `estimateDefenseMode.test.ts` was added with 7/7 passing regression coverage for Case 1 Painting exclusions, Case 4 Electrical, Case 6 Bathroom/Tile, Case 7 Wallcovering, Case 8 Carpentry, true mixed renovation, and true bathroom remodel. The exported function name and return shape were preserved. Validation passed with EstimatorScopeFacts tests 9/9, Estimate Defense tests 7/7, PriceGuard Review tests 17/17, Scope-to-Price Consistency tests 18/18, Customer Scope Drift tests 71/71, Schedule Sequencing tests 14/14, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, webhook code, layouts, API contracts, route contracts, materials generation, `scopeSplitter`, anchors, or deterministic engines.
- DONE: Phase 7 EstimatorScopeFacts migration for missedScopeDetector / backend missed-scope diagnostics is complete. `missedScopeDetector.ts` now consumes `buildEstimatorScopeFacts()` for warning-only included-work checks, job-type detection, patch/texture detection, baseboard context, and boundary-safe missed-scope diagnostics. `missedScopeDetector.test.ts` passes 9/9, and public return shape and warning-only behavior were preserved. Validation passed with EstimatorScopeFacts tests 9/9, missed-scope detector tests 9/9, Estimate Defense tests 7/7, PriceGuard Review tests 17/17, Scope-to-Price Consistency tests 18/18, Customer Scope Drift tests 71/71, Schedule Sequencing tests 14/14, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, webhook code, layouts, API contracts, route contracts, materials generation, `scopeSplitter`, anchors, deterministic engines, or broad route diagnostics.
- DONE: Phase 8A EstimatorScopeFacts route-level display diagnostics migration is complete. `route.ts` now builds EstimatorScopeFacts once for `scopeChange`, `routeDisplayDiagnostics.ts` and focused tests were added, and `buildScopeXRay` / `buildAreaScopeBreakdown` now use shared facts for display-only true mixed trade risk support, patch/texture confirmation, demo/removal driver suppression, tile-trim vs carpentry-trim distinction, baseboard/removal context, and trim/baseboard confirmations where safe. Public route/API response shape was preserved. Validation passed with route display diagnostics tests 6/6, EstimatorScopeFacts tests 9/9, missed-scope detector tests 9/9, Estimate Defense tests 7/7, orchestrator estimate-section tests 2/2, UI review-stack tests, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, route contracts, anchors, deterministic engines, `materialsList.items` generation, `scopeSplitter`, or measured plan pricing eligibility.
- DONE: Phase 8B EstimatorScopeFacts materials diagnostics migration is complete. `route.ts` now passes `scopeFacts` into `buildMaterialsList`; `routeDisplayDiagnostics.ts` handles materials confirmItems/notes helper logic; and `routeDisplayDiagnostics.test.ts` passes 14/14. Only `materialsList.confirmItems` and `materialsList.notes` were migrated. `materialsList.items` generation, MaterialsList return shape, and route/API response shape stayed unchanged. Validation passed with route display diagnostics tests 14/14, EstimatorScopeFacts tests 9/9, missed-scope detector tests 9/9, Estimate Defense tests 7/7, orchestrator estimate-section tests 2/2, UI review-stack tests, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, route contracts, anchors, deterministic engines, `scopeSplitter`, or measured plan pricing eligibility.
- DONE: Phase 8C EstimatorScopeFacts materials item gate migration is complete. `route.ts` now uses shared facts-aware gates for selected `materialsList.items` conditional triggers, and `routeDisplayDiagnostics.test.ts` passes 20/20. Conditional gates migrated include kitchen backsplash/flooring/paint/demo add-ons, kitchen refresh backsplash/flooring add-ons, flooring tile setting materials, drywall texture/primer items, electrical/plumbing parsed fixture/device counts, and carpentry parsed LF material quantity. MaterialsList shape, route/API response shape, material labels, base trade consumables, and anchor base packages were preserved. Validation passed with route display diagnostics tests 20/20, adjacent estimator tests, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved detailed Customer-Facing Scope / `result.text` as a core product strength and did not change pricing, generation, PDFs, billing, route contracts, anchors, deterministic engines, `scopeSplitter`, prompts, or measured plan pricing eligibility.
- DONE: Phase 8D-2 EstimatorScopeFacts customer-facing coordination text safety gate is complete. `appendTradeCoordinationSentence()` now accepts optional shared scope facts, finalization passes `ctx.scopeFacts`, and appended customer-facing coordination trades are filtered against included trades when facts are available. Boundary-only, excluded, by-others, protection-only, coordination-only, existing/to-remain, and owner/customer-supplied material-only trade entries no longer create false coordination text. True mixed renovation coordination remains preserved, duplicate coordination protection still works, and direct helper callers without facts remain backward-compatible. Validation passed with route prompt-adjacent diagnostics tests 11/11, scope-signal tests 4/4, orchestrator estimate-section tests 2/2, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved prompts, `effectiveScopeChange`, route/API shape, pricing, schedule, materials generation, `scopeSplitter`, deterministic engines, docs, and global `detectTradeStack` behavior.
- DONE: Phase 8D-3 EstimatorScopeFacts schedule/rationale multi-trade text gate is complete. `estimateCalendarDaysRange()` and `buildScheduleBlock()` now accept optional shared scope facts, route/orchestrator plumbing passes `ctx.scopeFacts`, and `multi-trade coordination` rationale is added only when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true. Polluted upstream `tradeStack.isMultiTrade` or `complexityProfile.multiTrade` no longer creates false schedule/rationale text when shared facts show a single included trade, while true mixed renovation still preserves multi-trade rationale. Validation passed with route prompt-adjacent diagnostics tests 14/14, orchestrator estimate-section tests 2/2, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved prompts, `effectiveScopeChange`, route/API shape, pricing formulas, schedule math, materials generation, `scopeSplitter`, deterministic engines, docs, and global `detectTradeStack` behavior.
- DONE: Phase 8D-4A EstimatorScopeFacts route display multi-trade diagnostics gate is complete. `shouldShowTrueMixedTradeDiagnostic(scopeFacts)` now returns true only when `scopeFacts.trueMixedTrades` is true. `buildScopeXRay()` uses it before adding `Multiple trades require coordination and sequencing.`, and `buildAreaScopeBreakdown()` uses it before adding `Multi-trade coordination likely`. Boundary-only, excluded, by-others, protection-only, existing-to-remain, and owner-supplied trade mentions no longer create those display-only diagnostics when shared facts show one included trade, while true mixed renovation diagnostics remain preserved. Validation passed with route display diagnostics tests 25/25, route prompt-adjacent diagnostics tests 14/14, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildEstimateExplanation`, `buildPhotoEstimateDecision`, and `profitLeakDetector`.
- DONE: Phase 8D-4B EstimatorScopeFacts estimate explanation multi-trade gate is complete. `buildEstimateExplanation()` now receives optional scope facts through the orchestrator and only adds `Multiple trades require sequencing and coordination.` when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true. Polluted upstream `complexityProfile.multiTrade` no longer creates this false diagnostic explanation for single-included-trade scopes, while true mixed renovation explanation remains preserved. Validation passed with orchestrator estimate-section tests 3/3, route display diagnostics tests 28/28, route prompt-adjacent diagnostics tests 14/14, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, `buildPhotoEstimateDecision`, and `profitLeakDetector`.
- DONE: Phase 8D-5A EstimatorScopeFacts profit leak diagnostics migration is complete. `detectProfitLeaks()` now accepts optional shared scope facts, orchestrator passes `ctx.scopeFacts`, bathroom/wet-area/demo/protection checks use included-work text where facts are present, and coordination-load profit leak checks use `scopeFacts.trueMixedTrades` instead of polluted `tradeStack.isMultiTrade`. False profit leak diagnostics are suppressed for boundary-only trade mentions when shared facts show one included trade, while no-facts callers remain backward-compatible and true mixed renovation, true wet-area remodel, and true demo/removal review behavior remain preserved. Validation passed with profit leak detector tests 8/8, Estimate Defense tests 7/7, orchestrator estimate-section tests 3/3, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This preserved photo-estimate decision logic, photo pricing behavior, `derivePhotoPricingImpact`, prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, and `buildPhotoEstimateDecision`.
- DONE: Phase 8D-6A photo-estimate decision characterization seam is complete. Pure photo-estimate decision helpers were extracted from `route.ts` into `routePhotoEstimateDecision.ts`, `route.ts` now imports and calls the extracted helpers, and `routePhotoEstimateDecision.test.ts` documents current behavior without implementing EstimatorScopeFacts gating or behavior fixes. Characterized risks include polluted `tradeStack.isMultiTrade` adding photo pricing-risk reason text, polluted multi-trade signals forcing `measurements` into `missingInputs`, owner-supplied electrical fixture wording counting as usable electrical quantity, plumbing `by others` fixture wording counting as usable plumbing quantity, and polluted multi-trade stack blocking photo-only pricing for carpentry/baseboard scopes through measurement-heavy logic. Validation passed with route photo decision tests 9/9, route prompt-adjacent diagnostics tests 14/14, route display diagnostics tests 28/28, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This was characterization/test-seam work only and preserved runtime behavior, prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, and payment/auth code.
- DONE: Phase 8D-6B EstimatorScopeFacts photo-estimate decision reason-text gate is complete. `buildPhotoEstimateDecision()` now accepts optional scope facts, and route plumbing passes existing `scopeFacts` into the photo estimate decision. The reason `Multiple trades were detected, which increases pricing risk.` is only added when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true. Boundary-only / polluted multi-trade stacks no longer create that reason text when shared facts show one included trade, while true mixed renovation and no-facts behavior still keep it. Validation passed with route photo decision tests 12/12, route prompt-adjacent diagnostics tests 14/14, route display diagnostics tests 28/28, EstimatorScopeFacts tests 9/9, existing estimator tests 41/41, `npx tsc --noEmit`, and `git diff --check`. This was reason-text-only and preserved photo pricing behavior, `pricingAllowed`, blockers, confidence, confidenceBand, estimateMode, pricingPolicy, `missingInputs`, `derivePhotoPricingImpact`, confidence penalty, measurement-heavy behavior, raw quantity parsing, prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, payment/auth, `detectTradeStack`, and `buildComplexityProfile`.
- DONE: Phase 9A Evidence Authority / Estimate Basis Readback helper is complete in commit `Add estimator evidence authority readback helper`. It added `app/api/generate/lib/estimator/evidenceAuthority.ts`, `app/api/generate/lib/estimator/evidenceAuthority.test.ts`, and `buildEvidenceAuthorityReadback()` as an internal/helper-level source and authority classifier for typed included scope, boundary/exclusion scope, user quantities, parsed quantities, deterministic estimate basis, photo observations, photo quantity signals, plan sheet evidence, plan tables/finish schedules, repeated room packages, plan quantity candidates, and future measured plan quantities. It is not wired into `/api/generate`; it did not change runtime behavior, route/API response shape, pricing, prompts, `result.text`, materials generation, `scopeSplitter`, deterministic engines, `detectTradeStack`, `buildComplexityProfile`, billing/auth, UI, or deployment. Plan quantity candidates remain non-pricing-authoritative, photo observations remain review-only, and photo quantities only become pricing-authoritative when explicitly marked as already-authoritative through an existing guarded path. Validation passed with the new evidence authority tests, adjacent scope/photo/plan gate tests, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts`, `npx tsc --noEmit`, and `git diff --check`.
- DONE: Phase 9B-internal Evidence Authority orchestration wiring is complete in commit `Wire evidence authority readback internally`. `buildEvidenceAuthorityReadback()` is now built inside `runEstimatorOrchestrator()` after final estimate basis finalization/section setup, using `ctx.scopeFacts`, user/parsed sqft from `ctx.quantityInputs`, `finalBasis`, `ctx.photoAnalysis`, and `ctx.planIntelligence`. It remains internal only and is observable only through optional internal/test callback `onEvidenceAuthorityReadback`; it is not returned in `/api/generate`, `EstimatorPayload` was not changed, `route.ts` was not changed, and route/API response shape, saved estimate shape, PDF/customer output, UI, pricing, prompts, `effectiveScopeChange`, `result.text`, materials generation, `scopeSplitter`, deterministic engines, `detectTradeStack`, `buildComplexityProfile`, billing/auth, and deployment were unchanged. Plan quantity candidates remain non-pricing-authoritative, photo observations remain review-only, and photo quantities are not newly pricing-authoritative because the orchestrator passes `pricingAuthoritativePhotoQuantityKeys: []`. Validation passed with evidence authority, orchestrator, scope facts, photo decision, plan candidate gate, estimator review tests, `npx tsc --noEmit`, and `git diff --check`.
- DONE: Phase 9B-debug Evidence Authority debug-only payload exposure is complete in commit `Expose evidence authority readback in debug responses`. `/api/generate` captures `EvidenceAuthorityReadback` through `onEvidenceAuthorityReadback` only when debug mode is enabled by `x-debug: 1` / `wantsDebug(req)`. Normal `/api/generate` responses remain the original payload and do not include `evidenceAuthorityReadback`; debug responses may include it and bypass idempotency cache read/write so debug payloads cannot be replayed later as normal responses and normal cached payloads cannot suppress debug readback. `EstimatorPayload`, saved estimate shape, UI, PDFs/customer output, pricing, prompts, `effectiveScopeChange`, `result.text`, materials generation, deterministic engines, billing/auth, and deployment were unchanged. Plan/photo evidence did not become newly pricing-authoritative; plan quantity candidates remain non-pricing-authoritative, photo observations remain review-only, and photo quantities remain non-authoritative because the orchestrator still passes `pricingAuthoritativePhotoQuantityKeys: []`. Validation passed with evidence authority, orchestrator, scope facts, photo decision, plan candidate gate, estimator review tests, `npx tsc --noEmit`, and `git diff --check`.
- DONE: Estimator Review Summary panel is complete in commit `Add estimator review summary panel`. This UI/client-only `data-no-print` panel organizes existing client-side review signals into Ready/Needs Review, Pricing Basis, Scope Warnings, Excluded / By Others, Confirmations Needed, Photo / Plan Notes, and Profit / Margin Checks, with detailed review sources available below. It appears above existing estimator review details, keeps detailed panels available below, does not expose Evidence Authority in normal UI, and did not change backend/API response shape, saved estimate/history shape, PDFs/customer output, pricing, prompts, `result.text`, materials generation, deterministic engines, billing/auth, or deployment.
- DONE: Smart Questions V1 + Confirmed Answers V2-lite is complete in commit `Add client smart questions confirmations`. It added a client-only helper and compact estimator-only `data-no-print` panel that generates up to 3 deduped trade-specific clarification questions from existing client-side signals only. Confirmed answers use local React state only, include authority labels such as `user_confirmed_quantity`, `scope_boundary_confirmation`, `materials_confirmation`, `schedule_confirmation`, `review_only`, and `needs_followup`, and keep `pricingEligibleNow: false` for every answer. Answers are not sent to `/api/generate`, not saved to estimate history/localStorage history, not included in PDFs/customer output, and Evidence Authority remains internal/debug-only. No backend/API/saved/PDF/pricing/prompt/result/materials/deterministic/billing behavior changed. Validation passed with Smart Questions tests, estimator review tests, `npx tsc --noEmit`, and `git diff --check`; no browser/visual QA was run.
- DONE: Smart Questions V1 polish is complete in commit `Polish smart questions review panel`. The panel now appears after `EstimatorReviewSummaryPanel` inside the generated-result estimator review flow and no longer appears before the result. It is labeled `Quick Clarifications`, remains compact/collapsible and `data-no-print`, hides when there are no questions, opens only for unanswered high-priority questions, and collapses when all visible questions are answered. Contractor-facing copy now says confirmations are saved for on-screen review only and that price, proposal text, PDFs, and saved estimates are unchanged, with answered items labeled as estimator notes only with price unchanged. Smart Questions remain client-only/local-only; answers are not sent to `/api/generate`, not saved to history/localStorage, not included in PDFs/customer output, and keep `pricingEligibleNow: false`. Evidence Authority remains internal/debug-only and was not exposed in normal UI. No backend/API/saved/PDF/pricing/prompt/result/materials/deterministic/billing behavior changed. Validation passed with Smart Questions tests, `npx tsc --noEmit`, and `git diff --check`; no browser/mobile visual QA was run.
- DONE: Smart Questions V2A authority-gate helper is complete in commit `Add smart questions authority gate`. `classifySmartQuestionAuthority()` classifies confirmed answers into future-only statuses: `eligible_pricing_candidate`, `review_only`, `rejected_boundary_conflict`, `needs_followup`, and `stale_scope`. This is classification-only and is not wired into runtime UI, `/api/generate`, saved estimates, localStorage history, PDFs/customer output, backend pricing, or normal Evidence Authority UI. The helper always returns `pricingAuthoritative: false` and `pricingEligibleNow: false`, and `ConfirmedClarification` still keeps `pricingEligibleNow: false`. `eligible_pricing_candidate` is not current pricing authority; no confirmed answer affects pricing yet. EstimatorScopeFacts is used only for classification/boundary checks and does not change existing scope behavior. Excluded, by-others, owner/customer-supplied, protection-only, coordination-only, existing-to-remain, stale, ambiguous/short-text, material, schedule, demo/prep, permit, and photo/plan answers remain non-pricing-authoritative. Validation passed with Smart Questions tests 11/11, scope quality and PriceGuard review tests 41/41, `npx tsc --noEmit`, and `git diff --check`.
- NEXT: Optional intelligence-layer upgrades should keep typed scope as the scope-control anchor. Good next candidates are browser/mobile visual QA for Crew Planning and the reduced/compact Estimator Review flow, Crew Planning V1 polish audit after real-device QA, Crew Planning V2 daily work-plan audit only, Crew Planning hotel/multi-unit production board audit only, Smart Questions V2B client-only authority-status readback, Smart Questions V2B server/API authority audit only, company intelligence / saved-estimate learning audit, camera measuring prototype audit, voice-to-scope draft audit, or plan-to-scope reconciliation audit. Do not make photo, plan, camera, voice, learned, crew planning, or confirmed-answer signals pricing-authoritative, and do not change labor totals, unless a later task explicitly scopes that authority and verification path.
- DONE: Saved Estimates and Invoices empty states/workflow guidance now keep those sections visible when filtered lists are empty and explain where records come from, including selected-job context when applicable.
- DONE: `PRE_LAUNCH_SMOKE_TEST.md` documents the manual PWA/web production-readiness smoke test checklist.
- DONE: Full app-side PWA/web smoke test passed for free generation, account/access refresh, plan upload/selected-page generation, estimate PDF, invoice creation/PDF, the earlier checkout/success entitlement refresh path, approval link creation, cross-browser/device approval, approval sync, and approval-created invoice import. Current subscription billing still requires final payment, webhook delivery, and entitlement activation verification through `SUBSCRIPTION_TEST_CHECKLIST.md` before public paid launch.
- DONE: Production Supabase verification using `SUPABASE_PRODUCTION_CHECKLIST.md` passed for the current launch-critical schema, RPC, constraint, and duplicate-protection paths.
- DONE: Stripe recurring monthly Pro price has been created, Vercel has `STRIPE_PRO_MONTHLY_PRICE_ID` set, and the app was redeployed after the env var was added.
- DONE/PARTIAL: Subscription billing implementation foundation is in place: checkout mode switch, monthly price env var, Supabase columns, 6-event webhook handling, subscription-aware entitlement response, Account & Access status copy, success/cancel copy, and focused entitlement tests are done. Preview/Test Mode subscription QA passed in Vercel Preview with Stripe sandbox checkout, webhook resend `200 OK`, and `/app` Pro access active. Final Production Live Mode payment/webhook entitlement verification remains pending as the final pre-launch gate before public paid launch.
- DIRECTION: Preview/Test Mode subscription QA passing means billing does not need to block continued product polish. Keep Production Live Mode subscription verification deferred until the final pre-launch gate.
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
- DONE: Plan Review Summary now includes a compact Pages Needing Review drilldown to explain weak/review-only plan evidence from selected pages without changing pricing, plan extraction behavior, upload/staging architecture, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- DONE: Plan Review Summary raw-text cleanup is complete and tested. Marina Dunes retest passed: long all-caps sheet/index/OCR text was suppressed from the main summary, contractor-friendly fallback headline copy appeared, Pages Needing Review and evidence counts stayed visible, review-only/not-pricing-input language stayed visible, and deeper Plan-to-price details / Estimator Diagnostics remained available. This was UI-only and did not change pricing, generation behavior, Plan Intelligence backend logic, upload/staging, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- DONE: Result-page diagnostics clarity polish is complete. The nested Plan Review Summary accordion was renamed from “Estimator diagnostics” to “Plan-to-price details,” while the top-level advanced drawer remains “Estimator Diagnostics.” This was UI-only and did not change pricing, generation behavior, Plan Intelligence logic, upload/staging behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- DONE: Customer Output Readiness panel now gives contractors a compact estimator-only review checkpoint before PDF/download/customer-output actions, summarizing unsupported trade wording, weak/review-only plan evidence, scope clarity, assumptions/exclusions, estimator risk notes, and send-readiness concerns without changing pricing, generation behavior, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- DONE: Customer Output Readiness implementation (`40e8a99`) and retest documentation (`847c7b0`) were committed and pushed.
- DONE: Customer Output Readiness dedupe/grouping cleanup is complete and tested. The panel now dedupes details across readiness items, caps details at 2 per item, stays capped at 6 items, keeps unsupported trade wording visible, and makes assumptions/exclusions a clearer pre-send boundary checkpoint without changing pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.
- DONE: Trade-aware scope quality review is complete with focused scope-quality and PriceGuard propagation tests passing 12/12. It keeps the existing review-only output shape and does not change pricing, generation behavior, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- DONE: Result-page hierarchy cleanup is complete and tested. The generated result page now prioritizes Customer-Facing Scope, Customer Output Readiness, Pricing/PDF, and Schedule; full PriceGuard Review, Plan Review Summary, and Line Item Detail remain available in collapsed `Estimator review details`; AdvancedAnalysisSection remains separately collapsed as `Estimator Diagnostics`; Jobs, Invoices, and Saved Estimates placement is unchanged. `npx tsc --noEmit`, `git diff --check`, and manual QA for a simple painting estimate plus Marina Dunes plan-assisted estimate passed. This was UI-only and did not change pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.
- DONE: Warning-only AI Scope Protection / Unsupported Scope Review Guard is complete in commit `e2f1ef1`. It adds structured estimator-facing review warnings for unsupported customer-facing scope expansion while preserving the AI-generated detailed step-by-step scope, materials language, sequencing, and work-description detail in `result.text`. Customer-Facing Scope keeps one compact warning above the text when needed, and Customer Output Readiness receives capped supporting details. Focused customer-scope drift tests passed 29/29, `npx tsc --noEmit` passed, `git diff --check` passed, and manual QA passed.

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
  - `/api/webhook` handles subscription lifecycle events, preserves retry-safe dedupe, and does not reset `usage_count`.
  - `/api/entitlement` returns subscription-aware fields and messages.
  - `/app` Account & Access shows plan/status/period information.
  - `/success` and `/cancel` use subscription-oriented copy.
  - Focused entitlement tests cover subscription access rules and legacy compatibility.
  - Preview/Test Mode subscription payment and webhook entitlement verification passed in Vercel Preview with Stripe sandbox checkout, webhook resend `200 OK`, and `/app` Pro access active.
  - Stripe webhook retry-safe dedupe fix is complete and deployed: events are recorded as processed only after entitlement activation/update succeeds; failed entitlement writes remain retryable; duplicate processed events remain idempotent.
  - Final Production Live Mode subscription payment and webhook entitlement verification remains pending before public paid launch.
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
- Status note: Plan Review Summary clarity, Pages Needing Review drilldown, and plan-aware pre-generate scope warning are complete as UI-only passes. Desktop and iPhone/mobile Marina Dunes retests passed for the drilldown and review-only pricing safety language. Deeper upload/staging architecture changes should remain future work unless QA proves the current architecture cannot support launch.
- DONE: Customer Output Readiness panel now gives contractors a compact estimator-only review checkpoint before PDF/download/customer-output actions, summarizing unsupported trade wording, weak/review-only plan evidence, scope clarity, assumptions/exclusions, estimator risk notes, and send-readiness concerns without changing pricing, generation behavior, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.
- DONE: Trade-aware scope quality review is complete. General Renovation, Plumbing, Electrical, Bathroom/Tile, Flooring, Drywall, Painting, and Wallcovering estimates now receive more relevant review-only missing-info warnings without changing pricing or generation behavior.
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
- Completed scope: Estimate results now open with a clean document summary card and prioritize Customer-Facing Scope, Customer Output Readiness, Pricing/PDF, and Schedule. PriceGuard Review, Plan Review Summary, and Line Item Detail remain available in collapsed `Estimator review details`, while AdvancedAnalysisSection remains separately collapsed as `Estimator Diagnostics`.
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
