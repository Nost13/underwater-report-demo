# Report Editing and Word Fidelity Design

## Objective

Make photo assignment, personnel selection, operational inputs, and final Word output match the operator's workflow and the supplied company-form references. The web editor remains the source of truth; Word generation consumes the same state without hidden transformations that change order or layout.

## Scope

This change covers:

1. Enter-to-select in the diver search.
2. A visual `미배정 사진` workflow with thumbnails and useful folder context.
3. Drag reordering within an assigned phase.
4. Returning an assigned photo to `미배정 사진` instead of removing the imported file.
5. Operational-information layout and time formatting.
6. Section 4 defaults and four fixed photo slots.
7. Section 5 template-fidelity repair.
8. Uppercase `WORK PERFORMED` composition.
9. Per-photo supplemental captions and raised separators.
10. Larger fixed-cell vessel diagrams and a Word-ratio preview.
11. Job-number/vessel-name Word file naming.

## Chosen Approach

Extend the current report state and template-aware Word writers. Do not introduce a parallel editor or replace the existing matching, pagination, or template merge flow. This keeps one data model for the web UI, preview, and exported document.

## Data Model

### Assigned photos

`PhotoData` gains a per-photo `captionText` string. Empty text means the generated base caption is used unchanged.

The report reducer gains explicit actions for:

- updating a photo caption;
- reordering a photo within the same section and phase;
- unassigning a photo.

The existing imported `File`, `relativePath`, and `order` remain intact when a photo is unassigned. Order values are normalized after a reorder so pagination and caption numbering use the visible order.

### Section 4 photos

Readiness information gains two fixed two-slot collections:

- Toolbox Meeting & LOTO: 2 photos;
- Preparation on Site: 2 photos.

Each slot stores either a local `File` or no file. Replacing or clearing a slot does not change the text fields.

### Work performed labels

Each section phase stores two editable values:

- the main performed-work label, initially derived from the component and service;
- the phase label, initially `BEFORE`, `AFTER`, or `CURRENT`.

The exported value is composed as `MAIN WORK | PHASE`, with both values uppercased. The phase may be edited independently without changing the main work label.

## Web Interaction Design

### Diver search

Pressing Enter selects the first visible, unselected search result. Enter does nothing when there is no result and never submits or advances the page.

### Unassigned photos

All user-facing `UNMATCHED` labels become `미배정 사진`. The drawer uses thumbnail cards rather than filename-only rows. Each card shows:

- thumbnail;
- filename;
- the last two directory names before the filename.

For `1/2/3/image.jpg`, the displayed location is `2 > 3`. If only one directory exists, show that one. If no directory exists, show `선택한 폴더 바로 아래`.

Clicking a card assigns it to the currently selected phase. The assigned-photo action currently called `삭제` becomes `미배정으로 이동` and dispatches unassignment. No permanent-delete control is included in this scope.

### Photo ordering and captions

Assigned photo cards have a visible drag handle. A photo may be reordered only within its current section and phase. The dragged card and drop target have clear visual states. Existing move-to-section controls remain available.

Each assigned card has an optional `추가 캡션` input. The web caption preview updates immediately.

### Operational information

The form is divided into two fixed rows matching the supplied reference:

- `VESSEL SCHEDULE`: ETA, ETD, Work Window, Location;
- `OPERATION RECORD`: Start, End, Working Time, Position.

ETA, ETD, Start, and End use date-time inputs. The remaining vessel/site fields continue below without adding empty paragraph-like spacing.

Time rules:

- Work Window uses the whole-hour portion of ETA-to-ETD and appends a fixed allowance: `16 Hours + 1 Hrs`.
- Working Time uses exact elapsed hours and minutes: `0 Hrs 49 Min`.
- Invalid or incomplete pairs leave the derived value unchanged so manual correction remains possible.

### Section 4

Default notes are:

- Toolbox: `No safety concerns noted before operation .`
- Preparation: `No abnormal conditions observed at site.`

The UI shows two fixed image slots under each record. Each slot supports select, thumbnail preview, replace, and clear.

### Vessel diagram preview

The editor shows an additional fixed-aspect preview representing the Word table image area. It uses the current vessel image, hull crop, selected marker group, and callout composition. This preview does not change the saved geometry; it is a print-placement check.

## Word Output Design

### Operational information

Dates render as `01 Sep 2026,` followed by a line break and `01:36` in the same table-cell paragraph. No trailing empty paragraph is inserted. Work Window and Working Time use the web-derived values exactly.

### Section 4

The writer fills the existing text cells without changing template fonts. The four readiness photos are inserted into their designated fixed cells, two per subsection. Images are fitted within those cells without changing row or table dimensions.

### Section 5

The supplied summary template remains structurally intact. The writer updates only intended text, rating colors, and diagram/matrix values. It must not delete template rows, append duplicate headings, grow fixed tables, or introduce a blank page. Missing matrix areas stay blank.

The expected visual baseline is the supplied complete Section 5 page: 5.1 followed by 5.2, the fixed vessel overview diagram, rating legend, and findings matrix.

### Work performed

The heading label is `WORK PERFORMED`. Content is uppercase and ordered as main work, separator, phase, for example:

`ROPE REMOVAL | BEFORE`

The separator is its own Word run with `<w:position w:val="2"/>`, which raises it by 1 pt. Spaces remain on both sides.

### Photo captions

Without supplemental text, export only the base caption. With supplemental text, export:

`Base Caption | Supplemental Text`

The separator is a dedicated raised-by-1-pt run, matching the Work Performed separator. Existing template caption font properties are preserved for all runs.

### Vessel diagram sizing

The Word table and row sizes remain fixed. The composed image trims external whitespace and uses the largest aspect-preserving size that fits the existing image cell while retaining every selected marker/callout. Increasing the image must never resize the table or clip a marker.

### File name

The downloaded file name is:

`JOB NO._VESSEL NAME_Underwater service report(Detail).docx`

Example:

`US-CLS-2608007_MSC JAVELIN IX_Underwater service report(Detail).docx`

Invalid Windows filename characters are removed, while the Job No. capitalization is preserved.

## Error Handling

- Enter with no diver result has no effect.
- Reorder actions targeting another phase are rejected by the reducer.
- Missing readiness photos leave their slots blank and do not stop export.
- Invalid image data follows the existing skipped-photo reporting path.
- Diagram composition failures continue to direct the user back to the vessel editor.
- Missing Job No. or vessel name falls back to the existing safe report filename rather than producing an invalid name.

## Verification

Implementation follows test-first development. Required coverage includes:

- diver Enter selection and empty-result behavior;
- folder-label extraction;
- unassign preservation of File and path;
- same-phase reorder and cross-phase rejection;
- custom-caption composition with and without text;
- Work Window and Working Time formatting;
- Section 4 defaults and two-slot limits;
- Word separator run position of 2 half-points;
- Word filename generation;
- Section 4 photo-cell insertion;
- Section 5 heading, table, and page-structure preservation;
- fixed vessel-diagram cell dimensions and preview composition.

After unit and integration tests, build the portable site, deploy through the existing GitHub Pages workflow, and verify the public asset and deployment commit.
