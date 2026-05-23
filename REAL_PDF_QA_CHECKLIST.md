# Real PDF QA Checklist — Marina Dunes ADA Units

Use this checklist to test actual contractor plan sets consistently before adding more Plan Intelligence logic. The goal is to verify upload usability, selected-page behavior, fallback clarity, estimator diagnostics, and contractor trust without changing pricing behavior.

Do not treat Plan Intelligence quantity candidates as measured takeoff support. Do not promote plan-derived candidates into pricing from this QA pass.

---

# Test Entry 1 — Marina Dunes ADA Units, 8 Selected Pages

## 1. Test Plan Set Info

- Project name: Marina Dunes ADA Units
- PDF/file name: `260302_Marina Dunes_ADA Units_CD-Arch-MEP.pdf`
- Trade being tested: General Renovation
- Total PDF pages: 38
- Selected pages: 8 of 38
- Selected page numbers tested: Not fully recorded in this first run
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
| Plan evidence count may confuse selected pages processed with useful/readable plan evidence. | Medium | Test 1 screenshots showing Plan Review Summary with selected pages reviewed and plan evidence. | Separate “selected pages processed” from “pages with useful evidence.” | Plan Review Summary / evidence-strength readback UI. | Soon |
| Plan Review Summary shows noisy raw extracted plan text, including long all-caps strings and path-like text. | Medium | Test 1 screenshots showing Plan Review Summary text from Marina Dunes PDF. | Clean or suppress raw extracted PDF/path text and prioritize readable sheet names, sheet types, and short scope evidence summaries. | Plan Intelligence summary/readback copy or PlanAwareEstimatorReadbackCard display. | Soon |
| Weak/unknown sheet classification count is visible but not easy to act on. | Low/Medium | Test 1 screenshots showing “Weak/unknown sheet classification.” | Add optional drill-down or clearer copy showing which selected pages need review. | Plan Review Summary / estimator diagnostics UI. | Later |
| Browser-derived selected-page reduction worked, but server-derived and original fallback paths were not tested in this run. | Low | Test 1 upload section screenshots showing browser-derived path. | Run separate QA with a file/device path that triggers server-derived or original fallback. | QA process / upload staging path. | Later |

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

---

# Test Entry 2 — Marina Dunes ADA Units, Focused 5-Page Selection

## 1. Test Plan Set Info

- Project name: Marina Dunes ADA Units
- PDF/file name: `260302_Marina Dunes_ADA Units_CD-Arch-MEP.pdf`
- Trade being tested: General Renovation
- Total PDF pages: 38
- Selected pages: 5 of 38
- Selected page numbers tested: 1, 9, 12, 13, 22
- Device/browser: MacBook / localhost:3000 / browser dev test
- Desktop or mobile: Desktop
- PDF quality notes:
  - Real contractor PDF plan set.
  - Large plan set, 46.7 MB original PDF.
  - Selected-page browser reduction worked and reduced upload from 46.7 MB to about 4.6 MB.
  - Selected sheets were intentionally narrowed to a small focused group to test whether Plan Review Summary becomes cleaner.
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

Upload/page selection worked well. The app detected 38 total pages and allowed narrowing the plan set to 5 selected pages. The selected-page count was visible, and the app showed selected-page browser reduction from 46.7 MB to about 4.6 MB. The readiness box was helpful and clearly explained that selected pages control what Plan Intelligence reads.

## 3. Selected-Page / Fallback QA

Test whichever paths are practical for this PDF/device combination.

- [x] Browser-derived selected-page path works when available.
- [ ] Server-derived selected-page path works when browser reduction is unavailable or too large.
- [ ] Original fallback path works when selected-page derivation fails.
- [ ] Source page numbers are preserved in readback.
- [ ] Unselected pages are not treated as read/analyzed.
- [x] Fallback messaging is understandable.
- [x] Generate continues when fallback is expected.

Observed upload path:

- Browser-derived selected pages: yes
- Server-derived selected pages: not tested
- Original fallback: not tested

Notes:

Browser-derived selected-page reduction worked. The app showed selected pages prepared in browser and reduced the first upload from 46.7 MB to about 4.6 MB.

However, there may be a mismatch after Generate: upload/page selection showed 5 selected pages, but Plan Review Summary later displayed “1 selected sheet/page reviewed.” This may mean either only 1 page produced useful evidence, or the UI is confusing selected pages processed with useful/readable evidence. This needs review because the contractor expects the app to explain what happened to all 5 selected pages.

## 4. Plan Review Summary QA

Check whether the estimator-facing summary is clear and compact.

- [ ] Pages read section is clear.
- [x] Extracted plan data section is clear.
- [ ] Review-only quantity signals section is clear.
- [ ] `Pricing-eligible now: 0` is visible when candidate gates are present.
- [x] Review-only language is understandable.
- [ ] Diagnostic counts are not too noisy.
- [x] Nothing implies plan candidates changed pricing.
- [x] Nothing implies measured takeoff support when measurements are not present.

Notes:

The Plan Review Summary is improved because it groups plan evidence, pages read, and extracted plan data. The app clearly says plan evidence is review-only and measured quantities still need confirmation.

The main issue is that the page count/readback feels inconsistent. The user selected 5 pages, but Plan Review Summary showed “1 selected sheet/page reviewed.” This could make a contractor question whether the app actually reviewed all selected pages.

The summary is still somewhat noisy because it includes long all-caps plan text and repeated source text. It is better than the 8-page test, but still needs UI cleanup.

## 5. Plan Intelligence Diagnostics QA

For each diagnostic type, mark one status and add notes.

| Diagnostic | Useful | Noisy | Missing | Confusing | Notes |
| --- | --- | --- | --- | --- | --- |
| Page read statuses | [x] | [ ] | [ ] | [x] | Useful, but confusing because upload showed 5 selected pages while Plan Review Summary showed 1 selected sheet/page reviewed. |
| Sheet classifications | [x] | [x] | [ ] | [x] | Sheet support was detected, but source text is still long and not easy to interpret quickly. |
| Tables/schedules | [x] | [x] | [ ] | [ ] | Tables and schedule rows appeared useful, but low-confidence tables still need review. |
| Room/finish matrices | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test. |
| Repeated room packages | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test. |
| Trade quantity candidates | [ ] | [ ] | [x] | [ ] | Not clearly visible in this test, which is acceptable because candidates should stay review-only. |
| Candidate gates | [x] | [ ] | [ ] | [x] | Safety behavior looks preserved, but the confirmation count may be too high/noisy for a focused 5-page selection. |

Most useful diagnostic:

The selected-page browser reduction and review-only plan evidence messaging were the most useful. The app clearly reduced the upload from 46.7 MB to about 4.6 MB and did not appear to let plan candidates control pricing.

Most confusing diagnostic:

The most confusing diagnostic is the page read/evidence count. The upload UI showed 5 selected pages, but Plan Review Summary showed “1 selected sheet/page reviewed.” The app should separate selected pages processed from pages with useful evidence found.

## 6. Real Contractor Trust Questions

Answer from the contractor's point of view.

- Would a contractor understand what the app read? unsure
- Would a contractor know what still needs review? yes
- Would a contractor trust the estimate more after seeing this? yes/unsure
- Does anything look like it is pretending to be a measured takeoff? no
- Does anything make it seem pricing changed from plan candidates? no

Trust notes:

A contractor would understand that selected plan pages were uploaded and that the plan evidence is review-only. However, the mismatch between 5 selected pages and “1 selected sheet/page reviewed” could reduce trust. The contractor may wonder whether the app ignored 4 selected pages or only found useful evidence on 1 page.

The pricing and safety messaging still look good. The app does not appear to claim measured takeoff support, and it does not appear to let plan candidates directly control pricing.

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

Not tested in this run. Desktop layout was usable, but Plan Review Summary and diagnostic text may still be heavy on mobile.

## 8. Pass / Needs Work / Fail Rating

| Major Area | Pass | Needs Work | Fail | Notes | Screenshots Taken? |
| --- | --- | --- | --- | --- | --- |
| Upload/page selection | [x] | [ ] | [ ] | Selected-page upload worked and 46.7 MB PDF was reduced to about 4.6 MB. | yes |
| Selected-page/fallback behavior | [x] | [ ] | [ ] | Browser-derived selected-page path worked. Server-derived/original fallback not tested in this run. | yes |
| Source page provenance | [ ] | [x] | [ ] | Needs review because 5 selected pages became “1 selected sheet/page reviewed” in Plan Review Summary. | yes |
| Plan Review Summary clarity | [ ] | [x] | [ ] | Grouping is better, but page/evidence counts are confusing and raw text is still noisy. | yes |
| Diagnostic usefulness | [ ] | [x] | [ ] | Useful direction, but evidence/read counts need clearer labels. | yes |
| Review-only/pricing clarity | [x] | [ ] | [ ] | App clearly says plan evidence is review-only and measured quantities still need confirmation. | yes |
| Mobile usability | [ ] | [x] | [ ] | Not tested on phone; desktop is usable, but long diagnostics may be heavy on mobile. | no |
| Overall contractor trust | [ ] | [x] | [ ] | Strong direction, but count mismatch and noisy summary text need cleanup. | yes |

## 9. Issues Found

| Issue | Severity | Screenshot/reference | Suggested fix | Code area likely involved | Fix now or later |
| --- | --- | --- | --- | --- | --- |
| Plan Review Summary may confuse selected pages processed with useful/readable evidence. Upload showed 5 selected pages, but summary showed “1 selected sheet/page reviewed.” | High | Test 2 screenshots showing 5 selected pages in upload UI and 1 selected sheet/page reviewed in Plan Review Summary. | Separate “selected pages processed,” “selected pages read,” and “pages with useful evidence.” Make it clear whether 1 means useful evidence page or actual processed page. | Plan Review Summary / evidence-strength readback UI / Plan Intelligence summary counts. | Soon |
| Plan Review Summary still shows noisy raw extracted plan text, including long all-caps strings and repeated source wording. | Medium | Test 2 screenshots showing Plan Review Summary text from Marina Dunes ADA PDF. | Clean or suppress raw extracted PDF text and prioritize readable sheet names, sheet types, and short evidence summaries. | Plan Intelligence summary/readback copy or PlanAwareEstimatorReadbackCard display. | Soon |
| Confirmation count may feel too high or too broad for a focused selected-page test. | Medium | Test 2 screenshot showing Needs Confirmation count after selecting only 5 pages. | Group confirmation items by reason and suppress repetitive confirmations when they come from the same root issue. | Candidate gates / Plan Review Summary / estimator diagnostics UI. | Later |
| Browser-derived selected-page reduction worked, but server-derived and original fallback paths were not tested in this run. | Low | Test 2 upload section screenshots showing browser-derived path. | Run separate QA with a file/device path that triggers server-derived or original fallback. | QA process / upload staging path. | Later |

## 10. Final QA Decision

- Good enough for launch testing? yes
- Needs UI copy polish? yes
- Needs real logic fix? maybe
- Needs upload/fallback fix? no
- Needs Plan Intelligence extraction improvement? not yet
- Do not promote plan candidates into pricing yet: yes

Final decision notes:

This test passes for selected-page upload and browser-derived selected-page reduction. The app successfully handled a real 38-page, 46.7 MB contractor PDF by reducing it to 5 selected pages and about 4.6 MB before upload.

The main issue is Plan Review Summary clarity. The user selected 5 pages, but the readback showed “1 selected sheet/page reviewed.” This needs to be clarified before adding more Plan Intelligence logic because contractors need to understand what the app actually read.

Plan evidence stayed review-only, measured quantities still required confirmation, and pricing did not appear to be driven directly by plan candidates.

Recommended next action:

Do a UI/readback audit focused on Plan Review Summary counts and wording. The next implementation should separate selected pages processed from pages with useful evidence, reduce noisy raw extracted plan text, and make review-only plan evidence easier for contractors to trust.

---

# Overall QA Finding After Test Entry 1 and Test Entry 2

## Summary

Both real-PDF QA tests passed the most important upload and safety checks:

- The app detected the 38-page PDF.
- Selected-page browser reduction worked.
- The app reduced large uploads before Generate:
  - Test Entry 1: 46.7 MB to about 7.0 MB with 8 selected pages.
  - Test Entry 2: 46.7 MB to about 4.6 MB with 5 selected pages.
