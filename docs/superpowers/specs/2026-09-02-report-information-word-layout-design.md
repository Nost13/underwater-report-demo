# Report Information and Word Layout Design

## Goal

Improve the report workflow and generated Word document without changing the supplied template typography or its visual language.

This change covers five connected issues:

1. Remove the unintended blank detail page caused by duplicated page-start controls.
2. Let the composed vessel diagram occupy the template image rectangle more fully without distorting or cutting off the ship or markers.
3. Add a dedicated web step for the Section 1–4 operational information fields.
4. Keep the service name in `WORK PERFORM` and add a separately editable phase/supporting label such as `Before` or `After`.
5. Reduce vessel-diagram resize handles so the center of circular markers remains easy to target.

## Workflow

Insert **Report Information** immediately after **Vessel / Scope**.

The resulting order is:

1. Vessel / Scope
2. Report Information
3. Vessel Diagram
4. Photo Folder
5. Report Input
6. Preview
7. Word Export

The Report Information step uses the existing application design system and responsive layout. On narrower screens, fields wrap into two rows instead of becoming narrow vertical controls.

## Report Information Fields

The new page exposes the existing Section 1–4 data model already consumed by the Word writer:

- Vessel schedule: ETA, ETD, work window, location
- Operation record: start, end, working time, position
- Vessel and site: draught FWD/MID/AFT, berthing side, weather, knots, current, visibility
- Personnel deployed
- Existing toolbox/preparation fields used by the Section 1–4 template

Vessel lookup data remains prefilled where available. Owner/client and Job No. remain manually editable. Job No. preserves the exact entered capitalization. Empty optional fields remain blank in Word rather than receiving invented values.

## WORK PERFORM and Phase Label

`WORK PERFORM` retains its original service meaning. Examples are `Removal`, `Inspection`, and `Polishing`.

The phase/supporting label is a separate value displayed next to the service value:

- Default supporting label: `Before` or `After`, based on the page phase
- Editable in the web interface
- May be replaced with another phrase or left blank
- Does not overwrite or replace the service name

Example output:

`WORK PERFORM  Removal  Before`

The left page title no longer repeats the phase in parentheses:

- Existing format: `ROPE GUARD (Before)`
- Revised format: `ROPE GUARD`

The supporting label is stored per Section + Phase and is shared by continuation pages for that same photo group, so a multi-page group remains consistent. The service name continues to come from the Section service.

The web editor shows two clearly separated controls:

- Work performed: the current service name, normally derived from the scope
- Additional label: editable text defaulting to Before/After

## Word Pagination

The merge between Section 1–4 and detailed pages must contain exactly one page-start mechanism.

The detailed page's existing `pageBreakBefore` remains authoritative. The extra explicit page-break paragraph inserted during package merge is removed. This avoids a blank page while preserving a clean page boundary and the template headers/footers.

Regression tests will inspect the merged OOXML to ensure:

- the first detailed page still starts on a new page;
- there is no duplicate explicit page-break paragraph at the merge boundary;
- page numbering and headers remain intact.

## Vessel Diagram Fill

The web editor keeps its current coordinate frame and placement behavior. Word export performs an output-only fit step after composing the ship image and all markers:

1. Detect unused transparent or near-white outer margins in the flattened composition.
2. Retain a small safety margin around all visible ship and marker content.
3. Fit the trimmed composition into the template rectangle while preserving aspect ratio.
4. Fall back to the current composition unchanged if reliable content bounds cannot be detected.

The output must never stretch the ship, crop a marker, or change the saved web positions. This change affects Word rendering only.

## Vessel Diagram Editing Handles

Resize handles remain visible only for selected markers. Their visible square and pointer hit area are reduced so they do not obstruct the circular marker center:

- visible corner square: approximately 8 px overall;
- pointer target: approximately 24 px;
- circular markers remain circular unless the user explicitly changes their shape;
- multi-selection and equal-size functions continue to work.

Bilge-keel markers retain their specialized non-circular behavior.

## Data and Compatibility

Existing saved work without the new additional-label field remains valid. On load, missing values are derived from the phase (`Before`/`After`). Export uses a non-empty user override when present and otherwise uses that derived default.

No template font family, font size, run styling, or Job No. capitalization is normalized by the code. Only the intended text values, page boundary, and image content are changed.

## Verification

Implementation is complete only when all of the following pass:

- unit tests for label defaults, overrides, continuation-page consistency, pagination, and image trimming;
- existing unit and integration tests;
- lint and production build;
- browser tests for the new Report Information step and editable supporting label;
- browser regression for vessel marker selection and reduced handles;
- generated DOCX structural inspection confirming one page boundary and correct template replacements;
- visual inspection of the browser preview and, where a Word-compatible renderer is available, the rendered DOCX pages.
