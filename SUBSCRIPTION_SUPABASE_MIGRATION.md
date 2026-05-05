# Subscription Supabase Migration

Use this checklist before implementing subscription billing code. This migration is additive and preserves the current one-time/email entitlement behavior until checkout, webhook, entitlement, and UI code are changed.

Important current state:

- Current live checkout still uses `STRIPE_PRICE_ID` with `mode: "payment"`.
- `STRIPE_PRO_MONTHLY_PRICE_ID` is already set in Vercel for the upcoming subscription code path.
- `/api/entitlement` currently reads `active, usage_count`.
- `/api/webhook` currently upserts `email, stripe_customer_id, active: true` and must not reset `usage_count`.
- This migration must be applied before switching checkout/webhook code to subscription mode.

## Preflight Checks

Confirm `entitlements` exists and inspect existing rows before applying changes.

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'entitlements'
order by ordinal_position;
```

Check whether duplicate emails exist before adding a unique email index.

```sql
select
  email,
  count(*) as row_count
from public.entitlements
group by email
having count(*) > 1
order by row_count desc, email;
```

If duplicates exist, resolve them manually before creating the unique email index. Preserve the highest-confidence entitlement row for each email and do not reset `usage_count`.

## Migration SQL

Run this in Supabase SQL editor or through a reviewed migration. It only adds columns and indexes.

```sql
alter table public.entitlements
  add column if not exists plan text not null default 'free',
  add column if not exists subscription_status text not null default 'free',
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists free_limit integer not null default 3,
  add column if not exists fair_use_period_start timestamptz,
  add column if not exists fair_use_generation_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
```

Recommended status values for code to use later:

- `free`
- `active`
- `trialing`
- `past_due`
- `unpaid`
- `canceled`
- `incomplete`
- `incomplete_expired`
- `legacy_active`

Recommended plan values for code to use later:

- `free`
- `pro`
- `legacy_beta`
- `manual_comp`

## Index SQL

Create or confirm the unique email index first. This expects duplicate emails to be resolved.

```sql
create unique index if not exists entitlements_email_unique_idx
on public.entitlements (email);
```

Create lookup indexes used by subscription webhook and entitlement flows.

```sql
create index if not exists entitlements_stripe_customer_id_idx
on public.entitlements (stripe_customer_id);

create index if not exists entitlements_stripe_subscription_id_idx
on public.entitlements (stripe_subscription_id);

create index if not exists entitlements_subscription_status_idx
on public.entitlements (subscription_status);
```

## Backward Compatibility

Do not delete existing entitlement rows.

Existing one-time/manual rows need explicit classification before subscription code relies on `plan` and `subscription_status`.

Recommended handling:

- Existing manually granted or one-time beta rows with `active = true` can be marked as `plan = 'legacy_beta'` and `subscription_status = 'legacy_active'`.
- Comped/internal access can be marked as `plan = 'manual_comp'` and `subscription_status = 'legacy_active'`.
- Free/non-paid rows should remain `plan = 'free'` and `subscription_status = 'free'`.
- Current `usage_count` must not be reset.
- Current `stripe_customer_id` must be preserved.

Example classification for known pre-launch one-time beta rows:

```sql
update public.entitlements
set
  plan = 'legacy_beta',
  subscription_status = 'legacy_active',
  updated_at = now()
where active = true
  and stripe_subscription_id is null
  and coalesce(plan, 'free') = 'free';
```

Use the example only if all existing `active = true` rows are intentionally retained as legacy beta access. If production has mixed manual/test rows, classify them individually.

Manual comp example:

```sql
update public.entitlements
set
  plan = 'manual_comp',
  subscription_status = 'legacy_active',
  active = true,
  updated_at = now()
where email in (
  'replace-with-known-comp@example.com'
);
```

## Verification Queries

Confirm required columns exist.

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'entitlements'
  and column_name in (
    'plan',
    'subscription_status',
    'stripe_subscription_id',
    'current_period_start',
    'current_period_end',
    'cancel_at_period_end',
    'canceled_at',
    'trial_end',
    'free_limit',
    'fair_use_period_start',
    'fair_use_generation_count',
    'updated_at'
  )
order by column_name;
```

Expected result:

- All 12 subscription columns are present.
- `plan`, `subscription_status`, `cancel_at_period_end`, `free_limit`, `fair_use_generation_count`, and `updated_at` are not nullable.
- Defaults exist for `plan`, `subscription_status`, `cancel_at_period_end`, `free_limit`, `fair_use_generation_count`, and `updated_at`.

Confirm required indexes exist.

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'entitlements'
  and (
    indexname = 'entitlements_email_unique_idx'
    or indexname = 'entitlements_stripe_customer_id_idx'
    or indexname = 'entitlements_stripe_subscription_id_idx'
    or indexname = 'entitlements_subscription_status_idx'
  )
order by indexname;
```

Expected result:

- `entitlements_email_unique_idx` exists and is unique.
- `entitlements_stripe_customer_id_idx` exists.
- `entitlements_stripe_subscription_id_idx` exists.
- `entitlements_subscription_status_idx` exists.

Confirm existing usage counts were preserved.

```sql
select
  email,
  active,
  plan,
  subscription_status,
  usage_count,
  free_limit,
  stripe_customer_id,
  stripe_subscription_id
from public.entitlements
order by updated_at desc nulls last, email
limit 50;
```

Expected result:

- Existing paid/manual rows are still present.
- Existing `usage_count` values are unchanged.
- Existing `stripe_customer_id` values are preserved.
- Existing one-time/manual active rows are intentionally classified as `legacy_beta` or `manual_comp` before subscription code depends on plan/status.

Confirm active legacy rows are classified.

```sql
select
  email,
  active,
  plan,
  subscription_status,
  stripe_subscription_id
from public.entitlements
where active = true
  and stripe_subscription_id is null
order by email;
```

Expected result:

- Any rows returned are intentional legacy/manual rows.
- Returned rows should use `plan in ('legacy_beta', 'manual_comp')`.
- Returned rows should use `subscription_status = 'legacy_active'`.

Confirm no duplicate emails remain.

```sql
select
  email,
  count(*) as row_count
from public.entitlements
group by email
having count(*) > 1;
```

Expected result:

- No rows returned.

## Code Cutover Guardrail

Do not switch application code to subscription mode until all of these are true:

- This migration has been applied in the target Supabase project.
- Verification queries pass.
- `STRIPE_PRO_MONTHLY_PRICE_ID` is present in the target hosting environment.
- Stripe webhook endpoint is ready to receive subscription lifecycle events.
- Existing one-time/manual active entitlements have been classified without resetting `usage_count`.

After this migration, the next code work can safely update:

- `app/api/checkout/route.ts`
- `app/api/webhook/route.ts`
- `app/api/entitlement/route.ts`
- `app/success/page.tsx`
- `app/cancel/page.tsx`
- `/app` Account & Access display

Keep estimator, pricing authority, approval, invoice, and PDF logic out of the subscription migration unless a verified entitlement integration issue requires a narrow change.
