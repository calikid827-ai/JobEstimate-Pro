# JobEstimate Pro (ScopeGuard) — Read-Only Audit

- **Repo:** `~/scopeguard` · branch `codex/owner-identity-preview` · HEAD `4dbbc9a` ("Render Plan Study text with bundled PDF fonts") · working tree clean at start
- **Date:** 2026-10-26
- **Mode:** read-only. No source edits, no git writes, no deploys, no DB/Stripe/Vercel/Supabase calls, no paid-model calls. This file is the only file written to the repo.
- **Evidence labels used throughout:**
  - **[CODE]** — confirmed by reading the code path cited.
  - **[RAN]** — confirmed by executing something locally (commands listed at the end).
  - **[INFERRED]** — my reasoning or a guess that I could not confirm; treat as a hypothesis.

---

## Summary

JobEstimate Pro is a Next.js 16 app whose owner-facing API routes are consistently guarded by a verified Supabase bearer token (`requireOwner`), with origin checks, hashed 256-bit approval tokens, a fail-closed Stripe webhook signature check, and a well-isolated Plan Study module (owner-scoped storage, compare-and-swap revisions, RLS-locked SQL, no model retries). The serious problems are at the trust boundaries and in what reaches the customer. A customer-controlled approval signature string is written **unescaped** into the contractor's same-origin PDF popup, where the Supabase session lives in `localStorage` (stored XSS → account takeover). Re-sharing an approval link after editing an estimate re-serves the **old** server snapshot, so customers can approve a stale price. The "Customer document" PDF always prints raw labor/materials/markup % and internal "Estimator Plan Review" content, and invoices list pre-markup costs that do not add up to the invoice total (confirmed by running the builder). An `x-debug: 1` header disables the result cache while the quota RPC is documented as idempotent per key, which very likely lets a free user generate without limit at the app's OpenAI expense. GPT-4o vision quantities can be promoted to "exact" plan quantities that feed the deterministic engines with no contractor confirmation. Typecheck passes, all 1,148 non-live unit tests pass with outbound network blocked, lint fails (218 app errors, mostly `any`), and `npm audit` reports 19 vulnerabilities including critical advisories on the installed Next.js 16.1.6.

### Top 5 issues to fix first

1. **D-01 (Critical)** Stored XSS: unvalidated `signatureDataUrl` from the public approve endpoint is interpolated into `<img src="${approvedSignature}">` inside `win.document.write` (`app/app/page.tsx:8398`). Validate on the server, escape on the client.
2. **D-02 (High)** `x-debug: 1` skips the idempotent result cache (`app/api/generate/route.ts:6950`, `:8566`) while the quota RPC is keyed by the same idempotency key → probable unlimited free generations and uncapped OpenAI spend.
3. **D-03 (High)** Re-sharing an approval link reuses the existing proposal **without updating its snapshot** (`app/api/approvals/route.ts:160-197`) → customer sees/approves an outdated price.
4. **D-04 + D-05 (High)** Customer-facing PDF exposes cost breakdown, markup %, and internal estimator review; invoice line items are pre-markup and do not reconcile with the total ([RAN]: items $1,918 vs subtotal $2,100 vs total $2,268).
5. **D-06 (High)** Plan/vision-derived quantities (including GPT-4o vision guesses) can become "exact" engine inputs with no contractor confirmation gate.

---

## 0. Repo map (context)

**[CODE]** ~111k lines of TS/TSX (excluding `node_modules`, `.next`, lockfile).

| Area | Contents |
|---|---|
| Pages | `app/page.tsx` (landing, 813 lines), `app/app/page.tsx` (**main app, 15,002 lines**), `app/approve/[id]/page.tsx` (public customer approval, 442), `app/success`, `app/cancel` |
| API routes (17) | `generate` (**8,605 lines**), `plan-upload`, `approvals` (+ `[token]`, `[token]/approve`, `status`), `checkout`, `webhook`, `entitlement`, `auth/session`, `plan-studies` (+ 6 sub-routes) |
| Generate libs | `app/api/generate/lib/estimator/*` (pricing owner, finalize, orchestrator, trade bridges), `lib/priceguard/*` (painting, drywall, flooring, electrical, plumbing, wallcovering engines, minimum charges), `lib/plans/*` (ingest, rasterize, staging, heuristics, vision fallback), `guards.ts`, `rateLimit.ts` |
| Shared libs | `app/lib/owner-auth.ts`, `app/lib/plan-upload.ts`, `app/lib/plan-study/*`, `app/app/lib/*` (≈40 client libs: rate card, invoices, estimate utils, persistence, owner session…) |
| SQL | `database/owner-access-permissions.sql` (header: "Not applied"), `database/plan-study-v1.sql`. **No schema for `entitlements`, `estimate_proposals`, `approval_links`, `proposal_approvals`, `approval_invoices`, `generation_results`, `stripe_webhook_events`, or the `consume_free_generation` RPC is in the repo.** |
| Tests | 86 `*.test.ts` files (2 named `*.live.test.ts`), Node test runner via `npm run test:estimator`; `qa:visual` (Playwright) has no config file |
| Largest files | `app/app/page.tsx` 15,002 · `app/api/generate/route.ts` 8,605 · `plans/mergeHeuristics.ts` 4,127 · `estimator/tradeQuantitySupport.ts` 2,843 · `priceguard/paintingEngine.ts` 1,761 |

**Owner-identity check per API route [CODE]:**

