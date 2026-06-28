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
- Shared EstimatorScopeFacts helper:
  - Added as deterministic text-only architecture groundwork for the estimator brain.
  - Centralizes raw/normalized scope text, clause-level included work, boundary text, included/excluded/coordination/protection/existing-condition trades, owner/customer/contractor-supplied material responsibility, patch/texture context, tile trim context, wallcovering prep context, baseboard replacement/removal context, and true mixed-trade facts.
  - `typed-scope-normalization.ts` consumes `buildEstimatorScopeFacts()` first while preserving its existing public function names and return shape.
  - Scope-to-Price Consistency Review, Customer Scope Drift, Schedule Sequencing Review, PriceGuard Review, backend Estimate Defense, backend missedScopeDetector, route-level display-only Scope-to-Price X-Ray / area confirmation diagnostics, `buildMaterialsList` confirmItems/notes, selected `materialsList.items` conditional gates, customer-facing trade coordination append gating, schedule/rationale multi-trade text gating, route display multi-trade diagnostic gating, estimate explanation multi-trade gating, profit leak diagnostics, and photo-estimate decision multi-trade reason text now consume EstimatorScopeFacts where safe. Phase 8D-6A characterized the photo-estimate decision path, and Phase 8D-6B completed a reason-text-only cleanup without changing photo pricing behavior. Broader route diagnostics, `scopeSplitter`, pricing prep, and pricing/policy-adjacent photo behavior are not fully migrated/audited yet.
- UI-side typed scope normalization for pre-generate scope-quality review:
  - Splits typed scope into clauses.
  - Classifies included work, excluded/by-others work, protection-only language, coordination-only language, existing conditions, material responsibility, permit responsibility, and quantity/location signals.
  - Uses included-work clauses for trade work detection while preserving boundary clauses for material responsibility, permit responsibility, exclusions, access/patching exclusions, and quantity/location support.
  - Reduces false positives for phrases such as electrical by others, plumbing excluded, wall repair excluded, protect flooring, work around existing baseboards, owner supplies fixtures, GC handles permits, demo by others, room ranges, remove/reinstall plumbing work, and narrow touch-up scopes.
