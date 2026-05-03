# Server-Backed Approvals Plan

## Current Approval Workflow

1. `/api/generate` returns an estimate result.
2. `/app` builds an estimate history item with job details, scope text, pricing, schedule, tax, deposit, plan/readback outputs, estimator outputs, and `approval: { status: "pending" }`.
3. The estimate is saved to localStorage key `jobestimatepro_history_v1`.
4. The app and jobs dashboard show `Copy Approval Link` while the estimate is pending approval.
5. The copied URL is currently `/approve/{estimateId}`.
6. `/approve/[id]` reads `jobestimatepro_history_v1` from the current browser.
7. The approval page finds the estimate by matching the local estimate ID.
8. The customer enters a name, checks the approval box, signs, and approves.
9. `/approve/[id]` updates the matching localStorage estimate with approved status, approver name, approval timestamp, and signature data URL.
10. The approval page auto-creates a draft invoice in localStorage key `jobestimatepro_invoices` using `buildInvoiceFromEstimate()`.
11. `/app` listens for `jobestimatepro:update` and refreshes local history and invoices.

## Current Limitation

Approval links are localStorage-backed. The URL only contains an estimate ID, and the approval page can only load the estimate if that same browser/device already has the estimate in `jobestimatepro_history_v1`.

This means copied approval links are not truly shareable across devices or browsers.

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

### Later Sync Route

`GET /api/approvals/status?email=...`

Used by `/app` to pull server approval statuses for estimates owned by the current email.

### Optional Later Route

`POST /api/approvals/[token]/invoice`

Only needed if invoice creation should be separated from approval submission.

## LocalStorage Fallback Behavior

Keep localStorage as the local workspace and fallback cache:

- Continue saving estimates to `jobestimatepro_history_v1`.
- Continue saving invoices to `jobestimatepro_invoices`.
- If server approval-link creation fails, keep the current local-only copy link with a clear warning that it only works on this device.
- After server approval, sync the approved status back into localStorage when `/app` opens.
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

This makes the link portable without changing the approval page too broadly.

### Phase 2: Public Approval Page Reads Server Snapshot

- Update `/approve/[id]` to first treat `id` as a server token.
- Call `GET /api/approvals/[token]`.
- Render the server snapshot when found.
- Fall back to current localStorage lookup if server token lookup fails.

This lets customers open approval links on any device.

### Phase 3: Approved Status Syncs Back To App

- Add server approval status fetch for owner email.
- On `/app` load or refresh, merge server approval status into matching local estimates.
- Preserve local estimate content and only patch approval fields.

This lets the contractor see approvals completed from another device.

### Phase 4: Approval-Created Invoice Remains Consistent

- Move approval-created invoice generation behind the server approval endpoint or sync server-created invoice snapshots back to the app.
- Use the same invoice calculation helper behavior as `/app`.
- Store invoice snapshots in Supabase.
- Prevent duplicate invoices by `proposal_id`.
- Sync invoice snapshots back to localStorage for the current UI.

This keeps approval-created invoices consistent and recoverable.

## Recommended Minimal First Implementation

Do not server-back every estimate, job, or invoice in the first pass.

The smallest safe implementation is:

1. Keep `/app` localStorage as the primary workspace.
2. Add server-backed frozen approval proposal snapshots.
3. Generate tokenized public approval links.
4. Let `/approve/[id]` read server snapshots by token.
5. Keep the existing localStorage approval lookup as fallback.
6. Add server-to-local approval status sync in a later phase.

This fixes the real cross-device approval-link problem without a broad persistence rewrite.
