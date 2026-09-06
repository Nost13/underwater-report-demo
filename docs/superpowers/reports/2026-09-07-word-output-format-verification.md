# Word output formatting verification — 2026-09-07

## Scope

- Left-align all paragraphs in General and Operational Information.
- Format GT and DWT with thousands separators without changing IMO, year or stored inputs.
- Left-align the Overall Result title and narrative, with single line spacing (`w:line=240`, `w:lineRule=auto`), independent of document grid.
- Keep the location table at 10473 × 1997 twips. Enlarge the old 5382057 EMU-wide image frame to 6599555 × 1216793 EMU; match both DrawingML extents and the shared 1600 × 295 preview/export raster. Preserve uniform scaling, marker coordinates and a small safety clearance.
- Base photo captions no longer append automatic Before/After/Current. Only explicit supplemental text adds the raised ` | ` separator. Work-performed phase headers remain unchanged.

## Evidence

- Regression tests were observed failing for alignment, number formatting, result spacing, automatic phase captions, image frame size, and OOXML property ordering before the fixes.
- TypeScript and scoped ESLint checks passed.
- Final full suite: 61 test files, 484 tests passed.
- Portable production build passed; existing chunk-size advisory only.
- Browser workflow passed: manual vessel and operation information, diagram, real image uploads, result editing, DOCX download, stored-job recovery, cross-tab conflict protection and archive restore.
- Fresh downloaded QA DOCX structurally verified: 91,023 / 126,073, seven base photo captions with no automatic phase, and left/single-spaced manual result text.
- Visually inspected browser diagram preview and the unmodified PNG extracted from the fresh DOCX. The exported ship and circular marker retain their proportions. Original vessel aspect ratio can leave horizontal margins when height is limiting.
- Independent read-only review found the initial OOXML ordering issue; fixed and re-reviewed with no remaining Critical/Important findings.

## Verification limit

The canonical DOCX renderer was attempted on the fresh QA DOCX but failed with `FileNotFoundError: LibreOffice soffice.exe was not found on PATH`. Full Word page rendering and final pagination are therefore **not visually verified**. XML assertions and embedded-image inspection are not represented as a full Word rendering pass.

## Release target

Existing GitHub Pages project only: https://nost13.github.io/underwater-report-demo/ . No customer files or QA output artifacts are included in the source commit.
