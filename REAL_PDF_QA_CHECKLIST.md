# Real PDF QA Checklist

Use this checklist to test actual contractor plan sets consistently before adding more Plan Intelligence logic. The goal is to verify upload usability, selected-page behavior, fallback clarity, estimator diagnostics, and contractor trust without changing pricing behavior.

Do not treat Plan Intelligence quantity candidates as measured takeoff support. Do not promote plan-derived candidates into pricing from this QA pass.

## 1. Test Plan Set Info

- Project name:
- PDF/file name:
- Trade being tested:
- Total PDF pages:
- Selected pages:
- Device/browser:
- Desktop or mobile:
- PDF quality notes:
  - Vector/text PDF, scanned PDF, mixed, rotated sheets, low resolution, password protected, large file, or other:
- Tester:
- Date:

## 2. Upload / Page Selection QA

Check each item:

- [ ] Page count detected correctly.
- [ ] Range selection works.
- [ ] Selected pages are clear.
- [ ] Selected-page count is visible.
- [ ] Estimated selected upload size is visible.
- [ ] Large-plan readiness guidance appears when appropriate.
- [ ] Warning does not feel too aggressive.
- [ ] User understands selected pages control what Plan Intelligence reads.

Notes:

```text

```

## 3. Selected-Page / Fallback QA

Test whichever paths are practical for this PDF/device combination.

- [ ] Browser-derived selected-page path works when available.
- [ ] Server-derived selected-page path works when browser reduction is unavailable or too large.
- [ ] Original fallback path works when selected-page derivation fails.
- [ ] Source page numbers are preserved in readback.
- [ ] Unselected pages are not treated as read/analyzed.
- [ ] Fallback messaging is understandable.
- [ ] Generate continues when fallback is expected.

Observed upload path:

- Browser-derived selected pages: yes/no/not tested
- Server-derived selected pages: yes/no/not tested
- Original fallback: yes/no/not tested

Notes:

```text

```

## 4. Plan Review Summary QA

Check whether the estimator-facing summary is clear and compact.

- [ ] Pages read section is clear.
- [ ] Extracted plan data section is clear.
- [ ] Review-only quantity signals section is clear.
- [ ] `Pricing-eligible now: 0` is visible when candidate gates are present.
- [ ] Review-only language is understandable.
- [ ] Diagnostic counts are not too noisy.
- [ ] Nothing implies plan candidates changed pricing.
- [ ] Nothing implies measured takeoff support when measurements are not present.

Notes:

```text

```

## 5. Plan Intelligence Diagnostics QA

For each diagnostic type, mark one status and add notes.

| Diagnostic | Useful | Noisy | Missing | Confusing | Notes |
| --- | --- | --- | --- | --- | --- |
| Page read statuses | [ ] | [ ] | [ ] | [ ] | |
| Sheet classifications | [ ] | [ ] | [ ] | [ ] | |
| Tables/schedules | [ ] | [ ] | [ ] | [ ] | |
| Room/finish matrices | [ ] | [ ] | [ ] | [ ] | |
| Repeated room packages | [ ] | [ ] | [ ] | [ ] | |
| Trade quantity candidates | [ ] | [ ] | [ ] | [ ] | |
| Candidate gates | [ ] | [ ] | [ ] | [ ] | |

Most useful diagnostic:

```text

```

Most confusing diagnostic:

```text

```

## 6. Real Contractor Trust Questions

Answer from the contractor's point of view.

- Would a contractor understand what the app read? yes/no/unsure
- Would a contractor know what still needs review? yes/no/unsure
- Would a contractor trust the estimate more after seeing this? yes/no/unsure
- Does anything look like it is pretending to be a measured takeoff? yes/no
- Does anything make it seem pricing changed from plan candidates? yes/no

Trust notes:

```text

```

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

```text

```

## 8. Pass / Needs Work / Fail Rating

| Major Area | Pass | Needs Work | Fail | Notes | Screenshots Taken? |
| --- | --- | --- | --- | --- | --- |
| Upload/page selection | [ ] | [ ] | [ ] | | yes/no |
| Selected-page/fallback behavior | [ ] | [ ] | [ ] | | yes/no |
| Source page provenance | [ ] | [ ] | [ ] | | yes/no |
| Plan Review Summary clarity | [ ] | [ ] | [ ] | | yes/no |
| Diagnostic usefulness | [ ] | [ ] | [ ] | | yes/no |
| Review-only/pricing clarity | [ ] | [ ] | [ ] | | yes/no |
| Mobile usability | [ ] | [ ] | [ ] | | yes/no/not tested |
| Overall contractor trust | [ ] | [ ] | [ ] | | yes/no |

## 9. Issues Found

| Issue | Severity | Screenshot/reference | Suggested fix | Code area likely involved | Fix now or later |
| --- | --- | --- | --- | --- | --- |
| | Low/Medium/High/Launch-blocking | | | | Now/Later |

Severity guidance:

- Low: copy polish, small spacing issue, or minor confusion.
- Medium: repeated confusion, noisy diagnostics, or mobile friction that slows testing.
- High: selected pages/fallback behavior is unclear, diagnostics imply unsupported confidence, or source page provenance is wrong.
- Launch-blocking: unselected pages appear analyzed, pricing appears changed from review-only candidates, paid billing verification fails, customer-facing output exposes estimator-only diagnostics, or Generate fails for realistic selected-page PDFs.

## 10. Final QA Decision

- Good enough for launch testing? yes/no
- Needs UI copy polish? yes/no
- Needs real logic fix? yes/no
- Needs upload/fallback fix? yes/no
- Needs Plan Intelligence extraction improvement? yes/no
- Do not promote plan candidates into pricing yet: yes/no

Final decision notes:

```text

```

Recommended next action:

```text

```
