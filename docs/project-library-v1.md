# Retained project files: paginated metadata and exact source content

This local implementation does not apply SQL, create buckets, change access policies or access a hosted project. The production adapter remains the real private-storage adapter and fails visibly until the separately reviewed setup is approved. The controlled local store is never selected by a production request or environment fallback.

## Minimum hosted setup requiring separate authorization

1. Review `database/project-library-v1.sql` for the intended project. It retains the previous `project_libraries` snapshot table and private originals; creates normalized project heads, file summaries and page-content rows; atomically imports every old file/version/page; and checks preserved identities/counts. Existing normalized projects are never overwritten. An incomplete import aborts the transaction. The retained old snapshots remain audit evidence. The old whole-snapshot writer is disabled to prevent dual writers after activation. Plan the coordinated application/schema switch before running this review-only definition.
2. Confirm the existing server-only `SUPABASE_SERVICE_ROLE_KEY` and public Supabase URL identify that intended project. Service-role credentials never enter public client variables. Metadata/page tables have RLS, no anonymous/authenticated grants, and service-role-only access through verified owner routes.
3. Verify private Storage CORS/TUS behavior for the application origin, expiration, resumed uploads and the plan's storage/upload/egress limits. Headers include `Tus-Resumable`, `Upload-Length`, `Upload-Metadata`, `Upload-Offset`, `x-signature`, `Content-Type`; expose `Location` and `Upload-Offset`.
4. Run separately authorized non-customer hosted validation for the import, SQL/RLS/Auth, private originals, exact page retrieval, concurrent CAS/leases and capacity. Source inspection and controlled adapter tests do not execute or prove this SQL against a real PostgreSQL server.

The API verifies the existing owner session and does not trust owner IDs supplied by a browser. A local job ID names a project only inside that verified owner's namespace. Another owner's same project ID cannot retrieve the first owner's inventory, page content, transfer capability or original.

## Bounded inventory and source retrieval

The earlier joint 3 MiB whole-inventory/text ceiling is removed by separating storage and access, not raising a response limit or truncating text.

- Normalized `project_library_heads` records the CAS revision/counters. `project_library_files` stores one metadata-only row per immutable source version. `project_library_pages` separates page metadata from `text_content`; inventory queries never select text or image data.
- `GET /api/projects/:projectId/files?limit=50&cursor=...` returns at most 50 file summaries, an explicit total and continuation cursor. Summaries contain `pages: []`, `contentStatus: "not_loaded"` and prepared/failed/text-character counters. All files, historical versions, paths and processing states remain discoverable.
- Cursors pin the project revision. A concurrent write returns `PROJECT_CHANGED` rather than silently missing/repeating records. `client.list()` assembles the metadata summaries through bounded responses and restarts at most three times. Persistent contention produces a visible refresh/pause message. UI pagination is distinct from this complete metadata discovery.
- `view=pages&fileId=...` separately pages through up to 100 page-metadata records per response; these have `text: ""` and `contentLoaded: false`. Empty metadata text is not an extracted-text finding.
- `view=content&fileId=...&pageNumber=...` retrieves exactly one prepared page with its owner, project, file, source version/hash, current/historical flag, actual text and explicit extraction/review state. Its content is bounded to the existing 80,000-character page limit. Missing content fails visibly; it is not silently omitted.
- Mutation responses contain only changed summaries. The client serializes its metadata operations, merges contiguous revision deltas or performs a bounded paged refresh on a gap. Original TUS transfers remain concurrent. Production mutations use at most two changed file rows and one content page under a head-row CAS lock; they never send the complete inventory/text snapshot.
- Compact file metadata is bounded to 16 KiB; responses and mutation payloads to 512 KiB. SQL supplies formatting-overhead safety bounds (24 KiB canonical file JSONB and 640 KiB canonical mutation JSONB). A limit failure preserves prior records/content and identifies the failed operation. There is no aggregate serialized inventory ceiling.

Server-only helpers `getProjectFile` and `getProjectPage` retain owner/project checks for exact source access. Explicit controlled stores may implement legacy `get/save` for tests; the same pagination/summary response boundary still strips their text. Production uses normalized methods exclusively and rejects whole-inventory writes.

## Original transfers, versions and archives

Registration retains original filename, folder/archive path, SHA-256, size, version, predecessor identity and duplicate-content identity. New versions use unique object keys and never upsert originals. Duplicate bytes are flagged without deleting separate records. Replacing a current source makes its predecessor historical; it does not rewrite earlier estimate evidence or transfer preparation/review authority to the replacement.

