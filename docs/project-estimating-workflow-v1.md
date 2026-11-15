# Project intake, bounded painting bids and change drafts

This is a local implementation checkpoint. Hosted resources and access policies have not been changed. The application uses the real private-storage adapter and fails visibly until the separately reviewed setup in `project-library-v1.md` is authorized. The isolated test service is never selected by a production request or configuration fallback.

## Contractor workflow

In `/app`, choose or create a project. **Prepare a Bid** and **Create a Change Order** share its Project Files library. Switching these actions preserves their working forms; switching projects closes their unsaved workspace. Existing records, manual correction controls and the earlier generator remain accessible as secondary tools. New customer output uses the allowlisted renderer; all three known legacy customer-PDF controls are disabled with a specific explanation, and their shared handler blocks export before opening a popup.

Add bulk files, a folder where the browser supports it, or a bounded ZIP. Selection, confirmed upload, preparation and review are separate states. Retained originals use private storage, while estimate revisions, pricing profiles and customer/change snapshots remain owner-scoped browser-local records. After a reload, reselect the same original to resume an interrupted upload. Do not confuse this reselection requirement with loss of already retained originals.

### Prepare a Bid

1. Prepare the relevant library documents. All original records remain accessible; file/page failures and unreviewed content stay visible.
2. Enter and explicitly approve a versioned company pricing profile. A rule identifies surface, substrate, condition, coat count, unit and each direct-cost component. No default labor/material/other prices or substitute conditions are supplied. The existing Rate Card supplies captured commercial defaults; it is not reread to reprice a saved revision.
3. Review discovered locations and select the documents and locations to quote. The first automatic accuracy target is explicit printed painting schedules, not arbitrary drawing measurement.
4. Prepare the bid. Supported source text becomes quantities and matched cost rows without manual re-entry. Review quantities/evidence together, then separately approve the displayed matched costs. Missing information remains a decision. The existing item editor is the correction surface.
5. Save a new estimate revision. Review the customer details and terms, save/read back a separate customer snapshot, preview and export its actual local PDF.

An example of **synthetic source syntax**, not a captured model result or a measurement inferred from a drawing:

```text
Room: Room 101
Length: 12 ft
Width: 10 ft
Wall height: 8 ft
Wall finish: paint
Ceiling finish: paint
Substrate: drywall
Condition: repaint
Coats: 2
Openings area: 62 sqft
```

The supported wall equation is `2 × (12 + 10) × 8 − 62 = 290 sq ft`; ceiling area is `12 × 10 = 120 sq ft`. Explicit net wall/ceiling areas and paint-door counts are also supported. Missing openings deductions, ambiguous lower-wall extent, incompatible values, unsupported finishes and unmatched approved rates remain exceptions. No location or room count is inferred from a photograph count. OCR, handwriting, photo interpretation and scale-based drawing measurement are not implemented here.

Each prepared item retains exact original/version/hash/page/quotation, its equation and pricing-profile version/rule. Changed sources invalidate affected approval authority. Fresh owner/project inventory is verified before preparation, estimate/proposal saving and before/after PDF rendering; the secondary manual editor has the same project-source save/export gate. Failures require refreshing/replacing evidence, reconfirming the affected work and saving a new revision. Earlier revisions and customer snapshots are not rewritten. Identical preparation reopens its recorded draft instead of appending the same charges.

Readiness applies to the selected bounded scope. A fully priced selection does not establish complete review of the package. The library records preparation; the bid report separately identifies selected pages checked for supported schedule fields, pending pages and unreviewed photos. No model call or upload counter establishes substantive coverage.

### Create a Change Order

Paste a description or GC request and optionally reference already retained project files. Explicitly choose no agreed baseline, an unaccepted bid, or the exact revision the contractor identifies as agreed scope. The latest estimate is never automatically treated as accepted.

Explicit request quantities and exact approved profile matches populate reviewable rows. Additions, deductions, credits, already-included work and unclear responsibility stay distinct. Separate batch acknowledgments confirm supported classifications/quantities and costs. Changing a row clears its approvals. A description-only draft is usable without an agreement but clearly says the comparison is unverified.

Proposed adjustments do not update the original estimate, agreed total, approval, invoice or issuance state. The existing calculator computes additive and deductive groups, including its existing rounding; their difference is a proposed comparison. Historical contract unit selling prices are not reconstructed automatically. Additive, reviewed change snapshots can use the safe **PROPOSED CHANGE ORDER DRAFT** renderer. Unaccepted-bid, deductive and mixed customer exports are blocked with a specific limitation. Positive/negative internal drafts remain usable. No signature, sending or contract-management system was added.

