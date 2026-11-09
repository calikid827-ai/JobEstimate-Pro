# JobEstimate Pro — Handoff

Shared work file for any agent picking up work in this repo. Read it fully before starting. Dylan is the only merge point.

## Active checkpoint — 2026-11-09

The accepted Source-Linked Estimate Draft V1 implementation is committed as `49fb91bc49ea2267f4e22dfed57f586155ef2adc` (`Connect Plan Study to source-linked estimate drafts`), with direct parent `5768eccc54c8e6b4b78ad0e3c1cc2cfa6bf6df27`. This handoff accompanies the approved homepage/documentation checkpoint above that estimator commit; it does not predict its own future commit SHA.

| Item | Current checkpoint |
|---|---|
| Repository / branch | `calikid827-ai/JobEstimate-Pro` / `codex/owner-identity-preview` |
| Accepted estimator | Source-linked internal drafts reachable in `/app`; 13 implementation/test files, 2,223 insertions / 6 deletions in `49fb91b` |
| Homepage | User-approved navy/blue-and-white redesign; existing `/app` navigation retained; advanced connected plan-to-proposal capabilities explicitly labeled as in development |
| Additional commit authorized | `Refresh homepage and update estimating workflow handoff`; only `app/page.tsx` and `HANDOFF.md` |
| Publication | Not asserted here. A feature-branch push is authorized only after live ancestry checks and current authoritative configuration establish that it will not trigger an automatic deployment. Report the actual outcome in the closing session; do not amend this file after committing merely to record a push. |
| Main branches | Local main was `22a30b91c4152b953f6ada2a86ed56bf3ee37895`; live remote main was `1db694c87d252a3599be390ce07d1bbdfdfe09b3` at this checkpoint's preflight. Preserve both independently. |

**Current authorization takes precedence over historical instructions below.** Dylan explicitly authorized committing the previously protected homepage and handoff edits in this checkpoint. Earlier directions to leave those files unstaged/uncommitted are historical restrictions for earlier tasks, not a prohibition on this authorized two-file commit. No redesign, additional feature, customer-proposal phase, main-branch merge, deployment or deployment-setting change is authorized.

### Accepted internal draft workflow and boundaries

- Choose an existing job, create or reopen an internal draft, explicitly select Study findings and saved answers or enter contractor-written scope, confirm scope/quantity, separately approve direct costs, review deterministic pricing, and save a new browser revision. Existing Study viewing remains available without choosing a job or creating a draft; this milestone adds no job-management system.
- Retain exact finding, answer, citation, attempt and source-version/hash identities with the selected evidence. Imported findings begin unresolved; Study answers do not approve quantities or company costs. Contractor-written scope remains labeled as contractor input.
- Reopening retains historical calculations while the working copy checks source freshness. A changed selected answer can be explicitly replaced on the exact existing working item, preserving its identity and entered inputs while clearing both approvals and requiring confirmation again. Ordinary duplicate imports remain rejected. Earlier saved revisions remain unchanged.
- Saving is owner/job scoped, append-only through checked writes and readback, and requires browser Web Locks. Storage or locking failure is visible and leaves the working draft unsaved. Browser-local records are not cloud backup or a tamper-proof issued-document archive.
- These drafts do not enter legacy generated-result/history, customer PDF, approval-link, invoice or sending paths. This milestone does not fix the separate disclosure, stale-approval or other historical audit findings below. No automatic measured takeoff or AI repricing authority was added.

### Validation provenance and open limits

- **Accepted estimator results [PREVIOUSLY-RUN; not rerun for the homepage checkpoint]:** the original focused suite passed 76/76. The final acceptance correction's affected domain suite passed 23/23 in normal mode and the same 23/23 in installed Zod interpreter mode. Final actual-component browser acceptance passed 15/15 with synthetic dependencies and blocked transport, including evidence replacement, immutable historical revisions and both queued-save regressions. Its final guard record had zero CSP events, browser transport attempts, Node outgoing connections or browser errors.
- **Historical browser limitation:** the earlier broad no-guard-events assertion failed on a CSP event without source context. It remains unattributed retrospectively. A later instrumented diagnostic traced its own fresh event to the installed Zod `Function` capability probe; configuring the isolated harness's supported interpreter mode resolved that fresh harness violation without weakening CSP or transport protection. Do not relabel the earlier run as a complete pass.
- **Normal TypeScript [PREVIOUSLY-RUN]:** `tsc --noEmit --incremental false` failed with the known TS2344 diagnostic at `.next/dev/types/app/api/entitlement/route.ts:14`, involving the extra `handleEntitlementPost` export. The acceptance run reported no new implementation diagnostics. No entitlement route, generated types or TypeScript configuration was changed to suppress it. This is not a passing normal typecheck.
- **Workspace lint [PREVIOUSLY-RUN]:** `/app` retained the same 16 errors and 39 warnings as its baseline. Targeted non-page estimator lint passed. Do not describe whole-application lint as clean.
- **Homepage checks [EXECUTED for this checkpoint]:** installed ESLint initially found five unescaped JSX apostrophes. Escaping those text nodes preserved their visible wording; the final targeted homepage lint passed with zero errors/warnings, and the installed TypeScript TSX parser reported zero syntax diagnostics. Parsing is not a typecheck or build. The accepted estimator suite was not repeated for this homepage commit.
- Synthetic acceptance does not establish real-project, real-model, actual Auth, PDF, mobile-browser or production behavior. The historical T1 browser/PDF cases below remain open; internal-draft browser checks do not close them. No new hosted customer-data access, sign-in, provider calls, uploads, document preparation, allowance changes, SQL, dependency installation or builds are part of this checkpoint.

## Historical repository state when this handoff was written — 2026-10-26

| Item | Value |
|---|---|
| Repo | `/Users/dylansmith/scopeguard` (remote `origin` = `github.com/calikid827-ai/JobEstimate-Pro`) |
| Branch | `codex/owner-identity-preview` |
| HEAD | `4dbbc9a811467bc330179b9171b6788ad7f97b1e` ("Render Plan Study text with bundled PDF fonts", 2026-10-25) |
| Working tree | No tracked changes. Untracked: `AUDIT_REPORT.md`, `HANDOFF.md` |
| Written / updated | 2026-10-26 |
| Inputs | `AUDIT_REPORT.md` (read-only audit at the same HEAD) and direct reads of current source |

**Before starting any task:** verify the actual branch and HEAD against the applicable current task checkpoint, and record differences rather than restoring an older state. The table above is historical. Do not edit `AUDIT_REPORT.md`.

## Evidence labels

Keep these apart in every report back.

- **[SOURCE-CONFIRMED]** — re-read in the source at the HEAD above while writing or updating this handoff.
- **[PREVIOUSLY-RUN]** — a command result reported in `AUDIT_REPORT.md`: typecheck pass, 1,148/1,148 non-live tests, lint 223 errors / 1,633 warnings and the per-file counts, `npm audit` 19 vulnerabilities, the invoice-builder run, and local Node v25.9.0. Not re-run for this handoff.
- **[AUDIT-ONLY]** — a finding stated in `AUDIT_REPORT.md` that was not re-read for this handoff.
- **[UNVERIFIED-PRODUCTION]** — depends on the production database, Stripe, Vercel, real plan sets, or live model calls. Nobody has checked it.
- **[INFERRED]** — reasoning that has not been confirmed. Use it sparingly and say why.

## Global rules for every task