- AI-generated customer-facing scope descriptions with useful step-by-step task sequencing, materials language, and work-description detail. This detailed estimator prose is a core product strength to preserve; safety guards should review unsupported expansion rather than automatically flattening, shortening, removing, or rewriting `result.text`.
- Warning-only AI Scope Protection / Unsupported Scope Review Guard detects unsupported customer-facing scope expansion while preserving `result.text`. It adds estimator-facing review warnings for explicit electrical/plumbing exclusions, repair exclusions, painting-to-drywall expansion, flooring-to-baseboard/painting/carpentry expansion, bathroom/tile rough-in expansion, and General Renovation over-support cases without changing generated customer text. It also suppresses adjacent-trade context false positives such as protecting flooring, avoiding electrical interference, coordinating with other trades, or working around door jambs/baseboards/transitions unless actual trade work is promised. Electrical coordination/protection-only wording such as coordination with the electrical trade, preventing interference with adjacent electrical components, and avoiding existing electrical wiring no longer triggers unsupported electrical warnings unless actual electrical work is promised.
- Customer Scope Drift now consumes EstimatorScopeFacts for written scope support, included-work facts, excluded/by-others context, coordination-only context, protection-only context, existing/to-remain context, and trade conflict checks. The guard keeps specialized generated-text true-work detection in place for electrical, plumbing, carpentry, demolition, drywall/patching, flooring, bathroom/tile, and wallcovering. It remains warning-only, preserves public return shapes, and does not mutate Customer-Facing Scope / `result.text`.
- Customer Scope Drift / Estimator Review false-positive cleanup is complete through the final generated-context pass. Drywall substrate/prep/material/condition wording, flooring protection and flooring threshold/transition/fitment context, and outlet-cover/cover-plate handling-only wording are treated as context-only and no longer create unsupported drift, false mixed-scope summary wording, or false Crew Planning multi-trade notes. True drywall, electrical/circuit, flooring, carpentry, baseboard, and threshold work still surfaces clearly. Customer Output Readiness stays collapsed for context-only cases, Estimator Review Summary remains compact, and Crew Planning still shows true multi-trade/boundary planning behavior for true typed multi-trade scopes. Final desktop+iPhone Playwright screenshot QA passed with `test12345@gmail.com`, Chromium 1.60.0, 18/18 scenarios completed, 0 runner failures, and artifacts in `/tmp/jobestimatepro-final-generated-context-drift-qa/final-run-1`. This remains UI/client review-only and does not change backend behavior, API shape, saved estimates, PDFs/customer output, pricing, prompts, `result.text`, materials, deterministic engines, billing/auth, Smart Questions authority, or Evidence Authority exposure.
- Real-world Customer Scope Drift cleanup now prevents noisy `scopeXRay` split-scope entries such as `electrical` or `electrical coordination only` from suppressing true unsupported electrical drift. Unsupported electrical expansion remains visible when Customer-Facing Scope promises electrical rough-in, device adjustments, fixture relocation, conduit penetration patching, disconnection/reinstallation of devices and wiring, or electrical scope/work with wiring, devices, conduit, fixtures, outlets, switches, circuits, panels, or breakers. Case 1B manual QA now passes for electrical visibility, and Case 7A with Trade Type = Painting passes without the previous unsupported drywall/painting false positive. `result.text` remains preserved.
- Case 1 Painting real-world QA cleanup now treats phrases such as coordination with ongoing drywall/carpentry work and minimize-interference language as coordination-only context, not promised carpentry or drywall scope. Walls-only painting with adjacent drywall, flooring, trim/baseboard, electrical, plumbing, and carpentry exclusions no longer produces unsupported carpentry warnings, false painting+drywall mixed-scope warnings, false multi-trade coordination diagnostics, flooring/trim/baseboard sequencing, flooring-paint coordination, or Estimate Defense wording that the job is not single-trade only. True carpentry/baseboard/trim promises and true patch-and-paint behavior remain preserved.
- Remaining real-world QA cleanup across Cases 4, 6, 7, and 8 is complete. Electrical vanity-light/rough-in scopes with owner-supplied fixtures and drywall/paint by others now stay electrical-only; sequencing/framing/finish-trade wording no longer creates unsupported carpentry drift. Bathroom/tile shower wall waterproofing/tile/grout/tile-trim scopes now keep demo, cement board/backer, membrane, waterproofing, tile, grout, and edge trim in tile/bathroom context instead of false General Renovation, plumbing, flooring, or carpentry diagnostics. General Renovation scopes that are detected as wallcovering-only now receive wallcovering-specific guidance instead of bathroom/tile cure, glass/fixture, demo/rough-in, or broad renovation sequencing noise. Carpentry baseboard removal/disposal and demolition of existing baseboards are treated as normal baseboard replacement prep. True mixed scopes and true unsupported warnings remain preserved, and detailed Customer-Facing Scope / `result.text` remains a core product strength that was not broadly rewritten.
- Backend scope-boundary filtering now uses included-work scope text for split-scope detection, mixed-renovation detection, and PriceGuard anchor eligibility. Excluded/by-others/protection/coordination-only/existing-condition clauses no longer create false backend split-scope trades. Cross-trade sentence/segment-level filtering prevents boundary clauses such as electrical by others, painting by others, texture match excluded, flooring protection only, existing baseboards to remain, owner-supplied fixtures, furniture moving by others, plumbing by others, and electrical coordination-only language from leaving orphan trade nouns as included scope. Tile and wallcovering recognition preserve true tile/waterproofing and wallcovering prep/primer scopes, and true mixed painting + flooring still works. `result.text` remains preserved.
- Backend scope-to-price, schedule phase, complexity, and Estimate Defense diagnostics now use included-work interpretation where needed so excluded adjacent trade terms do not imply real multi-trade work. Excluded drywall repair, skim coat, and texture matching no longer classify a painting-only scope as patch-and-paint or create `Primer / sealer after patching`; true patch-and-paint still produces drywall/painting split scopes, patch/texture dry-time, drywall dry/return, primer, compound/tape, sanding, and painting details.
- Scope-to-Price Consistency Review Guard is UI-side and warning-only. It reviews whether typed scope, selected trade, Scope-to-Price X-Ray, pricing method/anchor, materials list, and estimate sections agree without changing pricing or `result.text`. False-positive cleanup now treats painting prep consumables such as caulk, spackle, filler, and masking tape as painting prep rather than unsupported drywall materials; avoids treating generic flooring adhesive / misc install supplies as wallcovering materials; treats wallcovering wall prep and primer as wallcovering context rather than painting work; and preserves true unsupported drywall/wallcovering material warnings.
- Scope-to-Price Consistency Review now consumes EstimatorScopeFacts for included work, boundary context, material responsibility, tile trim context, wallcovering prep/primer context, and true mixed-trade facts. The review remains UI-side/warning-only and preserves its public fields: missed-scope warnings, labor/material confidence notes, scope clarity warnings, suggested exclusions, and contractor risk notes.
- Schedule Sequencing Review now consumes EstimatorScopeFacts for included trades, patch/texture context, wet-area tile sequencing, rough-in sequencing, wallcovering sequencing, owner/customer material timing, and true mixed sequencing where safe. It remains warning-only, preserves public review fields, and does not mutate Customer-Facing Scope / `result.text`.
- PriceGuard Review now consumes EstimatorScopeFacts where safe for aggregator-level boundary decisions, including wallcovering-only General Renovation resolution, material responsibility/boundary checks, exclusion boundary checks, permit boundary checks, and patch/texture confirm-item suppression. It preserves the `PriceGuardReview` return shape, warning-only fields, child guard behavior, customer text, and layout/caps.
- Backend Estimate Defense now consumes EstimatorScopeFacts for included-work and boundary-context diagnostics. Bathroom/wet-area defense reads included-work text instead of raw scope text, multi-trade defense uses shared included-trade facts before falling back to trade stack, and waterproofing/exclusion checks use included-work text so by-others/excluded context is less likely to create defense noise. The exported `buildEstimateDefenseMode` function and return shape remain unchanged.
- Backend missedScopeDetector now consumes EstimatorScopeFacts for warning-only missed-scope diagnostics. It builds shared facts once per detector context, uses `includedWorkText` for support checks, prefers shared included-work facts for job-type detection, uses `patchTextureIncluded` for patch/texture detection, uses shared baseboard replacement context, and prevents boundary-only owner-supplied, by-others, protection-only, coordination-only, and existing/to-remain text from driving missed-scope support checks. Public return shape and warning-only behavior remain unchanged.
- Route-level display-only Scope-to-Price X-Ray / area confirmation diagnostics now consume EstimatorScopeFacts where safe. `route.ts` builds facts once for `scopeChange`; `buildScopeXRay` uses shared facts for true mixed trade risk support, patch/texture confirmation, and baseboard/trim LF confirmation; `buildAreaScopeBreakdown` uses shared facts for demo/removal driver suppression, surface prep / patch driver detection, tile-trim vs carpentry-trim distinction, baseboard replacement/removal context, and trim/baseboard missing confirmation. Public route/API response shape remains unchanged.
- Backend materials diagnostics now consume EstimatorScopeFacts where safe for `buildMaterialsList` confirmItems/notes. `route.ts` passes `scopeFacts` into `buildMaterialsList`, and route display diagnostics helper logic filters confirmation items and notes for excluded patch/texture/drywall context, by-others plumbing/electrical context, owner/customer-supplied fixture/material boundaries, flooring protection and existing-to-remain context, tile trim vs carpentry/base trim context, and true mixed materials note gating.
- Selected route-level `materialsList.items` conditional gates now use EstimatorScopeFacts where safe. The migrated gates cover kitchen backsplash/flooring/paint/demo add-ons, kitchen refresh backsplash/flooring add-ons, flooring tile setting materials, drywall texture/primer items, electrical/plumbing parsed fixture/device counts, and carpentry parsed LF material quantity. MaterialsList shape, route/API response shape, material labels, base trade consumables, and anchor base packages stayed unchanged.
- Customer-facing trade coordination append text now uses EstimatorScopeFacts where safe. Finalization passes `scopeFacts` into the append helper, appended coordination trades are filtered against included trades, boundary-only trade-stack entries no longer imply contractor coordination responsibility, true mixed renovation coordination remains, and duplicate coordination sentences are still avoided.
- Schedule/rationale multi-trade text now uses EstimatorScopeFacts where safe. `estimateCalendarDaysRange()` and `buildScheduleBlock()` accept optional scope facts, route/orchestrator plumbing passes `ctx.scopeFacts`, and `multi-trade coordination` rationale is only added when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Route display multi-trade diagnostics now use EstimatorScopeFacts where safe. `shouldShowTrueMixedTradeDiagnostic(scopeFacts)` returns true only for `scopeFacts.trueMixedTrades`, and `buildScopeXRay()` / `buildAreaScopeBreakdown()` use it before adding display-only multi-trade diagnostics. Boundary-only, excluded, by-others, protection-only, existing-to-remain, and owner-supplied trade mentions no longer create those diagnostics when shared facts show one included trade; true mixed renovation diagnostics remain preserved.
- Estimate explanation multi-trade text now uses EstimatorScopeFacts where safe. `buildEstimateExplanation()` receives optional scope facts through the orchestrator and only adds `Multiple trades require sequencing and coordination.` when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true. Polluted upstream `complexityProfile.multiTrade` no longer creates this diagnostic explanation for single-included-trade scopes; true mixed renovation explanation remains preserved.
- Profit leak diagnostics now use EstimatorScopeFacts where safe. `detectProfitLeaks()` accepts optional scope facts, orchestrator passes `ctx.scopeFacts`, bathroom/wet-area/demo/protection checks use included-work text where facts are present, and coordination-load profit leak checks use `scopeFacts.trueMixedTrades` instead of polluted `tradeStack.isMultiTrade`. No-facts callers stay backward-compatible, and true mixed renovation, true wet-area remodel, and true demo/removal review behavior remain preserved.
- The UI-side estimator stack plus backend Estimate Defense, missedScopeDetector, route-level display diagnostics, materials diagnostics, selected materials item gates, customer-facing coordination append gating, schedule/rationale text gating, route display multi-trade diagnostic gating, estimate explanation multi-trade gating, and profit leak diagnostics now have EstimatorScopeFacts coverage across typed-scope normalization, Scope-to-Price Consistency Review, Customer Scope Drift, Schedule Sequencing Review, PriceGuard Review, display-only Estimate Defense diagnostics, warning-only missed-scope diagnostics, display-only X-Ray / area confirmation diagnostics, materials confirmItems/notes, selected customer-visible item gates, coordination text gating, schedule/rationale multi-trade text gating, display-only multi-trade diagnostic text, diagnostic estimate explanation text, and profit leak review text where safe.
- Photo-estimate decision behavior has been characterized through a test seam but is not migrated/fixed to EstimatorScopeFacts yet. Broader route diagnostics, `scopeSplitter`, and pricing prep are not fully migrated/audited to EstimatorScopeFacts yet. Customer-Facing Scope / `result.text` remains preserved and was not broadly rewritten.
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
  - Uses selected-trade context for review-only missed-scope guidance across painting, drywall, flooring, electrical, plumbing, bathroom/tile, wallcovering, carpentry, and general renovation
  - Flags trade-specific estimator review items such as fixture supply, access, patching, permits/inspections, substrate prep, transitions, disposal, finish selections, waterproofing, texture match, protection, exclusions, and sequencing
  - Includes UI-side, warning-only schedule sequencing intelligence for dry-time, cure-time, rough-in access/inspection/patching, flooring phases, wallcovering phases, general renovation phase order, and owner-supplied material lead-time/return-trip risk
  - Surfaces sequencing notes through existing PriceGuardReview fields only and suppresses notes when scope, generated result text, or schedule already addresses the sequencing issue
  - Score/level
  - Missed-scope warnings
  - Labor/material confidence notes
  - Scope clarity warnings
  - Suggested exclusions
  - Customer-ready price defense notes
  - Contractor-only risk notes
  - Pre-generation fallback state