| Route | Guard |
|---|---|
| `GET /api/auth/session` | `requireOwner` |
| `POST /api/entitlement` | `requireOwner` + `assertOwnerEmail`; reads by verified email |
| `POST /api/checkout` | `requireOwner` + `assertOwnerEmail` |
| `POST /api/generate` | `requireOwner` + `assertSameOrigin` + `assertOwnerEmail`; client-supplied server file paths rejected (`route.ts:566-573`) |
| `POST/PUT /api/plan-upload` | `requireOwner` + `assertSameOrigin`; staging manifests carry `ownerId` and are checked (`staging.ts:69-73`) |
| `POST /api/approvals`, `GET /api/approvals/status` | `requireOwner`; queries filtered by `owner_email` |
| `GET /api/approvals/[token]`, `POST …/approve` | Public by design; SHA-256 of a 32-byte random token (`approvals/route.ts:17-23`) |
| `POST /api/webhook` | Stripe `constructEvent` on raw body; 503 if secret missing; livemode check |
| `/api/plan-studies/*` | `requireOwner` in `createPlanStudyHandlers`; store filters every query by `owner_id` |

Bearer tokens are only read from the `Authorization` header, never cookies (`app/lib/owner-auth.ts:35-59`). No hardcoded secrets in tracked files or git history ([RAN], patterns listed at end). `.env.local` is untracked.

---

## 1. Confirmed defects

### D-01 — Stored XSS from approval signature into contractor PDF window → session theft
- **Severity:** Critical · **Area:** Security / Documents
- **Location:** `app/api/approvals/[token]/approve/route.ts:132-141, 183-188`; `app/api/approvals/status/route.ts:109`; `app/app/page.tsx:6453-6455, 7561, 7573, 7974, 8398`; `app/app/lib/owner-session.ts:288, 294`
- **What's wrong:** The public approve endpoint accepts any non-empty string as `signatureDataUrl` (only `.trim()` and a truthiness check). The owner's "sync approvals" copies `signature_data_url` verbatim into the saved estimate, and `downloadPDF()` writes it into `<img src="${approvedSignature}" …>` **without `esc()`** inside `win.document.write(...)` on a `window.open("", …)` popup.
- **Evidence [CODE]:** Anyone holding an approval link (the customer, or anyone they forward it to) → `POST /api/approvals/<token>/approve` with `signatureDataUrl: 'x" onerror="…'` → stored in `proposal_approvals.signature_data_url` → `GET /api/approvals/status` returns it → `syncServerApprovals()` sets `approval.signatureDataUrl` (`page.tsx:6453-6455`) → `downloadPDF()` (`:7561`, `:8398`). An `about:blank` popup opened with `window.open("", …)` inherits the opener's origin, and the Supabase session (incl. refresh token) is persisted in `localStorage` under `jobestimatepro-auth` (`owner-session.ts:288, 294`).
- **Impact:** A malicious customer can execute script in the contractor's app origin the next time the contractor downloads that estimate's PDF → account takeover, access to all estimates/pricing, billing actions.
- **Smallest fix:** Server: accept only `^data:image/png;base64,[A-Za-z0-9+/=]+$` with a size cap (e.g. ≤ 300 KB) and reject otherwise. Client: wrap `approvedSignature` (and `companyLogo` at `:8228`) in `esc()` and only render if it matches the same data-URL pattern.
- **Confidence:** High for the code path; not exercised in a browser (no app run).

### D-02 — `x-debug` header disables idempotent replay → probable free-tier and AI-cost bypass
- **Severity:** High · **Area:** Billing / AI cost
- **Location:** `app/api/generate/route.ts:3917-3919, 6888-6898, 6950, 7053-7057, 8566`; `SUPABASE_PRODUCTION_CHECKLIST.md:116-119`
- **What's wrong:** Any signed-in user can send `x-debug: 1`. That skips the `generation_results` cache read (`:6950`) and write (`:8566`), but the same client-chosen `requestId` is still passed as `p_idempotency_key` to `consume_free_generation`, which the project's own checklist requires to "Idempotently consume by `p_idempotency_key`".
- **Evidence [CODE]:** header → `wantsDebug` → `debugMode` → cache bypass → RPC with reused key → full generation (up to 14 model calls, see D-12) → response not cached. **[INFERRED]** the RPC returns `ok:true` without incrementing on a repeated key (SQL not in repo; see U-01).
- **Impact:** A free user can loop generations indefinitely with one idempotency key; each run bills GPT-4o/GPT-4.1-mini calls to the app.
- **Smallest fix:** Honor `x-debug` only when `NODE_ENV !== "production"` (or an admin allowlist), and when a key has already been consumed, always serve the cached result (or reject) regardless of debug.
- **Confidence:** Medium (app side confirmed; RPC behavior unverified).

### D-03 — Re-sharing an approval link serves the stale snapshot after edits
- **Severity:** High · **Area:** Documents / Approvals
- **Location:** `app/api/approvals/route.ts:126-142, 160-197`; `app/app/page.tsx:4797, 4843, 6340-6372`; test `app/api/approvals/approvalWorkflow.test.ts:142-193`
- **What's wrong:** `findReusableProposal` returns any `pending` **or `approved`** proposal for the same `local_estimate_id`; the route then only inserts a new link and never updates `estimate_snapshot`. The client edits pricing/tax in place on the same history id (`updateHistoryItem(id, { pricing })` at `:4843`, `{ tax }` at `:4797`), then sends the full estimate again.
- **Evidence [CODE]:** contractor shares link (snapshot v1, e.g. $10,000) → edits price to $12,000 (same id) → "Copy approval link" → server reuses proposal → customer opens new link → `GET /api/approvals/[token]` returns v1. The existing test asserts no proposal insert and checks no snapshot update.
- **Impact:** Customer signs a price the contractor no longer intends; if the proposal was already approved, the new link shows "Approved" for old terms. Dispute/legal risk.
- **Smallest fix:** On reuse of a `pending` proposal, update `estimate_snapshot` and revoke older active links; if `approved` and the snapshot differs, create a new proposal (revision) instead of reusing.
- **Confidence:** High.