- Work only in the files the task allows. No refactors, renames, or "while I'm here" fixes.
- **HANDOFF.md:** any task may update its own row in the Status table and append one entry to the Log. Any other edit to this file needs Dylan to ask for it.
- No commits, pushes, branch changes, resets, stashes, amends, or `git add` unless Dylan asks in that moment.
- No deployments, migrations, SQL, or changes in Supabase, Stripe, or Vercel.
- No paid model calls. Tests use synthetic or locally generated fixtures and mocked clients. No production customer data.
- Do not invent prices, quantities, model outputs, or test results. If you didn't run it, it's unverified.
- The TypeScript check is always `npx tsc --noEmit --incremental false`. `tsconfig.json` sets `"incremental": true`, so a bare `tsc --noEmit` rewrites `tsconfig.tsbuildinfo`.
- Pass test files to the runner as explicit arguments. The audit's first test run executed 0 tests because zsh did not split a file list held in a variable.
- Leave the diff uncommitted and report:
  - files changed;
  - `git status --short`;
  - `git diff --stat`;
  - commands run, with exact results;
  - anything left unverified.
- Keep independent policies independent: markup, tax, deposit, rounding, minimums, profit targets, evidence authority.

---

## Status

These audit-task rows retain their historical task status and evidence; old publication statements describe those recorded checkpoints. Use the active checkpoint above and the closing session report for current authorization and publication state.

| Task | Title | Status |
|---|---|---|
| T1 | D-01: approval-signature validation and safe PDF image rendering | **Committed locally:** `3bd36cc36bb77dc3c72f93e2a7ac2389d568260a` (docs in `538b91c`). Decisions 1-3 accepted; independent source review found no blocking issues. **Browser/PDF cases still unverified.** First attempt: browser policy blocked localhost controls. Second attempt (2026-10-26): the Claude built-in browser pane blocked the app's PDF popup, including on Dylan's own click. A manual Chrome checklist is prepared; awaiting Dylan's observations. No push or deployment |
| T2a | D-02: debug-header containment | Ready to scope; one decision (4) |
| T2b | D-02: quota and replay guarantee | Blocked on verified RPC semantics (R1) and decision 5 |
| T3 | D-14: server-owned approval timestamps | Not started; decision 6 |
| T4 | D-03 + D-15: approval revisions and link lifecycle | Not started; needs schema (R1) and decision 7 |
| T5 | D-05: invoice line-item reconciliation | Not started; decision 8 (with T7) |
| T6a | D-06: contain unconfirmed plan-quantity influence on pricing | Not started; decisions 9-10 |
| T6b | Confirmed-quantity pricing authority (new capability) | Not started; needs a product decision (11). Starts only after T6a |
| T7 | D-04 (+ D-21): customer-document disclosure policy | Not started; needs Dylan's policy (8) |
| R1 | Production RLS / permissions / API exposure (catalog reads only) | Needs separate production authorization (12) |

---

## T1 — D-01: Approval-signature validation and safe PDF image rendering

T1 fixes the signature injection and the unescaped logo attribute in the PDF. Nothing else.

### Problem [SOURCE-CONFIRMED]

1. **Approve endpoint.** `app/api/approvals/[token]/approve/route.ts` ~132-141 accepts any non-empty string as `signatureDataUrl` and stores it **trimmed** (~133) in `proposal_approvals.signature_data_url` (~183-188).
2. **Status endpoint.** `app/api/approvals/status/route.ts` ~109 returns the stored value to the verified owner unchanged.
3. **Approval sync.** `app/app/page.tsx` ~6452-6455 copies the server string verbatim into the local saved estimate. If the server value is not a string, it keeps the local value.
4. **History load.** `page.tsx` ~7295 normalizes loaded history with `signatureDataUrl: value ? String(value) : undefined`.
5. **Signature in the PDF.** `downloadPDF()` (starts ~7536) reads `const approvedSignature = approval?.signatureDataUrl?.trim() || ""` (~7561). It writes that value **unescaped** at ~8398 (`<img src="${approvedSignature}" ...>`), inside the approved branch of the Customer Approval block, via `win.document.write` (~7974) on `window.open("", ...)` (~7573).
   - That popup shares the app's origin.
   - The Supabase session is stored in localStorage (`app/app/lib/owner-session.ts` ~288, ~294).
6. **Logo in the PDF.** The same function writes `companyLogo` (`companyProfile.logo || ""`, ~7549) unescaped at ~8228.
   - The logo comes from `<input type="file" accept="image/*">` (~14283), read with `readAsDataURL` (~14295).
   - There is no type or size check.
7. **Existing escaper.** An `esc()` helper already exists inside `downloadPDF()` (~7580), but neither attribute uses it.
8. **Legitimate signatures.** They come from `react-signature-canvas` on a 640×180 canvas (`app/approve/[id]/page.tsx` ~355-366) via `getTrimmedCanvas().toDataURL("image/png")` (~165-167). A legitimate signature is always a PNG data URL with no surrounding whitespace.

**Not affected:**
- `downloadInvoicePDF()` (~8459) has no `<img>`.
- React JSX `<img src={...}>` on the public approve page (~316) and in the logo preview (~14301) is attribute-escaped by React.
- The status, sync, and history-load code above is the only path a stored signature takes on the owner side. `downloadPDF()` is the only HTML sink.

### Signature state model (one definition for every stage)

A stored signature value is in exactly one state. One pure classifier decides it.

| State | Stored value | PDF for an **approved** estimate |
|---|---|---|
| `valid` | A string that passes `isSafePngSignatureDataUrl` **exactly as stored**, with no trimming or normalizing. | The existing "Customer Signature" label and an `<img>` whose attributes are escaped. |
| `unreadable` | Any other present value: <br>• a string that isn't blank but fails validation (malicious markup, a non-PNG image, surrounding whitespace, bad base64, over a cap); <br>• any non-string value other than `null` / `undefined`. | The "Customer Signature" label plus static text `SIGNATURE_UNREADABLE_TEXT` (proposed: "Signature on file could not be displayed"). No `<img>`. The stored value never appears in the output. |
| `absent` | `undefined`, `null`, or a string that is empty after trimming. | The existing blank signature/date lines (`approvalGrid`), exactly as today. |

For a **pending** (not approved) estimate, nothing changes: the PDF shows blank lines and the signature value is ignored. "Approved by" / "Approved on" output is unchanged in every state.

### End-to-end handling

| Stage | Location | T1 change | Reason |
|---|---|---|---|
| Write | `approve/route.ts` | Validate the raw body value. Reject anything not `valid` with 400 before any DB call. | Stops new bad values at the source. |
| Server read | `status/route.ts` ~109 | **None.** It still returns the stored value as-is. | Filtering here would turn `unreadable` into `absent` before the client sees it. Carrying a separate state would need new response, type, and persistence fields, which is outside T1. The response goes only to the verified owner and is handled as inert data. |
| Sync | `page.tsx` ~6452-6455 | Replace the inline expression with `pickSyncedSignatureDataUrl(serverValue, localValue)`. **Behavior identical** to today: a server string wins verbatim, otherwise the local value is kept. | Lets the post-sync behavior be tested against the real rule without changing it. |
| Persistence | localStorage; load normalization ~7295 | **None.** | No migration, trimming, or deletion. The raw value survives as a string. |
| Render | `page.tsx` ~7561 and ~8390-8416 | `approvedSignature` keeps the raw stored value: drop `.trim()` and `\|\| ""`, and type it as `unknown` or `string \| undefined`. The inner signature ternary is replaced by `renderCustomerSignatureBlockHtml(classifyStoredSignature(approvedSignature))`. | Validation must see exactly what was stored. The three-way choice lives in one tested function. |

**Consistency rules:**
- T1 never rewrites, trims, or deletes a stored signature.
- Because the raw value survives write → status → sync → persistence, the renderer can always tell `unreadable` apart from `absent`.
- A signature becomes HTML only inside the extracted renderer, and only in the `valid` state.

**Known, documented consequences:**
- Today's sync rule is "server string wins". So an `unreadable` server value replaces a `valid` local copy. T1 keeps that rule, and a test pins it.
- A stored value with leading or trailing whitespace used to be trimmed and displayed. It now classifies as `unreadable`. Values the current server stored were already trimmed (~133), and canvas output has no whitespace, so legitimate data is unaffected. [INFERRED: no legitimate whitespace-wrapped signatures exist in the field.]
- An already-approved link that receives a non-`valid` signature now gets 400 instead of the idempotent 200. The real approve page always sends a canvas PNG.

