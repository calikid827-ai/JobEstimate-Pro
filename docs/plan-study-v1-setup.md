# Plan Study V1: local slice and hosted activation prerequisites

This is a separate, optional painting/wallcovering document study. It does not run
Estimate generation, change the exhausted Estimate allowance, authorize measured
takeoff, supply prices, apply answers to Estimate scope, or turn model output into
verified requirements. Other estimating trades retain their existing workflow.

## Current limits and honest coverage

The first slice accepts original, unencrypted PDFs: eight active files, 48 physical
pages, 3 MiB per file and 20 MiB for the active package. These are explicit rejection
limits, not truncation. Up to 48 retained source versions are allowed per study.
Every physical page is inventoried from server-read original bytes using pdf-lib;
SHA-256 comes from those same bytes. All pages must be prepared before review.
PDF.js extraction and rendering have separate states. Empty extraction, failed
preparation, limited analysis and unknown provider outcomes remain distinguishable.
A rendered page is never labeled substantively reviewed by preparation alone. Package-synthesis limitations and a limited review status are retained and displayed as well as per-page limitations.
Processing completion does not establish visual fidelity for every PDF font/encoding; custom CMap and unusual/unembedded-font support still require evaluation. No external font or CMap destinations are configured.
Embedded raster images above four million pixels are explicitly rejected rather
than silently skipped. JPEG header dimensions must match the PDF image dictionary
before decoding. This slice accepts raw/Flate image streams and eight-bit JPEGs
with DeviceGray, DeviceRGB or DeviceCMYK color spaces; other image codecs/color
spaces are explicitly unsupported. Decoded image streams are bounded to 40 MiB
each and 64 MiB cumulatively per PDF. Drawing streams must be unfiltered or Flate,
with 8 MiB total decoded drawing content per PDF. Inline-image operators in page,
Form or Type3 drawing content are explicitly unsupported at preparation, including
otherwise valid inline images, rather than allowing the renderer to omit them.
Occurrences inside comments, names, literal strings or hexadecimal strings are
data, not inline-image operators. Pages with any annotations (including links or
stamps), and documents declaring XFA content, are explicitly unsupported at
preparation. The first slice does not silently omit annotation appearances or XFA
content and then call the resulting blank/partial page prepared.
Rendered canvases are bounded to four million
pixels and 4,096 pixels on either side, including extreme page aspect ratios.
These are bounded first-slice format limits, not a claim of support for every PDF
codec, font, encoding or adversarial parser complexity.
The complete textual review packet has a 120 KB bound; a package that exceeds it
stops with an explicit incomplete-state error, rather than silently dropping text.

Originals, page images, text-block anchors and answers persist in private Storage
and database rows. Browser filenames, IDs, page counts, hashes and paths are not
ownership proof. Every route verifies the bearer using server `auth.getUser`, then
constrains records by that owner and study. Artifact requests additionally require
membership in the retained immutable document version. The evidence viewer renders
retained PDFs and never follows model/document links or runs PDF actions.

## Production adapters and installation (not yet applied)

`database/plan-study-v1.sql` creates four new private tables, four service-only
functions and a dedicated private `plan-study-private` bucket. It preserves the
existing owner permissions, quota functions and application tables. Apply only
following separate review and explicit hosted authorization. No build, route or
application startup applies SQL.

Before applying, record relevant table/function definitions, ACLs, inherited PUBLIC
privileges, RLS/policies, Storage bucket metadata and existing Storage policies.
Review name collisions and schema compatibility. `CREATE TABLE IF NOT EXISTS` is
not a schema migration mechanism for an incompatible earlier experiment.
The script enables RLS and revokes table/function access from PUBLIC, anon and
authenticated. Service-role privileges are SELECT/INSERT/UPDATE for studies and attempts,
SELECT plus column-level UPDATE only for the six used/reserved allowance counters,
and SELECT/INSERT for immutable artifact metadata. The application role cannot
insert an allowance or change its owner or configured ceilings; those are
administrator-only setup operations.
No sequence is used (UUID identifiers). The SQL uses security-invoker functions;
the trusted server role must retain its normal Supabase private Storage privileges
and BYPASSRLS behavior. Application ownership checks remain mandatory despite that
privilege. Confirm browser-role denial through effective grants/role inheritance,
not just the absence of a policy. Restrictive PUBLIC policies deny this bucket to all non-BYPASSRLS
roles even if another installation policy allows access to all buckets.