- The selected-page readiness guidance was helpful and not too aggressive.
- Plan evidence stayed review-only.
- Measured quantities still required confirmation.
- Pricing did not appear to be directly driven by plan candidates.

The main issue is not upload/staging or pricing. The main issue is Plan Review Summary/readback clarity.

## Main Issues To Fix Soon

| Issue | Severity | Why it matters | Recommended fix |
| --- | --- | --- | --- |
| Selected page counts and useful evidence counts may be confusing. | High | Contractors need to know whether the app processed all selected pages, only read some pages, or only found useful evidence on some pages. | Separate “selected pages processed,” “selected pages read,” and “pages with useful evidence.” |
| Plan Review Summary shows noisy extracted PDF text. | Medium | Long all-caps strings, repeated source text, and path-like text reduce trust. | Clean/suppress raw extracted text and show clearer sheet names, sheet types, and short evidence summaries. |
| Weak/unknown sheet classification is visible but not actionable. | Low/Medium | Contractors can see a count but may not know which sheets need attention. | Add clearer copy or optional drill-down for selected pages needing review. |
| Confirmation counts can feel broad or repetitive. | Medium | High confirmation counts may feel noisy even when safety behavior is correct. | Group confirmation items by reason and reduce duplicates from the same root issue. |
| Server-derived and original fallback paths were not tested. | Low | Browser-derived path worked, but fallback behavior still needs real QA. | Run a separate QA case designed to trigger server-derived or original fallback. |

## Final Decision

- Real-PDF upload/page selection: pass.
- Browser-derived selected-page reduction: pass.
- Review-only/pricing safety: pass.
- Plan Review Summary clarity: needs work.
- Mobile usability: not tested.
- Server-derived/original fallback: not tested.
- Do not promote plan candidates into pricing yet: yes.

## Recommended Next Single Implementation Task

Do a UI-only Plan Review Summary/readback clarity pass.

Goal:

Make Plan Review Summary easier for contractors to trust without changing Plan Intelligence logic, pricing, estimate generation, Plan Intelligence pricing influence, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, upload/staging architecture, or Generate payload shape.

Focus:

1. Separate selected pages processed from pages with useful evidence.
2. Rename ambiguous labels so “selected sheet/page reviewed” does not imply unselected pages were skipped or selected pages were ignored.
3. Reduce noisy raw extracted PDF text in the visible summary.
4. Prioritize readable sheet names, sheet types, source page numbers, and short evidence summaries.
5. Keep review-only language clear.
6. Keep plan candidates out of pricing.

---

# Test Entry 3 — Marina Dunes ADA Units, Plan Review Summary UI Retest After Readback Clarity Pass

## 1. Test Plan Set Info

- Project name: Marina Dunes ADA Units
- PDF/file name: `260302_Marina Dunes_ADA Units_CD-Arch-MEP.pdf`
- Trade being tested: General Renovation
- Total PDF pages: 38
- Selected pages: 6 of 38 shown in upload UI
- Selected page numbers tested: 1, 9, 12, 13, 22, plus one additional selected page not fully confirmed from screenshot
- Device/browser: MacBook / localhost:3000 / browser dev test
- Desktop or mobile: Desktop
- PDF quality notes:
  - Real contractor PDF plan set.
  - Large plan set, 46.7 MB original PDF.
  - Selected-page browser reduction worked and reduced upload from 46.7 MB to about 4.6 MB.
  - This was a retest after the UI-only Plan Review Summary/readback clarity pass.
- Tester: Dylan
- Date: 5/9/2026

## 2. Upload / Page Selection QA

Check each item:

- [x] Page count detected correctly.
- [x] Range/page selection works.
- [x] Selected pages are visible.
- [x] Selected-page count is visible.
- [x] Estimated selected upload size is visible.
- [x] Large-plan readiness guidance appears when appropriate.
- [x] Warning does not feel too aggressive.
- [x] User understands selected pages control what Plan Intelligence reads.
- [ ] Selected-page metadata is fully consistent across the upload card.

Notes:

The upload/page selection flow still works. The app detected 38 total pages and allowed selecting a smaller group of pages for review. The upload UI showed 6 of 38 PDF pages selected and reduced the first upload from 46.7 MB to about 4.6 MB. The large-plan readiness box remains helpful and not too aggressive.

However, the upload card appears to show inconsistent selected-page metadata. It says 6 of 38 pages were selected for plan review, but another line says “Original source pages: 38. Selected pages: 5.” This may be stale selected-page metadata or a display mismatch after changing selections.

## 3. Selected-Page / Fallback QA

Test whichever paths are practical for this PDF/device combination.

- [x] Browser-derived selected-page path works when available.
- [ ] Server-derived selected-page path works when browser reduction is unavailable or too large.
- [ ] Original fallback path works when selected-page derivation fails.
- [ ] Source page numbers are preserved clearly in readback.
- [ ] Unselected pages are not treated as read/analyzed.
- [x] Fallback/readiness messaging is understandable.
- [x] Generate continues when fallback is expected.

Observed upload path:

- Browser-derived selected pages: yes
- Server-derived selected pages: not tested
- Original fallback: not tested

Notes:

Browser-derived selected-page reduction worked. The app showed selected pages prepared in browser and reduced the upload from 46.7 MB to about 4.6 MB.

The main remaining issue is the selected-page readback after Generate. The upload UI showed 6 selected pages, but the Plan Review Summary later showed only 1 selected page processed and 1 selected page read. This is clearer than before because the labels are separated, but it still does not explain what happened to the other selected pages.

## 4. Plan Review Summary QA

Check whether the estimator-facing summary is clear and compact.

- [ ] Pages read section is fully clear.
- [x] Extracted plan data section is clear.
- [x] Review-only quantity language is clear.
- [ ] `Pricing-eligible now: 0` is visible when candidate gates are present.
- [x] Review-only language is understandable.
- [ ] Diagnostic counts are not too noisy.
- [x] Nothing implies plan candidates changed pricing.
- [x] Nothing implies measured takeoff support when measurements are not present.

Notes:

The UI-only readback clarity pass improved the Plan Review Summary. It now separates:

- Selected pages processed
- Selected pages read
- Pages with useful evidence

This is better than the old “selected sheet/page reviewed” language.

However, the result is still confusing because the app showed 6 selected pages in upload, then displayed:

- Selected pages processed: 1
- Selected pages read: 1
- Pages with useful evidence: 0

A contractor may still wonder whether the app ignored 5 selected pages, failed to process them, or only found readable evidence on 1 page. The labels are improved, but the count explanation still needs work.

The raw extracted text is somewhat cleaner because it is shortened with ellipses, but the visible summary still includes all-caps source text and repeated “source page 1” references.

## 5. Plan Intelligence Diagnostics QA

For each diagnostic type, mark one status and add notes.

| Diagnostic | Useful | Noisy | Missing | Confusing | Notes |
| --- | --- | --- | --- | --- | --- |
| Page read statuses | [x] | [ ] | [ ] | [x] | Improved labels, but confusing because upload showed 6 selected pages while summary showed 1 processed/read page. |
| Sheet classifications | [x] | [x] | [ ] | [x] | Source reference is visible, but the sheet label still appears as long all-caps extracted text. |
| Tables/schedules | [x] | [x] | [ ] | [ ] | Tables detected and schedule rows found, but low-confidence tables remain. |
| Room/finish matrices | [ ] | [ ] | [x] | [ ] | Not clearly visible in this retest. |
| Repeated room packages | [ ] | [ ] | [x] | [ ] | Not clearly visible in this retest. |
| Trade quantity candidates | [ ] | [ ] | [x] | [ ] | Not clearly visible, which is acceptable because candidates should stay review-only. |
| Candidate gates | [x] | [x] | [ ] | [ ] | Safety behavior works, but Needs Confirmation count still feels high/noisy. |

Most useful diagnostic:

The improved count labels are the most useful change. The summary now explicitly says selected pages processed, selected pages read, and pages with useful evidence instead of using the ambiguous “selected sheet/page reviewed” wording.

Most confusing diagnostic:

The most confusing part is still the count mismatch. The upload UI showed 6 selected pages, but the Plan Review Summary showed only 1 selected page processed/read. The app should explain whether the other selected pages were skipped, failed, unreadable, duplicate, or simply did not produce useful evidence.

## 6. Real Contractor Trust Questions

Answer from the contractor's point of view.

- Would a contractor understand what the app read? unsure
- Would a contractor know what still needs review? yes
- Would a contractor trust the estimate more after seeing this? unsure
- Does anything look like it is pretending to be a measured takeoff? no
- Does anything make it seem pricing changed from plan candidates? no

Trust notes:

The app is safer and clearer than before because it explicitly says plan evidence is review-only, measured quantities still require confirmation, and plan-derived candidates are not pricing inputs.

However, contractor trust is still limited by the selected-page count mismatch. A contractor would likely ask: “I selected 6 pages, so why did it only process/read 1?” The readback needs one more pass to explain selected pages that were unreadable, skipped, duplicate, unsupported, or not useful.

Pricing safety still looks good. The estimate does not appear to be driven directly by plan candidates.

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

Not tested in this run. Desktop layout was usable, but the Plan Review Summary still contains enough diagnostic text that mobile usability should be tested separately.

## 8. Pass / Needs Work / Fail Rating

| Major Area | Pass | Needs Work | Fail | Notes | Screenshots Taken? |
| --- | --- | --- | --- | --- | --- |
| Upload/page selection | [x] | [ ] | [ ] | Selected-page upload worked and reduced the plan from 46.7 MB to about 4.6 MB. | yes |
| Selected-page/fallback behavior | [x] | [ ] | [ ] | Browser-derived selected-page path worked. Server-derived/original fallback not tested. | yes |
| Source page provenance | [ ] | [x] | [ ] | Source page 1 is visible, but selected-page count/readback still needs clearer explanation. | yes |
| Plan Review Summary clarity | [ ] | [x] | [ ] | Improved labels, but count mismatch remains confusing. | yes |
| Diagnostic usefulness | [ ] | [x] | [ ] | More useful than before, but still needs explanation for processed/read/useful-evidence differences. | yes |
| Review-only/pricing clarity | [x] | [ ] | [ ] | App clearly says plan evidence is review-only and not a pricing input. | yes |
| Mobile usability | [ ] | [x] | [ ] | Not tested on phone. | no |
| Overall contractor trust | [ ] | [x] | [ ] | Improved, but still not polished enough because selected-page readback is confusing. | yes |

## 9. Issues Found

| Issue | Severity | Screenshot/reference | Suggested fix | Code area likely involved | Fix now or later |
| --- | --- | --- | --- | --- | --- |
| Upload UI selected-page count and metadata appear inconsistent. Upload showed 6 of 38 selected pages, while another line said selected pages: 5. | High | Test Entry 3 upload screenshots. | Make all upload-card selected-page count labels use the current selected-page state consistently. Avoid stale selected-page metadata after changing selections. | PlanUploadsSection / selected-page upload card display / staged upload metadata display. | Soon |
| Plan Review Summary still does not explain why 6 selected pages became 1 processed/read page. | High | Test Entry 3 Plan Review Summary screenshots. | Add a short explanation line when selected pages processed/read is lower than selected pages chosen. Example: “Some selected pages may not have produced readable evidence or were not classified strongly enough for compact summary.” | Plan Review Summary / evidence-strength readback UI. | Soon |
| “Pages with useful evidence: 0” conflicts with “Plan evidence status: Useful.” | High | Test Entry 3 Plan Review Summary screenshots. | Align the evidence-status label with useful-evidence count, or clarify that “Useful” means general plan readback exists, not pricing-ready useful evidence. | Evidence-strength label display / Plan Review Summary UI. | Soon |
| Source text is shorter than before but still appears as long all-caps extracted text. | Medium | Test Entry 3 Plan Review Summary screenshots. | Continue cleaning compact summary source text. Prefer sheet number, sheet title, sheet type, and source page number over all-caps extracted strings. | PlanAwareEstimatorReadbackCard / cleanPlanReadbackText / sheet label formatting. | Soon |
| Confirmation count remains high/noisy for a focused selected-page test. | Medium | Test Entry 3 screenshots showing Needs Confirmation 14. | Group confirmation items by root issue and reduce repeated items. | Candidate gates / estimator diagnostics UI. | Later |

## 10. Final QA Decision

