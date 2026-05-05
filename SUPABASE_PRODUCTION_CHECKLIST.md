# Supabase Production Checklist

Use this checklist before public launch to verify production Supabase matches the code paths currently used by JobEstimate Pro. This is documentation only; it is not a migration file.

Current launch path: PWA/web app first. Subscription billing foundation is implemented and remains web-first; final subscription payment/webhook entitlement verification is still pending.

## Required Environment Variables

Set these in the production hosting environment:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRICE_ID` only if retaining legacy/pre-launch one-time fallback references outside the current checkout code.
- `STRIPE_WEBHOOK_SECRET`
- Optional: `ALLOWED_ORIGIN_HOSTS`

Verify:

- `NEXT_PUBLIC_SITE_URL` has the production origin and no trailing-path mistakes.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and never exposed to client code.
- Stripe webhook endpoint points to `POST /api/webhook`.
- Stripe Checkout uses `mode: "subscription"` with `STRIPE_PRO_MONTHLY_PRICE_ID`.
- Stripe recurring monthly Pro price has been created, Vercel has `STRIPE_PRO_MONTHLY_PRICE_ID` set, and the app was redeployed after adding the env var.
- Stripe webhook endpoint is configured for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
- Final subscription payment/webhook entitlement verification is still pending.

## RLS / Service-Role Assumptions

Current API routes create Supabase clients with `SUPABASE_SERVICE_ROLE_KEY`.

Production requirements:

- Server routes must be able to read/write the tables below through the service-role key.
- RLS may be enabled, but service role must bypass policies or policies must explicitly allow service-role operations.
- Public approval pages must not read Supabase directly. They must continue going through API routes.
- Do not expose raw approval tokens or owner sync tokens in database rows. Store only hashes.

Unknowns to verify:

- Whether production RLS is enabled on these tables.
- Whether any dashboard-created policies accidentally block service-role API behavior.

## Entitlement / Free Limit

### `entitlements`

Used by:

- `POST /api/entitlement`
- `POST /api/webhook`
- `POST /api/generate` indirectly through the free-generation RPC

Current code expects at least:

- `email text`
- `active boolean`
- `usage_count integer` or numeric-compatible
- `stripe_customer_id text` nullable
- `plan text`
- `subscription_status text`
- `stripe_subscription_id text` nullable
- `current_period_start timestamptz` nullable
- `current_period_end timestamptz` nullable
- `cancel_at_period_end boolean`
- `canceled_at timestamptz` nullable
- `trial_end timestamptz` nullable
- `free_limit integer`
- `updated_at timestamptz`

Required behavior:

- `POST /api/entitlement` selects `active, usage_count, plan, subscription_status, current_period_end, cancel_at_period_end, free_limit` by `email`.
- Stripe webhook upserts subscription-aware fields with `onConflict: "email"`.
- Webhook upsert must not reset `usage_count`.

Required constraints/indexes:

- Unique constraint or primary key on `entitlements.email`.
- Index on `entitlements.email` if the unique constraint does not already cover lookup.

Unknowns to verify from production:

- Exact column defaults for `active` and `usage_count`.
- Whether `usage_count` is `not null`.
- Whether existing test/pre-launch rows use normalized lowercase email.

### `consume_free_generation` RPC

Used by:

- `POST /api/generate`

Current code calls:

```sql
consume_free_generation(
  p_email text,
  p_free_limit integer,
  p_idempotency_key text
)
```

Required response shape:

- Must return an object or a one-row result containing:
  - `ok boolean`
  - `usage_count number`
  - `free_limit number`
  - Optional `reason text`
- The code also tolerates payload nested under `consume_free_generation` or `consume_free_gen`.

Required behavior:

- Normalize or consistently match normalized lowercase email.
- Idempotently consume by `p_idempotency_key`.
- Return `ok: false` when the free limit is reached.
- Return current `usage_count` and `free_limit`.
- Preserve paid entitlement behavior according to current production policy.

Unknowns to verify:

- Exact RPC implementation.
- Whether idempotency keys are stored in a separate table.
- Whether active paid users bypass consumption in the RPC or by another production-side rule.

## Optional Generation Cache

### `generation_results`

Used by:

- `POST /api/generate`

Current code treats this cache as best-effort. Missing or failing cache writes should not block launch if generation still works, but production should either provide the table or accept noisy ignored warnings.

Current code expects:

- `email text`
- `request_id text`
- `response jsonb`

Required constraints/indexes:

- Unique constraint on `(email, request_id)` is recommended for request idempotency.
- Index on `(email, request_id)`.

Unknowns to verify:

- Whether this table exists in production.
- Whether cache retention should be pruned.

## Stripe Webhook Dedupe

### `stripe_webhook_events`

Used by:

- `POST /api/webhook`

Current code inserts:

- `event_id`
- `type`

Required behavior:

- Duplicate `event_id` inserts must raise a unique violation (`23505`) or duplicate/unique error message so the webhook can safely return success for retries.

Required constraints/indexes:

- Unique constraint or primary key on `stripe_webhook_events.event_id`.
- Optional index on `stripe_webhook_events.type`.
- Optional `created_at timestamptz default now()` for audit/debugging.

Unknowns to verify:

- Exact table columns beyond `event_id` and `type`.
- Whether webhook retention cleanup is needed.

## Approval Workflow Tables

The server-backed approval flow currently uses these tables:

- `estimate_proposals`
- `approval_links`
- `approval_owner_sync_tokens`
- `proposal_approvals`
- `approval_invoices`

### `estimate_proposals`

Used by:

- `POST /api/approvals`
- `GET /api/approvals/[token]`
- `POST /api/approvals/[token]/approve`
- `GET /api/approvals/status`

Current code reads/writes:

- `id uuid`
- `owner_email text`
- `local_estimate_id text`
- `local_job_id text`
- `document_type text`
- `client_name text`
- `job_name text`
- `job_address text`
- `status text`
- `estimate_snapshot jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Required behavior:

