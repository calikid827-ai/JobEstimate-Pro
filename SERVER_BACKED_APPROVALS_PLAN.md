# Server-Backed Approvals Plan

Status: implemented through Phase 4B.

Implemented:

- Server approval snapshot creation through `POST /api/approvals`.
- Cross-device approval page read through `GET /api/approvals/[token]`.
- Server approval submission/signature saving through `POST /api/approvals/[token]/approve`.
- Approval status sync back to `/app` through `GET /api/approvals/status?email=...`.
- Approval-created draft invoice snapshot creation and sync back into local invoices.

Still not implemented:

- Full server-backed jobs, estimates, and invoices.
- Authenticated accounts/workspaces.
- Server-side invoice payment collection.
- Automatic balance invoice creation after deposit payment.

## Current Approval Workflow

1. `/api/generate` returns an estimate result.
2. `/app` builds an estimate history item with job details, scope text, pricing, schedule, tax, deposit, plan/readback outputs, estimator outputs, and `approval: { status: "pending" }`.
3. The estimate is saved to localStorage key `jobestimatepro_history_v1`.
4. The app and jobs dashboard show `Copy Approval Link` while the estimate is pending approval.
5. The app first saves a frozen customer-safe approval snapshot to Supabase and copies `/approve/{token}`.
6. If the server snapshot cannot be saved, the app falls back to the local-only `/approve/{estimateId}` link.
7. `/approve/[id]` first attempts to read the server snapshot by token.
8. If no server snapshot is found, `/approve/[id]` falls back to localStorage lookup for same-device approvals.
9. Server-backed approval submission writes the approval row and signature to Supabase, then marks the proposal approved.
10. Server-backed approval submission creates one draft approval invoice snapshot when none exists.
11. `/app` can manually sync approval status and approval-created invoice snapshots back into localStorage.
12. Existing same-device local approval still updates localStorage and can auto-create a local invoice.

## Current Limitation

The old local-only approval limitation is resolved for links created after the server-backed approval implementation. New approval links use Supabase approval snapshot tables and work across devices.

Important remaining limitation: the main contractor workspace is still mostly localStorage-backed. Server-backed approval snapshots, approval status, and approval-created invoice snapshots can sync back into localStorage, but full server-backed jobs, estimates, and invoices are not implemented yet.

## Server-Side Data Needed

A real shareable approval link needs a frozen server-side approval snapshot, not just a local estimate ID.

Minimum data to store:

- Proposal identity:
  - Server proposal ID
  - Local estimate ID
  - Local job ID if present
  - Owner email from `jobestimatepro_email`
- Customer/job display data:
  - Client name
  - Job name
  - Job address
  - Document type
  - Change order number
  - Created date
- Customer-facing estimate snapshot:
  - Scope/result text
  - Pricing totals
  - Schedule
  - Tax
  - Deposit
  - Estimate rows/sections needed for invoice consistency
  - Company/business profile if the approval page should show it later
- Approval link data:
  - Public token or slug
  - Token hash stored server-side
  - Status
  - Expiration/revocation flags if needed
- Approval result:
  - Approved by
  - Approved at
  - Signature image/data
  - Optional IP/user-agent audit fields
- Invoice-after-approval data:
  - Whether invoice was auto-created
  - Invoice snapshot
  - Invoice ID
  - Source approval ID
  - Invoice status

## Minimal Supabase Schema

The first pass should avoid a full account/workspace model. Use owner email plus server-only API routes.

### `estimate_proposals`