- Good enough for launch testing? yes
- Needs UI copy polish? yes
- Needs real logic fix? maybe
- Needs upload/fallback fix? maybe
- Needs Plan Intelligence extraction improvement? not yet
- Do not promote plan candidates into pricing yet: yes

Final decision notes:

This retest confirms that the UI-only Plan Review Summary clarity pass improved the wording. The app now separates selected pages processed, selected pages read, and pages with useful evidence. That is a step forward.

However, the retest still found important clarity problems. The upload UI showed 6 selected pages, but the Plan Review Summary showed only 1 selected page processed/read. The UI also showed “Pages with useful evidence: 0” while the evidence status still said “Useful.” That combination is confusing and should be fixed before adding more Plan Intelligence logic.

Upload reduction, review-only language, pricing safety, and PriceGuard behavior still look good. The issue is mainly readback/count clarity, not pricing or estimate generation.

Recommended next action:

Do one more UI-only readback polish pass focused on count consistency and explanation. Specifically:

1. Make upload-card selected-page counts consistent.
2. Explain why selected pages processed/read may be lower than selected pages chosen.
3. Align “Plan evidence status: Useful” with “Pages with useful evidence: 0,” or rename the status so it does not sound contradictory.
4. Continue suppressing noisy all-caps source text in compact summaries.
5. Keep this UI-only. Do not change Plan Intelligence logic, pricing, generation, PDFs, billing, approvals, invoices, localStorage keys, saved data shapes, upload/staging architecture, or Generate payload shape.

# Test Entry 4 — Marina Dunes ADA Units, Pages Needing Review Drilldown Retest

## Result

Pass.

## What was tested

- Selected pages: 1, 9, 12, 13, 22
- Generated estimate after the “Pages needing review” UI polish
- Reviewed Plan Review Summary and pricing safety language

## Findings

The new “Pages needing review” drilldown appears correctly under the Pages read section. It explains why plan evidence may be weak or review-only by showing the selected page reference, text status, image status, classification status, and contractor-friendly reasons.

The retest confirms:

- Upload UI consistently shows 5 of 38 selected pages.
- Plan Review Summary shows selected pages processed/read/useful evidence separately.
- Pages needing review is visible and useful.
- The weak classification is explained clearly.
- Review-only language remains intact.
- Plan-derived candidates are still not pricing inputs.
- Pricing does not appear to be changed directly by plan candidates.

## Remaining polish

The compact summary still shows some all-caps extracted plan text near the top of the Plan Review Summary. This is not launch-blocking, but it could be cleaned later by improving visible summary copy.

## Final decision

This UI-only polish passes. The Plan Review Summary now explains weak/review-only plan evidence better and is safer for contractor trust.

Recommended next action:

Stop polishing this specific readback loop for now. Move to the next pre-launch QA item unless more real PDFs show the same raw-text issue repeatedly.

# Test Entry 5 — Marina Dunes ADA Units, iPhone/Mobile Plan Readback Retest

## Result

Pass with one follow-up issue.

## What was tested

- Device: iPhone/mobile PDF review
- Selected pages: 1, 9, 12, 13, 22
- Generated estimate after the “Pages needing review” UI polish
- Reviewed Plan Review Summary, Pages needing review drilldown, and pricing safety language

## Findings

The mobile/iPhone retest confirms the “Pages needing review” drilldown is working. The Plan Review Summary now explains why the selected plan evidence is weak or review-only.

The UI clearly showed:

- Selected pages processed: 1
- Selected pages read: 0
- Pages with useful evidence: 0
- Pages needing review: 1
- Weak/unknown sheet classification: 1

The Pages needing review box correctly showed:

- Source/page reference
- Text status: empty
- Image status: failed
- Classification status: weak
- Reasons:
  - Selected PDF page did not render as image support.
  - PDF rasterization returned a placeholder or blank page.

This is much better for contractor trust because it explains why the plan evidence did not become strong usable evidence.

Review-only/pricing safety language remained intact:

- Plan evidence is review-only.
- Measured quantities still require estimator confirmation.
- Plan-derived candidates are not pricing inputs.
- Pricing does not appear to be directly changed by plan candidates.

## Remaining issue found

The Customer-Facing Scope included “demolition and electrical tasks,” even though the selected trade was General Renovation and the Plan Review Summary mostly described painting/review support. This could confuse a contractor or customer because the generated customer-facing scope may drift into the wrong trade language.

## Issue Found

| Issue | Severity | Screenshot/reference | Suggested fix | Code area likely involved | Fix now or later |
| --- | --- | --- | --- | --- | --- |
| Customer-Facing Scope may introduce wrong trade language, such as “electrical tasks,” during General Renovation plan-assisted estimate. | Medium/High | iPhone/mobile retest PDF showing Customer-Facing Scope says “demolition and electrical tasks.” | Add a safety check or UI review warning when generated customer-facing scope introduces a trade not selected or not strongly supported by plan/readback evidence. | Customer-facing scope generation / Estimate Review Notes / scope review UI. | Soon |

## Final decision

The Pages needing review UI polish passes.

The next issue is not the Plan Review Summary drilldown anymore. The next pre-launch QA concern is customer-facing scope accuracy, especially preventing unsupported trade drift in the generated customer-facing scope.

## Recommended next action

Stop polishing the Pages needing review drilldown for now. Move to a UI/QA pass focused on customer-facing scope accuracy and unsupported trade drift.

# Test Entry 6 — Marina Dunes ADA Units, Unsupported Electrical Drift Warning Retest

## Result

Pass with follow-up UI cleanup.

## What was tested

- Selected pages: 1, 9, 12, 13, 22
- Trade type: General Renovation
- Generated estimate after the unsupported electrical drift warning fix
- Reviewed Customer-Facing Scope, Plan Review Summary, pricing safety language, and Estimator Diagnostics

## Findings

The unsupported electrical drift warning now appears correctly above the Customer-Facing Scope when the generated customer-facing text mentions electrical work that is not strongly supported by the selected trade, written scope, priced sections, or plan readback.

The warning appeared while Customer-Facing Scope included electrical-related language. This confirms the UI-only warning is now catching unsupported electrical drift instead of being suppressed by weak scopeXRay labels such as generic fixture counts.

The retest confirms:

- The warning appears near Customer-Facing Scope.
- The warning is estimator-only.
- Customer-Facing Scope text is not modified.
- Generate is not blocked.
- Pricing does not appear to change.
- Plan-derived candidates remain review-only and are not pricing inputs.
- Plan Review Summary still explains weak/review-only selected-page evidence.
- PriceGuard and pricing safety language remain intact.

## Remaining issue found

There appear to be two Estimator Diagnostics dropdown areas in the result UI. This is not a pricing or generation issue, but it may confuse users because the diagnostics experience feels duplicated or overly long.

## Issue Found

| Issue | Severity | Screenshot/reference | Suggested fix | Code area likely involved | Fix now or later |
| --- | --- | --- | --- | --- | --- |
| Two Estimator Diagnostics dropdown areas may confuse users or make the result page feel repetitive. | Low/Medium | Marina Dunes Test Entry 6 screenshots showing duplicate diagnostics dropdowns. | Audit result-page diagnostics layout and consider renaming, merging, or clarifying the two diagnostics sections. | app/app/page.tsx result display / estimator diagnostics UI. | Later |
| Customer-Facing Scope can still contain unsupported electrical wording, but the estimator-only warning now catches it before sending. | Medium | Customer-Facing Scope screenshot with warning visible. | Keep UI-only warning for now. Consider future customer-facing text guard only after more QA. | Customer-Facing Scope display / future generation guard. | Later |

## Final decision

This UI-only unsupported electrical drift warning passes.

The warning now protects contractor trust by flagging unsupported electrical language before the estimate is sent, without changing pricing, generation behavior, Plan Intelligence logic, upload/staging behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.

Recommended next action:

Record this test as passed. Do not keep polishing unsupported electrical drift unless more real tests show missed warnings. Move to the next pre-launch QA item, likely result-page diagnostics layout clarity or PDF/customer output review.

## Test Entry 7 — Customer Output Readiness Panel Retest

Status: PASS

Commit:
- 40e8a99 Add customer output readiness panel

Test:
- Marina Dunes real-PDF General Renovation plan-assisted estimate.
- Selected 5 of 38 PDF pages.
- Generated estimate with plan readback, PriceGuard Review, Plan Review Summary, Customer-Facing Scope, pricing, schedule, and customer-output actions.

Results:
- Customer Output Readiness panel appeared before the Pricing/PDF customer-output area.
- Panel successfully summarized estimator-only review items before sending/downloading.
- Unsupported electrical wording was detected from Customer-Facing Scope.
- Plan evidence reminder appeared and kept review-only / not-pricing-input language intact.
- Scope clarity, assumptions/exclusions, estimator risk notes, and customer-ready review items appeared without changing pricing.
- Pricing remained controlled by existing pricing path.
- Plan-derived candidates remained review-only and were not pricing inputs.
- PDF, approval output, pricing, generation behavior, Plan Intelligence backend logic, upload/staging behavior, localStorage keys, saved data shapes, and Generate payload shape were not changed.

DONE:
Customer Output Readiness panel now gives the contractor a final estimator-only review checkpoint before PDF/download/customer-output actions.

## Test Entry 8 — Multi-Trade Unsupported Customer-Scope Drift Detector Retest

Status: PASS

Commit:
- 619cbf1 Expand unsupported customer scope drift detection

Scope:
- Multi-trade unsupported Customer-Facing Scope drift detector across electrical, plumbing, drywall, flooring, painting, bathroom/tile, demolition, carpentry, and wallcovering.
- Focused unit tests passed 20/20.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

### Test 1 — Flooring Baseline / No Unsupported Drift

Input:
- Trade: Flooring
- Scope: Install 650 sq ft LVP. Remove carpet. Include transitions and base shoe. Owner supplies flooring.

Result:
- PASS.
- Customer-Facing Scope stayed within flooring/removal/base shoe/protection/coordination language.
- No unsupported trade drift warning appeared, which is expected.
- Customer Output Readiness did not include Unsupported trade wording.
- Existing PriceGuard/readiness items still appeared for assumptions, exclusions, schedule, and send-readiness review.

### Test 2 — General Renovation Plumbing Fixture Scope / Unsupported Drift Trigger

Input:
- Trade: General Renovation
- Scope: Replace toilet, vanity faucet, and shower trim. Owner supplies fixtures. Wall/floor repair excluded.

Result:
- PASS.
- Customer-Facing Scope introduced flooring and carpentry wording that was not strongly supported by the selected trade, typed scope, priced sections, or plan readback.
- The app displayed the estimator-only unsupported trade warning above Customer-Facing Scope.
- Customer Output Readiness repeated the warning under Unsupported trade wording.
- PDF/approval output was not changed or blocked.

Follow-up:
- This confirms the warning works, but also shows the AI can still over-expand customer-facing proposal language.
- Keep deterministic customer-facing scope guard / customer scope cleanup as a future backlog item. The current detector warns but does not rewrite `result.text`.

### Test 3 — Supported Painting Scope / No Unsupported Drift

Input:
- Trade: Painting
- Paint Scope: Walls only
- Scope: Paint 3 bedrooms. Walls only. Minor nail-hole patching. Two coats. Contractor supplies paint.

Result:
- PASS.
- Customer-Facing Scope stayed aligned with the typed painting scope and did not introduce unsupported trades.
- No unsupported trade wording warning appeared above Customer-Facing Scope or in Customer Output Readiness.
- The app correctly avoided a false positive when the selected trade and written scope supported the generated customer-facing wording.

Notes:
- PriceGuard still showed normal review items for measured square footage, approval language, schedule assumptions, and exclusions.
- The multi-trade unsupported drift detector behaved correctly.

## Test Entry 9 — Customer Output Readiness Dedupe/Grouping Cleanup Retest

Status: PASS

Scope:
- Customer Output Readiness was cleaned up into a compact pre-send checklist.
- Details are deduped across readiness items.
- Details remain capped at 2 per item.
- The panel remains capped at 6 items.
- Unsupported trade wording remains visible when present.
- Assumptions / exclusions are clearer as a pre-send boundary checkpoint.
- More actionable items are prioritized before the generic customer-ready reminder.

Validation:
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- The cleanup was UI-only and did not change pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.
- PDF/approval/customer output behavior was not changed or blocked.

### Test 1 — Supported Painting Scope / Compact Readiness Cleanup