- Customer Output Readiness provides estimator-only source details for PDF/download/customer-output readiness, summarizing unsupported trade wording, weak/review-only plan evidence, scope clarity, assumptions/exclusions, estimator risk notes, and send-readiness concerns without changing customer output or pricing.
  - Details are deduped across readiness items, capped at 2 per item, and the panel remains capped at 6 items. It now sits below `EstimatorReviewSummaryPanel` and `Quick Clarifications` as compact/collapsed details so the summary remains the primary review hub.
  - Warning-only AI Scope Protection can send capped supporting details into Customer Output Readiness so contractors see 1-2 useful review reasons before Pricing/PDF without hiding or rewriting Customer-Facing Scope.
  - Unsupported electrical drift now stays visible because Customer Output Readiness auto-opens for critical unsupported trade/scope drift when real electrical work is promised but only coordination/review support exists. Protection-only flooring language such as flooring protected with drop cloths no longer creates unsupported flooring drift or auto-opens readiness details, while true unsupported flooring work still warns.
- Estimator Review Summary provides the primary compact estimator-only, `data-no-print` review hub above supporting review details. It organizes existing client-side review signals into Ready/Needs Review, Pricing Basis, Scope Warnings, Excluded / By Others, Confirmations Needed, Photo / Plan Notes, Profit / Margin Checks, and details available below. The compactness pass keeps the summary less repetitive by hiding empty Photo / Plan Notes and Excluded / By Others cards, moving Advanced Details into a footer line, capping visible bullets to 2 per section, adding summary-level exact-text dedupe, reducing repeated measurement/surface and boundary/exclusion confirmation bullets when already shown elsewhere, and showing only the strongest margin/risk item in Profit / Margin Checks. This was UI/client-only, does not expose Evidence Authority, and does not change backend behavior, `/api/generate` response shape, saved estimate/history shape, PDFs/customer output, pricing, prompts, `result.text`, materials generation, deterministic engines, billing/auth, or deployment.
- Estimator Intelligence Findings Phase 10A is complete:
  - Phase 10A-1 added `buildEstimatorIntelligenceFindings()` in `app/app/lib/estimator-intelligence-findings.ts` with focused tests in `app/app/lib/estimator-intelligence-findings.test.ts`.
  - The mapper is client-safe and normalizes existing client-side plan, photo, missed-scope, PriceGuard/profit-leak, evidence-authority-like, and assembly-candidate-style signals into review-only findings.
  - Every inferred finding remains non-pricing-authoritative by default: `pricingEligibleNow: false`, `pricingAuthoritative: false`, `customerVisible: false`, `requiresEstimatorConfirmation: true`, and `dataNoPrint: true`.
  - Phase 10A-2 added `EstimatorIntelligenceFindingsPanel` as an estimator-only, compact/collapsible, `data-no-print` panel inside the internal Estimator Review area.
  - The panel appears only after an estimate exists and findings are present, shows summary counts, categories, finding details, evidence, and the guardrail “Review-only. Not included in pricing unless estimator confirms.”
  - Playwright Chromium desktop QA passed with screenshots at `/tmp/jobestimatepro-phase-10a-2-intelligence-findings-panel-qa`; print media hides the panel, customer-facing scope stayed clean, pricing text and estimate rows stayed unchanged, Crew Planning and Smart Questions stayed unchanged, and opening the panel did not trigger regeneration.
  - Phase 10A did not change the generate route, orchestrator, API response shape, saved estimate/history shape, pricing totals, prompts, PDFs/customer output, Crew Planning behavior, Smart Questions behavior, billing/auth, or deployment.