- Proposal snapshots are frozen customer-safe estimate snapshots.
- Reusing an existing proposal is attempted by `owner_email + local_estimate_id` where status is `pending` or `approved`.
- Approval submission updates `status` to `approved` and `updated_at`.

Required constraints/indexes:

- Primary key on `id`.
- Index on `owner_email`.
- Index on `local_estimate_id`.
- Index on `(owner_email, local_estimate_id)`.
- Duplicate-prevention expectation for `(owner_email, local_estimate_id)`.

Important note:

- The code handles unique-violation recovery for duplicate proposal insert, but also queries reusable proposals by `owner_email + local_estimate_id + status in ('pending', 'approved')`. If production allows multiple rows for the same owner/local estimate, behavior may still work but duplicate links/proposals can accumulate. Prefer a unique constraint that matches the intended duplicate-prevention policy.

Unknowns to verify:

- Whether `(owner_email, local_estimate_id)` is unique for all rows or only active/pending rows.
- Whether `status` has a check constraint.
- Whether `updated_at` is maintained by trigger or application writes only.

### `approval_links`

Used by:

- `POST /api/approvals`
- `GET /api/approvals/[token]`
- `POST /api/approvals/[token]/approve`

Current code reads/writes:

- `id uuid`
- `proposal_id uuid`
- `token_hash text`
- `status text`
- `expires_at timestamptz`
- `created_at timestamptz`
- `last_viewed_at timestamptz`

Required behavior:

- Store only `token_hash`, never the raw public approval token.
- Public reads only accept links where `status = 'active'` and `expires_at` is null or in the future.
- Public read updates `last_viewed_at`.

Required constraints/indexes:

- Primary key on `id`.
- Foreign key `proposal_id references estimate_proposals(id) on delete cascade`.
- Unique constraint on `approval_links.token_hash`.
- Index on `proposal_id`.

Unknowns to verify:

- Whether `expires_at` is nullable in production.
- Whether `status` has a check constraint.

## Owner Sync Token Table

### `approval_owner_sync_tokens`

Used by:

- `POST /api/approvals`
- `GET /api/approvals/status`