Input:
- Trade: Painting
- Paint Scope: Walls only
- Scope: Paint 3 bedrooms. Walls only. Minor nail-hole patching. Two coats. Contractor supplies paint.

Result:
- PASS.
- Customer-Facing Scope stayed aligned with the typed painting scope.
- No unsupported trade wording appeared.
- Customer Output Readiness stayed compact after the cleanup.
- The panel showed only relevant review categories such as Scope clarity, Assumptions / exclusions, Estimator risk notes, Schedule assumptions, and Customer-ready review.
- The panel did not duplicate the full PriceGuard Review.
- Pricing/PDF/approval behavior was unchanged.

### Test 2 — General Renovation Plumbing Fixture Scope / Unsupported Drift Still Visible

Input:
- Trade: General Renovation
- Scope: Replace toilet, vanity faucet, and shower trim. Owner supplies fixtures. Wall/floor repair excluded.

Result:
- PASS.
- Customer-Facing Scope introduced flooring and carpentry wording that was not strongly supported by the selected trade, written scope, priced sections, or plan readback.
- The unsupported trade wording warning appeared above Customer-Facing Scope.
- Unsupported trade wording remained visible in Customer Output Readiness.
- Customer Output Readiness stayed compact after the dedupe/grouping cleanup.
- The panel did not duplicate the full PriceGuard Review.
- PDF/approval output was not changed or blocked.

Follow-up:
- This still confirms the larger future issue: the AI can over-expand customer-facing language.
- Keep deterministic customer-facing scope guard / customer scope cleanup open as a future backlog item. This cleanup warns and organizes review items but does not rewrite `result.text`.

## Test Entry 10 — Marina Dunes Plan Review Summary Raw-Text Cleanup Retest

Status: PASS

Scope:
- UI-only Plan Review Summary raw-text cleanup in `app/app/page.tsx`.
- Suppresses long all-caps sheet/index/OCR text from the main Plan Review Summary.
- Shows contractor-friendly fallback headline copy when the readable plan summary needs confirmation.
- Normalizes repeated review-only wording in visible estimator story cards.

Validation:
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was UI-only and did not change pricing, generation behavior, Plan Intelligence backend logic, upload/staging, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, or Generate payload shape.

Manual Marina Dunes retest result:
- PASS.

Observed results:
- The main Plan Review Summary no longer shows the long all-caps `WORLDMARK / SHEET INDEX / PROJECT SCOPE / PROJECT INFO` extracted text.
- The fallback headline appeared correctly: “Selected plan pages were reviewed, but the readable plan summary needs estimator confirmation.”
- Pages Needing Review remained visible.
- Selected/read/useful evidence counts remained visible.
- Review-only / not pricing input language remained visible.
- Extracted plan data remained visible.
- Estimator story cards no longer showed the worst repeated wording such as “review only review-only support.”
- Some deeper plan-story wording may still be slightly repetitive, but it is acceptable for this UI-only cleanup and can remain a future polish item if needed.
- Plan-to-price details and Estimator Diagnostics remained available for deeper review.
- Customer Output Readiness still appeared normally.
- Pricing, schedule, job saving, PDF/download action, and approval flow were not changed or blocked.

Follow-up:
- Keep broader/deeper Plan Intelligence story wording polish as future/post-launch unless later real-PDF QA finds a launch-blocking trust issue.

## Test Entry 11 — Result-Page Hierarchy Cleanup Retest

Status: PASS

Scope:
- UI-only generated-result hierarchy cleanup.
- Reordered the result page into a primary senior-estimator workflow:
  - Customer-Facing Scope.
  - Customer Output Readiness.
  - Pricing / Download Estimate PDF.
  - Schedule / Estimated Completion / Schedule Editor.
  - Collapsed `Estimator review details`.
  - Collapsed `Estimator Diagnostics`.
- Full PriceGuard Review, Plan Review Summary, and Line Item Detail remain available inside `Estimator review details`.
- AdvancedAnalysisSection remains separately collapsed as `Estimator Diagnostics`.
- Jobs, Invoices, and Saved Estimates placement was unchanged.

Validation:
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was UI-only and did not change pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

### Test 1 — Simple Painting Estimate

Input:
- Trade: Painting.
- Paint Scope: Walls only.
- Scope: Paint 3 bedrooms. Walls only. Minor nail-hole patching. Two coats. Contractor supplies paint.

Result:
- PASS.
- Customer-Facing Scope appeared near the top.
- Customer Output Readiness appeared before pricing when applicable.
- Pricing / Download Estimate PDF was easier to find.
- Schedule appeared close to pricing.
- `Estimator review details` remained collapsed and available.
- `Estimator Diagnostics` remained separately collapsed.

### Test 2 — Marina Dunes / Plan-Assisted Estimate

Input:
- Marina Dunes ADA Units real contractor PDF plan-assisted estimate.
- Selected plan pages were used for plan readback QA.

Result:
- PASS.
- Customer-Facing Scope stayed near the top.
- Customer Output Readiness appeared before pricing.
- Pricing/PDF was easy to find.
- Schedule was close to pricing.
- `Estimator review details` expanded correctly.
- Plan Review Summary remained available inside `Estimator review details`.
- Pages Needing Review remained visible after expanding.
- Review-only / not-pricing-input language remained available.
- `Estimator Diagnostics` remained separately collapsed.

Final decision:
- Result-page hierarchy cleanup passes.
- The generated estimate now gives contractors a faster primary send workflow while preserving the full estimator review and diagnostics stack for follow-up review.

## Test Entry 12 — Warning-Only AI Scope Protection / Unsupported Scope Review Guard

Status: PASS

Commit:
- `e2f1ef1` Add warning-only AI scope protection guard

Scope:
- Warning-only AI Scope Protection / Unsupported Scope Review Guard.
- Extended `app/app/lib/customer-scope-drift.ts` with structured estimator-facing review warnings.
- Added `buildCustomerScopeReviewGuard` while preserving `buildCustomerScopeTradeDriftWarning`.
- Kept existing multi-trade unsupported drift warning behavior.
- Added detection for:
  - explicit electrical exclusion conflicts.
  - explicit plumbing exclusion conflicts.
  - wall/floor/drywall/flooring/carpentry repair exclusions.
  - painting scope expanding into drywall repair, skim coat, texture match, or finish-level work.
  - flooring scope expanding into baseboard replacement, painting, or carpentry work.
  - bathroom/tile scope expanding into unsupported electrical/plumbing rough-in.
  - General Renovation not automatically supporting every trade without written, priced, Scope X-Ray, or plan-readback support.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed.
- Focused customer-scope drift tests passed 29/29 with 0 failed.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `git status` before commit showed only:
  - `app/app/lib/customer-scope-drift.ts`
  - `app/app/lib/customer-scope-drift.test.ts`
  - `app/app/page.tsx`

Manual QA:

### Test 1 — Painting Minor Nail-Hole Patching

Result:
- PASS.
- No warning appeared when scope only included normal minor nail-hole patching.
- AI-generated detailed scope stayed intact.
- Customer Output Readiness remained visible before pricing.
- Pricing/PDF and schedule remained in the improved result hierarchy.

### Test 2 — Painting With Drywall Repair / Texture Matching Excluded

Result:
- PASS.
- Warning appeared above Customer-Facing Scope when the AI mentioned drywall-related work despite exclusions.
- Customer Output Readiness showed unsupported trade wording details.
- `result.text` remained unchanged and visible.

### Test 3 — Flooring With Base Shoe / Transitions

Result:
- PASS.
- No false-positive warning appeared for base shoe/transitions when included in written scope.
- Customer-Facing Scope stayed detailed.
- Pricing/PDF and schedule remained easy to find.

### Test 4 — General Renovation With Wall/Floor Repair Excluded And Electrical By Others

Result:
- PASS.
- Warning appeared above Customer-Facing Scope when generated text included repair wording or unsupported expansion.
- Customer Output Readiness showed supporting review details.
- Pricing/PDF, schedule, Estimator review details, Estimator Diagnostics, Jobs, Invoices, and Saved Estimates remained available.

Final decision:
- The warning-only AI Scope Protection guard passes.
- The guard protects the contractor with estimator-facing warnings only.
- Customer-Facing Scope still shows one compact warning above `result.text` when needed.
- Customer Output Readiness receives capped supporting details, at most 1-2 useful details.
- `result.text` is not rewritten, shortened, flattened, removed, hidden, or mutated.
- Generate is not blocked.
- PDF and approval output were not changed.
- This did not change pricing, generation behavior, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

## Test Entry 13 — PriceGuard Trade-Specific Missed-Scope Checks And False-Positive Cleanup

Status: PASS

Scope:
- PriceGuard Review now uses selected-trade context for review-only missed-scope guidance.
- Trade-specific checks were added for painting, drywall, flooring, electrical, plumbing, bathroom/tile, wallcovering, carpentry, and general renovation.
- Review warnings cover estimator-risk items such as fixture supply, access, patching, permits/inspections, substrate prep, transitions, disposal, finish selections, waterproofing, texture match, protection, exclusions, and sequencing.
- Warning-only customer-scope drift false-positive cleanup was added so adjacent trade context does not trigger unsupported-trade warnings unless actual work is promised.
- Customer-Facing Scope remained detailed and unchanged.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was review-only/warning-only and did not change pricing, generation behavior, `result.text`, Plan Intelligence logic, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, or API routes.

### Manual QA Cases

Plumbing scope mentioning flooring protection:
- PASS.
- Flooring protection language did not falsely warn for unsupported flooring work.

Plumbing scope mentioning no interference with electrical:
- PASS.
- Electrical interference-avoidance language did not falsely warn for unsupported electrical work.

Flooring scope mentioning door jambs, closets, transitions, and baseboard finish coordination:
- PASS.
- Coordination/work-around language did not falsely warn for unsupported carpentry work.

True electrical rough-in:
- PASS.
- Unsupported electrical rough-in still warned.

True flooring install/repair:
- PASS.
- Unsupported flooring install/repair still warned.

True baseboard replacement/carpentry work:
- PASS.
- Unsupported baseboard replacement/carpentry expansion still warned.

Result workflow:
- PASS.
- Customer Output Readiness stayed before pricing.
- Pricing/PDF and schedule remained easy to find.
- Customer-Facing Scope stayed detailed and unchanged.

Final decision:
- PriceGuard trade-specific missed-scope checks pass.
- Adjacent-trade false-positive cleanup passes.
- Keep this warning-only estimator guidance under regression watch during real-world estimate QA.

## Test Entry 14 — Typed Scope Normalization And Electrical False-Positive Cleanup

Status: PASS

Scope:
- UI-side typed scope normalization for pre-generate scope-quality warnings.
- New helper: `app/app/lib/typed-scope-normalization.ts`.
- Scope-quality checks now use clause-level typed scope classification for included work, excluded/by-others work, protection-only language, coordination-only language, existing conditions, material responsibility, permit responsibility, and quantity/location signals.
- Customer-scope electrical false-positive cleanup suppresses unsupported electrical warnings when generated Customer-Facing Scope only mentions coordination/protection context such as electrical trade coordination, preventing interference, adjacent electrical components, existing wiring/components, or no interference with electrical components/wiring.
- True unsupported electrical warnings remain for electrical rough-in, install/run wiring, install/replace outlets, switches, receptacles, lights/light fixtures, add circuits, and panel/breaker work.
- Customer-Facing Scope remained detailed and unchanged.