### Parameters — accepted 2026-10-26 (decisions 1-3)

The structural rules are settled: exact prefix, strict base64, size checked before decoding, magic bytes, the `IHDR` check. **The values below were proposed and Dylan accepted them for T1 on 2026-10-26.** They are named exported constants in one place, so a later change touches only the constants and their matching fixtures.

| Constant (proposed) | Proposed value |
|---|---|
| `SIGNATURE_MAX_ENCODED_CHARS` | 400,000 |
| `SIGNATURE_MIN_DECODED_BYTES` / `SIGNATURE_MAX_DECODED_BYTES` | 67 / 300,000 |
| `SIGNATURE_MAX_DIMENSION_PX` | 4,000 (each side) |
| `LOGO_ALLOWED_MIME_TYPES` | `image/png`, `image/jpeg`, `image/gif`, `image/webp` |
| `LOGO_MAX_ENCODED_CHARS` / `LOGO_MAX_DECODED_BYTES` | 4,000,000 / 3,000,000 |
| `SIGNATURE_UNREADABLE_TEXT` | "Signature on file could not be displayed" |

### Allowed files

**Existing files:**
- `app/api/approvals/[token]/approve/route.ts`: validation only, around ~132-141.
- `app/app/page.tsx`: only these five spots. Status-route and history-normalization (~7295) code stays untouched.
  1. import lines;
  2. the sync expression (~6452-6455);
  3. the `approvedSignature` assignment (~7561), which may now keep the raw string;
  4. the logo `<img>` (~8226-8230);
  5. the inner signature ternary in the approved branch (~8390-8416).
- `app/api/approvals/approvalWorkflow.test.ts`:
  - Add tests.
  - Replace the request-body placeholders `"data:image/png;base64,new"` (~276) and `"data:image/png;base64,abc"` (~352) with the real PNG fixture. Strict validation rejects the placeholders.
  - The mocked stored rows at ~263 and ~327 may stay.
  - Don't change what existing tests assert.
- `HANDOFF.md`: the T1 Status row and one Log entry.

**New files (proposed names):**
- `app/lib/safe-image-data-url.ts`: shared and isomorphic, with no Node-only APIs. Uses `atob`, which is global in browsers and Node ≥ 16. Exports the constants above plus `escapeHtmlAttribute`, `isSafePngSignatureDataUrl`, `isSafeLogoDataUrl`, and `safePdfImgTag`.
- `app/lib/safe-image-data-url.test.ts`
- `app/app/lib/approval-signature.ts`: pure client helpers with no DOM or `window`. Exports `classifyStoredSignature`, `renderCustomerSignatureBlockHtml`, `pickSyncedSignatureDataUrl`, and `SIGNATURE_UNREADABLE_TEXT`.
- `app/app/lib/approval-signature.test.ts`
- `tests/fixtures/images/tiny-images.ts`: real tiny image fixtures, described under Tests.

### Helper spec

**`escapeHtmlAttribute(value: string): string`** escapes `&`, `<`, `>`, `"`, and `'`, the same as the existing `esc()`.

**Shared strict data-URL rules.** Every check is linear in the input; no backtracking-heavy regex.
1. The value is a string, compared exactly. Leading or trailing whitespace means reject, never normalize.
2. The prefix is an exact lowercase `data:<mime>;base64,`, with no extra parameters.
3. Check the encoded length cap before any regex or decoding.
4. The payload:
   - is non-empty;
   - uses only `A-Z a-z 0-9 + /`;
   - has a length divisible by 4;
   - has at most two `=`, only at the end.
5. Decoded size = `payload.length / 4 * 3 - paddingCount`. Check it against the cap without decoding the whole payload.
6. For the header checks, decode only the first 32 base64 characters (24 bytes) with `atob`.

**`isSafePngSignatureDataUrl(value: unknown): boolean`**
- `mime` is `image/png`.
- Encoded length and decoded size are within the signature constants.
- Bytes 0-7 = `89 50 4E 47 0D 0A 1A 0A`, and bytes 12-15 = `49 48 44 52` (`IHDR`).
- The IHDR width (bytes 16-19) and height (bytes 20-23), read big-endian, are each between 1 and `SIGNATURE_MAX_DIMENSION_PX`.

**`isSafeLogoDataUrl(value: unknown): boolean`**
- `mime` is in `LOGO_ALLOWED_MIME_TYPES`, and the sizes are within the logo constants.
- The magic bytes match the declared type:
  - PNG: as above;
  - JPEG: `FF D8 FF`;
  - GIF: `47 49 46 38`;
  - WebP: `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`.
- Anything else returns false.

**`safePdfImgTag(src: unknown, kind: "signature" | "logo", attrs: { alt?: string; style?: string }): string`**
- Returns `""` unless `src` passes the check for `kind`.
- Otherwise returns `<img>` with every attribute value passed through `escapeHtmlAttribute`.

**`classifyStoredSignature(value: unknown)`** returns one of:
- `{ kind: "valid"; src: string }`
- `{ kind: "unreadable" }`
- `{ kind: "absent" }`

It follows the state table exactly and uses `isSafePngSignatureDataUrl` on the untrimmed value.

**`renderCustomerSignatureBlockHtml(state)`** returns only the fragment that today sits inside the approved branch's signature ternary:
- `valid`: today's label `<div>` plus `<img>`, with `src`, `alt` ("Customer signature") and `style` (today's value) escaped.
- `unreadable`: today's label `<div>` plus a static `<div>` containing `SIGNATURE_UNREADABLE_TEXT`.
- `absent`: today's `approvalGrid` markup, copied verbatim.

It never includes the input value outside the `valid` state.

**`pickSyncedSignatureDataUrl(serverValue: unknown, localValue: string | undefined): string | undefined`** returns `typeof serverValue === "string" ? serverValue : localValue`. That is today's inline rule, unchanged.

**Logo in `downloadPDF()`:** replace the ~8228 interpolation with `safePdfImgTag(companyLogo, "logo", { style: "max-height:42px; margin-bottom:6px;" })`.
- An invalid or unsupported logo renders nothing.
- No notice; the company name still renders.
- The stored logo and the in-app preview are untouched.

### Tests (no network, mocked dependencies)

**Fixtures.** `tests/fixtures/images/tiny-images.ts` exports base64 payloads and full data URLs for **real, complete, decodable 1×1 files**: PNG, JPEG, GIF, and WebP.
- Not header stubs. Produce them once with a standard encoder and paste them as constants; nothing is fetched at test time.
- A fixture-integrity test (in `safe-image-data-url.test.ts`):
  - decodes each one with `loadImage` from `@napi-rs/canvas` (already a dependency, used by `app/lib/plan-study/pdf.ts`) and asserts 1×1 dimensions;
  - checks that the bytes match the declared MIME.
- If a format will not decode in this environment, stop and report it. Don't substitute a stub.
- Synthetic strings are allowed only for negative cases and size-bound cases, and test names must say "synthetic".

**`app/lib/safe-image-data-url.test.ts`:**
- **Positive compatibility (real fixtures only):**
  - PNG passes the signature check;
  - PNG, JPEG, GIF, and WebP each pass the logo check.
- **Signature bounds (synthetic):**
  - a valid-header payload just under the decoded cap passes;
  - just over the encoded cap fails without decoding;
  - just over the decoded cap fails.
- **Signature rejections:**
  - `""` and non-strings;
  - `javascript:alert(1)`;
  - an empty payload;
  - `x" onerror="alert(1)`;
  - the real PNG + `" onerror="alert(1)`;
  - the real JPEG (wrong type for signatures);
  - `data:image/svg+xml;base64,...`;
  - an uppercase prefix;
  - a `;charset=utf-8` parameter;
  - the real PNG with leading or trailing whitespace;
  - an embedded newline;
  - URL-safe `-` / `_`;
  - illegal characters;
  - bad lengths (`base64,abc`, `base64,new`);
  - `=` in the middle of the payload;
  - non-PNG bytes behind a PNG prefix;
  - a PNG signature with no `IHDR`;
  - an IHDR width or height of 0 or above the cap.
