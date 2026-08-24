# Report Scale, Assignment, and Word Output Design

## Goal

Make scope assignment reversible with one click, keep photo import deterministic, scale Report Input to 50–60 sections, and make the generated Word report continuous and faithful to the bundled template.

The browser remains local-only: vessel lookup is for confirmation, while report data and photos stay in the active browser session.

## Confirmed behavior

### 1. Service / Scope target toggle

- Clicking a target with the active service absent adds that service.
- Clicking the same target again with the same active service present removes only that service.
- Other services already assigned to the target stay intact so combined scopes remain possible.
- The separate plus button is removed because the target click now performs both add and remove.
- Service chips continue to show all assigned services and may also remove their own service.
- Preset controls retain their current bulk-apply and bulk-clear behavior.

### 2. Folder-based auto matching

- Import always attempts exact path matching, regardless of whether the app created the folder tree.
- A selected folder that already contains the standard hierarchy is treated the same as an app-created hierarchy.
- Valid forms remain:
  - `SECTION/COMPONENT[/SIDE][/UNIT]/PHASE/file`
  - `SERVICE/SECTION/COMPONENT[/SIDE][/UNIT]/PHASE/file` where service is required to remove ambiguity.
- A path is matched only when it resolves to exactly one current report section and one valid phase.
- Incomplete, misspelled, ambiguous, and unknown paths remain `UNMATCHED`; the app never guesses.
- Import status reports the total, automatically matched, and unmatched counts, and explicitly states when standard paths were detected.

### 3. Scalable section navigation

Use a bounded navigator rather than rendering every section as one horizontal strip.

- Keep previous and next buttons.
- Show `SECTION n / total` at all times.
- Show only the active section and a small neighboring window.
- Add an `전체 Section` button that opens a searchable popover.
- Group the full list by service and component and show concise side/unit labels.
- Selecting an item closes the popover and focuses that section.
- This is preferred over a permanent sidebar because it preserves the photo workspace width, and over paged tab groups because search reaches any of 50–60 sections in one action.

### 4. Photo grid

- The large desktop layout displays at most five photo cards per row.
- It responsively reduces to four or three cards as available width shrinks, including when the unmatched drawer is open.
- It never renders more than five columns.

### 5. Phase assignment target

- Clicking non-interactive background space anywhere in a `BEFORE`, `AFTER`, or `CURRENT` phase panel selects that phase as the photo assignment target.
- Clicking inputs, selects, photo actions, toggles, or other controls performs only the control action and does not trigger the panel click.
- The phase panel supports keyboard selection through its focusable header/selection control.
- The selection control uses a strong phase-specific filled color and clear selected text.
- The full panel receives the same selected-state tint and border so the target is visible without relying on a small button.

### 6. Continuous Word pages

- Generated report bodies are joined without an intervening page-break paragraph that can spill onto a blank page.
- The first paragraph of every body after the first receives `pageBreakBefore`, so every report body starts on a fresh page without consuming an extra layout paragraph.
- The output retains exactly one final `sectPr`.
- Header and footer parts remain unchanged.

### 7. Empty Word photo slots

- An unused gray photo cell remains gray and empty.
- Its corresponding caption cell displays `N/A` using the caption token's existing run formatting.
- A photo that fails during export is also treated as an unused slot and receives `N/A`.

### 8. Configurable report labels

Report labels are stored per area/component group and apply to all sides, units, phases, and services for that physical component.

Each group has three editable values with generated defaults:

- `Upper area label`: the text appended after the slash in `{{BC}}`.
- `Detail title`: the base text used by `{{TITLE}}`.
- `Photo caption`: the text written into `{{P1}}` through `{{P10}}`.

The Report Input header includes a compact `보고서 표기 설정` action. Its popover shows the three fields plus a live Word-output preview. Changes apply immediately to the component group.

Confirmed Propeller Blade defaults:

- Upper area label: `PROPELLER`
- Detail title: `PROPELLER BLADE`
- Photo caption: `Propeller Blade`

Example:

```text
NICHE AREAS & COMPONENTS / PROPELLER

PROPELLER BLADE 1 (Before)       WORK PERFORM  Polishing
```

The photo caption is `Propeller Blade`.

For a one-phase Inspection section, `CURRENT` is not printed in the title:

```text
NICHE AREAS & COMPONENTS / ROPE GUARD

ROPE GUARD                       WORK PERFORM  Inspection
```

`(Before)` and `(After)` remain for two-phase services.

### 9. Template typography and protected parts

- The generator replaces text inside the template's existing runs instead of creating new styled text runs.
- It does not change `styles.xml`, template font families, font sizes, header, or footer.
- `N/A` inherits the existing caption token formatting.
- Image insertion changes only the target image cell and document relationships/media.

## Data model

Add report-level label overrides keyed by normalized `area/component`:

```ts
interface ReportLabels {
  upperAreaLabel: string;
  detailTitle: string;
  photoCaption: string;
}

type ReportLabelMap = Record<string, ReportLabels>;
```

Defaults are derived when scope sections are created. Reducer actions update a single component group's label object. Word model generation reads the resolved labels; photo data remains unchanged.

## Word mapping

For NICHE sections:

- `{{BC}}` = `NICHE AREAS & COMPONENTS / {upperAreaLabel}`
- `{{TITLE}}` = detail title plus optional unit and phase suffix
- `{{P1}}`…`{{P10}}` = photo caption, or `N/A` for an unused slot

For GENERAL sections, existing area semantics remain the default, but the same fields can override the output when needed.

Phase suffix rule:

- `CURRENT`: no suffix
- `BEFORE`: ` (Before)`
- `AFTER`: ` (After)`

## Error handling

- Scope toggles are no-ops while the scope is locked after build.
- Folder permission or scan failure keeps the previous report data and shows a recoverable status.
- Empty search results in the section picker show a clear message without changing the active section.
- Word export fails visibly if the template body markers are invalid.
- Image failures are listed as skipped and leave `N/A` in their slots.

## Verification

Automated tests cover:

- add/remove toggle while preserving a second service;
- exact matching of existing standard folder structures and rejection of ambiguous paths;
- bounded section navigator and searchable selection with a large section fixture;
- maximum five-column photo grid and panel-background selection behavior;
- Propeller label defaults and configurable overrides;
- omission of `(Current)` with preservation of Before/After suffixes;
- `N/A` captions for empty and failed photo slots;
- page boundaries using `pageBreakBefore` with no inserted page-break paragraph;
- a single `sectPr` and byte-identical header, footer, and `styles.xml` parts;
- unchanged template font-size elements in cloned body content.

End-to-end browser verification covers scope toggle, exact-folder import, section search, phase selection, five-card layout, and Word download. The generated Word file is structurally inspected and rendered where a compatible Word/LibreOffice renderer is available.