Validation:
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts` passed 24/24.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 39/39.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was UI-side/review-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, or Customer Output Readiness behavior.

### Manual QA Cases

Flooring protection language:
- PASS.
- Protection language did not falsely infer flooring work.

Plumbing scope with electrical coordination/interference language:
- PASS.
- Coordination with the electrical trade, preventing interference, and adjacent electrical components/wiring did not falsely warn for unsupported electrical work.

Plumbing scope with existing electrical wiring avoidance:
- PASS.
- Existing wiring avoidance language did not falsely warn for unsupported electrical work.

True electrical rough-in:
- PASS.
- Unsupported electrical rough-in still warned.

True new outlet/switch/wiring:
- PASS.
- Unsupported new outlet, switch, and wiring language still warned.

Existing baseboard work-around language:
- PASS.
- Working around existing baseboards did not infer carpentry work.

Remove/reinstall toilet/faucet:
- PASS.
- Remove and reinstall plumbing language behaved as real plumbing work.

Result workflow:
- PASS.
- Customer Output Readiness stayed before pricing.
- Pricing/PDF and schedule remained easy to find.
- Customer-Facing Scope stayed detailed and unchanged.

Final decision:
- Typed scope normalization pass passes.
- Customer-scope electrical false-positive cleanup passes.
- Keep this UI-side/review-only estimator intelligence under regression watch during real-world estimate QA.

## Test Entry 15 — Schedule Sequencing Review Guard

Status: PASS

Scope:
- UI-side, warning-only Schedule Sequencing Review Guard was added through existing PriceGuardReview fields.
- The guard reviews selected trade, typed scope, generated result text, schedule, scope signals, and estimate sections where available.
- Sequencing notes surface through `contractorRiskNotes`, `scopeClarityWarnings`, `suggestedExclusions`, and `missedScopeWarnings` only when truly missing scope.
- Review guidance covers patch/texture/paint dry-time and return visits; shower/tile waterproofing, grout cure, and fixture/accessory return coordination; electrical/plumbing rough-in access, inspection/code, and patch/close-up responsibility; flooring demo, subfloor prep, install, transitions/base, and protection timing; wallcovering removal, prep, primer, layout, pattern match, and install timing; general renovation demo -> rough-in -> inspection -> close-up -> finish phase order; and owner-supplied fixture/material lead-time and return-trip risk.
- The guard suppresses notes when scope, generated result text, or schedule already addresses the sequencing issue.
- Customer-Facing Scope remained detailed and unchanged.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 34/34.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was UI-side/warning-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, or Customer Output Readiness behavior.

### Manual QA Cases

Patch-and-paint one-visit scope:
- PASS.
- Dry-time and return-visit review guidance appeared.

Simple walls-only painting:
- PASS.
- Simple painting stayed quiet and did not create noisy sequencing warnings.

Shower waterproofing/tile one-visit scope:
- PASS.
- Waterproofing, grout cure, and fixture/accessory return sequencing guidance appeared.

Plumbing owner-supplied fixture scope:
- PASS.
- Owner-material lead-time and return-trip guidance appeared only.

Electrical rough-in scope:
- PASS.
- Access, inspection/code, and patch/close-up responsibility guidance appeared.

Customer-facing output:
- PASS.
- Customer-Facing Scope stayed detailed and unchanged.

Final decision:
- Schedule Sequencing Review Guard passes.
- Keep this UI-side/warning-only estimator guidance under regression watch during real-world estimate QA.

## Test Entry 16 — Real-World Customer Scope Drift Cleanup

Status: PASS

Scope:
- Real-world QA cleanup for Customer Scope Drift false positives and false negatives.
- The cleanup fixed Case 1B where noisy `scopeXRay` split entries such as `electrical` or `electrical coordination only` were treated as support and hid true unsupported electrical drift.
- Unsupported electrical expansion now remains visible when Customer-Facing Scope promises actual electrical work such as electrical rough-in, device adjustments, electrical fixture relocation, conduit penetration patching, disconnection/reinstallation of devices and wiring, or electrical scope/work that includes wiring, devices, conduit, fixtures, outlets, switches, circuits, panels, or breakers.
- Electrical unsupported drift remains visible when drywall drift is also present.
- Electrical coordination-only and avoid-interference language remains quiet.
- Case 7A Customer Scope Drift passes with Trade Type = Painting: walls-only painting with ceiling/trim painting excluded is not treated as a whole-painting exclusion, no unsupported drywall/painting warning appeared, and Customer-Facing Scope stayed painting-focused with exclusions preserved.
- Case 1B Plan Review Summary is acceptable for this pass: selected pages processed 8, selected pages read 1, pages with useful evidence 1, with review-only plan evidence language explaining that some selected pages may not render, extract, classify, or produce compact evidence.
- Customer-Facing Scope remained detailed and unchanged.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 57/57.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 34/34.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was warning-only/review-only and did not change pricing, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API routes, backend pricing logic, layouts, or Customer Output Readiness behavior.

### Manual QA Cases

Case 1B electrical and drywall drift:
- PASS.
- Unsupported electrical warning appeared when Customer-Facing Scope mentioned actual electrical and drywall work.
- Customer Output Readiness showed that generated customer scope mentions electrical work without strong typed, priced, or plan-readback support.

Case 7A painting scope:
- PASS.
- With Trade Type = Painting, the bad unsupported drywall/painting warning did not appear.
- Customer-Facing Scope stayed painting-focused and explicitly excluded drywall repair, skim coating, texture matching, ceiling/trim painting, electrical, plumbing, flooring, and carpentry.

Customer-facing output:
- PASS.
- Customer-Facing Scope stayed detailed and unchanged.

Known remaining future audit item:
- Case 7A still shows backend split-scope / scope-to-price diagnostic noise.
- Scope-to-Price X-Ray detects primary trade as general renovation.
- Pricing Method shows anchor: `flooring_only_v1`.
- Split scopes pull excluded/protection words into flooring, drywall, electrical, plumbing, and carpentry buckets.
- Materials List shows flooring material, underlayment, base/quarter round, transitions, and floor protection for a painting-style scope.
- Treat this as a separate future audit only. Do not change backend pricing, scope splitter semantics, pricing math, generation behavior, `result.text`, PDFs, approvals, invoices, billing, saved data, payload shape, API routes, layouts, or Customer Output Readiness behavior without a separately scoped task.

Final decision:
- Real-world Customer Scope Drift cleanup passes.
- Next active smart-estimator task should be backend split-scope / scope-to-price diagnostic noise audit.

## Test Entry 17 — Backend Scope-Boundary Safety Fix

Status: PASS

Scope:
- Backend split-scope / scope-to-price diagnostic noise cleanup for the real-world Case 7A painting scope.
- Added backend included-work scope filtering in `app/api/generate/lib/priceguard/scopeSplitter.ts`.
- `splitScopeByTrade()` now uses included-work scope text so excluded/by-others/protection/coordination-only/existing-condition clauses do not create false split-scope trades.
- `isMixedRenovation()` now checks included work only.
- PriceGuard anchor eligibility now receives included-work scope text, preventing false `flooring_only_v1` anchor matches from protection/exclusion wording.
- Added targeted backend tests in `app/api/generate/lib/priceguard/scopeSplitter.test.ts`.
- Customer-Facing Scope remained detailed and unchanged.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSplitter.test.ts` passed 6/6.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 34/34.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This did not change pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.

### Manual QA Cases

Case 7A painting scope:
- PASS.
- Trade Type was Painting.
- Scope-to-Price X-Ray primary trade stayed painting.
- Pricing Method source stayed AI.
- `flooring_only_v1` did not appear.
- Split scopes only showed painting: `Paint walls only in living room and hallway. Two coats, contractor-supplied paint`.
- Materials List showed painting-style consumables/protection only: caulk/spackle/filler, roller covers/brushes/sanding supplies, and masking plastic/tape/paper.
- Flooring material, underlayment, base/quarter round, and transitions did not appear.
- Customer Scope Drift remained quiet for the previous bad unsupported drywall/painting warning.

True mixed painting + LVP control:
- PASS.
- Scope: `Paint walls in living room and install LVP flooring with transitions.`
- Trade Type was General Renovation.
- Scope-to-Price X-Ray primary trade stayed general renovation.
- Split scopes correctly showed painting and flooring.
- Pricing Method correctly showed anchor: `flooring_only_v1`.
- Materials List correctly showed flooring material, underlayment, base/quarter round, transitions, and floor protection.

Final decision:
- Backend scope-boundary safety fix passes.
- Cross-trade backend scope-boundary regression review was completed later in Test Entry 18.

---

# Test Entry 18 — Cross-Trade Backend Scope-Boundary Regression Fix

Status: PASS

