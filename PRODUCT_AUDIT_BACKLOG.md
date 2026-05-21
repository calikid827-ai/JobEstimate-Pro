# JobEstimate Pro Product Audit Backlog

This is the master improvement tracker for product intelligence, estimator accuracy, trust, and launch readiness. Use it to improve JobEstimate Pro one focused task at a time without turning audit findings into broad rewrites.

Principles:

- Keep pricing authority, estimate generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, and Generate payload shape stable unless a task explicitly requires a later scoped change.
- Treat Plan Intelligence and Photo Intelligence as review support unless a future task proves reliable measured quantities with source provenance and regression coverage.
- Favor small UI/review-language safety passes before broad architecture changes.
- Preserve AI-generated intelligent step-by-step customer-facing scope descriptions as a core product strength. Materials, sequencing, and task-description detail should not be automatically flattened, shortened, removed, or rewritten by safety guards.
- Customer-facing scope guard work should detect and review unsupported expansion. It should stay warning-only / review-only unless a separate scoped task explicitly changes customer text.

## Current Priority Order

1. Next active task: broader launch-readiness / regression audit before adding more estimator behavior changes. Phase 8D scope-boundary text/diagnostic cleanup is substantially complete.
2. Keep the real-world estimate QA matrix and cross-trade backend scope-boundary filtering under regression watch during trade QA.
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
- Recommended fix approach: Completed a focused cross-trade backend scope-boundary regression fix. `getIncludedScopeText()` now filters boundary clauses at the sentence/segment level instead of trimming after boundary words and leaving orphan trade nouns behind.
- Exact files/components involved: `app/api/generate/lib/priceguard/scopeSplitter.ts`, `app/api/generate/lib/priceguard/scopeSplitter.test.ts`
- What not to touch: Pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, payloads, API contracts, Customer Scope Drift, Customer Output Readiness layout, or measured plan pricing eligibility.
- Tests or manual QA needed: Targeted backend controls for true included work vs excluded/by-others/protection/coordination-only language by trade; manual app retest across plumbing, electrical, flooring, drywall, bathroom/tile, wallcovering, carpentry, and true mixed painting + LVP.
- Status: Done

Done note:

- Improved backend included-work filtering so boundary clauses such as `Electrical by others`, `Painting by others`, `Texture match excluded`, `Flooring protection only`, `Existing baseboards to remain`, `Owner-supplied fixtures`, `Furniture moving by others`, `Plumbing by others`, and `Coordinate with electrical trade only` are removed from included-work scope instead of leaving orphan trade nouns.
- True included work remains preserved for `install LVP`, electrical rough-in, baseboard replacement, drywall patching, plumbing rough-in, toilet/faucet replacement, tile/waterproofing/grout work, wallcovering prep/primer, and true mixed painting + LVP.
- Added local splitter recognition for tile and wallcovering so included tile/waterproofing and wallcovering prep/primer scopes do not fall into generic renovation or painting buckets.
- Validation passed: `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSplitter.test.ts` with 18/18 passing, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` with 34/34 passing, `npx tsc --noEmit`, and `git diff --check`.
- Manual retest passed for plumbing, electrical, flooring, drywall, bathroom/tile, wallcovering, carpentry, and true mixed painting + LVP scopes. Boundary language no longer created false electrical, flooring, drywall, painting, plumbing, carpentry, or furniture-moving split scopes, while true mixed behavior remained intact.
- This did not change pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, or broad backend pricing semantics.

#### Item: Real-world estimate QA matrix for diagnostic consistency

- Problem: The current estimator-intelligence stack is now broad enough that regressions are most likely to show up in full estimate QA rather than isolated helper behavior.
- Why it matters: Contractors need Customer-Facing Scope, PriceGuard Review, Customer Output Readiness, Scope-to-Price X-Ray, materials, schedule, and PDFs to tell one consistent story.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Run focused real-world trade examples first. Only implement small deterministic fixes when repeated QA shows a narrow false-signal, missing-warning, or diagnostic consistency issue.
- Exact files/components likely involved: QA docs first; possible future scoped fixes in `app/api/generate/lib/priceguard/*`, `app/app/lib/*`, or `app/app/page.tsx` only if QA proves a specific issue.
- What not to touch: Pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, saved data, payload shape, API routes, layouts, or measured plan pricing eligibility unless a later task explicitly scopes it.
- Tests or manual QA needed: Real-world estimates across plumbing, electrical, flooring, drywall, bathroom/tile, wallcovering, carpentry, painting, and general renovation, with split scopes, anchors, materials, warnings, schedule, and PDF/customer-output safety reviewed together.
- Status: Done for the current real-world QA matrix cleanup pass; keep under regression watch.

#### Item: Case 1 Painting real-world QA false-positive cleanup

- Problem: Real-world QA Case 1 found a walls-only painting scope with adjacent trade exclusions still produced unsupported carpentry drift, patch/texture schedule wording, multi-trade coordination, and primer-after-patching review noise.
- Why it matters: A senior estimator should distinguish included painting work from excluded drywall, flooring, trim/baseboard, and carpentry context before showing contractor-facing diagnostics.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed a focused false-positive cleanup. Customer Scope Drift now treats ongoing drywall/carpentry coordination and minimize-interference wording as coordination-only context, backend trade-stack/complexity/schedule phase detection uses included-work scope text, and missed-scope detection no longer classifies excluded drywall/skim/texture wording as patch-and-paint.
- Exact files/components involved: `app/app/lib/customer-scope-drift.ts`, `app/app/lib/customer-scope-drift.test.ts`, `app/api/generate/route.ts`, `app/api/generate/lib/estimator/missedScopeDetector.ts`, `app/api/generate/lib/estimator/missedScopeDetector.test.ts`, `app/api/generate/lib/priceguard/scopeSplitter.ts`, `app/api/generate/lib/priceguard/scopeSplitter.test.ts`, `app/app/lib/priceguard-review.ts`, `app/app/lib/priceguard-review.test.ts`, `app/app/lib/schedule-sequencing-review.ts`
- What not to touch: Pricing formulas, backend pricing semantics, broad generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.
- Tests or manual QA needed: Focused customer-scope drift, schedule sequencing, missed-scope detector, scope splitter, PriceGuard/scope-quality tests, TypeScript, diff check, and manual QA for Case 1 plus true patch-and-paint control.
- Status: Done

Done note:

- Customer Scope Drift now treats `coordination with ongoing drywall and carpentry work`, `coordination with carpentry activities`, and `minimize interference` as coordination-only context when no actual carpentry/baseboard/trim install, replacement, or repair is promised.
- Included-work scope text now prevents excluded adjacent trades from creating false backend diagnostics such as multi-trade coordination, flooring-before-trim/baseboard sequencing, flooring-paint coordination, or Estimate Defense wording that the job is not single-trade only across painting/drywall/carpentry.
- Backend missed-scope detection no longer classifies painting scopes as patch-and-paint when drywall repair, skim coat, or texture matching appear only in excluded clauses, so `Primer / sealer after patching` is no longer recommended from excluded drywall/texture wording.
- Backend schedule phase parsing keeps exclusion context attached, so excluded patch/texture wording does not drive patch/texture dry-time before paint.
- Manual retest passed for Case 1 Painting: primary trade painting, walls-only paint scope, painting-only split scopes, AI pricing source, no `flooring_only_v1`, painting/protection consumables only, no unsupported carpentry warning, no painting+drywall mixed-scope warning, no owner/customer-supplied material note, no primer/sealer-after-patching, no drywall dry/return, no patch/texture dry-time before painting, no flooring/trim/baseboard sequencing phrase, and no false multi-trade/Estimate Defense statement.
- True patch-and-paint control remains preserved: drywall patching, compound/tape, sanding, primer, painting, patch/texture dry-time, drywall dry/return, and drywall/painting split scopes still appear when patching is actually included.
- Normal two-coat paint dry-time, low confidence, measurement, and payment review notes remain acceptable estimator guidance.
- Validation passed: `customer-scope-drift.test.ts` 64/64, `schedule-sequencing-review.test.ts` 10/10, `missedScopeDetector.test.ts` 2/2, `scopeSplitter.test.ts` 19/19, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` 37/37, `npx tsc --noEmit`, and `git diff --check`.
- This cleanup did not change pricing formulas, backend pricing semantics, broad generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.
- Current next active task is broader launch-readiness / regression audit before adding more estimator behavior changes. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Remaining real-world QA false-positive cleanup for Cases 4, 6, 7, and 8

- Problem: The remaining real-world QA matrix cases exposed false estimator diagnostics from excluded, by-others, coordination-only, sequencing-only, normal trade-prep, and broad General Renovation fallback context.
- Why it matters: Contractors should be able to trust Customer Scope Drift, Scope-to-Price X-Ray, materials, schedule, and Estimate Defense together without seeing adjacent-trade false positives on otherwise clean estimates.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed focused false-positive cleanup across electrical, bathroom/tile, wallcovering, and carpentry without changing pricing formulas, broad backend pricing semantics, customer-output layouts, or measured plan pricing eligibility.
- Exact files/components involved: Customer Scope Drift, Scope-to-Price Consistency Review, schedule sequencing review, backend scope splitting / route diagnostics, materials, and Estimate Defense paths.
- What not to touch: Pricing formulas, backend pricing semantics, broad generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.
- Tests or manual QA needed: Focused helper/backend tests, existing estimator tests, TypeScript, diff check, and manual retest for Cases 4, 6, 7, and 8.
- Status: Done

Done note:

- Case 4 Electrical now passes: vanity lights no longer create false plumbing/carpentry mixed-trade diagnostics, electrical rough-in with owner-supplied fixtures and drywall/paint by others stays electrical-only, sequencing/framing/finish-trade wording no longer creates unsupported carpentry drift, and true carpentry work still warns.
- Case 6 Bathroom/Tile now passes: shower wall waterproofing/tile/grout/trim stays tile/bathroom context, demo/cement board/backer/membrane/tile trim no longer create false General Renovation split noise, plumbing by others and owner-supplied fixtures no longer create false plumbing material or multi-trade defense wording, and bathroom flooring allowance appears only when flooring/floor tile/floor replacement is actually included.
- Case 7 Wallcovering now passes: because there is no selectable Wallcovering Trade Type, General Renovation with detected wallcovering-only included scope now respects wallcovering scope and avoids bathroom/tile cure, glass/fixture, demo/rough-in, or broad General Renovation sequencing noise while keeping wallcovering-specific layout/pattern/substrate/material timing notes.
- Case 8 Carpentry now passes: baseboard removal/disposal and `demolition of existing baseboards` are treated as normal carpentry/baseboard replacement prep, while unrelated demolition/tear-out of walls, floors, cabinets, non-baseboard finishes, or unrelated demolition still warns.
- Validation passed: `customer-scope-drift.test.ts` 71/71, `scope-price-consistency-review.test.ts` 18/18, `schedule-sequencing-review.test.ts` 11/11, `scopeSplitter.test.ts` 21/21, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` 38/38, `npx tsc --noEmit`, and `git diff --check`.
- Manual retest passed for Cases 4, 6, 7, and 8.
- True mixed scopes, true unsupported warnings, wet-area cure/set-time for real tile work, permit/inspection review for electrical rough-in, owner-supplied material responsibility, and wallcovering layout/pattern/substrate confirmation remain acceptable estimator guidance.
- This cleanup did not change pricing formulas, backend pricing semantics, broad generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.

#### Item: Phase 1 EstimatorScopeFacts / shared scope-understanding helper

- Problem: Recent fixes repeatedly taught Customer Scope Drift, Scope-to-Price, schedule, materials, Estimate Defense, and backend split-scope paths the same included-work vs boundary-context rules in separate places.
- Why it matters: A senior-estimator app should share one defensible view of included work, excluded/by-others work, owner-supplied materials, coordination-only language, sequencing-only context, existing conditions, and true mixed scope.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed Phase 1 by adding a deterministic text-only shared facts helper and adapting typed-scope normalization to consume it internally while preserving public behavior.
- Exact files/components involved: `app/app/lib/estimator-scope-facts.ts`, `app/app/lib/estimator-scope-facts.test.ts`, `app/app/lib/typed-scope-normalization.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, saved data shapes, Generate payload shape, API route contracts, layouts, Customer Output Readiness caps, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.
- Tests or manual QA needed: Focused EstimatorScopeFacts tests, existing estimator tests, adjacent review helper tests, TypeScript, and diff check.
- Status: Done

Done note:

- Commit `b8d780f` added `app/app/lib/estimator-scope-facts.ts` and `app/app/lib/estimator-scope-facts.test.ts`.
- The shared helper returns stable deterministic facts for raw/normalized scope text, clauses, included-work text, boundary text, included/excluded/coordination/protection/existing-condition trades, material responsibility, patch/texture context, tile trim context, wallcovering prep context, baseboard replacement/removal context, and true mixed-trade facts.
- `typed-scope-normalization.ts` now uses `buildEstimatorScopeFacts()` internally while preserving existing exported function names and return shape.
- Phase 1 intentionally did not migrate Customer Scope Drift, Schedule Sequencing, backend route diagnostics, `scopeSplitter`, materials generation, `missedScopeDetector`, pricing prep, or Estimate Defense yet. Those migrations have since advanced through Phase 7; broader route-level X-Ray / confirmation construction remains a Phase 8 audit target.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 11/11, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 38/38, `npx tsc --noEmit`, and `git diff --check`.
- This architecture groundwork did not change pricing formulas, backend pricing semantics, generation prompts, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, broad backend route diagnostics, Customer Scope Drift behavior, Schedule Sequencing behavior, `scopeSplitter` behavior, or materials generation behavior.
- Current next active task is broader launch-readiness / regression audit before adding more estimator behavior changes. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 2 EstimatorScopeFacts migration for Scope-to-Price Consistency Review

- Problem: Scope-to-Price Consistency Review already checks included typed scope, diagnostics, pricing anchors, materials, and estimate sections, but it still owns some boundary/context interpretation that now belongs in the shared facts layer.
- Why it matters: Migrating the consistency guard first is the safest next consumer step because it is UI-side, warning-only, already covered by focused tests, and directly benefits from consistent included-work and material-responsibility facts.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Adapt `scope-price-consistency-review.ts` to consume EstimatorScopeFacts for included trades, boundary clauses, material responsibility, patch/texture context, tile trim, wallcovering prep, and true mixed-trade checks while preserving existing warning fields and behavior unless tests prove a narrower cleanup is needed.
- Exact files/components involved: `app/app/lib/scope-price-consistency-review.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, saved data shapes, Generate payload shape, API route contracts, layouts, Customer Output Readiness caps, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, backend route diagnostics, `scopeSplitter`, materials generation, Customer Scope Drift, or Schedule Sequencing.
- Tests or manual QA needed: Existing Scope-to-Price Consistency tests plus adjacent EstimatorScopeFacts, Customer Scope Drift, Schedule Sequencing, and estimator integration tests; TypeScript; diff check.
- Status: Done

Done note:

- `scope-price-consistency-review.ts` now consumes `buildEstimatorScopeFacts()` for included-work and boundary-context understanding.
- The Scope-to-Price Consistency Review now uses shared facts for included trades, material responsibility, wallcovering prep/primer context, tile trim context, true mixed trades, and related consistency checks.
- Public return shape was preserved: `missedScopeWarnings`, `laborMaterialConfidenceNotes`, `scopeClarityWarnings`, `suggestedExclusions`, and `contractorRiskNotes`.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 11/11, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 38/38, `npx tsc --noEmit`, and `git diff --check`.
- This warning-only architecture migration did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Customer Scope Drift behavior, Schedule Sequencing behavior, `scopeSplitter` behavior, or materials generation behavior.

#### Item: Phase 3 EstimatorScopeFacts migration for Customer Scope Drift

- Problem: Customer Scope Drift has the richest boundary-context logic and has repeatedly needed false-positive fixes for carpentry, demolition, plumbing/electrical by-others, coordination-only language, sequencing-only context, baseboard removal, and unsupported trade drift.
- Why it matters: Customer-visible unsupported-scope warnings are central to contractor-safe output. They should share the same included-work and boundary-context facts now used by typed-scope normalization and Scope-to-Price Consistency Review.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Migrate `customer-scope-drift.ts` to consume EstimatorScopeFacts for typed scope support, exclusions/by-others, coordination/protection/existing context, patch/texture, tile trim, wallcovering prep, baseboard replacement/removal, and true unsupported trade checks while preserving warning-only behavior and public output shape.
- Exact files/components involved: `app/app/lib/customer-scope-drift.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, saved data shapes, Generate payload shape, API route contracts, layouts, Customer Output Readiness caps, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Schedule Sequencing, backend route diagnostics, `scopeSplitter`, materials generation, or Scope-to-Price behavior.
- Tests or manual QA needed: Existing Customer Scope Drift tests plus EstimatorScopeFacts tests, Scope-to-Price tests, Schedule Sequencing tests, existing estimator tests, TypeScript, and diff check.
- Status: Done

Done note:

- `customer-scope-drift.ts` now consumes `buildEstimatorScopeFacts()`.
- Written-scope support now uses shared included-work facts.
- Excluded/by-others, coordination-only, protection-only, and existing/to-remain typed-scope context now flows through shared facts for trade conflict checks.
- Existing specialized generated-text true-work detection remains in place for electrical, plumbing, carpentry, demolition, drywall/patching, flooring, bathroom/tile, and wallcovering.
- Public behavior was preserved: same exported function names, same return shapes, warning-only behavior, and no customer text mutation.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `customer-scope-drift.test.ts` 71/71, `scope-price-consistency-review.test.ts` 18/18, `schedule-sequencing-review.test.ts` 11/11, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 38/38, `npx tsc --noEmit`, and `git diff --check`.
- This warning-only architecture migration did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Schedule Sequencing behavior, Scope-to-Price behavior, `scopeSplitter` behavior, materials generation behavior, or backend route diagnostics.

#### Item: Phase 4 EstimatorScopeFacts migration for Schedule Sequencing Review

- Problem: Schedule Sequencing Review still makes repeated included-work vs boundary-context decisions around patch/texture, cure time, rough-in, owner-supplied material timing, and true mixed sequencing.
- Why it matters: Sequencing guidance should distinguish included work from exclusions/by-others/protection/coordination-only context using the same facts now shared by typed-scope normalization, Scope-to-Price, and Customer Scope Drift.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Migrate `schedule-sequencing-review.ts` to consume EstimatorScopeFacts for included trades, patch/texture included/excluded, owner/customer material responsibility, wallcovering prep, tile/wet-area context, and true mixed scope while preserving existing PriceGuardReview field output and warning-only behavior.
- Exact files/components likely involved: `app/app/lib/schedule-sequencing-review.ts`, `app/app/lib/schedule-sequencing-review.test.ts`, possible focused integration coverage in `app/app/lib/priceguard-review.test.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, saved data shapes, Generate payload shape, API route contracts, layouts, Customer Output Readiness caps, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Customer Scope Drift, Scope-to-Price behavior, backend route diagnostics, `scopeSplitter`, or materials generation.
- Tests or manual QA needed: Existing Schedule Sequencing tests plus EstimatorScopeFacts, Customer Scope Drift, Scope-to-Price, and estimator integration tests; TypeScript; diff check; manual QA after migration.
- Status: Done

Done note:

- `schedule-sequencing-review.ts` now consumes `buildEstimatorScopeFacts()`.
- `schedule-sequencing-review.test.ts` now has 14 passing tests with focused regression coverage.
- Schedule Sequencing Review now uses shared facts for included trades, patch/texture context, wet-area tile sequencing, rough-in sequencing, wallcovering sequencing, owner/customer material timing, and true mixed General Renovation sequencing where safe.
- Trade resolution now prefers shared included-trade facts, patch/texture sequencing uses `patchTextureIncluded` instead of raw excluded wording, and boundary-only text is less likely to create false sequencing guidance.
- Public behavior was preserved: same exported function names, same return type/shape, same warning-only review fields, and no customer text mutation.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `schedule-sequencing-review.test.ts` 14/14, `customer-scope-drift.test.ts` 71/71, `scope-price-consistency-review.test.ts` 18/18, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 38/38, `npx tsc --noEmit`, and `git diff --check`.
- This warning-only architecture migration did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Customer Scope Drift behavior, Scope-to-Price behavior, `scopeSplitter` behavior, materials generation behavior, or backend route diagnostics.

#### Item: Phase 5 EstimatorScopeFacts migration/audit for PriceGuard Review aggregator

- Problem: PriceGuard Review aggregates Customer Scope Drift, Scope-to-Price Consistency Review, Schedule Sequencing Review, scope-quality checks, materials/customer-readiness notes, and contractor risk notes, and may still contain local scope-boundary parsing that should consume EstimatorScopeFacts before backend route diagnostics are migrated.
- Why it matters: The primary estimator-review surface should share the same included-work / boundary-context facts layer as the migrated guards so contractors do not see inconsistent review notes from the aggregator.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Audit `priceguard-review.ts` for local scope parsing and migrate only safe UI-side aggregator decisions to EstimatorScopeFacts while preserving existing PriceGuardReview fields, warning-only behavior, review copy unless needed by tests, and downstream panel layout.
- Exact files/components likely involved: `app/app/lib/priceguard-review.ts`, `app/app/lib/priceguard-review.test.ts`, with adjacent EstimatorScopeFacts, Scope-to-Price, Customer Scope Drift, and Schedule Sequencing tests for regression coverage.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, saved data shapes, Generate payload shape, API route contracts, layouts, Customer Output Readiness caps, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, backend route diagnostics, `scopeSplitter`, materials generation, missedScopeDetector, pricing prep, or Estimate Defense.
- Tests or manual QA needed: Existing PriceGuard Review and scope-quality tests plus EstimatorScopeFacts, Scope-to-Price, Customer Scope Drift, Schedule Sequencing, TypeScript, diff check, and focused manual QA after migration.
- Status: Done

Done note:

- `priceguard-review.ts` now consumes `buildEstimatorScopeFacts()` where safe at the aggregator layer.
- `priceguard-review.test.ts` now has 17 passing tests with focused regression coverage.
- PriceGuard Review now uses shared facts for General Renovation wallcovering-only trade resolution, material responsibility / material boundary checks, exclusion boundary checks, permit boundary checks, and primer/sealer-after-patching confirm-item suppression through `patchTextureIncluded` / `patchTextureExcluded`.
- Boundary-aware review behavior is covered for electrical, bathroom/tile, and true mixed renovation controls.
- Public behavior was preserved: same exported function names, same `PriceGuardReview` return shape, same warning-only fields, no customer text mutation, and no layout/cap changes.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `priceguard-review.test.ts` 17/17, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 14/14, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This UI-side warning-only architecture migration did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, child guard behavior, Customer Scope Drift behavior, Scope-to-Price Consistency Review behavior, Schedule Sequencing behavior, `scopeSplitter` behavior, materials generation behavior, or backend route diagnostics.

#### Item: Phase 6 backend Estimate Defense migration to EstimatorScopeFacts

- Problem: The UI-side review stack now consumes EstimatorScopeFacts, but backend route diagnostics likely still contain route-level raw scope parsing for trade-stack, complexity, schedule, materials, Scope-to-Price X-Ray, Estimate Defense, and other diagnostics.
- Why it matters: Backend diagnostics are visible estimator-trust surfaces. They should not reintroduce false included-work signals after the UI-side guards have converged on shared scope facts.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed the smallest safe backend Phase 6 by migrating display-only Estimate Defense decisions to `buildEstimatorScopeFacts()` while leaving route contracts, pricing, anchors, deterministic engines, materials generation, and `scopeSplitter` behavior untouched.
- Exact files/components involved: `app/api/generate/lib/estimator/estimateDefenseMode.ts`, `app/api/generate/lib/estimator/estimateDefenseMode.test.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, saved data shapes, Generate payload shape, API route contracts, layouts, Customer Output Readiness caps, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, UI-side migrated guards, `scopeSplitter`, materials generation, missedScopeDetector, pricing prep, or Estimate Defense behavior unless a later implementation task scopes a safe warning/diagnostic-only change.
- Tests or manual QA needed: Focused Estimate Defense regression tests plus adjacent EstimatorScopeFacts and UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `estimateDefenseMode.ts` now consumes `buildEstimatorScopeFacts()`.
- `estimateDefenseMode.test.ts` was added and passes 7/7.
- Estimate Defense now uses shared facts for included trades, bathroom/wet-area context, true mixed trades, and boundary-safe waterproofing/exclusion checks.
- Bathroom/wet-area defense reads included-work text instead of raw scope text.
- Multi-trade defense uses shared included-trade facts before falling back to trade stack.
- Public behavior was preserved: same exported `buildEstimateDefenseMode` function name, same return shape and fields, display-only diagnostic behavior, and no customer text mutation.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `estimateDefenseMode.test.ts` 7/7, `priceguard-review.test.ts` 17/17, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 14/14, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This display-only backend diagnostic migration did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, materials generation behavior, `scopeSplitter` behavior, route contract behavior, pricing anchors, or deterministic engines.
- Current next active task is broader launch-readiness / regression audit before adding more estimator behavior changes. Prompts, `effectiveScopeChange`, `result.text`, photo pricing behavior, and route/API shape must not change without a scoped review. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 7 missedScopeDetector / backend missed-scope diagnostics EstimatorScopeFacts migration

- Problem: `missedScopeDetector` still contained local raw scope and job-type parsing even after UI-side review guards and backend Estimate Defense moved onto EstimatorScopeFacts.
- Why it matters: Missed-scope output feeds Scope-to-Price X-Ray risk flags and confirmation items, so raw boundary text could still create noisy backend diagnostics if it stayed independent from shared scope facts.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed the warning-only Phase 7 migration by moving missed-scope included-work checks, job-type detection, patch/texture detection, baseboard context, and boundary-safe support checks onto `buildEstimatorScopeFacts()`.
- Exact files/components involved: `app/api/generate/lib/estimator/missedScopeDetector.ts`, `app/api/generate/lib/estimator/missedScopeDetector.test.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, materials generation, `scopeSplitter`, pricing anchors, or deterministic engines.
- Tests or manual QA needed: Focused missed-scope detector regression tests plus adjacent EstimatorScopeFacts, Estimate Defense, and UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `missedScopeDetector.ts` now consumes `buildEstimatorScopeFacts()`.
- `missedScopeDetector.test.ts` was updated and passes 9/9.
- The detector now builds EstimatorScopeFacts once per detector context.
- Shared facts now drive included-work checks, job-type detection, patch/texture detection, baseboard replacement context, and boundary-safe missed-scope diagnostics.
- Existing "has scope" checks read from `facts.includedWorkText` instead of raw boundary text where safe.
- Boundary-only owner-supplied, by-others, protection-only, coordination-only, and existing/to-remain context no longer drives missed-scope support checks.
- Public return shape and warning-only behavior were preserved.
- Validation passed: `estimator-scope-facts.test.ts` 9/9, `missedScopeDetector.test.ts` 9/9, `estimateDefenseMode.test.ts` 7/7, `priceguard-review.test.ts` 17/17, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 14/14, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This warning-only backend diagnostic migration did not change pricing formulas, backend pricing semantics, anchors, deterministic engines, materials generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, measured plan pricing eligibility, or broad `route.ts` diagnostics.

#### Item: Phase 8A route-level Scope-to-Price X-Ray / area confirmation diagnostics EstimatorScopeFacts migration

- Problem: Route-level X-Ray, confirmation items, area scope breakdown, and materials/diagnostic construction may still parse raw scope independently after missedScopeDetector moved onto EstimatorScopeFacts.
- Why it matters: `buildScopeXRay`, `buildAreaScopeBreakdown`, and adjacent route-level confirmation construction are highly visible estimator-trust surfaces. They should not reintroduce raw boundary text as included work after the shared facts migrations.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed the safe Phase 8A migration by moving route-level display-only Scope-to-Price X-Ray and area confirmation diagnostics onto `buildEstimatorScopeFacts()` where safe while leaving pricing, anchors, deterministic engines, `materialsList.items` generation, `scopeSplitter`, prompts, route contracts, and customer output unchanged.
- Exact files/components involved: `app/api/generate/route.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts`, `app/api/generate/lib/estimator/orchestrator.ts`, `app/api/generate/lib/estimator/types.ts`, `app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, anchors, deterministic engines, materials generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, measured plan pricing eligibility, or broad route refactors.
- Tests or manual QA needed: Focused route display diagnostics tests plus adjacent EstimatorScopeFacts, missed-scope detector, Estimate Defense, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `route.ts` now builds EstimatorScopeFacts once for `scopeChange`.
- `routeDisplayDiagnostics.ts` and `routeDisplayDiagnostics.test.ts` were added.
- `routeDisplayDiagnostics.test.ts` passes 6/6.
- `orchestrator.ts` passes `scopeFacts` through the internal estimator context to X-Ray construction, and `types.ts` includes `scopeFacts` on that internal context.
- `buildScopeXRay` now uses shared facts for true mixed trade risk support, patch/texture confirmation, and baseboard/trim LF confirmation.
- `buildAreaScopeBreakdown` now uses shared facts for demo/removal driver suppression, surface prep / patch driver detection, tile-trim vs carpentry-trim distinction, baseboard replacement/removal context, and trim/baseboard missing confirmation.
- Public route/API response shape was preserved.
- Validation passed: `routeDisplayDiagnostics.test.ts` 6/6, `estimator-scope-facts.test.ts` 9/9, `missedScopeDetector.test.ts` 9/9, `estimateDefenseMode.test.ts` 7/7, `orchestratorEstimateSections.test.ts` 2/2, `priceguard-review.test.ts` 17/17, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 14/14, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This display-only route diagnostics migration did not change pricing formulas, backend pricing semantics, anchors, deterministic engines, `materialsList.items` generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, or measured plan pricing eligibility.
- Phase 8B buildMaterialsList confirmation items/notes and materials diagnostics migration is complete in the next item. Phase 8C materialsList.items conditional item gate migration plus Phase 8D-2 coordination text gating, Phase 8D-3 schedule/rationale gating, Phase 8D-4A route display diagnostics gating, Phase 8D-4B estimate explanation gating, and Phase 8D-5A profit leak diagnostics gating are complete below. Current next active task is broader launch-readiness / regression audit before adding more estimator behavior changes. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 8B buildMaterialsList confirmation items/notes and materials diagnostics EstimatorScopeFacts migration

- Problem: `buildMaterialsList` confirmation items/notes and materials diagnostics still had some raw scope parsing after Phase 8A, even though `materialsList.items` generation was intentionally left unchanged because it is customer-visible.
- Why it matters: Materials confirmations should understand exclusions, by-others scope, owner/customer material responsibility, protection-only wording, existing-to-remain conditions, tile trim context, patch/texture context, and true mixed trades without changing customer-visible materials output.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed the safe Phase 8B migration by passing `scopeFacts` into `buildMaterialsList` and using EstimatorScopeFacts only for `materialsList.confirmItems` and `materialsList.notes` decisions.
- Exact files/components involved: `app/api/generate/route.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, anchors, deterministic engines, `materialsList.items` generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, measured plan pricing eligibility, or broad route refactors.
- Tests or manual QA needed: Focused route display diagnostics tests plus adjacent EstimatorScopeFacts, missed-scope detector, Estimate Defense, orchestrator estimate-section, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `route.ts` now passes `scopeFacts` into `buildMaterialsList`.
- `routeDisplayDiagnostics.ts` now handles materials confirmItems/notes helper logic.
- `routeDisplayDiagnostics.test.ts` was updated and passes 14/14.
- Only `materialsList.confirmItems` and `materialsList.notes` were migrated.
- `materialsList.items` generation stayed unchanged.
- `MaterialsList` return shape and public route/API response shape were preserved.
- ConfirmItems/notes now use shared facts for excluded patch/texture/drywall context, by-others plumbing/electrical context, owner/customer-supplied fixture/material boundary context, flooring protection / existing-to-remain context, tile trim vs carpentry/base trim context, and true mixed materials note gating.
- Flooring transition confirmation now drops “trim footage” when shared facts show existing baseboards / flooring protection context.
- Combined materials note now uses `trueMixedTrades` instead of only `splitScopes.length`.
- Validation passed: `routeDisplayDiagnostics.test.ts` 14/14, `estimator-scope-facts.test.ts` 9/9, `missedScopeDetector.test.ts` 9/9, `estimateDefenseMode.test.ts` 7/7, `orchestratorEstimateSections.test.ts` 2/2, `priceguard-review.test.ts` 17/17, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 14/14, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This confirmItems/notes-only backend materials diagnostics migration did not change pricing formulas, backend pricing semantics, anchors, deterministic engines, `materialsList.items` generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, or measured plan pricing eligibility.
- Phase 8C materialsList.items conditional item gate migration is complete in the next item. Phase 8D-2 coordination text gating, Phase 8D-3 schedule/rationale gating, Phase 8D-4A route display diagnostics gating, Phase 8D-4B estimate explanation gating, and Phase 8D-5A profit leak diagnostics gating are complete below. Current next active task is broader launch-readiness / regression audit before adding more estimator behavior changes. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 8C materialsList.items conditional item gate EstimatorScopeFacts migration

- Problem: After Phase 8B, selected customer-visible `materialsList.items` conditional item gates still used raw scope parsing even though confirmItems/notes had moved to shared facts.
- Why it matters: Material item rows are customer-visible, so they should avoid boundary-only false positives while preserving existing labels, base packages, and contractor expectations.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed the smallest safe Phase 8C migration by using EstimatorScopeFacts-aware gates only for selected conditional item triggers.
- Exact files/components involved: `app/api/generate/route.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts`.
- What not to touch: Pricing formulas, backend pricing semantics, anchors, deterministic engines, `scopeSplitter` behavior, route/API response shape, `MaterialsList` return shape, material labels, base trade consumables, anchor base packages, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, measured plan pricing eligibility, or broad route structure.
- Tests or manual QA needed: Focused route display diagnostics tests plus adjacent EstimatorScopeFacts, missed-scope detector, Estimate Defense, orchestrator estimate-section, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `route.ts` now uses EstimatorScopeFacts-aware gates for selected `materialsList.items` conditional item triggers.
- `routeDisplayDiagnostics.ts` now handles materials item gate helper logic.
- `routeDisplayDiagnostics.test.ts` was updated and passes 20/20.
- Conditional gates migrated: kitchen backsplash/flooring/paint/demo add-ons, kitchen refresh backsplash/flooring add-ons, flooring tile setting materials, drywall texture/primer items, electrical/plumbing parsed fixture/device counts, and carpentry parsed LF material quantity.
- Material item trigger logic now prefers EstimatorScopeFacts-aware included material text instead of raw boundary text where safe.
- Drywall texture/primer item decisions now respect `patchTextureIncluded` / `patchTextureExcluded`.
- Electrical/plumbing fixture counts now parse boundary-filtered material item text.
- Carpentry LF material quantity now parses boundary-filtered material item text.
- `MaterialsList` shape and public route/API response shape were preserved.
- Material labels, base trade consumables, and anchor base packages stayed unchanged.
- Validation passed: `routeDisplayDiagnostics.test.ts` 20/20, `estimator-scope-facts.test.ts` 9/9, `missedScopeDetector.test.ts` 9/9, `estimateDefenseMode.test.ts` 7/7, `orchestratorEstimateSections.test.ts` 2/2, `priceguard-review.test.ts` 17/17, `scope-price-consistency-review.test.ts` 18/18, `customer-scope-drift.test.ts` 71/71, `schedule-sequencing-review.test.ts` 14/14, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This selected conditional-gates-only materials item migration did not change pricing formulas, backend pricing semantics, anchors, deterministic engines, `scopeSplitter` behavior, route/API response shape, `MaterialsList` shape, material labels, base trade consumables, anchor base packages, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, or measured plan pricing eligibility.
- Phase 8D-2 customer-facing coordination text gating is complete in the next item, and Phase 8D-3 schedule/rationale multi-trade text gating is complete below. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 8D-2 customer-facing trade coordination text safety gate

- Problem: `appendTradeCoordinationSentence()` could append customer-facing coordination language from upstream `tradeStack` entries even when those trades only appeared in excluded, by-others, protection-only, coordination-only, existing/to-remain, owner/customer-supplied material-only, or boundary-only context.
- Why it matters: `result.text` should only imply contractor coordination responsibility when the included scope actually contains multiple included trades or true sequencing responsibility.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed a narrow append-time safety gate. `appendTradeCoordinationSentence()` now accepts optional EstimatorScopeFacts, finalization passes `ctx.scopeFacts`, and appended coordination trades are filtered against `scopeFacts.includedTrades` when facts are available.
- Exact files/components involved: `app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.ts`, `app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts`, `app/api/generate/lib/estimator/finalize.ts`, `app/api/generate/lib/estimator/orchestrator.ts`.
- What not to touch: Global `detectTradeStack`, prompts, `effectiveScopeChange`, route/API response shape, pricing, schedule, materials generation, `scopeSplitter`, deterministic engines, docs, payment, Stripe, webhook, checkout, entitlement, billing, auth, or deployment.
- Tests or manual QA needed: Focused prompt-adjacent diagnostics tests plus adjacent scope-signal, orchestrator estimate-section, EstimatorScopeFacts, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- False customer-facing coordination text is now suppressed when upstream trade-stack entries are unsupported by included-work facts.
- Suppressed contexts include excluded, by-others, protection-only, coordination-only, existing/to-remain, owner/customer-supplied material-only, and boundary-only trade mentions.
- True mixed renovation coordination remains preserved.
- Duplicate coordination sentence protection still works.
- Backward compatibility is preserved for direct helper callers without `scopeFacts`.
- Validation passed: `routePromptAdjacentDiagnostics.test.ts` 11/11, `scopeSignals.test.ts` 4/4, `orchestratorEstimateSections.test.ts` 2/2, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This was a customer-facing text safety gate only. It did not change prompts, `effectiveScopeChange`, route/API shape, pricing, schedule, materials generation, `scopeSplitter`, deterministic engines, docs, or global `detectTradeStack` behavior.
- Phase 8D-3 schedule/rationale multi-trade text gating is complete in the next item.

#### Item: Phase 8D-3 schedule/rationale multi-trade text safety gate

- Problem: After Phase 8D-2, customer-facing coordination append text was gated, but schedule/rationale logic could still add `multi-trade coordination` from upstream `tradeStack.isMultiTrade` or `complexityProfile.multiTrade` even when shared facts showed only one included trade.
- Why it matters: Schedule rationale should not imply multi-trade coordination when the extra trades only appear in excluded, by-others, protection-only, coordination-only, existing/to-remain, owner/customer-supplied material-only, or boundary-only context.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed a narrow schedule/rationale text gate. `estimateCalendarDaysRange()` now accepts optional EstimatorScopeFacts, `buildScheduleBlock()` accepts optional facts, and route/orchestrator plumbing passes `ctx.scopeFacts`.
- Exact files/components involved: `app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.ts`, `app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts`, `app/api/generate/lib/estimator/orchestrator.ts`, `app/api/generate/route.ts`.
- What not to touch: Prompts, `effectiveScopeChange`, route/API response shape, pricing formulas, schedule math beyond the false rationale gate, materials generation, `scopeSplitter`, deterministic engines, docs, payment, Stripe, webhook, checkout, entitlement, billing, auth, deployment, or global `detectTradeStack`.
- Tests or manual QA needed: Focused prompt-adjacent diagnostics tests plus adjacent orchestrator estimate-section, EstimatorScopeFacts, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `multi-trade coordination` schedule/rationale text is now added only when `scopeFacts` is absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Polluted upstream `tradeStack.isMultiTrade` or `complexityProfile.multiTrade` no longer creates false multi-trade rationale when shared facts show a single included trade.
- True mixed renovation still preserves multi-trade rationale.
- Validation passed: `routePromptAdjacentDiagnostics.test.ts` 14/14, `orchestratorEstimateSections.test.ts` 2/2, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This was a schedule/rationale text safety gate only. It did not change prompts, `effectiveScopeChange`, route/API shape, pricing formulas, schedule math, materials generation, `scopeSplitter`, deterministic engines, docs, or global `detectTradeStack` behavior.
- Phase 8D-4A route display multi-trade diagnostics gating is complete in the next item.

#### Item: Phase 8D-4A route display multi-trade diagnostics safety gate

- Problem: After Phase 8D-2 and 8D-3, customer-facing coordination text and schedule/rationale multi-trade text were gated, but display-only route diagnostics could still say `Multiple trades require coordination and sequencing.` or `Multi-trade coordination likely` from upstream `tradeStack.isMultiTrade` or `complexityProfile.multiTrade`.
- Why it matters: Scope X-Ray and area breakdown diagnostics should not imply multi-trade work when extra trades only appear in excluded, by-others, protection-only, existing/to-remain, owner/customer-supplied material-only, or boundary-only context.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed a narrow display-only diagnostic gate. `routeDisplayDiagnostics.ts` now exposes `shouldShowTrueMixedTradeDiagnostic(scopeFacts)`, returning true only when `scopeFacts.trueMixedTrades` is true. `buildScopeXRay()` and `buildAreaScopeBreakdown()` use that helper before adding multi-trade display diagnostics.
- Exact files/components involved: `app/api/generate/route.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts`.
- What not to touch: Prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildEstimateExplanation`, `buildPhotoEstimateDecision`, or `profitLeakDetector`.
- Tests or manual QA needed: Focused route display diagnostics tests plus adjacent prompt-adjacent diagnostics, EstimatorScopeFacts, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- Scope X-Ray now only adds `Multiple trades require coordination and sequencing.` when shared facts show true mixed included trades.
- Area scope breakdown now only adds `Multi-trade coordination likely` when shared facts show true mixed included trades.
- Boundary-only, excluded, by-others, protection-only, existing-to-remain, and owner-supplied trade mentions no longer create those display-only multi-trade diagnostics when shared facts show one included trade.
- True mixed renovation diagnostics remain preserved.
- Validation passed: `routeDisplayDiagnostics.test.ts` 25/25, `routePromptAdjacentDiagnostics.test.ts` 14/14, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This was a display-only diagnostic safety gate. It did not change prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildEstimateExplanation`, `buildPhotoEstimateDecision`, or `profitLeakDetector`.
- Phase 8D-4B estimate explanation multi-trade gating is complete in the next item.

#### Item: Phase 8D-4B estimate explanation multi-trade text safety gate

- Problem: After Phase 8D-4A, `buildEstimateExplanation()` could still add `Multiple trades require sequencing and coordination.` from upstream `complexityProfile.multiTrade` even when shared facts showed only one included trade.
- Why it matters: Diagnostic estimate explanation text should not imply multi-trade sequencing when extra trades appear only in excluded, by-others, protection-only, coordination-only, existing/to-remain, owner/customer-supplied material-only, or boundary-only context.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed a narrow diagnostic estimate-explanation gate. `buildEstimateExplanation()` now receives optional EstimatorScopeFacts through the orchestrator and only adds the multi-trade explanation when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Exact files/components involved: `app/api/generate/route.ts`, `app/api/generate/lib/estimator/orchestrator.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts`, `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts`, `app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts`.
- What not to touch: Prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, `buildPhotoEstimateDecision`, or `profitLeakDetector`.
- Tests or manual QA needed: Focused route display diagnostics tests plus adjacent prompt-adjacent diagnostics, orchestrator estimate-section, EstimatorScopeFacts, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `buildEstimateExplanation()` now receives optional scope facts.
- The diagnostic estimate explanation text `Multiple trades require sequencing and coordination.` is only added when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Polluted upstream `complexityProfile.multiTrade` no longer creates this false explanation for single-included-trade scopes.
- True mixed renovation explanation remains preserved.
- Validation passed: `orchestratorEstimateSections.test.ts` 3/3, `routeDisplayDiagnostics.test.ts` 28/28, `routePromptAdjacentDiagnostics.test.ts` 14/14, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This was a diagnostic estimate-explanation text safety gate. It did not change prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, `buildPhotoEstimateDecision`, or `profitLeakDetector`.
- Phase 8D-5A profit leak diagnostics migration is complete in the next item.

#### Item: Phase 8D-5A profit leak diagnostics EstimatorScopeFacts migration

- Problem: `profitLeakDetector` still trusted raw scope and polluted `tradeStack.isMultiTrade` in diagnostic profit leak warnings after the surrounding Phase 8D text gates moved to shared facts.
- Why it matters: Profit leak diagnostics should not imply coordination burden, wet-area setup exposure, demo carry, or pricing spread risk when extra trades only appear in excluded, by-others, protection-only, existing/to-remain, owner/customer-supplied, coordination-only, or boundary-only context.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed a diagnostic-only migration. `detectProfitLeaks()` now accepts optional EstimatorScopeFacts, orchestrator passes `ctx.scopeFacts`, included-work text drives bathroom/wet-area/demo/protection checks where facts are present, and coordination-load checks use `scopeFacts.trueMixedTrades` instead of polluted `tradeStack.isMultiTrade`.
- Exact files/components involved: `app/api/generate/lib/estimator/profitLeakDetector.ts`, `app/api/generate/lib/estimator/orchestrator.ts`, `app/api/generate/lib/estimator/profitLeakDetector.test.ts`.
- What not to touch: Photo-estimate decision logic, photo pricing behavior, `derivePhotoPricingImpact`, prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, or `buildPhotoEstimateDecision`.
- Tests or manual QA needed: Focused profit leak detector tests plus adjacent Estimate Defense, orchestrator estimate-section, EstimatorScopeFacts, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `detectProfitLeaks()` now accepts optional scope facts.
- Orchestrator now passes `ctx.scopeFacts`.
- Bathroom/wet-area/demo/protection checks use included-work text where facts are present.
- Coordination-load profit leak checks use `scopeFacts.trueMixedTrades` instead of polluted `tradeStack.isMultiTrade`.
- No-facts calls remain backward-compatible and keep old trade-stack behavior.
- False profit leak diagnostics are suppressed for boundary-only trade mentions when shared facts show one included trade.
- True mixed renovation, true wet-area remodel, and true demo/removal review behavior remain preserved.
- Validation passed: `profitLeakDetector.test.ts` 8/8, `estimateDefenseMode.test.ts` 7/7, `orchestratorEstimateSections.test.ts` 3/3, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- This was a diagnostic-only profit leak migration. It did not change photo-estimate decision logic, photo pricing behavior, `derivePhotoPricingImpact`, prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, or `buildPhotoEstimateDecision`.
- Phase 8D-6A photo-estimate decision characterization is complete in the next item. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 8D-6A photo-estimate decision characterization seam

- Problem: Photo-estimate decision logic is pricing/policy-adjacent because it can affect `pricingAllowed`, `pricingPolicy`, `estimateMode`, blockers, `missingInputs`, confidence, confidenceBand, and future `ENFORCE_PHOTO_ESTIMATE_DECISION` behavior.
- Why it matters: This path should not be migrated to EstimatorScopeFacts or otherwise changed without first locking down current behavior and known false positives.
- Risk level: Medium
- Priority: P1
- Recommended fix approach: Completed characterization/test-seam work only. Pure photo-estimate decision helpers were extracted from `route.ts` into `routePhotoEstimateDecision.ts`, and `route.ts` now imports and calls the extracted helpers without intended runtime behavior changes.
- Exact files/components involved: `app/api/generate/route.ts`, `app/api/generate/lib/estimator/routePhotoEstimateDecision.ts`, `app/api/generate/lib/estimator/routePhotoEstimateDecision.test.ts`.
- What not to touch: Photo pricing behavior, `derivePhotoPricingImpact`, `pricingAllowed`, blockers, confidence, confidenceBand, estimateMode, pricing policy, prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, payment, Stripe, webhook, checkout, entitlement, billing, auth, or deployment.
- Tests or manual QA needed: Focused photo-estimate decision characterization tests plus adjacent route prompt/display diagnostics tests, EstimatorScopeFacts tests, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `routePhotoEstimateDecision.ts` now contains the pure photo-estimate decision helpers extracted from `route.ts`.
- `route.ts` imports and calls the extracted helpers.
- This was characterization/test-seam work only; no EstimatorScopeFacts gating or behavior fix was implemented.
- Characterization tests document current behavior: polluted `tradeStack.isMultiTrade` still adds `Multiple trades were detected, which increases pricing risk.`, polluted multi-trade signals can still force `measurements` into `missingInputs`, electrical owner-supplied fixture wording can count as usable electrical device quantity, plumbing `by others` fixture wording can count as usable plumbing fixture quantity, and polluted multi-trade stack can still block photo-only pricing for carpentry/baseboard scopes through measurement-heavy logic.
- Validation passed: `routePhotoEstimateDecision.test.ts` 9/9, `routePromptAdjacentDiagnostics.test.ts` 14/14, `routeDisplayDiagnostics.test.ts` 28/28, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- Phase 8D-6B photo-estimate decision reason-text gating is complete in the next item. Production Live Mode subscription verification remains the final pre-launch gate only.

#### Item: Phase 8D-6B photo-estimate decision multi-trade reason-text gate

- Problem: After Phase 8D-6A, `buildPhotoEstimateDecision()` could still add `Multiple trades were detected, which increases pricing risk.` from polluted `tradeStack.isMultiTrade` even when extra trades appeared only in boundary context.
- Why it matters: This text can mislead contractors reviewing photo-estimate risk, but the surrounding photo-estimate decision path is pricing/policy-adjacent and should not be broadly changed before launch.
- Risk level: Low for the completed reason-text-only cleanup; high for deferred pricing/policy changes.
- Priority: P1
- Recommended fix approach: Completed a narrow reason-text-only gate. `buildPhotoEstimateDecision()` now accepts optional EstimatorScopeFacts, and `route.ts` passes existing `scopeFacts` into the photo estimate decision.
- Exact files/components involved: `app/api/generate/lib/estimator/routePhotoEstimateDecision.ts`, `app/api/generate/lib/estimator/routePhotoEstimateDecision.test.ts`, `app/api/generate/route.ts`.
- What not to touch: Photo pricing behavior, `derivePhotoPricingImpact`, `pricingAllowed`, blockers, confidence, confidenceBand, estimateMode, pricing policy, `missingInputs`, confidence penalty from `tradeStack.isMultiTrade`, measurement-heavy behavior, raw quantity parsing, prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, payment, Stripe, webhook, checkout, entitlement, billing, auth, deployment, `detectTradeStack`, or `buildComplexityProfile`.
- Tests or manual QA needed: Focused photo-estimate decision tests plus adjacent route prompt/display diagnostics tests, EstimatorScopeFacts tests, UI review-stack tests, TypeScript, and diff check.
- Status: Done

Done note:

- `buildPhotoEstimateDecision()` now accepts optional `scopeFacts?: EstimatorScopeFacts | null`.
- The photo-estimate decision reason text `Multiple trades were detected, which increases pricing risk.` is only added when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- `route.ts` now passes existing `scopeFacts` into the photo estimate decision.
- Boundary-only / polluted multi-trade stacks no longer create that reason text when shared facts show one included trade.
- True mixed renovation and no-facts backward-compatible behavior still keep the reason.
- This was reason-text-only. It did not change `pricingAllowed`, blockers, confidence, confidenceBand, estimateMode, pricingPolicy, `missingInputs`, `derivePhotoPricingImpact`, photo pricing behavior, confidence penalty from `tradeStack.isMultiTrade`, measurement-heavy behavior, raw quantity parsing, prompts, `effectiveScopeChange`, `result.text`, route/API shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, payment/auth, `detectTradeStack`, or `buildComplexityProfile`.
- Validation passed: `routePhotoEstimateDecision.test.ts` 12/12, `routePromptAdjacentDiagnostics.test.ts` 14/14, `routeDisplayDiagnostics.test.ts` 28/28, `estimator-scope-facts.test.ts` 9/9, `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` 41/41, `npx tsc --noEmit`, and `git diff --check`.
- Deferred photo behavior items remain: polluted multi-trade signals can still affect the confidence penalty and measurement-heavy behavior, and raw owner-supplied / by-others quantity parsing remains unchanged. These are pricing/policy-adjacent and should stay deferred unless explicitly scoped after launch-readiness review.
- Phase 8D scope-boundary text/diagnostic cleanup is substantially complete. Next active task should be a broader launch-readiness / regression audit before adding more estimator behavior changes.

#### Item: Scope-to-Price Consistency Review Guard false-positive cleanup

- Problem: The new UI-side Scope-to-Price Consistency Review Guard initially over-classified some normal trade consumables and prep context as unsupported material or mixed-scope issues.
- Why it matters: Scope-to-price review should feel like a senior estimator checking estimate consistency, not a generic materials keyword checklist.
- Risk level: Low
- Priority: P1
- Recommended fix approach: Completed a focused false-positive cleanup in the warning-only guard. Painting prep consumables such as caulk, spackle, filler, and masking tape no longer warn as unsupported drywall materials; true drywall materials such as drywall sheet, joint compound, and drywall tape still warn when drywall is unsupported. Generic flooring adhesive / misc install supplies no longer warn as wallcovering materials; clear wallcovering labels such as wallpaper rolls or wallcovering seam adhesive still warn when wallcovering is unsupported. Wallcovering wall prep and primer are treated as wallcovering prep context, not separate painting work.
- Exact files/components involved: `app/app/lib/scope-price-consistency-review.ts`, `app/app/lib/scope-price-consistency-review.test.ts`
- What not to touch: Pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.
- Tests or manual QA needed: Focused consistency guard tests, existing estimator tests, TypeScript, diff check, and manual QA for the first three retest PDFs.
- Status: Done

Done note:

- Scope-to-Price Consistency Review Guard false-positive cleanup is complete.
- Case 7A painting scope remains quiet, true mixed painting + LVP remains accepted, the false flooring anchor/material warning test now passes, and the wallcovering test no longer shows the false painting + wallcovering mixed-scope warning.
- Validation passed: `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` with 12/12 passing, `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` with 35/35 passing, `npx tsc --noEmit`, and `git diff --check`.
- Manual QA passed for the first three retest PDFs.
- This was UI-side/warning-only and did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.

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
- Stripe webhook retry-safe dedupe fix is complete and deployed. Webhook events are recorded as processed only after entitlement activation/update succeeds; failed entitlement writes return `500` and remain retryable; duplicate processed events remain idempotent.
- Production deployment sanity check passed after the retry-safe dedupe fix.

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