- Smart Questions V1 + Confirmed Answers V2-lite provides a compact estimator-only, `data-no-print` clarification panel. It generates up to 3 deduped trade-specific questions from existing client-side signals only, including selected trade, typed scope, scopeQuality warnings, PriceGuard Review, Customer Output Readiness, materials confirmations, area missing confirmations, Scope X-Ray confirmations, photo scope assist, and plan evidence strength. Confirmed answers are local React state only, are not sent to `/api/generate`, are not saved to estimate history/localStorage history, are not included in PDFs/customer output, and keep `pricingEligibleNow: false` for every answer. The polished panel now appears after `EstimatorReviewSummaryPanel` in the generated-result estimator review flow, no longer appears before the result, is labeled `Quick Clarifications`, is compact/collapsible, hides when empty, opens only for unanswered high-priority questions, and collapses when all visible questions are answered. When answered, the summary reads “Clarifications answered on this screen — price unchanged.” Smart Questions V2A added a classification-only `classifySmartQuestionAuthority()` helper with future-only statuses including `eligible_pricing_candidate`, `review_only`, `rejected_boundary_conflict`, `needs_followup`, and `stale_scope`; it is not wired into runtime behavior and always leaves `pricingAuthoritative` and `pricingEligibleNow` false. Evidence Authority remains internal/debug-only and is not exposed in normal UI.
- Generated Result Command Center now prioritizes contractor workflow value through five primary sections: Proposal, Price & Profit, Schedule & Crew, Review Before Sending, and Job Workflow. Advanced estimator diagnostics are consolidated into one collapsed `Advanced Diagnostics` drawer inside Review Before Sending, with `EstimateStatusCard` and deeper estimator/plan/PriceGuard diagnostics kept there instead of competing with the main send workflow. This preserves the safety review stack while reducing top-level diagnostic clutter.
- Proposal Delivery Actions V1 lives inside the Proposal section near Customer-Facing Scope. `Download Estimate PDF` uses the existing browser PDF behavior, and `Copy proposal text` copies only the customer-facing `result.text` proposal/scope text. These controls are `data-no-print`; PDF content, PDF HTML generation, `/api/generate`, pricing, saved data shapes, approvals, billing, auth, Stripe, Supabase, and server-backed logic were not changed.
- Saved Job Templates V1 is client-only and localStorage-backed through `jobestimatepro_templates_v1`. Templates store safe setup fields only: id, name, createdAt/updatedAt, trade, document type, state, typed scope / `scopeChange`, paint scope, and optional notes. Applying a template prefills estimator input fields only, including the visible typed scope textarea after refresh, and does not auto-generate or change pricing, customer-facing proposal text, PDFs, API shape, saved estimate/history/job/invoice records, billing, auth, Stripe, Supabase, or server-backed logic.
- Rate Card V1 is client-only and localStorage-backed through `jobestimatepro_rate_card_v1`. It stores safe local contractor defaults only: updatedAt, markup, tax enabled/rate, deposit enabled/type/value, and reference-only trade/labor/material/minimum charge notes. Applying Rate Card updates only existing editable client-side controls for markup, tax enabled/rate, and deposit enabled/type/value. It is not backend pricing authority and does not change `/api/generate`, deterministic pricing engines, pricing formulas, labor totals, PDF content, saved data shapes, billing, auth, Stripe, Supabase, approval persistence, deployment, or server-backed logic.
- Field Handoff V1 lives inside the existing Job Workflow Command Center section and does not create a sixth section. It derives crew-ready handoff notes from existing estimate state only, including available job basics, scope summary, included work, exclusions/boundaries, schedule/crew guidance, materials/reminders, watch-outs/coordination, and deposit/payment note. It omits empty fields instead of inventing facts, excludes diagnostics/internal review and PriceGuard content from helper output, is not a diagnostic/reporting panel, adds no localStorage key or server persistence, and does not change pricing authority, PDF content, or `/api/generate`.
- Field Handoff V1 action controls are `data-no-print`. `Copy field handoff` copies only Field Handoff content and does not call Generate, mutate pricing, mutate `result.text`, or mutate history/jobs/invoices localStorage. No print action was added in V1.
- Full no-code end-to-end regression QA passed after `2261e10 Add field handoff workflow` using `test12345@gmail.com`. QA verified the five command-center sections, collapsed Advanced Diagnostics, Proposal actions without history/jobs/invoices mutation, Rate Card save/persist/apply without Generate or `result.text` changes, Job Templates save/persist/apply after refresh, Field Handoff inside Job Workflow, Field Handoff copy content and storage safety, print hiding for Proposal delivery controls, Rate Card, Job Templates, Field Handoff action controls, and Advanced Diagnostics, plus no console/page errors, blockers, or regressions.
- Crew Planning is an estimator-only, `data-no-print`, client-side planning panel after Estimated Schedule / schedule editor and before Estimator Review Summary. It is not sent to `/api/generate`, not saved to history/localStorage, not included in PDFs/customer output, and `affectsPricing: false`. It now includes a compact Daily Work Plan inside the existing Crew Planning panel only, below crew options and above Work Sequence. The readback adds `dailyPlan`, `dailyPlanNotes`, and `dailyPlanConfidence`; each daily plan item includes `label`, `crewSize`, `tasks`, `reminders`, `risks`, and `guidanceOnly: true`. Simple painting receives Day 1 / Visit 1 guidance, dry-time painting receives Visit 1 / Visit 2 return-trip guidance, flooring protection stays painting-focused, true multi-trade and painting/electrical scopes receive trade-boundary reminders, hotel/multi-unit scopes use rolling production entries rather than room-level cards, and missing schedules return a safe placeholder plan. It infers painting when selected trade is General Renovation but typed scope is painting-heavy, uses visit-aware labels instead of repeated “Needs schedule,” and shows a compact estimator-only planning note when typed scope clearly includes multiple trades. Protection-only floor wording does not trigger the multi-trade note; typed work such as painting plus flooring or painting plus outlets does. Final desktop/mobile Playwright QA passed with `test12345@gmail.com`; artifacts are in `/tmp/jobestimatepro-crew-planning-v2-daily-plan-qa/final-run-5`.
- Tax controls.
- Deposit controls.
- Schedule display and schedule editing.
- Schedule Sequencing Review Guard adds estimator-facing review guidance without changing the displayed schedule calculation, pricing, Customer Output Readiness behavior, or detailed AI-generated `result.text`.
- Schedule and Estimate Defense false-positive cleanup keeps normal two-coat paint dry-time while preventing excluded drywall/flooring/trim/baseboard/carpentry context from creating patch/texture dry-time, drywall dry/return, flooring-before-trim/baseboard sequencing, flooring-paint coordination, or false multi-trade coordination for walls-only painting scopes.
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
- AI-generated scope prose can still be generic or occasionally over-expanded even when typed plan readback is stronger, but the current warning-only guard now flags clear unsupported expansion before customer output. The product direction remains to preserve useful AI-generated sequencing/material/task detail and add estimator-facing review rather than rewriting `result.text`.
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
  - Uses retry-safe Supabase event dedupe: events are recorded as processed only after entitlement activation/update succeeds, failed entitlement writes remain retryable, and duplicate processed events return idempotently.
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
- PriceGuard Review selected-trade-aware missed-scope guidance for common contractor underbid risks across painting, drywall, flooring, electrical, plumbing, bathroom/tile, wallcovering, carpentry, and general renovation.
- PriceGuard Review schedule sequencing guidance for patch/texture/paint dry-time and return visits, shower/tile waterproofing and grout cure, electrical/plumbing rough-in access/inspection/patching, flooring demo/subfloor/install/transitions/base/protection timing, wallcovering removal/prep/primer/layout/pattern/install timing, general renovation demo-to-finish phase order, and owner-supplied material lead-time.
- Scope-to-Price Consistency Review Guard compares selected trade, included typed scope, Scope-to-Price X-Ray, pricing method/anchor, materials list, and estimate sections through existing PriceGuard Review fields. It flags unsupported pricing anchors, unsupported material families, unsupported estimate sections, and missing mixed-scope diagnostics while staying warning-only. False-positive cleanup prevents painting prep consumables from being treated as drywall materials, prevents generic flooring adhesive / misc install supplies from being treated as wallcovering materials, keeps wallcovering wall prep and primer in wallcovering context, and preserves true unsupported material warnings.
- Customer-scope drift false-positive reduction for adjacent-trade context language while preserving true unsupported-scope warnings for electrical rough-in, flooring install/repair, baseboard replacement, and carpentry expansion.
- UI-side typed-scope normalization helper for pre-generate scope-quality warnings, including clause-level included work, excluded/by-others, protection-only, coordination-only, existing-condition, material responsibility, permit responsibility, and quantity/location classifications.
- Customer-scope electrical false-positive cleanup for coordination/protection-only mentions of electrical trades, wiring, and components while preserving true unsupported electrical work warnings for rough-in, wiring, outlets, switches, circuits, fixtures, and panel/breaker work.
- Customer-scope support classification now avoids treating bare/noisy `scopeXRay` split scopes such as `electrical` or `electrical coordination only` as strong support. This keeps unsupported electrical drift visible in app/PDF review paths while preserving quiet behavior for true coordination-only / avoid-interference language.
- Backend scope splitter included-work filtering for split-scope, mixed-renovation, and anchor eligibility paths. This prevents excluded/by-others/protection/coordination-only/existing-condition/owner-supplied boundary language from creating false Scope-to-Price X-Ray trades, false `flooring_only_v1` anchors, or false materials. Sentence/segment-level filtering prevents orphan trade nouns from surviving boundary clauses, while tile and wallcovering recognition preserve true included tile/waterproofing and wallcovering prep/primer scopes.
- Real-world QA false-positive cleanup for electrical, bathroom/tile, wallcovering, and carpentry diagnostics. The estimator now suppresses unsupported review/diagnostic/material/schedule wording caused by excluded, by-others, coordination-only, sequencing-only, and normal trade-prep context while preserving true mixed-scope coordination and true unsupported work warnings.
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
- Crew Planning panel.
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
- Phase 9A Evidence Authority / Estimate Basis Readback helper:
  - Internal/helper-level `buildEvidenceAuthorityReadback()` classifies estimate-supporting facts by source and authority.
  - Covers typed included scope, typed boundary/exclusion scope, user quantities, parsed quantities, deterministic estimate basis, photo observations, photo quantity signals, plan sheet evidence, plan tables/finish schedules, repeated room packages, plan quantity candidates, and future measured plan quantities.
  - Not wired into `/api/generate` and does not change route/API response shape, pricing, prompts, `result.text`, materials generation, deterministic engines, `scopeSplitter`, billing/auth, UI, or deployment.
  - Plan quantity candidates remain non-pricing-authoritative, photo observations remain review-only, and photo quantities only become pricing-authoritative when explicitly marked as already-authoritative through an existing guarded path.