- `id uuid primary key`
- `owner_email text not null`
- `local_estimate_id text`
- `local_job_id text`
- `document_type text not null`
- `client_name text`
- `job_name text`
- `job_address text`
- `status text not null default 'pending'`
- `estimate_snapshot jsonb not null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `approval_links`

- `id uuid primary key`
- `proposal_id uuid references estimate_proposals(id) on delete cascade`
- `token_hash text not null unique`
- `status text not null default 'active'`
- `expires_at timestamptz`
- `created_at timestamptz default now()`
- `last_viewed_at timestamptz`

### `proposal_approvals`

- `id uuid primary key`
- `proposal_id uuid references estimate_proposals(id) on delete cascade`
- `approved_by text not null`
- `approved_at timestamptz default now()`
- `signature_data_url text`
- `ip_hash text`
- `user_agent text`
- `created_at timestamptz default now()`

### `approval_invoices`

- `id uuid primary key`
- `proposal_id uuid references estimate_proposals(id) on delete cascade`
- `approval_id uuid references proposal_approvals(id)`
- `owner_email text not null`
- `local_invoice_id text`
- `invoice_snapshot jsonb not null`
- `status text not null default 'draft'`
- `created_at timestamptz default now()`

Implementation notes:

- Store only `token_hash`, not raw approval tokens.
- Keep public approval reads and writes behind API routes.
- Store customer-safe frozen proposal snapshots, not every internal diagnostic field.

## Minimal API Routes

### `POST /api/approvals`

Called from `/app` before copying an approval link.

Request body:

- `email`
- `estimate`
- Optional `companyProfile`

Server behavior:

- Validate email.
- Store a frozen customer-safe proposal snapshot.
- Create a long random token.
- Store only the token hash.
- Return `/approve/{token}`.

### `GET /api/approvals/[token]`

Called by `/approve/[id]` when loading a public approval link.

Server behavior:

- Hash the token.
- Find an active approval link.
- Return the customer-safe proposal snapshot and approval status.
- Optionally update `last_viewed_at`.

### `POST /api/approvals/[token]/approve`

Called by `/approve/[id]` when the customer approves.

Request body:

- `approvedBy`
- `signatureDataUrl`

Server behavior:

- Validate token is active and not expired.
- Write the approval row.
- Update proposal status to `approved`.
- Optionally create the approval invoice snapshot.
- Return approval status and invoice-created flag.

### Implemented Sync Route

`GET /api/approvals/status?email=...`

Used by `/app` to pull server approval statuses and approval-created invoice snapshots for estimates owned by the current email.

### Optional Later Route

`POST /api/approvals/[token]/invoice`

Not currently needed. Approval-created invoice snapshot creation now happens inside `POST /api/approvals/[token]/approve`.

## LocalStorage Fallback Behavior

Keep localStorage as the local workspace and fallback cache:

- Continue saving estimates to `jobestimatepro_history_v1`.
- Continue saving invoices to `jobestimatepro_invoices`.
- If server approval-link creation fails, keep the current local-only copy link with a clear warning that it only works on this device.
- After server approval, use the manual `Sync approvals` action in `/app` to patch approved status and import missing approval-created invoices into localStorage.
- Keep `buildInvoiceFromEstimate()` as the invoice calculation source so approval-created invoices stay consistent.

## Risks and Edge Cases

- Approval tokens must be long, random, and unguessable.
- Store token hashes, not raw tokens.
- The approval snapshot should be frozen so the customer approves the exact estimate version sent.
- Duplicate approval submissions should be idempotent or clearly rejected.
- Server invoice creation should prevent duplicate invoices for one proposal.
- Signature data URLs can be large; Supabase Storage may be better later.
- Owner email is a weak identity, but it matches the current entitlement model and avoids adding auth prematurely.
- Edited estimates should require a new approval snapshot/link.
- Expiration and revocation are not required in the first pass, but the schema should allow them.
- Public approval pages must return only customer-safe fields.
- App sync must patch approval fields without overwriting unrelated local estimate edits.
- Approval-created invoices must use the same calculation path as invoices created in `/app`.

## Phased Implementation Plan

### Phase 1: Server-Save Approval Snapshot

- Add `POST /api/approvals`.
- From `Copy Approval Link`, save the current estimate snapshot to Supabase.
- Return a tokenized `/approve/{token}` URL.
- Keep local-only fallback if server save fails.

Status: implemented.

### Phase 2: Public Approval Page Reads Server Snapshot

- Update `/approve/[id]` to first treat `id` as a server token.
- Call `GET /api/approvals/[token]`.
- Render the server snapshot when found.
- Fall back to current localStorage lookup if server token lookup fails.

Status: implemented.

### Phase 3: Server Approval Submission And Status Sync

- Add server approval submission by token.
- Save approval result/signature to Supabase.
- Add server approval status fetch for owner email.
- On `/app` load or refresh, merge server approval status into matching local estimates.
- Preserve local estimate content and only patch approval fields.

Status: implemented with manual `Sync approvals` action.

### Phase 4B: Approval-Created Invoice Remains Consistent

- Move approval-created invoice generation behind the server approval endpoint or sync server-created invoice snapshots back to the app.
- Use the same invoice calculation helper behavior as `/app`.
- Store invoice snapshots in Supabase.
- Prevent duplicate invoices by `proposal_id`.
- Sync invoice snapshots back to localStorage for the current UI.

Status: implemented.

## Recommended Minimal First Implementation

Do not server-back every estimate, job, or invoice in the first pass.

The minimal implementation now in place is:

1. Keep `/app` localStorage as the primary workspace.
2. Add server-backed frozen approval proposal snapshots.
3. Generate tokenized public approval links.
4. Let `/approve/[id]` read server snapshots by token.
5. Keep the existing localStorage approval lookup as fallback.
6. Save server-backed approval submission/signature to Supabase.
7. Sync server approval status back into local history.
8. Create and sync one approval-created draft invoice snapshot.

This fixes the core cross-device approval-link problem without a broad persistence rewrite.
