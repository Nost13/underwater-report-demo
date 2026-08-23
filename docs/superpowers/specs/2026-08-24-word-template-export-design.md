# Word Template Report Export Design

## Goal

Generate a downloadable `.docx` report in the browser from the supplied Detail Service Record template. The export must preserve the template's header and footer and write the selected report data and photos into its placeholders without sending report data or photos to a server.

## Output model

The report is generated in Section order. For a normal service, each Section produces all BEFORE template pages first and then all AFTER template pages. Inspection produces CURRENT template pages only.

Each Phase uses its own copy of the template:

- Photos 1–4 fill `P1`–`P4` on the first template page.
- Photos 5–10 fill `P5`–`P10` across the continuation page.
- For more than ten photos, continuation pages repeat in groups of six and use the same visual layout as the template's second page.
- A phase with no Report Use photo generates no page.

This phase-first Word layout intentionally supersedes the existing combined BEFORE/AFTER preview pagination. The interactive report input remains phase-specific; the Word export is the source of truth for final page sequencing.

## Template mapping

The template is stored as a bundled private app asset and is copied in memory for every export. Users do not upload a template and no source document is mutated.

| Template placeholder | Value |
|---|---|
| `{{BC}}` for NICHE | `NICHE AREAS & COMPONENTS / {COMPONENT}` |
| `{{BC}}` for GENERAL | `GENERAL AREAS / {ZONE}` |
| `{{SIDE_LABEL}}` | `PORT SIDE`, `STBD SIDE`, `BOTTOM`, or blank for side-less components |
| `{{TITLE}}` | `{component or zone}{ unit if present } ({Before|After|Current})` |
| `{{WORK}}` | human readable service scope, for example `Propeller Polishing` |
| `@FR` | phase Fouling rating (R prefix omitted to match source template) |
| `{{FT}}` | phase Fouling type |
| `{{FC}}` | actual entered surface coverage, including `%` |
| `@OR` | phase Observed rating (R prefix omitted) |
| `{{OL}}` | phase Observed level |
| `{{OT}}` | phase Observed type, or `-` when blank |
| `{{P1}}`–`{{P10}}` | Report Use photos in phase order |

## Condition rules

Fouling is entered as an actual numeric percentage from 0 through 100. The exporter and UI derive the matching macro condition:

| Rule | Type | Rating |
|---|---|---|
| 0% | Clean / No Fouling | R0 |
| Slime Only selected, 1–100% | Micro fouling | R1 |
| 1–5%, not Slime Only | Light Macro fouling | R2 |
| 6–25% | Medium Macro Fouling | R3 |
| 26–50% | Heavy Macro fouling | R4 |
| 51–100% | Severe Macro Fouling | R5 |

Slime Only remains a separate toggle because its percentage range overlaps macro-fouling ranges. Observed rating is derived from the selected observed level. Observed defaults to Normal / Trace (R1); a blank observed type exports as `-`.

## Browser-only generation

The implementation uses a ZIP/OOXML writer in the client. It reads the bundled `.docx`, replaces split text placeholders in Word XML, inserts sequentially resized JPEG image parts and relationships for the photo slots, appends required continuation-page blocks, and downloads a new `.docx` Blob.

Header, footer, theme, document metadata, styles, and all template artwork remain in the copied package unchanged. Image processing is sequential and uses local File references; no Base64 source images are kept in report state.

## User experience

The final stage becomes `Word 보고서 다운로드`. It shows that the official Detail Service Record template is active, the number of generated phase pages, and a single primary download button. The existing report preview can remain as an on-screen work check, but its copy must indicate that the Word report is phase-first.

## Error handling

- A missing bundled template, invalid template package, or unfilled required image relationship fails the export with a readable local-only error.
- An unreadable photo is skipped, recorded by filename, and reported after download.
- QA continues to flag missing phase photos and invalid/missing conditions before export.

## Verification

- Unit-test every placeholder mapping and percentage-to-condition boundary.
- Test phase-first page grouping: 4, 5, 10, and 11 photos.
- Create a representative DOCX from fixture image files, inspect its OOXML for unchanged header/footer and populated placeholders, and render it when a compatible renderer is available.
- Test the UI export action with a stubbed writer and run the existing 1440px browser workflow.