- Phase 9B-internal Evidence Authority orchestration wiring:
  - `buildEvidenceAuthorityReadback()` is built inside `runEstimatorOrchestrator()` after final estimate basis finalization/section setup.
  - Uses `ctx.scopeFacts`, user/parsed sqft from `ctx.quantityInputs`, `finalBasis`, `ctx.photoAnalysis`, and `ctx.planIntelligence`.
  - Initially internal only through optional internal/test callback `onEvidenceAuthorityReadback`; later exposed only in debug responses, still not added to `EstimatorPayload`, normal `/api/generate` responses, UI, saved estimates, PDFs, or customer output.
  - Does not change route/API response shape, saved estimate shape, pricing totals, `pricingSource`, pricing owner behavior, prompts, `effectiveScopeChange`, `result.text`, materials generation, deterministic engines, `scopeSplitter`, `detectTradeStack`, `buildComplexityProfile`, billing/auth, UI, or deployment.
- Phase 9B-debug Evidence Authority debug-only payload exposure:
  - `/api/generate` captures `EvidenceAuthorityReadback` through `onEvidenceAuthorityReadback` only when debug mode is enabled by `x-debug: 1` / `wantsDebug(req)`.
  - Normal `/api/generate` responses remain unchanged and do not include `evidenceAuthorityReadback`; debug responses may include it.
  - Debug requests bypass idempotency cache read/write so debug payloads cannot be replayed later as normal responses and normal cached payloads cannot suppress debug readback.
  - `EstimatorPayload`, saved estimate shape, UI, PDFs/customer output, pricing, prompts, `result.text`, materials generation, deterministic engines, billing/auth, deployment, and customer-facing semantics are unchanged.
  - Plan quantity candidates remain non-pricing-authoritative, photo observations remain review-only, and photo quantities are not newly pricing-authoritative because the orchestrator still passes `pricingAuthoritativePhotoQuantityKeys: []`.

