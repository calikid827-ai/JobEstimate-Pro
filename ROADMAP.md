# JobEstimate Pro Roadmap

This roadmap is based on `FEATURE_INVENTORY.md`. It prioritizes production readiness first, then stability, polish, server-backed workflows, and premium future capabilities.

Risk levels:

- Low: localized change with little pricing or persistence impact.
- Medium: touches shared UI, PDF, persistence, or workflow logic.
- High: changes backend data model, production persistence, auth, or billing behavior.

Difficulty levels:

- Small: hours to one day.
- Medium: one to several days.
- Large: multi-day or multi-phase work.

## 1. Critical Fixes

### 1.1 Remove or Gate Production Debug Logging

- Why it matters: `/api/generate` still logs plan intelligence, pricing splits, trade stacks, and pricing internals. This can leak sensitive job data and makes production logs noisy.
- Files likely affected:
  - `app/api/generate/route.ts`
  - `app/api/generate/lib/priceguard/electricalEngine.ts`
  - Any small logging helper if introduced.
- Risk level: Low
- Difficulty: Small
- Suggested order: 1

### 1.2 Clean Up Stripe Success/Cancel Branding

- Why it matters: Some payment pages still refer to ScopeGuard while the product is JobEstimate Pro. This creates trust friction right after payment.
- Files likely affected:
  - `app/success/page.tsx`
  - `app/cancel/page.tsx`
- Risk level: Low
- Difficulty: Small
- Suggested order: 2

### 1.3 Add Estimator Story to Estimate PDF Output

- Why it matters: The app now shows a plan-aware estimator story in the UI, but the generated PDF can still look like a generic estimate. The PDF is the customer-facing artifact.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/lib/plan-pricing-carry.ts`
  - Possible small PDF formatting helper if extracted.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 3

### 1.4 Extract Shared Invoice Creation Logic

- Why it matters: Invoice creation is duplicated between `/app` and `/approve/[id]`, which risks inconsistent deposit, tax, balance, and line-item behavior.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/approve/[id]/page.tsx`
  - New helper such as `app/app/lib/invoices.ts` or `app/lib/invoices.ts`
  - `app/app/lib/types.ts`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 4

### 1.5 Document Required Environment and Setup

- Why it matters: README is still the default Next.js file. Production work needs clear OpenAI, Stripe, Supabase, webhook, and plan-rendering setup notes.
- Files likely affected:
  - `README.md`
  - Possibly `.env.example` if added.
- Risk level: Low
- Difficulty: Small
- Suggested order: 5

## 2. Stability Upgrades

### 2.1 Centralize LocalStorage Access

- Why it matters: LocalStorage reads/writes are scattered through pages and components. A thin persistence helper would reduce data-shape drift before server persistence is added.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/InvoicesSection.tsx`
  - `app/approve/[id]/page.tsx`
  - New helper such as `app/app/lib/local-persistence.ts`
  - `app/app/lib/constants.ts`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 6

### 2.2 Reduce `app/app/page.tsx` Responsibility

- Why it matters: The main app file mixes UI rendering, API orchestration, local persistence, PDF generation, invoice creation, and job logic. This makes every change riskier.
- Files likely affected:
  - `app/app/page.tsx`
  - Existing components under `app/app/components/`
  - New helpers under `app/app/lib/`
- Risk level: Medium
- Difficulty: Large
- Suggested order: 7

### 2.3 Fix Repo-Wide Lint Hotspots Incrementally

- Why it matters: Lint currently fails mostly from `any`, unused variables, and hook warnings. This makes CI less useful and hides real issues.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/*.tsx`
  - `app/api/generate/route.ts`
  - `app/api/webhook/route.ts`
  - `app/approve/[id]/page.tsx`
- Risk level: Medium
- Difficulty: Large
- Suggested order: 8

### 2.4 Add Focused Tests for Invoice and Approval Helpers

- Why it matters: Deposit, tax, balance invoice, and approval-auto-invoice logic are important money workflows. They need tests before server persistence is introduced.
- Files likely affected:
  - New invoice helper tests.
  - New approval helper tests if logic is extracted.
  - `app/app/lib/types.ts`
- Risk level: Low
- Difficulty: Medium
- Suggested order: 9

### 2.5 Add Safer Error Boundaries Around Plan/PDF Operations

- Why it matters: Plan upload and PDF rendering are complex and can fail due browser, platform, or PDF issues. User-facing recovery should stay explicit.
- Files likely affected:
  - `app/lib/plan-upload.ts`
  - `app/app/components/PlanUploadsSection.tsx`
  - `app/api/plan-upload/route.ts`
  - `app/api/generate/lib/plans/*`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 10

## 3. Product Polish

### 3.1 Customer-Facing Estimate Result Mode

- Why it matters: Advanced diagnostics are useful, but users need a clean estimator-facing summary and a separate advanced/debug area.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/PricingSummarySection.tsx`
  - `app/app/lib/plan-pricing-carry.ts`
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 11

### 3.2 Simplify Advanced Analysis Panels

- Why it matters: The app has many analysis cards. Grouping them into clearer sections would make the product feel less experimental.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/app/components/PhotoIntelligenceCard.tsx`
  - Possible new `AdvancedAnalysisSection` component file.