The earlier provider-backed generator is still available under secondary tools and receives Change Order intent. Opening it does not call the provider. Its copied latest/original estimate is explicitly not established as agreed scope by this entry point; both existing-estimate and no-estimate paths warn that comparison is unverified. Its paid-provider behavior was source-traced, not executed during this task; its unsafe legacy customer PDF is unavailable.

## Offline validation and reproduction

Bulky originals, PDFs, screenshots, manifests and reports belong outside Git. `project-package-generate.py` refuses to overwrite a destination and needs the already installed Pillow, reportlab and pypdf. It generates 400 distinct full-resolution procedural construction scenes plus focused room schedules and dense drawings/specification/table/raster PDFs. These are authored synthetic images/documents, not customer data or captured AI outputs.

Example commands, using a new external directory and the installed Node/Python runtimes:

```sh
python3 tests/helpers/project-package-generate.py /private/tmp/jobestimate-full-workflow-NEW
node --import ./tests/helpers/offline-project-network-guard.mjs --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs tests/helpers/project-workflow-local.mjs /private/tmp/jobestimate-full-workflow-NEW 0
# Leave that local service running; in another terminal:
node --import ./tests/helpers/offline-project-network-guard.mjs --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs tests/helpers/project-package-bulk.mjs /private/tmp/jobestimate-full-workflow-NEW
```

The service binds loopback only, uses explicit synthetic owner dependencies and the production metadata handlers, persists actual metadata/originals/processing copies to disk, and implements controlled TUS HTTP semantics. The workload uses the real production client: POST/HEAD/PATCH, a deliberate interruption after a confirmed 6 MiB chunk, reselection/new client, exact-byte/hash verification, bounded concurrency, individual preparation, duplicate records, source revisions, foreign-owner rejection and invalid-path rejection. It does not replace transfers with resolved promises or fabricate completed estimate items. The browser harness likewise starts without completed estimate items and reads the retained prepared PDF text.

The native folder, ZIP and two-action component paths were exercised separately against the same type of real loopback service. The connected accuracy check produced 290/120 and 440/180 sq ft from two actual synthetic PDF pages, then used independently specified synthetic rates to produce $2,175 total, $544 included deposit and $1,631 remaining. Missing Room 103 scope stayed unresolved; a partial save could not produce a ready customer snapshot. An external source replacement blocked export without a manual refresh. A new reviewed source revision recovered readiness.

The final bulk observation uses 412 input files, 602,696,000 bytes, 400 JPEG scenes at 2048×1536 or 1536×2048, and 107 readable PDF pages. Those pages include 32 drawings with image references, 40 dense specification pages, 20 roster-table pages, four raster sheets and the 11 focused pages. One additional PDF is deliberately malformed. Supplemental resume, duplicate and text-version checks create 415 retained records / 629,241,279 bytes, including 402 image records. One malformed PDF preparation fails, one DWG is unsupported, and the old text version remains historical/pending. Image processing does not review the 402 images.

The workload writes actual elapsed times, sampled client/server RSS, CPU usage, confirmed bytes, request counts and states to its report. These loopback observations do not establish hosted network throughput, production capacity, real Auth, Linux/deployed packaging or model performance. Dense PDF text preparation is not visual scope interpretation.

## Remaining setup and limits

The private metadata schema/bucket, service-role configuration, Storage CORS/TUS behavior, actual RLS/Auth, provider plan limits and hosted capacity require separate authorization and validation. Per-owner plan-specific storage entitlements were not changed. Original limits and joint metadata/preparation budgets are explicit in `project-library-v1.md`; exceeding one fails visibly without silently declaring skipped content reviewed.

PDFs retain the existing installed-font character limits, no logo copying and 500-page failure bound. Unsupported characters fail visibly, with no partial output. Manually entered customer wording is not automatically redacted or checked for every commercial contradiction. Customer allowances do not change recorded arithmetic.

The normal TypeScript check still has the known entitlement-route TS2344 baseline failure, and `/app` retains existing lint findings. No unrelated entitlement/generated-type/TypeScript configuration is changed to suppress them. Production builds, real-project/model/Auth/mobile validation and hosted setup were not performed for this checkpoint.
