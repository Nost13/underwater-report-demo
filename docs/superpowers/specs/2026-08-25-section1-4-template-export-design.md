# Section 1–4 Template Export Design

## Goal

Use the supplied `section1_4_template.docx` as the first part of the browser-generated underwater-service report. The user can review and edit vessel and operational details in the web app; those values are written into the template without changing its header, footer, fonts, or layout.

## Template map

The source is an example-filled DOCX rather than a placeholder document. The writer will therefore update fixed table cells in its stable Section 1–4 layout.

| Report area | Web input / source |
| --- | --- |
| General information | Vessel name, IMO, call sign, vessel type, LOA, breadth, GT, DWT, year built, owner/client, job number |
| Operational information | ETA, ETD, work window, location, operation start/end/time, position, draft, berthing side, weather, knots, current, visibility, personnel |
| Service items | Each selected service scope, including Inspection and Polishing as separate rows |
| Safety and readiness | Toolbox/LOTO time and note; preparation-on-site time and note |
| Header | Job number and vessel name only; preserve all other header/footer formatting and page fields |

## Vessel lookup

The existing application has only a local demo Vessel DB and no live vessel-service credentials or API implementation. The lookup remains IMO-based and pre-fills whatever values are held locally. Every field remains editable so incomplete records do not block a report. The model is intentionally shaped so a real vessel API can later replace the local lookup without changing the form or DOCX mapping.

## Output

`section1_4_template.docx` is bundled as a private application asset. The browser clones it, fills the map above, and combines it before the existing Detail Service Record output. No report information or photos are sent to a server. The original template file is never mutated.

## Constraints

- Keep the template's original fonts, header, footer, page size, and styles.
- The existing detailed-service pages remain phase-first: BEFORE then AFTER, and CURRENT for Inspection.
- Preserve the user’s selected Section order when writing service items and detail pages.
- Keep all values locally in the browser.