- **Logo rejections:**
  - SVG;
  - a PNG prefix with JPEG bytes;
  - over the caps;
  - quote injection;
  - `https://...`.
- **`safePdfImgTag` and `escapeHtmlAttribute`:**
  - invalid input gives `""`;
  - `alt` / `style` values containing `"`, `<`, `&` come out escaped;
  - a valid `src` appears exactly once, unchanged.

**`app/app/lib/approval-signature.test.ts`:**
- **Valid:** the real PNG gives `valid`. The HTML has exactly one `<img`, `src` equals the fixture exactly, the label is present, and there is no notice.
- **Invalid but present.** Each of these gives `unreadable`:
  - `x" onerror="alert(1)`;
  - `javascript:alert(1)`;
  - the real PNG + `" onerror="alert(1)`;
  - the real JPEG data URL;
  - the real PNG with a leading space;
  - the real PNG with a trailing newline;
  - an SVG data URL;
  - `{}`, `123`, and `"[object Object]"`.

  For each, the HTML contains the notice and contains no `<img`, no `onerror`, no `javascript:`, and no substring of the input.
- **Absent:** `undefined`, `null`, `""`, and `"   "` each give `absent`. The HTML equals today's `approvalGrid` fragment, compared against a constant copied from current `page.tsx` after whitespace normalization.
- **`pickSyncedSignatureDataUrl`:**
  - a server string (valid, invalid, or `""`) wins verbatim;
  - a server `null`, `undefined`, or number keeps the local value.
- **Post-sync (pure).** For each server × local pair, `classifyStoredSignature(JSON.parse(JSON.stringify({ v: pickSyncedSignatureDataUrl(server, local) })).v)` must give the expected state. The JSON round-trip stands in for localStorage.

  | Server value | Local value | Expected state |
  |---|---|---|
  | invalid | valid | `unreadable` |
  | valid | (any) | `valid` |
  | `null` | valid | `valid` |
  | `null` | none | `absent` |
  | `""` | (any) | `absent` |

**`app/api/approvals/approvalWorkflow.test.ts`**, using the existing `makeSupabaseMock` plus the synthetic owner auth adapter pattern (~172):
- **Approve rejects with 400 and `calls.length === 0`:**
  - the malicious string;
  - an oversized synthetic value;
  - the real JPEG;
  - the whitespace-wrapped real PNG.
- **Real PNG:** existing success behavior is unchanged, and existing tests pass after the fixture swap.
- **Status passthrough (pins that T1 does not filter):**
  - an approved proposal whose stored `signature_data_url` is invalid returns that exact string;
  - a `null` stored value returns `null`.
- **Post-sync end to end:**
  1. Take `approvals[0].signature_data_url` from the status response.
  2. Pass it through `pickSyncedSignatureDataUrl`, then a JSON round-trip, then `classifyStoredSignature`.
  3. Expect `unreadable`, and renderer output with no `<img`.
  4. Repeat with the real PNG stored, and expect `valid`.

**Not unit-tested:** the five `page.tsx` call sites. Each becomes a one-line call into a tested helper. Check them in the diff and say so in the report.

### Commands to run and report

Run `shasum` before and after; the two outputs must match.

```bash
shasum tsconfig.tsbuildinfo
```

```bash
npm run test:estimator -- app/lib/safe-image-data-url.test.ts app/app/lib/approval-signature.test.ts app/api/approvals/approvalWorkflow.test.ts
```

```bash
npx tsc --noEmit --incremental false
```

```bash
npx eslint app/lib/safe-image-data-url.ts app/lib/safe-image-data-url.test.ts app/app/lib/approval-signature.ts app/app/lib/approval-signature.test.ts tests/fixtures/images/tiny-images.ts "app/api/approvals/[token]/approve/route.ts" app/api/approvals/approvalWorkflow.test.ts app/app/page.tsx
```

```bash
shasum tsconfig.tsbuildinfo
```

```bash
git status --short
```

```bash
git diff --stat
```

```bash
grep -n 'src="\${' app/app/page.tsx
```

**Lint baseline for existing touched files [PREVIOUSLY-RUN]:**
- `approve/route.ts`: 3 errors (`no-explicit-any` at lines 24, 56, 57).
- `approvalWorkflow.test.ts`: 6 errors (`no-explicit-any`).
- `page.tsx`: 16 errors, 39 warnings.

Report any finding beyond that baseline. If time allows, also run the full non-live suite and report its counts separately.

### Acceptance criteria

1. **Approve endpoint:** anything not `valid` gets 400 before any DB call. A valid PNG behaves exactly as before.
2. **Unchanged paths:** the status response, the sync result for every input, and persisted data are unchanged. No stored signature is rewritten, trimmed, or deleted.
3. **Approved PDFs:**
   - `valid` → image;
   - `unreadable` → label plus notice, with no image and no trace of the stored value;
   - `absent` → today's blank lines.

   Pending PDFs are unchanged.
4. **No unsafe interpolation:** `downloadPDF()` never puts an unvalidated or unescaped value into an `<img>` attribute, and the `grep` above returns nothing.
5. **Logos and signatures:** logos of the allowed types still appear, other logos are omitted with no notice, and legitimate canvas signatures still appear.
6. **Everything else for valid data is unchanged:** approval status, approver name and time, pricing, tax, deposit, and totals.
7. **Checks:**
   - Only the allowed files changed.
   - Focused tests pass, including the fixture-integrity test.
   - TypeScript passes, and `tsconfig.tsbuildinfo` is unchanged.
   - New files are lint-clean, and existing touched files show nothing beyond the baseline.
8. **Report and review:** the report lists the proposed parameters as pending. The diff is **left uncommitted**, with new files untracked (`??`) and not `git add`ed.

### Out of scope for T1

- Status-route filtering or a new `signature_state` response field. That would be possible later hardening, but it needs response, type, and persistence changes.
- Any stored-data migration.
- Pricing, tax, deposit.
- Approval timestamps (T3).
- Link expiration/revocation and proposal reuse (T4).
- Quotas and `x-debug` (T2a/T2b).
- Dependency upgrades and CSP/security headers.
- Document disclosure policy (T7).
- The invoice PDF.
- Any broader PDF refactor or extraction beyond the signature-block helper.

---

## T2a — D-02: Debug-header containment (not blocked)

**Problem [SOURCE-CONFIRMED].** `wantsDebug(req)` checks only for the header (`app/api/generate/route.ts` ~3917-3919). When it's true:
- the cached-result read is skipped (~6950);
- the cached-result write is skipped (~8566);
- debug-only fields are added to the payload (~8507-8508, ~8555).

Any signed-in owner can set the header.

**Scope.** `wantsDebug` in `route.ts`, plus one new test file, `app/api/generate/route-debug-containment.test.ts`. Follow the existing route-test harness in `route-document-purpose.test.ts`: synthetic env values, stubbed `fetch`, no model calls.
- Honor the header only when `NODE_ENV !== "production"`, unless decision 4 adds an explicit allowlist.
- When the header isn't honored, cache read, cache write, and payload behave exactly as if it were absent.

**Tests:**
- `NODE_ENV=production` + `x-debug: 1` + a cached result for the key → the cached result is returned, no model call happens, and there are no debug fields.
- Outside production, current behavior is unchanged.

**Claim limit.** T2a removes the known trigger. It does **not** prove the quota and replay guarantee; that's T2b.

## T2b — D-02: Quota and replay guarantee (blocked)

**Goal.** One idempotency key leads to at most one quota consumption and at most one fresh generation. Replays return the stored result, and concurrent duplicates cannot both generate.

