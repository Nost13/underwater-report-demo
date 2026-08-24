# Report Scale and Word Output Implementation Plan

> **For Codex:** Execute this plan task-by-task with strict red-green-refactor. Use the approved design at `docs/superpowers/specs/2026-08-24-report-scale-word-output-design.md` as the source of truth.

**Goal:** Make service assignment reversible, exact-folder photo matching clearer, Report Input usable with 50–60 sections, and Word output continuous, configurable, and template-faithful.

**Architecture:** Keep physical scope and photos unchanged, add a report-level label map keyed by `area/component`, and resolve those labels only at UI/export boundaries. Replace the unbounded tab rail with a bounded neighboring-section navigator plus searchable popover. Keep DOCX generation template-driven, but move page starts onto the next body's first paragraph and fill unused caption tokens with `N/A`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright, JSZip/OOXML, Vite/vinext.

---

## Task 1: Make each scope target a reversible active-service toggle

**Files:**
- Modify: `src/domain/structure.ts`
- Modify: `src/domain/structure.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Step 1: Write failing domain tests**

Add tests for a `toggleTargetService(target, activeService)` helper:

```ts
expect(toggleTargetService(empty, 'INSPECTION').services).toEqual(['INSPECTION']);
expect(toggleTargetService({ ...empty, services: ['INSPECTION'] }, 'INSPECTION').services).toEqual([]);
expect(toggleTargetService({ ...empty, services: ['INSPECTION', 'POLISHING'] }, 'POLISHING').services)
  .toEqual(['INSPECTION']);
```

Run:

```powershell
npm test -- src/domain/structure.test.ts
```

Expected: FAIL because `toggleTargetService` does not exist.

**Step 2: Implement the helper**

Implement the active-service-only add/remove behavior without changing the order of other services.

**Step 3: Write failing component tests**

Add a UI test that selects a service, clicks a GENERAL target once, verifies the chip, clicks the same target again, and verifies removal. Add a mixed-service case proving the second service remains.

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: FAIL because the main target currently replaces services and the separate plus control remains.

**Step 4: Wire the toggle and simplify TargetCell**

- Replace `onReplace`/`onAppend` with one `onToggle` callback.
- Remove the plus button.
- Keep service chips as direct remove controls.
- Preserve lock behavior and bulk presets.

**Step 5: Verify**

```powershell
npm test -- src/domain/structure.test.ts src/App.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add src/domain/structure.ts src/domain/structure.test.ts src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: toggle scope services with one click"
```

## Task 2: Report exact folder matching clearly for existing standard trees

**Files:**
- Modify: `src/domain/photos.ts`
- Modify: `src/domain/photos.test.ts`
- Modify: `src/browser/directory.ts`
- Modify: `src/browser/directory.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Step 1: Write failing matching-summary tests**

Add a pure summary helper that identifies whether imported paths contain at least one exact standard hierarchy and returns matched/unmatched counts. Cover both app-created and pre-existing tree paths; the outcome must depend on the path, not the `structureCreated` flag.

Run:

```powershell
npm test -- src/domain/photos.test.ts src/browser/directory.test.ts
```

Expected: FAIL because the standard-path summary is not exposed.

**Step 2: Implement deterministic summary data**

Keep `matchPhotoPath` strict. Return or derive:

```ts
{
  total: number;
  matched: number;
  unmatched: number;
  standardPathsDetected: boolean;
}
```

Do not add fuzzy matching.

**Step 3: Write failing UI status tests**

Test that importing a pre-existing exact tree reports `표준 폴더 경로 감지` and the correct automatic-match count even when the app did not create the folder tree.

**Step 4: Update PhotoSource status copy**

- Explain that both 선분류 and existing standard paths can auto-match.
- Display total, matched, unmatched, and path-detection state.
- Keep ambiguous files in UNMATCHED.

**Step 5: Verify and commit**

```powershell
npm test -- src/domain/photos.test.ts src/browser/directory.test.ts src/App.test.tsx
git add src/domain/photos.ts src/domain/photos.test.ts src/browser/directory.ts src/browser/directory.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: clarify exact folder auto matching"
```