### D-04 — "Customer document" PDF exposes cost breakdown, markup %, and internal estimator review
- **Severity:** High · **Area:** Documents
- **Location:** `app/app/page.tsx:7604-7697` (Estimate Rows + "Embedded Burden Reference"), `:7838-7972` ("Estimator Plan Review": evidence strength, "Pricing Carry", "Confirm Before Final Pricing Confidence"), `:8245` (eyebrow "Customer document"), `:8305-8325` (Pricing Summary)
- **What's wrong:** `downloadPDF()` always prints Labor, Materials, Other/Mobilization (raw, pre-markup) and **Markup %**, with no toggle. When plan data exists it also prints internal plan-review content ("Hard quantities: Not confirmed", "Final price confidence depends on…") and per-section notes and burden rows.
- **Evidence [CODE]:** `pdfEstimatorStoryHtml` and `estimateSectionsHtml` are interpolated unconditionally into the customer body (`:8305`, `:8307`); the pricing table rows at `:8314-8325` have no condition.
- **Impact:** Customers see the contractor's margin and internal uncertainty language, which invites negotiation and undermines the bid.
- **Smallest fix:** Default the customer PDF to scope + total (+ tax/deposit). Move breakdown/markup/estimator review into a separate "internal" PDF or behind an explicit "show cost breakdown" option, off by default.
- **Confidence:** High.

### D-05 — Invoice line items are pre-markup and do not add up to the invoice total
- **Severity:** High · **Area:** Documents / Billing-to-customer
- **Location:** `app/app/lib/invoices.ts:118-141`; invoice PDF `app/app/page.tsx:8657-8662`; auto-created on approval `app/api/approvals/[token]/approve/route.ts:82-86` and returned to the anonymous customer at `:222-228`
- **What's wrong:** For a non-deposit invoice, line items are raw Labor/Materials/Other plus tax, while `subtotal` = marked-up base and `total` = marked-up + tax. Markup never appears as a line.
- **Evidence [RAN]:** `buildInvoiceFromEstimate` with labor 1000, materials 500, subs 250, markup 20%, tax 8% → line items sum **$1,918**, `subtotal` **$2,100**, `total` **$2,268**. The existing test only covers markup 0 (`invoices.test.ts:39-56`).
- **Impact:** Customer-facing invoices that don't reconcile; markup is inferable as the gap.
- **Smallest fix:** Emit marked-up line amounts (scale each by `1 + markup/100`, put the rounding remainder on the last line) or a single "Contract amount" line, so items + tax = total. Add a markup > 0 test.
- **Confidence:** High.

### D-06 — Plan/vision quantities can drive engine pricing without contractor confirmation
- **Severity:** High · **Area:** Pricing integrity / Plan pipeline
- **Location:** `app/api/generate/lib/plans/visionFallback.ts:15, 359-374` (model quantities kept), `plans/orchestrator.ts:26, 301-341` (merged into `analyses`), `estimator/tradeQuantitySupport.ts:589-608, 804-863` (`exactQuantity: true`, "Measured wall area exists…"), `estimator/liveTradePricingInfluence.ts:209-225, 476-494` (used as `supportedWallSqft`), `app/api/generate/route.ts:7401-7409`
- **What's wrong:** GPT-4o vision findings are merged into plan analyses with no source marker. Any painting finding with `unit: "sqft"` and category `wall_area` (a category the vision prompt explicitly offers) becomes an `exactQuantity: true` "Wall coverage support" signal, which `findExactSignal` accepts by category alone, setting `measuredInteriorBase` and feeding the painting engine. Nothing in `GenerateSchema` (`guards.ts:123-192`) carries a contractor "confirmed" flag for plan quantities.
- **Evidence [CODE]:** traced as listed. **[INFERRED]** how often the model actually emits a numeric wall sqft on real plans (see U-06).
- **Impact:** A model's estimate from a screenshot can silently set the quantity that a "deterministic" engine prices, and the result is presented as engine-backed.
- **Smallest fix:** Tag vision-derived findings (`source: "vision"`) and exclude them from `exactQuantity`; require an explicit per-quantity confirmation in the request before any plan-derived number reaches an engine.
- **Confidence:** Medium-High (static trace; not exercised with real plans).

### D-07 — Chunked plan staging relies on instance-local `/tmp` across separate requests
- **Severity:** High (for the plan feature on serverless) · **Area:** Plan pipeline
- **Location:** `app/api/generate/lib/plans/staging.ts:43-44, 87-117, 490-524`; `app/api/plan-upload/route.ts:118-245`; `app/api/generate/route.ts:335, 461`
- **What's wrong:** `begin` → several `PUT` chunks → `complete` → `generate` are separate HTTP requests, but all state lives in `os.tmpdir()` of whichever instance served the request. The repo is linked to Vercel (`.vercel/`).
- **Evidence [CODE]:** staging roots are `path.join(tmpdir(), …)`; `readStageSession` / `readStagedPlanUpload` return null when the directory isn't on the current instance → "Plan upload session is missing or expired." **[INFERRED]** on Vercel, consecutive or concurrent requests are not guaranteed to hit the same instance.
- **Impact:** Intermittent plan-upload failures for large plan sets (the exact path meant to get past the 4 MB request limit).
- **Smallest fix:** Stage chunks in Supabase Storage (or Vercel Blob) keyed by `ownerId/uploadSessionId`; keep `/tmp` only within a single request.
- **Confidence:** Medium (architecture confirmed; production behavior unverified).