The server signs one immutable original path. Direct native TUS transfer uses its narrow `x-signature` capability; app bearer credentials and service keys are not forwarded to Storage. POST creates the session, HEAD reads the confirmed offset, PATCH sends 6 MiB chunks, and the app retains the session URL. Authorized origin/path checks and rejected redirects prevent capability forwarding. Original bytes do not pass through estimate/generation requests.

A lost/failing transfer affects one file. After reload, reselect the same original because browser storage deliberately retains neither its bytes nor a persistent file handle. Retry resumes the storage-confirmed offset where that session remains valid. Expired sessions may need retransmission; provider-controlled expiry and crash/power-loss atomicity are not established by an observed HTTP interruption. Completion verifies retained size, SHA-256 and signature/type before uploaded state. Uploaded never implies prepared, analyzed or reviewed.

The installed SDK and [official resumable upload documentation](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) establish the configured provider protocol. The small native adapter is tested for this bounded subset; it is not a fully general TUS implementation. The normalized adapter uses ordered, inclusive bounded [range queries](https://supabase.com/docs/reference/javascript/range) and a [database RPC](https://supabase.com/docs/reference/javascript/rpc) for atomic mutations. No dependency was installed.

Intake limits remain explicit: 10,000 retained current/historical records, 25 GiB reserved originals per owner/project, 100 MiB per original, three transfer workers. Browser hashing uses one bounded full-file buffer per registration; the UI registers sequentially before bounded transfers.

Bulk selection and `webkitdirectory` folder intake have multiple-file/ZIP fallbacks. Safe ZIP import uses installed `fflate` metadata preflight and bounded streaming expansion: 2,000 entries, 256 MiB expanded, 100× ratio, 1 KiB compressed feeds. Absolute/parent/backslash/control/duplicate paths, unsupported methods, incomplete entries and expansion excess are rejected. No archive path is written to a filesystem or executed. Links are not followed, and nested archives are retained without recursive expansion. The archive and supported members are separate original records with their full paths; unsupported/empty entries remain explicitly not selected/uploaded.

PDF, JPEG, PNG, GIF, WebP, TXT, CSV, ZIP, DOCX, XLSX, DWG and DXF originals can be retained. Unknown/executable types are rejected before transfer. Magic bytes must agree for PDFs, common images and ZIP containers. Office/CAD content needs external conversion before preparation. ZIP members prepare independently; the archive container is not a reviewed document.

## Recoverable preparation and coverage

One file/page is prepared per API call; successful prior pages remain retained across failures/retries. A per-process decoder semaphore and production owner-wide database lease bound concurrent work. The two-minute lease outlasts the route's 60-second duration, but actual worker termination and cross-host recovery require hosted validation. CAS conflicts refresh/retry metadata without repeating completed original transfers.

PDF preparation supports 1,000 pages/file, 10,000 prepared page records/project and 16 MiB of extracted characters/project, stored as separate bounded page rows. Every prepared page has an exact result or visible failure. PDF.js uses installed local fonts, with no remote resources/models/OCR; each page's 80,000-character bound fails without truncation. Empty/scanned pages remain explicit visual-review inputs, not proof that OCR is mandatory or that text extraction reviewed the page.

UTF-8 TXT/CSV preparation is at most 8 MiB and 80,000 characters. JPEG/PNG processing validates up to 60 megapixels, retains originals and creates a JPEG copy up to 1,600 pixels on its long side. GIF/WebP preparation remains unsupported/fails visibly while originals remain accessible.

Library page `review: pending` describes preparation only. Separate source-version-bound AI analysis records identify what was analyzed, what failed or remains unreviewed, and which findings still need contractor decisions. Image processing copies do not mean 400 photos were reviewed; photo counts never become room counts or dimensions. Ready selected bid scope does not establish complete package review.

## Controlled local validation

`createProjectLibraryHandlers({store,auth})` supplies explicit synthetic dependencies to the isolated HTTP service. Production routes instantiate only `SupabaseProjectLibraryStore`. The real client, metadata handlers and TUS HTTP methods can exercise actual filesystem originals and normalized/lazy content with external transport blocked. Real-adapter query-shape tests verify bounded ordered queries, owner/project/file/page filters and changed-row RPC payloads against controlled database responses. Those tests do not execute SQL or validate hosted Auth, RLS, CORS, capacity or real-model interpretation.