**Facts [SOURCE-CONFIRMED]:**
- The cache read (~6950) happens **before** the RPC (~7053).
- The cache write (~8566) happens only after success.
- There is no in-progress marker, so two concurrent requests with the same key can both pass the cache check.
- The real client sends a fresh `crypto.randomUUID()` on each generate (`page.tsx` ~5003).

[UNVERIFIED-PRODUCTION] Whether the second request also passes `consume_free_generation` depends on the RPC.

**Prerequisites:**
- The real RPC definition, obtained read-only via R1. The repo has only the intended contract (`SUPABASE_PRODUCTION_CHECKLIST.md` ~116-119).
- Verified atomicity, Pro handling, and refund behavior.

A durable claim (for example, an "in progress" `generation_results` row written before generation) would be a schema change and needs Dylan's approval (decision 5).

**Out of scope:** T2a, rate limiting (D-19), model timeouts (D-12), editing the RPC without approval.

## T3 — D-14: Server-owned approval timestamps

**Problem [SOURCE-CONFIRMED].** `approve/route.ts` ~134-137 stores the request body's `approvedAt` whenever it parses as a date. The public page sends one (`app/approve/[id]/page.tsx` ~179).

**Scope.** `approve/route.ts` and `approvalWorkflow.test.ts`.
- Always store server time.
- Keeping the client's value would need a new column, which is a migration (decision 6; default: drop it).

**Tests:**
- Backdated and future client values are ignored.
- The idempotent re-approval path still returns the stored time.

Don't touch signature validation (T1) or link rules (T4).

## T4 — D-03 + D-15: Approval revisions and link lifecycle

**Problem:**
- [SOURCE-CONFIRMED] `findReusableProposal` (`app/api/approvals/route.ts` ~126-142) reuses a `pending` **or `approved`** proposal for the same local estimate.
- `estimate_snapshot` is written only on insert (~177).
- The client edits pricing and tax in place on the same history id (`page.tsx` ~4797, ~4843).
- [AUDIT-ONLY] Links get no `expires_at`, and older links are never revoked.

**Rules**, after decision 7:
- An **approved** snapshot, its signature, and its approval invoice are never modified. Re-sharing an approved estimate whose customer-visible content changed creates a new linked revision. The original stays viewable.
- Re-sharing a **pending** proposal with changed content either updates its snapshot or creates a revision (decision 7). Either way, it revokes earlier active links for that proposal.
- New links expire. Expired and revoked links return a clear "no longer active" response.

**Prerequisite:** the production schema and constraints for `estimate_proposals` and `approval_links` (R1). A revision-link column would be a migration.

## T5 — D-05: Invoice line-item reconciliation

**Problem:**
- [SOURCE-CONFIRMED] In `app/app/lib/invoices.ts` ~124-130, full invoices list raw labor / materials / other plus tax. But `subtotal` is the marked-up base (~138-141), and `total` is marked-up base plus tax.
- Deposit and balance invoices use a single line equal to the total, so they already reconcile (~116-123).
- [PREVIOUSLY-RUN] For 1000 / 500 / 250 at 20% markup and 8% tax: items $1,918, subtotal $2,100, total $2,268.
- The same builder creates the approval invoice (`approve/route.ts` ~82-86).

**Scope.** `invoices.ts` and `invoices.test.ts` only.
- Full-invoice items plus tax must equal `total`.
- Preserve the markup, tax, deposit, balance, and whole-dollar rounding behavior.
- Don't change how `estimateTotal`, `subtotal`, `depositDue`, or `remainingBalance` are computed.

**Tests:**
- markup > 0, with and without tax;
- a rounding-remainder case;
- deposit and balance invoices unchanged.

## T6a — D-06: Contain unconfirmed plan-quantity influence on pricing