### D-08 — Abandoned staged uploads are never expired
- **Severity:** Medium · **Area:** Plan pipeline
- **Location:** `app/api/generate/lib/plans/staging.ts:218, 406, 459` (`storedAt` written), never read for expiry; cleanup only in the generate route's `finally` (`route.ts:8585-8597`) after a generate run
- **What's wrong:** Uploads that are staged but never used for a generate stay on disk (up to 90 MB each, `plan-upload.ts:5`) until the instance is recycled.
- **Impact:** **[INFERRED]** on a warm instance a handful of abandoned uploads can fill `/tmp` (Vercel: 512 MB) and break later uploads with ENOSPC.
- **Smallest fix:** On each `begin`/`stage`, sweep entries whose `storedAt` is older than e.g. 30 minutes.
- **Confidence:** High (code); impact inferred.

### D-09 — Stripe `invoice.*` webhook branch reads a field that no longer exists in the pinned API version
- **Severity:** Medium · **Area:** Billing
- **Location:** `app/api/webhook/route.ts:254-263`; `node_modules/stripe` `ApiVersion = '2025-12-15.clover'`; `node_modules/stripe/types/Invoices.d.ts:336` (`parent`)
- **What's wrong:** The code uses `(invoice as any).subscription`. In the clover API shape, invoices carry the subscription under `parent.subscription_details.subscription`; the `as any` hides the type error, so `subscriptionId` is null and the branch does nothing.
- **Impact:** `invoice.paid` / `invoice.payment_failed` don't refresh entitlements; the app relies only on `customer.subscription.*` events.
- **Smallest fix:** Read `invoice.parent?.subscription_details?.subscription ?? (invoice as any).subscription`.
- **Confidence:** Medium. Payload shape follows the webhook endpoint's API version in the Stripe dashboard (U-04).

### D-10 — Subscription webhooks trust event payload order
- **Severity:** Medium · **Area:** Billing
- **Location:** `app/api/webhook/route.ts:248-253` (uses `event.data.object` directly), `:160-185`, `:119-125`
- **What's wrong:** `customer.subscription.*` events upsert from the embedded object rather than re-fetching, with no comparison against `event.created`. Stripe does not guarantee delivery order.
- **Impact:** A delayed `updated(active)` processed after `deleted` can re-entitle a canceled customer (or the reverse).
- **Smallest fix:** Re-fetch via `upsertSubscriptionById(subscription.id)` as the checkout/invoice branches already do, or store and compare `event.created`.
- **Confidence:** High (code); occurrence depends on Stripe delivery.

### D-11 — Checkout allows duplicate subscriptions; one email row tracks only one
- **Severity:** Medium · **Area:** Billing
- **Location:** `app/api/checkout/route.ts:25-43`; `app/api/webhook/route.ts:119-125` (`onConflict: "email"`)
- **What's wrong:** No check for an existing active subscription before creating a new Checkout Session, and no reuse of an existing Stripe customer. Entitlements are a single row per email.
- **Impact:** A Pro user who clicks Upgrade again gets billed twice. Canceling either subscription overwrites the row as canceled while the other keeps charging.
- **Smallest fix:** Look up the entitlement; if active, return a Billing Portal URL instead. Pass `customer` when a `stripe_customer_id` exists.
- **Confidence:** High.

### D-12 — No timeouts or token caps on generate-path model calls; default retries
- **Severity:** Medium · **Area:** AI usage / cost
- **Location:** `app/api/generate/route.ts:139-141` (client), `:2733-2742` + `:2851` (one GPT-4o call **per photo**, up to 8, parallel), `:4095-4100` (GPT-4o polish), `:8257-8262` (GPT-4.1-mini main), `:8373-8378` (repair); `plans/visionFallback.ts:18-20, 658-678` (GPT-4o, up to 3 pages, `orchestrator.ts:26`); no `maxDuration` export on the generate route
- **What's wrong:** No `timeout`, no `max_tokens`, SDK default `maxRetries` (2). Worst case per request: 8 + 3 + 1 + 1 + 1 = **14 model calls** (12 of them GPT-4o vision/polish), up to 42 HTTP attempts.
- **Impact:** Unbounded output tokens and latency; combined with D-02, uncapped spend. Long requests risk hitting the platform duration limit after the quota is already consumed.
- **Smallest fix:** Construct the client with `timeout` (e.g. 45 s) and `maxRetries: 1`; set `max_tokens` per call; export `maxDuration`. (Plan Study already does this: `app/lib/plan-study/provider.ts:22, 36-39`.)
- **Confidence:** High (code); actual token usage not measured.

### D-13 — AI pricing that still fails validation after repair is used silently
- **Severity:** Medium · **Area:** Pricing integrity / AI
- **Location:** `app/api/generate/route.ts:8424-8433`; `estimator/pricingOwner.ts:226-233`; `estimator/finalize.ts:145-152`
- **What's wrong:** If `validateAiMath` fails twice, the code logs a warning and continues. When no engine/anchor claims ownership, the AI numbers become the price (`owner: "ai"`). The response carries no "validation failed" flag.
- **Impact:** Prices whose math the server itself rejected can reach the contractor's screen, PDF and approval link. PriceGuard's −40 score makes the UI say "review", but nothing blocks sending (`app/app/lib/proposal-readiness.ts:33-122`; `copyApprovalLinkForEstimate` at `page.tsx:6340` has no readiness check).
- **Smallest fix:** Add `aiValidationFailed: true` (+ reasons) to the payload and treat it as a readiness blocker; or fall back to `buildEstimateBasisFallback` math.
- **Confidence:** High.

### D-14 — Approval timestamp is client-supplied
- **Severity:** Medium · **Area:** Approvals / legal record
- **Location:** `app/api/approvals/[token]/approve/route.ts:134-137, 183-188`; client sends it at `app/approve/[id]/page.tsx:179`
- **What's wrong:** `approved_at` is whatever ISO string the unauthenticated caller sends.
- **Impact:** The signed-approval timestamp, shown on the PDF, can be backdated or postdated.
- **Smallest fix:** Always store server time; keep the client's value in a separate column if wanted.
- **Confidence:** High.

