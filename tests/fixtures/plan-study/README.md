# Authored Plan Study package

These are small, authored synthetic QA documents, not customer documents or construction instructions. No provider generated them. Model findings used in offline route/browser checks are explicitly synthetic responses; the PDFs themselves go through real physical-page inventory, text extraction and image rendering.

The package contains six physical pages in four files:

| File | Pages | Authored expected observations |
| --- | --- | --- |
| 01-authored-synthetic-plans.pdf | 2 | F101 paints Rooms 101/102 and assigns WC-1 to Room 103. A201 points to missing A602 and retains GC access coordination. Flooring/electrical are by others. |
| 02-authored-synthetic-specifications.pdf | 2 | Painting requires patch/sand/spot-prime/two coats. Owner color approval is unresolved. Wallcovering requires moisture verification and a layout submittal; substrate replacement remains excluded. |
| 03-authored-synthetic-addendum.pdf | 1 | ADD-1 changes Room 102 to WC-2, conflicting with the still-issued F101 PT-1. The briefing must preserve the conflict and request clarification. |
| 04-authored-synthetic-unreadable-scan.pdf | 1 | Obscured raster marks without an extractable text layer. Rendering is possible; substantive readability is not established. |

`03-authored-synthetic-addendum-replacement.pdf` is a replacement version, not an additional package page. It withdraws WC-2 and directs PT-1. Decisions depending on the old source need reconfirmation; their saved answers must remain separate from source requirements and Estimate wording.

`authored-package.ts` is the generator and exports authored expected observations, which have not been human-reviewed as an accuracy benchmark. Nothing supplies measured takeoff or approved pricing. The later 24/48-page human-reviewed accuracy benchmark remains separate.