**Goal.** No plan-derived number changes engine inputs or deterministic pricing unless it is confirmed. There is no confirmation mechanism yet (that's T6b), so containment means plan-derived quantities stay review-only. This task grants no new pricing authority.

This follows the documented rule that plan and photo signals "remain non-pricing-authoritative unless a later task explicitly scopes authority and verification" (`ROADMAP.md:49`).

**Paths to contain:**
- **[AUDIT-ONLY] Vision tagging.** Vision findings merge into analyses without a source marker. A `wall_area` sqft finding becomes `exactQuantity: true` (`tradeQuantitySupport.ts` ~804-863) and is accepted by category alone (`liveTradePricingInfluence.ts` ~209-225).
- **[SOURCE-CONFIRMED] Single-trade path.** `buildLiveTradePricingInfluence` at `route.ts` ~7401, consumed through `canAffectNumericPricing` / `engineInputs` (~7431-7460).
- **[SOURCE-CONFIRMED] Multi-trade path.** `computeMultiTradeDeterministic` calls the same influence builder (~6547-6557). It passes `measurements: null` whenever a plan is attached (~6543-6546), so plan signals displace contractor-entered measurements on that path.
- **[SOURCE-CONFIRMED] Not a path.** `quantityInputs` (~7202-7206) does not read plan data.
- **[AUDIT-ONLY] AI prompt.** The prompt includes plan summary, rooms, and trades (~7304-7365). How to handle it is decision 10.

**Scope:**
- Tag plan findings with their source (`vision`, `text`, `table`, or `takeoff`).
- Prevent unconfirmed plan-derived numbers from setting `exactQuantity` / `canAffectNumericPricing` / engine inputs on **both** paths.
- Restore contractor-entered measurements where a plan currently displaces them.
- Keep plan quantities visible as review readbacks.

**Tests (synthetic findings):**
- An unconfirmed vision sqft gives the same engine inputs and pricing as the same request without plans.
- With contractor measurements plus a plan attached, the contractor measurements are used.
- Readbacks still list the plan quantities.

**Expected effect.**
- Some plan-attached estimates will price differently.
- Existing tests that encode plan-aware numeric pricing (for example, `liveTradePricingInfluence.test.ts`, `livePricingSeam.test.ts`, `tradePlanAwarePipeline.test.ts`) will need updates.
- List every changed assertion in the report.

## T6b — Confirmed-quantity pricing authority (new capability)

Starts only after T6a lands, and only with an explicit product decision (11), per `ROADMAP.md:49`. Topics to scope:
- A generate-request field for contractor-confirmed quantities, carrying provenance (document, page, evidence reference) and confirmation time.
- The confirmation UI.
- Which engines accept confirmed quantities, and how.
- How confirmed quantities appear in saved estimates and customer documents.
- Tests.

Nothing in T6a may pre-build this authority.

## T7 — D-04 (+ D-21): Customer-document disclosure policy

**Problem [AUDIT-ONLY]:**
- The "Customer document" PDF always prints labor, materials, other/mobilization, markup %, and section/burden rows.
- When plan data exists, it also prints the internal "Estimator Plan Review".
- The public approval JSON returns the cost breakdown.

**Step 1: policy (decision 8).** Decide what a customer sees by default. A starting point for discussion: scope, assumptions/exclusions, schedule, total, tax, deposit; no breakdown, no markup, no internal review language. Also decide whether a contractor can opt in to a breakdown per document.

**Step 2: implementation.**
- Apply the policy to the customer PDF, the public approval JSON, and invoices (with T5).
- Tests on the generated HTML and JSON.
- Keep it separate from pricing math.

---

## R1 — Production RLS, permissions, and API exposure (catalog reads only)

**Not done. No SQL was run or applied while writing this handoff.**

**Authorization.** R1 needs its own explicit production authorization from Dylan, given in the session that runs it. Production access granted for R1 does not carry over to any other task. Without that authorization, R1 does not start.

**Allowed — catalog and function-definition reads only:**
- RLS flags: `pg_class.relrowsecurity` and `relforcerowsecurity`.
- Policies: `pg_policies`.
- Grants: `information_schema.role_table_grants`, `role_routine_grants`, and the `has_table_privilege` / `has_function_privilege` functions, for `anon`, `authenticated`, and `service_role`.
- Function definitions: `pg_proc` with `pg_get_functiondef`, for `consume_free_generation` and the other RPCs.
- Constraints and indexes: `pg_constraint`, `pg_indexes`.
- Table and column shapes: `information_schema.columns`.
- Storage bucket configuration: `storage.buckets` (public flag only).
- Read-only viewing of the PostgREST exposed-schema setting.

**Not allowed:**
- Any `SELECT` or `COUNT` against application tables, `auth.*` user rows, or `storage.objects`.
- Any REST/PostgREST/RPC request using anon, publishable, or service keys against data.
- `SET ROLE` / impersonation queries.
- Executing any RPC, including `consume_free_generation`.
- Any `INSERT`, `UPDATE`, `DELETE`, DDL, `GRANT`, or `REVOKE`.

**Report:**
1. RLS enabled/forced status, policies, and grants for these tables: `entitlements`, `usage_events`, `estimate_proposals`, `approval_links`, `proposal_approvals`, `approval_invoices`, `generation_results`, `stripe_webhook_events`, `approval_owner_sync_tokens`, and the Plan Study tables.
2. Which of those tables the grants and policies make reachable through the public anon/publishable key. Determine this from the catalog, not by probing.
3. The RPC definitions and `EXECUTE` grants (this unblocks T2b).
4. The unique constraints the code relies on, and the `estimate_proposals` / `approval_links` schema (this unblocks T4).
5. Whether `database/owner-access-permissions.sql` (header: "Not applied") matches what is live.

If the catalog shows anything readable or writable with the public key, stop and tell Dylan before doing anything else. Fixes are a separate, approved task.

---

## Unresolved decisions (for Dylan)

1. **T1 logo formats — RESOLVED 2026-10-26 (accepted):** PNG/JPEG/GIF/WebP only. Logos in other formats (SVG, AVIF, BMP, ICO, HEIC) are left off the PDF until re-uploaded in an allowed format.
2. **T1 size caps — RESOLVED 2026-10-26 (accepted):**
   - signature ≤ 400,000 encoded chars, 67–300,000 decoded bytes, ≤ 4,000 px per side;
   - logo ≤ 4,000,000 chars and 3,000,000 bytes.

   Larger existing logos are left off the PDF.
3. **T1 notice wording — RESOLVED 2026-10-26 (accepted):** "Signature on file could not be displayed."
4. **T2a:** honor `x-debug` only outside production (default), or also for an explicit production allowlist (whose)?
5. **T2b:** after R1 shows the RPC, is a durable claim/in-progress schema change acceptable?
6. **T3:** drop the client approval time (default), or keep it in a new column (migration)?
7. **T4:** for pending proposals, update in place or create a revision? Link expiry length? Does "changed" mean the whole snapshot or only customer-visible fields?
8. **T5 / T7:** marked-up per-category invoice lines or one contract line, and the overall customer disclosure policy.
9. **T6a:** contain all plan-derived numbers (default, per `ROADMAP.md:49`) or vision only? Accept that plan-attached estimates will reprice?
10. **T6a:** leave plan quantities in the AI prompt as-is, label them "unconfirmed", or strip the numbers?
11. **T6b:** build confirmed-quantity pricing authority at all, and with what provenance and UI requirements?
12. **R1:** who grants production authorization, and when.

## Log

- 2026-10-26: `HANDOFF.md` created from `AUDIT_REPORT.md` and source reads at `4dbbc9a811467bc330179b9171b6788ad7f97b1e`.
- 2026-10-26: Revised at the same HEAD. Evidence labels split; status-route guard added to T1; signature render cases clarified; lint baseline recorded; `ROADMAP.md:49` cited for T6; an unsupported T7 reference removed.
- 2026-10-26: Revised at the same HEAD, at Dylan's request.
  - **T1:**
    - One signature state model (`valid` / `unreadable` / `absent`) now applies to every stage.
    - The status route and persistence stay unchanged, so an unreadable signature is never collapsed into an absent one.
    - The sync rule is extracted with identical behavior.
    - `approvedSignature` keeps the raw string.
    - A pure signature-block classifier and renderer is specified, with valid / invalid-present / absent / post-sync tests.
    - Positive logo tests use real tiny image fixtures with a decode check.
    - Logo formats, caps, and notice wording are marked as proposed.
  - **T2** split into T2a (debug containment) and T2b (quota/replay guarantee).
  - **T6** split into T6a (containment) and T6b (new authority). T6a now names both live pricing paths and the measurement displacement.
  - **HANDOFF.md** status/log updates are explicitly allowed.
  - **R1** limited to catalog and function-definition reads under separate authorization.

  No application code, tests, `AUDIT_REPORT.md`, Git state, SQL, or external services changed.
- 2026-10-26: **T1 implemented and left uncommitted for review.** Same branch and HEAD (`4dbbc9a811467bc330179b9171b6788ad7f97b1e`).
  - **Changed:** `app/api/approvals/[token]/approve/route.ts` (signature validation only); `app/app/page.tsx` (imports, sync helper call, raw `approvedSignature`, logo tag, signature block); `app/api/approvals/approvalWorkflow.test.ts` (fixture swap and new tests); this file (T1 status row and this entry).
  - **New:** `app/lib/safe-image-data-url.ts` and its test; `app/app/lib/approval-signature.ts` and its test; `tests/fixtures/images/tiny-images.ts` (real 1×1 PNG, JPEG, GIF, WebP generated with `@napi-rs/canvas` 1.0.13 and decode-verified).
  - **Not changed:** the status route and history normalization, as planned.
  - **Results:**
    - Focused tests: 26/26 pass.
    - Full non-live suite: 1,169/1,169 pass across 86 files, with 0 outbound connections. The two `*.live.test.ts` files were skipped.
    - `npx tsc --noEmit --incremental false`: exit 0.
    - `tsconfig.tsbuildinfo`: checksum unchanged.
    - Lint on touched files: the same 64 pre-existing findings as before (25 errors, 39 warnings, matched by file, rule, and message), and 0 in new files.
    - No `src="${` remains in `page.tsx`.
  - **Proposed parameters in use:** decisions 1-3 are still pending.
  - **T6a correction (not implemented):** T6a's "restore contractor-entered measurements where a plan currently displaces them" must not be applied as blanket restoration. In the multi-trade path, generic job-wide measurements can't safely be fed to every trade's engine. Before reusing them, preserve per-trade isolation and define which trade owns which measurement. Revise T6a's scope and tests to say so before anyone starts it.
- 2026-10-26: **T1 decisions and review recorded** (HANDOFF.md-only update; implementation left unstaged and uncommitted).
  - **Decisions 1-3 accepted by Dylan:**
    - signature ≤ 400,000 encoded chars, 67–300,000 decoded bytes, ≤ 4,000 px per side;
    - logo formats PNG/JPEG/GIF/WebP, ≤ 4,000,000 chars / 3,000,000 bytes;
    - notice wording "Signature on file could not be displayed".

    These match the constants already in the uncommitted implementation; no code changed.
  - **Independent source review:** reported by Dylan as finding no blocking issues. Claude did not perform this review and cannot see its notes.
  - **Checks Claude executed** (earlier, at the same HEAD; not re-run for this update except the checksum):
    - focused tests 26/26;
    - full non-live suite 1,169/1,169 across 86 files, 0 outbound connections;
    - `npx tsc --noEmit --incremental false` exit 0;
    - lint on touched files showed the same 64 pre-existing findings, 0 new;
    - no `src="${` in `page.tsx`.
  - **Build info:** `tsconfig.tsbuildinfo` SHA-1 `b9266d04782844b2b46de80cccbb59c7772ae2b0` before T1, after T1, and re-checked at this update.
  - **Limitations still open:**
    - Not checked in a real browser or the PDF print window.
    - The five `page.tsx` call sites are covered by source review, not unit tests.
  - **Cosmetic follow-up:** two code comments still say "Proposed": `app/lib/safe-image-data-url.ts:5` and `app/app/lib/approval-signature.ts:3`. Left unchanged because this update was limited to HANDOFF.md.
- 2026-10-26: **Codex takeover: staging preflight completed; browser/PDF cases blocked; two local commits authorized.**
  - **Authorization:** Dylan explicitly authorized one staging QA account if needed, the five synthetic browser/PDF cases, and two local commits (eight implementation/test files, then these two documents). He separately approved temporary use of the existing staging secret key and localhost CDP controls. No push was authorized or performed.
  - **Staging identity [EXECUTED NOW]:** Supabase project `JobEstimate Pro Staging`, ref `aazacbrnkitvsjnlbrcy`, was confirmed separate from `JobEstimate Pro`, ref `aqkqrsstouhioishcios`. `.env.local` points at the latter; it was not edited or used as the QA credential source.
  - **Account [EXECUTED NOW]:** exactly one disposable staging QA user was created through the official Auth admin API: `d62cd3a9-0640-49a4-b0d7-a710ba7926d9`, `qa-t1-75b0f732-3c4e-43d9-bbc9-573a482be102@example.test`. Ordinary password sign-in and `auth.getUser` verified that account and its confirmed email. No application authentication code was modified, and no fake owner response was used. This verifies the staging Auth session, not OTP delivery or an authenticated workspace browser run.
  - **Local launch [EXECUTED NOW]:** `node /private/tmp/jobestimate-t1-browser-qQe5HW/launch.cjs` started Next.js 16.1.6 with `dev --webpack --hostname 127.0.0.1 --port 3217`, staging-only Supabase URL/keys, local site URL, other configured secret values blanked, and a Node outbound guard inherited by child processes. The server reported ready; the real browser opened `/app` with HTTP 200 and displayed the sign-in screen. Native macOS/arm64 Node v25.9.0 was used.
  - **Network evidence [EXECUTED NOW]:** the server guard logged only static Google font hosts as allowed external connections during this launch. It blocked an npm registry request. There were no production Supabase, AI-provider, or Stripe requests in that log. Account setup/sign-out used only the staging Auth host. Browser-level network restrictions could not be installed because CDP authority was denied before the first command executed.
  - **Browser blocker [OBSERVED NOW]:** the first localhost CDP request was denied by the browser permission gate. After explicit chat authorization it reported a saved permission or managed policy denial. Dylan reported changing the browser setting; the subsequent retry returned the same denial. No workaround, alternate browser, fake auth response, or source-level bypass was used. The verified QA session and synthetic history were never inserted into browser storage.

    | Requested case | Browser/PDF result |
    |---|---|
    | Valid signature | Not run; blocked before QA session/data loading |
    | Unreadable stored signature | Not run; same blocker |
    | Absent signature | Not run; same blocker |
    | Allowed logo | Not run; same blocker |
    | Unsupported logo | Not run; same blocker |

    No PDF popup or print dialog was opened. The browser/PDF limitation remains open; the existing renderer/unit results are not substituted for these cases.
  - **Validation provenance:** Claude's earlier 26/26 focused tests, 1,169/1,169 non-live tests, TypeScript exit 0, and unchanged 64 lint findings remain previously executed results. Codex did not rerun those suites. Codex re-read the source and staged diff, ran `git diff --check` / `git diff --cached --check`, and verified all eight staged blobs against the hashes captured before QA setup.
  - **Preservation [EXECUTED NOW]:** all eight implementation/test files, `AUDIT_REPORT.md`, `.env.local`, `tsconfig.json`, `next-env.d.ts`, and build info matched their pre-QA hashes before staging. Build-info SHA-1 remained `b9266d04782844b2b46de80cccbb59c7772ae2b0`.
  - **Cleanup [EXECUTED NOW]:** staging QA logout returned HTTP 204; the local QA server stopped and no listener remained on port 3217. Temporary privileged key, password, access/refresh session data, and public-key files were removed or cleared. The QA account remains in staging for a later authorized retry; no account deletion or other database cleanup was performed. Agent-created browser tabs were closed.
  - **Implementation commit [EXECUTED NOW]:** `3bd36cc36bb77dc3c72f93e2a7ac2389d568260a`, `Validate approval signatures and escape PDF images`, parent `4dbbc9a811467bc330179b9171b6788ad7f97b1e`; exactly eight files, 757 insertions / 40 deletions. The original audit is preserved unchanged for the separate documentation commit with this handoff.
  - **Remaining work:** resolve the browser's saved/managed CDP permission for the intended localhost site, then rerun the five actual app/PDF cases with a verified staging session and synthetic owner-scoped data. No later implementation task was started.
- 2026-10-26: **T1 browser/PDF verification, second attempt (Claude): PDF popup blocked; five cases not run.** Start state: branch `codex/owner-identity-preview`, HEAD `538b91c11aa2fa23dcd7ec7e19d1aa6bf9c9676d` (on top of `3bd36cc`), clean tree, nothing staged. No commit, staging, push, or deployment. No other task started.
  - **Environment [EXECUTED NOW]:**
    - Next.js 16.1.6 `dev --webpack` on `127.0.0.1:3217`, launched with `env -i` so no inherited tokens reached it.
    - Every `.env.local` key overridden at launch; `.env.local` unchanged. Next's env loader never applies a `.env.local` value for a key already in the environment (checked in `@next/env`).
    - Staging only: Supabase URL `https://aazacbrnkitvsjnlbrcy.supabase.co` (project "JobEstimate Pro Staging", confirmed read-only through the Supabase connector) and the staging **publishable** key, which is public.
    - `NEXT_PUBLIC_SITE_URL` and `ALLOWED_ORIGIN_HOSTS` set to the loopback origin.
    - Service-role, OpenAI, and Stripe secret slots set to non-credential placeholders; Stripe price and webhook values blank; telemetry off. The real staging service key was not needed and not used; `/api/entitlement` failed closed and showed "Free".
    - The compiled dev client bundles referenced staging in 3 files and production in 0. An old production build in `.next/server` (Oct 24) still contains production references; the dev server doesn't use it.
  - **Network [EXECUTED NOW]:**
    - Server: an outbound allowlist guard (loopback, staging Supabase, Google Fonts), inherited by Next's child processes.
    - Self-test before launch: OpenAI, production Supabase (`aqkqrsstouhioishcios`), and Stripe were blocked; staging was reachable.
    - During QA: 4 connections, all to staging Supabase; 1 blocked npm-registry check; no production, AI, or Stripe connection.
    - Browser: the built-in pane offers no browser-level network restriction. Its captured request log showed only `127.0.0.1` traffic, and it omitted the staging auth calls that sign-in must have made. So it is **not** proof of browser-side isolation.
  - **Authentication [OBSERVED NOW]:**
    - The recorded QA account (`d62cd3a9-…`) could not complete normal sign-in: the app signs in only by emailed code, `example.test` cannot receive mail, and the earlier cleanup deleted its password. It was not used.
    - No account was created, and Claude sent no sign-in codes.
    - Dylan signed in manually with an existing staging account he controls (owner `e8a3c9e9-cf66-487f-ac21-9278672bdd84`). The server verified the session, and the workspace rendered.
  - **Browser:** the Claude desktop app's built-in browser pane, not Chrome. It loaded `127.0.0.1:3217` without a permission refusal.
  - **Synthetic data [EXECUTED NOW]:**
    - Three approved synthetic estimates:
      - a valid 8,947-byte synthetic PNG signature;
      - an unreadable attribute-breakout string, carrying a harmless marker that would reveal any execution;
      - no signature.
    - A synthetic company profile with a PNG logo; an SVG logo was prepared for the unsupported case.
    - All stored only in that owner's local namespace on the QA origin. SHA-256 hashes were verified after storing.
    - The repo's validators classified them valid / unreadable / absent, PNG logo allowed, SVG logo rejected.
    - The estimates loaded in Saved Estimates with APPROVED badges. That is not one of the PDF cases.
  - **Blocker [OBSERVED NOW]:**
    - "Download Estimate PDF" produced the app's own message, "Pop-up blocked. Please allow pop-ups to download the PDF."; `window.open` returned nothing and no tab opened.
    - Repeated with Dylan's own click: still blocked.
    - No `window.open` override, redirect into the main page, alternate browser, auth bypass, or fake owner response was used.

    | Requested case | Browser/PDF result |
    |---|---|
    | Valid signature | Not run: built-in pane blocked the PDF popup |
    | Unreadable stored signature | Not run: same blocker |
    | Absent signature | Not run: same blocker |
    | Allowed logo | Not run: same blocker |
    | Unsupported logo | Not run: same blocker; SVG logo never loaded |

    No PDF popup or print preview was opened, so the browser/PDF limitation stays open. Renderer and unit results are not substituted for these cases.
  - **No data changes:** no estimate generated, no AI invoked, no approval submitted, no invoice created. No server-side data writes; staging traffic was auth verification plus the failed entitlement lookups.
  - **Cleanup [EXECUTED NOW]:**
    - Signed out through the app (`scope: "local"`, so other staging sessions were untouched); the auth key is gone.
    - Removed all 9 keys of that owner's namespace on the QA origin, both the synthetic records and the empty defaults the app created at sign-in. The origin's local storage is empty.
    - Closed the agent tab; stopped the dev server and a temporary loopback payload server (port 3218, which served the synthetic payload); no listener remains on 3217 or 3218.
    - Deleted the protected temp directory (launcher, guard, payload, logs).
    - Preserved files matched their pre-QA hashes: `.env.local`, `tsconfig.json`, `next-env.d.ts`, `package.json`, `package-lock.json`, `next.config.ts`, and `tsconfig.tsbuildinfo` (`b9266d04782844b2b46de80cccbb59c7772ae2b0`). The dev server updated the gitignored `.next/dev` cache.
  - **Automated results:** previously executed and not rerun: 26/26 focused tests, 1,169/1,169 non-live tests, TypeScript exit 0, lint 64 pre-existing / 0 new.
  - **Remaining work:**
    - Run the five cases in a browser that allows this app's `window.open` popup and print preview, with a verified staging session.
    - The recorded QA account needs a usable normal sign-in path, or Dylan signs in again.
- 2026-10-26: **T1 manual Chrome checklist prepared (DIY path); browser/PDF limitation still open.** HEAD `538b91c`; `HANDOFF.md` is the only modified file. No browser was automated. No other browser or session, `window.open` override, authentication change, application-code change, account creation, staging, commit, push, or deployment.
  - **Materials (temporary, outside the repo):** session scratchpad folder `t1-manual-qa/`, containing `CHECKLIST.md`, `launch-staging-qa.sh`, `net-guard.mjs`, `seed-estimates.js`, `logo-allowed.png`, `logo-unsupported.svg`, and `cleanup-local-data.js`. The checklist ends with deleting the folder.
  - **Launch procedure (new, not the earlier command):**
    - Port 3219; `env -i`; every `.env.local` key overridden, and `.env.local` untouched.
    - Staging Supabase `aazacbrnkitvsjnlbrcy` with its public publishable key; `NEXT_PUBLIC_SITE_URL` and `ALLOWED_ORIGIN_HOSTS` set to `127.0.0.1:3219`.
    - Service-role, OpenAI, and Stripe secrets are non-credential placeholders; telemetry off.
    - Server outbound guard allowlist: loopback, staging Supabase, Google Fonts.
    - On exit, prints the `Entitlement lookup error` count, the outbound hosts, and a preserved-file hash check.
    - Recorded expectation: the placeholder service-role key makes `/api/entitlement` fail closed, so the app shows "Free". That is not a real entitlement result.
  - **Fixture setup:**
    - Dylan signs in normally with an existing staging account he controls.
    - A console snippet stores three synthetic approved estimates (valid PNG signature, unreadable marker string, no signature) only under that owner's namespace on `127.0.0.1:3219`. It finds the namespace from key names only, never reads or changes the auth session, and refuses another origin, a missing namespace, or existing non-QA estimates.
    - The PNG and SVG logos are uploaded through the real Business Settings file input.
    - The cleanup snippet runs only after sign-out, checks the auth key's name only, and removes `jobestimatepro_owner:*` keys.
  - **What Claude executed now [EXECUTED NOW]:**
    - Built the fixtures and checked them with the repo's own helpers: signature 8,947-byte 360×90 PNG → `valid` (SHA-256 `0792562e…`); marker → `unreadable`; missing → `absent`; PNG logo 180×48 → allowed; SVG logo → rejected.
    - Ran both snippets in Node against a mock `localStorage` that counts auth-key value reads: seed and cleanup succeeded; each refusal path triggered; 0 auth-value reads.
    - Smoke-tested the launcher with no browser: Next ready on `127.0.0.1:3219`; `/app` returned 200; `/api/entitlement` without a session returned 401; the guard loaded in both processes and blocked only the npm-registry check; the dev bundle referenced staging, not production.
    - Stopped the launcher: the exit summary printed 0 entitlement errors (no sign-in) and all 7 preserved files OK, including build info `b9266d04782844b2b46de80cccbb59c7772ae2b0`; no listener remained.
  - **Expected results:** derived from source review of `downloadPDF()` and the T1 helpers. These are not observations:
    - valid → signature image;
    - unreadable → "Signature on file could not be displayed", no image;
    - absent → blank "Customer Signature" / "Date" lines;
    - PNG logo → image above the company name;
    - SVG logo → omitted, company name kept.

    Each has a matching print-preview check.
  - **Evidence status:**
    - Dylan's manual Chrome observations: **pending**.
    - Earlier automated results: unchanged and not rerun (26/26 focused tests, 1,169/1,169 non-live tests, TypeScript exit 0, lint 64 pre-existing / 0 new).
    - The browser/PDF limitation stays open until Dylan reports.

- 2026-11-09: **Accepted internal drafts and approved homepage/documentation checkpoint.** The accepted estimator commit is `49fb91bc49ea2267f4e22dfed57f586155ef2adc`, parent `5768eccc54c8e6b4b78ad0e3c1cc2cfa6bf6df27`. Dylan authorized including the existing homepage and handoff edits in one additional ordinary local commit, superseding their earlier protected/uncommitted status. The approved navy/blue-and-white design, `/app` navigation and in-development capability labels are preserved; five JSX apostrophes were escaped solely to resolve targeted lint findings.
  - **Executed for this checkpoint:** verified the actual branch/HEAD, initially empty index and exactly two remaining modified paths; read both pending diffs; targeted homepage ESLint passed after the minimal corrections; the installed TypeScript TSX parser reported zero syntax diagnostics. No estimator tests, normal typecheck, build or preview restart was performed for this homepage checkpoint.
  - **Accepted prior evidence:** the estimator's 76-test initial suite, 23-test final affected suite in each of two Zod modes, 15 final synthetic browser assertions, known normal TypeScript failure and unchanged `/app` lint findings remain separately recorded above. No real-project, real-model, Auth, PDF, mobile or production validation is claimed.
  - **Read-only deployment safeguard observed for this checkpoint:** the existing authenticated Vercel dashboard shows `jobestimatepro` connected to `calikid827-ai/JobEstimate-Pro`, Preview branch tracking disabled with no unsaved setting change, Production tracking only `main`, no custom environments and no deploy hooks. Inspected repository trees contain no deployment workflow definitions. This supports an ordinary feature-branch publication without an automatic deployment under the observed configuration; it does not prevent someone from changing settings or manually deploying later. No sign-in, setting change or deployment test was initiated.
  - **Publication boundary:** commit only these two files above the accepted estimator history. A later push of the exact final feature tip requires live ancestor verification and a proven no-automatic-deployment safeguard. No publication success is claimed in this entry; the actual commit identity, push result and final Git state belong in the closing session report. Do not edit the committed handoff just to add that result.