### D-15 — Approval links never expire and are never revoked
- **Severity:** Medium · **Area:** Approvals
- **Location:** `app/api/approvals/route.ts:199-208` (insert without `expires_at`); checks at `[token]/route.ts:110` and `[token]/approve/route.ts:151`
- **What's wrong:** `expires_at` is never set, so `isExpired` is always false. Every share adds another active link to the same proposal.
- **Impact:** Old links forwarded or leaked stay valid forever; together with D-03 they can point at superseded terms.
- **Smallest fix:** Set `expires_at` (e.g. 30 days) and mark previous active links for the proposal `revoked` when a new one is issued.
- **Confidence:** High.

### D-16 — `checkout.session.completed` without a subscription grants permanent Pro
- **Severity:** Medium · **Area:** Billing
- **Location:** `app/api/webhook/route.ts:229-247`
- **What's wrong:** Any completed Checkout Session without a subscription upserts `plan: "legacy_beta", subscription_status: "legacy_active", active: true`, without checking `payment_status`, metadata, or product.
- **Impact:** **[INFERRED]** if the same Stripe account sells anything else (payment links, one-off products), every buyer email becomes lifetime Pro. Async payment methods that complete with `payment_status: "unpaid"` would also qualify.
- **Smallest fix:** Require `session.payment_status === "paid"` and `session.metadata.source === "checkout"`/an expected price, or remove the legacy branch.
- **Confidence:** High (code); exposure depends on Stripe account contents.

### D-17 — localStorage write failures are swallowed (silent data loss)
- **Severity:** Medium · **Area:** Data & persistence
- **Location:** `app/app/lib/local-persistence.ts:106-108, 121-123`; keys `app/app/lib/constants.ts:3-14`
- **What's wrong:** All estimates, invoices, jobs, budgets, actuals, crews, templates, company profile (incl. logo data URL) and rate card live only in `localStorage`. `setItem` errors (e.g. `QuotaExceededError`) are caught and ignored.
- **Impact:** Once storage is full (history items include plan intelligence, signatures and logos), saves silently stop; clearing site data or switching device loses everything except server-side approvals/approval invoices.
- **Smallest fix:** Surface write failures to the UI and offer a JSON export/backup. Longer-term: server persistence (I-04).
- **Confidence:** High (code); quota thresholds not measured.

### D-18 — Minimum-charge top-up breaks pricing math and overshoots the minimum
- **Severity:** Low · **Area:** Pricing integrity
- **Location:** `app/api/generate/lib/estimator/finalize.ts:301-309`; client recompute `app/app/page.tsx:4757-4775`; minimums `priceguard/minimumCharges.ts:3-9`
- **What's wrong:** The shortfall is added to `subs` (pre-markup) while `total` is set to the minimum, so `(labor + materials + subs) × (1 + markup)` ≠ `total`. The client recomputes `total` from components, overriding the server number.
- **Impact:** Example [CODE math]: painting 300 / 60 / 0 at 20% → server total $500 (minimum), client shows **$514**.
- **Smallest fix:** `subs += diff / (1 + markup/100)` and recompute `total`.
- **Confidence:** High.

### D-19 — In-memory rate limiter is per-instance and never evicts
- **Severity:** Low · **Area:** Security / cost
- **Location:** `app/api/generate/lib/rateLimit.ts:1-21`; used at `app/api/generate/route.ts:6964-6994`
- **What's wrong:** A module-level `Map` per server instance with no pruning; the IP key comes from the first `x-forwarded-for` entry.
- **Impact:** **[INFERRED]** on serverless, limits reset per instance, so they barely limit; on a long-lived server the map grows without bound.
- **Smallest fix:** Move to a shared store (Supabase/Upstash) or a Vercel WAF rule; prune expired buckets.
- **Confidence:** High (code).

### D-20 — Internal error messages returned to clients
- **Severity:** Low · **Area:** Security hygiene
- **Location:** `app/api/generate/lib/guards.ts:207-237`; `app/api/generate/route.ts:8569-8584`
- **What's wrong:** For any thrown error without a status, `message` is returned verbatim with a 500 (e.g. "Empty AI response", SDK/DB error text).
- **Smallest fix:** For status ≥ 500 return a generic message; log details server-side.
- **Confidence:** High.

### D-21 — Public approval JSON includes labor/materials/subs/markup
- **Severity:** Low · **Area:** Documents
- **Location:** `app/api/approvals/[token]/route.ts:54-60`
- **What's wrong:** The public page only displays total/deposit (`app/approve/[id]/page.tsx:258-264`), but the JSON response includes the internal breakdown and markup %.
- **Smallest fix:** Return only `total`, tax and deposit fields. (Lower priority while D-04 prints them anyway.)
- **Confidence:** High.