## Task 3: Replace the unbounded section strip with a scalable navigator

**Files:**
- Create: `src/app/sectionNavigator.ts`
- Create: `src/app/sectionNavigator.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Step 1: Write failing window/filter tests**

Add pure tests for:

- a maximum five-item neighboring window centered on the active index where possible;
- correct first/last edge behavior;
- case-insensitive search across service, component, side, unit, and section id;
- grouping by service/component.

Run:

```powershell
npm test -- src/app/sectionNavigator.test.ts
```

Expected: FAIL because the module does not exist.

**Step 2: Implement navigator utilities**

Keep utilities independent of React so large fixtures are cheap to test.

**Step 3: Write failing interaction tests**

Render a scope fixture with at least 60 sections and assert:

- no more than five neighboring section buttons are rendered in the rail;
- `SECTION n / 60` stays visible;
- `전체 Section` opens a searchable grouped popover;
- search and selection focus the requested section and close the popover;
- previous/next still work.

**Step 4: Implement UI and accessibility**

- Replace `.section-tabs` full mapping with the bounded window.
- Add popover open state, search field, grouped list, empty state, Escape/close behavior, and appropriate dialog/list labels.
- Preserve `FOCUS_SECTION` as the single state transition.

**Step 5: Verify and commit**

```powershell
npm test -- src/app/sectionNavigator.test.ts src/App.test.tsx
git add src/app/sectionNavigator.ts src/app/sectionNavigator.test.ts src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: scale report section navigation"
```

## Task 4: Improve phase selection and cap the photo grid at five columns

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/demo.spec.ts`

**Step 1: Write failing component tests**

Test that:

- clicking the phase panel background selects the phase;
- clicking a nested condition control does not cause an unintended selection;
- the selection button gets a phase-specific selected class/state;
- the photo list exposes the capped grid class.

**Step 2: Implement guarded panel selection**

Use a panel click handler that ignores events originating from interactive descendants (`button`, `input`, `select`, `textarea`, `a`, and elements with an interactive role). Keep the explicit button and keyboard behavior.

**Step 3: Implement the responsive five-column cap**

- Desktop: five columns maximum.
- Reduced width/drawer: four then three.
- Never use unconstrained auto-fit that can exceed five.

**Step 4: Add Playwright coverage at 1440px**

Verify active phase styling and the computed number of grid columns/cards in the first row.

**Step 5: Verify and commit**

```powershell
npm test -- src/App.test.tsx
npm run test:e2e -- --grep "phase assignment|photo grid"
git add src/App.tsx src/App.test.tsx src/styles.css e2e/demo.spec.ts
git commit -m "feat: strengthen phase assignment and photo grid"
```