Current code reads/writes:

- `id uuid`
- `owner_email text`
- `token_hash text`
- `created_at timestamptz`
- `updated_at timestamptz`

Required behavior:

- Store only the owner sync token hash.
- Upsert by `owner_email`.
- `GET /api/approvals/status` must match both `owner_email` and `token_hash`.

Required constraints/indexes:

- Primary key on `id`.
- Unique constraint on `approval_owner_sync_tokens.owner_email`.
- Index on `(owner_email, token_hash)`.

Unknowns to verify:

- Whether rotating owner sync tokens intentionally invalidates earlier browser sessions.
- Whether `updated_at` is maintained by trigger or application writes only.

## Proposal Approval Table

### `proposal_approvals`

Used by:

- `POST /api/approvals/[token]/approve`
- `GET /api/approvals/status`

Current code reads/writes:

- `id uuid`
- `proposal_id uuid`
- `approved_by text`
- `approved_at timestamptz`
- `signature_data_url text`
- Optional/audit fields from plan: `ip_hash`, `user_agent`
- `created_at timestamptz`

Required behavior:

- Only one approval row should exist per proposal.
- Duplicate approval submission should be idempotent or recover from unique violation by reading the existing row.

Required constraints/indexes:

- Primary key on `id`.
- Foreign key `proposal_id references estimate_proposals(id) on delete cascade`.
- Unique constraint on `proposal_approvals.proposal_id`.
- Index on `approved_at`.

Unknowns to verify:

- Whether large `signature_data_url` values fit current column/storage limits.
- Whether audit fields exist in production.

## Approval Invoice Table

### `approval_invoices`

Used by:

- `POST /api/approvals/[token]/approve`
- `GET /api/approvals/status`

Current code reads/writes:

- `id uuid`
- `proposal_id uuid`
- `approval_id uuid`
- `owner_email text`
- `local_estimate_id text`
- `local_job_id text`
- `local_invoice_id text`
- `invoice_snapshot jsonb`
- `status text`
- `created_at timestamptz`

Required behavior:

- One approval-created invoice snapshot per proposal.
- Duplicate invoice creation should be prevented by unique constraint and recovered by reading the existing invoice.
- `invoice_snapshot` is synced back into `/app` localStorage.

Required constraints/indexes:

- Primary key on `id`.
- Foreign key `proposal_id references estimate_proposals(id) on delete cascade`.
- Foreign key `approval_id references proposal_approvals(id)` if `approval_id` exists.
- Unique constraint on `approval_invoices.proposal_id`.
- Index on `owner_email`.
- Index on `local_estimate_id`.

Unknowns to verify:

- Whether `approval_id` is nullable. Current code can pass `approvalId: null` only if it is reused in unusual recovery paths.
- Whether `local_job_id` exists in production; current code inserts it.
- Whether `status` has a check constraint.

## Required Indexes And Unique Constraints Summary

Required or strongly expected:

- `entitlements.email` unique.
- `stripe_webhook_events.event_id` unique.
- `generation_results(email, request_id)` unique if the optional cache table is present.
- `estimate_proposals(owner_email, local_estimate_id)` duplicate-prevention expectation.
- `approval_links.token_hash` unique.
- `approval_owner_sync_tokens.owner_email` unique.
- `proposal_approvals.proposal_id` unique.
- `approval_invoices.proposal_id` unique.

Recommended lookup indexes:

- `estimate_proposals.owner_email`
- `estimate_proposals.local_estimate_id`
- `approval_links.proposal_id`
- `approval_owner_sync_tokens(owner_email, token_hash)`
- `proposal_approvals.approved_at`
- `approval_invoices.owner_email`
- `approval_invoices.local_estimate_id`

## Manual Verification Queries

Run these against production before launch.

### Table existence

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'entitlements',
    'stripe_webhook_events',
    'generation_results',
    'estimate_proposals',
    'approval_links',
    'approval_owner_sync_tokens',
    'proposal_approvals',
    'approval_invoices'
  )
