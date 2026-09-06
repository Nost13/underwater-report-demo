# Report Usability Follow-up Implementation Plan

## Context

Implement the user-approved follow-up changes on top of commit `db34c4f`. The existing report builder, design language, template geometry, template fonts, document order, and local-only data handling remain authoritative.

## Global Constraints

- Preserve the current visual design language; make only targeted sizing and label changes.
- Preserve every supplied Word template's fonts, table geometry, and section order.
- Job No remains uppercase and the output filename convention remains `<JOB NO>_<VESSEL NAME>_Underwater service report(Detail).docx`.
- Berthing Side must never display or export the abbreviations `P`, `S`, `PORT`, or `STBD`; the visible/exported values are exactly `PORT SIDE` or `STBD SIDE`, with blank allowed.
- Keep the internal `NicheType` values unchanged for compatibility. Only user-facing labels become Korean.
- User-facing Niche type labels are exactly `단일`, `좌우 구분`, `수량 구분`, and `좌우+수량 구분`; provide an accessible `?` help affordance explaining the generated sections.
- Personnel Deployed is composed from three editable categories and exports in this order: `SITE SUPERVISOR : <value> / DIVER : <value> / OTHER : <value>`. Omit empty categories and separators around them.
- Selecting/removing qualification records updates the editable Diver count to the selected-person count. The user may still edit the count afterward.
- Cover photo drag must pan the image itself in the direction of the pointer while zoom and keyboard controls remain available. Preview and Word export must use the same crop state.
- Follow TDD: add a focused failing regression test and confirm the expected failure before production code for every behavior change.
- Do not publish from implementation or review subagents. Final deployment is performed by the root agent after all reviews and QA pass.

## Task 1: Standardize Side, Niche Labels, Buttons, and Personnel

### Requirements

1. Add a shared berthing-side formatter that maps `P`, `PORT`, `PORT SIDE` to `PORT SIDE`, and `S`, `STBD`, `STARBOARD`, `STBD SIDE`, `STARBOARD SIDE` to `STBD SIDE`; blank remains blank.
2. Normalize ChainPortal schedule ingestion, the schedule card display, Report Information input, Position derivation, and Section 1-4 Word output. Change Berthing Side to an editable select with blank, `PORT SIDE`, and `STBD SIDE` choices.
3. Replace visible Niche type enum labels with the four Korean labels from Global Constraints while preserving the enum values. Add a keyboard-accessible `?` help element with a concise explanation of SINGLE/SIDE/QUANTITY behavior.
4. Increase the locked scope-ready action buttons to a clearly clickable size without changing the surrounding design system or creating overflow at supported 1024px desktop width.
5. Replace the single Personnel Deployed text field with three editable inputs: Site Supervisor, Diver, Other Personnel. Maintain the composed `operation.personnel` string using the exact output contract above.
6. Qualification add/remove updates Diver count and the composed text. Existing Section 8 qualification output remains selected-record-only.
7. Add/update unit and component tests covering all normalization mappings, Korean labels/help, button affordance, personnel composition/omission, qualification synchronization, and Section 1-4 Word cell output.

## Task 2: Make Cover Photo Drag a Real Pan Interaction

### Requirements

1. Replace absolute click-to-focus drag behavior with pointer-delta panning. Dragging the pointer right/down moves the visible photo right/down, clamped to valid crop bounds.
2. Preserve zoom range, keyboard arrow adjustment, file replacement, reset defaults, and object URL lifecycle.
3. Keep the preview crop calculation and `renderCoverPhoto` Word rasterization driven by the same `CoverCrop` state.
4. Use a grab/grabbing cursor and retain focus-visible keyboard accessibility.
5. Add focused tests that first fail on the current behavior, then verify pointer direction, clamping, keyboard control, and Word crop consistency.

## Final QA and Deployment

1. Run the full unit suite, ESLint, TypeScript, portable production build, and supported-width browser checks.
2. Generate a real report DOCX with side/personnel/cover test data, render it through the bundled document renderer, and inspect every page at 100%.
3. Run an independent whole-branch review.
4. Push the reviewed commit to `main`, wait for GitHub Pages success, and verify the public site and browser console.
