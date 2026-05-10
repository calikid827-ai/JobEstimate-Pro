# Real PDF QA Checklist — Test Entry 1

Use this checklist to test actual contractor plan sets consistently before adding more Plan Intelligence logic. The goal is to verify upload usability, selected-page behavior, fallback clarity, estimator diagnostics, and contractor trust without changing pricing behavior.

Do not treat Plan Intelligence quantity candidates as measured takeoff support. Do not promote plan-derived candidates into pricing from this QA pass.

## 1. Test Plan Set Info

- Project name: Marina Dunes ADA Units
- PDF/file name: `260302_Marina Dunes_ADA Units_CD-Arch-MEP.pdf`
- Trade being tested: General Renovation
- Total PDF pages: 38
- Selected pages: 8 of 38
- Device/browser: MacBook / localhost:3000 / browser dev test
- Desktop or mobile: Desktop
- PDF quality notes:
  - Real contractor PDF plan set.
  - Large plan set, 46.7 MB original PDF.
  - Selected-page browser reduction worked and reduced upload from 46.7 MB to about 7.0 MB.
  - Selected sheets appear to include ADA/unit scope, schedule/support pages, and plan evidence.
- Tester: Dylan
- Date: 5/9/2026

## 2. Upload / Page Selection QA

Check each item:

- [x] Page count detected correctly.
- [x] Range selection works.
- [x] Selected pages are clear.
- [x] Selected-page count is visible.
- [x] Estimated selected upload size is visible.
- [x] Large-plan readiness guidance appears when appropriate.
- [x] Warning does not feel too aggressive.
- [x] User understands selected pages control what Plan Intelligence reads.

Notes:

Upload/page selection worked well. The app detected 38 total pages and allowed narrowing the upload to 8 selected pages. The selected-page count was clear, and the upload estimate showed the selected pages were reduced from 46.7 MB to about 7.0 MB before upload. The readiness box felt helpful and not too aggressive. It clearly explained that selected pages control what Plan Intelligence reads.

## 3. Selected-Page / Fallback QA

Test whichever paths are practical for this PDF/device combination.

- [x] Browser-derived selected-page path works when available.
- [ ] Server-derived selected-page path works when browser reduction is unavailable or too large.
- [ ] Original fallback path works when selected-page derivation fails.
- [x] Source page numbers are preserved in readback.
- [x] Unselected pages are not treated as read/analyzed.
- [x] Fallback messaging is understandable.
- [x] Generate continues when fallback is expected.

Observed upload path:

- Browser-derived selected pages: yes
- Server-derived selected pages: not tested
- Original fallback: not tested

Notes:

Browser-derived selected-page reduction worked. The app showed selected pages prepared in browser and reduced the first upload from 46.7 MB to about 7.0 MB. Plan Review Summary later showed 8 selected sheets/pages reviewed, matching the selected-page workflow. No sign that all 38 pages were treated as analyzed.

## 4. Plan Review Summary QA

Check whether the estimator-facing summary is clear and compact.

- [x] Pages read section is clear.
- [x] Extracted plan data section is clear.
- [ ] Review-only quantity signals section is clear.
- [ ] `Pricing-eligible now: 0` is visible when candidate gates are present.
- [x] Review-only language is understandable.
- [ ] Diagnostic counts are not too noisy.
- [x] Nothing implies plan candidates changed pricing.
- [x] Nothing implies measured takeoff support when measurements are not present.

Notes:

Plan Review Summary is much clearer than before because it separates Pages read and Extracted plan data. The app correctly says plan evidence is review-only and measured quantities still need confirmation. However, the summary still feels noisy in places. Some plan text appears as long raw extracted strings, file/path-like text, and all-caps plan wording. The evidence count could still confuse selected pages processed with pages that contained useful/readable evidence. This should be polished soon, but it does not look launch-blocking.

## 5. Plan Intelligence Diagnostics QA

For each diagnostic type, mark one status and add notes.

| Diagnostic | Useful | Noisy | Missing | Confusing | Notes |
| --- | --- | --- | --- | --- | --- |
| Page read statuses | [x] | [ ] | [ ] | [ ] | Shows selected pages reviewed, which is useful. |
| Sheet classifications | [x] | [x] | [ ] | [x] | Weak/unknown classification count is visible, but it is not obvious which sheets caused it without opening deeper diagnostics. |
| Tables/schedules | [x] | [x] | [ ] | [ ] | Tables detected and schedule rows are useful, but low-confidence tables suggest real PDF extraction still needs QA. |
| Room/finish matrices | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test, likely because selected pages did not produce strong room/finish matrix output. |
| Repeated room packages | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test. |
| Trade quantity candidates | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test, which is acceptable because candidates should stay review-only. |
| Candidate gates | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test. Pricing safety still looked preserved. |

Most useful diagnostic:

The selected-page upload/readback flow was the most useful. It clearly showed the PDF was reduced from 46.7 MB to about 7.0 MB and that only 8 selected pages were reviewed. The Pages read and Extracted plan data groups are helpful.

Most confusing diagnostic:

The Plan Review Summary text is still noisy. Some extracted plan evidence appears as long raw all-caps text or path-like PDF text. The app should better summarize useful evidence instead of showing too much raw extracted text.