Known weaknesses:

- Hard quantity extraction is still mostly heuristic.
- Evidence-strength readback is readiness/customer-facing evidence messaging, not true full takeoff measurement.
- Schedule, finish table, room/finish matrix, repeated room package, trade quantity candidate, and candidate gate diagnostics are diagnostic-only and still conservative.
- Evidence Authority readback is available only internally/debug-only; Phase 9B-estimator-display still needs an explicit exposure plan because showing it in normal responses, saved estimates, UI, or PDFs/customer output would intentionally change response, saved estimate, and UI shape.
- Actual pricing handoff activation, SF/LF, and measured fixture/device counts remain limited.
- PDF render failure can degrade analysis to indexed/text/filename-level support.
- Estimate PDFs include a compact customer-safe plan evidence/readiness summary, but this is not a full measured takeoff.
- AI-generated prose may still be less specific than typed readback.

## Stripe/Payment Status

Implemented:

- Stripe subscription checkout session creation.
- Monthly Pro price environment wiring through `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Stripe webhook verification.
- Retry-safe webhook event dedupe.
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
- Advanced analysis UI is powerful but dense; the Estimator Review Summary compactness and reduced review-noise passes now lower top-level overwhelm by making the summary the primary hub, hiding empty/low-signal cards, deduping and capping summary bullets, moving Customer Output Readiness into compact details, and keeping PriceGuard Review and Estimator Diagnostics collapsed while preserving all safety checks.
- Plan intelligence is represented in PDFs through customer-safe plan review and compact evidence/readiness summary. Estimate/invoice PDF visual hierarchy polish is complete for the current browser print-window launch pass; server-side PDFs remain future work unless browser output becomes a blocker.
- Recently inspected generate-route and app debug/customer-detail logs are development-gated; a full repo-wide log audit is not guaranteed complete.
- Several helper functions are unused or partially wired.
- README describes the actual app, environment variables, Supabase requirements, Stripe setup, approval links, and plan upload/rendering behavior.
- Legacy `scopeguard_*` localStorage migration support remains intentionally, but current product-facing copy should use JobEstimate Pro.

## Recommended Next Features

- Next active smart-upgrade direction: Phase 10B - Plan Intelligence Report. Use the completed Phase 10A Estimator Intelligence Findings backbone to build a detailed estimator-only report of what the app understands from uploaded plan sets. Typed scope remains the required scope-control anchor. Plan/photo/detector findings must remain review-only and non-pricing-authoritative unless estimator confirmation is added later. Avoid route/API response shape, saved estimate/history shape, pricing, prompt, PDF/customer-output, billing/auth/deployment, Crew Planning, Smart Questions, or Evidence Authority normal UI changes unless explicitly scoped.
- Continue real-PDF QA for plan evidence and customer-output safety under regression watch. The typed scope normalization helper, PriceGuard trade-specific missed-scope checks, Schedule Sequencing Review Guard, Customer Scope Drift cleanups, backend scope-boundary filtering, Scope-to-Price Consistency Review Guard, and real-world QA false-positive cleanups are implemented; keep them under regression watch while preserving useful AI-generated detailed scope descriptions and detecting unsupported expansion without rewriting `result.text`.
- Further PriceGuard Review copy/heuristic polish only if QA finds new false positives; the current generated-text warning filtering pass is complete.
- Focused non-billing QA for Saved Estimates and Invoices empty states, selected-job context, mobile layout, and existing actions.
- Plan upload guidance and fallback-message QA for selected pages, weak evidence, and degraded PDF/rendering cases.
- Small customer-facing estimate confidence and contractor workflow copy polish where manual QA finds confusion.
- Final Production Live Mode subscription payment, webhook delivery, and entitlement activation verification using `SUBSCRIPTION_TEST_CHECKLIST.md` remains the final pre-launch gate before public paid launch, not the next active product-improvement task.
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

1. Build Phase 10B - Plan Intelligence Report on top of the completed Phase 10A Estimator Intelligence Findings backbone. Keep it estimator-only, `data-no-print`, review-only, and non-pricing-authoritative unless a later scoped estimator-confirmation workflow changes authority.
2. Run focused QA for Saved Estimates and Invoices empty states, selected-job filtering context, mobile layout, and existing actions.
3. Plan upload guidance and fallback-message QA for selected pages, weak evidence, and degraded PDF/rendering cases.
4. Keep further PriceGuard Review and Customer Scope Drift improvements narrow and deterministic if new QA finds over-warning or unclear copy.
5. Complete final Production Live Mode payment, webhook delivery, and entitlement activation verification using `SUBSCRIPTION_TEST_CHECKLIST.md` only as the final pre-launch gate before public paid launch.