### D-22 — Local env drift: price ID name and anon key
- **Severity:** Low · **Area:** Config
- **Location:** `app/api/checkout/route.ts:16, 20` reads `STRIPE_PRO_MONTHLY_PRICE_ID`; `.env.local` (names only inspected) defines `STRIPE_PRICE_ID` and has no `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (required by `app/lib/owner-auth.ts:27-28` and the browser auth client)
- **Impact:** Locally, checkout always 500s and sign-in can't work. Production values unverified (U-05).
- **Smallest fix:** Rename the variable in `.env.local` and add the publishable key; add a `.env.example`.
- **Confidence:** High for local; production unknown.

### D-23 — Lint fails
- **Severity:** Low · **Area:** Code health
- **Location:** `eslint.config.mjs:9-15` (no ignore for `public/`); errors across `app/`
- **Evidence [RAN]:** `npm run lint` → exit 1, **223 errors / 1,633 warnings**. App code: 214 `no-explicit-any`, 2 `prefer-const` (`route.ts:6193`, `routePromptAdjacentDiagnostics.ts:425`), 2 `react-hooks/set-state-in-effect` (`JobsDashboardSection.tsx:82`, `owner-session.ts:318`). The vendored `public/plan-study/pdf.worker-6.4.299.min.mjs` contributes 5 errors and 1,561 warnings.
- **Smallest fix:** Add `public/**` to `globalIgnores`; fix the 4 non-`any` errors; downgrade `no-explicit-any` to warn until I-15.
- **Confidence:** High.

### D-24 — Unused or misplaced runtime dependencies (one with critical advisories)
- **Severity:** Low · **Area:** Dependencies
- **Location:** `package.json` dependencies
- **What's wrong:** `jspdf` (critical/high advisories per `npm audit`) is imported nowhere. `pdfkit` is imported only by tests but is a runtime dependency.
- **Smallest fix:** Remove `jspdf`; move `pdfkit` to `devDependencies`.
- **Confidence:** High ([RAN] import search).

### D-25 — Webhook rejects every event when `VERCEL_ENV` is unset
- **Severity:** Low · **Area:** Billing / dev
- **Location:** `app/api/webhook/route.ts:314-322`
- **What's wrong:** Returns 500 "Invalid VERCEL_ENV" off-Vercel, so local `stripe listen` testing and any non-Vercel host fail. Fail-closed is intentional; flagged for operability.
- **Smallest fix:** Allow an explicit `STRIPE_EXPECT_LIVEMODE` override for local use.
- **Confidence:** High.

### D-26 — PWA icons are empty files
- **Severity:** Low · **Area:** Config
- **Location:** `public/icon-192.png`, `public/icon-512.png` (0 bytes [RAN `ls`]); referenced by `public/manifest.json`
- **Smallest fix:** Add real PNGs.
- **Confidence:** High.

---

## 2. Improvement opportunities (not bugs)

**I-01 — Make the rate card drive server pricing** · Effort **L**
- **Location:** `app/app/lib/rate-card.ts:14-27` (stores only markup/tax/deposit + free-text "reference only" notes, in localStorage); `app/api/generate/lib/guards.ts:123-192` (schema has no rate fields, zod strips unknown keys); hardcoded rates at `route.ts:4419-4428` (`pickLaborRateByTrade`), `route.ts:6125-6134` (140 sqft/hr, $75/hr, $28/gal, 25% markup), `paintingEngine.ts:1323, 1559, 1636` ($75/$85/hr), `minimumCharges.ts:3-9`, state multipliers `route.ts:6086-6099`; markup clamped to 15-25% on every path (`route.ts:4170-4180` and engine copies) while the AI prompt hardcodes "15–25%".
- **Why:** Today the server never receives the contractor's rates, and every generated estimate comes back at 15-25% markup until the contractor clicks "Apply". The UI text is honest about this ("reference only", "updates editable pricing controls only").
- **Confidence:** High.

**I-02 — Consolidate duplicated pricing logic** · Effort **L**
- **Location:** `route.ts` contains its own anchors and painting/carpentry/texture pricing (`:5364-6391`) alongside `lib/priceguard/*`; six copies of `clampPricing` with two rounding behaviors (`route.ts:4170`, `drywallEngine.ts:62`, `electricalEngine.ts:57`, `plumbingEngine.ts:11`, `wallcoveringEngine.ts:61`, `paintingEngine.ts:98`).
- **Why:** Similar painting scopes can be priced by different formulas depending on which owner wins in `pricingOwner.ts`.
- **Confidence:** High.

**I-03 — Split the two giant files** · Effort **L**
- **Location:** `app/app/page.tsx` (15,002 lines; PDF/invoice HTML builders are inline template strings), `app/api/generate/route.ts` (8,605 lines).
- **Why:** Needed to make D-01/D-04/D-05 testable. Start by extracting `downloadPDF`/`downloadInvoicePDF` into pure, unit-tested builders.
- **Confidence:** High.

**I-04 — Server-side persistence and backup for business data** · Effort **L** (export/import alone: **S**)
- **Location:** all `LOCAL_STORAGE_KEYS` (`local-persistence.ts:16-29`).
- **Why:** Device loss or cleared storage loses estimates, invoices and job history.

**I-05 — Commit the database schema and quota RPC** · Effort **M**
- **Why:** The quota RPC and the core tables are not in the repo, so D-02, U-01..U-03 can't be verified or tested. `owner-access-permissions.sql` says "Not applied".

**I-06 — Dependency upgrades** · Effort **S-M**
- Next 16.1.6 → ≥ 16.4.x (critical/high advisories; fix available), zod → ≥ 4.6.6 (direct, high), Supabase JS 2.91 → 2.118, OpenAI 6.16 → 6.49 (same major), Stripe 20.2 → 20.4 (same major), run `npm audit fix` for transitive dev tooling. Remove `jspdf` (D-24).

**I-07 — Security headers** · Effort **M**
- **Location:** `next.config.ts` has none.
- **Why:** A CSP (`img-src 'self' data:`; no inline script) would have blunted D-01; add `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`.

**I-08 — Key ownership by user ID instead of email** · Effort **M**
- **Location:** `entitlements` (by email), `estimate_proposals.owner_email`, `approvals/status/route.ts:47-50`.
- **Why:** An email change drops access; a re-registered email inherits another person's proposals/entitlement. The Plan Study tables already use `owner_id`.

**I-09 — Mark AI-only pricing as a send blocker** · Effort **S**
- **Location:** `proposal-readiness.ts` ignores `pricingSource`; PriceGuard only lowers the score (`route.ts:1620-1647`).
- **Why:** Make "AI-only, no quantities" an explicit review item rather than a score side effect.

**I-10 — Per-owner AI budget and usage logging** · Effort **M**
- **Why:** Log `usage` tokens per request (Plan Study already records usage), add a daily cap, alert on spikes.

**I-11 — Test coverage gaps** · Effort **M**
- Missing tests for: customer PDF HTML (D-01, D-04), invoices with markup > 0 (D-05), approval reshare after edit (D-03), webhook ordering and clover invoice shape (D-09, D-10), duplicate checkout (D-11), plan-upload chunk route and staging expiry (D-07, D-08), vision-quantity gating (D-06), `x-debug` + quota (D-02).

**I-12 — Remove dead code** · Effort **S**
- `app/api/generate/sanity.flooringScope.ts`, `sanity.paintScope.ts`, `sanity.flooringEngine.ts` (imported nowhere); `ENFORCE_PHOTO_ESTIMATE_DECISION = false` (`route.ts:166, 7227`); `OWNER_SYNC_TOKEN_KEY` (`constants.ts:4`, unused); `approval_owner_sync_tokens` table grant.

**I-13 — Tighten typing** · Effort **M**
- 214 `no-explicit-any` lint errors; ~149 `any` in non-test code. The `as any` in `webhook/route.ts:256` is what hid D-09. Use Stripe's types and zod-parse AI output instead of `any`.

**I-14 — Test runner hygiene** · Effort **S**
- `--loader` is deprecated (warning on every file); `MODULE_TYPELESS_PACKAGE_JSON` warnings. The suite takes 7 min 21 s, dominated by ~30-60 s PDF-rasterizing tests; split fast and slow suites for CI.

**I-15 — Webhook dedupe claim-first** · Effort **S**
- **Location:** `webhook/route.ts:269-294` (check → process → record).
- **Why:** Insert the event id first (unique) to avoid concurrent double processing; pairs with D-10.

**I-16 — Bring generate-route model calls to the Plan Study standard** · Effort **S**
- Plan Study uses strict JSON schema, `max_output_tokens`, `timeout`, `maxRetries: 0`, `store: false` (`app/lib/plan-study/provider.ts:22-39`). The generate route uses `json_object` without a schema; parse failures fall back silently.

---

## 3. Unverified areas

| ID | What | Why unverified |
|---|---|---|
| U-01 | `consume_free_generation` behavior: idempotency by key, Pro handling, no refund when generation fails after consumption | SQL is not in the repo; needs DB access. D-02 severity depends on it |
| U-02 | **Production RLS on core tables** (`entitlements`, `estimate_proposals`, `approval_links`, `proposal_approvals`, `approval_invoices`, `generation_results`, `stripe_webhook_events`). If RLS is off, the public anon key could read them through PostgREST | `database/owner-access-permissions.sql:1-3` says "Not applied"; needs DB access. **Check this first** |
| U-03 | Unique constraints the code relies on for idempotency (`23505` handling in approvals, approve, webhook, cache) | Schema not in repo |
| U-04 | Stripe webhook endpoint API version and subscribed events | Needs Stripe dashboard; decides D-09 |
| U-05 | Production env vars (`STRIPE_PRO_MONTHLY_PRICE_ID`, publishable key, `ALLOWED_ORIGIN_HOSTS`, `NEXT_PUBLIC_SITE_URL`), function max duration, Fluid compute, regions | Needs Vercel access; no calls made |
| U-06 | Plan pipeline on real plans: rasterization, page selection accuracy, vision outputs, whether vision emits numeric sqft in practice (D-06), staging across instances (D-07) | Needs real plan sets, a deployed instance, and paid model calls |
| U-07 | Any generated price, quantity or model output | No generation was run. This report claims no prices or extractions except the local invoice-builder check (D-05) |
| U-08 | `STUDY_MODEL = "gpt-6.1-sol"` (`app/lib/plan-study/provider.ts:7`) is a valid model ID | Can't confirm without calling the provider; if invalid, every Plan Study step fails (the code fails closed) |
| U-09 | `pricingOwner.live.test.ts`, `finalize.live.test.ts` | Skipped per rules. On reading, they import only local modules and contain no network code, but they were not run |
| U-10 | Build warnings | `next build` is not in the allowed command list and writes `.next/`; not run |
| U-11 | D-01 exploit in a real browser | App not run; the trace relies on standard `about:blank` origin inheritance |
| U-12 | Rest of `app/app/page.tsx`: job dashboard, crews, actuals, templates, change-order UI, and the rate-card "apply" + history-sync skip logic (`:4453-4605`, whether applied defaults reach the saved estimate before a link is shared) | Partially read; time-boxed to the generate → pricing → PDF/invoice/approval flows |
| U-13 | Playwright visual QA (`npm run qa:visual`) | No `playwright.config.*` in repo; not run |
| U-14 | Whether the Next.js advisories are exploitable here (e.g. Image Optimization on Vercel) | Depends on hosting; upgrade anyway (I-06) |
| U-15 | Description polish (GPT-4o) faithfulness to scope | Needs model runs; reconciliation code exists (`finalize.ts:384-422`) |

---

## Commands run and results

All commands ran from `~/scopeguard` unless noted. Scratch files lived in the session scratchpad, outside the repo.

| # | Command | Result |
|---|---|---|
| 1 | `git status --short`, `git log --oneline -15`, `git rev-parse HEAD` | Clean tree; HEAD `4dbbc9a` [RAN] |
| 2 | `npx tsc --noEmit --incremental false` (`--incremental false` added so `tsconfig.tsbuildinfo` was not rewritten) | **Pass**: exit 0, 0 errors, 4.5 s [RAN] |
| 3 | `npm run lint` | **Fail**: exit 1, 1,856 problems (**223 errors, 1,633 warnings**). App code: 218 errors (214 `no-explicit-any`, 2 `prefer-const`, 2 `set-state-in-effect`), 72 warnings (38 unused vars, 30 `exhaustive-deps`, 4 `no-img-element`). Vendored PDF.js worker: 5 errors, 1,561 warnings [RAN] |
| 4 | `NODE_OPTIONS=--import=<scratch>/net-guard.mjs npm run test:estimator -- --test-reporter=spec <84 non-live test files>` | **Pass**: **1,148 tests, 1,148 pass, 0 fail, 0 cancelled, 0 skipped**, 84 files, 440.6 s. The preload blocks every non-loopback TCP/TLS connection and logs attempts: loaded in 87 Node processes, **0 outbound attempts** [RAN] |
| 4a | (first attempt of #4) | Ran **0 tests**: zsh didn't word-split the file list ("Could not find …"). Re-run as #4. Reported for completeness [RAN] |
| 5 | Scratch script calling `buildInvoiceFromEstimate` (labor 1000, materials 500, subs 250, markup 20, tax 8%), under the same network guard | Line items sum $1,918; subtotal $2,100; total $2,268 (D-05) [RAN] |
| 6 | `npm audit` / `npm audit --json` | exit 1: **19 vulnerabilities: 2 critical, 12 high, 4 moderate, 1 low**. Direct: `next` 16.1.6 (critical; ~38 advisories incl. RCE in Image Optimization / `use cache`, middleware bypass, SSRF), `jspdf` 4.2.0 (critical; unused), `zod` 4.3.6 (high). Transitive: brace-expansion, browserslist, dompurify, flatted, js-yaml, nanoid, picomatch, postcss, sharp, source-map-js, ws (high); @humanfs/node, baseline-browser-mapping, fflate, qs (moderate); @babel/core (low). All report "fix available". `npm audit fix` **not** run [RAN] |
| 7 | `npm outdated` | 18 packages behind, e.g. next 16.1.6 → 16.4.3, @supabase/supabase-js 2.91.0 → 2.118.0, openai 6.16.0 → 6.49.0 (latest 7.43.0), stripe 20.2.0 → 20.4.1 (latest 23.0.1), zod 4.3.6 → 4.6.7, typescript 5.9.3 (latest 7.0.2) [RAN] |
| 8 | `shasum package.json package-lock.json` before and after #6-#7 | Unchanged [RAN] |
| 9 | `git grep` + `git log --all -p -G` for `sk_live_`, `sk-…`, `sk-proj-`, `whsec_…`, JWT-shaped strings, `AKIA…` | No matches in tracked files or history [RAN] |
| 10 | Read-only inspection: `ls`, `wc -l`, `grep`, `sed -n` over the repo; `.env.local` inspected for **variable names only** | — |

### Skipped tests and why
- `app/api/generate/lib/estimator/pricingOwner.live.test.ts`, `app/api/generate/lib/estimator/finalize.live.test.ts`: skipped per the `*.live.test.ts` rule (see U-09).
- `npm run qa:visual` (Playwright): not run; no config in repo, and it would need a running app.
- No other test was skipped. Tests that load route handlers (`route-*-authority.test.ts`, `owner-authorization.test.ts`, `approvalWorkflow.test.ts`, `webhook/route.test.ts`) set synthetic keys and stub `fetch`/clients; the network guard confirmed they made no external connections.

---

## Suggested fix order (small, independent phases)

Each phase can ship on its own; items inside a phase don't depend on each other.

1. **Security hotfix (S):** D-01 (validate signature server-side + `esc()` in PDF), D-02 (ignore `x-debug` in production), D-14 (server approval time), D-15 (link expiry/revocation). Verify U-02 (RLS) in the same window.
2. **Platform patch (S-M):** I-06 (Next ≥ 16.4.x, zod ≥ 4.6.6, remove `jspdf`, `npm audit fix` for dev tooling), D-24, then re-run typecheck/tests.
3. **Customer documents (M):** D-03 (update or version snapshots on reshare), D-04 (customer vs internal PDF), D-05 (reconciling invoice lines), D-21 (minimal public JSON). Extract the PDF/invoice builders first (part of I-03) so they get tests (I-11).
4. **Billing correctness (M):** D-09 (clover invoice shape), D-10 (re-fetch subscriptions), D-11 (block duplicate checkout / portal), D-16 (tighten legacy grant), I-15.
5. **Pricing integrity (M):** D-06 (exclude vision quantities, require confirmation), D-13 (surface validation failure, block send), D-18 (minimum-charge gross-up), I-09.
6. **AI cost and robustness (S-M):** D-12 (timeouts, `max_tokens`, `maxRetries`, `maxDuration`), D-19 (shared rate limit), D-20 (generic 5xx messages), I-10, I-16.
7. **Plan upload infrastructure (M):** D-07 (stage in object storage), D-08 (expiry sweep).
8. **Data safety (S → L):** D-17 (surface quota errors + export), then I-04 (server persistence), I-08 (owner-ID keys).
9. **Hygiene (S-L, ongoing):** D-23 (lint), D-22 (env example), D-25, D-26, I-05 (commit schema/RPC), I-12 (dead code), I-13 (typing), I-14 (test runner), then I-02 and I-03 (consolidate pricing, split giant files), I-01 (server-side rate card).

### What's left (not completed in this pass)
- Full read of `app/app/page.tsx` outside the generate → pricing → PDF/invoice/approval flows (U-12).
- Line-by-line review of `plans/mergeHeuristics.ts` (4,127 lines), `estimator/tradeQuantitySupport.ts` beyond the painting path, and the drywall/flooring/electrical/plumbing engines' internal rate tables (sampled, not fully audited).
- Everything in Section 3 that needs credentials, a deployed instance, real plans, or paid model calls.