order by table_name;
```

### Required columns

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'entitlements',
    'stripe_webhook_events',
    'generation_results',
    'estimate_proposals',
    'approval_links',
    'approval_owner_sync_tokens',
    'proposal_approvals',
    'approval_invoices'
  )
order by table_name, ordinal_position;
```

### Unique constraints and primary keys

```sql
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in (
    'entitlements',
    'stripe_webhook_events',
    'generation_results',
    'estimate_proposals',
    'approval_links',
    'approval_owner_sync_tokens',
    'proposal_approvals',
    'approval_invoices'
  )
  and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
group by tc.table_name, tc.constraint_name, tc.constraint_type
order by tc.table_name, tc.constraint_name;
```

### Foreign keys

```sql
select
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in (
    'approval_links',
    'proposal_approvals',
    'approval_invoices'
  )
order by tc.table_name, tc.constraint_name;
```

### RPC existence

```sql
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'consume_free_generation';
```

### RLS status

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'entitlements',
    'stripe_webhook_events',
    'generation_results',
    'estimate_proposals',
    'approval_links',
    'approval_owner_sync_tokens',
    'proposal_approvals',
    'approval_invoices'
  )
order by tablename;
```

## Pre-Launch Smoke Test Checklist

Run this with production-like environment variables and Stripe test mode or an approved production test path.

1. Free generation
   - Enter a new email in `/app`.
   - Generate until usage increments.
   - Confirm `POST /api/entitlement` shows `usage_count` and `free_limit`.
   - Confirm free-limit block behavior at the configured limit.

2. Stripe checkout and entitlement
   - Start checkout from `/app`.
   - Complete subscription payment.
   - Confirm webhook writes `stripe_webhook_events.event_id`.
   - Confirm `entitlements.plan = 'pro'`, `subscription_status` reflects Stripe, `stripe_subscription_id` is set, and `active = true` for active/trialing access.
   - Confirm `/success`, `/api/entitlement`, and `/app` entitlement refresh show subscription-aware Pro access.

3. Generate after entitlement
   - Generate with the paid email.
   - Confirm the request is allowed according to current entitlement/RPC behavior.

4. Approval link creation
   - Save/generate an estimate.
   - Copy a shareable approval link.
   - Confirm `estimate_proposals`, `approval_links`, and `approval_owner_sync_tokens` rows are created.
   - Confirm raw approval token and raw owner sync token are not stored.

5. Public approval read
   - Open `/approve/{token}` in another browser/device.
   - Confirm the proposal loads.
   - Confirm response is minimized/customer-safe.

6. Public approval submit
   - Approve with name and signature.
   - Confirm `proposal_approvals` row is created.
   - Confirm `estimate_proposals.status = 'approved'`.
   - Confirm exactly one `approval_invoices` row exists for the proposal.

7. Idempotency / duplicate protection
   - Submit approval again or refresh/retry after approval.
   - Confirm no duplicate `proposal_approvals` rows.
   - Confirm no duplicate `approval_invoices` rows.
   - Copy approval link again for the same local estimate and owner email.
   - Confirm proposal reuse or expected duplicate-prevention behavior.

8. Owner approval sync
   - In `/app`, run manual approval sync with the same owner email/browser.
   - Confirm approved status imports into local history.
   - Confirm one approval-created invoice imports into local invoices.

9. Production safety
   - Confirm production logs do not include raw plan/customer/pricing debug details.
   - Confirm no service-role key appears in client bundles or browser network responses.

## Explicit Unknowns To Resolve Before Launch

- Exact production SQL for `consume_free_generation`.
- Whether the optional `generation_results` cache table exists and has retention policy.
- Whether `estimate_proposals(owner_email, local_estimate_id)` is a hard unique constraint or only an application-level duplicate-prevention expectation.
- Whether RLS is enabled and, if so, whether service-role behavior is verified in production.
- Whether signature data URLs need Supabase Storage later because of row-size or payload limits.
- Final subscription payment/webhook entitlement verification remains pending; use `SUBSCRIPTION_TEST_CHECKLIST.md`.