Scope:
- Cross-trade backend included-work filtering cleanup after the Case 7A safety fix.
- Improved `getIncludedScopeText()` in `app/api/generate/lib/priceguard/scopeSplitter.ts` so boundary clauses are filtered at the sentence/segment level instead of trimming after boundary words and leaving orphan trade nouns behind.
- Boundary clauses such as `Electrical by others`, `Painting by others`, `Texture match excluded`, `Flooring protection only`, `Existing baseboards to remain`, `Owner-supplied fixtures`, `Furniture moving by others`, `Plumbing by others`, `Glass by others`, and `Coordinate with electrical trade only` are removed from included-work scope.
- True included work remains preserved, including install LVP, electrical rough-in, replace baseboards, drywall patch included, plumbing rough-in, replace toilet/faucet, install tile/waterproofing/grout, wallcovering prep/primer, and true mixed painting + LVP.
- Added local splitter recognition for tile and wallcovering so true included tile/waterproofing and wallcovering prep/primer scopes do not fall into generic renovation or painting buckets.
- Customer-Facing Scope / `result.text` remained detailed and unchanged.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSplitter.test.ts` passed 18/18.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 34/34.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This did not change pricing formulas, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, or broad backend pricing semantics.

### Manual QA Cases

Plumbing:
- PASS.
- Scope: `Replace toilet and faucet. Electrical by others. Flooring protection only. Wall patching by others. Owner-supplied fixtures.`
- Result: plumbing-only. Electrical, flooring, drywall, and painting boundary language did not create false split scopes.

Electrical:
- PASS.
- Scope: `Electrical rough-in for vanity light. Drywall and paint by others. Owner-supplied fixture.`
- Result: electrical-only. Drywall, paint, and owner fixture boundaries were filtered while electrical rough-in remained real included work.

Flooring:
- PASS.
- Scope: `Install owner-supplied LVP flooring with transitions. Existing baseboards to remain. Painting by others.`
- Result: flooring-only. Existing baseboards and painting by others did not create carpentry or painting split scopes.

Drywall:
- PASS.
- Scope: `Drywall patch at access holes. Painting by others. Texture match excluded. Electrical and plumbing by others.`
- Result: drywall-only. Painting, electrical, plumbing, and excluded texture-match boundaries were filtered.

Bathroom/Tile:
- PASS.
- Scope: `Waterproof shower walls and install tile. Plumbing by others. Glass by others. Owner-supplied tile and fixtures.`
- Result: tile-related included scope was preserved. Plumbing, glass, and owner-supplied boundaries were filtered.

Wallcovering:
- PASS.
- Scope: `Install wallcovering with wall prep and primer included. Painting, electrical, and furniture moving by others.`
- Result: wallcovering recognized. Wall prep and primer stayed in wallcovering context, while painting, electrical, and furniture-moving boundaries were filtered.

Carpentry:
- PASS.
- Scope: `Replace baseboards in hallway. Painting by others. Flooring protection only.`
- Result: carpentry-only. Painting by others and flooring protection did not create painting or flooring scopes.

True mixed control:
- PASS.
- Scope: `Paint walls in living room and install LVP flooring with transitions.`
- Result: mixed scope still works. Split scopes show painting and flooring, and General Renovation / `flooring_only_v1` behavior remains where intended.

Final decision:
- Cross-trade backend scope-boundary regression fix passes.
- Next active smart-estimator task should be real-world estimate QA matrix coverage for diagnostic consistency across Customer-Facing Scope, Customer Output Readiness, PriceGuard Review, Scope-to-Price X-Ray, materials, schedule, and PDF/customer-output safety.

---

# Test Entry 19 — Scope-to-Price Consistency Review Guard False-Positive Cleanup

Status: PASS

Scope:
- UI-side warning-only Scope-to-Price Consistency Review Guard false-positive cleanup.
- Painting prep consumables such as caulk, spackle, filler, and masking tape no longer warn as unsupported drywall materials.
- True drywall materials such as drywall sheet, joint compound, and drywall tape still warn when drywall is unsupported.
- Generic flooring adhesive / misc install supplies no longer warn as wallcovering materials.
- Clear wallcovering material labels such as wallpaper rolls or wallcovering seam adhesive still warn when wallcovering is unsupported.
- Wallcovering wall prep and primer are treated as wallcovering prep context, not separate painting work.
- Customer-Facing Scope / `result.text` remained detailed and unchanged.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 12/12.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 35/35.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This was warning-only/review-only and did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Scope Drift, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, or layouts.

### Manual QA Outcomes

Case 7A painting scope:
- PASS.
- Painting scope remained quiet for false flooring anchor/material consistency warnings.
- Painting prep consumables did not trigger unsupported drywall material warnings.

True mixed painting + LVP:
- PASS.
- True mixed painting + LVP remained accepted.
- Generic flooring adhesive / misc install supplies did not trigger false wallcovering material warnings.

False flooring anchor/material warning test:
- PASS.
- No false `flooring_only_v1` anchor appeared in the passing case.
- The guard still remains available to warn if unsupported flooring anchor/material diagnostics appear without flooring support.

Wallcovering context:
- PASS.
- Wallcovering wall prep and primer no longer create a false painting + wallcovering mixed-scope warning.
- Clear unsupported wallcovering material labels remain warning-worthy when wallcovering is not supported.

Final decision:
- Scope-to-Price Consistency Review Guard false-positive cleanup passes.
- Next active smart-estimator task remains real-world estimate QA matrix coverage for diagnostic consistency across Customer-Facing Scope, Customer Output Readiness, PriceGuard Review, Scope-to-Price X-Ray, materials, schedule, and PDF/customer-output safety.

---

# Test Entry 20 — Case 1 Painting Real-World QA False-Positive Cleanup

Status: PASS

Scope:
- Focused cleanup for the real-world estimate QA matrix Case 1 Painting false positives.
- Trade Type: Painting.
- Typed scope: `Paint walls only in living room and hallway. Two coats, contractor-supplied paint, masking, floor protection, cleanup, and customer approval. Excludes drywall repair, skim coat, texture matching, trim, ceiling paint, electrical, plumbing, flooring, and carpentry.`
- Customer Scope Drift now treats `coordination with ongoing drywall and carpentry work`, `coordination with carpentry activities`, and `minimize interference` as coordination-only context rather than promised carpentry scope.
- Backend included-work scope interpretation now prevents excluded drywall, flooring, trim/baseboard, and carpentry terms from creating false multi-trade coordination, flooring-before-trim/baseboard sequencing, flooring-paint coordination, or Estimate Defense wording that the job is not single-trade only across painting/drywall/carpentry.
- Missed-scope detection no longer classifies painting scopes as patch-and-paint when drywall repair, skim coat, or texture matching appear only in excluded scope clauses.
- `Primer / sealer after patching` is no longer recommended from excluded drywall/texture wording.
- Backend schedule phase parsing keeps exclusion context attached, so excluded patch/texture wording does not drive patch/texture dry time before paint.
- Customer-Facing Scope / `result.text` remains a core product strength and was not broadly rewritten.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 64/64.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 10/10.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/missedScopeDetector.test.ts` passed 2/2.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSplitter.test.ts` passed 19/19.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 37/37.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This did not change pricing formulas, backend pricing semantics, broad generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, or layouts.

### Manual QA Outcomes

Case 1 Painting:
- PASS.
- Primary trade is painting.
- Paint scope is walls.
- Split scopes show painting only.
- Pricing Method source is AI.
- No `flooring_only_v1` appears.
- Materials List shows painting/protection consumables only.
- No unsupported carpentry warning appears.
- No painting+drywall mixed-scope consistency warning appears.
- No owner/customer-supplied material note appears.
- No `Primer / sealer after patching` appears.
- No `drywall dry/return` appears.
- No patch/texture dry-time before painting appears.
- No flooring/trim/baseboard sequencing phrase appears.
- No multi-trade coordination / Estimate Defense false statement appears.
- Normal two-coat paint dry-time, low-confidence, measurement, and payment review notes are acceptable estimator guidance.

True patch-and-paint control:
- PASS.
- Scope: `Patch drywall access holes, prime repairs, and paint walls.`
- Customer-Facing Scope still includes drywall patching, compound/tape, sanding, primer, and painting.
- Schedule still includes patch/texture drying time before painting.
- Estimated Schedule still includes drywall dry/return.
- Scope-to-Price X-Ray split scopes still show drywall and painting.
- True patch-and-paint behavior remains preserved.

Final decision:
- Case 1 Painting false-positive cleanup passes.
- Continue the real-world estimate QA matrix for remaining trade cases and diagnostic consistency.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 21 — Remaining Real-World QA False-Positive Cleanup, Cases 4, 6, 7, and 8

Status: PASS

Scope:
- Focused cleanup for the remaining real-world estimate QA matrix false positives across Electrical Case 4, Bathroom/Tile Case 6, Wallcovering Case 7, and Carpentry Case 8.
- The cleanup reduced false positives caused by excluded, by-others, coordination-only, sequencing-only, and normal trade-prep context.
- Customer-Facing Scope / `result.text` remains a core product strength and was not broadly rewritten.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 11/11.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSplitter.test.ts` passed 21/21.
- `npm run test:estimator -- app/app/lib/priceguard-review.test.ts app/app/lib/scope-quality-check.test.ts` passed 38/38.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- This did not change pricing formulas, backend pricing semantics, broad generation behavior, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, or measured plan pricing eligibility.

### Manual QA Outcomes

Case 4 Electrical:
- PASS.
- Vanity lights no longer create false plumbing/carpentry mixed-trade diagnostics.
- Electrical rough-in with owner-supplied fixtures, permit/inspection coordination, access through open walls, cleanup, and drywall/paint by others stays electrical-only.
- Sequencing/framing/finish-trade wording no longer creates unsupported carpentry drift.
- True carpentry work still warns.
- Permit/inspection review for electrical rough-in remains acceptable estimator guidance.

Case 6 Bathroom/Tile:
- PASS.
- Shower wall waterproofing/tile/grout/trim stays tile/bathroom context.
- Demo, cement board/backer, membrane, waterproofing, tile, grout, and tile trim no longer create false General Renovation split noise.
- Tile trim / edge trim is not treated as carpentry trim unless baseboard/casing/carpentry trim is clearly included.
- Plumbing by others and owner-supplied fixtures no longer create false plumbing material warnings or plumbing multi-trade defense wording.
- Bathroom flooring allowance is not added unless flooring/floor tile/floor replacement is actually included.
- Wet-area cure/set-time notes remain acceptable for true tile work.

Case 7 Wallcovering:
- PASS.
- There is no selectable Wallcovering Trade Type, so this test was correctly run as General Renovation.
- General Renovation with detected wallcovering-only included scope now respects wallcovering scope.
- Wallcovering-only scope no longer gets bathroom/tile cure, glass/fixture, demo/rough-in, or broad General Renovation sequencing noise.
- Acceptable wallcovering-specific notes remain: wall elevations/heights, affected walls, material type, roll-good assumptions, pattern repeat, seam/layout direction, substrate readiness, primer/prep expectations, and owner-supplied wallcovering timing.

Case 8 Carpentry:
- PASS.
- Baseboard removal/disposal and `demolition of existing baseboards` are treated as normal carpentry/baseboard replacement prep.
- A separate `Prior to demolition...` sentence is suppressed when the same Customer-Facing Scope clearly contains supported baseboard replacement/removal context.
- True unrelated demolition/tear-out of walls, floors, cabinets, non-baseboard finishes, or unrelated demolition still warns.

Acceptable remaining notes:
- Owner-supplied material responsibility.
- Wet-area cure/set-time for true tile work.
- Permit/inspection review for electrical rough-in.
- Wallcovering layout/pattern/substrate confirmation.
- True mixed-scope coordination when multiple trades are actually included.

Final decision:
- Remaining real-world QA false-positive cleanup across Cases 4, 6, 7, and 8 passes.
- Next active smart-estimator task should continue EstimatorScopeFacts architecture work. Phases 1 through 6 are now complete, so the current next task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 22 — Phase 1 EstimatorScopeFacts Architecture Groundwork

Status: PASS

Scope:
- Phase 1 added `app/app/lib/estimator-scope-facts.ts` and `app/app/lib/estimator-scope-facts.test.ts`.
- `app/app/lib/typed-scope-normalization.ts` now uses `buildEstimatorScopeFacts()` internally while preserving its public function names and return shape.
- The shared deterministic text-only facts helper centralizes included work, excluded/by-others clauses, protection-only clauses, coordination-only clauses, existing/to-remain clauses, owner/customer/contractor-supplied material responsibility, patch/texture context, tile trim context, wallcovering prep context, baseboard replacement/removal context, and true mixed-trade facts.
- Customer Scope Drift, Schedule Sequencing, Scope-to-Price Consistency Review, backend route diagnostics, `scopeSplitter`, materials generation, `missedScopeDetector`, pricing prep, and Estimate Defense were intentionally not migrated in Phase 1.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 11/11.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 38/38.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was architecture groundwork only.
- It did not change pricing formulas, backend pricing semantics, generation prompts, `result.text`, PDFs, approvals, invoices, billing, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, broad backend route diagnostics, Customer Scope Drift behavior, Schedule Sequencing behavior, `scopeSplitter` behavior, or materials generation behavior.

Final decision:
- Phase 1 EstimatorScopeFacts passes.
- Phase 2 Scope-to-Price Consistency Review migration is complete.
- Phase 3 Customer Scope Drift migration is complete.
- Phase 4 Schedule Sequencing Review migration is complete.
- Phase 5 PriceGuard Review aggregator migration/audit is complete.
- Next active smart-estimator task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Next manual QA should happen after the Phase 7 missed-scope diagnostics audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 23 — Phase 2 EstimatorScopeFacts Scope-to-Price Migration

Status: PASS

Scope:
- Phase 2 migrated `app/app/lib/scope-price-consistency-review.ts` to consume `buildEstimatorScopeFacts()`.
- Scope-to-Price Consistency Review now uses EstimatorScopeFacts for included-work and boundary-context understanding, including included trades, material responsibility, wallcovering prep/primer context, tile trim context, true mixed trades, and related consistency review logic.
- Public return shape was preserved:
  - `missedScopeWarnings`
  - `laborMaterialConfidenceNotes`
  - `scopeClarityWarnings`
  - `suggestedExclusions`
  - `contractorRiskNotes`

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 11/11.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 38/38.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a warning-only architecture migration.
- It intentionally did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Customer Scope Drift behavior, Schedule Sequencing behavior, backend route diagnostics, `scopeSplitter` behavior, or materials generation behavior.

Final decision:
- Phase 2 EstimatorScopeFacts Scope-to-Price migration passes.
- Phase 3 Customer Scope Drift migration is complete.
- Phase 4 Schedule Sequencing Review migration is complete.
- Phase 5 PriceGuard Review aggregator migration/audit is complete.
- Next active smart-estimator task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Next manual QA should happen after Phase 7 missed-scope diagnostics audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 24 — Phase 3 EstimatorScopeFacts Customer Scope Drift Migration

Status: PASS

Scope:
- Phase 3 migrated `app/app/lib/customer-scope-drift.ts` to consume `buildEstimatorScopeFacts()`.
- Customer Scope Drift now uses EstimatorScopeFacts for written-scope support and boundary-context understanding.
- Written-scope support now uses shared included-work facts.
- Excluded/by-others, coordination-only, protection-only, and existing/to-remain typed-scope context now flows through shared facts for trade conflict checks.
- Existing specialized generated-text true-work detection remains in place for electrical, plumbing, carpentry, demolition, drywall/patching, flooring, bathroom/tile, and wallcovering.
- Public behavior was preserved: same exported function names, same return shapes, warning-only behavior, and no customer text mutation.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 11/11.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 38/38.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a warning-only architecture migration.
- It intentionally did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Schedule Sequencing behavior, Scope-to-Price behavior, backend route diagnostics, `scopeSplitter` behavior, or materials generation behavior.

Final decision:
- Phase 3 EstimatorScopeFacts Customer Scope Drift migration passes.
- Phase 4 Schedule Sequencing Review migration is complete.
- Phase 5 PriceGuard Review aggregator migration/audit is complete.
- Next active smart-estimator task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Next manual QA should happen after Phase 7 missed-scope diagnostics audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 25 — Phase 4 EstimatorScopeFacts Schedule Sequencing Migration

Status: PASS

Scope:
- Phase 4 migrated `app/app/lib/schedule-sequencing-review.ts` to consume `buildEstimatorScopeFacts()`.
- `app/app/lib/schedule-sequencing-review.test.ts` was updated with focused regression coverage and now has 14 passing tests.
- Schedule Sequencing Review now uses EstimatorScopeFacts for sequencing-related included-work and boundary-context understanding.
- Trade resolution now prefers shared included-trade facts.
- Patch/texture sequencing uses `patchTextureIncluded` instead of raw excluded wording.
- Wet-area tile, rough-in, wallcovering, owner/customer material timing, and true mixed General Renovation sequencing now use shared facts where safe.
- Public behavior was preserved: same exported function names, same return type/shape, same review fields, same warning-only behavior, and no customer text mutation.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 38/38.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a warning-only architecture migration.
- It intentionally did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, Customer Scope Drift behavior, Scope-to-Price behavior, backend route diagnostics, `scopeSplitter` behavior, or materials generation behavior.