- Risk level: Low
- Difficulty: Medium
- Suggested order: 12

### 3.3 Improve PDF Visual Hierarchy

- Why it matters: PDFs are the final customer artifact. The estimate should clearly show scope, estimator story, pricing, schedule, approvals, and payment terms.
- Files likely affected:
  - `app/app/page.tsx`
  - Future PDF helper files if extracted.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 13

### 3.4 Add Account/Entitlement Status Surface

- Why it matters: Users need to know which email is active, whether they are upgraded, and what to do if payment is not reflected yet.
- Files likely affected:
  - `app/app/page.tsx`
  - `app/success/page.tsx`
  - `app/api/entitlement/route.ts`
- Risk level: Low
- Difficulty: Small
- Suggested order: 14

### 3.5 Product Copy Consistency Pass

- Why it matters: ScopeGuard/JobEstimate Pro naming is mixed in several places. Consistent naming improves trust.
- Files likely affected:
  - `app/page.tsx`
  - `app/app/page.tsx`
  - `app/success/page.tsx`
  - `app/cancel/page.tsx`
  - `README.md`
- Risk level: Low
- Difficulty: Small
- Suggested order: 15

## 4. Server-Backed Features

### 4.1 Server-Backed Saved Estimates

- Why it matters: LocalStorage history is not reliable across devices and cannot support real approval links or teams.
- Files likely affected:
  - New API routes for estimates.
  - Supabase schema/migrations.
  - `app/app/page.tsx`
  - Persistence helpers.
  - `app/app/lib/types.ts`
- Risk level: High
- Difficulty: Large
- Suggested order: 16

### 4.2 Server-Backed Jobs

- Why it matters: Jobs are the organizing unit for estimates, invoices, budgets, actuals, and approvals. Server-backed jobs unlock real workflows.
- Files likely affected:
  - New API routes for jobs.
  - Supabase schema/migrations.
  - `app/app/components/JobsDashboardSection.tsx`
  - `app/app/page.tsx`
- Risk level: High
- Difficulty: Large
- Suggested order: 17

### 4.3 Shareable Approval Links

- Why it matters: Current approval links only work on the device with localStorage data. Real customer approval requires server-backed documents.
- Files likely affected:
  - `app/approve/[id]/page.tsx`
  - New approval API routes.
  - Server-backed estimate storage.
  - Supabase schema/migrations.
- Risk level: High
- Difficulty: Large
- Suggested order: 18

### 4.4 Server-Backed Invoices

- Why it matters: Invoices should survive browser storage loss, be visible across devices, and support future payment collection.
- Files likely affected:
  - New invoice API routes.
  - `app/app/components/InvoicesSection.tsx`
  - `app/app/components/JobsDashboardSection.tsx`
  - `app/approve/[id]/page.tsx`
  - Supabase schema/migrations.
- Risk level: High
- Difficulty: Large
- Suggested order: 19

### 4.5 Server-Backed Business Profile

- Why it matters: Company settings should follow the user across sessions and devices.
- Files likely affected:
  - New profile API route.
  - `app/app/page.tsx`
  - Supabase schema/migrations.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 20

## 5. Premium Future Features

### 5.1 Billing Portal and Account Management

- Why it matters: Paid users need a way to manage billing, receipts, and subscription/account status.
- Files likely affected:
  - `app/api/checkout/route.ts`
  - New billing portal API route.
  - `app/app/page.tsx`
  - Stripe/Supabase entitlement records.
- Risk level: Medium
- Difficulty: Medium
- Suggested order: 21

### 5.2 Server-Side PDF Generation

- Why it matters: Browser print-window PDFs are brittle. Server PDFs would support stable formatting, email attachments, and stored documents.
- Files likely affected:
  - New PDF API route.
  - Existing PDF HTML generation in `app/app/page.tsx`
  - Invoice/estimate PDF helpers.
  - Potential use of `pdfkit` or another renderer.
- Risk level: High
- Difficulty: Large
- Suggested order: 22

### 5.3 Better Plan Quantity Extraction

- Why it matters: Plan intelligence has strong structure, but hard quantity extraction remains the main blocker to estimator-grade confidence from complex plan sets.
- Files likely affected:
  - `app/api/generate/lib/plans/analysisHeuristics.ts`
  - `app/api/generate/lib/plans/visionFallback.ts`
  - `app/api/generate/lib/plans/mergeHeuristics.ts`
  - Tests under `app/api/generate/lib/plans/`
- Risk level: Medium
- Difficulty: Large
- Suggested order: 23

### 5.4 Client Portal

- Why it matters: A client portal could centralize approvals, invoices, payment status, and documents.
- Files likely affected:
  - New client-facing routes.
  - Server-backed estimates/invoices/approvals.
  - Auth/session layer.
- Risk level: High
- Difficulty: Large
- Suggested order: 24

### 5.5 Team/Multi-User Workspaces

- Why it matters: Contractors may need estimators, admins, and crews to access the same jobs and documents.
- Files likely affected:
  - Auth/session system.
  - Supabase schema for users/workspaces/roles.
  - All server-backed data routes.
  - App navigation and permissions.
- Risk level: High
- Difficulty: Large
- Suggested order: 25

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
- Suggested order: 26