## Task 5: Add component-level Word label settings

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/app/reportLabels.ts`
- Modify: `src/app/reportLabels.test.ts`
- Modify: `src/app/reportState.ts`
- Modify: `src/app/reportState.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/docx/reportModel.ts`
- Modify: `src/docx/reportModel.test.ts`

**Step 1: Write failing label-default tests**

Define and test `ReportLabels`, a normalized group key, and defaults:

```ts
expect(defaultReportLabels(propeller)).toEqual({
  upperAreaLabel: 'PROPELLER',
  detailTitle: 'PROPELLER BLADE',
  photoCaption: 'Propeller Blade',
});
```

Also cover Rope Guard and a GENERAL section.

**Step 2: Add report label state**

- Initialize one label object per physical `area/component` group on `SET_SCOPE`.
- Add `UPDATE_REPORT_LABELS`.
- Apply one update to all sides/units/services indirectly by resolving through the shared group key.

**Step 3: Write failing UI tests**

Test `보고서 표기 설정`, its three fields, live preview, persistence while moving between units, and immediate component-wide application.

**Step 4: Implement the compact settings popover**

Keep defaults automatic and make edits optional. Add a reset-to-default action.

**Step 5: Update Word model signatures and tests**

Pass the resolved label map into `buildWordPhasePages`/`templateValues`. Verify:

- `{{BC}}` uses `PROPELLER`;
- title remains `PROPELLER BLADE 1 (Before/After)`;
- CURRENT titles have no `(Current)` suffix;
- custom values override defaults.

**Step 6: Verify and commit**

```powershell
npm test -- src/app/reportLabels.test.ts src/app/reportState.test.ts src/docx/reportModel.test.ts src/App.test.tsx
git add src/domain/types.ts src/app/reportLabels.ts src/app/reportLabels.test.ts src/app/reportState.ts src/app/reportState.test.ts src/App.tsx src/App.test.tsx src/styles.css src/docx/reportModel.ts src/docx/reportModel.test.ts
git commit -m "feat: configure component Word labels"
```

## Task 6: Remove blank Word pages and label unused slots N/A without changing template fonts

**Files:**
- Modify: `src/docx/templateWriter.ts`
- Modify: `src/docx/templateWriter.test.ts`
- Modify: `src/docx/templateWriter.integration.test.ts`

**Step 1: Mark the document edit operation**

Immediately before the first DOCX authoring command, run once:

```powershell
& 'C:\Users\laz\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'C:\Users\laz\.codex\plugins\cache\openai-primary-runtime\documents\26.819.11345\skills\documents\container_tools\mark_artifact_operation_started.mjs' --operation-kind edit --expected-output-count 1 --output-format docx
```

**Step 2: Write failing OOXML tests**

Assert that a two-page export:

- contains no standalone `<w:br w:type="page"/>` separator paragraph;
- gives the first paragraph of the second rendered body `w:pageBreakBefore`;
- contains one `sectPr`;
- writes `N/A` for every unused caption slot;
- writes `N/A` when resize fails;
- leaves `word/styles.xml`, header files, and footer files byte-identical;
- does not add or alter font-size elements in cloned template content.

Run:

```powershell
npm test -- src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts
```

Expected: FAIL on current break and empty-caption behavior.

**Step 3: Implement page-start injection**

Add a helper that finds the first paragraph in each body after the first, creates/reuses `w:pPr`, and inserts `w:pageBreakBefore`. Join bodies directly with no separator paragraph.

**Step 4: Fill unused/skipped captions with N/A**

Replace caption tokens through the existing paragraph text nodes so template run formatting is inherited.

**Step 5: Keep protected template parts untouched**

Do not write `styles.xml`, headers, or footers. Do not create font properties.

**Step 6: Verify and commit**

```powershell
npm test -- src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts
git add src/docx/templateWriter.ts src/docx/templateWriter.test.ts src/docx/templateWriter.integration.test.ts
git commit -m "fix: keep generated Word pages continuous"
```

## Task 7: Full regression, generated-document inspection, browser verification, and deployment

**Files:**
- Modify as needed: `e2e/demo.spec.ts`
- Update generated verification artifact only if the existing test flow does so: `e2e/generated-report.docx`

**Step 1: Run complete automated verification**

```powershell
npm run test:run
npm run lint
npm run build
npm run build:portable
npm run test:e2e
```

Expected: all commands PASS.

**Step 2: Inspect the generated DOCX structurally**

Verify:

- page-start markers and one `sectPr`;
- `N/A` in unused captions;
- expected Propeller hierarchy labels;
- no `(Current)` title;
- byte-identical header/footer/styles parts;
- expected image dimensions and rating fills.

**Step 3: Render and visually inspect where supported**

Use the bundled document renderer to produce page PNGs. If LibreOffice/Word rendering is unavailable in the environment, record that limitation and compensate with OOXML assertions plus browser download verification; do not claim visual Word verification in that case.

**Step 4: Run public-browser smoke verification after deployment**

Verify the GitHub Pages build at the public URL for:

- target toggle;
- photo import status;
- section search/navigation;
- phase panel activation;
- five-card maximum grid;
- Word download.

**Step 5: Commit any final verification changes**

```powershell
git add e2e/demo.spec.ts e2e/generated-report.docx
git commit -m "test: verify scalable report and Word export"
```

Skip this commit if no files changed.

**Step 6: Push and confirm GitHub Pages**

```powershell
git push origin main
gh run list --limit 5
gh run watch <run-id>
```

Confirm the deployment succeeds before reporting completion.