Final decision:
- Phase 4 EstimatorScopeFacts Schedule Sequencing migration passes.
- Phase 5 PriceGuard Review aggregator migration/audit is complete.
- Next active smart-estimator task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Next manual QA should happen after Phase 7 missed-scope diagnostics audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 26 — Phase 5 EstimatorScopeFacts PriceGuard Review Aggregator Migration

Status: PASS

Scope:
- Phase 5 migrated/audited `app/app/lib/priceguard-review.ts` to consume `buildEstimatorScopeFacts()` where safe at the aggregator layer.
- `app/app/lib/priceguard-review.test.ts` was updated with focused regression coverage and now has 17 passing tests.
- PriceGuard Review now uses shared facts for General Renovation wallcovering-only trade resolution, material responsibility / material boundary checks, exclusion boundary checks, permit boundary checks, and primer/sealer-after-patching confirm-item suppression through `patchTextureIncluded` / `patchTextureExcluded`.
- Boundary-aware review behavior is covered for electrical, bathroom/tile, and true mixed renovation controls.
- Public behavior was preserved: same exported function names, same `PriceGuardReview` return shape, same warning-only fields, no customer text mutation, and no layout/cap changes.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/priceguard-review.test.ts` passed 17/17.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a UI-side warning-only architecture migration.
- It intentionally did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, child guard behavior, Customer Scope Drift behavior, Scope-to-Price Consistency Review behavior, Schedule Sequencing behavior, backend route diagnostics, `scopeSplitter` behavior, or materials generation behavior.

Final decision:
- Phase 5 EstimatorScopeFacts PriceGuard Review aggregator migration passes.
- Phase 6 backend Estimate Defense migration is complete.
- Next active smart-estimator task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Next manual QA should happen after the Phase 7 missed-scope diagnostics audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 27 — Phase 6 EstimatorScopeFacts Backend Estimate Defense Migration

Status: PASS

Scope:
- Phase 6 migrated `app/api/generate/lib/estimator/estimateDefenseMode.ts` to consume `buildEstimatorScopeFacts()`.
- `app/api/generate/lib/estimator/estimateDefenseMode.test.ts` was added with focused regression coverage and now passes 7/7.
- Estimate Defense now uses EstimatorScopeFacts for display-only included-work and boundary-context diagnostics.
- Bathroom/wet-area defense now reads included-work text instead of raw scope text.
- Multi-trade defense now uses shared included-trade facts before falling back to trade stack.
- Exclusion-note waterproofing checks use included-work text, so by-others/excluded context is less likely to create defense noise.
- Regression coverage includes Case 1 Painting exclusions, Case 4 Electrical, Case 6 Bathroom/Tile, Case 7 Wallcovering, Case 8 Carpentry, true mixed renovation, and true bathroom remodel.
- Public behavior was preserved: same exported `buildEstimateDefenseMode` function name, same return shape and fields, display-only diagnostic behavior, no customer text mutation, and no route contract changes.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/estimateDefenseMode.test.ts` passed 7/7.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/priceguard-review.test.ts` passed 17/17.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a display-only backend diagnostic migration.
- It intentionally did not change pricing formulas, backend pricing semantics, generation behavior, `result.text`, PDFs, approvals, invoices, billing, webhook/billing code, localStorage keys, saved data shapes, Generate payload shape, API route contracts, Customer Output Readiness layout/caps, result-page hierarchy, PriceGuard layout, assumptions panel layout, measured plan pricing eligibility, materials generation behavior, `scopeSplitter` behavior, route contract behavior, pricing anchors, or deterministic engines.

Final decision:
- Phase 6 EstimatorScopeFacts backend Estimate Defense migration passes.
- Next active smart-estimator task is Phase 7: audit `missedScopeDetector` / backend missed-scope diagnostics for remaining raw scope parsing.
- Next manual QA should happen after the Phase 7 missed-scope diagnostics audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 28 — Phase 7 EstimatorScopeFacts Backend Missed-Scope Diagnostics Migration

Status: PASS

Scope:
- Phase 7 migrated `app/api/generate/lib/estimator/missedScopeDetector.ts` to consume `buildEstimatorScopeFacts()`.
- `app/api/generate/lib/estimator/missedScopeDetector.test.ts` was updated with focused regression coverage and now passes 9/9.
- missedScopeDetector now builds EstimatorScopeFacts once per detector context.
- Job-type detection now prefers shared included-work facts instead of raw boundary text.
- Existing "has scope" checks now read from `facts.includedWorkText` where safe.
- Patch/texture detection now uses `patchTextureIncluded` instead of local raw clause parsing.
- Baseboard job-type detection uses shared carpentry/baseboard replacement context.
- Boundary-only owner-supplied, by-others, protection-only, coordination-only, and existing/to-remain context no longer drives missed-scope support checks.
- Public return shape and warning-only behavior were preserved.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/missedScopeDetector.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/estimateDefenseMode.test.ts` passed 7/7.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/priceguard-review.test.ts` passed 17/17.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a warning-only backend diagnostic migration.
- It intentionally did not change pricing formulas, backend pricing semantics, anchors, deterministic engines, materials generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, measured plan pricing eligibility, or broad `route.ts` diagnostics.

Final decision:
- Phase 7 EstimatorScopeFacts missedScopeDetector migration passes.
- Phase 8A route-level display diagnostics migration is complete in the next entry.
- Phase 8B materials diagnostics migration is complete in a later entry.
- Phase 8C materials item gate migration is complete in a later entry.
- Phase 8D-6B photo-estimate decision reason-text gate is complete in Test Entry 38.
- Next manual QA should happen after the remaining Phase 8D prompt-adjacent / diagnostic text audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 29 — Phase 8A EstimatorScopeFacts Route-Level Display Diagnostics Migration

Status: PASS

Scope:
- Phase 8A migrated route-level display-only Scope-to-Price X-Ray / area confirmation diagnostics to EstimatorScopeFacts where safe.
- `app/api/generate/route.ts` now builds EstimatorScopeFacts once for `scopeChange`.
- `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts` was added.
- `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` was added and passes 6/6.
- `app/api/generate/lib/estimator/orchestrator.ts` now passes `scopeFacts` through internal estimator context to X-Ray construction.
- `app/api/generate/lib/estimator/types.ts` now includes `scopeFacts` on the internal estimator context.
- `app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` was updated for the new context field.
- `buildScopeXRay` now uses shared facts for true mixed trade risk support, patch/texture confirmation, and baseboard/trim LF confirmation.
- `buildAreaScopeBreakdown` now uses shared facts for demo/removal driver suppression, surface prep / patch driver detection, tile-trim vs carpentry-trim distinction, baseboard replacement/removal context, and trim/baseboard missing confirmation.
- Public route/API response shape was preserved.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 6/6.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/missedScopeDetector.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/estimateDefenseMode.test.ts` passed 7/7.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 2/2.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/priceguard-review.test.ts` passed 17/17.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a display-only backend diagnostics migration.
- It intentionally did not change pricing formulas, backend pricing semantics, anchors, deterministic engines, `materialsList.items` generation, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, or measured plan pricing eligibility.

Final decision:
- Phase 8A EstimatorScopeFacts route-level display diagnostics migration passes.
- Phase 8B materials diagnostics migration is complete in the next entry.
- Phase 8C materials item gate migration is complete in a later entry.
- Phase 8D-6B photo-estimate decision reason-text gate is complete in Test Entry 38.
- Deferred photo behavior items remain pricing/policy-adjacent and should stay out of scope unless explicitly approved after launch-readiness review.
- Next manual QA should happen after the remaining Phase 8D prompt-adjacent / diagnostic text audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 30 — Phase 8B EstimatorScopeFacts Materials Diagnostics Migration

Status: PASS

Scope:
- Phase 8B migrated `buildMaterialsList` confirmation items/notes and materials diagnostics to EstimatorScopeFacts where safe.
- `app/api/generate/route.ts` now passes `scopeFacts` into `buildMaterialsList`.
- `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts` was updated with materials diagnostics helper logic.
- `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` was updated and now passes 14/14.
- `materialsList.confirmItems` are now filtered with EstimatorScopeFacts where safe.
- `materialsList.notes` now use EstimatorScopeFacts where safe.
- Flooring transition confirmation now drops "trim footage" when shared facts show existing baseboards / flooring protection context.
- Combined materials note now uses `trueMixedTrades` instead of only `splitScopes.length`.
- ConfirmItems/notes now use shared facts for excluded patch/texture/drywall context, by-others plumbing/electrical context, owner/customer-supplied fixture/material boundary context, flooring protection / existing-to-remain context, tile trim vs carpentry/base trim context, and true mixed materials note gating.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/missedScopeDetector.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/estimateDefenseMode.test.ts` passed 7/7.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 2/2.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/priceguard-review.test.ts` passed 17/17.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a confirmItems/notes-only backend materials diagnostics migration.
- It intentionally did not change `materialsList.items` generation, pricing formulas, backend pricing semantics, anchors, deterministic engines, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, or measured plan pricing eligibility.
- MaterialsList return shape and route/API response shape were preserved.

Final decision:
- Phase 8B EstimatorScopeFacts materials diagnostics migration passes.
- Phase 8C materials item gate migration is complete in the next entry.
- Phase 8D-6B photo-estimate decision reason-text gate is complete in Test Entry 38.
- Deferred photo behavior items remain pricing/policy-adjacent and should stay out of scope unless explicitly approved after launch-readiness review.
- Next manual QA should happen after the remaining Phase 8D prompt-adjacent / diagnostic text audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 31 — Phase 8C EstimatorScopeFacts Materials Item Gate Migration

Status: PASS

Scope:
- Phase 8C migrated selected route-level `materialsList.items` conditional item gates to EstimatorScopeFacts where safe.
- `app/api/generate/route.ts` now uses EstimatorScopeFacts-aware gates for selected materialsList.items conditional item triggers.
- `app/api/generate/lib/estimator/routeDisplayDiagnostics.ts` was updated with materials item gate helper logic.
- `app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` was updated and now passes 20/20.
- Conditional material item gates now use shared facts where safe for kitchen backsplash/flooring/paint/demo add-ons, kitchen refresh backsplash/flooring add-ons, flooring tile setting materials, drywall texture/primer items, electrical/plumbing parsed fixture/device counts, and carpentry parsed LF material quantity.
- Material item trigger logic now prefers EstimatorScopeFacts-aware included material text instead of raw boundary text where safe.
- Drywall texture/primer item decisions now respect `patchTextureIncluded` / `patchTextureExcluded`.
- Electrical/plumbing fixture counts now parse boundary-filtered material item text.
- Carpentry LF material quantity now parses boundary-filtered material item text.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 20/20.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/missedScopeDetector.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/estimateDefenseMode.test.ts` passed 7/7.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 2/2.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/priceguard-review.test.ts` passed 17/17.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/scope-price-consistency-review.test.ts` passed 18/18.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/customer-scope-drift.test.ts` passed 71/71.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/schedule-sequencing-review.test.ts` passed 14/14.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a selected conditional-gates-only customer-visible materials item migration.
- It intentionally did not change MaterialsList shape, route/API response shape, material labels, base trade consumables, anchor base packages, pricing formulas, backend pricing semantics, anchors, deterministic engines, `scopeSplitter` behavior, route contracts, generation prompts, `result.text`, PDFs, UI layouts, billing/webhook code, or measured plan pricing eligibility.

Final decision:
- Phase 8C EstimatorScopeFacts materials item gate migration passes.
- Phase 8D-6B photo-estimate decision reason-text gate is complete in Test Entry 38.
- Deferred photo behavior items remain pricing/policy-adjacent and should stay out of scope unless explicitly approved after launch-readiness review.
- Next manual QA should happen after the remaining Phase 8D prompt-adjacent / diagnostic text audit or after a focused backend verification pass.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 32 — Phase 8D-2 EstimatorScopeFacts Coordination Text Gate

