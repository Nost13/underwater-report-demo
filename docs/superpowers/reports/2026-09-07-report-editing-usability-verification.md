# Report editing usability — verification record

## Scope

Approved 2026-09-07 design: 16 editing improvements, rectangular bilge keels,
present-only web matrices, and explicit incomplete Word export. Existing hosting,
document templates, filename and document ordering are retained.

## Automated checks

- Vitest: 61 files, 480 tests passed with `--maxWorkers=2`.
- An initial concurrent run hit the existing 5-second Cover test timeout; the
  complete rerun passed without relaxing test timeouts or changing behavior.
- TypeScript no-emit check: passed.
- Scoped ESLint (src, portable entry, changed browser tests): passed.
- `git diff --check`: passed (Windows line-ending notices only).
- Portable production build: passed. Existing bundle-size advisory remains.

## Behavior and visual review

- Synthetic personnel registration, local registry merge/backup, certificate-less
  identities and duplicate validation have unit/integration coverage.
- Numeric diagram controls, preserved legacy rectangle geometry, Scope marker
  links, reset/undo behavior and snapshot validation have regression coverage.
- Browser coverage includes mixed Hull/Niche Scope, custom rectangle, numeric
  diagram scale, unassigned photo columns, insertion after a photo, source-targeted
  summary editing, long result title and incomplete Word output.
- Existing browser workflow passed with valid synthetic photo uploads: guarded
  condition entry, cover positioning, save/recover/archive, manual result text,
  complete Word generation and filename/order checks.
- Independent read-only reviewers checked source contracts and final responsive
  CSS. Findings about custom marker reset preservation and minimum photo widths
  were fixed before release.
- Visual review corrected the grouped matrix header's inherited narrow widths;
  explicit column widths and horizontal scrolling preserve readable cells at
  1440px and 1024px. Summary actions now follow the tables instead of overlapping
  rows on shorter screens; the browser regression also checks this geometry.
- Native mouse dragging passed during earlier QA but later Edge runs stalled
  inside the automation mouseMove transport. The final regression test dispatches
  HTML5 drag events with real card-edge coordinates to check the production edge
  resolver, insertion-line rendering and resulting order without that OS loop.

## Document boundary

Generated synthetic DOCX package/XML checks pass, including edited coverage and
result text. Incomplete export omits unconfirmed vessel artwork and retains the
blank template frame; it does not invent photos or confirm conditions.

Full Word page visual rendering is **not verified**: the canonical render command
failed because LibreOffice/soffice is not installed. This is separate from the
successful file generation and structural/content tests.

## Storage and folder boundary

The personnel registry remains local to this browser, with job-file backup data;
no shared server database or customer-data upload was added. Generated folders
can be inspected through the web folder viewer and selected through the browser's
folder picker where supported. This does not claim to launch Windows Explorer.

## Release

Target: existing `Nost13/underwater-report-demo` GitHub Pages workflow. Final
workflow result and public asset verification are reported after publication;
no new hosting project or dependencies are introduced.