## 6. Real Contractor Trust Questions

Answer from the contractor's point of view.

- Would a contractor understand what the app read? yes
- Would a contractor know what still needs review? yes
- Would a contractor trust the estimate more after seeing this? yes/unsure
- Does anything look like it is pretending to be a measured takeoff? no
- Does anything make it seem pricing changed from plan candidates? no

Trust notes:

A contractor would likely understand that the app read selected plan pages and found useful plan evidence, but the noisy Plan Review Summary could reduce trust. The app does a good job saying measured quantities still need confirmation and that plan evidence is review-only. Pricing did not appear to change directly from plan candidates. Trust would improve if the Plan Review Summary used cleaner, more human-readable sheet names and separated selected pages processed from useful evidence found.

## 7. Mobile Usability QA

Complete this section when testing on a phone or small tablet.

- [ ] Page ranges can be selected easily.
- [ ] Checkboxes are usable.
- [ ] Selected-page count is visible enough.
- [ ] Estimated selected upload size is visible enough.
- [ ] Plan selection readiness guidance is readable.
- [ ] Plan Review Summary is readable on mobile.
- [ ] Warnings are not too long or too cramped.
- [ ] Buttons and inputs do not overlap.
- [ ] Text does not overflow containers.

Mobile notes:

Not tested in this run. Desktop layout was usable, but the amount of diagnostic text may be heavy on mobile.

## 8. Pass / Needs Work / Fail Rating

| Major Area | Pass | Needs Work | Fail | Notes | Screenshots Taken? |
| --- | --- | --- | --- | --- | --- |
| Upload/page selection | [x] | [ ] | [ ] | Selected-page upload worked and 46.7 MB PDF was reduced to about 7.0 MB. | yes |
| Selected-page/fallback behavior | [x] | [ ] | [ ] | Browser-derived selected-page path worked. Server-derived/original fallback not tested in this run. | yes |
| Source page provenance | [x] | [ ] | [ ] | Selected pages were treated as the pages reviewed. | yes |
| Plan Review Summary clarity | [ ] | [x] | [ ] | Grouping is better, but raw extracted text and evidence counts still need copy/UI cleanup. | yes |
| Diagnostic usefulness | [ ] | [x] | [ ] | Useful, but some results are noisy and hard to interpret quickly. | yes |
| Review-only/pricing clarity | [x] | [ ] | [ ] | App clearly says plan evidence is review-only and measured quantities still need confirmation. | yes |
| Mobile usability | [ ] | [x] | [ ] | Not tested on phone; desktop is usable, but long diagnostics may be heavy on mobile. | no |
| Overall contractor trust | [ ] | [x] | [ ] | Strong direction, but Plan Review Summary text needs cleanup before it feels polished. | yes |

## 9. Issues Found

| Issue | Severity | Screenshot/reference | Suggested fix | Code area likely involved | Fix now or later |
| --- | --- | --- | --- | --- | --- |
| Plan evidence count may confuse selected pages processed with useful/readable plan evidence. | Medium | Test screenshots showing Plan Review Summary with selected pages reviewed and plan evidence. | Separate “selected pages processed” from “pages with useful evidence.” | Plan Review Summary / evidence-strength readback UI. | Soon |
| Plan Review Summary shows noisy raw extracted plan text, including long all-caps strings and path-like text. | Medium | Test screenshots showing Plan Review Summary text from Marina Dunes PDF. | Clean or suppress raw extracted PDF/path text and prioritize readable sheet names, sheet types, and short scope evidence summaries. | Plan Intelligence summary/readback copy or PlanAwareEstimatorReadbackCard display. | Soon |
| Weak/unknown sheet classification count is visible but not easy to act on. | Low/Medium | Test screenshots showing “Weak/unknown sheet classification.” | Add optional drill-down or clearer copy showing which selected pages need review. | Plan Review Summary / estimator diagnostics UI. | Later |
| Browser-derived selected-page reduction worked, but server-derived and original fallback paths were not tested in this run. | Low | Upload section screenshots showing browser-derived path. | Run separate QA with a file/device path that triggers server-derived or original fallback. | QA process / upload staging path. | Later |

## 10. Final QA Decision

- Good enough for launch testing? yes
- Needs UI copy polish? yes
- Needs real logic fix? no
- Needs upload/fallback fix? no
- Needs Plan Intelligence extraction improvement? not yet
- Do not promote plan candidates into pricing yet: yes

Final decision notes:

This test is a pass for selected-page upload and browser-derived selected-page reduction. The app successfully handled a real 38-page, 46.7 MB contractor PDF by reducing it to 8 selected pages and about 7.0 MB before upload. Plan evidence stayed review-only, and pricing did not appear to be driven by plan candidates.

The main improvement needed is UI/readback clarity. Plan Review Summary should separate selected pages processed from useful evidence found, and it should clean up noisy raw PDF text so contractors see a short, trustworthy summary instead of long extracted strings.

Recommended next action:

Run one more QA test using the same 38-page ADA plan set but select a different focused page range, then do a UI-only Plan Review Summary cleanup pass if the same noisy raw-text issue appears again.