Status: PASS

Scope:
- Phase 8D-2 gated customer-facing trade coordination append text with EstimatorScopeFacts.
- `appendTradeCoordinationSentence()` now accepts optional scope facts and filters appended coordination trades against included trades when facts are available.
- Finalization passes `ctx.scopeFacts` into the coordination append helper.
- False coordination text from excluded, by-others, protection-only, coordination-only, existing/to-remain, owner/customer-supplied material-only, or boundary-only trade-stack entries is suppressed.
- True mixed renovation coordination remains preserved.
- Duplicate coordination sentence protection remains in place.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts` passed 11/11.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/priceguard/scopeSignals.test.ts` passed 4/4.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 2/2.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a narrow customer-facing coordination text safety gate.
- It intentionally did not change prompts, `effectiveScopeChange`, route/API response shape, pricing formulas, schedule logic, materials generation, `scopeSplitter`, deterministic engines, docs, or global `detectTradeStack` behavior.

Final decision:
- Phase 8D-2 EstimatorScopeFacts coordination text gate passes.
- Next active product-intelligence direction is optional intelligence-layer work around typed scope as the required scope-control anchor. Normal Evidence Authority API, saved estimate, UI, or PDF/customer-output exposure should still wait because exposing it would intentionally change response, saved estimate, and UI shape.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 33 — Phase 8D-3 EstimatorScopeFacts Schedule Rationale Gate

Status: PASS

Scope:
- Phase 8D-3 gated schedule/rationale multi-trade text with EstimatorScopeFacts.
- `estimateCalendarDaysRange()` now accepts optional scope facts.
- `buildScheduleBlock()` accepts optional scope facts.
- Route/orchestrator plumbing passes `ctx.scopeFacts` into schedule construction.
- `multi-trade coordination` schedule/rationale text is now added only when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Polluted upstream `tradeStack.isMultiTrade` or `complexityProfile.multiTrade` no longer creates false multi-trade rationale when shared facts show a single included trade.
- True mixed renovation still preserves multi-trade rationale.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 2/2.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a narrow schedule/rationale text safety gate.
- It intentionally did not change prompts, `effectiveScopeChange`, route/API response shape, pricing formulas, schedule math, materials generation, `scopeSplitter`, deterministic engines, docs, or global `detectTradeStack` behavior.

Final decision:
- Phase 8D-3 EstimatorScopeFacts schedule rationale gate passes.
- Phase 8D-4A route display multi-trade diagnostics gating is complete in the next entry.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 34 — Phase 8D-4A EstimatorScopeFacts Route Display Multi-Trade Diagnostics Gate

Status: PASS

Scope:
- Phase 8D-4A gated route-level display-only multi-trade diagnostics with EstimatorScopeFacts.
- `shouldShowTrueMixedTradeDiagnostic(scopeFacts)` returns true only when `scopeFacts.trueMixedTrades` is true.
- `buildScopeXRay()` now uses that helper before adding `Multiple trades require coordination and sequencing.`
- `buildAreaScopeBreakdown()` now uses that helper before adding `Multi-trade coordination likely`.
- Boundary-only, excluded, by-others, protection-only, existing-to-remain, and owner-supplied trade mentions no longer create those display-only multi-trade diagnostics when shared facts show one included trade.
- True mixed renovation diagnostics remain preserved.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 25/25.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a display-only diagnostic safety gate.
- It intentionally did not change prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildEstimateExplanation`, `buildPhotoEstimateDecision`, or `profitLeakDetector`.

Final decision:
- Phase 8D-4A EstimatorScopeFacts route display multi-trade diagnostics gate passes.
- Phase 8D-4B estimate explanation multi-trade gating is complete in the next entry.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 35 — Phase 8D-4B EstimatorScopeFacts Estimate Explanation Multi-Trade Gate

Status: PASS

Scope:
- Phase 8D-4B gated diagnostic estimate explanation multi-trade text with EstimatorScopeFacts.
- `buildEstimateExplanation()` now receives optional scope facts through the orchestrator.
- `Multiple trades require sequencing and coordination.` is only added when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Polluted upstream `complexityProfile.multiTrade` no longer creates this false explanation for single-included-trade scopes.
- True mixed renovation explanation remains preserved.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 3/3.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 28/28.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a diagnostic estimate-explanation text safety gate.
- It intentionally did not change prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, `buildPhotoEstimateDecision`, or `profitLeakDetector`.

Final decision:
- Phase 8D-4B EstimatorScopeFacts estimate explanation multi-trade gate passes.
- Phase 8D-5A profit leak diagnostics migration is complete in the next entry.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 36 — Phase 8D-5A EstimatorScopeFacts Profit Leak Diagnostics Migration

Status: PASS

Scope:
- Phase 8D-5A migrated diagnostic-only profit leak warnings to EstimatorScopeFacts where safe.
- `detectProfitLeaks()` now accepts optional scope facts.
- Orchestrator now passes `ctx.scopeFacts`.
- Bathroom/wet-area/demo/protection checks use included-work text where facts are present.
- Coordination-load profit leak checks use `scopeFacts.trueMixedTrades` instead of polluted `tradeStack.isMultiTrade`.
- No-facts callers remain backward-compatible.
- False profit leak diagnostics are suppressed for boundary-only, excluded, by-others, protection-only, existing-to-remain, owner-supplied, and coordination-only trade mentions when shared facts show one included trade.
- True mixed renovation, true wet-area remodel, and true demo/removal review behavior remain preserved.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/profitLeakDetector.test.ts` passed 8/8.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/estimateDefenseMode.test.ts` passed 7/7.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/orchestratorEstimateSections.test.ts` passed 3/3.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a diagnostic-only profit leak migration.
- It intentionally did not change photo-estimate decision logic, photo pricing behavior, `derivePhotoPricingImpact`, prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing policy/formulas, materials generation, `scopeSplitter`, deterministic engines, docs, `detectTradeStack`, `buildComplexityProfile`, or `buildPhotoEstimateDecision`.

Final decision:
- Phase 8D-5A EstimatorScopeFacts profit leak diagnostics migration passes.
- Phase 8D-6A photo-estimate decision characterization is complete in the next entry.
- Do not change photo pricing behavior, `pricingAllowed`, blockers, confidence, pricing policy, prompts, `effectiveScopeChange`, `result.text`, or route/API shape without a scoped review.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 37 — Phase 8D-6A Photo-Estimate Decision Characterization Seam

Status: PASS

Scope:
- Phase 8D-6A added characterization coverage for the photo-estimate decision path before any EstimatorScopeFacts migration or behavior change.
- Pure photo-estimate decision helpers were extracted from `route.ts` into `routePhotoEstimateDecision.ts`.
- `route.ts` now imports and calls the extracted helpers.
- `routePhotoEstimateDecision.test.ts` was added and passes 9/9.
- This was characterization/test-seam work only; no EstimatorScopeFacts gating or behavior fix was implemented.

Current behavior characterized:
- Polluted `tradeStack.isMultiTrade` still adds `Multiple trades were detected, which increases pricing risk.`
- Polluted multi-trade signals can still force `measurements` into `missingInputs`.
- Electrical owner-supplied fixture wording can count as usable electrical device quantity.
- Plumbing `by others` fixture wording can count as usable plumbing fixture quantity.
- Carpentry/baseboard LF is recognized, but polluted multi-trade stack can still block photo-only pricing through measurement-heavy logic.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePhotoEstimateDecision.test.ts` passed 9/9.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 28/28.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a behavior-preserving characterization seam.
- It intentionally did not change photo pricing behavior, `derivePhotoPricingImpact`, `pricingAllowed`, blockers, confidence, confidenceBand, estimateMode, pricing policy, prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, payment, or auth code.

Final decision:
- Phase 8D-6A photo-estimate decision characterization seam passes.
- Phase 8D-6B photo-estimate decision reason-text gate is complete in the next entry.
- Deferred photo behavior items remain pricing/policy-adjacent: polluted multi-trade signals can still affect confidence penalty and measurement-heavy behavior, and raw owner-supplied / by-others quantity parsing remains unchanged.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 38 — Phase 8D-6B EstimatorScopeFacts Photo-Estimate Reason Text Gate

Status: PASS

Scope:
- Phase 8D-6B gated the photo-estimate decision multi-trade reason text with EstimatorScopeFacts.
- `buildPhotoEstimateDecision()` now accepts optional scope facts.
- `route.ts` passes existing `scopeFacts` into the photo estimate decision.
- `Multiple trades were detected, which increases pricing risk.` is only added when facts are absent for backward compatibility or `scopeFacts.trueMixedTrades` is true.
- Boundary-only / polluted multi-trade stacks no longer create that reason text when shared facts show one included trade.
- True mixed renovation and no-facts behavior still keep the reason.

Validation:
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePhotoEstimateDecision.test.ts` passed 12/12.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routePromptAdjacentDiagnostics.test.ts` passed 14/14.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/api/generate/lib/estimator/routeDisplayDiagnostics.test.ts` passed 28/28.
- `node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs --test app/app/lib/estimator-scope-facts.test.ts` passed 9/9.
- `npm run test:estimator -- app/app/lib/scope-quality-check.test.ts app/app/lib/priceguard-review.test.ts` passed 41/41.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

Architecture safety:
- This was a reason-text-only cleanup.
- It intentionally did not change photo pricing behavior, `pricingAllowed`, blockers, confidence, confidenceBand, estimateMode, pricingPolicy, `missingInputs`, `derivePhotoPricingImpact`, confidence penalty from `tradeStack.isMultiTrade`, measurement-heavy behavior, raw quantity parsing, prompts, `effectiveScopeChange`, `result.text`, route/API response shape, pricing formulas, materials generation, `scopeSplitter`, deterministic engines, docs, UI, payment/auth, `detectTradeStack`, or `buildComplexityProfile`.

Final decision:
- Phase 8D-6B EstimatorScopeFacts photo-estimate reason text gate passes.
- Phase 8D scope-boundary text/diagnostic cleanup is substantially complete.
- Deferred photo behavior items remain pricing/policy-adjacent: polluted multi-trade signals can still affect confidence penalty and measurement-heavy behavior, and raw owner-supplied / by-others quantity parsing remains unchanged.
- Next active product-intelligence direction should be optional intelligence-layer work around typed scope as the required scope-control anchor. Normal Evidence Authority API, saved estimate, UI, or PDF/customer-output exposure should still wait because exposing it would intentionally change response, saved estimate, and UI shape.
- Production Live Mode subscription verification remains the final pre-launch gate only.

---

# Test Entry 39 — UI-Only Estimator Review Noise Reduction Status

Status: CODE-CHECKED; browser/mobile visual QA still needed

Scope:
- `EstimatorReviewSummaryPanel` is now the primary estimator review hub.
- `CustomerOutputReadinessPanel` moved below Estimator Review Summary and Quick Clarifications.
- Customer Output Readiness is now compact/collapsed by default, but still auto-opens for critical unsupported trade/scope drift.
- Quick Clarifications remains under the estimator review flow and shows `Clarifications answered on this screen — price unchanged` when answered.
- Estimator review details remain available below.
- PriceGuard Review remains inside collapsed estimator review details.
- Estimator Diagnostics remains collapsed.
- Nested diagnostics such as Scope-to-Price X-Ray, Materials List, Area Scope Breakdown, and Profit Protection are collapsed by default.
- Relevant estimator-only review/diagnostic panels remain `data-no-print`.

Validation:
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- No browser/mobile visual QA was run for this entry.

Architecture safety:
- This was UI/client-only and reduced duplicate review messaging without removing safety checks.
- It did not change backend routes, estimator runtime files, `/api/generate` response shape, saved estimate/history shape, PDFs/customer output, pricing, `pricingSource`, pricing owner behavior, prompts, `effectiveScopeChange`, `result.text`, materials generation, deterministic engines, `scopeSplitter`, `detectTradeStack`, `buildComplexityProfile`, billing/auth, or deployment.
- Smart Questions answers remain local-only, are not sent to `/api/generate`, are not saved to history/localStorage, are not included in PDFs/customer output, and remain non-pricing-authoritative.
- Evidence Authority remains internal/debug-only and was not exposed in normal UI.

Next QA:
- Run browser/mobile visual QA for the reduced Estimator Review flow, especially simple typed-only estimates and plan/photo-assisted estimates.