Required server configuration is the existing Supabase URL and service-role key,
and the existing public Auth key. Never put the service role in the browser.
PDF.js is pinned to 6.4.299 and its matching worker; canvas is pinned to 1.0.13. Activation requires a supported Node runtime (at least 22.13; use a supported Node 24 runtime) and verification of the native Linux canvas package. Local Next.js preparation passed; hosted Linux packaging has not been verified.

The production store probes the installed RPC, private-bucket metadata and exact restrictive policies. Missing
configuration/schema/permissions produces a clear unavailable response. There is
no filesystem, browser localStorage or in-memory production durability fallback.
Test factories pass synthetic adapters explicitly; no environment flag can select
them through a production route.

## Allowance and real-model activation remain separate

The SQL deliberately inserts **no allowance**. Create/update an owner-level row in
`plan_study_allowances` only after a separately authorized budget decision. The
three authoritative ceilings are provider attempts, input tokens and output
tokens. They are shared across that owner's studies; creating another study or
replacing a source cannot reset them. Do not reuse or reset Estimate-generation
quota. Supply `OPENAI_API_KEY` only through the existing secure server setup when
real-model evaluation is separately authorized. The model adapter is present but
cannot execute until its separate allowance reservation succeeds.

Every attempt reserves one provider request and a conservative 200,000 input /
6,000 output tokens under database row locks before provider execution. SDK retries
are disabled. Known responses settle actual recorded usage (even invalid cited
output consumes an attempt); usage over a reservation is recorded and reduces
remaining capacity. An unknown outcome retains its full reservation. A failed
completion write leaves the durable running reservation intact. Expired leases
are treated as uncertain, not reissued. The browser cannot release/reconcile a
reservation or grant itself an allowance.

Reconciliation is an administrator-only operational procedure: establish provider
outcome/usage from separately authorized provider records; preserve the attempt
record; settle counters and outcome in one reviewed transaction. Do not simply
rerun an unknown or failed step. This slice intentionally has no owner-facing
retry/reconciliation endpoint. Record source/attempt identities and evidence before
any manual reconciliation. Replacing a source invalidates late worker completion;
it does not refund its reserved usage.

## Atomicity, replacement and recovery

Study edits use an expected revision. Claiming a provider attempt locks the study
then the owner allowance, checks idempotency and step identity, and reserves all
usage atomically. Each claim retains the complete active immutable source-version IDs and hashes, rather than relying on filenames or browser metadata. Completion validates its owner/study/source revision, claim token
and lease; it merges only findings/page status into the latest snapshot and preserves
concurrent answers. A duplicate completion is a no-op. A late source version or
expired worker can never overwrite a newer study and keeps an uncertain reservation.
These are SQL/source guarantees pending execution against a disposable database;
synthetic in-memory adapter tests do not prove PostgreSQL runtime behavior.

Replacement retains original immutable files for evidence access, creates a new
source version, clears current analysis and marks answers citing the replaced
version as needing reconfirmation. Saved answers remain decisions, not requirements.
Re-review can produce a new question; answering it is an explicit contractor action.
The old decision remains visible for context and is not silently assigned to the new
source. Evidence referring to an old retained version is labeled superseded.

Storage upload and snapshot CAS are separate operations. A crash or losing CAS can
leave an unreferenced private object/metadata row. Owner evidence routes refuse it
because it has no retained-version membership. Recovery may inventory and remove
only proven unreferenced artifacts after a conservative retention period, using a
separately authorized administrator procedure; the app never guesses ownership.
Do not broaden grants as recovery. Before uninstalling or restoring setup ACLs,
stop workers, retain snapshots/attempt records/private files, and reconcile held
reservations. Revoke new function access first; preserve data until separately
approved for deletion. Existing Estimate operations need not be rolled back.

## Evidence and evaluation limits

The small authored multi-file fixture and provider responses are synthetic. The
PDF extraction/rendering, routes, UI, evidence anchors and owner/session boundaries
can be exercised offline. A valid citation proves a retained source/anchor exists;
it does not prove the finding accurately interprets the document. The later
24/48-page human-reviewed benchmark and real-model accuracy/cost evaluation remain
separate prerequisites, with no claim of takeoff or pricing authority.

Hosted readiness requires: reviewed SQL applied to Staging, private Storage access
verified, effective ACL/RLS and claim/completion concurrency checked on a disposable
database, a separately approved allowance and real-model evaluation budget, secure
server configuration, and the existing protected Preview rollout authorization.
Nothing in this document authorizes activation, credentials, provider requests,
quota resets, purchases or deployment.
